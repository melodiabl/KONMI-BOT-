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

/**
 * Comando /tiktok - Descarga videos de TikTok
 */
export async function handleTikTokDownload(url, usuario) {
  try {
    if (!url || !url.includes('tiktok.com')) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/tiktok [URL]`\n\n*Ejemplo:*\n`/tiktok https://www.tiktok.com/@user/video/123`',
      };
    }

    const result = await downloadTikTok(url);

    if (!result.success || !result.video) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el video de TikTok. Verifica la URL.',
      };
    }

    return {
      success: true,
      type: 'video',
      video: result.video,
      caption: `📹 *TikTok Descargado*\n\n👤 *Autor:* ${result.author || 'Desconocido'}\n📝 *Descripción:* ${result.description || result.title || 'Sin descripción'}\n🎵 *Música:* ${result.music || 'N/A'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
      info: {
        title: result.title,
        author: result.author,
        description: result.description,
        provider: result.provider,
      },
    };
  } catch (error) {
    logger.error('Error en handleTikTokDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al descargar TikTok*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /instagram - Descarga contenido de Instagram
 */
export async function handleInstagramDownload(url, usuario) {
  try {
    if (!url || !url.includes('instagram.com')) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/instagram [URL]`\n\n*Ejemplo:*\n`/instagram https://www.instagram.com/p/ABC123/`',
      };
    }

    const result = await downloadInstagram(url);

    if (!result.success || (!result.image && !result.video)) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el contenido de Instagram. Verifica la URL.',
      };
    }

    const caption = `${result.type === 'video' ? '🎥' : '📸'} *Instagram ${result.type === 'video' ? 'Video' : 'Imagen'}*\n\n👤 *Autor:* ${result.author || 'Desconocido'}\n📝 *Descripción:* ${result.caption || 'Sin descripción'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`;

    return {
      success: true,
      type: result.type === 'video' ? 'video' : 'image',
      image: result.image,
      video: result.video,
      url: result.url,
      caption,
      mentions: [`${usuario}@s.whatsapp.net`],
      info: {
        title: result.caption,
        author: result.author,
        type: result.type,
        provider: result.provider,
      },
    };
  } catch (error) {
    logger.error('Error en handleInstagramDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al descargar Instagram*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /facebook - Descarga videos de Facebook
 */
export async function handleFacebookDownload(url, usuario) {
  try {
    if (!url || !url.includes('facebook.com')) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/facebook [URL]`\n\n*Ejemplo:*\n`/facebook https://www.facebook.com/watch/?v=123456`',
      };
    }

    const result = await downloadFacebook(url);

    if (!result.success || !result.video) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el video de Facebook. Verifica la URL.',
      };
    }

    return {
      success: true,
      type: 'video',
      video: result.video,
      caption: `📹 *Facebook Video*\n\n📝 *Título:* ${result.title || 'Sin título'}\n⏱️ *Duración:* ${result.duration || 'N/A'}\n👤 *Autor:* ${result.author || 'Desconocido'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
      info: {
        title: result.title,
        author: result.author,
        duration: result.duration,
        provider: result.provider,
      },
    };
  } catch (error) {
    logger.error('Error en handleFacebookDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al descargar Facebook*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /twitter - Descarga contenido de Twitter/X
 */
export async function handleTwitterDownload(url, usuario) {
  try {
    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/twitter [URL]`\n\n*Ejemplo:*\n`/twitter https://twitter.com/user/status/123456`',
      };
    }

    const result = await downloadTwitter(url);

    if (!result.success || (!result.video && !result.image)) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar el contenido de Twitter/X. Verifica la URL.',
      };
    }

    const caption = `🐦 *Twitter/X ${result.type === 'video' ? 'Video' : 'Imagen'}*\n\n👤 *Autor:* @${result.author || 'Desconocido'}\n📝 *Tweet:* ${result.text || 'Sin texto'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`;

    return {
      success: true,
      type: result.type === 'video' ? 'video' : 'image',
      video: result.video,
      image: result.image,
      caption,
      mentions: [`${usuario}@s.whatsapp.net`],
      info: {
        author: result.author,
        type: result.type,
        text: result.text,
        provider: result.provider,
      },
    };
  } catch (error) {
    logger.error('Error en handleTwitterDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al descargar Twitter/X*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /pinterest - Descarga imágenes de Pinterest
 */
export async function handlePinterestDownload(url, usuario) {
  try {
    if (!url || !url.includes('pinterest.com')) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/pinterest [URL]`\n\n*Ejemplo:*\n`/pinterest https://www.pinterest.com/pin/123456789/`',
      };
    }

    const result = await downloadPinterest(url);

    if (!result.success || !result.image) {
      return {
        success: false,
        message: '⚠️ No se pudo descargar la imagen de Pinterest. Verifica la URL.',
      };
    }

    return {
      success: true,
      type: 'image',
      image: result.image,
      caption: `📌 *Pinterest*\n\n📝 *Título:* ${result.title || 'Sin título'}\n📄 *Descripción:* ${result.description || 'Sin descripción'}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
      mentions: [`${usuario}@s.whatsapp.net`],
      info: {
        title: result.title,
        description: result.description,
        provider: result.provider,
      },
    };
  } catch (error) {
    logger.error('Error en handlePinterestDownload:', error);
    return {
      success: false,
      message: `⚠️ *Error al descargar Pinterest*\n\n${error.message}\n\n💡 Intenta nuevamente en unos momentos.`,
    };
  }
}

/**
 * Comando /music - Busca y descarga música de YouTube
 */
export async function handleMusicDownload(query, usuario) {
  try {
    if (!query) {
      return {
        success: false,
        message: '❌ *Uso incorrecto*\n\n*Formato:* `/music [nombre de la canción]`\n\n*Ejemplo:*\n`/music Despacito Luis Fonsi`',
      };
    }

    // Buscar en YouTube
    const searchResult = await searchYouTubeMusic(query);

    if (!searchResult.success || searchResult.results.length === 0) {
      return {
        success: false,
        message: `🔎 *Búsqueda de música*\n\n😕 No se encontraron resultados para: "${query}"\n\n💡 Intenta con otro nombre o artista.`,
      };
    }

    const video = searchResult.results[0];

    // Descargar el audio
    const downloadResult = await downloadYouTube(video.url, 'audio');

    if (!downloadResult.success || !downloadResult.download) {
      return {
        success: false,
        message: '⚠️ Error al descargar el audio. Intenta con otra canción.',
      };
    }

    return {
      success: true,
      type: 'audio',
      audio: downloadResult.download,
      info: {
        title: video.title,
        author: video.author,
        duration: video.duration,
        views: video.views,
        quality: downloadResult.quality,
        provider: downloadResult.provider,
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

    // Buscar en YouTube
    const searchResult = await searchYouTubeMusic(query);

    if (!searchResult.success || searchResult.results.length === 0) {
      return {
        success: false,
        message: `🔎 *Búsqueda de video*\n\n😕 No se encontraron resultados para: "${query}"\n\n💡 Intenta con otra búsqueda.`,
      };
    }

    const video = searchResult.results[0];

    // Descargar el video
    const downloadResult = await downloadYouTube(video.url, 'video');

    if (!downloadResult.success || !downloadResult.download) {
      return {
        success: false,
        message: '⚠️ Error al descargar el video. Intenta con otra búsqueda.',
      };
    }

    return {
      success: true,
      type: 'video',
      video: downloadResult.download,
      info: {
        title: video.title,
        author: video.author,
        duration: video.duration,
        views: video.views,
        quality: downloadResult.quality,
        provider: downloadResult.provider,
      },
      caption: `🎬 *Video Descargado*\n\n📌 *Título:* ${video.title}\n👤 *Canal:* ${video.author}\n⏱️ *Duración:* ${video.duration}\n👁️ *Vistas:* ${video.views?.toLocaleString() || 'N/A'}\n📶 *Calidad:* ${downloadResult.quality}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${downloadResult.provider}`,
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

    return {
      success: true,
      type: 'spotify',
      image: result.cover_url,
      audio: result.download || result.preview_url,
      info: {
        title: result.title,
        artists: result.artists,
        album: result.album,
        duration: `${duration}:${seconds}`,
        release_date: result.release_date,
        provider: result.provider,
      },
      caption: `🎶 *Spotify*\n\n📌 *Título:* ${result.title}\n👤 *Artista:* ${result.artists}\n💽 *Álbum:* ${result.album}\n⏱️ *Duración:* ${duration}:${seconds}\n📅 *Lanzamiento:* ${result.release_date}\n\n✅ Solicitado por: @${usuario}\n🔧 Proveedor: ${result.provider}`,
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
