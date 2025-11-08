// index.js — Runner interactivo “original” (QR / Pairing), sin tocar/backup creds
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import {
  connectToWhatsApp,
  connectWithPairingCode,
  getConnectionStatus,
} from './whatsapp.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, (ans) => res((ans || '').trim())))
const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

function banner() {
  console.log('\n🤖 KONMI BOT\n')
  console.log('🔐 Sistema de autenticación\n')
}
function menu() {
  console.log('╔════════════════════════════════════════╗')
  console.log('║   🔐 SELECCIÓN DE AUTENTICACIÓN        ║')
  console.log('╠════════════════════════════════════════╣')
  console.log('║ 1) 📱 Código QR (recomendado)          ║')
  console.log('║ 2) 🔢 Pairing Code (código en el tel.) ║')
  console.log('╚════════════════════════════════════════╝')
}

function dumpEnvPreview(authPath) {
  const credsPath = path.join(authPath, 'creds.json')
  const exists = fs.existsSync(credsPath)
  console.log('─────────────────────────────────────────────')
  console.log('📄 Auth dir:           ', authPath)
  console.log('💾 creds.json:         ', exists ? 'existe ✅' : 'no existe ❌')
  console.log('📦 BAILEYS_MODULE:     ', process.env.BAILEYS_MODULE || '(por defecto)')
  console.log('🖥️  BOT_DEVICE_NAME:    ', process.env.BOT_DEVICE_NAME || '(WhatsApp Web)')
  console.log('🌐 WA_WEB_VERSION:     ', process.env.WA_WEB_VERSION || '(fetchLatest)')
  console.log('🟢 DEBUG_PAIRING:      ', String(process.env.DEBUG_PAIRING || 'false'))
  console.log('🔑 PAIRING_CODE:       ', process.env.PAIRING_CODE ? '(definido)' : '(no definido)')
  console.log('🔢 PAIR_NUMBER:        ', process.env.PAIR_NUMBER || '(vacío)')
  console.log('─────────────────────────────────────────────')
}

function startStatusTicker(intervalMs = 4000) {
  const quiet = String(process.env.QUIET_LOGS || process.env.BOT_QUIET || 'false').toLowerCase() === 'true'
  const enabled = String(process.env.STATUS_TICKER || 'false').toLowerCase() === 'true'
  if (quiet || !enabled) return () => {}
  const t = setInterval(() => {
    const st = getConnectionStatus()
    console.log(`[status] ${new Date().toLocaleString()} :: ${st.status}`)
  }, intervalMs)
  return () => clearInterval(t)
}

async function main() {
  banner()
  menu()

  let method = await ask('Elige método (1/2) [1]: ')
  if (!method) method = '1'

  const authPath = path.resolve(process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full'))
  const stopTicker = startStatusTicker(Number(process.env.STATUS_TICKER_MS || 10000))

  if (method === '2') {
    console.log('\nHas elegido: 🔢 Pairing Code\n')
  } else {
    console.log('\nHas elegido: 📱 Código QR\n')
  }
  dumpEnvPreview(authPath)

  if (method === '2') {
    let input = await ask('Ingresa tu número en formato internacional (ej: 595974154768): ')
    if (!input) input = process.env.PAIR_NUMBER || ''
    const digits = onlyDigits(input)

    if (!digits) {
      console.log('❌ Número inválido. Debe ser E.164 sin "+", por ej. 595974154768')
      rl.close()
      stopTicker()
      process.exit(1)
    }

    console.log(`✅ Número validado: +${digits}`)
    console.log('⚠️ Instrucciones: WhatsApp → Dispositivos vinculados → Vincular con número → escribí el código SIN guiones')

    try {
      await connectWithPairingCode(digits, authPath)
      // El resto de logs (open/close, code) salen desde whatsapp.js
    } catch (e) {
      console.error('❌ Error al iniciar pairing:', e?.message || e)
    }
  } else {
    try {
      await connectToWhatsApp(authPath, false, null)
    } catch (e) {
      console.error('❌ Error al iniciar QR:', e?.message || e)
    }
  }
  // Dejar el proceso vivo para escuchar eventos; Ctrl+C para salir.
}

process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err?.stack || err))
process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err?.stack || err))

main().catch((e) => {
  console.error('Main error:', e?.stack || e)
  process.exit(1)
})
