// Minimal: prueba de pairing interactivo para ingresar número y obtener el código
// Uso: node scripts/pairing-interactive.js

import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

import {
  connectToWhatsApp,
  clearWhatsAppSession,
  setAuthMethod,
  getCurrentPairingInfo,
  getConnectionStatus,
  getSocket,
} from '../whatsapp.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar .env del backend/full
try { dotenv.config({ path: join(__dirname, '..', '.env'), override: true }) } catch {}

async function prompt(question) {
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(String(ans || '').trim()) }))
}

function onlyDigits(v) { return String(v || '').replace(/\D/g, '') }
function normalizeCustomCode(raw, enforceNumeric = false) {
  if (!raw) return ''
  let s = String(raw).trim().toUpperCase()
  s = enforceNumeric ? s.replace(/[^0-9]/g, '') : s.replace(/[^A-Z0-9]/g, '')
  if (s.length < 8 && enforceNumeric) {
    while (s.length < 8) s += Math.floor(Math.random() * 10).toString()
  }
  return s.slice(0, 8)
}

function resolveAuthDir() {
  const envAuth = process.env.AUTH_DIR || process.env.AUTH_PATH || null
  const sessionName = process.env.WA_SESSION_NAME || 'baileys_full'
  return envAuth
    ? (isAbsolute(envAuth) ? envAuth : join(__dirname, '..', envAuth))
    : join(__dirname, '..', 'storage', sessionName)
}

async function waitForPairingCode(maxMs = 120000) {
  const start = Date.now()
  let printedWait = false
  for (;;) {
    const info = getCurrentPairingInfo()
    if (info && info.code) return info
    if (!printedWait) {
      printedWait = true
      console.log('⏳ Esperando generación de Pairing Code...')
    }
    if (Date.now() - start > maxMs) return null
    await new Promise((r) => setTimeout(r, 500))
  }
}

async function waitForConnected(maxMs = 600000) {
  const start = Date.now()
  for (;;) {
    const st = getConnectionStatus()
    if (st?.status === 'connected') return st
    if (Date.now() - start > maxMs) return null
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════╗')
  console.log('║  🔐 PRUEBA DE PAIRING INTERACTIVO  ║')
  console.log('╚══════════════════════════════════╝\n')

  const authDir = resolveAuthDir()
  console.log('📂 Auth dir:', authDir)

  const raw = await prompt('Ingresa tu número con código de país (ej: 595974154768): ')
  const digits = onlyDigits(raw)
  if (!digits || digits.length < 10) {
    console.log('❌ Número inválido. Debe tener al menos 10 dígitos.')
    process.exit(1)
    return
  }

  // Preparar directorio
  try { fs.mkdirSync(authDir, { recursive: true }) } catch {}

  // Limpieza suave de sesión
  try { await clearWhatsAppSession() } catch {}

  // Custom code desde .env (si existe) o pedir por consola
  const envCustom = process.env.PAIRING_CODE || process.env.PAIR_CODE || process.env.PAIR_CUSTOM_CODE || process.env.CUSTOM_PAIRING_CODE || process.env['PAIRING-CODE'] || process.env['PAIR-CODE'] || ''
  const enforceNumeric = String(process.env.PAIR_ENFORCE_NUMERIC || '').toLowerCase() === 'true'
  let custom = normalizeCustomCode(envCustom, enforceNumeric)
  if (custom) {
    console.log('🔧 Usando código personalizado desde .env:', custom)
    process.env.PAIRING_CODE = custom
  }

  // Establecer método de autenticación
  setAuthMethod('pairing', { phoneNumber: digits })

  console.log(`\n📱 Iniciando pairing para +${digits}...`)
  await connectToWhatsApp(authDir, true, digits)

  // Adjuntar logs del socket si está disponible
  try {
    const sock = getSocket()
    if (sock?.ev?.on) {
      sock.ev.on('connection.update', (u) => {
        const { connection, qr, pairingCode, lastDisconnect } = u || {}
        console.log('[update]', { connection, hasQR: !!qr, hasPairingCode: !!pairingCode, code: pairingCode || undefined, err: lastDisconnect?.error?.message })
      })
    }
  } catch {}

  // Esperar código
  let info = await waitForPairingCode(120000)
  while (!info || !info.code) {
    console.log('\n⚠️ No se pudo generar el Pairing Code aún. Reintentando...')
    info = await waitForPairingCode(120000)
  }

  console.log('\n╔══════════════════════════════════╗')
  console.log('║     🔢 CÓDIGO DE VINCULACIÓN      ║')
  console.log('╚══════════════════════════════════╝')
  console.log(`Código: ${info.code}`)
  console.log(`Válido hasta: ${info.expiresAt || 'desconocido'}`)
  console.log('\n👉 Instrucciones:')
  console.log('   1) En tu teléfono: WhatsApp > Dispositivos vinculados')
  console.log('   2) Vincular con número de teléfono')
  console.log('   3) Ingresa el código mostrado arriba')

  // Esperar conexión
  let st = await waitForConnected(600000)
  while (!st) {
    console.log('\n⚠️ No se completó la conexión dentro del tiempo de espera. Esperando nuevamente...')
    st = await waitForConnected(600000)
  }

  console.log('\n✅ Conectado correctamente. Credenciales guardadas. Manteniendo proceso vivo. Ctrl+C para salir.')
  await new Promise(() => {})
}

main().catch((e) => {
  console.error('❌ Error en pairing-interactive:', e?.message || e)
  // Mantener proceso vivo para seguir observando
  setInterval(() => {}, 1 << 30)
})
