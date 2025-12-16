import { getTheme } from '../plugins/utils/utils/theme.js'
import { promotionalLinks } from './config/config/links.js'

export async function help(ctx, commandMap) {
  const registry = commandMap
  const theme = getTheme()

  const buildCategoryIndex = () => {
    const map = new Map()
    for (const [command, mod] of registry.entries()) {
      const category = (mod.category || 'otros').toLowerCase()
      if (!map.has(category)) map.set(category, [])
      map.get(category).push({ command, ...mod })
    }
    for (const [, entries] of map.entries()) {
      entries.sort((a, b) => a.command.localeCompare(b.command))
    }
    return map
  }

  const getCategoryMeta = (category) => {
    const CATEGORY_META = {
      ai: { emoji: '🤖', label: 'Inteligencia Artificial' },
      aportes: { emoji: '📦', label: 'Aportes' },
      broadcast: { emoji: '📢', label: 'Broadcast & Historias' },
      calls: { emoji: '📞', label: 'Llamadas' },
      chat: { emoji: '💬', label: 'Gestión de Chats' },
      demo: { emoji: '🧪', label: 'Demos' },
      files: { emoji: '🗂️', label: 'Archivos' },
      fun: { emoji: '🎉', label: 'Diversión' },
      games: { emoji: '🎮', label: 'Juegos' },
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
  }

  const categories = buildCategoryIndex()
  const selectedCategory = (ctx?.args?.[0] || '').toLowerCase()

  // Si se pide una categoría específica, mostrar solo esa.
  if (selectedCategory && categories.has(selectedCategory)) {
    const entries = categories.get(selectedCategory)
    const meta = getCategoryMeta(selectedCategory)
    const lines = entries
      .map((entry) => {
        const desc = entry.description ? ` - ${entry.description}` : ''
        return `› *${entry.command}*${desc}`
      })
      .join('\n')

    const message = `${meta.emoji} *${
      meta.label
    }*\n\n${lines || 'No hay comandos en esta categoría.'}`

    return {
      type: 'buttons',
      text: message,
      footer: 'Usa /help para volver al menú principal.',
      buttons: [
        { buttonId: '/help', buttonText: { displayText: '⬅️ Volver' }, type: 1 },
      ],
    }
  }

  // Si no, construir el mensaje de lista unificado.
  const orderedCategories = Array.from(categories.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  const categoryRows = orderedCategories.map(([key, entries]) => {
    const meta = getCategoryMeta(key)
    return {
      title: `${meta.emoji} ${meta.label}`,
      description: `${entries.length} comando(s) disponible(s)`,
      rowId: `/help ${key}`,
    }
  })

  const sections = []

  if (categoryRows.length) {
    sections.push({
      title: '🔎 Elige una categoría para ver sus comandos',
      rows: categoryRows,
    })
  }

  const quickAccessRows = [
    {
      title: '🤖 Mis Sub-bots',
      description: 'Gestiona tus bots vinculados',
      rowId: '/mybots',
    },
    {
      title: '⚙️ Ajustes del Grupo',
      description: 'Configuraciones rápidas (admins)',
      rowId: '/settings',
    },
    {
      title: '📈 Estado del Bot',
      description: 'Verifica si el bot está operativo',
      rowId: '/status',
    },
  ]
  sections.push({ title: '⚡ Accesos Rápidos', rows: quickAccessRows })

  if (promotionalLinks && promotionalLinks.length > 0) {
    const communityRows = promotionalLinks.map((link) => ({
      title: `🌐 ${link.text}`,
      description: link.url || 'Enlace a la comunidad',
      rowId: `url|${link.url}`,
    }))
    sections.push({ title: '🤝 Comunidad', rows: communityRows })
  }

  const mentionJid =
    (ctx && (ctx.fromMe ? ctx.remoteJid : ctx.sender || ctx.usuario)) ||
    undefined
  const resolveDisplayName = () => {
    try {
      if (
        ctx?.isGroup &&
        ctx?.groupMetadata &&
        Array.isArray(ctx.groupMetadata.participants)
      ) {
        const p = ctx.groupMetadata.participants.find(
          (x) => x?.id === (ctx.sender || ctx.usuario),
        )
        if (p?.notify) return p.notify
        if (p?.name) return p.name
      }
      if (ctx?.pushName) return ctx.pushName
      if (ctx?.usuarioName) return ctx.usuarioName
      const num = (ctx?.sender || ctx?.usuario || '').toString().split('@')[0]
      return num || 'usuario'
    } catch (e) {
      const num = (ctx?.sender || ctx?.usuario || '').toString().split('@')[0]
      return num || 'usuario'
    }
  }
  const displayName = resolveDisplayName()
  const mainText = [
    `*¡Hola, ${displayName}!* 👋`,
    'Soy Konmi Bot, tu asistente personal.',
    'Aquí tienes todas las categorías de comandos disponibles. Selecciona una para ver los detalles.',
  ].join('\n\n')

  return {
    type: 'list',
    text: mainText,
    title: '📋 Menú Principal de Ayuda',
    buttonText: 'Ver Categorías',
    footer: 'Konmi Bot v3.0 | Elige una opción de la lista',
    sections,
    mentions: [mentionJid].filter(Boolean),
  }
}
