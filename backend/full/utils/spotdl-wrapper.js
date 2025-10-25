import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function pickLatestFile(dir, allowedExts = []) {
  const files = fs.readdirSync(dir)
  let latest = null
  let latestMtime = 0
  const filter = (f) => {
    if (!allowedExts.length) return true
    const ext = (f.split('.').pop() || '').toLowerCase()
    return allowedExts.includes(ext)
  }
  for (const f of files) {
    if (f.endsWith('.part') || f.endsWith('.tmp')) continue
    if (!filter(f)) continue
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

  // Resolver binario de spotdl de forma adaptativa
  let cmd = spotdlPath
  let preArgs = []
  const tryDetect = () => {
    try {
      if (process.env.SPOTDL_PATH && fs.existsSync(process.env.SPOTDL_PATH)) {
        const r = spawnSync(process.env.SPOTDL_PATH, ['--version'], { encoding: 'utf8', windowsHide: true })
        if (!r.error && r.status === 0) return { c: process.env.SPOTDL_PATH, p: [] }
      }
    } catch {}
    try {
      const r = spawnSync('spotdl', ['--version'], { encoding: 'utf8', windowsHide: true })
      if (!r.error && r.status === 0) return { c: 'spotdl', p: [] }
    } catch {}
    const pyCands = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
    for (const py of pyCands) {
      try {
        const r = spawnSync(py, ['-m', 'spotdl', '--version'], { encoding: 'utf8', windowsHide: true })
        if (!r.error && r.status === 0) return { c: py, p: ['-m', 'spotdl'] }
      } catch {}
    }
    return null
  }
  const works = (c, extra=[]) => {
    try {
      const r = spawnSync(c, [...extra, '--version'], { encoding: 'utf8', windowsHide: true })
      return !r.error && r.status === 0
    } catch { return false }
  }
  // Si SPOTDL_PATH no está definido o es 'spotdl', o si no funciona, detectar automáticamente
  if (!spotdlPath || spotdlPath === 'spotdl' || !works(cmd, preArgs)) {
    const found = tryDetect()
    if (found) { cmd = found.c; preArgs = found.p }
  }

  const child = spawn(cmd, [...preArgs, ...args], { windowsHide: true })

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

  // Pick latest mp3 created file in outDir
  const filePath = pickLatestFile(outDir, ['mp3'])
  if (!filePath) {
    throw new Error('No se encontró ningún archivo generado por spotdl')
  }
  try {
    const st = fs.statSync(filePath)
    if (!st.isFile() || st.size < 20 * 1024) {
      throw new Error('Archivo spotdl inválido o tamaño muy pequeño')
    }
  } catch (e) {
    throw new Error('Archivo spotdl inválido')
  }

  return { success: true, filePath }
}

export default { downloadWithSpotdl }
