#!/usr/bin/env node
import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import pino from 'pino'

const __dirname = dirname(fileURLToPath(import.meta.url))

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

async function diagnose() {
  console.log('\n╔════════════════════════════════════╗')
  console.log('║  🔧 DIAGNÓSTICO PAIRING AUTOMÁTICO  ║')
  console.log('╚════════════════════════════════════╝\n')

  // Get number from env or use default
  const phoneFromEnv = process.env.PAIR_NUMBER || process.env.PHONE || ''
  const phoneNumber = onlyDigits(phoneFromEnv) || '595974154768'
  
  const codeFromEnv = process.env.PAIRING_CODE || process.env.PAIR_CODE || 'KONMI001'
  const customCode = String(codeFromEnv).trim().toUpperCase().slice(0, 8)

  console.log('📋 Configuración:')
  console.log(`  📞 Teléfono: +${phoneNumber}`)
  console.log(`  🔑 Código: ${customCode}`)
  console.log(`  📦 Módulo: @itsukichan/baileys`)
  
  // Import Baileys
  console.log('\n📦 Cargando Baileys...')
  let Baileys
  try {
    const mod = await import('@itsukichan/baileys')
    Baileys = mod.default || mod
  } catch (e) {
    console.error('❌ No se pudo cargar @itsukichan/baileys:', e.message)
    process.exit(1)
  }

  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = Baileys

  // Setup auth
  const authDir = join(__dirname, '..', 'storage', 'pairing_test')
  console.log(`\n📁 Directorio de auth: ${authDir}`)
  
  fs.rmSync(authDir, { recursive: true, force: true })
  fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  // Get version
  let version = [2, 3000, 1027934701]
  try {
    const vResp = await fetchLatestBaileysVersion()
    if (vResp?.version) version = vResp.version
  } catch (e) {
    console.log('⚠️  No se pudo obtener versión actualizada, usando fallback:', version)
  }

  console.log(`✅ Versión: ${version.join('.')}`)

  // Track events
  const eventLog = []
  function logEvent(name, data) {
    const entry = { timestamp: new Date().toISOString(), event: name, ...data }
    eventLog.push(entry)
    console.log(`  [${new Date().toLocaleTimeString()}] ${name}:`, JSON.stringify(data))
  }

  // Create socket
  console.log('\n🔌 Creando socket con configuración:')
  const socketConfig = {
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
    browser: Browsers?.windows?.('Chrome') || ['Chrome', 'Windows', '10.0'],
    version,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    syncFullHistory: false,
    emitOwnEvents: true,
    markOnlineOnConnect: false,
  }
  
  const sock = makeWASocket(socketConfig)
  console.log('✅ Socket creado')

  // Save creds
  sock.ev.on('creds.update', (creds) => {
    logEvent('creds.update', { updated: !!creds })
    saveCreds()
  })

  return new Promise((resolve, reject) => {
    let stage = 'initializing'
    let pairingAttempted = false
    const startTime = Date.now()

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update || {}
      
      logEvent('connection.update', { 
        connection, 
        qr: !!qr, 
        elapsed: `${Date.now() - startTime}ms`
      })

      try {
        // Stage: Socket opening
        if (connection === 'connecting') {
          stage = 'connecting'
          console.log('\n⏳ Socket conectando, esperando handshake...')
          
          // Wait a bit for handshake to complete
          await new Promise(r => setTimeout(r, 2000))
          
          if (!pairingAttempted) {
            pairingAttempted = true
            stage = 'requesting_code'
            
            console.log('\n📲 Solicitando código de pairing...')
            console.log(`   Número: ${phoneNumber}`)
            console.log(`   Código: ${customCode}`)
            
            try {
              // Check method availability
              const methods = ['requestPairingCode', 'requestPhonePairingCode', 'requestPairCode']
              const availableMethod = methods.find(m => typeof sock[m] === 'function')
              
              if (!availableMethod) {
                throw new Error(`No pairing method found. Available: ${Object.keys(sock).filter(k => typeof sock[k] === 'function' && k.includes('Pair')).join(', ') || 'none'}`)
              }
              
              console.log(`   Método: ${availableMethod}()`)
              
              const pairingCode = await sock[availableMethod](phoneNumber, customCode)
              
              stage = 'code_generated'
              logEvent('pairing_code_generated', { code: pairingCode })
              
              console.log('\n✅ CÓDIGO GENERADO:')
              console.log('   ' + String(pairingCode).toUpperCase())
              
              // Wait for connection to complete
              console.log('\n⏳ Esperando vinculación en el teléfono (máx 10 min)...')
              
            } catch (e) {
              stage = 'pairing_error'
              logEvent('pairing_error', { 
                message: e?.message || String(e),
                stack: e?.stack?.split('\n')[0]
              })
              
              console.error('\n❌ Error solicitando código:', e?.message || e)
              
              // Show details
              if (e?.output?.statusCode) {
                console.error(`   Status Code: ${e.output.statusCode}`)
              }
              if (e?.data) {
                console.error(`   Error Data:`, e.data)
              }
              
              // Close and reject
              try { sock.end(null) } catch {}
              reject(e)
              return
            }
          }
        }
        
        // Stage: Connection open
        if (connection === 'open') {
          stage = 'connected'
          logEvent('connected', { success: true })
          
          console.log('\n✅ CONEXIÓN ABIERTA - VINCULACIÓN EXITOSA')
          try { sock.end(null) } catch {}
          resolve({ success: true, code: pairingCode })
        }
        
        // Stage: Connection closed
        if (connection === 'close') {
          stage = 'disconnected'
          logEvent('disconnected', { reason: lastDisconnect?.reason })
          
          if (lastDisconnect?.reason === 'loggedOut') {
            console.log('\n✅ Desconectado normalmente')
            resolve({ success: false, reason: 'loggedOut' })
          } else {
            console.log('\n⚠️  Conexión cerrada:', lastDisconnect?.reason)
            reject(new Error(`Connection closed: ${lastDisconnect?.reason}`))
          }
        }
      } catch (e) {
        console.error('❌ Error en connection.update:', e?.message)
        try { sock.end(null) } catch {}
        reject(e)
      }
    })

    // Timeout protection
    setTimeout(() => {
      if (stage !== 'connected') {
        console.log(`\n⏰ Timeout después de 2 minutos en stage: ${stage}`)
        try { sock.end(null) } catch {}
        reject(new Error(`Timeout in stage: ${stage}`))
      }
    }, 120_000)

    sock.ev.on('stream:error', (err) => {
      logEvent('stream:error', { message: err?.message || String(err) })
    })

    sock.ev.on('call', (call) => {
      logEvent('call', call)
    })
  }).then(result => {
    console.log('\n\n═══════════════════════════════════')
    console.log('📋 RESUMEN DE EVENTOS:')
    console.log('═══════════════════════════════════\n')
    eventLog.forEach(e => {
      console.log(`[${e.timestamp}] ${e.event}`)
      delete e.timestamp
      delete e.event
      console.log('  ' + JSON.stringify(e))
    })
    
    return result
  }).catch(err => {
    console.log('\n\n═══════════════════════════════════')
    console.log('📋 RESUMEN DE EVENTOS (ANTES DEL ERROR):')
    console.log('═══════════════════════════════════\n')
    eventLog.forEach(e => {
      console.log(`[${e.timestamp}] ${e.event}`)
      delete e.timestamp
      delete e.event
      console.log('  ' + JSON.stringify(e))
    })
    throw err
  })
}

diagnose()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('\n❌ ERROR FATAL:', e?.message || e)
    process.exit(1)
  })
