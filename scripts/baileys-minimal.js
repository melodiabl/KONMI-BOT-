// Minimal ejemplo oficial Baileys (fork @itsukichan/baileys):
// - QR por defecto (como en el README)
// - Pairing Code opcional si se define PAIR_NUMBER (y PAIRING_CODE para custom)
// Ejecuta: node backend/full/scripts/baileys-minimal.js
// Pairing opcional: PAIR_NUMBER=595XXXXXXXX PAIRING_CODE=KONMIBOT node backend/full/scripts/baileys-minimal.js
import pino from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'
let makeWASocket
let useMultiFileAuthState
let fetchLatestBaileysVersion
let Browsers

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let fallback = 0

function pickBrowser() {
  const variants = [
    Browsers.windows('Chrome'),
    Browsers.ubuntu('Chrome'),
    Browsers.baileys('Chrome'),
    Browsers.macOS('Chrome'),
    Browsers.appropriate('Chrome'),
  ]
  const b = variants[fallback % variants.length]
  fallback += 1
  return b
}

async function main() {
  const modName = process.env.BAILEYS_MODULE || '@whiskeysockets/baileys'
  const mod = await import(modName)
  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  makeWASocket = M.makeWASocket || M.default
  useMultiFileAuthState = M.useMultiFileAuthState
  fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  Browsers = M.Browsers

  if (!makeWASocket || !useMultiFileAuthState || !fetchLatestBaileysVersion || !Browsers) {
    console.error('❌ No se pudo cargar correctamente el módulo Baileys:', modName)
    process.exit(1)
  }

  // Modo QR vs Pairing code (según README del fork)
  // - QR: sin PAIR_NUMBER => printQRInTerminal: true
  // - Pairing: con PAIR_NUMBER => printQRInTerminal: false y se llama requestPairingCode
  const rawNumber = String(process.env.PAIR_NUMBER || '').trim()
  const pairDigits = rawNumber.replace(/\D/g, '')
  const isPairingMode = !!pairDigits

  const authDir = path.join(__dirname, '..', 'storage', 'baileys_example')
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  let { version } = await fetchLatestBaileysVersion()
  try {
    const envV = (process.env.WA_WEB_VERSION || '').trim()
    if (envV) {
      const parsed = envV.split(/[.,\s]+/).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n)).slice(0, 3)
      if (parsed.length === 3) version = parsed
    }
  } catch {}

  const sock = makeWASocket({
    auth: state,
    version,
    browser: pickBrowser(),
    // README (QR): printQRInTerminal: true
    // README (Pairing): printQRInTerminal: false
    printQRInTerminal: !isPairingMode,
    logger: pino({ level: 'info' })
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update || {}

    if (qr && !isPairingMode) {
      // El QR se imprime automáticamente en terminal porque printQRInTerminal=true.
      console.log('[example] QR recibido. Escanéalo con WhatsApp en tu teléfono.')
    }

    if (connection === 'open') {
      console.log('[example] ✅ Conectado')
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.code
      const msg = (lastDisconnect?.error)?.message
      console.log('[example] ⚠️ Cerrado:', code, msg || '')
      // Reintentar rápido en 515/408/428
      if ([515, 408, 428].includes(Number(code))) {
        setTimeout(() => { main().catch(()=>{}) }, 1000)
      }
    }
  })

  // Pairing code opcional (según README del fork):
  // if (!suki.authState.creds.registered) {
  //   const number = 'XXXXXXXXXXX'
  //   const code = await suki.requestPairingCode(number, 'CODEOTPS')
  // }
  if (isPairingMode && sock?.authState?.creds?.registered === false && typeof sock.requestPairingCode === 'function') {
    try {
      const rawCustom =
        process.env.PAIRING_CODE ||
        process.env.PAIR_CODE ||
        process.env.PAIR_CUSTOM_CODE ||
        process.env.CUSTOM_PAIRING_CODE ||
        process.env['PAIRING-CODE'] ||
        process.env['PAIR-CODE'] ||
        ''
      const custom = String(rawCustom || '').trim().toUpperCase()

      let code
      if (custom) {
        try {
          code = await sock.requestPairingCode(pairDigits, custom)
        } catch (e) {
          console.warn('[example] pairing custom fallo, usando código generado por WhatsApp:', e?.message || e)
          code = await sock.requestPairingCode(pairDigits)
        }
      } else {
        code = await sock.requestPairingCode(pairDigits)
      }

      console.log('[example] Pairing code:', code)
      console.log('👉 En tu teléfono: Dispositivos vinculados > Vincular con número de teléfono y escribe este código.')
    } catch (e) {
      console.warn('[example] pairing error:', e?.message || e)
    }
  }
}

main().catch((e) => {
  console.error('[example] fatal:', e?.message || e)
})
