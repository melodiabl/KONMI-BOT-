import './config.js'
import pino from 'pino'
import QRCode from 'qrcode'
import qrTerminal from 'qrcode-terminal'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import readline from 'readline'
import logger from './config/logger.js'
import db from './db.js'
// Baileys se cargará dinámicamente local a este módulo
import { onSubbotEvent } from './inproc-subbots.js'
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
let pairingRequestInProgress = false
let userSelectedMethod = null
let userSelectedPhone = null
const processedMessageIds = new Set()
const groupNameCache = new Map()
const groupAdminsCache = new Map()
let groupSettingsTableReady = false
let botGlobalStateReady = false

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function sanitizePhoneNumberInput(v) { return String(v || '').replace(/\D/g, '') || null }

// --------- Baileys dynamic loader local ---------
let __baileysLoaded = false
let __loadedBaileysName = null
let makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, jidNormalizedUser, areJidsSameUser
async function loadBaileys() {
  if (__baileysLoaded && makeWASocket) return true
  const candidates = []
  try { if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE) } catch {}
  candidates.push('@whiskeysockets/baileys')
  candidates.push('baileys-mod')
  candidates.push('@rexxhayanasi/elaina-bail')
  candidates.push('baileys')
  let lastErr = null
  for (const name of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(name)
      const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
      const pick = (k) => (M?.[k] ?? mod?.default?.[k] ?? mod?.[k])
      makeWASocket = pick('makeWASocket') ?? pick('default')
      DisconnectReason = pick('DisconnectReason')
      useMultiFileAuthState = pick('useMultiFileAuthState')
      fetchLatestBaileysVersion = pick('fetchLatestBaileysVersion')
      Browsers = pick('Browsers')
      jidNormalizedUser = pick('jidNormalizedUser')
      areJidsSameUser = pick('areJidsSameUser')
      __baileysLoaded = true
      __loadedBaileysName = name
      return true
    } catch (e) { lastErr = e }
  }
  try { logger.warn?.('No se pudo cargar ningún módulo de Baileys', { error: lastErr?.message }) } catch {}
  return false
}

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
    userSelectedPhone = normalized
  } else {
    pairingTargetNumber = null
  }
  authMethod = method
  userSelectedMethod = method
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

// ---------- Recrear socket manual/automático ----------
async function restartConnection({ delayMs = 1000, forceMethod = null, phoneNumber = null } = {}) {
  try {
    if (reconnecting) return false
    reconnecting = true
    const wantPair = (forceMethod ? String(forceMethod) === 'pairing' : (authMethod === 'pairing'))
    const number = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || userSelectedPhone)
    setTimeout(() => {
      try { connectToWhatsApp(savedAuthPath, wantPair, number) } catch {}
    }, Number(delayMs) || 0)
    return true
  } catch { return false }
}

// ---------- Conexión principal ----------
async function connectToWhatsApp(authPath, usePairingCode = false, phoneNumber = null) {
  savedAuthPath = authPath
  connectionStatus = 'connecting'

  // Mensajería de inicio bonita
  try {
    logger.pretty?.banner?.('KONMI BOT v2.5.0', '🤖')
    logger.pretty?.section?.('Sistema de autenticación', '🔐')
  } catch {}

  // teardown limpio antes de crear otro socket
  await teardownSocket('recreate')
  await sleep(100)

  // Cargar Baileys localmente
  const ok = await loadBaileys()
  if (!ok) { connectionStatus = 'error'; throw new Error('Baileys no está disponible. Instala el módulo o define BAILEYS_MODULE.') }

  // Crear carpeta de auth (no tocar creds.json para compatibilidad con forks)
  let effectiveAuthPath = authPath || savedAuthPath
  if (!effectiveAuthPath) throw new Error('No se proporcionó authPath para la conexión')
  try {
    const absAuthPath = path.resolve(effectiveAuthPath)
    fs.mkdirSync(absAuthPath, { recursive: true })
    fs.mkdirSync(path.join(absAuthPath, 'keys'), { recursive: true })
  } catch {}

  const { state, saveCreds } = await useMultiFileAuthState(effectiveAuthPath)

  // Guardar estado inicial de credenciales
  try { await saveCreds() } catch {}

  // Preferencia efectiva de pairing
  let wantPair = !!usePairingCode
  let normalized = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber)
  try {
    const alreadyRegisteredCheck = !!(state?.creds?.registered || state?.creds?.me?.id)
    if (alreadyRegisteredCheck) { wantPair = false }
  } catch {}
  if (wantPair && !normalized) { authMethod = 'qr'; wantPair = false }

  // Preparar credenciales para pairing code si aplica y no hay sesión registrada
  try {
    const alreadyRegistered = !!(state?.creds?.registered || state?.creds?.me?.id)
    if (wantPair && normalized) {
      if (!alreadyRegistered) {
        try {
          state.creds.me = undefined
          state.creds.account = undefined
          state.creds.device = undefined
          state.creds.registered = false
          state.creds.usePairingCode = true
          try { await saveCreds() } catch {}
        } catch {}
      } else {
        try { state.creds.usePairingCode = false } catch {}
      }
    }
  } catch {}


  // Configuración de dispositivo (browser) por entorno
  const deviceCfg = String(process.env.BOT_DEVICE || 'ubuntu').toLowerCase()
  const deviceName = (process.env.BOT_DEVICE_NAME || '').trim() || null
  let browserConfig = null
  let deviceLabel = 'dispositivo predeterminado'
  try {
    if (deviceCfg === 'windows') {
      browserConfig = Browsers?.windows?.(deviceName || 'WhatsApp Web')
      deviceLabel = deviceName || 'Windows'
    } else if (deviceCfg === 'macos') {
      browserConfig = Browsers?.macOS?.(deviceName || 'WhatsApp Web')
      deviceLabel = deviceName || 'macOS'
    } else if (deviceCfg === 'ubuntu' || deviceCfg === 'linux') {
      browserConfig = Browsers?.ubuntu?.(deviceName || 'WhatsApp Web')
      deviceLabel = deviceName || 'Ubuntu'
    } else if (deviceCfg === 'custom') {
      const agent = (process.env.BOT_DEVICE_AGENT || 'Chrome')
      const version = (process.env.BOT_DEVICE_VERSION || '1.0.0')
      browserConfig = [deviceName || 'App', agent, version]
      deviceLabel = deviceName || 'Custom'
    } else {
      browserConfig = Browsers?.ubuntu?.('Chrome') || ['Chrome', 'Ubuntu', '1.0.0']
      deviceLabel = 'dispositivo predeterminado'
    }
  } catch { browserConfig = Browsers?.ubuntu?.('Chrome') || ['Chrome', 'Ubuntu', '1.0.0']; deviceLabel = 'dispositivo predeterminado' }

  // Versión de WhatsApp Web soportada
  let waVersion = null
  try {
    const fv = await fetchLatestBaileysVersion()
    waVersion = fv?.version
    if (Array.isArray(waVersion)) { try { logger.pretty?.kv?.('Versión WhatsApp Web soportada', waVersion.join('.')) } catch {} }
  } catch {}
  if (!Array.isArray(waVersion)) waVersion = [2, 3000, 1015901307]

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: browserConfig,
    version: waVersion,
    getMessage: async () => null,
    connectTimeoutMs: 60_000,
  })
  // Exponer a global para compatibilidad
  try { global.sock = sock } catch {}

  // Diagnóstico: módulo cargado
  try { logger.pretty?.kv?.('Baileys', __loadedBaileysName || 'desconocido') } catch {}

  sock.ev.on('creds.update', async () => {
    try {
      const abs = path.resolve(effectiveAuthPath)
      fs.mkdirSync(abs, { recursive: true })
      fs.mkdirSync(path.join(abs, 'keys'), { recursive: true })
    } catch {}
    try { await saveCreds() } catch {}
  })

  try { attachInlineEventHandlers(sock) } catch {}

  // Fallback: solicitar pairing code poco después de crear el socket
  const requestPairingIfNeeded = async (tag = 'startup') => {
    try {
      const target = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || userSelectedPhone)
      const wantPairRuntime = (usePairingCode || authMethod === 'pairing' || userSelectedMethod === 'pairing')
      if (!wantPairRuntime || !target || currentPairingCode || pairingRequestInProgress) return
      if (typeof sock.requestPairingCode !== 'function') return
      pairingRequestInProgress = true
      // asegurar claves listas
      const waitForAuthKeysReady = async (maxMs = 8000) => {
        const start = Date.now()
        while (Date.now() - start < maxMs) {
          try { const c = sock?.authState?.creds; if (c?.signedIdentityKey?.public && c?.signedPreKey?.keyPair?.public) return true } catch {}
          await new Promise(r => setTimeout(r, 250))
        }
        return false
      }
      try { await waitForAuthKeysReady(6000) } catch {}

      const envCustom = String(process.env.PAIRING_CODE || process.env.CUSTOM_PAIRING_CODE || '')
      const customCandidate = envCustom.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)
      const useCustom = customCandidate.length === 8
      let codeValue = null
      try {
        codeValue = await requestPairingCodeFlexible(sock, target, useCustom ? customCandidate : null)
      } catch {}
      if (!codeValue) { pairingRequestInProgress = false; return }
      const formatted = (String(codeValue).match(/.{1,4}/g) || [String(codeValue)]).join('-')
      currentPairingCode = formatted
      currentPairingGeneratedAt = new Date()
      currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
      currentPairingNumber = target
      pairingTargetNumber = target
      try {
        logger.pretty?.banner?.('Código de emparejamiento', '🔗')
        logger.pretty?.kv?.('Número', `+${target}`)
        logger.pretty?.kv?.('Código', `${formatted}`)
        logger.pretty?.kv?.('Válido por', '10 minutos')
        logger.pretty?.section?.('Instrucciones', '📋')
        logger.pretty?.line?.('1) Abre WhatsApp en tu teléfono')
        logger.pretty?.line?.('2) Dispositivos vinculados > Vincular con número')
        logger.pretty?.line?.(`3) Ingresa: ${formatted}`)
      } catch {}
      pairingRequestInProgress = false
    } catch { pairingRequestInProgress = false }
  }
  setTimeout(() => { requestPairingIfNeeded('startup').catch(()=>{}) }, 400)

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

  // Filtro + logging de mensajes entrantes (ignora fromMe salvo comandos)
  sock.ev.on('messages.upsert', async ({ messages = [] }) => {
    for (const m of messages) {
      try {
        if (!m?.key) continue
        const remoteJid = m.key.remoteJid || ''
        const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
        const usuarioRaw = m.key.participant || (isGroup ? m.key.participant : m.key.remoteJid) || sock?.user?.id || ''
        const usuario = normalizeJidToNumber(usuarioRaw)
        const txt = (m.message?.extendedTextMessage?.text || m.message?.conversation || m.message?.imageMessage?.caption || m.message?.videoMessage?.caption || '').trim()
        const isCommand = !!txt && (txt.startsWith('/') || txt.startsWith('!') || txt.startsWith('.'))

        try {
          if (isCommand) {
            logger.whatsapp?.command?.(txt.split(/\s+/)[0] || '', usuario, isGroup ? remoteJid : null)
          } else {
            if (isGroup) logger.whatsapp?.groupMessage?.(txt || '[no-text]', remoteJid, usuario)
            else logger.whatsapp?.privateMessage?.(txt || '[no-text]', usuario)
          }
        } catch {}

        // Logging detallado al estilo referencia
        try { await logAllMessages(m, txt, remoteJid, usuario, isGroup) } catch {}

        // Respeto del estado global y por grupo (BD)
        try {
          const globalOn = await isBotGloballyActiveFromDB()
          if (!globalOn) continue
          if (isGroup) {
            const activeInGroup = await isBotActiveInGroup(remoteJid)
            if (!activeInGroup) continue
          }
        } catch {}

        if (m.key.fromMe && !isCommand) continue

        // Evitar reprocesar mensajes duplicados
        try {
          const msgId = m.key?.id
          if (msgId && processedMessageIds.has(msgId)) continue
          if (msgId) processedMessageIds.add(msgId)
        } catch {}

        await handleMessage(m, sock)
      } catch {}
    }
  })

  sock.ev.on('connection.update', async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update || {}

      if (qr) {
        qrCode = qr
        try { qrCodeImage = await QRCode.toDataURL(qr) } catch { qrCodeImage = null }
        if (!wantPair) {
          try {
            logger.pretty?.section?.('QR listo', '📱')
            logger.pretty?.line?.('Escanea el código en la terminal o abre /api/whatsapp/qr')
          } catch {}
          console.log('\n📱 Escaneá este QR (o abre /api/whatsapp/qr en el panel)')
          try { qrTerminal.generate(qr, { small: true }) } catch {}
        }
      }

      // Solicitar pairing code al recibir QR si estamos en modo pairing
      try {
        const wantPairRuntime = wantPair || !!usePairingCode
        const target = sanitizePhoneNumberInput(phoneNumber || pairingTargetNumber || userSelectedPhone)
        if (wantPairRuntime && target && qr && !currentPairingCode && !pairingRequestInProgress && typeof sock.requestPairingCode === 'function') {
          pairingRequestInProgress = true

          // Marcar flag en creds si aplica
          try { if (sock?.authState?.creds) sock.authState.creds.usePairingCode = true } catch {}

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
              generated = await requestPairingCodeFlexible(sock, target, useCustom ? customCandidate : null)
              if (generated) break
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
            try {
              logger.pretty?.banner?.('Código de emparejamiento', '🔗')
              logger.pretty?.kv?.('Número', `+${target}`)
              logger.pretty?.kv?.('Código', `${formatted}`)
              logger.pretty?.kv?.('Aparecerá como', deviceLabel)
              logger.pretty?.kv?.('Válido por', '10 minutos')
              logger.pretty?.section?.('Instrucciones', '📋')
              logger.pretty?.line?.('1) Abre WhatsApp en tu teléfono')
              logger.pretty?.line?.('2) Dispositivos vinculados > Vincular con número')
              logger.pretty?.line?.(`3) Ingresa: ${formatted}`)
            } catch {}
          }
          pairingRequestInProgress = false
        }
      } catch {}

      if (connection === 'open') {
        connectionStatus = 'connected'
        qrCode = null
        qrCodeImage = null
        currentPairingCode = null
        reconnecting = false
        try { logger.pretty?.banner?.('Conectado exitosamente', '✅') } catch {}
        console.log('✅ Conectado')
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.code
        try { logger.pretty?.kv?.('connection.close status', statusCode || 'unknown') } catch {}
        // Manejo rápido para timeouts/transitorios (408/428): recrear en 1s conservando método actual
        try {
          const sc = Number(statusCode)
          if (sc === 408 || sc === 428) {
            connectionStatus = 'reconnecting'
            setTimeout(() => { try { connectToWhatsApp(savedAuthPath, usePairingCode, phoneNumber) } catch {} }, 1000)
            return
          }
        } catch {}
        // Si pairing devuelve 401 y ya hay creds presentes, recrear usando la sesión (sin forzar QR explícitamente)
        try {
          if (Number(statusCode) === 401 && savedAuthPath) {
            const abs = path.resolve(savedAuthPath)
            const credsFile = path.join(abs, 'creds.json')
            if (fs.existsSync(credsFile)) {
              try {
                const st = fs.statSync(credsFile)
                if (st && st.size > 0) {
                  reconnecting = true
                  connectionStatus = 'reconnecting'
                  console.log('⚠️ Pairing 401. Reintentando con sesión en 1s...')
                  setTimeout(() => { try { connectToWhatsApp(savedAuthPath, false) } catch {} }, 1000)
                  return
                }
              } catch {}
            }
          }
        } catch {}
        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'disconnected'
          try { logger.pretty?.banner?.('Conexión cerrada', '⚠️') } catch {}
          console.log('❌ Sesión cerrada. Autenticar de nuevo.')
        } else {
          if (reconnecting) return
          reconnecting = true
          connectionStatus = 'reconnecting'
          console.log('⚠️ Conexión perdida. Reintentando en 2s...')
          setTimeout(() => { try { connectToWhatsApp(savedAuthPath, usePairingCode, phoneNumber) } catch {} }, 2000)
        }
      }
    } catch {}
  })

  // NOTA: Generación del pairing code se realiza al recibir QR (connection.update)

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
  pairingTargetNumber = normalized; authMethod = 'pairing'; userSelectedMethod = 'pairing'; userSelectedPhone = normalized
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
      if (autoRead && message?.key?.id) { await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }]) }
    } catch {}
    try {
      const { dispatch } = await import('./commands/router.js')
      await dispatch({ sock: s, message, remoteJid, usuario, isGroup })
    } catch (e) { try { logger.warn('[handleMessage] router failed', { error: e?.message }) } catch {} }
  } catch (err) { try { logger.error('[handleMessage] error', { error: err?.message || String(err) }) } catch {} }
}

// Helpers compatibles con el archivo de referencia
function getBotJid(s) {
  try {
    const id = s?.user?.id
    if (!id) return null
    if (String(id).includes('@')) return String(id).replace(/:\d+/, '')
    return `${String(id).replace(/:\d+/, '')}@s.whatsapp.net`
  } catch { return null }
}

function getBotNumber(s) {
  const jid = getBotJid(s)
  if (!jid) return null
  return String(jid).split('@')[0].replace(/[^\d]/g, '')
}

function normalizeJidToNumber(jid) {
  if (!jid) return ''
  const s = String(jid)
  if (!s.includes('@')) return s.replace(/:\d+$/, '').replace(/[^\d]/g, '')
  try {
    const normalized = jidNormalizedUser(s)
    const left = String(normalized || '').split('@')[0]
    const out = left.replace(/:\d+$/, '').replace(/[^\d]/g, '')
    if (out) return out
  } catch {}
  const left = s.split('@')[0]
  return left.replace(/:\d+$/, '').replace(/[^\d]/g, '')
}

function findParticipant(participants, jid) {
  try {
    const targetJid = jidNormalizedUser(String(jid || ''))
    let participant = (participants || []).find((p) => {
      try { return areJidsSameUser(jidNormalizedUser(String(p?.id || '')), targetJid) } catch { return false }
    })
    if (participant) return participant
    const targetNum = normalizeJidToNumber(jid)
    participant = (participants || []).find((p) => normalizeJidToNumber(p?.id) === targetNum)
    return participant || null
  } catch { return null }
}

// ---------- Pairing helpers (multi-fork) ----------
async function requestPairingCodeFlexible(sock, target, customCandidate = null) {
  try {
    if (!sock) return null
    const formatted = String(target || '').replace(/[^0-9]/g, '')
    if (!formatted) return null

    // Métodos posibles según forks/versions de Baileys
    const methods = [
      'requestPairingCode',
      'generatePairingCode',
      'requestPhonePairingCode',
      'requestPairCode',
    ]

    // Intenta cada método con distintas firmas (algunos aceptan 1 o 2 args)
    for (const name of methods) {
      try {
        const fn = sock?.[name]
        if (typeof fn !== 'function') continue

        const argSets = []
        // Primero intenta con número + custom (si está disponible)
        if (customCandidate) argSets.push([formatted, customCandidate])
        // Luego solo con el número
        argSets.push([formatted])

        for (const args of argSets) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const res = await fn.apply(sock, args)
            if (res) {
              const code = typeof res === 'string' ? res
                : (res?.code || res?.pairingCode || res?.pairCode || null)
              if (code) return code
            }
          } catch (e) {
            // si falla con 2 args, probá con 1; si con 1 falla, pasa al siguiente método
          }
        }
      } catch {}
    }

    // Si llegamos acá, no se pudo
    try { logger.warn('No se pudo obtener pairing code: métodos no disponibles o fallidos.') } catch {}
    return null
  } catch (error) {
    try { logger.error('Error solicitando pairing code:', { error: error?.message || String(error) }) } catch {}
    return null
  }
}

// ---------- Inline Baileys Event Handlers (migrated from events/*) ----------
function attachInlineEventHandlers(sock) {
  if (!sock?.ev?.on) return

  // presence.update
  try {
    sock.ev.on('presence.update', (update) => {
      try {
        const { id, presences } = update || {}
        if (!id || !presences) return
        const who = Object.keys(presences)[0]
        const p = presences[who]
        logger.whatsapp?.system?.('presence.update', { chat: id, who, status: p?.lastKnownPresence })
      } catch {}
    })
  } catch {}

  // groups.update
  try {
    sock.ev.on('groups.update', (updates = []) => {
      try {
        const arr = Array.isArray(updates) ? updates : (updates ? [updates] : [])
        for (const u of arr) {
          logger.whatsapp?.system?.('groups.update', {
            id: u?.id, subject: u?.subject, announce: u?.announce, restrict: u?.restrict, ephemeralDuration: u?.ephemeralDuration,
          })
        }
      } catch {}
    })
  } catch {}

  // group-participants.update
  try {
    sock.ev.on('group-participants.update', async (u) => {
      try {
        const id = u?.id
        const action = u?.action
        const participants = Array.isArray(u?.participants) ? u.participants : (u?.participants ? [u.participants] : [])
        logger.whatsapp?.system?.('group-participants.update', { id, action, participants })
        const welcome = (process.env.GROUP_WELCOME || '').toLowerCase() === 'true'
        const farewell = (process.env.GROUP_FAREWELL || '').toLowerCase() === 'true'
        if (!id || participants.length === 0) return
        if (action === 'add' && welcome) {
          try { await sock.sendMessage(id, { text: `👋 Bienvenid@ ${participants.map(p=>`@${String(p).split('@')[0]}`).join(', ')}`, mentions: participants }) } catch {}
        } else if (action === 'remove' && farewell) {
          try { await sock.sendMessage(id, { text: `👋 ${participants.map(p=>`@${String(p).split('@')[0]}`).join(', ')} salió del grupo.`, mentions: participants }) } catch {}
        }
      } catch {}
    })
  } catch {}

  // call
  try {
    sock.ev.on('call', async (calls = []) => {
      try {
        const arr = Array.isArray(calls) ? calls : (calls ? [calls] : [])
        for (const c of arr) {
          logger.whatsapp?.system?.('call', { id: c?.id, from: c?.from, status: c?.status, isVideo: c?.isVideo })
          const autoReject = (process.env.AUTO_REJECT_CALLS || '').toLowerCase() === 'true'
          if (autoReject && typeof sock.rejectCall === 'function' && c?.id) {
            try { await sock.rejectCall(c.id) } catch {}
          }
        }
      } catch {}
    })
  } catch {}

  // message-receipt.update and messages.update
  try {
    sock.ev.on('message-receipt.update', (updates = []) => {
      try {
        const arr = Array.isArray(updates) ? updates : (updates ? [updates] : [])
        for (const u of arr) {
          logger.whatsapp?.system?.('message-receipt.update', { key: u?.key, receipt: u?.receipt })
        }
      } catch {}
    })
    sock.ev.on('messages.update', (updates = []) => {
      try {
        const arr = Array.isArray(updates) ? updates : (updates ? [updates] : [])
        for (const u of arr) {
          const status = u?.status || u?.update?.status
          const reaction = u?.reaction
          logger.whatsapp?.system?.('messages.update', { key: u?.key, status, reaction })
        }
      } catch {}
    })
  } catch {}

  // reactions from messages.upsert (lightweight listener)
  try {
    sock.ev.on('messages.upsert', ({ messages = [] }) => {
      try {
        const arr = Array.isArray(messages) ? messages : (messages ? [messages] : [])
        for (const m of arr) {
          const rm = m?.message?.reactionMessage
          if (!rm) continue
          logger.whatsapp?.system?.('reaction', { key: m?.key, text: rm?.text, emoji: rm?.emoji || rm?.text, target: rm?.key, from: m?.key?.participant || m?.key?.remoteJid })
        }
      } catch {}
    })
  } catch {}
}

// =====================
// Logging y estados BD
// =====================
async function ensureGroupSettingsTable() {
  if (groupSettingsTableReady) return
  try {
    const exists = await db.schema.hasTable('group_settings')
    if (!exists) {
      await db.schema.createTable('group_settings', (t) => {
        t.increments('id')
        t.string('group_id').notNullable().unique()
        t.boolean('is_active').notNullable().defaultTo(true)
        t.timestamps(true, true)
      })
      try { logger.pretty?.line?.('🗄️ Tabla group_settings creada') } catch {}
    }
    groupSettingsTableReady = true
  } catch (error) {
    try { logger.warn('No se pudo verificar/crear tabla group_settings', { error: error?.message }) } catch {}
  }
}

async function ensureBotGlobalStateTable() {
  if (botGlobalStateReady) return
  try {
    const exists = await db.schema.hasTable('bot_global_state')
    if (!exists) {
      await db.schema.createTable('bot_global_state', (t) => {
        t.increments('id')
        t.boolean('is_on').notNullable().defaultTo(true)
        t.timestamps(true, true)
      })
      try { logger.pretty?.line?.('🗄️ Tabla bot_global_state creada') } catch {}
    }
    const row = await db('bot_global_state').first('id')
    if (!row) { await db('bot_global_state').insert({ is_on: true }).catch(() => {}) }
    botGlobalStateReady = true
  } catch (error) {
    try { logger.warn('No se pudo verificar/crear tabla bot_global_state', { error: error?.message }) } catch {}
  }
}

async function isBotActiveInGroup(groupId) {
  try {
    await ensureGroupSettingsTable()
    if (!groupId.endsWith('@g.us')) return true
    const row = await db('group_settings').select('is_active').where({ group_id: groupId }).first()
    if (!row) return true
    return row.is_active === 1 || row.is_active === true
  } catch { return true }
}

async function isBotGloballyActiveFromDB() {
  try {
    await ensureBotGlobalStateTable()
    const row = await db('bot_global_state').select('is_on').first()
    if (!row) return true
    return row.is_on === 1 || row.is_on === true
  } catch { return true }
}

async function getGroupName(groupId) {
  try {
    if (!sock || !groupId.endsWith('@g.us')) return null
    if (groupNameCache.has(groupId)) return groupNameCache.get(groupId)
    try {
      const meta = await sock.groupMetadata(groupId)
      if (meta?.subject) {
        groupNameCache.set(groupId, meta.subject)
        return meta.subject
      }
    } catch {}
    const short = groupId.split('@')[0].slice(-4)
    const fb = `Grupo ${short}`
    groupNameCache.set(groupId, fb)
    return fb
  } catch {
    const short = groupId.split('@')[0].slice(-4)
    return `Grupo ${short}`
  }
}

function getCountrySplit(number) {
  try {
    const num = String(number || '').replace(/\D/g, '')
    if (!num) return { cc: '', local: '', iso: null }
    const known = [
      { cc: '595', iso: 'PY' },{ cc: '54', iso: 'AR' },{ cc: '55', iso: 'BR' },{ cc: '57', iso: 'CO' },{ cc: '52', iso: 'MX' },{ cc: '51', iso: 'PE' },{ cc: '56', iso: 'CL' },{ cc: '34', iso: 'ES' },{ cc: '1', iso: 'US' },
    ]
    const match = known.find(k => num.startsWith(k.cc))
    if (!match) return { cc: '', local: num, iso: null }
    return { cc: match.cc, local: num.slice(match.cc.length), iso: match.iso }
  } catch { return { cc: '', local: '', iso: null } }
}

function isSpecificOwner(user) {
  const normalized = normalizeJidToNumber(user)
  const ownerNumber = String(process.env.OWNER_NUMBER || '595974154768').replace(/\D/g, '')
  if (!normalized || !ownerNumber) return false
  if (normalized === ownerNumber) return true
  return normalized.slice(-9) === ownerNumber.slice(-9)
}

async function logAllMessages(message, messageText, remoteJid, usuario, isGroup) {
  try {
    // Debug básico
    try {
      logger.pretty?.section?.('Debug mensaje', '🔎')
      logger.pretty?.kv?.('pushName', message?.pushName || '-')
      logger.pretty?.kv?.('usuario', usuario)
      logger.pretty?.kv?.('key.participant', message?.key?.participant || '-')
      logger.pretty?.kv?.('key.remoteJid', message?.key?.remoteJid || '-')
    } catch {}

    // Contact name
    let contactName = 'Usuario desconocido'
    if (message.pushName && String(message.pushName).trim()) {
      contactName = String(message.pushName).trim()
    } else if (isSpecificOwner(usuario)) {
      contactName = 'Owner'
    } else if (message.key?.participant) {
      const participant = String(message.key.participant).split('@')[0]
      contactName = isSpecificOwner(participant) ? 'Owner' : `Usuario ${participant.slice(-4)}`
    }

    // Group name
    let groupName = null
    if (isGroup) { try { groupName = await getGroupName(remoteJid) } catch {} }

    const fechaHora = new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const isCommand = !!messageText && (/^[\/.!]/.test(messageText))
    const title = isCommand ? 'COMANDO' : 'MENSAJE'

    // Content type
    let contentType = '📝 Texto'
    const mm = message?.message || {}
    if (mm.imageMessage) contentType = '🖼️ Imagen'
    else if (mm.videoMessage) contentType = '🎞️ Video'
    else if (mm.audioMessage) contentType = '🎵 Audio'
    else if (mm.documentMessage) contentType = '📄 Documento'
    else if (mm.stickerMessage) contentType = '🔖 Sticker'
    else if (mm.locationMessage) contentType = '📍 Ubicación'
    else if (mm.contactMessage) contentType = '👤 Contacto'

    let displayText = messageText || ''
    if (!displayText) {
      if (mm.imageMessage) displayText = '[Imagen sin texto]'
      else if (mm.videoMessage) displayText = '[Video sin texto]'
      else if (mm.audioMessage) displayText = '[Mensaje de voz]'
      else if (mm.stickerMessage) displayText = '[Sticker]'
      else if (mm.locationMessage) displayText = '[Ubicación compartida]'
      else if (mm.contactMessage) displayText = '[Contacto compartido]'
      else displayText = '[Mensaje sin texto]'
    }

    const split = getCountrySplit(usuario)

    // Pretty logs
    try {
      logger.pretty?.banner?.(`${title} ${isGroup ? 'en grupo' : 'privado'}`, '💬')
      if (isGroup) {
        logger.pretty?.section?.('Grupo', '🧩')
        logger.pretty?.kv?.('Nombre', groupName || 'Grupo sin nombre')
        logger.pretty?.kv?.('ID', remoteJid)
      }
      logger.pretty?.section?.('Usuario', '👤')
      logger.pretty?.kv?.('Nombre', contactName || usuario)
      logger.pretty?.kv?.('Número', usuario)
      logger.pretty?.kv?.('Código país', `+${split.cc}${split.iso ? ` (${split.iso})` : ''}`)
      logger.pretty?.section?.('Contenido', '📦')
      logger.pretty?.kv?.('Tipo', contentType)
      logger.pretty?.kv?.('Texto', displayText)
      logger.pretty?.kv?.('Fecha', fechaHora)
      logger.pretty?.section?.('Flags', '⚙️')
      logger.pretty?.kv?.('fromMe', !!message.key?.fromMe)
      logger.pretty?.kv?.('isCommand', isCommand)
    } catch {}

  } catch (error) {
    try { logger.error('Error en logAllMessages', { error: error?.message }) } catch {}
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

// ---------- Subbots: wrappers y logging central ----------
let __subbotLoggingAttached = false
function attachSubbotRuntimeLogging() {
  if (__subbotLoggingAttached) return
  __subbotLoggingAttached = true
  try {
    onSubbotEvent('qr_ready', (evt) => {
      try { logger.subbot?.qr?.(evt?.subbot?.code, evt?.subbot?.request_jid || '-') } catch {}
    })
    onSubbotEvent('pairing_code', (evt) => {
      try { logger.subbot?.pairingCode?.(evt?.subbot?.code, `+${evt?.subbot?.target_number || ''}`, evt?.code || evt?.pairingCode) } catch {}
    })
    onSubbotEvent('connected', (evt) => {
      try { logger.subbot?.connected?.(evt?.subbot?.code, evt?.subbot?.bot_number || '-') } catch {}
    })
    onSubbotEvent('disconnected', (evt) => {
      try { logger.subbot?.disconnected?.(evt?.subbot?.code, evt?.reason || 'unknown') } catch {}
    })
    onSubbotEvent('error', (evt) => {
      try { logger.subbot?.error?.(evt?.subbot?.code || '-', evt?.error || evt) } catch {}
    })
  } catch {}
}

attachSubbotRuntimeLogging()

// Exponer funciones de manejo de subbots desde whatsapp.js
export async function generateSubbotQR(ownerNumber, options = {}) {
  const mod = await import('./lib/subbots.js')
  return await mod.generateSubbotQR(ownerNumber, options)
}

export async function generateSubbotPairingCode(ownerNumber, targetNumber, options = {}) {
  const mod = await import('./lib/subbots.js')
  return await mod.generateSubbotPairingCode(ownerNumber, targetNumber, options)
}

export async function getSubbotStatus(code) {
  const mod = await import('./lib/subbots.js')
  return await mod.getSubbotStatus(code)
}

export async function getAllSubbots(ownerNumber) {
  const mod = await import('./lib/subbots.js')
  return await mod.getAllSubbots(ownerNumber)
}



