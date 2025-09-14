import axios from 'axios';
import yts from 'yt-search';
import ytdl from 'ytdl-core';
import { finished } from 'stream/promises';

/**
 * Handle the /music command to search and download music
 * @param {string} query - The search query
 * @param {string} usuario - The user who sent the command
 * @param {string} jid - Chat where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleMusic(query, usuario, jid, fecha) {
  try {
    console.log(`🎵 Comando /music recibido de ${usuario}: "${query}"`);
    
    if (!query) {
      return { 
        success: true, 
        message: `╭─❍「 🎵 KONMI Music ✦ 」
│
├─ ¡KONMI aquí! 🎶
├─ Dame el nombre de una canción o artista
├─ y te traeré la música que necesitas~ ♡
│
├─ Ejemplos:
│   ⇝ .music bad bunny
│   ⇝ .music despacito
│   ⇝ .music https://youtube.com/watch?v=...
│
╰─✦` 
      };
    }

    const res = await yts(query);
    if (!res || !res.videos || res.videos.length === 0) {
      return { 
        success: true, 
        message: `╭─❍「 🎵 KONMI Music ✦ 」
│
├─ No encontré esa canción, KONMI lo siente 😔
├─ Intenta con otro nombre o artista
├─ que seguro te encantará~ ♡
╰─✦` 
      };
    }

    const video = res.videos[0];
    const videoUrl = video.url;
    const videoTitle = video.title;
    const videoDuration = video.duration;
    const videoViews = video.views;
    const videoAuthor = video.author?.name || 'Desconocido';

    // Obtener socket de WhatsApp para enviar mensajes
    const { getSocket } = await import('./whatsapp.js');
    const sock = getSocket();

    // Mensaje inicial
    let progressText = `╭─❍「 🎵 *${videoTitle}* ✦ 」\n│\n├─ 👤 *Artista:* ${videoAuthor}\n├─ ⏱️ *Duración:* ${videoDuration}\n├─ 👀 *Vistas:* ${videoViews}\n├─ 🔗 *URL:* ${videoUrl}\n│\n├─ Descarga en progreso: 0%\n╰─✦`;
    const progressMsg = await sock.sendMessage(jid, { text: progressText });

    // Descargar audio con progreso
    const chunks = [];
    const stream = ytdl(videoUrl, { quality: 'highestaudio' });
    stream.on('progress', (chunkLen, downloaded, total) => {
      const percent = total ? (downloaded / total) * 100 : 0;
      const barLen = 20;
      const filled = Math.round((barLen * percent) / 100);
      const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
      progressText = `╭─❍「 🎵 *${videoTitle}* ✦ 」\n│\n├─ 👤 *Artista:* ${videoAuthor}\n├─ ⏱️ *Duración:* ${videoDuration}\n├─ 👀 *Vistas:* ${videoViews}\n├─ 🔗 *URL:* ${videoUrl}\n│\n├─ Descarga: ${bar} ${percent.toFixed(0)}%\n╰─✦`;
      sock.sendMessage(jid, { text: progressText }, { edit: progressMsg.key });
    });

    stream.on('data', (chunk) => chunks.push(chunk));
    await finished(stream);
    const audioBuffer = Buffer.concat(chunks);

    await sock.sendMessage(
      jid,
      { audio: audioBuffer, mimetype: 'audio/mpeg', fileName: `${videoTitle}.mp3` },
      { quoted: progressMsg }
    );

    progressText = `╭─❍「 🎵 *${videoTitle}* ✦ 」\n│\n├─ 👤 *Artista:* ${videoAuthor}\n├─ ⏱️ *Duración:* ${videoDuration}\n├─ 👀 *Vistas:* ${videoViews}\n├─ 🔗 *URL:* ${videoUrl}\n│\n├─ Descarga: completada ✅\n╰─✦`;
    await sock.sendMessage(jid, { text: progressText }, { edit: progressMsg.key });

    return { success: true };
  } catch (error) {
    console.error('Error en music:', error);
    return { 
      success: false, 
      message: `╭─❍「 ❌ Error ✦ 」
│
├─ Oops! Algo salió mal, KONMI 😅
├─ Intenta de nuevo en un momento
├─ o prueba con otra canción~ ♡
╰─✦` 
    };
  }
}

/**
 * Handle the /meme command to get random memes
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleMeme(usuario, grupo, fecha) {
  try {
    console.log(`😂 Comando /meme recibido de ${usuario}`);
    
    const res = await axios.get('https://meme-api.com/gimme');
    const memeData = res.data;
    
    if (!memeData || !memeData.url) {
      return { 
        success: true, 
        message: '❌ No se pudo obtener el meme, KONMI lo siente 😔'
      };
    }

    return { 
      success: true, 
      message: `╭─❍「 😂 Meme de KONMI ✦ 」
│
├─ *${memeData.title}*
├─ 📊 Upvotes: ${memeData.ups}
├─ 🔗 Subreddit: r/${memeData.subreddit}
│
╰─✦`,
      media: {
        type: 'image',
        url: memeData.url,
        caption: memeData.title
      }
    };
  } catch (error) {
    console.error('Error en meme:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener meme*' 
    };
  }
}

/**
 * Handle the /wallpaper command to get wallpapers
 * @param {string} query - The search query
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleWallpaper(query, usuario, grupo, fecha) {
  try {
    console.log(`🖼️ Comando /wallpaper recibido de ${usuario}: "${query}"`);
    
    if (!query) {
      return { 
        success: true, 
        message: `╭─❍「 🖼️ KONMI Wallpapers ✦ 」
│
├─ ¡KONMI aquí! 🎨
├─ Dame el tema del wallpaper que quieres
├─ y te traeré algo hermoso~ ♡
│
├─ Ejemplos:
│   ⇝ .wallpaper anime
│   ⇝ .wallpaper nature
│   ⇝ .wallpaper cars
│
╰─✦` 
      };
    }

    // Usar Picsum para wallpapers (API gratuita sin key)
    const res = await axios.get(`https://picsum.photos/800/600?random=${Date.now()}`);
    
    return { 
      success: true, 
      message: `╭─❍「 🖼️ *${query}* Wallpaper ✦ 」
│
├─ 📸 *Tema:* ${query}
├─ 🎨 *Estilo:* Aleatorio
├─ 📱 *Resolución:* 800x600
│
├─ 💫 *Wallpaper de KONMI*
╰─✦`,
      media: {
        type: 'image',
        url: res.request.res.responseUrl,
        caption: `Wallpaper de ${query}`
      }
    };
  } catch (error) {
    console.error('Error en wallpaper:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener wallpaper*' 
    };
  }
}

/**
 * Handle the /joke command to get random jokes
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleJoke(usuario, grupo, fecha) {
  try {
    console.log(`😄 Comando /joke recibido de ${usuario}`);
    
    const res = await axios.get('https://v2.jokeapi.dev/joke/Any?lang=es');
    const jokeData = res.data;
    
    if (!jokeData || jokeData.error) {
      return { 
        success: true, 
        message: '❌ No se pudo obtener el chiste, KONMI lo siente 😔'
      };
    }

    let jokeText = '';
    if (jokeData.type === 'single') {
      jokeText = jokeData.joke;
    } else {
      jokeText = `${jokeData.setup}\n\n${jokeData.delivery}`;
    }

    return { 
      success: true, 
      message: `╭─❍「 😄 Chiste de KONMI ✦ 」
│
├─ ${jokeText}
│
├─ 🏷️ *Categoría:* ${jokeData.category}
├─ 🔞 *NSFW:* ${jokeData.flags.nsfw ? 'Sí' : 'No'}
│
╰─✦` 
    };
  } catch (error) {
    console.error('Error en joke:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener chiste*' 
    };
  }
}

export {
  handleMusic,
  handleMeme,
  handleWallpaper,
  handleJoke
};
