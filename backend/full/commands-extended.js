import db from './db.js';
import axios from 'axios';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import * as Jimp from 'jimp';
import {
  downloadFile,
  processWhatsAppMedia,
  listDownloads,
  getDownloadStats,
  cleanOldFiles,
  checkDiskSpace
} from './file-manager.js';
import { normalizeAporteTipo, logControlAction } from './commands.js';
import { isSuperAdmin } from './global-config.js';
import { createProgressNotifier } from './utils/progress-notifier.js';
import { execFile } from 'child_process';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

function sanitizeFilename(value) {
  if (!value) return `media_${Date.now()}`;
  return value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

const YT_API_KEY = process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY;
const YT_COOKIES_FILE = process.env.YOUTUBE_COOKIES_FILE || process.env.YT_COOKIES_FILE;
const YT_COOKIES_RAW = process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES;

function parseCookiesFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const pairs = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        const name = parts[5];
        const value = parts[6];
        if (name) pairs.push(`${name}=${value}`);
        continue;
      }
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const name = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (name) pairs.push(`${name}=${value}`);
      }
    }
    return pairs.length ? pairs.join('; ') : null;
  } catch (error) {
    console.warn(' No se pudo leer archivo de cookies:', error?.message || error);
    return null;
  }
}

function normalizeCookieString(raw) {
  if (!raw) return null;
  const tokens = raw
    .split(/;|\n|\r/)
    .map((token) => token.trim())
    .filter(Boolean);
  return tokens.length ? tokens.join('; ') : null;
}

const YT_COOKIE_HEADER = (() => {
  const inline = normalizeCookieString(YT_COOKIES_RAW);
  if (inline) return inline;
  if (YT_COOKIES_FILE) return parseCookiesFromFile(YT_COOKIES_FILE);
  return null;
})();

function withYoutubeHeaders(config = {}) {
  if (!YT_COOKIE_HEADER) return config;
  const headers = { ...(config.headers || {}), Cookie: YT_COOKIE_HEADER };
  return { ...config, headers };
}

function getYtdlRequestOptions() {
  return YT_COOKIE_HEADER ? { headers: { cookie: YT_COOKIE_HEADER } } : undefined;
}

function buildSocketResolver(chatId) {
  if (!chatId) return null;
  let cachedSock = null;
  return async () => {
    if (cachedSock && typeof cachedSock.sendMessage === 'function') {
      return cachedSock;
    }
    try {
      const mod = await import('./whatsapp.js');
      cachedSock = mod.getSocket?.();
      return cachedSock;
    } catch (error) {
      console.error('Error obteniendo socket para progreso:', error?.message || error);
      return null;
    }
  };
}

function truncate(text, max = 60) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function parseISODuration(duration) {
  if (!duration) return '00:00';
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  const parts = [];
  if (hours) parts.push(String(hours).padStart(2, '0'));
  parts.push(String(hours ? minutes : minutes).padStart(2, '0'));
  parts.push(String(seconds).padStart(2, '0'));
  return parts.join(':');
}

async function searchYouTube(query) {
  if (!YT_API_KEY || !query) return null;
  try {
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', withYoutubeHeaders({
      params: {
        key: YT_API_KEY,
        q: query,
        part: 'snippet',
        type: 'video',
        maxResults: 1,
        safeSearch: 'none'
      }
    }));

    const item = searchRes.data.items?.[0];
    if (!item) return null;
    const videoId = item.id?.videoId;
    if (!videoId) return null;

    const detailsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', withYoutubeHeaders({
      params: {
        key: YT_API_KEY,
        id: videoId,
        part: 'snippet,contentDetails,statistics'
      }
    }));

    const details = detailsRes.data.items?.[0];
    if (!details) return null;

    const snippet = details.snippet || {};
    const stats = details.statistics || {};
    const contentDetails = details.contentDetails || {};

    return {
      id: videoId,
      title: snippet.title || query,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      duration: parseISODuration(contentDetails.duration),
      views: stats.viewCount ? Number(stats.viewCount).toLocaleString('es-ES') : '',
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null,
      author: snippet.channelTitle || 'YouTube'
    };
  } catch (error) {
    console.error('Error consultando YouTube Data API:', error?.message || error);
    return null;
  }
}

// ===============
// Media commands
// ===============

/**
 * /music, /meme, /wallpaper, /joke
 */
async function handleMusic(query, usuario, grupo, fecha, chatId = null) {
  const resolveSocket = buildSocketResolver(chatId) || (async () => null);
  const notifier = createProgressNotifier({
    resolveSocket,
    chatId,
    title: ' Descarga de audio',
    icon: ''
  });

  try {
    if (!query) {
      return {
        success: true,
        message: `  Melodia Music  \n\n Enva el nombre de una cancin o artista\n\n Ejemplos:\n    .play bad bunny\n    .play despacito\n    .play https://youtube.com/watch?v=...\n`
      };
    }

    await notifier.update(5, 'Analizando consulta', {
      details: [`Consulta: ${truncate(query)}`]
    });

    // Primero obtener informacin del video
    let ytQuery = query.startsWith('http') ? query : `ytsearch1:${query}`;
    const infoArgs = [
      ytQuery,
      '--cookies', '/home/admin/all_cookies.txt',
      '--print', '%(title)s|%(uploader)s|%(duration_string)s|%(view_count)s|%(webpage_url)s|%(thumbnail)s|%(description)s|%(upload_date)s',
      '--no-warnings',
      '--quiet'
    ];

    await notifier.update(15, 'Obteniendo informacin', { icon: '' });

    const infoResult = await new Promise((resolve, reject) => {
      execFile('yt-dlp', infoArgs, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      });
    });

    const [title, author, duration, views, url, thumbnail, description, uploadDate] = infoResult.split('|');
    
    await notifier.update(25, 'Informacion obtenida', {
      details: [
        `Titulo: ${truncate(title, 40)}`,
        `Artista: ${author}`,
        duration ? `Duracion: ${duration}` : null
      ].filter(Boolean),
      icon: ''
    });

    // Ahora descargar con progreso real
    const outputDir = '/tmp';
    const outputTemplate = `${outputDir}/ytmusic_%(title)s.%(ext)s`;
    const downloadArgs = [
      ytQuery,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-playlist',
      '--cookies', '/home/admin/all_cookies.txt',
      '-o', outputTemplate,
      '--progress',
      '--newline',
      '--no-warnings'
    ];

    await notifier.update(30, 'Iniciando descarga', { icon: '' });

    const downloadResult = await new Promise((resolve, reject) => {
      const child = execFile('yt-dlp', downloadArgs, { maxBuffer: 1024 * 1024 * 10 });
      
      let lastProgress = 30;
      child.stdout.on('data', async (data) => {
        const output = data.toString();
        // Parsear progreso de yt-dlp: [download] 45.2% of 12.34MiB at 1.23MiB/s ETA 00:05
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (progressMatch) {
          const percent = Math.min(parseFloat(progressMatch[1]), 90);
          const progressPercent = 30 + Math.round((percent / 100) * 50);
          
          if (progressPercent > lastProgress + 2) { // Actualizar cada 2%
            lastProgress = progressPercent;
            await notifier.update(progressPercent, `Descargando audio ${percent}%`, { icon: '' }).catch(() => {});
          }
        }
      });

      child.on('close', (code) => {
        if (code === 0) resolve('success');
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });

    const filename = `${outputDir}/ytmusic_${sanitizeFilename(title)}.mp3`;
    if (!fs.existsSync(filename)) {
      await notifier.fail('No se pudo descargar el audio');
      return { success: false, message: ' No se pudo descargar el audio.' };
    }
    
    await notifier.update(95, 'Procesando archivo', { icon: '' });
    
    const audioBuffer = fs.readFileSync(filename);
    fs.unlinkSync(filename);

    // Formatear informacin rica
    const viewsFormatted = views ? Number(views).toLocaleString('es-ES') : '';
    const uploadYear = uploadDate ? uploadDate.substring(0, 4) : '';
    
    const richMessage = `\n` +
                       `            *AUDIO DESCARGADO*       \n` +
                       `\n\n` +
                       ` *${title}*\n` +
                       ` *Artista:* ${author}\n` +
                       ` *Duracin:* ${duration || ''}\n` +
                       ` *Vistas:* ${viewsFormatted}\n` +
                       ` *Ao:* ${uploadYear}\n` +
                       ` *Enlace:* ${url}\n\n` +
                       ` *Enviando audio...*`;

    await notifier.complete('Audio listo ', {
      details: [
        `Ttulo: ${truncate(title, 48)}`,
        `Artista: ${author}`,
        duration ? `Duracin: ${duration}` : null,
        views ? `Vistas: ${viewsFormatted}` : null
      ].filter(Boolean),
      icon: ''
    });

    return {
      success: true,
      message: richMessage,
      media: {
        type: 'audio',
        data: audioBuffer,
        mimetype: 'audio/mpeg',
        filename: `${sanitizeFilename(title)}.mp3`
      },
      // Enviar tambin la imagen como media separada si hay thumbnail
      ...(thumbnail && {
        image: {
          type: 'image',
          url: thumbnail,
          caption: ` ${title} - ${author}`
        }
      })
    };
  } catch (error) {
    console.error('Error en handleMusic:', error);
    await notifier.fail('Error procesando el audio');
    return { success: false, message: ' Error procesando el audio. Intenta con otra cancin.' };
  }
}

async function handleVideo(query, usuario, grupo, fecha, chatId = null) {
  const resolveSocket = buildSocketResolver(chatId) || (async () => null);
  const notifier = createProgressNotifier({
    resolveSocket,
    chatId,
    title: ' Descarga de video',
    icon: ''
  });

  try {
    if (!query) {
      return {
        success: true,
        message: ' Usa: .video <bsqueda|url>'
      };
    }

    await notifier.update(5, 'Analizando consulta', {
      details: [`Consulta: ${truncate(query)}`]
    });

    // Primero obtener informacin del video
    let ytQuery = query.startsWith('http') ? query : `ytsearch1:${query}`;
    const infoArgs = [
      ytQuery,
      '--cookies', '/home/admin/all_cookies.txt',
      '--print', '%(title)s|%(uploader)s|%(duration_string)s|%(view_count)s|%(webpage_url)s|%(thumbnail)s|%(description)s|%(upload_date)s|%(width)s|%(height)s',
      '--no-warnings',
      '--quiet'
    ];

    await notifier.update(15, 'Obteniendo informacin', { icon: '' });

    const infoResult = await new Promise((resolve, reject) => {
      execFile('yt-dlp', infoArgs, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(stdout.trim());
      });
    });

    const [title, author, duration, views, url, thumbnail, description, uploadDate, width, height] = infoResult.split('|');
    
    await notifier.update(25, 'Informacin obtenida', {
      details: [
        `Ttulo: ${truncate(title, 40)}`,
        `Canal: ${author}`,
        duration ? `Duracin: ${duration}` : null,
        width && height ? `Resolucin: ${width}x${height}` : null
      ].filter(Boolean),
      icon: ''
    });

    // Ahora descargar con progreso real
    const outputDir = '/tmp';
    const outputTemplate = `${outputDir}/ytvideo_%(title)s.%(ext)s`;
    const downloadArgs = [
      ytQuery,
      '-f', 'best[height<=720]/best', // Preferir 720p o menos para WhatsApp
      '--no-playlist',
      '--cookies', '/home/admin/all_cookies.txt',
      '-o', outputTemplate,
      '--progress',
      '--newline',
      '--no-warnings'
    ];

    await notifier.update(30, 'Iniciando descarga', { icon: '' });

    const downloadResult = await new Promise((resolve, reject) => {
      const child = execFile('yt-dlp', downloadArgs, { maxBuffer: 1024 * 1024 * 10 });
      
      let lastProgress = 30;
      child.stdout.on('data', async (data) => {
        const output = data.toString();
        // Parsear progreso de yt-dlp: [download] 45.2% of 12.34MiB at 1.23MiB/s ETA 00:05
        const progressMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
        if (progressMatch) {
          const percent = Math.min(parseFloat(progressMatch[1]), 90);
          const progressPercent = 30 + Math.round((percent / 100) * 50);
          
          if (progressPercent > lastProgress + 2) { // Actualizar cada 2%
            lastProgress = progressPercent;
            await notifier.update(progressPercent, `Descargando video ${percent}%`, { icon: '' }).catch(() => {});
          }
        }
      });

      child.on('close', (code) => {
        if (code === 0) resolve('success');
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
    });

    const filename = `${outputDir}/ytvideo_${sanitizeFilename(title)}.mp4`;
    if (!fs.existsSync(filename)) {
      await notifier.fail('No se pudo descargar el video');
      return { success: false, message: ' No se pudo descargar el video.' };
    }
    
    await notifier.update(95, 'Procesando archivo', { icon: '' });
    
    const videoBuffer = fs.readFileSync(filename);
    fs.unlinkSync(filename);

    // Formatear informacin rica
    const viewsFormatted = views ? Number(views).toLocaleString('es-ES') : '';
    const uploadYear = uploadDate ? uploadDate.substring(0, 4) : '';
    const resolution = width && height ? `${width}x${height}` : '';
    
    const richMessage = `\n` +
                       `           *VIDEO DESCARGADO*        \n` +
                       `\n\n` +
                       ` *${title}*\n` +
                       ` *Canal:* ${author}\n` +
                       ` *Duracin:* ${duration || ''}\n` +
                       ` *Vistas:* ${viewsFormatted}\n` +
                       ` *Ao:* ${uploadYear}\n` +
                       ` *Resolucin:* ${resolution}\n` +
                       ` *Enlace:* ${url}\n\n` +
                       ` *Enviando video...*`;

    await notifier.complete('Video listo ', {
      details: [
        `Ttulo: ${truncate(title, 48)}`,
        `Canal: ${author}`,
        duration ? `Duracin: ${duration}` : null,
        views ? `Vistas: ${viewsFormatted}` : null,
        resolution !== '' ? `Resolucin: ${resolution}` : null
      ].filter(Boolean),
      icon: ''
    });

    return {
      success: true,
      message: richMessage,
      media: {
        type: 'video',
        data: videoBuffer,
        mimetype: 'video/mp4',
        filename: `${sanitizeFilename(title)}.mp4`,
        caption: title
      },
      // Enviar tambin la imagen como media separada si hay thumbnail
      ...(thumbnail && {
        image: {
          type: 'image',
          url: thumbnail,
          caption: ` ${title} - ${author}`
        }
      })
    };
  } catch (error) {
    console.error('Error en handleVideo:', error);
    await notifier.fail('Error procesando el video');
    return { success: false, message: ' Error procesando el video. Intenta con otro enlace.' };
  }
}

async function handleMeme(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://meme-api.com/gimme');
    const memeData = res.data;
    if (!memeData || !memeData.url) return { success: true, message: ' No se pudo obtener el meme.' };
    return {
      success: true,
      message: ` *${memeData.title}*
 r/${memeData.subreddit}

 Disfruta tu meme del da`,
      media: { type: 'image', url: memeData.url, caption: memeData.title }
    };
  } catch (error) {
    return { success: false, message: ' Error al obtener meme' };
  }
}

async function handleWallpaper(query, usuario, grupo, fecha) {
  try {
    if (!query) {
      return { success: true, message: ' Usa: .wallpaper <tema> (ej. .wallpaper galaxy)' };
    }
    const res = await axios.get(`https://picsum.photos/800/600?random=${Date.now()}`);
    const url = res.request?.res?.responseUrl || `https://picsum.photos/800/600?random=${Date.now()}`;
    return {
      success: true,
      message: ` *Wallpaper listo*
Tema: ${query}

Mantn pulsado para guardar o poner de fondo.`,
      media: { type: 'image', url, caption: `Wallpaper de ${query}` }
    };
  } catch (error) {
    return { success: false, message: ' Error al obtener wallpaper' };
  }
}

async function handleJoke(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://v2.jokeapi.dev/joke/Any?lang=es');
    const jokeData = res.data;
    if (!jokeData || jokeData.error) return { success: true, message: ' No se pudo obtener el chiste' };
    const jokeText = jokeData.type === 'single' ? jokeData.joke : `${jokeData.setup}\n\n${jokeData.delivery}`;
    return { success: true, message: ` *Humor Konmi*

${jokeText}` };
  } catch (error) {
    return { success: false, message: ' Error al obtener chiste' };
  }
}

// ==================
// AI enhanced bundle
// ==================

async function handleAIEnhanced(pregunta, usuario, grupo, fecha) {
  try {
    if (!pregunta) {
      return { success: true, message: ' Usa: .ai <pregunta>' };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, message: ' Configura GEMINI_API_KEY' };
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Eres Melodia, una asistente de IA amigable y til en espaol. Responde de forma clara y concisa.\n\nPregunta del usuario: ${pregunta}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    await logControlAction(usuario, 'AI_QUERY', `Pregunta: ${pregunta.substring(0, 100)}...`, grupo);
    return { success: true, message: ` ${text}` };
  } catch (error) {
    console.error('Error en AI:', error);
    return { success: false, message: ' Error con IA' };
  }
}

async function handleImage(prompt, usuario, grupo, fecha) {
  try {
    if (!prompt) return { success: true, message: ' Usa: .image <descripcin>' };
    const imageUrl = `https://picsum.photos/512/512?random=${Date.now()}`;
    return { success: true, message: ` Imagen: ${prompt}`, media: { type: 'image', url: imageUrl, caption: `Imagen generada: ${prompt}` } };
  } catch (error) {
    return { success: false, message: ' Error al generar imagen' };
  }
}

async function handleTranslate(text, targetLang, usuario, grupo, fecha) {
  try {
    if (!text || !targetLang) return { success: true, message: ' Usa: .translate <texto> <idioma>' };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, message: ' Configura GEMINI_API_KEY' };
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const translatePrompt = `Traduce el siguiente texto al idioma ${targetLang}. Solo devuelve la traduccin:\n\nTexto: ${text}`;
    const result = await model.generateContent(translatePrompt);
    const translation = (await result.response).text();
    return { success: true, message: ` Traduccin (${targetLang}):\n${translation}` };
  } catch (error) {
    return { success: false, message: ' Error al traducir' };
  }
}

// ====================
// Entertainment bundle
// ====================

async function handleWeather(city, usuario, grupo, fecha) {
  try {
    if (!city) return { success: true, message: ' Usa: .weather <ciudad>' };
    // Geocodificar la ciudad
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: city, count: 1, language: 'es', format: 'json' }
    });
    const loc = geo.data?.results?.[0];
    if (!loc) return { success: true, message: ` No encontr la ciudad "${city}"` };
    const { latitude, longitude, name, country } = loc;
    // Clima actual
    const weather = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude, longitude, current_weather: true, timezone: 'auto' }
    });
    const cw = weather.data?.current_weather;
    if (!cw) return { success: true, message: ` No pude obtener el clima de "${city}"` };
    const mapping = {
      0: 'despejado', 1: 'principalmente despejado', 2: 'parcialmente nublado', 3: 'nublado',
      45: 'niebla', 48: 'niebla con escarcha', 51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa',
      61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia intensa', 71: 'nieve ligera', 73: 'nieve', 75: 'nieve intensa',
      80: 'chubascos ligeros', 81: 'chubascos', 82: 'chubascos fuertes', 95: 'tormenta', 96: 'tormenta con granizo'
    };
    const desc = mapping[cw.weathercode] || 'clima desconocido';
    const when = new Date().toLocaleString('es-ES');
    const place = `${name}${country ? ', ' + country : ''}`;
    return {
      success: true,
      message: `  Clima en ${place} \n\n  Temperatura: ${cw.temperature}C\n  Viento: ${cw.windspeed} km/h\n  Direccin: ${cw.winddirection}\n  Cielo: ${desc}\n\n  ${when}\n`
    };
  } catch (error) {
    return { success: true, message: ` No pude obtener el clima de "${city}"` };
  }
}

async function handleQuote(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://api.quotable.io/random');
    const quote = res.data;
    return { success: true, message: ` "${quote.content}"\n ${quote.author}` };
  } catch (error) {
    return { success: false, message: ' Error al obtener cita' };
  }
}

async function handleFact(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=es');
    const fact = res.data;
    return { success: true, message: ` ${fact.text}` };
  } catch (error) {
    return { success: false, message: ' Error al obtener dato' };
  }
}

async function handleTrivia(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple&lang=es');
    const trivia = res.data.results[0];
    const options = trivia.incorrect_answers.concat(trivia.correct_answer).sort(() => Math.random() - 0.5);
    const optionsText = options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
    return { success: true, message: ` ${trivia.category} (${trivia.difficulty})\n\n${trivia.question}\n\n${optionsText}`, triviaAnswer: trivia.correct_answer };
  } catch (error) {
    return { success: false, message: ' Error al obtener trivia' };
  }
}

async function handleHoroscope(sign, usuario, grupo, fecha) {
  try {
    if (!sign) return { success: true, message: ' Usa: .horoscope <signo>' };
    const horoscopes = {
      aries: 'Hoy las estrellas te favorecen.',
      tauro: 'Disfruta de las cosas simples.',
      geminis: 'La comunicacin ser clave hoy.',
      cancer: 'Confa en tu intuicin.',
      leo: 'Es tu momento de brillar.',
      virgo: 'Planifica bien tu da.',
      libra: 'Busca el equilibrio.',
      escorpio: 'Tu intensidad ayudar a resolver situaciones.',
      sagitario: 'La aventura te llama.',
      capricornio: 'Tu determinacin te llevar lejos.',
      acuario: 'Tu creatividad est en su mejor momento.',
      piscis: 'Conecta con los dems de manera profunda.'
    };
    const signLower = sign.toLowerCase();
    const horoscope = horoscopes[signLower] || 'Signo no reconocido.';
    return { success: true, message: ` ${sign.toUpperCase()}\n${horoscope}` };
  } catch (error) {
    return { success: false, message: ' Error al obtener horscopo' };
  }
}

// ==============
// Status bundle
// ==============

async function handleStatus(usuario, grupo, fecha) {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = os.loadavg();
    const freeMemory = os.freemem();
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - freeMemory;
    const totalUsers = await db('usuarios').count('id as count').first();
    const totalLogs = await db('logs').count('id as count').first();
    const totalAportes = await db('aportes').count('id as count').first();
    const totalPedidos = await db('pedidos').count('id as count').first();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await db('logs').where('fecha', '>=', yesterday.toISOString()).count('id as count').first();

    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`;
      if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
      if (minutes > 0) return `${minutes}m ${secs}s`;
      return `${secs}s`;
    };
    const formatBytes = (bytes) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      if (bytes === 0) return '0 Bytes';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const message = `  Estado  \n\n Uptime: ${formatUptime(uptime)}\n Memoria: ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}\n Sistema: ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}\n CPU: ${cpuUsage[0].toFixed(2)} (1m), ${cpuUsage[1].toFixed(2)} (5m), ${cpuUsage[2].toFixed(2)} (15m)\n\n Usuarios: ${totalUsers.count}\n Logs: ${totalLogs.count} (${recentLogs.count} 24h)\n Aportes: ${totalAportes.count}\n Pedidos: ${totalPedidos.count}\n`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener estado' };
  }
}

async function handlePing(usuario, grupo, fecha) {
  try {
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 100));
    const ping = Date.now() - startTime;
    return { success: true, message: ` Pong! ${ping}ms` };
  } catch (error) {
    return { success: false, message: ' Error en ping' };
  }
}

// =============
// Logs bundle
// =============

async function handleLogsAdvanced(type, usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    let allowed = !!(user && user.rol === 'admin');
    try { if (isSuperAdmin(usuario)) allowed = true; } catch (_) {}
    const userNum = String(usuario || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (userNum === '595974154768') allowed = true;
    if (!allowed) return { success: true, message: ' Solo administradores pueden ver logs' };
    const validTypes = ['all', 'errors', 'commands', 'users', 'system'];
    const extendedTypes = ['mods', 'moderacion', 'moderation'];
    const lower = (type || '').toLowerCase();
    const logType = lower && (validTypes.includes(lower) || extendedTypes.includes(lower)) ? lower : 'all';
    let logs = [];
    let title = '';
    switch (logType) {
      case 'errors':
        logs = await db('logs').whereILike('detalles', '%ERROR%').orderBy('fecha', 'desc').limit(20);
        title = ' Logs de Errores';
        break;
      case 'commands':
        logs = await db('logs').whereIn('tipo', ['comando','ai_command','clasificar_command','administracion']).orderBy('fecha', 'desc').limit(20);
        title = ' Logs de Comandos';
        break;
      case 'users':
        logs = await db('logs').where({ tipo: 'control' }).orderBy('fecha', 'desc').limit(20);
        title = ' Logs de Usuarios';
        break;
      case 'system':
        logs = await db('logs').whereIn('tipo', ['sistema','configuracion']).orderBy('fecha', 'desc').limit(20);
        title = ' Logs del Sistema';
        break;
      case 'mods':
      case 'moderacion':
      case 'moderation':
        logs = await db('logs').where({ tipo: 'moderacion' }).orderBy('fecha', 'desc').limit(30);
        title = ' Logs de Moderacin';
        break;
      default:
        logs = await db('logs').orderBy('fecha', 'desc').limit(30);
        title = ' Todos los Logs';
    }
    if (logs.length === 0) return { success: true, message: ` ${title}  \n\n No hay logs de este tipo\n` };
    // Resolver nombres de usuario para mostrar nombre WA/Panel en vez de nmero crudo
    const nums = [...new Set(logs.map(l => String(l.usuario || '').split('@')[0].split(':')[0]))].filter(Boolean);
    const dbUsers = nums.length ? await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username') : [];
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    const waNames = missing.length ? await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name') : [];
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    let message = ` ${title}  \n\n  Total: ${logs.length}\n\n`;
    if (['mods','moderacion','moderation'].includes(logType)) {
      logs.forEach((log, index) => {
        const fechaL = new Date(log.fecha).toLocaleString('es-ES');
        let d = {};
        try { d = JSON.parse(log.detalles || '{}'); } catch (_) { d = {}; }
        const action = d.action || log.comando;
        const actor = d.actor_number || String(log.usuario || '').split('@')[0].split(':')[0];
        const targetName = d.target_name || '';
        const targetNum = d.target_number || '';
        const groupName = d.group_name || '';
        let line = '';
        if (action === 'promote') line = `${index + 1}. ${fechaL}\n    ${actor} dio admin a ${targetName || targetNum} (${targetNum})\n    Grupo: ${groupName}`;
        else if (action === 'demote') line = `${index + 1}. ${fechaL}\n    ${actor} quit admin a ${targetName || targetNum} (${targetNum})\n    Grupo: ${groupName}`;
        else if (action === 'kick') line = `${index + 1}. ${fechaL}\n    ${actor} expuls a ${targetName || targetNum} (${targetNum})\n    Grupo: ${groupName}`;
        else if (action === 'lock') line = `${index + 1}. ${fechaL}\n    ${actor} bloque el grupo ${groupName}`;
        else if (action === 'unlock') line = `${index + 1}. ${fechaL}\n    ${actor} desbloque el grupo ${groupName}`;
        else line = `${index + 1}. ${fechaL}\n    ${actor} -> ${action} ${targetName || targetNum}`;
        message += `${line}\n\n`;
      });
    } else {
      logs.forEach((log, index) => {
        const fechaL = new Date(log.fecha).toLocaleString();
        const comando = String(log.comando || '').replace(/_/g, ' ').toLowerCase();
        const detalles = (log.detalles || '').length > 50 ? `${log.detalles.substring(0, 50)}...` : (log.detalles || '');
        const num = String(log.usuario || '').split('@')[0].split(':')[0];
        const uname = nameByNumber[num] || waByNumber[num] || num || '-';
        message += ` ${index + 1}. ${comando}\n`;
        message += `    ${fechaL}\n`;
        message += `    @${uname}\n`;
        message += `    ${detalles}\n\n`;
      });
    }
    message += ``;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener logs' };
  }
}

async function handleStats(usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') {
      return { success: true, message: ' Solo administradores pueden ver estadsticas' };
    }
    const totalUsers = await db('usuarios').count('id as count').first();
    const totalLogs = await db('logs').count('id as count').first();
    const totalAportes = await db('aportes').count('id as count').first();
    const totalPedidos = await db('pedidos').count('id as count').first();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await db('logs').where('fecha', '>=', yesterday.toISOString()).count('id as count').first();
    const topCommands = await db('logs').select('comando').count('id as count').groupBy('comando').orderBy('count', 'desc').limit(5);
    let message = `  Stats  \n\n Usuarios: ${totalUsers.count}\n Logs: ${totalLogs.count}\n Aportes: ${totalAportes.count}\n Pedidos: ${totalPedidos.count}\n Logs 24h: ${recentLogs.count}\n\n  Comandos ms usados:\n`;
    topCommands.forEach((cmd, i) => {
      const comando = String(cmd.comando || '').replace(/_/g, ' ').toLowerCase();
      message += ` ${i + 1}. ${comando} (${cmd.count})\n`;
    });
    message += ``;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener estadsticas' };
  }
}

async function handleExport(format, usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') {
      return { success: true, message: ' Solo administradores pueden exportar logs' };
    }
    if (!format || !['json', 'csv', 'txt'].includes(format.toLowerCase())) {
      return { success: true, message: ' Usa: .export json|csv|txt' };
    }
    const logs = await db('logs').orderBy('fecha', 'desc').limit(1000);
    // Resolver nombres para export
    const nums = [...new Set(logs.map(l => String(l.usuario || '').split('@')[0].split(':')[0]))].filter(Boolean);
    const dbUsers = nums.length ? await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username','id') : [];
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const idByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.id]));
    const missing = nums.filter(n => !nameByNumber[n]);
    const waNames = missing.length ? await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name') : [];
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));
    const logsEnriched = logs.map(l => {
      const num = String(l.usuario || '').split('@')[0].split(':')[0];
      const usuario_nombre = nameByNumber[num] || waByNumber[num] || num || '';
      const usuario_id = idByNumber[num] || null;
      return { ...l, usuario_nombre, usuario_id };
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${timestamp}.${format}`;
    const exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
    const filepath = path.join(exportsDir, filename);
    let content = '';
    switch (format.toLowerCase()) {
      case 'json':
        content = JSON.stringify(logsEnriched, null, 2);
        break;
      case 'csv':
        content = 'id,usuario,usuario_nombre,comando,detalles,grupo,fecha\n';
        logsEnriched.forEach(log => { content += `${log.id},${log.usuario},"${log.usuario_nombre}",${log.comando},"${(log.detalles||'').replace(/"/g,'""')}",${log.grupo},${log.fecha}\n`; });
        break;
      case 'txt':
        logsEnriched.forEach(log => { content += `[${log.fecha}] ${log.comando} - ${log.usuario_nombre} (${log.usuario})\n  ${log.detalles}\n\n`; });
        break;
    }
    fs.writeFileSync(filepath, content);
    return { success: true, message: ` Archivo exportado: ${filename}\n Ubicacin: ${filepath}` };
  } catch (error) {
    return { success: false, message: ' Error al exportar logs' };
  }
}

// =====================
// Download commands
// =====================

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleDescargar(url, nombre, categoria, usuario, grupo) {
  try {
    if (!url || !nombre || !categoria) {
      return { success: false, message: ' Uso: /descargar [url] [nombre] [categoria]' };
    }
    const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
    if (!validCategories.includes(categoria.toLowerCase())) {
      return { success: false, message: ` Categora invlida. Usa: ${validCategories.join(', ')}` };
    }
    const spaceCheck = checkDiskSpace();
    if (!spaceCheck.available) return { success: false, message: ' Espacio insuficiente en disco.' };
    const result = await downloadFile(url, nombre, categoria.toLowerCase(), usuario);
    if (result.success) {
      const sizeText = formatFileSize(result.size);
      const statusText = result.exists ? '(ya exista)' : '(nuevo)';
      return { success: true, message: ` Descarga completada ${statusText}\n\n ${nombre}\n ${categoria}\n ${sizeText}` };
    } else {
      return { success: false, message: ' Error en la descarga.' };
    }
  } catch (error) {
    console.error('Error en descarga:', error);
    return { success: false, message: ` Error: ${error.message}` };
  }
}

async function handleGuardar(categoria, usuario, grupo, message) {
  try {
    const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
    if (!categoria || !validCategories.includes(categoria.toLowerCase())) {
      return { success: false, message: ` Uso: /guardar [categoria]\n${validCategories.join(', ')}` };
    }
    if (!message || !message.message) return { success: false, message: ' No se detect archivo multimedia.' };
    const hasMedia = message.message.imageMessage || message.message.videoMessage || message.message.documentMessage || message.message.audioMessage;
    if (!hasMedia) return { success: false, message: ' No se detect archivo multimedia.' };
    const result = await processWhatsAppMedia(message, categoria.toLowerCase(), usuario);
    if (result.success) {
      const sizeText = formatFileSize(result.size);
      // Registrar tambin como aporte para que aparezca en el panel
      try {
        await db('aportes').insert({
          contenido: result.filename,
          tipo: normalizeAporteTipo(categoria),
          usuario,
          grupo,
          fecha: new Date().toISOString(),
          archivo_path: result.filepath
        });
      } catch (_) {}
      return { success: true, message: ` Archivo guardado\n\n ${result.filename}\n ${categoria}\n ${sizeText}\n ${result.mediaType}` };
    } else {
      return { success: false, message: ' Error al guardar archivo.' };
    }
  } catch (error) {
    return { success: false, message: ` Error: ${error.message}` };
  }
}

async function handleArchivos(categoria, usuario, grupo) {
  try {
    if (categoria) {
      const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
      if (!validCategories.includes(categoria.toLowerCase())) {
        return { success: false, message: ` Categora invlida. Usa: ${validCategories.join(', ')}` };
      }
    }
    const downloads = await listDownloads(categoria?.toLowerCase(), null);
    if (downloads.length === 0) {
      const categoryText = categoria ? ` de categora "${categoria}"` : '';
      return { success: true, message: ` No hay archivos descargados${categoryText}.` };
    }
    // Mapear nmeros a nombres de usuario si existen en DB
    const nums = [...new Set(downloads.map(d => String(d.usuario).split('@')[0].split(':')[0]))];
    const dbUsers = await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username');
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    let waNames = [];
    if (missing.length) waNames = await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name');
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    let message = ` Archivos descargados${categoria ? ` - ${categoria.toUpperCase()}` : ''} (${downloads.length}):\n\n`;
    downloads.slice(0, 20).forEach((d, i) => {
      const fecha = new Date(d.fecha).toLocaleDateString('es-ES');
      const sizeText = formatFileSize(d.size);
      const num = String(d.usuario).split('@')[0].split(':')[0];
      const resolved = nameByNumber[num] || waByNumber[num] || num;
      const uname = `@${resolved}`;
      message += `${i + 1}. ${d.filename}\n    ${d.category}\n    ${sizeText}\n    ${uname}\n    ${fecha}\n\n`;
    });
    if (downloads.length > 20) message += `_... y ${downloads.length - 20} archivos ms_`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener lista de archivos.' };
  }
}

async function handleMisArchivos(usuario, grupo) {
  try {
    const downloads = await listDownloads(null, usuario);
    if (downloads.length === 0) return { success: true, message: ' No tienes archivos descargados.' };
    let message = ` Tus archivos (${downloads.length}):\n\n`;
    downloads.slice(0, 15).forEach((d, i) => {
      const fecha = new Date(d.fecha).toLocaleDateString('es-ES');
      const sizeText = formatFileSize(d.size);
      message += `${i + 1}. ${d.filename}\n    ${d.category}\n    ${sizeText}\n    ${fecha}\n\n`;
    });
    if (downloads.length > 15) message += `_... y ${downloads.length - 15} ms_`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener tus archivos.' };
  }
}

async function handleEstadisticas(usuario, grupo) {
  try {
    const stats = await getDownloadStats();
    let message = ` Estadsticas de Descargas\n\n`;
    message += ` Total de archivos: ${stats.totalFiles}\n`;
    message += ` Espacio total: ${formatFileSize(stats.totalSize)}\n\n`;
    if (stats.byCategory.length > 0) {
      message += ` Por categora:\n`;
      stats.byCategory.forEach(cat => {
        const totalSize = formatFileSize(Number(cat.total_size || cat.totalSize || 0));
        message += ` ${cat.category}: ${cat.total} archivos (${totalSize})\n`;
      });
    }
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al obtener estadsticas.' };
  }
}

async function handleLimpiar(usuario, grupo) {
  try {
    const result = await cleanOldFiles();
    const freedSpaceText = formatFileSize(result.freedSpace);
    let message = ` Limpieza completada\n\n`;
    message += ` Archivos eliminados: ${result.deletedCount}\n`;
    message += ` Espacio liberado: ${freedSpaceText}`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al limpiar archivos.' };
  }
}

async function handleBuscarArchivo(nombre, usuario, grupo) {
  try {
    if (!nombre) return { success: false, message: ' Uso: /buscararchivo [nombre]' };
    const downloads = await db('descargas')
      .where('filename', 'like', `%${nombre}%`)
      .orderBy('fecha', 'desc')
      .limit(20);
    if (downloads.length === 0) return { success: true, message: ` No se encontraron archivos con "${nombre}".` };
    let message = ` Archivos encontrados (${downloads.length}):\n\n`;
    // Mapear nombres
    const nums = [...new Set(downloads.map(d => String(d.usuario).split('@')[0].split(':')[0]))];
    const dbUsers = await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username');
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    let waNames = [];
    if (missing.length) waNames = await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name');
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    downloads.forEach((d, i) => {
      const fecha = new Date(d.fecha).toLocaleDateString('es-ES');
      const sizeText = formatFileSize(d.size);
      const num = String(d.usuario).split('@')[0].split(':')[0];
      const uname = `@${nameByNumber[num] || waByNumber[num] || num}`;
      message += `${i + 1}. ${d.filename}\n    ${d.category}\n    ${sizeText}\n    ${uname}\n    ${fecha}\n\n`;
    });
    return { success: true, message };
  } catch (error) {
    return { success: false, message: ' Error al buscar archivos.' };
  }
}

export {
  // Media
  handleMusic,
  handleVideo,
  handleMeme,
  handleWallpaper,
  handleJoke,
  // AI
  handleAIEnhanced,
  handleImage,
  handleTranslate,
  // Entertainment
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  // Status
  handleStatus,
  handlePing,
  // Logs
  handleLogsAdvanced,
  handleStats,
  handleExport,
  // Downloads
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo
};
