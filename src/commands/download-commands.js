// commands/download-commands.js
// Comandos de descarga con fallbacks robustos y logs detallados

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
} from '../utils/utils/api-providers.js'
import logger from '../config/logger.js'
import { createProgressNotifier } from '../utils/utils/progress-notifier.js'

/* ===== Sistema de Logs para Download Commands ===== */
const LOG_COLORS = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[34m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  SUCCESS: '\x1b[32m',
  DOWNLOAD: '\x1b[35m',
  RESET: '\x1b[0m'
}

const LOG_ICONS = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  SUCCESS: '✅',
  DOWNLOAD: '⬇️'
}

function logDownload(level, command, message, data = null) {
  const timestamp = new Date().toISOString()
  const color = LOG_COLORS[level] || LOG_COLORS.RESET
  const icon = LOG_ICONS[level] || '•'
  const reset = LOG_COLORS.RESET

  let logMsg = `${color}${icon} [${timestamp}] [DOWNLOAD:${command}] ${message}${reset}`

  if (data) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
    logMsg += `\n${color}${dataStr}${reset}`
  }

  console.log(logMsg)
}

const toMediaInput = (val) => {
  if (!val) return null
  if (Buffer.isBuffer(val)) return val
  if (typeof val === 'string') return { url: val }
  if (val?.url) return { url: val.url }
  return null
}

const mentionSender = (sender) => [`${sender}`]
const senderTag = (sender) => `@${String(sender || '').split('@')[0]}`

// ============================================================
// FUNCIONES DE MANEJO DE DESCARGAS
// ============================================================

async function handleTikTokDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  logDownload('INFO', 'TIKTOK', 'Starting TikTok download', {
    url: url?.substring(0, 50),
    sender: senderTag(sender)
  })

  if (!url || !url.includes('tiktok.com')) {
    logDownload('WARN', 'TIKTOK', 'Invalid URL provided')
    return { success: false, message: 'Uso: /tiktok <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando TikTok',
    icon: '🎵',
  })

  try {
    await progress.update(10, 'Conectando...')
    const result = await downloadTikTok(url)

    logDownload('DEBUG', 'TIKTOK', 'Download result received', {
      success: result.success,
      hasVideo: !!result.video
    })

    if (!result.success || !result.video) throw new Error('No se pudo obtener el video')
    await progress.complete('Listo')

    logDownload('SUCCESS', 'TIKTOK', 'Download completed successfully')

    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: `TikTok\nAutor: ${result.author || 'N/D'}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'TIKTOK', 'Download failed', {
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 3).join('\n')
    })

    logger.error('handleTikTokDownload', e)
    await progress.fail(e.message)
    return { success: false, message: `Error TikTok: ${e.message}` }
  }
}

async function handleInstagramDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  logDownload('INFO', 'INSTAGRAM', 'Starting Instagram download', {
    url: url?.substring(0, 50)
  })

  if (!url || !url.includes('instagram.com')) {
    logDownload('WARN', 'INSTAGRAM', 'Invalid URL provided')
    return { success: false, message: 'Uso: /instagram <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Instagram',
    icon: '📸',
  })

  try {
    await progress.update(10, 'Conectando...')
    const result = await downloadInstagram(url)

    logDownload('DEBUG', 'INSTAGRAM', 'Download result received', {
      success: result.success,
      type: result.type,
      hasMedia: !!(result.image || result.video)
    })

    if (!result.success || (!result.image && !result.video)) throw new Error('Contenido no disponible')
    await progress.complete('Listo')

    const type = result.type === 'video' ? 'video' : (result.video ? 'video' : 'image')
    const media = toMediaInput(result.video || result.image || result.url)

    logDownload('SUCCESS', 'INSTAGRAM', 'Download completed successfully', { type })

    return {
      type,
      [type]: media,
      caption: `Instagram\nAutor: ${result.author || 'N/D'}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'INSTAGRAM', 'Download failed', { error: e.message })
    logger.error('handleInstagramDownload', e)
    await progress.fail(e.message)
    return { success: false, message: `Error Instagram: ${e.message}` }
  }
}

async function handleFacebookDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')

  logDownload('INFO', 'FACEBOOK', 'Starting Facebook download', {
    url: url?.substring(0, 50)
  })

  if (!url || !url.includes('facebook.com')) {
    logDownload('WARN', 'FACEBOOK', 'Invalid URL provided')
    return { success: false, message: 'Uso: /facebook <url>' }
  }

  try {
    const result = await downloadFacebook(url)

    logDownload('DEBUG', 'FACEBOOK', 'Download result received', {
      success: result.success,
      hasVideo: !!result.video
    })

    if (!result.success || !result.video) throw new Error('No se pudo descargar')

    logDownload('SUCCESS', 'FACEBOOK', 'Download completed successfully')

    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: `Facebook\n${result.title || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'FACEBOOK', 'Download failed', { error: e.message })
    logger.error('handleFacebookDownload', e)
    return { success: false, message: `Error Facebook: ${e.message}` }
  }
}

async function handleTwitterDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')

  logDownload('INFO', 'TWITTER', 'Starting Twitter/X download', {
    url: url?.substring(0, 50)
  })

  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    logDownload('WARN', 'TWITTER', 'Invalid URL provided')
    return { success: false, message: 'Uso: /twitter <url>' }
  }

  try {
    const result = await downloadTwitter(url)

    logDownload('DEBUG', 'TWITTER', 'Download result received', {
      success: result.success,
      hasVideo: !!result.video,
      hasImage: !!result.image
    })

    if (!result.success || (!result.video && !result.image)) throw new Error('No se pudo descargar')
    const type = result.video ? 'video' : 'image'

    logDownload('SUCCESS', 'TWITTER', 'Download completed successfully', { type })

    return {
      type,
      [type]: toMediaInput(result.video || result.image),
      caption: `Twitter/X\n${result.text || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'TWITTER', 'Download failed', { error: e.message })
    logger.error('handleTwitterDownload', e)
    return { success: false, message: `Error Twitter/X: ${e.message}` }
  }
}

async function handlePinterestDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')

  logDownload('INFO', 'PINTEREST', 'Starting Pinterest download', {
    url: url?.substring(0, 50)
  })

  if (!url || !url.includes('pinterest.')) {
    logDownload('WARN', 'PINTEREST', 'Invalid URL provided')
    return { success: false, message: 'Uso: /pinterest <url>' }
  }

  try {
    const result = await downloadPinterest(url)

    logDownload('DEBUG', 'PINTEREST', 'Download result received', {
      success: result.success,
      hasImage: !!result.image
    })

    if (!result.success || !result.image) throw new Error('No se pudo descargar')

    logDownload('SUCCESS', 'PINTEREST', 'Download completed successfully')

    return {
      type: 'image',
      image: toMediaInput(result.image),
      caption: `Pinterest\n${result.title || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'PINTEREST', 'Download failed', { error: e.message })
    return { success: false, message: `Error Pinterest: ${e.message}` }
  }
}

async function handleMusicDownload(ctx) {
  const { args, sender, sock, remoteJid } = ctx
  const query = args.join(' ')

  logDownload('INFO', 'MUSIC', 'Starting music download', {
    query: query?.substring(0, 50),
    sender: senderTag(sender)
  })

  if (!query) {
    logDownload('WARN', 'MUSIC', 'No query provided')
    return { success: false, message: 'Uso: /music <nombre o url>' }
  }

  try {
    logDownload('DEBUG', 'MUSIC', 'Searching YouTube Music')
    const search = await searchYouTubeMusic(query)

    logDownload('DEBUG', 'MUSIC', 'Search completed', {
      success: search.success,
      resultsCount: search.results?.length || 0
    })

    if (!search.success || !search.results.length) {
      logDownload('WARN', 'MUSIC', 'No results found', { query })
      return { success: false, message: `No hay resultados para "${query}"` }
    }

    const video = search.results[0]

    logDownload('INFO', 'MUSIC', 'Found video', {
      title: video.title,
      url: video.url,
      duration: video.duration
    })

    const progress = createProgressNotifier({
      resolveSocket: () => Promise.resolve(sock),
      chatId: remoteJid,
      title: 'Descargando música',
      icon: '🎵',
    })

    await progress.update(5, 'Conectando...')

    logDownload('DEBUG', 'MUSIC', 'Starting YouTube download', { url: video.url })

    const dl = await downloadYouTube(video.url, 'audio', (p) => {
      if (p?.percent) {
        const percent = Math.min(95, Math.floor(p.percent))
        logDownload('DEBUG', 'MUSIC', `Download progress: ${percent}%`)
        progress.update(percent, 'Descargando...').catch(() => {})
      }
    })

    logDownload('DEBUG', 'MUSIC', 'Download completed', {
      success: dl.success,
      hasDownload: !!dl.download
    })

    if (!dl.success || !dl.download) {
      throw new Error('Descarga fallida')
    }

    const audioInput = toMediaInput(dl.download)
    if (!audioInput) {
      logDownload('ERROR', 'MUSIC', 'Invalid audio format')
      throw new Error('Formato de audio no válido')
    }

    await progress.complete('Listo')

    logDownload('SUCCESS', 'MUSIC', 'Music download completed successfully', {
      title: video.title,
      quality: dl.quality
    })

    return {
      type: 'audio',
      audio: audioInput,
      mimetype: 'audio/mpeg',
      caption: `🎵 ${video.title}\nCanal: ${video.author}\nDuración: ${video.duration}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'MUSIC', 'Music download failed', {
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 5).join('\n')
    })

    logger.error('handleMusicDownload', e)
    return { success: false, message: `Error /music: ${e.message}` }
  }
}

async function handleVideoDownload(ctx) {
  const { args, sender, sock, remoteJid } = ctx
  const query = args.join(' ')

  logDownload('INFO', 'VIDEO', 'Starting video download', {
    query: query?.substring(0, 50)
  })

  if (!query) {
    logDownload('WARN', 'VIDEO', 'No query provided')
    return { success: false, message: 'Uso: /video <nombre o url>' }
  }

  try {
    logDownload('DEBUG', 'VIDEO', 'Searching YouTube Music')
    const search = await searchYouTubeMusic(query)

    logDownload('DEBUG', 'VIDEO', 'Search completed', {
      success: search.success,
      resultsCount: search.results?.length || 0
    })

    if (!search.success || !search.results.length) {
      logDownload('WARN', 'VIDEO', 'No results found', { query })
      return { success: false, message: `No hay resultados para "${query}"` }
    }

    const video = search.results[0]

    logDownload('INFO', 'VIDEO', 'Found video', {
      title: video.title,
      url: video.url
    })

    const progress = createProgressNotifier({
      resolveSocket: () => Promise.resolve(sock),
      chatId: remoteJid,
      title: 'Descargando video',
      icon: '🎬',
    })

    await progress.update(5, 'Conectando...')

    logDownload('DEBUG', 'VIDEO', 'Starting YouTube download')

    const dl = await downloadYouTube(video.url, 'video', (p) => {
      const percent = Math.min(95, Math.floor(p?.percent || 0))
      logDownload('DEBUG', 'VIDEO', `Download progress: ${percent}%`)
      progress.update(percent, 'Descargando...').catch(() => {})
    })

    logDownload('DEBUG', 'VIDEO', 'Download completed', {
      success: dl.success,
      hasDownload: !!dl.download
    })

    if (!dl.success || !dl.download) throw new Error('Descarga fallida')

    const videoInput = toMediaInput(dl.download)
    if (!videoInput) {
      logDownload('ERROR', 'VIDEO', 'Invalid video format')
      throw new Error('Formato de video no válido')
    }

    await progress.complete('Listo')

    logDownload('SUCCESS', 'VIDEO', 'Video download completed successfully')

    return {
      type: 'video',
      video: videoInput,
      mimetype: 'video/mp4',
      caption: `📺 ${video.title}\nCanal: ${video.author}\nDuración: ${video.duration}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logDownload('ERROR', 'VIDEO', 'Video download failed', {
      error: e.message,
      stack: e.stack?.split('\n').slice(0, 5).join('\n')
    })

    logger.error('handleVideoDownload', e)
    return { success: false, message: `Error /video: ${e.message}` }
  }
}

async function handleSpotifySearch(ctx) {
  const { args, sender } = ctx
  const query = args.join(' ')

  logDownload('INFO', 'SPOTIFY', 'Starting Spotify search', {
    query: query?.substring(0, 50)
  })

  if (!query) {
    logDownload('WARN', 'SPOTIFY', 'No query provided')
    return { success: false, message: 'Uso: /spotify <canción>' }
  }

  try {
    const result = await searchSpotify(query)

    logDownload('DEBUG', 'SPOTIFY', 'Search result received', {
      success: result.success
    })

    if (!result.success) {
      logDownload('WARN', 'SPOTIFY', 'No results found', { query })
      return { success: false, message: `No hay resultados para "${query}"` }
    }

    let audioInput = null
    try {
      logDownload('DEBUG', 'SPOTIFY', 'Attempting YouTube fallback')
      const yt = await searchYouTubeMusic(`${result.title} ${result.artists}`)
      if (yt.success && yt.results.length) {
        const dl = await downloadYouTube(yt.results[0].url, 'audio')
        if (dl.success) {
          audioInput = toMediaInput(dl.download)
          logDownload('SUCCESS', 'SPOTIFY', 'YouTube fallback succeeded')
        }
      }
    } catch (e) {
      logDownload('WARN', 'SPOTIFY', 'YouTube fallback failed', { error: e.message })
      logger.error('spotify fallback', e)
    }

    if (audioInput) {
      return {
        type: 'audio',
        audio: audioInput,
        mimetype: 'audio/mpeg',
        caption: `${result.title} - ${result.artists}\nÁlbum: ${result.album}\n${senderTag(sender)}`,
        mentions: mentionSender(sender),
      }
    }

    logDownload('WARN', 'SPOTIFY', 'Could not download audio')
    return { success: false, message: `${result.title} - ${result.artists}\nNo se pudo descargar el audio.` }
  } catch (e) {
    logDownload('ERROR', 'SPOTIFY', 'Search failed', { error: e.message })
    logger.error('handleSpotifySearch', e)
    return { success: false, message: `Error /spotify: ${e.message}` }
  }
}

async function handleTranslate(ctx) {
  const { args } = ctx
  const lang = args.pop()
  const text = args.join(' ')

  logDownload('INFO', 'TRANSLATE', 'Translation request', {
    textLength: text?.length,
    targetLang: lang
  })

  if (!text || !lang) {
    logDownload('WARN', 'TRANSLATE', 'Missing parameters')
    return { success: false, message: 'Uso: /translate <texto> <lang>' }
  }

  try {
    const res = await translateText(text, lang)

    logDownload('DEBUG', 'TRANSLATE', 'Translation result', {
      success: res.success
    })

    if (!res.success) {
      logDownload('WARN', 'TRANSLATE', 'Translation failed')
      return { success: false, message: 'No se pudo traducir.' }
    }

    logDownload('SUCCESS', 'TRANSLATE', 'Translation completed')
    return { message: `🔤 *Traducción*\n${res.translatedText}` }
  } catch (e) {
    logDownload('ERROR', 'TRANSLATE', 'Translation error', { error: e.message })
    return { success: false, message: `Error /translate: ${e.message}` }
  }
}

async function handleWeather(ctx) {
  const city = (ctx.args || []).join(' ')

  logDownload('INFO', 'WEATHER', 'Weather request', { city })

  if (!city) {
    logDownload('WARN', 'WEATHER', 'No city provided')
    return { success: false, message: 'Uso: /weather <ciudad>' }
  }

  try {
    const res = await getWeather(city)

    logDownload('DEBUG', 'WEATHER', 'Weather result', {
      success: res.success
    })

    if (!res.success) {
      logDownload('WARN', 'WEATHER', 'City not found', { city })
      return { success: false, message: `No encontré clima para "${city}"` }
    }

    logDownload('SUCCESS', 'WEATHER', 'Weather fetched successfully')
    return { message: `🌦️ Clima en ${res.city}: ${res.temperature}°C, ${res.description}.` }
  } catch (e) {
    logDownload('ERROR', 'WEATHER', 'Weather error', { error: e.message })
    return { success: false, message: `Error /weather: ${e.message}` }
  }
}

async function handleQuote() {
  logDownload('INFO', 'QUOTE', 'Quote request')

  try {
    const res = await getRandomQuote()

    if (!res.success) {
      logDownload('WARN', 'QUOTE', 'Could not get quote')
      return { success: false, message: 'No pude obtener una frase.' }
    }

    logDownload('SUCCESS', 'QUOTE', 'Quote fetched successfully')
    return { message: `"${res.quote}"\n- ${res.author}` }
  } catch (e) {
    logDownload('ERROR', 'QUOTE', 'Quote error', { error: e.message })
    return { success: false, message: `Error /quote: ${e.message}` }
  }
}

async function handleFact() {
  logDownload('INFO', 'FACT', 'Fact request')

  try {
    const res = await getRandomFact()

    if (!res.success) {
      logDownload('WARN', 'FACT', 'Could not get fact')
      return { success: false, message: 'No pude obtener un dato.' }
    }

    logDownload('SUCCESS', 'FACT', 'Fact fetched successfully')
    return { message: `🧠 ${res.fact}` }
  } catch (e) {
    logDownload('ERROR', 'FACT', 'Fact error', { error: e.message })
    return { success: false, message: `Error /fact: ${e.message}` }
  }
}

async function handleTriviaCommand() {
  logDownload('INFO', 'TRIVIA', 'Trivia request')

  try {
    const res = await getTrivia()

    if (!res.success) {
      logDownload('WARN', 'TRIVIA', 'Could not get trivia')
      return { success: false, message: 'No pude obtener trivia.' }
    }

    logDownload('SUCCESS', 'TRIVIA', 'Trivia fetched successfully')
    return { message: `❓ ${res.question}\n\nRespuesta: ||${res.correct_answer}||` }
  } catch (e) {
    logDownload('ERROR', 'TRIVIA', 'Trivia error', { error: e.message })
    return { success: false, message: `Error /trivia: ${e.message}` }
  }
}

async function handleMemeCommand() {
  logDownload('INFO', 'MEME', 'Meme request')

  try {
    const res = await getRandomMeme()

    if (!res.success) {
      logDownload('WARN', 'MEME', 'Could not get meme')
      return { success: false, message: 'No pude obtener un meme.' }
    }

    logDownload('SUCCESS', 'MEME', 'Meme fetched successfully')
    return { type: 'image', image: toMediaInput(res.image), caption: res.title || 'Meme' }
  } catch (e) {
    logDownload('ERROR', 'MEME', 'Meme error', { error: e.message })
    return { success: false, message: `Error /meme: ${e.message}` }
  }
}

// ============================================================
// EXPORTACIONES - Todas las formas posibles de importación
// ============================================================

// Exportaciones nombradas individuales
export {
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
}

// Exportación por defecto como objeto
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
}
