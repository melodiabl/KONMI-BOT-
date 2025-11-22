// backend/full/subbot-runner.js
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

let SUBBOT_METADATA = {};
try {
  SUBBOT_METADATA = JSON.parse(RAW_METADATA);
} catch (e) {
  console.log(`[SUBBOT ${CODE}] Metadata inválido, usando default.`);
}

const SUBBOT_VERBOSE = /^(1|true|yes)$/i.test(process.env.SUBBOT_VERBOSE || '');
const vlog = (...a) => { if (SUBBOT_VERBOSE) console.log(`[SUBBOT ${CODE}]`, ...a); };

if (!CODE || !DIR) {
  process.send?.({ event: 'error', data: { message: 'Falta SUB_CODE o SUB_DIR' } });
  process.exit(1);
}

// Función principal de ejecución del sub-bot
async function start() {
  vlog('Iniciando...');
  const authDir = path.join(DIR, 'auth');
  const usePairing = TYPE === 'code';

  try {
    const sock = await connectToWhatsApp(authDir, usePairing, TARGET);

    vlog('Socket conectado, configurando listeners...');

    let lastQR = null;

    // Re-enganchar los listeners de eventos para comunicar con el proceso principal
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      vlog('Evento de conexión:', connection);

      // Enviar QR cuando se genere (para modo QR)
      if (qr && !usePairing && qr !== lastQR) {
        lastQR = qr;
        try {
          console.log(`\n╔═══════════════════════════════════════════════╗`);
          console.log(`║   📱 QR CODE [SUBBOT ${CODE}] 📱              ║`);
          console.log(`╚═══════════════════════════════════════════════╝\n`);
          qrcodeTerminal.generate(qr, { small: true });
          console.log(`\n✅ Código generado correctamente\n`);
          
          vlog('Generando QR...');
          const QRCode = await import('qrcode');
          const dataUrl = await QRCode.default.toDataURL(qr);
          vlog('Enviando qr_ready event');
          process.send?.({ event: 'qr_ready', data: { qrCode: qr, qrImage: dataUrl.split(',')[1] } });
        } catch (e) {
          vlog('Error generando QR:', e.message);
          process.send?.({ event: 'error', data: { message: 'Error generando QR', reason: e.message } });
        }
      }

      if (connection === 'open') {
        const botNumber = sock.user?.id?.split(':')[0] || null;
        vlog('Conectado, botNumber:', botNumber);
        process.send?.({ event: 'connected', data: { jid: sock.user?.id, number: `+${botNumber}`, digits: botNumber, displayName: DISPLAY } });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Desconocido';
        vlog(`Desconectado. Razón: ${reason} (código ${statusCode})`);

        const isLoggedOut = statusCode === 401 || /logged out/i.test(reason || '');
        if (isLoggedOut) {
          process.send?.({ event: 'logged_out', data: { reason } });
          process.exit(0);
        } else {
          process.send?.({ event: 'disconnected', data: { reason, statusCode } });
        }
      }
    });

    // Escuchar evento de pairing code generado - Baileys emite 'pairing_code' o 'pairing_code_ready'
    if (usePairing) {
      sock.ev.on('pairing_code', (pairingCode) => {
        vlog('Evento pairing_code recibido:', pairingCode);
        process.send?.({ 
          event: 'pairing_code', 
          data: { pairingCode, code: pairingCode, displayCode: DISPLAY, targetNumber: TARGET } 
        });
      });
      
      sock.ev.on('pairing_code_ready', (data) => {
        vlog('Evento pairing_code_ready recibido:', data);
        const code = data?.code || data?.pairingCode || data;
        process.send?.({ 
          event: 'pairing_code', 
          data: { pairingCode: code, code, displayCode: DISPLAY, targetNumber: TARGET } 
        });
      });
    }

    // Re-enganchar el manejador de mensajes del bot principal
    sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      for (const m of messages) {
        try {
          const remoteJid = m.key?.remoteJid || '';
          const fromMe = !!m.key?.fromMe;
          const isGroup = remoteJid.endsWith('@g.us');

          if (!await isBotGloballyActive() && !fromMe) continue;
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
          console.error(`[SUBBOT ${CODE}] Error procesando mensaje:`, e?.message || e);
        }
      }
    });

    vlog('Listeners configurados correctamente');

  } catch (error) {
    console.error(`[SUBBOT ${CODE}] Error fatal al iniciar:`, error?.message || error);
    process.send?.({ event: 'error', data: { message: error.message } });
    process.exit(1);
  }
}

start();
