import db from './db.js';
import axios from 'axios';
import yts from 'yt-search';
import ytdl from 'ytdl-core';

/**
 * Handle the /music command to search and download music
 * @param {string} query - The search query
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleMusic(query, usuario, grupo, fecha) {
  try {
    console.log(`🎵 Comando /music recibido de ${usuario}: "${query}"`);
    
    if (!query) {
      return { 
        success: true, 
        message: `╭─❍「 🎵 Melodia Music ✦ 」
│
├─ ¡Melodia aquí! 🎶
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
        message: `╭─❍「 🎵 Melodia Music ✦ 」
│
├─ No encontré esa canción melodia 😔
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
    const videoThumbnail = video.thumbnail;

    return { 
      success: true, 
      message: `╭─❍「 🎵 *${videoTitle}* ✦ 」
│
├─ 🎶 *Duración:* ${videoDuration}
├─ 👀 *Vistas:* ${videoViews}
├─ 🔗 *URL:* ${videoUrl}
│
├─ Melodia descargando audio... ⏳
╰─✦`,
      media: {
        type: 'audio',
        url: videoUrl,
        thumbnail: videoThumbnail,
        title: videoTitle
      }
    };
  } catch (error) {
    console.error('Error en music:', error);
    return { 
      success: false, 
      message: `╭─❍「 ❌ Error ✦ 」
│
├─ Oops! Algo salió mal melodia 😅
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
        message: '❌ No se pudo obtener el meme, melodia lo siente 😔' 
      };
    }

    return { 
      success: true, 
      message: `╭─❍「 😂 Meme de Melodia ✦ 」
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
        message: `╭─❍「 🖼️ Melodia Wallpapers ✦ 」
│
├─ ¡Melodia aquí! 🎨
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
├─ 💫 *Wallpaper de Melodia*
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
        message: '❌ No se pudo obtener el chiste, melodia lo siente 😔' 
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
      message: `╭─❍「 😄 Chiste de Melodia ✦ 」
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
