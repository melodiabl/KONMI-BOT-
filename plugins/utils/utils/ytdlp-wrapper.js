import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { buildYtDlpCookieArgs } from './cookies.js'

const DEFAULT_WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const YTDLP_USER_AGENT =
  process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || DEFAULT_WEB_UA

// Ruta del binario dentro del contenedor
const YTDLP_BIN = path.join(process.cwd(), 'yt-dlp')

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
}

async function ensureYtDlpBinary() {
  if (fs.existsSync(YTDLP_BIN)) return YTDLP_BIN

  // Descarga binario oficial de yt-dlp (SIN Python)
  const url =
    process.platform === 'win32'
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

  await new Promise((resolve, reject) => {
    const curl = spawn('curl', ['-L', url, '-o', YTDLP_BIN], { stdio: 'inherit' })
    curl.on('error', reject)
    curl.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error('curl exit code ' + code))
    })
  })

  if (process.platform !== 'win32') {
    fs.chmodSync(YTDLP_BIN, 0o755)
  }

  return YTDLP_BIN
}

function pickLatestFile(dir) {
  const files = fs.readdirSync(dir)
  if (!files.length) return null
  let latest = null
  let latestMtime = 0

  for (const f of files) {
    const full = path.join(dir, f)
    const stat = fs.statSync(full)
    if (!stat.isFile()) continue
    if (stat.size < 20 * 1024) continue // ignorar archivos demasiado pequeños
    if (stat.mtimeMs > latestMtime) {
      latestMtime = stat.mtimeMs
      latest = full
    }
  }

  return latest
}

/**
 * Ejecuta yt-dlp binario con cookies, UA y ffmpeg (sin Python).
 * @param {Object} opts
 * @param {string} opts.url
 * @param {string} [opts.outDir]
 * @param {boolean} [opts.audioOnly]
 * @param {(info: any) => void} [opts.onProgress]
 */
export async function downloadWithYtDlp({ url, outDir, audioOnly = true, onProgress }) {
  const bin = await ensureYtDlpBinary()

  const finalOutDir =
    outDir || path.join(os.tmpdir(), `konmi-ytdlp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  ensureDir(finalOutDir)

  const baseTemplate = '%(title).200s.%(ext)s'
  const outputTemplate = path.join(finalOutDir, baseTemplate)

  const args = ['-o', outputTemplate, '--no-progress']

  // User-Agent y cabeceras
  args.push('--user-agent', YTDLP_USER_AGENT)
  args.push('--add-header', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8')

  // ✅ Cookies (aquí se usan los cookies.txt)
  const cookieArgs = buildYtDlpCookieArgs()
  if (cookieArgs.length) {
    args.push(...cookieArgs)
  }

  // ffmpeg
  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath)
  }

  if (audioOnly) {
    // Mejor calidad de audio posible, convertir a MP3 con calidad 0 (máxima)
    args.push(
      '-f',
      'bestaudio/best',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0'
    )
  } else {
    // Mejor video con audio
    args.push('-f', 'bv*+ba/best')
  }

  args.push(url)

  return new Promise((resolve, reject) => {
    let stderrBuf = ''

    const child = spawn(bin, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderrBuf += text

      if (onProgress) {
        onProgress({
          percent: 0,
          status: 'procesando',
          raw: text.slice(0, 200)
        })
      }
    })

    child.on('error', (err) => {
      reject(new Error('yt-dlp error: ' + err.message))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `yt-dlp exit code ${code}: ${stderrBuf.slice(0, 400)}`
          )
        )
      }

      const filePath = pickLatestFile(finalOutDir)
      if (!filePath) {
        return reject(new Error('No se encontró archivo descargado'))
      }

      if (onProgress) {
        onProgress({ percent: 100, status: 'complete' })
      }

      resolve({
        success: true,
        filePath,
        isLocal: true,
        dir: finalOutDir
      })
    })
  })
}

export default { downloadWithYtDlp }



