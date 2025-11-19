// commands/download-commands.js
// Comandos de descarga refactorizados para usar el contexto (ctx) unificado.

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
import { createProgressNotifier } from '../utils/progress-notifier.js';

/**
 * Comando /tiktok - Descarga videos de TikTok
 */
export async function handleTikTokDownload(ctx) {
  const { args, sender } = ctx;
  const url = args.join(' ');
  if (!url || !url.includes('tiktok.com')) {
    return { success: false, message: '❌ Uso incorrecto: /tiktok [URL]' };
  }

  try {
    const result = await downloadTikTok(url);
    if (!result.success || !result.video) {
      return { success: false, message: '⚠️ No se pudo descargar el video de TikTok. Verifica la URL.' };
    }

    return {
      type: 'video',
      video: result.video,
      caption: `📹 *TikTok Descargado*\n\n👤 *Autor:* ${result.author || 'N/D'}\n📝 *Descripción:* ${result.description || 'N/D'}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
      mentions: [sender],
    };
  } catch (error) {
    logger.error('Error en handleTikTokDownload:', error);
    return { success: false, message: `⚠️ Error al descargar TikTok: ${error.message}` };
  }
}

/**
 * Comando /instagram - Descarga contenido de Instagram
 */
export async function handleInstagramDownload(ctx) {
  const { args, sender } = ctx;
  const url = args.join(' ');
  if (!url || !url.includes('instagram.com')) {
    return { success: false, message: '❌ Uso incorrecto: /instagram [URL]' };
  }

  try {
    const result = await downloadInstagram(url);
    if (!result.success || (!result.image && !result.video)) {
      return { success: false, message: '⚠️ No se pudo descargar el contenido de Instagram. Verifica la URL.' };
    }

    const caption = `${result.type === 'video' ? '🎥' : '📸'} *Instagram*\n\n👤 *Autor:* ${result.author || 'N/D'}\n📝 *Descripción:* ${result.caption || 'N/D'}\n\n✅ Solicitado por: @${sender.split('@')[0]}`;

    return {
      type: result.type,
      [result.type]: result.image || result.video,
      caption,
      mentions: [sender],
    };
  } catch (error) {
    logger.error('Error en handleInstagramDownload:', error);
    return { success: false, message: `⚠️ Error al descargar Instagram: ${error.message}` };
  }
}

export async function handleFacebookDownload(ctx) {
    const { args, sender } = ctx;
    const url = args.join(' ');
    if (!url || !url.includes('facebook.com')) {
        return { success: false, message: '❌ Uso incorrecto: /facebook [URL]' };
    }

    try {
        const result = await downloadFacebook(url);
        if (!result.success || !result.video) {
            return { success: false, message: '⚠️ No se pudo descargar el video de Facebook.' };
        }

        return {
            type: 'video',
            video: result.video,
            caption: `📹 *Facebook Video*\n\n📝 *Título:* ${result.title || 'N/D'}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
            mentions: [sender],
        };
    } catch (error) {
        logger.error('Error en handleFacebookDownload:', error);
        return { success: false, message: `⚠️ Error al descargar de Facebook: ${error.message}` };
    }
}

export async function handleTwitterDownload(ctx) {
    const { args, sender } = ctx;
    const url = args.join(' ');
    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
        return { success: false, message: '❌ Uso incorrecto: /twitter [URL]' };
    }

    try {
        const result = await downloadTwitter(url);
        if (!result.success || (!result.video && !result.image)) {
            return { success: false, message: '⚠️ No se pudo descargar el contenido de Twitter/X.' };
        }

        const caption = `🐦 *Twitter/X ${result.type === 'video' ? 'Video' : 'Imagen'}*\n\n👤 *Autor:* @${result.author || 'N/D'}\n📝 *Tweet:* ${result.text || 'N/D'}\n\n✅ Solicitado por: @${sender.split('@')[0]}`;

        return {
            type: result.type,
            [result.type]: result.video || result.image,
            caption,
            mentions: [sender],
        };
    } catch (error) {
        logger.error('Error en handleTwitterDownload:', error);
        return { success: false, message: `⚠️ Error al descargar de Twitter/X: ${error.message}` };
    }
}

export async function handlePinterestDownload(ctx) {
    const { args, sender } = ctx;
    const url = args.join(' ');
    if (!url || !url.includes('pinterest.')) return { success: false, message: '❌ Uso: /pinterest [URL]' };

    try {
        const result = await downloadPinterest(url);
        if (!result.success || !result.image) return { success: false, message: '⚠️ No se pudo descargar la imagen.' };
        return {
            type: 'image',
            image: result.image,
            caption: `📌 *Pinterest*\n\n📝 *Título:* ${result.title || 'N/D'}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
            mentions: [sender],
        };
    } catch (e) {
        return { success: false, message: `⚠️ Error en Pinterest: ${e.message}` };
    }
}

export async function handleMusicDownload(ctx) {
    const { args, sender, sock, remoteJid } = ctx;
    const query = args.join(' ');
    if (!query) {
        return { success: false, message: '❌ Uso: /music [nombre o URL]' };
    }

    try {
        const result = await searchYouTubeMusic(query);
        if (!result.success || !result.results.length) {
            return { success: false, message: `😕 No encontré resultados para "${query}".` };
        }

        const video = result.results[0];

        const progress = createProgressNotifier({
            resolveSocket: async () => sock,
            chatId: remoteJid,
            title: '🎵 Descargando Música',
            icon: '📥',
            barLength: 20,
            animate: true
        });

        let lastProgress = 0;
        const downloadResult = await downloadYouTube(video.url, 'audio', (info) => {
            const percent = Math.floor(info?.percent || 0);
            if (percent > lastProgress) {
                lastProgress = percent;
                progress.update(percent, `Descargando: ${info?.speed || 'N/A'}\nTotal: ${info?.total || 'N/A'}`);
            }
        });

        if (!downloadResult.success || !downloadResult.download) {
            await progress.fail('No se pudo descargar el audio');
            return { success: false, message: '⚠️ Error al descargar el audio.' };
        }

        await progress.complete('✅ Descarga completada');

        return {
            type: 'audio',
            audio: downloadResult.download.url,
            caption: `*🎵 ${video.title}*\n\n*Canal:* ${video.author}\n*Duración:* ${video.duration}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
            mentions: [sender],
        };

    } catch (e) {
        logger.error(`Error en handleMusicDownload: ${e.message}`);
        return { success: false, message: `⚠️ Error en /music: ${e.message}` };
    }
}

export async function handleVideoDownload(ctx) {
    const { args, sender, sock, remoteJid } = ctx;
    const query = args.join(' ');
    if (!query) {
        return { success: false, message: '❌ Uso: /video [nombre o URL]' };
    }

    try {
        const result = await searchYouTubeMusic(query);
        if (!result.success || !result.results.length) {
            return { success: false, message: `😕 No encontré resultados para "${query}".` };
        }

        const video = result.results[0];

        const progress = createProgressNotifier({
            resolveSocket: async () => sock,
            chatId: remoteJid,
            title: '🎬 Descargando Video',
            icon: '📥',
            barLength: 20,
            animate: true
        });

        let lastProgress = 0;
        const downloadResult = await downloadYouTube(video.url, 'video', (info) => {
            const percent = Math.floor(info?.percent || 0);
            if (percent > lastProgress) {
                lastProgress = percent;
                progress.update(percent, `Descargando: ${info?.speed || 'N/A'}\nTotal: ${info?.total || 'N/A'}`);
            }
        });

        if (!downloadResult.success || !downloadResult.download) {
            await progress.fail('No se pudo descargar el video');
            return { success: false, message: '⚠️ Error al descargar el video.' };
        }

        await progress.complete('✅ Descarga completada');

        return {
            type: 'video',
            video: downloadResult.download.url,
            caption: `*🎬 ${video.title}*\n\n*Canal:* ${video.author}\n*Duración:* ${video.duration}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
            mentions: [sender],
        };

    } catch (e) {
        logger.error(`Error en handleVideoDownload: ${e.message}`);
        return { success: false, message: `⚠️ Error en /video: ${e.message}` };
    }
}

export async function handleSpotifySearch(ctx) {
    const { args, sender } = ctx;
    const query = args.join(' ');
    if (!query) {
        return { success: false, message: '❌ Uso: /spotify [nombre de canción]' };
    }

    try {
        const result = await searchSpotify(query);
        if (!result.success) {
            return { success: false, message: `😕 No encontré resultados para "${query}" en Spotify.` };
        }

        let audioUrl = null;
        try {
            const ytResult = await searchYouTubeMusic(`${result.title} ${result.artists}`);
            if (ytResult.success && ytResult.results.length) {
                const ytVideo = ytResult.results[0];
                const dlResult = await downloadYouTube(ytVideo.url, 'audio', () => {});
                if (dlResult.success) audioUrl = dlResult.download.url;
            }
        } catch (e) {
            logger.error('Error en el fallback de Spotify a YouTube:', e);
        }

        if (audioUrl) {
            return {
                type: 'spotify',
                image: result.cover_url,
                caption: `*${result.title}* - *${result.artists}*\n*Álbum:* ${result.album}\n\n✅ Solicitado por: @${sender.split('@')[0]}`,
                audio: audioUrl,
                mimetype: 'audio/mpeg',
                mentions: [sender]
            };
        } else {
            return { success: false, message: `*Título:* ${result.title}\n*Artista:* ${result.artists}\n*Álbum:* ${result.album}\n\n⚠️ No se pudo descargar el audio.` };
        }

    } catch (e) {
        logger.error(`Error en handleSpotifySearch: ${e.message}`);
        return { success: false, message: `⚠️ Error en /spotify: ${e.message}` };
    }
}

export async function handleTranslate(ctx) {
    const { args } = ctx;
    const lang = args.pop();
    const text = args.join(' ');
    if (!text || !lang) return { success: false, message: '❌ Uso: /translate [texto] [código de idioma]' };

    try {
        const result = await translateText(text, lang);
        if (!result.success) return { success: false, message: '⚠️ No se pudo traducir el texto.' };
        return { message: `🌐 *Traducción*\n\n*Original:* ${text}\n*Traducido (${lang}):* ${result.translatedText}` };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /translate: ${e.message}` };
    }
}

export async function handleWeather(ctx) {
    const { args } = ctx;
    const city = args.join(' ');
    if (!city) return { success: false, message: '❌ Uso: /weather [ciudad]' };

    try {
        const result = await getWeather(city);
        if (!result.success) return { success: false, message: `😕 No encontré el clima para "${city}".` };
        return { message: `🌤️ *Clima en ${result.city}*: ${result.temperature}°C, ${result.description}.` };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /weather: ${e.message}` };
    }
}

export async function handleQuote(ctx) {
    try {
        const result = await getRandomQuote();
        if (!result.success) return { success: false, message: '⚠️ No pude obtener una frase.' };
        return { message: `"${result.quote}"\n- ${result.author}` };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /quote: ${e.message}` };
    }
}

export async function handleFact(ctx) {
    try {
        const result = await getRandomFact();
        if (!result.success) return { success: false, message: '⚠️ No pude obtener un dato curioso.' };
        return { message: `🤓 *Dato Curioso:* ${result.fact}` };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /fact: ${e.message}` };
    }
}

export async function handleTriviaCommand(ctx) {
    try {
        const result = await getTrivia();
        if (!result.success) return { success: false, message: '⚠️ No pude obtener una pregunta de trivia.' };
        return { message: `❓ *Trivia:* ${result.question}\n\n*Respuesta:* ||${result.correct_answer}||` };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /trivia: ${e.message}` };
    }
}

export async function handleMemeCommand(ctx) {
    try {
        const result = await getRandomMeme();
        if (!result.success) return { success: false, message: '⚠️ No pude obtener un meme.' };
        return {
            type: 'image',
            image: { url: result.image },
            caption: `😂 *${result.title}*`,
        };
    } catch (e) {
        return { success: false, message: `⚠️ Error en /meme: ${e.message}` };
    }
}
