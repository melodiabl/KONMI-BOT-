// commands/router.js
// Router minimalista para despachar comandos modulares y enviar respuestas.
// No registra listeners ni toca Baileys; espera que el caller pase el contexto.

import logger from '../config/logger.js'

// Carga perezosa del registro para evitar ciclos de importación
async function loadRegistry() {
  try {
    const mod = await import('./registry/index.js')
    const get = mod?.getCommandRegistry
    const reg = typeof get === 'function' ? get() : null
    if (!reg || typeof reg.get !== 'function') throw new Error('Registro inválido')
    return reg
  } catch (e) {
    logger.warn?.(`[router] Fallo cargando registro de comandos: ${e?.message || e}`)
    return null
  }
}

function extractTextFromMessage(message) {
  try {
    const m = message?.message || {}
    return (
      m?.extendedTextMessage?.text ||
      m?.conversation ||
      m?.imageMessage?.caption ||
      m?.videoMessage?.caption ||
      ''
    )
  } catch { return '' }
}

function parseCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return { command: null, args: [] }
  // admitir prefijos comunes
  const first = raw[0]
  if (!['/', '!', '.'].includes(first)) return { command: null, args: [] }
  const parts = raw.split(/\s+/)
  const cmd = (parts.shift() || '').toLowerCase()
  return { command: cmd, args: parts }
}

async function sendResult(sock, jid, result) {
  if (!sock || !jid || !result) return
  try {
    // Texto de error o confirmación
    if (result.message && !result.type) {
      const payload = result.mentions && Array.isArray(result.mentions)
        ? { text: result.message, mentions: result.mentions }
        : { text: result.message }
      await sock.sendMessage(jid, payload)
      return
    }

    // Imagen
    if (result.type === 'image') {
      const image = result.image?.url ? { url: result.image.url } : (result.image || {})
      const payload = { image }
      if (result.caption) payload.caption = result.caption
      if (result.mentions && Array.isArray(result.mentions)) payload.mentions = result.mentions
      await sock.sendMessage(jid, payload)
      return
    }

    // Video
    if (result.type === 'video') {
      const video = result.video?.url ? { url: result.video.url } : (result.video || {})
      const payload = { video }
      if (result.caption) payload.caption = result.caption
      if (result.gifPlayback) payload.gifPlayback = true
      if (result.mentions && Array.isArray(result.mentions)) payload.mentions = result.mentions
      await sock.sendMessage(jid, payload)
      return
    }

    // Audio
    if (result.type === 'audio') {
      const audio = result.audio?.url ? { url: result.audio.url } : (result.audio || {})
      const payload = { audio }
      if (result.ptt) payload.ptt = true
      await sock.sendMessage(jid, payload)
      return
    }

    // Sticker
    if (result.type === 'sticker') {
      const sticker = result.sticker?.url ? { url: result.sticker.url } : (result.sticker || {})
      await sock.sendMessage(jid, { sticker, ...(result.caption ? { caption: result.caption } : {}) })
      return
    }

    // Fallback: texto serializado
    await sock.sendMessage(jid, { text: typeof result === 'string' ? result : (result.message || '✅ Listo') })
  } catch (e) {
    try { await sock.sendMessage(jid, { text: `⚠️ Error enviando respuesta: ${e?.message || e}` }) } catch {}
  }
}

/**
 * Despacha un comando dado el contexto.
 * ctx requiere: { sock, remoteJid, usuario, isGroup, message, text? }
 * Devuelve true si manejó el comando.
 */
export async function dispatch(ctx = {}) {
  const { sock, remoteJid } = ctx
  if (!sock || !remoteJid) return false

  // Obtener texto y parsear
  const text = ctx.text != null ? String(ctx.text) : extractTextFromMessage(ctx.message)
  const { command, args } = parseCommand(text)
  if (!command) return false

  // Cargar registro y resolver handler
  const registry = await loadRegistry()
  if (!registry || !registry.has(command)) return false

  const entry = registry.get(command)
  const params = {
    ...ctx,
    text,
    command,
    args,
    fecha: new Date().toISOString(),
  }

  let result = null
  try {
    result = await entry.handler(params)
  } catch (e) {
    await sendResult(sock, remoteJid, { success: false, message: `⚠️ Error ejecutando ${command}: ${e?.message || e}` })
    return true
  }
  await sendResult(sock, remoteJid, result)
  return true
}

export default { dispatch }

