// commands/menu.js
// Menú interactivo con Native Flow (fallback a botones)

import { buildQuickReplyFlow } from '../utils/flows.js'
import { fancyBold } from '../utils/styling.js'

export async function menu({ usuario }) {
  const ownerTag = `@${String(usuario||'').split('@')[0]}`
  const flow = buildQuickReplyFlow({
    header: `🤖 ${fancyBold('KONMI BOT')}`,
    body: `╔════════════════════════╗\n║  ✨ Bienvenido ${ownerTag}  ║\n╚════════════════════════╝\n\nElige una opción:`,
    footer: 'KONMI BOT v2.5',
    buttons: [
      { text: '🤖 Mis Subbots', command: '/mybots' },
      { text: '📋 Ayuda', command: '/help' },
      { text: '🛡️ Admin', command: '/admin' },
      { text: '👥 Grupo', command: '/groupinfo' },
      { text: '🛡️ Mod', command: '/settings' },
      { text: '🧰 Utils', command: '/help utils' },
    ],
  })
  return { type: 'content', content: flow, quoted: true }
}

export async function help() {
  return {
    type: 'list',
    text: '📋 Ayuda por categorías',
    buttonText: 'Ver opciones',
    sections: [
      {
        title: 'Emparejamiento (Subbots)',
        rows: [
          { title: 'Generar Pairing Code', description: 'Sin número: usa tu propio número', id: '/code' },
          { title: 'Generar QR de Subbot', description: 'Sin número: usa tu propio número', id: '/qr' },
        ],
      },
      {
        title: 'Subbots',
        rows: [
          { title: 'Mis Subbots', description: 'Lista subbots propios', id: '/mybots' },
          { title: 'Todos los Subbots', description: 'Owner: lista global', id: '/bots' },
        ],
      },
      {
        title: 'Descargas',
        rows: [
          { title: 'Video', description: 'Descarga video', id: '/video ' },
          { title: 'Música', description: 'Descarga música', id: '/music ' },
        ],
      },
      {
        title: 'Sistema',
        rows: [
          { title: 'Estado', description: 'Info del servidor', id: '/status' },
          { title: 'Runtime', description: 'Info de Node.js', id: '/runtime' },
        ],
      },
    ],
  }
}

export default { menu, help }
