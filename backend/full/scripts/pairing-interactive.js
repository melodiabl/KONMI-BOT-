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
  return s.length >= 8 ? s.slice(0, 8) : s
}

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

async function pairingQR() {
  console.log('\n╔════════════════════════════════════╗')
  console.log('║  📱 QR CODE PAIRING               ║')
  console.log('╚════════════════════════════════════╝\n')

  const mod = await import('baileys')
  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  const makeWASocket = M.makeWASocket || M.default
  const useMultiFileAuthState = M.useMultiFileAuthState
  const fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  const Browsers = M.Browsers

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
    const { connection, qr, lastDisconnect } = u || {}
    
    if (qr) {
      console.log('\n✅ QR Code generated!')
      console.log('📱 Steps:')
      console.log('  1. Open WhatsApp on your phone')
      console.log('  2. Go to: Settings > Linked devices > Link a device')
      console.log('  3. Scan the QR code above\n')
      
      try {
        const qrPath = join(authDir, 'qr.txt')
        fs.writeFileSync(qrPath, qr)
        console.log(`💾 QR saved to: ${qrPath}\n`)
      } catch (e) {
        console.log('Note: Could not save QR file:', e.message)
      }
    }

    if (connection === 'open') {
      console.log('\n╔════════════════════════════════════╗')
      console.log('║  ✅ DEVICE LINKED SUCCESSFULLY    ║')
      console.log('╚════════════════════════════════════╝\n')
      console.log(`📁 Credentials saved to: ${authDir}`)
      console.log('🔄 You can now start the main bot with: npm start\n')
      process.exit(0)
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      if (status === 401 || status === 403) {
        console.log('\n❌ Connection rejected. Please try again.')
        process.exit(1)
      }
    }
  })

  console.log('⏳ Waiting for QR code... (Ctrl+C to exit)')
  process.on('SIGINT', () => {
    console.log('\n\n👋 Exiting...')
    process.exit(0)
  })

  await new Promise(() => {})
}

async function pairingCode() {
  console.log('\n╔═══════════════════════════════════════════╗')
  console.log('║  🔐 CUSTOM PAIRING CODE - nstar-y/bail    ║')
  console.log('╚═══════════════════════════════════════════╝\n')

  const mod = await import('baileys')
  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  const makeWASocket = M.makeWASocket || M.default
  const useMultiFileAuthState = M.useMultiFileAuthState
  const fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  const Browsers = M.Browsers

  const raw = await prompt('📱 Enter your phone number with country code (e.g., 595974154768): ')
  const digits = onlyDigits(raw)
  if (!digits || digits.length < 10) {
    console.log('❌ Invalid number. Must have at least 10 digits.')
    return
  }
  console.log(`✅ Phone: +${digits}\n`)

  const enforceNumeric = String(process.env.PAIR_ENFORCE_NUMERIC || 'false').toLowerCase() === 'true'
  let custom = process.env.PAIRING_CODE || process.env.PAIR_CODE || ''
  
  if (!custom) {
    const useCustom = await prompt('🔑 Use custom pairing code? (y/n): ')
    if (useCustom.toLowerCase() === 'y') {
      const rawCode = await prompt('🔐 Enter custom code (8 alphanumeric chars): ')
      custom = normalizeCustomCode(rawCode, enforceNumeric)
      if (!custom || custom.length < 8) {
        console.log('❌ Invalid code. Using auto-generated code.')
        custom = ''
      } else {
        console.log(`✅ Custom code: ${custom}\n`)
      }
    }
  } else {
    custom = normalizeCustomCode(custom, enforceNumeric)
    console.log(`✅ Using custom code from .env: ${custom}\n`)
  }

  const authDir = resolveAuthDir()
  try { fs.mkdirSync(authDir, { recursive: true }) } catch {}

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  
  try {
    state.creds.usePairingCode = true
    state.creds.registered = false
    await saveCreds()
  } catch {}

  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    browser: (Browsers?.windows?.('WhatsApp Web') || Browsers?.ubuntu?.('Chrome')),
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  try {
    if (typeof sock.waitForSocketOpen === 'function') {
      await sock.waitForSocketOpen()
    } else {
      await new Promise(r => setTimeout(r, 2000))
    }
  } catch {}

  console.log('📡 Requesting pairing code...')
  
  let code = null
  try {
    if (custom) {
      console.log(`   With custom code: ${custom}`)
      code = await Promise.race([
        sock.requestPairingCode(digits, custom),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ])
    } else {
      code = await Promise.race([
        sock.requestPairingCode(digits),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ])
    }
  } catch (e) {
    console.log(`⚠️  ${e.message}`)
  }

  if (!code) {
    console.log('❌ Could not generate pairing code.')
    process.exit(1)
  }

  const formatted = String(code).toUpperCase().replace(/[-\s]/g, '')
  const grouped = (formatted.match(/.{1,4}/g) || [formatted]).join('-')

  console.log('\n╔═══════════════════════════════════════════╗')
  console.log('║  ✅ PAIRING CODE GENERATED                ║')
  console.log('╠═══════════════════════════════════════════╣')
  console.log(`║  📞 Phone: +${digits.padEnd(32)}║`)
  if (custom) console.log(`║  🔑 Custom: ${custom.padEnd(36)}║`)
  console.log(`║  🔐 Code:   ${grouped.padEnd(36)}║`)
  console.log('║  ⏰ Valid for 10 minutes                   ║')
  console.log('╠═══════════════════════════════════════════╣')
  console.log('║  📱 On your phone:                        ║')
  console.log('║  1. Open WhatsApp                         ║')
  console.log('║  2. Settings > Linked devices             ║')
  console.log('║  3. Link with phone number                ║')
  console.log('║  4. Enter the code above                  ║')
  console.log('╚═══════════════════════════════════════════╝\n')

  const connected = await new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => { 
      if (!done) { done = true; resolve(false) } 
    }, 10 * 60 * 1000)

    sock.ev.on('connection.update', (u) => {
      const { connection } = u || {}
      if (!done && connection === 'open') {
        try { clearTimeout(timer) } catch {}
        done = true
        resolve(true)
      }
      if (!done && connection === 'close') {
        try { clearTimeout(timer) } catch {}
        done = true
        resolve(false)
      }
    })
  })

  if (connected) {
    console.log('╔═══════════════════════════════════════════╗')
    console.log('║  ✅ DEVICE LINKED SUCCESSFULLY           ║')
    console.log('╚═══════════════════════════════════════════╝\n')
    console.log(`📁 Credentials saved to: ${authDir}`)
    console.log('🔄 You can now start the main bot with: npm start\n')
    process.exit(0)
  }

  console.log('⚠️  Pairing not completed or connection closed.')
  try { sock.ws?.close() } catch {}
  process.exit(1)
}

async function main() {
  console.log('\n╔════════════════════════════════════════════╗')
  console.log('║  🔗 KONMI BOT - PAIRING SETUP              ║')
  console.log('╚════════════════════════════════════════════╝')
  
  console.log('\nChoose pairing method:')
  console.log('  1) QR Code (default)')
  console.log('  2) Custom Pairing Code (nstar-y/bail)\n')
  
  const choice = await prompt('Select option (1/2): ')
  
  if (choice === '2') {
    await pairingCode()
  } else {
    await pairingQR()
  }
}

main().catch((e) => {
  console.error('❌ Error:', e?.message || e)
  process.exit(1)
})
