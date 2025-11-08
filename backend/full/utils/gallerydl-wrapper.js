import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function pickLatestFileRecursive(dir) {
  let latest = null
  let latestMtime = 0
  function walk(d) {
    let items
    try { items = fs.readdirSync(d) } catch { return }
    for (const name of items) {
      const full = path.join(d, name)
      let st
      try { st = fs.statSync(full) } catch { continue }
      if (st.isDirectory()) { walk(full); continue }
      if (st.isFile() && st.mtimeMs > latestMtime) { latest = full; latestMtime = st.mtimeMs }
    }
  }
  try { walk(dir) } catch {}
  return latest
}

function detectGalleryDl() {
  try {
    const envPath = process.env.GALLERYDL_PATH || process.env.GALLERY_DL_PATH
    if (envPath && fs.existsSync(envPath)) {
      const r = spawnSync(envPath, ['--version'], { encoding: 'utf8', windowsHide: true })
      if (!r.error && r.status === 0) return { cmd: envPath, pre: [] }
    }
  } catch {}
  try {
    const r = spawnSync('gallery-dl', ['--version'], { encoding: 'utf8', windowsHide: true })
    if (!r.error && r.status === 0) return { cmd: 'gallery-dl', pre: [] }
  } catch {}
  const pyCands = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']
  for (const py of pyCands) {
    try {
      const r = spawnSync(py, ['-m', 'gallery_dl', '--version'], { encoding: 'utf8', windowsHide: true })
      if (!r.error && r.status === 0) return { cmd: py, pre: ['-m', 'gallery_dl'] }
    } catch {}
  }
  return null
}

export async function downloadWithGalleryDl({ url, outDir, cookiesFile, extraArgs = [], onProgress } = {}) {
  if (!url) throw new Error('URL requerida para gallery-dl')
  if (!outDir) throw new Error('outDir requerido para gallery-dl')

  ensureDir(outDir)
  const resolved = detectGalleryDl()
  if (!resolved) throw new Error('gallery-dl no disponible. Instala gallery-dl o agrégalo al PATH.')
  const { cmd, pre } = resolved

  const args = []
  // Poner base-directory para que guarde dentro de outDir
  args.push('-D', outDir)
  if (cookiesFile && fs.existsSync(cookiesFile)) {
    args.push('--cookies', cookiesFile)
  } else if (process.env.YOUTUBE_COOKIES_FILE && fs.existsSync(process.env.YOUTUBE_COOKIES_FILE)) {
    args.push('--cookies', process.env.YOUTUBE_COOKIES_FILE)
  }
  if (Array.isArray(extraArgs) && extraArgs.length) args.push(...extraArgs)
  args.push(url)

  const child = spawn(cmd, [...pre, ...args], { windowsHide: true })
  let stderr = ''
  let stdout = ''
  const percentRe = /(\d{1,3})%/g

  const parse = (s) => {
    if (typeof onProgress !== 'function') return
    try {
      const matches = [...s.matchAll(percentRe)]
      if (matches.length) {
        const p = Math.max(0, Math.min(100, parseInt(matches[matches.length - 1][1], 10)))
        onProgress({ percent: p })
      }
    } catch {}
  }

  child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; parse(s) })
  child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; parse(s) })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || ('exit ' + code)))))
  })

  const filePath = pickLatestFileRecursive(outDir)
  if (!filePath) throw new Error('No se encontró archivo generado por gallery-dl')
  return { success: true, filePath }
}

export default { downloadWithGalleryDl }

