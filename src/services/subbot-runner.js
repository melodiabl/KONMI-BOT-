// backend/services/subbot-runner.js
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// Importar el conector principal y el manejador de mensajes
import { connectToWhatsApp, handleMessage } from '../../whatsapp.js';
import { isBotGloballyActive, isBotActiveInGroup } from './subbot-manager.js';
import qrcodeTerminal from 'qrcode-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer variables de entorno
const CODE = process.env.SUB_CODE;
const TYPE = process.env.SUB_TYPE || 'qr';
const DIR = process.env.SUB_DIR;
const TARGET = process.env.SUB_TARGET || null;
const DISPLAY = process.env.SUB_DISPLAY || 'KONMI-BOT';
const RAW_METADATA = process.env.SUB_METADATA || '{}';

const vlog = (...a) => {
  const verbose = /^(1|true|yes)$/i.test(process.env.SUBBOT_VERBOSE || '');
  if (verbose) console.log(`[SUBBOT ${CODE}]`, ...a);
};

let SUBBOT_METADATA = {};
try {
  SUBBOT_METADATA = JSON.parse(RAW_METADATA);
} catch (e) {
  vlog('Metadata inválido, usando default.');
}

if (!CODE || !DIR) {
  process.send?.({ event: 'error', data: { message: 'Falta SUB_CODE o SUB_DIR' } });
  process.exit(1);
}

if (!process.send) {
  // No se puede comunicar con el padre, no tiene sentido continuar.
  process.exit(1);
}

// Helper para enviar mensajes al padre de forma segura
function sendToParent(event, data) {
  if (process.send) {
    try {
      process.send({ event, data });
    } catch (error) {
      // Error al enviar, probablemente el canal está cerrado.
    }
  }
}

// Función principal de ejecución del sub-bot
async function start() {
  const authDir = path.join(DIR, 'auth');
  const usePairing = TYPE === 'code';

  try {
    // Pre-cargar el registry de comandos
    try {
      const registryPath = path.resolve(path.dirname(__dirname), 'commands/registry/index.js');
      const registryMod = await import(registryPath);
      if (typeof registryMod.getCommandRegistry === 'function') {
        global.__COMMAND_REGISTRY = {
          registry: registryMod.getCommandRegistry(),
          timestamp: Date.now()
        };
      }
    } catch (e) {
      vlog('No se pudo pre-cargar registry:', e?.message);
    }

    const sock = await connectToWhatsApp(authDir, usePairing, TARGET);
    let lastQR = null;

    // Re-enganchar los listeners de eventos para comunicar con el proceso principal
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Enviar QR cuando se genere (para modo QR)
      if (qr && !usePairing && qr !== lastQR) {
        lastQR = qr;
        try {
          qrcodeTerminal.generate(qr, { small: true });
          const QRCode = await import('qrcode');
          const dataUrl = await QRCode.default.toDataURL(qr);
          sendToParent('qr_ready', { qrCode: qr, qrImage: dataUrl.split(',')[1] });
        } catch (e) {
          sendToParent('error', { message: 'Error generando QR', reason: e.message });
        }
      }

      if (connection === 'open') {
        const botNumber = sock.user?.id?.split(':')[0] || null;
        sendToParent('connected', { 
          jid: sock.user?.id, 
          number: `+${botNumber}`, 
          digits: botNumber, 
          displayName: DISPLAY 
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Desconocido';
        const isLoggedOut = statusCode === 401 || /logged out/i.test(reason || '');

        if (isLoggedOut) {
          sendToParent('logged_out', { reason });
          process.exit(0);
        } else {
          sendToParent('disconnected', { reason, statusCode });
        }
      }
    });

    // Escuchar eventos de pairing code
    if (usePairing) {
      const handlePairingCode = (code) => {
        if (!code) return;
        const payload = {
          pairingCode: code,
          code,
          identificationCode: CODE,
          displayCode: DISPLAY,
          targetNumber: TARGET
        };
        sendToParent('pairing_code', payload);
      };

      sock.ev.on('creds.update', (update) => {
        if (update?.pairingCode) handlePairingCode(update.pairingCode);
      });
      sock.ev.on('pairing_code', handlePairingCode);
      sock.ev.on('pairing_code_ready', (data) => {
        handlePairingCode(data?.code || data?.pairingCode || data);
      });
    }

    // Re-enganchar el manejador de mensajes del bot principal
    sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      for (const m of messages) {
        try {
          const remoteJid = m.key?.remoteJid || '';
          const fromMe = !!m.key?.fromMe;
          const isGroup = remoteJid.endsWith('@g.us');

          const msg = m.message || {};
          const rawText = (
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            ''
          ).trim();

          if (!fromMe) {
            const on = await isBotGloballyActive();
            const isBotGlobalOnCmd = /^\/bot\s+global\s+on\b/i.test(rawText);
            if (!on && !isBotGlobalOnCmd) continue;
          }

          if (isGroup && !await isBotActiveInGroup(CODE, remoteJid) && !fromMe) continue;

          const runtimeContext = {
            isSubbot: true,
            subbotCode: CODE,
            subbotType: TYPE,
            subbotDir: DIR,
            subbotMetadata: SUBBOT_METADATA
          };
          await handleMessage(m, sock, `[SUBBOT ${CODE}]`, runtimeContext);
        } catch (e) {
          vlog('Error procesando mensaje:', e?.message || e);
        }
      }
    });

    sendToParent('initialized', { code: CODE });

  } catch (error) {
    sendToParent('error', { message: error.message });
    process.exit(1);
  }
}

start().catch(err => {
  sendToParent('error', { message: `Error no capturado en start(): ${err.message}` });
  process.exit(1);
});
