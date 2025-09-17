import db from './db.js';
import axios from 'axios';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import QRCode from 'qrcode';
import chalk from 'chalk';
import { 
  downloadFile,
  processWhatsAppMedia,
  listDownloads,
  getDownloadStats,
  cleanOldFiles,
  checkDiskSpace
} from './file-manager.js';
import { normalizeAporteTipo, logControlAction } from './commands.js';

// ===============
// Media commands
// ===============

/**
 * /music, /meme, /wallpaper, /joke
 */
async function handleMusic(query, usuario, grupo, fecha) {
  try {
    if (!query) {
      return { success: true, message: `╭─❍「 🎵 Melodia Music ✦ 」
│
├─ Envía el nombre de una canción o artista
│
├─ Ejemplos:
│   ⇝ .music bad bunny
│   ⇝ .music despacito
│   ⇝ .music https://youtube.com/watch?v=...
╰─✦` };
    }
    const res = await yts(query);
    if (!res || !res.videos || res.videos.length === 0) {
      return { success: true, message: '❌ No encontré resultados para esa búsqueda.' };
    }
    const video = res.videos[0];
    return {
      success: true,
      message: `╭─❍「 🎵 *${video.title}* ✦ 」
│
├─ 🎶 Duración: ${video.duration}
├─ 👀 Vistas: ${video.views}
├─ 🔗 URL: ${video.url}
│
├─ Descargando audio... ⏳
╰─✦`,
      media: {
        type: 'audio',
        url: video.url,
        thumbnail: video.thumbnail,
        title: video.title
      }
    };
  } catch (error) {
    return { success: false, message: '❌ Error procesando /music' };
  }
}

async function handleMeme(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://meme-api.com/gimme');
    const memeData = res.data;
    if (!memeData || !memeData.url) return { success: true, message: '❌ No se pudo obtener el meme.' };
    return {
      success: true,
      message: `╭─❍「 😂 Meme ✦ 」
│
├─ ${memeData.title}
├─ r/${memeData.subreddit}
╰─✦`,
      media: { type: 'image', url: memeData.url, caption: memeData.title }
    };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener meme' };
  }
}

async function handleWallpaper(query, usuario, grupo, fecha) {
  try {
    if (!query) {
      return { success: true, message: '🖼️ Usa: .wallpaper <tema>' };
    }
    const res = await axios.get(`https://picsum.photos/800/600?random=${Date.now()}`);
    const url = res.request?.res?.responseUrl || `https://picsum.photos/800/600?random=${Date.now()}`;
    return {
      success: true,
      message: `🖼️ Wallpaper de ${query}`,
      media: { type: 'image', url, caption: `Wallpaper de ${query}` }
    };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener wallpaper' };
  }
}

async function handleJoke(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://v2.jokeapi.dev/joke/Any?lang=es');
    const jokeData = res.data;
    if (!jokeData || jokeData.error) return { success: true, message: '❌ No se pudo obtener el chiste' };
    const jokeText = jokeData.type === 'single' ? jokeData.joke : `${jokeData.setup}\n\n${jokeData.delivery}`;
    return { success: true, message: `😄 ${jokeText}` };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener chiste' };
  }
}

// ==================
// AI enhanced bundle
// ==================

async function handleAIEnhanced(pregunta, usuario, grupo, fecha) {
  try {
    if (!pregunta) {
      return { success: true, message: '🤖 Usa: .ai <pregunta>' };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, message: '❌ Configura GEMINI_API_KEY' };
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const prompt = `Eres Melodia, una asistente de IA amigable y útil en español. Responde de forma clara y concisa.\n\nPregunta del usuario: ${pregunta}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    await logControlAction(usuario, 'AI_QUERY', `Pregunta: ${pregunta.substring(0, 100)}...`, grupo);
    return { success: true, message: `🤖 ${text}` };
  } catch (error) {
    console.error('Error en AI:', error);
    return { success: false, message: '❌ Error con IA' };
  }
}

async function handleImage(prompt, usuario, grupo, fecha) {
  try {
    if (!prompt) return { success: true, message: '🎨 Usa: .image <descripción>' };
    const imageUrl = `https://picsum.photos/512/512?random=${Date.now()}`;
    return { success: true, message: `🎨 Imagen: ${prompt}`, media: { type: 'image', url: imageUrl, caption: `Imagen generada: ${prompt}` } };
  } catch (error) {
    return { success: false, message: '❌ Error al generar imagen' };
  }
}

async function handleTranslate(text, targetLang, usuario, grupo, fecha) {
  try {
    if (!text || !targetLang) return { success: true, message: '🌍 Usa: .translate <texto> <idioma>' };
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { success: false, message: '❌ Configura GEMINI_API_KEY' };
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const translatePrompt = `Traduce el siguiente texto al idioma ${targetLang}. Solo devuelve la traducción:\n\nTexto: ${text}`;
    const result = await model.generateContent(translatePrompt);
    const translation = (await result.response).text();
    return { success: true, message: `🌍 Traducción (${targetLang}):\n${translation}` };
  } catch (error) {
    return { success: false, message: '❌ Error al traducir' };
  }
}

// ====================
// Entertainment bundle
// ====================

async function handleWeather(city, usuario, grupo, fecha) {
  try {
    if (!city) return { success: true, message: '🌤️ Usa: .weather <ciudad>' };
    // Geocodificar la ciudad
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: city, count: 1, language: 'es', format: 'json' }
    });
    const loc = geo.data?.results?.[0];
    if (!loc) return { success: true, message: `❌ No encontré la ciudad "${city}"` };
    const { latitude, longitude, name, country } = loc;
    // Clima actual
    const weather = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude, longitude, current_weather: true, timezone: 'auto' }
    });
    const cw = weather.data?.current_weather;
    if (!cw) return { success: true, message: `❌ No pude obtener el clima de "${city}"` };
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
      message: `╭─❍「 🌤️ Clima en ${place} 」\n│\n├─ 🌡️ Temperatura: ${cw.temperature}°C\n├─ 💨 Viento: ${cw.windspeed} km/h\n├─ 🧭 Dirección: ${cw.winddirection}°\n├─ ☁️ Cielo: ${desc}\n│\n├─ 🕒 ${when}\n╰─✦`
    };
  } catch (error) {
    return { success: true, message: `❌ No pude obtener el clima de "${city}"` };
  }
}

async function handleQuote(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://api.quotable.io/random');
    const quote = res.data;
    return { success: true, message: `💭 "${quote.content}"\n— ${quote.author}` };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener cita' };
  }
}

async function handleFact(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=es');
    const fact = res.data;
    return { success: true, message: `📚 ${fact.text}` };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener dato' };
  }
}

async function handleTrivia(usuario, grupo, fecha) {
  try {
    const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple&lang=es');
    const trivia = res.data.results[0];
    const options = trivia.incorrect_answers.concat(trivia.correct_answer).sort(() => Math.random() - 0.5);
    const optionsText = options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
    return { success: true, message: `🧠 ${trivia.category} (${trivia.difficulty})\n\n${trivia.question}\n\n${optionsText}`, triviaAnswer: trivia.correct_answer };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener trivia' };
  }
}

async function handleHoroscope(sign, usuario, grupo, fecha) {
  try {
    if (!sign) return { success: true, message: '🔮 Usa: .horoscope <signo>' };
    const horoscopes = {
      aries: 'Hoy las estrellas te favorecen.',
      tauro: 'Disfruta de las cosas simples.',
      geminis: 'La comunicación será clave hoy.',
      cancer: 'Confía en tu intuición.',
      leo: 'Es tu momento de brillar.',
      virgo: 'Planifica bien tu día.',
      libra: 'Busca el equilibrio.',
      escorpio: 'Tu intensidad ayudará a resolver situaciones.',
      sagitario: 'La aventura te llama.',
      capricornio: 'Tu determinación te llevará lejos.',
      acuario: 'Tu creatividad está en su mejor momento.',
      piscis: 'Conecta con los demás de manera profunda.'
    };
    const signLower = sign.toLowerCase();
    const horoscope = horoscopes[signLower] || 'Signo no reconocido.';
    return { success: true, message: `🔮 ${sign.toUpperCase()}\n${horoscope}` };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener horóscopo' };
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
    const totalSubbots = await db('subbots').count('id as count').first();
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

    const message = `╭─❍「 📊 Estado ✦ 」\n│\n├─ Uptime: ${formatUptime(uptime)}\n├─ Memoria: ${formatBytes(memoryUsage.heapUsed)} / ${formatBytes(memoryUsage.heapTotal)}\n├─ Sistema: ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}\n├─ CPU: ${cpuUsage[0].toFixed(2)} (1m), ${cpuUsage[1].toFixed(2)} (5m), ${cpuUsage[2].toFixed(2)} (15m)\n│\n├─ Usuarios: ${totalUsers.count}\n├─ Sub-bots: ${totalSubbots.count}\n├─ Logs: ${totalLogs.count} (${recentLogs.count} 24h)\n├─ Aportes: ${totalAportes.count}\n├─ Pedidos: ${totalPedidos.count}\n╰─✦`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener estado' };
  }
}

async function handlePing(usuario, grupo, fecha) {
  try {
    const startTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 100));
    const ping = Date.now() - startTime;
    return { success: true, message: `🏓 Pong! ${ping}ms` };
  } catch (error) {
    return { success: false, message: '❌ Error en ping' };
  }
}

// =============
// Logs bundle
// =============

async function handleLogsAdvanced(type, usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') {
      return { success: true, message: '❌ Solo administradores pueden ver logs' };
    }
    const validTypes = ['all', 'errors', 'commands', 'users', 'system'];
    const logType = type && validTypes.includes(type.toLowerCase()) ? type.toLowerCase() : 'all';
    let logs = [];
    let title = '';
    switch (logType) {
      case 'errors':
        logs = await db('logs').whereILike('detalles', '%ERROR%').orderBy('fecha', 'desc').limit(20);
        title = '🚨 Logs de Errores';
        break;
      case 'commands':
        logs = await db('logs').whereIn('tipo', ['comando','ai_command','clasificar_command','administracion']).orderBy('fecha', 'desc').limit(20);
        title = '⚡ Logs de Comandos';
        break;
      case 'users':
        logs = await db('logs').where({ tipo: 'control' }).orderBy('fecha', 'desc').limit(20);
        title = '👥 Logs de Usuarios';
        break;
      case 'system':
        logs = await db('logs').whereIn('tipo', ['sistema','configuracion']).orderBy('fecha', 'desc').limit(20);
        title = '🔧 Logs del Sistema';
        break;
      default:
        logs = await db('logs').orderBy('fecha', 'desc').limit(30);
        title = '📋 Todos los Logs';
    }
    if (logs.length === 0) {
      return { success: true, message: `╭─❍「 ${title} ✦ 」\n│\n├─ No hay logs de este tipo\n╰─✦` };
    }
    // Resolver nombres de usuario para mostrar nombre WA/Panel en vez de número crudo
    const nums = [...new Set(logs.map(l => String(l.usuario || '').split('@')[0].split(':')[0]))].filter(Boolean);
    const dbUsers = nums.length ? await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username') : [];
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    const waNames = missing.length ? await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name') : [];
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    let message = `╭─❍「 ${title} ✦ 」\n│\n├─ 📊 Total: ${logs.length}\n│\n`;
    logs.forEach((log, index) => {
      const fechaL = new Date(log.fecha).toLocaleString();
      const comando = String(log.comando || '').replace(/_/g, ' ').toLowerCase();
      const detalles = (log.detalles || '').length > 50 ? `${log.detalles.substring(0, 50)}...` : (log.detalles || '');
      const num = String(log.usuario || '').split('@')[0].split(':')[0];
      const uname = nameByNumber[num] || waByNumber[num] || num || '-';
      message += `├─ ${index + 1}. ${comando}\n`;
      message += `│   📅 ${fechaL}\n`;
      message += `│   👤 @${uname}\n`;
      message += `│   📝 ${detalles}\n\n`;
    });
    message += `╰─✦`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener logs' };
  }
}

async function handleStats(usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') {
      return { success: true, message: '❌ Solo administradores pueden ver estadísticas' };
    }
    const totalUsers = await db('usuarios').count('id as count').first();
    const totalLogs = await db('logs').count('id as count').first();
    const totalSubbots = await db('subbots').count('id as count').first();
    const totalAportes = await db('aportes').count('id as count').first();
    const totalPedidos = await db('pedidos').count('id as count').first();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentLogs = await db('logs').where('fecha', '>=', yesterday.toISOString()).count('id as count').first();
    const topCommands = await db('logs').select('comando').count('id as count').groupBy('comando').orderBy('count', 'desc').limit(5);
    let message = `╭─❍「 📊 Stats ✦ 」\n│\n├─ Usuarios: ${totalUsers.count}\n├─ Sub-bots: ${totalSubbots.count}\n├─ Logs: ${totalLogs.count}\n├─ Aportes: ${totalAportes.count}\n├─ Pedidos: ${totalPedidos.count}\n├─ Logs 24h: ${recentLogs.count}\n│\n├─ 🔥 Comandos más usados:\n`;
    topCommands.forEach((cmd, i) => {
      const comando = String(cmd.comando || '').replace(/_/g, ' ').toLowerCase();
      message += `├─ ${i + 1}. ${comando} (${cmd.count})\n`;
    });
    message += `╰─✦`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener estadísticas' };
  }
}

async function handleExport(format, usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') {
      return { success: true, message: '❌ Solo administradores pueden exportar logs' };
    }
    if (!format || !['json', 'csv', 'txt'].includes(format.toLowerCase())) {
      return { success: true, message: '📤 Usa: .export json|csv|txt' };
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
    return { success: true, message: `📤 Archivo exportado: ${filename}\n📁 Ubicación: ${filepath}` };
  } catch (error) {
    return { success: false, message: '❌ Error al exportar logs' };
  }
}

// ================
// Sub-bots bundle
// ================

async function handleSerbot(usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') return { success: true, message: '❌ Solo administradores pueden crear sub-bots' };
    const subbotId = `subbot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    if (!fs.existsSync(subbotDir)) fs.mkdirSync(subbotDir, { recursive: true });
    await db('subbots').insert({ code: subbotId, nombre: `Sub-bot ${subbotId.split('_')[1]}`, status: 'pending', created_by: whatsappNumber, created_at: new Date().toISOString() });
    const subbotConfig = { id: subbotId, created: new Date().toISOString(), createdBy: whatsappNumber, status: 'pending', qrGenerated: false, qrData: null };
    fs.writeFileSync(path.join(subbotDir, 'subbot.json'), JSON.stringify(subbotConfig, null, 2));
    setTimeout(async () => {
      try {
        const subbotProcess = spawn('node', [path.join(process.cwd(), 'subbot-template', 'index.js')], { cwd: subbotDir, env: { ...process.env, SUBBOT_ID: subbotId, SUBBOT_DIR: subbotDir } });
        subbotProcess.stdout.on('data', (data) => console.log(`Sub-bot ${subbotId}: ${data}`));
        subbotProcess.stderr.on('data', (data) => console.error(`Sub-bot ${subbotId} error: ${data}`));
        subbotProcess.on('close', (code) => console.log(`Sub-bot ${subbotId} process exited with code ${code}`));
      } catch (error) {
        console.error('Error starting sub-bot:', error);
      }
    }, 1000);
    await logControlAction(usuario, 'CREATE_SUBBOT', `Sub-bot creado: ${subbotId}`, grupo);
    return { success: true, message: `🤖 Sub-bot creado. ID: \`${subbotId}\`` };
  } catch (error) {
    return { success: false, message: '❌ Error al crear sub-bot' };
  }
}

async function handleBots(usuario, grupo, fecha) {
  try {
    const subbots = await db('subbots').select('*').orderBy('created_at', 'desc');
    if (subbots.length === 0) return { success: true, message: '🤖 No hay sub-bots creados' };
    let message = '🤖 Lista de Sub-bots\n\n';
    subbots.forEach((bot, index) => {
      const status = bot.status === 'connected' ? '🟢' : bot.status === 'pending' ? '🟡' : bot.status === 'disconnected' ? '🔴' : '⚪';
      message += `${index + 1}. ${status} ${bot.nombre}\n  ID: \`${bot.code}\`\n  Creado: ${new Date(bot.created_at).toLocaleDateString()}\n  Por: ${bot.created_by}\n\n`;
    });
    message += `📊 Total: ${subbots.length}`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener lista de sub-bots' };
  }
}

async function handleDelSubbot(subbotId, usuario, grupo, fecha) {
  try {
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    if (!user || user.rol !== 'admin') return { success: true, message: '❌ Solo administradores pueden eliminar sub-bots' };
    const subbot = await db('subbots').where('code', subbotId).first();
    if (!subbot) return { success: true, message: '❌ Sub-bot no encontrado' };
    await db('subbots').where('code', subbotId).del();
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    if (fs.existsSync(subbotDir)) fs.rmSync(subbotDir, { recursive: true, force: true });
    await logControlAction(usuario, 'DELETE_SUBBOT', `Sub-bot eliminado: ${subbotId}`, grupo);
    return { success: true, message: `🗑️ Sub-bot eliminado: \`${subbotId}\`` };
  } catch (error) {
    return { success: false, message: '❌ Error al eliminar sub-bot' };
  }
}

async function handleQR(subbotId, usuario, grupo, fecha) {
  try {
    const subbot = await db('subbots').where('code', subbotId).first();
    if (!subbot) return { success: true, message: `❌ Sub-bot no encontrado` };
    if (subbot.status !== 'qr_ready' && subbot.status !== 'connected') {
      return { success: true, message: `⏳ QR en preparación... Estado: ${subbot.status}` };
    }
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    const qrFile = path.join(subbotDir, 'qr.png');
    if (!fs.existsSync(qrFile)) {
      return { success: true, message: `❌ QR no disponible para \`${subbotId}\`` };
    }
    const qrBuffer = fs.readFileSync(qrFile);
    return { success: true, message: `📱 QR de sub-bot: \`${subbotId}\``, qrImage: qrBuffer };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener QR' };
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
      return { success: false, message: '❌ Uso: /descargar [url] [nombre] [categoria]' };
    }
    const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
    if (!validCategories.includes(categoria.toLowerCase())) {
      return { success: false, message: `❌ Categoría inválida. Usa: ${validCategories.join(', ')}` };
    }
    const spaceCheck = checkDiskSpace();
    if (!spaceCheck.available) return { success: false, message: '❌ Espacio insuficiente en disco.' };
    const result = await downloadFile(url, nombre, categoria.toLowerCase(), usuario);
    if (result.success) {
      const sizeText = formatFileSize(result.size);
      const statusText = result.exists ? '(ya existía)' : '(nuevo)';
      return { success: true, message: `✅ Descarga completada ${statusText}\n\n📁 ${nombre}\n🏷️ ${categoria}\n📊 ${sizeText}` };
    } else {
      return { success: false, message: '❌ Error en la descarga.' };
    }
  } catch (error) {
    console.error('Error en descarga:', error);
    return { success: false, message: `❌ Error: ${error.message}` };
  }
}

async function handleGuardar(categoria, usuario, grupo, message) {
  try {
    const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
    if (!categoria || !validCategories.includes(categoria.toLowerCase())) {
      return { success: false, message: `❌ Uso: /guardar [categoria]\n${validCategories.join(', ')}` };
    }
    if (!message || !message.message) return { success: false, message: '❌ No se detectó archivo multimedia.' };
    const hasMedia = message.message.imageMessage || message.message.videoMessage || message.message.documentMessage || message.message.audioMessage;
    if (!hasMedia) return { success: false, message: '❌ No se detectó archivo multimedia.' };
    const result = await processWhatsAppMedia(message, categoria.toLowerCase(), usuario);
    if (result.success) {
      const sizeText = formatFileSize(result.size);
      // Registrar también como aporte para que aparezca en el panel
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
      return { success: true, message: `✅ Archivo guardado\n\n📁 ${result.filename}\n🏷️ ${categoria}\n📊 ${sizeText}\n🎯 ${result.mediaType}` };
    } else {
      return { success: false, message: '❌ Error al guardar archivo.' };
    }
  } catch (error) {
    return { success: false, message: `❌ Error: ${error.message}` };
  }
}

async function handleArchivos(categoria, usuario, grupo) {
  try {
    if (categoria) {
      const validCategories = ['manhwa', 'serie', 'extra', 'ilustracion', 'pack'];
      if (!validCategories.includes(categoria.toLowerCase())) {
        return { success: false, message: `❌ Categoría inválida. Usa: ${validCategories.join(', ')}` };
      }
    }
    const downloads = await listDownloads(categoria?.toLowerCase(), null);
    if (downloads.length === 0) {
      const categoryText = categoria ? ` de categoría "${categoria}"` : '';
      return { success: true, message: `📁 No hay archivos descargados${categoryText}.` };
    }
    // Mapear números a nombres de usuario si existen en DB
    const nums = [...new Set(downloads.map(d => String(d.usuario).split('@')[0].split(':')[0]))];
    const dbUsers = await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username');
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    let waNames = [];
    if (missing.length) waNames = await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name');
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    let message = `📁 Archivos descargados${categoria ? ` - ${categoria.toUpperCase()}` : ''} (${downloads.length}):\n\n`;
    downloads.slice(0, 20).forEach((d, i) => {
      const fecha = new Date(d.fecha).toLocaleDateString('es-ES');
      const sizeText = formatFileSize(d.size);
      const num = String(d.usuario).split('@')[0].split(':')[0];
      const resolved = nameByNumber[num] || waByNumber[num] || num;
      const uname = `@${resolved}`;
      message += `${i + 1}. ${d.filename}\n   🏷️ ${d.category}\n   📊 ${sizeText}\n   👤 ${uname}\n   📅 ${fecha}\n\n`;
    });
    if (downloads.length > 20) message += `_... y ${downloads.length - 20} archivos más_`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener lista de archivos.' };
  }
}

async function handleMisArchivos(usuario, grupo) {
  try {
    const downloads = await listDownloads(null, usuario);
    if (downloads.length === 0) return { success: true, message: '📁 No tienes archivos descargados.' };
    let message = `📁 Tus archivos (${downloads.length}):\n\n`;
    downloads.slice(0, 15).forEach((d, i) => {
      const fecha = new Date(d.fecha).toLocaleDateString('es-ES');
      const sizeText = formatFileSize(d.size);
      message += `${i + 1}. ${d.filename}\n   🏷️ ${d.category}\n   📊 ${sizeText}\n   📅 ${fecha}\n\n`;
    });
    if (downloads.length > 15) message += `_... y ${downloads.length - 15} más_`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener tus archivos.' };
  }
}

async function handleEstadisticas(usuario, grupo) {
  try {
    const stats = await getDownloadStats();
    let message = `📊 Estadísticas de Descargas\n\n`;
    message += `📁 Total de archivos: ${stats.totalFiles}\n`;
    message += `💾 Espacio total: ${formatFileSize(stats.totalSize)}\n\n`;
    if (stats.byCategory.length > 0) {
      message += `📋 Por categoría:\n`;
      stats.byCategory.forEach(cat => {
        const totalSize = formatFileSize(Number(cat.total_size || cat.totalSize || 0));
        message += `• ${cat.category}: ${cat.total} archivos (${totalSize})\n`;
      });
    }
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener estadísticas.' };
  }
}

async function handleLimpiar(usuario, grupo) {
  try {
    const result = await cleanOldFiles();
    const freedSpaceText = formatFileSize(result.freedSpace);
    let message = `🧹 Limpieza completada\n\n`;
    message += `🗑️ Archivos eliminados: ${result.deletedCount}\n`;
    message += `💾 Espacio liberado: ${freedSpaceText}`;
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al limpiar archivos.' };
  }
}

async function handleBuscarArchivo(nombre, usuario, grupo) {
  try {
    if (!nombre) return { success: false, message: '❌ Uso: /buscararchivo [nombre]' };
    const downloads = await db('descargas')
      .where('filename', 'like', `%${nombre}%`)
      .orderBy('fecha', 'desc')
      .limit(20);
    if (downloads.length === 0) return { success: true, message: `🔍 No se encontraron archivos con "${nombre}".` };
    let message = `🔍 Archivos encontrados (${downloads.length}):\n\n`;
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
      message += `${i + 1}. ${d.filename}\n   🏷️ ${d.category}\n   📊 ${sizeText}\n   👤 ${uname}\n   📅 ${fecha}\n\n`;
    });
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al buscar archivos.' };
  }
}

export {
  // Media
  handleMusic,
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
  // Sub-bots
  handleSerbot,
  handleBots,
  handleDelSubbot,
  handleQR,
  // Downloads
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo
};
