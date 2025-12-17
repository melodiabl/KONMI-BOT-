// utils/utils/progress-notifier.js
// Sistema de progreso FLUIDO con edición garantizada del mismo mensaje

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// Configuración optimizada para fluidez
const SPINNER_INTERVAL_MS = 200
const MIN_SEND_INTERVAL_MS = 3000  // Aumentado de 1500 a 3000ms para evitar rate limit
const MIN_PERCENT_STEP = 5  // Aumentado de 1 a 5% para reducir actualizaciones
const PROGRESS_BAR_LENGTH = 20
const FORCE_UPDATE_EVERY_MS = 5000
const MAX_RETRY_SEND = 3 // Reintentos para enviar mensaje inicial

function renderProgressBar(percent, length = PROGRESS_BAR_LENGTH) {
  const p = Math.max(0, Math.min(100, percent || 0))
  const filled = Math.round((p / 100) * length)
  const empty = Math.max(0, length - filled)
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`
}

function buildProgressMessage(state) {
  const { title, icon, spinnerIndex, percent, status, finished, eta } = state
  const spinner = finished ? '✅' : SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length]
  const bar = renderProgressBar(percent)
  const pct = String(Math.max(0, Math.min(100, Math.floor(percent)))).padStart(3, ' ')

  const header = `${icon || spinner} *${title || 'Procesando...'}*`
  const progressLine = `${spinner} ${bar} ${pct}%`
  const statusLine = status ? `\n📌 ${status}` : ''
  const etaLine = eta ? `\n⏱️ ${eta}` : ''

  return `${header}\n\n${progressLine}${statusLine}${etaLine}`
}

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
    return {
      async update() {},
      async complete() {},
      async fail() {},
    }
  }

  const state = {
    title,
    icon,
    percent: 0,
    status: '',
    eta: null,
    spinnerIndex: 0,
    finished: false,
    lastSentAt: 0,
    lastPercentSent: 0,
    lastTextSent: '',
    lastForceUpdateAt: 0,
    startTime: Date.now(),
  }

  const messageRef = {
    sock: null,
    key: null,
    messageId: null, // ID único del mensaje
    initialized: false, // Flag para saber si ya enviamos el mensaje inicial
    initPromise: null, // Promise del primer envío
  }

  let spinnerTimer = null
  let pendingUpdate = false
  let updateQueue = [] // Cola de actualizaciones pendientes

  async function ensureSocket() {
    if (messageRef.sock) return messageRef.sock
    const sock = await resolveSocket()
    messageRef.sock = sock
    return sock
  }

  function calculateETA() {
    if (state.percent <= 0 || state.percent >= 100) return null

    const elapsed = Date.now() - state.startTime
    const rate = state.percent / elapsed
    const remaining = (100 - state.percent) / rate

    const seconds = Math.floor(remaining / 1000)
    if (seconds < 5) return 'Casi listo...'
    if (seconds < 60) return `~${seconds}s`

    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `~${mins}m ${secs}s`
  }

  function shouldSend(nextPercent, nextText, force) {
    if (force) return true

    const now = Date.now()

    // Actualización forzada periódica
    if (now - state.lastForceUpdateAt > FORCE_UPDATE_EVERY_MS) {
      return true
    }

    // Rate limiting básico
    if (now - state.lastSentAt < MIN_SEND_INTERVAL_MS) return false

    // Permitir cambios de 1% o más
    const percentDiff = Math.abs((nextPercent || 0) - (state.lastPercentSent || 0))
    if (percentDiff >= MIN_PERCENT_STEP) return true

    // Permitir si cambió el texto de estado
    if (nextText && nextText !== state.lastTextSent) return true

    return false
  }

  /**
   * Inicializa el mensaje de progreso (primer envío)
   * Se asegura de que solo se ejecute UNA vez
   */
  async function initializeMessage() {
    // Si ya está inicializado, no hacer nada
    if (messageRef.initialized) {
      return messageRef.key
    }

    // Si ya hay un intento de inicialización en curso, esperar a que termine
    if (messageRef.initPromise) {
      return messageRef.initPromise
    }

    // Crear la promesa de inicialización
    messageRef.initPromise = (async () => {
      const sock = await ensureSocket()
      if (!sock) {
        throw new Error('No se pudo obtener socket')
      }

      const text = buildProgressMessage(state)
      const payload = { text }

      if (quoted) {
        payload.quoted = quoted
      }

      let lastError = null

      // Intentar enviar el mensaje inicial con reintentos
      for (let attempt = 1; attempt <= MAX_RETRY_SEND; attempt++) {
        try {
          console.log(`📤 Enviando mensaje inicial (intento ${attempt}/${MAX_RETRY_SEND})...`)

          const sent = await sock.sendMessage(chatId, payload)

          if (sent?.key) {
            messageRef.key = sent.key
            messageRef.messageId = sent.key.id
            messageRef.initialized = true

            console.log(`✅ Mensaje inicial enviado exitosamente (ID: ${messageRef.messageId})`)

            state.lastSentAt = Date.now()
            state.lastPercentSent = state.percent
            state.lastTextSent = text

            return messageRef.key
          }
        } catch (err) {
          lastError = err
          console.warn(`⚠️  Intento ${attempt} fallido:`, err.message)

          // Esperar un poco antes de reintentar
          if (attempt < MAX_RETRY_SEND) {
            await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          }
        }
      }

      // Si todos los intentos fallaron, no lanzar error, solo loguear
      console.error(`❌ Error en progress notifier: No se pudo enviar mensaje inicial después de ${MAX_RETRY_SEND} intentos: ${lastError?.message}`)
      messageRef.initialized = true // Marcar como inicializado para evitar más intentos
      return null
    })()

    return messageRef.initPromise
  }

  /**
   * Envía o edita el mensaje de progreso
   * GARANTIZA que siempre edite el mismo mensaje
   */
  async function sendProgress(force = false) {
    if (pendingUpdate && !force) {
      // Si hay una actualización pendiente, agregar a la cola
      updateQueue.push({ force, timestamp: Date.now() })
      return
    }

    try {
      pendingUpdate = true

      // Asegurar que el mensaje inicial exista
      if (!messageRef.initialized) {
        await initializeMessage()
      }

      // Si no tenemos key después de inicializar, silenciosamente no hacer nada
      if (!messageRef.key) {
        // No loguear error para evitar spam, simplemente no actualizar
        return
      }

      const sock = await ensureSocket()
      if (!sock) return

      // Calcular ETA
      if (state.percent > 0 && state.percent < 100 && !state.finished) {
        state.eta = calculateETA()
      }

      const text = buildProgressMessage(state)
      const percent = state.percent || 0

      if (!shouldSend(percent, text, force)) {
        return
      }

      const payload = {
        text,
        edit: messageRef.key, // SIEMPRE editar el mismo mensaje
      }

      // Intentar editar el mensaje
      try {
        await sock.sendMessage(chatId, payload)

        const now = Date.now()
        state.lastSentAt = now
        state.lastPercentSent = percent
        state.lastTextSent = text

        if (force || (now - state.lastForceUpdateAt > FORCE_UPDATE_EVERY_MS)) {
          state.lastForceUpdateAt = now
        }

        // console.log(`✏️  Mensaje editado (${percent}%): ${messageRef.messageId}`)
      } catch (editError) {
        // Si la edición falla, puede ser que el mensaje fue eliminado
        const errorMsg = String(editError?.message || editError || '')

        if (/not found|message.?not.?found/i.test(errorMsg)) {
          console.warn('⚠️  Mensaje no encontrado, reinicializando...')

          // Reset y reinicializar
          messageRef.initialized = false
          messageRef.key = null
          messageRef.messageId = null
          messageRef.initPromise = null

          // Intentar enviar un nuevo mensaje
          await initializeMessage()
        } else if (/rate.?overlimit/i.test(errorMsg)) {
          console.warn('⚠️  Rate limit detectado, reduciendo frecuencia...')
        } else {
          console.error('❌ Error editando mensaje:', errorMsg)
        }
      }

    } catch (err) {
      const code = String(err?.output?.statusCode || err?.code || err?.message || '')
      if (/rate.?overlimit/i.test(code)) {
        console.warn('⚠️  Rate limit detectado, ajustando frecuencia...')
      } else {
        console.error('❌ Error en progress notifier:', err?.message || err)
      }
    } finally {
      pendingUpdate = false

      // Procesar cola si hay actualizaciones pendientes
      if (updateQueue.length > 0) {
        const next = updateQueue.shift()
        if (next && Date.now() - next.timestamp < 5000) { // Solo si es reciente
          setTimeout(() => sendProgress(next.force), 100)
        } else {
          updateQueue = [] // Limpiar cola si es muy antigua
        }
      }
    }
  }

  function startSpinner() {
    if (!animate || spinnerTimer) return

    spinnerTimer = setInterval(() => {
      if (state.finished) {
        clearInterval(spinnerTimer)
        spinnerTimer = null
        return
      }

      state.spinnerIndex = (state.spinnerIndex + 1) % SPINNER_FRAMES.length
      sendProgress(false).catch(() => {})
    }, SPINNER_INTERVAL_MS)
  }

  async function update(percent, status, options = {}) {
    const p = typeof percent === 'number' ? percent : state.percent
    state.percent = Math.max(0, Math.min(100, p))

    if (typeof status === 'string' && status.length) {
      state.status = status
    }

    startSpinner()
    await sendProgress(options.force === true)
  }

  async function complete(status, options = {}) {
    state.finished = true
    state.percent = 100
    state.eta = null
    if (status) state.status = status

    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = null
    }

    await sendProgress(true)
  }

  async function fail(reason, options = {}) {
    state.finished = true
    state.percent = 100
    state.eta = null
    state.status = reason || '❌ Error en la descarga'

    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = null
    }

    await sendProgress(true)
  }

  // Cleanup al destruir
  function cleanup() {
    if (spinnerTimer) {
      clearInterval(spinnerTimer)
      spinnerTimer = null
    }
    updateQueue = []
  }

  return {
    update,
    complete,
    fail,
    cleanup, // Método para limpiar recursos si es necesario
  }
}

export default createProgressNotifier
