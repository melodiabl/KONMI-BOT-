import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

export async function downloadWithInstaloader({ url, outDir, username, password, sessionFile, extraArgs = [], onProgress } = {}) {
  if (!url) throw new Error('URL requerida para Instagram')
  if (!outDir) throw new Error('outDir requerido')

  ensureDir(outDir)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 10 })
  }

  try {
    const urlPattern = /instagram\.com\/(p|reel|tv)\/([^/?]+)/
    const match = url.match(urlPattern)
    
    if (!match) {
      throw new Error('URL de Instagram inválida')
    }

    const postId = match[2]
    const apiUrl = `https://www.instagram.com/api/v1/media/${postId}/info/`

    if (typeof onProgress === 'function') {
      onProgress({ percent: 30 })
    }

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.status}`)
    }

    const data = await response.json()
    const media = data.media

    if (typeof onProgress === 'function') {
      onProgress({ percent: 50 })
    }

    let downloadUrl = null
    let filename = null
    let mediaType = 'photo'

    if (media.video_duration) {
      downloadUrl = media.video_versions?.[0]?.url
      mediaType = 'video'
      filename = `instagram_${postId}.mp4`
    } else {
      downloadUrl = media.image_versions2?.candidates?.[0]?.url
      mediaType = 'photo'
      filename = `instagram_${postId}.jpg`
    }

    if (!downloadUrl) {
      throw new Error('No se pudo extraer el link de descarga')
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 60 })
    }

    const mediaResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!mediaResponse.ok) {
      throw new Error(`Error descargando media: ${mediaResponse.status}`)
    }

    const filePath = path.join(outDir, filename)
    const fileStream = fs.createWriteStream(filePath)
    let downloadedSize = 0
    const contentLength = parseInt(mediaResponse.headers.get('content-length') || '0', 10)

    return new Promise((resolve, reject) => {
      mediaResponse.body.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (typeof onProgress === 'function' && contentLength > 0) {
          const percent = Math.min(95, 60 + Math.floor((downloadedSize / contentLength) * 35))
          onProgress({ percent })
        }
      })

      mediaResponse.body.on('error', (err) => {
        try { fileStream.destroy() } catch {}
        try { fs.unlinkSync(filePath) } catch {}
        reject(new Error(`Error en descarga: ${err.message}`))
      })

      fileStream.on('error', (err) => {
        try { mediaResponse.body.destroy() } catch {}
        try { fs.unlinkSync(filePath) } catch {}
        reject(new Error(`Error escribiendo archivo: ${err.message}`))
      })

      fileStream.on('finish', () => {
        try {
          const stat = fs.statSync(filePath)
          if (stat.size < 5 * 1024) {
            fs.unlinkSync(filePath)
            reject(new Error('Archivo descargado muy pequeño'))
          } else {
            if (typeof onProgress === 'function') {
              onProgress({ percent: 100 })
            }
            resolve({ success: true, filePath, type: mediaType })
          }
        } catch (e) {
          reject(e)
        }
      })

      mediaResponse.body.pipe(fileStream)
    })
  } catch (error) {
    throw new Error(`Error descargando de Instagram: ${error.message}`)
  }
}

export default { downloadWithInstaloader }

