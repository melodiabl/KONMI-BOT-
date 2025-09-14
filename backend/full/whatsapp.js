import * as baileys from '@whiskeysockets/baileys';
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import db from './db-connection.js';
import { 
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
  handleAddGroup,
  handleDelGroup,
  handleAddManhwa,
  handleLogs,
  handlePrivado,
  handleAmigos,
  handleAdvertencias,
  handleVotar,
  handleCrearVotacion,
  handleCerrarVotacion,
  handleObtenerManhwa,
  handleObtenerExtra,
  handleObtenerIlustracion,
  handleObtenerPack,
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
  handleUpdate,
  handleCode,
  handleWhoami,
  handleTag,
  handleDebugAdmin
} from './commands-complete.js';

import {
  handleAI as handleGeminiAI,
  handleListClasificados,
  logControlAction,
  logConfigurationChange,
  handleLogs as handleLogsCommand,
  handleConfig,
  handleRegistrarUsuario,
  handleResetPassword,
  handleMiInfo,
  handleCleanSession
} from './commands.js';

import {
  handleSerbot,
  handleBots,
  handleDelSubbot,
  handleQR
} from './commands-subbot.js';

import {
  handleMusic,
  handleMeme,
  handleWallpaper,
  handleJoke
} from './commands-media.js';

import {
  handleAI,
  handleImage,
  handleTranslate
} from './commands-ai.js';

import {
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope
} from './commands-entertainment.js';

import {
  handlelogs,
  handleStats,
  handleExport
} from './commands-logs.js';

import {
  handleHelp
} from './commands-help.js';

import {
  handleStatus,
  handlePing
} from './commands-status.js';

import {
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo
} from './download-commands.js';

import {
  processProviderMessage
} from './auto-provider-handler.js';

// nose xd

let sock;
let qrCode = null;
let qrCodeImage = null;
let connectionStatus = 'disconnected';
let lastConnection = null;
let connectionStartTime = null;
let lastActivity = Date.now();
let connectionAttempts = 0;
let maxConnectionAttempts = 10;
let healthCheckInterval = null;

// Protección contra spam - evitar respuestas múltiples
const processedMessages = new Set();
const SPAM_PROTECTION_TIME = 5000; // 5 segundos

// Lista de números admin (se actualiza automáticamente)
let adminNumbers = new Set();

// Helper para normalizar usuario a solo número
function normalizeUserNumber(usuarioJid) {
  return usuarioJid.split('@')[0].split(':')[0];
}

// Verificar estado global del bot desde la base de datos
async function isBotGloballyActiveFromDB() {
  try {
    const globalState = await db('bot_global_state').select('is_on').first();
    return globalState ? globalState.is_on : true; // Por defecto activo si no hay registro
  } catch (error) {
    console.error('Error verificando estado global del bot:', error);
    return true; // Por defecto activo en caso de error
  }
}

// Aviso global: verificar si usuario ya fue notificado
async function wasUserNotifiedGlobalOff(usuarioJid) {
  const userNumber = normalizeUserNumber(usuarioJid);
  try {
    const row = await db('avisos_global_off').where({ usuario_jid: userNumber }).first();
    return !!row;
  } catch (e) { return false; }
}
// Aviso global: marcar usuario como notificado
async function markUserNotifiedGlobalOff(usuarioJid) {
  const userNumber = normalizeUserNumber(usuarioJid);
  try {
    await db('avisos_global_off').insert({ usuario_jid: userNumber }).onConflict('usuario_jid').ignore();
  } catch (e) {}
}
// Aviso global: limpiar todos los avisos
async function clearGlobalOffNotices() {
  try { await db('avisos_global_off').del(); } catch (e) {}
}

// Aviso grupo: verificar si usuario ya fue notificado
async function wasUserNotifiedGroupOff(grupoId, usuarioJid) {
  const userNumber = normalizeUserNumber(usuarioJid);
  try {
    const row = await db('avisos_grupo_off').where({ grupo_jid: grupoId, usuario_jid: userNumber }).first();
    return !!row;
  } catch (e) { return false; }
}
// Aviso grupo: marcar usuario como notificado
async function markUserNotifiedGroupOff(grupoId, usuarioJid) {
  const userNumber = normalizeUserNumber(usuarioJid);
  try {
    await db('avisos_grupo_off').insert({ grupo_jid: grupoId, usuario_jid: userNumber }).onConflict(['grupo_jid','usuario_jid']).ignore();
  } catch (e) {}
}
// Aviso grupo: limpiar avisos de un grupo
async function clearGroupOffNotices(grupoId) {
  try { await db('avisos_grupo_off').where({ grupo_jid: grupoId }).del(); } catch (e) {}
}

// Función para configurar el bot como admin
async function setupBotAsAdmin(botNumber) {
  try {
    adminNumbers.add(botNumber);
    console.log(`👑 Número ${botNumber} configurado como admin automáticamente`);
    
    // También actualizar la lista en commands-complete.js
    await updateAdminList();
  } catch (error) {
    console.error('Error al configurar bot como admin:', error);
  }
}

// Función para actualizar la lista de admins
async function updateAdminList() {
  try {
    // Importar dinámicamente para actualizar la lista
    const { updateAdminNumbers } = await import('./commands-complete.js');
    if (updateAdminNumbers) {
      updateAdminNumbers(Array.from(adminNumbers));
    }
  } catch (error) {
    console.error('Error al actualizar lista de admins:', error);
  }
}

// Función para detectar admins de grupos
async function detectGroupAdmins(groupJid) {
  try {
    if (!sock || connectionStatus !== 'connected') {
      return [];
    }
    
    const groupInfo = await sock.groupMetadata(groupJid);
    const admins = [];
    
    if (groupInfo.participants) {
      for (const participant of groupInfo.participants) {
        if (participant.admin === 'admin' || participant.admin === 'superadmin') {
          const adminNumber = participant.id.split('@')[0];
          admins.push(adminNumber);
          adminNumbers.add(adminNumber);
        }
      }
    }
    
    console.log(`👥 Admins detectados en grupo ${groupJid}: ${admins.join(', ')}`);
    return admins;
  } catch (error) {
    console.error('Error al detectar admins del grupo:', error);
    return [];
  }
}

// Registrar logs en la base de datos
async function logCommand(tipo, comando, usuario, grupo) {
  try {
    const fecha = new Date().toISOString();
    await db('logs').insert({
      tipo,
      comando,
      usuario,
      grupo,
      fecha
    });
  } catch (error) {
    console.error('Error al registrar log:', error);
  }
}


// Verificar si un grupo está desactivado
async function isGroupDeactivated(grupoId) {
  try {
    const grupo = await db('grupos_desactivados').where('jid', grupoId).first();
    return !!grupo;
  } catch (error) {
    console.error('Error al verificar grupo desactivado:', error);
    return false;
  }
}

// Manejar mensajes entrantes
async function handleMessage(message) {
  if (!message.message || !message.key.remoteJid) return;

  const messageText = message.message.conversation ||
    message.message.extendedTextMessage?.text || '';

  if (!messageText.startsWith('/') && !messageText.startsWith('!') && !messageText.startsWith('.')) return;

  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const sender = message.key.participant || remoteJid;
  const usuario = sender.split('@')[0];
  const grupo = isGroup ? remoteJid : null;

  // Detectar admins del grupo si es un grupo
  if (isGroup) {
    await detectGroupAdmins(remoteJid);
  }

  // Normalizar prefijos: !, ., / son válidos (antes del split)
  let normalizedText = messageText.trim();
  if (normalizedText.startsWith('!') || normalizedText.startsWith('.')) {
    normalizedText = '/' + normalizedText.substring(1);
  }
  const parts = normalizedText.split(' ');
  let command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // 1. Prioridad: estado global
  const isOwner = normalizeUserNumber(usuario) === '595971284430';
  if (!await isBotGloballyActiveFromDB()) {
    if (command === '/bot' && args[0] === 'global' && (args[1] === 'on' || args[1] === 'off') && isOwner) {
      // Permitir comando global
      if (args[1] === 'on') await clearGlobalOffNotices();
    } else {
      // Aviso global solo una vez por usuario
      if (!(await wasUserNotifiedGlobalOff(usuario))) {
        await sock.sendMessage(remoteJid, {
          text: '🔧 *Bot desactivado globalmente*\n\nEl bot ha sido desactivado desde el panel de administración. Solo el dueño puede reactivarlo usando `/bot global on` o desde el panel.'
        });
        await markUserNotifiedGlobalOff(usuario);
      }
      return;
    }
  }

  // 2. Estado por grupo (solo si no está globalmente apagado)
  if (isGroup && await isGroupDeactivated(remoteJid)) {
    // Solo permitir comandos de activación para admins reales del grupo
    if (command === '/bot' && args[0] === 'on') {
      const isAdmin = await import('./commands-complete.js').then(m => m.isGroupAdmin(usuario, remoteJid));
      if (isAdmin) {
        // Permitir reactivar el bot y limpiar avisos de grupo
        await clearGroupOffNotices(remoteJid);
      } else {
        // Avisar solo una vez por usuario
        if (!(await wasUserNotifiedGroupOff(remoteJid, usuario))) {
          await sock.sendMessage(remoteJid, {
            text: '🤖 *Bot desactivado en este grupo*\n\nSolo un admin puede reactivarlo usando `/bot on`.'
          });
          await markUserNotifiedGroupOff(remoteJid, usuario);
        }
        return;
      }
    } else {
      // Avisar solo una vez por usuario
      if (!(await wasUserNotifiedGroupOff(remoteJid, usuario))) {
        await sock.sendMessage(remoteJid, {
          text: '🤖 *Bot desactivado en este grupo*\n\nSolo un admin puede reactivarlo usando `/bot on`.'
        });
        await markUserNotifiedGroupOff(remoteJid, usuario);
      }
      return;
    }
  }

  // Comandos solo para grupo
  const groupOnlyCommands = ['/bot', '/kick', '/promote', '/demote', '/lock', '/unlock', '/tag'];
  if (!isGroup && groupOnlyCommands.some(cmd => command.startsWith(cmd))) {
    await sock.sendMessage(remoteJid, { text: '⛔ Este comando solo funciona en grupos.' });
    return;
  }

  console.log(`📨 Comando recibido: ${command} de ${usuario} en ${isGroup ? grupo : 'privado'}`);
  console.log(`📝 Texto completo: "${messageText}"`);
  console.log(`🆔 Message ID: ${message.key.id}`);

  let result;
  const fecha = new Date().toISOString();

  switch (command) {
    // Comandos básicos - múltiples variantes para help/menu
    case '/help':
    case '/ayuda':
    case '/menu':
    case '!help':
    case '!menu':
      result = await handleHelp(usuario, grupo, isGroup);
      break;

    case '/ia':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /ia <pregunta>' });
        return;
      }
      result = await handleIA(args.join(' '), usuario, grupo);
      break;

    case '/myaportes':
      result = await handleMyAportes(usuario, grupo);
      break;

    case '/aportes':
      result = await handleAportes(usuario, grupo, isGroup);
      break;

    case '/manhwas':
      result = await handleManhwas(usuario, grupo);
      break;

    case '/series':
      result = await handleSeries(usuario, grupo);
      break;

    case '/addserie':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /addserie <título|género|estado|descripción>' });
        return;
      }
      result = await handleAddSerie(args.join(' '), usuario, grupo, fecha);
      break;

    case '/addaporte':
      if (args.length < 2) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /addaporte <tipo> <contenido>' });
        return;
      }
      const tipo = args[0];
      const contenido = args.slice(1).join(' ');
      result = await handleAddAporte(contenido, tipo, usuario, grupo, fecha);
      break;

    case '/pedido':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /pedido <contenido que buscas>' });
        return;
      }
      result = await handlePedido(args.join(' '), usuario, grupo, fecha);
      break;

    case '/pedidos':
      result = await handlePedidos(usuario, grupo);
      break;

    case '/extra':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /extra <nombre>' });
        return;
      }
      result = await handleExtra(args.join(' '), usuario, grupo, fecha);
      break;

    case '/ilustraciones':
      result = await handleIlustraciones(usuario, grupo);
      break;

    // Comandos de administración
    case '/bot':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /bot on | /bot off | /bot global on | /bot global off' });
        return;
      }
      if (args[0] === 'global') {
        // Solo el número principal puede controlar el bot globalmente
        const isOwner = normalizeUserNumber(usuario) === '595971284430';
        if (!isOwner) {
          await sock.sendMessage(remoteJid, { text: '⛔ Solo el bot principal puede controlar el bot globalmente.' });
          return;
        }
        if (args.length < 2) {
          await sock.sendMessage(remoteJid, { text: 'Uso: /bot global on | /bot global off' });
          return;
        }
        if (args[1] === 'on') {
          result = await handleBotGlobalOn(usuario);
        } else if (args[1] === 'off') {
          result = await handleBotGlobalOff(usuario);
        } else {
          await sock.sendMessage(remoteJid, { text: 'Uso: /bot global on | /bot global off' });
          return;
        }
      } else {
        // Comandos de grupo (solo en grupos y solo admins reales)
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '⛔ Los comandos /bot on/off solo funcionan en grupos.' });
          return;
        }
        const isAdmin = await import('./commands-complete.js').then(m => m.isGroupAdmin(usuario, remoteJid));
        if (!isAdmin) {
          await sock.sendMessage(remoteJid, { text: '⛔ Solo Admin puede activar o desactivar el bot en este grupo.' });
          return;
        }
        if (args[0] === 'on') {
          result = await handleBotOn(remoteJid, usuario);
        } else if (args[0] === 'off') {
          result = await handleBotOff(remoteJid, usuario);
        } else {
          await sock.sendMessage(remoteJid, { text: 'Uso: /bot on | /bot off | /bot global on | /bot global off' });
          return;
        }
      }
      break;

    case '/update':
      result = await handleUpdate(usuario);
      break;

    case '/code':
      result = await handleCode(usuario);
      break;

    case '/qr':
      result = await handleQR(usuario);
      break;

    case '/whoami':
      result = await handleWhoami(usuario, grupo, isGroup);
      break;

    case '/tag':
      result = await handleTag(args.join(' '), usuario, grupo);
      break;

    case '/debugadmin':
      result = await handleDebugAdmin(usuario, grupo);
      break;

    case '/addmanhwa':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /addmanhwa <título|autor|género|estado|descripción|url|proveedor>' });
        return;
      }
      result = await handleAddManhwa(args.join(' '), usuario, grupo);
      break;

    case '/logs':
      result = await handleLogs(usuario, grupo);
      break;

    case '/privado':
      result = await handlePrivado(usuario, grupo);
      break;

    case '/amigos':
      result = await handleAmigos(usuario, grupo);
      break;

    case '/advertencias':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /advertencias <on|off>' });
        return;
      }
      result = await handleAdvertencias(args[0], usuario, grupo);
      break;

    // Comandos de votación
    case '/votar':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /votar <opción>' });
        return;
      }
      result = await handleVotar(args.join(' '), usuario, grupo);
      break;

    case '/crearvotacion':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /crearvotacion <pregunta | opción1 | opción2 | ...>' });
        return;
      }
      result = await handleCrearVotacion(args.join(' '), usuario, grupo);
      break;

    case '/cerrarvotacion':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /cerrarvotacion <ID>' });
        return;
      }
      result = await handleCerrarVotacion(args[0], usuario, grupo);
      break;

    // Comandos de obtención desde grupos proveedor
    case '/obtenermanhwa':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /obtenermanhwa <nombre>' });
        return;
      }
      result = await handleObtenerManhwa(args.join(' '), usuario, grupo);
      break;

    case '/obtenerextra':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /obtenerextra <nombre>' });
        return;
      }
      result = await handleObtenerExtra(args.join(' '), usuario, grupo);
      break;

    case '/obtenerilustracion':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /obtenerilustracion <nombre>' });
        return;
      }
      result = await handleObtenerIlustracion(args.join(' '), usuario, grupo);
      break;

    case '/obtenerpack':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /obtenerpack <nombre>' });
        return;
      }
      result = await handleObtenerPack(args.join(' '), usuario, grupo);
      break;

    // Estado aportes
    case '/aporteestado':
      if (args.length < 2) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /aporteestado <id> <pendiente|en_revision|completado>' });
        return;
      }
      result = await handleAporteEstado(Number(args[0]), args[1], usuario, grupo);
      break;

    case '/revision':
      if (args.length < 1) { await sock.sendMessage(remoteJid, { text: 'Uso: /revision <id>' }); return; }
      result = await handleAporteEstado(Number(args[0]), 'en_revision', usuario, grupo);
      break;
    case '/completado':
      if (args.length < 1) { await sock.sendMessage(remoteJid, { text: 'Uso: /completado <id>' }); return; }
      result = await handleAporteEstado(Number(args[0]), 'completado', usuario, grupo);
      break;
    case '/pendiente':
      if (args.length < 1) { await sock.sendMessage(remoteJid, { text: 'Uso: /pendiente <id>' }); return; }
      result = await handleAporteEstado(Number(args[0]), 'pendiente', usuario, grupo);
      break;

    // Comandos de moderación

    case '/kick':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /kick @usuario' });
        return;
      }
      result = await handleKick(args[0], usuario, grupo);
      break;

    case '/promote':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /promote @usuario' });
        return;
      }
      result = await handlePromote(args[0], usuario, grupo);
      break;

    case '/demote':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /demote @usuario' });
        return;
      }
      result = await handleDemote(args[0], usuario, grupo);
      break;

    case '/lock':
      result = await handleLock(usuario, grupo);
      break;
    case '/unlock':
      result = await handleUnlock(usuario, grupo);
      break;

    // Comandos de descarga y almacenamiento
    case '/descargar':
      if (args.length < 3) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /descargar <url> <nombre> <categoria>\nCategorías: manhwa, serie, extra, ilustracion, pack' });
        return;
      }
      const [url, nombre, categoriaDescarga] = args;
      result = await handleDescargar(url, nombre, categoriaDescarga, usuario, remoteJid);
      break;

    case '/guardar':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /guardar <categoria>\nCategorías: manhwa, serie, extra, ilustracion, pack\n\n*Envía este comando como respuesta a una imagen, video o documento.*' });
        return;
      }
      // Obtener mensaje citado si existe
      const quotedMessage = message.message.extendedTextMessage?.contextInfo?.quotedMessage ? {
        message: message.message.extendedTextMessage.contextInfo.quotedMessage,
        key: message.message.extendedTextMessage.contextInfo
      } : message;
      result = await handleGuardar(args[0], usuario, grupo, quotedMessage);
      break;

    case '/archivos':
      const categoriaFiltro = args[0] || null;
      result = await handleArchivos(categoriaFiltro, usuario, grupo);
      break;

    case '/misarchivos':
      result = await handleMisArchivos(usuario, grupo);
      break;

    case '/estadisticas':
      result = await handleEstadisticas(usuario, grupo);
      break;

    case '/limpiar':
      result = await handleLimpiar(usuario, grupo);
      break;

    case '/buscararchivo':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /buscararchivo <nombre>' });
        return;
      }
      result = await handleBuscarArchivo(args.join(' '), usuario, grupo);
      break;

    // Comandos de IA con Gemini
    case '/ai':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /ai <pregunta>\n\nEjemplo: /ai ¿Qué es Jinx?' });
        return;
      }
      result = await handleGeminiAI(args.join(' '), usuario, grupo, fecha);
      break;

    case '/clasificar':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /clasificar <texto>\n\nEjemplo: /clasificar Jinx capítulo 45' });
        return;
      }
      result = await handleClasificar(args.join(' '), usuario, grupo);
      break;

    case '/listclasificados':
      result = await handleListClasificados(usuario, grupo, fecha);
      break;

    // Comandos de logs y configuración
    case '/logssystem':
    case '/systemlogs':
      const categoria = args[0] || null;
      result = await handleLogsCommand(categoria, usuario, grupo, fecha);
      break;

    case '/config':
      const parametro = args[0] || null;
      const valor = args[1] || null;
      result = await handleConfig(parametro, valor, usuario, grupo, fecha);
      break;

    // Comandos de registro automático
    case '/registrar':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /registrar <nombre_usuario>\n\nEjemplo: /registrar juan123' });
        return;
      }
      result = await handleRegistrarUsuario(args[0], usuario, grupo, fecha);
      break;

    case '/resetpass':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /resetpass <nombre_usuario>\n\nEjemplo: /resetpass juan123' });
        return;
      }
      result = await handleResetPassword(args[0], usuario, grupo, fecha);
      break;

    case '/miinfo':
      result = await handleMiInfo(usuario, grupo, fecha);
      break;

    // Comandos de Sub-bots
    case '/serbot':
      result = await handleSerbot(usuario, grupo, fecha);
      break;

    case '/bots':
      result = await handleBots(usuario, grupo, fecha);
      break;

    case '/delsubbot':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { 
          text: 'Uso: /delsubbot <subbot_id>\n\nEjemplo: /delsubbot subbot_1234567890_abc123' 
        });
        return;
      }
      result = await handleDelSubbot(args[0], usuario, grupo, fecha);
      break;

    case '/qr':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { 
          text: 'Uso: /qr <subbot_id>\n\nEjemplo: /qr subbot_1234567890_abc123' 
        });
        return;
      }
      result = await handleQR(args[0], usuario, grupo, fecha);
      break;

    // Comandos de Media/Entretenimiento
      case '/music':
      case '/musica':
      case '/song':
      case '/cancion':
        result = await handleMusic(text, usuario, remoteJid, fecha);
        break;

    case '/meme':
      result = await handleMeme(usuario, grupo, fecha);
      break;

    case '/wallpaper':
    case '/wp':
      result = await handleWallpaper(text, usuario, grupo, fecha);
      break;

    case '/joke':
    case '/chiste':
    case '/joke':
      result = await handleJoke(usuario, grupo, fecha);
      break;

    // Comandos de IA mejorados
    case '/ai':
    case '/chat':
    case '/ask':
      result = await handleAI(text, usuario, grupo, fecha);
      break;

    case '/image':
    case '/imagen':
    case '/generate':
      result = await handleImage(text, usuario, grupo, fecha);
      break;

    case '/translate':
    case '/traducir':
    case '/tr':
      const [textToTranslate, targetLang] = text.split(' ').slice(0, 2);
      result = await handleTranslate(textToTranslate, targetLang, usuario, grupo, fecha);
      break;

    // Comandos de entretenimiento adicionales
    case '/weather':
    case '/clima':
    case '/tiempo':
      result = await handleWeather(text, usuario, grupo, fecha);
      break;

    case '/quote':
    case '/cita':
    case '/frase':
      result = await handleQuote(usuario, grupo, fecha);
      break;

    case '/fact':
    case '/dato':
    case '/curiosidad':
      result = await handleFact(usuario, grupo, fecha);
      break;

    case '/trivia':
    case '/pregunta':
    case '/quiz':
      result = await handleTrivia(usuario, grupo, fecha);
      break;

    case '/horoscope':
    case '/horoscopo':
    case '/zodiaco':
      result = await handleHoroscope(text, usuario, grupo, fecha);
      break;

    // Comandos de logs y estadísticas
    case '/logs':
      result = await handleLogs(text, usuario, grupo, fecha);
      break;

    case '/stats':
    case '/estadisticas':
    case '/estadisticas':
      result = await handleStats(usuario, grupo, fecha);
      break;

    case '/export':
    case '/exportar':
      result = await handleExport(text, usuario, grupo, fecha);
      break;

    // Comando de ayuda
    case '/help':
    case '/ayuda':
    case '/comandos':
      result = await handleHelp(text, usuario, grupo, fecha);
      break;

    // Comandos de estado
    case '/status':
    case '/estado':
    case '/info':
      result = await handleStatus(usuario, grupo, fecha);
      break;

    case '/ping':
      result = await handlePing(usuario, grupo, fecha);
      break;

    // Comando de estado (legacy)
    case '/estado_legacy':
      await sock.sendMessage(remoteJid, {
        text: `*Estado del Bot:*\nEstado: ${connectionStatus}\nUsuario: ${usuario}${isGroup ? `\nGrupo: ${grupo}` : ''}`
      });
      return;

    case '/debug':
      const debugInfo = {
        messageId: message.key.id,
        timestamp: new Date().toISOString(),
        user: usuario,
        group: grupo,
        isGroup: isGroup,
        command: command,
        fullText: messageText,
        connectionStatus: connectionStatus,
        processedMessagesCount: processedMessages.size
      };
      await sock.sendMessage(remoteJid, {
        text: `*🔍 Debug Info:*\n\`\`\`json\n${JSON.stringify(debugInfo, null, 2)}\n\`\`\``
      });
      return;

    default:
      await sock.sendMessage(remoteJid, {
        text: '❓ Comando no reconocido. Usa /help para ver los comandos disponibles.'
      });
      return;
  }

  // Enviar respuesta si hay resultado
  if (result && result.message) {
    if (result.mentions) {
      await sock.sendMessage(remoteJid, { text: result.message, mentions: result.mentions });
    } else {
      await sock.sendMessage(remoteJid, { text: result.message });
    }
  }
}

// Función de monitoreo de salud de la conexión
function startHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(async () => {
    if (sock && connectionStatus === 'open') {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      // Si no hay actividad por más de 5 minutos, verificar conexión
      if (timeSinceLastActivity > 300000) {
        console.log('🔍 Verificando salud de la conexión...');
        try {
          // Enviar un ping simple para verificar la conexión
          await sock.presenceSubscribe('status@broadcast');
          lastActivity = now;
          console.log('✅ Conexión saludable');
        } catch (error) {
          console.log('⚠️ Conexión inestable, forzando reconexión...');
          if (sock) {
            sock.end();
          }
        }
      }
    }
  }, 60000); // Verificar cada minuto
}

// Conectar a WhatsApp con reconexión automática mejorada
async function connectToWhatsApp(authPath) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`🔄 Usando WA v${version.join('.')}, ¿es la última? ${isLatest}`);

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false, // Desactivamos QR en terminal, solo en panel
      auth: state,
      browser: ['KONMI BOT', 'Desktop', '2.5.0'],
      keepAliveIntervalMs: 30000, // Keep alive cada 30 segundos (más frecuente)
      connectTimeoutMs: 60000, // Timeout de conexión 60 segundos
      defaultQueryTimeoutMs: 60000, // Timeout de query 60 segundos
      markOnlineOnConnect: false, // No marcar como online automáticamente
      syncFullHistory: false, // No sincronizar historial completo
      generateHighQualityLinkPreview: false, // No generar previews de alta calidad
      retryRequestDelayMs: 2000, // Delay entre reintentos más rápido
      maxMsgRetryCount: 5, // Máximo 5 reintentos por mensaje
      shouldSyncHistoryMessage: () => false, // No sincronizar mensajes históricos
      shouldIgnoreJid: () => false, // No ignorar ningún JID
      getMessage: async (key) => {
        // Función para obtener mensajes de forma más eficiente
        return null;
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      if (qr) {
        qrCode = qr;
        connectionStatus = 'waiting_for_scan';
        try {
          // Generar imagen QR en base64 con mejor calidad
          qrCodeImage = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'H', // Alta corrección de errores
            type: 'image/png',
            quality: 0.95,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            width: 300 // Tamaño más grande para mejor escaneo
          });
          
          // Mostrar QR en terminal
          console.log('\n📱 QR Code para conectar WhatsApp:');
          console.log('┌─────────────────────────────────────────────────────────┐');
          console.log('│  Escanea este código QR con tu WhatsApp para conectar  │');
          console.log('└─────────────────────────────────────────────────────────┘');
          
          // Generar QR para terminal (ASCII)
          const qrTerminal = await QRCode.toString(qr, { 
            type: 'terminal',
            small: true 
          });
          console.log(qrTerminal);
          
          console.log('📱 QR Code también disponible en el panel web: http://localhost');
          console.log('⏳ Esperando escaneo...\n');
        } catch (error) {
          console.error('❌ Error generando imagen QR:', error);
        }
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        console.log(`⚠️ Conexión cerrada. Código: ${statusCode}, Reconectar: ${shouldReconnect}`);

        connectionStatus = 'disconnected';
        qrCode = null;
        qrCodeImage = null;
        
        // Limpiar monitoreo de salud
        if (healthCheckInterval) {
          clearInterval(healthCheckInterval);
          healthCheckInterval = null;
        }

        if (shouldReconnect && connectionAttempts < maxConnectionAttempts) {
          connectionAttempts++;
          console.log(`🔄 Intento de reconexión ${connectionAttempts}/${maxConnectionAttempts}`);
          
          // Lógica mejorada de reconexión con menos limpieza de sesión
          let delay = 3000; // Delay base más corto
          let shouldCleanSession = false;
          
          // Solo limpiar sesión en casos muy específicos y después de varios intentos
          if (statusCode === 440 && connectionAttempts > 3) { // Session expired
            console.log('🧹 Sesión expirada, limpiando...');
            shouldCleanSession = true;
            delay = 5000;
          } else if (statusCode === 401 && connectionAttempts > 2) { // Unauthorized
            console.log('🔐 No autorizado, limpiando sesión...');
            shouldCleanSession = true;
            delay = 8000;
          } else if (statusCode === 428) { // Precondition required
            console.log('⚠️ Precondición requerida, reconectando...');
            delay = 2000;
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log('🔄 Reinicio requerido...');
            delay = 1000;
          } else {
            console.log(`🔄 Reconectando por código ${statusCode}...`);
            delay = Math.min(3000 + (connectionAttempts * 1000), 10000); // Delay progresivo
          }
          
          if (shouldCleanSession) {
            try {
              // Limpiar archivos de sesión solo si es necesario
              const fs = await import('fs');
              const path = await import('path');
              const authPath = path.join(process.cwd(), 'storage', 'baileys_full');
              if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('✅ Sesión limpiada');
                connectionAttempts = 0; // Resetear intentos después de limpiar
              }
            } catch (error) {
              console.error('❌ Error limpiando sesión:', error);
            }
          }
          
          console.log(`🔄 Reconectando en ${delay}ms...`);
          setTimeout(() => connectToWhatsApp(authPath), delay);
        } else if (connectionAttempts >= maxConnectionAttempts) {
          console.log('🚫 Máximo de intentos de reconexión alcanzado. Deteniendo...');
          connectionStatus = 'failed';
        } else {
          console.log('🚫 No se reconectará automáticamente');
        }
      } else if (connection === 'connecting') {
        connectionStatus = 'connecting';
        console.log('🔄 Conectando a WhatsApp...');
      } else if (connection === 'open') {
        console.log('✅ Bot conectado exitosamente a WhatsApp');
        connectionStatus = 'connected';
        lastConnection = new Date();
        connectionStartTime = new Date();
        lastActivity = Date.now();
        connectionAttempts = 0; // Resetear intentos de conexión
        qrCode = null;
        qrCodeImage = null;
        
        // Iniciar monitoreo de salud
        startHealthCheck();
        
        // Obtener información del bot conectado
        try {
          const botInfo = sock.user;
          if (botInfo && botInfo.id) {
            const botNumber = botInfo.id.split('@')[0];
            console.log(`🤖 Bot conectado con número: ${botNumber}`);
            
            // Configurar automáticamente el número del bot como admin
            await setupBotAsAdmin(botNumber);
          }
        } catch (error) {
          console.error('Error al obtener información del bot:', error);
        }
        
        // Registrar conexión exitosa en logs
        await logCommand('sistema', 'conexion_exitosa', 'bot', null);
      }

      if (receivedPendingNotifications) {
        console.log('📬 Notificaciones pendientes recibidas');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      // Actualizar actividad cuando se reciben mensajes
      lastActivity = Date.now();
      
      const message = m.messages[0];
      if (!message.key.fromMe && message.message) {
        try {
          const remoteJid = message.key.remoteJid;
          const isGroup = remoteJid.endsWith('@g.us');
          
          // Verificar si es un comando primero
          const messageText = message.message.conversation ||
            message.message.extendedTextMessage?.text || '';
          
          if (messageText.startsWith('/') || messageText.startsWith('!') || messageText.startsWith('.')) {
            // Protección contra spam para comandos
            const messageId = `${message.key.id}_${message.key.remoteJid}_${messageText}`;
            const now = Date.now();
            
            // Limpiar mensajes antiguos del cache
            for (const [key, timestamp] of processedMessages.entries()) {
              if (now - timestamp > SPAM_PROTECTION_TIME) {
                processedMessages.delete(key);
              }
            }
            
            // Verificar si ya procesamos este mensaje recientemente
            if (processedMessages.has(messageId)) {
              console.log(`🛡️ Mensaje duplicado ignorado: ${messageText}`);
              return;
            }
            
            // Marcar como procesado
            processedMessages.add(messageId);
            
            // Es un comando, procesar solo una vez
            await handleMessage(message);
          } else if (isGroup) {
            // No es comando, pero está en grupo - procesar como proveedor automático
            try {
              const providerResult = await processProviderMessage(message, remoteJid, 'Grupo');
              if (providerResult && providerResult.success) {
                console.log(`📥 Aporte automático procesado: ${providerResult.description}`);
              }
            } catch (providerError) {
              // Error silencioso para no interrumpir el flujo normal
              if (providerError.message !== 'No es grupo proveedor') {
                console.error('⚠️ Error procesando proveedor automático:', providerError.message);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error procesando mensaje:', error);
        }
      }
    });

    sock.ev.on('group-participants.update', async (update) => {
      console.log('👥 Actualización de participantes en grupo:', update.id);
      // Aquí se puede agregar lógica para manejar cambios en grupos
    });

    // Manejar errores de conexión
    sock.ev.on('connection.error', (error) => {
      console.error('❌ Error de conexión:', error);
    });

    return sock;
  } catch (error) {
    console.error('❌ Error crítico al conectar WhatsApp:', error);
    connectionStatus = 'error';
    throw error;
  }
}

function getQRCode() {
  return qrCode;
}

function getQRCodeImage() {
  return qrCodeImage;
}

function getConnectionStatus() {
  const now = new Date();
  let uptime = null;
  let lastConnectionText = null;
  
  if (connectionStartTime && connectionStatus === 'connected') {
    const uptimeMs = now - connectionStartTime;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    uptime = `${hours}h ${minutes}m`;
  }
  
  if (lastConnection) {
    const timeDiff = now - lastConnection;
    const minutes = Math.floor(timeDiff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (connectionStatus === 'connected') {
      lastConnectionText = 'Conectado ahora';
    } else if (days > 0) {
      lastConnectionText = `hace ${days} día${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      lastConnectionText = `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      lastConnectionText = `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    } else {
      lastConnectionText = 'hace menos de 1 minuto';
    }
  } else {
    lastConnectionText = 'Nunca conectado';
  }
  
  return {
    status: connectionStatus,
    lastConnection: lastConnectionText,
    uptime: uptime,
    isConnected: connectionStatus === 'connected',
    timestamp: now.toISOString()
  };
}

function getSocket() {
  return sock;
}

// Obtener grupos disponibles del bot
async function getAvailableGroups() {
  try {
    if (!sock || connectionStatus !== 'connected') {
      return [];
    }

    // Obtener todos los chats
    const chats = await sock.groupFetchAllParticipating();
    const groups = [];

    for (const [jid, group] of Object.entries(chats)) {
      if (jid.endsWith('@g.us')) {
        groups.push({
          jid: jid,
          nombre: group.subject || 'Grupo sin nombre',
          descripcion: group.desc || '',
          participantes: group.participants ? group.participants.length : 0,
          esAdmin: group.participants ? group.participants.some(p => 
            p.id === sock.user.id && (p.admin === 'admin' || p.admin === 'superadmin')
          ) : false
        });
      }
    }

    return groups;
  } catch (error) {
    console.error('Error obteniendo grupos disponibles:', error);
    return [];
  }
}

export { connectToWhatsApp, getQRCode, getQRCodeImage, getConnectionStatus, getSocket, getAvailableGroups };
