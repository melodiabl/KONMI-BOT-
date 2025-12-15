// utils/flows.js
// Utilidades para construir flujos interactivos con botones y respuestas rapidas

/**
 * Construye un flujo de respuesta rapida con botones
 * @param {Object} options - Opciones del flujo
 * @param {string} options.header - Encabezado del mensaje
 * @param {string} options.body - Cuerpo del mensaje
 * @param {string} options.footer - Pie de pagina del mensaje
 * @param {Array} options.buttons - Array de botones con {text, command|id|copy}
 * @returns {Object} Objeto de flujo para enviar
 */
export function buildQuickReplyFlow(options = {}) {
  const { header = '', body = '', footer = '', buttons = [] } = options

  const ensureSlash = (id) => {
    const s = String(id || '').trim()
    if (!s) return '/help'
    return s.startsWith('/') ? s : `/${s}`
  }

  // Construir botones en formato compatible con WhatsApp
  // Importante: evitar IDs tipo btn_0 porque el parser los ignora.
  const formattedButtons = (buttons || []).map((btn, idx) => {
    const rawId =
      btn?.command ||
      btn?.id ||
      (btn?.copy ? `/copy ${btn.copy}` : null) ||
      '/help'

    return {
      buttonId: ensureSlash(rawId),
      buttonText: { displayText: btn?.text || btn?.label || `Opcion ${idx + 1}` },
      type: 1,
    }
  })

  return {
    text: body,
    title: header,
    footer: footer,
    buttons: formattedButtons,
  }
}

export default { buildQuickReplyFlow }

