// commands/admin-menu.js
import { sendInteractiveButtons, sendCategorizedList } from './ui-interactive.js'

export async function adminMenu() {
  const buttons = [
    { text: '👑 Ver Admins', command: '/admins' },
    { text: '⚙️ Control Bot', command: '/bot' },
  ]
  
  return sendInteractiveButtons('🛡️ *PANEL DE ADMINISTRACIÓN*\n\nAccesos rápidos para admin', buttons)
}

export default { adminMenu }

