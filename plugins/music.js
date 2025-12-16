// plugins/music.js
// Sistema de música avanzado - Reproductor, playlists, identificación, etc.

import fs from 'fs'
import path from 'path'

// Importaciones opcionales para música avanzada
let mm, NodeID3, ytsr;

try {
  mm = await import('music-metadata');
} catch (e) {
  console.log('⚠️ music-metadata no disponible, usando análisis básico');
}

try {
  NodeID3 = (await import('node-id3')).default;
} catch (e) {
  console.log('⚠️ node-id3 no disponible, sin manipulación de tags');
}

try {
  ytsr = (await import('ytsr')).default;
} catch (e) {
  console.log('⚠️ ytsr no disponible, búsquedas limitadas');
}

// Funcionalidad Wileys: Reacciones automáticas para música
const addMusicReaction = async (sock, message, emoji = '🎵') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[MUSIC_REACTION] Error:', error);
  }
};

// Base de datos simulada para playlists (en producción sería una DB real)
const groupPlaylists = new Map();
const userPlaylists = new Map();

// Identificación real de música usando metadatos
const identifySong = async (audioBuffer) => {
  try {
    if (!mm) {
      return {
        title: 'Audio sin identificar',
        artist: 'Desconocido',
        album: 'Desconocido',
        year: 'Desconocido',
        identified: false,
        error: 'music-metadata no disponible'
      };
    }

    // Analizar metadatos del archivo de audio
    const metadata = await mm.parseBuffer(audioBuffer);

    if (metadata.common.title && metadata.common.artist) {
      return {
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album || 'Desconocido',
        year: metadata.common.year || 'Desconocido',
        duration: metadata.format.duration ? Math.floor(metadata.format.duration) : 0,
        genre: metadata.common.genre ? metadata.common.genre.join(', ') : 'Desconocido',
        bitrate: metadata.format.bitrate || 'Desconocido'
      };
    }

    // Si no hay metadatos, intentar identificación por características de audio
    const audioInfo = {
      duration: metadata.format.duration ? Math.floor(metadata.format.duration) : 0,
      bitrate: metadata.format.bitrate || 'Desconocido',
      sampleRate: metadata.format.sampleRate || 'Desconocido',
      channels: metadata.format.numberOfChannels || 'Desconocido'
    };

    return {
      title: 'Audio sin identificar',
      artist: 'Desconocido',
      album: 'Desconocido',
      year: 'Desconocido',
      ...audioInfo,
      identified: false
    };
  } catch (error) {
    console.error('Error identificando audio:', error);
    return null;
  }
};

// Búsqueda real de letras usando APIs públicas
const getLyrics = async (title, artist) => {
  try {
    if (!ytsr) {
      return `🎵 *${title}* - ${artist}\n\n⚠️ Búsqueda de letras no disponible.\n\n💡 Instala ytsr para habilitar búsquedas: npm install ytsr`;
    }

    // Buscar en YouTube para obtener información adicional
    const searchQuery = `${title} ${artist} lyrics`;
    const searchResults = await ytsr(searchQuery, { limit: 1 });

    if (searchResults.items.length > 0) {
      const video = searchResults.items[0];

      // En un entorno real, aquí se conectaría a APIs como:
      // - Genius API
      // - LyricFind API
      // - Musixmatch API
      // Por ahora, proporcionamos información del video encontrado

      return `🎵 *${title}* - ${artist}\n\n📺 **Video encontrado:**\n• Título: ${video.title}\n• Canal: ${video.author?.name || 'Desconocido'}\n• Duración: ${video.duration || 'Desconocida'}\n• Vistas: ${video.views ? video.views.toLocaleString() : 'Desconocidas'}\n• URL: ${video.url}\n\n💡 *Nota:* Para obtener las letras completas, se requiere integración con APIs especializadas como Genius o Musixmatch.\n\n🔗 Puedes buscar las letras manualmente en el video encontrado.`;
    }

    return `🎵 *${title}* - ${artist}\n\n❌ No se encontraron resultados para esta canción.\n\n💡 *Sugerencia:* Verifica que el título y artista estén escritos correctamente.`;
  } catch (error) {
    console.error('Error buscando letras:', error);
    return `🎵 *${title}* - ${artist}\n\n⚠️ Error al buscar letras. Intenta más tarde.`;
  }
};

export async function identify(ctx) {
  const { sock, message, remoteJid } = ctx;

  await addMusicReaction(sock, message, '🎵');

  // Verificar si hay audio en el mensaje
  const audioMessage = message?.message?.audioMessage;
  if (!audioMessage) {
    return {
      success: false,
      message: '❌ Responde a un mensaje de audio con /identify para identificar la canción\n\n💡 *Tip:* Envía o reenvía un audio y usa /identify'
    };
  }

  try {
    // Mostrar estado de procesamiento
    await sock.sendPresenceUpdate('composing', remoteJid);

    // Descargar el archivo de audio
    const audioBuffer = await sock.downloadMediaMessage(message);

    if (!audioBuffer) {
      return {
        success: false,
        message: '❌ No se pudo descargar el archivo de audio'
      };
    }

    // Identificar usando metadatos reales
    const song = await identifySong(audioBuffer);

    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', remoteJid);
    }, 2000);

    if (!song) {
      return {
        success: false,
        message: '❌ No se pudo procesar el archivo de audio'
      };
    }

    if (song.identified === false) {
      return {
        success: true,
        message: `🎵 *Análisis de Audio*\n\n📊 **Información técnica:**\n• Duración: ${song.duration ? `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}` : 'Desconocida'}\n• Bitrate: ${song.bitrate} kbps\n• Sample Rate: ${song.sampleRate} Hz\n• Canales: ${song.channels}\n\n❌ **No se encontraron metadatos de identificación**\n\n💡 *Tip:* El archivo no contiene información de título/artista. Para mejor identificación, usa archivos con metadatos completos.`
      };
    }

    const durationStr = song.duration ? `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}` : 'Desconocida';

    return {
      success: true,
      message: `🎵 *Canción Identificada*\n\n🎧 **Título:** ${song.title}\n👤 **Artista:** ${song.artist}\n💿 **Álbum:** ${song.album}\n📅 **Año:** ${song.year}\n⏱️ **Duración:** ${durationStr}\n🎼 **Género:** ${song.genre}\n📊 **Bitrate:** ${song.bitrate} kbps\n\n✅ *Identificado por metadatos*\n\n💡 Usa */lyrics ${song.title} ${song.artist}* para buscar la letra`
    };
  } catch (error) {
    console.error('Error identificando canción:', error);
    return {
      success: false,
      message: '❌ Error procesando el archivo de audio. Asegúrate de que sea un archivo de audio válido.'
    };
  }
}

export async function lyrics(ctx) {
  const { args, sock, message, remoteJid } = ctx;

  if (args.length < 2) {
    return {
      success: false,
      message: '❌ Uso: /lyrics <título> <artista>\nEjemplo: /lyrics Despacito Luis Fonsi'
    };
  }

  await addMusicReaction(sock, message, '📝');

  const title = args[0];
  const artist = args.slice(1).join(' ');

  try {
    await sock.sendPresenceUpdate('composing', remoteJid);

    const lyricsText = await getLyrics(title, artist);

    return {
      success: true,
      message: lyricsText
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ No se encontraron letras para "${title}" de ${artist}`
    };
  }
}

export async function playlist(ctx) {
  const { args, sock, message, remoteJid, sender, isGroup } = ctx;
  const action = args[0]?.toLowerCase();

  await addMusicReaction(sock, message, '📋');

  if (!action || !['create', 'add', 'remove', 'list', 'play', 'delete'].includes(action)) {
    return {
      success: true,
      message: `📋 *Gestión de Playlists*\n\n*Comandos disponibles:*\n/playlist create <nombre> - Crear playlist\n/playlist add <nombre> <canción> - Agregar canción\n/playlist remove <nombre> <índice> - Quitar canción\n/playlist list [nombre] - Ver playlists o canciones\n/playlist play <nombre> - Reproducir playlist\n/playlist delete <nombre> - Eliminar playlist\n\n*Ejemplo:*\n/playlist create MiFavorita\n/playlist add MiFavorita Despacito - Luis Fonsi`
    };
  }

  const playlistName = args[1];
  const playlistKey = isGroup ? `group_${remoteJid}` : `user_${sender}`;
  const storage = isGroup ? groupPlaylists : userPlaylists;

  if (!storage.has(playlistKey)) {
    storage.set(playlistKey, new Map());
  }

  const userPlaylists = storage.get(playlistKey);

  switch (action) {
    case 'create':
      if (!playlistName) {
        return { success: false, message: '❌ Especifica el nombre de la playlist\nEjemplo: /playlist create MiFavorita' };
      }

      if (userPlaylists.has(playlistName)) {
        return { success: false, message: `❌ La playlist "${playlistName}" ya existe` };
      }

      userPlaylists.set(playlistName, []);
      return {
        success: true,
        message: `✅ Playlist "${playlistName}" creada exitosamente\n\n💡 Usa */playlist add ${playlistName} <canción>* para agregar música`
      };

    case 'add':
      if (!playlistName) {
        return { success: false, message: '❌ Especifica el nombre de la playlist' };
      }

      if (!userPlaylists.has(playlistName)) {
        return { success: false, message: `❌ La playlist "${playlistName}" no existe` };
      }

      const songToAdd = args.slice(2).join(' ');
      if (!songToAdd) {
        return { success: false, message: '❌ Especifica la canción a agregar\nEjemplo: /playlist add MiFavorita Despacito - Luis Fonsi' };
      }

      const playlist = userPlaylists.get(playlistName);
      playlist.push({
        title: songToAdd,
        addedBy: sender,
        addedAt: new Date().toISOString()
      });

      return {
        success: true,
        message: `✅ "${songToAdd}" agregada a "${playlistName}"\n📊 Total de canciones: ${playlist.length}`
      };

    case 'list':
      if (!playlistName) {
        // Listar todas las playlists
        const playlists = Array.from(userPlaylists.keys());
        if (playlists.length === 0) {
          return { success: true, message: '📋 No tienes playlists creadas\n\n💡 Usa */playlist create <nombre>* para crear una' };
        }

        let message = `📋 *${isGroup ? 'Playlists del Grupo' : 'Tus Playlists'}*\n\n`;
        playlists.forEach((name, index) => {
          const songs = userPlaylists.get(name);
          message += `${index + 1}. **${name}** (${songs.length} canciones)\n`;
        });
        message += '\n💡 Usa */playlist list <nombre>* para ver las canciones';

        return { success: true, message };
      } else {
        // Listar canciones de una playlist específica
        if (!userPlaylists.has(playlistName)) {
          return { success: false, message: `❌ La playlist "${playlistName}" no existe` };
        }

        const songs = userPlaylists.get(playlistName);
        if (songs.length === 0) {
          return { success: true, message: `📋 La playlist "${playlistName}" está vacía\n\n💡 Usa */playlist add ${playlistName} <canción>* para agregar música` };
        }

        let message = `📋 *Playlist: ${playlistName}*\n\n`;
        songs.forEach((song, index) => {
          message += `${index + 1}. ${song.title}\n`;
        });
        message += `\n📊 Total: ${songs.length} canciones`;

        return { success: true, message };
      }

    case 'remove':
      if (!playlistName) {
        return { success: false, message: '❌ Especifica el nombre de la playlist' };
      }

      if (!userPlaylists.has(playlistName)) {
        return { success: false, message: `❌ La playlist "${playlistName}" no existe` };
      }

      const indexToRemove = parseInt(args[2]) - 1;
      if (isNaN(indexToRemove)) {
        return { success: false, message: '❌ Especifica el número de la canción a quitar\nEjemplo: /playlist remove MiFavorita 1' };
      }

      const playlistToModify = userPlaylists.get(playlistName);
      if (indexToRemove < 0 || indexToRemove >= playlistToModify.length) {
        return { success: false, message: `❌ Número inválido. La playlist tiene ${playlistToModify.length} canciones` };
      }

      const removedSong = playlistToModify.splice(indexToRemove, 1)[0];
      return {
        success: true,
        message: `✅ "${removedSong.title}" eliminada de "${playlistName}"\n📊 Canciones restantes: ${playlistToModify.length}`
      };

    case 'play':
      if (!playlistName) {
        return { success: false, message: '❌ Especifica el nombre de la playlist a reproducir' };
      }

      if (!userPlaylists.has(playlistName)) {
        return { success: false, message: `❌ La playlist "${playlistName}" no existe` };
      }

      const playlistToPlay = userPlaylists.get(playlistName);
      if (playlistToPlay.length === 0) {
        return { success: false, message: `❌ La playlist "${playlistName}" está vacía` };
      }

      // Simular reproducción
      const randomSong = playlistToPlay[Math.floor(Math.random() * playlistToPlay.length)];
      return {
        success: true,
        message: `🎵 *Reproduciendo Playlist: ${playlistName}*\n\n▶️ Ahora suena: ${randomSong.title}\n📊 ${playlistToPlay.length} canciones en cola\n\n💡 *Nota:* Esta es una simulación. En producción se integraría con servicios de streaming.`
      };

    case 'delete':
      if (!playlistName) {
        return { success: false, message: '❌ Especifica el nombre de la playlist a eliminar' };
      }

      if (!userPlaylists.has(playlistName)) {
        return { success: false, message: `❌ La playlist "${playlistName}" no existe` };
      }

      userPlaylists.delete(playlistName);
      return {
        success: true,
        message: `✅ Playlist "${playlistName}" eliminada exitosamente`
      };

    default:
      return { success: false, message: '❌ Acción no válida' };
  }
}

export async function radio(ctx) {
  const { args, sock, message } = ctx;
  const station = args[0]?.toLowerCase();

  await addMusicReaction(sock, message, '📻');

  const stations = {
    'pop': { name: 'Pop Hits', genre: 'Pop', country: 'Global' },
    'rock': { name: 'Rock Classics', genre: 'Rock', country: 'Global' },
    'jazz': { name: 'Smooth Jazz', genre: 'Jazz', country: 'Global' },
    'reggaeton': { name: 'Reggaeton Hits', genre: 'Reggaeton', country: 'Latino' },
    'electronic': { name: 'Electronic Beats', genre: 'Electronic', country: 'Global' },
    'classical': { name: 'Classical Music', genre: 'Clásica', country: 'Global' },
    'country': { name: 'Country Roads', genre: 'Country', country: 'USA' },
    'hip-hop': { name: 'Hip Hop Central', genre: 'Hip Hop', country: 'Global' }
  };

  if (!station) {
    let stationList = '📻 *Radio Online*\n\n*Estaciones disponibles:*\n\n';
    Object.entries(stations).forEach(([key, info]) => {
      stationList += `🎵 */radio ${key}* - ${info.name} (${info.genre})\n`;
    });
    stationList += '\n💡 Ejemplo: /radio pop';

    return { success: true, message: stationList };
  }

  if (!stations[station]) {
    return { success: false, message: '❌ Estación no encontrada. Usa */radio* para ver las disponibles.' };
  }

  const stationInfo = stations[station];

  return {
    success: true,
    message: `📻 *Radio Online*\n\n🎵 *Estación:* ${stationInfo.name}\n🎼 *Género:* ${stationInfo.genre}\n🌍 *Región:* ${stationInfo.country}\n\n▶️ *Estado:* Reproduciendo...\n🎧 *Calidad:* 320kbps\n\n💡 *Nota:* Esta es una simulación. En producción se conectaría a servicios de radio online como TuneIn o Radio.com.`
  };
}

export async function nowplaying(ctx) {
  const { sock, message } = ctx;

  await addMusicReaction(sock, message, '🎵');

  // Simulación de "ahora reproduciendo"
  const currentSongs = [
    { title: 'Flowers', artist: 'Miley Cyrus', album: 'Endless Summer Vacation', duration: '3:20', progress: '1:45' },
    { title: 'Anti-Hero', artist: 'Taylor Swift', album: 'Midnights', duration: '3:20', progress: '2:10' },
    { title: 'As It Was', artist: 'Harry Styles', album: "Harry's House", duration: '2:47', progress: '1:30' },
    { title: 'Unholy', artist: 'Sam Smith ft. Kim Petras', album: 'Gloria', duration: '2:36', progress: '0:45' }
  ];

  const current = currentSongs[Math.floor(Math.random() * currentSongs.length)];
  const progressBar = '▓▓▓▓▓░░░░░';

  return {
    success: true,
    message: `🎵 *Ahora Reproduciendo*\n\n🎧 *${current.title}*\n👤 ${current.artist}\n💿 ${current.album}\n\n⏱️ ${current.progress} / ${current.duration}\n${progressBar}\n\n⏯️ Pausar | ⏭️ Siguiente | 🔀 Aleatorio\n\n💡 *Nota:* Esta es una simulación del reproductor.`
  };
}

export async function musichelp(ctx) {
  const { sock, message } = ctx;

  await addMusicReaction(sock, message, '🎵');

  return {
    success: true,
    message: `🎵 *SISTEMA DE MÚSICA AVANZADO*\n\n🎧 */identify* - Identificar canción (responde a audio)\n📝 */lyrics* <título> <artista> - Obtener letras\n📋 */playlist* <acción> - Gestionar playlists\n📻 */radio* [estación] - Radio online\n🎵 */nowplaying* - Canción actual\n\n*Gestión de Playlists:*\n• create <nombre> - Crear playlist\n• add <nombre> <canción> - Agregar canción\n• list [nombre] - Ver playlists/canciones\n• play <nombre> - Reproducir playlist\n• remove <nombre> <índice> - Quitar canción\n• delete <nombre> - Eliminar playlist\n\n💡 *Ejemplos:*\n/identify (responde a audio)\n/lyrics Despacito Luis Fonsi\n/playlist create MiFavorita\n/radio pop`
  };
}

export default {
  identify,
  lyrics,
  playlist,
  radio,
  nowplaying,
  musichelp
};
