// utils/media-send.js
// Utilidades para mensajería de medios con progreso y helpers

import { SPINNER_FRAMES, buildProgressBar, sleep, downloadBufferWithProgress } from './progress.js'
import { fetchWithTimeout } from './net.js'

export function renderPlayProgressMessage(track, requester, percent, statusText) {
  const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null
  const description = statusText || (safePercent != null ? '' : 'Calculando tamaño de la descarga...')
  const progressLine = safePercent !== null ? `📊 ${buildProgressBar(safePercent)} ${safePercent}%` : '⏳ Calculando progreso...'
  const artist = track.artist || 'Artista desconocido'
  const title = track.title || 'Canción'
  const album = track.album || 'Álbum no disponible'
  const duration = track.duration || '--:--'
  const url = track.url || 'Sin enlace'
  return [
    '🎵 *Música encontrada*','',
    `🎤 *Artista:* ${artist}`,
    `🎶 *Canción:* ${title}`,
    `💿 *Álbum:* ${album}`,
    `⏱️ *Duración:* ${duration}`,
    `🔗 *URL:* ${url}`,'',
    `⏬ *Estado:* ${description}`,
    progressLine,'',
    `🙋 Solicitado por: ${requester}`,
  ].join('\n')
}

export function safeFileNameFromTitle(title, extension = '') {
  const normalizedTitle = (title || 'media')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_\- ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)
  return `${normalizedTitle}${extension}`
}

export function createProgressMessenger(sock, remoteJid, initialText, { contextLabel, initialMessageExtra, singleton = true } = {}) {
  let lastEdit = 0
  let messageKey = null
  let spinnerIndex = 0
  const staticLines = (initialText || '').split(/\r?\n/)
  const render = (percent) => {
    const spinner = SPINNER_FRAMES[spinnerIndex]
    const line = Number.isFinite(percent) ? `📊 ${spinner} ${buildProgressBar(percent)} ${percent}%` : `📊 ${spinner} ...`
    return [...staticLines, '', line].join('\n')
  }
  return {
    async start() {
      const payload = { text: render(null), ...(initialMessageExtra || {}) }
      const sent = await sock.sendMessage(remoteJid, payload)
      messageKey = sent?.key || null
    },
    queueUpdate(textOrPercent) {
      if (typeof textOrPercent === 'string') {
        staticLines[staticLines.length - 1] = textOrPercent
      }
    },
    async tick(percent) {
      if (!messageKey) return
      const now = Date.now()
      if (now - lastEdit < 150) return
      lastEdit = now
      spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length
      await sock.sendMessage(remoteJid, { text: render(percent) }, { edit: messageKey })
    },
    async flush() {
      if (!messageKey) return
      await sleep(50)
    }
  }
}

export async function sendMediaWithProgress({ sock, remoteJid, url, type, header, detailLines = [], mimetype, caption, mentions, fileName, contextLabel, preview, timeoutMs = 90000, getFailureMessage }) {
  let buffer
  try {
    buffer = await downloadBufferWithProgress(url, { timeoutMs, onProgress: () => {} })
  } catch (error) {
    if (getFailureMessage) {
      const msg = getFailureMessage(error, { stage: 'download' })
      await sock.sendMessage(remoteJid, msg)
    }
    return
  }
  const payload = {}
  if (type === 'video') payload.video = buffer
  else if (type === 'image') payload.image = buffer
  else if (type === 'audio') payload.audio = buffer
  if (mimetype) payload.mimetype = mimetype
  if (caption) payload.caption = caption
  if (mentions) payload.mentions = mentions
  try { await sock.sendMessage(remoteJid, payload) } catch (error) {
    if (getFailureMessage) {
      const msg = getFailureMessage(error, { stage: 'send' })
      await sock.sendMessage(remoteJid, msg)
    }
  }
}

export async function fetchPreviewThumbnail(coverUrl, timeout = 8000) {
  try {
    const resp = await fetchWithTimeout(coverUrl, {}, timeout)
    const ab = await resp.arrayBuffer()
    return Buffer.from(ab)
  } catch { return null }
}

export default { renderPlayProgressMessage, safeFileNameFromTitle, createProgressMessenger, sendMediaWithProgress, fetchPreviewThumbnail }

