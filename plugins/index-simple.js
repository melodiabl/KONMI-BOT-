// index-simple.js (robusto QR + Pairing con reintentos)
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import QRCode from 'qrcode'
import qrTerm from 'qrcode-terminal'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===== CARGA DINÁMICA DE BAILEYS =====
let makeWASocket, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion, DisconnectReason
async function loadBaileys() {
  const envName = process.env.BAILEYS_MODULE
  const candidates = []
  const normalizeSpecifier = (raw) => {
    try {
      if (!raw) return null
      const s = String(raw).trim()
      const l = s.toLowerCase()
      if (l === 'bail' || l.includes('nstar-y/bail') || l.includes('github:nstar-y/bail') || l === 'baileys-mod') return 'baileys-mod'
      if (l.includes('whiskeysockets') || l === '@whiskeysockets/baileys' || l === 'baileys') return '@whiskeysockets/baileys'
      if (l.includes('elaina') || l.includes('rexxhayanasi')) return '@rexxhayanasi/elaina-bail'
      return s
    } catch { return raw }
  }
  if (envName && !/^github:/i.test(envName)) {
    const norm = normalizeSpecifier(envName)
    if (norm) candidates.push(norm)
    if (!norm || norm !== envName) candidates.push(envName)
  }
  // Preferir forks conocidos antes del oficial
  candidates.push('baileys-mod', '@rexxhayanasi/elaina-bail', '@whiskeysockets/baileys', 'baileys')

  let lastErr
  for (const name of candidates) {
    try {
      const mod = await import(name)
      const M = mod.default || mod
      makeWASocket = M.makeWASocket || M.default
      useMultiFileAuthState = M.useMultiFileAuthState
      Browsers = M.Browsers
      fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
      DisconnectReason = M.DisconnectReason
      if (!makeWASocket || !useMultiFileAuthState) {
        throw new Error(`El módulo "${name}" no expone makeWASocket/useMultiFileAuthState`)
      }
      console.log(`✅ Baileys cargado: ${name}`)
      return
    } catch (e) { lastErr = e }
  }
  throw new Error(`No pude cargar Baileys. Último error: ${lastErr?.message}`)
}
await loadBaileys()

// ===== CONFIG =====
const AUTH_DIR = path.resolve(process.env.AUTH_DIR || './storage/baileys_simple')
fs.mkdirSync(path.join(AUTH_DIR, 'keys'), { recursive: true })
const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

const logger = pino({ level: 'silent' })
const MODE = (process.env.AUTH_METHOD || 'qr').toLowerCase()           // 'qr' | 'pair'
const E164 = (process.env.PAIR_NUMBER || '').replace(/\D/g, '')        // ej. 595974154768
const CUSTOM8 = (process.env.PAIR_CUSTOM || '').trim().toUpperCase()   // ej. ABCD1234 (opcional, 8 A-Z0-9)
const SHOW_QR_TERM = String(process.env.QR_TERMINAL || 'true').toLowerCase() !== 'false'
const QR_DIR = process.env.QR_IMAGE_DIR || path.join(AUTH_DIR, 'media', 'qr')

// ===== UTIL =====
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getWaWebVersion() {
  try {
    if (typeof fetchLatestBaileysVersion === 'function') {
      const { version } = await fetchLatestBaileysVersion()
      if (Array.isArray(version) && version.length === 3) return version
    }
  } catch {}
  // Fallback estable (no perfecto, pero evita cierres por incompatibilidad)
  return [2, 3000, 1027934701]
}

function formatPair(code) {
  return (String(code).match(/.{1,4}/g) || [String(code)]).join('-')
}

// ===== CONEXIÓN =====
let sock = null
let reconnectAttempt = 0

async function start() {
  const version = await getWaWebVersion()
  const browserDefault =
    (Browsers?.baileys?.('Chrome')) ||
    (Browsers?.ubuntu?.('Chrome')) ||
    ['Chrome', 'Ubuntu', '1.0.0']

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,      // control manual del QR
    browser: browserDefault,
    version,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
    mobile: false,
    getMessage: async () => null
  })

  // Guardado confiable de credenciales
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds()
      const cf = path.join(AUTH_DIR, 'creds.json')
      console.log(fs.existsSync(cf) ? '💾 creds.json escrito' : '…esperando creds.json')
    } catch (e) {
      console.warn('⚠️ creds.update → saveCreds falló:', e?.message || e)
    }
  })

  // QR + estados
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    try {
      if (qr && state?.creds?.registered === false) {
        fs.mkdirSync(QR_DIR, { recursive: true })
        const outFile = path.join(QR_DIR, 'qr.png')
        try {
          const dataUrl = await QRCode.toDataURL(qr)
          const base64 = dataUrl.split(',')[1]
          fs.writeFileSync(outFile, Buffer.from(base64, 'base64'))
        } catch {
          const buf = await QRCode.toBuffer(qr, { type: 'png', width: 360, margin: 1 })
          fs.writeFileSync(outFile, buf)
        }
        if (SHOW_QR_TERM) {
          try { qrTerm.generate(qr, { small: true }) } catch {}
        }
        console.log(`[QR] guardado en: ${outFile}`)
        console.log('    Escanéalo: WhatsApp → (⋮) Dispositivos vinculados → Vincular con QR\n')
      }

      if (connection === 'open') {
        reconnectAttempt = 0
        console.log('✅ Conectado\n')
      }

      if (connection === 'close') {
        const err = lastDisconnect?.error
        const statusCode = err?.output?.statusCode || err?.code || err?.status
        const msg = err?.message || String(err || '')
        const codeTxt = statusCode ? `Status: ${statusCode}` : 'Status: (desconocido)'
        console.log(`⚠️ Conexión cerrada. ${codeTxt} — ${msg}`)

        // Diagnóstico común
        if (statusCode === DisconnectReason?.loggedOut) {
          console.log('❌ Sesión cerrada (loggedOut). Borra AUTH_DIR o reloguea por QR/Pairing.')
          return
        }

        // Reintento con backoff
        reconnectAttempt++
        const backoff = Math.min(5000, 500 * reconnectAttempt)
        console.log(`🔄 Reintentando en ${backoff} ms...`)
        await sleep(backoff)
        await start()
      }
    } catch (e) {
      console.warn('⚠️ connection.update handler error:', e?.message || e)
    }
  })

  // Pairing (si se pidió)
  if (MODE === 'pair') {
    if (!/^\d{10,16}$/.test(E164)) {
      console.error('❌ PAIR_NUMBER inválido. Usa E.164 sin + (ej: 595974154768)')
    } else {
      // pedir el código un toque después (no hace falta esperar WS OPEN)
      setTimeout(async () => {
        try {
          let code
          try {
            code = await sock.requestPairingCode(E164)
          } catch {
            const custom = /^[A-Z0-9]{8}$/.test(CUSTOM8) ? CUSTOM8 : undefined
            code = await sock.requestPairingCode(E164, custom)
          }
          console.log('\n╔════════════════════════════════════════╗')
          console.log('║     CÓDIGO DE EMPAREJAMIENTO LISTO     ║')
          console.log('╚════════════════════════════════════════╝')
          console.log(`📞 Número: +${E164}`)
          console.log(`🔑 Código: ${formatPair(code)}\n`)
          console.log('👉 En el teléfono: (⋮) Dispositivos vinculados → Vincular con número de teléfono')
        } catch (e) {
          console.error('❌ No se pudo obtener pairing code:', e?.message || e)
          console.log('↪️ Tip: inicia con AUTH_METHOD=qr para “sembrar” creds y luego reintenta pairing.')
        }
      }, 600)
    }
  }
}

console.log(`\nModo de autenticación: ${MODE === 'pair' ? 'PAIRING CODE' : 'QR'}`)
if (MODE === 'pair') console.log(`Objetivo E.164: +${E164 || '(no definido)'}`)
console.log(`Directorio de auth: ${AUTH_DIR}\n`)
start().catch(e => console.error('❌ start() error:', e?.message || e))
