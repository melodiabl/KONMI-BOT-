import baileysMod from 'baileys-mod';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import logger from './config/logger.js';
import subbotManager from './subbot-manager.js';

const {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  Browsers
} = baileysMod;

// Almacenamiento en memoria para las sesiones activas
const activeSessions = new Map();

// Configuración de rutas
const SUBBOTS_BASE_DIR = path.join(process.cwd(), 'storage', 'subbots');
const SESSIONS_DIR = path.join(SUBBOTS_BASE_DIR, 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Inicia una nueva sesión de WhatsApp
 * @param {string} sessionId - ID único para la sesión
 * @param {Object} options - Opciones de configuración
 * @returns {Promise<Object>} - Objeto con la sesión y eventos
 */
async function startSession(sessionId, options = {}) {
  try {
    // Verificar si ya existe una sesión activa
    if (activeSessions.has(sessionId)) {
      logger.warn(`La sesión ${sessionId} ya está activa`);
      return { error: 'Sesión ya activa' };
    }

    // Configuración de la ruta de autenticación
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    const authPath = path.join(sessionDir, 'auth');
    await fs.promises.mkdir(authPath, { recursive: true });
    
    // Estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    // Configuración del socket
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: Browsers.macOS('Desktop'),
      logger: logger.child({ sessionId }),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      shouldSyncHistoryMessage: () => false,
      shouldIgnoreJid: (jid) => false,
      getMessage: async () => ({}),
      ...options.socketConfig
    });

    // Almacenar la sesión
    const sessionData = {
      socket,
      authPath,
      status: 'connecting',
      qr: null,
      phoneNumber: null,
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    activeSessions.set(sessionId, sessionData);

    // Manejador de eventos de conexión
    socket.ev.on('connection.update', (update) => {
      const { connection, qr, isNewLogin, lastDisconnect } = update;
      
      // Actualizar estado de la sesión
      sessionData.status = connection || 'connecting';
      sessionData.lastActivity = new Date();

      // Manejar código QR
      if (qr) {
        sessionData.qr = qr;
        logger.info(`[${sessionId}] Escanea el código QR para autenticar`);
        
        // Generar URL del código QR
        qrcode.toDataURL(qr).then(url => {
          sessionData.qrUrl = url;
          // Emitir evento de código QR
          if (options.onQR) {
            options.onQR({ sessionId, qr, qrUrl: url });
          }
        });
      }

      // Manejar conexión exitosa
      if (connection === 'open') {
        logger.info(`[${sessionId}] Conexión establecida correctamente`);
        sessionData.phoneNumber = socket.user?.id?.replace(/@s\.whatsapp\.net$/, '');
        
        if (options.onConnected) {
          options.onConnected({
            sessionId,
            phoneNumber: sessionData.phoneNumber,
            user: socket.user
          });
        }
      }

      // Manejar desconexión
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        logger.warn(`[${sessionId}] Conexión cerrada. ¿Reconectar? ${shouldReconnect}`);
        
        if (shouldReconnect) {
          // Intentar reconexión después de un retraso
          setTimeout(() => startSession(sessionId, options), 5000);
        } else {
          // Limpiar sesión
          activeSessions.delete(sessionId);
          if (options.onDisconnected) {
            options.onDisconnected({ sessionId, reason: lastDisconnect?.error });
          }
        }
      }
    });

    // Guardar credenciales cuando se actualicen
    socket.ev.on('creds.update', saveCreds);

    return {
      sessionId,
      status: sessionData.status,
      qr: sessionData.qr,
      phoneNumber: sessionData.phoneNumber
    };

  } catch (error) {
    logger.error(`Error al iniciar la sesión ${sessionId}:`, error);
    return { error: error.message };
  }
}

/**
 * Cierra una sesión activa
 * @param {string} sessionId - ID de la sesión a cerrar
 * @param {boolean} logout - Si es true, cierra la sesión en el dispositivo
 */
async function closeSession(sessionId, logout = false) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { error: 'Sesión no encontrada' };
  }

  try {
    if (logout) {
      // Cerrar sesión en el dispositivo
      await session.socket.logout();
    }
    
    // Cerrar la conexión
    await session.socket.end(undefined);
    
    // Eliminar la sesión del mapa
    activeSessions.delete(sessionId);
    
    // Opcional: Eliminar archivos de sesión
    if (logout && session.authPath) {
      const sessionDir = path.dirname(session.authPath);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
    
    return { success: true };
  } catch (error) {
    logger.error(`Error al cerrar la sesión ${sessionId}:`, error);
    return { error: error.message };
  }
}

/**
 * Obtiene el estado de una sesión
 * @param {string} sessionId - ID de la sesión
 */
function getSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { error: 'Sesión no encontrada' };
  }
  
  return {
    sessionId,
    status: session.status,
    phoneNumber: session.phoneNumber,
    qr: session.qr,
    qrUrl: session.qrUrl,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  };
}

/**
 * Obtiene la lista de sesiones activas
 */
function listSessions() {
  return Array.from(activeSessions.entries()).map(([sessionId, session]) => ({
    sessionId,
    status: session.status,
    phoneNumber: session.phoneNumber,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity
  }));
}

/**
 * Genera un código de emparejamiento para un subbot
 * @param {string} phoneNumber - Número de teléfono para vincular
 * @param {string} displayName - Nombre que se mostrará en el dispositivo
 * @returns {Promise<Object>} - Objeto con el código de emparejamiento y datos adicionales
 */
async function generateSubbotPairingCode(phoneNumber, displayName = 'KONMI-BOT') {
  try {
    const cleanNumber = phoneNumber?.replace(/\D/g, '') || '';

    if (!cleanNumber || cleanNumber.length < 10) {
      throw new Error('Número de teléfono inválido. Debe tener al menos 10 dígitos');
    }

    const result = await subbotManager.generatePairingCode(cleanNumber, displayName);

    if (!result?.success) {
      throw new Error(result?.error || 'No se pudo generar el código de emparejamiento');
    }

    return {
      success: true,
      status: result.status || 'waiting_for_pairing',
      sessionId: result.sessionId,
      phoneNumber: result.phoneNumber || cleanNumber,
      displayName: result.displayName || displayName,
      code: result.code,
      displayCode: result.displayCode || result.code,
      expiresAt: result.expiresAt,
      expiresInSec: Math.floor((Date.parse(result.expiresAt) - Date.now()) / 1000),
      message: result.message,
      pairingCode: result.code,
      targetNumber: result.phoneNumber || cleanNumber,
      clientName: result.displayName || displayName,
      authPath: result.authPath
    };
  } catch (error) {
    logger.error('Error en generateSubbotPairingCode:', error);
    return {
      success: false,
      status: 'error',
      error: error.message || 'Error al generar el código de emparejamiento',
      code: 'ERROR',
      displayCode: 'ERROR'
    };
  }
}

/**
 * Genera un código QR para vincular un subbot
 * @param {string} label - Etiqueta para identificar el subbot
 * @returns {Promise<Object>} - Objeto con la URL del QR y datos adicionales
 */
async function generateSubbotQR(label = 'KONMI-BOT') {
  try {
    const result = await subbotManager.generateQRCode(label);

    if (!result?.success) {
      throw new Error(result?.error || 'No se pudo generar el código QR');
    }

    return {
      success: true,
      png: result.qr?.replace(/^data:image\/png;base64,/, '') || result.png,
      sessionId: result.sessionId,
      expiresInSec: Math.floor((Date.parse(result.expiresAt) - Date.now()) / 1000),
      message: result.message,
      qr: result.qr || result.png,
      code: result.code || result.sessionId,
      displayCode: result.displayCode || result.code || result.sessionId,
      targetNumber: result.phoneNumber || null,
      expiresAt: result.expiresAt,
      authPath: result.authPath
    };
  } catch (error) {
    logger.error('Error en generateSubbotQR:', error);
    return {
      success: false,
      error: error.message || 'Error al generar el código QR',
      code: 'ERROR',
      displayCode: 'ERROR'
    };
  }
}

export {
  startSession,
  closeSession,
  getSessionStatus,
  listSessions,
  generateSubbotPairingCode,
  generateSubbotQR
};
