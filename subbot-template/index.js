import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import chalk from 'chalk';

const subbotId = process.env.SUBBOT_ID;
const subbotDir = process.env.SUBBOT_DIR;
const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
const eventToken = process.env.SUBBOT_EVENT_TOKEN;

console.log(chalk.cyan(`🤖 Iniciando Sub-bot: ${subbotId}`));

// Configuración del sub-bot
const config = {
  logger: pino({ level: 'silent' }),
  printQRInTerminal: true,
  browser: ['Konmi Sub-bot', 'Desktop', '1.0.0'],
  markOnlineOnConnect: false,
  generateHighQualityLinkPreview: true,
  syncFullHistory: false
};

// Función para generar QR
async function generateQR(qr) {
  try {
    const qrPath = path.join(subbotDir, 'qr.png');
    await QRCode.toFile(qrPath, qr, {
      width: 512,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    console.log(chalk.green(`📱 QR generado: ${qrPath}`));
    
    // Notificar al servidor principal que el QR está listo
    await notifyServer('qr_ready', { 
      qrPath,
      qrData: qr 
    });
  } catch (error) {
    console.error('Error generando QR:', error);
  }
}

// Función para notificar al servidor principal
async function notifyServer(event, data = {}) {
  try {
    const axios = (await import('axios')).default;
    await axios.post(`${serverUrl}/api/subbot/event`, {
      subbotId,
      event,
      data,
      timestamp: new Date().toISOString()
    }, {
      headers: eventToken ? { 'X-Subbot-Token': eventToken } : {}
    });
  } catch (error) {
    console.error('Error notificando servidor:', error);
  }
}

// Función principal del sub-bot
async function startSubbot() {
  try {
    // Crear directorio de auth si no existe
    const authDir = path.join(subbotDir, 'auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // Configurar estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    // Crear socket de WhatsApp
    const sock = makeWASocket({
      ...config,
      version,
      auth: state
    });

    // Eventos del socket
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, pairingCode } = update;

      if (qr) {
        console.log(chalk.yellow('📱 Generando QR...'));
        await generateQR(qr);
        await notifyServer('qr_generated', { qr });
      }

      // Detectar pairing code de 8 dígitos
      if (pairingCode) {
        console.log(chalk.yellow(`🔑 Pairing code recibido: ${pairingCode}`));
        await notifyServer('pairing_code', { code: pairingCode });
      }

      if (connection === 'open') {
        console.log(chalk.green(`✅ Sub-bot ${subbotId} conectado a WhatsApp`));
        console.log(chalk.cyan(`👤 Usuario: ${sock.user?.name || 'Desconocido'}`));
        await notifyServer('connected', { 
          user: sock.user,
          jid: sock.user?.id 
        });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log(chalk.red(`❌ Sub-bot ${subbotId} desconectado`));
        await notifyServer('disconnected', { 
          reason: lastDisconnect?.error?.message,
          shouldReconnect 
        });

        if (shouldReconnect) {
          console.log(chalk.yellow('🔄 Reconectando...'));
          setTimeout(() => startSubbot(), 5000);
        }
      }
    });

    // Manejar mensajes
    sock.ev.on('messages.upsert', async (m) => {
      const message = m.messages[0];
      if (!message.message) return;

      const messageText = message.message.conversation || 
                         message.message.extendedTextMessage?.text || '';

      // Comandos del sub-bot delegados al servidor principal
      if (messageText.startsWith('/')) {
        try {
          const axios = (await import('axios')).default;
          const res = await axios.post(
            `${serverUrl}/api/subbot/execute`,
            {
              subbotId,
              command: messageText,
              from: message.key.remoteJid,
              group: message.key.remoteJid.endsWith('@g.us')
            },
            { headers: eventToken ? { 'X-Subbot-Token': eventToken } : {} }
          );

          if (res.data?.message) {
            await sock.sendMessage(
              message.key.remoteJid,
              { text: res.data.message },
              { quoted: message }
            );
          }
        } catch (error) {
          console.error('Error ejecutando comando en servidor:', error);
          await sock.sendMessage(
            message.key.remoteJid,
            { text: '❌ Error ejecutando comando' },
            { quoted: message }
          );
        }

        return;
      }

      // Notificar mensaje al servidor principal
      await notifyServer('message_received', {
        from: message.key.remoteJid,
        message: messageText,
        timestamp: new Date().toISOString()
      });
    });

    // Manejar errores
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      notifyServer('error', { error: error.message });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection:', reason);
      notifyServer('error', { error: reason.toString() });
    });

    console.log(chalk.cyan(`🚀 Sub-bot ${subbotId} iniciado correctamente`));

  } catch (error) {
    console.error('Error iniciando sub-bot:', error);
    await notifyServer('error', { error: error.message });
    process.exit(1);
  }
}

// Iniciar el sub-bot
startSubbot();