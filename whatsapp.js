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
import { initStore } from './src/utils/utils/store.js'

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

const SHOW_LOG_DETAILS =
  (process.env.LOG_DETAILS || "").toLowerCase() === "true"

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
  const formattedLog = formatLog(level, source, message, data)

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
    senderNumber,
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
    ? '📣 MENSAJE DE CANAL'
    : isGroup
      ? '👥 MENSAJE DE GRUPO'
      : '💬 MENSAJE PRIVADO'

  const who = fromMe ? 'BOT' : 'USUARIO'
  const tipo = isChannel ? 'CANAL' : isGroup ? 'GRUPO' : 'PRIVADO'

  const cleanText = (text || '').replace(/\s+/g, ' ').trim()
  const contentWidth = maxWidth - 2
  let preview = cleanText || '(sin texto)'

  if (preview.length > contentWidth - 3) {
    preview = preview.slice(0, contentWidth - 6) + '...'
  }

  const pad = (s = '') =>
    (s.length > contentWidth ? s.slice(0, contentWidth) : s.padEnd(contentWidth, ' '))

  const lines = [
    `${color}╔${'═'.repeat(maxWidth)}╗`,
    `${color}║${reset}${pad(title)}${color}║`,
    `${color}╠${'═'.repeat(maxWidth)}╣`,
    `${color}║${reset}${pad(`🧾 JID: ${remoteJid || '-'}`)}${color}║`,
    `${color}║${reset}${pad(`👤 De: ${senderNumber || 'desconocido'} (${who})`)}${color}║`,
    `${color}║${reset}${pad(`📂 Tipo: ${tipo}`)}${color}║`,
    `${color}║${reset}${pad(`⚡ Comando: ${isCommand ? 'Sí' : 'No'}`)}${color}║`,
    `${color}╠${'═'.repeat(maxWidth)}╣`,
    `${color}║${reset}${pad(preview)}${color}║`,
    `${color}╚${'═'.repeat(maxWidth)}╝${reset}`
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
  phoneNumber = null
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
  fs.mkdirSync(savedAuthPath, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(savedAuthPath)

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
    sock.ev.on('creds.update', saveCreds)
    logMessage('SUCCESS', 'EVENTS', 'Evento creds.update registrado')
  } catch (e) {
    logMessage('ERROR', 'EVENTS', 'Error registrando creds.update', { error: e.message })
    throw e
  }

  // ====== PRELOAD: router/module de comandos ======
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

  // ====== EVENTO: connection.update ======
  try {
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
            setPrimaryOwner(botNum, 'Owner (Base)')
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
          const backoff = 5000
          logMessage('WARN', 'CONNECTION', `Conexión cerrada (status ${status || '?'}: ${msg || 'sin detalles'}). Auto-reintentando en ${backoff}ms...`)

          setTimeout(() => {
            connectToWhatsApp(savedAuthPath, false, null).catch((e) => {
              logMessage('ERROR', 'RECONNECT', 'Fallo al reconectar', { error: e?.message })
            })
          }, backoff)
        } else {
          logMessage('ERROR', 'CONNECTION', 'Sesión cerrada permanentemente (LoggedOut/401/403). Por favor, inicia sesión de nuevo.')
          qrCode = null
          qrCodeImage = null
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
  try {
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
            const msg = m?.message || {}
            const raw = (
              msg?.conversation ||
              msg?.extendedTextMessage?.text ||
              msg?.imageMessage?.caption ||
              msg?.videoMessage?.caption ||
              ''
            ).trim()
            const isCommand = /^[\/!.#?$~]/.test(raw)
            const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase()
            const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && isCommand)
            if (!allow) continue
          }

          const mm = await ensureMgr()
          const remoteJid = m?.key?.remoteJid || ''
          const msg = m?.message || {}
          const rawText = (
            msg?.conversation ||
            msg?.extendedTextMessage?.text ||
            msg?.imageMessage?.caption ||
            msg?.videoMessage?.caption ||
            ''
          ).trim()
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
  try {
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
export async function handleMessage(message, customSock = null, prefix = '', runtimeContext = {}) {
  const s = customSock || sock
  if (!s || !message || !message.key) return

  const { remoteJid } = message.key
  if (!remoteJid) return

  const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
  const isChannel = typeof remoteJid === 'string' && remoteJid.endsWith('@newsletter')
  const fromMe = !!message?.key?.fromMe

  // Obtener información básica del mensaje
  const msgObj = message?.message || {}
  const rawText = (
    msgObj.conversation ||
    msgObj.extendedTextMessage?.text ||
    msgObj.imageMessage?.caption ||
    msgObj.videoMessage?.caption ||
    ''
  ).trim()

  const isCommand = /^[\\/!.#?$~]/.test(rawText)
  const cmdFirst = isCommand ? rawText.split(/\s+/)[0] : ""
  const normalizedCmd = cmdFirst ? (cmdFirst.startsWith("/") ? cmdFirst.toLowerCase() : `/${cmdFirst.slice(1).toLowerCase()}`) : ""

  const ADMIN_COMMANDS = new Set([
    '/bot',
    '/kick',
    '/promote',
    '/demote',
    '/ban',
    '/unban',
    '/warn',
    '/mute',
    '/unmute',
    '/lock',
    '/unlock',
    '/admins',
    '/admin',
    '/group',
    // Comandos que necesitan metadata/admin pero no estaban listados
    '/tag',
    '/addgroup',
    '/delgroup',
    '/debugadmin',
    '/debuggroup',
    '/whoami',
  ])

  const messageType = isChannel ? 'CHANNEL' : (isGroup ? 'GROUP' : 'DM')
  const messageSource = fromMe ? 'FROM_BOT' : 'FROM_USER'

  // ✅ CORRECCIÓN: Normalizar botJid
  const botJidRaw = s.user?.id
  let botJid = botJidRaw

  logMessage('DEBUG', 'ADMIN-CHECK', `botJidRaw inicial: ${botJidRaw}`)
  logMessage('DEBUG', 'ADMIN-CHECK', `jidNormalizedUser disponible: ${typeof jidNormalizedUser === 'function'}`)

  if (botJidRaw && typeof jidNormalizedUser === 'function') {
    try {
      botJid = jidNormalizedUser(botJidRaw)
      logMessage('SUCCESS', 'ADMIN-CHECK', `botJid normalizado con jidNormalizedUser: ${botJid}`)
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidNormalizedUser falló: ${e.message}`)
    }
  }

  if (botJid === botJidRaw && typeof jidDecode === 'function') {
    try {
      const decoded = jidDecode(botJidRaw)
      logMessage('DEBUG', 'ADMIN-CHECK', 'jidDecode result', decoded)
      if (decoded && decoded.user && decoded.server) {
        botJid = `${decoded.user}@${decoded.server}`
        logMessage('SUCCESS', 'ADMIN-CHECK', `botJid normalizado con jidDecode: ${botJid}`)
      }
    } catch (e) {
      logMessage('WARN', 'ADMIN-CHECK', `jidDecode falló: ${e.message}`)
    }
  }

  if (botJid === botJidRaw && botJidRaw) {
    const match = String(botJidRaw).match(/^(\d+)/)
    if (match) {
      botJid = `${match[1]}@s.whatsapp.net`
      logMessage('INFO', 'ADMIN-CHECK', `botJid fallback manual: ${botJid}`)
    }
  }

  let botNumber = null
  try {
    botNumber = botJid ? (typeof jidDecode === 'function' ? jidDecode(botJid)?.user : null) : null
    if (!botNumber) {
      botNumber = onlyDigits(botJid || '')
    }
  } catch {
    botNumber = onlyDigits(botJid || '')
  }

  const sender = isGroup ? message.key.participant || remoteJid : remoteJid
  let senderNumber = null
  try {
    senderNumber = sender ? (typeof jidDecode === 'function' ? jidDecode(sender)?.user : null) : null
    if (!senderNumber) {
      senderNumber = onlyDigits(sender || '')
    }
  } catch {
    senderNumber = onlyDigits(sender || '')
  }

  let ownerNumber = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '')
  if (!ownerNumber && botNumber) {
    ownerNumber = botNumber
  }
  const isOwner = !!(ownerNumber && senderNumber && senderNumber === ownerNumber)

  logMessage('INFO', messageType, `Mensaje recibido [${messageSource}]`, {
    remoteJid,
    text: rawText.substring(0, 100),
    isCommand,
    messageId: message.key.id
  })

  prettyPrintMessageLog({
    remoteJid,
    senderNumber,
    text: rawText,
    isCommand,
    isGroup,
    isChannel,
    fromMe
  })

  logMessage('INFO', 'USER-INFO', 'Identificación de usuario', {
    senderNumber,
    ownerNumber,
    isOwner,
    botNumber
  })

  let isAdmin = false
  let isBotAdmin = false
  let groupMetadata = null

  if (isCommand) {
    const commandName = rawText.split(/\s+/)[0]
    logMessage('COMMAND', messageType, `Comando detectado: ${commandName}`, {
      fullText: rawText,
      sender: senderNumber,
      isOwner,
      isGroup
    })
  }

  if (false && isGroup) {
    try {
      const shouldFetchMetadata = isCommand && ADMIN_COMMANDS.has(normalizedCmd)
      if (!shouldFetchMetadata) {
        logMessage('DEBUG', 'METADATA', 'Saltando consulta de metadata (no es comando admin)')
        throw new Error('skip_metadata_fetch')
      }

      logMessage('INFO', 'METADATA', `Obteniendo metadata del grupo: ${remoteJid}`)
      groupMetadata = await s.groupMetadata(remoteJid)

      logMessage('METADATA', 'GROUP', `Metadata obtenida exitosamente`, {
        groupId: remoteJid,
        totalParticipants: groupMetadata?.participants?.length || 0,
        groupName: groupMetadata?.subject || 'Sin nombre'
      })

      const isParticipantBot = (participant) => {
        if (!participant) return false

        const pid = participant.id
        const pLid = participant.lid
        const pJid = participant.jid

        if (pid === botJid || pid === botJidRaw) return true
        if (pLid && (pLid === botJid || pLid === botJidRaw)) return true
        if (pJid && (pJid === botJid || pJid === botJidRaw)) return true

        if (botNumber) {
          const pidNum = onlyDigits(pid || '')
          const pLidNum = pLid ? onlyDigits(pLid) : null
          const pJidNum = pJid ? onlyDigits(pJid) : null

          if (pidNum === botNumber || pLidNum === botNumber || pJidNum === botNumber) {
            return true
          }
        }

        if (typeof jidNormalizedUser === 'function') {
          try {
            const normalizedBot = jidNormalizedUser(botJid)
            const normalizedBotRaw = botJidRaw ? jidNormalizedUser(botJidRaw) : null
            const normalizedPid = jidNormalizedUser(pid)
            const normalizedPLid = pLid ? jidNormalizedUser(pLid) : null
            const normalizedPJid = pJid ? jidNormalizedUser(pJid) : null

            if (normalizedPid === normalizedBot || normalizedPid === normalizedBotRaw) return true
            if (normalizedPLid && (normalizedPLid === normalizedBot || normalizedPLid === normalizedBotRaw)) return true
            if (normalizedPJid && (normalizedPJid === normalizedBot || normalizedPJid === normalizedBotRaw)) return true
          } catch (e) {}
        }

        return false
      }

      const participantInfo = (groupMetadata.participants || []).find((p) => {
        return p.id === sender || p.lid === sender || p.jid === sender
      })
      isAdmin = !!participantInfo && (participantInfo.admin === 'admin' || participantInfo.admin === 'superadmin')

      logMessage('ADMIN', 'GROUP', `Verificación de permisos del sender`, {
        sender,
        found: !!participantInfo,
        isAdmin,
        adminLevel: participantInfo?.admin || 'member'
      })

      let botInfo = (groupMetadata.participants || []).find(isParticipantBot)

      if (botInfo) {
        isBotAdmin = botInfo.admin === 'admin' || botInfo.admin === 'superadmin'
        logMessage('SUCCESS', 'ADMIN', `Bot encontrado en grupo`, {
          botId: botInfo.id,
          botLid: botInfo.lid || 'N/A',
          botAdmin: botInfo.admin || 'member',
          isBotAdmin
        })
      } else {
        logMessage('WARN', 'ADMIN', `Bot NO encontrado en participantes`, {
          botJid,
          botJidRaw,
          botNumber,
          sampleParticipants: (groupMetadata.participants || []).slice(0, 3).map(p => ({
            id: p.id,
            lid: p.lid || 'N/A',
            admin: p.admin || 'member'
          }))
        })

        if (isOwner) {
          logMessage('INFO', 'ADMIN', 'WORKAROUND: Asumiendo permisos de admin (sender es owner)')
          isBotAdmin = true
        }
      }
    } catch (e) {
      const msg = e?.message || ''
      if (msg === 'skip_metadata_fetch') {
        logMessage('DEBUG', 'METADATA', 'Consulta de metadata omitida (no necesaria)')
      } else if (msg.includes('rate-overlimit')) {
        logMessage('WARN', 'METADATA', `rate-overlimit al obtener metadata de grupo (${remoteJid})`)
      } else {
        logMessage('ERROR', 'METADATA', `Error getting group metadata`, { groupId: remoteJid, error: msg })
      }
      groupMetadata = null
      isAdmin = false
      isBotAdmin = false
    }
  }

  const pushName = message?.pushName || null
  let usuarioName = null
  try {
    if (isGroup && groupMetadata && Array.isArray(groupMetadata.participants)) {
      const p = groupMetadata.participants.find((x) => x?.id === sender)
      usuarioName = p?.notify || p?.name || null
    }
  } catch (e) {}

  const chatLabel = isGroup
    ? (groupMetadata?.subject || remoteJid)
    : isChannel
      ? remoteJid
      : (usuarioName || pushName || remoteJid)

  logMessage('INFO', 'CHAT', 'Contexto con nombres', {
    remoteJid,
    chatName: chatLabel,
    senderNumber,
    senderName: usuarioName || pushName || senderNumber,
    isGroup,
    isChannel,
  })

  const ctx = {
    sock: s,
    message,
    key: message.key,
    remoteJid,
    sender,
    senderNumber,
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
    ...runtimeContext,
  }

  logMessage('INFO', 'CONTEXT', 'Contexto del mensaje preparado', {
    isGroup,
    isChannel,
    isOwner,
    isAdmin,
    isBotAdmin,
    hasGroupMetadata: !!groupMetadata
  })

  if (fromMe) {
    const m = message.message || {}
    const txt = (m.conversation || m.extendedTextMessage?.text || '').trim()
    const isCmd = /^[\/!.#?$~]/.test(txt) || m.buttonsResponseMessage || m.templateButtonReplyMessage || m.listResponseMessage
    const mode = String(process.env.FROMME_MODE || 'commands').toLowerCase()
    if (!(mode === 'all' || (mode === 'commands' && isCmd))) {
      logMessage('DEBUG', 'FROMME', 'Mensaje propio ignorado (FROMME_MODE)')
      return
    }
  }

  const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true'
  if (autoRead && message?.key?.id) {
    try {
      await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }])
      logMessage('DEBUG', 'READ', 'Mensaje marcado como leído')
    } catch (e) {
      logMessage('WARN', 'READ', 'Error marcando mensaje como leído', { error: e?.message })
    }
  }

  try {
    let dispatch = null

    if (global.__APP_DISPATCH && typeof global.__APP_DISPATCH === 'function') {
      dispatch = global.__APP_DISPATCH
      logMessage('DEBUG', 'ROUTER', 'Usando dispatch cacheado')
    } else {
      try {
        const routerResolved = path.isAbsolute(routerPath) ? routerPath : path.resolve(__dirname, routerPath)
        logMessage('INFO', 'ROUTER', `Importando router dinámicamente: ${routerResolved}`)
        const mod = await tryImportModuleWithRetries(routerResolved, { retries: 3, timeoutMs: 20000, backoffMs: 1000 })
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default
        if (dispatch) {
          global.__APP_ROUTER_MODULE = mod
          global.__APP_DISPATCH = dispatch
          logMessage('SUCCESS', 'ROUTER', 'dispatch cargado correctamente y cacheado')
        } else {
          logMessage('WARN', 'ROUTER', 'módulo importado pero no expone dispatch')
        }
      } catch (e) {
        logMessage('ERROR', 'ROUTER', 'Error importando router dinámico', { error: e?.stack || e?.message || e })
      }
    }

    if (typeof dispatch === 'function') {
      logMessage('INFO', 'DISPATCH', 'Ejecutando dispatch del mensaje')
      const handled = await dispatch(ctx)
      logMessage('INFO', 'DISPATCH', `Mensaje procesado: ${handled === true ? 'HANDLED' : 'NOT_HANDLED'}`)

      const replyFallback = String(process.env.REPLY_ON_UNMATCHED || 'false').toLowerCase() === 'true'
      if (replyFallback && handled !== true && !fromMe) {
        const isMentioned = (message?.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).includes(s.user.id)
        if (!isGroup || isMentioned) {
          global.__fallbackTs = global.__fallbackTs || new Map()
          if (Date.now() - (global.__fallbackTs.get(remoteJid) || 0) > 60000) {
            await safeSend(s, remoteJid, { text: '👋 Envíame un comando. Usa /menu o /help' }, { quoted: message })
            global.__fallbackTs.set(remoteJid, Date.now())
            logMessage('INFO', 'FALLBACK', 'Respuesta de fallback enviada')
          }
        }
      }
    }
  } catch (e) {
    logMessage('ERROR', 'HANDLER', 'router failed', { error: e?.message || e })
  }
}
// ==========================================================
// FIN DE FUNCIÓN handleMessage
// ==========================================================

export async function clearWhatsAppSession(dirPath = null) {
  try {
    await teardownSocket()
    const base = dirPath || savedAuthPath || process.env.AUTH_DIR || DEFAULT_AUTH_DIR
    const abs = path.resolve(base)
    if (abs && fs.existsSync(abs)) {
      fs.rmSync(abs, { recursive: true, force: true })
      logMessage('SUCCESS', 'SESSION', 'Sesión de WhatsApp eliminada correctamente')
    }
  } catch (e) {
    logMessage('ERROR', 'SESSION', 'Error clearing WhatsApp session', { error: e.message })
  }
}
