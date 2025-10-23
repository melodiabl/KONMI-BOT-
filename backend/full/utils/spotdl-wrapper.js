import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function pickLatestFile(dir) {
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
}

export async function downloadWithSpotdl({
  queryOrUrl,
  outDir,
  spotdlPath = process.env.SPOTDL_PATH || 'spotdl',
  ffmpegPath = process.env.FFMPEG_PATH,
  onProgress,
  outputFormat = 'mp3',
}) {
  ensureDir(outDir)
  const args = []
  // Template simple para nombre final
  args.push('-p', '{title}.{ext}')
  args.push('--output', outDir)
  args.push('--output-format', outputFormat)
  if (ffmpegPath) {
    args.push('--ffmpeg', ffmpegPath)
  }
  // Preferir YouTube si fuera necesario
  args.push('--use-youtube')
  // Query/URL al final
  args.push(queryOrUrl)

  const child = spawn(spotdlPath, args, { windowsHide: true })

  let lastPercent = 0
  const percentRe = /(\d{1,3})%/g

  const parseProgress = (line) => {
    try {
      const matches = [...line.matchAll(percentRe)]
      if (matches.length) {
        const p = Math.max(0, Math.min(100, parseInt(matches[matches.length - 1][1], 10)))
        if (typeof onProgress === 'function' && (p > lastPercent || p >= 100)) {
          lastPercent = p
          onProgress({ percent: p })
        }
      }
    } catch {}
  }

  let stderr = ''
  let stdout = ''

  child.stdout.on('data', (d) => {
    const s = d.toString()
    stdout += s
    parseProgress(s)
  })
  child.stderr.on('data', (d) => {
    const s = d.toString()
    stderr += s
    parseProgress(s)
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `spotdl exited ${code}`))
    })
  })

  // Pick latest created file in outDir
  const filePath = pickLatestFile(outDir)
  if (!filePath) {
    throw new Error('No se encontró ningún archivo generado por spotdl')
  }

  return { success: true, filePath }
}

export default { downloadWithSpotdl }

