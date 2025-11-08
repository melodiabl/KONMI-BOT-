// Prueba directa usando Baileys sin el wrapper, para aislar problemas
// Uso: node scripts/pairing-direct.js

import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

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

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar .env del backend/full
try { dotenv.config({ path: join(__dirname, '..', '.env'), override: true }) } catch {}

function resolveAuthDir() {
  const envAuth = process.env.AUTH_DIR || process.env.AUTH_PATH || null
  const sessionName = process.env.WA_SESSION_NAME || 'baileys_full'
  return envAuth
    ? (isAbsolute(envAuth) ? envAuth : join(__dirname, '..', envAuth))
    : join(__dirname, '..', 'storage', sessionName)
}

async function main() {
  console.log('\n╔═══════════════════════════════╗')
  console.log('║  🔐 PAIRING DIRECTO BAILEYS    ║')
  console.log('╚═══════════════════════════════╝\n')

  const modName = process.env.BAILEYS_MODULE || '@whiskeysockets/baileys'
  const mod = await import(modName)
  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  const makeWASocket = M.makeWASocket || M.default
  const useMultiFileAuthState = M.useMultiFileAuthState
  const fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  const Browsers = M.Browsers

  if (!makeWASocket || !useMultiFileAuthState) {
    console.log('❌ No se pudo cargar el módulo de Baileys:', modName)
    process.exit(1)
  }

  const raw = await prompt('Ingresa tu número con código de país (ej: 595974154768): ')
  const digits = onlyDigits(raw)
  if (!digits || digits.length < 10) {
    console.log('❌ Número inválido. Debe tener al menos 10 dígitos.')
    return
  }

  const authDir = resolveAuthDir()
  try { fs.mkdirSync(authDir, { recursive: true }) } catch {}

  // Bucle infinito: reintentar hasta que se vincule; mantener vivo tras conectar
  for (;;) {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    try { state.creds.usePairingCode = true; state.creds.registered = false; await saveCreds() } catch {}
    const { version } = await fetchLatestBaileysVersion()
    const sock = makeWASocket({
      version,
      auth: state,
      browser: (Browsers?.windows?.('WhatsApp Web') || Browsers?.ubuntu?.('Chrome')),
      printQRInTerminal: false,
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (u) => {
      const { connection, qr, pairingCode, lastDisconnect } = u || {}
      console.log('[update]', { connection, hasQR: !!qr, pairingCode: pairingCode || undefined, err: lastDisconnect?.error?.message })
    })

    // Esperar apertura mínima
    try { if (typeof sock.waitForSocketOpen === 'function') await sock.waitForSocketOpen() } catch {}

    // Elegir código personalizado (opcional)
    const enforceNumeric = String(process.env.PAIR_ENFORCE_NUMERIC || '').toLowerCase() === 'true'
    let custom = process.env.PAIRING_CODE || process.env.PAIR_CODE || process.env.PAIR_CUSTOM_CODE || process.env.CUSTOM_PAIRING_CODE || process.env['PAIRING-CODE'] || process.env['PAIR-CODE'] || ''
    custom = normalizeCustomCode(custom, enforceNumeric)
    if (!custom) {
      // No preguntar en bucle, solo intentamos automático si no hay custom
    } else {
      console.log('Usando código personalizado:', custom)
      process.env.PAIRING_CODE = custom
    }

    const reqFn = (typeof sock.requestPhonePairingCode === 'function') ? sock.requestPhonePairingCode.bind(sock)
                  : (typeof sock.requestPairingCode === 'function') ? sock.requestPairingCode.bind(sock)
                  : null
    if (!reqFn) {
      console.log('❌ Este módulo no expone ni requestPhonePairingCode ni requestPairingCode. Reintentando en 5s...')
      try { sock.ws?.close() } catch {}
      await new Promise(r => setTimeout(r, 5000))
      continue
    }
    let code
    try {
      code = await reqFn(digits, custom || undefined)
    } catch (e) {
      try { code = await reqFn(digits) } catch (e2) { console.log('❌ Error solicitando code:', e2?.message || e2); try { sock.ws?.close() } catch {}; await new Promise(r=>setTimeout(r,3000)); continue }
    }
    console.log('\n🔢 Pairing code:', code)
    console.log('👉 Ingresa este código en tu teléfono (Dispositivos vinculados).')

    // Esperar hasta vincular (connection=open) o reintentar
    const connected = await new Promise((resolve) => {
      let done = false
      const timer = setTimeout(() => { if (!done) { done = true; resolve(false) } }, 10 * 60 * 1000)
      sock.ev.on('connection.update', (u) => {
        const { connection } = u || {}
        if (!done && connection === 'open') { try { clearTimeout(timer) } catch {}; done = true; resolve(true) }
        if (!done && connection === 'close') { try { clearTimeout(timer) } catch {}; done = true; resolve(false) }
      })
    })
    if (connected) {
      console.log('\n✅ Vinculado y conectado. Credenciales guardadas en', authDir)
      console.log('⏳ Manteniendo el proceso vivo. Ctrl+C para salir.')
      await new Promise(() => {})
      break
    }
    console.log('\n⚠️ No se completó la vinculación en el tiempo esperado o la conexión se cerró. Reintentando en 5s...')
    try { sock.ws?.close() } catch {}
    await new Promise(r => setTimeout(r, 5000))
  }
}

main().catch((e) => { console.error('❌ Error pairing-direct:', e?.message || e); process.exit(1) })
