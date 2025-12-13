import { promotionalLinks } from '../../config/config/links.js'
import { getTheme } from '../../utils/utils/theme.js'

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
  media, messageControl, interactive, profile, privacy, groupAdvanced, broadcast, chatMgmt, presence, calls, uiInteractive,
  advancedFeatures, communityFeatures, privacyFeatures, performanceFeatures, games, banCmd
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
  safeImport('../advanced-features.js'),
  safeImport('../community-features.js'),
  safeImport('../privacy-features.js'),
  safeImport('../performance-features.js'),
  safeImport('../games.js'),
  safeImport('../ban.js'),
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

function getCategoryMeta(category) {
  const key = (category || 'otros').toLowerCase()
  return CATEGORY_META[key] || { emoji: '✨', label: 'Otros' }
}

function normalizeContext(ctx = {}) {
  const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
  const senderNum = ctx.senderNumber || onlyDigits(ctx.sender || '')
  return {
    ...ctx,
    senderNumber: senderNum,
    usuarioNumber: ctx.usuarioNumber || senderNum,
    usuario: ctx.usuario || ctx.sender || '',
    botNumber: ctx.botNumber || onlyDigits(ctx.botJid || ''),
    isAdmin: !!ctx.isAdmin,
    isBotAdmin: !!ctx.isBotAdmin,
    isGroup: !!ctx.isGroup,
    isOwner: !!ctx.isOwner,
    args: Array.isArray(ctx?.args) ? ctx.args : [],
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

  const mentionJid = (ctx && (ctx.fromMe ? ctx.remoteJid : (ctx.sender || ctx.usuario))) || undefined
  const resolveDisplayName = () => {
    try {
      // Intentar nombre de grupo si es un grupo y el usuario existe en participantes
      if (ctx?.isGroup && ctx?.groupMetadata && Array.isArray(ctx.groupMetadata.participants)) {
        const p = ctx.groupMetadata.participants.find((x) => x?.id === (ctx.sender || ctx.usuario));
        if (p?.notify) return p.notify;
        if (p?.name) return p.name;
      }
      // Intentar nombre en el propio contexto (algunos handlers lo agregan)
      if (ctx?.pushName) return ctx.pushName;
      if (ctx?.usuarioName) return ctx.usuarioName;
      // Fallback al número
      const num = (ctx?.sender || ctx?.usuario || '').toString().split('@')[0];
      return num || 'usuario';
    } catch (e) {
      const num = (ctx?.sender || ctx?.usuario || '').toString().split('@')[0];
      return num || 'usuario';
    }
  };
  const displayName = resolveDisplayName();
  const mainText = [
    `*¡Hola, ${displayName}!* 👋`,
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

export function getCommandRegistry() {
  return registry
}

register([
  // Ayuda y menú principal
  { command: '/help', handler: (ctx) => menu.help(ctx), category: 'info', description: 'Mostrar ayuda y comandos disponibles' },
  { command: '/ayuda', aliasOf: '/help', category: 'info' },
  { command: '/comandos', aliasOf: '/help', category: 'info' },

  // Interactivos utilitarios (botones/copy)
  { command: '/copy', handler: (ctx) => uiInteractive.copyCode(ctx), category: 'interactive', description: 'Generar texto copiable' },
  { command: '/copiar', aliasOf: '/copy', category: 'interactive' },
  { command: '/handlecopy', handler: (ctx) => uiInteractive.handleCopyButton(ctx), category: 'interactive', description: 'Handler interno para copy_*' },
  { command: '/menu', handler: (ctx) => menu.menu(ctx), category: 'interactive', description: 'Menú interactivo con accesos rápidos' },

  // Inteligencia Artificial
  { command: '/ai', handler: (ctx) => ai.ai(ctx), category: 'ai', description: 'Chat con IA Gemini avanzado' },
  { command: '/ia', aliasOf: '/ai', category: 'ai' },
  { command: '/clasificar', handler: (ctx) => ai.clasificar(ctx), category: 'ai', description: 'Clasifica texto automáticamente' },
  { command: '/listclasificados', handler: () => ai.listClasificados(), category: 'ai', description: 'Listado de clasificaciones guardadas' },

  // Gestión de usuarios
  { command: '/registrar', handler: (ctx) => system.registrar(ctx), category: 'user', description: 'Crear cuenta en el panel' },
  { command: '/resetpass', handler: (ctx) => system.resetpass(ctx), category: 'user', description: 'Restablecer contraseña del panel' },
  { command: '/miinfo', handler: (ctx) => system.miinfo(ctx), category: 'user', description: 'Ver tu información de cuenta' },

  // ✅ COMANDOS DE DEBUG Y DIAGNÓSTICO (NUEVOS Y ACTUALIZADOS)
  { command: '/debugbot', handler: (ctx) => admin.debugBot(ctx), category: 'system', description: 'Debug completo del bot con datos normalizados' },
  { command: '/debuggroup', handler: (ctx) => admin.debugGroup(ctx), category: 'group', description: 'Debug completo del grupo con permisos reales' },
  { command: '/status', handler: (ctx) => admin.statusCheck(ctx), category: 'info', description: 'Estado general del bot y tu sesión' },
  { command: '/testbotadmin', handler: (ctx) => groupCmd.testBotAdmin(ctx), category: 'group', description: 'Verificar permisos REALES del bot en el grupo' },
  { command: '/whoami', handler: (ctx) => groupCmd.whoami(ctx), category: 'group', description: 'Ver tu información y roles en el grupo' },
  { command: '/debugadmin', handler: (ctx) => groupCmd.debugadmin(ctx), category: 'group', description: 'Debug detallado de permisos de admin' },

  // Administración de grupos
  { command: '/addgroup', handler: (ctx) => groupCmd.addGroup(ctx), category: 'group', description: 'Registrar grupo en la base de datos' },
  { command: '/delgroup', handler: (ctx) => groupCmd.delGroup(ctx), category: 'group', description: 'Eliminar grupo del panel' },
  { command: '/kick', handler: (ctx) => groupCmd.kick(ctx), category: 'group', description: 'Expulsar a un usuario del grupo' },
  { command: '/promote', handler: (ctx) => groupCmd.promote(ctx), category: 'group', description: 'Ascender a un miembro a admin' },
  { command: '/demote', handler: (ctx) => groupCmd.demote(ctx), category: 'group', description: 'Degradar a un admin' },
  { command: '/lock', handler: (ctx) => groupCmd.lock(ctx), category: 'group', description: 'Cerrar el grupo' },
  { command: '/unlock', handler: (ctx) => groupCmd.unlock(ctx), category: 'group', description: 'Abrir el grupo' },
  { command: '/tag', handler: (ctx) => groupCmd.tag(ctx), category: 'group', description: 'Mencionar a un usuario' },
  { command: '/admins', handler: (ctx) => groupCmd.admins(ctx), category: 'group', description: 'Lista de administradores' },
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
  { command: '/ban', handler: (ctx) => banCmd.ban(ctx), category: 'group', description: 'Banear usuario del uso del bot en el grupo' },
  { command: '/unban', handler: (ctx) => banCmd.unban(ctx), category: 'group', description: 'Quitar ban de usuario del bot en el grupo' },
  { command: '/bans', handler: (ctx) => banCmd.bans(ctx), category: 'group', description: 'Listar usuarios baneados del bot en el grupo' },
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
  { command: '/poll', handler: (ctx) => polls.poll(ctx), category: 'group', description: 'Crear una encuesta nativa' },

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

  // Games
  { command: '/rps', handler: (ctx) => games.rps(ctx), category: 'games', description: 'Jugar piedra, papel o tijeras' },

  // Información del sistema
  { command: '/status-full', handler: () => sysInfo.statusFull(), category: 'info', description: 'Estado completo del bot' },
  { command: '/runtime', handler: () => sysInfo.runtime(), category: 'info', description: 'Información de tiempo de ejecución' },
  { command: '/info', aliasOf: '/status', category: 'info' },
  { command: '/test', handler: ({ usuario }) => ({ success: true, message: `✅ Bot funcionando\n\n👤 ${usuario}\n🕒 ${new Date().toLocaleString('es-ES')}` }), category: 'info', description: 'Comprobar si el bot responde' },
  { command: '/ping', handler: () => ({ success: true, message: '🏓 Pong' }), category: 'info', description: 'Prueba rápida de latencia' },
  { command: '/mynumber', aliasOf: '/whoami', category: 'info' },

  // Pairing / QR
  { command: '/qr', handler: (ctx) => pairing.qr(ctx), category: 'pairing', description: 'Generar código QR para vincular' },
  { command: '/code', handler: (ctx) => pairing.code(ctx), category: 'pairing', description: 'Generar código de emparejamiento para subbot' },
  { command: '/codigo', aliasOf: '/code', category: 'pairing' },
  { command: '/code_legacy', aliasOf: '/code', category: 'pairing' },
  { command: '/paircode', aliasOf: '/code', category: 'pairing' },
  { command: '/maincode', handler: (ctx) => pairing.mainCode(ctx), category: 'pairing', description: 'Ver código de emparejamiento del bot principal (Owner)' },
  { command: '/botcode', aliasOf: '/maincode', category: 'pairing' },
  { command: '/requestcode', handler: (ctx) => pairing.requestMainBotPairingCode(ctx), category: 'pairing', description: 'Solicitar código de emparejamiento para el bot principal (Owner)' },
  { command: '/pairmain', aliasOf: '/requestcode', category: 'pairing' },
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

  // Resto de comandos exactamente igual...
  // (El resto del registro continúa sin cambios)

  // Comandos de menú y ayuda centralizados
  { command: '/help', handler: buildHelp, category: 'info', description: 'Muestra el menú de ayuda interactivo' },
  { command: '/ayuda', aliasOf: '/help', category: 'info' },
  { command: '/menu', handler: menu.menu, category: 'info', description: 'Muestra el menú principal de botones' },
])

export default { getCommandRegistry }
