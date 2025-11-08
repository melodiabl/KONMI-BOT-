// utils/ux.js
// Estilizado y helpers UX unificados para respuestas de comandos

import { fancyBold, bold, italic, mono } from './styling.js'

function headerLine(title = 'KONMI BOT') {
  const t = `${fancyBold(title)}`
  return `╔════════ ${t} ════════╗`
}

function footerLine() {
  return `╚══════════════════════════════╝`
}

export function stylizeText(raw = '', { title = 'KONMI BOT', withFrame = true } = {}) {
  const body = String(raw || '').trim()
  if (!withFrame) return body
  return `${headerLine(title)}\n${body}\n${footerLine()}`
}

export function defaultEphemeralSeconds() {
  const v = Number(process.env.PREFER_EPHEMERAL_SECONDS || '0')
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function maybeStyleText(raw, opts) {
  const enable = String(process.env.STYLING_ENABLE || 'true').toLowerCase() === 'true'
  if (!enable) return String(raw || '')
  return stylizeText(raw, opts)
}

export default { stylizeText, maybeStyleText, defaultEphemeralSeconds }

