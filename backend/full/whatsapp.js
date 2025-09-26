import * as baileys from 'AdonixBaileys';
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import { db } from './index.js';
import {
  handleHelp,
  handleIA,
  handleClasificar,
  handleMyAportes,
  handleAportes,
  handleManhwas,
  handleSeries,
  handleAddAporte,
  handleAddSerie,
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
  clearGroupOffNotices,
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
  handleAportar,
  handlePedido,
  handlePedidos,
  handleRegistrarUsuario,
  handleResetPassword,
  handleMiInfo,
  handleCleanSession
} from './handler.js';

// Consolidated: import handlers from commands-complete
import {
  handleSerbot,
  handleBots,
  handleDelSubbot,
  handleMusic,
  handleMeme,
  handleWallpaper,
  handleJoke,
  handleAI,
  handleImage,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  handleLogsAdvanced,
  handleStats,
  handleExport,
  handleStatus,
  handlePing,
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo,
  handleBan,
  handleUnban
} from './commands-complete.js';
import { processProviderMessage } from './handler.js';
import { onSubbotEvent } from './inproc-subbots.js';

// nose xd

let sock;
let qrCode = null;
let qrCodeImage = null;
let pairingCode = null;
let pairingPhoneNumber = null;
let connectionStatus = 'disconnected';
let lastConnection = null;
let connectionStartTime = null;
let lastActivity = Date.now();
let connectionAttempts = 0;
let maxConnectionAttempts = 10;
let healthCheckInterval = null;
let authMethod = 'qr'; // 'qr' o 'pairing'

// Función para obtener el estado del bot
export function getBotStatus() {
  return {
    status: connectionStatus,
    isConnected: connectionStatus === 'connected',
    qrCode: qrCode,
    qrCodeImage: qrCodeImage,
    pairingCode: pairingCode,
    pairingPhoneNumber: pairingPhoneNumber,
    authMethod: authMethod,
    lastConnection: lastConnection,
    connectionStartTime: connectionStartTime,
    lastActivity: lastActivity,
    connectionAttempts: connectionAttempts,
    maxConnectionAttempts: maxConnectionAttempts
  };
}

function sanitizePhoneNumberInput(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

function ensureWhatsAppJid(identifier) {
  if (!identifier) return null;
  return String(identifier).includes('@') ? String(identifier) : `${identifier}@s.whatsapp.net`;
}

function parseSubbotMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

function getRequesterMention(metadata, subbot) {
  const requester = ensureWhatsAppJid(metadata?.requesterJid || subbot?.request_participant || subbot?.request_jid);
  if (!requester) return { text: 'Tú', jid: null };
  const text = `@${String(requester).split('@')[0]}`;
  return { text, jid: requester };
}

// Enviar QR y códigos de sub‑bots por privado (y avisar en el grupo si aplica)
onSubbotEvent('qr_ready', async ({ subbot, data }) => {
  try {
    if (!data?.qrImage) return;
    if (!sock) return;
    const requesterChat = subbot?.request_jid || ensureWhatsAppJid(subbot?.request_participant);
    if (!requesterChat) return;
    const caption = [
      '📱 *QR listo para tu sub-bot*',
      '',
      `• Sub-bot: ${subbot.code}`,
      '',
      '1. Abre WhatsApp en tu teléfono',
      '2. Ve a *Configuración → Dispositivos vinculados*',
      '3. Toca *Vincular dispositivo*',
      '4. Escanea este código'
    ].join('\n');
    const buffer = Buffer.from(data.qrImage, 'base64');
    await sock.sendMessage(requesterChat, { image: buffer, caption });
    const meta = parseSubbotMetadata(subbot?.metadata);
    if (meta?.requestedFromGroup && meta.originChat) {
      const { text, jid } = getRequesterMention(meta, subbot);
      const notify = `📱 ${text}, tu sub-bot ${subbot.code} ya tiene el QR. Revisa tu privado.`;
      await sock.sendMessage(meta.originChat, { text: notify, mentions: jid ? [jid] : undefined });
      if (meta.originMessageId) {
        try {
          await sock.sendMessage(meta.originChat, { react: { text: '✅', key: { id: meta.originMessageId, remoteJid: meta.originChat, fromMe: false } } });
          // Intento de borrar el mensaje del solicitante (si el bot es admin y la plataforma lo permite)
          if (jid) {
            try {
              await sock.sendMessage(meta.originChat, { delete: { id: meta.originMessageId, remoteJid: meta.originChat, fromMe: false, participant: jid } });
            } catch (_) {}
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error('Error enviando QR de subbot:', e);
  }
});

onSubbotEvent('pairing_code', async ({ subbot, data }) => {
  try {
    if (!data?.code) return;
    if (!sock) return;
    const requesterChat = subbot?.request_jid || ensureWhatsAppJid(subbot?.request_participant);
    if (!requesterChat) return;
    const number = subbot?.target_number || data.targetNumber || '';
    const display = data.displayCode || 'KONMI-BOT';
    const raw = data.code || display.replace(/[^0-9A-Z]/g, '');
    const lines = [
      '🔐 *Vinculación por Código Manual (8 dígitos)*',
      '',
      `• Sub-bot: ${subbot.code}`,
      number ? `• Número: +${number}` : null,
      `• Código: *${display}*`,
      raw && display !== raw ? `• Código sin formato: *${raw}*` : null,
      '',
      '🧭 *Pasos:*',
      '1. WhatsApp → Más opciones → Dispositivos vinculados',
      '2. Vincular un dispositivo',
      '3. Seleccionar *Con número* e ingresar el código'
    ].filter(Boolean).join('\n');
    await sock.sendMessage(requesterChat, { text: lines });
    const meta = parseSubbotMetadata(subbot?.metadata);
    if (meta?.requestedFromGroup && meta.originChat) {
      const { text: mention, jid } = getRequesterMention(meta, subbot);
      const notify = `🔐 ${mention}, tu sub-bot ${subbot.code} ya tiene el código (*${display}*). Revisa tu privado.`;
      await sock.sendMessage(meta.originChat, { text: notify, mentions: jid ? [jid] : undefined });
      if (meta.originMessageId) {
        try {
          await sock.sendMessage(meta.originChat, { react: { text: '✅', key: { id: meta.originMessageId, remoteJid: meta.originChat, fromMe: false } } });
          if (jid) {
            try {
              await sock.sendMessage(meta.originChat, { delete: { id: meta.originMessageId, remoteJid: meta.originChat, fromMe: false, participant: jid } });
            } catch (_) {}
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error('Error enviando pairing de subbot:', e);
  }
});

// Sistema para rastrear usuarios esperando media para comandos como /aportar
// Estructura: { usuario: { command: string, tipo: string, timeout: number } }
const waitingForMedia = new Map();
const MEDIA_WAIT_TIMEOUT = 120000; // 2 minutos para esperar media

// Función para limpiar timeouts de espera de media
setInterval(() => {
  const now = Date.now();
  for (const [user, data] of waitingForMedia.entries()) {
    if (now > data.timeout) {
      waitingForMedia.delete(user);
      console.log(`⏰ Timeout de espera de media para usuario ${user}`);
    }
  }
}, 30000); // Verificar cada 30 segundos

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
  let sender = message.key.participant || remoteJid;
  if (message.key.fromMe && sock?.user?.id) {
    sender = sock.user.id;
  }
  const usuario = sender.split('@')[0];
  const grupo = isGroup ? remoteJid : null;

  // Bloqueo por ban (solo para comandos)
  try {
    const banned = await db('usuarios_baneados').where({ wa_number: usuario }).first();
    if (banned) {
      await sock.sendMessage(remoteJid, { text: '🚫 Estás baneado del bot.' });
      return;
    }
  } catch (_) {}

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

  // 2. Estado por grupo: si el grupo está desactivado, avisar solo una vez por participante
  if (isGroup && await isGroupDeactivated(remoteJid)) {
    // Solo permitir reactivar con /bot on por un admin real del grupo
    if (command === '/bot' && args[0] === 'on') {
      const isAdmin = await import('./commands-complete.js').then(m => m.isGroupAdmin(usuario, remoteJid));
      if (isAdmin) {
        await clearGroupOffNotices(remoteJid);
        // sigue el flujo para que /bot on haga su trabajo más abajo
      } else {
        if (!(await wasUserNotifiedGroupOff(remoteJid, usuario))) {
          await sock.sendMessage(remoteJid, {
            text: '🤖 *Bot desactivado en este grupo*\n\nSolo un admin puede reactivarlo usando `/bot on`.'
          });
          await markUserNotifiedGroupOff(remoteJid, usuario);
        }
        return;
      }
    } else {
      if (!(await wasUserNotifiedGroupOff(remoteJid, usuario))) {
        await sock.sendMessage(remoteJid, {
          text: '🤖 *Bot desactivado en este grupo*\n\nSolo un admin puede reactivarlo usando `/bot on`.'
        });
        await markUserNotifiedGroupOff(remoteJid, usuario);
      }
      return;
    }
  }

  // Comandos solo para grupo (excepto '/bot global ...' permitido en cualquier chat)
  const groupOnlyCommands = ['/bot', '/kick', '/promote', '/demote', '/lock', '/unlock', '/tag'];
  if (!isGroup) {
    const isGroupOnly = groupOnlyCommands.some(cmd => command.startsWith(cmd));
    const isBotGlobal = command === '/bot' && args[0] === 'global';
    if (isGroupOnly && !isBotGlobal) {
      await sock.sendMessage(remoteJid, { text: '⛔ Este comando solo funciona en grupos.' });
      return;
    }
  }

  console.log(`📨 Comando recibido: ${command} de ${usuario} en ${isGroup ? grupo : 'privado'}`);
  console.log(`📝 Texto completo: "${messageText}"`);
  console.log(`🆔 Message ID: ${message.key.id}`);

  let result;
  const fecha = new Date().toISOString();
  const rawCommand = command.replace(/^[\/.!]/, '');

  switch (command) {
    // Comandos básicos - múltiples variantes para help/menu
    case '/help':
    case '/ayuda':
    case '/menu':
    case '/comandos':
    case '!help':
    case '!menu':
      result = await handleHelp(usuario, grupo, isGroup);
      break;

    // Desactivar /connect: indicar rutas soportadas
    case '/connect':
      await sock.sendMessage(remoteJid, { text: 'ℹ️ Comando deshabilitado. Usa `/serbot` (QR) o `/code <número>` para sub-bots; el bot principal se conecta desde el panel.' });
      return;

    case '/ia':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /ia <pregunta>' });
        return;
      }
      result = await handleIA(args.join(' '), usuario, grupo);
      break;

    case '/myaportes':
      result = await handleMyAportes(usuario, grupo, args[0] || null);
      break;

    case '/aportes':
      result = await handleAportes(usuario, grupo, isGroup, args[0] || null);
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

    // Alias directo al comando del panel para guardar aportes
    case '/aportar':
      if (args.length < 2) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /aportar <tipo> <contenido>\n\nEjemplos:\n/aportar manhwa Jinx cap 45\n/aportar ilustracion Fanart de Jinx' });
        return;
      }

      // Verificar si hay media en el mensaje actual
      const hasMedia = message.message.imageMessage ||
                       message.message.videoMessage ||
                       message.message.documentMessage ||
                       message.message.audioMessage;

      if (hasMedia) {
        // Si hay media, procesar directamente
        const tipoAporte = args[0];
        const contenidoAporte = args.slice(1).join(' ');
        result = await handleAportar(contenidoAporte, tipoAporte, usuario, grupo, fecha);
      } else {
        // Si no hay media, marcar al usuario como esperando media
        const tipoAporte = args[0];
        const contenidoAporte = args.slice(1).join(' ');

        // Limpiar cualquier espera anterior del usuario
        waitingForMedia.delete(usuario);

        // Marcar al usuario como esperando media
        waitingForMedia.set(usuario, {
          command: 'aportar',
          tipo: tipoAporte,
          contenido: contenidoAporte,
          grupo: grupo,
          timeout: Date.now() + MEDIA_WAIT_TIMEOUT
        });

        await sock.sendMessage(remoteJid, {
          text: `✅ Comando registrado: /aportar ${tipoAporte} ${contenidoAporte}\n\n📎 Ahora envía la imagen, video o documento que quieres aportar.\n\n⏰ Tienes 2 minutos para enviar el archivo.`
        });
        return;
      }
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
        // Control por grupo: requiere grupo y admin real
        if (!isGroup) {
          await sock.sendMessage(remoteJid, { text: '⛔ Este comando solo funciona en grupos. Usa `/bot global on|off` para control global.' });
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
      if (!args.length) args = ['auto'];
      result = await handleCode(usuario, grupo, remoteJid, args, sender, message.key?.id || null);
      if (args.length === 1 && args[0] === 'auto') {
        // Mensaje de ayuda corto cuando no se pasan argumentos
        await sock.sendMessage(remoteJid, { text: '🧩 Usando tu número automáticamente. También puedes usar `/code auto` o `/code <número> [ALIAS8]`.' });
      }
      break;

    // Eliminado: '/qr' sin argumentos (obsoleto). Usar '/qr <subbot_id>' más abajo.

    case '/whoami':
      {
        const waInfo = { pushName: message.pushName || null, id: sender || remoteJid };
        result = await handleWhoami(usuario, grupo, isGroup, waInfo);
      }
      break;

    case '/tag':
      result = await handleTag(args.join(' '), usuario, grupo);
      break;

    case '/responder':
      {
        const ctx = message.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage ? { message: ctx.quotedMessage, key: ctx } : null;
        if (!quoted) {
          await sock.sendMessage(remoteJid, { text: 'Responde a un mensaje para mencionar a su autor.' });
          return;
        }
        result = await handleReplyTag(args.join(' '), usuario, grupo, quoted);
      }
      break;

    case '/debugadmin':
      result = await handleDebugAdmin(usuario, grupo);
      break;

    // Moderación: banear y desbanear
    case '/ban':
      {
        // Determinar objetivo: @numero, o respondido
        let target = args[0] || '';
        if (!target && message.message?.extendedTextMessage?.contextInfo?.participant) {
          target = '@' + message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
        }
        if (!target && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
          const mj = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
          target = '@' + String(mj).split('@')[0];
        }
        if (!target) { await sock.sendMessage(remoteJid, { text: 'Uso: /ban @usuario [motivo] (o responde un mensaje)' }); return; }
        const reason = args.slice(1).join(' ');
        const num = target.replace(/[^0-9]/g, '');
        result = await handleBan(num, sender, grupo, reason);
      }
      break;

    case '/unban':
      {
        let target = args[0] || '';
        if (!target && message.message?.extendedTextMessage?.contextInfo?.participant) {
          target = '@' + message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
        }
        if (!target && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
          const mj = message.message.extendedTextMessage.contextInfo.mentionedJid[0];
          target = '@' + String(mj).split('@')[0];
        }
        if (!target) { await sock.sendMessage(remoteJid, { text: 'Uso: /unban @usuario (o responde un mensaje)' }); return; }
        const num = target.replace(/[^0-9]/g, '');
        result = await handleUnban(num, sender, grupo);
      }
      break;

    case '/addmanhwa':
      if (args.length === 0) {
        await sock.sendMessage(remoteJid, { text: 'Uso: /addmanhwa <título|autor|género|estado|descripción|url|proveedor>' });
        return;
      }
      result = await handleAddManhwa(args.join(' '), usuario, grupo);
      break;

    // '/logs' avanzado con categoría opcional (all, errors, commands, users, system)
    case '/logs':
      result = await handleLogsAdvanced(text, usuario, grupo, fecha);
      break;

    case '/privado':
    case '/amigos':
    case '/advertencias':
      await sock.sendMessage(remoteJid, { text: '⚙️ Configuraciones solo desde el panel web.' });
      return;

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

    // Estado aportes: solo panel
    case '/aporteestado':
    case '/revision':
    case '/completado':
    case '/pendiente':
      await sock.sendMessage(remoteJid, { text: '🗂️ El estado de aportes se cambia desde el panel.' });
      return;

    // Comandos de moderación

    case '/kick':
      {
        let target = args[0] || '';
        if (!target && message.message?.extendedTextMessage?.contextInfo?.participant) {
          target = '@' + message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
        }
        if (!target) { await sock.sendMessage(remoteJid, { text: 'Uso: /kick @usuario (o responde a un mensaje)' }); return; }
        result = await handleKick(target, usuario, grupo);
      }
      break;

    case '/promote':
      {
        let target = args[0] || '';
        if (!target && message.message?.extendedTextMessage?.contextInfo?.participant) {
          target = '@' + message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
        }
        if (!target) { await sock.sendMessage(remoteJid, { text: 'Uso: /promote @usuario (o responde a un mensaje)' }); return; }
        result = await handlePromote(target, usuario, grupo);
      }
      break;

    case '/demote':
      {
        let target = args[0] || '';
        if (!target && message.message?.extendedTextMessage?.contextInfo?.participant) {
          target = '@' + message.message.extendedTextMessage.contextInfo.participant.split('@')[0];
        }
        if (!target) { await sock.sendMessage(remoteJid, { text: 'Uso: /demote @usuario (o responde a un mensaje)' }); return; }
        result = await handleDemote(target, usuario, grupo);
      }
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
      result = await handleDescargar(url, nombre, categoriaDescarga, usuario, grupo);
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
    case '/chat':
    case '/ask':
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
      result = await handleSerbot(usuario, grupo, fecha, remoteJid, sender, message.key?.id || null);
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
      result = await handleMusic(text, usuario, grupo, fecha);
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
      result = await handleJoke(usuario, grupo, fecha);
      break;

    // Comandos de IA mejorados - Se mantiene solo la versión Gemini desde commands.js
    // (Evita duplicidad con el bloque '/ai' anterior)

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

    // Comandos de logs y estadísticas (mantener solo el avanzado '/logs')

    case '/stats':
      result = await handleStats(usuario, grupo, fecha);
      break;

    case '/export':
    case '/exportar':
      result = await handleExport(text, usuario, grupo, fecha);
      break;

    // Comando de ayuda
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
      // Intentar comandos personalizados desde base de datos (bot_commands)
      try {
        let row = await db('bot_commands')
          .where({ command: rawCommand, enabled: true })
          .first();
        if (!row) {
          row = await db('bot_commands')
            .where('enabled', true)
            .andWhere('aliases', 'like', `%"${rawCommand}"%`)
            .first();
        }
        if (row) {
          const reply = row.response || `Comando ${rawCommand}`;
          await sock.sendMessage(remoteJid, { text: reply });
          const newCount = (row.usage_count || 0) + 1;
          await db('bot_commands').where({ id: row.id }).update({ usage_count: newCount, last_used: new Date().toISOString() });
          await logCommand('comando', `custom:${rawCommand}`, usuario, grupo);
          return;
        }
      } catch (e) {
        console.error('Error manejando comando custom:', e);
      }
      await sock.sendMessage(remoteJid, { text: '❓ Comando no reconocido. Usa /help para ver los comandos disponibles.' });
      return;
  }

  // Enviar respuesta si hay resultado
  if (result && result.message) {
    const content = result.mentions ? { text: result.message, mentions: result.mentions } : { text: result.message };
    if (result.replyTo) {
      await sock.sendMessage(remoteJid, content, { quoted: result.replyTo });
    } else {
      await sock.sendMessage(remoteJid, content);
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

    // Si se solicita pairing code, generarlo (silencioso en logs)
    if (authMethod === 'pairing') {
      try {
        const target = pairingPhoneNumber || process.env.AUTH_PREFERRED_PHONE || '';
        const normalized = sanitizePhoneNumberInput(target);
        if (!normalized) {
          connectionStatus = 'waiting_for_number';
        } else {
          if (sock?.authState?.creds) sock.authState.creds.usePairingCode = true;
          pairingCode = await sock.requestPairingCode(normalized);
          // No imprimir el código en logs por seguridad
          connectionStatus = 'waiting_for_pairing';
          qrCode = null;
          qrCodeImage = null;
        }
      } catch (error) {
        console.error('❌ Error generando código de emparejamiento:', error?.message || error);
        connectionStatus = 'error';
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

    if (qr) {
      qrCode = qr;
      connectionStatus = 'waiting_for_scan';
      pairingCode = null;
      setAuthMethod('qr');
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
        
        // Mostrar QR en terminal (ASCII)
        const qrTerminal = await QRCode.toString(qr, { 
          type: 'terminal',
          small: true 
        });
        console.log(qrTerminal);
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
      if (message?.message) {
        try {
          const remoteJid = message.key.remoteJid;
          const isGroup = remoteJid.endsWith('@g.us');
          const isFromMe = !!message.key.fromMe;
          // Capturar y guardar nombre de WhatsApp del remitente
          try {
            const senderJid = (message.key.participant || message.key.remoteJid || '').toString();
            const number = senderJid.split('@')[0].split(':')[0];
            const pushName = message.pushName || message.message?.pushName || null;
            if (number && pushName) {
              await db('wa_contacts').insert({
                wa_number: number,
                display_name: pushName,
                updated_at: new Date().toISOString()
              }).onConflict('wa_number').merge(['display_name','updated_at']);
            }
          } catch (e) {
            // No crítico
          }
          
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
            processedMessages.set(messageId, now);
            
            // Es un comando, procesar solo una vez
            await handleMessage(message);
          } else if (isGroup && !isFromMe) {
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
          } else if (!isFromMe) {
            // Verificar si el usuario está esperando media para completar un comando
            const usuario = (message.key.participant || message.key.remoteJid || '').split('@')[0];
            const waitingData = waitingForMedia.get(usuario);

            if (waitingData && waitingData.command === 'aportar') {
              // Usuario está esperando media para completar /aportar
              try {
                const hasMedia = message.message.imageMessage ||
                                 message.message.videoMessage ||
                                 message.message.documentMessage ||
                                 message.message.audioMessage;

                if (hasMedia) {
                  // Procesar como aporte con la media recibida
                  const result = await handleAportar(waitingData.contenido, waitingData.tipo, usuario, waitingData.grupo, new Date().toISOString());

                  if (result && result.success) {
                    await sock.sendMessage(remoteJid, {
                      text: `✅ ¡Aporte completado exitosamente!\n\n📝 ${result.message}`
                    });
                  } else {
                    await sock.sendMessage(remoteJid, {
                      text: `❌ Error al procesar el aporte: ${result?.message || 'Error desconocido'}`
                    });
                  }

                  // Limpiar la espera
                  waitingForMedia.delete(usuario);
                } else {
                  await sock.sendMessage(remoteJid, {
                    text: '📎 Por favor, envía una imagen, video o documento para completar tu aporte.\n\n⏰ Tienes 2 minutos para enviar el archivo.'
                  });
                }
              } catch (error) {
                console.error('Error procesando media para aporte:', error);
                await sock.sendMessage(remoteJid, {
                  text: '❌ Error al procesar el archivo. Intenta nuevamente.'
                });
                waitingForMedia.delete(usuario);
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

function getPairingCode() {
  return pairingCode;
}

function getPairingNumber() {
  return pairingPhoneNumber;
}

function setAuthMethod(method, options = {}) {
  if (!['qr', 'pairing'].includes(method)) {
    const error = new Error('Método de autenticación inválido. Usa "qr" o "pairing".');
    error.code = 'INVALID_AUTH_METHOD';
    throw error;
  }
  if (method === 'pairing') {
    const normalized = sanitizePhoneNumberInput(options.phoneNumber || pairingPhoneNumber);
    if (!normalized) {
      const error = new Error('Número de teléfono inválido. Usa solo dígitos con código de país, ejemplo: 595974154768.');
      error.code = 'INVALID_PAIRING_NUMBER';
      throw error;
    }
    pairingPhoneNumber = normalized;
    pairingCode = null;
  } else {
    pairingPhoneNumber = null;
    pairingCode = null;
  }
  authMethod = method;
  console.log(`🔧 Método de autenticación establecido: ${method}`);
  if (authMethod === 'pairing') {
    console.log(`📲 Número configurado para pairing: +${pairingPhoneNumber}`);
  }
  return pairingPhoneNumber;
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

// Borrar sesión de WhatsApp (archivos de autenticación) y resetear estado
async function clearWhatsAppSession() {
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(); } catch (_) {}
    }
  } catch (_) {}
  try {
    const authPath = path.join(process.cwd(), 'backend', 'full', 'storage', 'baileys_full');
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('🧹 Sesión de WhatsApp eliminada:', authPath);
    }
  } catch (e) {
    console.error('❌ Error eliminando sesión:', e?.message || e);
  }
  qrCode = null;
  qrCodeImage = null;
  pairingCode = null;
  pairingPhoneNumber = null;
  connectionStatus = 'disconnected';
}

export { connectToWhatsApp, getQRCode, getQRCodeImage, getPairingCode, getPairingNumber, setAuthMethod, getConnectionStatus, getSocket, getAvailableGroups, clearWhatsAppSession };
