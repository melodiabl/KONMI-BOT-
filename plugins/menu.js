import { sendInteractiveButtons } from './ui-interactive.js'

export async function menu(ctx) {
  const who = (ctx && (ctx.sender || ctx.usuario || ctx.remoteJid)) || ''
  const whoTag =
    typeof who === 'string' && who.includes('@') ? who.split('@')[0] : String(who)

  const buttons = [
    { text: '📋 Todos los Comandos', command: '/help' },
    { text: '🤖 Mis Sub-bots', command: '/mybots' },
    { text: '📥 Descargar Media', command: '/video' },
    { text: '🎯 Interactivos', command: '/poll' },
    { text: '🛠️ Utilidades', command: '/status' },
    { text: '📱 Copiar Código', command: '/copy' },
  ]

  if (ctx.isOwner) {
    buttons.push({ text: '👑 Panel Admin', command: '/admin' })
  }

  return sendInteractiveButtons(
    `🤖 *KONMI BOT v2.0*\n\n¡Hola, @${whoTag}! 👋\n\nSelecciona una opción para empezar:`,
    buttons,
  )
}
