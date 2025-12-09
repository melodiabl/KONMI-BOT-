// src/utils/utils/progress-notifier.js

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']

// Cada cuánto tiempo COMO MÍNIMO se permite un edit (ms)
const EDIT_MIN_INTERVAL_MS = Number(process.env.PROGRESS_EDIT_MIN_INTERVAL_MS || 2000)

function renderBar(percent, length = 20) {
  const total = Math.max(4, length)
  const pct = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
  const filled = Math.round((pct / 100) * total)
  const bar = '█'.repeat(filled).padEnd(total, '░')
  return bar
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

export function createProgressNotifier({
  resolveSocket,
  chatId,
  quoted = null,
  title = 'Procesando',
  icon = '',
  barLength = 20,
  animate = true
} = {}) {
  // Si no tenemos cómo resolver el socket o no hay chatId, devolvemos no-op
  if (typeof resolveSocket !== 'function' || !chatId) {
    const noop = async () => {}
    return { update: noop, complete: noop, fail: noop }
  }

  let messageRef = null
  let lastPercent = 0          // último porcentaje lógico recibido
  let lastStatusText = ''      // último texto de estado
  let spinnerIndex = 0
  let finished = false
  let muted = false

  // Para throttling por TIEMPO
  let lastSentAt = 0           // timestamp del último EDIT real (ms)

  const render = (percent, status, details = [], accent = icon) => {
    const header = `${accent} ${title}`.trim()
    const bar = renderBar(percent, barLength)
    const percentLabel = `${String(percent).padStart(3, ' ')}%`
    const spin = animate && !finished ? `${SPINNER_FRAMES[spinnerIndex]} ` : ''
    const barLine = `📊 ${spin}${bar} ${percentLabel}`

    const lines = [header, '', barLine, '', ` ${status}`]
    details.filter(Boolean).forEach((line) => {
      lines.push(`  ${line}`)
    })

    return lines.join('\n')
  }

  async function send(percent, status, options = {}) {
    if (muted) return messageRef

    // Actualizamos el estado lógico aunque no mandemos mensaje (por throttling)
    lastPercent = clampPercent(percent)
    lastStatusText = String(status || lastStatusText || '')

    const details = Array.isArray(options.details)
      ? options.details.filter(Boolean).map(String)
      : options.details
        ? [String(options.details)]
        : []

    const force = options && options.force === true
    const now = Date.now()

    // THROTTLING SOLO POR TIEMPO (no por cambio de %)
    if (!force) {
      const diffTime = now - lastSentAt
      if (diffTime < EDIT_MIN_INTERVAL_MS) {
        return messageRef
      }
    }

    // Vamos a editar: avanzamos el spinner y guardamos tiempos
    spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length
    lastSentAt = now

    const text = render(lastPercent, lastStatusText, details, options.icon || icon)
    const payload = { text }

    if (options.contextInfo) {
      payload.contextInfo = options.contextInfo
    }

    try {
      const sock = await resolveSocket()
      if (!sock || typeof sock.sendMessage !== 'function') return messageRef

      if (messageRef?.key) {
        // EDITAR mensaje existente
        const edited = await sock.sendMessage(chatId, { ...payload, edit: messageRef.key })
        if (edited?.key) messageRef = edited
      } else {
        // PRIMER mensaje
        messageRef = await sock.sendMessage(
          chatId,
          payload,
          quoted ? { quoted } : undefined
        )
      }
    } catch (error) {
      const msg = error?.message || String(error || '')
      console.error(' Progress notifier error:', msg)

      // Si WhatsApp/Baileys nos da rate limit, apagamos el notificador
      if (msg.includes('rate-overlimit')) {
        muted = true
        finished = true
      }
    }

    return messageRef
  }

  return {
    async update(percent, status, options = {}) {
      if (muted) return messageRef
      await send(percent, status, options)
      return messageRef
    },

    async complete(status = 'Completado', options = {}) {
      if (muted) return messageRef
      finished = true
      // forzamos el último update para que sí llegue al 100%
      await send(100, status, { ...options, force: true })
      return messageRef
    },

    async fail(reason = 'Error', options = {}) {
      if (muted) return messageRef
      const message = String(reason || 'Error')
      finished = true
      // también forzamos el mensaje de error
      await send(lastPercent || 0, message, { ...options, force: true })
      return messageRef
    }
  }
}

export default createProgressNotifier


