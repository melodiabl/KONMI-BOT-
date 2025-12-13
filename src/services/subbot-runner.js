// src/services/subbot-runner.js - PERSISTENCIA CORREGIDA
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import qrcodeTerminal from 'qrcode-terminal';

import { connectToWhatsApp } from '../../whatsapp.js';
import { dispatch } from '../../handler.js';
import { getGroupRoles } from '../utils/utils/group-helper.js';
import { isBotGloballyActive, isBotActiveInGroup } from './subbot-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  vlog('Invalid metadata, using default.');
}

if (!CODE || !DIR) {
  process.send?.({ event: 'error', data: { message: 'Missing SUB_CODE or SUB_DIR' } });
  process.exit(1);
}

if (!process.send) {
  process.exit(1);
}

function sendToParent(event, data) {
  if (process.send) {
    try {
      process.send({ event, data });
    } catch (error) {}
  }
}

function onlyDigits(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

function normalizeDigitsFromJid(jid) {
  try {
    let s = String(jid || '');
    const at = s.indexOf('@');
    if (at > 0) s = s.slice(0, at);
    const colon = s.indexOf(':');
    if (colon > 0) s = s.slice(0, colon);
    return s.replace(/[^0-9]/g, '');
  } catch {
    return onlyDigits(jid);
  }
}

// ===== EXTRACCIÓN DE TEXTO INTEGRADA =====
function normalizeText(text) {
  try {
    if (text == null) return '';
    let s = String(text);
    s = s.normalize('NFKC');
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    s = s.replace(/\r\n/g, '\n');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim();
  } catch {
    return String(text || '').trim();
  }
}

function extractText(message) {
  try {
    if (!message || typeof message !== 'object') return '';
    const m = message?.message || message;
    if (!m || typeof m !== 'object') return '';

    const extract = (obj) => {
      if (!obj || typeof obj !== 'object') return '';

      const basic = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        obj.documentMessage?.caption ||
        obj.documentWithCaptionMessage?.message?.documentMessage?.caption ||
        obj.audioMessage?.caption ||
        ''
      );
      if (basic) return normalizeText(basic);

      const btn = (
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId ||
        ''
      );
      if (btn) return normalizeText(btn);

      const list = obj.listResponseMessage;
      if (list) {
        const rowId = (
          list.singleSelectReply?.selectedRowId ||
          list.singleSelectReply?.selectedId ||
          list.title ||
          ''
        );
        if (rowId) return normalizeText(rowId);
      }

      const intResp = obj.interactiveResponseMessage;
      if (intResp) {
        if (intResp.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson);
            const id = (
              params?.id ||
              params?.command ||
              params?.rowId ||
              params?.row_id ||
              params?.selectedButtonId ||
              params?.selectedRowId ||
              ''
            );
            if (id && typeof id === 'string') return normalizeText(id);
          } catch {}
        }

        if (intResp.listResponseMessage?.singleSelectReply) {
          const rowId = intResp.listResponseMessage.singleSelectReply.selectedRowId;
          if (rowId && typeof rowId === 'string') return normalizeText(rowId);
        }

        const body = intResp.body?.text || intResp.header?.title || '';
        if (body) return normalizeText(body);
      }

      const intMsg = obj.interactiveMessage;
      if (intMsg) {
        const selectedRowId = (
          intMsg.replyMessage?.selectedRowId ||
          intMsg.selectedRowId ||
          intMsg.nativeFlowResponseMessage?.selectedRowId ||
          ''
        );
        if (selectedRowId && typeof selectedRowId === 'string') {
          return normalizeText(selectedRowId);
        }

        const displayText = (
          intMsg.replyMessage?.selectedDisplayText ||
          intMsg.body?.selectedDisplayText ||
          intMsg.body?.text ||
          intMsg.header?.title ||
          ''
        );
        if (displayText && typeof displayText === 'string') {
          return normalizeText(displayText);
        }

        const nativeFlow = intMsg.nativeFlowMessage;
        if (nativeFlow && Array.isArray(nativeFlow.buttons)) {
          for (const btn of nativeFlow.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson);
                const id = (
                  params?.selectedButtonId ||
                  params?.response?.selectedRowId ||
                  params?.id ||
                  params?.command ||
                  ''
                );
                if (id) return normalizeText(id);
              } catch {}
            }
          }
        }

        const paramsJson = intMsg.nativeFlowResponseMessage?.paramsJson;
        if (paramsJson && typeof paramsJson === 'string') {
          try {
            const params = JSON.parse(paramsJson);
            const id = (
              params?.id ||
              params?.command ||
              params?.rowId ||
              params?.row_id ||
              ''
            );
            if (id) return normalizeText(id);
          } catch {}
        }
      }

      const poll = obj.pollUpdateMessage;
      if (poll) {
        const votes = poll.vote?.selectedOptions || [];
        if (votes.length > 0) return normalizeText(votes[0] || '');
      }

      return '';
    };

    let text = extract(m);
    if (text) return text;

    const nested = (
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null
    );

    if (nested) {
      text = extract(nested);
      if (text) return text;

      const nested2 = (
        nested.viewOnceMessage?.message ||
        nested.viewOnceMessageV2?.message ||
        nested.ephemeralMessage?.message ||
        null
      );

      if (nested2) {
        text = extract(nested2);
        if (text) return text;
      }
    }

    return '';
  } catch (error) {
    return '';
  }
}

function isCommand(text) {
  return /^[\\/!.#?$~]/.test(String(text || '').trim());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== FUNCIÓN PRINCIPAL =====
async function start() {
  const authDir = path.join(DIR, 'auth');
  const usePairing = TYPE === 'code';
  const connectOptions = {
    autoReconnect: true, // ✅ CRÍTICO: Habilitar auto-reconexión
    registerConnectionHandler: false,
    registerMessageHandler: false,
    printQRInTerminal: false,
    mode: 'subbot',
  };

  try {
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

    vlog('Conectando a WhatsApp...');
    let sock = null;
    let lastQR = null;
    let pairingRequested = false;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let connecting = false;
    const processedMessageIds = new Set();
    const gateNotice = new Map();

    const canNotifyGate = (key, ttlMs = 10_000) => {
      try {
        const now = Date.now();
        const last = gateNotice.get(key) || 0;
        if (now - last < ttlMs) return false;
        gateNotice.set(key, now);
        if (gateNotice.size > 5000) gateNotice.clear();
        return true;
      } catch {
        return true;
      }
    };

    const readCredsRegistered = () => {
      try {
        const credsPath = path.join(authDir, 'creds.json');
        if (!fs.existsSync(credsPath)) return false;
        const raw = fs.readFileSync(credsPath, 'utf8');
        const json = JSON.parse(raw);
        return !!json?.registered;
      } catch {
        return false;
      }
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = 0;
    };

    const scheduleReconnect = (reason) => {
      if (reconnectTimer || connecting) return;
      reconnectAttempts = Math.min(reconnectAttempts + 1, 8);
      const backoff = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempts));
      vlog(`🔁 Reintentando conexión en ${backoff}ms... (${reason || 'close'})`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectAndBind(true).catch(() => {});
      }, backoff);
    };

    const requestPairingIfNeeded = async () => {
      if (!usePairing || pairingRequested) return;
      if (!sock) return;

      const targetDigits = onlyDigits(TARGET);
      if (!targetDigits) {
        pairingRequested = true;
        sendToParent('error', { message: 'SUB_TARGET inválido para pairing code' });
        return;
      }

      pairingRequested = true;
      try {
        await sleep(1500);
        if (typeof sock.requestPairingCode !== 'function') {
          throw new Error('Baileys no soporta requestPairingCode()');
        }

        const custom = String(process.env.SUBBOT_CUSTOM_PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || 'KONMIBOT');

        let code = null;
        try {
          code = await sock.requestPairingCode(targetDigits, custom);
        } catch (_) {
          code = await sock.requestPairingCode(targetDigits);
        }

        if (code) {
          const formatted = String(code).toUpperCase().replace(/[-\\s]/g, '');
          const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-');
          sendToParent('pairing_code', {
            pairingCode: grouped,
            code: grouped,
            identificationCode: CODE,
            displayCode: DISPLAY,
            targetNumber: targetDigits,
            customCodeUsed: true
          });
        }
      } catch (e) {
        sendToParent('error', {
          message: 'Error solicitando pairing code',
          reason: e?.message || String(e)
        });
      }
    };

    const bindSocket = (s) => {
      s.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (usePairing && !pairingRequested) {
          if (connection === 'open' || connection === 'connecting') {
            await requestPairingIfNeeded();
          }
        }

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

        if (connection === 'open') {
          clearReconnect();
          const botNumber = normalizeDigitsFromJid(s.user?.id) || null;
          vlog(`✅ Subbot ${CODE} conectado exitosamente`);
          sendToParent('connected', {
            jid: s.user?.id,
            number: botNumber ? `+${botNumber}` : null,
            digits: botNumber,
            displayName: DISPLAY
          });
        }

        if (connection === 'close') {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.code ||
            null;
          const reason = lastDisconnect?.error?.message || 'Desconocido';

          if (statusCode === 428) {
            vlog(`⏳ Esperando vinculación (status 428)`);
            sendToParent('disconnected', { reason: 'waiting_pairing', statusCode });
            return;
          }

          const isLoggedOut =
            statusCode === 401 ||
            statusCode === 403 ||
            /logged out/i.test(reason || '');

          if (isLoggedOut) {
            vlog(`❌ Subbot ${CODE} cerró sesión desde WhatsApp`);
            sendToParent('logged_out', { reason });
            // ✅ CRÍTICO: NO borrar archivos aquí, solo notificar
            process.exit(0);
          } else {
            vlog(`⚠️ Subbot ${CODE} desconectado: ${reason}`);
            sendToParent('disconnected', { reason, statusCode });

            if (usePairing && !readCredsRegistered()) {
              pairingRequested = false;
            }

            lastQR = null;
            // ✅ CRÍTICO: Reconectar automáticamente
            scheduleReconnect(reason);
          }
        }
      });

      s.ev.on('messages.upsert', async ({ messages = [] }) => {
        for (const m of messages) {
          try {
            const id = m?.key?.id;
            if (id) {
              if (processedMessageIds.has(id)) continue;
              processedMessageIds.add(id);
              if (processedMessageIds.size > 2000) processedMessageIds.clear();
            }

            const remoteJid = m.key?.remoteJid || '';
            const fromMe = !!m.key?.fromMe;
            const isGroup = remoteJid.endsWith('@g.us');

            const text = extractText(m);
            const isCommandAttempt = isCommand(text);
            const senderJid = isGroup ? (m.key.participant || remoteJid) : remoteJid;

            if (!fromMe) {
              const on = await isBotGloballyActive();
              const isBotGlobalOnCmd = /^\/bot\s+global\s+on\b/i.test(text);
              if (!on && !isBotGlobalOnCmd) {
                if (!isCommandAttempt) continue;
              }
            }

            if (isGroup && !fromMe) {
              const isActive = await isBotActiveInGroup(CODE, remoteJid);
              if (!isActive) {
                if (isCommandAttempt && canNotifyGate(`${remoteJid}|${senderJid}|group_off`)) {
                  try {
                    await s.sendMessage(remoteJid, {
                      text: 'Subbot desactivado en este grupo.'
                    }, { quoted: m });
                  } catch {}
                }
                continue;
              }
            }

            const senderNumber = normalizeDigitsFromJid(senderJid);
            const envOwner = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '');

            let isAdmin = false;
            let isBotAdmin = false;
            let groupMetadata = null;
            if (isGroup && isCommandAttempt) {
              try {
                const roles = await getGroupRoles(s, remoteJid, senderJid);
                isAdmin = !!roles?.isAdmin;
                isBotAdmin = !!roles?.isBotAdmin;
                groupMetadata = roles?.metadata || null;
              } catch {}
            }

            const ctx = {
              sock: s,
              message: m,
              key: m.key,
              remoteJid,
              sender: senderJid,
              participant: m.key.participant || null,
              pushName: m.pushName || null,
              text,
              isGroup,
              fromMe,
              senderNumber,
              usuarioNumber: senderNumber,
              isOwner: !!(envOwner && senderNumber && senderNumber === envOwner),
              isAdmin,
              isBotAdmin,
              groupMetadata,
              isSubbot: true,
              subbotCode: CODE,
              subbotType: TYPE,
              subbotDir: DIR,
              subbotMetadata: SUBBOT_METADATA
            };

            try {
              await dispatch(ctx, {
                isSubbot: true,
                subbotCode: CODE,
                subbotType: TYPE,
                subbotDir: DIR,
                subbotMetadata: SUBBOT_METADATA
              });
            } catch (dispatchError) {
              sendToParent('error', {
                message: `Error procesando comando: ${dispatchError?.message}`,
                command: text.split(/\s+/)[0]
              });
            }
          } catch (e) {
            sendToParent('error', { message: `Error en message handler: ${e?.message}` });
          }
        }
      });
    };

    const connectAndBind = async (isReconnect = false) => {
      if (connecting) return;
      connecting = true;
      try {
        if (isReconnect) {
          lastQR = null;
        }

        sock = await connectToWhatsApp(authDir, usePairing, TARGET, connectOptions);
        if (!sock) throw new Error('No se pudo crear el socket de WhatsApp');

        vlog(isReconnect ? '✅ Reconectado' : '✅ Socket creado correctamente');
        bindSocket(sock);

        if (usePairing) {
          setTimeout(() => { requestPairingIfNeeded().catch(() => {}); }, 2500);
        }
      } finally {
        connecting = false;
      }
    };

    await connectAndBind(false);

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

start().catch(err => {
  vlog('❌ Error no capturado en start():', err?.message);
  sendToParent('error', {
    message: `Error no capturado: ${err.message}`
  });
  process.exit(1);
});
