// Minimal ejemplo oficial Baileys: QR y Pairing opcional
// Ejecuta: node backend/full/scripts/baileys-minimal.js
// Pairing opcional: PAIR_NUMBER=595XXXXXXXX node backend/full/scripts/baileys-minimal.js

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import qrTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'

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
    // Manejo de QR manual (ASCII + PNG); evitamos usar flag deprecada
    printQRInTerminal: false,
    browser: pickBrowser(),
    logger: pino({ level: 'info' })
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update || {}
    if (qr) {
      try { qrTerminal.generate(qr, { small: true }) } catch {}
      try {
        const outDir = path.join(__dirname, '..', 'storage', 'media', 'qr')
        fs.mkdirSync(outDir, { recursive: true })
        const dataUrl = await QRCode.toDataURL(qr)
        if (dataUrl?.startsWith('data:image')) {
          const base64 = dataUrl.split(',')[1]
          fs.writeFileSync(path.join(outDir, 'example-qr.png'), Buffer.from(base64, 'base64'))
        }
      } catch {}
      console.log('[example] QR listo (ASCII arriba) y guardado en storage/media/qr/example-qr.png')
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

  // Pairing code opcional (si se define PAIR_NUMBER y no está registrado)
  try {
    const digits = String(process.env.PAIR_NUMBER || '').replace(/\D/g, '')
    if (digits && sock?.authState?.creds?.registered === false && typeof sock.requestPairingCode === 'function') {
      const code = await sock.requestPairingCode(digits)
      console.log('[example] Pairing code:', code)
    }
  } catch (e) {
    console.warn('[example] pairing error:', e?.message)
  }
}

main().catch((e) => {
  console.error('[example] fatal:', e?.message || e)
})
