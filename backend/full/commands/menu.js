// commands/menu.js
// Menú interactivo refactorizado para usar los tipos de mensaje nativos de @itsukichan/baileys
import { sendInteractiveButtons, sendCategorizedList } from './ui-interactive.js'

export async function menu(ctx) {
  const who = (ctx && (ctx.sender || ctx.usuario || ctx.remoteJid)) || ''
  const whoTag = typeof who === 'string' && who.includes('@') ? who.split('@')[0] : String(who)

  const buttons = [
    { text: '📋 Ver Comandos', command: '/help' },
    { text: '🤖 Mis Sub-bots', command: '/mybots' },
    { text: '🛠️ Utilidades', command: '/helpcat' },
  ]

  if (ctx.isOwner) {
    buttons.push({ text: '👑 Administrador', command: '/admin' })
  }

  return sendInteractiveButtons(`🤖 *KONMI BOT*\n\n¡Hola, @${whoTag}! 👋\n\nSelecciona una opción para empezar`, buttons)
}

export async function help(ctx) {
  const sections = [
    {
      title: '🤖 Gestión de Sub-bots',
      rows: [
        { title: '🔢 Código de Emparejamiento', description: 'Conecta un sub-bot con código.', rowId: '/code' },
        { title: '📱 QR Emparejamiento', description: 'Conecta un sub-bot con QR.', rowId: '/qr' },
        { title: '👁️ Ver mis Sub-bots', description: 'Administra tus sub-bots activos.', rowId: '/mybots' },
      ],
    },
    {
      title: '📥 Descargas',
      rows: [
        { title: '▶️ Descargar Video', description: 'YouTube, TikTok, Instagram, etc.', rowId: '/video' },
        { title: '🎵 Descargar Música', description: 'Spotify, SoundCloud, YouTube Music.', rowId: '/music' },
        { title: '🎬 Descargar Audio', description: 'Extrae audio de videos.', rowId: '/audio' },
        { title: '🎨 Crear Sticker', description: 'Convierte imágenes en stickers.', rowId: '/sticker' },
      ],
    },
    {
      title: '🛠️ Utilidades',
      rows: [
        { title: '📊 Estado del Bot', description: 'Info del servidor y del bot.', rowId: '/status' },
        { title: '⚡ Ping', description: 'Mide la latencia.', rowId: '/ping' },
        { title: '🔧 Sistema', description: 'Info del sistema.', rowId: '/system' },
      ],
    },
    {
      title: '🎯 Interactivos',
      rows: [
        { title: '📋 Encuestas', description: 'Crea polls y encuestas.', rowId: '/poll' },
        { title: '📱 Listas', description: 'Crea menús con listas.', rowId: '/menucat' },
        { title: '❓ Ayuda por Categorías', description: 'Consulta ayuda detallada.', rowId: '/helpcat' },
      ],
    },
  ]

  if (ctx.isOwner) {
    sections.push({
      title: '👑 Administración',
      rows: [
        { title: '⚙️ Panel Admin', description: 'Funciones de owner.', rowId: '/admin' },
        { title: '🤖 Ver todos los Bots', description: 'Lista todos los sub-bots.', rowId: '/bots' },
        { title: '📣 Anuncio Global', description: 'Mensaje a todos los usuarios.', rowId: '/broadcast' },
      ]
    })
  }

  return sendCategorizedList('📋 *MENÚ DE COMANDOS*\n\nSelecciona una categoría para ver opciones', sections)
}

export default { menu, help }
