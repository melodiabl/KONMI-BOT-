import fs from 'fs'
import path from 'path'
import axios from 'axios'
import logger from './config/logger.js'

const MEDIA_DIR = './storage/media'

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
  }
}

export async function sendImage(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const urlOrPath = args.join(' ')

  if (!urlOrPath) {
    return { success: false, message: '❌ Uso: /image [URL o ruta local]' }
  }

  try {
    let imageData
    if (urlOrPath.startsWith('http')) {
      const res = await axios.get(urlOrPath, { responseType: 'arraybuffer' })
      imageData = res.data
    } else if (fs.existsSync(urlOrPath)) {
      imageData = fs.readFileSync(urlOrPath)
    } else {
      return { success: false, message: '❌ URL o archivo no válido' }
    }

    await sock.sendMessage(remoteJid, { image: imageData }, { quoted })
    return { success: true, message: '✅ Imagen enviada' }
  } catch (error) {
    logger.error('Error enviando imagen:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendVideo(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const urlOrPath = args[0]
  const caption = args.slice(1).join(' ') || ''

  if (!urlOrPath) {
    return { success: false, message: '❌ Uso: /video [URL o ruta] [caption]' }
  }

  try {
    let videoData
    if (urlOrPath.startsWith('http')) {
      const res = await axios.get(urlOrPath, { responseType: 'arraybuffer' })
      videoData = res.data
    } else if (fs.existsSync(urlOrPath)) {
      videoData = fs.readFileSync(urlOrPath)
    } else {
      return { success: false, message: '❌ URL o archivo no válido' }
    }

    await sock.sendMessage(remoteJid, { 
      video: videoData,
      caption: caption || undefined,
      ptv: false
    }, { quoted })
    
    return { success: true, message: '✅ Video enviado' }
  } catch (error) {
    logger.error('Error enviando video:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendAudio(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const urlOrPath = args.join(' ')

  if (!urlOrPath) {
    return { success: false, message: '❌ Uso: /audio [URL o ruta]' }
  }

  try {
    let audioData
    if (urlOrPath.startsWith('http')) {
      const res = await axios.get(urlOrPath, { responseType: 'arraybuffer' })
      audioData = res.data
    } else if (fs.existsSync(urlOrPath)) {
      audioData = fs.readFileSync(urlOrPath)
    } else {
      return { success: false, message: '❌ URL o archivo no válido' }
    }

    await sock.sendMessage(remoteJid, { 
      audio: audioData,
      mimetype: 'audio/mp4'
    }, { quoted })
    
    return { success: true, message: '✅ Audio enviado' }
  } catch (error) {
    logger.error('Error enviando audio:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendGif(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const urlOrPath = args[0]
  const caption = args.slice(1).join(' ') || ''

  if (!urlOrPath) {
    return { success: false, message: '❌ Uso: /gif [URL o ruta] [caption]' }
  }

  try {
    let videoData
    if (urlOrPath.startsWith('http')) {
      const res = await axios.get(urlOrPath, { responseType: 'arraybuffer' })
      videoData = res.data
    } else if (fs.existsSync(urlOrPath)) {
      videoData = fs.readFileSync(urlOrPath)
    } else {
      return { success: false, message: '❌ URL o archivo no válido' }
    }

    await sock.sendMessage(remoteJid, { 
      video: videoData,
      caption: caption || undefined,
      gifPlayback: true
    }, { quoted })
    
    return { success: true, message: '✅ GIF enviado' }
  } catch (error) {
    logger.error('Error enviando GIF:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendDocument(ctx) {
  const { args, remoteJid, sock, quoted, sender } = ctx
  const urlOrPath = args[0]
  const filename = args[1] || path.basename(urlOrPath)

  if (!urlOrPath) {
    return { success: false, message: '❌ Uso: /document [URL o ruta] [nombre]' }
  }

  try {
    let fileData
    if (urlOrPath.startsWith('http')) {
      const res = await axios.get(urlOrPath, { responseType: 'arraybuffer' })
      fileData = res.data
    } else if (fs.existsSync(urlOrPath)) {
      fileData = fs.readFileSync(urlOrPath)
    } else {
      return { success: false, message: '❌ URL o archivo no válido' }
    }

    await sock.sendMessage(remoteJid, { 
      document: fileData,
      mimetype: 'application/pdf',
      fileName: filename
    }, { quoted })
    
    return { success: true, message: '✅ Documento enviado' }
  } catch (error) {
    logger.error('Error enviando documento:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendContact(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const [name, phone] = [args[0], args[1]]

  if (!name || !phone) {
    return { success: false, message: '❌ Uso: /contact [nombre] [teléfono]' }
  }

  try {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${phone.replace(/\D/g, '')}:${phone}\nEND:VCARD`
    
    await sock.sendMessage(remoteJid, { 
      contacts: { 
        displayName: name, 
        contacts: [{ vcard }] 
      }
    }, { quoted })
    
    return { success: true, message: '✅ Contacto enviado' }
  } catch (error) {
    logger.error('Error enviando contacto:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendLocation(ctx) {
  const { args, remoteJid, sock, quoted } = ctx
  const [lat, lon] = [parseFloat(args[0]), parseFloat(args[1])]

  if (isNaN(lat) || isNaN(lon)) {
    return { success: false, message: '❌ Uso: /location [latitud] [longitud]' }
  }

  try {
    await sock.sendMessage(remoteJid, { 
      location: {
        degreesLatitude: lat,
        degreesLongitude: lon
      }
    }, { quoted })
    
    return { success: true, message: '✅ Ubicación enviada' }
  } catch (error) {
    logger.error('Error enviando ubicación:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function downloadMedia(ctx) {
  const { quoted, remoteJid, sock, sender } = ctx

  if (!quoted || !quoted.message) {
    return { success: false, message: '❌ Responde a un mensaje con media' }
  }

  try {
    const contentType = Object.keys(quoted.message)[0]
    if (!['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(contentType)) {
      return { success: false, message: '❌ El mensaje no contiene media descargable' }
    }

    ensureMediaDir()
    const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.bin`
    const filepath = path.join(MEDIA_DIR, filename)

    const stream = await sock.downloadMediaMessage(quoted, 'stream')
    const file = fs.createWriteStream(filepath)
    stream.pipe(file)

    return { 
      success: true, 
      message: `✅ Media descargada en: ${filepath}`
    }
  } catch (error) {
    logger.error('Error descargando media:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
