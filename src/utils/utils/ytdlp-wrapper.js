import fs from 'fs'
import path from 'path'
import ytdl from 'ytdl-core'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function pickLatestFile(dir) {
  try {
    const files = fs.readdirSync(dir)
    let latest = null
    let latestMtime = 0
    for (const f of files) {
      const full = path.join(dir, f)
      try {
        const st = fs.statSync(full)
        if (st.isFile() && st.mtimeMs > latestMtime) {
          latest = full
          latestMtime = st.mtimeMs
        }
      } catch {}
    }
    return latest
  } catch {
    return null
  }
}

export async function downloadWithYtDlp({
  url,
  outDir,
  audioOnly = true,
  format,
  onProgress,
  ffmpegPath,
  outputTemplate,
} = {}) {
  if (!url) throw new Error('URL requerida para descarga')
  if (!outDir) throw new Error('outDir requerido')

  ensureDir(outDir)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 10, status: 'download' })
  }

  try {
    const info = await ytdl.getInfo(url)
    const videoTitle = (info.videoDetails.title || 'descarga').replace(/[^\w\s-]/g, '').substring(0, 100)
    
    if (typeof onProgress === 'function') {
      onProgress({ percent: 20, status: 'download' })
    }

    let stream
    const options = {
      quality: audioOnly ? 'lowestaudio' : 'highest',
      filter: audioOnly ? 'audioonly' : undefined
    }

    stream = ytdl(url, options)

    const ext = audioOnly ? 'mp3' : 'mp4'
    const filename = `${videoTitle}.${ext}`
    const filePath = path.join(outDir, filename)
    const fileStream = fs.createWriteStream(filePath)

    let downloadedBytes = 0
    const totalBytes = parseInt(info.formats[0]?.contentLength || 0, 10)

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        downloadedBytes += chunk.length
        if (typeof onProgress === 'function' && totalBytes > 0) {
          const percent = Math.min(95, 20 + Math.floor((downloadedBytes / totalBytes) * 75))
          onProgress({ 
            percent, 
            status: 'download',
            downloaded: downloadedBytes,
            total: totalBytes
          })
        }
      })

      stream.on('error', (err) => {
        try { fileStream.destroy() } catch {}
        try { fs.unlinkSync(filePath) } catch {}
        reject(new Error(`Error en descarga: ${err.message}`))
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
              onProgress({ percent: 100, status: 'complete' })
            }
            resolve({ success: true, filePath })
          }
        } catch (e) {
          reject(e)
        }
      })

      stream.pipe(fileStream)
    })
  } catch (error) {
    throw new Error(`Error descargando: ${error.message}`)
  }
}

export default { downloadWithYtDlp }
