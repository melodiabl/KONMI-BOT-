import fs from 'fs'
import os from 'os'
import path from 'path'

function exists(p) {
  try { return p && fs.existsSync(p) } catch { return false }
}

function readFileBuffer(p) {
  try { return fs.readFileSync(p) } catch { return null }
}

function hasBom(buf) {
  return !!(buf && buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF)
}

function looksLikeNetscapeCookies(text) {
  if (!text) return false
  if (/^#\s*Netscape HTTP Cookie File/i.test(text)) return true
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length >= 7) return true
  }
  return false
}

function headerFromLooseCookies(text) {
  if (!text) return null
  const pairs = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    // If it is a Netscape row, skip; it will be handled as file
    const tabParts = line.split('\t')
    if (tabParts.length >= 7) continue
    const eq = line.indexOf('=')
    if (eq > 0) {
      const name = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (name) pairs.push(`${name}=${value}`)
    }
  }
  return pairs.length ? pairs.join('; ') : null
}

function defaultCookieCandidates() {
  const cwd = process.cwd()
  const list = [
    process.env.YOUTUBE_COOKIES_FILE,
    process.env.YT_COOKIES_FILE,
    path.join(cwd, 'backend', 'full', 'all_cookies.txt'),
    path.join(cwd, 'backend', 'full', 'all_cookie.txt'),
    // Common VPS paths
    '/home/admin/all_cookies.txt',
    '/home/admin/all_cookie.txt',
    '/home/admin/KONMI-BOT-/backend/full/all_cookies.txt',
    '/home/admin/KONMI-BOT-/backend/full/all_cookie.txt',
  ]
  return Array.from(new Set(list.filter(Boolean)))
}

export function sanitizeCookieFileIfNeeded(filePath) {
  if (!filePath || !exists(filePath)) return null
  const buf = readFileBuffer(filePath)
  if (!buf) return filePath
  if (!hasBom(buf)) return filePath
  // Write sanitized copy without BOM
  const out = path.join(path.dirname(filePath), '.cookies.sanitized.txt')
  try { fs.writeFileSync(out, buf.slice(3)) } catch { return filePath }
  return out
}

export function buildCookieHeaderFromFile(filePath) {
  if (!filePath || !exists(filePath)) return null
  const buf = readFileBuffer(filePath)
  if (!buf) return null
  const text = hasBom(buf) ? buf.slice(3).toString('utf8') : buf.toString('utf8')
  return headerFromLooseCookies(text)
}

function chooseBrowser() {
  const envBrowser = (process.env.YTDLP_BROWSER || '').trim().toLowerCase()
  if (envBrowser) return envBrowser
  if (process.platform === 'win32') return 'brave'
  if (process.platform === 'darwin') return 'brave'
  return 'chrome'
}

export function buildYtDlpCookieArgs() {
  // 1) Prefer header from env if provided directly
  const inlineHeader = (process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES || '').trim()
  if (inlineHeader) return ['--add-header', `Cookie: ${inlineHeader}`]

  // 2) Try cookie files
  const candidates = defaultCookieCandidates()
  for (const p of candidates) {
    if (!exists(p)) continue
    const sanitized = sanitizeCookieFileIfNeeded(p) || p
    // If the content is Netscape, use file; otherwise, try to turn into header
    try {
      const buf = readFileBuffer(sanitized)
      const text = buf ? buf.toString('utf8') : ''
      if (looksLikeNetscapeCookies(text)) {
        return ['--cookies', sanitized]
      }
      const header = headerFromLooseCookies(text)
      if (header) return ['--add-header', `Cookie: ${header}`]
    } catch {}
  }

  // 3) As a last resort on desktop/laptop, allow cookies-from-browser if enabled
  // Default policy: Windows/macOS -> true, Linux (VPS) -> false unless explicitly enabled
  const defaultAllow = (process.platform === 'win32' || process.platform === 'darwin') ? 'true' : 'false'
  const allowBrowser = String(process.env.YTDLP_COOKIES_FROM_BROWSER || defaultAllow).toLowerCase() !== 'false'
  if (allowBrowser) {
    const browser = chooseBrowser()
    // On Linux servers, only use if the cookie DB exists for the chosen browser
    const home = process.env.HOME || os.homedir() || ''
    const linuxPaths = {
      brave: `${home}/.config/BraveSoftware/Brave-Browser/Default/Cookies`,
      chrome: `${home}/.config/google-chrome/Default/Cookies`,
      chromium: `${home}/.config/chromium/Default/Cookies`,
      edge: `${home}/.config/microsoft-edge/Default/Cookies`,
    }
    if (process.platform === 'linux') {
      const cookieDb = linuxPaths[browser] || linuxPaths.chrome
      if (!exists(cookieDb)) {
        // Try alternative chromium if chrome is missing
        if (browser === 'chrome' && exists(linuxPaths.chromium)) {
          return ['--cookies-from-browser', 'chromium']
        }
        // On VPS with no browser profiles, skip cookies-from-browser
      } else {
        return ['--cookies-from-browser', browser]
      }
    } else {
      // On Windows/macOS, trust yt-dlp to locate the store
      return ['--cookies-from-browser', browser]
    }
  }

  // 4) No cookies available
  return []
}

export default {
  buildYtDlpCookieArgs,
  sanitizeCookieFileIfNeeded,
  buildCookieHeaderFromFile,
}
