// utils/flows.js
// Construcción de mensajes interactivos nativos (Native Flow)
// Nota: si tu fork/versión de Baileys no soporta este contenido, el router
// hará fallback a botones template.

// Botón quick reply nativo
function qrBtn(text, id) {
  return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: text, id }) }
}

// Botón URL nativo
function urlBtn(text, url) {
  return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: text, url, merchant_url: url }) }
}

export function buildQuickReplyFlow({ header, body, footer, buttons = [] }) {
  const nativeButtons = buttons.map((b) => {
    const label = b.text || b.title || 'Acción'
    if (b.copy) {
      // Botón nativo: copiar al portapapeles (si el cliente lo soporta)
      return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: label, copy_code: String(b.copy), code: String(b.copy) }) }
    }
    if (b.url) return urlBtn(label, b.url)
    return qrBtn(label, b.id || b.command || '/noop')
  })
  return {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: { text: body || '' },
          footer: footer ? { text: footer } : undefined,
          header: header ? { title: header } : undefined,
          nativeFlowMessage: { buttons: nativeButtons },
          contextInfo: {},
        },
      },
    },
  }
}

export default { buildQuickReplyFlow }
