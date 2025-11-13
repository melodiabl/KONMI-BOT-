// download-commands.js
// Comandos de descarga mejorados con múltiples APIs y fallback automático

import {
  downloadTikTok,
  downloadInstagram,
  downloadFacebook,
  downloadTwitter,
  downloadPinterest,
  searchYouTubeMusic,
  downloadYouTube,
  searchSpotify,
  translateText,
  getWeather,
  getRandomQuote,
  getRandomFact,
  getTrivia,
  getRandomMeme,
} from '../utils/api-providers.js';
import logger from '../config/logger.js';
import { buildQuickReplyFlow } from '../utils/flows.js';

const normalizeUser = (u) => String(u || '').split('@')[0];

export async function handleTikTokDownload(ctx) {
  const { args, usuario } = ctx;
  const url = args[0] || '';
  try {
    if (!url || !url.includes('tiktok.com')) {
      return { message: '❌ Uso: /tiktok [URL]' };
    }

    const result = await downloadTikTok(url);

    if (!result.success || !result.video) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el video de TikTok. Verifica la URL.',
      };
    }

    const flow = buildQuickReplyFlow({
      header: '📹 TikTok',
      body: result.title ? `Título: ${result.title}` : 'Descarga lista',
      buttons: [
        { text: '🎬 Video', command: `/video ${url}` },
        { text: '🎵 Audio', command: `/music ${url}` },
      ],
    });
    return [
      {
        type: 'video',
        video: result.video,
        caption: `📹 *TikTok Descargado*\n\n👤 *Autor:* ${result.author || 'N/A'}\n📝 *Descripción:* ${result.description || 'N/A'}\n\n✅ Solicitado por: @${normalizeUser(usuario)}`,
        mentions: [usuario],
      },
      { type: 'content', content: flow }
    ];
  } catch (error) {
    logger.error('Error en handleTikTokDownload:', error);
    return { message: `⚠️ Error al descargar TikTok: ${error.message}` };
  }
}

export async function handleInstagramDownload(ctx) {
  const { args, usuario } = ctx;
  const url = args[0] || '';
  try {
    if (!url || !url.includes('instagram.com')) {
      return { message: '❌ Uso: /instagram [URL]' };
    }

    const result = await downloadInstagram(url);

    if (!result.success || (!result.image && !result.video)) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el contenido de Instagram. Verifica la URL.',
      };
    }

    const caption = `${result.type === 'video' ? '🎥' : '📸'} *Instagram*\n\n👤 *Autor:* ${result.author || 'N/A'}\n📝 *Descripción:* ${result.caption || 'N/A'}\n\n✅ Solicitado por: @${normalizeUser(usuario)}`;
    const flow = buildQuickReplyFlow({ header: '📸 Instagram', body: result.caption || 'Descarga lista', buttons: [{ text: '🎬 Video', command: `/video ${url}` }, { text: '🎵 Audio', command: `/music ${url}` }] });
    return [{ type: result.type, [result.type]: result.image || result.video, caption, mentions: [usuario] }, { type: 'content', content: flow }];
  } catch (error) {
    logger.error('Error en handleInstagramDownload:', error);
    return { message: `⚠️ Error al descargar Instagram: ${error.message}` };
  }
}

export async function handleFacebookDownload(ctx) {
  const { args, usuario } = ctx;
  const url = args[0] || '';
  try {
    if (!url || !url.includes('facebook.com')) {
      return { message: '❌ Uso: /facebook [URL]' };
    }
    const result = await downloadFacebook(url);
    if (!result.success || !result.video) {
      return { message: '⚠️ No se pudo descargar el video de Facebook.' };
    }
    const flow = buildQuickReplyFlow({ header: '📹 Facebook', body: result.title || 'Descarga lista', buttons: [{ text: '🎬 Video', command: `/video ${url}` }, { text: '🎵 Audio', command: `/music ${url}` }] });
    return [{ type: 'video', video: result.video, caption: `📹 *Facebook Video*\n\n📝 *Título:* ${result.title || 'N/A'}\n\n✅ Solicitado por: @${normalizeUser(usuario)}`, mentions: [usuario] }, { type: 'content', content: flow }];
  } catch (error) {
    logger.error('Error en handleFacebookDownload:', error);
    return { message: `⚠️ Error al descargar Facebook: ${error.message}` };
  }
}

export async function handleTwitterDownload(ctx) {
  const { args, usuario } = ctx;
  const url = args[0] || '';
  try {
    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
      return { message: '❌ Uso: /twitter [URL]' };
    }
    const result = await downloadTwitter(url);
    if (!result.success || (!result.video && !result.image)) {
      return { message: '⚠️ No se pudo descargar el contenido de Twitter/X.' };
    }
    const caption = `🐦 *Twitter/X ${result.type === 'video' ? 'Video' : 'Imagen'}*\n\n👤 *Autor:* @${result.author || 'N/A'}\n📝 *Tweet:* ${result.text || 'N/A'}\n\n✅ Solicitado por: @${normalizeUser(usuario)}`;
    const flow = buildQuickReplyFlow({ header: '🐦 Twitter/X', body: result.text || 'Descarga lista', buttons: [{ text: '🎬 Video', command: `/video ${url}` }, { text: '🎵 Audio', command: `/music ${url}` }] });
    return [{ type: result.type, [result.type]: result.video || result.image, caption, mentions: [usuario] }, { type: 'content', content: flow }];
  } catch (error) {
    logger.error('Error en handleTwitterDownload:', error);
    return { message: `⚠️ Error al descargar Twitter/X: ${error.message}` };
  }
}

export async function handlePinterestDownload(ctx) {
  const { args, usuario } = ctx;
  const url = args[0] || '';
  try {
    if (!url || !url.includes('pinterest.com')) {
      return { message: '❌ Uso: /pinterest [URL]' };
    }
    const result = await downloadPinterest(url);
    if (!result.success || !result.image) {
      return { message: '⚠️ No se pudo descargar la imagen de Pinterest.' };
    }
    return { type: 'image', image: result.image, caption: `📌 *Pinterest*\n\n📝 *Título:* ${result.title || 'N/A'}\n\n✅ Solicitado por: @${normalizeUser(usuario)}`, mentions: [usuario] };
  } catch (error) {
    logger.error('Error en handlePinterestDownload:', error);
    return { message: `⚠️ Error al descargar Pinterest: ${error.message}` };
  }
}

export async function handleMusicDownload(ctx) {
  const { args, usuario } = ctx;
  const query = args.join(' ');
  try {
    if (!query) {
      return { message: '❌ Uso: /music [nombre o URL]' };
    }

    const input = String(query).trim();
    const isUrl = /^(https?:\/\/)/i.test(input);
    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(input);
    const isSpotify = /open\.spotify\.com\/track\//i.test(input);

    if (isUrl && isYouTube) {
      const downloadResult = await downloadYouTube(input, 'audio');
      if (!downloadResult.success || !downloadResult.download) {
        return { success: false, message: '⚠️ Error al descargar el audio del enlace.' };
      }
      const title = downloadResult.title || 'Audio de YouTube';
      // Portada a partir del ID de YouTube
      let cover = null;
      try {
        const urlObj = new URL(input);
        let vid = urlObj.searchParams.get('v');
        if (!vid && /youtu\.be$/i.test(urlObj.hostname)) {
          const p = urlObj.pathname.split('/').filter(Boolean);
          if (p[0]) vid = p[0];
        }
        if (!vid) {
          const m = input.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
          vid = m ? m[1] : null;
        }
        if (vid) cover = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      } catch (_) {}
      return {
        success: true,
        type: 'audio',
        audio: downloadResult.download,
        image: cover,
        info: {
          title,
          author: downloadResult.author || 'Desconocido',
          duration: downloadResult.duration,
          views: downloadResult.views,
          quality: downloadResult.quality,
          provider: downloadResult.provider,
          cover_url: cover,
        },
        caption: `🎵 *Música Descargada*\n\n📌 *Título:* ${title}\n📶 *Calidad:* ${downloadResult.quality || 'N/A'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${downloadResult.provider}`,
        mentions: [`${usuario}@s.whatsapp.net`],
      };
    }

    if (isUrl && isSpotify) {
      const sp = await searchSpotify(input);
      if (sp?.success && (sp.download || sp.preview_url)) {
        return {
          success: true,
          type: 'audio',
          audio: sp.download || sp.preview_url,
          image: sp.cover_url || null,
          info: {
            title: sp.title,
            artists: sp.artists,
            album: sp.album,
            duration: sp.duration_ms,
            release_date: sp.release_date,
            provider: sp.provider,
            cover_url: sp.cover_url || null,
          },
          caption: `🎶 *Spotify*\n\n📌 *Título:* ${sp.title}\n👤 *Artista:* ${sp.artists}\n💽 *Álbum:* ${sp.album}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${sp.provider}`,
          mentions: [`${usuario}@s.whatsapp.net`],
        };
      }
      const yt = await searchYouTubeMusic(input);
      if (yt?.success && yt.results?.length) {
        const video = yt.results[0];
        const dl = await downloadYouTube(video.url, 'audio');
        if (dl?.success && dl.download) {
          // Portada del resultado de YouTube
          let cover = video.thumbnail || null;
          if (!cover) {
            try {
              const urlObj = new URL(video.url);
              let vid = urlObj.searchParams.get('v');
              if (!vid && /youtu\.be$/i.test(urlObj.hostname)) {
                const p = urlObj.pathname.split('/').filter(Boolean);
                if (p[0]) vid = p[0];
              }
              if (!vid) {
                const m = (video.url || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
                vid = m ? m[1] : null;
              }
              if (vid) cover = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
            } catch (_) {}
          }
          return {
            success: true,
            type: 'audio',
            audio: dl.download,
            image: cover,
            info: {
              title: video.title,
              author: video.author,
              duration: video.duration,
              views: video.views,
              quality: dl.quality,
              provider: dl.provider,
              cover_url: cover,
            },
            caption: `🎵 *Música Descargada*\n\n📌 *Título:* ${video.title}\n👤 *Canal:* ${video.author}\n⏱️ *Duración:* ${video.duration}\n📶 *Calidad:* ${dl.quality}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${dl.provider}`,
            mentions: [`${usuario}@s.whatsapp.net`],
          };
        }
      }
      return { success: false, message: '⚠️ No se pudo resolver el enlace de Spotify.' };
    }

    // Texto (título + artista) => buscar en YouTube y descargar
    const searchResult = await searchYouTubeMusic(input);
    if (!searchResult.success || !Array.isArray(searchResult.results) || searchResult.results.length === 0) {
      return {
        success: false,
        message: `🔎 *Búsqueda de música*\n\n😕 No se encontraron resultados para: "${input}"\n\n💡 Sugerencia: incluye el artista. Ej.:\n   /play tears sabrina carpenter`,
      };
    }
    const video = searchResult.results[0];
    const downloadResult = await downloadYouTube(video.url, 'audio');
    if (!downloadResult.success || !downloadResult.download) {
      return { success: false, message: '⚠️ Error al descargar el audio. Intenta con otra canción.' };
    }
    // Portada del resultado de YouTube
    let cover = video.thumbnail || null;
    if (!cover) {
      try {
        const urlObj = new URL(video.url);
        let vid = urlObj.searchParams.get('v');
        if (!vid && /youtu\.be$/i.test(urlObj.hostname)) {
          const p = urlObj.pathname.split('/').filter(Boolean);
          if (p[0]) vid = p[0];
        }
        if (!vid) {
          const m = (video.url || '').match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
          vid = m ? m[1] : null;
        }
        if (vid) cover = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
      } catch (_) {}
    }
    return {
      success: true,
      type: 'audio',
      audio: downloadResult.download,
      image: cover,
      info: {
        title: video.title,
        author: video.author,
        duration: video.duration,
        views: video.views,
        quality: downloadResult.quality,
        provider: downloadResult.provider,
        cover_url: cover,
      },
      caption: `🎵 *Música Descargada*\n\n📌 *Título:* ${video.title}\n👤 *Canal:* ${video.author}\n⏱️ *Duración:* ${video.duration}\n👁️ *Vistas:* ${video.views?.toLocaleString() || 'N/A'}\n📶 *Calidad:* ${downloadResult.quality}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${downloadResult.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleMusicDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al buscar música*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /video - Busca y descarga videos de YouTube
 */
export async function handleVideoDownload(query, usuario) {
  try {
    if (!query) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/video [búsqueda]`\n\n*Ejemplo:*\n`/video tutorial javascript`',
      };
    }

    const input = String(query).trim();
    const isUrl = /^(https?:\/\/)/i.test(input);
    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(input);

    const computeCover = (u) => {
      try {
        const urlObj = new URL(u);
        let vid = urlObj.searchParams.get('v');
        if (!vid && /youtu\.be$/i.test(urlObj.hostname)) {
          const p = urlObj.pathname.split('/').filter(Boolean);
          if (p[0]) vid = p[0];
        }
        if (!vid) {
          const m = u.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
          vid = m ? m[1] : null;
        }
        return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
      } catch (_) { return null; }
    };

    // Ruta 1: URL directa de YouTube
    if (isUrl && isYouTube) {
      const dl = await downloadYouTube(input, 'video');
      if (!dl?.success || !dl.download) {
        return { success: false, message: '⚠️ Error al descargar el video del enlace.' };
      }
      const cover = computeCover(input);
      return {
        success: true,
        type: 'video',
        video: dl.download,
        image: cover,
        info: {
          title: dl.title || 'Video',
          author: dl.author,
          duration: dl.duration,
          views: dl.views,
          quality: dl.quality,
          provider: dl.provider,
          cover_url: cover,
        },
        caption: `🎬 *Video Descargado*\n\n📌 *Título:* ${dl.title || 'Video'}\n📶 *Calidad:* ${dl.quality || 'N/A'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${dl.provider}`,
        mentions: [`${usuario}@s.whatsapp.net`],
      };
    }

    // Ruta 2: Texto => buscar en YouTube y descargar
    const searchResult = await searchYouTubeMusic(input);
    if (!searchResult.success || !Array.isArray(searchResult.results) || searchResult.results.length === 0) {
      return {
        success: false,
        message: `🔎 *Búsqueda de video*\n\n😕 No se encontraron resultados para: "${input}"\n\n💡 Intenta con otra búsqueda.`,
      };
    }
    const video = searchResult.results[0];
    const dl = await downloadYouTube(video.url, 'video');
    if (!dl?.success || !dl.download) {
      return { success: false, message: '⚠️ Error al descargar el video. Intenta con otra búsqueda.' };
    }
    const cover = video.thumbnail || computeCover(video.url || '') || null;
    return {
      success: true,
      type: 'video',
      video: dl.download,
      image: cover,
      info: {
        title: video.title,
        author: video.author,
        duration: video.duration,
        views: video.views,
        quality: dl.quality,
        provider: dl.provider,
        cover_url: cover,
      },
      caption: `🎬 *Video Descargado*\n\n📌 *Título:* ${video.title}\n👤 *Canal:* ${video.author}\n⏱️ *Duración:* ${video.duration}\n👁️ *Vistas:* ${video.views?.toLocaleString() || 'N/A'}\n📶 *Calidad:* ${dl.quality}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${dl.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleVideoDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al buscar video*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /spotify - Busca música en Spotify
 */
export async function handleSpotifySearch(query, usuario) {
  try {
    if (!query) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/spotify [nombre de la canción]`\n\n*Ejemplo:*\n`/spotify Shape of You Ed Sheeran`',
      };
    }

  const result = await searchSpotify(query);

    if (!result.success) {
      return {
        success: false,
        message: `🔎 *Búsqueda en Spotify*\n\n😕 No se encontraron resultados para: "${query}"\n\n💡 Intenta con el nombre exacto de la canción y artista.`,
      };
    }

    const duration = Math.floor(result.duration_ms / 60000);
    const seconds = String(Math.floor((result.duration_ms % 60000) / 1000)).padStart(2, '0');
    const linkLine = result.url ? `\n🔗 Escuchar: ${result.url}` : '';

    // Intentar conseguir audio: preview de Spotify o fallback a YouTube
    let audioUrl = result.download || result.preview_url || null;
    if (!audioUrl && result.title) {
      try {
        const ytQuery = `${result.title} ${result.artists || ''}`.trim();
        const yt = await searchYouTubeMusic(ytQuery);
        if (yt?.success && Array.isArray(yt.results) && yt.results.length) {
          const top = yt.results[0];
          const dl = await downloadYouTube(top.url, 'audio');
          if (dl?.success && dl.download) {
            audioUrl = dl.download;
          }
        }
      } catch (_) {}
    }

    return {
      success: true,
      type: 'spotify',
      image: result.cover_url,
      audio: audioUrl,
      info: {
        title: result.title,
        artists: result.artists,
        album: result.album,
        duration: `${duration}:${seconds}`,
        release_date: result.release_date,
        provider: result.provider,
        url: result.url || undefined,
      },
      caption: `🎶 *Spotify*\n\n📌 *Título:* ${result.title}\n👤 *Artista:* ${result.artists}\n💽 *Álbum:* ${result.album}\n⏱️ *Duración:* ${duration}:${seconds}\n📅 *Lanzamiento:* ${result.release_date}${linkLine}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleSpotifySearch:', error);
    return {
      success: false,
      message: `⚠️ *Error al buscar en Spotify*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /translate - Traduce texto
 */
export async function handleTranslate(text, targetLang = 'es', usuario) {
  try {
    if (!text) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/translate [texto] | [idioma]`\n\n*Ejemplos:*\n`/translate Hello world`\n`/translate Hola mundo | en`\n\n*Idiomas:* es, en, fr, de, it, pt, ja, ko, zh, ar, ru',
      };
    }

    const result = await translateText(text, targetLang);

    if (!result.success || !result.translatedText) {
      return {
        success: false,
        message: '⚠️ No se pudo traducir el texto. Intenta nuevamente.',
      };
    }

    return {
      success: true,
      message: `🌐 *Traducción*\n\n📝 *Original:* ${text}\n\n✅ *Traducido:* ${result.translatedText}\n\n🔤 *Idioma detectado:* ${result.detectedLanguage || 'Desconocido'}\n🎯 *Idioma destino:* ${targetLang}\n\n👤 Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleTranslate:', error);
    return {
      success: false,
      message: `⚠️ *Error al traducir*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /weather - Obtiene el clima
 */
export async function handleWeather(city, usuario) {
  try {
    if (!city) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/weather [ciudad]`\n\n*Ejemplos:*\n`/weather Madrid`\n`/weather Buenos Aires`\n`/weather Tokyo`',
      };
    }

    const result = await getWeather(city);

    if (!result.success) {
      return {
        success: false,
        message: `⚠️ No se pudo obtener el clima para: "${city}"\n\n💡 Verifica el nombre de la ciudad.`,
      };
    }

    const weatherEmoji = getWeatherEmoji(result.weatherCode || 0);

    return {
      success: true,
      message: `${weatherEmoji} *Clima en ${result.city}*\n\n🌡️ *Temperatura:* ${result.temperature}°C\n💧 *Humedad:* ${result.humidity}%\n💨 *Viento:* ${result.windSpeed} km/h\n${result.description ? `☁️ *Estado:* ${result.description}\n` : ''}${result.feelsLike ? `🌡️ *Sensación térmica:* ${result.feelsLike}°C\n` : ''}📍 *País:* ${result.country}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleWeather:', error);
    return {
      success: false,
      message: `⚠️ *Error al obtener clima*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /quote - Obtiene una frase inspiradora
 */
export async function handleQuote(usuario) {
  try {
    const result = await getRandomQuote();

    if (!result.success || !result.quote) {
      return {
        success: false,
        message: '⚠️ No se pudo obtener una frase. Intenta nuevamente.',
      };
    }

    return {
      success: true,
      message: `💭 *Frase del día*\n\n"${result.quote}"\n\n✍️ *— ${result.author || 'Anónimo'}*\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleQuote:', error);
    return {
      success: false,
      message: '⚠️ Error al obtener frase. Intenta nuevamente.',
    };
  }
}

/**
 * Comando /fact - Obtiene un dato curioso
 */
export async function handleFact(usuario) {
  try {
    const result = await getRandomFact();

    if (!result.success || !result.fact) {
      return {
        success: false,
        message: '⚠️ No se pudo obtener un dato curioso. Intenta nuevamente.',
      };
    }

    return {
      success: true,
      message: `🤓 *Dato curioso*\n\n${result.fact}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleFact:', error);
    return {
      success: false,
      message: '⚠️ Error al obtener dato curioso. Intenta nuevamente.',
    };
  }
}

/**
 * Comando /trivia - Obtiene una pregunta de trivia
 */
export async function handleTriviaCommand(usuario) {
  try {
    const result = await getTrivia();

    if (!result.success || !result.question) {
      return {
        success: false,
        message: '⚠️ No se pudo obtener pregunta de trivia. Intenta nuevamente.',
      };
    }

    const allAnswers = [result.correct_answer, ...result.incorrect_answers].sort(() => Math.random() - 0.5);

    return {
      success: true,
      message: `🎯 *Trivia*\n\n❓ *Pregunta:* ${decodeHTML(result.question)}\n\n📚 *Categoría:* ${result.category}\n⭐ *Dificultad:* ${result.difficulty}\n\n*Opciones:*\n${allAnswers.map((ans, i) => `${String.fromCharCode(65 + i)}) ${decodeHTML(ans)}`).join('\n')}\n\n💡 *Respuesta correcta:* ||${decodeHTML(result.correct_answer)}||\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleTriviaCommand:', error);
    return {
      success: false,
      message: '⚠️ Error al obtener trivia. Intenta nuevamente.',
    };
  }
}

/**
 * Comando /meme - Obtiene un meme aleatorio
 */
export async function handleMemeCommand(usuario) {
  try {
    const result = await getRandomMeme();

    if (!result.success || !result.image) {
      return {
        success: false,
        message: '⚠️ No se pudo obtener un meme. Intenta nuevamente.',
      };
    }

    return {
      success: true,
      type: 'image',
      image: result.image,
      caption: `😂 *Meme aleatorio*\n\n📝 *Título:* ${result.title || 'Sin título'}\n${result.subreddit ? `📂 *De:* r/${result.subreddit}\n` : ''}${result.author ? `👤 *Por:* u/${result.author}\n` : ''}\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
    };
  } catch (error) {
    logger.error('Error en handleMemeCommand:', error);
    return {
      success: false,
      message: '⚠️ Error al obtener meme. Intenta nuevamente.',
    };
  }
}

// Funciones auxiliares

function getWeatherEmoji(weatherCode) {
  if (weatherCode === 0) return '☀️';
  if (weatherCode <= 3) return '⛅';
  if (weatherCode <= 48) return '🌫️';
  if (weatherCode <= 67) return '🌧️';
  if (weatherCode <= 77) return '🌨️';
  if (weatherCode <= 82) return '🌧️';
  if (weatherCode <= 86) return '🌨️';
  if (weatherCode <= 99) return '⛈️';
  return '🌤️';
}

function decodeHTML(html) {
  const entities = {
    '&quot;': '"',
    '&#039;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&apos;': "'",
  };
  return html.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

export default {
  handleTikTokDownload,
  handleInstagramDownload,
  handleFacebookDownload,
  handleTwitterDownload,
  handlePinterestDownload,
  handleMusicDownload,
  handleVideoDownload,
  handleSpotifySearch,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTriviaCommand,
  handleMemeCommand,
};
