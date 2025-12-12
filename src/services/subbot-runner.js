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

console.log(`[SUBBOT-RUNNER] 🎬 INICIANDO subbot-runner.js`);
console.log(`[SUBBOT-RUNNER] 📋 CODE: ${CODE}`);
console.log(`[SUBBOT-RUNNER] 📋 TYPE: ${TYPE}`);
console.log(`[SUBBOT-RUNNER] 📋 DIR: ${DIR}`);
console.log(`[SUBBOT-RUNNER] 📋 TARGET: ${TARGET}`);
console.log(`[SUBBOT-RUNNER] 📋 PID: ${process.pid}`);
console.log(`[SUBBOT-RUNNER] 📋 PPID: ${process.ppid}`);
console.log(`[SUBBOT-RUNNER] 📋 process.send disponible: ${!!process.send}`);

let SUBBOT_METADATA = {};
try {
  SUBBOT_METADATA = JSON.parse(RAW_METADATA);
} catch (e) {
  console.log(`[SUBBOT ${CODE}] Metadata inválido, usando default.`);
}

const SUBBOT_VERBOSE = /^(1|true|yes)$/i.test(process.env.SUBBOT_VERBOSE || '');
const vlog = (...a) => { if (SUBBOT_VERBOSE) console.log(`[SUBBOT ${CODE}]`, ...a); };

if (!CODE || !DIR) {
  console.error(`[SUBBOT-RUNNER] ❌ Falta SUB_CODE o SUB_DIR`);
  process.send?.({ event: 'error', data: { message: 'Falta SUB_CODE o SUB_DIR' } });
  process.exit(1);
}

if (!process.send) {
  console.error(`[SUBBOT-RUNNER] ❌ CRÍTICO: process.send no está disponible - no es un child process`);
  process.exit(1);
}

// 🔧 Helper para enviar mensajes al padre con log
function sendToParent(event, data) {
  const payload = { event, data };
  const dataStr = JSON.stringify(data || {});
  const preview = dataStr.length > 200 ? dataStr.substring(0, 200) + '...' : dataStr;
  
  console.log(`[SUBBOT-RUNNER ${CODE}] 📤 Intentando enviar al padre:`, event);
  console.log(`[SUBBOT-RUNNER ${CODE}] 📦 Data:`, preview);
  
  if (process.send) {
    try {
      const sent = process.send(payload);
      console.log(`[SUBBOT-RUNNER ${CODE}] ✅ process.send() retornó:`, sent);
    } catch (error) {
      console.error(`[SUBBOT-RUNNER ${CODE}] ❌ Error en process.send():`, error.message);
      console.error(`[SUBBOT-RUNNER ${CODE}] 📚 Stack:`, error.stack);
    }
  } else {
    console.error(`[SUBBOT-RUNNER ${CODE}] ❌ process.send no está disponible en este momento`);
  }
}

// Función principal de ejecución del sub-bot
async function start() {
  console.log(`[SUBBOT-RUNNER ${CODE}] 🚀 Iniciando función start()...`);
  
  const authDir = path.join(DIR, 'auth');
  const usePairing = TYPE === 'code';
  
  console.log(`[SUBBOT-RUNNER ${CODE}] 📁 authDir: ${authDir}`);
  console.log(`[SUBBOT-RUNNER ${CODE}] 🔐 usePairing: ${usePairing}`);

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
        console.log(`[SUBBOT-RUNNER ${CODE}] ✅ Registry de comandos cargado`);
      }
    } catch (e) {
      console.warn(`[SUBBOT-RUNNER ${CODE}] ⚠️ No se pudo pre-cargar registry:`, e?.message);
    }

    console.log(`[SUBBOT-RUNNER ${CODE}] 📞 Llamando a connectToWhatsApp...`);
    const sock = await connectToWhatsApp(authDir, usePairing, TARGET);
    console.log(`[SUBBOT-RUNNER ${CODE}] ✅ connectToWhatsApp completado`);

    console.log(`[SUBBOT-RUNNER ${CODE}] 🎧 Configurando listeners de eventos...`);

    let lastQR = null;

    // Re-enganchar los listeners de eventos para comunicar con el proceso principal
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`[SUBBOT-RUNNER ${CODE}] 🔄 connection.update:`, connection);

      // Enviar QR cuando se genere (para modo QR)
      if (qr && !usePairing && qr !== lastQR) {
        lastQR = qr;
        console.log(`[SUBBOT-RUNNER ${CODE}] 📱 QR generado`);
        try {
          console.log(`\n╔═══════════════════════════════════════════════════╗`);
          console.log(`║   📱 QR CODE [SUBBOT ${CODE}] 📱              ║`);
          console.log(`╚═══════════════════════════════════════════════════╝\n`);
          qrcodeTerminal.generate(qr, { small: true });
          console.log(`\n✅ Código generado correctamente\n`);

          const QRCode = await import('qrcode');
          const dataUrl = await QRCode.default.toDataURL(qr);
          sendToParent('qr_ready', { qrCode: qr, qrImage: dataUrl.split(',')[1] });
        } catch (e) {
          console.error(`[SUBBOT-RUNNER ${CODE}] ❌ Error generando QR:`, e.message);
          sendToParent('error', { message: 'Error generando QR', reason: e.message });
        }
      }

      if (connection === 'open') {
        const botNumber = sock.user?.id?.split(':')[0] || null;
        console.log(`[SUBBOT-RUNNER ${CODE}] ✅ Conectado, botNumber:`, botNumber);
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
        console.log(`[SUBBOT-RUNNER ${CODE}] ❌ Desconectado. Razón: ${reason} (código ${statusCode})`);

        const isLoggedOut = statusCode === 401 || /logged out/i.test(reason || '');
        if (isLoggedOut) {
          sendToParent('logged_out', { reason });
          process.exit(0);
        } else {
          sendToParent('disconnected', { reason, statusCode });
        }
      }
    });

    // 🔧 CRÍTICO: Escuchar eventos de pairing code
    if (usePairing) {
      console.log(`[SUBBOT-RUNNER ${CODE}] 🎧 Registrando listeners para pairing_code...`);
      
      // Listener principal que funciona con la mayoría de versiones de Baileys
      sock.ev.on('creds.update', (update) => {
        console.log(`[SUBBOT-RUNNER ${CODE}] 🔐 creds.update recibido:`, Object.keys(update || {}));
        
        // Verificar si hay código de pairing en la actualización
        if (update?.pairingCode) {
          console.log(`[SUBBOT-RUNNER ${CODE}] 🎯 pairingCode encontrado en creds.update:`, update.pairingCode);
          
          const payload = {
            pairingCode: update.pairingCode,
            code: update.pairingCode,
            identificationCode: CODE,
            displayCode: DISPLAY,
            targetNumber: TARGET
          };
          
          sendToParent('pairing_code', payload);
        }
      });
      
      // Listener alternativo 1
      sock.ev.on('pairing_code', (pairingCode) => {
        console.log(`[SUBBOT-RUNNER ${CODE}] 🔐 Evento pairing_code directo recibido:`, pairingCode);
        
        const payload = {
          pairingCode,
          code: pairingCode,
          identificationCode: CODE,
          displayCode: DISPLAY,
          targetNumber: TARGET
        };
        
        sendToParent('pairing_code', payload);
      });

      // Listener alternativo 2
      sock.ev.on('pairing_code_ready', (data) => {
        console.log(`[SUBBOT-RUNNER ${CODE}] 🔐 Evento pairing_code_ready recibido:`, data);
        
        const code = data?.code || data?.pairingCode || data;
        const payload = {
          pairingCode: code,
          code,
          identificationCode: CODE,
          displayCode: DISPLAY,
          targetNumber: TARGET
        };
        
        sendToParent('pairing_code', payload);
      });
      
      console.log(`[SUBBOT-RUNNER ${CODE}] ✅ Listeners de pairing_code registrados`);
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
          console.error(`[SUBBOT ${CODE}] Error procesando mensaje:`, e?.message || e);
        }
      }
    });

    console.log(`[SUBBOT-RUNNER ${CODE}] ✅ Todos los listeners configurados correctamente`);
    console.log(`[SUBBOT-RUNNER ${CODE}] 🎉 Subbot completamente inicializado y listo`);

  } catch (error) {
    console.error(`[SUBBOT-RUNNER ${CODE}] 💥 Error fatal al iniciar:`, error?.message || error);
    console.error(`[SUBBOT-RUNNER ${CODE}] 📚 Stack:`, error?.stack);
    sendToParent('error', { message: error.message });
    process.exit(1);
  }
}

console.log(`[SUBBOT-RUNNER] 🏁 Llamando a start()...`);
start().catch(err => {
  console.error(`[SUBBOT-RUNNER] 💥 Error no capturado en start():`, err);
  process.exit(1);
});
