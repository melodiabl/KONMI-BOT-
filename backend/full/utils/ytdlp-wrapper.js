import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

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

function getYtDlpPath() {
  return process.env.YTDLP_PATH || process.env.YT_DLP_PATH || 'yt-dlp'
}

/**
 * Download media with yt-dlp. Defaults to extracting audio to mp3.
 * @param {Object} opts
 * @param {string} opts.url - Source URL
 * @param {string} opts.outDir - Output directory
 * @param {boolean} [opts.audioOnly=true] - Extract audio only
 * @param {string} [opts.format] - yt-dlp -f format string (overrides audioOnly)
 * @param {function} [opts.onProgress] - Callback({ percent, status, downloaded, total, speed })
 * @param {string} [opts.ytDlpPath] - Custom yt-dlp path
 * @param {string} [opts.ffmpegPath] - Custom ffmpeg path
 * @param {string} [opts.outputTemplate] - Custom output template
 */
export async function downloadWithYtDlp({
  url,
  outDir,
  audioOnly = true,
  format,
  onProgress,
  ytDlpPath,
  ffmpegPath,
  outputTemplate,
} = {}) {
  if (!url) throw new Error('URL requerida para yt-dlp')
  if (!outDir) throw new Error('outDir requerido para yt-dlp')

  ensureDir(outDir)

  const bin = ytDlpPath || getYtDlpPath()
  const args = []

  // Avoid full playlists unless explicitly desired
  args.push('--no-playlist')

  // Prefer mp3 audio when audioOnly
  if (format) {
    args.push('-f', format)
  } else if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3')
  } else {
    // Prefer MP4 + M4A <=720p for mobile compatibility; fallback to best merge
    args.push('-f', 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/bv*[height<=720]+ba/best[ext=mp4]/best')
    args.push('--merge-output-format', 'mp4')
  }

  // Detectar ffmpeg automáticamente si no se pasó
  let ffmpegLoc = ffmpegPath
  if (!ffmpegLoc) {
    try {
      const mod = await import('ffmpeg-static')
      ffmpegLoc = mod?.default || mod
    } catch {}
  }
  if (ffmpegLoc) {
    args.push('--ffmpeg-location', ffmpegLoc)
  }

  const template = outputTemplate || path.join(outDir, '%(title)s.%(ext)s')
  args.push('-o', template)

  // Emit progress in a parseable way
  // yt-dlp prints progress on stderr by default. We'll parse percent like `  12.3% `
  args.push(url)

  const child = spawn(bin, args, { windowsHide: true })

  let lastPercent = 0
  let stderr = ''
  let stdout = ''

  // e.g. [download]  12.3% of 3.46MiB at 5.84MiB/s ETA 00:15
  const percentRe = /(\d{1,3}(?:\.\d)?)%/g
  const speedRe = /at\s+([^\s]+)\/(?:s|S)/
  const totalRe = /of\s+([^\s]+)/

  const parseLine = (line) => {
    if (typeof onProgress !== 'function') return
    try {
      const percentMatch = [...line.matchAll(percentRe)].pop()
      if (percentMatch) {
        const p = Math.max(0, Math.min(100, parseFloat(percentMatch[1])))
        const speedMatch = line.match(speedRe)
        const totalMatch = line.match(totalRe)
        if (p > lastPercent || p >= 100) {
          lastPercent = p
          onProgress({
            percent: p,
            status: line.includes('[download]') ? 'download' : undefined,
            total: totalMatch ? totalMatch[1] : undefined,
            speed: speedMatch ? speedMatch[1] : undefined,
          })
        }
      }
    } catch {}
  }

  child.stdout.on('data', (d) => {
    const s = d.toString()
    stdout += s
    parseLine(s)
  })
  child.stderr.on('data', (d) => {
    const s = d.toString()
    stderr += s
    parseLine(s)
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `yt-dlp exited ${code}`))
    })
  })

  // Try to capture destination/merged file from logs if present
  // Prefer merged output; fallback: destination; fallback: pick latest
  let filePath = null
  try {
    const mergedMatch = /Merged into \"(.+\.(mp4|mkv|webm))\"/i.exec(stdout) ||
                        /Merged into \"(.+\.(mp4|mkv|webm))\"/i.exec(stderr) ||
                        /Merging formats into \"(.+\.(mp4|mkv|webm))\"/i.exec(stdout) ||
                        /Merging formats into \"(.+\.(mp4|mkv|webm))\"/i.exec(stderr)
    if (mergedMatch) {
      const p = mergedMatch[1].trim()
      if (fs.existsSync(p)) filePath = p
    }
    const destMatch = /(Destination:|to:)\s(.+\.(mp3|m4a|webm|mp4|mkv))/i.exec(stdout) ||
                      /(Destination:|to:)\s(.+\.(mp3|m4a|webm|mp4|mkv))/i.exec(stderr)
    if (destMatch) {
      const p = destMatch[2].trim()
      if (fs.existsSync(p)) filePath = p
    }
  } catch {}
  if (!filePath) filePath = pickLatestFile(outDir)
  if (!filePath) throw new Error('No se encontró ningún archivo generado por yt-dlp')

  return { success: true, filePath }
}

export default { downloadWithYtDlp }
