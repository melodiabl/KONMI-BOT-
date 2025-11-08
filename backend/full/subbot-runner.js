// Cargar .env del backend si no viene heredado
import 'dotenv/config'

// Cargar Baileys desde el shim para soportar múltiples forks
// (baileys loader inline abajo)
let makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers;
async function loadBaileysLocal(){
  const candidates=[];
  const normalizeSpecifier=(raw)=>{
    try{
      if(!raw) return null; const s=String(raw).trim(); const l=s.toLowerCase();
      if(l==='bail'||l.includes('nstar-y/bail')||l.includes('github:nstar-y/bail')||l==='baileys-mod') return 'baileys-mod';
      if(l.includes('whiskeysockets')||l==='@whiskeysockets/baileys'||l==='baileys') return '@whiskeysockets/baileys';
      if(l.includes('elaina')||l.includes('rexxhayanasi')) return '@rexxhayanasi/elaina-bail';
      return s;
    }catch{ return raw }
  }
  try{
    if(process?.env?.BAILEYS_MODULE){
      const norm=normalizeSpecifier(process.env.BAILEYS_MODULE);
      if(norm) candidates.push(norm);
      if(!norm||norm!==process.env.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE);
    }
  }catch{}
  // Solo el módulo definido por .env; si no hay, usar oficial como fallback
  if(candidates.length===0){
    candidates.push('@whiskeysockets/baileys')
  }
  let lastErr=null
  for(const name of candidates){
    try{ const mod=await import(name); const M=(mod&&Object.keys(mod).length?mod:(mod?.default||mod)); const pick=(k)=> (M?.[k]??mod?.default?.[k]??mod?.[k]);
      makeWASocket = pick('makeWASocket') ?? pick('default');
      useMultiFileAuthState = pick('useMultiFileAuthState');
      fetchLatestBaileysVersion = pick('fetchLatestBaileysVersion');
      Browsers = pick('Browsers');
      return true; } catch(e){ lastErr=e }
  }
  console.log('No se pudo cargar Baileys para subbot-runner:', lastErr?.message||lastErr)
  return false
}
await loadBaileysLocal();
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { handleMessage as handleMainMessage } from './whatsapp.js';
import { isBotGloballyActive, isBotActiveInGroup } from './subbot-manager.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const CODE = process.env.SUB_CODE;
const TYPE = process.env.SUB_TYPE || 'qr';
const DIR = process.env.SUB_DIR;
const RAW_TARGET = process.env.SUB_TARGET || '';
const TARGET = RAW_TARGET
  ? (RAW_TARGET.startsWith('+') ? RAW_TARGET : `+${RAW_TARGET.replace(/[^0-9]/g, '')}`)
  : '';
const DISPLAY = process.env.SUB_DISPLAY || 'KONMI-BOT';

const RAW_METADATA = process.env.SUB_METADATA || '';
let SUBBOT_METADATA = {};
try {
  SUBBOT_METADATA = RAW_METADATA ? JSON.parse(RAW_METADATA) : {};
} catch (error) {
  console.log('No se pudo parsear SUB_METADATA para el subbot:', error?.message || error);
  SUBBOT_METADATA = {};
}

const RAW_CUSTOM_PAIRING = (process.env.PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || '').toString().trim();
const PAIRING_ONLY_CUSTOM = String(process.env.PAIRING_ONLY_CUSTOM || process.env.ONLY_CUSTOM_PAIRING || 'false').toLowerCase() === 'true';
const SANITIZED_CUSTOM_PAIRING = RAW_CUSTOM_PAIRING.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

if (!CODE || !DIR) {
  process.send?.({ event: 'error', data: { message: 'Missing SUB_CODE or SUB_DIR' } });
  process.exit(1);
}

if (RAW_CUSTOM_PAIRING && SANITIZED_CUSTOM_PAIRING.length !== 8) {
  console.log('PAIRING_CODE definido pero no cumple el formato alfanumérico de 8 caracteres, se ignorará.');
}

const MAX_RETRIES = parseInt(process.env.SUBBOT_MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS = parseInt(process.env.SUBBOT_RETRY_DELAY_MS || '3000', 10);
const ATTEMPT_TIMEOUT_MS = parseInt(process.env.SUBBOT_ATTEMPT_TIMEOUT_MS || '180000', 10);
const SUBBOT_BROWSER = (process.env.SUBBOT_BROWSER || process.env.BOT_BROWSER || 'ubuntu').toLowerCase();
const SUBBOT_VERBOSE = /^(1|true|yes)$/i.test(process.env.SUBBOT_VERBOSE || process.env.LOG_VERBOSE || process.env.LOG_CONSOLE_TRACE || '')
const vlog = (...a)=>{ if (SUBBOT_VERBOSE) try { console.log(...a) } catch {} }

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(statusCode) {
  if (statusCode === undefined || statusCode === null) return true;
  const retryable = new Set([401, 408, 415, 428, 440, 499, 500, 503, 515]);
  return retryable.has(statusCode);
}

function resolveBrowserPreset() {
  try {
    if (SUBBOT_BROWSER === 'windows') return Browsers.windows('WhatsApp Web');
    if (SUBBOT_BROWSER === 'macos') return Browsers.macOS('WhatsApp Web');
    if (SUBBOT_BROWSER === 'chrome') return Browsers.chrome('Chrome');
    return Browsers.ubuntu('Chrome');
  } catch (error) {
    console.log('No se pudo aplicar navegador personalizado, usando default Baileys', error?.message);
    return undefined;
  }
}

async function runAttempt({ attempt, maxAttempts, authDir, cleanupAuth, customPairingCode }) {
  vlog(`  Intento ${attempt}/${maxAttempts || '∞'}`);

  if (cleanupAuth) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch (_) {}
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const alreadyRegistered = !!state?.creds?.registered;

  if (TYPE === 'code') {
    try {
      if (alreadyRegistered) {
        state.creds.usePairingCode = false;
        console.log('Credenciales existentes detectadas, usando sesión almacenada sin solicitar pairing.');
      } else {
        state.creds.usePairingCode = true;
        state.creds.registered = false;
        state.creds.me = undefined;
        state.creds.account = undefined;
        state.creds.device = undefined;
        console.log('Preparando credenciales para nuevo pairing code.');
      }
    } catch (error) {
      console.log('No se pudo preparar credenciales para pairing:', error);
    }
  }

  vlog('Auth state preparado');

  const runtimeContext = {
    mode: 'subbot',
    subbotCode: CODE,
    storageDir: DIR,
    authDir,
    metadata: SUBBOT_METADATA,
    displayName: SUBBOT_METADATA?.uiLabel || DISPLAY
  };

  const { version, isLatest } = await fetchLatestBaileysVersion();
  vlog('Baileys version:', { version, isLatest });

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: resolveBrowserPreset()
  });
  vlog('Socket creado');

  sock.ev.on('creds.update', saveCreds);

  const readBotIdentity = () => {
    const rawJid =
      sock?.user?.id ||
      sock?.user?.jid ||
      state?.creds?.me?.id ||
      state?.creds?.me?.jid ||
      null;
    const normalizedJid = typeof rawJid === 'string' ? rawJid : null;
    const digits = normalizedJid ? normalizedJid.replace(/[^0-9]/g, '') : '';
    return {
      jid: normalizedJid,
      number: digits ? `+${digits}` : null,
      digits: digits || null
    };
  };

  const targetDigits = TARGET.replace(/[^0-9]/g, '');
  let customPairingForRequest = customPairingCode && customPairingCode.length === 8 ? customPairingCode : '';
  if (TYPE === 'code' && customPairingCode && customPairingCode.length !== 8) {
    console.log('Código de pairing personalizado definido pero sin 8 caracteres válidos, usando código generado por Baileys');
  }

  const waitForAuthKeysReady = async (maxMs = 8000) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      try {
        const creds = sock?.authState?.creds;
        if (
          creds?.noiseKey?.public &&
          creds?.signedIdentityKey?.public &&
          creds?.signedPreKey?.keyPair?.public
        ) {
          return true;
        }
      } catch (_) {}
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    }
    return false;
  };

  let pairingDelivered = false;
  let awaitingConnection = false;
  let pairingRequestInFlight = false;
  let connectedReported = false;
  let resolved = false;
  let registeredSession = false;

  function attachSubbotMessageHandler(sock) {
    if (!sock || sock.__subbotHandlersAttached) return;
    sock.__subbotHandlersAttached = true;

    sock.ev.on('messages.upsert', async (upsert) => {
      try {
        const { messages } = upsert || {};
        if (!Array.isArray(messages)) return;
        for (const message of messages) {
          try {
            // Política configurable para mensajes propios (fromMe)
            // Modos: all | commands | none (default: commands)
            if (message.key.fromMe) {
              const txt = (
                message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                ''
              ).trim();
              const isCommand = txt.startsWith('/') || txt.startsWith('!') || txt.startsWith('.');
              const mode = String(
                process.env.SUBBOT_FROMME_MODE ||
                process.env.FROMME_MODE ||
                process.env.ALLOW_FROM_ME ||
                'commands'
              ).toLowerCase();
              const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && isCommand);
              if (!allow) continue; // ignorar según política
            }

            if (!await isBotGloballyActive()) {
              continue;
            }

            const remoteJid = message.key?.remoteJid || '';
            // Debug robusto de texto/keys
            try {
              const unwrap = (msg) => {
                try {
                  let x = msg?.message || {};
                  let guard = 0;
                  while (guard++ < 6) {
                    if (x?.ephemeralMessage?.message) { x = x.ephemeralMessage.message; continue }
                    if (x?.viewOnceMessage?.message) { x = x.viewOnceMessage.message; continue }
                    if (x?.viewOnceMessageV2?.message) { x = x.viewOnceMessageV2.message; continue }
                    if (x?.viewOnceMessageV2Extension?.message) { x = x.viewOnceMessageV2Extension.message; continue }
                    if (x?.message && typeof x.message === 'object') { x = x.message; continue }
                    break;
                  }
                  return x || {};
                } catch { return (msg?.message || {}) }
              };
              const mm = unwrap(message);
              const text = (
                mm?.extendedTextMessage?.text ||
                mm?.conversation ||
                mm?.imageMessage?.caption ||
                mm?.videoMessage?.caption ||
                ''
              ).trim();
              const isCmd = !!text && (/^[\/!.]/.test(text));
              if (String(process.env.LOG_CONSOLE_TRACE||'').toLowerCase()==='true' && (!text || text === '[Mensaje sin texto]')) {
                const keys = Object.keys(mm || {});
            if (SUBBOT_VERBOSE) console.log(`[subbot ${CODE}] upsert`, { remoteJid, isGroup: remoteJid.endsWith('@g.us'), isCmd, keys: keys.join(', ') || '(sin claves)' });
              }
            } catch (_) {}
            if (remoteJid.endsWith('@g.us')) {
              const activeInGroup = await isBotActiveInGroup(CODE, remoteJid);
              if (!activeInGroup) {
                continue;
              }
            }

            await handleMainMessage(message, sock, `[SUBBOT ${CODE}] `, runtimeContext);
          } catch (handlerError) {
            console.error('Error manejando mensaje en subbot:', handlerError?.message || handlerError);
            try { await sock.sendMessage(remoteJid, { text: `⚠️ Error interno del subbot: ${handlerError?.message || handlerError}` }, { quoted: message }) } catch (_) {}
          }
        }
      } catch (error) {
        console.error('Error en messages.upsert del subbot:', error?.message || error);
      }
    });
  }

  return await new Promise((resolve) => {
    let timeoutTimer;

    const cleanup = ({ fatal = false, reason } = {}) => {
      if (resolved) return;
      resolved = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      sock.ev.off('connection.update', onUpdate);
      try { sock.ws?.close?.(); } catch (_) {}
      if (!registeredSession && reason && !fatal) {
        process.send?.({ event: 'status', data: { status: 'pending', reason } });
      }
    };

    const emitError = (message, reason) => {
      process.send?.({ event: 'error', data: { message, reason } });
    };

    const emitDisconnected = (reason, statusCode) => {
      process.send?.({ event: 'disconnected', data: { reason, statusCode } });
    };

    const emitPairingCode = (code) => {
      if (pairingDelivered) return;
      pairingDelivered = true;
      awaitingConnection = true;
      pairingRequestInFlight = false;
      process.send?.({
        event: 'pairing_code',
        data: {
          code,
          displayCode: DISPLAY,
          targetNumber: targetDigits,
          customCodeUsed: !!customPairingForRequest
        }
      });
    };

    const requestPairing = async () => {
      if (alreadyRegistered) {
        console.log('Sesión previamente registrada; omitiendo solicitud de pairing.');
        return;
      }
      if (pairingDelivered || pairingRequestInFlight) return;
      pairingRequestInFlight = true;
      const maxAttempts = 3;
      let lastError = null;
      // Detectar método disponible en el fork (@vkazee/baileys u otros)
      const availableMethod = ['requestPairingCode','requestPhonePairingCode','requestPairCode','generatePairingCode']
        .find((m)=> typeof sock?.[m] === 'function')

      for (let attempt = 1; attempt <= maxAttempts && !pairingDelivered && sock?.requestPairingCode; attempt++) {
        try {
          const useCustom = customPairingForRequest && customPairingForRequest.length === 8;
          if (useCustom) {
            console.log(`Solicitando pairing code personalizado (${customPairingForRequest}) intento ${attempt}/${maxAttempts}`);
            try {
              const keysReady = await waitForAuthKeysReady(6000);
              console.log(`  keysReady(custom)=${keysReady}`);
              if (!availableMethod) throw new Error('No pairing method available')
              const accepts = /requestPairingCode|requestPhonePairingCode|requestPairCode/.test(availableMethod)
              const code = accepts
                ? await sock[availableMethod](targetDigits, customPairingForRequest)
                : await sock[availableMethod](targetDigits)
              console.log('Pairing code personalizado recibido:', code);
              emitPairingCode(code);
              pairingRequestInFlight = false;
              return;
            } catch (customError) {
              lastError = customError;
              const statusCode = customError?.output?.statusCode || customError?.data?.statusCode;
              console.error('requestPairingCode (custom) falló:', customError);
              if (!shouldRetry(statusCode) || PAIRING_ONLY_CUSTOM) {
                pairingRequestInFlight = false;
                emitError(customError?.message || 'Error solicitando pairing code', statusCode);
                cleanup({ fatal: true, reason: customError?.message });
                resolve({ status: 'fatal', statusCode, reason: customError?.message });
                return;
              }
              if (!PAIRING_ONLY_CUSTOM) {
                console.log('Custom code falló, intentando con código generado automáticamente...');
              }
            }
          }

          if ((!customPairingForRequest || customPairingForRequest.length !== 8) && !PAIRING_ONLY_CUSTOM) {
            console.log(`Solicitando pairing code a Baileys intento ${attempt}/${maxAttempts}`);
            const keysReady = await waitForAuthKeysReady(6000);
            console.log(`  keysReady(auto)=${keysReady}`);
            if (!availableMethod) throw new Error('No pairing method available')
            const accepts = /requestPairingCode|requestPhonePairingCode|requestPairCode/.test(availableMethod)
            const code = accepts
              ? await sock[availableMethod](targetDigits)
              : await sock[availableMethod](targetDigits)
            console.log('Pairing code recibido:', code);
            emitPairingCode(code);
            pairingRequestInFlight = false;
            return;
          }
          if (PAIRING_ONLY_CUSTOM && (!customPairingForRequest || customPairingForRequest.length !== 8)) {
            pairingRequestInFlight = false;
            const msg = 'PAIRING_ONLY_CUSTOM activo pero no hay PAIRING_CODE/CUSTOM_PAIRING_CODE válido (8 caracteres)';
            emitError(msg, 'no_custom_code');
            cleanup({ fatal: true, reason: msg });
            resolve({ status: 'fatal', reason: msg });
            return;
          }
        } catch (error) {
          lastError = error;
          console.error('requestPairingCode falló:', error);
          if (attempt < maxAttempts) {
            const statusCode = error?.output?.statusCode || error?.data?.statusCode;
            if (!shouldRetry(statusCode)) {
              pairingRequestInFlight = false;
              emitError(error?.message || 'Error solicitando pairing code', statusCode);
              cleanup({ fatal: true, reason: error?.message });
              resolve({ status: 'fatal', statusCode, reason: error?.message });
              return;
            }
            await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(1500, RETRY_DELAY_MS)));
          }
        }
      }

      pairingRequestInFlight = false;
      if (!pairingDelivered) {
        const statusCode = lastError?.output?.statusCode || lastError?.data?.statusCode;
        if (lastError && !shouldRetry(statusCode)) {
          emitError(lastError?.message || 'Error solicitando pairing code', statusCode);
          cleanup({ fatal: true, reason: lastError?.message });
          resolve({ status: 'fatal', statusCode, reason: lastError?.message });
        } else {
          console.log('No se pudo obtener pairing code tras múltiples intentos, reintentando...');
          setTimeout(requestPairing, Math.max(3000, RETRY_DELAY_MS));
        }
      }
    };

    const onUpdate = (update = {}) => {
      const { connection, qr, pairingCode, lastDisconnect } = update;
      console.log('Connection update:', {
        connection,
        hasQR: !!qr,
        hasTarget: !!TARGET,
        hasPairingCode: !!pairingCode
      });

      if (pairingCode && TYPE === 'code' && !alreadyRegistered) {
        console.log('Pairing code entregado por evento:', pairingCode);
        emitPairingCode(pairingCode);
        return;
      }

      if (TYPE === 'qr' && qr && !pairingDelivered) {
        import('qrcode').then((QR) => {
          QR.default
            .toDataURL(qr, {
              errorCorrectionLevel: 'H',
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            })
            .then((png) => {
              const base64 = png.split(',')[1];
              process.send?.({ event: 'qr_ready', data: { qrImage: base64, qrCode: qr } });
            })
            .catch((err) => emitError(err.message, 'qr_generation'));
        });
      }

      if (TYPE === 'code' && qr && TARGET && !pairingDelivered && !alreadyRegistered) {
        console.log('QR recibido; solicitando pairing code en 1s...');
        setTimeout(() => {
          requestPairing().catch((error) => console.error('Error solicitando pairing tras QR:', error));
        }, 1000);
      }

      if (connection === 'open') {
        if (!connectedReported) {
          connectedReported = true;
          const identity = readBotIdentity();
          process.send?.({
            event: 'connected',
            data: {
              jid: identity.jid,
              number: identity.number,
              digits: identity.digits,
              displayName: SUBBOT_METADATA?.uiLabel || DISPLAY
            }
          });
        }

        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }

        registeredSession = true;
        awaitingConnection = false;
        attachSubbotMessageHandler(sock);
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reasonMessage = lastDisconnect?.error?.output?.payload?.message || lastDisconnect?.error?.message;
        const messageLC = String(reasonMessage || '').toLowerCase();
        const isLoggedOut = messageLC.includes('logged out') || messageLC.includes('logged off') || messageLC.includes('device removed') || statusCode === 401;
        vlog('Conexión cerrada con código:', statusCode, reasonMessage || 'sin mensaje');

        if (pairingDelivered && awaitingConnection && shouldRetry(statusCode)) {
          vlog('Conexión cerrada antes de completar la vinculación. Reintentando con un nuevo socket...');
          awaitingConnection = false;
          pairingDelivered = false;
          pairingRequestInFlight = false;
          cleanup({ fatal: false, reason: reasonMessage || statusCode });
          resolve({ status: 'retry', statusCode, reason: reasonMessage });
          return;
        }

        cleanup({ fatal: isLoggedOut, reason: reasonMessage || statusCode });

        if (isLoggedOut) {
          process.send?.({
            event: 'logged_out',
            data: { statusCode, message: reasonMessage || 'Sesión cerrada desde WhatsApp' }
          });
          resolve({ status: 'fatal', statusCode, reason: reasonMessage || 'logged out' });
          return;
        }

        emitDisconnected(reasonMessage || 'connection closed', statusCode);

        if (shouldRetry(statusCode)) {
          resolve({ status: 'retry', statusCode, reason: reasonMessage });
        } else {
          emitError(reasonMessage || 'Conexión cerrada por WhatsApp', statusCode);
          resolve({ status: 'fatal', statusCode, reason: reasonMessage });
        }
      }
    };

    sock.ev.on('connection.update', onUpdate);

    // Para pairing code esperamos al evento QR

    timeoutTimer = setTimeout(() => {
      if (resolved) return;
      console.log('Tiempo de intento agotado sin éxito');
      cleanup({ fatal: false, reason: 'timeout' });
      resolve({ status: 'retry', reason: 'timeout' });
    }, ATTEMPT_TIMEOUT_MS);
  });
}

async function start() {
  try {
    vlog('Iniciando subbot runner...');
    vlog('CODE:', CODE);
    vlog('TYPE:', TYPE);
    vlog('DIR:', DIR);
    vlog('TARGET:', TARGET || 'N/A');

    if (TYPE === 'code' && !TARGET) {
      process.send?.({ event: 'error', data: { message: 'No se proporcionó número objetivo para pairing.' } });
      process.exit(1);
    }

    const authDir = path.join(DIR, 'auth');
    vlog('Auth dir:', authDir);

    const infiniteRetries = Number.isNaN(MAX_RETRIES) || MAX_RETRIES <= 0;
    let attempt = 1;
    let customPairingCodeForAttempt = SANITIZED_CUSTOM_PAIRING.length === 8 ? SANITIZED_CUSTOM_PAIRING : '';

    const CLEAN_AUTH_ON_START = /^(1|true|yes)$/i.test(process.env.SUBBOT_CLEAN_AUTH_ON_START || '');
    while (infiniteRetries || attempt <= MAX_RETRIES) {
      const result = await runAttempt({
        attempt,
        maxAttempts: infiniteRetries ? '' : MAX_RETRIES,
        authDir,
        // No borres credenciales por defecto: solo si está habilitado explícitamente
        cleanupAuth: attempt === 1 && CLEAN_AUTH_ON_START,
        customPairingCode: customPairingCodeForAttempt
      });

      if (result.status === 'success') {
        vlog('Subbot finalizado con éxito.');
        setTimeout(() => process.exit(0), 1500);
        return;
      }

      if (result.status === 'fatal') {
        vlog('Fallo fatal en intento:', result.statusCode, result.reason);
        process.send?.({
          event: 'error',
          data: {
            message: result.reason || 'No se pudo completar la conexión con WhatsApp',
            statusCode: result.statusCode
          }
        });
        process.exit(1);
      }

      if (customPairingCodeForAttempt) {
      vlog('Desactivando código de pairing personalizado para próximos intentos.');
        customPairingCodeForAttempt = '';
      }

      vlog('Reintentando en', RETRY_DELAY_MS, 'ms');
      await delay(RETRY_DELAY_MS);
      attempt += 1;
    }

    process.send?.({
      event: 'error',
      data: { message: 'No se pudo completar la conexión tras múltiples intentos.' }
    });
    process.exit(1);
  } catch (error) {
    console.error('Error en start():', error);
    process.send?.({ event: 'error', data: { message: error.message } });
    process.exit(1);
  }
}

start().catch((error) => {
  console.error('Error en start():', error);
  process.send?.({ event: 'error', data: { message: error.message } });
  process.exit(1);
});




