// whatsapp.js – Restaurado "original": sin tocar/backup de creds, QR + Pairing Code funcional
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import QRCode from 'qrcode'
import qrTerminal from 'qrcode-terminal'
import { fileURLToPath } from 'url'
import logger from './config/logger.js'
import { setPrimaryOwner } from './global-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ===== Utils mínimas ===== */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
const sanitizePhoneNumberInput = (v) => {
  const digits = onlyDigits(v)
  return digits || null
}
// Normaliza un código custom; por defecto acepta alfanumérico (como subbot-runner)
const normCustom = (v, enforceNumeric = false) => {
  if (!v) return null
  let t = String(v).trim().toUpperCase()
  if (enforceNumeric) {
    // Sólo dígitos; si no cumple 8, se invalida
    t = t.replace(/[^0-9]/g, '')
    return t.length === 8 ? t : null
  }
  // Alfanumérico; si no cumple 8, se invalida
  t = t.replace(/[^A-Z0-9]/g, '')
  return t.length === 8 ? t : null
}
const pickCustomFromEnv = () => {
  const raw = process.env.PAIRING_CODE
    || process.env.PAIR_CUSTOM_CODE
    || process.env.CUSTOM_PAIRING_CODE
  const enforce = String(process.env.PAIR_ENFORCE_NUMERIC || 'false').toLowerCase() === 'true'
  return normCustom(raw, enforce)
}

/**
 * Dynamically loads the Baileys library.
 * This function will try to load the library from a list of possible package names.
 * This is useful when the user has installed a different fork of the library.
 *
 * @returns {Promise<Object>} A promise that resolves to the Baileys API.
 */
let __loaded = null
async function loadBaileys() {
  if (__loaded) return __loaded;

  const picks = ['@whiskeysockets/baileys', 'baileys', '@itsukichan/baileys'];
  if (process?.env?.BAILEYS_MODULE && !['@whiskeysockets/baileys', 'baileys', '@itsukichan/baileys'].includes(process.env.BAILEYS_MODULE)) {
    picks.unshift(process.env.BAILEYS_MODULE);
  }

  let lastErr = null;
  for (const name of picks) {
    try {
      const mod = await import(name);
      const M = mod?.default || mod;
      const api = {
        makeWASocket: M?.makeWASocket || mod?.makeWASocket,
        useMultiFileAuthState: M?.useMultiFileAuthState || mod?.useMultiFileAuthState,
        fetchLatestBaileysVersion: M?.fetchLatestBaileysVersion || mod?.fetchLatestBaileysVersion,
        Browsers: M?.Browsers || mod?.Browsers,
        DisconnectReason: M?.DisconnectReason || mod?.DisconnectReason,
        jidDecode: M?.jidDecode || mod?.jidDecode,
        loadedName: name,
      };
      if (!api.makeWASocket || !api.useMultiFileAuthState) {
        throw new Error(`The package "${name}" does not expose the expected API.`);
      }
      console.log(`✅ Baileys loaded: ${name}`);
      __loaded = api;
      return api;
    } catch (e) {
      lastErr = e;
      console.warn(`⚠️ Could not load ${name}: ${e?.message || e}`);
    }
  }

  throw lastErr || new Error('Could not load any compatible Baileys package. Please make sure you have installed "@itsukichan/baileys" or a compatible fork.');
}

async function resolveWaVersion(fetchLatestBaileysVersion) {
  // Permite fijar versión por .env si querés forzar
  const raw = (process.env.WA_WEB_VERSION || '').trim()
  if (raw) {
    const parts = raw.split(/[.,\s]+/).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)).slice(0, 3)
    if (parts.length === 3) {
      console.log(`ℹ️ Using WA version from env: ${parts.join('.')}`);
      return parts;
    }
  }
  // Forzar la obtención de la última versión si no se especificó
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`ℹ️ Fetched WA version: ${version.join('.')}, isLatest: ${isLatest}`);
    if (Array.isArray(version) && version.length === 3) return version
  } catch (e) {
    console.warn(`⚠️ Could not fetch latest WA version: ${e?.message || e}. Using fallback.`);
  }
  // Fallback seguro si fetch falla
  const fallbackVersion = [2, 3000, 1027934701]
  console.log(`ℹ️ Using fallback WA version: ${fallbackVersion.join('.')}`);
  return fallbackVersion
}

/* ===== Estado básico ===== */
let sock = null
let jidDecode; // Declarar a nivel de módulo
const groupSubjectCache = new Map()
let connectionStatus = 'disconnected'
let qrCode = null
let qrCodeImage = null
let currentPairingCode = null
let currentPairingNumber = null
let currentPairingGeneratedAt = null
let currentPairingExpiresAt = null
let pairingTargetNumber = null
let savedAuthPath = null
let authMethod = 'qr'
let pairingCodeRequestedForSession = false
let reconnecting = false

// Control commands set for bypassing gating
const controlSet = new Set([
  '/activate', '/activar', '/on', '/enable',
  '/deactivate', '/desactivar', '/off', '/disable',
  '/start', '/stop'
])

/**
 * The path to the message router module.
 * This module is responsible for handling incoming messages and dispatching them to the correct command handlers.
 *
 * @type {string}
 */
let routerPath = './commands/router.js';
export function setMessageRouterModulePath(p) {
  routerPath = String(p || routerPath);
}
const processedMessageIds = new Set()

/* ===== Getters ===== */
export const getSocket = () => sock
export const getQRCode = () => qrCode
export const getQRCodeImage = () => qrCodeImage
export const getPairingTargetNumber = () => (pairingTargetNumber ? `+${pairingTargetNumber}` : null)
export const getCurrentPairingCode = () => currentPairingCode
export function getCurrentPairingInfo() {
  if (!currentPairingCode) return null
  return {
    code: currentPairingCode,
    generatedAt: currentPairingGeneratedAt?.toISOString() || null,
    expiresAt: currentPairingExpiresAt?.toISOString() || null,
    phoneNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
  }
}
export function getConnectionStatus() {
  return {
    status: connectionStatus,
    timestamp: new Date().toISOString(),
    uptime: connectionStatus === 'connected' ? process.uptime() : 0,
  }
}

// Lista de grupos disponibles (para panel)
export async function getAvailableGroups() {
  try {
    if (!sock) return []
    const groups = await sock.groupFetchAllParticipating()
    return Object.values(groups).map(g => ({
      id: g.id,
      name: g.subject,
      participants: g.participants?.length || 0,
    }))
  } catch {
    return []
  }
}

// Configura el método de autenticación del bot principal
// method: 'qr' | 'pairing' | 'pair'
// Si es 'pairing', requiere phoneNumber con solo dígitos (incluye código de país)
export function setAuthMethod(method = 'qr', { phoneNumber } = {}) {
  const raw = String(method || 'qr').toLowerCase()
  const normalizedMethod = raw === 'pair' ? 'pairing' : raw
  const allowed = ['qr', 'pairing']

  if (!allowed.includes(normalizedMethod)) {
    const err = new Error('Metodo de autenticacion invalido. Usa "qr" o "pairing".')
    // Compatibilidad con api.js y panel
    err.code = 'INVALID_AUTH_METHOD'
    throw err
  }

  if (normalizedMethod === 'pairing') {
    const normalized = onlyDigits(phoneNumber || pairingTargetNumber)
    if (!normalized) {
      const err = new Error('Numero de telefono invalido. Usa solo digitos con codigo de pais, ejemplo: 595974154768.')
      err.code = 'INVALID_PAIRING_NUMBER'
      throw err
    }
    pairingTargetNumber = normalized
  } else {
    pairingTargetNumber = null
  }

  authMethod = normalizedMethod
  // Devuelve el numero normalizado (solo digitos) para que la API lo formatee
  return pairingTargetNumber
}

/* ===== Teardown simple (sin tocar archivos de sesión) ===== */
async function teardownSocket() {
  try {
    if (!sock) return
    try { sock.ev?.removeAllListeners?.() } catch {}
    try { sock.ws?.close?.() } catch {}
    try { sock.end?.() } catch {}
  } finally {
    sock = null
  }
}

// Envío robusto local con reintento sin quoted
async function safeSend(sock, jid, payload, opts = {}) {
  try {
    await sock.sendMessage(jid, payload, opts)
    return true
  } catch (e1) {
    try {
      const retry = { ...(opts || {}) }
      if (retry.quoted) delete retry.quoted
      await sock.sendMessage(jid, payload, retry)
      return true
    } catch (e2) {
      try { console.warn('[safeSend] failed twice:', e2?.message || e2) } catch {}
      return false
    }
  }
}

/* ===== QR helpers ===== */
async function saveQrArtifacts(qr, outDir) {
  try {
    fs.mkdirSync(outDir, { recursive: true })
    const dataURL = await QRCode.toDataURL(qr)
    qrCodeImage = dataURL
    fs.writeFileSync(path.join(outDir, 'qr.txt'), qr)
    fs.writeFileSync(path.join(outDir, 'qr.dataurl.txt'), dataURL)
  } catch {
    try {
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'qr.txt'), qr)
    } catch {}
  }
}

/* ===== Conexión principal (estilo original) ===== */
export async function connectToWhatsApp(
  authPath = (process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full')),
  usePairingCode = false,
  phoneNumber = null
) {
  const baileysAPI = await loadBaileys();
  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } = baileysAPI;
  jidDecode = baileysAPI.jidDecode; // Asignar al scope del módulo

  savedAuthPath = path.resolve(authPath)
  // Limpieza opcional como en subbot-runner
  try {
    const clean = String(process.env.PAIRING_CLEAN_AUTH_ON_START || '').match(/^(1|true|yes)$/i)
    const isPairing = usePairingCode || !!pickCustomFromEnv()
    if (isPairing && clean && fs.existsSync(savedAuthPath)) {
      fs.rmSync(savedAuthPath, { recursive: true, force: true })
    }
  } catch {}
  fs.mkdirSync(savedAuthPath, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(savedAuthPath)
  // Detectar si ya existe sesión registrada; si es así, ignorar solicitud de pairing y usar la sesión
  let doPairing = !!usePairingCode
  try {
    const already = !!state?.creds?.registered
    if (already) {
      if (doPairing) console.log('ℹ️ Sesión existente detectada. Usando credenciales guardadas; no se solicitará Pairing Code.')
      doPairing = false
      // Asegurar flags correctos para sesión ya registrada
      try { state.creds.usePairingCode = false; await saveCreds() } catch {}
    } else if (doPairing) {
      // Preparar credenciales para pairing, como en subbot-runner
      state.creds.usePairingCode = true
      state.creds.registered = false
      state.creds.me = undefined
      state.creds.account = undefined
      state.creds.device = undefined
      await saveCreds()
    }
  } catch {}
  const waVersion = await resolveWaVersion(fetchLatestBaileysVersion)

  const browser = Browsers.macOS('Chrome');
  console.log(`ℹ️ Using browser string: ${browser.join(' ')}`);

  // Determinar si queremos pairing en este ciclo
  const envPairDigits = sanitizePhoneNumberInput(process.env.PAIR_NUMBER);
  let runtimeNumber = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || envPairDigits);
  const isRegistered = !!state?.creds?.registered;

  // Modo pairing solo si se solicita explícitamente (API/panel/subbot)
  let wantPair = !!doPairing || authMethod === 'pairing';

  // Si ya hay sesión registrada, nunca forzar pairing de nuevo
  if (wantPair && isRegistered) {
    wantPair = false;
  }

  // Sin número válido, degradar a QR
  if (wantPair && !runtimeNumber) {
    wantPair = false;
  }

  pairingTargetNumber = wantPair ? runtimeNumber : null;
  authMethod = wantPair ? 'pairing' : 'qr';

  connectionStatus = 'connecting';
  reconnecting = false;
  await teardownSocket();
  await sleep(80);

  const logLevel = process.env.BOT_LOG_LEVEL || (wantPair ? 'debug' : 'silent');
  const QUIET = String(process.env.QUIET_LOGS || process.env.BOT_QUIET || 'false').toLowerCase() === 'true';
  const infoLog = (...a) => { if (!QUIET) try { console.log(...a) } catch {} };

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: logLevel }),
    // README QR: printQRInTerminal: true
    // README Pairing: printQRInTerminal: false
    printQRInTerminal: !wantPair,
    browser,
    version: waVersion,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
    emitOwnEvents: true,
    // compat forks
    emitOwnMessages: true,
    mobile: false,
    getMessage: async () => null,
  })

  // Guardado de sesión VAINILLA (sin backup/patch de creds)
  sock.ev.on('creds.update', saveCreds)

  // ==== CONNECTION.UPDATE "original", con correcciones de estabilidad ====
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update || {};

    // If we have a QR code, register it and save it.
    if (qr && !wantPair) {
      qrCode = qr;
      await saveQrArtifacts(qr, path.join(savedAuthPath, 'qr'));
      infoLog('🟩 QR code ready — Scan with your WhatsApp (also saved in /qr/)');
      try {
        qrTerminal.generate(qr, { small: true });
      } catch (e) {
        infoLog('⚠️ Could not print QR to terminal:', e?.message);
      }
    }

    // Request pairing code when connection opens for the first time (isNewLogin)
    if (connection === 'open' && wantPair && !pairingCodeRequestedForSession && isNewLogin) {
      pairingCodeRequestedForSession = true;
      
      // Small delay to ensure connection is fully stable
      await sleep(500);
      
      try {
        const number = onlyDigits(pairingTargetNumber);
        if (!number) {
          infoLog('❌ Número inválido para vinculación. Asegúrate de que esté en formato internacional.');
          pairingCodeRequestedForSession = false;
          return;
        }

        if (typeof sock.requestPairingCode !== 'function') {
          infoLog('⚠️ La versión de Baileys instalada no es compatible con el código de emparejamiento. Usa QR o actualiza a @whiskeysockets/baileys.');
          pairingCodeRequestedForSession = false;
          return;
        }

        infoLog(`📲 Solicitando código de vinculación para +${number}...`);
        
        const code = await sock.requestPairingCode(number);
        
        if (code) {
          const formatted = String(code).toUpperCase().replace(/[-\s]/g, '');
          const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-');
          
          currentPairingCode = grouped;
          currentPairingNumber = number;
          currentPairingGeneratedAt = new Date();
          currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

          if (!QUIET) {
            console.log('\n╔═══════════════════════════════════════╗');
            console.log('║     ✅ CÓDIGO DE VINCULACIÓN GENERADO ✅   ║');
            console.log('╠═══════════════════════════════════════╣');
            console.log(`║  📞 Número: +${number.padEnd(32)}║`);
            console.log(`║  🔑 Código: ${grouped.padEnd(32)}║`);
            console.log(`║  ⏰ Válido por 10 minutos                 ║`);
            console.log('╠═══════════════════════════════════════╣');
            console.log('║  📱 En tu teléfono:                      ║');
            console.log('║  1. WhatsApp > Dispositivos vinculados    ║');
            console.log('║  2. Vincular con número de teléfono       ║');
            console.log('║  3. Ingresa el código de arriba           ║');
            console.log('╚═══════════════════════════════════════╝\n');
          } else {
            infoLog(`✅ Código de vinculación: ${grouped}`);
          }
        } else {
          infoLog('⚠️ No se pudo generar el código. Revisa la conexión y el número de teléfono, e intenta de nuevo.');
          pairingCodeRequestedForSession = false;
        }
      } catch (e) {
        infoLog(`❌ Error durante la solicitud de vinculación: ${e?.message || e}`);
        console.error(e);
        pairingCodeRequestedForSession = false;
      }
    }

    // If the connection is open, we're connected.
    if (connection === 'open' && !isNewLogin) {
      connectionStatus = 'connected';
      qrCode = null;
      qrCodeImage = null;
      pairingCodeRequestedForSession = false;
      infoLog('✅ Connected');

      // Set the bot's base number as the primary owner.
      try {
        const normalizeJidDigits = (jid) => {
          let s = String(jid || '');
          const at = s.indexOf('@');
          if (at > 0) s = s.slice(0, at);
          const colon = s.indexOf(':');
          if (colon > 0) s = s.slice(0, colon);
          return s.replace(/\D/g, '');
        };
        const botNum = normalizeJidDigits(sock?.user?.id);
        if (botNum) {
          global.BOT_BASE_NUMBER = botNum;
          setPrimaryOwner(botNum, 'Owner (Base)');
        }
      } catch (e) {
        logger.error(`Error setting primary owner: ${e.message}`);
      }
      return;
    }

    // If the connection is closed, we need to handle the disconnection.
    if (connection === 'close') {
      const err = lastDisconnect?.error;
      const status = err?.output?.statusCode || err?.code;
      const msg = err?.message || '';
      const wasRegistered = !!state?.creds?.registered;

      // If the status is 428, we're waiting for the user to enter the pairing code.
      if (status === 428) {
        connectionStatus = 'waiting_pairing';
        infoLog('⏳ Waiting for you to enter the pairing code on your phone... (not reconnecting to avoid a loop)');
        return;
      }

      // If the user is logged out *and* we had a registered session, stop and require re-login.
      // During initial pairing/registration (registered=false) treat it as a recoverable error.
      if (status === DisconnectReason?.loggedOut && wasRegistered) {
        connectionStatus = 'disconnected';
        infoLog('❌ Session closed (loggedOut). Please log in again via QR or Pairing.');
        return;
      }

      // For any other error (including loggedOut while not yet registered), we'll try to reconnect.
      connectionStatus = 'reconnecting';
      const backoff = 1200;
      infoLog(`⚠️ Connection closed (status ${status || '?'}: ${msg || 'no details'}). Retrying in ${backoff} ms...`);
      if (wantPair) pairingCodeRequestedForSession = false;
      setTimeout(() => {
        connectToWhatsApp(savedAuthPath, wantPair, pairingTargetNumber).catch(() => {});
      }, backoff);
    }
  });

  // ==== MENSAJES: usa el mismo handler robusto que Subbot ====
  sock.ev.on('messages.upsert', async ({ messages = [] }) => {
    try {
      const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true'
      if (traceEv) console.log(`[wa] messages.upsert count=${messages.length} @ ${new Date().toISOString()}`)
    } catch {}
    // Carga perezosa de helpers de activación (global/grupo)
    let mgr = null
    const ensureMgr = async () => {
      if (mgr) return mgr
      try { mgr = await import('./subbot-manager.js') } catch { mgr = null }
      return mgr
    }
    const ignoreGating = String(process.env.BOT_IGNORE_GATING || 'true').toLowerCase() === 'true'
    for (const m of messages) {
      try {
        const id = m?.key?.id
        if (id && processedMessageIds.has(id)) continue
        if (id) processedMessageIds.add(id)

        // Filter out our own messages to avoid loops.
        // We can allow our own messages to be processed if the `FROMME_MODE` environment variable is set to "all" or "true".
        // We can also allow our own messages to be processed if they are commands.
        const fromMe = !!m?.key?.fromMe;
        if (fromMe) {
          const msg = m?.message || {};
          const raw = (
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            ''
          ).trim();
          const btnId =
            msg?.buttonsResponseMessage?.selectedButtonId ||
            msg?.templateButtonReplyMessage?.selectedId ||
            msg?.buttonReplyMessage?.selectedButtonId;
          const rowId =
            msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            msg?.listResponseMessage?.singleSelectReply?.selectedId ||
            msg?.interactiveResponseMessage?.listResponseMessage?.singleSelectReply?.selectedRowId;
          let nfId = null;
          try {
            const pj = msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            if (pj) {
              const p = JSON.parse(pj);
              nfId = p?.id || p?.command || p?.rowId || p?.row_id || null;
            }
          } catch {}
          const hasInteractive = !!(btnId || rowId || nfId);
          const isCommand = /^[\/!.#?$~]/.test(raw) || hasInteractive;
          const mode = String(process.env.FROMME_MODE || process.env.ALLOW_FROM_ME || 'commands').toLowerCase();
          const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && (isCommand || raw.length === 0));
          if (!allow) {
            const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true';
            if (traceEv) {
              console.log(`[wa] skip fromMe (mode=${mode}) text='${raw}' interactive=${hasInteractive}`);
            }
            continue;
          }
        }

        // DEBUG: eco inmediato para verificar path de eventos (sin afectar router)
        try {
          const dbgEcho = String(process.env.DEBUG_ECHO_ALL || 'false').toLowerCase() === 'true'
          if (dbgEcho) {
            const msg = m?.message || {}
            const rawText = (
              msg?.conversation
              || msg?.extendedTextMessage?.text
              || msg?.imageMessage?.caption
              || msg?.videoMessage?.caption
              || ''
            ).trim()
            const rjid = m?.key?.remoteJid || ''
            await safeSend(sock, rjid, { text: rawText ? `🧪 Echo: ${rawText}` : '🧪 Echo: (sin texto)' })
          }
        } catch {}

        // Global/group gating.
        // This prevents the bot from responding to messages if it's disabled globally or in the current group.
        // This can be bypassed by setting the `BOT_IGNORE_GATING` environment variable to "true".
        const mm = await ensureMgr();
        const remoteJid = m?.key?.remoteJid || '';
        const msg = m?.message || {};
        const rawText = (
          msg?.conversation ||
          msg?.extendedTextMessage?.text ||
          msg?.imageMessage?.caption ||
          msg?.videoMessage?.caption ||
          ''
        ).trim();
        const firstToken = /^[\\/!.#?$~]/.test(rawText) ? rawText.split(/\s+/)[0].toLowerCase() : '';
        let interactiveId =
          msg?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          msg?.listResponseMessage?.singleSelectReply?.selectedId ||
          msg?.buttonsResponseMessage?.selectedButtonId ||
          msg?.templateButtonReplyMessage?.selectedId ||
          msg?.buttonReplyMessage?.selectedButtonId ||
          '';
        try {
          const pj = msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
          if (pj) {
            const p = JSON.parse(pj);
            if (!interactiveId) interactiveId = p?.id || p?.command || p?.rowId || p?.row_id || '';
          }
        } catch {}
        const interactiveToken = interactiveId ? String(interactiveId).split(/\s+/)[0].toLowerCase() : '';
        const bypassCmd = controlSet.has(firstToken) || controlSet.has(interactiveToken);

        if (!ignoreGating && mm && typeof mm.isBotGloballyActive === 'function') {
          const on = await mm.isBotGloballyActive();
          if (!on && !fromMe && !bypassCmd) {
            const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true';
            if (traceEv) {
              console.log('[wa] skip by global gating');
            }
            continue;
          }
        }
        if (!ignoreGating && remoteJid.endsWith('@g.us') && mm && typeof mm.isBotActiveInGroup === 'function') {
          const ok = await mm.isBotActiveInGroup('main', remoteJid);
          if (!ok && !fromMe && !bypassCmd) {
            const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true';
            if (traceEv) {
              console.log('[wa] skip by group gating');
            }
            continue;
          }
        }

        // Log the incoming message (siempre por logger; DB opcional).
        try {
          const { logIncomingMessage } = await import('./utils/wa-logging.js');
          await logIncomingMessage(m);
        } catch {}
        const trace = String(process.env.LOG_CONSOLE_TRACE || 'true').toLowerCase() === 'true';
        const full = String(process.env.FULL_LOGS || 'true').toLowerCase() === 'true';
        if (trace || full) {
          let groupLabel = remoteJid;
          const isGroup = remoteJid.endsWith('@g.us');
          if (isGroup) {
            try {
              if (!groupSubjectCache.has(remoteJid)) {
                const meta = await sock.groupMetadata(remoteJid);
                groupSubjectCache.set(remoteJid, meta?.subject || remoteJid);
              }
              const name = groupSubjectCache.get(remoteJid) || remoteJid;
              groupLabel = `${name} (${remoteJid})`;
            } catch {}
          }
          const fromMe = !!m?.key?.fromMe;
          const body = (
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            ''
          ).trim();
          logger.info(`[incoming] ${isGroup ? groupLabel : remoteJid} ${isGroup ? '(group)' : '(pv)'} ${fromMe ? '[fromMe]' : ''} :: ${body || '(no-text)'}`);
          if (full) {
            logger.info(`[incoming.json] ${JSON.stringify(m?.message || {}).slice(0, 1000)}`);
          }
        }

        // Group enforcers: antilink, slowmode, and antiflood.
        // These are only applied to groups and are ignored for messages from the bot itself.
        const isGroup = remoteJid.endsWith('@g.us');
        if (isGroup && !fromMe) {
          try {
            const { getGroupBool, getGroupNumber, getGroupConfig } = await import('./utils/group-config.js');
            const body = (
              msg?.conversation ||
              msg?.extendedTextMessage?.text ||
              msg?.imageMessage?.caption ||
              msg?.videoMessage?.caption ||
              ''
            ).trim();

            // Slowmode: ignore messages if the user is sending them too quickly.
            const slow = await getGroupNumber(remoteJid, 'slowmode_s', 0);
            if (slow > 0) {
              global.__slowmodeMap = global.__slowmodeMap || new Map();
              const user = m?.key?.participant || m?.participant || m?.key?.remoteJid;
              const k = `${remoteJid}|${user}`;
              const last = global.__slowmodeMap.get(k) || 0;
              const now = Date.now();
              if (now - last < slow * 1000) {
                await sock.sendMessage(remoteJid, { text: `🐢 Slowmode: please wait ${Math.ceil((slow * 1000 - (now - last)) / 1000)}s`, mentions: user ? [user] : undefined }, { quoted: m });
                return;
              }
              global.__slowmodeMap.set(k, now);
            }

            // Anti-flood: limit the number of messages a user can send in a short period.
            const antifloodOn = await getGroupBool(remoteJid, 'antiflood_on', false);
            if (antifloodOn) {
              const rate = await getGroupNumber(remoteJid, 'antiflood_rate', 5);
              global.__floodMap = global.__floodMap || new Map();
              const user = m?.key?.participant || m?.participant || m?.key?.remoteJid;
              const k = `${remoteJid}|${user}`;
              const now = Date.now();
              const entry = global.__floodMap.get(k) || { ts: now, c: 0 };
              if (now - entry.ts > 10000) {
                entry.ts = now;
                entry.c = 0;
              }
              entry.c += 1;
              global.__floodMap.set(k, entry);
              if (entry.c > rate) {
                const mode = await getGroupConfig(remoteJid, 'antiflood_mode', 'warn');
                if (mode === 'kick') {
                  await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} kicked.`, mentions: [user] }, { quoted: m });
                  await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                  return;
                } else {
                  await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} please slow down.`, mentions: [user] }, { quoted: m });
                }
              }
            }

            // Antilink: warn or kick users who send links.
            const antilinkOn = await getGroupBool(remoteJid, 'antilink', false);
            if (antilinkOn && /https?:\/\//i.test(body)) {
              const user = m?.key?.participant || m?.participant;
              const mode = await getGroupConfig(remoteJid, 'antilink_mode', 'warn');
              if (mode === 'kick') {
                await sock.sendMessage(remoteJid, { text: `🔗 Antilink: @${String(user || '').split('@')[0]} kicked for sending links.`, mentions: user ? [user] : undefined }, { quoted: m });
                await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                return;
              } else {
                await sock.sendMessage(remoteJid, { text: `🔗 Antilink is active. @${String(user || '').split('@')[0]} please avoid sharing links.`, mentions: user ? [user] : undefined }, { quoted: m });
              }
            }
          } catch (e) {
            try {
              logger.warn(`[group-enforcers] error: ${e?.message || e}`);
            } catch {}
          }
        }

        // Reusar el mismo handler que exportamos (fromMe policy, autoRead, router)
        await handleMessage(m, sock, '[MAIN]')
      } catch {}
    }
  })

  // ==== SIMPLE FALLBACK DISPATCH (debug/seguridad) ====
  sock.ev.on('messages.upsert', async ({ messages = [] }) => {
    for (const m of messages) {
      try {
        await handleMessage(m, sock, '[FALLBACK]')
      } catch (e) {
        try {
          console.error('FALLBACK handleMessage error:', e?.message || e)
        } catch {}
      }
    }
  })

  // ==== LOGGING ADICIONAL DE EVENTOS ====
  try {
    const traceAll = String(process.env.FULL_LOGS || '').toLowerCase() === 'true'
    if (traceAll) {
      sock.ev.on('messages.update', (u)=>{ try { logger.info(`[messages.update] ${JSON.stringify(u).slice(0,500)}`) } catch {} })
      sock.ev.on('messages.delete', (u)=>{ try { logger.info(`[messages.delete] ${JSON.stringify(u).slice(0,500)}`) } catch {} })
      sock.ev.on('presence.update', (u)=>{ try { logger.info(`[presence.update] ${JSON.stringify(u).slice(0,500)}`) } catch {} })
      sock.ev.on('contacts.upsert', (u)=>{ try { logger.info(`[contacts.upsert] count=${Array.isArray(u)?u.length:1}`) } catch {} })
      sock.ev.on('chats.set', ({ chats, isLatest })=>{ try { logger.info(`[chats.set] count=${chats?.length||0} latest=${isLatest}`) } catch {} })
      sock.ev.on('chats.upsert', (u)=>{ try { logger.info(`[chats.upsert] count=${Array.isArray(u)?u.length:1}`) } catch {} })
      sock.ev.on('chats.update', (u)=>{ try { logger.info(`[chats.update] ${JSON.stringify(u).slice(0,500)}`) } catch {} })
      sock.ev.on('groups.update', (u)=>{ try { logger.info(`[groups.update] ${JSON.stringify(u).slice(0,500)}`) } catch {} })
    }
  } catch {}

  // Welcome new participants to the group.
  sock.ev.on('group-participants.update', async (ev) => {
    try {
      const { id: jid, action, participants } = ev;
      if (!jid || !Array.isArray(participants) || participants.length === 0) return;

      const { getGroupBool, getGroupConfig } = await import('./utils/group-config.js');
      const welcomeOn = await getGroupBool(jid, 'welcome_on', false);
      if (!welcomeOn) return;

      const tmpl = await getGroupConfig(jid, 'welcome_text', '👋 Welcome @user to @group');
      if (action === 'add') {
        const meta = await sock.groupMetadata(jid);
        const gname = meta?.subject || 'the group';
        for (const p of participants) {
          const user = `@${String(p || '').split('@')[0]}`;
          const text = tmpl.replace(/@user/gi, user).replace(/@group/gi, gname);
          await sock.sendMessage(jid, { text, mentions: [p] });
        }
      }
    } catch (e) {
      logger.error(`Error welcoming new participants: ${e.message}`);
    }
  });

  // Exponer helper en la instancia de socket para compatibilidad con subbot-runner
  try { sock.getCurrentPairingInfo = getCurrentPairingInfo } catch {}

  return sock
}

/* ===== Helper directo para Pairing ===== */
export async function connectWithPairingCode(phoneNumber, authPath = null) {
  const normalized = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
  if (!normalized) throw new Error('Numero invalido para pairing.')

  const baseDir = authPath || savedAuthPath || (process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full'))
  const effective = path.resolve(baseDir)

  // Sesión limpia para evitar estados loggedOut o credenciales mezcladas
  try {
    if (fs.existsSync(effective)) {
      fs.rmSync(effective, { recursive: true, force: true })
    }
  } catch {}
  try { fs.mkdirSync(effective, { recursive: true }) } catch {}

  pairingTargetNumber = normalized
  authMethod = 'pairing'

  return await connectToWhatsApp(effective, true, normalized)
}

/* ===== Estado para panel/API ===== */
export function getBotStatus() {
  return {
    connected: connectionStatus === 'connected',
    connectionStatus,
    phone: sock?.user?.id || null,
    qrCode: qrCode || null,
    pairingCode: currentPairingCode || null,
    pairingNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
    timestamp: new Date().toISOString()
  }
}

/**
 * Handles incoming messages.
 *
 * @param {Object} message The message object.
 * @param {Object} customSock The socket to use.
 * @param {string} prefix A prefix to use for logging.
 * @param {Object} runtimeContext Additional context to pass to the command router.
 */
export async function handleMessage(message, customSock = null, prefix = '', runtimeContext = {}) {
  const s = customSock || sock;
  if (!s || !message || !message.key) return;

  const { remoteJid } = message.key;
  if (!remoteJid) return;

  const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
  const fromMe = !!message?.key?.fromMe;
  const botJid = s.user?.id;
  let botNumber = null;
  try {
    botNumber = botJid ? jidDecode(botJid).user : null;
  } catch {
    botNumber = onlyDigits(botJid || '');
  }
  const sender = isGroup ? message.key.participant || remoteJid : remoteJid;
  let senderNumber = null;
  try {
    senderNumber = sender ? jidDecode(sender).user : null;
  } catch {
    senderNumber = onlyDigits(sender || '');
  }
  
  let ownerNumber = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '');
  if (!ownerNumber && botNumber) {
    ownerNumber = botNumber;
  }
  const isOwner = !!(ownerNumber && senderNumber && senderNumber === ownerNumber);

  let isAdmin = false;
  let isBotAdmin = false;
  let groupMetadata = null;
  if (isGroup) {
    try {
      groupMetadata = await s.groupMetadata(remoteJid);
      const participantInfo = (groupMetadata.participants || []).find((p) => p.id === sender);
      isAdmin = !!participantInfo && (participantInfo.admin === 'admin' || participantInfo.admin === 'superadmin');
      const botInfo = (groupMetadata.participants || []).find((p) => p.id === botJid);
      isBotAdmin = !!botInfo && (botInfo.admin === 'admin' || botInfo.admin === 'superadmin');
    } catch (e) {
      logger.error(`Error getting group metadata for ${remoteJid}: ${e.message}`);
    }
  }

  const ctx = {
    sock: s,
    message,
    key: message.key,
    remoteJid,
    sender,
    senderNumber,
    isGroup,
    fromMe,
    botJid,
    botNumber,
    isOwner,
    isAdmin,
    isBotAdmin,
    groupMetadata,
    ...runtimeContext,
  };

  if (fromMe) {
    const m = message.message || {};
    const txt = (m.conversation || m.extendedTextMessage?.text || '').trim();
    const isCmd = /^[\/!.]/.test(txt) || m.buttonsResponseMessage || m.templateButtonReplyMessage || m.listResponseMessage;
    const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase();
    if (!(mode === 'all' || (mode === 'commands' && isCmd))) {
      return;
    }
  }

  const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true';
  if (autoRead && message?.key?.id) {
    await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }]);
  }

  try {
    let dispatch = null;
    try {
      const mod = await import(routerPath);
      dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default;
    } catch {
      const mod = await import('./commands/router.js');
      dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default;
    }

    if (typeof dispatch === 'function') {
      const handled = await dispatch(ctx);

      const replyFallback = String(process.env.REPLY_ON_UNMATCHED || 'false').toLowerCase() === 'true';
      if (replyFallback && handled !== true && !fromMe) {
        const isMentioned = (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(s.user.id);
        if (!isGroup || isMentioned) {
          global.__fallbackTs = global.__fallbackTs || new Map();
          if (Date.now() - (global.__fallbackTs.get(remoteJid) || 0) > 60000) {
            await safeSend(s, remoteJid, { text: '👋 Send me a command. Use /menu or /help' }, { quoted: message });
            global.__fallbackTs.set(remoteJid, Date.now());
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`[handleMessage] router failed: ${e?.message || e}`);
  }
}

/**
 * Clears the WhatsApp session from disk.
 *
 * @param {string} dirPath The path to the session directory.
 */
export async function clearWhatsAppSession(dirPath = null) {
  try {
    await teardownSocket();
    const base = dirPath || savedAuthPath || process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full');
    const abs = path.resolve(base);
    if (abs && fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  } catch (e) {
    logger.error(`Error clearing WhatsApp session: ${e.message}`);
  }
}
