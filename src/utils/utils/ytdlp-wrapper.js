import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { buildYtDlpCookieArgs } from './cookies.js'
// dynamic import used later for compatibility

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

function hasCommand(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true })
    return !r.error && (r.status === 0 || typeof r.status === 'undefined')
  } catch {
    return false
  }
}

/**
 * Download media with yt-dlp. Defaults to extracting audio to mp3.
 * @param {Object} opts
 * @param {string} opts.url - Source URL
 * @param {string} opts.outDir - Output directory
 * @param {boolean} [opts.audioOnly=true] - Extract audio only
 * @param {string} [opts.format] - yt-dlp -f format string (overrides audioOnly)
 * @param {function} [opts.onProgress] - Callback({ percent, status, downloaded, total, speed })
 * @param {string} [opts.ffmpegPath] - Custom ffmpeg path
 * @param {string} [opts.outputTemplate] - Custom output template
 */
export async function downloadWithYtDlp({
  url,
  outDir,
  audioOnly = true,
  format,
  onProgress,
  ffmpegPath,
  outputTemplate,
} = {}) {
  if (!url) throw new Error('URL requerida para yt-dlp')
  if (!outDir) throw new Error('outDir requerido para yt-dlp')

  ensureDir(outDir)

  const args = []
  // Allow opting out from user/system yt-dlp config files which may conflict
  if (String(process.env.YTDLP_IGNORE_CONFIG || '').toLowerCase() === 'true') {
    args.push('--ignore-config')
  }

  // Optional external config file (centralized flags)
  try {
    const cfg = process.env.YTDLP_CONFIG_FILE && String(process.env.YTDLP_CONFIG_FILE).trim()
    if (cfg && fs.existsSync(cfg)) {
      args.push('--config-location', cfg)
    }
  } catch {}

  // Avoid full playlists unless explicitly desired
  args.push('--no-playlist')

  // Cookies from env or local defaults
  let __cookieArgs = []
  try { __cookieArgs = buildYtDlpCookieArgs(); if (Array.isArray(__cookieArgs) && __cookieArgs.length) args.push(...__cookieArgs) } catch {}

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
  if (!ffmpegLoc && process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    ffmpegLoc = process.env.FFMPEG_PATH
  }
  if (!ffmpegLoc) {
    try {
      const mod = await import('ffmpeg-static')
      ffmpegLoc = mod?.default || mod
    } catch {}
  }
  if (ffmpegLoc) {
    args.push('--ffmpeg-location', ffmpegLoc)
  }

  // Cookies (unificado): usar helper que maneja archivo/header/browser
  try {
    const cookieArgs = buildYtDlpCookieArgs()
    if (Array.isArray(cookieArgs) && cookieArgs.length) args.push(...cookieArgs)
  } catch {}

  // User-Agent and extractor-args for better YouTube reliability
  const DEFAULT_WEB_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
  const DEFAULT_ANDROID_UA = 'com.google.android.youtube/19.09.37 (Linux; U; Android 13) gzip'
  const cookiesPresent = Array.isArray(__cookieArgs) && __cookieArgs.length > 0
  const ua = process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || (cookiesPresent ? DEFAULT_WEB_UA : DEFAULT_ANDROID_UA)
  // Prefer safari client when cookies present; android when not
  const envExtractor = process.env.YTDLP_EXTRACTOR_ARGS || process.env.YOUTUBE_EXTRACTOR_ARGS || ''
  let baseExtractor = envExtractor
  if (cookiesPresent) {
    if (!baseExtractor || /player_client=android/i.test(baseExtractor)) baseExtractor = 'youtube:player_client=web_safari'
  } else {
    if (!baseExtractor) baseExtractor = 'youtube:player_client=android'
  }
  const poToken = process.env.YTDLP_PO_TOKEN || process.env.YOUTUBE_PO_TOKEN || ''
  let extractorArgs = baseExtractor
  if (poToken) {
    const sep = extractorArgs.includes(',') || extractorArgs.includes(':') ? ',' : ''
    extractorArgs = `${extractorArgs}${sep}youtube:po_token=android.gvs+${poToken}`
  }
  if (ua) args.push('--user-agent', ua)
  if (extractorArgs) args.push('--extractor-args', extractorArgs)

  // Anti-detección / ritmo (opt-in via env)
  const sleepInt = process.env.YTDLP_SLEEP_INTERVAL && String(process.env.YTDLP_SLEEP_INTERVAL).trim()
  const sleepMax = process.env.YTDLP_SLEEP_MAX && String(process.env.YTDLP_SLEEP_MAX).trim()
  if (sleepInt) {
    args.push('--sleep-interval', String(sleepInt))
    if (sleepMax) args.push('--max-sleep-interval', String(sleepMax))
  }
  const rate = process.env.YTDLP_RATE_LIMIT && String(process.env.YTDLP_RATE_LIMIT).trim()
  if (rate) args.push('--limit-rate', rate)
  const conc = process.env.YTDLP_CONCURRENT_FRAGMENTS && String(process.env.YTDLP_CONCURRENT_FRAGMENTS).trim()
  if (conc) args.push('--concurrent-fragments', String(conc))
  const ref = process.env.YTDLP_REFERER && String(process.env.YTDLP_REFERER).trim()
  if (ref) args.push('--referer', ref)
  const chunk = process.env.YTDLP_HTTP_CHUNK_SIZE && String(process.env.YTDLP_HTTP_CHUNK_SIZE).trim()
  if (chunk) args.push('--http-chunk-size', chunk)
  const cacheDir = process.env.YTDLP_CACHE_DIR && String(process.env.YTDLP_CACHE_DIR).trim()
  if (cacheDir) args.push('--cache-dir', cacheDir)

  // Opcionales de rendimiento/fiabilidad
  const bufferSize = process.env.YTDLP_BUFFER_SIZE && String(process.env.YTDLP_BUFFER_SIZE).trim()
  if (bufferSize) args.push('--buffer-size', bufferSize)
  const retries = process.env.YTDLP_RETRIES && String(process.env.YTDLP_RETRIES).trim()
  if (retries) args.push('--retries', retries)
  const fragRetries = process.env.YTDLP_FRAGMENT_RETRIES && String(process.env.YTDLP_FRAGMENT_RETRIES).trim()
  if (fragRetries) args.push('--fragment-retries', fragRetries)
  const forceIPv4 = String(process.env.YTDLP_FORCE_IPV4 || '').toLowerCase() === 'true'
  if (forceIPv4) args.push('-4')

  // Usar aria2c si está disponible o si está forzado por env (suele ser más rápido para conexiones múltiples)
  const WANT_ARIA2C = String(process.env.YTDLP_USE_ARIA2C || '').toLowerCase() === 'true'
  const DISABLE_ARIA2C = String(process.env.YTDLP_DISABLE_ARIA2C || '').toLowerCase() === 'true'
  const ariaAvailable = !DISABLE_ARIA2C && hasCommand('aria2c', ['-v'])
  if (WANT_ARIA2C || ariaAvailable) {
    // Para video segmentado, aria2c acelera notoriamente. Para solo audio también funciona, pero puede no aportar en algunos orígenes.
    args.push('--downloader', 'aria2c')
    const conn = parseInt(process.env.YTDLP_ARIA2C_CONNECTIONS || '16', 10)
    const split = process.env.YTDLP_ARIA2C_SPLIT || String(Math.min(16, Math.max(4, conn)))
    const fileAlloc = process.env.YTDLP_ARIA2C_FILE_ALLOCATION || 'none'
    const extra = process.env.YTDLP_ARIA2C_EXTRA || ''
    const dlArgs = [`-x ${conn}`, `-s ${split}`, `-k ${chunk || '1M'}`, `--file-allocation=${fileAlloc}`, extra].filter(Boolean).join(' ')
    args.push('--downloader-args', `aria2c:${dlArgs}`)
  }

  const template = outputTemplate || path.join(outDir, '%(title)s.%(ext)s')
  args.push('-o', template)

  // Emit progress in a parseable way
  // yt-dlp prints progress on stderr by default. We'll parse percent like `  12.3% `
  args.push(url)

  let child = null
  try {
    const mod = await import('yt-dlp-exec')
    const ytdlp = mod?.default || mod
    if (ytdlp && typeof ytdlp.raw === 'function') {
      child = ytdlp.raw(args, { windowsHide: true })
    }
  } catch {}
  if (!child) {
    // Fallback: spawn binary directly (node_modules/.bin/yt-dlp or system yt-dlp)
    const binCandidates = [
      path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'yt-dlp.cmd' : 'yt-dlp'),
    ]
    let bin = null
    for (const c of binCandidates) {
      try { if (fs.existsSync(c)) { bin = c; break } } catch {}
    }
    if (!bin) bin = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    child = spawn(bin, args, { windowsHide: true })
  }

  let lastPercent = 0
  let stderr = ''
  let stdout = ''

  // e.g. [download]  12.3% of 3.46MiB at 5.84MiB/s ETA 00:15
  const percentRe = /(\d{1,3}(?:\.\d)?)%/g
  const speedRe = /at\s+([^\s]+)\/(?:s|S)/
  const totalRe = /of\s+([^\s]+)/
  const etaRe = /ETA\s+([0-9:]+)/i

  const parseLine = (line) => {
    if (typeof onProgress !== 'function') return
    try {
      const percentMatch = [...line.matchAll(percentRe)].pop()
      if (percentMatch) {
        const p = Math.max(0, Math.min(100, parseFloat(percentMatch[1])))
        const speedMatch = line.match(speedRe)
        const totalMatch = line.match(totalRe)
        const etaMatch = line.match(etaRe)
        if (p > lastPercent || p >= 100) {
          lastPercent = p
          onProgress({
            percent: p,
            status: line.includes('[download]') ? 'download' : undefined,
            total: totalMatch ? totalMatch[1] : undefined,
            speed: speedMatch ? speedMatch[1] : undefined,
            eta: etaMatch ? etaMatch[1] : undefined,
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
