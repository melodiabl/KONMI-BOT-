import { fileURLToPath } from 'url'
import { dirname, join, isAbsolute } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import QRCode from 'qrcode'

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
  console.log('\n╔════════════════════════════════════╗')
  console.log('║  📱 QR CODE PAIRING - nstar-y/bail║')
  console.log('╚════════════════════════════════════╝\n')

  const modName = 'baileys'
  let mod
  try {
    mod = await import(modName)
  } catch (e) {
    console.log('❌ Error loading baileys:', e.message)
    process.exit(1)
  }

  const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
  const makeWASocket = M.makeWASocket || M.default
  const useMultiFileAuthState = M.useMultiFileAuthState
  const fetchLatestBaileysVersion = M.fetchLatestBaileysVersion
  const Browsers = M.Browsers

  if (!makeWASocket || !useMultiFileAuthState) {
    console.log('❌ Could not load Baileys module:', modName)
    process.exit(1)
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

  let qrGenerated = false
  sock.ev.on('connection.update', async (u) => {
    const { connection, qr, lastDisconnect } = u || {}
    
    if (qr && !qrGenerated) {
      qrGenerated = true
      console.log('\n✅ QR Code generated!')
      console.log('📱 Steps:')
      console.log('  1. Open WhatsApp on your phone')
      console.log('  2. Go to: Settings > Linked devices > Link a device')
      console.log('  3. Point your phone camera at the QR code below')
      console.log('  4. Or use: Scan with phone camera\n')
      
      try {
        const qrPath = join(authDir, 'qr.txt')
        fs.writeFileSync(qrPath, qr)
        console.log(`💾 QR saved to: ${qrPath}`)
        
        const imagePath = join(authDir, 'qr.png')
        await QRCode.toFile(imagePath, qr)
        console.log(`🖼️  QR image saved to: ${imagePath}\n`)
      } catch (e) {
        console.log('Note: Could not save QR files:', e.message)
      }
    }

    if (connection === 'open') {
      console.log('\n╔════════════════════════════════════╗')
      console.log('║  ✅ DEVICE LINKED SUCCESSFULLY     ║')
      console.log('╚════════════════════════════════════╝\n')
      console.log(`📁 Credentials saved to: ${authDir}`)
      console.log('🔄 You can now start the main bot with: npm start\n')
      process.exit(0)
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      const message = lastDisconnect?.error?.message || 'Unknown error'
      
      if (status === 401) {
        console.log('\n❌ Unauthorized - Please try again')
        process.exit(1)
      } else if (status === 403) {
        console.log('\n❌ Forbidden - Device may be blocked')
        process.exit(1)
      } else {
        console.log(`\n⚠️  Connection closed: ${message}`)
        console.log('🔄 Reconnecting...\n')
      }
    }

    if (connection === 'connecting') {
      console.log('⏳ Connecting...')
    }
  })

  console.log('⏳ Waiting for QR code... (Ctrl+C to exit)')
  
  process.on('SIGINT', () => {
    console.log('\n\n👋 Exiting...')
    process.exit(0)
  })

  await new Promise(() => {})
}

main().catch((e) => {
  console.error('❌ Error:', e?.message || e)
  process.exit(1)
})
