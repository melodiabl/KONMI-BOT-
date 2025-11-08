// commands/registry/index.js
// Registro centralizado de comandos con categorías, alias y descripciones con emojis

import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleFacebookDownload,
  handleTwitterDownload,
  handlePinterestDownload,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTriviaCommand,
  handleMemeCommand,
  handleMusicDownload,
  handleVideoDownload,
  handleSpotifySearch,
} from '../download-commands.js'

import * as ai from '../ai.js'
import * as admin from '../admin.js'
import * as adminMenu from '../admin-menu.js'
import * as aporteCmd from '../aportes.js'
import * as botctl from '../bot-control.js'
import * as broadcast from '../broadcast.js'
import * as content from '../content.js'
import * as demo from '../demo.js'
import * as diag from '../diag.js'
import * as files from '../files.js'
import * as gextra from '../group-extra.js'
import * as groupAdminX from '../group-admin-extra.js'
import * as groupCmd from '../groups.js'
import * as groupSettings from '../group-settings.js'
import * as images from '../images.js'
import * as maintenance from '../maintenance.js'
import * as menu from '../menu.js'
import * as mod from '../moderation.js'
import * as pairing from '../pairing.js'
import * as pedidoCmd from '../pedidos.js'
import * as promo from '../promo.js'
import * as stickers from '../stickers.js'
import * as subbots from '../subbots.js'
import * as sysInfo from '../system-info.js'
import * as system from '../system.js'
import * as utils from '../utils.js'
import * as utilmath from '../util-math.js'
import * as votes from '../votes.js'
import * as logsCmd from '../logs.js'

import { promotionalLinks } from '../../config/links.js'
import { getTheme } from '../../utils/theme.js'

const registry = new Map()

function normalizeCommand(cmd) {
  if (!cmd) return ''
  const trimmed = String(cmd).trim().toLowerCase()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function add(command, handler, meta = {}) {
  const cmd = normalizeCommand(command)
  if (!cmd || typeof handler !== 'function') return
  const entry = {
    handler,
    category: (meta.category || 'otros').toLowerCase(),
    description: meta.description || '',
    aliasOf: meta.aliasOf || null,
  }
  registry.set(cmd, entry)
}

function alias(command, target, meta = {}) {
  const cmd = normalizeCommand(command)
  const base = normalizeCommand(target)
  add(cmd, async (ctx) => {
    const entry = registry.get(base)
    if (!entry || typeof entry.handler !== 'function') {
      throw new Error(`Comando base no disponible: ${base}`)
    }
    return entry.handler(ctx)
  }, {
    ...meta,
    aliasOf: base,
    category: (meta.category || registry.get(base)?.category || 'otros').toLowerCase(),
    description: meta.description || `Alias de ${base}`,
  })
}

function register(entries = []) {
  for (const entry of entries) {
    if (!entry || !entry.command) continue
    if (entry.aliasOf) {
      alias(entry.command, entry.aliasOf, entry)
    } else {
      add(entry.command, entry.handler, entry)
    }
  }
}

const CATEGORY_META = {
  ai: { emoji: '🤖', label: 'Inteligencia Artificial' },
  aportes: { emoji: '📦', label: 'Aportes' },
  demo: { emoji: '🧪', label: 'Demos' },
  files: { emoji: '🗂️', label: 'Archivos' },
  fun: { emoji: '🎉', label: 'Diversión' },
  group: { emoji: '👥', label: 'Administración de grupos' },
  info: { emoji: 'ℹ️', label: 'Información' },
  library: { emoji: '📚', label: 'Biblioteca' },
  media: { emoji: '🎬', label: 'Descargas multimedia' },
  pairing: { emoji: '🔗', label: 'Vinculación & subbots' },
  pedidos: { emoji: '🛍️', label: 'Pedidos' },
  system: { emoji: '🖥️', label: 'Sistema' },
  user: { emoji: '🙋', label: 'Cuenta' },
  utils: { emoji: '🛠️', label: 'Utilidades' },
  otros: { emoji: '✨', label: 'Otros' },
}

function getCategoryMeta(category) {
  const key = (category || 'otros').toLowerCase()
  return CATEGORY_META[key] || { emoji: '✨', label: 'Otros' }
}

function buildCategoryIndex() {
  const map = new Map()
  for (const [command, meta] of registry.entries()) {
    const category = (meta.category || 'otros').toLowerCase()
    if (!map.has(category)) map.set(category, [])
    map.get(category).push({ command, ...meta })
  }
  for (const [, entries] of map.entries()) {
    entries.sort((a, b) => a.command.localeCompare(b.command))
  }
  return map
}

async function buildHelp(ctx) {
  const theme = getTheme()
  const categories = buildCategoryIndex()
  const selected = (ctx?.args?.[0] || '').toLowerCase()
  if (selected && categories.has(selected)) {
    const entries = categories.get(selected)
    const meta = getCategoryMeta(selected)
    const lines = entries.map((entry) => {
      const aliasSuffix = entry.aliasOf ? ' (alias)' : ''
      const desc = entry.description ? ` → ${entry.description}` : ''
      return `${meta.emoji} ${entry.command}${aliasSuffix}${desc}`
    })
    const summary = [
      theme.header('KONMI BOT'),
      `${meta.emoji} ${theme.accent} ${meta.label}`,
      '',
      lines.join('\n') || 'Sin comandos registrados en esta categoría.',
      '',
      theme.footer(),
    ].join('\n')
    return [
      { success: true, message: summary, quoted: true },
      {
        type: 'buttons',
        text: '¿Qué deseas hacer ahora?',
        footer: 'KONMI BOT',
        buttons: [
          { text: '⬅️ Volver al menú', command: '/help' },
          { text: '🏠 Menú interactivo', command: '/menu' },
          { text: '🧪 SelfTest', command: '/selftest' },
        ],
        quoted: true,
      },
    ]
  }

  const orderedCategories = Array.from(categories.entries())
    .sort(([a], [b]) => a.localeCompare(b))
  const sectionRows = orderedCategories.map(([key, entries]) => {
    const meta = getCategoryMeta(key)
    return {
      title: `${meta.emoji} ${meta.label}`,
      description: `${entries.length} comando(s)`,
      id: `/help ${key}`,
    }
  })

  const sections = []
  if (sectionRows.length) {
    sections.push({
      title: `${theme.accent} Categorías disponibles`,
      rows: sectionRows,
    })
  }
  if (Array.isArray(promotionalLinks) && promotionalLinks.length) {
    sections.push({
      title: '🌐 Comunidad',
      rows: promotionalLinks.map((link, idx) => ({
        title: link.text || `Enlace ${idx + 1}`,
        description: link.url || '',
        id: link.url ? `url|${link.url}` : `/noop`,
      })),
    })
  }
  sections.push({
    title: '⚡ Accesos rápidos',
    rows: [
      { title: '📋 Ver comandos recientes', description: 'Top de comandos usados', id: '/topcmd' },
      { title: '🧾 Ver mis subbots', description: 'Gestiona tus subbots vinculados', id: '/mybots' },
      { title: '🛠️ Configuración del bot', description: 'Ajustes rápidos', id: '/settings' },
    ],
  })

  const summaryLines = orderedCategories.map(([key, entries]) => {
    const meta = getCategoryMeta(key)
    return `${meta.emoji} ${meta.label}: ${entries.length}`
  })
  const summary = [
    theme.header('KONMI BOT'),
    `${theme.accent} ${theme.strings.helpTitle}`,
    '',
    summaryLines.join('\n'),
    '',
    '✨ Usa el menú para explorar una categoría o envía `/help <categoría>`',
    theme.footer(),
  ].join('\n')

  return [
    {
      type: 'list',
      text: `${theme.accent} ${theme.strings.helpTitle}`,
      buttonText: `${theme.accent} ${theme.strings.viewOptions}`,
      sections,
      footer: 'KONMI BOT',
      quoted: true,
    },
    { success: true, message: summary, quoted: true },
    {
      type: 'buttons',
      text: 'Accesos directos',
      footer: 'KONMI BOT',
      buttons: [
        { text: '🎛️ Panel', command: '/config' },
        { text: '🤖 Mis Subbots', command: '/mybots' },
        { text: '🏠 Menú', command: '/menu' },
      ],
      quoted: true,
    },
  ]
}

register([
  // Inteligencia Artificial
  { command: '/ai', handler: (ctx) => ai.ai(ctx), category: 'ai', description: 'Chat con IA Gemini avanzado' },
  { command: '/ia', aliasOf: '/ai', category: 'ai' },
  { command: '/clasificar', handler: (ctx) => ai.clasificar(ctx), category: 'ai', description: 'Clasifica texto automáticamente' },
  { command: '/listclasificados', handler: () => ai.listClasificados(), category: 'ai', description: 'Listado de clasificaciones guardadas' },

  // Gestión de usuarios
  { command: '/registrar', handler: (ctx) => system.registrar(ctx), category: 'user', description: 'Crear cuenta en el panel' },
  { command: '/resetpass', handler: (ctx) => system.resetpass(ctx), category: 'user', description: 'Restablecer contraseña del panel' },
  { command: '/miinfo', handler: (ctx) => system.miinfo(ctx), category: 'user', description: 'Ver tu información de cuenta' },

  // Administración de grupos
  { command: '/addgroup', handler: (ctx) => groupCmd.addGroup(ctx), category: 'group', description: 'Registrar grupo en la base de datos' },
  { command: '/delgroup', handler: (ctx) => groupCmd.delGroup(ctx), category: 'group', description: 'Eliminar grupo del panel' },
  { command: '/kick', handler: (ctx) => groupCmd.kick(ctx), category: 'group', description: 'Expulsar a un usuario del grupo' },
  { command: '/promote', handler: (ctx) => groupCmd.promote(ctx), category: 'group', description: 'Ascender a un miembro a admin' },
  { command: '/demote', handler: (ctx) => groupCmd.demote(ctx), category: 'group', description: 'Degradar a un admin' },
  { command: '/lock', handler: (ctx) => groupCmd.lock(ctx), category: 'group', description: 'Cerrar el grupo' },
  { command: '/unlock', handler: (ctx) => groupCmd.unlock(ctx), category: 'group', description: 'Abrir el grupo' },
  { command: '/tag', handler: (ctx) => groupCmd.tag(ctx), category: 'group', description: 'Mencionar a un usuario' },
  { command: '/whoami', handler: (ctx) => groupCmd.whoami(ctx), category: 'group', description: 'Identifica tu rol en el grupo' },
  { command: '/debugadmin', handler: (ctx) => groupCmd.debugadmin(ctx), category: 'group', description: 'Diagnóstico de privilegios' },
  { command: '/admins', handler: (ctx) => groupCmd.admins(ctx), category: 'group', description: 'Lista de administradores' },
  { command: '/debuggroup', handler: (ctx) => groupCmd.debuggroup(ctx), category: 'group', description: 'Información completa del grupo' },
  { command: '/adminmenu', handler: (ctx) => adminMenu.adminMenu(ctx), category: 'group', description: 'Panel rápido para admins' },
  { command: '/admin', aliasOf: '/adminmenu', category: 'group' },
  { command: '/tagall', handler: (ctx) => gextra.tagall(ctx), category: 'group', description: 'Mencionar a todos en el grupo' },
  { command: '/all', aliasOf: '/tagall', category: 'group' },
  { command: '/groupinfo', handler: (ctx) => gextra.groupinfo(ctx), category: 'group', description: 'Resumen del grupo' },
  { command: '/muteall', handler: (ctx) => groupAdminX.muteall(ctx), category: 'group', description: 'Silenciar a todos los miembros' },
  { command: '/lockinfo', handler: (ctx) => groupAdminX.lockinfo(ctx), category: 'group', description: 'Configurar mensaje de cierre' },
  { command: '/subject', handler: (ctx) => groupAdminX.subject(ctx), category: 'group', description: 'Cambiar el asunto del grupo' },
  { command: '/desc', handler: (ctx) => groupAdminX.desc(ctx), category: 'group', description: 'Actualizar descripción del grupo' },
  { command: '/invite', handler: (ctx) => groupAdminX.invite(ctx), category: 'group', description: 'Obtener enlace de invitación' },
  { command: '/warn', handler: (ctx) => mod.warn(ctx), category: 'group', description: 'Aplicar advertencia a un usuario' },
  { command: '/unwarn', handler: (ctx) => mod.unwarn(ctx), category: 'group', description: 'Retirar advertencia' },
  { command: '/warns', handler: (ctx) => mod.warns(ctx), category: 'group', description: 'Ver advertencias activas' },
  { command: '/antilink', handler: (ctx) => groupSettings.antilink(ctx), category: 'group', description: 'Activar protección contra links' },
  { command: '/antilinkmode', handler: (ctx) => groupSettings.antilinkmode(ctx), category: 'group', description: 'Modo de acción del anti-link' },
  { command: '/slowmode', handler: (ctx) => groupSettings.slowmode(ctx), category: 'group', description: 'Configurar slowmode' },
  { command: '/antiflood', handler: (ctx) => groupSettings.antiflood(ctx), category: 'group', description: 'Controlar spam masivo' },
  { command: '/antifloodmode', handler: (ctx) => groupSettings.antifloodmode(ctx), category: 'group', description: 'Modo del anti-flood' },
  { command: '/antifloodrate', handler: (ctx) => groupSettings.antifloodrate(ctx), category: 'group', description: 'Limitar mensajes por minuto' },
  { command: '/welcome', handler: (ctx) => groupSettings.welcome(ctx), category: 'group', description: 'Activar bienvenida automática' },
  { command: '/setwelcome', handler: (ctx) => groupSettings.setwelcome(ctx), category: 'group', description: 'Personalizar mensaje de bienvenida' },
  { command: '/settings', handler: (ctx) => groupSettings.settings(ctx), category: 'group', description: 'Panel de configuración del grupo' },
  { command: '/rules', handler: (ctx) => groupSettings.rules(ctx), category: 'group', description: 'Mostrar reglas del grupo' },
  { command: '/setrules', handler: (ctx) => groupSettings.setrules(ctx), category: 'group', description: 'Actualizar reglas del grupo' },

  // Sistema y mantenimiento
  { command: '/cleansession', handler: () => system.cleanSession(), category: 'system', description: 'Borrar sesión local de WhatsApp' },
  { command: '/logs', handler: (ctx) => system.logs(ctx), category: 'system', description: 'Buscar registros del sistema' },
  { command: '/config', handler: (ctx) => system.config(ctx), category: 'system', description: 'Resumen de configuración activa' },
  { command: '/update', handler: (ctx) => maintenance.update(ctx), category: 'system', description: 'Actualizar el bot a la última versión' },
  { command: '/upgrade', aliasOf: '/update', category: 'system' },
  { command: '/actualizar', aliasOf: '/update', category: 'system' },

  // Aportes
  { command: '/myaportes', handler: (ctx) => aporteCmd.myAportes(ctx), category: 'aportes', description: 'Mis aportes registrados' },
  { command: '/aportes', handler: (ctx) => aporteCmd.listAportes(ctx), category: 'aportes', description: 'Listado global de aportes' },
  { command: '/aporteestado', handler: (ctx) => aporteCmd.setAporteEstado(ctx), category: 'aportes', description: 'Actualizar estado de un aporte' },
  { command: '/addaporte', handler: (ctx) => aporteCmd.addAporteWithMedia(ctx), category: 'aportes', description: 'Crear aporte con archivo' },

  // Pedidos
  { command: '/pedido', handler: (ctx) => pedidoCmd.pedido(ctx), category: 'pedidos', description: 'Registrar un nuevo pedido' },
  { command: '/pedidos', handler: (ctx) => pedidoCmd.pedidos(ctx), category: 'pedidos', description: 'Ver pedidos disponibles' },

  // Media y descargas
  { command: '/video', handler: ({ args, usuario }) => handleVideoDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar videos desde múltiples fuentes' },
  { command: '/music', handler: ({ args, usuario }) => handleMusicDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar música en MP3' },
  { command: '/musica', aliasOf: '/music', category: 'media' },
  { command: '/youtube', aliasOf: '/video', category: 'media' },
  { command: '/spotify', handler: ({ args, usuario }) => handleSpotifySearch((args || []).join(' ').trim(), usuario), category: 'media', description: 'Buscar música en Spotify' },
  { command: '/spot', aliasOf: '/spotify', category: 'media' },
  { command: '/download', aliasOf: '/video', category: 'media' },
  { command: '/dl', aliasOf: '/video', category: 'media' },
  { command: '/descargar', aliasOf: '/video', category: 'media' },
  { command: '/tiktok', handler: ({ args, usuario }) => handleTikTokDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar videos de TikTok' },
  { command: '/tt', aliasOf: '/tiktok', category: 'media' },
  { command: '/tiktoksearch', handler: ({ args, usuario }) => {
    const query = (args || []).join(' ').trim()
    if (!query) {
      return { success: false, message: '❌ Uso: /tiktoksearch <texto o URL>\n\nPega un enlace directo o usa /video <consulta>.' }
    }
    if (/tiktok\.com/i.test(query)) {
      return handleTikTokDownload(query, usuario)
    }
    return { success: false, message: '🔎 Aún no tengo buscador de TikTok por texto. Pega un enlace o usa /video.' }
  }, category: 'media', description: 'Guía para descargar desde TikTok' },
  { command: '/instagram', handler: ({ args, usuario }) => handleInstagramDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar reels y publicaciones de Instagram' },
  { command: '/ig', aliasOf: '/instagram', category: 'media' },
  { command: '/facebook', handler: ({ args, usuario }) => handleFacebookDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar videos de Facebook' },
  { command: '/fb', aliasOf: '/facebook', category: 'media' },
  { command: '/twitter', handler: ({ args, usuario }) => handleTwitterDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar multimedia de Twitter/X' },
  { command: '/x', aliasOf: '/twitter', category: 'media' },
  { command: '/pinterest', handler: ({ args, usuario }) => handlePinterestDownload((args || []).join(' ').trim(), usuario), category: 'media', description: 'Descargar ideas desde Pinterest' },

  // Imágenes y utilidades creativas
  { command: '/image', handler: (ctx) => images.imageFromPrompt(ctx), category: 'utils', description: 'Generar imagen con IA' },
  { command: '/imagen', aliasOf: '/image', category: 'utils' },
  { command: '/brat', handler: (ctx) => images.brat(ctx), category: 'utils', description: 'Generar sticker estilo BRAT' },
  { command: '/bratvd', handler: (ctx) => images.bratvd(ctx), category: 'utils', description: 'Generar sticker estilo BRAT VD' },

  // Diversión
  { command: '/quote', handler: ({ usuario }) => handleQuote(usuario), category: 'fun', description: 'Frase inspiradora aleatoria' },
  { command: '/frase', aliasOf: '/quote', category: 'fun' },
  { command: '/fact', handler: ({ usuario }) => handleFact(usuario), category: 'fun', description: 'Dato curioso del día' },
  { command: '/dato', aliasOf: '/fact', category: 'fun' },
  { command: '/trivia', handler: ({ usuario }) => handleTriviaCommand(usuario), category: 'fun', description: 'Pregunta de trivia aleatoria' },
  { command: '/meme', handler: ({ usuario }) => handleMemeCommand(usuario), category: 'fun', description: 'Memes al instante' },
  { command: '/joke', handler: ({ usuario }) => handleFact(usuario), category: 'fun', description: 'Chiste corto' },
  { command: '/chiste', aliasOf: '/joke', category: 'fun' },

  // Información del sistema
  { command: '/status', handler: () => sysInfo.status(), category: 'info', description: 'Estado resumido del bot' },
  { command: '/runtime', handler: () => sysInfo.runtime(), category: 'info', description: 'Información de tiempo de ejecución' },
  { command: '/info', aliasOf: '/status', category: 'info' },
  { command: '/test', handler: ({ usuario }) => ({ success: true, message: `✅ Bot funcionando\n\n👤 ${usuario}\n🕒 ${new Date().toLocaleString('es-ES')}` }), category: 'info', description: 'Comprobar si el bot responde' },
  { command: '/ping', handler: () => ({ success: true, message: '🏓 Pong' }), category: 'info', description: 'Prueba rápida de latencia' },
  { command: '/mynumber', aliasOf: '/whoami', category: 'info' },

  // Pairing / QR
  { command: '/qr', handler: (ctx) => pairing.qr(ctx), category: 'pairing', description: 'Generar código QR para vincular' },
  { command: '/code', handler: (ctx) => pairing.code(ctx), category: 'pairing', description: 'Generar código de emparejamiento' },
  { command: '/codigo', aliasOf: '/code', category: 'pairing' },
  { command: '/code_legacy', aliasOf: '/code', category: 'pairing' },
  { command: '/paircode', aliasOf: '/code', category: 'pairing' },
  { command: '/bots', handler: (ctx) => subbots.all(ctx), category: 'pairing', description: 'Lista todos los subbots (Owner)' },
  { command: '/mybots', handler: (ctx) => subbots.mine(ctx), category: 'pairing', description: 'Ver tus subbots vinculados' },
  { command: '/mibots', aliasOf: '/mybots', category: 'pairing' },

  // Biblioteca de contenido
  { command: '/manhwas', handler: () => content.listManhwas(), category: 'library', description: 'Lista de manhwas disponibles' },
  { command: '/addmanhwa', handler: (ctx) => content.addManhwa(ctx), category: 'library', description: 'Agregar nuevo manhwa' },
  { command: '/series', handler: () => content.listSeries(), category: 'library', description: 'Series disponibles' },
  { command: '/addserie', handler: (ctx) => content.addSerie(ctx), category: 'library', description: 'Registrar nueva serie' },
  { command: '/extra', handler: () => content.listExtra(), category: 'aportes', description: 'Contenido extra disponible' },
  { command: '/ilustraciones', handler: () => content.listIlustraciones(), category: 'aportes', description: 'Listado de ilustraciones' },
  { command: '/obtenerextra', handler: (ctx) => content.obtenerExtra(ctx), category: 'aportes', description: 'Obtener un extra específico' },
  { command: '/obtenerilustracion', handler: (ctx) => content.obtenerIlustracion(ctx), category: 'aportes', description: 'Obtener ilustración por código' },
  { command: '/obtenerpack', handler: (ctx) => content.obtenerPack(ctx), category: 'aportes', description: 'Recibir un pack multimedia' },
  { command: '/obtenermanhwa', handler: (ctx) => content.obtenerManhwa(ctx), category: 'library', description: 'Descargar manhwa por código' },

  // Archivos
  { command: '/guardar', handler: (ctx) => files.guardar(ctx), category: 'files', description: 'Guardar archivo adjunto' },
  { command: '/save', aliasOf: '/guardar', category: 'files' },
  { command: '/archivos', handler: (ctx) => files.archivos(ctx), category: 'files', description: 'Listado de archivos globales' },
  { command: '/files', aliasOf: '/archivos', category: 'files' },
  { command: '/misarchivos', handler: (ctx) => files.misArchivos(ctx), category: 'files', description: 'Archivos que subiste' },
  { command: '/myfiles', aliasOf: '/misarchivos', category: 'files' },
  { command: '/buscararchivo', handler: (ctx) => files.buscarArchivo(ctx), category: 'files', description: 'Buscar archivo por texto' },
  { command: '/findfile', aliasOf: '/buscararchivo', category: 'files' },
  { command: '/estadisticas', handler: () => files.estadisticas(), category: 'files', description: 'Estadísticas de archivos' },
  { command: '/stats', aliasOf: '/estadisticas', category: 'files' },

  // Utilidades varias
  { command: '/translate', handler: ({ args, usuario }) => {
    const text = (args || []).slice(0, -1).join(' ').trim()
    const target = (args || []).slice(-1)[0] || 'es'
    return handleTranslate(text, target, usuario)
  }, category: 'utils', description: 'Traducir textos a otro idioma' },
  { command: '/weather', handler: ({ args, usuario }) => handleWeather((args || []).join(' ').trim(), usuario), category: 'utils', description: 'Consultar el clima' },
  { command: '/clima', aliasOf: '/weather', category: 'utils' },
  { command: '/short', handler: ({ args, usuario }) => utils.shortUrl((args || []).join(' ').trim(), usuario), category: 'utils', description: 'Acortar enlaces largos' },
  { command: '/acortar', aliasOf: '/short', category: 'utils' },
  { command: '/tts', handler: (ctx) => utils.tts(ctx), category: 'utils', description: 'Texto a voz en varios idiomas' },
  { command: '/calc', handler: (ctx) => utilmath.calc(ctx), category: 'utils', description: 'Calculadora avanzada' },
  { command: '/stickerurl', handler: (ctx) => stickers.stickerurl(ctx), category: 'utils', description: 'Crear sticker desde URL' },
  { command: '/toimg', handler: (ctx) => stickers.toimg(ctx), category: 'utils', description: 'Convertir sticker a imagen' },
  { command: '/sticker', handler: (ctx) => stickers.sticker(ctx), category: 'utils', description: 'Crear sticker desde imagen/video' },
  { command: '/promo', handler: (ctx) => promo.promo(ctx), category: 'utils', description: 'Compartir enlaces promocionales' },

  // Administración avanzada
  { command: '/owner', handler: (ctx) => admin.ownerInfo(ctx), category: 'system', description: 'Ver datos del owner' },
  { command: '/checkowner', handler: (ctx) => admin.checkOwner(ctx), category: 'system', description: 'Verificar si eres owner' },
  { command: '/setowner', handler: (ctx) => admin.setOwner(ctx), category: 'system', description: 'Configurar número owner' },
  { command: '/debugme', handler: (ctx) => admin.debugMe(ctx), category: 'system', description: 'Debug de usuario en panel' },
  { command: '/debugfull', handler: (ctx) => admin.debugFull(ctx), category: 'system', description: 'Debug completo del bot' },
  { command: '/testadmin', handler: (ctx) => admin.testAdmin(ctx), category: 'system', description: 'Verifica privilegios actuales' },
  { command: '/debugbot', handler: (ctx) => admin.debugBot(ctx), category: 'system', description: 'Estado de Baileys y subprocesos' },
  { command: '/broadcast', handler: (ctx) => broadcast.broadcast(ctx), category: 'system', description: 'Enviar difusión a múltiples chats' },
  { command: '/bot', handler: (ctx) => botctl.bot(ctx), category: 'group', description: 'Información del bot y controles rápidos' },

  // Logs
  { command: '/logfind', handler: (ctx) => logsCmd.find(ctx), category: 'system', description: 'Buscar en logs' },
  { command: '/topcmd', handler: (ctx) => logsCmd.topcmd(ctx), category: 'system', description: 'Ranking de comandos usados' },

  // Demos y herramientas de diagnóstico
  { command: '/menu', handler: (ctx) => menu.menu(ctx), category: 'info', description: 'Menú interactivo con botones' },
  { command: '/help', handler: (ctx) => buildHelp(ctx), category: 'info', description: 'Mostrar ayuda por categorías' },
  { command: '/ayuda', aliasOf: '/help', category: 'info' },
  { command: '/comandos', aliasOf: '/help', category: 'info' },
  { command: '/poll', handler: (ctx) => demo.poll(ctx), category: 'demo', description: 'Crear una encuesta rápida' },
  { command: '/location', handler: (ctx) => demo.location(ctx), category: 'demo', description: 'Enviar ubicación de prueba' },
  { command: '/contact', handler: (ctx) => demo.contact(ctx), category: 'demo', description: 'Compartir contacto de ejemplo' },
  { command: '/buttons', handler: (ctx) => demo.buttons(ctx), category: 'demo', description: 'Demostración de botones' },
  { command: '/listdemo', handler: (ctx) => demo.listdemo(ctx), category: 'demo', description: 'Demostración de lista interactiva' },
  { command: '/live', handler: (ctx) => demo.live(ctx), category: 'demo', description: 'Enviar ubicación en vivo (demo)' },
  { command: '/react', handler: (ctx) => demo.react(ctx), category: 'demo', description: 'Reaccionar a un mensaje' },
  { command: '/edit', handler: (ctx) => demo.edit(ctx), category: 'demo', description: 'Editar un mensaje enviado' },
  { command: '/delete', handler: (ctx) => demo.del(ctx), category: 'demo', description: 'Eliminar mensaje enviado' },
  { command: '/presence', handler: (ctx) => demo.presence(ctx), category: 'demo', description: 'Cambiar presencia (escribiendo...)' },
  { command: '/selftest', handler: (ctx) => diag.selftest(ctx), category: 'system', description: 'Diagnóstico completo del bot' },
  { command: '/diag', aliasOf: '/selftest', category: 'system' },
  { command: '/diagnostico', aliasOf: '/selftest', category: 'system' },

  // Votaciones
  { command: '/crearvotacion', handler: (ctx) => votes.crear(ctx), category: 'group', description: 'Crear votación en grupo' },
  { command: '/votar', handler: (ctx) => votes.votar(ctx), category: 'group', description: 'Emitir voto en encuesta activa' },
  { command: '/cerrarvotacion', handler: (ctx) => votes.cerrar(ctx), category: 'group', description: 'Cerrar votación activa' },
])

export function getCommandRegistry() {
  return registry
}

export default { getCommandRegistry }
