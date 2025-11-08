// commands/admin-menu.js
import { buildQuickReplyFlow } from '../utils/flows.js'

export async function adminMenu() {
  const flow = buildQuickReplyFlow({
    header: '🛡️ Panel de Administración',
    body: 'Accesos rápidos para administración del bot y grupos',
    footer: 'KONMI BOT',
    buttons: [
      { text: '👑 Ver admins', command: '/admins' },
      { text: '⚙️ Bot', command: '/bot' },
      { text: '📊 Estado', command: '/status' },
      { text: '🏠 Menú', command: '/menu' },
      { text: '📋 Ayuda', command: '/help' },
    ],
  })
  return { type: 'content', content: flow, quoted: true, ephemeralDuration: 300 }
}

export default { adminMenu }

