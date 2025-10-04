import { makeInMemoryStore } from 'baileys-mod';
import db from './db.js';
import logger from './config/logger.js';
import { startSession, closeSession, getSessionStatus, listSessions } from './multiaccount-manager.js';

// Almacenamiento en memoria para los datos adicionales de los subbots
const subbotMetadata = new Map();

/**
 * Inicia un nuevo subbot con conexión a WhatsApp Web
 * @param {string} subbotId - ID único del subbot
 * @param {string} ownerJid - JID del propietario (usuario que creó el subbot)
 */
export async function launchSubbot(subbotId, ownerJid) {
  try {
    logger.info(`[Subbot ${subbotId}] Iniciando subbot para ${ownerJid}`);
    
    // Actualizar estado del subbot a 'starting'
    await updateSubbotStatus(subbotId, 'starting');
    
    // Iniciar sesión usando el nuevo manejador
    const result = await startSession(subbotId, {
      onQR: async ({ qrUrl }) => {
        // Notificar al propietario con el código QR
        await notifyOwner(ownerJid, {
          text: 'Escanea el código QR para conectar el subbot',
          qr: qrUrl
        });
        
        // Actualizar estado del subbot
        await updateSubbotStatus(subbotId, 'qr_ready', { qr: qrUrl });
      },
      onConnected: async (session) => {
        logger.info(`[Subbot ${subbotId}] Conexión establecida`);
        await updateSubbotStatus(subbotId, 'connected', { 
          phoneNumber: session.phoneNumber 
        });
        
        // Notificar al propietario
        await notifyOwner(ownerJid, {
          text: `✅ Subbot ${subbotId} conectado correctamente`
        });
        
        // Almacenar metadatos adicionales
        subbotMetadata.set(subbotId, {
          ownerJid,
          connectedAt: new Date(),
          phoneNumber: session.phoneNumber
        });
      },
      onDisconnected: async (session) => {
        logger.info(`[Subbot ${subbotId}] Desconectado`);
        await updateSubbotStatus(subbotId, 'disconnected');
        subbotMetadata.delete(subbotId);
      }
    });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return { success: true };
    
  } catch (error) {
    logger.error(`[Subbot ${subbotId}] Error al iniciar:`, error);
    await updateSubbotStatus(subbotId, 'error', { error: error.message });
    return { error: error.message };
  }
}

/**
 * Actualiza el estado de un subbot en la base de datos
 * @param {string} subbotId - ID del subbot
 * @param {string} status - Nuevo estado
 * @param {Object} [data] - Datos adicionales para actualizar
 */
async function updateSubbotStatus(subbotId, status, data = {}) {
  try {
    const updateData = {
      status,
      last_activity: new Date(),
      ...data
    };
    
    if (status === 'connected') {
      updateData.connected_at = new Date();
      
      // Obtener información de la sesión
      const sessionInfo = await getSessionStatus(subbotId);
      if (sessionInfo && sessionInfo.phoneNumber) {
        updateData.user_phone = sessionInfo.phoneNumber;
      }
    }
    
    await db('subbots')
      .where({ code: subbotId })
      .update(updateData);
      
    logger.debug(`[Subbot ${subbotId}] Estado actualizado a ${status}`);
    
  } catch (error) {
    logger.error(`[Subbot ${subbotId}] Error al actualizar estado:`, error);
  }
}

/**
 * Notifica al propietario del subbot
 * @param {string} ownerJid - JID del propietario
 * @param {Object} message - Mensaje a enviar
 */
async function notifyOwner(ownerJid, message) {
  try {
    // Implementar lógica para notificar al propietario
    // Esto podría ser a través de un WebSocket, base de datos, etc.
    logger.info(`[Notificación a ${ownerJid}]: ${message.text}`);
  } catch (error) {
    logger.error(`Error notificando al propietario ${ownerJid}:`, error);
  }
}

/**
 * Obtiene un subbot por su código
 * @param {string} code - Código del subbot
 */
export async function getSubbotByCode(code) {
  try {
    return await db('subbots').where({ code }).first();
  } catch (error) {
    logger.error(`Error obteniendo subbot ${code}:`, error);
    return null;
  }
}

/**
 * Obtiene la lista de subbots con su estado de conexión
 */
export async function fetchSubbotListWithOnlineFlag() {
  try {
    // Obtener subbots de la base de datos
    const subbots = await db('subbots')
      .whereNotIn('status', ['deleted'])
      .select('*');
    
    // Obtener estado de las sesiones activas
    const activeSessions = listSessions();
    
    // Agregar estado de conexión
    const result = await Promise.all(subbots.map(async (subbot) => {
      const sessionInfo = activeSessions.find(s => s.sessionId === subbot.code);
      const isOnline = !!sessionInfo && sessionInfo.status === 'open';
      
      return {
        ...subbot,
        is_online: isOnline,
        last_seen: isOnline ? 'Ahora' : subbot.last_activity,
        connection_status: sessionInfo?.status || 'disconnected'
      };
    }));
    
    return result;
    
  } catch (error) {
    logger.error('Error al obtener lista de subbots:', error);
    return [];
  }
}

/**
 * Elimina un subbot
 * @param {string} subbotId - ID del subbot a eliminar
 * @param {string} ownerJid - JID del propietario
 */
export async function deleteSubbot(subbotId, ownerJid) {
  try {
    logger.info(`[Subbot ${subbotId}] Solicitada eliminación por ${ownerJid}`);
    
    // Cerrar la sesión usando el manejador
    await closeSession(subbotId, true); // true para eliminar también los archivos de sesión
    
    // Actualizar estado en la base de datos
    await db('subbots')
      .where({ code: subbotId, user_phone: ownerJid.split('@')[0] })
      .update({ 
        status: 'deleted',
        deleted_at: new Date(),
        is_active: false
      });
      
    // Eliminar metadatos
    subbotMetadata.delete(subbotId);
    
    return { success: true };
    
  } catch (error) {
    logger.error(`[Subbot ${subbotId}] Error al eliminar:`, error);
    return { error: error.message };
  }
}

// Manejar cierre del proceso
process.on('SIGINT', async () => {
  logger.info('Cerrando todas las conexiones de subbots...');
  
  // Cerrar todas las sesiones activas
  const sessions = listSessions();
  for (const session of sessions) {
    try {
      await closeSession(session.sessionId);
      logger.info(`Sesión ${session.sessionId} cerrada correctamente`);
    } catch (error) {
      logger.error(`Error cerrando sesión ${session.sessionId}:`, error);
    }
  }
  
  process.exit(0);
});
