// backend/services/subbot-runner.js - VERSIÓN CORREGIDA
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcodeTerminal from 'qrcode-terminal';

// ✅ CORRECCIÓN 1: Importar connectToWhatsApp pero NO handleMessage
import { connectToWhatsApp } from '../../whatsapp.js';

// ✅ CORRECCIÓN 2: Importar el dispatcher directamente desde handler.js
import { dispatch } from '../../handler.js';

// ✅ CORRECCIÓN 3: Importar utilidades de subbot-manager
import {
  isBotGloballyActive,
  isBotActiveInGroup
} from './subbot-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer variables de entorno del subbot
const CODE = process.env.SUB_CODE;
const TYPE = process.env.SUB_TYPE || 'qr';
const DIR = process.env.SUB_DIR;
const TARGET = process.env.SUB_TARGET || null;
const DISPLAY = process.env.SUB_DISPLAY || 'KONMI-BOT';
const RAW_METADATA = process.env.SUB_METADATA || '{}';

// Logger condicional
const vlog = (...a) => {
  const verbose = /^(1|true|yes)$/i.test(process.env.SUBBOT_VERBOSE || '');
  if (verbose) console.log(`[SUBBOT ${CODE}]`, ...a);
};

// Parsear metadata
let SUBBOT_METADATA = {};
try {
  SUBBOT_METADATA = JSON.parse(RAW_METADATA);
} catch (e) {
  vlog('Metadata inválido, usando default.');
}

// Validaciones básicas
if (!CODE || !DIR) {
  process.send?.({ event: 'error', data: { message: 'Falta SUB_CODE o SUB_DIR' } });
  process.exit(1);
}

if (!process.send) {
  process.exit(1);
}

// ✅ Helper para enviar mensajes al padre de forma segura
function sendToParent(event, data) {
  if (process.send) {
    try {
      process.send({ event, data });
    } catch (error) {
      // Canal cerrado, ignorar
    }
  }
}

// ✅ CORRECCIÓN 4: Extraer texto de mensajes de forma robusta
function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return '';

      // Texto normal
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        ''
      );
      if (base) return String(base).trim();

      // Botones clásicos
      const btnId =
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId;
      if (btnId) return String(btnId).trim();

      // Lista clásica
      const listResp = obj.listResponseMessage;
      if (listResp) {
        const rowId =
          listResp.singleSelectReply?.selectedRowId ||
          listResp.singleSelectReply?.selectedId ||
          listResp.title;
        if (rowId) return String(rowId).trim();
      }

      // Respuesta interactiva
      const intResp = obj.interactiveResponseMessage;
      if (intResp) {
        if (intResp.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson);
            const id = params?.id || params?.command || params?.rowId || params?.row_id;
            if (id && typeof id === 'string') return String(id).trim();
          } catch {}
        }

        if (intResp.listResponseMessage?.singleSelectReply) {
          const rowId = intResp.listResponseMessage.singleSelectReply.selectedRowId;
          if (rowId && typeof rowId === 'string') return String(rowId).trim();
        }

        if (intResp.body?.text) {
          return String(intResp.body.text).trim();
        }
      }

      return '';
    };

    const m = message?.message || {};
    let out = pick(m);
    if (out) return out;

    // Revisar mensajes anidados
    const inner =
      m.viewOnceMessage?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null;

    if (inner) {
      out = pick(inner);
      if (out) return out;

      const inner2 =
        inner.viewOnceMessage?.message ||
        inner.ephemeralMessage?.message ||
        null;

      if (inner2) {
        out = pick(inner2);
        if (out) return out;
      }
    }

    return '';
  } catch (e) {
    console.error('[extractText] error:', e?.message);
    return '';
  }
}

// ✅ CORRECCIÓN 5: Función principal con manejo correcto de mensajes
async function start() {
  const authDir = path.join(DIR, 'auth');
  const usePairing = TYPE === 'code';

  try {
    // ✅ Pre-cargar el registry de comandos ANTES de conectar
    vlog('Pre-cargando registry de comandos...');
    try {
      const registryPath = path.resolve(path.dirname(__dirname), 'commands/registry/index.js');
      const registryMod = await import(registryPath);
      if (typeof registryMod.getCommandRegistry === 'function') {
        global.__COMMAND_REGISTRY = {
          registry: registryMod.getCommandRegistry(),
          timestamp: Date.now()
        };
        vlog('✅ Registry pre-cargado correctamente');
      }
    } catch (e) {
      vlog('⚠️ No se pudo pre-cargar registry:', e?.message);
    }

    // Conectar al WhatsApp
    vlog('Conectando a WhatsApp...');
    const sock = await connectToWhatsApp(authDir, usePairing, TARGET);

    if (!sock) {
      throw new Error('No se pudo crear el socket de WhatsApp');
    }

    vlog('✅ Socket creado correctamente');

    let lastQR = null;

    // ====== EVENTO: connection.update ======
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR para modo QR
      if (qr && !usePairing && qr !== lastQR) {
        lastQR = qr;
        try {
          qrcodeTerminal.generate(qr, { small: true });
          const QRCode = await import('qrcode');
          const dataUrl = await QRCode.default.toDataURL(qr);
          sendToParent('qr_ready', {
            qrCode: qr,
            qrImage: dataUrl.split(',')[1]
          });
        } catch (e) {
          sendToParent('error', {
            message: 'Error generando QR',
            reason: e.message
          });
        }
      }

      // Conectado
      if (connection === 'open') {
        const botNumber = sock.user?.id?.split(':')[0] || null;
        vlog(`✅ Subbot ${CODE} conectado exitosamente`);
        sendToParent('connected', {
          jid: sock.user?.id,
          number: `+${botNumber}`,
          digits: botNumber,
          displayName: DISPLAY
        });
      }

      // Desconectado
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Desconocido';
        const isLoggedOut = statusCode === 401 || /logged out/i.test(reason || '');

        if (isLoggedOut) {
          vlog(`❌ Subbot ${CODE} cerró sesión desde WhatsApp`);
          sendToParent('logged_out', { reason });
          process.exit(0);
        } else {
          vlog(`⚠️ Subbot ${CODE} desconectado: ${reason}`);
          sendToParent('disconnected', { reason, statusCode });
        }
      }
    });

    // ====== EVENTO: Pairing Code (solo para modo code) ======
    if (usePairing) {
      const handlePairingCode = (code) => {
        if (!code) return;
        vlog(`🔐 Código de vinculación generado: ${code}`);
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

    // ====== EVENTO: messages.upsert - MANEJO CORRECTO ======
    sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      for (const m of messages) {
        try {
          const remoteJid = m.key?.remoteJid || '';
          const fromMe = !!m.key?.fromMe;
          const isGroup = remoteJid.endsWith('@g.us');

          // Extraer texto del mensaje
          const text = extractText(m);

          // ✅ Verificar si el bot está globalmente activo
          if (!fromMe) {
            const on = await isBotGloballyActive();
            const isBotGlobalOnCmd = /^\/bot\s+global\s+on\b/i.test(text);

            if (!on && !isBotGlobalOnCmd) {
              vlog(`⏭️ Bot globalmente desactivado, ignorando mensaje`);
              continue;
            }
          }

          // ✅ Verificar si el bot está activo en el grupo específico
          if (isGroup && !fromMe) {
            const isActive = await isBotActiveInGroup(CODE, remoteJid);
            if (!isActive) {
              vlog(`⏭️ Bot desactivado en grupo ${remoteJid}, ignorando`);
              continue;
            }
          }

          // ✅ CORRECCIÓN CRÍTICA: Construir contexto completo
          const ctx = {
            sock,
            message: m,
            key: m.key,
            remoteJid,
            sender: isGroup ? (m.key.participant || remoteJid) : remoteJid,
            participant: m.key.participant || null,
            pushName: m.pushName || null,
            text,
            isGroup,
            fromMe,
            // ✅ Información del subbot
            isSubbot: true,
            subbotCode: CODE,
            subbotType: TYPE,
            subbotDir: DIR,
            subbotMetadata: SUBBOT_METADATA
          };

          // ✅ CORRECCIÓN CRÍTICA: Usar dispatch directamente
          vlog(`📨 Procesando mensaje: ${text.substring(0, 50)}...`);

          try {
            const handled = await dispatch(ctx, {
              isSubbot: true,
              subbotCode: CODE,
              subbotType: TYPE,
              subbotDir: DIR,
              subbotMetadata: SUBBOT_METADATA
            });

            if (handled) {
              vlog(`✅ Mensaje procesado correctamente`);
            } else {
              vlog(`⏭️ Mensaje no manejado (no es comando o no coincide)`);
            }
          } catch (dispatchError) {
            vlog(`❌ Error en dispatch:`, dispatchError?.message);
            sendToParent('error', {
              message: `Error procesando comando: ${dispatchError?.message}`,
              command: text.split(/\s+/)[0]
            });
          }

        } catch (e) {
          vlog('❌ Error procesando mensaje:', e?.message || e);
          sendToParent('error', {
            message: `Error en message handler: ${e?.message}`
          });
        }
      }
    });

    // Notificar que el subbot está listo
    sendToParent('initialized', { code: CODE });
    vlog(`✅ Subbot ${CODE} inicializado correctamente`);

  } catch (error) {
    vlog('❌ Error fatal en start():', error?.message);
    sendToParent('error', {
      message: `Error fatal: ${error.message}`
    });
    process.exit(1);
  }
}

// ====== MANEJO DE SEÑALES ======
process.on('SIGTERM', () => {
  vlog('📴 Recibida señal SIGTERM, cerrando subbot...');
  sendToParent('stopping', { code: CODE });
  process.exit(0);
});

process.on('SIGINT', () => {
  vlog('📴 Recibida señal SIGINT, cerrando subbot...');
  sendToParent('stopping', { code: CODE });
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  vlog('❌ Uncaught Exception:', error?.message);
  sendToParent('error', {
    message: `Uncaught exception: ${error?.message}`
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  vlog('❌ Unhandled Rejection:', reason);
  sendToParent('error', {
    message: `Unhandled rejection: ${reason}`
  });
});

// ====== INICIAR SUBBOT ======
start().catch(err => {
  vlog('❌ Error no capturado en start():', err?.message);
  sendToParent('error', {
    message: `Error no capturado: ${err.message}`
  });
  process.exit(1);
});
