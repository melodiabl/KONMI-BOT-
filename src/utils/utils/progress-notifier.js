// progress-notifier.js
// Muestra un mensaje de progreso que se EDITA (spinner + barra) sin spamear mensajes

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']

const SPINNER_INTERVAL_MS = Number(process.env.PROGRESS_SPINNER_INTERVAL_MS || 400)
// Tiempo mínimo entre EDITs del mensaje (anti rate-overlimit)
const EDIT_COOLDOWN_MS = Number(process.env.PROGRESS_EDIT_COOLDOWN_MS || 700)

/**
 * Renderiza barra de progreso.
 * pct puede ser null => muestra solo "??%"
 */
function renderBar(pct, segments = 20) {
  const total = Math.max(4, segments)
  if (pct == null || Number.isNaN(pct)) {
    return '█░░░░░░░░░░░░░░░░░░░  ??%'
  }
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const filled = Math.round((p / 100) * total)
  const empty = total - filled
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}  ${p.toString().padStart(3, ' ')}%`
}

/**
 * Crea un notificador de progreso basado en edición de mensaje.
 * Recibe:
 *  - resolveSocket: () => Promise<sock>
 *  - chatId: jid
 *  - quoted: mensaje citado (opcional)
 *  - title: título del proceso
 *  - icon: emoji
 */
export function createProgressNotifier({
  resolveSocket,
  chatId,
  quoted = null,
  title = 'Procesando',
  icon = '📊',
  barLength = 20,
  animate = true
} = {}) {
  if (typeof resolveSocket !== 'function' || !chatId) {
    const noop = async () => {}
    return { update: noop, complete: noop, fail: noop }
  }

  let messageRef = null
  let spinnerIndex = 0
  let spinnerTimer = null
  let finished = false
  let muted = false
  let lastPercent = null
  let lastStatusText = 'Preparando...'
  let lastEditAt = 0

  function buildText() {
    const headerIcon = icon || '📊'
    const headerTitle = title || 'Procesando'
    const header = `${headerIcon} ${headerTitle}`

    const bar = renderBar(lastPercent, barLength)
    const spinner = animate && !finished
      ? SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length] + ' '
      : ''

    const barLine = `${spinner}${bar}`
    const status = lastStatusText || ''

    const lines = [header, '', barLine]
    if (status) {
      lines.push('', ` ${status}`)
    }
    return lines.join('\n')
  }

  async function send(force = false) {
    if (finished || muted) return messageRef

    const now = Date.now()
    if (!force && messageRef && now - lastEditAt < EDIT_COOLDOWN_MS) {
      // Demasiado pronto para otro edit
      return messageRef
    }

    const text = buildText()

    try {
      const sock = await resolveSocket()

      if (!messageRef) {
        // Primer mensaje
        const sent = await sock.sendMessage(
          chatId,
          quoted ? { text, quoted } : { text }
        )
        messageRef = sent?.key || null
      } else {
        // Edit del mensaje existente
        await sock.sendMessage(
          chatId,
          { text, edit: messageRef },
          { ephemeralExpiration: 0 }
        )
      }

      lastEditAt = now
      return messageRef
    } catch (error) {
      const msg = String(error?.message || error || '').toLowerCase()
      console.error('Progress notifier error:', msg)

      if (msg.includes('rate-overlimit') || msg.includes('rate-limit')) {
        muted = true
        finished = true
        stopSpinner()
      }

      return messageRef
    }
  }

  function ensureSpinner() {
    if (!animate || finished || spinnerTimer || muted) return
    try {
      spinnerTimer = setInterval(() => {
        try {
          spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length
        } catch {}
        // Solo re-render; respeta cooldown interno
        void send(false)
      }, SPINNER_INTERVAL_MS)
    } catch {
      // ignorar
    }
  }

  function stopSpinner() {
    try {
      if (spinnerTimer) clearInterval(spinnerTimer)
    } catch {}
    spinnerTimer = null
  }

  return {
    /**
     * Actualiza el progreso (0-100) y el texto de estado.
     * Puede llamarse muy seguido; internamente se hace throttle.
     */
    async update(percent = null, status = null, options = {}) {
      if (finished || muted) return messageRef

      if (typeof percent === 'number' && Number.isFinite(percent)) {
        lastPercent = Math.max(0, Math.min(100, Math.round(percent)))
      }

      if (typeof status === 'string' && status.trim()) {
        lastStatusText = status
      }

      ensureSpinner()
      await send(Boolean(options.force))
      return messageRef
    },

    /**
     * Marca el progreso como completado y fija mensaje final.
     */
    async complete(message = 'Completado', options = {}) {
      if (muted) return messageRef
      finished = true
      stopSpinner()
      if (typeof message === 'string' && message.trim()) {
        lastStatusText = message
      }
      // Forzamos último edit
      await send(true)
      return messageRef
    },

    /**
     * Marca el progreso como fallido y muestra mensaje de error.
     */
    async fail(reason = 'Error', options = {}) {
      if (muted) return messageRef
      finished = true
      stopSpinner()
      if (typeof reason === 'string' && reason.trim()) {
        lastStatusText = reason
      }
      await send(true)
      return messageRef
    }
  }
}

export default { createProgressNotifier }

