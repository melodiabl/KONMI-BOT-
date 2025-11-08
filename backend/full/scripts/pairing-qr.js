// Pairing por QR simple (Baileys directo) y espera hasta conectar
// Uso: node scripts/pairing-qr.js

import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

// Cargar .env de backend/full
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
try { dotenv.config({ path: join(__dirname, '..', '.env'), override: true }) } catch {}

function resolveAuthDir() {
  const envAuth = process.env.AUTH_DIR || process.env.AUTH_PATH || null
  const sessionName = process.env.WA_SESSION_NAME || 'baileys_full'
  return envAuth
    ? (isAbsolute(envAuth) ? envAuth : join(__dirname, '..', envAuth))
    : join(__dirname, '..', 'storage', sessionName)
}

async function main() {
  const modName = process.env.BAILEYS_MODULE || '@whiskeysockets/baileys'
  const mod = await import(modName)
  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  const makeWASocket = M.makeWASocket || M.default
  const useMultiFileAuthState = M.useMultiFileAuthState
  const fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  const Browsers = M.Browsers
  if (!makeWASocket || !useMultiFileAuthState) {
    console.log('❌ No se pudo cargar el módulo de Baileys:', modName)
    setInterval(() => {}, 1 << 30)
    return
  }

  const authDir = resolveAuthDir()
  try { fs.mkdirSync(authDir, { recursive: true }) } catch {}
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    browser: (Browsers?.windows?.('WhatsApp Web') || Browsers?.ubuntu?.('Chrome')),
    printQRInTerminal: true,
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect } = u || {}
    console.log('[update]', { connection, err: lastDisconnect?.error?.message })
  })
  console.log('\n📷 Escanea el QR mostrado en esta terminal desde WhatsApp > Dispositivos vinculados > Vincular dispositivo.')
  console.log('⏳ Esperando conexión... (Ctrl+C para salir)')
  await new Promise(() => {})
}

main().catch((e) => { console.error('❌ pairing-qr error:', e?.message || e); setInterval(() => {}, 1 << 30) })

