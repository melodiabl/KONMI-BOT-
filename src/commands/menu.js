// commands/menu.js
// Menú con botones interactivos (centralizados en router)
import { sendInteractiveButtons, sendCategorizedList } from './ui-interactive.js'

export async function menu(ctx) {
  const who = (ctx && (ctx.sender || ctx.usuario || ctx.remoteJid)) || ''
  const whoTag = typeof who === 'string' && who.includes('@') ? who.split('@')[0] : String(who)

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

  return sendInteractiveButtons(`🤖 *KONMI BOT v2.0*\n\n¡Hola, @${whoTag}! 👋\n\nSelecciona una opción para empezar:`, buttons)
}

export async function help(ctx) {
  try {
    // Import registry at runtime to avoid circular dependency
    const registryMod = await import('./registry/index.js')
    const getCommandRegistry = registryMod.getCommandRegistry

    const reg = getCommandRegistry()
    const categories = {}

    // Group commands by category
    for (const [command, meta] of reg.entries()) {
      const category = (meta.category || 'otros').toLowerCase()
      if (!categories[category]) categories[category] = []
      categories[category].push({ command, ...meta })
    }

    // Sort commands within each category
    for (const cat in categories) {
      categories[cat].sort((a, b) => a.command.localeCompare(b.command))
    }

    const CATEGORY_META = {
      ai: { emoji: '🤖', label: 'Inteligencia Artificial' },
      aportes: { emoji: '📦', label: 'Aportes' },
      broadcast: { emoji: '📢', label: 'Broadcast & Historias' },
      calls: { emoji: '📞', label: 'Llamadas' },
      chat: { emoji: '💬', label: 'Gestión de Chats' },
      demo: { emoji: '🧪', label: 'Demos' },
      files: { emoji: '🗂️', label: 'Archivos' },
      fun: { emoji: '🎉', label: 'Diversión' },
      group: { emoji: '👥', label: 'Administración de grupos' },
      info: { emoji: 'ℹ️', label: 'Información' },
      interactive: { emoji: '🎯', label: 'Mensajes Interactivos' },
      library: { emoji: '📚', label: 'Biblioteca' },
      media: { emoji: '🎬', label: 'Descargas multimedia' },
      message: { emoji: '✏️', label: 'Control de Mensajes' },
      pairing: { emoji: '🔗', label: 'Vinculación & subbots' },
      pedidos: { emoji: '🛍️', label: 'Pedidos' },
      presence: { emoji: '👀', label: 'Presencia & Estado' },
      privacy: { emoji: '🔒', label: 'Privacidad' },
      profile: { emoji: '👤', label: 'Perfil & Contactos' },
      system: { emoji: '🖥️', label: 'Sistema' },
      user: { emoji: '🙋', label: 'Cuenta' },
      utils: { emoji: '🛠️', label: 'Utilidades' },
      otros: { emoji: '✨', label: 'Otros' },
    }

    let message = '🤖 *KONMI BOT - Comandos Disponibles*\n\n';

    for (const [categoryKey, commands] of Object.entries(categories)) {
      const meta = CATEGORY_META[categoryKey] || { emoji: '✨', label: 'Otros' };
      message += `*${meta.emoji} ${meta.label}:*\n`;

      for (const cmd of commands) {
        const desc = cmd.description ? ` - ${cmd.description}` : '';
        message += `• \`${cmd.command}\`${desc}\n`;
      }
      message += '\n';
    }

    message += '📞 *Soporte:* Contacta al administrador\n';
    message += '🔗 *Web:* https://konmi.ai\n\n';
    message += '⚡ *Versión:* 2.0.0';

    return {
      success: true,
      message: message,
      quoted: true
    };

  } catch (error) {
    console.error('Error generando ayuda:', error);
    return {
      success: false,
      message: '⚠️ Error al generar la ayuda. Intenta más tarde.',
      quoted: true
    };
  }
}

export default { menu, help }
