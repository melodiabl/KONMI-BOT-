import fs from 'fs'
import path from 'path'
import { play } from 'play-dl'
import ytdl from 'ytdl-core'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

export async function downloadWithSpotdl({
  queryOrUrl,
  outDir,
  ffmpegPath = process.env.FFMPEG_PATH,
  onProgress,
  outputFormat = 'mp3',
}) {
  ensureDir(outDir)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 10 })
  }

  let stream
  let info

  if (queryOrUrl.includes('spotify.com')) {
    try {
      info = await play.spotify(queryOrUrl)
      if (!info) throw new Error('No se pudo obtener información de Spotify')
      
      if (typeof onProgress === 'function') {
        onProgress({ percent: 30 })
      }

      const searchQuery = `${info.name} ${info.artist.name}`
      const yt = await play.search(searchQuery, { limit: 1 })
      if (!yt || yt.length === 0) {
        throw new Error('No se encontró video en YouTube para esta canción')
      }

      if (typeof onProgress === 'function') {
        onProgress({ percent: 50 })
      }

      stream = await yt[0].download()
    } catch (e) {
      throw new Error(`Error descargando de Spotify: ${e.message}`)
    }
  } else if (queryOrUrl.includes('youtube.com') || queryOrUrl.includes('youtu.be')) {
    try {
      if (typeof onProgress === 'function') {
        onProgress({ percent: 30 })
      }

      stream = ytdl(queryOrUrl, {
        quality: outputFormat === 'mp3' ? 'lowestaudio' : 'highest',
        filter: 'audioonly'
      })

      info = await ytdl.getInfo(queryOrUrl)
    } catch (e) {
      throw new Error(`Error descargando de YouTube: ${e.message}`)
    }
  } else {
    try {
      if (typeof onProgress === 'function') {
        onProgress({ percent: 20 })
      }

      const results = await play.search(queryOrUrl, { limit: 1 })
      if (!results || results.length === 0) {
        throw new Error('No se encontraron resultados para la búsqueda')
      }

      if (typeof onProgress === 'function') {
        onProgress({ percent: 50 })
      }

      stream = await results[0].download()
      info = results[0]
    } catch (e) {
      throw new Error(`Error en búsqueda: ${e.message}`)
    }
  }

  if (!stream) {
    throw new Error('No se pudo obtener el stream de descarga')
  }

  const filename = (info?.name || info?.title || 'descarga').replace(/[^\w\s-]/g, '').substring(0, 100)
  const filePath = path.join(outDir, `${filename}.${outputFormat}`)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 60 })
  }

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath)
    let totalSize = 0

    stream.on('data', (chunk) => {
      totalSize += chunk.length
      if (typeof onProgress === 'function') {
        const percent = Math.min(95, 60 + Math.floor((totalSize / 1024 / 1024) * 10))
        onProgress({ percent })
      }
    })

    stream.on('error', (err) => {
      try { fileStream.destroy() } catch {}
      try { fs.unlinkSync(filePath) } catch {}
      reject(new Error(`Error en el stream: ${err.message}`))
    })

    fileStream.on('error', (err) => {
      try { stream.destroy() } catch {}
      try { fs.unlinkSync(filePath) } catch {}
      reject(new Error(`Error escribiendo archivo: ${err.message}`))
    })

    fileStream.on('finish', () => {
      try {
        const stat = fs.statSync(filePath)
        if (stat.size < 20 * 1024) {
          fs.unlinkSync(filePath)
          reject(new Error('Archivo descargado muy pequeño'))
        } else {
          if (typeof onProgress === 'function') {
            onProgress({ percent: 100 })
          }
          resolve({ success: true, filePath })
        }
      } catch (e) {
        reject(e)
      }
    })

    stream.pipe(fileStream)
  })
}

export default { downloadWithSpotdl }

export function isSpotdlAvailable() {
  return true
}
