// whatsapp.js — Restaurado “original”: sin tocar/backup de creds, QR + Pairing Code funcional
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

/* ===== Carga dinámica de Baileys (sin parches) ===== */
let __loaded = null
async function loadBaileys() {
  if (__loaded) return __loaded
  const picks = []
  try { if (process?.env?.BAILEYS_MODULE) picks.push(process.env.BAILEYS_MODULE) } catch {}
  // Preferimos el paquete oficial estable primero
  picks.push('@whiskeysockets/baileys', 'baileys')
  // Alternativas/forks en orden descendente
  picks.push('@itsukichan/baileys', '@vkazee/baileys', 'baileys-mod')

  let lastErr = null
  for (const name of picks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(name)
      const M = mod?.default || mod
      const api = {
        makeWASocket: M?.makeWASocket || M?.default,
        useMultiFileAuthState: M?.useMultiFileAuthState,
        fetchLatestBaileysVersion: M?.fetchLatestBaileysVersion,
        Browsers: M?.Browsers,
        DisconnectReason: M?.DisconnectReason,
        loadedName: name
      }
      if (!api.makeWASocket || !api.useMultiFileAuthState) {
        throw new Error(`El paquete "${name}" no expone la API esperada`)
      }
      console.log(`✅ Baileys cargado: ${name}`)
      __loaded = api
      return api
    } catch (e) {
      lastErr = e
      try { console.warn(`⚠️ No se pudo cargar ${name}: ${e?.message || e}`) } catch {}
    }
  }
  throw lastErr || new Error('No se pudo cargar ningún paquete Baileys compatible')
}

async function resolveWaVersion(fetchLatestBaileysVersion) {
  // Permite fijar versión por .env si querés forzar
  const raw = (process.env.WA_WEB_VERSION || '').trim()
  if (raw) {
    const parts = raw.split(/[.,\s]+/).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)).slice(0, 3)
    if (parts.length === 3) return parts
  }
  try {
    const { version } = await fetchLatestBaileysVersion()
    if (Array.isArray(version) && version.length === 3) return version
  } catch {}
  return [2, 3000, 1027934701]
}

/* ===== Estado básico ===== */
let sock = null
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

// Router
let routerPath = './commands/router.js'
export function setMessageRouterModulePath(p) { routerPath = String(p || routerPath) }
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
export function setAuthMethod(method = 'qr', { phoneNumber } = {}) {
  const m = String(method || 'qr').toLowerCase()
  if (!['qr', 'pairing', 'pair'].includes(m)) throw new Error('Método inválido: usa "qr" o "pairing"')
  authMethod = m === 'pair' ? 'pairing' : m
  if (phoneNumber) pairingTargetNumber = onlyDigits(phoneNumber)
  return authMethod
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
  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers, DisconnectReason } = await loadBaileys()

  savedAuthPath = path.resolve(authPath)
  // Limpieza opcional como en subbot-runner
  try {
    const clean = String(process.env.PAIRING_CLEAN_AUTH_ON_START || '').match(/^(1|true|yes)$/i)
    if (usePairingCode && clean && fs.existsSync(savedAuthPath)) {
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

  const deviceName = process.env.BOT_DEVICE_NAME || 'WhatsApp Web'
  const browser = (() => {
    try {
      const pref = String(process.env.BOT_BROWSER || '').toLowerCase()
      if (pref === 'windows') return Browsers?.windows?.(deviceName)
      if (pref === 'macos') return Browsers?.macOS?.(deviceName)
      if (pref === 'chrome') return Browsers?.chrome?.('Chrome')
      if (process.platform === 'win32') return Browsers?.windows?.(deviceName)
      return Browsers?.ubuntu?.('Chrome')
    } catch { return ['Chrome', 'Ubuntu', '1.0.0'] }
  })() || ['Chrome', 'Ubuntu', '1.0.0']

  const wantPair = !!doPairing
  pairingTargetNumber = wantPair ? onlyDigits(phoneNumber || process.env.PAIR_NUMBER) : null
  authMethod = wantPair ? 'pairing' : 'qr'

  connectionStatus = 'connecting'
  reconnecting = false
  await teardownSocket()
  await sleep(80)

  const logLevel = process.env.BOT_LOG_LEVEL || (process.env.DEBUG_PAIRING === 'true' ? 'info' : 'silent')
  const QUIET = String(process.env.QUIET_LOGS || process.env.BOT_QUIET || 'false').toLowerCase() === 'true'
  const infoLog = (...a) => { if (!QUIET) try { console.log(...a) } catch {} }

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: logLevel }),
    printQRInTerminal: false,
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
    getMessage: async () => null
  })

  // Guardado de sesión VAINILLA (sin backup/patch de creds)
  sock.ev.on('creds.update', saveCreds)

  // ==== CONNECTION.UPDATE “original”, con correcciones de estabilidad ====
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update || {}

    // QR (si no estamos en pairing)
    if (qr && !wantPair) {
      qrCode = qr
      if (!QUIET && String(process.env.QR_TERMINAL || 'true').toLowerCase() !== 'false') {
        try { qrTerminal.generate(qr, { small: true }) } catch {}
      }
      await saveQrArtifacts(qr, path.join(savedAuthPath, 'qr'))
      infoLog('🟩 QR listo — Escaneá con tu WhatsApp (también guardado en /qr/)')
    }

    if (connection === 'open') {
      connectionStatus = 'connected'
      qrCode = null
      qrCodeImage = null
      pairingCodeRequestedForSession = false
      infoLog('✅ Conectado')
      // Capturar número base del bot y promoverlo como owner primario si falta
      try {
        const normalizeJidDigits = (jid) => {
          try {
            let s = String(jid || '')
            const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
            const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
            return s.replace(/\D/g, '')
          } catch { return (String(jid||'').replace(/\D/g,'')) }
        }
        const botNum = normalizeJidDigits(sock?.user?.id)
        if (botNum) {
          global.BOT_BASE_NUMBER = botNum
          try { setPrimaryOwner(botNum, 'Owner (Base)') } catch {}
        }
      } catch {}
      return
    }

    if (connection === 'close') {
      const err = lastDisconnect?.error
      const status = err?.output?.statusCode || err?.code
      const msg = err?.message || ''

      // 428: esperando que ingreses el código en el teléfono → no reconectar
      if (status === 428) {
        connectionStatus = 'waiting_pairing'
        infoLog('⏳ Esperando que ingreses el código en el teléfono… (no reconecto para evitar bucle)')
        return
      }

      // loggedOut → cortar limpio
      if (status === DisconnectReason?.loggedOut) {
        connectionStatus = 'disconnected'
        infoLog('❌ Sesión cerrada (loggedOut). Relogueá por QR o Pairing.')
        return
      }

      // Otros (405/timeout/…): backoff suave, SIN volver a pedir pairing code
      if (!reconnecting) {
        reconnecting = true
        connectionStatus = 'reconnecting'
        const backoff = 1200
        infoLog(`⚠️ Conexión cerrada (status ${status || '?'}: ${msg || 'sin detalle'}). Reintentando en ${backoff} ms…`)
        // Si estamos en pairing: permitir que el próximo socket vuelva a solicitar el código
        if (wantPair) pairingCodeRequestedForSession = false
        setTimeout(() => {
          connectToWhatsApp(savedAuthPath, wantPair, pairingTargetNumber).catch(() => {})
        }, backoff)
      }
    }
  })

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

        // Filtrado de mensajes propios (fromMe) para evitar loops y respuestas a tus chats personales
        try {
          const fromMe = !!m?.key?.fromMe
          if (fromMe) {
            const msg = m?.message || {}
            const raw = (
              msg?.conversation
              || msg?.extendedTextMessage?.text
              || msg?.imageMessage?.caption
              || msg?.videoMessage?.caption
              || ''
            ).trim()
            // Detectar respuestas interactivas (botones/listas/native flow)
            const btnId = msg?.buttonsResponseMessage?.selectedButtonId
              || msg?.templateButtonReplyMessage?.selectedId
              || msg?.buttonReplyMessage?.selectedButtonId
            const rowId = msg?.listResponseMessage?.singleSelectReply?.selectedRowId
              || msg?.listResponseMessage?.singleSelectReply?.selectedId
              || msg?.interactiveResponseMessage?.listResponseMessage?.singleSelectReply?.selectedRowId
            let nfId = null
            try { const pj = msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson; if (pj) { const p = JSON.parse(pj); nfId = p?.id || p?.command || p?.rowId || p?.row_id || null } } catch {}
            const hasInteractive = !!(btnId || rowId || nfId)
            const isCommand = /^[\/!.#?$~]/.test(raw) || hasInteractive
            const mode = String(process.env.FROMME_MODE || process.env.ALLOW_FROM_ME || 'commands').toLowerCase()
            const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && (isCommand || raw.length === 0))
            if (!allow) {
              try { const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true'; if (traceEv) console.log(`[wa] skip fromMe (mode=${mode}) text='${raw}' interactive=${hasInteractive}`) } catch {}
              continue
            }
          }
        } catch {}

        // Gateo global/grupo como en subbot (omisible con BOT_IGNORE_GATING=true)
        try {
          const mm = await ensureMgr()
          const remoteJid = m?.key?.remoteJid || ''
          // Extraer comando/selección para permitir bypass de control
          const msg = m?.message || {}
          const rawText = (
            msg?.conversation
            || msg?.extendedTextMessage?.text
            || msg?.imageMessage?.caption
            || msg?.videoMessage?.caption
            || ''
          ).trim()
          const firstToken = (/^[\\/!.#?$~]/.test(rawText) ? rawText.split(/\\s+/)[0].toLowerCase() : '')
          let interactiveId = (msg?.listResponseMessage?.singleSelectReply?.selectedRowId || msg?.listResponseMessage?.singleSelectReply?.selectedId || msg?.buttonsResponseMessage?.selectedButtonId || msg?.templateButtonReplyMessage?.selectedId || msg?.buttonReplyMessage?.selectedButtonId || '')
          try { const pj = msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson; if (pj) { const p = JSON.parse(pj); if (!interactiveId) interactiveId = (p?.id || p?.command || p?.rowId || p?.row_id || '') } } catch {}
          const interactiveToken = interactiveId ? String(interactiveId).split(/\\s+/)[0].toLowerCase() : ''
          const bypassCmd = controlSet.has(firstToken) || controlSet.has(interactiveToken)
          const fromMe = !!m?.key?.fromMe
          if (!ignoreGating && mm && typeof mm.isBotGloballyActive === 'function') {
            const on = await mm.isBotGloballyActive()
            if (!on && !fromMe && !bypassCmd) {
              try { const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true'; if (traceEv) console.log('[wa] skip by global gating') } catch {}
              continue
            }
          }
          if (!ignoreGating && remoteJid.endsWith('@g.us') && mm && typeof mm.isBotActiveInGroup === 'function') {
            const ok = await mm.isBotActiveInGroup('main', remoteJid)
            if (!ok && !fromMe && !bypassCmd) {
              try { const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true'; if (traceEv) console.log('[wa] skip by group gating') } catch {}
              continue
            }
          }
        } catch {}

        // Logging de entrada (con persistencia)
        try {
          const { logIncomingMessage } = await import('./utils/wa-logging.js')
          await logIncomingMessage(m)
          const remoteJid = m?.key?.remoteJid || ''
          const fromMe = !!m?.key?.fromMe
          const isGroup = remoteJid.endsWith('@g.us')
          const body = (
            msg?.conversation
            || msg?.extendedTextMessage?.text
            || msg?.imageMessage?.caption
            || msg?.videoMessage?.caption
            || ''
          ).trim()
          const trace = String(process.env.LOG_CONSOLE_TRACE || 'true').toLowerCase() === 'true'
          const full = String(process.env.FULL_LOGS || 'true').toLowerCase() === 'true'
          if (trace || full) {
            var groupLabel = remoteJid
            if (isGroup) {
              try {
                if (!groupSubjectCache.has(remoteJid)) {
                  const meta = await sock.groupMetadata(remoteJid).catch(()=>null)
                  groupSubjectCache.set(remoteJid, (meta && meta.subject) ? meta.subject : remoteJid)
                }
                const name = groupSubjectCache.get(remoteJid) || remoteJid
                groupLabel = name + ' (' + remoteJid + ')'
              } catch {}
            }
            logger.info('[incoming] ' + (isGroup ? groupLabel : remoteJid) + ' ' + (isGroup ? '(group)' : '(pv)') + ' ' + (fromMe ? '[fromMe]' : '') + ' :: ' + (body || '(no-text)'))
            try { if (full) logger.info('[incoming.json] ' + JSON.stringify(m?.message || {}).slice(0, 1000)) } catch {}
          }
        } catch {}

        // Enforcers por grupo: antilink y slowmode
        try {
          const remoteJid = m?.key?.remoteJid || ''
          const isGroup = remoteJid.endsWith('@g.us')
          const fromMe = !!m?.key?.fromMe
          if (isGroup && !fromMe) {
            const { getGroupBool, getGroupNumber } = await import('./utils/group-config.js')
            const body = (
              msg?.conversation
              || msg?.extendedTextMessage?.text
              || msg?.imageMessage?.caption
              || msg?.videoMessage?.caption
              || ''
            ).trim()

            // Slowmode: ignorar manejo si el usuario envía antes del intervalo
            try {
              const slow = await getGroupNumber(remoteJid, 'slowmode_s', 0)
              if (slow && slow > 0) {
                global.__slowmodeMap = global.__slowmodeMap || new Map()
                const user = m?.key?.participant || m?.participant || m?.key?.remoteJid
                const k = `${remoteJid}|${user}`
                const last = global.__slowmodeMap.get(k) || 0
                const now = Date.now()
                if ((now - last) < slow * 1000) {
                  try { await sock.sendMessage(remoteJid, { text: `🐢 Slowmode: espera ${Math.ceil((slow*1000 - (now-last))/1000)}s`, mentions: user?[user]:undefined }, { quoted: m }) } catch {}
                  return
                }
                global.__slowmodeMap.set(k, now)
              }
            } catch {}

            // Anti-flood: límite de mensajes por usuario en 10s
            try {
              const on = await getGroupBool(remoteJid, 'antiflood_on', false)
              if (on) {
                const rate = await getGroupNumber(remoteJid, 'antiflood_rate', 5)
                global.__floodMap = global.__floodMap || new Map()
                const user = m?.key?.participant || m?.participant || m?.key?.remoteJid
                const k = `${remoteJid}|${user}`
                const now = Date.now()
                const entry = global.__floodMap.get(k) || { ts: now, c: 0 }
                if (now - entry.ts > 10000) { entry.ts = now; entry.c = 0 }
                entry.c += 1; global.__floodMap.set(k, entry)
                if (entry.c > rate) {
                  const mode = (await (await import('./utils/group-config.js')).getGroupConfig(remoteJid, 'antiflood_mode', 'warn'))
                  if (mode === 'kick') {
                    try { await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user||'').split('@')[0]} expulsado.`, mentions:[user] }, { quoted: m }) } catch {}
                    try { await sock.groupParticipantsUpdate(remoteJid, [user], 'remove') } catch {}
                    return
                  } else {
                    try { await sock.sendMessage(remoteJid, { text: `🚫 Anti-flood: @${String(user||'').split('@')[0]} detente.`, mentions:[user] }, { quoted: m }) } catch {}
                  }
                }
              }
            } catch {}

            // Antilink: advertir o expulsar si contiene links (según modo)
            try {
              const al = await getGroupBool(remoteJid, 'antilink', false)
              if (al && /https?:\/\//i.test(body)) {
                const user = m?.key?.participant || m?.participant
                const mode = (await (await import('./utils/group-config.js')).getGroupConfig(remoteJid, 'antilink_mode', 'warn'))
                if (mode === 'kick') {
                  try {
                    await sock.sendMessage(remoteJid, { text: `🔗 Antilink: @${String(user||'').split('@')[0]} expulsado por enviar enlaces.`, mentions: user?[user]:undefined }, { quoted: m })
                  } catch {}
                  try { await sock.groupParticipantsUpdate(remoteJid, [user], 'remove') } catch {}
                  return
                } else {
                  try { await sock.sendMessage(remoteJid, { text: `🔗 Antilink activo. @${String(user||'').split('@')[0]} por favor evita compartir enlaces.`, mentions: user?[user]:undefined }, { quoted: m }) } catch {}
                }
              }
            } catch {}
          }
        } catch {}

        // Reusar el mismo handler que exportamos (fromMe policy, autoRead, router)
        await handleMessage(m, sock, '[MAIN]')
      } catch {}
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

  // Bienvenida de nuevos participantes si está activo en el grupo
  try {
    sock.ev.on('group-participants.update', async (ev) => {
      try {
        const jid = ev?.id
        const action = ev?.action
        const participants = ev?.participants || []
        if (!jid || !Array.isArray(participants) || participants.length === 0) return
        const { getGroupBool, getGroupConfig } = await import('./utils/group-config.js')
        const on = await getGroupBool(jid, 'welcome_on', false)
        if (!on) return
        const tmpl = await getGroupConfig(jid, 'welcome_text', '👋 Bienvenido @user a @group')
        if (action === 'add') {
          const meta = await sock.groupMetadata(jid).catch(()=>null)
          const gname = meta?.subject || 'el grupo'
          for (const p of participants) {
            const user = `@${String(p||'').split('@')[0]}`
            const text = tmpl.replace(/@user/gi, user).replace(/@group/gi, gname)
            try { await sock.sendMessage(jid, { text, mentions:[p] }) } catch {}
          }
        }
      } catch {}
    })
  } catch {}

  // ==== PAIRING CODE (solicitar una única vez por sesión) ====
  if (wantPair) {
    const number = onlyDigits(pairingTargetNumber)
    if (!number) throw new Error('Número inválido para pairing. Usa E.164 sin + (ej: 595974154768)')

    if (!pairingCodeRequestedForSession) {
      pairingCodeRequestedForSession = true

      if (typeof sock.waitForSocketOpen === 'function') {
        await sock.waitForSocketOpen()
      } else {
        await sleep(350)
      }

      // Esperar claves de auth listas (noiseKey, signedIdentityKey, signedPreKey)
      const waitForAuthKeysReady = async (maxMs = 8000) => {
        const start = Date.now()
        while (Date.now() - start < maxMs) {
          try {
            const creds = sock?.authState?.creds
            if (
              creds?.noiseKey?.public &&
              creds?.signedIdentityKey?.public &&
              creds?.signedPreKey?.keyPair?.public
            ) return true
          } catch {}
          await sleep(200)
        }
        return false
      }
      try { await waitForAuthKeysReady(8000) } catch {}

      const custom = pickCustomFromEnv()
      const onlyCustom = String(process.env.PAIRING_ONLY_CUSTOM || process.env.ONLY_CUSTOM_PAIRING || 'false').toLowerCase() === 'true'
      const method = ['requestPairingCode', 'requestPhonePairingCode', 'requestPairCode', 'generatePairingCode']
        .find(m => typeof sock[m] === 'function')

      if (!method) {
        infoLog('⚠️ Este paquete no expone método de pairing. Usá QR o un fork compatible.')
      } else {
        try {
          let res
          // Política: si hay custom válido y método lo acepta, usarlo.
          // Si ONLY_CUSTOM=true y no hay custom válido, no intentar sin código.
          const methodAcceptsCode = (method === 'requestPairingCode' || method === 'requestPhonePairingCode' || method === 'requestPairCode')
          if (methodAcceptsCode) {
            if (custom) {
              try { res = await sock[method](number, custom) } catch (e) {
                if (onlyCustom) throw e
              }
            }
            if (!res && !onlyCustom) {
              // Intento sin custom
              res = await sock[method](number)
            }
          } else {
            // generatePairingCode(phone)
            res = await sock[method](number)
          }
          const raw = typeof res === 'string' ? res : (res?.code || res?.pairingCode || null)
          if (raw) {
            const formatted = (String(raw).match(/.{1,4}/g) || [String(raw)]).join('-')
            currentPairingCode = formatted
            currentPairingNumber = number
            currentPairingGeneratedAt = new Date()
            currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

            if (!QUIET) {
              console.log('\n╔════════════════════════════════════════╗')
              console.log('║     CÓDIGO DE EMPAREJAMIENTO LISTO     ║')
              console.log('╚════════════════════════════════════════╝')
              console.log(`📞 Número: +${number}`)
              if (custom) console.log(`🔑 Solicitado con custom: ${custom}`)
              console.log(`🔑 Código: ${formatted}`)
              console.log('👉 WhatsApp > Dispositivos vinculados > Vincular con número de teléfono\n')
            }
          } else {
            infoLog('⚠️ No se pudo obtener Pairing Code. Probá iniciar por QR una vez y reintentar.')
          }
        } catch (e) {
          infoLog('❌ Error solicitando Pairing Code:', e?.message || e)
        }
      }
    } else {
      if (!QUIET) {
        if (currentPairingCode) console.log(`ℹ️ Pairing code ya generado esta sesión: ${currentPairingCode}`)
        else console.log('ℹ️ Pairing ya solicitado. Esperando ingreso del código.')
      }
    }
  }

  return sock
}

/* ===== Helper directo para Pairing ===== */
export async function connectWithPairingCode(phoneNumber, authPath = null) {
  const effective = authPath || savedAuthPath || (process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full'))
  return await connectToWhatsApp(effective, true, phoneNumber)
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

/* ===== Handler exportado para integraciones externas (subbots/handlers) ===== */
export async function handleMessage(message, customSock = null, prefix = '') {
  try {
    const s = customSock || sock
    if (!s || !message || !message.key) return
    const remoteJid = message.key.remoteJid
    if (!remoteJid) return
    const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
    // Normalizar identidad del emisor: para fromMe, usar siempre el JID del bot
    const normalizeDigits = (jid) => {
      try {
        let s = String(jid || '')
        const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
        const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
        return s.replace(/\D/g, '')
      } catch { return String(jid||'').replace(/\D/g,'') }
    }
    const fromMe = !!message?.key?.fromMe
    let usuarioRaw = ''
    if (fromMe) {
      usuarioRaw = s?.user?.id || ''
    } else if (isGroup) {
      usuarioRaw = message?.key?.participant || message?.participant || ''
    } else {
      usuarioRaw = message?.key?.remoteJid || ''
    }
    const usuario = usuarioRaw || s?.user?.id || ''

    // Logs enriquecidos (grupo/privado/owner/command)
    try {
      const full = String(process.env.WHATSAPP_FULL_LOGS || process.env.FULL_LOGS || 'true').toLowerCase() !== 'false'
      if (full) {
        const body = (
          message?.message?.conversation
          || message?.message?.extendedTextMessage?.text
          || message?.message?.imageMessage?.caption
          || message?.message?.videoMessage?.caption
          || ''
        ).trim()
        const userDigits = normalizeDigits(usuario)
        const ownerDigits = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '')
        const isOwner = ownerDigits && userDigits === ownerDigits
        if (isGroup) {
          logger.whatsapp?.groupMessage?.(body || '(no-text)', remoteJid, userDigits, { fromMe: !!message?.key?.fromMe, owner: isOwner })
        } else {
          logger.whatsapp?.privateMessage?.(body || '(no-text)', userDigits, { fromMe: !!message?.key?.fromMe, owner: isOwner })
        }
        // Si parece comando, log detallado
        if (/^[\/!.]/.test(body)) {
          const cmd = body.split(/\s+/)[0]
          logger.whatsapp?.command?.(cmd, userDigits, isGroup ? remoteJid : null, { owner: isOwner })
        }
      }
    } catch {}

    // Política fromMe
    try {
      if (message.key.fromMe) {
        const m = message.message || {}
        const txt = (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || '').trim()
        // Detectar selecciones interactivas como comandos aunque no tengan prefijo
        const btnId = m.buttonsResponseMessage?.selectedButtonId
          || m.templateButtonReplyMessage?.selectedId
          || m.buttonReplyMessage?.selectedButtonId
        const rowId = m.listResponseMessage?.singleSelectReply?.selectedRowId
          || m.listResponseMessage?.singleSelectReply?.selectedId
          || m.interactiveResponseMessage?.listResponseMessage?.singleSelectReply?.selectedRowId
        let nfId = null
        try { const pj = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson; if (pj) { const p = JSON.parse(pj); nfId = p?.id || p?.command || p?.rowId || p?.row_id || null } } catch {}
        const hasInteractive = !!(btnId || rowId || nfId)
        const isCommand = txt.startsWith('/') || txt.startsWith('!') || txt.startsWith('.') || hasInteractive
        const mode = String(process.env.FROMME_MODE || process.env.ALLOW_FROM_ME || 'commands').toLowerCase()
        // Si el texto está vacío, asumimos que puede ser una respuesta interactiva no estandar y permitimos
        const allow = (mode === 'all' || mode === 'true') || (mode === 'commands' && (isCommand || txt.length === 0))
        if (!allow) {
          try { const traceEv = String(process.env.DEBUG_WA_EVENTS || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true'; if (traceEv) console.log(`[wa] skip fromMe (mode=${mode}) text='${txt}' interactive=${hasInteractive}`) } catch {}
          return
        }
      }
    } catch {}

    // Auto read opcional
    try {
      const autoRead = String(process.env.AUTO_READ_MESSAGES || 'true').toLowerCase() === 'true'
      if (autoRead && message?.key?.id) {
        await s.readMessages([{ remoteJid, id: message.key.id, fromMe: message.key.fromMe }])
      }
    } catch {}

    // Despacho al router
    try {
      let dispatch = null
      try {
        const mod = await import(routerPath)
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default
      } catch {}
      if (!dispatch) {
        const mod = await import('./commands/router.js')
        dispatch = mod?.dispatch || mod?.default?.dispatch || mod?.default
      }
      if (typeof dispatch === 'function') {
        const trace = String(process.env.LOG_CONSOLE_TRACE || 'true').toLowerCase() === 'true'
        let jidLabel = remoteJid
        if (isGroup) {
          try {
            if (!groupSubjectCache.has(remoteJid)) {
              const meta = await s.groupMetadata(remoteJid).catch(()=>null)
              groupSubjectCache.set(remoteJid, (meta && meta.subject) ? meta.subject : remoteJid)
            }
            const name = groupSubjectCache.get(remoteJid) || remoteJid
            jidLabel = name + ' (' + remoteJid + ')'
          } catch {}
        }
        if (trace) logger.info(`➡️ dispatch start | chat=${jidLabel} | user=${String(usuario).split("@")[0]} | group=${isGroup}`)
        
        const handled = await dispatch({ sock: s, message, remoteJid, usuario, isGroup })
        if (trace) logger.info(`✅ dispatch done | chat=${jidLabel} | handled=${handled === true}`)
        const replyFallback = String(process.env.REPLY_ON_UNMATCHED || 'false').toLowerCase() === 'true'
        const fromMe = !!message?.key?.fromMe
        if (replyFallback && handled !== true && !fromMe) {
          try {
            // Fallback solo en privado, o en grupos si hay mención al bot, + anti-spam por chat.
            const pv = !isGroup
            let mentionedBot = false
            try { mentionedBot = !!(message?.message?.extendedTextMessage?.contextInfo?.mentionedJid||[]).includes(s?.user?.id) } catch {}
            const eligible = pv || mentionedBot
            if (eligible) {
              global.__fallbackTs = global.__fallbackTs || new Map()
              const k = remoteJid
              const now = Date.now()
              const last = global.__fallbackTs.get(k) || 0
              if (now - last > 60000) {
                await safeSend(s, remoteJid, { text: '👋 Envíame un comando. Usa /menu o /help' }, { quoted: message })
                global.__fallbackTs.set(k, now)
              }
            }
          } catch (e) {
            logger.warn(`fallback reply failed: ${e?.message || e}`)
          }
        }

        // Ack opcional tras dispatch (debug). Habilitar con ACK_AFTER_DISPATCH=true
        try {
          const ack = String(process.env.ACK_AFTER_DISPATCH || 'false').toLowerCase() === 'true'
          if (ack && handled === true) {
            await safeSend(s, remoteJid, { text: '✅' }, { quoted: message })
          }
        } catch {}
      }
    } catch (e) {
      try {
        logger.warn(`[handleMessage] router failed: ${e?.message || e}`)
      } catch {}
    }
  } catch (err) {
    try { logger.error(`[handleMessage] error: ${err?.message || String(err)}`) } catch {}
  }
}

/* ===== Limpieza de sesión en disco (AuthState) ===== */
export async function clearWhatsAppSession(dirPath = null) {
  try {
    // Cerrar socket si está activo
    await teardownSocket()
  } catch {}
  try {
    const base = dirPath || savedAuthPath || (process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full'))
    const abs = path.resolve(base)
    if (abs && fs.existsSync(abs)) {
      // Eliminar de manera recursiva y forzada
      fs.rmSync(abs, { recursive: true, force: true })
    }
  } catch {}
}

