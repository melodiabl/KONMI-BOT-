// src/utils/utils/progress-notifier.js
import logger from '../../config/logger.js'

/**
 * Notificador de progreso para descargas (YouTube, Spotify, etc.)
 *
 * - Envía UN solo mensaje base.
 * - Luego lo "edita" (o manda uno nuevo según soporte del cliente) con la barra.
 * - Se auto–limita para evitar rate limit (429 / rate-overlimit).
 */

const env = process.env

// ⏱️ Menos frecuencia por defecto (para que WhatsApp no llore)
const EDIT_MIN_INTERVAL_MS = Number(env.PROGRESS_EDIT_MIN_INTERVAL_MS || 5000) // 5s
// Solo si cambia al menos este porcentaje
const MIN_PERCENT_STEP = Number(env.PROGRESS_MIN_PERCENT_STEP || 5)            // 5%
// Hard limit: máximo de actualizaciones por descarga
const MAX_TOTAL_UPDATES = Number(env.PROGRESS_MAX_UPDATES || 12)

const SPIN_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function makeBar(percent = 0) {
  const total = 20
  const filled = Math.round((percent / 100) * total)
  const empty = total - filled
  return '█'.repeat(filled || 1) + '░'.repeat(empty)
}

export function createProgressNotifier(options) {
  const {
    resolveSocket,
    chatId,
    quoted,
    title = 'Descargando',
    icon = '⬇️',
    initialStatus = 'Preparando descarga...',
  } = options

  let messageRef = null
  let lastPercent = 0
  let lastStatusText = initialStatus
  let spinnerIndex = 0

  let lastSentAt = 0
  let totalUpdates = 0
  let finished = false
  let muted = false // si WhatsApp tira rate-overlimit, ya no volvemos a intentar

  function render(percent, statusText) {
    const frame = SPIN_FRAMES[spinnerIndex % SPIN_FRAMES.length]
    spinnerIndex++

    const safePercent = Math.max(0, Math.min(100, Math.round(percent || 0)))
    const bar = makeBar(safePercent)

    return (
      `${icon} ${title}\n\n` +
      `${frame} ${bar}   ${safePercent}%\n\n` +
      ` ${statusText || lastStatusText || ''}`
    )
  }

  async function send(sock, percent, statusText) {
    if (muted || finished) return

    const now = Date.now()
    const timeSinceLast = now - lastSentAt

    const percentDiff = Math.abs((percent ?? 0) - (lastPercent ?? 0))
    const shouldThrottleByTime = timeSinceLast < EDIT_MIN_INTERVAL_MS
    const shouldThrottleByPercent = percentDiff < MIN_PERCENT_STEP

    if (totalUpdates > 0 && (shouldThrottleByTime || shouldThrottleByPercent)) {
      return
    }

    if (totalUpdates >= MAX_TOTAL_UPDATES) {
      logger.warn('[PROGRESS] Max updates reached, muting further updates')
      muted = true
      return
    }

    const text = render(percent, statusText)

    try {
      if (!messageRef) {
        // Primer mensaje
        const sent = await sock.sendMessage(
          chatId,
          { text },
          quoted ? { quoted } : {}
        )
        messageRef = sent
      } else {
        // "Edición" — algunos clientes lo tomarán como nuevo mensaje,
        // pero al tener intervalos grandes no spamea.
        await sock.sendMessage(chatId, {
          text,
          edit: messageRef.key,
        })
      }

      lastSentAt = now
      lastPercent = percent
      lastStatusText = statusText
      totalUpdates++
    } catch (err) {
      const msg = String(err?.message || err || '')
      if (msg.includes('rate-overlimit') || msg.includes('429')) {
        logger.warn('[PROGRESS] WhatsApp rate limit, muting notifier')
        muted = true
        finished = true
      } else {
        logger.warn('[PROGRESS] Error sending progress message:', msg)
      }
    }
  }

  return {
    async start() {
      try {
        const sock = await resolveSocket()
        await send(sock, 5, initialStatus)
      } catch (err) {
        logger.warn('[PROGRESS] start() failed:', err?.message || err)
      }
    },

    async update(percent, statusText) {
      try {
        const sock = await resolveSocket()
        await send(sock, percent, statusText)
      } catch (err) {
        logger.warn('[PROGRESS] update() failed:', err?.message || err)
      }
    },

    async complete(finalStatus = 'Completado') {
      if (finished) return
      finished = true
      try {
        const sock = await resolveSocket()
        await send(sock, 100, finalStatus)
      } catch (err) {
        logger.warn('[PROGRESS] complete() failed:', err?.message || err)
      }
    },

    async error(errorStatus = 'Ocurrió un error') {
      if (finished) return
      finished = true
      try {
        const sock = await resolveSocket()
        await send(sock, lastPercent || 0, `❌ ${errorStatus}`)
      } catch (err) {
        logger.warn('[PROGRESS] error() failed:', err?.message || err)
      }
    },
  }
}

export default createProgressNotifier
