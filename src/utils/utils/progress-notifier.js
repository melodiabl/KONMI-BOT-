// utils/utils/progress-notifier.js
// Enviar una sola barra de progreso animada (con spinner) usando edición de mensaje
// con limitador para evitar `rate-overlimit` de WhatsApp.

const SPINNER_FRAMES = [
  '⠋', '⠙', '⠹', '⠸', '⠼',
  '⠴', '⠦', '⠧', '⠇', '⠏'
]

// Intervalo de animación del spinner
const SPINNER_INTERVAL_MS = Number(process.env.PROGRESS_SPINNER_INTERVAL_MS || 400)

// Mínimo intervalo entre envíos reales a WhatsApp
const MIN_SEND_INTERVAL_MS = Number(process.env.PROGRESS_MIN_SEND_INTERVAL_MS || 2500)

// No volver a enviar si el porcentaje cambió menos que esto
const MIN_PERCENT_STEP = Number(process.env.PROGRESS_MIN_PERCENT_STEP || 3)

// Longitud de la barra de progreso
const PROGRESS_BAR_LENGTH = Number(process.env.PROGRESS_BAR_LENGTH || 24)

/**
 * Renderiza la barra de progreso tipo:
 * ███░░░ 35%
 */
function renderProgressBar(percent, length = PROGRESS_BAR_LENGTH) {
  const p = Math.max(0, Math.min(100, percent || 0))
  const filled = Math.round((p / 100) * length)
  const empty = Math.max(0, length - filled)

  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`
}

/**
 * Construye el mensaje completo que se mostrará al usuario.
 */
function buildProgressMessage(state) {
  const {
    title,
    icon,
    spinnerIndex,
    percent,
    status,
    finished,
  } = state

  const spinner = finished ? '✅' : SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length]
  const bar = renderProgressBar(percent)
  const pct = String(Math.max(0, Math.min(100, Math.floor(percent)))).padStart(2, ' ')

  const header = `${icon || spinner} ${title || 'Procesando...'}`
  const progressLine = `${spinner} ${bar}   ${pct}%`
  const statusLine = status ? `\n\n ${status}` : ''

  return `${header}\n\n${progressLine}${statusLine}`
}

/**
 * Crea un notificador de progreso que:
 *  - Envía un solo mensaje
 *  - Luego lo va editando
 *  - Usa un limitador de frecuencia para evitar `rate-overlimit`
 */
export function createProgressNotifier(options = {}) {
  const {
    resolveSocket,
    chatId,
    quoted,
    title = 'Procesando...',
    icon = '⏳',
    animate = true,
  } = options

  if (typeof resolveSocket !== 'function' || !chatId) {
    // Si no tenemos socket o chatId, devolvemos un stub que no hace nada
    return {
      async update () {},
      async complete () {},
      async fail () {},
    }
  }

  const state = {
    title,
    icon,
    percent: 0,
    status: '',
    spinnerIndex: 0,
    finished: false,
    lastSentAt: 0,
    lastPercentSent: 0,
    lastTextSent: '',
  }

  /** Referencia al mensaje de progreso para poder editarlo */
  const messageRef = {
    sock: null,
    key: null,
  }

  let spinnerTimer = null

  async function ensureSocket () {
    if (messageRef.sock) return messageRef.sock
    const sock = await resolveSocket()
    messageRef.sock = sock
    return sock
  }

  function shouldSend (nextPercent, nextText, force) {
    if (force) return true
    const now = Date.now()

    // No spamear si se envió hace muy poco
    if (now - state.lastSentAt < MIN_SEND_INTERVAL_MS) return false

    // No spamear si el porcentaje cambió muy poco
    if (Math.abs((nextPercent || 0) - (state.lastPercentSent || 0)) < MIN_PERCENT_STEP) {
      // Pero si cambió el texto de estado de forma importante, sí podemos mandar
      if (nextText && nextText !== state.lastTextSent) {
        return true
      }
      return false
    }

    return true
  }

  async function sendProgress (force = false) {
    try {
      const sock = await ensureSocket()
      if (!sock) return

      const text = buildProgressMessage(state)
      const percent = state.percent || 0

      if (!shouldSend(percent, text, force)) {
        return
      }

      const payload = { text }
      if (quoted && !messageRef.key) {
        payload.quoted = quoted
      }

      if (messageRef.key) {
        await sock.sendMessage(chatId, {
          ...payload,
          edit: messageRef.key,
        })
      } else {
        const sent = await sock.sendMessage(chatId, payload)
        messageRef.key = sent?.key || null
      }

      state.lastSentAt = Date.now()
      state.lastPercentSent = percent
      state.lastTextSent = text
    } catch (err) {
      // Evitar que un error de rate limit rompa el comando
      const code = err?.output?.statusCode || err?.code || err?.message
      if (code === 'rate-overlimit' || /overlimit/i.test(String(code))) {
        console.warn('Progress notifier: rate-overlimit, se reduce la frecuencia de envío.')
        return
      }

      console.error('Progress notifier error:', err?.message || err)
    }
  }

  function startSpinner () {
    if (!animate || spinnerTimer) return

    spinnerTimer = setInterval(() => {
      if (state.finished) {
        clearInterval(spinnerTimer)
        spinnerTimer = null
        return
      }

      state.spinnerIndex = (state.spinnerIndex + 1) % SPINNER_FRAMES.length
      // En cada tick sólo intentamos enviar, el limitador decide si realmente manda o no
      sendProgress(false)
    }, SPINNER_INTERVAL_MS)
  }

  async function update (percent, status, options = {}) {
    const p = typeof percent === 'number' ? percent : state.percent

    state.percent = Math.max(0, Math.min(100, p))
    if (typeof status === 'string' && status.length) {
      state.status = status
    }

    startSpinner()
    await sendProgress(options.force === true)
  }

  async function complete (status, options = {}) {
    state.finished = true
    state.percent = 100
    if (status) state.status = status

    await sendProgress(true)

    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = null
    }
  }

  async function fail (reason, options = {}) {
    state.finished = true
    state.percent = 100
    state.status = reason || 'Ocurrió un error'

    await sendProgress(true)

    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = null
    }
  }

  return {
    update,
    complete,
    fail,
  }
}

export default createProgressNotifier
