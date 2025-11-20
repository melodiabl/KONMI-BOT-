// commands/menu.js
// Menú interactivo refactorizado para usar los tipos de mensaje nativos de @itsukichan/baileys
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
  // Import registry at runtime to avoid circular dependency
  const registryMod = await import('./registry/index.js')
  const registry = registryMod.default
  const getCommandRegistry = registryMod.getCommandRegistry
  
  // Get categories from registry
  const buildCategoryIndex = registry.buildCategoryIndex || (() => {
    const reg = getCommandRegistry()
    const map = new Map()
    for (const [command, meta] of reg.entries()) {
      const category = (meta.category || 'otros').toLowerCase()
      if (!map.has(category)) map.set(category, [])
      map.get(category).push({ command, ...meta })
    }
    for (const [, entries] of map.entries()) {
      entries.sort((a, b) => a.command.localeCompare(b.command))
    }
    return map
  })
  
  const getCategoryMeta = registry.getCategoryMeta || ((category) => {
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
    const key = (category || 'otros').toLowerCase()
    return CATEGORY_META[key] || { emoji: '✨', label: 'Otros' }
  })
  
  const categories = buildCategoryIndex()
  const sections = []

  // Convert registry categories to list sections
  for (const [categoryKey, commands] of categories.entries()) {
    const meta = getCategoryMeta(categoryKey)
    const rows = commands.slice(0, 10).map(cmd => ({ // Limit to 10 per category for performance
      title: cmd.command,
      description: cmd.description.substring(0, 60) + (cmd.description.length > 60 ? '...' : ''),
      rowId: cmd.command
    }))

    if (rows.length > 0) {
      sections.push({
        title: `${meta.emoji} ${meta.label}`,
        rows: rows
      })
    }
  }

  // Add a special section for quick access
  sections.unshift({
    title: '⚡ Acceso Rápido',
    rows: [
      { title: '/menu', description: 'Volver al menú principal', rowId: '/menu' },
      { title: '/help', description: 'Mostrar esta ayuda', rowId: '/help' },
      { title: '/helpcat', description: 'Ayuda por categorías detallada', rowId: '/helpcat' },
      { title: '/status', description: 'Estado del bot', rowId: '/status' },
    ]
  })

  return sendCategorizedList('📋 *AYUDA COMPLETA*\n\nSelecciona una categoría para ver todos los comandos disponibles', sections)
}

export default { menu, help }
