import db from './db-connection.js';
import axios from 'axios';
import { handleHelp, commandCatalog } from './commands-help.js';
import { handleStatus, handlePing } from './commands-status.js';

// Almacenar estado de subbots
const subbotConnections = new Map();

/**
 * Registrar evento de subbot
 */
export async function registerSubbotEvent(subbotId, event, data) {
  try {
    console.log(`📱 Subbot ${subbotId} - Evento: ${event}`);
    
    // Actualizar estado en memoria
    subbotConnections.set(subbotId, {
      ...subbotConnections.get(subbotId),
      lastEvent: event,
      lastEventData: data,
      lastSeen: new Date().toISOString(),
      status: event === 'connected' ? 'online' : 
              event === 'disconnected' ? 'offline' : 
              event === 'qr_generated' ? 'waiting_qr' : 'unknown'
    });

    // Guardar en base de datos
    await db('subbots').where('code', subbotId).update({
      status: event === 'connected' ? 'connected' : 
              event === 'disconnected' ? 'disconnected' : 
              event === 'qr_generated' ? 'pending' : 'unknown',
      last_heartbeat: new Date().toISOString(),
      qr_data: event === 'qr_generated' ? data.qr : null
    });

    return { success: true };
  } catch (error) {
    console.error('Error registrando evento de subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estado de todos los subbots
 */
export function getSubbotStatus() {
  const status = [];
  for (const [subbotId, connection] of subbotConnections) {
    status.push({
      subbotId,
      status: connection.status,
      lastEvent: connection.lastEvent,
      lastSeen: connection.lastSeen,
      isOnline: connection.status === 'online'
    });
  }
  return status;
}

/**
 * Obtener subbot por ID
 */
export function getSubbot(subbotId) {
  return subbotConnections.get(subbotId);
}

/**
 * Listar todos los subbots
 */
export async function listSubbots() {
  try {
    const subbots = await db('subbots')
      .select('*')
      .orderBy('created_at', 'desc');
    
    return subbots.map(subbot => ({
      ...subbot,
      isOnline: subbotConnections.has(subbot.code) && 
                subbotConnections.get(subbot.code).status === 'online'
    }));
  } catch (error) {
    console.error('Error listando subbots:', error);
    return [];
  }
}

/**
 * Crear nuevo subbot
 */
export async function createSubbot(userId, type = 'code') {
  try {
    const subbotId = type === 'code'
      ? Math.floor(10000000 + Math.random() * 90000000).toString()
      : `subbot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await db('subbots').insert({
      code: subbotId,
      type,
      status: 'pending',
      created_by: userId,
      created_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
    });

    return { success: true, subbotId };
  } catch (error) {
    console.error('Error creando subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar subbot
 */
export async function deleteSubbot(subbotId) {
  try {
    await db('subbots').where('code', subbotId).del();
    subbotConnections.delete(subbotId);
    return { success: true };
  } catch (error) {
    console.error('Error eliminando subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecutar comando en subbot
 */
export async function executeSubbotCommand(subbotId, command, from, group) {
  try {
    const fecha = new Date().toISOString();
    const [cmd, ...args] = command.trim().split(/\s+/);
    let result;

    switch (cmd.toLowerCase()) {
      case '/help':
        result = await handleHelp(args.join(' '), from, group, fecha);
        break;
      case '/status':
        result = await handleStatus(from, group, fecha);
        break;
      case '/ping':
        result = await handlePing(from, group, fecha);
        break;
      default:
        console.log(`Comando no reconocido para subbot ${subbotId}: ${cmd}`);
        result = {
          success: false,
          message: '❌ Comando no reconocido'
        };
    }

    return result;
  } catch (error) {
    console.error('Error ejecutando comando en subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener comandos para subbot
 */
export async function getSubbotCommands(subbotId) {
  try {
    const commands = [];
    for (const category of Object.values(commandCatalog)) {
      category.commands.forEach(cmd => commands.push(cmd.cmd));
    }
    return { commands };
  } catch (error) {
    console.error('Error obteniendo comandos de subbot:', error);
    return { commands: [] };
  }
}

/**
 * Limpiar subbots inactivos
 */
export async function cleanupInactiveSubbots() {
  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas
    
    await db('subbots')
      .where('last_heartbeat', '<', cutoffTime.toISOString())
      .where('status', '!=', 'connected')
      .del();
    
    return { success: true };
  } catch (error) {
    console.error('Error limpiando subbots inactivos:', error);
    return { success: false, error: error.message };
  }
}