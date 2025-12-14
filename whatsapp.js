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
import { isSuperAdmin, setPrimaryOwner } from './src/config/global-config.js'
import { initStore } from './src/utils/utils/store.js'
m// port { extractText } from './src/utils/textextractor.js'
// ==============================================================================
// Funciones locales de normalización y extracción de texto
// Estas funciones reemplazan al módulo './src/utils/text-extractor.js'.
function normalizeIncomingText(text) {
  try {
    if (text == null) return '';
    let s = String(text);
    s = s.normalize('NFKC');
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    s = s.replace(/\r\n/g, '\n');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim().toUpperCase();
  } catch {
    return String(text || '').trim().toUpperCase();
  }
}

function extractText(msg) {
  try {
    if (!msg || typeof msg !== 'object') return '';
    const m = msg.message || msg;
    // Captura de texto básico y captions
    const basic = (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.documentMessage?.caption ||
      m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      m.audioMessage?.caption ||
      ''
    );
    if (basic) return normalizeIncomingText(basic);
    // Botones
    const btn =
      m.buttonsResponseMessage?.selectedButtonId ||
      m.templateButtonReplyMessage?.selectedId ||
      m.buttonReplyMessage?.selectedButtonId ||
      '';
    if (btn) return normalizeIncomingText(btn);
    // Listas (fila seleccionada)
    const list = m.listResponseMessage;
    if (list) {
      const rowId =
        list.singleSelectReply?.selectedRowId ||
        list.singleSelectReply?.selectedId ||
        list.title ||
        '';
      if (rowId) return normalizeIncomingText(rowId);
    }
    // Mensajes anidados (view once, ephermal, etc.)
    const nested =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null;
    if (nested) {
      const out = extractText(nested);
      if (out) return out;
    }
    return '';
  } catch (error) {
    console.error('[extractText]', error?.message);
    return '';
  }
}

// Compatibilidad: alias que reenvía a extractText
function extractTextFromMessage(msg) {
  return extractText(msg);
}


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// RUTA SEGURA FORZADA: Usaremos 'session_data/baileys_full' por defecto si no hay AUTH_DIR en .env
const DEFAULT_AUTH_DIR = path.join(__dirname, 'session_data', 'baileys_full')

/* ===== Código personalizado KONMIBOT ===== */
const CUSTOM_PAIRING_CODE = 'KONMIBOT'

/* ===== Sistema de Logs con colores y recuadros ===== */
const LOG_LEVELS = {
  DEBUG: '🔍',
  INFO: 'ℹ️',
  WARN: '⚠️',
  ERROR: '❌',
  SUCCESS: '✅',
  ADMIN: '👑',
  GROUP: '👥',
  DM: '💬',
  CHANNEL: '📣',
  COMMAND: '⚡',
  METADATA: '📊'
}

// ANSI para colores en consola
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  fg: {
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  }
}

const LOG_COLORS = {
  DEBUG: ANSI.fg.cyan,
  INFO: ANSI.fg.blue,
  WARN: ANSI.fg.yellow,
  ERROR: ANSI.fg.red,
  SUCCESS: ANSI.fg.green,
  ADMIN: ANSI.fg.magenta,
  GROUP: ANSI.fg.cyan,
  DM: ANSI.fg.green,
  CHANNEL: ANSI.fg.magenta,
  COMMAND: ANSI.fg.magenta,
  METADATA: ANSI.fg.gray,
  DEFAULT: ANSI.fg.white
}

const LOG_MODE = (process.env.LOG_MODE || 'minimal').toLowerCase()
const MINIMAL_LOGS = LOG_MODE === 'minimal' || LOG_MODE === 'chat'
const CHAT_SOURCES = new Set(['DM', 'GROUP', 'CHANNEL'])
const CHAT_LEVELS = new Set(['INFO'])
const ERROR_LEVELS = new Set(['ERROR', 'WARN'])

// En modo minimal reducimos el nivel base de pino para evitar spam estructurado
try {
  if (MINIMAL_LOGS && logger && typeof logger.level === 'string') {
    logger.level = 'warn'
  }
} catch {}

const PINO_LEVEL_MAP = {
  ERROR: 'error',
  WARN: 'warn',
  DEBUG: 'debug',
  INFO: 'info',
  SUCCESS: 'info',
  ADMIN: 'info',
  GROUP: 'info',
  DM: 'info',
  CHANNEL: 'info',
  COMMAND: 'info',
  METADATA: 'debug'
}

const SHOW_LOG_DETAILS =
  (process.env.LOG_DETAILS || "").toLowerCase() === "true"

const shouldLog = (level, source) => {
  if (!MINIMAL_LOGS) return true
  if (ERROR_LEVELS.has(level)) return true
  if (CHAT_SOURCES.has(source) && CHAT_LEVELS.has(level)) return true
  return false
}

function formatLog(level, source, message, data = null) {
  const timestamp = new Date().toISOString()
  const icon = LOG_LEVELS[level] || '•'
  const color = LOG_COLORS[level] || LOG_COLORS.DEFAULT

  const header =
    `${color}${icon} ${ANSI.dim}[${timestamp}]${ANSI.reset} ` +
    `${color}[${source}]${ANSI.reset} `

  let logMsg = `${header}${message}`

  if (data && SHOW_LOG_DETAILS) {
    const pretty = JSON.stringify(data, null, 2)
    logMsg += `\n${ANSI.dim}${pretty}${ANSI.reset}`
  }

  return logMsg
}

function logMessage(level, source, message, data = null) {
  if (!shouldLog(level, source)) return
  const formattedLog = formatLog(level, source, message, data)

  const pinoLevel = PINO_LEVEL_MAP[level] || 'info'
  try {
    if (typeof logger?.[pinoLevel] === 'function') {
      logger[pinoLevel](
        { scope: source, level, ...(data || {}) },
        message
      )
    }
  } catch (e) {
    // Silenciar fallos de logger estructurado para no romper el flujo
  }

  switch (level) {
    case 'ERROR':
      console.error(formattedLog)
      break
    case 'WARN':
      console.warn(formattedLog)
      break
    default:
      console.log(formattedLog)
  }
}

/**
 * Recuadro lindo para logs de mensajes (DM / Grupo / Canal)
 */
function prettyPrintMessageLog(info) {
  const {
    remoteJid,
    chatName,
    senderNumber,
    senderName,
    text,
    isCommand,
    isGroup,
    isChannel,
    fromMe
  } = info

  const maxWidth = 70
  const color = isChannel
    ? LOG_COLORS.CHANNEL
    : isGroup
      ? LOG_COLORS.GROUP
      : LOG_COLORS.DM

  const reset = ANSI.reset
  const title = isChannel
    ? 'MENSAJE DE CANAL'
    : isGroup
      ? 'MENSAJE DE GRUPO'
      : 'MENSAJE PRIVADO'

  const who = fromMe ? 'BOT' : 'USUARIO'
  const tipo = isChannel ? 'CANAL' : isGroup ? 'GRUPO' : 'PRIVADO'
  const displayChat = getDisplayChat(remoteJid, chatName)
  const senderLabel = senderName || senderNumber || 'desconocido'

  const cleanText = (text || '').replace(/\s+/g, ' ').trim()
  const contentWidth = maxWidth - 2
  let preview = cleanText || '(sin texto)'

  if (preview.length > contentWidth - 3) {
    preview = preview.slice(0, contentWidth - 6) + '...'
  }

  const pad = (s = '') =>
    (s.length > contentWidth ? s.slice(0, contentWidth) : s.padEnd(contentWidth, ' '))

  const border = '-'.repeat(contentWidth)
  const lines = [
    `${color}+${border}+${reset}`,
    `${color}|${reset} ${pad(title)} ${color}|${reset}`,
    `${color}|${reset} ${pad(`Chat: ${displayChat}`)} ${color}|${reset}`,
    `${color}|${reset} ${pad(`De: ${senderLabel} (${who})`)} ${color}|${reset}`,
    `${color}|${reset} ${pad(`Tipo: ${tipo} | Comando: ${isCommand ? 'Si' : 'No'}`)} ${color}|${reset}`,
    `${color}+${border}+${reset}`,
    `${color}|${reset} ${pad(preview)} ${color}|${reset}`,
    `${color}+${border}+${reset}`
  ]

  console.log(lines.join('\n'))
}


/* ===== Utils mínimas ===== */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const onlyDigits = (v) => String(v || '').replace(/\D/g, '')
export const sanitizePhoneNumberInput = (v) => {
  const digits = onlyDigits(v)
  return digits || null
}

// Cache de nombres de chats/contactos para logs legibles
const chatNameCache = new Map()

const normalizeName = (value) => {
  if (!value) return null
  const clean = String(value).trim()
  return clean.length ? clean : null
}

function cacheChatName(jid, ...candidates) {
  if (!jid) return chatNameCache.get(jid) || null
  const picked = candidates.map(normalizeName).find(Boolean)
  if (picked) {
    chatNameCache.set(jid, picked)
    return picked
  }
  return chatNameCache.get(jid) || null
}

async function resolveChatName(jid, sockRef, hintName = null) {
  if (!jid) return null
  if (chatNameCache.has(jid)) return chatNameCache.get(jid)

  if (hintName) {
    const cached = cacheChatName(jid, hintName)
    if (cached) return cached
  }

  if (jid.endsWith('@g.us') && typeof sockRef?.groupMetadata === 'function') {
    try {
      const meta = await sockRef.groupMetadata(jid)
      const name = cacheChatName(jid, meta?.subject)
      if (name) return name
    } catch (e) {
      // Silenciar errores de metadata para no romper el flujo
    }
  }

  if (!jid.endsWith('@g.us')) {
    const digits = onlyDigits(jid)
    if (digits) {
      cacheChatName(jid, `+${digits}`)
    }
  }

  return chatNameCache.get(jid) || null
}

function getDisplayChat(jid, name) {
  if (!jid) return '-'
  return name ? `${name} (${jid})` : jid
}

function attachNameListeners(sockInstance) {
  if (!sockInstance?.ev?.on) return
  const safeSet = (jid, ...names) => cacheChatName(jid, ...names)

  sockInstance.ev.on('contacts.upsert', (contacts = []) => {
    contacts.forEach((c) => safeSet(c.id || c.jid, c.notify, c.name, c.verifiedName, c.pushName))
  })

  sockInstance.ev.on('contacts.update', (contacts = []) => {
    contacts.forEach((c) => safeSet(c.id || c.jid, c.notify, c.name, c.verifiedName, c.pushName))
  })

  sockInstance.ev.on('groups.upsert', (groups = []) => {
    groups.forEach((g) => safeSet(g.id || g.jid, g.subject, g.name))
  })

  sockInstance.ev.on('groups.update', (groups = []) => {
    groups.forEach((g) => safeSet(g.id || g.jid, g.subject, g.name))
  })

  sockInstance.ev.on('chats.upsert', (chats = []) => {
    chats.forEach((c) => safeSet(c.id || c.jid, c.name, c.subject, c.title, c.pushName))
  })
}

/**
 * Dynamically loads the Baileys library.
 */
let __loaded = null
async function loadBaileys() {
  if (__loaded) return __loaded

  const picks = ['wileys', '@whiskeysockets/baileys', 'baileys']

  if (process?.env?.BAILEYS_MODULE && !['@whiskeysockets/baileys', 'baileys', '@itsukichan/baileys'].includes(process.env.BAILEYS_MODULE)) {
    picks.unshift(process.env.BAILEYS_MODULE)
  }

  let lastErr = null
  for (const name of picks) {
    try {
      const mod = await import(name)
      const M = mod?.default || mod
      const api = {
        makeWASocket: M?.makeWASocket || mod?.makeWASocket,
        useMultiFileAuthState: M?.useMultiFileAuthState || mod?.useMultiFileAuthState,
        fetchLatestBaileysVersion: M?.fetchLatestBaileysVersion || mod?.fetchLatestBaileysVersion,
        Browsers: M?.Browsers || mod?.Browsers,
        DisconnectReason: M?.DisconnectReason || mod?.DisconnectReason,
        jidDecode: M?.jidDecode || mod?.jidDecode,
        jidNormalizedUser: M?.jidNormalizedUser || mod?.jidNormalizedUser,
        loadedName: name,
      }
      if (!api.makeWASocket || !api.useMultiFileAuthState) {
        throw new Error(`The package "${name}" does not expose the expected API.`)
      }
      logMessage('SUCCESS', 'BAILEYS', `Baileys loaded: ${name}`)
      __loaded = api
      return api
    } catch (e) {
      lastErr = e
      logMessage('WARN', 'BAILEYS', `Could not load ${name}: ${e?.message || e}`)
    }
  }

  throw lastErr || new Error('Could not load any compatible Baileys package.')
}

async function resolveWaVersion(fetchLatestBaileysVersion) {
  const raw = (process.env.WA_WEB_VERSION || '').trim()
  if (raw) {
    const parts = raw.split(/[.,\s]+/).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)).slice(0, 3)
    if (parts.length === 3) {
      logMessage('INFO', 'WA-VERSION', `Using WA version from env: ${parts.join('.')}`)
      return parts
    }
  }
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion()
    logMessage('INFO', 'WA-VERSION', `Fetched WA version: ${version.join('.')}, isLatest: ${isLatest}`)
    if (Array.isArray(version) && version.length === 3) return version
  } catch (e) {
    logMessage('WARN', 'WA-VERSION', `Could not fetch latest WA version: ${e?.message || e}. Using fallback.`)
  }
  const fallbackVersion = [2, 3000, 1027934701]
  logMessage('INFO', 'WA-VERSION', `Using fallback WA version: ${fallbackVersion.join('.')}`)
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
      logMessage('DEBUG', 'IMPORT', `import attempt ${attempt}/${retries} for ${resolvedPath} (timeout ${timeoutMs}ms)`)
      const mod = await Promise.race([
        import(resolvedPath),
        new Promise((_, rej) => setTimeout(() => rej(new Error('import timeout')), timeoutMs))
      ])
      logMessage('SUCCESS', 'IMPORT', `import ok (${attempt}/${retries}) path=${resolvedPath} took=${Date.now()-attemptStart}ms`)
      return mod
    } catch (err) {
      logMessage('ERROR', 'IMPORT', `import failed attempt ${attempt}/${retries} for ${resolvedPath}: ${err?.message || err}`)
      try {
        if (resolvedPath.startsWith('file://')) {
          const filePath = new URL(resolvedPath).pathname
          if (fs.existsSync(filePath)) {
            const st = fs.statSync(filePath)
            logMessage('DEBUG', 'IMPORT', `file size: ${st.size} bytes (${filePath})`)
          }
        } else {
          if (fs.existsSync(modulePath)) {
            const st = fs.statSync(modulePath)
            logMessage('DEBUG', 'IMPORT', `file size: ${st.size} bytes (${modulePath})`)
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
let jidDecode
let jidNormalizedUser
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
let reconnectTimer = null
let reconnectAttempts = 0

// Comandos especiales que pueden puentear algunos filtros.
const controlSet = new Set([
  '/activate', '/activar',
  '/deactivate', '/desactivar',
  '/start', '/stop',
  '/bot'
])

// 🔁 AHORA EL ROUTER PRINCIPAL ES handler.js
let routerPath = './handler.js'
export function setMessageRouterModulePath(p) {
  routerPath = String(p || routerPath)
}

const processedMessageIds = new Set()

// Limpieza periódica de IDs procesados para evitar fugas de memoria
setInterval(() => {
  if (processedMessageIds.size > 2000) {
    processedMessageIds.clear()
    logMessage('INFO', 'SYSTEM', 'Limpiando caché de IDs de mensajes procesados')
  }
}, 10 * 60 * 1000) // Cada 10 minutos

/* ===== Getters y Chequeo de Sesión ===== */
export async function checkSessionState(authPath = null) {
  const effectivePath = authPath || path.resolve(process.env.AUTH_DIR || DEFAULT_AUTH_DIR)
  const credsPath = path.join(effectivePath, 'creds.json')
  const hasCreds = fs.existsSync(credsPath)

  logMessage('INFO', 'SESSION', `Checking session state at: ${effectivePath}`, { hasCreds })

  if (hasCreds) {
    return { hasCreds: true, authPath: effectivePath }
  }
  return { hasCreds: false, authPath: effectivePath }
}

export async function clearWhatsAppSession(authPath = null) {
  const baseDir = authPath || savedAuthPath || (process.env.AUTH_DIR || DEFAULT_AUTH_DIR)
  const resolved = path.resolve(baseDir)

  try {
    await teardownSocket()
  } catch (e) {
    logMessage('WARN', 'SESSION', 'Error al cerrar el socket antes de limpiar', { error: e?.message })
  }

  qrCode = null
  qrCodeImage = null
  currentPairingCode = null
  currentPairingNumber = null
  currentPairingGeneratedAt = null
  currentPairingExpiresAt = null
  pairingTargetNumber = null
  connectionStatus = 'disconnected'

  try {
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true })
      logMessage('SUCCESS', 'SESSION', `Sesion limpiada en ${resolved}`)
    } else {
      logMessage('INFO', 'SESSION', `No hay datos de sesion en ${resolved} para limpiar`)
    }
  } catch (e) {
    logMessage('ERROR', 'SESSION', 'No se pudo limpiar la sesion de WhatsApp', { error: e?.message })
    throw e
  }

  try {
    fs.mkdirSync(resolved, { recursive: true })
  } catch (e) {
    logMessage('WARN', 'SESSION', 'No se pudo recrear el directorio de sesion', { error: e?.message })
  }

  savedAuthPath = resolved
  return resolved
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
    logMessage('ERROR', 'GROUPS', 'Error fetching groups', { error: e?.message || e })
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
  logMessage('INFO', 'AUTH', `Auth method set to: ${normalizedMethod}`, { phoneNumber: pairingTargetNumber })
  return pairingTargetNumber
}

async function teardownSocket() {
  try {
    if (!sock) return
    try { sock.ev?.removeAllListeners?.() } catch (e) { logMessage('WARN', 'TEARDOWN', 'removeAllListeners failed', { error: e?.message }) }
    try { sock.ws?.close?.() } catch (e) { logMessage('WARN', 'TEARDOWN', 'ws.close failed', { error: e?.message }) }
    try { sock.end?.() } catch (e) { logMessage('WARN', 'TEARDOWN', 'end failed', { error: e?.message }) }
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
      logMessage('WARN', 'SEND', 'Failed to send message after retry', { jid, error: e2?.message })
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
    logMessage('WARN', 'QR', 'primary method failed', { error: e?.message })
    try {
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'qr.txt'), qr)
    } catch (e2) {
      logMessage('ERROR', 'QR', 'fallback also failed', { error: e2?.message })
    }
  }
}

/* ===== Conexión principal ===== */
export async function connectToWhatsApp(
  authPath = (process.env.AUTH_DIR || DEFAULT_AUTH_DIR),
  usePairingCode = false,
  phoneNumber = null,
  options = {}
) {
  const baileysAPI = await loadBaileys()
  const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    jidDecode: baileyJidDecode,
    jidNormalizedUser: baileyJidNormalizedUser
  } = baileysAPI

  jidDecode = baileyJidDecode
  jidNormalizedUser = baileyJidNormalizedUser

  savedAuthPath = path.resolve(authPath)
  try {
    fs.mkdirSync(savedAuthPath, { recursive: true })
    logMessage('DEBUG', 'AUTH', `Directorio de auth creado/verificado: ${savedAuthPath}`)
  } catch (e) {
    logMessage('ERROR', 'AUTH', `Error creando directorio auth: ${savedAuthPath}`, { error: e.message })
  }

  const { state, saveCreds } = await useMultiFileAuthState(savedAuthPath)

  // Wrapper para loguear saveCreds
  const saveCredsWrapped = async () => {
    try {
      logMessage('DEBUG', 'AUTH', `Guardando credenciales en ${savedAuthPath}`)
      await saveCreds()
      logMessage('DEBUG', 'AUTH', `Credenciales guardadas exitosamente`)
    } catch (e) {
      logMessage('ERROR', 'AUTH', `Error guardando credenciales`, { error: e.message })
    }
  }

  const waVersion = await resolveWaVersion(fetchLatestBaileysVersion)
  const browser = Browsers.macOS('Chrome')

  // Initialize the store
  const store = initStore()

  const envPairNumber = sanitizePhoneNumberInput(process.env.PAIR_NUMBER)
  let runtimeNumber = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || envPairNumber)
  const isRegistered = !!state?.creds?.registered

  let wantPair = usePairingCode || authMethod === 'pairing'

  if (isRegistered) {
    logMessage('INFO', 'CONNECT', 'Sesión existente detectada. Usando credenciales guardadas.')
    wantPair = false
  }

  if (wantPair && !isRegistered && !runtimeNumber) {
    logMessage('WARN', 'CONNECT', 'No se proporcionó número de teléfono. Cambiando a modo QR.')
    wantPair = false
  }

  pairingTargetNumber = wantPair ? runtimeNumber : null
  authMethod = wantPair ? 'pairing' : 'qr'

  const finalAuthMethod = isRegistered ? 'existing_session' : authMethod

  const autoReconnect = options?.autoReconnect !== false
  const registerConnectionHandler = options?.registerConnectionHandler !== false
  const registerMessageHandler = options?.registerMessageHandler !== false
  const printQRInTerminalOpt =
    typeof options?.printQRInTerminal === 'boolean'
      ? options.printQRInTerminal
      : (finalAuthMethod === 'qr')

  const QUIET = String(process.env.QUIET_LOGS || 'false').toLowerCase() === 'true'
  const infoLog = (...a) => { if (!QUIET) console.log(...a) }

  logMessage('INFO', 'CONNECT', `Modo de autenticación: ${finalAuthMethod.toUpperCase()}`)
  if (finalAuthMethod === 'pairing') logMessage('INFO', 'CONNECT', `Número objetivo: +${pairingTargetNumber}`)

  if (usePairingCode) {
    pairingCodeRequestedForSession = false
  }

  connectionStatus = 'connecting'
  await teardownSocket()
  await sleep(500)

  // ============ CREAR SOCKET ============
  sock = makeWASocket({
    auth: state,
    store,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: printQRInTerminalOpt,
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
    throw new Error('❌ Failed to create WhatsApp socket')
  }

  if (!sock.ev || typeof sock.ev.on !== 'function') {
    logMessage('ERROR', 'SOCKET', 'Socket creado pero ev.on no está disponible')
    throw new Error('Socket event emitter not properly initialized')
  }

  logMessage('SUCCESS', 'SOCKET', 'Socket creado correctamente')
  logMessage('INFO', 'SOCKET', 'Event emitter disponible: true')

  // ============ REGISTRAR EVENTOS ============
  try {
    sock.ev.on('creds.update', saveCredsWrapped)
    logMessage('SUCCESS', 'EVENTS', 'Evento creds.update registrado')
  } catch (e) {
    logMessage('ERROR', 'EVENTS', 'Error registrando creds.update', { error: e.message })
    throw e
  }

  // Mapear nombres de grupos/contactos para logs legibles
  try {
    if (registerMessageHandler) attachNameListeners(sock)
  } catch {}

  // ====== PRELOAD: router/module de comandos ======
  if (registerMessageHandler) {
    ;(async () => {
      try {
        const resolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath)
        logMessage('INFO', 'ROUTER', `Intentando pre-cargar router: ${resolved}`)
        const mod = await tryImportModuleWithRetries(resolved, { retries: 4, timeoutMs: 20000, backoffMs: 1500 })
        global.__APP_ROUTER_MODULE = mod
        global.__APP_DISPATCH = mod?.dispatch || mod?.default?.dispatch || mod?.default || null
        if (global.__APP_DISPATCH) logMessage('SUCCESS', 'ROUTER', 'dispatch precargado correctamente')
        else logMessage('WARN', 'ROUTER', 'router cargado pero no expone dispatch')
      } catch (e) {
        logMessage('ERROR', 'ROUTER', 'fallo al pre-cargar router', { error: e?.message || e })
        global.__APP_ROUTER_MODULE = null
        global.__APP_DISPATCH = null
      }
    })()
  }

  // ====== EVENTO: connection.update ======
  if (registerConnectionHandler) try {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update || {}
      const isAuthenticated = !!state?.creds?.registered || connection === 'open'

      if (qr && finalAuthMethod === 'qr' && !isAuthenticated) {
        qrCode = qr
        await saveQrArtifacts(qr, path.join(savedAuthPath, 'qr'))
        logMessage('SUCCESS', 'QR', 'QR code generado - Escanea con tu WhatsApp')
      }

      if (finalAuthMethod === 'pairing' && !pairingCodeRequestedForSession && !!pairingTargetNumber && !isAuthenticated) {
        if (connection !== 'open' && connection !== 'connecting') {
          return
        }

        pairingCodeRequestedForSession = true
        await sleep(2000)

        try {
          const number = onlyDigits(pairingTargetNumber)
          if (!number) {
            logMessage('ERROR', 'PAIRING', 'Número inválido para vinculación.')
            return
          }
          if (typeof sock.requestPairingCode !== 'function') {
            logMessage('WARN', 'PAIRING', 'La versión de Baileys no soporta códigos de emparejamiento.')
            return
          }

          logMessage('INFO', 'PAIRING', `Solicitando código de vinculación para +${number} con código personalizado "${CUSTOM_PAIRING_CODE}"...`)

          const code = await sock.requestPairingCode(number, CUSTOM_PAIRING_CODE)

          if (code) {
            const formatted = String(code).toUpperCase().replace(/[-\s]/g, '')
            const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-')

            currentPairingCode = grouped
            currentPairingNumber = number
            currentPairingGeneratedAt = new Date()
            currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

            if (!QUIET) {
              console.log('\n╔═══════════════════════════════════════╗')
              console.log('║   ✅ CÓDIGO DE VINCULACIÓN GENERADO ✅  ║')
              console.log('╠═══════════════════════════════════════╣')
              console.log(`║  📞 Número: +${number.padEnd(30)} ║`)
              console.log(`║  🔐 Código: ${grouped.padEnd(30)} ║`)
              console.log(`║  🎯 Custom: ${CUSTOM_PAIRING_CODE.padEnd(30)} ║`)
              console.log('║  ⏰ Válido por 10 minutos               ║')
              console.log('╠═══════════════════════════════════════╣')
              console.log('║  📱 En tu teléfono:                    ║')
              console.log('║  1. WhatsApp > Dispositivos vinculados  ║')
              console.log('║  2. Vincular con número de teléfono     ║')
              console.log('║  3. Ingresa el código de arriba         ║')
              console.log('╚═══════════════════════════════════════╝\n')
            }

            logMessage('SUCCESS', 'PAIRING', `Código de vinculación generado: ${grouped}`)
          } else {
            logMessage('WARN', 'PAIRING', 'No se pudo generar el código.')
          }
        } catch (e) {
          logMessage('ERROR', 'PAIRING', 'Error durante la solicitud de vinculación', { error: e?.message || e, stack: e?.stack || e })
        }
      }

      // Conectado
      if (connection === 'open') {
        connectionStatus = 'connected'
        qrCode = null
        qrCodeImage = null
        pairingCodeRequestedForSession = false
        reconnectAttempts = 0
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        logMessage('SUCCESS', 'CONNECTION', 'Bot conectado exitosamente')

        try {
          const normalizeJidDigits = (jid) => {
            let s = String(jid || '')
            const at = s.indexOf('@')
            if (at > 0) s = s.slice(0, at)
            const colon = s.indexOf(':')
            if (colon > 0) s = s.slice(0, colon)
            return s.replace(/\D/g, '')
          }
          const botNum = normalizeJidDigits(sock?.user?.id)
          if (botNum) {
            global.BOT_BASE_NUMBER = botNum
            const envOwner = normalizeJidDigits(process.env.OWNER_WHATSAPP_NUMBER || '')
            const primaryOwner = envOwner || botNum
            setPrimaryOwner(primaryOwner, envOwner ? 'Owner (Env)' : 'Owner (Base)')
            logMessage('INFO', 'BOT', `Bot número: ${botNum}`)
          }
        } catch (e) {
          logger.error(`Error setting primary owner: ${e.message}`)
        }

        try {
          const mod = await import('./src/services/subbot-manager.js')
          const clean = await mod.cleanOrphanSubbots?.().catch(() => 0)
          const restored = await mod.restoreActiveSubbots?.().catch(() => 0)
          logMessage('INFO', 'SUBBOTS', `Auto-start: restaurados=${restored||0}, limpieza=${clean||0}`)

          // Limpieza periodica de subbots huйrfanos mientras el bot esta corriendo
          const intervalMs = parseInt(process.env.SUBBOT_CLEANUP_INTERVAL_MS ?? '600000', 10) // 10 min por defecto
          if (!globalThis.__SUBBOT_CLEAN_TIMER && Number.isFinite(intervalMs) && intervalMs > 0) {
            globalThis.__SUBBOT_CLEAN_TIMER = setInterval(async () => {
              try {
                const mod2 = await import('./src/services/subbot-manager.js')
                const removed = await mod2.cleanOrphanSubbots?.().catch(() => 0)
                if (removed) {
                  logMessage('INFO', 'SUBBOTS', `Cleanup periodicamente: ${removed} subbots eliminados`)
                }
              } catch (err) {
                logMessage('WARN', 'SUBBOTS', 'Error en cleanup periodico de subbots', { error: err?.message })
              }
            }, intervalMs)
            logMessage('INFO', 'SUBBOTS', `Servicio de cleanup periodico iniciado (cada ${Math.round(intervalMs/60000)} min)`)
          }
        } catch (e) {
          logMessage('WARN', 'SUBBOTS', 'Failed to auto-start subbots', { error: e?.message })
        }
        return
      }

      // Desconectado
      if (connection === 'close') {
        const err = lastDisconnect?.error
        const status = err?.output?.statusCode || err?.code
        const msg = err?.message || ''

        const shouldReconnect = status !== DisconnectReason.loggedOut && status !== 401 && status !== 403

        connectionStatus = shouldReconnect ? 'reconnecting' : 'disconnected'

        if (status === 428) {
          connectionStatus = 'waiting_pairing'
          logMessage('INFO', 'CONNECTION', 'Esperando que ingreses el código de vinculación en tu teléfono...')
          return
        }

        if (shouldReconnect) {
          if (!autoReconnect) {
            logMessage('WARN', 'CONNECTION', 'Conexion cerrada. Auto-reconnect deshabilitado.')
            return
          }

          if (reconnectTimer) return

          reconnectAttempts = Math.min(reconnectAttempts + 1, 8)
          const backoff = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempts))
          logMessage('WARN', 'CONNECTION', `Conexión cerrada (status ${status || '?'}: ${msg || 'sin detalles'}). Auto-reintentando en ${backoff}ms...`)

          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connectToWhatsApp(savedAuthPath, false, null, options).catch((e) => {
              logMessage('ERROR', 'RECONNECT', 'Fallo al reconectar', { error: e?.message })
            })
          }, backoff)
        } else {
          logMessage('ERROR', 'CONNECTION', 'Sesión cerrada permanentemente (LoggedOut/401/403). Por favor, inicia sesión de nuevo.')
          qrCode = null
          qrCodeImage = null
          reconnectAttempts = 0
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }
        }
        return
      }
    })
    logMessage('SUCCESS', 'EVENTS', 'Evento connection.update registrado')
  } catch (e) {
    logMessage('ERROR', 'EVENTS', 'Error registrando connection.update', { error: e.message })
    throw e
  }

  // ====== EVENTO: messages.upsert ======
  if (registerMessageHandler) try {
    sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      let mgr = null
      const ensureMgr = async () => {
        if (mgr) return mgr
        try { mgr = await import('./src/services/subbot-manager.js') } catch (e) {
          logMessage('ERROR', 'MANAGER', 'import failed', { error: e?.message })
          mgr = null
        }
        return mgr
      }
      const ignoreGating = String(process.env.BOT_IGNORE_GATING || 'false').toLowerCase() === 'true'

      for (const m of messages) {
        try {
          const id = m?.key?.id
          if (id && processedMessageIds.has(id)) continue
          if (id) processedMessageIds.add(id)

          const fromMe = !!m?.key?.fromMe
          if (fromMe) {
            const raw = extractTextFromMessage(m)
            const isCommand = /^[\/!.#?$~]/.test(raw)
            const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase()
            const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && isCommand)
            if (!allow) continue
          }

          const mm = await ensureMgr()
          const remoteJid = m?.key?.remoteJid || ''
          const rawText = extractTextFromMessage(m)
          const firstToken = /^[\\/!.#?$~]/.test(rawText) ? rawText.split(/\s+/)[0].toLowerCase() : ''
          const bypassCmd = controlSet.has(firstToken)

          try {
            const { logIncomingMessage } = await import('./src/utils/utils/wa-logging.js')
            await logIncomingMessage(m)
          } catch (e) {
            logMessage('WARN', 'LOGGING', 'logIncomingMessage failed', { error: e?.message })
          }

          const isGroup = remoteJid.endsWith('@g.us')
          if (isGroup && !fromMe) {
            try {
              const { getGroupBool, getGroupNumber, getGroupConfig } = await import('./src/utils/utils/group-config.js')
              const body = rawText

              const slow = await getGroupNumber(remoteJid, 'slowmode_s', 0)
              if (slow > 0) {
                global.__slowmodeMap = global.__slowmodeMap || new Map()
                const user = m?.key?.participant || m?.participant || m?.key?.remoteJid
                const k = `${remoteJid}|${user}`
                const last = global.__slowmodeMap.get(k) || 0
                const now = Date.now()
                if (now - last < slow * 1000) {
                  await sock.sendMessage(remoteJid, { text: `🢂 Slowmode: espera ${Math.ceil((slow * 1000 - (now - last)) / 1000)}s`, mentions: user ? [user] : undefined }, { quoted: m })
                  continue
                }
                global.__slowmodeMap.set(k, now)
              }

              const antifloodOn = await getGroupBool(remoteJid, 'antiflood_on', false)
              if (antifloodOn) {
                const rate = await getGroupNumber(remoteJid, 'antiflood_rate', 5)
                global.__floodMap = global.__floodMap || new Map()
                const user = m?.key?.participant || m?.participant || m?.key?.remoteJid
                const k = `${remoteJid}|${user}`
                const now = Date.now()
                const entry = global.__floodMap.get(k) || { ts: now, c: 0 }
                if (now - entry.ts > 10000) {
                  entry.ts = now
                  entry.c = 0
                }
                entry.c += 1
                global.__floodMap.set(k, entry)
                if (entry.c > rate) {
                  const mode = await getGroupConfig(remoteJid, 'antiflood_mode', 'warn')
                  if (mode === 'kick') {
                    await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} expulsado.`, mentions: [user] }, { quoted: m })
                    await sock.groupParticipantsUpdate(remoteJid, [user], 'remove')
                    continue
                  } else {
                    await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user || '').split('@')[0]} baja la velocidad.`, mentions: [user] }, { quoted: m })
                  }
                }
              }

              const antilinkOn = await getGroupBool(remoteJid, 'antilink', false)
              if (antilinkOn && /https?:\/\//i.test(body)) {
                const user = m?.key?.participant || m?.participant
                const mode = await getGroupConfig(remoteJid, 'antilink_mode', 'warn')
                if (mode === 'kick') {
                  await sock.sendMessage(remoteJid, { text: `🔗 Antilink: @${String(user || '').split('@')[0]} expulsado por enviar enlaces.`, mentions: user ? [user] : undefined }, { quoted: m })
                  await sock.groupParticipantsUpdate(remoteJid, [user], 'remove')
                  continue
                } else {
                  await sock.sendMessage(remoteJid, { text: `🔗 Antilink activo. @${String(user || '').split('@')[0]} evita enviar enlaces.`, mentions: user ? [user] : undefined }, { quoted: m })
                }
              }
            } catch (e) {
              logMessage('WARN', 'GROUP-ENFORCERS', 'Error applying group rules', { error: e?.message })
            }
          }

          await handleMessage(m, sock, '[MAIN]')
        } catch (e) {
          logMessage('ERROR', 'MESSAGE-HANDLER', 'outer handler error', { error: e?.message || e })
        }
      }
    })
    logMessage('SUCCESS', 'EVENTS', 'Evento messages.upsert registrado')
  } catch (e) {
    logMessage('ERROR', 'EVENTS', 'Error registrando messages.upsert', { error: e.message })
    throw e
  }

  // ====== EVENTO: group-participants.update ======
  if (registerMessageHandler) try {
    sock.ev.on('group-participants.update', async (ev) => {
      try {
        const { id: jid, action, participants } = ev
        if (!jid || !Array.isArray(participants) || participants.length === 0) return

        const { getGroupBool, getGroupConfig } = await import('./src/utils/utils/group-config.js')
        const welcomeOn = await getGroupBool(jid, 'welcome_on', false)
        if (!welcomeOn) return

        const tmpl = await getGroupConfig(jid, 'welcome_text', '👋 Bienvenido @user a @group')
        if (action === 'add') {
          const meta = await sock.groupMetadata(jid)
          const gname = meta?.subject || 'el grupo'
          for (const p of participants) {
            const user = `@${String(p || '').split('@')[0]}`
            const text = tmpl.replace(/@user/gi, user).replace(/@group/gi, gname)
            await sock.sendMessage(jid, { text, mentions: [p] })
          }
        }
      } catch (e) {
        logMessage('ERROR', 'WELCOME', 'Error welcoming new participants', { error: e.message })
      }
    })
    logMessage('SUCCESS', 'EVENTS', 'Evento group-participants.update registrado')
  } catch (e) {
    logMessage('ERROR', 'EVENTS', 'Error registrando group-participants.update', { error: e.message })
    throw e
  }

  // Adjuntar método personalizado
  try {
    sock.getCurrentPairingInfo = getCurrentPairingInfo
    logMessage('SUCCESS', 'SOCKET', 'Método getCurrentPairingInfo adjuntado')
  } catch (e) {
    logMessage('WARN', 'SOCKET', 'setting getCurrentPairingInfo failed', { error: e?.message })
  }

  logMessage('SUCCESS', 'SOCKET', 'Socket completamente inicializado')
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
    logMessage('WARN', 'PAIRING', 'cleaning old auth failed', { error: e?.message })
  }
  try { fs.mkdirSync(effective, { recursive: true }) } catch (e) {
    logMessage('WARN', 'PAIRING', 'mkdir failed', { error: e?.message })
  }

  pairingTargetNumber = normalized
  authMethod = 'pairing'

  logMessage('INFO', 'PAIRING', `Usando código personalizado: ${CUSTOM_PAIRING_CODE}`)

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
      return { success: false, message: 'Socket no disponible' }
    }

    if (connectionStatus === 'connected') {
      return { success: false, message: 'El bot ya está conectado' }
    }

    if (typeof sock.requestPairingCode !== 'function') {
      return { success: false, message: 'La versión de Baileys no soporta códigos de emparejamiento' }
    }

    const phoneNumber = process.env.OWNER_WHATSAPP_NUMBER || process.env.PAIR_NUMBER
    if (!phoneNumber) {
      return { success: false, message: 'Número de teléfono no configurado' }
    }

    const normalizedNumber = onlyDigits(phoneNumber)
    if (!normalizedNumber || normalizedNumber.length < 8) {
      return { success: false, message: 'Número de teléfono inválido' }
    }

    logMessage('INFO', 'PAIRING', `Solicitando código de emparejamiento con "${CUSTOM_PAIRING_CODE}" para +${normalizedNumber}...`)

    const code = await sock.requestPairingCode(normalizedNumber, CUSTOM_PAIRING_CODE)

    if (code) {
      const formatted = String(code).toUpperCase().replace(/[-\s]/g, '')
      const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-')

      currentPairingCode = grouped
      currentPairingNumber = normalizedNumber
      currentPairingGeneratedAt = new Date()
      currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

      console.log('\n╔═══════════════════════════════════════╗')
      console.log('║   ✅ CÓDIGO DE VINCULACIÓN GENERADO ✅  ║')
      console.log('╠═══════════════════════════════════════╣')
      console.log(`║  📞 Número: +${normalizedNumber.padEnd(30)} ║`)
      console.log(`║  🔐 Código: ${grouped.padEnd(30)} ║`)
      console.log(`║  🎯 Custom: ${CUSTOM_PAIRING_CODE.padEnd(30)} ║`)
      console.log('║  ⏰ Válido por 10 minutos               ║')
      console.log('╠═══════════════════════════════════════╣')
      console.log('║  📱 En tu teléfono:                    ║')
      console.log('║  1. WhatsApp > Dispositivos vinculados  ║')
      console.log('║  2. Vincular con número de teléfono     ║')
      console.log('║  3. Ingresa el código de arriba         ║')
      console.log('╚═══════════════════════════════════════╝\n')

      return { success: true, code: grouped, number: normalizedNumber, customCode: CUSTOM_PAIRING_CODE }
    } else {
      return { success: false, message: 'No se pudo generar el código de emparejamiento' }
    }

  } catch (error) {
    logMessage('ERROR', 'PAIRING', 'Error generando código de emparejamiento', { error: error.message })
    return { success: false, message: `Error: ${error.message}` }
  }
}

// ==========================================================
// ✅ FUNCIÓN CORREGIDA: handleMessage con LOGS DETALLADOS + RECUADRO
// ==========================================================

// ============================================
// REEMPLAZAR LA FUNCIÓN handleMessage COMPLETA
// Busca "export async function handleMessage" y reemplaza TODO hasta el final
// ============================================

export async function handleMessage(message, customSock = null, prefix = '', runtimeContext = {}) {
  const s = customSock || sock;
  if (!s || !message || !message.key) return;

  const { remoteJid } = message.key;
  if (!remoteJid) return;

  const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
  const isChannel = typeof remoteJid === 'string' && remoteJid.endsWith('@newsletter');
  const fromMe = !!message?.key?.fromMe;

  // ✅ USAR LA FUNCIÓN CORRECTA DE EXTRACCIÓN
  const rawText = extractText(message);
  const pushName = message?.pushName || null;

  // ✅ LOG DE DEBUG CRÍTICO
  if (process.env.TRACE_ROUTER === 'true') {
    logMessage('DEBUG', 'MESSAGE', 'Texto extraído del mensaje', {
      rawText,
      length: rawText.length,
      isCommand: /^[\\/!.#?$~]/.test(rawText),
      remoteJid,
      fromMe
    });
  }

  const isCommand = /^[\\/!.#?$~]/.test(rawText);

  const messageType = isChannel ? 'CHANNEL' : (isGroup ? 'GROUP' : 'DM');
  const messageSource = fromMe ? 'FROM_BOT' : 'FROM_USER';

  // Normalizar botJid
  const botJidRaw = s.user?.id;
  let botJid = botJidRaw;

  if (botJidRaw && typeof jidNormalizedUser === 'function') {
    try {
      botJid = jidNormalizedUser(botJidRaw);
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidNormalizedUser falló: ${e.message}`);
    }
  }

  if (botJid === botJidRaw && typeof jidDecode === 'function') {
    try {
      const decoded = jidDecode(botJidRaw);
      if (decoded && decoded.user && decoded.server) {
        botJid = `${decoded.user}@${decoded.server}`;
      }
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidDecode falló: ${e.message}`);
    }
  }

  if (botJid === botJidRaw && botJidRaw) {
    const match = String(botJidRaw).match(/^(\d+)/);
    if (match) {
      botJid = `${match[1]}@s.whatsapp.net`;
    }
  }

  let botNumber = null;
  try {
    botNumber = botJid ? (typeof jidDecode === 'function' ? jidDecode(botJid)?.user : null) : null;
    if (!botNumber) {
      botNumber = onlyDigits(botJid || '');
    }
  } catch {
    botNumber = onlyDigits(botJid || '');
  }

  // Normalizadores para comparar JIDs / LIDs sin falsos positivos (p.ej. @lid sin dÃ­gitos)
  const normalizeComparableKey = (userOrJid) => {
    try {
      const raw = String(userOrJid || '').trim().toLowerCase()
      if (!raw) return { type: 'none', value: '' }

      // Eliminar sufijos de dispositivo (:xx) para que id/lid comparen correctamente
      let normalized = raw
      const colon = normalized.indexOf(':')
      if (colon > 0) normalized = normalized.slice(0, colon)

      // Para dÃ­gitos usar la parte antes del @ (si existe)
      let base = normalized
      const at = base.indexOf('@')
      if (at > 0) base = base.slice(0, at)

      const digits = base.replace(/[^0-9]/g, '')
      if (digits) return { type: 'digits', value: digits }

      // Fallback: comparar string completo (incluye @lid o dominio)
      return { type: 'raw', value: normalized }
    } catch {
      return { type: 'none', value: '' }
    }
  }

  const sameUser = (a, b) => {
    if (!a || !b) return false
    const ka = normalizeComparableKey(a)
    const kb = normalizeComparableKey(b)
    if (!ka.value || !kb.value) return false
    if (ka.type === 'digits' && kb.type === 'digits') return ka.value === kb.value
    return ka.value === kb.value
  }

  const isAdminFlag = (p) => {
    try {
      if (!p) return false
      const admin = String(p.admin || p.privilege || '').toLowerCase()
      if (admin === 'admin' || admin === 'superadmin' || admin === 'owner') return true
      return false
    } catch {
      return false
    }
  }

  const participantMatches = (participant, target) => {
    if (!participant || !target) return false
    return (
      sameUser(participant.id, target) ||
      sameUser(participant.jid, target) ||
      sameUser(participant.lid, target)
    )
  }

  const sender = isGroup ? message.key.participant || remoteJid : remoteJid;
  let senderNumber = null;
  try {
    senderNumber = sender ? (typeof jidDecode === 'function' ? jidDecode(sender)?.user : null) : null;
    if (!senderNumber) {
      senderNumber = onlyDigits(sender || '');
    }
  } catch {
    senderNumber = onlyDigits(sender || '');
  }

  const chatName = await resolveChatName(remoteJid, s, isGroup ? null : pushName);
  const senderName = await resolveChatName(sender, s, pushName);
  const chatDisplay = getDisplayChat(remoteJid, chatName);
  const senderLabel = senderName || senderNumber || sender || 'desconocido';

  const envOwnerNumber = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '');
  const isOwner =
    !!(envOwnerNumber && senderNumber && senderNumber === envOwnerNumber) ||
    (typeof isSuperAdmin === 'function' ? !!isSuperAdmin(sender) : false);

  const allowMessageLog = shouldLog('INFO', messageType) && (!MINIMAL_LOGS || !fromMe);

  if (allowMessageLog && isCommand) {
    prettyPrintMessageLog({
      remoteJid,
      chatName,
      senderNumber,
      senderName,
      text: rawText,
      isCommand,
      isGroup,
      isChannel,
      fromMe
    });
  }

  let isAdmin = false;
  let isBotAdmin = false;
  let groupMetadata = null;

  if (isCommand) {
    const commandName = rawText.split(/\s+/)[0];
    logMessage('COMMAND', messageType, `Comando detectado: ${commandName}`, {
      fullText: rawText,
      sender: senderNumber,
      isOwner,
      isGroup
    });
  }

  if (isGroup && isCommand) {
    try {
      // Cache corto para evitar rate-limit/latencia al spamear comandos.
      globalThis.__GROUP_META_CACHE = globalThis.__GROUP_META_CACHE || new Map()
      const cacheKey = remoteJid
      const cached = globalThis.__GROUP_META_CACHE.get(cacheKey)
      const ttlMs = parseInt(process.env.GROUP_META_CACHE_TTL_MS || '30000', 10)
      const useCache = cached && Number.isFinite(ttlMs) && ttlMs > 0 && (Date.now() - (cached.ts || 0) < ttlMs)

      if (useCache) {
        groupMetadata = cached.meta
      } else {
        groupMetadata = await s.groupMetadata(remoteJid)
        try {
          globalThis.__GROUP_META_CACHE.set(cacheKey, { ts: Date.now(), meta: groupMetadata })
          if (globalThis.__GROUP_META_CACHE.size > 2000) globalThis.__GROUP_META_CACHE.clear()
        } catch {}
      }
      cacheChatName(remoteJid, groupMetadata?.subject);

      const participants = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : []

      const participantInfo = participants.find((p) => participantMatches(p, sender))
      isAdmin = isAdminFlag(participantInfo)

      const botIds = [botJid, botJidRaw, s.user?.lid].filter(Boolean)
      const botInfo = participants.find((p) => botIds.some((id) => participantMatches(p, id)))
      isBotAdmin = isAdminFlag(botInfo) || !!isOwner
    } catch (e) {
      // Fallback a cache si existe
      try {
        const cached = globalThis.__GROUP_META_CACHE?.get(remoteJid)
        if (cached?.meta) groupMetadata = cached.meta
      } catch {}
      logMessage('WARN', 'METADATA', `Error obteniendo metadata: ${e.message}`);
    }
  }

  let usuarioName = null;
  try {
    if (isGroup && groupMetadata && Array.isArray(groupMetadata.participants)) {
      const p = groupMetadata.participants.find((x) => participantMatches(x, sender));
      usuarioName = p?.notify || p?.name || null;
    }
  } catch (e) {}

  // ✅ CONTEXTO COMPLETO CON TEXTO EXTRAÍDO
  const ctx = {
    sock: s,
    message,
    key: message.key,
    remoteJid,
    sender,
    senderNumber,
    text: rawText, // ✅ CRÍTICO: Pasar el texto extraído
    isGroup,
    isChannel,
    fromMe,
    botJid,
    botNumber,
    isOwner,
    isAdmin,
    isBotAdmin,
    groupMetadata,
    pushName,
    usuarioName,
    participant: message.key.participant || null,
    ...runtimeContext,
  };

  // Filtro de mensajes propios
  if (fromMe) {
    const isCmd = /^[\/!.#?$~]/.test(rawText);
    const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase();
    if (!(mode === 'all' || (mode === 'commands' && isCmd))) {
      return;
    }
  }

  // Auto-read
  const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true';
  if (autoRead && message?.key?.id) {
    try {
      await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }]);
    } catch (e) {}
  }

  // ✅ DISPATCH MEJORADO
  try {
    let dispatch = null;

    if (global.__APP_DISPATCH && typeof global.__APP_DISPATCH === 'function') {
      dispatch = global.__APP_DISPATCH;
    } else {
      try {
        const routerResolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath);
        const mod = await tryImportModuleWithRetries(routerResolved, { retries: 3, timeoutMs: 20000, backoffMs: 1000 });
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default;
        if (dispatch) {
          global.__APP_ROUTER_MODULE = mod;
          global.__APP_DISPATCH = dispatch;
          logMessage('SUCCESS', 'ROUTER', 'dispatch cargado correctamente y cacheado');
        }
      } catch (e) {
        logMessage('ERROR', 'ROUTER', 'Error importando router dinámico', { error: e?.message });
      }
    }

    if (typeof dispatch === 'function') {
      const handled = await dispatch(ctx, runtimeContext);

      if (process.env.TRACE_ROUTER === 'true') {
        logMessage('INFO', 'DISPATCH', `Resultado: ${handled === true ? '✅ MANEJADO' : '⏭️ NO MANEJADO'}`, {
          command: rawText.split(/\s+/)[0],
          handled
        });
      }

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
    logMessage('ERROR', 'HANDLER', 'Error en dispatch', { error: e?.message, stack: e?.stack });
  }
}
