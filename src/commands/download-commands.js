// commands/download-commands.js
// Comandos de descarga con fallbacks robustos (URLs o Buffers)

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

const toMediaInput = (val) => {
  if (!val) return null
  if (Buffer.isBuffer(val)) return val
  if (typeof val === 'string') return { url: val }
  if (val?.url) return { url: val.url }
  return null
}

const mentionSender = (sender) => [`${sender}`]
const senderTag = (sender) => `@${String(sender || '').split('@')[0]}`

export async function handleTikTokDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')
  if (!url || !url.includes('tiktok.com')) return { success: false, message: 'Uso: /tiktok <url>' }

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
    if (!result.success || !result.video) throw new Error('No se pudo obtener el video')
    await progress.complete('Listo')

    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: `TikTok\nAutor: ${result.author || 'N/D'}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleTikTokDownload', e)
    await progress.fail(e.message)
    return { success: false, message: `Error TikTok: ${e.message}` }
  }
}

export async function handleInstagramDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')
  if (!url || !url.includes('instagram.com')) return { success: false, message: 'Uso: /instagram <url>' }

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
    if (!result.success || (!result.image && !result.video)) throw new Error('Contenido no disponible')
    await progress.complete('Listo')

    const type = result.type === 'video' ? 'video' : (result.video ? 'video' : 'image')
    const media = toMediaInput(result.video || result.image || result.url)

    return {
      type,
      [type]: media,
      caption: `Instagram\nAutor: ${result.author || 'N/D'}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleInstagramDownload', e)
    await progress.fail(e.message)
    return { success: false, message: `Error Instagram: ${e.message}` }
  }
}

export async function handleFacebookDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')
  if (!url || !url.includes('facebook.com')) return { success: false, message: 'Uso: /facebook <url>' }
  try {
    const result = await downloadFacebook(url)
    if (!result.success || !result.video) throw new Error('No se pudo descargar')
    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: `Facebook\n${result.title || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleFacebookDownload', e)
    return { success: false, message: `Error Facebook: ${e.message}` }
  }
}

export async function handleTwitterDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')
  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) return { success: false, message: 'Uso: /twitter <url>' }
  try {
    const result = await downloadTwitter(url)
    if (!result.success || (!result.video && !result.image)) throw new Error('No se pudo descargar')
    const type = result.video ? 'video' : 'image'
    return {
      type,
      [type]: toMediaInput(result.video || result.image),
      caption: `Twitter/X\n${result.text || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleTwitterDownload', e)
    return { success: false, message: `Error Twitter/X: ${e.message}` }
  }
}

export async function handlePinterestDownload(ctx) {
  const { args, sender } = ctx
  const url = args.join(' ')
  if (!url || !url.includes('pinterest.')) return { success: false, message: 'Uso: /pinterest <url>' }
  try {
    const result = await downloadPinterest(url)
    if (!result.success || !result.image) throw new Error('No se pudo descargar')
    return {
      type: 'image',
      image: toMediaInput(result.image),
      caption: `Pinterest\n${result.title || ''}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    return { success: false, message: `Error Pinterest: ${e.message}` }
  }
}

export async function handleMusicDownload(ctx) {
  const { args, sender, sock, remoteJid } = ctx
  const query = args.join(' ')
  if (!query) return { success: false, message: 'Uso: /music <nombre o url>' }

  try {
    const search = await searchYouTubeMusic(query)
    if (!search.success || !search.results.length) return { success: false, message: `No hay resultados para "${query}"` }
    const video = search.results[0]

    const progress = createProgressNotifier({
      resolveSocket: () => Promise.resolve(sock),
      chatId: remoteJid,
      title: 'Descargando música',
      icon: '🎵',
    })

    await progress.update(5, 'Conectando...')
    const dl = await downloadYouTube(video.url, 'audio', (p) => {
      if (p?.percent) progress.update(Math.min(95, Math.floor(p.percent)), 'Descargando...').catch(() => {})
    })
    if (!dl.success || !dl.download) throw new Error('Descarga fallida')

    const audioInput = toMediaInput(dl.download)
    if (!audioInput) throw new Error('Formato de audio no válido')
    await progress.complete('Listo')

    return {
      type: 'audio',
      audio: audioInput,
      mimetype: 'audio/mpeg',
      caption: `🎵 ${video.title}\nCanal: ${video.author}\nDuración: ${video.duration}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleMusicDownload', e)
    return { success: false, message: `Error /music: ${e.message}` }
  }
}

export async function handleVideoDownload(ctx) {
  const { args, sender, sock, remoteJid } = ctx
  const query = args.join(' ')
  if (!query) return { success: false, message: 'Uso: /video <nombre o url>' }

  try {
    const search = await searchYouTubeMusic(query)
    if (!search.success || !search.results.length) return { success: false, message: `No hay resultados para "${query}"` }
    const video = search.results[0]

    const progress = createProgressNotifier({
      resolveSocket: () => Promise.resolve(sock),
      chatId: remoteJid,
      title: 'Descargando video',
      icon: '🎬',
    })

    await progress.update(5, 'Conectando...')
    const dl = await downloadYouTube(video.url, 'video', (p) => {
      progress.update(Math.min(95, Math.floor(p?.percent || 0)), 'Descargando...').catch(() => {})
    })
    if (!dl.success || !dl.download) throw new Error('Descarga fallida')

    const videoInput = toMediaInput(dl.download)
    if (!videoInput) throw new Error('Formato de video no válido')
    await progress.complete('Listo')

    return {
      type: 'video',
      video: videoInput,
      mimetype: 'video/mp4',
      caption: `📺 ${video.title}\nCanal: ${video.author}\nDuración: ${video.duration}\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('handleVideoDownload', e)
    return { success: false, message: `Error /video: ${e.message}` }
  }
}

export async function handleSpotifySearch(ctx) {
  const { args, sender } = ctx
  const query = args.join(' ')
  if (!query) return { success: false, message: 'Uso: /spotify <canción>' }

  try {
    const result = await searchSpotify(query)
    if (!result.success) return { success: false, message: `No hay resultados para "${query}"` }

    let audioInput = null
    try {
      const yt = await searchYouTubeMusic(`${result.title} ${result.artists}`)
      if (yt.success && yt.results.length) {
        const dl = await downloadYouTube(yt.results[0].url, 'audio')
        if (dl.success) audioInput = toMediaInput(dl.download)
      }
    } catch (e) {
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
    return { success: false, message: `${result.title} - ${result.artists}\nNo se pudo descargar el audio.` }
  } catch (e) {
    logger.error('handleSpotifySearch', e)
    return { success: false, message: `Error /spotify: ${e.message}` }
  }
}

export async function handleTranslate(ctx) {
  const { args } = ctx
  const lang = args.pop()
  const text = args.join(' ')
  if (!text || !lang) return { success: false, message: 'Uso: /translate <texto> <lang>' }
  try {
    const res = await translateText(text, lang)
    if (!res.success) return { success: false, message: 'No se pudo traducir.' }
    return { message: `🔤 *Traducción*\n${res.translatedText}` }
  } catch (e) {
    return { success: false, message: `Error /translate: ${e.message}` }
  }
}

export async function handleWeather(ctx) {
  const city = (ctx.args || []).join(' ')
  if (!city) return { success: false, message: 'Uso: /weather <ciudad>' }
  try {
    const res = await getWeather(city)
    if (!res.success) return { success: false, message: `No encontré clima para "${city}"` }
    return { message: `🌦️ Clima en ${res.city}: ${res.temperature}°C, ${res.description}.` }
  } catch (e) {
    return { success: false, message: `Error /weather: ${e.message}` }
  }
}

export async function handleQuote() {
  try {
    const res = await getRandomQuote()
    if (!res.success) return { success: false, message: 'No pude obtener una frase.' }
    return { message: `"${res.quote}"\n- ${res.author}` }
  } catch (e) {
    return { success: false, message: `Error /quote: ${e.message}` }
  }
}

export async function handleFact() {
  try {
    const res = await getRandomFact()
    if (!res.success) return { success: false, message: 'No pude obtener un dato.' }
    return { message: `🧠 ${res.fact}` }
  } catch (e) {
    return { success: false, message: `Error /fact: ${e.message}` }
  }
}

export async function handleTriviaCommand() {
  try {
    const res = await getTrivia()
    if (!res.success) return { success: false, message: 'No pude obtener trivia.' }
    return { message: `❓ ${res.question}\n\nRespuesta: ||${res.correct_answer}||` }
  } catch (e) {
    return { success: false, message: `Error /trivia: ${e.message}` }
  }
}

export async function handleMemeCommand() {
  try {
    const res = await getRandomMeme()
    if (!res.success) return { success: false, message: 'No pude obtener un meme.' }
    return { type: 'image', image: toMediaInput(res.image), caption: res.title || 'Meme' }
  } catch (e) {
    return { success: false, message: `Error /meme: ${e.message}` }
  }
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
}
