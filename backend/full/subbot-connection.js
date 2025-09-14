import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';

const subbotConnections = new Map(); // Almacenar conexiones activas

/**
 * Crear conexión de subbot con QR
 */
export async function createSubbotConnection(userId, subbotId) {
  try {
    const authDir = `./auth_subbot_${subbotId}`;
    
    // Crear directorio de autenticación si no existe
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['KONMI SUBBOT', 'Chrome', '1.0.0'],
      logger: {
        level: 'silent'
      }
    });
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        // Generar QR como imagen
        const qrImage = await qrcode.toDataURL(qr);
        
        // Guardar QR en base de datos
        await updateSubbotQR(subbotId, qr, qrImage);
        
        // Notificar al usuario
        await notifyUserQR(userId, subbotId, qr, qrImage);
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect) {
          console.log('Reconectando subbot...');
          setTimeout(() => createSubbotConnection(userId, subbotId), 5000);
        } else {
          console.log('Subbot desconectado permanentemente');
          subbotConnections.delete(subbotId);
        }
      } else if (connection === 'open') {
        console.log(`Subbot ${subbotId} conectado exitosamente`);
        await updateSubbotStatus(subbotId, 'connected');
        await notifyUserConnection(userId, subbotId, true);
      }
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    // Almacenar conexión
    subbotConnections.set(subbotId, {
      sock,
      userId,
      status: 'connecting',
      createdAt: new Date()
    });
    
    return { success: true, subbotId };
    
  } catch (error) {
    console.error('Error creando conexión de subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Crear conexión de subbot con código de 8 dígitos
 */
export async function createSubbotWithCode(userId, code) {
  try {
    // Verificar que el código existe y es válido
    const subbotData = await getSubbotByCode(code);
    if (!subbotData) {
      return { success: false, message: 'Código inválido o expirado' };
    }
    
    if (subbotData.status !== 'pending') {
      return { success: false, message: 'Código ya utilizado' };
    }
    
    // Crear conexión
    const result = await createSubbotConnection(userId, subbotData.id);
    
    if (result.success) {
      // Marcar código como usado
      await updateSubbotStatus(subbotData.id, 'connecting');
      await notifyUserCodeUsed(userId, code);
    }
    
    return result;
    
  } catch (error) {
    console.error('Error creando subbot con código:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener subbot por código
 */
async function getSubbotByCode(code) {
  // Esta función debería consultar la base de datos
  // Por ahora retornamos un objeto mock
  return {
    id: `subbot_${Date.now()}`,
    code: code,
    status: 'pending',
    created_by: 'user123'
  };
}

/**
 * Actualizar QR del subbot en la base de datos
 */
async function updateSubbotQR(subbotId, qr, qrImage) {
  // Aquí deberías actualizar la base de datos
  console.log(`QR actualizado para subbot ${subbotId}`);
}

/**
 * Actualizar estado del subbot
 */
async function updateSubbotStatus(subbotId, status) {
  // Aquí deberías actualizar la base de datos
  console.log(`Estado del subbot ${subbotId} actualizado a: ${status}`);
}

/**
 * Notificar al usuario sobre el QR
 */
async function notifyUserQR(userId, subbotId, qr, qrImage) {
  // Aquí deberías enviar notificación al usuario
  console.log(`QR generado para usuario ${userId}, subbot ${subbotId}`);
}

/**
 * Notificar al usuario sobre la conexión
 */
async function notifyUserConnection(userId, subbotId, connected) {
  // Aquí deberías enviar notificación al usuario
  console.log(`Subbot ${subbotId} ${connected ? 'conectado' : 'desconectado'} para usuario ${userId}`);
}

/**
 * Notificar al usuario sobre el uso del código
 */
async function notifyUserCodeUsed(userId, code) {
  // Aquí deberías enviar notificación al usuario
  console.log(`Código ${code} utilizado por usuario ${userId}`);
}

/**
 * Obtener conexión de subbot
 */
export function getSubbotConnection(subbotId) {
  return subbotConnections.get(subbotId);
}

/**
 * Desconectar subbot
 */
export async function disconnectSubbot(subbotId) {
  const connection = subbotConnections.get(subbotId);
  if (connection) {
    await connection.sock.logout();
    subbotConnections.delete(subbotId);
    return { success: true };
  }
  return { success: false, message: 'Subbot no encontrado' };
}

/**
 * Listar subbots conectados
 */
export function listConnectedSubbots() {
  const connected = [];
  for (const [subbotId, connection] of subbotConnections) {
    connected.push({
      subbotId,
      userId: connection.userId,
      status: connection.status,
      createdAt: connection.createdAt
    });
  }
  return connected;
}








