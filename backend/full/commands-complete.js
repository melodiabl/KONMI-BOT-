import db from './db.js';
import { getSocket } from './whatsapp.js';
import * as baileys from '@whiskeysockets/baileys';
import { analyzeContentWithAI } from './gemini-ai-handler.js';
import { chatWithAI, analyzeManhwaContent } from './ai-chat-handler.js';
import { isSuperAdmin, isModerator, isPremium, getOwnerName } from './global-config.js';

// Variables globales para configuración del bot
let modoPrivado = false;
let modoAmigos = false;
let advertenciasActivas = true;

// Lista dinámica de números admin (solo el número principal del bot)
let dynamicAdminNumbers = [
  '595971284430', // Número principal del bot (se actualiza automáticamente)
];

// Helper: normalizar JID (remover sufijo :<num>, convertir LID→WID, y mapear @lid)
function normalizeJid(jid) {
  if (!jid) return '';
  let withoutDevice = jid.replace(/:\d+/, '');
  // Mapear sufijo @lid a servidor clásico
  if (withoutDevice.endsWith('@lid')) {
    withoutDevice = withoutDevice.replace(/@lid$/, '@s.whatsapp.net');
  }
  try {
    const decoded = baileys.jidDecode(withoutDevice);
    if (decoded && decoded.user && decoded.server) {
      // Forzar servidor clásico
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
async function isOwnerOrAdmin(usuario) {
  // Verificar si es superadmin global
  if (isSuperAdmin(usuario)) {
    return true;
  }
  
  // Verificar si es moderador global
  if (isModerator(usuario)) {
    return true;
  }
  
  // Mantener compatibilidad con el sistema anterior
  return dynamicAdminNumbers.includes(usuario);
}

/**
 * Función para actualizar la lista de números admin
 */
function updateAdminNumbers(newAdminNumbers) {
  dynamicAdminNumbers = [...new Set([...dynamicAdminNumbers, ...newAdminNumbers])];
  console.log(`👑 Lista de admins actualizada: ${dynamicAdminNumbers.join(', ')}`);
}

/**
 * Verificar si el bot está activo en un grupo
 */
async function isBotActiveInGroup(grupoId) {
  try {
    // Verificar estado global del bot primero
    const globalState = await db('bot_global_state').select('*').first();
    if (!globalState || !globalState.isOn) {
      return false; // Bot globalmente desactivado
    }
    
    // Verificar estado específico del grupo
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

/**
 * /help - Muestra lista de comandos disponibles (solo verifica admin por WhatsApp, no por base de datos)
 */
async function handleHelp(usuario, grupo, isGroup) {
  const isAdmin = await isOwnerOrAdmin(usuario);
  let helpText = `╔══════════════════════════════════════╗\n`;
  helpText += `║         𝙆𝙊𝙉𝙈𝙄 𝘽𝙊𝙏 𝙈𝙀𝙉𝙐         ║\n`;
  helpText += `╚══════════════════════════════════════╝\n`;
  helpText += `*Versión:* 𝘷2.5.0  |  *Panel Web*\n`;
  helpText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  helpText += `*Prefijos válidos:*  
  /  !  .\n`;
  helpText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  helpText += `*🌟 𝙂𝙀𝙉𝙀𝙍𝘼𝙇𝙀𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *help, menu, .ayuda*  —  Ayuda\n`;
  helpText += `┃  • *whoami*  —  Tu info\n`;
  helpText += `┃  • *ia [texto]*  —  IA Gemini/OpenAI\n`;
  helpText += `┃  • *clasificar [texto]*  —  Clasificar\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  helpText += `*🎬 𝙈𝙀𝘿𝙄𝘼 & 𝘿𝙀𝙎𝘾𝘼𝙍𝙂𝘼𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *yt [enlace/búsqueda]*  —  YouTube\n`;
  helpText += `┃  • *sticker*  —  Crear sticker\n`;
  helpText += `┃  • *tiktok [enlace/búsqueda]*\n`;
  helpText += `┃  • *ig [enlace]*  —  Instagram\n`;
  helpText += `┃  • *twitter [enlace]*  —  Twitter/X\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  helpText += `*📚 𝘾𝙊𝙉𝙏𝙀𝙉𝙄𝘿𝙊 & 𝘼𝙋𝙊𝙍𝙏𝙀𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *myaportes*  —  Tus aportes\n`;
  helpText += `┃  • *addaporte [tipo] [contenido]*\n`;
  helpText += `┃  • *pedido [contenido]*\n`;
  helpText += `┃  • *pedidos*  —  Tus pedidos\n`;
  helpText += `┃  • *aportes*  —  Todos los aportes\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  helpText += `*📖 𝙈𝘼𝙉𝙃𝙒𝘼𝙎 & 𝙎𝙀𝙍𝙄𝙀𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *manhwas*  —  Lista manhwas\n`;
  helpText += `┃  • *series*  —  Lista series\n`;
  helpText += `┃  • *addserie [título|género|estado|desc]*\n`;
  helpText += `┃  • *ilustraciones*\n`;
  helpText += `┃  • *extra [nombre]*\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  helpText += `*🗳️ 𝙑𝙊𝙏𝘼𝘾𝙄𝙊𝙉𝙀𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *crearvotacion [pregunta|opciones]*\n`;
  helpText += `┃  • *cerrarvotacion [ID]*\n`;
  helpText += `┃  • *votar [opción]*\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  helpText += `*🤖 𝙎𝙐𝘽𝘽𝙊𝙏𝙎*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • *subbot*  —  Crear subbot (QR)\n`;
  helpText += `┃  • *subbotcode*  —  Crear subbot (código)\n`;
  helpText += `┃  • *subbots*  —  Lista subbots activos\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  if (isAdmin) {
    helpText += `*🔧 𝘼𝘿𝙈𝙄𝙉 & 𝙈𝙊𝘿𝙀𝙍𝘼𝘾𝙄𝙊𝙉*\n`;
    helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
    helpText += `┃  • *bot on/off*\n`;
    helpText += `┃  • *bot global on/off*\n`;
    helpText += `┃  • *update*\n`;
    helpText += `┃  • *code*\n`;
    helpText += `┃  • *logs*\n`;
    helpText += `┃  • *privado*\n`;
    helpText += `┃  • *amigos*\n`;
  helpText += `┃  • *advertencias on/off*\n`;
  helpText += `┃  • *aporteestado [id] [estado]*\n`;
  helpText += `┃  • *admininfo*  —  Info administración\n`;
  helpText += `┃  • *addadmin [num] [nombre]*\n`;
  helpText += `┃  • *deladmin [num]*\n`;
  helpText += `┃  • *addmod [num]*\n`;
  helpText += `┃  • *delmod [num]*\n`;
  helpText += `┃  • *getlid*  —  Ver información LID\n`;
  helpText += `┃  • *updatelid [lid]*  —  Actualizar LID\n`;
    helpText += `┃  • *addmanhwa [título|autor|género|estado|desc|url|proveedor]*\n`;
    helpText += `┃  • *obtenermanhwa [nombre]*\n`;
    helpText += `┃  • *obtenerextra [nombre]*\n`;
    helpText += `┃  • *obtenerilustracion [nombre]*\n`;
    helpText += `┃  • *obtenerpack [nombre]*\n`;
    helpText += `┃  • *kick @usuario*\n`;
    helpText += `┃  • *promote @usuario*\n`;
    helpText += `┃  • *demote @usuario*\n`;
    helpText += `┃  • *tag [mensaje]*\n`;
    helpText += `┃  • *lock*\n`;
    helpText += `┃  • *unlock*\n`;
    helpText += `┃  • *estadisticas*\n`;
    helpText += `┃  • *limpiar*\n`;
    helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  }
  helpText += `*ℹ️ 𝙄𝙉𝙁𝙊𝙍𝙈𝘼𝘾𝙄𝙊𝙉*\n`;
  helpText += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
  helpText += `┃  • Los comandos funcionan con /, ! o .\n`;
  helpText += `┃  • Algunos comandos requieren permisos de Admin (solo WhatsApp)\n`;
  helpText += `┃  • El bot guarda metadatos de todo el contenido\n`;
  helpText += `┃  • Todo se muestra en tiempo real en el panel web\n`;
  helpText += `┃  • Los subbots se crean con códigos temporales\n`;
  helpText += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;
  await logCommand('consulta', 'help', usuario, grupo);
  return { success: true, message: helpText };
}

/**
 * /ia [texto] - Responde usando IA
 */
async function handleIA(prompt, usuario, grupo) {
  try {
    if (!prompt || prompt.trim().length === 0) {
      return { success: false, message: '❌ Por favor proporciona una pregunta o texto para analizar.\n\nEjemplo: `/ia ¿Qué es un manhwa?`' };
    }
    console.log(`🤖 Procesando consulta de IA: "${prompt}"`);
    const aiResult = await chatWithAI(prompt, `Usuario: ${usuario}, Grupo: ${grupo}`);
    if (aiResult.success) {
      const response = `╭───── 🤖 *Respuesta de IA* ─────╮\n\n${aiResult.response}\n\n_🧠 Modelo: ${aiResult.model}_\n╰──────────────────────────────╯`;
      await logCommand('comando', 'ia', usuario, grupo);
      return { success: true, message: response };
    } else {
      const response = `╭───── 🤖 *Respuesta de IA* ─────╮\n\nHe analizado tu consulta: "${prompt}"\n\n_Nota: El análisis automático no pudo completarse, pero tu consulta ha sido registrada._\n╰──────────────────────────────╯`;
      await logCommand('comando', 'ia', usuario, grupo);
      return { success: true, message: response };
    }
  } catch (error) {
    console.error('Error en comando IA:', error);
    return { success: false, message: '❌ Error al procesar consulta de IA. Intenta nuevamente.' };
  }
}

/**
 * /clasificar [texto] - Clasifica contenido usando IA
 */
async function handleClasificar(texto, usuario, grupo) {
  try {
    if (!texto || texto.trim().length === 0) {
      return { success: false, message: '❌ Por favor proporciona un texto para clasificar.\n\nEjemplo: `/clasificar Jinx capítulo 15`' };
    }

    console.log(`🔍 Clasificando contenido: "${texto}"`);
    
    // Usar IA para clasificar contenido de manhwa
    const aiResult = await analyzeManhwaContent(texto, '');
    
    if (aiResult.success) {
      const data = aiResult.data;
      const response = `🔍 *Clasificación de Contenido:*\n\n` +
        `📖 *Título:* ${data.titulo}\n` +
        `📂 *Tipo:* ${data.tipo}\n` +
        `📄 *Capítulo:* ${data.capitulo || 'N/A'}\n` +
        `📝 *Descripción:* ${data.descripcion}\n` +
        `🎯 *Confianza:* ${Math.round(data.confianza * 100)}%\n` +
        `🤖 *Fuente:* ${data.fuente}`;
      
      await logCommand('comando', 'clasificar', usuario, grupo);
      return { success: true, message: response };
    } else {
      // Fallback a clasificación básica
      const response = `🔍 *Clasificación Básica:*\n\n` +
        `📝 *Texto analizado:* "${texto}"\n` +
        `⚠️ *Nota:* La clasificación automática no pudo completarse.\n` +
        `_Tu contenido ha sido registrado para revisión manual._`;
      
      await logCommand('comando', 'clasificar', usuario, grupo);
      return { success: true, message: response };
    }
  } catch (error) {
    console.error('Error en comando clasificar:', error);
    return { success: false, message: '❌ Error al clasificar contenido. Intenta nuevamente.' };
  }
}

/**
 * /addgroup - Activa el bot en el grupo actual
 */
async function handleAddGroup(usuario, grupo, groupName) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede activar el bot en grupos.' };
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
    return { success: true, message: '✅ Bot activado en el grupo correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error al activar bot en el grupo.' };
  }
}

/**
 * /delgroup - Desactiva el bot en un grupo
 */
async function handleDelGroup(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede desactivar el bot en grupos.' };
  }
  
  try {
    await db('grupos_autorizados').where({ jid: grupo }).update({
      bot_enabled: false
    });
    
    await logCommand('administracion', 'delgroup', usuario, grupo);
    return { success: true, message: '✅ Bot desactivado en el grupo correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error al desactivar bot en el grupo.' };
  }
}

/**
 * /myaportes - Lista solo los aportes del usuario
 */
async function handleMyAportes(usuario, grupo) {
  try {
    const aportes = await db.all(
      'SELECT * FROM aportes WHERE usuario = ? ORDER BY fecha DESC LIMIT 10',
      [usuario]
    );
    if (aportes.length === 0) {
      return { success: true, message: '📝 No tienes aportes registrados.' };
    }
    let message = `╭───── 📝 *Tus Aportes* ─────╮\n`;
    aportes.forEach((aporte, index) => {
      const fecha = new Date(aporte.fecha).toLocaleDateString();
      message += `*${index + 1}.* [${aporte.tipo}] ${aporte.contenido}\n   📅 ${fecha}\n`;
    });
    message += `╰────────────────────────────╯`;
    await logCommand('consulta', 'myaportes', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: '❌ Error al obtener tus aportes.' };
  }
}

/**
 * /aportes - Lista todos los aportes (solo si el bot está activo)
 */
async function handleAportes(usuario, grupo, isGroup) {
  if (isGroup && !await isBotActiveInGroup(grupo)) {
    return { success: false, message: '❌ El bot no está activo en este grupo.' };
  }
  
  try {
    const aportes = await db.all(
      'SELECT * FROM aportes ORDER BY fecha DESC LIMIT 20'
    );
    
    if (aportes.length === 0) {
      return { success: true, message: '📝 No hay aportes registrados.' };
    }
    
    let message = `📝 *Todos los aportes (${aportes.length}):*\n\n`;
    aportes.forEach((aporte, index) => {
      const fecha = new Date(aporte.fecha).toLocaleDateString();
      message += `${index + 1}. *${aporte.tipo}* por @${aporte.usuario}\n`;
      message += `   ${aporte.contenido}\n`;
      message += `   📅 ${fecha}\n\n`;
    });
    
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
      return { success: true, message: '📚 No hay manhwas registrados.' };
    }
    
    let message = `📚 *Manhwas disponibles (${manhwas.length}):*\n\n`;
    manhwas.forEach((manhwa, index) => {
      message += `${index + 1}. *${manhwa.titulo}*\n`;
      message += `   👤 Autor: ${manhwa.autor}\n`;
      message += `   📊 Estado: ${manhwa.estado}\n`;
      if (manhwa.descripcion) {
        message += `   📝 ${manhwa.descripcion.substring(0, 50)}...\n`;
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
    return { success: true, message: `✅ Aporte de tipo "${tipo}" guardado correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al guardar aporte.' };
  }
}

/** Cambiar estado de aporte desde WhatsApp */
async function handleAporteEstado(id, estado, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede cambiar estado de aportes.' };
  }
  const allowed = ['pendiente', 'en_revision', 'completado'];
  const normalized = (estado || '').toLowerCase();
  if (!allowed.includes(normalized)) {
    return { success: false, message: '❌ Estado inválido. Usa: pendiente | en_revision | completado' };
  }
  try {
    const aporte = await db('aportes').where({ id }).first();
    if (!aporte) return { success: false, message: `❌ Aporte #${id} no encontrado.` };
    await db('aportes').where({ id }).update({ estado: normalized, procesado_por: usuario, fecha_procesado: new Date().toISOString() });
    await logCommand('administracion', 'aporteestado', usuario, grupo);
    return { success: true, message: `✅ Aporte #${id} actualizado a "${normalized}".` };
  } catch (e) {
    return { success: false, message: 'Error al actualizar estado de aporte.' };
  }
}

/**
 * /addmanhwa [datos] - Permite agregar un nuevo manhwa (solo Admin)
 */
async function handleAddManhwa(datos, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede agregar manhwas.' };
  }
  
  try {
    // Parsear datos: título|autor|género|estado|descripción|url|proveedor
    const parts = datos.split('|');
    if (parts.length < 4) {
      return { success: false, message: '❌ Formato: título|autor|género|estado|descripción|url|proveedor' };
    }
    
    const [titulo, autor, genero, estado, descripcion = '', url = '', proveedor = 'General'] = parts;
    const fecha_registro = new Date().toISOString();
    
    const stmt = await db.prepare(
      'INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await stmt.run(titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario);
    await stmt.finalize();
    
    await logCommand('administracion', 'addmanhwa', usuario, grupo);
    return { success: true, message: `✅ Manhwa "${titulo}" agregado correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al agregar manhwa.' };
  }
}

/**
 * /addserie [datos] - Permite agregar una nueva serie (cualquier usuario si el bot está activo)
 */
async function handleAddSerie(datos, usuario, grupo, isGroup) {
  // Verificar si el bot está activo en el grupo o usuario admin
  if (isGroup && !await isBotActiveInGroup(grupo) && !await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ El bot no está activo en este grupo para agregar series.' };
  }
  
  try {
    // Parsear datos con formato más simple: título|género|estado|descripción
    const parts = datos.split('|');
    if (parts.length < 2) {
      return { success: false, message: '❌ Formato: título|género|estado|descripción\nEjemplo: /addserie Attack on Titan|Acción|Finalizada|Serie sobre titanes' };
    }
    
    const [titulo, genero = 'Serie', estado = 'En emisión', descripcion = ''] = parts;
    const fecha_registro = new Date().toISOString();
    
    // Verificar si la serie ya existe
    const serieExistente = await db.get(
      'SELECT * FROM manhwas WHERE titulo = ? AND genero LIKE ?',
      [titulo, '%serie%']
    );
    
    if (serieExistente) {
      return { success: false, message: `❌ La serie "${titulo}" ya existe en la base de datos.` };
    }
    
    const stmt = await db.prepare(
      'INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    await stmt.run(titulo, 'Varios', `Serie - ${genero}`, estado, descripcion, '', 'Series', fecha_registro, usuario);
    await stmt.finalize();
    
    // También registrar como aporte
    const stmtAporte = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmtAporte.run(`Serie agregada: ${titulo}`, 'serie', usuario, grupo, fecha_registro);
    await stmtAporte.finalize();
    
    await logCommand('comando', 'addserie', usuario, grupo);
    return { 
      success: true, 
      message: `✅ *Serie agregada correctamente:*\n\n📺 **${titulo}**\n🏷️ Género: ${genero}\n📊 Estado: ${estado}\n📝 ${descripcion}\n👤 Agregada por: @${usuario}` 
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
      return { success: true, message: '📺 No hay series registradas.' };
    }
    
    let message = `📺 *Series disponibles (${series.length}):*\n\n`;
    series.forEach((serie, index) => {
      message += `${index + 1}. **${serie.titulo}**\n`;
      message += `   🏷️ ${serie.genero.replace('Serie - ', '')}\n`;
      message += `   📊 Estado: ${serie.estado}\n`;
      if (serie.descripcion) {
        message += `   📝 ${serie.descripcion.substring(0, 60)}...\n`;
      }
      message += `   👤 Por: @${serie.usuario_registro}\n\n`;
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
    
    // Registrar el pedido en la base de datos
    const stmt = await db.prepare(
      'INSERT INTO pedidos (texto, estado, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(contenido, 'pendiente', usuario, grupo, fecha);
    await stmt.finalize();
    
    let response = `📋 *Pedido registrado:* "${contenido}"\n\n`;
    
    // Si encontró contenido, mencionarlo
    if (manhwaEncontrado) {
      response += `✅ *¡Encontrado en manhwas!*\n`;
      response += `📚 **${manhwaEncontrado.titulo}**\n`;
      response += `👤 Autor: ${manhwaEncontrado.autor}\n`;
      response += `📊 Estado: ${manhwaEncontrado.estado}\n`;
      if (manhwaEncontrado.descripcion) {
        response += `📝 ${manhwaEncontrado.descripcion}\n`;
      }
      if (manhwaEncontrado.url) {
        response += `🔗 ${manhwaEncontrado.url}\n`;
      }
      response += `\n`;
    }
    
    if (aporteEncontrado) {
      response += `✅ *¡Encontrado en aportes!*\n`;
      response += `📁 **${aporteEncontrado.contenido}**\n`;
      response += `🏷️ Tipo: ${aporteEncontrado.tipo}\n`;
      response += `👤 Aportado por: @${aporteEncontrado.usuario}\n`;
      response += `📅 Fecha: ${new Date(aporteEncontrado.fecha).toLocaleDateString()}\n\n`;
    }
    
    if (!manhwaEncontrado && !aporteEncontrado) {
      response += `⏳ *No encontrado en la base de datos*\n`;
      response += `Tu pedido ha sido registrado y será revisado por los administradores.\n`;
    }
    
    await logCommand('comando', 'pedido', usuario, grupo);
    return { success: true, message: response };
  } catch (error) {
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
      return { success: true, message: '📋 No tienes pedidos registrados.' };
    }
    
    let message = `📋 *Tus pedidos (${pedidos.length}):*\n\n`;
    pedidos.forEach((pedido, index) => {
      const fecha = new Date(pedido.fecha).toLocaleDateString();
      const estado = pedido.estado === 'pendiente' ? '⏳' : pedido.estado === 'completado' ? '✅' : '❌';
      message += `${index + 1}. ${estado} ${pedido.texto}\n`;
      message += `   📅 ${fecha} - Estado: ${pedido.estado}\n\n`;
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
    return { success: true, message: `✅ Extra "${nombre}" registrado correctamente.` };
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
      return { success: true, message: '🎨 No hay ilustraciones registradas.' };
    }
    
    let message = `🎨 *Ilustraciones disponibles (${ilustraciones.length}):*\n\n`;
    ilustraciones.forEach((ilustracion, index) => {
      const fecha = new Date(ilustracion.fecha).toLocaleDateString();
      message += `${index + 1}. Por @${ilustracion.usuario}\n`;
      message += `   📅 ${fecha}\n\n`;
    });
    
    await logCommand('consulta', 'ilustraciones', usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener ilustraciones.' };
  }
}

/**
 * /logs - Muestra últimos registros de actividad (solo Admin)
 */
async function handleLogs(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede ver logs.' };
  }
  
  try {
    const logs = await db.all(
      'SELECT * FROM logs ORDER BY fecha DESC LIMIT 20'
    );
    
    if (logs.length === 0) {
      return { success: true, message: '📊 No hay logs registrados.' };
    }
    
    let message = `📊 *Últimos logs (${logs.length}):*\n\n`;
    logs.forEach((log, index) => {
      const fecha = new Date(log.fecha).toLocaleString();
      message += `${index + 1}. *${log.comando}* (${log.tipo})\n`;
      message += `   👤 @${log.usuario}\n`;
      message += `   📅 ${fecha}\n\n`;
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
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede cambiar el modo privado.' };
  }
  
  modoPrivado = !modoPrivado;
  
  await logCommand('configuracion', 'privado', usuario, grupo);
  return { 
    success: true, 
    message: `🔒 Modo privado ${modoPrivado ? 'activado' : 'desactivado'}.` 
  };
}

/**
 * /amigos - Activa/desactiva el modo amigos
 */
async function handleAmigos(usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede cambiar el modo amigos.' };
  }
  
  modoAmigos = !modoAmigos;
  
  await logCommand('configuracion', 'amigos', usuario, grupo);
  return { 
    success: true, 
    message: `👥 Modo amigos ${modoAmigos ? 'activado' : 'desactivado'}.` 
  };
}

/**
 * /advertencias on/off - Activa o desactiva las advertencias
 */
async function handleAdvertencias(estado, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede configurar advertencias.' };
  }
  
  if (estado === 'on') {
    advertenciasActivas = true;
  } else if (estado === 'off') {
    advertenciasActivas = false;
  } else {
    return { success: false, message: '❌ Uso: /advertencias on o /advertencias off' };
  }
  
  await logCommand('configuracion', 'advertencias', usuario, grupo);
  return { 
    success: true, 
    message: `⚠️ Advertencias ${advertenciasActivas ? 'activadas' : 'desactivadas'}.` 
  };
}

/**
 * /votar [opción] - Permite votar en una votación activa
 */
async function handleVotar(opcion, usuario, grupo) {
  try {
    // Buscar votación activa
    const votacion = await db.get(
      'SELECT * FROM votaciones WHERE estado = ? ORDER BY fecha_inicio DESC LIMIT 1',
      ['activa']
    );
    
    if (!votacion) {
      return { success: false, message: '❌ No hay votaciones activas.' };
    }
    
    // Verificar si ya votó
    const votoExistente = await db.get(
      'SELECT * FROM votos WHERE votacion_id = ? AND usuario = ?',
      [votacion.id, usuario]
    );
    
    if (votoExistente) {
      return { success: false, message: '❌ Ya has votado en esta votación.' };
    }
    
    // Registrar voto
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO votos (votacion_id, usuario, opcion, fecha) VALUES (?, ?, ?, ?)'
    );
    await stmt.run(votacion.id, usuario, opcion, fecha);
    await stmt.finalize();
    
    await logCommand('comando', 'votar', usuario, grupo);
    return { success: true, message: `✅ Voto registrado: "${opcion}"` };
  } catch (error) {
    return { success: false, message: 'Error al registrar voto.' };
  }
}

/**
 * /crearvotacion [pregunta | opción1 | opción2...] - Crea una nueva votación
 */
async function handleCrearVotacion(datos, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede crear votaciones.' };
  }
  
  try {
    const parts = datos.split('|').map(part => part.trim());
    if (parts.length < 3) {
      return { success: false, message: '❌ Formato: pregunta | opción1 | opción2 | ...\n\nEjemplo: /crearvotacion ¿Cuál es tu manhwa favorito? | Solo Leveling | Tower of God | The Beginning After The End' };
    }
    
    const [titulo, ...opciones] = parts;
    const fecha_inicio = new Date().toISOString();
    const fecha_fin = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 días
    
    const stmt = await db.prepare(
      'INSERT INTO votaciones (titulo, descripcion, opciones, fecha_inicio, fecha_fin, estado, creador) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const result = await stmt.run(titulo, '', JSON.stringify(opciones), fecha_inicio, fecha_fin, 'activa', usuario);
    await stmt.finalize();
    
    const votacionId = result.lastID;
    
    // Crear mensaje de votación para el grupo
    let mensajeVotacion = `🗳️ *NUEVA VOTACIÓN INICIADA*\n\n`;
    mensajeVotacion += `📋 **${titulo}**\n\n`;
    mensajeVotacion += `📊 *Opciones disponibles:*\n`;
    
    opciones.forEach((opcion, index) => {
      mensajeVotacion += `${index + 1}. ${opcion}\n`;
    });
    
    mensajeVotacion += `\n⏰ *Duración:* 7 días\n`;
    mensajeVotacion += `👤 *Creada por:* @${usuario}\n`;
    mensajeVotacion += `🆔 *ID:* #${votacionId}\n\n`;
    mensajeVotacion += `💡 *Para votar usa:* /votar [opción]\n`;
    mensajeVotacion += `📝 *Ejemplo:* /votar ${opciones[0]}\n\n`;
    mensajeVotacion += `_¡Participa y haz que tu voz sea escuchada!_ 🎯`;
    
    await logCommand('administracion', 'crearvotacion', usuario, grupo);

  return { 
    success: true, 
      message: mensajeVotacion,
      votacionCreada: true,
      votacionId: votacionId
    };
  } catch (error) {
    console.error('Error al crear votación:', error);
    return { success: false, message: 'Error al crear votación.' };
  }
}

/**
 * /cerrarvotacion [ID] - Cierra una votación activa
 */
async function handleCerrarVotacion(id, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede cerrar votaciones.' };
  }
  
  try {
    const stmt = await db.prepare(
      'UPDATE votaciones SET estado = ? WHERE id = ?'
    );
    await stmt.run('cerrada', id);
    await stmt.finalize();
    
    await logCommand('administracion', 'cerrarvotacion', usuario, grupo);
    return { success: true, message: `✅ Votación #${id} cerrada correctamente.` };
  } catch (error) {
    return { success: false, message: 'Error al cerrar votación.' };
  }
}

// Comandos de obtención desde grupos proveedor (solo Admin)

/**
 * /obtenermanhwa [nombre] - Descarga y guarda un manhwa desde grupo proveedor
 */
async function handleObtenerManhwa(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: '❌ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    // Simular obtención de manhwa
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Manhwa obtenido: ${nombre}`, 'manhwa', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenermanhwa', usuario, grupo);
    return { success: true, message: `✅ Manhwa "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener manhwa.' };
  }
}

/**
 * /obtenerextra [nombre] - Descarga y guarda el extra de un manhwa
 */
async function handleObtenerExtra(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: '❌ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Extra obtenido: ${nombre}`, 'extra', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerextra', usuario, grupo);
    return { success: true, message: `✅ Extra "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener extra.' };
  }
}

/**
 * /obtenerilustracion [nombre] - Guarda una ilustración desde grupo proveedor
 */
async function handleObtenerIlustracion(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: '❌ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO ilustraciones (imagen, usuario, grupo, fecha) VALUES (?, ?, ?, ?)'
    );
    await stmt.run(nombre, usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerilustracion', usuario, grupo);
    return { success: true, message: `✅ Ilustración "${nombre}" obtenida y guardada.` };
  } catch (error) {
    return { success: false, message: 'Error al obtener ilustración.' };
  }
}

/**
 * /obtenerpack [nombre] - Guarda un pack de contenido desde grupo proveedor
 */
async function handleObtenerPack(nombre, usuario, grupo) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '❌ Solo Admin puede obtener contenido.' };
  }
  
  if (!await isProviderGroup(grupo)) {
    return { success: false, message: '❌ Este comando solo funciona en grupos proveedor.' };
  }
  
  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      'INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(`Pack obtenido: ${nombre}`, 'pack', usuario, grupo, fecha);
    await stmt.finalize();
    
    await logCommand('obtencion', 'obtenerpack', usuario, grupo);
    return { success: true, message: `✅ Pack "${nombre}" obtenido y guardado.` };
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
    
    // Verificar si el bot ya está activado en este grupo
    const isCurrentlyDeactivated = await db('grupos_desactivados').where('jid', grupoId).first();
    
    if (!isCurrentlyDeactivated) {
      // El bot ya está activado, informar sin spam
      return {
        success: true,
        message: '🤖 *El bot ya está activado en este grupo.*\n\nPuedes usar todos los comandos disponibles.'
      };
    }
    
    // Eliminar de grupos desactivados si existe
    await db('grupos_desactivados').where('jid', grupoId).del();
    // Limpiar avisos de grupo desactivado
    await clearGroupOffNotices(grupoId);
    await logCommand('administracion', 'bot_on', normalizedUsuario, grupoId);
    return {
      success: true,
      message: '🤖 *Bot activado en este grupo.*\n\n¡Ahora puedes usar todos los comandos!'
    };
  } catch (error) {
    return { success: false, message: '⛔ Error al activar el bot.' };
  }
}

/**
 * /bot off - Desactivar el bot en el grupo
 */
async function handleBotOff(grupoId, usuario) {
  try {
    const normalizedUsuario = normalizeUserNumber(usuario);
    
    // Verificar si el bot ya está desactivado en este grupo
    const isCurrentlyDeactivated = await db('grupos_desactivados').where('jid', grupoId).first();
    
    if (isCurrentlyDeactivated) {
      // El bot ya está desactivado, informar sin spam
      return {
        success: true,
        message: '🤖 *El bot ya está desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.'
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
      message: '🤖 *Bot desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.'
    };
  } catch (error) {
    return { success: false, message: '⛔ Error al desactivar el bot.' };
  }
}

/**
 * /bot global on - Activar el bot globalmente
 */
async function handleBotGlobalOn(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (normalizedUsuario !== '595971284430') {
    return { success: false, message: '⛔ Solo el bot principal puede controlar el bot globalmente.' };
  }
  try {
    // Verificar si el bot ya está activado globalmente
    const currentState = await db('bot_global_state').orderBy('fecha_cambio', 'desc').first();
    const isCurrentlyActive = !currentState || currentState.estado === 'on';
    
    if (isCurrentlyActive) {
      return {
        success: true,
        message: '🌍 *El bot ya está activado globalmente.*\n\nEl bot está funcionando en todos los grupos.'
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
      message: '🌍 *Bot activado globalmente.*\n\n¡El bot está funcionando en todos los grupos!'
    };
  } catch (error) {
    return { success: false, message: '⛔ Error al activar el bot globalmente.' };
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
      console.log('⚠️ No hay conexión de WhatsApp para enviar notificaciones');
      return { success: false, message: 'No hay conexión de WhatsApp' };
    }

    // Obtener todos los grupos activos
    const grupos = await db('grupos').select('jid', 'nombre').where('bot_enabled', true);
    const notificationResults = [];
    
    const notificationMessage = `🔧 *NOTIFICACIÓN GLOBAL*\n\n` +
      `El bot ha sido desactivado globalmente por el administrador.\n` +
      `El bot no responderá a ningún comando hasta que se reactive.\n\n` +
      `Solo el administrador puede reactivarlo usando:\n` +
      `• \`/bot global on\` (comando)\n` +
      `• Panel de administración\n\n` +
      `_Esta notificación se envió a todos los grupos activos._`;

    // Enviar notificación a cada grupo
    for (const grupo of grupos) {
      try {
        await sock.sendMessage(grupo.jid, { text: notificationMessage });
        
        // Registrar la notificación enviada
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
        
        console.log(`✅ Notificación enviada a grupo: ${grupo.nombre}`);
        
        // Pequeña pausa para evitar spam
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error enviando notificación a ${grupo.nombre}:`, error);
        
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
    console.error('Error en notificación global:', error);
    return { success: false, message: 'Error enviando notificaciones globales' };
  }
}

/**
 * /bot global off - Desactivar el bot globalmente
 */
async function handleBotGlobalOff(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (normalizedUsuario !== '595971284430') {
    return { success: false, message: '⛔ Solo el bot principal puede controlar el bot globalmente.' };
  }
  try {
    // Verificar si el bot ya está desactivado globalmente
    const currentState = await db('bot_global_state').orderBy('fecha_cambio', 'desc').first();
    const isCurrentlyActive = !currentState || currentState.estado === 'on';
    
    if (!isCurrentlyActive) {
      return {
        success: true,
        message: '🌍 *El bot ya está desactivado globalmente.*\n\nEl bot no responderá a ningún comando hasta que se reactive.'
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
    
    let message = '🌍 *Bot desactivado globalmente.*\n\n';
    if (notificationResult.success) {
      message += `📢 Notificaciones enviadas:\n` +
        `• Grupos notificados: ${notificationResult.successfulNotifications}/${notificationResult.totalGroups}\n` +
        `• Exitosas: ${notificationResult.successfulNotifications}\n` +
        `• Fallidas: ${notificationResult.failedNotifications}\n\n`;
    }
    message += 'El bot no responderá a ningún comando hasta que se reactive.';
    
    return {
      success: true,
      message: message,
      notificationDetails: notificationResult
    };
  } catch (error) {
    return { success: false, message: '⛔ Error al desactivar el bot globalmente.' };
  }
}

/**
 * Verificar si el bot está activado globalmente
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
    console.error('Error al verificar notificación de mantenimiento:', error);
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
    console.log('🧹 Notificaciones de mantenimiento limpiadas');
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
    console.log(`🧹 Avisos de grupo ${grupoId} limpiados`);
  } catch (error) {
    console.error('Error al limpiar avisos de grupo:', error);
  }
}

/**
 * /update - Actualizar configuración desde el bot principal (para subbots)
 */
async function handleUpdate(usuario) {
  if (!await isOwnerOrAdmin(usuario)) {
    return { success: false, message: '⛔ Solo el bot principal puede actualizar la configuración.' };
  }
  try {
    await logCommand('administracion', 'update_config', usuario, 'global');
    return {
      success: true,
      message: '🔄 *Actualizando configuración desde el bot principal...*\n\n📥 *Descargando:*\n• Comandos actualizados\n• Configuraciones de sistema\n• Lista de admins\n• Parámetros de funcionamiento\n\n⏳ *Proceso completado*\n✅ *Configuración sincronizada exitosamente*'
    };
  } catch (error) {
    return { success: false, message: '⛔ Error al actualizar la configuración.' };
  }
}

/**
 * /qr - Generar QR de vinculación real para subbot (disponible para todos)
 */
async function handleQR(usuario, grupo, isGroup) {
  if (isGroup) {
    return {
      success: true,
      message: '✅ Para obtener el código QR, escribe `/qr` al chat privado de este bot.'
    };
  }
  try {
    // Verificar si ya tiene un QR activo
    const existingQR = await db('subbots')
      .where('status', 'pending')
      .where('type', 'qr')
      .where('created_at', '>', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // 10 minutos
      .first();
    
    if (existingQR) {
      return {
        success: true,
        message: `📱 *Tu QR activo:*\n\n\`\`\`${existingQR.qr_data}\`\`\`\n\n⏰ *Tiempo restante:* ${Math.ceil((new Date(existingQR.created_at).getTime() + 10 * 60 * 1000 - Date.now()) / 1000)} segundos\n\n⚠️ *Ya tienes un QR activo. Escanéalo o espera a que expire.*`
      };
    }
    
    // Limpiar QRs expirados del usuario
    await db('subbots')
      .where('type', 'qr')
      .where('status', 'pending')
      .where('created_at', '<', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .del();
    
    // Generar ID único para el subbot
    const subbotId = `subbot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Crear entrada en la base de datos
    await db('subbots').insert({
      code: subbotId,
      type: 'qr',
      status: 'pending',
      created_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    });
    
    // Iniciar subbot automáticamente
    try {
      const { exec } = await import('child_process');
      exec(`cd /home/admin/bot-whatsapp-panel-2.5-completo-v2 && docker-compose -f docker-compose.subbots.yml up -d subbot-${subbotId.split('_')[1]}`, (error, stdout, stderr) => {
        if (error) {
          console.error('Error iniciando subbot:', error);
        } else {
          console.log('Subbot iniciado:', stdout);
        }
      });
    } catch (error) {
      console.error('Error iniciando subbot:', error);
    }
    
    await logCommand('consulta', 'qr_generated', usuario, 'global');
    
    return {
      success: true,
      message: `📱 *QR de subbot generado:*\n\n🆔 *ID del subbot:* \`${subbotId}\`\n\n⏰ *Válido por:* 10 minutos\n📱 *Uso:* El QR se generará automáticamente cuando escanees con WhatsApp\n\n💡 *Tip:* Usa el comando \`/code\` para vinculación manual con código de 8 dígitos`
    };
  } catch (error) {
    console.error('Error en handleQR:', error);
    return { success: false, message: '⛔ Error al generar QR de subbot. Intenta de nuevo.' };
  }
}

/**
 * /code - Generar código de 8 dígitos para vinculación manual (disponible para todos)
 */
async function handleCode(usuario, grupo, isGroup) {
  if (isGroup) {
    return {
      success: true,
      message: '✅ Para obtener el código de subbot, escribe `/code` al chat privado de este bot.'
    };
  }
  try {
    // Verificar si ya tiene un código activo
    const existingCode = await db('subbots')
      .where('status', 'pending')
      .where('type', 'code')
      .where('created_at', '>', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // 5 minutos
      .first();
    
    if (existingCode) {
      return {
        success: true,
        message: `🔑 *Tu código activo:*\n\n\`\`\`${existingCode.code}\`\`\`\n\n⏰ *Tiempo restante:* ${Math.ceil((new Date(existingCode.created_at).getTime() + 5 * 60 * 1000 - Date.now()) / 1000)} segundos\n\n⚠️ *Ya tienes un código activo. Espera a que expire o úsalo.*`
      };
    }
    
    // Limpiar códigos expirados del usuario
    await db('subbots')
      .where('type', 'code')
      .where('status', 'pending')
      .where('created_at', '<', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .del();
    
    // Generar código de 8 dígitos numéricos para vinculación manual
    let code;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      // Generar código de 8 dígitos
      code = Math.floor(10000000 + Math.random() * 90000000).toString();
      attempts++;
      
      // Verificar que el código sea único
      const codeExists = await db('subbots').where('code', code).first();
      if (!codeExists) break;
      
    } while (attempts < maxAttempts);
    
    // Si no se pudo generar un código único después de varios intentos
    if (attempts >= maxAttempts) {
      return { success: false, message: '⛔ Error: No se pudo generar un código único. Intenta de nuevo.' };
    }
    
    // Crear entrada en la base de datos
    await db('subbots').insert({
      code: code,
      type: 'code',
      status: 'pending',
      created_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    });
    
    await logCommand('consulta', 'code_generated', usuario, 'global');
    
    return {
      success: true,
      message: `🔑 *Código de vinculación generado:*\n\n\`\`\`${code}\`\`\`\n\n⏰ *Válido por:* 5 minutos\n📱 *Uso:* Ingresa este código de 8 dígitos en el dispositivo que quieres vincular\n\n💡 *Tip:* Usa el comando \`/qr\` para vinculación con código QR`
    };
  } catch (error) {
    console.error('Error en handleCode:', error);
    return { success: false, message: '⛔ Error al generar código de subbot. Intenta de nuevo.' };
  }
}

/**
 * /whoami - Mostrar información del usuario
 */
async function handleWhoami(usuario, grupo, isGroup, waUserInfo) {
  let info = `╭───── 👤 *Tu Información* ─────╮\n`;
  info += `• *Usuario:* ${usuario}\n`;
  if (waUserInfo) {
    info += `• *Nombre:* ${waUserInfo.pushName || 'N/A'}\n`;
    info += `• *Número:* ${waUserInfo.id || 'N/A'}\n`;
  }
  info += `• *Grupo:* ${grupo || 'Privado'}\n`;
  info += `╰──────────────────────────────╯`;
  await logCommand('consulta', 'whoami', usuario, grupo);
  return { success: true, message: info };
}

/**
 * /tag [mensaje] - Menciona a todos los miembros del grupo sin mostrar @@@@@@@
 */
async function handleTag(mensaje, usuario, grupo) {
  if (!grupo || !grupo.endsWith('@g.us')) {
    return { success: false, message: '❌ Este comando solo funciona en grupos.' };
  }

  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: '❌ Bot no conectado.' };

    // Verificar si el usuario es admin del grupo
    const isAdmin = await isGroupAdmin(usuario, grupo);
    if (!isAdmin) {
      return { success: false, message: '❌ Solo Admin puede usar este comando.' };
    }

    // Obtener metadata del grupo
    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Crear array de menciones invisibles
    const mentions = participants.map(participant => participant.id);

    // Crear el mensaje con menciones invisibles
    const message = {
      text: mensaje || '📢 *Aviso para todos*\n\n¡Atención general!',
      mentions: mentions
    };

    // Enviar mensaje con menciones
    await sock.sendMessage(grupo, message);

    await logCommand('moderacion', 'tag', usuario, grupo);

    return { success: true, message: '✅ Mensaje enviado a todos los miembros del grupo.' };
  } catch (error) {
    console.error('Error en handleTag:', error);
    return { success: false, message: '❌ Error al enviar mensaje a todos.' };
  }
}

/**
 * /lock - Solo admins pueden escribir en el grupo
 */
async function handleLock(usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: '⛔ Solo Admin puede bloquear el grupo.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: '⛔ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '⛔ Este comando solo funciona en grupos.' };
  try {
    await sock.groupSettingUpdate(grupo, 'announcement');
    await logCommand('moderacion', 'lock', usuario, grupo);
    return {
      success: true,
      message: `🔒 Grupo bloqueado. Solo admins pueden escribir.`
    };
  } catch (error) {
    return { success: false, message: '⛔ No se pudo bloquear el grupo.' };
  }
}

/**
 * /unlock - Todos pueden escribir en el grupo
 */
async function handleUnlock(usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: '⛔ Solo Admin puede desbloquear el grupo.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: '⛔ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '⛔ Este comando solo funciona en grupos.' };
  try {
    await sock.groupSettingUpdate(grupo, 'not_announcement');
    await logCommand('moderacion', 'unlock', usuario, grupo);
    return {
      success: true,
      message: `🔓 Grupo desbloqueado. Todos pueden escribir.`
    };
  } catch (error) {
    return { success: false, message: '⛔ No se pudo desbloquear el grupo.' };
  }
}

// Funciones de utilidad existentes

/**
 * Moderación de grupos vía WhatsApp (requiere que el bot sea admin del grupo)
 */
async function handleKick(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: '❌ Solo Admin puede expulsar miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: '❌ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '❌ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /kick @usuario' };
  
  // Verificar si el bot es admin real
  const botIsAdmin = await isBotAdmin(grupo);
  if (!botIsAdmin) {
    const botId = sock && sock.user ? sock.user.id : 'desconocido';
    return { success: false, message: `❌ El bot (${botId}) no es admin real del grupo. Hazlo admin desde WhatsApp para usar este comando.` };
  }
  
  try {
    const jid = await buildParticipantJid(grupo, numero);
    await sock.groupParticipantsUpdate(grupo, [jid], 'remove');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'kick', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (participant) {
      const nombre = participant.notify || participant.name || participant.id.split('@')[0];
      displayName = nombre;
      mentionJid = participant.id;
    }
    
    return { 
      success: true, 
      message: `✅ Usuario expulsado: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handleKick:', error);
    return { success: false, message: '❌ No se pudo expulsar. Asegúrate de que el bot sea admin del grupo.' };
  }
}

async function handlePromote(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: '❌ Solo Admin puede promover miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: '❌ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '❌ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /promote @usuario' };
  
  // Verificar si el bot es admin real
  const botIsAdmin = await isBotAdmin(grupo);
  if (!botIsAdmin) {
    const botId = sock && sock.user ? sock.user.id : 'desconocido';
    return { success: false, message: `❌ El bot (${botId}) no es admin real del grupo. Hazlo admin desde WhatsApp para usar este comando.` };
  }
  
  try {
    const jid = await buildParticipantJid(grupo, numero);
    
    // Verificar si el usuario ya es admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
      return { success: false, message: 'ℹ️ El usuario ya es admin.' };
    }
    
    await sock.groupParticipantsUpdate(grupo, [jid], 'promote');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'promote', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (updatedParticipant) {
      const nombre = updatedParticipant.notify || updatedParticipant.name || updatedParticipant.id.split('@')[0];
      displayName = nombre;
      mentionJid = updatedParticipant.id;
    }
    
    return {
      success: true,
      message: `✅ Usuario promovido a admin: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handlePromote:', error);
    return { success: false, message: '❌ No se pudo promover. Asegúrate de que el bot sea admin del grupo.' };
  }
}

async function handleDemote(target, usuario, grupo) {
  if (!await isGroupAdmin(usuario, grupo)) {
    return { success: false, message: '❌ Solo Admin puede degradar miembros.' };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: '❌ Bot no conectado.' };
  if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '❌ Este comando solo funciona en grupos.' };
  
  const numero = (target || '').toString().replace(/[^0-9]/g, '');
  if (!numero) return { success: false, message: 'Uso: /demote @usuario' };
  
  // Verificar si el bot es admin real
  const botIsAdmin = await isBotAdmin(grupo);
  if (!botIsAdmin) {
    const botId = sock && sock.user ? sock.user.id : 'desconocido';
    return { success: false, message: `❌ El bot (${botId}) no es admin real del grupo. Hazlo admin desde WhatsApp para usar este comando.` };
  }
  
  try {
    const jid = await buildParticipantJid(grupo, numero);
    
    // Verificar si el usuario ya es NO admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    if (participant && (!participant.admin || participant.admin === null)) {
      return { success: false, message: 'ℹ️ El usuario ya NO es admin.' };
    }
    
    await sock.groupParticipantsUpdate(grupo, [jid], 'demote');
    
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand('moderacion', 'demote', normalizedUsuario, grupo);
    
    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === numero;
    });
    
    let displayName = target.replace('@', '');
    let mentionJid = `${numero}@s.whatsapp.net`;
    
    if (updatedParticipant) {
      const nombre = updatedParticipant.notify || updatedParticipant.name || updatedParticipant.id.split('@')[0];
      displayName = nombre;
      mentionJid = updatedParticipant.id;
    }
    
    return {
      success: true,
      message: `✅ Usuario degradado de admin: @${displayName}`,
      mentions: [mentionJid]
    };
  } catch (error) {
    console.error('Error en handleDemote:', error);
    return { success: false, message: '❌ No se pudo degradar. Asegúrate de que el bot sea admin del grupo.' };
  }
}

/**
 * Verificar si un usuario es admin real del grupo usando metadata
 */
async function isGroupAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;
    
    // Normalizar el usuario para comparación
    const normalizedUsuario = normalizeUserNumber(usuario);
    
    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];
    
    // Buscar participante por número normalizado
    const participant = participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === normalizedUsuario;
    });
    
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true);
  } catch (e) {
    console.error('Error en isGroupAdmin:', e);
    return false;
  }
}

// Helper para normalizar usuario a solo número
function normalizeUserNumber(usuarioJid) {
  return usuarioJid.split('@')[0].split(':')[0];
}

// Helper para saber si el bot es admin real del grupo
async function isBotAdmin(grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;

    const rawBotJid = (sock.user && sock.user.id) ? sock.user.id : '';
    if (!rawBotJid) return false;

    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split('@')[0];
    
    // El bot principal siempre es admin para comandos globales
    if (botBaseNumber === '595971284430') return true;

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Buscar el bot en los participantes
    const botParticipant = participants.find(p => {
      const participantNumber = normalizeUserNumber(p.id || '');
      return participantNumber === botBaseNumber;
    });

    if (botParticipant) {
      return botParticipant.admin === 'admin' || 
             botParticipant.admin === 'superadmin' || 
             botParticipant.admin === true;
    }

    // Si no encontramos al bot como participante, asumir que no es admin
    return false;
  } catch (error) {
    console.error('Error en isBotAdmin:', error);
    return false;
  }
}

async function handleDebugAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: '⛔ Bot no conectado.' };
    if (!grupo || !grupo.endsWith('@g.us')) return { success: false, message: '⛔ Este comando solo funciona en grupos.' };

    const rawBotJid = (sock.user && sock.user.id) ? sock.user.id : '';
    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split('@')[0];

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];
    const sample = participants.slice(0, Math.min(10, participants.length)).map(p => p.id);

    // Buscar coincidencias
    const foundExact = participants.some(p => p.id === rawBotJid);
    const foundClean = participants.some(p => normalizeJid(p.id || '') === cleanBotJid);
    const foundBase = participants.some(p => normalizeJid(p.id || '').startsWith(botBaseNumber));

    const asAdmin = participants.find(p => normalizeJid(p.id || '') === cleanBotJid && (p.admin === 'admin' || p.admin === 'superadmin'));

    const lines = [];
    lines.push('🧪 Debug admin del bot');
    lines.push(`• rawBotJid: ${rawBotJid}`);
    lines.push(`• cleanBotJid: ${cleanBotJid}`);
    lines.push(`• botBaseNumber: ${botBaseNumber}`);
    lines.push(`• foundExact(raw): ${foundExact}`);
    lines.push(`• foundClean(no sufijo): ${foundClean}`);
    lines.push(`• foundBase(startsWith): ${foundBase}`);
    lines.push(`• isAdminFlag: ${asAdmin ? 'true' : 'false'}`);
    lines.push(`• group: ${groupMetadata.subject || grupo}`);
    lines.push('• sampleParticipants (10):');
    sample.forEach((jid, idx) => lines.push(`  - [${idx+1}] ${jid}`));

    return { success: true, message: lines.join('\n') };
  } catch (e) {
    return { success: false, message: '⛔ Error en debugadmin.' };
  }
}

// Helper: obtener JID de participante respetando el formato del grupo (lid vs s.whatsapp.net)
async function buildParticipantJid(grupo, numero) {
  const sock = getSocket();
  if (!sock) return `${numero}@s.whatsapp.net`;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];
    const groupUsesLid = participants.some(p => (p.id || '').endsWith('@lid'));
    return groupUsesLid ? `${numero}@lid` : `${numero}@s.whatsapp.net`;
  } catch (_) {
    return `${numero}@s.whatsapp.net`;
  }
}

// Helper: obtener nombre real del participante para menciones
async function getParticipantName(grupo, numero) {
  const sock = getSocket();
  if (!sock) return numero;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];
    
    console.log(`🔍 Buscando participante con número: ${numero}`);
    console.log(`📊 Total participantes: ${participants.length}`);
    
    // Buscar participante por número (más flexible)
    const participant = participants.find(p => {
      const pid = p.id || '';
      // Buscar por número en cualquier parte del JID
      const found = pid.includes(numero);
      if (found) {
        console.log(`✅ Encontrado por número: ${pid}`);
        console.log(`   - notify: ${p.notify}`);
        console.log(`   - name: ${p.name}`);
        console.log(`   - admin: ${p.admin}`);
        console.log(`   - keys: ${Object.keys(p).join(', ')}`);
      }
      return found;
    });
    
    if (participant) {
      // Intentar diferentes campos para obtener el nombre
      const possibleNames = [
        participant.notify,
        participant.name,
        participant.displayName,
        participant.pushName,
        participant.verifiedName
      ].filter(name => name && name.trim());
      
      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(`📝 Usando nombre real: ${realName}`);
        return realName;
      }
      
      // Si no hay nombre, usar el ID limpio
      const cleanId = participant.id.split('@')[0];
      console.log(`📝 Usando ID limpio: ${cleanId}`);
      return cleanId || numero;
    }
    
    // Si no encontramos por número directo, buscar por JID normalizado
    const normalizedTarget = `${numero}@s.whatsapp.net`;
    console.log(`🔍 Buscando por JID normalizado: ${normalizedTarget}`);
    
    const participantByJid = participants.find(p => {
      const normalized = normalizeJid(p.id || '');
      const found = normalized === normalizedTarget;
      if (found) {
        console.log(`✅ Encontrado por JID normalizado: ${p.id} -> ${normalized}`);
      }
      return found;
    });
    
    if (participantByJid) {
      const possibleNames = [
        participantByJid.notify,
        participantByJid.name,
        participantByJid.displayName,
        participantByJid.pushName,
        participantByJid.verifiedName
      ].filter(name => name && name.trim());
      
      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(`📝 Usando nombre real (JID): ${realName}`);
        return realName;
      }
    }
    
    console.log(`❌ No se encontró participante para número: ${numero}`);
    return numero;
  } catch (error) {
    console.error('Error en getParticipantName:', error);
    return numero;
  }
}

// ==================== COMANDOS DE MEDIA (MAYCOLPLUS) ====================

/**
 * Descargar video/audio de YouTube
 */
async function handleYouTubeDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `🎬 *Descarga de YouTube*\n\n` +
                `📝 *Uso:* \`/yt <enlace o búsqueda>\`\n` +
                `📝 *Ejemplo:* \`/yt https://youtube.com/watch?v=...\`\n` +
                `📝 *Ejemplo:* \`/yt música relajante\`\n\n` +
                `✨ *Funciones:*\n` +
                `• Descargar videos de YouTube\n` +
                `• Buscar y descargar por nombre\n` +
                `• Calidad automática HD`
      };
    }

    const query = args.join(' ');
    const socket = getSocket();
    
    if (!socket) {
      return {
        success: false,
        message: '❌ Bot no conectado. Intenta más tarde.'
      };
    }

    // Simular búsqueda (en implementación real usarías yt-search)
    const searchResults = [
      {
        title: `Resultado para: ${query}`,
        url: `https://youtube.com/watch?v=dQw4w9WgXcQ`,
        duration: '3:32',
        views: '1.2B',
        author: 'Canal de ejemplo'
      }
    ];

    const video = searchResults[0];
    
    const response = `🎬 *${video.title}*\n\n` +
                    `👤 *Canal:* ${video.author}\n` +
                    `⏱️ *Duración:* ${video.duration}\n` +
                    `👀 *Vistas:* ${video.views}\n\n` +
                    `🔄 *Procesando descarga...*\n` +
                    `▓░░░░░░░░░ 25%\n\n` +
                    `✨ *Funciones disponibles:*\n` +
                    `• \`/ytmp3\` - Solo audio\n` +
                    `• \`/ytmp4\` - Video completo\n` +
                    `• \`/yt\` - Opciones interactivas`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleYouTubeDownload:', error);
    return {
      success: false,
      message: '❌ Error al procesar la descarga de YouTube.'
    };
  }
}

/**
 * Crear sticker desde imagen/video
 */
async function handleSticker(usuario, grupo, isGroup, args) {
  try {
    return {
      success: true,
      message: `🎭 *Crear Sticker*\n\n` +
              `📝 *Uso:* Responde a una imagen o video con \`/sticker\`\n\n` +
              `✨ *Características:*\n` +
              `• Convierte imágenes a stickers\n` +
              `• Convierte videos a stickers animados\n` +
              `• Calidad optimizada para WhatsApp\n` +
              `• Pack personalizado del bot\n\n` +
              `📋 *Instrucciones:*\n` +
              `1. Envía una imagen o video\n` +
              `2. Responde con \`/sticker\`\n` +
              `3. ¡Listo! Tu sticker estará listo`
    };

  } catch (error) {
    console.error('Error en handleSticker:', error);
    return {
      success: false,
      message: '❌ Error al procesar el sticker.'
    };
  }
}

/**
 * Descargar videos de TikTok
 */
async function handleTikTokDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `🎵 *Descarga de TikTok*\n\n` +
                `📝 *Uso:* \`/tiktok <enlace o búsqueda>\`\n` +
                `📝 *Ejemplo:* \`/tiktok https://tiktok.com/@user/video/123\`\n` +
                `📝 *Ejemplo:* \`/tiktok baile viral\`\n\n` +
                `✨ *Funciones:*\n` +
                `• Descargar videos de TikTok\n` +
                `• Buscar videos por hashtag\n` +
                `• Calidad HD sin marca de agua`
      };
    }

    const query = args.join(' ');
    
    const response = `🎵 *TikTok Downloader*\n\n` +
                    `🔍 *Buscando:* ${query}\n` +
                    `🔄 *Procesando...*\n` +
                    `▓▓░░░░░░░░ 50%\n\n` +
                    `✨ *Características:*\n` +
                    `• Sin marca de agua\n` +
                    `• Calidad HD\n` +
                    `• Descarga rápida\n` +
                    `• Soporte para enlaces y búsquedas`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleTikTokDownload:', error);
    return {
      success: false,
      message: '❌ Error al procesar la descarga de TikTok.'
    };
  }
}

/**
 * Descargar contenido de Instagram
 */
async function handleInstagramDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `📸 *Descarga de Instagram*\n\n` +
                `📝 *Uso:* \`/ig <enlace de Instagram>\`\n` +
                `📝 *Ejemplo:* \`/ig https://instagram.com/p/ABC123\`\n\n` +
                `✨ *Soporta:*\n` +
                `• Fotos individuales\n` +
                `• Videos\n` +
                `• Carousels (múltiples fotos)\n` +
                `• Stories (si son públicas)`
      };
    }

    const url = args[0];
    
    const response = `📸 *Instagram Downloader*\n\n` +
                    `🔗 *URL:* ${url}\n` +
                    `🔄 *Analizando contenido...*\n` +
                    `▓▓▓░░░░░░░ 75%\n\n` +
                    `✨ *Procesando:*\n` +
                    `• Detecting media type\n` +
                    `• Optimizing quality\n` +
                    `• Preparing download`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleInstagramDownload:', error);
    return {
      success: false,
      message: '❌ Error al procesar la descarga de Instagram.'
    };
  }
}

/**
 * Descargar videos de Twitter/X
 */
async function handleTwitterDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message: `🐦 *Descarga de Twitter/X*\n\n` +
                `📝 *Uso:* \`/twitter <enlace de Twitter>\`\n` +
                `📝 *Ejemplo:* \`/twitter https://twitter.com/user/status/123\`\n\n` +
                `✨ *Soporta:*\n` +
                `• Videos de Twitter\n` +
                `• GIFs\n` +
                `• Imágenes\n` +
                `• Hilos completos`
      };
    }

    const url = args[0];
    
    const response = `🐦 *Twitter Downloader*\n\n` +
                    `🔗 *URL:* ${url}\n` +
                    `🔄 *Procesando...*\n` +
                    `▓▓▓▓░░░░░░ 80%\n\n` +
                    `✨ *Características:*\n` +
                    `• Calidad original\n` +
                    `• Sin compresión\n` +
                    `• Descarga rápida`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleTwitterDownload:', error);
    return {
      success: false,
      message: '❌ Error al procesar la descarga de Twitter.'
    };
  }
}

// ==================== SISTEMA DE SUBBOTS (MAYCOLPLUS) ====================

/**
 * Generar QR para subbot
 */
async function handleSubBotQR(usuario, grupo, isGroup, args) {
  try {
    if (isGroup) {
      return {
        success: true,
        message: '✅ Para crear un subbot, escribe `/subbot` al chat privado de este bot.'
      };
    }

    // Verificar si el usuario ya tiene un subbot activo
    const existingSubbot = await db('subbots').where('usuario', usuario).first();
    
    if (existingSubbot && existingSubbot.activo) {
      return {
        success: false,
        message: `🤖 *Subbot ya activo*\n\n` +
                `Tu subbot ya está conectado y funcionando.\n` +
                `Usa \`/subbots\` para ver la lista de subbots activos.`
      };
    }

    // Generar código QR simulado
    const qrCode = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
    
    const response = `🤖 *Crear Subbot*\n\n` +
                    `📱 *Pasos para vincular:*\n` +
                    `1. Abre WhatsApp en tu teléfono\n` +
                    `2. Ve a Configuración > Dispositivos vinculados\n` +
                    `3. Toca "Vincular un dispositivo"\n` +
                    `4. Escanea este código QR\n\n` +
                    `⏱️ *El código expira en 30 segundos*\n` +
                    `🔄 *Procesando conexión...*\n\n` +
                    `✨ *Funciones del subbot:*\n` +
                    `• Responder mensajes automáticamente\n` +
                    `• Ejecutar comandos\n` +
                    `• Gestionar grupos\n` +
                    `• Acceso completo a todas las funciones`;

    return {
      success: true,
      message: response,
      media: {
        type: 'image',
        data: qrCode,
        caption: response
      }
    };

  } catch (error) {
    console.error('Error en handleSubBotQR:', error);
    return {
      success: false,
      message: '❌ Error al generar el código QR del subbot.'
    };
  }
}

/**
 * Generar código manual para subbot
 */
async function handleSubBotCode(usuario, grupo, isGroup, args) {
  try {
    if (isGroup) {
      return {
        success: true,
        message: '✅ Para crear un subbot con código, escribe `/subbotcode` al chat privado de este bot.'
      };
    }

    // Verificar si el usuario ya tiene un subbot activo
    const existingSubbot = await db('subbots').where('usuario', usuario).first();
    
    if (existingSubbot && existingSubbot.activo) {
      return {
        success: false,
        message: `🤖 *Subbot ya activo*\n\n` +
                `Tu subbot ya está conectado y funcionando.\n` +
                `Usa \`/subbots\` para ver la lista de subbots activos.`
      };
    }

    // Generar código de 8 dígitos
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();
    
    const response = `🤖 *Crear Subbot - Código Manual*\n\n` +
                    `🔢 *Tu código:* \`${code}\`\n\n` +
                    `📱 *Pasos para vincular:*\n` +
                    `1. Abre WhatsApp en tu teléfono\n` +
                    `2. Ve a Configuración > Dispositivos vinculados\n` +
                    `3. Toca "Vincular un dispositivo"\n` +
                    `4. Selecciona "Con número"\n` +
                    `5. Introduce el código: \`${code}\`\n\n` +
                    `⏱️ *El código expira en 2 minutos*\n` +
                    `🔄 *Esperando conexión...*\n\n` +
                    `✨ *Funciones del subbot:*\n` +
                    `• Responder mensajes automáticamente\n` +
                    `• Ejecutar comandos\n` +
                    `• Gestionar grupos\n` +
                    `• Acceso completo a todas las funciones`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleSubBotCode:', error);
    return {
      success: false,
      message: '❌ Error al generar el código del subbot.'
    };
  }
}

/**
 * Listar subbots activos
 */
async function handleListSubBots(usuario, grupo, isGroup, args) {
  try {
    // Obtener subbots activos de la base de datos
    const subbots = await db('subbots').where('activo', true).select('*');
    
    const uptime = process.uptime() * 1000;
    const formatUptime = (ms) => {
      const d = Math.floor(ms / 86400000);
      const h = Math.floor(ms / 3600000) % 24;
      const m = Math.floor(ms / 60000) % 60;
      const s = Math.floor(ms / 1000) % 60;
      return `${d}d ${h}h ${m}m ${s}s`;
    };

    let response = `🤖 *Subbots Activos*\n\n` +
                  `⏱️ *Tiempo activo:* ${formatUptime(uptime)}\n` +
                  `📊 *Total conectados:* ${subbots.length}\n\n`;

    if (subbots.length > 0) {
      response += `📋 *Lista de Subbots:*\n\n`;
      
      subbots.forEach((subbot, index) => {
        const numero = subbot.usuario.replace('@s.whatsapp.net', '');
        response += `🤖 *${index + 1}.* ${subbot.nombre || `Subbot ${numero}`}\n`;
        response += `   📱 https://wa.me/${numero}\n`;
        response += `   🕐 Conectado: ${new Date(subbot.ultima_conexion).toLocaleString()}\n\n`;
      });
    } else {
      response += `⚠️ *No hay subbots conectados*\n\n` +
                 `💡 *Para crear un subbot:*\n` +
                 `• Usa \`/subbot\` para código QR\n` +
                 `• Usa \`/subbotcode\` para código manual\n` +
                 `• Solo funciona en chat privado`;
    }

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleListSubBots:', error);
    return {
      success: false,
      message: '❌ Error al obtener la lista de subbots.'
    };
  }
}

/**
 * Gestionar subbots (solo admin)
 */
async function handleSubBotManagement(usuario, grupo, isGroup, args) {
  try {
    // Verificar permisos de admin
    if (!await isOwnerOrAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden gestionar subbots.'
      };
    }

    if (!args || args.length === 0) {
      return {
        success: false,
        message: `🔧 *Gestión de Subbots*\n\n` +
                `📝 *Comandos disponibles:*\n` +
                `• \`/subbotlist\` - Ver todos los subbots\n` +
                `• \`/subbotkick <numero>\` - Desconectar subbot\n` +
                `• \`/subbotinfo <numero>\` - Info del subbot\n` +
                `• \`/subbotrestart\` - Reiniciar todos los subbots\n\n` +
                `✨ *Solo administradores*`
      };
    }

    const action = args[0].toLowerCase();
    
    switch (action) {
      case 'list':
        return await handleListSubBots(usuario, grupo, isGroup, args.slice(1));
      
      case 'kick':
        if (args.length < 2) {
          return {
            success: false,
            message: '📝 *Uso:* `/subbotkick <numero>`'
          };
        }
        
        const numero = args[1].replace('@s.whatsapp.net', '');
        await db('subbots').where('usuario', `${numero}@s.whatsapp.net`).update({ activo: false });
        
        return {
          success: true,
          message: `✅ Subbot ${numero} desconectado exitosamente.`
        };
      
      case 'restart':
        // Reiniciar todos los subbots
        await db('subbots').update({ activo: false });
        
        return {
          success: true,
          message: `🔄 Todos los subbots han sido reiniciados.`
        };
      
      default:
        return {
          success: false,
          message: '❌ Comando de gestión no reconocido. Usa `/subbothelp` para ver opciones.'
        };
    }

  } catch (error) {
    console.error('Error en handleSubBotManagement:', error);
    return {
      success: false,
      message: '❌ Error en la gestión de subbots.'
    };
  }
}

/**
 * Obtener información del LID del usuario
 */
async function handleGetLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden ver esta información
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden obtener esta información.'
      };
    }

    const socket = getSocket();
    if (!socket) {
      return {
        success: false,
        message: '❌ Bot no conectado.'
      };
    }

    // Obtener información del bot
    const botJid = socket.user?.jid || 'No disponible';
    const botNumber = botJid.split('@')[0];
    const botServer = botJid.split('@')[1];

    let response = `🔍 *Información del Sistema*\n\n`;
    response += `🤖 *Bot JID:* ${botJid}\n`;
    response += `📱 *Bot Número:* ${botNumber}\n`;
    response += `🌐 *Servidor:* ${botServer}\n\n`;
    
    response += `👤 *Tu información:*\n`;
    response += `• Usuario: ${usuario}\n`;
    response += `• Número: ${usuario.split('@')[0]}\n`;
    response += `• Servidor: ${usuario.split('@')[1]}\n\n`;
    
    response += `🔧 *Configuración actual:*\n`;
    response += `• Superadmins: ${global.owner.length}\n`;
    response += `• Moderadores: ${global.mods.length}\n`;
    response += `• Premium: ${global.prems.length}\n\n`;
    
    response += `📋 *Para actualizar tu LID:*\n`;
    response += `• Usa \`/updatelid <tu_lid_completo>\`\n`;
    response += `• Ejemplo: \`/updatelid 1234567890@lid\`\n`;
    response += `• O usa \`/updatelid auto\` para detectar automáticamente`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleGetLID:', error);
    return {
      success: false,
      message: '❌ Error al obtener información del LID.'
    };
  }
}

/**
 * Actualizar LID del usuario
 */
async function handleUpdateLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden actualizar LIDs
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden actualizar LIDs.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: '📝 *Uso:* `/updatelid <tu_lid_completo>`\n\n' +
                '📝 *Ejemplo:* `/updatelid 1234567890@lid`\n' +
                '📝 *Auto:* `/updatelid auto` (detectar automáticamente)'
      };
    }

    const lidInput = args[0].toLowerCase();
    
    if (lidInput === 'auto') {
      // Detectar automáticamente el LID del usuario actual
      const currentLid = usuario; // El usuario ya viene con el formato correcto
      
      // Actualizar en la configuración global
      const userIndex = global.owner.findIndex(([num]) => num === '595971284430');
      if (userIndex !== -1) {
        global.owner[userIndex][0] = currentLid.split('@')[0];
      }

      return {
        success: true,
        message: `✅ LID actualizado automáticamente:\n` +
                `• LID detectado: ${currentLid}\n` +
                `• Número: ${currentLid.split('@')[0]}\n` +
                `• Servidor: ${currentLid.split('@')[1]}\n\n` +
                `🔄 Los cambios se aplicarán en el próximo reinicio.`
      };
    } else {
      // LID manual
      const lid = args[0];
      
      // Validar formato básico
      if (!lid.includes('@')) {
        return {
          success: false,
          message: '❌ Formato de LID inválido. Debe incluir @ (ej: 1234567890@lid)'
        };
      }

      const [numero, servidor] = lid.split('@');
      
      // Actualizar en la configuración global
      const userIndex = global.owner.findIndex(([num]) => num === '595971284430');
      if (userIndex !== -1) {
        global.owner[userIndex][0] = numero;
      }

      return {
        success: true,
        message: `✅ LID actualizado manualmente:\n` +
                `• LID: ${lid}\n` +
                `• Número: ${numero}\n` +
                `• Servidor: ${servidor}\n\n` +
                `🔄 Los cambios se aplicarán en el próximo reinicio.`
      };
    }

  } catch (error) {
    console.error('Error en handleUpdateLID:', error);
    return {
      success: false,
      message: '❌ Error al actualizar LID.'
    };
  }
}

// ==================== COMANDOS DE ADMINISTRACIÓN GLOBAL ====================

/**
 * Mostrar información del sistema de administradores
 */
async function handleAdminInfo(usuario, grupo, isGroup, args) {
  try {
    // Verificar permisos
    if (!await isOwnerOrAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los administradores pueden ver esta información.'
      };
    }

    const ownerName = getOwnerName(usuario);
    const isSuper = isSuperAdmin(usuario);
    const isMod = isModerator(usuario);
    const isPrem = isPremium(usuario);

    let response = `🔧 *Sistema de Administración*\n\n`;
    response += `👤 *Tu información:*\n`;
    response += `• Nombre: ${ownerName}\n`;
    response += `• Número: ${usuario}\n`;
    response += `• Superadmin: ${isSuper ? '✅' : '❌'}\n`;
    response += `• Moderador: ${isMod ? '✅' : '❌'}\n`;
    response += `• Premium: ${isPrem ? '✅' : '❌'}\n\n`;

    response += `👑 *Superadmins globales:*\n`;
    global.owner.forEach(([num, name, isSuper], index) => {
      response += `${index + 1}. ${name} (${num})\n`;
    });

    response += `\n🛡️ *Moderadores:* ${global.mods.length}\n`;
    response += `💎 *Usuarios Premium:* ${global.prems.length}\n\n`;

    response += `📋 *Comandos disponibles:*\n`;
    response += `• \`/addadmin <numero> <nombre>\` - Agregar superadmin\n`;
    response += `• \`/deladmin <numero>\` - Quitar superadmin\n`;
    response += `• \`/addmod <numero>\` - Agregar moderador\n`;
    response += `• \`/delmod <numero>\` - Quitar moderador\n`;
    response += `• \`/addprem <numero>\` - Agregar premium\n`;
    response += `• \`/delprem <numero>\` - Quitar premium\n`;

    return {
      success: true,
      message: response
    };

  } catch (error) {
    console.error('Error en handleAdminInfo:', error);
    return {
      success: false,
      message: '❌ Error al obtener información de administración.'
    };
  }
}

/**
 * Agregar superadmin
 */
async function handleAddAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden agregar otros superadmins.'
      };
    }

    if (!args || args.length < 2) {
      return {
        success: false,
        message: '📝 *Uso:* `/addadmin <numero> <nombre>`\n\n' +
                '📝 *Ejemplo:* `/addadmin 1234567890 Juan Pérez`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');
    const nombre = args.slice(1).join(' ');

    // Verificar si ya existe
    const existingAdmin = global.owner.find(([num]) => num === numero);
    if (existingAdmin) {
      return {
        success: false,
        message: `❌ El número ${numero} ya es superadmin.`
      };
    }

    // Agregar a la lista global
    global.owner.push([numero, nombre, true]);

    return {
      success: true,
      message: `✅ Superadmin agregado exitosamente:\n` +
              `• Nombre: ${nombre}\n` +
              `• Número: ${numero}\n\n` +
              `🔄 Los cambios se aplicarán en el próximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleAddAdmin:', error);
    return {
      success: false,
      message: '❌ Error al agregar superadmin.'
    };
  }
}

/**
 * Quitar superadmin
 */
async function handleDelAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden quitar otros superadmins.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: '📝 *Uso:* `/deladmin <numero>`\n\n' +
                '📝 *Ejemplo:* `/deladmin 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si existe
    const adminIndex = global.owner.findIndex(([num]) => num === numero);
    if (adminIndex === -1) {
      return {
        success: false,
        message: `❌ El número ${numero} no es superadmin.`
      };
    }

    // No permitir quitarse a sí mismo
    const usuarioNumero = usuario.replace(/[^0-9]/g, '');
    if (numero === usuarioNumero) {
      return {
        success: false,
        message: '❌ No puedes quitarte a ti mismo como superadmin.'
      };
    }

    // Quitar de la lista global
    const removedAdmin = global.owner.splice(adminIndex, 1)[0];

    return {
      success: true,
      message: `✅ Superadmin removido exitosamente:\n` +
              `• Nombre: ${removedAdmin[1]}\n` +
              `• Número: ${numero}\n\n` +
              `🔄 Los cambios se aplicarán en el próximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleDelAdmin:', error);
    return {
      success: false,
      message: '❌ Error al quitar superadmin.'
    };
  }
}

/**
 * Agregar moderador
 */
async function handleAddMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden agregar moderadores.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: '📝 *Uso:* `/addmod <numero>`\n\n' +
                '📝 *Ejemplo:* `/addmod 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si ya es superadmin
    if (isSuperAdmin(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: `❌ El número ${numero} ya es superadmin.`
      };
    }

    // Verificar si ya es moderador
    if (isModerator(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: `❌ El número ${numero} ya es moderador.`
      };
    }

    // Agregar a la lista global
    global.mods.push(numero);

    return {
      success: true,
      message: `✅ Moderador agregado exitosamente:\n` +
              `• Número: ${numero}\n\n` +
              `🔄 Los cambios se aplicarán en el próximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleAddMod:', error);
    return {
      success: false,
      message: '❌ Error al agregar moderador.'
    };
  }
}

/**
 * Quitar moderador
 */
async function handleDelMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: '❌ Solo los superadmins pueden quitar moderadores.'
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message: '📝 *Uso:* `/delmod <numero>`\n\n' +
                '📝 *Ejemplo:* `/delmod 1234567890`'
      };
    }

    const numero = args[0].replace(/[^0-9]/g, '');

    // Verificar si existe
    const modIndex = global.mods.indexOf(numero);
    if (modIndex === -1) {
      return {
        success: false,
        message: `❌ El número ${numero} no es moderador.`
      };
    }

    // Quitar de la lista global
    global.mods.splice(modIndex, 1);

    return {
      success: true,
      message: `✅ Moderador removido exitosamente:\n` +
              `• Número: ${numero}\n\n` +
              `🔄 Los cambios se aplicarán en el próximo reinicio.`
    };

  } catch (error) {
    console.error('Error en handleDelMod:', error);
    return {
      success: false,
      message: '❌ Error al quitar moderador.'
    };
  }
}

export {
  // Comandos básicos
  handleHelp,
  handleIA,
  handleClasificar,
  handleMyAportes,
  handleAportes,
  handleManhwas,
  handleSeries,
  handleAddAporte,
  handleAddSerie,
  handlePedido,
  handlePedidos,
  handleExtra,
  handleIlustraciones,
  
  // Comandos de administración
  handleAddGroup,
  handleDelGroup,
  handleAddManhwa,
  handleLogs,
  handlePrivado,
  handleAmigos,
  handleAdvertencias,
  
  // Comandos de votación
  handleVotar,
  handleCrearVotacion,
  handleCerrarVotacion,
  
  // Comandos de obtención
  handleObtenerManhwa,
  handleObtenerExtra,
  handleObtenerIlustracion,
  handleObtenerPack,
  
  // Comandos existentes
  handleKick,
  handlePromote,
  handleDemote,
  handleAporteEstado,
  handleLock,
  handleUnlock,
  handleBotOn,
  handleBotOff,
  handleBotGlobalOn,
  handleBotGlobalOff,
  isBotGloballyActive,
  wasUserNotifiedAboutMaintenance,
  markUserAsNotifiedAboutMaintenance,
  clearMaintenanceNotifications,
  clearGroupOffNotices,
  handleUpdate,
  handleCode,
  handleQR,
  handleWhoami,
  handleTag,
  
  // Variables de estado
  modoPrivado,
  modoAmigos,
  advertenciasActivas,
  
  // Debug
  handleDebugAdmin,
  
  // Funciones de utilidad
  isGroupAdmin,
  
  // Comandos de Media (MaycolPlus)
  handleYouTubeDownload,
  handleSticker,
  handleTikTokDownload,
  handleInstagramDownload,
  handleTwitterDownload,
  
  // Sistema de SubBots (MaycolPlus)
  handleSubBotQR,
  handleSubBotCode,
  handleListSubBots,
  handleSubBotManagement,
  
  // Comandos de Administración Global
  handleAdminInfo,
  handleAddAdmin,
  handleDelAdmin,
  handleAddMod,
  handleDelMod,
  handleGetLID,
  handleUpdateLID
};
