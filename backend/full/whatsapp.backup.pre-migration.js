import './config.js'
import pino from 'pino'
import QRCode from 'qrcode'
import qrTerminal from 'qrcode-terminal'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import logger from './config/logger.js'
import { makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers } from './utils/baileys.js'
import { attachBaileysEventHandlers } from './events/index.js'
import { initStore, getStore, configureStorePersistence } from './utils/store.js'

let sock = null
let connectionStatus = 'disconnected'
let qrCode = null
let qrCodeImage = null
let currentPairingCode = null
let currentPairingNumber = null
let currentPairingGeneratedAt = null
let currentPairingExpiresAt = null
let pairingTargetNumber = null
let authMethod = 'qr' // 'qr' | 'pairing'
let savedAuthPath = null
let reconnecting = false

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function sanitizePhoneNumberInput(v) { return String(v || '').replace(/\D/g, '') || null }

// ---------- helpers API ----------
function getQRCode() { return qrCode }
function getQRCodeImage() { return qrCodeImage }
function getConnectionStatus() {
  return {
    status: connectionStatus,
    uptime: connectionStatus === 'connected' ? process.uptime() : 0,
    timestamp: new Date().toISOString(),
  }
}
function getSocket() { return sock }
async function getAvailableGroups() {
  try {
    if (!sock) return []
    const groups = await sock.groupFetchAllParticipating()
    return Object.values(groups).map(g => ({ id: g.id, name: g.subject, participants: g.participants?.length || 0 }))
  } catch { return [] }
}
function getCurrentPairingCode() { return currentPairingCode }
function getCurrentPairingInfo() {
  if (!currentPairingCode) return null
  return {
    code: currentPairingCode,
    generatedAt: currentPairingGeneratedAt?.toISOString() || null,
    expiresAt: currentPairingExpiresAt?.toISOString() || null,
    phoneNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
  }
}
function getPairingTargetNumber() { return pairingTargetNumber ? `+${pairingTargetNumber}` : null }

function setAuthMethod(method, options = {}) {
  const allowed = ['qr', 'pairing']
  if (!allowed.includes(method)) {
    const error = new Error('Metodo de autenticacion invalido. Usa "qr" o "pairing".')
    error.code = 'INVALID_AUTH_METHOD'
    throw error
  }
  if (method === 'pairing') {
    const normalized = sanitizePhoneNumberInput(options.phoneNumber || pairingTargetNumber)
    if (!normalized) {
      const error = new Error('Numero de telefono invalido. Usa solo digitos con codigo de pais, ejemplo: 595974154768.')
      error.code = 'INVALID_PAIRING_NUMBER'
      throw error
    }
    pairingTargetNumber = normalized
  } else {
    pairingTargetNumber = null
  }
  authMethod = method
  return pairingTargetNumber
}

async function teardownSocket(reason = 'teardown') {
  try {
    if (!sock) return
    try { sock.ev?.removeAllListeners?.() } catch {}
    try { sock.ws?.close?.() } catch {}
    try { sock.end?.() } catch {}
    try { await sock.logout?.() } catch {}
  } catch {}
  finally {
    sock = null
    if (reason === 'logout') {
      qrCode = null
      qrCodeImage = null
      currentPairingCode = null
      connectionStatus = 'disconnected'
    }
  }
}

async function clearWhatsAppSession() {
  try { await teardownSocket('logout') } catch {}
  try { if (savedAuthPath) fs.rmSync(path.resolve(savedAuthPath), { recursive: true, force: true }) } catch {}
}

// ---------- Conexión principal ----------
async function connectToWhatsApp(authPath, usePairingCode = false, phoneNumber = null) {
  savedAuthPath = authPath
  connectionStatus = 'connecting'

  // teardown limpio antes de crear otro socket
  await teardownSocket('recreate')
  await sleep(100)

  // Verificación previa de creds.json por si quedó corrupto/incompleto
  try {
    const absAuthPath = path.resolve(authPath)
    const credsPath = path.join(absAuthPath, 'creds.json')
    if (fs.existsSync(credsPath)) {
      try {
        const raw = fs.readFileSync(credsPath, 'utf8')
        const data = JSON.parse(raw || '{}')
        const ok = data?.signedIdentityKey?.public && data?.signedPreKey?.keyPair?.public
        if (!ok) {
          const backup = path.join(absAuthPath, `creds.backup.${Date.now()}.json`)
          try { fs.renameSync(credsPath, backup) } catch {}
          try { logger.warn?.('creds.json incompleto/corrupto, respaldado', { backup }) } catch {}
        }
      } catch (e) {
        const backup = path.join(path.resolve(authPath), `creds.backup.${Date.now()}.json`)
        try { fs.renameSync(credsPath, backup) } catch {}
        try { logger.warn?.('creds.json inválido, respaldado para regenerar', { backup }) } catch {}
      }
    }
  } catch {}

  const { state, saveCreds } = await useMultiFileAuthState(authPath)

  const wantPair = usePairingCode || authMethod === 'pairing'
  const normalized = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
  if (wantPair && !normalized) {
    // si se pidió pairing pero no hay número válido, degradar a QR
    authMethod = 'qr'
  }

  // Configuración de dispositivo (browser) por entorno
  const deviceCfg = String(process.env.BOT_DEVICE || 'ubuntu').toLowerCase()
  const deviceName = (process.env.BOT_DEVICE_NAME || '').trim() || null
  let browserConfig = null
  try {
    if (deviceCfg === 'windows') {
      browserConfig = Browsers?.windows?.(deviceName || 'WhatsApp Web')
    } else if (deviceCfg === 'macos') {
      browserConfig = Browsers?.macOS?.(deviceName || 'WhatsApp Web')
    } else if (deviceCfg === 'ubuntu' || deviceCfg === 'linux') {
      browserConfig = Browsers?.ubuntu?.(deviceName || 'WhatsApp Web')
    } else if (deviceCfg === 'custom') {
      const agent = (process.env.BOT_DEVICE_AGENT || 'Chrome')
      const version = (process.env.BOT_DEVICE_VERSION || '1.0.0')
      browserConfig = [deviceName || 'App', agent, version]
    } else {
      browserConfig = Browsers?.ubuntu?.('Chrome') || ['Chrome', 'Ubuntu', '1.0.0']
    }
  } catch {
    browserConfig = Browsers?.ubuntu?.('Chrome') || ['Chrome', 'Ubuntu', '1.0.0']
  }

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: browserConfig,
    connectTimeoutMs: 60_000,
  })
  // Exponer a global para compatibilidad
  try { global.sock = sock } catch {}

  sock.ev.on('creds.update', saveCreds)
  try { attachBaileysEventHandlers(sock) } catch {}

  try {
    const store = initStore()
    if (store?.bind) store.bind(sock.ev)
  } catch {}
  try {
    const enable = String(process.env.STORE_ENABLE || '').toLowerCase() === 'true'
    if (enable) {
      const file = process.env.STORE_FILE || path.join(process.cwd(), 'backend', 'full', 'storage', 'store.json')
      const interval = Number(process.env.STORE_SAVE_INTERVAL_MS || '60000')
      configureStorePersistence({ file, intervalMs: interval })
    }
  } catch {}

  sock.ev.on('messages.upsert', async ({ messages = [] }) => {
    for (const m of messages) {
      try {
        if (!m?.key) continue
        if (m.key.fromMe) {
          const txt = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').trim()
          const isCommand = txt.startsWith('/') || txt.startsWith('!') || txt.startsWith('.')
          if (!isCommand) continue
        }
        const { handleMessage } = await import('./whatsapp.js') // evitar ciclos (si alguna vez)
        await handleMessage(m, sock)
      } catch {}
    }
  })

  let pairingRequestInProgress = false

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr, pairingCode } = update || {}

      if (qr) {
        qrCode = qr
        try { qrCodeImage = await QRCode.toDataURL(qr) } catch { qrCodeImage = null }
        if (authMethod === 'qr') {
          console.log('\n📱 Escaneá este QR (o abre /api/whatsapp/qr en el panel)')
          qrTerminal.generate(qr, { small: true })
        }
      }

      if (pairingCode) {
        currentPairingCode = String(pairingCode)
        currentPairingGeneratedAt = new Date()
        currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
        if (currentPairingNumber) {
          console.log(`\n🔐 Pairing Code para +${currentPairingNumber}: ${currentPairingCode}\n`)
        } else {
          console.log(`\n🔐 Pairing Code: ${currentPairingCode}\n`)
        }
      }

      // Solicitar pairing code tras recibir QR si estamos en modo pairing
      try {
        const wantPairRuntime = (authMethod === 'pairing') || usePairingCode
        const target = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
        if (wantPairRuntime && target && qr && !currentPairingCode && !pairingRequestInProgress && typeof sock.requestPairingCode === 'function') {
          pairingRequestInProgress = true
          const waitForAuthKeysReady = async (maxMs = 8000) => {
            const start = Date.now()
            while (Date.now() - start < maxMs) {
              try {
                const c = sock?.authState?.creds
                if (c?.signedIdentityKey?.public && c?.signedPreKey?.keyPair?.public) return true
              } catch {}
              await new Promise(r => setTimeout(r, 250))
            }
            return false
          }
          try { await waitForAuthKeysReady(8000) } catch {}

          const envCustom = String(process.env.PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || '')
          const customCandidate = envCustom.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
          const useCustom = customCandidate.length === 8

          let generated = null
          const maxAttempts = 3
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              if (useCustom && attempt === 1) {
                try { generated = await sock.requestPairingCode(target, customCandidate) } catch (e) { try { logger.warn('[pairing] custom code falló, reintento sin custom', { error: e?.message }) } catch {} }
              }
              if (!generated) generated = await sock.requestPairingCode(target)
              break
            } catch (e) {
              if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1500))
            }
          }

          if (generated) {
            const formatted = (String(generated).match(/.{1,4}/g) || [String(generated)]).join('-')
            currentPairingCode = formatted
            currentPairingGeneratedAt = new Date()
            currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
            currentPairingNumber = target
            pairingTargetNumber = target
            console.log(`\n🔐 Pairing Code generado: ${formatted} (para +${target})`)
            console.log('👉 WhatsApp > Dispositivos vinculados > Vincular con número\n')
          }
        }
      } catch {}

      if (connection === 'open') {
        connectionStatus = 'connected'
        qrCode = null
        qrCodeImage = null
        currentPairingCode = null
        reconnecting = false
        console.log('✅ Conectado')
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.code
        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'disconnected'
          console.log('❌ Sesión cerrada. Autenticar de nuevo.')
        } else {
          if (reconnecting) return
          reconnecting = true
          connectionStatus = 'reconnecting'
          console.log('⚠️ Conexión perdida. Reintentando en 2s...')
          setTimeout(() => {
            try {
              connectToWhatsApp(savedAuthPath, authMethod === 'pairing', pairingTargetNumber)
            } catch {}
          }, 2000)
        }
      }
    } catch {}
  })

  // Pairing code explícito (solicitar inmediatamente si aplica)
  try {
    const wantPairNow = (usePairingCode || authMethod === 'pairing')
    const target = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
    if (wantPairNow && target && typeof sock.requestPairingCode === 'function') {
      currentPairingNumber = target
      const envCustom = String(process.env.PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || '')
      const customCandidate = envCustom.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
      const useCustom = customCandidate.length === 8
      let codeValue = null
      try {
        if (useCustom) {
          try { codeValue = await sock.requestPairingCode(target, customCandidate) } catch {}
        }
        if (!codeValue) codeValue = await sock.requestPairingCode(target)
      } catch {}
      const formatted = (String(codeValue || '').match(/.{1,4}/g) || [String(codeValue || '')]).join('-')
      currentPairingCode = formatted
      currentPairingGeneratedAt = new Date()
      currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
      connectionStatus = 'waiting_pairing'
      console.log(`\n🔐 Pairing Code generado: ${formatted} (para +${currentPairingNumber})`)
      console.log('👉 WhatsApp > Dispositivos vinculados > Vincular con número\n')
    }
  } catch (e) {
    try { logger.warn('[pairing] no se pudo solicitar codigo', { error: e?.message }) } catch {}
  }

  return sock
}

async function connectWithPairingCode(phoneNumber, authPath = null) {
  const normalized = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
  if (!normalized) throw new Error('Numero invalido para pairing.')
  const effective = authPath || savedAuthPath
  if (!effective) throw new Error('No se proporcionó authPath')
  try { await clearWhatsAppSession() } catch {}
  try { fs.rmSync(path.resolve(effective), { recursive: true, force: true }) } catch {}
  try { fs.mkdirSync(effective, { recursive: true }) } catch {}
  pairingTargetNumber = normalized; authMethod = 'pairing'
  return await connectToWhatsApp(effective, true, normalized)
}

// (router delegación)
export async function handleMessage(message, customSock = null, prefix = '') {
  try {
    const s = customSock || sock || global.sock
    if (!s || !message || !message.key) return
    const remoteJid = message.key.remoteJid
    if (!remoteJid) return
    const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
    const usuario = message.key.participant || (isGroup ? message.key.participant : message.key.remoteJid) || s?.user?.id || ''
    try {
      const autoRead = String(process.env.AUTO_READ_MESSAGES || '').toLowerCase() === 'true'
      if (autoRead && message?.key?.id) {
        await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }])
      }
    } catch {}
    try {
      const { dispatch } = await import('./commands/router.js')
      await dispatch({ sock: s, message, remoteJid, usuario, isGroup })
    } catch (e) {
      try { logger.warn('[handleMessage] router failed', { error: e?.message }) } catch {}
    }
  } catch (err) {
    try { logger.error('[handleMessage] error', { error: err?.message || String(err) }) } catch {}
  }
}

function getBotStatus() {
  const st = getConnectionStatus()
  return {
    connected: st.status === 'connected',
    connectionStatus: st.status,
    phone: sock?.user?.id || null,
    qrCode: qrCode || null,
    pairingCode: currentPairingCode || null,
    pairingNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
    timestamp: st.timestamp,
  }
}

export {
  connectToWhatsApp,
  getQRCode,
  getQRCodeImage,
  getCurrentPairingCode,
  getCurrentPairingInfo,
  getPairingTargetNumber,
  connectWithPairingCode,
  getConnectionStatus,
  getBotStatus,
  getSocket,
  getAvailableGroups,
  setAuthMethod,
  clearWhatsAppSession,
  getStore,
}

