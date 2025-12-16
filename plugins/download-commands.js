// commands/download-commands.js
// Comandos con progreso FLUIDO y EDICIÓN GARANTIZADA del mismo mensaje + Temática BL

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
} from '../plugins/utils/utils/api-providers.js'
import logger from '../plugins/config/logger.js'
import { createProgressNotifier } from '../plugins/utils/utils/progress-notifier.js'

/* ===== Utilidades BL + Wileys ===== */

// Funcionalidades Wileys completas + Temática BL integrada
const BL_DOWNLOAD_REACTIONS = ['📥', '💖', '✨', '🎵', '💕', '🌸', '💝', '🌟', '🥰', '😍'];
const BL_DOWNLOAD_MESSAGES = {
  downloading: ['💖 Descargando con amor...', '✨ Preparando tu contenido...', '🌸 Procesando con cariño...'],
  success: ['✅ ¡Descarga completa! 💖', '🌸 ¡Listo! Disfrútalo mucho', '💕 ¡Perfecto! Con mucho amor'],
  error: ['🥺 Algo salió mal, pero no te rindas 💔', '😢 Error en descarga, lo siento', '💔 No pude completarlo, perdóname']
};

// Wileys: Reacciones automáticas BL mejoradas para descargas
const addBLDownloadReaction = async (sock, message, type = 'download') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      download: ['📥', '💖', '✨'],
      music: ['🎵', '💕', '🌸'],
      video: ['🎬', '💖', '🌟'],
      image: ['📸', '🌸', '💝'],
      success: ['✅', '💖', '🎉'],
      error: ['❌', '💔', '🥺']
    };

    const sequence = reactionSequences[type] || reactionSequences.download;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_DOWNLOAD_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de descarga
const decorateBLDownloadMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    download: {
      header: '╔📥═══════════════════════════════════════📥╗',
      footer: '╚📥═══════════════════════════════════════📥╝',
      bullet: '📥'
    },
    success: {
      header: '╔✅═══════════════════════════════════════✅╗',
      footer: '╚✅═══════════════════════════════════════✅╝',
      bullet: '✅'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

const addCompletionReaction = async (sock, message, success = true) => {
  try {
    if (sock && message?.key) {
      const type = success ? 'success' : 'error';
      setTimeout(async () => {
        await addBLDownloadReaction(sock, message, type);
      }, 1000);
    }
  } catch (error) {
    console.error('[COMPLETION_REACTION] Error:', error);
  }
};

const toMediaInput = (val) => {
  if (!val) return null
  if (Buffer.isBuffer(val)) return val
  if (typeof val === 'string') return { url: val }
  if (val?.url) return { url: val.url }
  return null
}

const mentionSender = (sender) => [`${sender}`]
const senderTag = (sender) => `@${String(sender || '').split('@')[0]}`

// Simular progreso fluido cuando no hay callbacks reales
class ProgressSimulator {
  constructor(progressNotifier, targetPercent = 90, durationMs = 4000) {
    this.notifier = progressNotifier
    this.currentPercent = 0
    this.targetPercent = targetPercent
    this.durationMs = durationMs
    this.intervalMs = 2000 // Reducido para evitar rate-limit: 2 segundos
    this.timer = null
    this.stopped = false
    this.lastUpdate = 0
  }

  start() {
    const steps = Math.max(2, this.durationMs / this.intervalMs) // Mínimo 2 pasos
    const increment = (this.targetPercent - this.currentPercent) / steps

    this.timer = setInterval(async () => {
      if (this.stopped) {
        this.stop()
        return
      }

      const now = Date.now()
      // Evitar actualizaciones muy frecuentes
      if (now - this.lastUpdate < 1500) return

      this.currentPercent = Math.min(this.targetPercent, this.currentPercent + increment)

      try {
        await this.notifier.update(this.currentPercent)
        this.lastUpdate = now
      } catch (e) {
        // Ignorar errores para evitar spam
        console.log('Progress update skipped to avoid rate-limit')
      }

      if (this.currentPercent >= this.targetPercent) {
        this.stop()
      }
    }, this.intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async jumpTo(percent, status) {
    this.stopped = true
    this.stop()
    this.currentPercent = percent
    try {
      await this.notifier.update(percent, status)
      this.lastUpdate = Date.now()
    } catch (e) {
      console.log('Progress jump skipped to avoid rate-limit')
    }
  }
}

/* ===== COMANDOS DE DESCARGA ===== */

async function handleTikTokDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  if (!url || !url.includes('tiktok.com')) {
    return { success: false, message: decorateBLDownloadMessage('Error TikTok', '❌ Uso: /tiktok <url>\n💡 Ejemplo: /tiktok https://tiktok.com/...', 'love') }
  }

  // Funcionalidad Wileys: Reacción automática BL
  await addBLDownloadReaction(sock, message, 'download');

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: '💖 Descargando TikTok',
    icon: '🎵',
  })

  const simulator = new ProgressSimulator(progress, 85, 4000)

  try {
    await progress.update(5, '💖 Conectando con TikTok...')
    simulator.start()

    const result = await downloadTikTok(url)

    await simulator.jumpTo(95, '✨ Procesando video...')

    if (!result.success || !result.video) {
      throw new Error('No se pudo obtener el video')
    }

    await progress.complete('✅ Descarga completa 💖')

    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: decorateBLDownloadMessage('TikTok Descargado', `👤 Autor: ${result.author || 'Desconocido'}\n📝 ${result.description || ''}\n\n${senderTag(sender)}`, 'success'),
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('TikTok error:', e)
    await progress.fail(`💔 ${e.message}`)
    return { success: false, message: decorateBLDownloadMessage('Error TikTok', `❌ Error TikTok: ${e.message}\n🥺 Intenta con otro enlace`, 'love') }
  } finally {
    simulator.stop()
    progress.cleanup?.()
  }
}

async function handleInstagramDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  if (!url || !url.includes('instagram.com')) {
    return { success: false, message: '❌ Uso: /instagram <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Instagram',
    icon: '📸',
  })

  const simulator = new ProgressSimulator(progress, 85, 3500)

  try {
    await progress.update(5, 'Conectando con Instagram...')
    simulator.start()

    const result = await downloadInstagram(url)

    await simulator.jumpTo(95, 'Procesando contenido...')

    if (!result.success || (!result.image && !result.video)) {
      throw new Error('Contenido no disponible')
    }

    const type = result.type === 'video' ? 'video' : (result.video ? 'video' : 'image')
    const media = toMediaInput(result.video || result.image || result.url)

    await progress.complete('✅ Descarga completa')

    return {
      type,
      [type]: media,
      caption: `📸 *Instagram*\n👤 ${result.author || 'Desconocido'}\n${result.caption ? `📝 ${result.caption.substring(0, 100)}...` : ''}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Instagram error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error Instagram: ${e.message}` }
  } finally {
    simulator.stop()
    progress.cleanup?.()
  }
}

async function handleFacebookDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  if (!url || !url.includes('facebook.com')) {
    return { success: false, message: '❌ Uso: /facebook <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Facebook',
    icon: '📘',
  })

  const simulator = new ProgressSimulator(progress, 85, 4000)

  try {
    await progress.update(5, 'Conectando con Facebook...')
    simulator.start()

    const result = await downloadFacebook(url)

    await simulator.jumpTo(95, 'Procesando video...')

    if (!result.success || !result.video) {
      throw new Error('No se pudo descargar el video')
    }

    await progress.complete('✅ Descarga completa')

    return {
      type: 'video',
      video: toMediaInput(result.video),
      caption: `📘 *Facebook*\n${result.title ? `📝 ${result.title}` : ''}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Facebook error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error Facebook: ${e.message}` }
  } finally {
    simulator.stop()
    progress.cleanup?.()
  }
}

async function handleTwitterDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
    return { success: false, message: '❌ Uso: /twitter <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Twitter/X',
    icon: '🐦',
  })

  const simulator = new ProgressSimulator(progress, 85, 3000)

  try {
    await progress.update(5, 'Conectando con Twitter/X...')
    simulator.start()

    const result = await downloadTwitter(url)

    await simulator.jumpTo(95, 'Procesando contenido...')

    if (!result.success || (!result.video && !result.image)) {
      throw new Error('No se pudo descargar')
    }

    const type = result.video ? 'video' : 'image'

    await progress.complete('✅ Descarga completa')

    return {
      type,
      [type]: toMediaInput(result.video || result.image),
      caption: `🐦 *Twitter/X*\n${result.text ? `📝 ${result.text.substring(0, 150)}...` : ''}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Twitter error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error Twitter/X: ${e.message}` }
  } finally {
    simulator.stop()
    progress.cleanup?.()
  }
}

async function handlePinterestDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const url = args.join(' ')

  if (!url || !url.includes('pinterest.')) {
    return { success: false, message: '❌ Uso: /pinterest <url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Pinterest',
    icon: '📌',
  })

  const simulator = new ProgressSimulator(progress, 85, 2500)

  try {
    await progress.update(5, 'Conectando con Pinterest...')
    simulator.start()

    const result = await downloadPinterest(url)

    await simulator.jumpTo(95, 'Procesando imagen...')

    if (!result.success || !result.image) {
      throw new Error('No se pudo descargar la imagen')
    }

    await progress.complete('✅ Descarga completa')

    return {
      type: 'image',
      image: toMediaInput(result.image),
      caption: `📌 *Pinterest*\n${result.title ? `📝 ${result.title}` : ''}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Pinterest error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error Pinterest: ${e.message}` }
  } finally {
    simulator.stop()
    progress.cleanup?.()
  }
}

async function handleMusicDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const query = args.join(' ')

  if (!query) {
    return { success: false, message: '❌ Uso: /music <nombre o url>' }
  }

  // Funcionalidad Wileys: Reacción automática BL al iniciar
  await addBLDownloadReaction(sock, message, 'music');

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Música',
    icon: '🎵',
  })

  try {
    await progress.update(5, 'Buscando en YouTube Music...')

    const search = await searchYouTubeMusic(query)

    if (!search.success || !search.results.length) {
      await progress.fail('No se encontraron resultados')
      return { success: false, message: `❌ No hay resultados para "${query}"` }
    }

    const video = search.results[0]

    await progress.update(15, `Encontrado: ${video.title.substring(0, 40)}...`)
    await progress.update(20, 'Preparando descarga...')

    let lastPercent = 20

    const dl = await downloadYouTube(video.url, 'audio', (p) => {
      if (p?.percent) {
        const percent = Math.min(95, 20 + Math.floor(p.percent * 0.75))

        // Solo actualizar si cambió significativamente
        if (Math.abs(percent - lastPercent) >= 1) {
          const status = percent < 50 ? 'Conectando con servidor...' :
                        percent < 80 ? 'Descargando audio...' :
                        'Procesando con FFmpeg...'
          progress.update(percent, status).catch(() => {})
          lastPercent = percent
        }
      }
    })

    if (!dl.success || !dl.download) {
      throw new Error('Descarga fallida')
    }

    const audioInput = toMediaInput(dl.download)
    if (!audioInput) {
      throw new Error('Formato de audio no válido')
    }

    await progress.complete('✅ Música lista')

    // Funcionalidad Wileys: Reacción de completado exitoso
    await addCompletionReaction(sock, message, true);

    return {
      type: 'audio',
      audio: audioInput,
      mimetype: 'audio/mpeg',
      caption: `🎵 *${video.title}*\n👤 ${video.author}\n⏱️ ${video.duration}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Music error:', e)
    await progress.fail(e.message)

    // Funcionalidad Wileys: Reacción de error
    await addCompletionReaction(sock, message, false);

    return { success: false, message: `❌ Error /music: ${e.message}` }
  } finally {
    progress.cleanup?.()
  }
}

async function handleVideoDownload(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const query = args.join(' ')

  if (!query) {
    return { success: false, message: '❌ Uso: /video <nombre o url>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Descargando Video',
    icon: '🎬',
  })

  try {
    await progress.update(5, 'Buscando en YouTube...')

    const search = await searchYouTubeMusic(query)

    if (!search.success || !search.results.length) {
      await progress.fail('No se encontraron resultados')
      return { success: false, message: `❌ No hay resultados para "${query}"` }
    }

    const video = search.results[0]

    await progress.update(15, `Encontrado: ${video.title.substring(0, 40)}...`)
    await progress.update(20, 'Preparando descarga...')

    let lastPercent = 20

    const dl = await downloadYouTube(video.url, 'video', (p) => {
      if (p?.percent) {
        const percent = Math.min(95, 20 + Math.floor(p.percent * 0.75))

        if (Math.abs(percent - lastPercent) >= 1) {
          const status = percent < 40 ? 'Descargando video...' :
                        percent < 70 ? 'Descargando audio...' :
                        percent < 90 ? 'Mezclando video y audio...' :
                        'Finalizando...'
          progress.update(percent, status).catch(() => {})
          lastPercent = percent
        }
      }
    })

    if (!dl.success || !dl.download) {
      throw new Error('Descarga fallida')
    }

    const videoInput = toMediaInput(dl.download)
    if (!videoInput) {
      throw new Error('Formato de video no válido')
    }

    await progress.complete('✅ Video listo')

    return {
      type: 'video',
      video: videoInput,
      mimetype: 'video/mp4',
      caption: `🎬 *${video.title}*\n👤 ${video.author}\n⏱️ ${video.duration}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Video error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error /video: ${e.message}` }
  } finally {
    progress.cleanup?.()
  }
}

async function handleSpotifySearch(ctx) {
  const { args, sender, sock, remoteJid, message } = ctx
  const query = args.join(' ')

  if (!query) {
    return { success: false, message: '❌ Uso: /spotify <canción>' }
  }

  const progress = createProgressNotifier({
    resolveSocket: () => Promise.resolve(sock),
    chatId: remoteJid,
    quoted: message,
    title: 'Spotify → YouTube',
    icon: '🎧',
  })

  try {
    await progress.update(5, 'Buscando en Spotify...')

    const result = await searchSpotify(query)

    if (!result.success) {
      await progress.fail('No se encontró en Spotify')
      return { success: false, message: `❌ No hay resultados para "${query}"` }
    }

    await progress.update(15, `Encontrado: ${result.title}`)
    await progress.update(20, 'Buscando en YouTube Music...')

    const yt = await searchYouTubeMusic(`${result.title} ${result.artists}`)

    if (!yt.success || !yt.results.length) {
      await progress.fail('No se encontró en YouTube')
      return {
        success: false,
        message: `🎧 *${result.title}* - ${result.artists}\n❌ No disponible para descarga`
      }
    }

    const best = yt.results[0]

    await progress.update(30, 'Descargando audio de alta calidad...')

    let lastPercent = 30

    const dl = await downloadYouTube(best.url, 'audio', (p) => {
      if (p?.percent) {
        const percent = Math.min(95, 30 + Math.floor(p.percent * 0.65))

        if (Math.abs(percent - lastPercent) >= 1) {
          const status = percent < 60 ? 'Descargando...' :
                        percent < 85 ? 'Procesando audio...' :
                        'Optimizando calidad...'
          progress.update(percent, status).catch(() => {})
          lastPercent = percent
        }
      }
    })

    if (!dl.success || !dl.download) {
      await progress.fail('Error en la descarga')
      return { success: false, message: '❌ No se pudo descargar el audio' }
    }

    const audioInput = toMediaInput(dl.download)

    await progress.complete('✅ Descarga completa')

    return {
      type: 'audio',
      audio: audioInput,
      mimetype: 'audio/mpeg',
      caption: `🎧 *${result.title}*\n👤 ${result.artists}\n💿 ${result.album}\n\n${senderTag(sender)}`,
      mentions: mentionSender(sender),
    }
  } catch (e) {
    logger.error('Spotify error:', e)
    await progress.fail(e.message)
    return { success: false, message: `❌ Error /spotify: ${e.message}` }
  } finally {
    progress.cleanup?.()
  }
}

/* ===== COMANDOS UTILITARIOS (sin barra de progreso pesada) ===== */

async function handleTranslate(ctx) {
  const { args } = ctx
  const lang = args.pop()
  const text = args.join(' ')

  if (!text || !lang) {
    return { success: false, message: '❌ Uso: /translate <texto> <idioma>' }
  }

  try {
    const res = await translateText(text, lang)
    if (!res.success) {
      return { success: false, message: '❌ No se pudo traducir' }
    }
    return { message: `🔤 *Traducción (${lang})*\n\n${res.translatedText}` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

async function handleWeather(ctx) {
  const city = (ctx.args || []).join(' ')

  if (!city) {
    return { success: false, message: '❌ Uso: /weather <ciudad>' }
  }

  try {
    const res = await getWeather(city)
    if (!res.success) {
      return { success: false, message: `❌ No encontré clima para "${city}"` }
    }
    return { message: `🌦️ *Clima en ${res.city}*\n🌡️ ${res.temperature}°C\n☁️ ${res.description}` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

async function handleQuote() {
  try {
    const res = await getRandomQuote()
    if (!res.success) return { success: false, message: '❌ No pude obtener una frase' }
    return { message: `💬 *"${res.quote}"*\n\n— ${res.author}` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

async function handleFact() {
  try {
    const res = await getRandomFact()
    if (!res.success) return { success: false, message: '❌ No pude obtener un dato' }
    return { message: `🧠 *Dato curioso*\n\n${res.fact}` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

async function handleTriviaCommand() {
  try {
    const res = await getTrivia()
    if (!res.success) return { success: false, message: '❌ No pude obtener trivia' }
    return { message: `❓ *Trivia*\n\n${res.question}\n\n*Respuesta:* ||${res.correct_answer}||` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

async function handleMemeCommand() {
  try {
    const res = await getRandomMeme()
    if (!res.success) return { success: false, message: '❌ No pude obtener un meme' }
    return { type: 'image', image: toMediaInput(res.image), caption: `😂 ${res.title || 'Meme Random'}` }
  } catch (e) {
    return { success: false, message: `❌ Error: ${e.message}` }
  }
}

/* ===== EXPORTACIONES ===== */

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
