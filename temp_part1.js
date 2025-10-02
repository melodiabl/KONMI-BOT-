import db from './db.js';
import { getSocket } from './whatsapp.js';
import * as baileys from 'AdonixBaileys';
import { handleAI as handleAICommand, handleClasificar as handleClasificarCommand } from './commands.js';
import { isSuperAdmin, isModerator, isPremium, getOwnerName } from './global-config.js';
import {
  launchSubbot,
  deleteSubbot,
  fetchSubbotListWithOnlineFlag,
  getSubbotByCode
} from './inproc-subbots.js';

// Importar comandos de subbots
import {
  handleSerbot,
  handleMisSubbots,
  handleDelSubbot,
  handleStatusBot
} from './subbot-commands.js';

// ConsolidaciÃ³n de comandos: reexportamos funciones de mÃ³dulos especÃ­ficos
import {
  // Media
  handleMusic,
  handleVideo,
  handleMeme,
  handleWallpaper,
  handleJoke,
  // AI
  handleAIEnhanced,
  handleImage,
  handleTranslate,
  // Entertainment
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  // Status
  handleStatus,
  handlePing,
  // Logs
  handleLogsAdvanced,
  handleStats,
  handleExport,
  // Downloads
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo
} from './commands-extended.js';

// Variables globales para configuraciÃ³n del bot
let modoPrivado = false;
let modoAmigos = false;
let advertenciasActivas = true;

// Lista dinÃ¡mica de nÃºmeros admin (solo el nÃºmero principal del bot)
let dynamicAdminNumbers = [];

// Helper: normalizar JID (remover sufijo :<num>, convertir LIDâ†’WID, y mapear @lid)
function normalizeJid(jid) {
  if (!jid) return '';
  let withoutDevice = jid.replace(/:\d+/, '');
  // Mapear sufijo @lid a servidor clÃ¡sico
  if (withoutDevice.endsWith('@lid')) {
    withoutDevice = withoutDevice.replace(/@lid$/, '@s.whatsapp.net');
  }
  try {
    const decoded = baileys.jidDecode(withoutDevice);
    if (decoded && decoded.user && decoded.server) {
      // Forzar servidor clÃ¡sico
      const server = decoded.server === 'lid' ? 's.whatsapp.net' : decoded.server;
      return `${decoded.user}@${server}`;
    }
  } catch (_) {}
  return withoutDevice;
}

/**
 * Verificar si un usuario es admin del grupo de WhatsApp
 * Usa el sistema global de administradores de MaycolPlus
 */
async function isOwnerOrAdmin(usuario, grupo = null) {
  if (grupo && grupo.endsWith('@g.us')) {
    try {
      const adminInGroup = await isGroupAdmin(usuario, grupo);
      if (adminInGroup) {
        return true;
      }
    } catch (error) {
      console.error('Error verificando admin del grupo:', error?.message || error);
    }
  }

  if (isSuperAdmin(usuario)) {
    return true;
  }

  if (isModerator(usuario)) {
    return true;
  }

  const normalized = String(usuario).split(':')[0].replace(/[^0-9]/g, '');
  return dynamicAdminNumbers.some((num) => String(num).replace(/[^0-9]/g, '') === normalized);
}

/**
 * FunciÃ³n para actualizar la lista de nÃºmeros admin
 */
function updateAdminNumbers(newAdminNumbers) {
  const normalized = newAdminNumbers
    .map((num) => String(num).split(':')[0])
    .map((num) => num.replace(/[^0-9]/g, ''))
    .filter(Boolean);
  const base = dynamicAdminNumbers.map((num) => num.replace(/[^0-9]/g, ''));
  const merged = new Set([...base, ...normalized]);
  dynamicAdminNumbers = Array.from(merged);
  console.log(`ðŸ‘‘ Lista de admins actualizada: ${dynamicAdminNumbers.join(', ')}`);
}

/**
 * Verificar si el bot estÃ¡ activo en un grupo
 */
async function isBotActiveInGroup(grupoId) {
  try {
    // Verificar estado global del bot primero
    const globalState = await db('bot_global_state').select('*').first();
    if (!globalState || !globalState.isOn) {
      return false; // Bot globalmente desactivado
    }
    
    // Verificar estado especÃ­fico del grupo
    const grupo = await db('grupos_autorizados').where({ jid: grupoId }).first();
    return !grupo || grupo.bot_enabled !== false; // Por defecto activo si no hay registro
  } catch (error) {
    return true; // En caso de error, permitir (bot activo)
  }
}

/**
 * Verificar si un grupo es proveedor
 */
async function isProviderGroup(grupoId) {
  try {
    const grupo = await db('grupos_autorizados').where({ jid: grupoId, tipo: 'proveedor' }).first();
    return !!grupo;
  } catch (error) {
    return false;
  }
}

/**
 * Registrar log de comando
 */
async function logCommand(tipo, comando, usuario, grupo) {
  try {
    const fecha = new Date().toISOString();
    // Use knex insert without await to avoid issues
    return db('logs').insert({ tipo, comando, usuario, grupo, fecha });
  } catch (error) {
    console.error('Error al registrar log:', error);
  }
}

// Helper para construir un menÃº de ayuda mÃ¡s legible y bonito
function buildPrettyHelp(isAdmin) {
  const divider = 'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•';
  let text = `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n`;
  text += `â•‘           ðŸ¤– *KONMI BOT* ðŸ¤–            â•‘\n`;
  text += `â•‘        *Panel de Comandos*              â•‘\n`;
  text += `â•š${divider}â•\n\n`;

  text += 'ðŸŒŸ *COMANDOS ESENCIALES*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `help` / `menu`     â†’  Muestra este menÃº â”‚\n';
  text += 'â”‚ `whoami`           â†’  Tu ficha de usuarioâ”‚\n';
  text += 'â”‚ `ia <texto>`       â†’  Pregunta a Gemini  â”‚\n';
  text += 'â”‚ `clasificar <txt>` â†’  Categoriza contenidoâ”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += 'ðŸ¤– *GESTIÃ“N DE SUBBOTS*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `qr`              â†’  Crear subbot QR    â”‚\n';
  text += 'â”‚ `code`            â†’  Crear subbot CODE  â”‚\n';
  text += 'â”‚ `bots`            â†’  Lista tus subbots  â”‚\n';
  text += 'â”‚ `delbot <id>`     â†’  Elimina un subbot  â”‚\n';
  text += 'â”‚ `delsubbot <id>`  â†’  Elimina un subbot  â”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += 'ðŸŽ§ *MEDIA & ENTRETENIMIENTO*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `play <bÃºsqueda>` â†’  Audio de YouTube   â”‚\n';
  text += 'â”‚ `video <bÃºsqueda>`â†’  Video de YouTube   â”‚\n';
  text += 'â”‚ `meme`            â†’  Meme aleatorio     â”‚\n';
  text += 'â”‚ `sticker`         â†’  Crear sticker      â”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += 'ðŸ“‚ *DESCARGAS & ARCHIVOS*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `descargar <url> <nombre> <cat>`       â”‚\n';
  text += 'â”‚ `guardar <cat>` (responde a media)     â”‚\n';
  text += 'â”‚ `archivos [cat]`  `misarchivos`        â”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += 'ðŸ“š *APORTES & PEDIDOS*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `aportar <tipo> <contenido>` â†’ Enviar  â”‚\n';
  text += 'â”‚ `myaportes [tipo]`          â†’ Tus aportesâ”‚\n';
  text += 'â”‚ `aportes [tipo]`            â†’ Todos     â”‚\n';
  text += 'â”‚ `pedido <tema>`             â†’ Hacer pedidoâ”‚\n';
  text += 'â”‚ `pedidos`                   â†’ Tus pedidosâ”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += 'ðŸ—³ï¸ *VOTACIONES*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ `crearvotacion <pregunta|op1|op2...>`  â”‚\n';
  text += 'â”‚ `votar <opciÃ³n>`  `cerrarvotacion <ID>` â”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  if (isAdmin) {
    text += 'ðŸ› ï¸ *HERRAMIENTAS ADMIN*\n';
    text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
    text += 'â”‚ `bot on/off`     â†’  Activar/desactivar â”‚\n';
    text += 'â”‚ `bot global on/off` â†’  Modo global      â”‚\n';
    text += 'â”‚ `update`         â†’  Actualizar bot      â”‚\n';
    text += 'â”‚ `logs [tipo]`    â†’  Ver logs del sistemaâ”‚\n';
    text += 'â”‚ `lock` / `unlock`â†’  Bloquear/desbloquearâ”‚\n';
    text += 'â”‚ `addgroup` / `delgroup` â†’  Gestionar gruposâ”‚\n';
    text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';
  }

  text += 'ðŸ’¡ *CONSEJOS DE USO*\n';
  text += 'â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”\n';
  text += 'â”‚ â€¢ Usa `/`, `!` o `.` para comandos      â”‚\n';
  text += 'â”‚ â€¢ Algunos comandos requieren admin      â”‚\n';
  text += 'â”‚ â€¢ Los subbots se vencen: guarda QR/code â”‚\n';
  text += 'â”‚ â€¢ El bot detecta tu nÃºmero automÃ¡ticamenteâ”‚\n';
  text += 'â”‚ â€¢ Escribe `help <comando>` para mÃ¡s infoâ”‚\n';
  text += 'â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜\n\n';

  text += `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n`;
  text += `â•‘        ðŸš€ *Â¡Disfruta usando el bot!* ðŸš€ â•‘\n`;
  text += `â•‘           *VersiÃ³n 2.5 Completa*        â•‘\n`;
  text += `â•š${divider}â•\n`;

  return text;
}

// Resolver nombre mostrable a partir de un JID/nÃºmero: @username, @NombreWA o @numero
async function getDisplayMention(userJidOrNum) {
  try {
    const num = String(userJidOrNum || '').split('@')[0].split(':')[0];
    if (!num) return '@usuario';
    const u = await db('usuarios').where({ whatsapp_number: num }).select('username').first();
    if (u?.username) return `@${u.username}`;
    const wa = await db('wa_contacts').where({ wa_number: num }).select('display_name').first();
    if (wa?.display_name) return `@${wa.display_name}`;
    return `@${num}`;
  } catch (_) {
    const num = String(userJidOrNum || '').split('@')[0].split(':')[0];
    return `@${num || 'usuario'}`;
  }
}

/**
 * /help - Muestra lista de comandos disponibles (solo verifica admin por WhatsApp, no por base de datos)
 */
async function handleHelp(usuario, grupo, isGroup) {
  const isAdmin = await isOwnerOrAdmin(usuario, grupo);
  // Nuevo formato mÃ¡s tipogrÃ¡fico y legible
  const pretty = buildPrettyHelp(isAdmin);
  await logCommand('consulta', 'help', usuario, grupo);
  return { success: true, message: pretty };
}

// Reutilizamos las implementaciones centralizadas en commands.js para evitar duplicados.
const handleIA = handleAICommand;
const handleClasificar = handleClasificarCommand;

/**
 * /addgroup - Activa el bot en el grupo actual
 */
async function handleAddGroup(usuario, grupo, groupName) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede activar el bot en grupos.' };
  }
  
  try {
    await db('grupos_autorizados').insert({
      jid: grupo,
      nombre: groupName || 'Grupo',
      tipo: 'normal',
      bot_enabled: true,
      proveedor: 'General'
    }).onConflict('jid').merge(['nombre', 'bot_enabled']);
    
    await logCommand('administracion', 'addgroup', usuario, grupo);
    return { success: true, message: 'âœ… Bot activado en el grupo correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error al activar bot en el grupo.' };
  }
}

/**
 * /delgroup - Desactiva el bot en un grupo
 */
async function handleDelGroup(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede desactivar el bot en grupos.' };
  }
  
  try {
    await db('grupos_autorizados').where({ jid: grupo }).update({
      bot_enabled: false
    });
    
    await logCommand('administracion', 'delgroup', usuario, grupo);
    return { success: true, message: 'âœ… Bot desactivado en el grupo correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error al desactivar bot en el grupo.' };
  }
}

/**
 * /myaportes - Lista solo los aportes del usuario
 */
async function handleMyAportes(usuario, grupo, filtroTipo = null) {
  try {
    let rows = await db('aportes').where({ usuario }).orderBy('fecha', 'desc').limit(50);
    if (filtroTipo) rows = rows.filter(r => r.tipo === filtroTipo);
    if (rows.length === 0) return { success: true, message: 'ðŸ“ No tienes aportes registrados.' };
    const byTipo = rows.reduce((acc, r) => {
      (acc[r.tipo || 'sin_tipo'] ||= []).push(r);
      return acc;
    }, {});
    const order = ['manhwa', 'manhwas_bls', 'series', 'series_videos', 'series_bls', 'anime', 'anime_bls', 'extra_imagen', 'ilustracion', 'extra'];
    let message = `ðŸ“ *Tus Aportes (${rows.length})*\n`;
    const tipos = Object.keys(byTipo).sort((a,b) => order.indexOf(a) - order.indexOf(b));
    for (const tipo of tipos) {
      message += `\nâ€¢ ${tipo.toUpperCase()} (${byTipo[tipo].length})\n`;
      byTipo[tipo].slice(0, 10).forEach((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString('es-ES');
        message += `  ${i + 1}. ${r.contenido} â€” ${fecha}\n`;
      });
    }
    await logCommand('consulta', 'myaportes', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'âŒ Error al obtener tus aportes.' };
  }
}

/**
 * /aportes - Lista todos los aportes (solo si el bot estÃ¡ activo)
 */
async function handleAportes(usuario, grupo, isGroup, filtroTipo = null) {
  if (isGroup && !await isBotActiveInGroup(grupo)) {
    return { success: false, message: 'âŒ El bot no estÃ¡ activo en este grupo.' };
  }
  
  try {
    let aportes = await db('aportes').orderBy('fecha', 'desc').limit(50);
    if (filtroTipo) aportes = aportes.filter(a => a.tipo === filtroTipo);
    if (aportes.length === 0) {
      return { success: true, message: 'ðŸ“ No hay aportes registrados.' };
    }
    // Resolver nombres de usuario a partir del nÃºmero (JID)
    const uniqueNums = [...new Set(aportes.map(a => String(a.usuario).split('@')[0].split(':')[0]))];
    const users = await db('usuarios').whereIn('whatsapp_number', uniqueNums).select('whatsapp_number','username');
    const nameByNumber = Object.fromEntries(users.map(u => [u.whatsapp_number, u.username]));
    const missing = uniqueNums.filter(n => !nameByNumber[n]);
    let waNames = [];
    if (missing.length) {
      waNames = await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name');
    }
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    const byTipo = aportes.reduce((acc, r) => { (acc[r.tipo || 'sin_tipo'] ||= []).push(r); return acc; }, {});
    const order = ['manhwa', 'manhwas_bls', 'series', 'series_videos', 'series_bls', 'anime', 'anime_bls', 'extra_imagen', 'ilustracion', 'extra'];
    let message = `ðŸ“ *Aportes (${aportes.length})*\n`;
    const tipos = Object.keys(byTipo).sort((a,b) => order.indexOf(a) - order.indexOf(b));
    for (const tipo of tipos) {
      message += `\nâ€¢ ${tipo.toUpperCase()} (${byTipo[tipo].length})\n`;
      byTipo[tipo].slice(0, 10).forEach((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString('es-ES');
        const num = String(r.usuario).split('@')[0].split(':')[0];
        const resolved = nameByNumber[num] || waByNumber[num] || num;
        const uname = `@${resolved}`;
        message += `  ${i + 1}. ${r.contenido} â€” ${uname} â€” ${fecha}\n`;
      });
    }
    
    await logCommand('consulta', 'aportes', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener aportes.' };
  }
}

/**
 * /manhwas - Lista todos los manhwas disponibles
 */
async function handleManhwas(usuario, grupo) {
  try {
    const manhwas = await db.all('SELECT * FROM manhwas ORDER BY titulo');
    
    if (manhwas.length === 0) {
      return { success: true, message: 'ðŸ“š No hay manhwas registrados.' };
    }
    
    let message = `ðŸ“š *Manhwas disponibles (${manhwas.length}):*\n\n`;
    manhwas.forEach((manhwa, index) => {
      message += `${index + 1}. *${manhwa.titulo}*\n`;
      message += `   ðŸ‘¤ Autor: ${manhwa.autor}\n`;
      message += `   ðŸ“Š Estado: ${manhwa.estado}\n`;
      if (manhwa.descripcion) {
        message += `   ðŸ“ ${manhwa.descripcion.substring(0, 50)}...\n`;
      }
      message += `\n`;
    });
    
    await logCommand('consulta', 'manhwas', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener manhwas.' };
  }
}

/**
 * /addaporte [datos] - Permite enviar un aporte
 */
async function handleAddAporte(contenido, tipo, usuario, grupo, fecha) {
  try {
    await db('aportes').insert({ contenido, tipo, usuario, grupo, fecha });
    await logCommand('comando', 'addaporte', usuario, grupo);
    return { success: true, message: `âœ… Aporte de tipo "${tipo}" guardado correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al guardar aporte.' };
  }
}

/** Cambiar estado de aporte desde WhatsApp */
async function handleAporteEstado(id, estado, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede cambiar estado de aportes.' };
  }
  const allowed = ['pendiente', 'en_revision', 'completado'];
  const normalized = (estado || '').toLowerCase();
  if (!allowed.includes(normalized)) {
    return { success: false, message: 'âŒ Estado invÃ¡lido. Usa: pendiente | en_revision | completado' };
  }
  try {
    const aporte = await db('aportes').where({ id }).first();
    if (!aporte) return { success: false, message: `âŒ Aporte #${id} no encontrado.` };
    await db('aportes').where({ id }).update({ estado: normalized, procesado_por: usuario, fecha_procesado: new Date().toISOString() });
    await logCommand('administracion', 'aporteestado', usuario, grupo);
    return { success: true, message: `âœ… Aporte #${id} actualizado a "${normalized}".` };
  } catch (e) {
    return { success: false, message: 'Error al actualizar estado de aporte.' };
  }
}

/**
 * /addmanhwa [datos] - Permite agregar un nuevo manhwa (solo Admin)
 */
async function handleAddManhwa(datos, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede agregar manhwas.' };
  }
  
  try {
    // Parsear datos: tÃ­tulo|autor|gÃ©nero|estado|descripciÃ³n|url|proveedor
    const parts = datos.split('|');
    if (parts.length < 4) {
      return { success: false, message: 'âŒ Formato: tÃ­tulo|autor|gÃ©nero|estado|descripciÃ³n|url|proveedor' };
    }
    
    const [titulo, autor, genero, estado, descripcion = '', url = '', proveedor = 'General'] = parts;
    const fecha_registro = new Date().toISOString();
    
    const stmt = await db.prepare(
      'INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await stmt.run(titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario);
    await stmt.finalize();
    
    await logCommand('administracion', 'addmanhwa', usuario, grupo);
    return { success: true, message: `âœ… Manhwa "${titulo}" agregado correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al agregar manhwa.' };
  }
}

/**
 * /addserie [datos] - Permite agregar una nueva serie (cualquier usuario si el bot estÃ¡ activo)
 */
async function handleAddSerie(datos, usuario, grupo, isGroup) {
  // Verificar si el bot estÃ¡ activo en el grupo o usuario admin
  if (isGroup && !await isBotActiveInGroup(grupo) && !await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ El bot no estÃ¡ activo en este grupo para agregar series.' };
  }
  
  try {
    // Parsear datos con formato mÃ¡s simple: tÃ­tulo|gÃ©nero|estado|descripciÃ³n
    const parts = datos.split('|');
    if (parts.length < 2) {
      return { success: false, message: 'âŒ Formato: tÃ­tulo|gÃ©nero|estado|descripciÃ³n\nEjemplo: /addserie Attack on Titan|AcciÃ³n|Finalizada|Serie sobre titanes' };
    }
    
    const [titulo, genero = 'Serie', estado = 'En emisiÃ³n', descripcion = ''] = parts;
    const fecha_registro = new Date().toISOString();
    
    // Verificar si la serie ya existe
    const serieExistente = await db.get(
      'SELECT * FROM manhwas WHERE titulo = ? AND genero LIKE ?',
      [titulo, '%serie%']
    );
    
    if (serieExistente) {
      return { success: false, message: `âŒ La serie "${titulo}" ya existe en la base de datos.` };
    }
    
    const stmt = await db.prepare(
      'INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await stmt.run(titulo, 'Varios', `Serie - ${genero}`, estado, descripcion, '', 'Series', fecha_registro, usuario);
    await stmt.finalize();
    
    // TambiÃ©n registrar como aporte
    const stmtAporte = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmtAporte.run(`Serie agregada: ${titulo}`, 'serie', usuario, grupo, fecha_registro);
    await stmtAporte.finalize();
    
    await logCommand('comando', 'addserie', usuario, grupo);
    const mention = await getDisplayMention(usuario);
    return { 
      success: true, 
      message: `âœ… *Serie agregada correctamente:*\n\nðŸ“º **${titulo}**\nðŸ·ï¸ GÃ©nero: ${genero}\nðŸ“Š Estado: ${estado}\nðŸ“ ${descripcion}\nðŸ‘¤ Agregada por: ${mention}` 
    };
  } catch (error) {
    return { success: false, message: 'Error al agregar serie.' };
  }
}

/**
 * /series - Lista todas las series disponibles
 */
async function handleSeries(usuario, grupo) {
  try {
    const series = await db.all(
      'SELECT * FROM manhwas WHERE genero LIKE ? ORDER BY titulo',
      ['%Serie%']
    );
    
    if (series.length === 0) {
      return { success: true, message: 'ðŸ“º No hay series registradas.' };
    }
    
    // Resolver nombres de quien registrÃ³
    const nums = [...new Set(series.map(s => String(s.usuario_registro || '').split('@')[0].split(':')[0]))].filter(Boolean);
    const dbUsers = nums.length ? await db('usuarios').whereIn('whatsapp_number', nums).select('whatsapp_number','username') : [];
    const nameByNumber = Object.fromEntries(dbUsers.map(u => [u.whatsapp_number, u.username]));
    const missing = nums.filter(n => !nameByNumber[n]);
    const waNames = missing.length ? await db('wa_contacts').whereIn('wa_number', missing).select('wa_number','display_name') : [];
    const waByNumber = Object.fromEntries(waNames.map(w => [w.wa_number, w.display_name]));

    let message = `ðŸ“º *Series disponibles (${series.length}):*\n\n`;
    series.forEach((serie, index) => {
      message += `${index + 1}. **${serie.titulo}**\n`;
      message += `   ðŸ·ï¸ ${serie.genero.replace('Serie - ', '')}\n`;
      message += `   ðŸ“Š Estado: ${serie.estado}\n`;
      if (serie.descripcion) {
        message += `   ðŸ“ ${serie.descripcion.substring(0, 60)}...\n`;
      }
      const num = String(serie.usuario_registro || '').split('@')[0].split(':')[0];
      const uname = num ? `@${nameByNumber[num] || waByNumber[num] || num}` : '@usuario';
      message += `   ðŸ‘¤ Por: ${uname}\n\n`;
    });
    
    await logCommand('consulta', 'series', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener series.' };
  }
}

/**
 * /pedido [contenido] - Hace un pedido y busca en la base de datos si existe
 */
async function handlePedido(contenido, usuario, grupo, fecha) {
  try {
    const { getSocket } = await import('./whatsapp.js');
    const sock = getSocket();
    const remoteJid = grupo || usuario;

    // Buscar en manhwas
    const manhwaEncontrado = await db.get(
      'SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Buscar en aportes
    const aporteEncontrado = await db.get(
      'SELECT * FROM aportes WHERE contenido LIKE ? OR contenido LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Buscar en archivos descargados
    const archivosEncontrados = await db.all(
      'SELECT * FROM descargas WHERE filename LIKE ? OR filename LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Registrar el pedido en la base de datos
    const stmt = await db.prepare(
      'INSERT INTO pedidos (texto, estado, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(contenido, 'pendiente', usuario, grupo, fecha);
    await stmt.finalize();

    let response = `ðŸ“‹ *Pedido registrado:* "${contenido}"\n\n`;

    // Si encontrÃ³ contenido, mencionarlo
    if (manhwaEncontrado) {
      response += `âœ… *Â¡Encontrado en manhwas!*\n`;
      response += `ðŸ“š **${manhwaEncontrado.titulo}**\n`;
      response += `ðŸ‘¤ Autor: ${manhwaEncontrado.autor}\n`;
      response += `ðŸ“Š Estado: ${manhwaEncontrado.estado}\n`;
      if (manhwaEncontrado.descripcion) {
        response += `ðŸ“ ${manhwaEncontrado.descripcion}\n`;
      }
      if (manhwaEncontrado.url) {
        response += `ðŸ”— ${manhwaEncontrado.url}\n`;
      }
      response += `\n`;
    }

    if (aporteEncontrado) {
      response += `âœ… *Â¡Encontrado en aportes!*\n`;
      response += `ðŸ“ **${aporteEncontrado.contenido}**\n`;
      response += `ðŸ·ï¸ Tipo: ${aporteEncontrado.tipo}\n`;
      {
        const num = String(aporteEncontrado.usuario || '').split('@')[0].split(':')[0];
        const u = await db('usuarios').where({ whatsapp_number: num }).select('username').first();
        const wa = u?.username ? null : await db('wa_contacts').where({ wa_number: num }).select('display_name').first();
        const mention = `@${u?.username || wa?.display_name || num}`;
        response += `ðŸ‘¤ Aportado por: ${mention}\n`;
      }
      response += `ðŸ“… Fecha: ${new Date(aporteEncontrado.fecha).toLocaleDateString()}\n\n`;
    }

    // Buscar y enviar archivos fÃ­sicos si existen
    let archivosEnviados = 0;
    if (archivosEncontrados.length > 0 && sock) {
      response += `ðŸ“ *Archivos encontrados:*\n`;

      for (const archivo of archivosEncontrados.slice(0, 5)) { // MÃ¡ximo 5 archivos
        try {
          const fs = await import('fs');
          const path = await import('path');

          const archivoPath = path.join(process.cwd(), 'storage', 'downloads', archivo.category, archivo.filename);

          if (fs.existsSync(archivoPath)) {
            const fileBuffer = fs.readFileSync(archivoPath);
            const fileExtension = path.extname(archivo.filename).toLowerCase();

            let mediaType = 'document';
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
              mediaType = 'image';
            } else if (['.mp4', '.avi', '.mkv', '.mov'].includes(fileExtension)) {
              mediaType = 'video';
            } else if (['.mp3', '.wav', '.m4a'].includes(fileExtension)) {
              mediaType = 'audio';
            }

            // Enviar el archivo
            let sentMessage;
            if (mediaType === 'image') {
              sentMessage = await sock.sendMessage(remoteJid, {
                image: fileBuffer,
                caption: `ðŸ“ ${archivo.filename}\nðŸ·ï¸ ${archivo.category}\nðŸ‘¤ Subido por: ${archivo.usuario}\nðŸ“… ${new Date(archivo.fecha).toLocaleDateString()}`
              });
            } else if (mediaType === 'video') {
              sentMessage = await sock.sendMessage(remoteJid, {
                video: fileBuffer,
                caption: `ðŸ“ ${archivo.filename}\nðŸ·ï¸ ${archivo.category}`
              });
            } else if (mediaType === 'audio') {
              sentMessage = await sock.sendMessage(remoteJid, {
                audio: fileBuffer,
                mimetype: 'audio/mpeg'
              });
            } else {
              sentMessage = await sock.sendMessage(remoteJid, {
                document: fileBuffer,
                fileName: archivo.filename,
                caption: `ðŸ“ ${archivo.filename}\nðŸ·ï¸ ${archivo.category}`
              });
            }

            response += `âœ… *Enviado:* ${archivo.filename} (${archivo.category})\n`;
            archivosEnviados++;

            // Marcar el pedido como completado si se enviÃ³ al menos un archivo
            if (archivosEnviados === 1) {
              await db('pedidos')
                .where({ texto: contenido, usuario: usuario, grupo: grupo })
                .update({ estado: 'completado', completado_por: 'bot', fecha_completado: new Date().toISOString() });
            }
          }
        } catch (fileError) {
          console.error(`Error enviando archivo ${archivo.filename}:`, fileError);
          response += `âŒ Error enviando: ${archivo.filename}\n`;
        }
      }

      if (archivosEnviados === 0) {
        response += `âš ï¸ Archivos encontrados pero no se pudieron enviar\n`;
      }
    }

    if (!manhwaEncontrado && !aporteEncontrado && archivosEnviados === 0) {
      response += `â³ *No encontrado en la base de datos*\n`;
      response += `Tu pedido ha sido registrado y serÃ¡ revisado por los administradores.\n`;
    } else if (archivosEnviados > 0) {
      response += `\nðŸŽ‰ *Â¡Pedido completado automÃ¡ticamente!* âœ…`;
    }

    await logCommand('comando', 'pedido', usuario, grupo);
    return { success: true, message: response };
  } catch (error) {
    console.error('Error en handlePedido:', error);
    return { success: false, message: 'Error al procesar pedido.' };
  }
}

/**
 * /pedidos - Muestra los pedidos del usuario
 */
async function handlePedidos(usuario, grupo) {
  try {
    const pedidos = await db.all(
      'SELECT * FROM pedidos WHERE usuario = ? ORDER BY fecha DESC LIMIT 10',
      [usuario]
    );
    
    if (pedidos.length === 0) {
      return { success: true, message: 'ðŸ“‹ No tienes pedidos registrados.' };
    }
    
    let message = `ðŸ“‹ *Tus pedidos (${pedidos.length}):*\n\n`;
    pedidos.forEach((pedido, index) => {
      const fecha = new Date(pedido.fecha).toLocaleDateString();
      const estado = pedido.estado === 'pendiente' ? 'â³' : pedido.estado === 'completado' ? 'âœ…' : 'âŒ';
      message += `${index + 1}. ${estado} ${pedido.texto}\n`;
      message += `   ðŸ“… ${fecha} - Estado: ${pedido.estado}\n\n`;
    });
    
    await logCommand('consulta', 'pedidos', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener pedidos.' };
  }
}

/**
 * /extra [nombre] - Detecta si es un extra de un manhwa y lo registra
 */
async function handleExtra(nombre, usuario, grupo, fecha) {
  try {
    // Buscar manhwa relacionado
    const manhwa = await db.get(
      'SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?',
      [`%${nombre}%`, `${nombre}%`]
    );
    
    let contenido = `Extra: ${nombre}`;
    if (manhwa) {
      contenido = `Extra de "${manhwa.titulo}": ${nombre}`;
    }
    
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(contenido, 'extra', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('comando', 'extra', usuario, grupo);
    return { success: true, message: `âœ… Extra "${nombre}" registrado correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al registrar extra.' };
  }
}

/**
 * /ilustraciones - Lista las ilustraciones guardadas
 */
async function handleIlustraciones(usuario, grupo) {
  try {
    const ilustraciones = await db.all(
      'SELECT * FROM ilustraciones ORDER BY fecha DESC LIMIT 15'
    );
    
    if (ilustraciones.length === 0) {
      return { success: true, message: 'ðŸŽ¨ No hay ilustraciones registradas.' };
    }
    
    let message = `ðŸŽ¨ *Ilustraciones disponibles (${ilustraciones.length}):*\n\n`;
    ilustraciones.forEach((ilustracion, index) => {
      const fecha = new Date(ilustracion.fecha).toLocaleDateString();
      message += `${index + 1}. Por @${ilustracion.usuario}\n`;
      message += `   ðŸ“… ${fecha}\n\n`;
    });
    
    await logCommand('consulta', 'ilustraciones', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener ilustraciones.' };
  }
}

/**
 * /logs - Muestra Ãºltimos registros de actividad (solo Admin)
 */
async function handleLogs(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede ver logs.' };
  }
  
  try {
    const logs = await db.all(
      'SELECT * FROM logs ORDER BY fecha DESC LIMIT 20'
    );
    
    if (logs.length === 0) {
      return { success: true, message: 'ðŸ“Š No hay logs registrados.' };
    }
    
    let message = `ðŸ“Š *Ãšltimos logs (${logs.length}):*\n\n`;
    logs.forEach((log, index) => {
      const fecha = new Date(log.fecha).toLocaleString();
      message += `${index + 1}. *${log.comando}* (${log.tipo})\n`;
      message += `   ðŸ‘¤ @${log.usuario}\n`;
      message += `   ðŸ“… ${fecha}\n\n`;
    });
    
    await logCommand('consulta', 'logs', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener logs.' };
  }
}

/**
 * /privado - Activa/desactiva el modo privado del bot
 */
async function handlePrivado(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede cambiar el modo privado.' };
  }
  
  modoPrivado = !modoPrivado;
  
  await logCommand('configuracion', 'privado', usuario, grupo);
  return { 
    success: true, 
    message: `ðŸ”’ Modo privado ${modoPrivado ? 'activado' : 'desactivado'}.` 
  };
}

/**
 * /amigos - Activa/desactiva el modo amigos
 */
async function handleAmigos(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede cambiar el modo amigos.' };
  }
  
  modoAmigos = !modoAmigos;
  
  await logCommand('configuracion', 'amigos', usuario, grupo);
  return { 
    success: true, 
    message: `ðŸ‘¥ Modo amigos ${modoAmigos ? 'activado' : 'desactivado'}.` 
  };
}

/**
 * /advertencias on/off - Activa o desactiva las advertencias
 */
async function handleAdvertencias(estado, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede configurar advertencias.' };
  }
  
  if (estado === 'on') {
    advertenciasActivas = true;
  } else if (estado === 'off') {
    advertenciasActivas = false;
  } else {
    return { success: false, message: 'âŒ Uso: /advertencias on o /advertencias off' };
  }
  
  await logCommand('configuracion', 'advertencias', usuario, grupo);
  return { 
    success: true, 
    message: `âš ï¸ Advertencias ${advertenciasActivas ? 'activadas' : 'desactivadas'}.` 
  };
}

/**
 * /votar [opciÃ³n] - Permite votar en una votaciÃ³n activa
 */
async function handleVotar(opcion, usuario, grupo) {
  try {
    // Buscar votaciÃ³n activa
    const votacion = await db.get(
      'SELECT * FROM votaciones WHERE estado = ? ORDER BY fecha_inicio DESC LIMIT 1',
      ['activa']
    );
    
    if (!votacion) {
      return { success: false, message: 'âŒ No hay votaciones activas.' };
    }
    
    // Verificar si ya votÃ³
    const votoExistente = await db.get(
      'SELECT * FROM votos WHERE votacion_id = ? AND usuario = ?',
      [votacion.id, usuario]
    );
    
    if (votoExistente) {
      return { success: false, message: 'âŒ Ya has votado en esta votaciÃ³n.' };
    }
    
    // Registrar voto
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO votos (votacion_id, usuario, opcion, fecha) VALUES (?, ?, ?, ?)'
    );
    await stmt.run(votacion.id, usuario, opcion, fecha);
    await stmt.finalize();
    
    await logCommand('comando', 'votar', usuario, grupo);
    return { success: true, message: `âœ… Voto registrado: "${opcion}"` };
  } catch (error) {
    return { success: false, message: 'Error al registrar voto.' };
  }
}

/**
 * /crearvotacion [pregunta | opciÃ³n1 | opciÃ³n2...] - Crea una nueva votaciÃ³n
 */
async function handleCrearVotacion(datos, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede crear votaciones.' };
  }
  
  try {
    const parts = datos.split('|').map(part => part.trim());
    if (parts.length < 3) {
      return { success: false, message: 'âŒ Formato: pregunta | opciÃ³n1 | opciÃ³n2 | ...\n\nEjemplo: /crearvotacion Â¿CuÃ¡l es tu manhwa favorito? | Solo Leveling | Tower of God | The Beginning After The End' };
    }
    
    const [titulo, ...opciones] = parts;
    const fecha_inicio = new Date().toISOString();
    const fecha_fin = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dÃ­as
    
    const stmt = await db.prepare(
      'INSERT INTO votaciones (titulo, descripcion, opciones, fecha_inicio, fecha_fin, estado, creador) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = await stmt.run(titulo, '', JSON.stringify(opciones), fecha_inicio, fecha_fin, 'activa', usuario);
    await stmt.finalize();
    
    const votacionId = result.lastID;
    
    // Crear mensaje de votaciÃ³n para el grupo
    let mensajeVotacion = `ðŸ—³ï¸ *NUEVA VOTACIÃ“N INICIADA*\n\n`;
    mensajeVotacion += `ðŸ“‹ **${titulo}**\n\n`;
    mensajeVotacion += `ðŸ“Š *Opciones disponibles:*\n`;
    
    opciones.forEach((opcion, index) => {
      mensajeVotacion += `${index + 1}. ${opcion}\n`;
    });
    
    mensajeVotacion += `\nâ° *DuraciÃ³n:* 7 dÃ­as\n`;
    {
      const mention = await getDisplayMention(usuario);
      mensajeVotacion += `ðŸ‘¤ *Creada por:* ${mention}\n`;
    }
    mensajeVotacion += `ðŸ†” *ID:* #${votacionId}\n\n`;
    mensajeVotacion += `ðŸ’¡ *Para votar usa:* /votar [opciÃ³n]\n`;
    mensajeVotacion += `ðŸ“ *Ejemplo:* /votar ${opciones[0]}\n\n`;
    mensajeVotacion += `_Â¡Participa y haz que tu voz sea escuchada!_ ðŸŽ¯`;
    
    await logCommand('administracion', 'crearvotacion', usuario, grupo);

  return { 
    success: true, 
      message: mensajeVotacion,
      votacionCreada: true,
      votacionId: votacionId
    };
  } catch (error) {
    console.error('Error al crear votaciÃ³n:', error);
    return { success: false, message: 'Error al crear votaciÃ³n.' };
  }
}

/**
 * /cerrarvotacion [ID] - Cierra una votaciÃ³n activa
 */
async function handleCerrarVotacion(id, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede cerrar votaciones.' };
  }
  
  try {
    const stmt = await db.prepare(
      'UPDATE votaciones SET estado = ? WHERE id = ?'
    );
    await stmt.run('cerrada', id);
    await stmt.finalize();
    
    await logCommand('administracion', 'cerrarvotacion', usuario, grupo);
    return { success: true, message: `âœ… VotaciÃ³n #${id} cerrada correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al cerrar votaciÃ³n.' };
  }
}

// Comandos de obtenciÃ³n desde grupos proveedor (solo Admin)

/**
 * /obtenermanhwa [nombre] - Descarga y guarda un manhwa desde grupo proveedor
 */
async function handleObtenerManhwa(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    // Simular obtenciÃ³n de manhwa
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Manhwa obtenido: ${nombre}`, 'manhwa', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenermanhwa', usuario, grupo);
    return { success: true, message: `âœ… Manhwa "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener manhwa.' };
  }
}

/**
 * /obtenerextra [nombre] - Descarga y guarda el extra de un manhwa
 */
async function handleObtenerExtra(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Extra obtenido: ${nombre}`, 'extra', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerextra', usuario, grupo);
    return { success: true, message: `âœ… Extra "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener extra.' };
  }
}

/**
 * /obtenerilustracion [nombre] - Guarda una ilustraciÃ³n desde grupo proveedor
 */
async function handleObtenerIlustracion(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO ilustraciones (imagen, usuario, grupo, fecha) VALUES (?, ?, ?, ?)'
    );
    await stmt.run(nombre, usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerilustracion', usuario, grupo);
    return { success: true, message: `âœ… IlustraciÃ³n "${nombre}" obtenida y guardada.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener ilustraciÃ³n.' };
  }
}

/**
 * /obtenerpack [nombre] - Guarda un pack de contenido desde grupo proveedor
 */
async function handleObtenerPack(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'âŒ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: 'âŒ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Pack obtenido: ${nombre}`, 'pack', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerpack', usuario, grupo);
    return { success: true, message: `âœ… Pack "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener pack.' };
  }
}

/**
 * /bot on - Activar el bot en el grupo
 */
async function handleBotOn(grupoId, usuario) {
  try {
    const normalizedUsuario = normalizeUserNumber(usuario);
    
    // Verificar si el bot ya estÃ¡ activado en este grupo
    const isCurrentlyDeactivated = await db('grupos_desactivados').where('jid', grupoId).first();
    
    if (!isCurrentlyDeactivated) {
      // El bot ya estÃ¡ activado, informar sin spam
      return {
        success: true,
        message: 'ðŸ¤– *El bot ya estÃ¡ activado en este grupo.*\n\nPuedes usar todos los comandos disponibles.'
      };
    }
    
    // Eliminar de grupos desactivados si existe
    await db('grupos_desactivados').where('jid', grupoId).del();
    // Limpiar avisos de grupo desactivado
    await clearGroupOffNotices(grupoId);
    await logCommand('administracion', 'bot_on', normalizedUsuario, grupoId);
    return {
      success: true,
      message: 'ðŸ¤– *Bot activado en este grupo.*\n\nÂ¡Ahora puedes usar todos los comandos!'
    };
  } catch (error) {
    return { success: false, message: 'â›” Error al activar el bot.' };
  }
}

/**
 * /bot off - Desactivar el bot en el grupo
 */
async function handleBotOff(grupoId, usuario) {
  try {
    const normalizedUsuario = normalizeUserNumber(usuario);
    
    // Verificar si el bot ya estÃ¡ desactivado en este grupo
    const isCurrentlyDeactivated = await db('grupos_desactivados').where('jid', grupoId).first();
    
    if (isCurrentlyDeactivated) {
      // El bot ya estÃ¡ desactivado, informar sin spam
      return {
        success: true,
        message: 'ðŸ¤– *El bot ya estÃ¡ desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.'
      };
    }
    
    // Agregar a grupos desactivados
    await db('grupos_desactivados').insert({
      jid: grupoId,
      desactivado_por: normalizedUsuario,
      fecha_desactivacion: new Date().toISOString()
    }).onConflict('jid').merge();
    await logCommand('administracion', 'bot_off', normalizedUsuario, grupoId);
    return {
      success: true,
      message: 'ðŸ¤– *Bot desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.'
    };
  } catch (error) {
    return { success: false, message: 'â›” Error al desactivar el bot.' };
  }
}

/**
 * /bot global on - Activar el bot globalmente
 */
async function handleBotGlobalOn(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (!isSuperAdmin(usuario)) {
    return { success: false, message: 'â›” Solo el bot principal puede controlar el bot globalmente.' };
  }
  try {
    // Verificar si el bot ya estÃ¡ activado globalmente
    const currentState = await db('bot_global_state').orderBy('fecha_cambio', 'desc').first();
    const isCurrentlyActive = !currentState || currentState.estado === 'on';
    
    if (isCurrentlyActive) {
      return {
        success: true,
        message: 'ðŸŒ *El bot ya estÃ¡ activado globalmente.*\n\nEl bot estÃ¡ funcionando en todos los grupos.'
      };
    }
    
    await db('bot_global_state').insert({
      estado: 'on',
      activado_por: normalizedUsuario,
      fecha_cambio: new Date().toISOString()
    });
    
    // Limpiar notificaciones de mantenimiento
    await clearMaintenanceNotifications();
    
    await logCommand('administracion', 'bot_global_on', normalizedUsuario, 'global');
    return {
      success: true,
      message: 'ðŸŒ *Bot activado globalmente.*\n\nÂ¡El bot estÃ¡ funcionando en todos los grupos!'
    };
  } catch (error) {
    return { success: false, message: 'â›” Error al activar el bot globalmente.' };
  }
}

/**
 * Notificar a todos los grupos sobre el apagado global
 */
async function notifyAllGroupsAboutGlobalShutdown(usuario) {
  try {
    const { getSocket } = await import('./whatsapp.js');
    const sock = getSocket();
    
    if (!sock) {
      console.log('âš ï¸ No hay conexiÃ³n de WhatsApp para enviar notificaciones');
      return { success: false, message: 'No hay conexiÃ³n de WhatsApp' };
    }

    // Obtener todos los grupos activos
    const grupos = await db('grupos').select('jid', 'nombre').where('bot_enabled', true);
    const notificationResults = [];
    
    const notificationMessage = `ðŸ”§ *NOTIFICACIÃ“N GLOBAL*\n\n` +
      `El bot ha sido desactivado globalmente por el administrador.\n` +
      `El bot no responderÃ¡ a ningÃºn comando hasta que se reactive.\n\n` +
      `Solo el administrador puede reactivarlo usando:\n` +
      `â€¢ \`/bot global on\` (comando)\n` +
      `â€¢ Panel de administraciÃ³n\n\n` +
      `_Esta notificaciÃ³n se enviÃ³ a todos los grupos activos._`;

    // Enviar notificaciÃ³n a cada grupo
    for (const grupo of grupos) {
      try {
        await sock.sendMessage(grupo.jid, { text: notificationMessage });
        
        // Registrar la notificaciÃ³n enviada
        await db('notificaciones_globales').insert({
          grupo_jid: grupo.jid,
          grupo_nombre: grupo.nombre,
          tipo: 'global_shutdown',
          mensaje: notificationMessage,
          enviado_por: normalizeUserNumber(usuario),
          fecha_envio: new Date().toISOString(),
          estado: 'enviado'
        });
        
        notificationResults.push({
          grupo: grupo.nombre,
          jid: grupo.jid,
          status: 'success'
        });
        
        console.log(`âœ… NotificaciÃ³n enviada a grupo: ${grupo.nombre}`);
        
        // PequeÃ±a pausa para evitar spam
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`âŒ Error enviando notificaciÃ³n a ${grupo.nombre}:`, error);
        
        // Registrar el error
        await db('notificaciones_globales').insert({
          grupo_jid: grupo.jid,
          grupo_nombre: grupo.nombre,
          tipo: 'global_shutdown',
          mensaje: notificationMessage,
          enviado_por: normalizeUserNumber(usuario),
          fecha_envio: new Date().toISOString(),
          estado: 'error',
          error_message: error.message
        });
        
        notificationResults.push({
          grupo: grupo.nombre,
          jid: grupo.jid,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      totalGroups: grupos.length,
      successfulNotifications: notificationResults.filter(r => r.status === 'success').length,
      failedNotifications: notificationResults.filter(r => r.status === 'error').length,
      results: notificationResults
    };
    
  } catch (error) {
    console.error('Error en notificaciÃ³n global:', error);
    return { success: false, message: 'Error enviando notificaciones globales' };
  }
}

/**
 * /bot global off - Desactivar el bot globalmente
 */
async function handleBotGlobalOff(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (!isSuperAdmin(usuario)) {
    return { success: false, message: 'â›” Solo el bot principal puede controlar el bot globalmente.' };
  }
  try {
    // Verificar si el bot ya estÃ¡ desactivado globalmente
    const currentState = await db('bot_global_state').orderBy('fecha_cambio', 'desc').first();
    const isCurrentlyActive = !currentState || currentState.estado === 'on';
    
    if (!isCurrentlyActive) {
      return {
        success: true,
        message: 'ðŸŒ *El bot ya estÃ¡ desactivado globalmente.*\n\nEl bot no responderÃ¡ a ningÃºn comando hasta que se reactive.'
      };
    }
    
    // Desactivar globalmente
    await db('bot_global_state').insert({
      estado: 'off',
      activado_por: normalizedUsuario,
      fecha_cambio: new Date().toISOString()
    });
    
    // Notificar a todos los grupos
    const notificationResult = await notifyAllGroupsAboutGlobalShutdown(usuario);
    
    await logCommand('administracion', 'bot_global_off', normalizedUsuario, 'global');
    
    let message = 'ðŸŒ *Bot desactivado globalmente.*\n\n';
    if (notificationResult.success) {
      message += `ðŸ“¢ Notificaciones enviadas:\n` +
        `â€¢ Grupos notificados: ${notificationResult.successfulNotifications}/${notificationResult.totalGroups}\n` +
        `â€¢ Exitosas: ${notificationResult.successfulNotifications}\n` +
        `â€¢ Fallidas: ${notificationResult.failedNotifications}\n\n`;
    }
    message += 'El bot no responderÃ¡ a ningÃºn comando hasta que se reactive.';
    
    return {
      success: true,
      message: message,
      notificationDetails: notificationResult
    };
  } catch (error) {
    return { success: false, message: 'â›” Error al desactivar el bot globalmente.' };
  }
}

/**
 * Verificar si el bot estÃ¡ activado globalmente
 */
async function isBotGloballyActive() {
  try {
    const state = await db('bot_global_state').orderBy('fecha_cambio', 'desc').first();
    return !state || state.estado === 'on';
  } catch (error) {
    console.error('Error al verificar estado global del bot:', error);
    return true; // Por defecto, activado
  }
}

/**
 * Verificar si un usuario ya fue notificado sobre el mantenimiento
 */
async function wasUserNotifiedAboutMaintenance(usuario, grupo = null) {
  try {
    const notification = await db('usuarios_notificados_mantenimiento')
      .where({ usuario, grupo })
      .first();
    return !!notification;
  } catch (error) {
    console.error('Error al verificar notificaciÃ³n de mantenimiento:', error);
    return false;
  }
}

/**
 * Marcar usuario como notificado sobre mantenimiento
 */
async function markUserAsNotifiedAboutMaintenance(usuario, grupo = null) {
  try {
    await db('usuarios_notificados_mantenimiento').insert({
      usuario,
      grupo,
      fecha_notificacion: new Date().toISOString()
    }).onConflict(['usuario', 'grupo']).ignore();
  } catch (error) {
    console.error('Error al marcar usuario como notificado:', error);
  }
}

/**
 * Limpiar notificaciones de mantenimiento (cuando se reactiva el bot)
 */
async function clearMaintenanceNotifications() {
  try {
    await db('usuarios_notificados_mantenimiento').del();
    console.log('ðŸ§¹ Notificaciones de mantenimiento limpiadas');
  } catch (error) {
    console.error('Error al limpiar notificaciones de mantenimiento:', error);
  }
}

/**
 * Limpiar avisos de grupo desactivado
 */
async function clearGroupOffNotices(grupoId) {
  try {
    await db('avisos_grupo_off').where('grupo_jid', grupoId).del();
    console.log(`ðŸ§¹ Avisos de grupo ${grupoId} limpiados`);
  } catch (error) {
    console.error('Error al limpiar avisos de grupo:', error);
  }
}

/**
 * /update - Actualizar configuraciÃ³n desde el bot principal
 */
async function handleUpdate(usuario) {
  if (!await isOwnerOrAdmin(usuario, grupo)) {
    return { success: false, message: 'â›” Solo el bot principal puede actualizar la configuraciÃ³n.' };
  }
  try {
    await logCommand('administracion', 'update_config', usuario, 'global');
    return {
      success: true,
      message: 'ðŸ”„ *Actualizando configuraciÃ³n desde el bot principal...*\n\nðŸ“¥ *Descargando:*\nâ€¢ Comandos actualizados\nâ€¢ Configuraciones de sistema\nâ€¢ Lista de admins\nâ€¢ ParÃ¡metros de funcionamiento\n\nâ³ *Proceso completado*\nâœ… *ConfiguraciÃ³n sincronizada exitosamente*'
    };
  } catch (error) {
    return { success: false, message: 'â›” Error al actualizar la configuraciÃ³n.' };
  }
}

function sanitizePhoneNumber(value) {
  if (!value) return null;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length >= 7 ? digits : null;
}

function ensureWhatsAppJid(identifier) {
  if (!identifier) return null;
  return identifier.includes('@') ? identifier : `${identifier}@s.whatsapp.net`;
}

function extractDigitsFromJid(jid) {
  if (!jid) return null;
  return sanitizePhoneNumber(jid.split('@')[0]);
}

function sanitizeCustomPairingCode(value) {
  if (!value) return null;
  const cleaned = String(value).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return cleaned.length === 8 ? cleaned : null;
}
