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
  const wrappedHandler = async (ctx) => {
    const normalizedCtx = normalizeContext(ctx)
    return handler(normalizedCtx)
  }
  const entry = {
    handler: wrappedHandler,
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

// --- Carga de Módulos a Prueba de Fallos ---
async function safeImport(modulePath) {
  try {
    const mod = await import(modulePath)
    return mod
  } catch (e) {
    console.error(`⚠️ ERROR: No se pudo importar el módulo ${modulePath}. Los comandos asociados no se cargarán.`, e?.message || e)
    return {}
  }
}

// Carga de módulos
const [
  downloadCmd, ai, admin, adminMenu, aporteCmd, botctl, broadcastOld, content, demo, diag, files, gextra,
  groupAdminX, groupCmd, groupSettings, images, maintenance, menu, mod, pairing, pedidoCmd, promo,
  stickers, subbots, sysInfo, system, utils, utilmath, votes, logsCmd, polls,
  media, messageControl, interactive, profile, privacy, groupAdvanced, broadcast, chatMgmt, presence, calls, uiInteractive
] = await Promise.all([
  safeImport('../download-commands.js'),
  safeImport('../ai.js'),
  safeImport('../admin.js'),
  safeImport('../admin-menu.js'),
  safeImport('../aportes.js'),
  safeImport('../bot-control.js'),
  safeImport('../broadcast.js'),
  safeImport('../content.js'),
  safeImport('../demo.js'),
  safeImport('../diag.js'),
  safeImport('../files.js'),
  safeImport('../group-extra.js'),
  safeImport('../group-admin-extra.js'),
  safeImport('../groups.js'),
  safeImport('../group-settings.js'),
  safeImport('../images.js'),
  safeImport('../maintenance.js'),
  safeImport('../menu.js'),
  safeImport('../moderation.js'),
  safeImport('../pairing.js'),
  safeImport('../pedidos.js'),
  safeImport('../promo.js'),
  safeImport('../stickers.js'),
  safeImport('../subbots.js'),
  safeImport('../system-info.js'),
  safeImport('../system.js'),
  safeImport('../utils.js'),
  safeImport('../util-math.js'),
  safeImport('../votes.js'),
  safeImport('../logs.js'),
  safeImport('../polls.js'),
  safeImport('../media.js'),
  safeImport('../message-control.js'),
  safeImport('../interactive.js'),
  safeImport('../profile.js'),
  safeImport('../privacy.js'),
  safeImport('../group-advanced.js'),
  safeImport('../broadcast.js'),
  safeImport('../chat-management.js'),
  safeImport('../presence.js'),
  safeImport('../calls.js'),
  safeImport('../ui-interactive.js'),
])

// Desestructuración de comandos de download-commands.js
const {
  handleTikTokDownload, handleInstagramDownload, handleFacebookDownload, handleTwitterDownload,
  handlePinterestDownload, handleTranslate, handleWeather, handleQuote, handleFact,
  handleTriviaCommand, handleMemeCommand, handleMusicDownload, handleVideoDownload,
  handleSpotifySearch,
} = downloadCmd

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

function getCategoryMeta(category) {
  const key = (category || 'otros').toLowerCase()
  return CATEGORY_META[key] || { emoji: '✨', label: 'Otros' }
}

function normalizeContext(ctx = {}) {
  const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
  return {
    ...ctx,
    usuarioNumber: ctx.usuarioNumber || ctx.senderNumber || onlyDigits(ctx.sender || ''),
    usuario: ctx.usuario || ctx.sender || '',
    botNumber: ctx.botNumber || onlyDigits(ctx.botJid || ''),
    isAdmin: !!ctx.isAdmin,
    isBotAdmin: !!ctx.isBotAdmin,
    isGroup: !!ctx.isGroup,
    isOwner: !!ctx.isOwner,
  }
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
  const theme = getTheme();
  const categories = buildCategoryIndex();
  const selectedCategory = (ctx?.args?.[0] || '').toLowerCase();

  // Si se pide una categoría específica, mostrar solo esa.
  if (selectedCategory && categories.has(selectedCategory)) {
    const entries = categories.get(selectedCategory);
    const meta = getCategoryMeta(selectedCategory);
    const lines = entries.map((entry) => {
      const aliasSuffix = entry.aliasOf ? ` (alias de ${entry.aliasOf})` : '';
      const desc = entry.description ? ` - ${entry.description}` : '';
      return `› *${entry.command}*${aliasSuffix}${desc}`;
    }).join('\n');

    const message = `${meta.emoji} *${meta.label}*\n\n${lines || 'No hay comandos en esta categoría.'}`;

    return {
      type: 'buttons',
      text: message,
      footer: 'Usa /help para volver al menú principal.',
      buttons: [{ buttonId: '/help', buttonText: { displayText: '⬅️ Volver' }, type: 1 }],
    };
  }

  // Si no, construir el mensaje de lista unificado.
  const orderedCategories = Array.from(categories.entries()).sort(([a], [b]) => a.localeCompare(b));

  const categoryRows = orderedCategories.map(([key, entries]) => {
    const meta = getCategoryMeta(key);
    return {
      title: `${meta.emoji} ${meta.label}`,
      description: `${entries.length} comando(s) disponible(s)`,
      rowId: `/help ${key}`,
    };
  });

  const sections = [];

  if (categoryRows.length) {
    sections.push({
      title: "🔎 Elige una categoría para ver sus comandos",
      rows: categoryRows,
    });
  }

  const quickAccessRows = [
    { title: '🤖 Mis Sub-bots', description: 'Gestiona tus bots vinculados', rowId: '/mybots' },
    { title: '⚙️ Ajustes del Grupo', description: 'Configuraciones rápidas (admins)', rowId: '/settings' },
    { title: '📈 Estado del Bot', description: 'Verifica si el bot está operativo', rowId: '/status' },
  ];
  sections.push({ title: "⚡ Accesos Rápidos", rows: quickAccessRows });

  if (promotionalLinks && promotionalLinks.length > 0) {
      const communityRows = promotionalLinks.map(link => ({
          title: `🌐 ${link.text}`,
          description: link.url || 'Enlace a la comunidad',
          rowId: `url|${link.url}`
      }));
      sections.push({ title: "🤝 Comunidad", rows: communityRows });
  }

  const who = (ctx && (ctx.sender || ctx.usuario || ctx.remoteJid)) || ''
  const whoTag = typeof who === 'string' && who.includes('@') ? who.split('@')[0] : String(who)
  const mentionJid = (ctx && (ctx.fromMe ? ctx.remoteJid : (ctx.sender || ctx.usuario))) || undefined
  const mainText = [
    `*¡Hola, @${whoTag}!* 👋`,
    "Soy Konmi Bot, tu asistente personal.",
    "Aquí tienes todas las categorías de comandos disponibles. Selecciona una para ver los detalles.",
  ].join('\n\n');

  return {
    type: 'list',
    text: mainText,
    title: '📋 Menú Principal de Ayuda',
    buttonText: 'Ver Categorías',
    footer: 'Konmi Bot v3.0 | Elige una opción de la lista',
    sections,
    mentions: [mentionJid].filter(Boolean),
  };
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
  { command: '/poll', handler: (ctx) => polls.poll(ctx), category: 'group', description: 'Crear una encuesta nativa' }, // Actualizado

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
  { command: '/video', handler: (ctx) => handleVideoDownload(ctx), category: 'media', description: 'Descargar videos desde múltiples fuentes' },
  { command: '/music', handler: (ctx) => handleMusicDownload(ctx), category: 'media', description: 'Descargar música en MP3' },
  { command: '/musica', aliasOf: '/music', category: 'media' },
  { command: '/youtube', aliasOf: '/video', category: 'media' },
  { command: '/spotify', handler: (ctx) => handleSpotifySearch(ctx), category: 'media', description: 'Buscar música en Spotify' },
  { command: '/spot', aliasOf: '/spotify', category: 'media' },
  { command: '/download', aliasOf: '/video', category: 'media' },
  { command: '/dl', aliasOf: '/video', category: 'media' },
  { command: '/descargar', aliasOf: '/video', category: 'media' },
  { command: '/tiktok', handler: (ctx) => handleTikTokDownload(ctx), category: 'media', description: 'Descargar videos de TikTok' },
  { command: '/tt', aliasOf: '/tiktok', category: 'media' },
  { command: '/tiktoksearch', handler: (ctx) => {
    const query = (ctx.args || []).join(' ').trim();
    if (!query) {
      return { success: false, message: '❌ Uso: /tiktoksearch <texto o URL>\n\nPega un enlace directo o usa /video <consulta>.' };
    }
    if (/tiktok\.com/i.test(query)) {
      return handleTikTokDownload(ctx);
    }
    return { success: false, message: '🔎 Aún no tengo buscador de TikTok por texto. Pega un enlace o usa /video.' };
  }, category: 'media', description: 'Guía para descargar desde TikTok' },
  { command: '/instagram', handler: (ctx) => handleInstagramDownload(ctx), category: 'media', description: 'Descargar reels y publicaciones de Instagram' },
  { command: '/ig', aliasOf: '/instagram', category: 'media' },
  { command: '/facebook', handler: (ctx) => handleFacebookDownload(ctx), category: 'media', description: 'Descargar videos de Facebook' },
  { command: '/fb', aliasOf: '/facebook', category: 'media' },
  { command: '/twitter', handler: (ctx) => handleTwitterDownload(ctx), category: 'media', description: 'Descargar multimedia de Twitter/X' },
  { command: '/x', aliasOf: '/twitter', category: 'media' },
  { command: '/pinterest', handler: (ctx) => handlePinterestDownload(ctx), category: 'media', description: 'Descargar ideas desde Pinterest' },

  // Imágenes y utilidades creativas
  { command: '/image', handler: (ctx) => images.imageFromPrompt(ctx), category: 'utils', description: 'Generar imagen con IA' },
  { command: '/imagen', aliasOf: '/image', category: 'utils' },
  { command: '/brat', handler: (ctx) => images.brat(ctx), category: 'utils', description: 'Generar sticker estilo BRAT' },
  { command: '/bratvd', handler: (ctx) => images.bratvd(ctx), category: 'utils', description: 'Generar sticker estilo BRAT VD' },

  // Diversión
  { command: '/quote', handler: (ctx) => handleQuote(ctx), category: 'fun', description: 'Frase inspiradora aleatoria' },
  { command: '/frase', aliasOf: '/quote', category: 'fun' },
  { command: '/fact', handler: (ctx) => handleFact(ctx), category: 'fun', description: 'Dato curioso del día' },
  { command: '/dato', aliasOf: '/fact', category: 'fun' },
  { command: '/trivia', handler: (ctx) => handleTriviaCommand(ctx), category: 'fun', description: 'Pregunta de trivia aleatoria' },
  { command: '/meme', handler: (ctx) => handleMemeCommand(ctx), category: 'fun', description: 'Memes al instante' },
  { command: '/joke', handler: (ctx) => handleFact(ctx), category: 'fun', description: 'Chiste corto' },
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

  // Utilidades
  { command: '/sticker', handler: (ctx) => stickers.sticker(ctx), category: 'utils', description: 'Crear sticker desde imagen/video' },
  { command: '/stickerurl', handler: (ctx) => stickers.stickerUrl(ctx), category: 'utils', description: 'Crear sticker desde URL' },
  { command: '/toimg', handler: (ctx) => stickers.toimg(ctx), category: 'utils', description: 'Convertir sticker a imagen' },
  { command: '/calc', handler: (ctx) => utilmath.calc(ctx), category: 'utils', description: 'Calculadora matemática' },
  { command: '/short', handler: (ctx) => utils.short(ctx), category: 'utils', description: 'Acortar una URL' },
  { command: '/acortar', aliasOf: '/short', category: 'utils' },
  { command: '/translate', handler: (ctx) => handleTranslate(ctx), category: 'utils', description: 'Traducir texto a otro idioma' },
  { command: '/tts', handler: (ctx) => utils.tts(ctx), category: 'utils', description: 'Convertir texto a voz' },
  { command: '/weather', handler: (ctx) => handleWeather(ctx), category: 'utils', description: 'Consultar el clima' },
  { command: '/clima', aliasOf: '/weather', category: 'utils' },

  // Archivos
  { command: '/files', handler: (ctx) => files.listFiles(ctx), category: 'files', description: 'Listar archivos guardados' },
  { command: '/archivos', aliasOf: '/files', category: 'files' },
  { command: '/save', handler: (ctx) => files.saveFile(ctx), category: 'files', description: 'Guardar archivo en la nube' },
  { command: '/guardar', aliasOf: '/save', category: 'files' },
  { command: '/findfile', handler: (ctx) => files.findFile(ctx), category: 'files', description: 'Buscar archivo por nombre' },
  { command: '/buscararchivo', aliasOf: '/findfile', category: 'files' },
  { command: '/myfiles', handler: (ctx) => files.myFiles(ctx), category: 'files', description: 'Ver mis archivos guardados' },
  { command: '/misarchivos', aliasOf: '/myfiles', category: 'files' },

  // Biblioteca
  { command: '/addmanhwa', handler: (ctx) => content.addManhwa(ctx), category: 'library', description: 'Añadir manhwa a la biblioteca' },
  { command: '/addserie', handler: (ctx) => content.addSerie(ctx), category: 'library', description: 'Añadir serie a la biblioteca' },
  { command: '/manhwas', handler: (ctx) => content.listManhwas(ctx), category: 'library', description: 'Ver manhwas disponibles' },
  { command: '/series', handler: (ctx) => content.listSeries(ctx), category: 'library', description: 'Ver series disponibles' },
  { command: '/obtenermanhwa', handler: (ctx) => content.getManhwa(ctx), category: 'library', description: 'Obtener un manhwa' },
  { command: '/obtenerilustracion', handler: (ctx) => content.getIlustracion(ctx), category: 'library', description: 'Obtener una ilustración' },
  { command: '/obtenerpack', handler: (ctx) => content.getPack(ctx), category: 'library', description: 'Obtener un pack' },
  { command: '/obtenerextra', handler: (ctx) => content.getExtra(ctx), category: 'library', description: 'Obtener contenido extra' },
  { command: '/ilustraciones', handler: (ctx) => content.listIlustraciones(ctx), category: 'library', description: 'Ver ilustraciones' },
  { command: '/extra', handler: (ctx) => content.listExtras(ctx), category: 'library', description: 'Ver contenido extra' },

  // Promociones
  { command: '/promo', handler: (ctx) => promo.promo(ctx), category: 'info', description: 'Ver promociones activas' },

  // Logs
  { command: '/logfind', handler: (ctx) => logsCmd.find(ctx), category: 'system', description: 'Buscar en logs' },
  { command: '/topcmd', handler: (ctx) => logsCmd.topcmd(ctx), category: 'system', description: 'Ranking de comandos usados' },

  // Demos y herramientas de diagnóstico
  { command: '/menu', handler: (ctx) => menu.menu(ctx), category: 'info', description: 'Menú interactivo con botones' },
  { command: '/help', handler: (ctx) => buildHelp(ctx), category: 'info', description: 'Mostrar ayuda por categorías' },
  { command: '/ayuda', aliasOf: '/help', category: 'info' },
  { command: '/comandos', aliasOf: '/help', category: 'info' },
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

  // Media Messages
  { command: '/sendimage', handler: (ctx) => media.sendImage(ctx), category: 'media', description: 'Enviar imagen desde URL' },
  { command: '/sendvideo', handler: (ctx) => media.sendVideo(ctx), category: 'media', description: 'Enviar video desde URL' },
  { command: '/sendaudio', handler: (ctx) => media.sendAudio(ctx), category: 'media', description: 'Enviar audio desde URL' },
  { command: '/sendgif', handler: (ctx) => media.sendGif(ctx), category: 'media', description: 'Enviar GIF' },
  { command: '/senddoc', handler: (ctx) => media.sendDocument(ctx), category: 'media', description: 'Enviar documento' },
  { command: '/sendcontact', handler: (ctx) => media.sendContact(ctx), category: 'media', description: 'Enviar contacto' },
  { command: '/sendlocation', handler: (ctx) => media.sendLocation(ctx), category: 'media', description: 'Enviar ubicación' },
  { command: '/downloadmedia', handler: (ctx) => media.downloadMedia(ctx), category: 'media', description: 'Descargar media de un mensaje' },

  // Message Control
  { command: '/editmsg', handler: (ctx) => messageControl.editMessage(ctx), category: 'message', description: 'Editar un mensaje' },
  { command: '/delmsg', handler: (ctx) => messageControl.deleteMessage(ctx), category: 'message', description: 'Eliminar un mensaje para todos' },
  { command: '/reactmsg', handler: (ctx) => messageControl.reactMessage(ctx), category: 'message', description: 'Reaccionar a un mensaje' },
  { command: '/removereact', handler: (ctx) => messageControl.removeReaction(ctx), category: 'message', description: 'Remover reacción' },
  { command: '/pinmsg', handler: (ctx) => messageControl.pinMessage(ctx), category: 'message', description: 'Fijar un mensaje' },
  { command: '/unpinmsg', handler: (ctx) => messageControl.unpinMessage(ctx), category: 'message', description: 'Desfijar un mensaje' },
  { command: '/starmsg', handler: (ctx) => messageControl.starMessage(ctx), category: 'message', description: 'Marcar mensaje como favorito' },
  { command: '/unstarmsg', handler: (ctx) => messageControl.unstarMessage(ctx), category: 'message', description: 'Desmarcar mensaje' },

  // Interactive Messages
  { command: '/poll', handler: (ctx) => interactive.createPoll(ctx), category: 'interactive', description: 'Crear encuesta' },
  { command: '/multipoll', handler: (ctx) => interactive.createMultiSelectPoll(ctx), category: 'interactive', description: 'Encuesta multi-selección' },
  { command: '/list', handler: (ctx) => interactive.createList(ctx), category: 'interactive', description: 'Crear lista interactiva' },
  { command: '/forward', handler: (ctx) => interactive.forwardMessage(ctx), category: 'interactive', description: 'Reenviar un mensaje' },
  { command: '/viewonce', handler: (ctx) => interactive.createViewOnce(ctx), category: 'interactive', description: 'Crear mensaje que desaparece tras verlo' },

  // Profile Management
  { command: '/getprofile', handler: (ctx) => profile.getProfile(ctx), category: 'profile', description: 'Obtener perfil de un usuario' },
  { command: '/getpfp', handler: (ctx) => profile.getProfilePicture(ctx), category: 'profile', description: 'Obtener foto de perfil' },
  { command: '/setname', handler: (ctx) => profile.updateProfileName(ctx), category: 'profile', description: 'Cambiar nombre de perfil' },
  { command: '/setstatus', handler: (ctx) => profile.updateProfileStatus(ctx), category: 'profile', description: 'Cambiar estado' },
  { command: '/setpfp', handler: (ctx) => profile.updateProfilePicture(ctx), category: 'profile', description: 'Cambiar foto de perfil' },
  { command: '/delpfp', handler: (ctx) => profile.removeProfilePicture(ctx), category: 'profile', description: 'Remover foto de perfil' },
  { command: '/business', handler: (ctx) => profile.getBusinessProfile(ctx), category: 'profile', description: 'Obtener perfil de negocio' },
  { command: '/presence', handler: (ctx) => profile.getPresence(ctx), category: 'profile', description: 'Ver presencia de usuario' },
  { command: '/checkuser', handler: (ctx) => profile.checkUserExists(ctx), category: 'profile', description: 'Verificar si existe en WhatsApp' },

  // Privacy Settings
  { command: '/block', handler: (ctx) => privacy.blockUser(ctx), category: 'privacy', description: 'Bloquear usuario' },
  { command: '/unblock', handler: (ctx) => privacy.unblockUser(ctx), category: 'privacy', description: 'Desbloquear usuario' },
  { command: '/blocklist', handler: (ctx) => privacy.getBlockList(ctx), category: 'privacy', description: 'Ver usuarios bloqueados' },
  { command: '/privacysettings', handler: (ctx) => privacy.getPrivacySettings(ctx), category: 'privacy', description: 'Ver configuración de privacidad' },
  { command: '/privacy_lastseen', handler: (ctx) => privacy.updateLastSeenPrivacy(ctx), category: 'privacy', description: 'Privacidad de "última conexión"' },
  { command: '/privacy_online', handler: (ctx) => privacy.updateOnlinePrivacy(ctx), category: 'privacy', description: 'Privacidad de estado en línea' },
  { command: '/privacy_pfp', handler: (ctx) => privacy.updateProfilePicturePrivacy(ctx), category: 'privacy', description: 'Privacidad de foto' },
  { command: '/privacy_status', handler: (ctx) => privacy.updateStatusPrivacy(ctx), category: 'privacy', description: 'Privacidad de estado' },
  { command: '/privacy_receipts', handler: (ctx) => privacy.updateReadReceiptsPrivacy(ctx), category: 'privacy', description: 'Privacidad de confirmación de lectura' },
  { command: '/privacy_groupadd', handler: (ctx) => privacy.updateGroupAddPrivacy(ctx), category: 'privacy', description: 'Privacidad: agregar a grupos' },

  // Advanced Group Management
  { command: '/makegroupfor', handler: (ctx) => groupAdvanced.createGroup(ctx), category: 'group', description: 'Crear grupo con participantes' },
  { command: '/groupinfo2', handler: (ctx) => groupAdvanced.getGroupInfo(ctx), category: 'group', description: 'Información detallada del grupo' },
  { command: '/leavegrp', handler: (ctx) => groupAdvanced.leaveGroup(ctx), category: 'group', description: 'Salir del grupo' },
  { command: '/groupname', handler: (ctx) => groupAdvanced.changeGroupSubject(ctx), category: 'group', description: 'Cambiar nombre del grupo' },
  { command: '/groupdesc', handler: (ctx) => groupAdvanced.changeGroupDescription(ctx), category: 'group', description: 'Cambiar descripción del grupo' },
  { command: '/grouppfp', handler: (ctx) => groupAdvanced.changeGroupPicture(ctx), category: 'group', description: 'Cambiar foto del grupo' },
  { command: '/delpfpgroup', handler: (ctx) => groupAdvanced.removeGroupPicture(ctx), category: 'group', description: 'Remover foto del grupo' },
  { command: '/announce', handler: (ctx) => groupAdvanced.toggleAnnouncement(ctx), category: 'group', description: 'Modo solo admins' },
  { command: '/noannounce', handler: (ctx) => groupAdvanced.toggleAnnounceOff(ctx), category: 'group', description: 'Desactivar modo anuncio' },
  { command: '/lockgrp', handler: (ctx) => groupAdvanced.toggleGroupLocked(ctx), category: 'group', description: 'Bloquear grupo' },
  { command: '/unlockgrp', handler: (ctx) => groupAdvanced.toggleGroupUnlocked(ctx), category: 'group', description: 'Desbloquear grupo' },
  { command: '/invitecode', handler: (ctx) => groupAdvanced.getGroupInviteCode(ctx), category: 'group', description: 'Obtener código de invitación' },
  { command: '/revokeinvite', handler: (ctx) => groupAdvanced.revokeGroupInvite(ctx), category: 'group', description: 'Revocar código de invitación' },
  { command: '/joingroupcode', handler: (ctx) => groupAdvanced.joinGroupByCode(ctx), category: 'group', description: 'Unirse a grupo con código' },
  { command: '/ephemeral', handler: (ctx) => groupAdvanced.toggleEphemeral(ctx), category: 'group', description: 'Mensajes que desaparecen' },
  { command: '/requests', handler: (ctx) => groupAdvanced.getGroupRequestList(ctx), category: 'group', description: 'Ver solicitudes de unirse' },
  { command: '/approvereq', handler: (ctx) => groupAdvanced.approveGroupRequest(ctx), category: 'group', description: 'Aprobar solicitud' },
  { command: '/rejectreq', handler: (ctx) => groupAdvanced.rejectGroupRequest(ctx), category: 'group', description: 'Rechazar solicitud' },

  // Broadcast & Stories
  { command: '/makelist', handler: (ctx) => broadcast.createBroadcastList(ctx), category: 'broadcast', description: 'Crear lista de broadcast' },
  { command: '/addtolist', handler: (ctx) => broadcast.addToBroadcastList(ctx), category: 'broadcast', description: 'Agregar contactos a lista' },
  { command: '/broadcast', handler: (ctx) => broadcast.sendBroadcast(ctx), category: 'broadcast', description: 'Enviar mensaje a lista' },
  { command: '/story', handler: (ctx) => broadcast.sendStory(ctx), category: 'broadcast', description: 'Compartir en historia' },
  { command: '/storymedia', handler: (ctx) => broadcast.sendMediaStory(ctx), category: 'broadcast', description: 'Compartir media en historia' },
  { command: '/mybcasts', handler: (ctx) => broadcast.listBroadcasts(ctx), category: 'broadcast', description: 'Ver mis listas' },
  { command: '/dellist', handler: (ctx) => broadcast.deleteBroadcastList(ctx), category: 'broadcast', description: 'Eliminar lista' },
  { command: '/listmembers', handler: (ctx) => broadcast.listBroadcastRecipients(ctx), category: 'broadcast', description: 'Ver miembros de lista' },

  // Chat Management
  { command: '/mutechat', handler: (ctx) => chatMgmt.muteChat(ctx), category: 'chat', description: 'Silenciar chat' },
  { command: '/unmutechat', handler: (ctx) => chatMgmt.unmuteChat(ctx), category: 'chat', description: 'Desilenciar chat' },
  { command: '/archivechat', handler: (ctx) => chatMgmt.archiveChat(ctx), category: 'chat', description: 'Archivar conversación' },
  { command: '/unarchivechat', handler: (ctx) => chatMgmt.unarchiveChat(ctx), category: 'chat', description: 'Desarchivar conversación' },
  { command: '/readchat', handler: (ctx) => chatMgmt.markChatRead(ctx), category: 'chat', description: 'Marcar chat como leído' },
  { command: '/unreadchat', handler: (ctx) => chatMgmt.markChatUnread(ctx), category: 'chat', description: 'Marcar chat como no leído' },
  { command: '/deletechat', handler: (ctx) => chatMgmt.deleteChat(ctx), category: 'chat', description: 'Eliminar conversación' },
  { command: '/pinchat', handler: (ctx) => chatMgmt.pinChat(ctx), category: 'chat', description: 'Fijar chat' },
  { command: '/unpinchat', handler: (ctx) => chatMgmt.unpinChat(ctx), category: 'chat', description: 'Desfijar chat' },
  { command: '/clearchat', handler: (ctx) => chatMgmt.clearChat(ctx), category: 'chat', description: 'Limpiar chat para ti' },
  { command: '/autodisappear', handler: (ctx) => chatMgmt.enableDisappearing(ctx), category: 'chat', description: 'Habilitar desaparición automática' },
  { command: '/nodisappear', handler: (ctx) => chatMgmt.disableDisappearing(ctx), category: 'chat', description: 'Deshabilitar desaparición' },
  { command: '/readmsg', handler: (ctx) => chatMgmt.readMessage(ctx), category: 'chat', description: 'Marcar mensaje como leído' },

  // Presence & Status
  { command: '/online', handler: (ctx) => presence.setStatusOnline(ctx), category: 'presence', description: 'Mostrar en línea' },
  { command: '/offline', handler: (ctx) => presence.setStatusOffline(ctx), category: 'presence', description: 'Mostrar desconectado' },
  { command: '/typing', handler: (ctx) => presence.setStatusTyping(ctx), category: 'presence', description: 'Mostrar escribiendo' },
  { command: '/recording', handler: (ctx) => presence.setStatusRecording(ctx), category: 'presence', description: 'Mostrar grabando' },
  { command: '/paused', handler: (ctx) => presence.setStatusPaused(ctx), category: 'presence', description: 'Mostrar pausado' },
  { command: '/getpresence', handler: (ctx) => presence.getStatus(ctx), category: 'presence', description: 'Ver estado de usuario' },
  { command: '/subscribepresence', handler: (ctx) => presence.subscribePresence(ctx), category: 'presence', description: 'Monitorear presencia' },
  { command: '/unsubscribepresence', handler: (ctx) => presence.unsubscribePresence(ctx), category: 'presence', description: 'Dejar de monitorear' },
  { command: '/getstatus', handler: (ctx) => presence.getStatusText(ctx), category: 'presence', description: 'Obtener texto de estado' },
  { command: '/simulatyping', handler: (ctx) => presence.simulateTyping(ctx), category: 'presence', description: 'Simular escritura' },
  { command: '/simularecording', handler: (ctx) => presence.simulateRecording(ctx), category: 'presence', description: 'Simular grabación' },

  // Call Management
  { command: '/rejectcall', handler: (ctx) => calls.rejectCall(ctx), category: 'calls', description: 'Rechazar una llamada' },
  { command: '/blockcaller', handler: (ctx) => calls.blockCaller(ctx), category: 'calls', description: 'Bloquear al que llama' },
  { command: '/enablecallblock', handler: (ctx) => calls.enableCallBlock(ctx), category: 'calls', description: 'Rechazar todas las llamadas' },
  { command: '/disablecallblock', handler: (ctx) => calls.disableCallBlock(ctx), category: 'calls', description: 'Permitir llamadas nuevamente' },
  { command: '/addcallblacklist', handler: (ctx) => calls.addCallBlacklist(ctx), category: 'calls', description: 'Agregar a lista negra' },
  { command: '/removecallblacklist', handler: (ctx) => calls.removeCallBlacklist(ctx), category: 'calls', description: 'Remover de lista negra' },
  { command: '/callblocklist', handler: (ctx) => calls.listCallBlacklist(ctx), category: 'calls', description: 'Ver lista negra de llamadas' },
  { command: '/callstats', handler: (ctx) => calls.getCallStats(ctx), category: 'calls', description: 'Estadísticas de llamadas' },

  // UI Interactive - Botones, Listas y Todo-lists
  { command: '/copy', handler: (ctx) => uiInteractive.copyCode(ctx), category: 'ui', description: 'Copiar código al portapapeles' },
  { command: '/buttons', handler: (ctx) => uiInteractive.interactiveButtons(ctx), category: 'ui', description: 'Crear botones interactivos' },
  { command: '/todo', handler: (ctx) => uiInteractive.createTodoList(ctx), category: 'ui', description: 'Crear lista de tareas' },
  { command: '/todo-mark', handler: (ctx) => uiInteractive.markTodoItem(ctx), category: 'ui', description: 'Marcar tarea completada' },
  { command: '/todo-unmark', handler: (ctx) => uiInteractive.unmarkTodoItem(ctx), category: 'ui', description: 'Desmarcar tarea' },
  { command: '/todo-delete', handler: (ctx) => uiInteractive.deleteTodoItem(ctx), category: 'ui', description: 'Eliminar tarea' },
  { command: '/todo-add', handler: (ctx) => uiInteractive.addTodoItem(ctx), category: 'ui', description: 'Agregar tarea a lista' },
  { command: '/menucat', handler: (ctx) => uiInteractive.categorizedMenu(ctx), category: 'ui', description: 'Menú por categorías' },
  { command: '/helpcat', handler: (ctx) => uiInteractive.helpByCategory(ctx), category: 'ui', description: 'Ayuda por categorías' },
])

export function getCommandRegistry() {
  return registry
}

export default { getCommandRegistry }
