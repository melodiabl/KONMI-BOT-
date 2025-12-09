// ytdlp-wrapper.js
// Wrapper para usar el binario standalone de yt-dlp + ffmpeg-static (sin Python)

import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

const YTDLP_BIN = path.join(process.cwd(), 'yt-dlp')

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
}

async function ensureYtDlpBinary() {
  if (fs.existsSync(YTDLP_BIN)) return true

  console.log('📥 Descargando yt-dlp standalone...')
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', [
      '-L',
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
      '-o',
      YTDLP_BIN
    ])

    curl.stdout.on('data', (d) => process.stdout.write(d.toString()))
    curl.stderr.on('data', (d) => process.stderr.write(d.toString()))

    curl.on('close', (code) => {
      if (code !== 0) {
        console.error('❌ Error descargando yt-dlp, código:', code)
        return reject(new Error('Error descargando yt-dlp'))
      }
      fs.chmodSync(YTDLP_BIN, '755')
      console.log('✅ yt-dlp listo sin Python')
      resolve(true)
    })
  })
}

function pickLatestFile(dir, preferredExts = []) {
  let files = fs.readdirSync(dir).filter((f) => !f.endsWith('.part'))

  if (!files.length) return null

  if (preferredExts.length) {
    const byExt = preferredExts
      .map((ext) =>
        files.filter((f) => f.toLowerCase().endsWith(`.${ext.toLowerCase()}`))
      )
      .flat()
    if (byExt.length) files = byExt
  }

  let best = null
  let bestMtime = 0

  for (const name of files) {
    const full = path.join(dir, name)
    let st
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    if (st.mtimeMs > bestMtime) {
      bestMtime = st.mtimeMs
      best = full
    }
  }

  return best
}

function runYtDlp(args, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text

      // Parseo simple de porcentaje: " 23.4% " en stderr
      const match = text.match(/(\d+(?:\.\d+)?)%/)

      if (match && typeof onProgress === 'function') {
        const percent = Math.max(0, Math.min(99, parseFloat(match[1] || '0')))
        onProgress({ percent, status: 'downloading' })
      }
    })

    proc.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      const errMsg = stderr || stdout || `yt-dlp exited with code ${code}`
      reject(new Error(errMsg.slice(0, 300)))
    })
  })
}

/**
 * Descarga con yt-dlp binario
 * - audioOnly = true  → MP3 en alta calidad
 * - audioOnly = false → MP4 (bestvideo + bestaudio) usando ffmpeg-static
 */
export async function downloadWithYtDlp({
  url,
  outDir = path.join(process.cwd(), 'downloads', 'yt'),
  audioOnly = false,
  highQuality = true,
  onProgress
}) {
  if (!url) throw new Error('URL requerida para yt-dlp')

  ensureDir(outDir)
  await ensureYtDlpBinary()

  const outputTemplate = path.join(outDir, '%(title)s.%(ext)s')

  const args = [
    url,
    '--no-playlist',
    '--ignore-errors',
    '--no-warnings',
    '--no-mtime',
    '--newline',
    '-o',
    outputTemplate
  ]

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath)
  }

  if (audioOnly) {
    // Audio en alta calidad -> MP3 usando ffmpeg
    args.push(
      '-f',
      'bestaudio/best',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0'
    )
  } else {
    // Video alta calidad → bestvideo + bestaudio, salida MP4
    // Usa ffmpeg para mergear
    args.push(
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4'
    )
  }

  if (typeof onProgress === 'function') {
    onProgress({ percent: 1, status: 'starting' })
  }

  await runYtDlp(args, (p) => {
    if (typeof onProgress === 'function') onProgress(p)
  })

  const preferredExts = audioOnly ? ['mp3', 'm4a', 'webm'] : ['mp4', 'mkv', 'webm']
  const filePath = pickLatestFile(outDir, preferredExts)

  if (!filePath) {
    throw new Error('No se encontró archivo descargado')
  }

  if (typeof onProgress === 'function') {
    onProgress({ percent: 100, status: 'complete' })
  }

  return {
    success: true,
    filePath,
    isAudio: audioOnly,
    quality: highQuality ? 'best' : 'auto'
  }
}

export default { downloadWithYtDlp }

