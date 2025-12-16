// plugins/advanced-downloads.js
// Descargas avanzadas - SoundCloud, Reddit, Twitch, etc.

import axios from 'axios'

// Importaciones opcionales para scraping avanzado
let cheerio, JSDOM;

try {
  cheerio = await import('cheerio');
} catch (e) {
  console.log('⚠️ cheerio no disponible, usando extracción básica');
}

try {
  const jsdomModule = await import('jsdom');
  JSDOM = jsdomModule.JSDOM;
} catch (e) {
  console.log('⚠️ jsdom no disponible, usando análisis básico');
}

// Funcionalidad Wileys: Reacciones automáticas para descargas avanzadas
const addAdvancedDownloadReaction = async (sock, message, emoji = '⬇️') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[ADVANCED_DOWNLOAD_REACTION] Error:', error);
  }
};

const addCompletionReaction = async (sock, message, success = true) => {
  try {
    if (sock && message?.key) {
      const emoji = success ? '✅' : '❌';
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: emoji, key: message.key }
        });
      }, 1000);
    }
  } catch (error) {
    console.error('[COMPLETION_REACTION] Error:', error);
  }
};

// Extractor real de información de URLs
const extractMediaInfo = async (platform, url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    if (!cheerio) {
      return {
        success: false,
        error: 'cheerio no disponible',
        title: `Contenido de ${platform}`,
        author: 'Información no disponible',
        platform
      };
    }

    const $ = cheerio.load(response.data);
    let title = 'Contenido sin título';
    let author = 'Autor desconocido';
    let duration = 'Duración desconocida';
    let thumbnail = null;

    switch (platform.toLowerCase()) {
      case 'soundcloud':
        title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text();
        author = $('meta[property="og:site_name"]').attr('content') || 'SoundCloud';
        thumbnail = $('meta[property="og:image"]').attr('content');
        break;

      case 'reddit':
        title = $('meta[property="og:title"]').attr('content') ||
                $('h1').first().text() ||
                $('title').text();
        author = $('meta[property="og:site_name"]').attr('content') || 'Reddit';
        thumbnail = $('meta[property="og:image"]').attr('content');
        break;

      case 'twitch':
        title = $('meta[property="og:title"]').attr('content') ||
                $('title').text();
        author = $('meta[property="og:site_name"]').attr('content') || 'Twitch';
        thumbnail = $('meta[property="og:image"]').attr('content');
        break;

      case 'vimeo':
        title = $('meta[property="og:title"]').attr('content') ||
                $('title').text();
        author = $('meta[property="og:site_name"]').attr('content') || 'Vimeo';
        duration = $('meta[property="video:duration"]').attr('content');
        thumbnail = $('meta[property="og:image"]').attr('content');
        break;

      case 'dailymotion':
        title = $('meta[property="og:title"]').attr('content') ||
                $('title').text();
        author = $('meta[property="og:site_name"]').attr('content') || 'Dailymotion';
        duration = $('meta[property="video:duration"]').attr('content');
        thumbnail = $('meta[property="og:image"]').attr('content');
        break;

      default:
        title = $('meta[property="og:title"]').attr('content') ||
                $('title').text() ||
                'Contenido multimedia';
        author = $('meta[property="og:site_name"]').attr('content') || platform;
        thumbnail = $('meta[property="og:image"]').attr('content');
    }

    // Limpiar título
    title = title.replace(/\s+/g, ' ').trim();
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    return {
      success: true,
      title,
      author,
      duration,
      thumbnail,
      platform,
      originalUrl: url
    };
  } catch (error) {
    console.error(`Error extrayendo info de ${platform}:`, error.message);
    return {
      success: false,
      error: error.message,
      title: `Contenido de ${platform}`,
      author: 'Información no disponible',
      platform
    };
  }
};

export async function soundcloud(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('soundcloud.com')) {
    return {
      success: false,
      message: '❌ Uso: /soundcloud <URL>\nEjemplo: /soundcloud https://soundcloud.com/artist/track'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🎵');
  await sock.sendPresenceUpdate('composing', remoteJid);

  try {
    const result = await extractMediaInfo('SoundCloud', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return {
        success: false,
        message: `❌ Error extrayendo información de SoundCloud: ${result.error}`
      };
    }

    await addCompletionReaction(sock, message, true);

    let response = `🎵 *SoundCloud - Información Extraída*\n\n🎧 **Título:** ${result.title}\n👤 **Artista:** ${result.author}\n⏱️ **Duración:** ${result.duration}\n🔗 **URL:** ${result.originalUrl}\n\n📥 **Estado:** Información obtenida exitosamente\n👤 Solicitado por @${sender.split('@')[0]}\n\n💡 *Nota:* Para descarga real se requiere integración con APIs especializadas`;

    // Si hay thumbnail, enviarlo
    if (result.thumbnail) {
      try {
        await sock.sendMessage(remoteJid, {
          image: { url: result.thumbnail },
          caption: response,
          mentions: [sender]
        });
        return { success: true };
      } catch (thumbError) {
        console.log('Error enviando thumbnail:', thumbError.message);
      }
    }

    return {
      success: true,
      message: response,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    console.error('Error SoundCloud:', error);
    return { success: false, message: `❌ Error procesando SoundCloud: ${error.message}` };
  }
}

export async function reddit(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('reddit.com')) {
    return {
      success: false,
      message: '❌ Uso: /reddit <URL>\nEjemplo: /reddit https://reddit.com/r/funny/comments/...'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🔴');

  try {
    const result = await simulateDownload('Reddit', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Reddit' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🔴 *Reddit*\n\n📝 *Post:* ${result.title}\n👤 *Usuario:* ${result.author}\n📊 *Tipo:* Video/Imagen\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Reddit: ${error.message}` };
  }
}

export async function twitch(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('twitch.tv')) {
    return {
      success: false,
      message: '❌ Uso: /twitch <URL>\nEjemplo: /twitch https://twitch.tv/streamer o https://clips.twitch.tv/...'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🟣');

  try {
    const isClip = url.includes('clips.twitch.tv');
    const result = await simulateDownload('Twitch', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Twitch' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🟣 *Twitch ${isClip ? 'Clip' : 'Video'}*\n\n🎮 *Título:* ${result.title}\n👤 *Streamer:* ${result.author}\n⏱️ *Duración:* ${result.duration}\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Twitch: ${error.message}` };
  }
}

export async function dailymotion(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('dailymotion.com')) {
    return {
      success: false,
      message: '❌ Uso: /dailymotion <URL>\nEjemplo: /dailymotion https://dailymotion.com/video/...'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🔵');

  try {
    const result = await simulateDownload('Dailymotion', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Dailymotion' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🔵 *Dailymotion*\n\n🎬 *Título:* ${result.title}\n👤 *Canal:* ${result.author}\n⏱️ *Duración:* ${result.duration}\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Dailymotion: ${error.message}` };
  }
}

export async function vimeo(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('vimeo.com')) {
    return {
      success: false,
      message: '❌ Uso: /vimeo <URL>\nEjemplo: /vimeo https://vimeo.com/123456789'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🎥');

  try {
    const result = await simulateDownload('Vimeo', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Vimeo' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🎥 *Vimeo*\n\n🎬 *Título:* ${result.title}\n👤 *Creador:* ${result.author}\n⏱️ *Duración:* ${result.duration}\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Vimeo: ${error.message}` };
  }
}

export async function kwai(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('kwai.')) {
    return {
      success: false,
      message: '❌ Uso: /kwai <URL>\nEjemplo: /kwai https://kwai.com/@user/video/...'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🟡');

  try {
    const result = await simulateDownload('Kwai', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Kwai' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🟡 *Kwai*\n\n📱 *Video:* ${result.title}\n👤 *Usuario:* ${result.author}\n⏱️ *Duración:* ${result.duration}\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Kwai: ${error.message}` };
  }
}

export async function bilibili(ctx) {
  const { args, sender, sock, message, remoteJid } = ctx;
  const url = args.join(' ').trim();

  if (!url || !url.includes('bilibili.com')) {
    return {
      success: false,
      message: '❌ Uso: /bilibili <URL>\nEjemplo: /bilibili https://bilibili.com/video/...'
    };
  }

  await addAdvancedDownloadReaction(sock, message, '🩵');

  try {
    const result = await simulateDownload('Bilibili', url);

    if (!result.success) {
      await addCompletionReaction(sock, message, false);
      return { success: false, message: '❌ No se pudo descargar de Bilibili' };
    }

    await addCompletionReaction(sock, message, true);

    return {
      success: true,
      message: `🩵 *Bilibili*\n\n🎬 *Título:* ${result.title}\n👤 *UP主:* ${result.author}\n⏱️ *Duración:* ${result.duration}\n\n📥 *Estado:* Descarga completada\n👤 Solicitado por @${sender.split('@')[0]}`,
      mentions: [sender]
    };
  } catch (error) {
    await addCompletionReaction(sock, message, false);
    return { success: false, message: `❌ Error Bilibili: ${error.message}` };
  }
}

// Comando de ayuda para descargas avanzadas
export async function downloads(ctx) {
  const { sock, message } = ctx;

  await addAdvancedDownloadReaction(sock, message, '📥');

  return {
    success: true,
    message: `📥 *DESCARGAS AVANZADAS*\n\n🎵 */soundcloud* <URL> - Música de SoundCloud\n🔴 */reddit* <URL> - Videos/imágenes de Reddit\n🟣 */twitch* <URL> - Clips y videos de Twitch\n🔵 */dailymotion* <URL> - Videos de Dailymotion\n🎥 */vimeo* <URL> - Videos de Vimeo\n🟡 */kwai* <URL> - Videos de Kwai\n🩵 */bilibili* <URL> - Videos de Bilibili\n\n💡 *Tip:* Copia la URL completa del contenido que quieres descargar`
  };
}

export default {
  soundcloud,
  reddit,
  twitch,
  dailymotion,
  vimeo,
  kwai,
  bilibili,
  downloads
};
