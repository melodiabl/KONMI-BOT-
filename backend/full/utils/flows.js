// utils/flows.js
// Utilidades para construir flujos interactivos con botones y respuestas rápidas

/**
 * Construye un flujo de respuesta rápida con botones
 * @param {Object} options - Opciones del flujo
 * @param {string} options.header - Encabezado del mensaje
 * @param {string} options.body - Cuerpo del mensaje
 * @param {string} options.footer - Pie de página del mensaje
 * @param {Array} options.buttons - Array de botones con {text, command}
 * @returns {Object} Objeto de flujo para enviar
 */
export function buildQuickReplyFlow(options = {}) {
  const { header = '', body = '', footer = '', buttons = [] } = options

  // Construir botones en formato compatible con WhatsApp
  const formattedButtons = buttons.map((btn, idx) => ({
    buttonId: btn.command || btn.id || `btn_${idx}`,
    buttonText: { displayText: btn.text || btn.label || `Opción ${idx + 1}` },
    type: 1,
  }))

  return {
    text: body,
    title: header,
    footer: footer,
    buttons: formattedButtons,
  }
}

export default { buildQuickReplyFlow }
