import path from 'path';
import fs from 'fs';
import qrcode from 'qrcode';
import baileysMod from 'baileys-mod';
import logger from './config/logger.js';

const { makeWASocket, DisconnectReason, useMultiFileAuthState } = baileysMod;

// Constantes
const SUBS_DIR = path.join(process.cwd(), 'storage', 'subbots');
const SESSION_TTL = 10 * 60 * 1000; // 10 minutos

/**
 * Clase principal para el manejo de subbots
 */
class SubbotManager {
  constructor() {
    this.activeSessions = new Map();
    this.ensureDirectories();
  }

  /**
   * Asegura que existan los directorios necesarios
   */
  ensureDirectories() {
    const requiredDirs = [
      SUBS_DIR,
      path.join(SUBS_DIR, 'sessions'),
      path.join(SUBS_DIR, 'auth'),
      path.join(SUBS_DIR, 'media')
    ];

    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Genera un código de emparejamiento para un subbot
   * @param {string} phoneNumber - Número de teléfono para vincular
   * @param {string} displayName - Nombre que se mostrará en el dispositivo
   * @returns {Promise<Object>} - Objeto con el código de emparejamiento y datos adicionales
   */
  async generatePairingCode(phoneNumber, displayName = 'KONMI-BOT') {
    const sessionId = `subbot_${Date.now()}`;
    const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
    const authPath = path.join(sessionPath, 'auth');

    try {
      const cleanNumber = String(phoneNumber || '').replace(/\D/g, '');
      if (!cleanNumber || cleanNumber.length < 7) {
        throw new Error('Número de teléfono inválido. Debe incluir al menos 7 dígitos');
      }

      // Crear directorios necesarios
      await fs.promises.mkdir(authPath, { recursive: true });
      
      // Configuración de la sesión
      const sessionData = {
        sessionId,
        phoneNumber: cleanNumber,
        displayName,
        type: 'pairing',
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL).toISOString(),
        authPath
      };

      // Inicializar autenticación con Baileys
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      // Preparar credenciales para modo pairing
      state.creds.me = undefined;
      state.creds.account = undefined;
      state.creds.registered = false;
      state.creds.usePairingCode = true;
      try {
        await saveCreds();
      } catch (e) {
        logger.warn('No se pudieron guardar credenciales iniciales de pairing', { error: e?.message });
      }
      
      // Configuración del socket para el emparejamiento usando Baileys real
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ['KONMI-BOT', 'Chrome', '1.0.0'],
        logger: logger.child({ sessionId })
      });

      const waitForAuthKeysReady = async (maxMs = 8000) => {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
          try {
            const creds = sock?.authState?.creds ?? sock?.authState?.state?.creds;
            if (
              creds?.noiseKey?.public &&
              creds?.signedIdentityKey?.public &&
              creds?.signedPreKey?.keyPair?.public
            ) {
              return true;
            }
          } catch (_) {}
          await new Promise(res => setTimeout(res, 200));
        }
        return false;
      };

      // Variable para almacenar el código de emparejamiento
      let pairingCode = null;
      let pairingError = null;
      let pairingRequested = false;
      let pairingAttempts = 0;
      let qrReceived = false;
      const startTime = Date.now();

      const requestPairingCode = async (reason = 'unknown') => {
        if (pairingRequested && pairingAttempts > 0) return;
        if (!qrReceived && reason !== 'connection-open') {
          logger.debug('Aún no se recibió QR, se pospone requestPairingCode', { sessionId, reason });
          return;
        }
        if (pairingAttempts >= 3) {
          pairingError = new Error('No se pudo obtener pairing code tras múltiples intentos');
          return;
        }

        pairingRequested = true;
        pairingAttempts += 1;

        if (sock?.authState?.creds) {
          sock.authState.creds.usePairingCode = true;
        }

        const customEnv = (process.env.PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || '').toString();
        const customCandidate = customEnv.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
        const useCustom = customCandidate.length === 8;
        const maxAttempts = 3;

        logger.debug('Solicitando pairing code', {
          sessionId,
          reason,
          target: cleanNumber,
          useCustom,
          customCandidate
        });

        try {
          const keysReady = await waitForAuthKeysReady(10000);
          logger.debug('Estado de claves antes de pairing', { sessionId, keysReady });
          await new Promise(res => setTimeout(res, 500));

          let code = null;
          for (let attempt = 1; attempt <= maxAttempts && !code; attempt += 1) {
            try {
              if (useCustom && attempt === 1) {
                logger.debug('Intentando pairing code personalizado', {
                  sessionId,
                  target: cleanNumber,
                  customCandidate,
                  attempt
                });
                code = await sock.requestPairingCode(cleanNumber, customCandidate);
              } else {
                logger.debug('Solicitando pairing code estándar', {
                  sessionId,
                  target: cleanNumber,
                  attempt
                });
                code = await sock.requestPairingCode(cleanNumber);
              }
            } catch (innerError) {
              logger.error('Error solicitando pairing code (intento)', {
                sessionId,
                attempt,
                message: innerError?.message
              });
              if (attempt === maxAttempts) {
                throw innerError;
              }
              await new Promise(res => setTimeout(res, 1000));
            }
          }

          pairingCode = code;
          sessionData.code = code;
          sessionData.status = 'code_generated';
          sessionData.requestedAt = new Date().toISOString();
          await this.saveSession(sessionId, sessionData);
        } catch (error) {
          pairingError = error;
          pairingRequested = false;
          logger.error('Error solicitando pairing code', { sessionId, message: error?.message, stack: error?.stack });
        }
      };
      
      // Escuchar actualizaciones de conexión
      sock.ev.on('connection.update', async (update) => {
        logger.debug('Actualización de conexión:', update);
        
        // Manejar códigos de emparejamiento
        if (update.pairingCode) {
          pairingCode = update.pairingCode;
          sessionData.code = pairingCode;
          sessionData.status = 'code_generated';
          await this.saveSession(sessionId, sessionData);
        }
        
        // Manejar cambios de estado de conexión
        if (update.connection) {
          if (update.connection === 'open') {
            sessionData.status = 'connected';
            sessionData.phoneNumber = sock.user?.id?.split('@')[0];
            await this.saveSession(sessionId, sessionData);
          } else if (update.connection === 'close') {
            sessionData.status = 'disconnected';
            await this.saveSession(sessionId, sessionData);
            pairingError = update.lastDisconnect?.error || new Error('Conexión cerrada antes de obtener pairing code');
          }
        }

        if (update.qr) {
          qrReceived = true;
          pairingRequested = false;
          pairingError = null;
          await requestPairingCode('qr-generated');
        }

        if (update.connection === 'open') {
          pairingRequested = false;
          await requestPairingCode('connection-open');
        }
      });

      // Manejar actualizaciones de credenciales
      sock.ev.on('creds.update', saveCreds);
      
      // Esperar a que se genere el código o se produzca un error
      try {
        await new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (pairingCode) {
              clearInterval(checkInterval);
              resolve();
            } else if (pairingError) {
              clearInterval(checkInterval);
              reject(pairingError);
            } else if (Date.now() - startTime > 30000) {
              clearInterval(checkInterval);
              reject(new Error('Tiempo de espera agotado al generar el código de emparejamiento'));
            }
          }, 300);
        });
      } catch (error) {
        throw error;
      }

      if (!pairingCode) {
        throw new Error('No se pudo generar el código de emparejamiento');
      }

      // Actualizar datos de sesión
      sessionData.status = 'waiting_for_pairing';
      await this.saveSession(sessionId, sessionData);

      return {
        success: true,
        sessionId,
        phoneNumber: cleanNumber,
        displayName,
        code: pairingCode,
        displayCode: this.formatPairingCode(pairingCode),
        expiresAt: sessionData.expiresAt,
        expiresIn: SESSION_TTL / 1000,
        message: 'Código de emparejamiento generado correctamente',
        type: 'pairing',
        status: 'waiting_for_pairing',
        authPath: sessionData.authPath
      };
      
    } catch (error) {
      logger.error('Error en generatePairingCode:', { message: error?.message, stack: error?.stack });
      return {
        success: false,
        error: error.message || 'Error al generar el código de emparejamiento',
        code: 'ERROR',
        displayCode: 'ERROR',
        details: error.stack
      };
    }
  }

  /**
   * Genera un código QR para vincular un subbot
   * @param {string} label - Etiqueta para identificar el subbot
   * @returns {Promise<Object>} - Objeto con la URL del QR y datos adicionales
   */
  async generateQRCode(label = 'KONMI-BOT') {
    const sessionId = `subbot_qr_${Date.now()}`;
    const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
    const authPath = path.join(sessionPath, 'auth');
    
    try {
      // Crear directorios necesarios
      await fs.promises.mkdir(authPath, { recursive: true });
      
      // Configuración de la sesión
      const sessionData = {
        sessionId,
        label,
        type: 'qr',
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL).toISOString(),
        authPath
      };

      // Inicializar autenticación con Baileys
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      
      // Configurar socket para el escaneo de QR
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['KONMI-BOT', 'Chrome', '1.0.0'],
        logger: logger.child({ sessionId })
      });

      // Variable para almacenar el código QR
      let qrCode = null;
      
      // Manejar actualizaciones de conexión
      sock.ev.on('connection.update', async (update) => {
        // Generar código QR
        if (update.qr) {
          qrCode = await qrcode.toDataURL(update.qr);
          sessionData.qr = qrCode;
          sessionData.status = 'waiting_for_scan';
          await this.saveSession(sessionId, sessionData);
        }
        
        // Manejar conexión exitosa
        if (update.connection === 'open') {
          sessionData.status = 'connected';
          sessionData.phoneNumber = sock.user?.id?.split('@')[0];
          await this.saveSession(sessionId, sessionData);
        }
      });

      // Guardar credenciales cuando cambien
      sock.ev.on('creds.update', saveCreds);

      // Esperar a que se genere el código QR
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!qrCode) {
        throw new Error('No se pudo generar el código QR');
      }

      return {
        success: true,
        sessionId,
        qr: qrCode,
        expiresAt: sessionData.expiresAt,
        expiresIn: SESSION_TTL / 1000,
        message: 'Código QR generado correctamente',
        type: 'qr',
        status: 'waiting_for_scan'
      };
      
    } catch (error) {
      logger.error('Error al generar código QR:', error);
      return {
        success: false,
        error: error.message || 'Error al generar el código QR',
        qr: null
      };
    }
  }

  /**
   * Guarda los datos de una sesión
   * @param {string} sessionId - ID de la sesión
   * @param {Object} data - Datos de la sesión
   */
  async saveSession(sessionId, data) {
    const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
    await fs.promises.mkdir(sessionPath, { recursive: true });
    
    const sessionData = {
      ...data,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.promises.writeFile(
      path.join(sessionPath, 'session.json'),
      JSON.stringify(sessionData, null, 2)
    );
    
    this.activeSessions.set(sessionId, sessionData);
    return sessionData;
  }

  /**
   * Obtiene los datos de una sesión
   * @param {string} sessionId - ID de la sesión
   */
  async getSession(sessionId) {
    // Primero verificar en memoria
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }
    
    // Si no está en memoria, cargar desde disco
    const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId, 'session.json');
    if (fs.existsSync(sessionPath)) {
      const data = JSON.parse(await fs.promises.readFile(sessionPath, 'utf-8'));
      this.activeSessions.set(sessionId, data);
      return data;
    }
    
    return null;
  }

  /**
   * Formatea un código de emparejamiento para mostrarlo al usuario
   * @param {string} code - Código de emparejamiento
   */
  formatPairingCode(code) {
    if (!code) return 'N/A';
    // Formato: XXX-XXX-XXX
    return code.replace(/(\d{3})(?=\d)/g, '$1-');
  }

  /**
   * Verifica si una sesión ha expirado
   * @param {Object} session - Datos de la sesión
   */
  isSessionExpired(session) {
    if (!session?.expiresAt) return true;
    return new Date(session.expiresAt) < new Date();
  }

  /**
   * Limpia las sesiones expiradas
   */
  async cleanupExpiredSessions() {
    const sessionsDir = path.join(SUBS_DIR, 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    
    const sessionDirs = await fs.promises.readdir(sessionsDir);
    
    for (const dir of sessionDirs) {
      const sessionPath = path.join(sessionsDir, dir);
      const sessionFile = path.join(sessionPath, 'session.json');
      
      if (fs.existsSync(sessionFile)) {
        try {
          const sessionData = JSON.parse(await fs.promises.readFile(sessionFile, 'utf-8'));
          
          if (this.isSessionExpired(sessionData)) {
            // Eliminar sesión expirada
            await fs.promises.rm(sessionPath, { recursive: true, force: true });
            this.activeSessions.delete(dir);
          }
        } catch (error) {
          logger.error(`Error al limpiar sesión ${dir}:`, error);
        }
      }
    }
  }
}

// Exportar una instancia única del administrador de subbots
const subbotManager = new SubbotManager();

export default subbotManager;
