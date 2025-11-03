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
  const nativeButtons = buttons.map(b => (b.url ? urlBtn(b.text || b.title, b.url) : qrBtn(b.text || b.title, b.id || b.command)))
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

