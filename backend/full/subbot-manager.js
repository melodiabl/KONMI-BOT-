import db from './db.js';
import axios from 'axios';

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
    const subbotId = `subbot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    await db('subbots').insert({
      code: subbotId,
      type: type,
      status: 'pending',
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
    // Aquí podrías implementar lógica específica para cada comando
    // Por ahora, solo registramos el comando
    console.log(`Comando ejecutado en subbot ${subbotId}: ${command}`);
    
    return {
      success: true,
      message: `Comando ${command} ejecutado en subbot ${subbotId}`
    };
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
    // Aquí podrías implementar lógica para obtener comandos específicos
    // Por ahora, retornamos comandos básicos
    return {
      commands: ['/help', '/ping', '/status']
    };
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