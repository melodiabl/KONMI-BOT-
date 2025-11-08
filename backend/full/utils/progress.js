// utils/progress.js
// Barra de progreso, spinner y descarga con progreso

import { fetchWithTimeout } from './net.js'

export const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
export const SPINNER_INTERVAL_MS = Number(process.env.PROGRESS_SPINNER_INTERVAL_MS || 150)
export const EDIT_COOLDOWN_MS = Number(process.env.PROGRESS_EDIT_COOLDOWN_MS || 150)
export const PROGRESS_LOW_OVERHEAD = String(process.env.PROGRESS_LOW_OVERHEAD || 'false').toLowerCase() === 'true'

export function buildProgressBar(percent, segments = 15) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0))
  const f = Math.round((p / 100) * segments)
  return '█'.repeat(f) + '░'.repeat(Math.max(0, segments - f))
}

export function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

export function describePlayProgress(percent) {
  if (!Number.isFinite(percent)) return 'Calculando tamaño de la descarga...'
  if (percent < 10) return 'Conectando con el servidor de audio...'
  if (percent < 45) return 'Descargando la vista previa...'
  if (percent < 80) return 'Procesando y normalizando el audio...'
  if (percent < 100) return 'Preparando el archivo para enviarlo...'
  return '¡Descarga finalizada!'
}

export async function downloadBufferWithProgress(url, { timeoutMs = 20000, onProgress } = {}) {
  const response = await fetchWithTimeout(url, {}, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const totalHeader = response.headers?.get?.('content-length') || response.headers?.get?.('Content-Length')
  const totalBytes = totalHeader ? parseInt(totalHeader, 10) : null

  if (!response.body || typeof response.body.on !== 'function') {
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (typeof onProgress === 'function') {
      onProgress({ received: buffer.length, total: totalBytes, percent: totalBytes ? 100 : null, done: true })
    }
    return buffer
  }

  return await new Promise((resolve, reject) => {
    const chunks = []
    let received = 0

    const notify = (done = false) => {
      if (typeof onProgress !== 'function') return
      const percent = totalBytes ? (received / totalBytes) * 100 : null
      onProgress({ received, total: totalBytes, percent, done })
    }

    response.body.on('data', (chunk) => {
      chunks.push(chunk)
      received += chunk.length
      notify(false)
    })

    response.body.once('end', () => {
      try {
        notify(true)
        resolve(Buffer.concat(chunks))
      } catch (e) { reject(e) }
    })

    response.body.once('error', (err) => { reject(err) })
  })
}

export default { SPINNER_FRAMES, SPINNER_INTERVAL_MS, EDIT_COOLDOWN_MS, PROGRESS_LOW_OVERHEAD, buildProgressBar, sleep, describePlayProgress, downloadBufferWithProgress }

