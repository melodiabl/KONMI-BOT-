// commands/stickers.js - VERSIÓN CORREGIDA
// ✅ Sintaxis FFmpeg corregida
// ✅ Manejo robusto de errores
// ✅ Validación de buffers vacíos

import { downloadContentFromMessage } from '@itsukichan/baileys'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from 'ffmpeg-static'
import axios from 'axios'
import { tmpdir } from 'os'
import { promises as fs } from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Configurar ruta de FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller)

/**
 * Valida que un buffer sea un archivo WebP válido
 * @param {Buffer} buffer - Buffer a validar
 * @returns {boolean} true si es WebP válido
 */
function isValidWebP(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return false
  }

  // Firmas WebP válidas:
  // RIFF____WEBP o RIFF____VP8 o RIFF____VP8L
  const riff = buffer.toString('ascii', 0, 4)
  const webp = buffer.toString('ascii', 8, 12)

  return riff === 'RIFF' && (webp === 'WEBP' || webp.startsWith('VP8'))
}

/* ========================
   DESCARGA DE MEDIA ROBUSTA
   ======================== */
async function downloadMediaMessage(message, messageType) {
  try {
    const stream = await downloadContentFromMessage(message, messageType)
    const chunks = []

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    const buffer = Buffer.concat(chunks)

    // Validar que el buffer no esté vacío
    if (!buffer || buffer.length === 0) {
      throw new Error('Buffer vacío: el archivo descargado está corrupto')
    }

    return buffer
  } catch (error) {
    throw new Error(`Error descargando media: ${error.message}`)
  }
}

/* ========================
   CREAR STICKER DESDE IMAGEN
   ======================== */
async function createImageSticker(imageBuffer, options = {}) {
  try {
    // Importar Sharp en runtime
    let sharp
    try {
      sharp = (await import('sharp')).default
    } catch (e) {
      throw new Error('Falta dependencia "sharp". Instalar con: npm i sharp')
    }

    // Validar buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Buffer de imagen vacío')
    }

    // Procesar imagen
    const stickerBuffer = await sharp(imageBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 100 })
      .toBuffer()

    // Validar que el resultado sea un WebP válido
    if (!isValidWebP(stickerBuffer)) {
      throw new Error('El archivo generado no es un WebP válido')
    }

    return stickerBuffer
  } catch (error) {
    throw new Error(`Error procesando imagen: ${error.message}`)
  }
}

/* ========================
   CREAR STICKER DESDE VIDEO
   ======================== */
async function createVideoSticker(videoBuffer, options = {}) {
  let tempInputPath = null
  let tempOutputPath = null

  try {
    // Validar buffer
    if (!videoBuffer || videoBuffer.length === 0) {
      throw new Error('Buffer de video vacío')
    }

    // Crear archivos temporales
    tempInputPath = path.join(tmpdir(), `sticker_input_${Date.now()}.mp4`)
    tempOutputPath = path.join(tmpdir(), `sticker_output_${Date.now()}.webp`)

    await fs.writeFile(tempInputPath, videoBuffer)

    // ✅ CORRECCIÓN CRÍTICA: Filtro de video sin espacios
    await new Promise((resolve, reject) => {
      ffmpeg(tempInputPath)
        .outputOptions([
          '-vcodec', 'libwebp',
          '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=black@0.0",
          '-loop', '0',
          '-ss', '00:00:00.0',
          '-t', '00:00:07.0',
          '-preset', 'default',
          '-an',
          '-vsync', '0',
          '-s', '512:512'
        ])
        .toFormat('webp')
        .save(tempOutputPath)
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error('[FFmpeg] Error:', err.message)
          reject(new Error(`FFmpeg falló: ${err.message}`))
        })
    })

    // Leer resultado
    const stickerBuffer = await fs.readFile(tempOutputPath)

    // Validar resultado
    if (!stickerBuffer || stickerBuffer.length === 0) {
      throw new Error('FFmpeg produjo un archivo vacío')
    }

    // Validar que sea un WebP válido
    if (!isValidWebP(stickerBuffer)) {
      throw new Error('FFmpeg no generó un WebP válido')
    }

    return stickerBuffer

  } catch (error) {
    throw new Error(`Error procesando video: ${error.message}`)
  } finally {
    // Limpiar archivos temporales
    try {
      if (tempInputPath) await fs.unlink(tempInputPath).catch(() => {})
      if (tempOutputPath) await fs.unlink(tempOutputPath).catch(() => {})
    } catch {}
  }
}

/* ========================
   COMANDO: /sticker
   ======================== */
export async function sticker(ctx) {
  const { sock, message } = ctx

  // Buscar media en el mensaje citado o actual
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage
  const mediaMessage = quoted || message?.message

  const imageMessage = mediaMessage?.imageMessage
  const videoMessage = mediaMessage?.videoMessage

  if (!imageMessage && !videoMessage) {
    return {
      success: false,
      message: 'ℹ️ Responde a una imagen o video con /sticker para convertirlo.',
      quoted: true
    }
  }

  const mediaType = imageMessage ? 'image' : 'video'
  const media = imageMessage || videoMessage

  try {
    // Descargar media
    const mediaBuffer = await downloadMediaMessage(media, mediaType)

    // Crear sticker según tipo
    let stickerBuffer
    if (mediaType === 'image') {
      stickerBuffer = await createImageSticker(mediaBuffer)
    } else {
      stickerBuffer = await createVideoSticker(mediaBuffer)
    }

    // Validar resultado final
    if (!stickerBuffer || stickerBuffer.length === 0) {
      throw new Error('El sticker generado está vacío')
    }

    // Validar que el buffer final sea válido
    if (!stickerBuffer || stickerBuffer.length === 0) {
      throw new Error('El sticker generado está vacío')
    }

    // Log para debugging
    console.log('[sticker] ✅ Sticker creado exitosamente, tamaño:', stickerBuffer.length, 'bytes')

    return {
      success: true,
      type: 'sticker',
      sticker: stickerBuffer,
      quoted: true
    }

  } catch (error) {
    console.error('[sticker] Error:', error.message)
    return {
      success: false,
      message: `⚠️ Error creando sticker: ${error.message}`,
      quoted: true
    }
  }
}

/* ========================
   COMANDO: /stickerurl
   ======================== */
export async function stickerUrl({ args }) {
  const url = (args || [])[0]

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      success: false,
      message: 'ℹ️ Uso: /stickerurl <url>\nEjemplo: /stickerurl https://i.imgur.com/imagen.jpg',
      quoted: true
    }
  }

  try {
    // Descargar imagen desde URL
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      maxContentLength: 10 * 1024 * 1024 // 10 MB máximo
    })

    const imageBuffer = Buffer.from(response.data)

    // Validar buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('La URL devolvió un archivo vacío')
    }

    // Crear sticker
    const stickerBuffer = await createImageSticker(imageBuffer)

    // Validar resultado
    if (!stickerBuffer || stickerBuffer.length === 0) {
      throw new Error('La URL produjo un sticker vacío')
    }

    console.log('[stickerurl] ✅ Sticker creado desde URL, tamaño:', stickerBuffer.length, 'bytes')

    return {
      success: true,
      type: 'sticker',
      sticker: stickerBuffer,
      quoted: true
    }

  } catch (error) {
    console.error('[stickerurl] Error:', error.message)
    return {
      success: false,
      message: `⚠️ Error descargando imagen: ${error.message}`,
      quoted: true
    }
  }
}

/* ========================
   COMANDO: /toimg
   ======================== */
export async function toimg({ sock, message }) {
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage
  const stickerMessage = quoted?.stickerMessage || message?.message?.stickerMessage

  if (!stickerMessage) {
    return {
      success: false,
      message: 'ℹ️ Responde a un sticker con /toimg para convertirlo en imagen.',
      quoted: true
    }
  }

  try {
    // Descargar sticker
    const stickerBuffer = await downloadMediaMessage(stickerMessage, 'sticker')

    // ✅ Sticker animado → GIF
    if (stickerMessage.isAnimated) {
      let tempInputPath = null
      let tempOutputPath = null

      try {
        tempInputPath = path.join(tmpdir(), `sticker_${Date.now()}.webp`)
        tempOutputPath = path.join(tmpdir(), `output_${Date.now()}.gif`)

        await fs.writeFile(tempInputPath, stickerBuffer)

        // Convertir con FFmpeg
        await new Promise((resolve, reject) => {
          ffmpeg(tempInputPath)
            .outputOptions([
              '-vf', 'scale=512:512:force_original_aspect_ratio=decrease',
              '-loop', '0'
            ])
            .toFormat('gif')
            .save(tempOutputPath)
            .on('end', resolve)
            .on('error', reject)
        })

        const gifBuffer = await fs.readFile(tempOutputPath)

        return {
          success: true,
          type: 'video',
          video: gifBuffer,
          caption: '🖼️ Sticker animado → GIF',
          gifPlayback: true
        }

      } finally {
        try {
          if (tempInputPath) await fs.unlink(tempInputPath).catch(() => {})
          if (tempOutputPath) await fs.unlink(tempOutputPath).catch(() => {})
        } catch {}
      }
    }

    // ✅ Sticker estático → PNG
    let sharp
    try {
      sharp = (await import('sharp')).default
    } catch {
      return {
        success: false,
        message: '⚠️ Falta dependencia "sharp". Instalar con: npm i sharp',
        quoted: true
      }
    }

    const imageBuffer = await sharp(stickerBuffer)
      .png()
      .toBuffer()

    return {
      success: true,
      type: 'image',
      image: imageBuffer,
      caption: '🖼️ Sticker → Imagen'
    }

  } catch (error) {
    console.error('[toimg] Error:', error.message)
    return {
      success: false,
      message: `⚠️ Error convirtiendo sticker: ${error.message}`,
      quoted: true
    }
  }
}

export default { sticker, stickerUrl, toimg }
