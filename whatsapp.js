// whatsapp.js – QR y Pairing Code funcionales con código personalizado KONMIBOT
import 'dotenv/config'
// =========================================================================
// ✅ DIAGNÓSTICO: Esto te ayudará a confirmar si TRACE_ROUTER=true está cargado.
console.log('✅ DIAGNÓSTICO TRACE_ROUTER:', process.env.TRACE_ROUTER);
// =========================================================================
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import QRCode from 'qrcode'
import qrTerminal from 'qrcode-terminal'
import { fileURLToPath, pathToFileURL } from 'url'
import logger from './src/config/logger.js'
import { setPrimaryOwner } from './src/config/global-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// RUTA SEGURA FORZADA: Usaremos 'session_data/baileys_full' por defecto si no hay AUTH_DIR en .env
const DEFAULT_AUTH_DIR = path.join(__dirname, 'session_data', 'baileys_full');

/* ===== Código personalizado KONMIBOT ===== */
const CUSTOM_PAIRING_CODE = 'KONMIBOT'

/* ===== Utils mínimas ===== */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
export const sanitizePhoneNumberInput = (v) => { // <-- EXPORTADO para index.js
  const digits = onlyDigits(v)
  return digits || null
}

/**
 * Dynamically loads the Baileys library.
 */
let __loaded = null
async function loadBaileys() {
  if (__loaded) return __loaded;

  const picks = ['@itsukichan/baileys', '@whiskeysockets/baileys', 'baileys'];

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
        jidDecode: M?.jidDecode || mod?.jidDecode, // Aseguramos que jidDecode esté disponible
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

  throw lastErr || new Error('Could not load any compatible Baileys package.');
}

async function resolveWaVersion(fetchLatestBaileysVersion) {
  const raw = (process.env.WA_WEB_VERSION || '').trim()
  if (raw) {
    const parts = raw.split(/[.,\s]+/).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)).slice(0, 3)
    if (parts.length === 3) {
      console.log(`ℹ️ Using WA version from env: ${parts.join('.')}`);
      return parts;
    }
  }
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`ℹ️ Fetched WA version: ${version.join('.')}, isLatest: ${isLatest}`);
    if (Array.isArray(version) && version.length === 3) return version
  } catch (e) {
    console.warn(`⚠️ Could not fetch latest WA version: ${e?.message || e}. Using fallback.`);
  }
  const fallbackVersion = [2, 3000, 1027934701]
  console.log(`ℹ️ Using fallback WA version: ${fallbackVersion.join('.')}`);
  return fallbackVersion
}

/* ===== Import helper robusto (reintentos + timeout) ===== */
async function tryImportModuleWithRetries(modulePath, opts = {}) {
  const retries = Number.isFinite(Number(opts.retries)) ? Number(opts.retries) : 3
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 20000
  const backoffMs = Number.isFinite(Number(opts.backoffMs)) ? Number(opts.backoffMs) : 1500

  let resolvedPath = modulePath
  try {
    if (modulePath.startsWith('.') || modulePath.startsWith('/') || /^[A-Za-z]:\\/.test(modulePath)) {
      const abs = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)
      resolvedPath = pathToFileURL(abs).href
    }
  } catch (e) {
    // keep modulePath as-is
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      console.log(`[import-helper] import attempt ${attempt}/${retries} for ${resolvedPath} (timeout ${timeoutMs}ms)`)
      const mod = await Promise.race([
        import(resolvedPath),
        new Promise((_, rej) => setTimeout(() => rej(new Error('import timeout')), timeoutMs))
      ])
      console.log(`[import-helper] import ok (${attempt}/${retries}) path=${resolvedPath} took=${Date.now()-attemptStart}ms`)
      return mod
    } catch (err) {
      console.error(`[import-helper] import failed attempt ${attempt}/${retries} for ${resolvedPath}:`, err && (err.message || err))
      try {
        if (resolvedPath.startsWith('file://')) {
          const filePath = new URL(resolvedPath).pathname
          if (fs.existsSync(filePath)) {
            const st = fs.statSync(filePath)
            console.log(`[import-helper] file size: ${st.size} bytes (${filePath})`)
          }
        } else {
          if (fs.existsSync(modulePath)) {
            const st = fs.statSync(modulePath)
            console.log(`[import-helper] file size: ${st.size} bytes (${modulePath})`)
          }
        }
      } catch (e) {}
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
        continue
      }
      throw err
    }
  }
}

/* ===== Variables globales ===== */
let sock = null
let jidDecode; // <-- Variable para almacenar la función jidDecode de Baileys
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
let lastQRGenerated = 0

const controlSet = new Set([
  '/activate', '/activar', '/on', '/enable',
  '/deactivate', '/desactivar', '/off', '/disable',
  '/start', '/stop'
])

let routerPath = './src/commands/router.js';
export function setMessageRouterModulePath(p) {
  routerPath = String(p || routerPath);
}
const processedMessageIds = new Set()

/* ===== Getters y Chequeo de Sesión ===== */

/**
 * Verifica si existen credenciales guardadas en la ruta de autenticación.
 * @param {string} [authPath] - Ruta donde se guardan las credenciales.
 * @returns {object} Estado de la sesión.
 */
export async function checkSessionState(authPath = null) { // <-- EXPORTADO para index.js
    // Usa la ruta especificada, o la ruta del ENV, o la ruta segura por defecto
    const effectivePath = authPath || path.resolve(process.env.AUTH_DIR || DEFAULT_AUTH_DIR);

    const credsPath = path.join(effectivePath, 'creds.json');
    const hasCreds = fs.existsSync(credsPath);

    if (hasCreds) {
        return { hasCreds: true, authPath: effectivePath };
    }
    return { hasCreds: false, authPath: effectivePath };
}

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

export async function getAvailableGroups() {
  try {
    if (!sock) return []
    const groups = await sock.groupFetchAllParticipating()
    return Object.values(groups).map(g => ({
      id: g.id,
      name: g.subject,
      participants: g.participants?.length || 0,
    }))
  } catch (e) {
    console.error('[getAvailableGroups] error:', e && (e.message || e));
    return []
  }
}

export function setAuthMethod(method = 'qr', { phoneNumber } = {}) {
  const raw = String(method || 'qr').toLowerCase()
  const normalizedMethod = raw === 'pair' ? 'pairing' : raw
  const allowed = ['qr', 'pairing']

  if (!allowed.includes(normalizedMethod)) {
    const err = new Error('Metodo de autenticacion invalido. Usa "qr" o "pairing".')
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
  return pairingTargetNumber
}

async function teardownSocket() {
  try {
    if (!sock) return
    try { sock.ev?.removeAllListeners?.() } catch (e) { console.warn('[teardownSocket] removeAllListeners failed:', e && (e.message || e)) }
    try { sock.ws?.close?.() } catch (e) { console.warn('[teardownSocket] ws.close failed:', e && (e.message || e)) }
    try { sock.end?.() } catch (e) { console.warn('[teardownSocket] end failed:', e && (e.message || e)) }
  } finally {
    sock = null
  }
}

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

async function saveQrArtifacts(qr, outDir) {
  try {
    fs.mkdirSync(outDir, { recursive: true })
    const dataURL = await QRCode.toDataURL(qr)
    qrCodeImage = dataURL
    fs.writeFileSync(path.join(outDir, 'qr.txt'), qr)
    fs.writeFileSync(path.join(outDir, 'qr.dataurl.txt'), dataURL)
  } catch (e) {
    console.warn('[saveQrArtifacts] primary method failed:', e && (e.message || e));
    try {
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'qr.txt'), qr)
    } catch (e2) {
      console.error('[saveQrArtifacts] fallback also failed:', e2 && (e2.message || e2));
    }
  }
}

/* ===== Conexión principal ===== */
export async function connectToWhatsApp(
  authPath = (process.env.AUTH_DIR || DEFAULT_AUTH_DIR), // <-- USA RUTA SEGURA CORREGIDA
  usePairingCode = false,
  phoneNumber = null
) {
  const baileysAPI = await loadBaileys();
  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason, jidDecode: baileyJidDecode } = baileysAPI;
  jidDecode = baileyJidDecode; // Almacenar la función jidDecode

  savedAuthPath = path.resolve(authPath)
  fs.mkdirSync(savedAuthPath, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(savedAuthPath)

  const waVersion = await resolveWaVersion(fetchLatestBaileysVersion)
  const browser = Browsers.macOS('Chrome');

  const envPairNumber = sanitizePhoneNumberInput(process.env.PAIR_NUMBER);
  let runtimeNumber = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || envPairNumber);
  const isRegistered = !!state?.creds?.registered;

  let wantPair = usePairingCode || authMethod === 'pairing';

  if (isRegistered) {
    console.log('ℹ️ Sesión existente detectada. Usando credenciales guardadas.');
    wantPair = false;
  }

  if (wantPair && !isRegistered && !runtimeNumber) {
    console.log('⚠️ No se proporcionó número de teléfono. Cambiando a modo QR.');
    wantPair = false;
  }

  pairingTargetNumber = wantPair ? runtimeNumber : null;
  authMethod = wantPair ? 'pairing' : 'qr';

  const finalAuthMethod = isRegistered ? 'existing_session' : authMethod;

  const QUIET = String(process.env.QUIET_LOGS || 'false').toLowerCase() === 'true';
  const infoLog = (...a) => { if (!QUIET) console.log(...a) };

  infoLog(`📱 Modo de autenticación: ${finalAuthMethod.toUpperCase()}`);
  if (finalAuthMethod === 'pairing') infoLog(`📞 Número objetivo: +${pairingTargetNumber}`);

  if (usePairingCode) {
    pairingCodeRequestedForSession = false;
  }

  connectionStatus = 'connecting';
  await teardownSocket();
  await sleep(500);

  // ============ CREAR SOCKET ============
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: finalAuthMethod === 'qr',
    browser,
    version: waVersion,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
    emitOwnEvents: true,
    emitOwnMessages: true,
    mobile: false,
    getMessage: async () => null,
    shouldSyncHistory: !isRegistered
  })

  // ============ VALIDAR SOCKET ============
  if (!sock) {
    throw new Error('❌ Failed to create WhatsApp socket');
  }

  if (!sock.ev || typeof sock.ev.on !== 'function') {
    console.error('❌ Socket creado pero ev.on no está disponible');
    throw new Error('Socket event emitter not properly initialized');
  }

  console.log('✅ Socket creado correctamente');
  console.log('📡 Event emitter disponible:', typeof sock.ev.on === 'function');

  // ============ REGISTRAR EVENTOS ============
  try {
    sock.ev.on('creds.update', saveCreds);
    console.log('✅ Evento creds.update registrado');
  } catch (e) {
    console.error('❌ Error registrando creds.update:', e.message);
    throw e;
  }

  // ====== PRELOAD: router/module de comandos ======
  (async () => {
    try {
      const resolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath);
      console.log('[startup] intentando pre-cargar router:', resolved);
      const mod = await tryImportModuleWithRetries(resolved, { retries: 4, timeoutMs: 20000, backoffMs: 1500 });
      global.__APP_ROUTER_MODULE = mod;
      global.__APP_DISPATCH = mod?.dispatch || mod?.default?.dispatch || mod?.default || null;
      if (global.__APP_DISPATCH) console.log('[startup] dispatch precargado correctamente');
      else console.warn('[startup] router cargado pero no expone dispatch');
    } catch (e) {
      console.error('[startup] fallo al pre-cargar router:', e && (e.message || e));
      global.__APP_ROUTER_MODULE = null;
      global.__APP_DISPATCH = null;
    }
  })();

  // ====== EVENTO: connection.update ======
  try {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update || {};
      const isAuthenticated = !!state?.creds?.registered || connection === 'open';

      if (qr && finalAuthMethod === 'qr' && !isAuthenticated) {
        qrCode = qr;
        await saveQrArtifacts(qr, path.join(savedAuthPath, 'qr'));
        infoLog('🟩 QR code generado - Escanea con tu WhatsApp');
      }

      if (finalAuthMethod === 'pairing' && !pairingCodeRequestedForSession && !!pairingTargetNumber && !isAuthenticated) {
        if (connection !== 'open' && connection !== 'connecting') {
          return;
        }

        pairingCodeRequestedForSession = true;
        await sleep(2000);

        try {
          const number = onlyDigits(pairingTargetNumber);
          if (!number) { infoLog('❌ Número inválido para vinculación.'); return; }
          if (typeof sock.requestPairingCode !== 'function') {
            infoLog('⚠️ La versión de Baileys no soporta códigos de emparejamiento.');
            return;
          }

          infoLog(`📲 Solicitando código de vinculación para +${number} con código personalizado "${CUSTOM_PAIRING_CODE}"...`);

          const code = await sock.requestPairingCode(number, CUSTOM_PAIRING_CODE);

          if (code) {
            const formatted = String(code).toUpperCase().replace(/[-\s]/g, '');
            const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-');

            currentPairingCode = grouped;
            currentPairingNumber = number;
            currentPairingGeneratedAt = new Date();
            currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

            if (!QUIET) {
              console.log('\n╔═══════════════════════════════════════╗');
              console.log('║   ✅ CÓDIGO DE VINCULACIÓN GENERADO ✅  ║');
              console.log('╠═══════════════════════════════════════╣');
              console.log(`║  📞 Número: +${number.padEnd(30)} ║`);
              console.log(`║  🔐 Código: ${grouped.padEnd(30)} ║`);
              console.log(`║  🎯 Custom: ${CUSTOM_PAIRING_CODE.padEnd(30)} ║`);
              console.log('║  ⏰ Válido por 10 minutos               ║');
              console.log('╠═══════════════════════════════════════╣');
              console.log('║  📱 En tu teléfono:                    ║');
              console.log('║  1. WhatsApp > Dispositivos vinculados  ║');
              console.log('║  2. Vincular con número de teléfono     ║');
              console.log('║  3. Ingresa el código de arriba         ║');
              console.log('╚═══════════════════════════════════════╝\n');
            } else {
              infoLog(`✅ Código de vinculación: ${grouped}`);
            }
          } else {
            infoLog('⚠️ No se pudo generar el código.');
          }
        } catch (e) {
          infoLog(`❌ Error durante la solicitud de vinculación: ${e?.message || e}`);
          console.error('[pairing] Stack trace:', e?.stack || e);
        }
      }

      // Conectado
      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCode = null;
        qrCodeImage = null;
        pairingCodeRequestedForSession = false;
        infoLog('✅ Bot conectado exitosamente');

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
            infoLog(`📱 Bot número: ${botNum}`);
          }
        } catch (e) {
          logger.error(`Error setting primary owner: ${e.message}`);
        }

        try {
          const mod = await import('./src/services/subbot-manager.js');
          const clean = await mod.cleanOrphanSubbots?.().catch(() => 0);
          const restored = await mod.restoreActiveSubbots?.().catch(() => 0);
          infoLog(`♻️ Subbots auto-start: restaurados=${restored||0}, limpieza=${clean||0}`);
        } catch (e) {
          console.warn('[autostart-subbots] failed:', e?.message || e);
        }
        return;
      }

      // Desconectado
      if (connection === 'close') {
        const err = lastDisconnect?.error;
        const status = err?.output?.statusCode || err?.code;
        const msg = err?.message || '';

        const shouldReconnect = status !== DisconnectReason.loggedOut && status !== 401 && status !== 403;

        connectionStatus = shouldReconnect ? 'reconnecting' : 'disconnected';

        if (status === 428) {
          connectionStatus = 'waiting_pairing';
          infoLog('⏳ Esperando que ingreses el código de vinculación en tu teléfono...');
          return;
        }

        if (shouldReconnect) {
          const backoff = 5000;
          infoLog(`⚠️ Conexión cerrada (status ${status || '?'}: ${msg || 'sin detalles'}). Auto-reintentando en ${backoff}ms...`);

          setTimeout(() => {
            connectToWhatsApp(savedAuthPath, false, null).catch((e) => {
              console.error('[reconnect] fallo al reconectar:', e && (e.message || e));
            });
          }, backoff);
        } else {
          infoLog('❌ Sesión cerrada permanentemente (LoggedOut/401/403). Por favor, inicia sesión de nuevo.');
          qrCode = null;
          qrCodeImage = null;
        }
        return;
      }
    });
    console.log('✅ Evento connection.update registrado');
  } catch (e) {
    console.error('❌ Error registrando connection.update:', e.message);
    throw e;
  }

  // ====== EVENTO: messages.upsert ======
  try {
    sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      let mgr = null
      const ensureMgr = async () => {
        if (mgr) return mgr
try { mgr = await import('./src/services/subbot-manager.js') } catch (e) { console.error('[ensureMgr] import failed:', e && (e.message || e)); mgr = null }
        return mgr
      }
      const ignoreGating = String(process.env.BOT_IGNORE_GATING || 'true').toLowerCase() === 'true'

      for (const m of messages) {
        try {
          // Logging detallado (Opcional, desactivar para producción)
          // try {
          //   const id = m?.key?.id;
          //   const fromMe = !!m?.key?.fromMe;
          //   const remoteJid = m?.key?.remoteJid || '';
          //   const msg = m?.message || {};
          //   const rawText = (
          //     msg?.conversation ||
          //     msg?.extendedTextMessage?.text ||
          //     msg?.imageMessage?.caption ||
          //     msg?.videoMessage?.caption ||
          //     ''
          //   ).trim();

          //   console.log('--- mensaje entrante ---');
          //   console.log('id:', id, 'fromMe:', fromMe, 'remoteJid:', remoteJid);
          //   console.log('message types:', Object.keys(msg).join(', '));
          //   console.log('rawText:', rawText.slice(0, 30));
          // } catch (e) {
          //   console.error('Error logging incoming message:', e && (e.message || e));
          // }

          const id = m?.key?.id
          if (id && processedMessageIds.has(id)) continue
          if (id) processedMessageIds.add(id)

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
            const isCommand = /^[\/!.#?$~]/.test(raw);
            const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase();
            const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && isCommand);
            if (!allow) continue;
          }

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
          const bypassCmd = controlSet.has(firstToken);

          if (!ignoreGating && mm && typeof mm.isBotGloballyActive === 'function') {
            try {
              const on = await mm.isBotGloballyActive();
              if (!on && !fromMe && !bypassCmd) continue;
            } catch (e) {
              console.error('[gating] isBotGloballyActive failed:', e && (e.message || e));
            }
          }
          if (!ignoreGating && remoteJid.endsWith('@g.us') && mm && typeof mm.isBotActiveInGroup === 'function') {
            try {
              const ok = await mm.isBotActiveInGroup('main', remoteJid);
              if (!ok && !fromMe && !bypassCmd) continue;
            } catch (e) {
              console.error('[gating] isBotActiveInGroup failed:', e && (e.message || e));
            }
          }

          try {
const { logIncomingMessage } = await import('./src/utils/utils/wa-logging.js');
            await logIncomingMessage(m);
          } catch (e) {
            console.warn('[wa-logging] logIncomingMessage failed:', e && (e.message || e));
          }

          const isGroup = remoteJid.endsWith('@g.us');
          if (isGroup && !fromMe) {
            try {
              const { getGroupBool, getGroupNumber, getGroupConfig } = await import('./src/utils/utils/group-config.js');
              const body = rawText;

              const slow = await getGroupNumber(remoteJid, 'slowmode_s', 0);
              if (slow > 0) {
                global.__slowmodeMap = global.__slowmodeMap || new Map();
                const user = m?.key?.participant || m?.participant || m?.key?.remoteJid;
                const k = `${remoteJid}|${user}`;
                const last = global.__slowmodeMap.get(k) || 0;
                const now = Date.now();
                if (now - last < slow * 1000) {
                  await sock.sendMessage(remoteJid, { text: `🢂 Slowmode: espera ${Math.ceil((slow * 1000 - (now - last)) / 1000)}s`, mentions: user ? [user] : undefined }, { quoted: m });
                  continue;
                }
                global.__slowmodeMap.set(k, now);
              }

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
                    await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} expulsado.`, mentions: [user] }, { quoted: m });
                    await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                    continue;
                  } else {
                    await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} baja la velocidad.`, mentions: [user] }, { quoted: m });
                  }
                }
              }

              const antilinkOn = await getGroupBool(remoteJid, 'antilink', false);
              if (antilinkOn && /https?:\/\//i.test(body)) {
                const user = m?.key?.participant || m?.participant;
                const mode = await getGroupConfig(remoteJid, 'antilink_mode', 'warn');
                if (mode === 'kick') {
                  await sock.sendMessage(remoteJid, { text: `🔗 Antilink: @${String(user || '').split('@')[0]} expulsado por enviar enlaces.`, mentions: user ? [user] : undefined }, { quoted: m });
                  await sock.groupParticipantsUpdate(remoteJid, [user], 'remove');
                  continue;
                } else {
                  await sock.sendMessage(remoteJid, { text: `🔗 Antilink activo. @${String(user || '').split('@')[0]} evita enviar enlaces.`, mentions: user ? [user] : undefined }, { quoted: m });
                }
              }
            } catch (e) {
              logger.warn(`[group-enforcers] error: ${e?.message || e}`);
            }
          }

          await handleMessage(m, sock, '[MAIN]')
        } catch (e) {
          console.error('[messages.upsert] outer handler error:', e && (e.message || e));
        }
      }
    });
    console.log('✅ Evento messages.upsert registrado');
  } catch (e) {
    console.error('❌ Error registrando messages.upsert:', e.message);
    throw e;
  }

  // ====== EVENTO: group-participants.update ======
  try {
    sock.ev.on('group-participants.update', async (ev) => {
      try {
        const { id: jid, action, participants } = ev;
        if (!jid || !Array.isArray(participants) || participants.length === 0) return;

        const { getGroupBool, getGroupConfig } = await import('./src/utils/utils/group-config.js');
        const welcomeOn = await getGroupBool(jid, 'welcome_on', false);
        if (!welcomeOn) return;

        const tmpl = await getGroupConfig(jid, 'welcome_text', '👋 Bienvenido @user a @group');
        if (action === 'add') {
          const meta = await sock.groupMetadata(jid);
          const gname = meta?.subject || 'el grupo';
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
    console.log('✅ Evento group-participants.update registrado');
  } catch (e) {
    console.error('❌ Error registrando group-participants.update:', e.message);
    throw e;
  }

  // Adjuntar método personalizado
  try {
    sock.getCurrentPairingInfo = getCurrentPairingInfo;
    console.log('✅ Método getCurrentPairingInfo adjuntado');
  } catch (e) {
    console.warn('[attach] setting getCurrentPairingInfo failed:', e && (e.message || e));
  }

  console.log('✅ Socket completamente inicializado');
  return sock
}

export async function connectWithPairingCode(phoneNumber, authPath = null) {
  const normalized = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
  if (!normalized) throw new Error('Numero invalido para pairing.')

  const baseDir = authPath || savedAuthPath || (process.env.AUTH_DIR || DEFAULT_AUTH_DIR)
  const effective = path.resolve(baseDir)

  try {
    if (fs.existsSync(effective)) {
      fs.rmSync(effective, { recursive: true, force: true })
    }
  } catch (e) {
    console.warn('[connectWithPairingCode] cleaning old auth failed:', e && (e.message || e));
  }
  try { fs.mkdirSync(effective, { recursive: true }) } catch (e) { console.warn('[connectWithPairingCode] mkdir failed:', e && (e.message || e)) }

  pairingTargetNumber = normalized
  authMethod = 'pairing'

  console.log(`🔐 Usando código personalizado: ${CUSTOM_PAIRING_CODE}`)

  return await connectToWhatsApp(effective, true, normalized)
}

export function getBotStatus() {
  return {
    connected: connectionStatus === 'connected',
    connectionStatus,
    phone: sock?.user?.id || null,
    qrCode: qrCode || null,
    pairingCode: currentPairingCode || null,
    pairingNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
    customCode: CUSTOM_PAIRING_CODE,
    timestamp: new Date().toISOString()
  }
}

export async function requestMainBotPairingCode() {
  try {
    if (!sock) {
      return { success: false, message: 'Socket no disponible' };
    }

    if (connectionStatus === 'connected') {
      return { success: false, message: 'El bot ya está conectado' };
    }

    if (typeof sock.requestPairingCode !== 'function') {
      return { success: false, message: 'La versión de Baileys no soporta códigos de emparejamiento' };
    }

    const phoneNumber = process.env.OWNER_WHATSAPP_NUMBER || process.env.PAIR_NUMBER;
    if (!phoneNumber) {
      return { success: false, message: 'Número de teléfono no configurado' };
    }

    const normalizedNumber = onlyDigits(phoneNumber);
    if (!normalizedNumber || normalizedNumber.length < 8) {
      return { success: false, message: 'Número de teléfono inválido' };
    }

    console.log(`📲 Solicitando código de emparejamiento con "${CUSTOM_PAIRING_CODE}" para +${normalizedNumber}...`);

    const code = await sock.requestPairingCode(normalizedNumber, CUSTOM_PAIRING_CODE);

    if (code) {
      const formatted = String(code).toUpperCase().replace(/[-\s]/g, '');
      const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-');

      currentPairingCode = grouped;
      currentPairingNumber = normalizedNumber;
      currentPairingGeneratedAt = new Date();
      currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      console.log('\n╔═══════════════════════════════════════╗');
      console.log('║   ✅ CÓDIGO DE VINCULACIÓN GENERADO ✅  ║');
      console.log('╠═══════════════════════════════════════╣');
      console.log(`║  📞 Número: +${normalizedNumber.padEnd(30)} ║`);
      console.log(`║  🔐 Código: ${grouped.padEnd(30)} ║`);
      console.log(`║  🎯 Custom: ${CUSTOM_PAIRING_CODE.padEnd(30)} ║`);
      console.log('║  ⏰ Válido por 10 minutos               ║');
      console.log('╠═══════════════════════════════════════╣');
      console.log('║  📱 En tu teléfono:                    ║');
      console.log('║  1. WhatsApp > Dispositivos vinculados  ║');
      console.log('║  2. Vincular con número de teléfono     ║');
      console.log('║  3. Ingresa el código de arriba         ║');
      console.log('╚═══════════════════════════════════════╝\n');

      return { success: true, code: grouped, number: normalizedNumber, customCode: CUSTOM_PAIRING_CODE };
    } else {
      return { success: false, message: 'No se pudo generar el código de emparejamiento' };
    }

  } catch (error) {
    console.error('Error generando código de emparejamiento:', error);
    return { success: false, message: `Error: ${error.message}` };
  }
}

// ==========================================================
// ✅ FUNCIÓN CORREGIDA: handleMessage (JID Normalization)
// ==========================================================
export async function handleMessage(message, customSock = null, prefix = '', runtimeContext = {}) {
  const s = customSock || sock;
  if (!s || !message || !message.key) return;

  const { remoteJid } = message.key;
  if (!remoteJid) return;

  const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
  const fromMe = !!message?.key?.fromMe;

  // CORRECCIÓN CRUCIAL: Normalizar botJid a la forma estándar (number@s.whatsapp.net)
  // para que la verificación de administrador sea correcta.
  const botJidRaw = s.user?.id;
  let botJid = botJidRaw;

  if (botJidRaw && typeof jidDecode === 'function') {
    try {
      const decoded = jidDecode(botJidRaw);
      if (decoded && decoded.user && decoded.server) {
        // Reconstruir el JID normalizado, e.g., 595974154768@s.whatsapp.net
        botJid = `${decoded.user}@${decoded.server}`;
      }
    } catch (e) {
      // Fallback
    }
  }

  let botNumber = null;
  try {
    // Usamos el botJid normalizado para obtener el número base
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
  let isBotAdmin = false; // <-- Esto debe ser TRUE si es admin
  let groupMetadata = null;
  if (isGroup) {
    try {
      groupMetadata = await s.groupMetadata(remoteJid);
      const participantInfo = (groupMetadata.participants || []).find((p) => p.id === sender);
      isAdmin = !!participantInfo && (participantInfo.admin === 'admin' || participantInfo.admin === 'superadmin');

      // ✅ VERIFICACIÓN CORRECTA: Comparamos con el botJid NORMALIZADO
      const botInfo = (groupMetadata.participants || []).find((p) => p.id === botJid);
      isBotAdmin = !!botInfo && (botInfo.admin === 'admin' || botInfo.admin === 'superadmin');
    } catch (e) {
      logger.error(`Error getting group metadata for ${remoteJid}: ${e.message}`);
    }
  }

  // Propagate display name for UI messages (DM and groups)
  const pushName = message?.pushName || null;
  let usuarioName = null;
  try {
    if (isGroup && groupMetadata && Array.isArray(groupMetadata.participants)) {
      const p = groupMetadata.participants.find((x) => x?.id === sender);
      usuarioName = p?.notify || p?.name || null;
    }
  } catch (e) {}

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
    pushName,
    usuarioName,
    ...runtimeContext,
  };

  if (fromMe) {
    const m = message.message || {};
    const txt = (m.conversation || m.extendedTextMessage?.text || '').trim();
    const isCmd = /^[\/!.#?$~]/.test(txt) || m.buttonsResponseMessage || m.templateButtonReplyMessage || m.listResponseMessage;
    const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase();
    if (!(mode === 'all' || (mode === 'commands' && isCmd))) {
      return;
    }
  }

  const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true';
  if (autoRead && message?.key?.id) {
    try { await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }]); } catch (e) { /* non-fatal */ }
  }

  try {
    let dispatch = null;

    if (global.__APP_DISPATCH && typeof global.__APP_DISPATCH === 'function') {
      dispatch = global.__APP_DISPATCH;
    } else {
      try {
        const routerResolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath);
        console.log(`[router] intentando importar dinámicamente: ${routerResolved}`);
        const mod = await tryImportModuleWithRetries(routerResolved, { retries: 3, timeoutMs: 20000, backoffMs: 1000 });
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default;
        if (dispatch) {
          global.__APP_ROUTER_MODULE = mod;
          global.__APP_DISPATCH = dispatch;
          console.log('[router] dispatch cargado correctamente y cacheado.');
        } else {
          console.warn('[router] módulo importado pero no expone dispatch.');
        }
      } catch (e) {
        console.error('[router] Error importando router dinámico:', e && (e.stack || e.message || e));
      }
    }

    if (typeof dispatch === 'function') {
      const handled = await dispatch(ctx);

      const replyFallback = String(process.env.REPLY_ON_UNMATCHED || 'false').toLowerCase() === 'true';
      if (replyFallback && handled !== true && !fromMe) {
        const isMentioned = (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(s.user.id);
        if (!isGroup || isMentioned) {
          global.__fallbackTs = global.__fallbackTs || new Map();
          if (Date.now() - (global.__fallbackTs.get(remoteJid) || 0) > 60000) {
            await safeSend(s, remoteJid, { text: '👋 Envíame un comando. Usa /menu o /help' }, { quoted: message });
            global.__fallbackTs.set(remoteJid, Date.now());
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`[handleMessage] router failed: ${e?.message || e}`);
  }
}
// ==========================================================
// FIN DE FUNCIÓN handleMessage CORREGIDA
// ==========================================================

export async function clearWhatsAppSession(dirPath = null) {
  try {
    await teardownSocket();
    const base = dirPath || savedAuthPath || process.env.AUTH_DIR || DEFAULT_AUTH_DIR;
    const abs = path.resolve(base);
    if (abs && fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true });
    }
  } catch (e) {
    logger.error(`Error clearing WhatsApp session: ${e.message}`);
  }
}
