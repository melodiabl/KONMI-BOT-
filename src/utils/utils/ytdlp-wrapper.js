import fs from 'fs'
import path from 'path'
import ytdl from 'ytdl-core'
import ytdlp from 'yt-dlp-exec'
import { buildYtDlpCookieArgs } from './cookies.js'

const DEFAULT_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const YTDLP_USER_AGENT = process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || DEFAULT_WEB_UA
const YTDLP_EXTRACTOR_ARGS_BASE = process.env.YTDLP_EXTRACTOR_ARGS || process.env.YOUTUBE_EXTRACTOR_ARGS || 'youtube:player_client=android'
const YTDLP_PO_TOKEN = process.env.YTDLP_PO_TOKEN || process.env.YOUTUBE_PO_TOKEN || ''

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

function buildCookieOptions() {
  const args = buildYtDlpCookieArgs()
  if (!Array.isArray(args) || args.length < 2) return {}
  const [flag, value] = args
  if (!value) return {}
  if (flag === '--cookies') return { cookies: value }
  if (flag === '--cookies-from-browser') return { cookiesFromBrowser: value }
  if (flag === '--add-header') return { addHeader: [value] }
  return {}
}

function mergeExtractorArgs() {
  const list = []
  if (YTDLP_EXTRACTOR_ARGS_BASE) list.push(YTDLP_EXTRACTOR_ARGS_BASE)
  if (YTDLP_PO_TOKEN) list.push(`youtube:po_token=${YTDLP_PO_TOKEN}`)
  if (!list.length) return undefined
  return list.length === 1 ? list[0] : list
}

async function downloadWithYtdlCoreFallback({ url, outDir, audioOnly, onProgress }) {
  if (typeof onProgress === 'function') {
    onProgress({ percent: 10, status: 'download' })
  }

  const info = await ytdl.getInfo(url, {
    requestOptions: {
      headers: { 'User-Agent': YTDLP_USER_AGENT }
    }
  })
  const videoTitle = (info.videoDetails.title || 'descarga').replace(/[^\w\s-]/g, '').substring(0, 100)

  if (typeof onProgress === 'function') {
    onProgress({ percent: 20, status: 'download' })
  }

  const options = {
    quality: audioOnly ? 'lowestaudio' : 'highest',
    filter: audioOnly ? 'audioonly' : undefined
  }

  const stream = ytdl(url, options)

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
          reject(new Error('Archivo descargado muy pequeno'))
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

  try {
    const cookieOptions = buildCookieOptions()
    const extractorArgs = mergeExtractorArgs()
    const outputPattern = outputTemplate || '%(title).95B.%(ext)s'

    const opts = {
      output: path.join(outDir, outputPattern),
      format: format || (audioOnly ? 'bestaudio/best' : 'bv*+ba/best'),
      noWarnings: true,
      noPart: true,
      noMtime: true,
      noCheckCertificates: true,
      restrictFilenames: true,
      ffmpegLocation: ffmpegPath,
      userAgent: YTDLP_USER_AGENT,
      extractorArgs,
      progress: true,
      ...cookieOptions,
      ...(audioOnly ? { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 } : {})
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 5, status: 'preparing' })
    }

    const runner = typeof ytdlp.raw === 'function' ? ytdlp.raw : ytdlp
    const proc = runner(url, opts)
    if (proc?.stderr && typeof onProgress === 'function') {
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString()
        const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
        if (match) {
          const percent = Math.min(98, parseFloat(match[1]) || 0)
          onProgress({ percent, status: 'download' })
        }
      })
    }

    await proc

    const filePath = pickLatestFile(outDir)
    if (!filePath) {
      throw new Error('yt-dlp no genero archivo')
    }
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size < 20 * 1024) {
      throw new Error('Archivo descargado muy pequeno')
    }

    if (typeof onProgress === 'function') {
      onProgress({ percent: 100, status: 'complete' })
    }
    return { success: true, filePath }
  } catch (error) {
    // Fallback a ytdl-core si yt-dlp falla
    return downloadWithYtdlCoreFallback({ url, outDir, audioOnly, onProgress })
  }
}

export default { downloadWithYtDlp }
