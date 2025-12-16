export function createButtonMenu(config) {
  const { title, body, footer, buttons = [], mentions = [] } = config || {}

  if (!buttons || buttons.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles',
    }
  }

  const limitedButtons = buttons.slice(0, 3)

  const ensureSlash = (id) => {
    const s = String(id || '').trim()
    if (!s) return '/help'
    return s.startsWith('/') ? s : `/${s}`
  }

  const payload = {
    type: 'buttons',
    text: body || 'Selecciona una opci?n',
    footer: footer || '',
    buttons: limitedButtons.map((btn, idx) => ({
      buttonId: ensureSlash(
        btn.id ||
          btn.command ||
          btn.buttonId ||
          btn.rowId ||
          (btn.copy ? `/copy ${btn.copy}` : null) ||
          '/help',
      ),
      buttonText: {
        displayText:
          btn.text || btn.displayText || btn.title || `Opci?n ${idx + 1}`,
      },
      type: 1,
    })),
    headerType: 1,
  }

  if (title) payload.title = title
  if (mentions.length > 0) payload.mentions = mentions

  return payload
}

export async function sendInteractiveButtons(...args) {
  const normalizeButtonsArgs = (args = []) => {
    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    )
      return args[0] || {}
    if (
      args.length === 2 &&
      typeof args[0] === 'string' &&
      Array.isArray(args[1])
    )
      return { body: args[0], buttons: args[1] }
    if (args.length === 3 && typeof args[2] === 'object') return args[2] || {}
    if (args.length >= 1)
      return {
        body: String(args[0] || ''),
        buttons: Array.isArray(args[1]) ? args[1] : [],
      }
    return {}
  }
  const cfg = normalizeButtonsArgs(args)
  const { title, body, footer, buttons = [], mentions } = cfg || {}

  return createButtonMenu({
    title,
    body: body || cfg.text || cfg.message || title,
    footer,
    mentions,
    buttons: (buttons || []).map((btn) => ({
      text: btn.text || btn.buttonText || btn.title || btn.displayText,
      id: btn.id || btn.command || btn.buttonId || btn.rowId || btn.url,
    })),
  })
}

export function humanBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = Math.max(0, Number(n) || 0)
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${u[i]}`
}
