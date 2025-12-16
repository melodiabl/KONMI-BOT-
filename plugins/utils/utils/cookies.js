import fs from 'fs'
import path from 'path'

const DEFAULT_COOKIE_CANDIDATES = [
  process.env.YTDLP_COOKIES,
  process.env.YOUTUBE_COOKIES,
  './cookies.txt',
  './cookies-youtube.txt',
  '/home/container/cookies.txt',
  '/home/container/cookies-youtube.txt'
].filter(Boolean)

export function findCookiesFile() {
  for (const candidate of DEFAULT_COOKIE_CANDIDATES) {
    try {
      const full = path.isAbsolute(candidate)
        ? candidate
        : path.join(process.cwd(), candidate)
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return full
      }
    } catch {
      // ignorar errores de fs
    }
  }
  return null
}

/**
 * Devuelve los argumentos para yt-dlp si existe un archivo de cookies.
 * Ejemplo: ['--cookies', '/home/container/cookies-youtube.txt']
 */
export function buildYtDlpCookieArgs() {
  const file = findCookiesFile()
  if (!file) return []
  return ['--cookies', file]
}
