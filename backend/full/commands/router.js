// commands/router.js
// Router minimalista para despachar comandos modulares y enviar respuestas.
// No registra listeners ni toca Baileys; espera que el caller pase el contexto.

import logger from '../config/logger.js'
// Carga local de helpers de Baileys (sin utils externos)
let generateWAMessageFromContent, prepareWAMessageMedia, proto
try {
  const candidates = []
  try { if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE) } catch {}
  candidates.push('@whiskeysockets/baileys','baileys-mod','@rexxhayanasi/elaina-bail','baileys')
  for (const name of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(name)
      const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
      const pick = (k) => (M?.[k] ?? mod?.default?.[k] ?? mod?.[k])
      generateWAMessageFromContent = pick('generateWAMessageFromContent')
      prepareWAMessageMedia = pick('prepareWAMessageMedia')
      proto = pick('proto')
      if (generateWAMessageFromContent && prepareWAMessageMedia && proto) break
    } catch {}
  }
} catch {}
import { buildVCard, toContactsPayload } from '../utils/messaging.js'
import { maybeStyleText, defaultEphemeralSeconds } from '../utils/ux.js'

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
    // Soporte para respuestas interactivas (botones/listas/flows)
    try {
      const nfr = m?.interactiveResponseMessage?.nativeFlowResponseMessage
      if (nfr && (nfr.paramsJson || nfr.name)) {
        const params = nfr.paramsJson ? JSON.parse(nfr.paramsJson) : {}
        const n = String(nfr.name || '').toLowerCase()
        if (n === 'quick_reply' && params.id) {
          const id = String(params.id)
          return id.startsWith('/') ? id : `/${id}`
        }
        if (n === 'single_select' && (params.selectedId || params.id)) {
          const id = String(params.selectedId || params.id)
          return id.startsWith('/') ? id : `/${id}`
        }
        if (n === 'cta_copy' && (params.copy_code || params.id)) {
          return `/copy ${params.copy_code || params.id}`
        }
      }
    } catch {}
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

function mentionOf(usuario){
  try {
    const num = String(usuario||'').split('@')[0]
    return `${num}@s.whatsapp.net`
  } catch { return null }
}

function emojiFor(command, category){
  const c = String(category||'').toLowerCase()
  const cmd = String(command||'').toLowerCase()
  const mapByCmd = {
    '/video': '🎬', '/download': '🎬', '/dl': '🎬', '/youtube': '🎬',
    '/music': '🎵', '/musica': '🎵', '/play': '🎵',
    '/qr': '🔐', '/code': '🔐',
    '/kick': '👢', '/promote': '⬆️', '/demote': '⬇️', '/lock': '🔒', '/unlock': '🔓', '/tag': '🔔', '/admins': '👑',
    '/status': '📊', '/serverinfo': '🖥️', '/runtime': '⏱️',
    '/menu': '📋', '/help': '📋', '/admin': '🛡️',
  }
  if (mapByCmd[cmd]) return mapByCmd[cmd]
  const mapByCat = { media: '📥', pairing: '🔐', group: '👥', utils: '🛠️', system: '🛠️', info: '📊', demo: '🧪', basic: '📋', library: '📚', aportes: '✨', pedidos: '📝' }
  return mapByCat[c] || '⏳'
}

function prettyName(command){
  try {
    const cmd = String(command||'').toLowerCase()
    const map = {
      '/music':'Música','/musica':'Música','/play':'Música',
      '/video':'Video','/download':'Descarga','/dl':'Descarga','/youtube':'Video',
      '/qr':'QR Subbot','/code':'Pairing Subbot',
      '/kick':'Expulsión','/promote':'Promoción','/demote':'Degradación','/lock':'Bloqueo','/unlock':'Desbloqueo','/tag':'Mención a todos','/admins':'Administradores',
      '/status':'Estado','/serverinfo':'Servidor','/runtime':'Runtime',
      '/menu':'Menú','/help':'Ayuda','/admin':'Administración','/adminmenu':'Administración',
      '/poll':'Encuesta','/location':'Ubicación','/contact':'Contacto','/buttons':'Botones','/listdemo':'Lista',
      '/short':'Acortar URL','/tts':'Texto a Voz',
      '/ai':'IA','/clasificar':'Clasificación','/listclasificados':'Clasificados',
      '/registrar':'Registro','/resetpass':'Resetear contraseña','/miinfo':'Mi info',
      '/addgroup':'Activar grupo','/delgroup':'Desactivar grupo','/bot':'Control bot',
      '/mybots':'Mis Subbots','/mibots':'Mis Subbots','/bots':'Subbots Globales',
    }
    if (map[cmd]) return map[cmd]
    const raw = cmd.replace(/^\//,'')
    if (!raw) return 'Comando'
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  } catch { return 'Comando' }
}

async function sendPrelude(sock, jid, ctx, command, entry){
  try {
    const userMention = mentionOf(ctx?.usuario)
    const em = emojiFor(command, entry?.category)
    const label = prettyName(command)
    const scope = ctx?.isGroup ? '(grupo)' : '(privado)'
    const pre = maybeStyleText(`${em} Procesando ${label}… ${scope}`)
    const payload = userMention ? { text: pre, mentions: [userMention] } : { text: pre }
    const opts = { quoted: ctx?.message }
    const d = defaultEphemeralSeconds(); if (d) opts.ephemeralExpiration = d
    await sock.sendMessage(jid, payload, opts)
  } catch {}
}

async function sendResult(sock, jid, result, ctx) {
  if (!sock || !jid || !result) return
  const sendOpts = {}
  try {
    // Citar mensaje original si se pide
    if (result.quoted) {
      sendOpts.quoted = result.quoted === true ? (ctx?.message || undefined) : (result.quoted || undefined)
    }
    // Si no se especifica, citar por defecto al mensaje del usuario
    if (!sendOpts.quoted && ctx?.message) {
      sendOpts.quoted = ctx.message
    }
    // Mensajes efímeros (expiran en segundos)
    if (result.ephemeralDuration) {
      sendOpts.ephemeralExpiration = Number(result.ephemeralDuration) || undefined
    }
    // Presence typing opcional
    const typing = String(process.env.PRESENCE_TYPING || '').toLowerCase() === 'true'
    if (typing) {
      try { await sock.presenceSubscribe(jid) } catch {}
      try { await sock.sendPresenceUpdate('composing', jid) } catch {}
    }
    // Texto
    if (result.message && !result.type) {
      const payload = result.mentions && Array.isArray(result.mentions)
        ? { text: maybeStyleText(result.message), mentions: result.mentions }
        : { text: maybeStyleText(result.message) }
      if (result.externalAdReply) payload.contextInfo = { externalAdReply: result.externalAdReply }
      if (!result.ephemeralDuration) {
        const d = defaultEphemeralSeconds(); if (d) sendOpts.ephemeralExpiration = d
      }
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Documento
    if (result.type === 'document') {
      const document = result.document?.url ? { url: result.document.url } : (result.document || {})
      const payload = { document }
      if (result.mimetype) payload.mimetype = result.mimetype
      if (result.fileName) payload.fileName = result.fileName
      if (result.caption) payload.caption = result.caption
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Ubicación
    if (result.type === 'location') {
      const location = {
        degreesLatitude: Number(result.lat ?? result.latitude ?? result.degreesLatitude),
        degreesLongitude: Number(result.lon ?? result.longitude ?? result.degreesLongitude),
        name: result.name,
        address: result.address,
        jpegThumbnail: result.jpegThumbnail,
      }
      await sock.sendMessage(jid, { location }, sendOpts)
      return
    }

    // Contactos
    if (result.type === 'contact' || result.type === 'contacts') {
      const payload = toContactsPayload(result)
      if (payload) { await sock.sendMessage(jid, payload, sendOpts); return }
    }

    // Imagen
    if (result.type === 'image') {
      const image = result.image?.url ? { url: result.image.url } : (result.image || {})
      const payload = { image, ...(result.viewOnce ? { viewOnce: true } : {}) }
      if (result.caption) payload.caption = result.caption
      if (result.mentions && Array.isArray(result.mentions)) payload.mentions = result.mentions
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Video
    if (result.type === 'video') {
      const video = result.video?.url ? { url: result.video.url } : (result.video || {})
      const payload = { video, ...(result.viewOnce ? { viewOnce: true } : {}) }
      if (result.caption) payload.caption = result.caption
      if (result.gifPlayback) payload.gifPlayback = true
      if (result.mentions && Array.isArray(result.mentions)) payload.mentions = result.mentions
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Audio
    if (result.type === 'audio') {
      const audio = result.audio?.url ? { url: result.audio.url } : (result.audio || {})
      const payload = { audio }
      if (result.ptt) payload.ptt = true
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Sticker
    if (result.type === 'sticker') {
      const sticker = result.sticker?.url ? { url: result.sticker.url } : (result.sticker || {})
      await sock.sendMessage(jid, { sticker, ...(result.caption ? { caption: result.caption } : {}) }, sendOpts)
      return
    }

    // Reacción
    if (result.type === 'reaction') {
      const emoji = result.emoji || result.text || '👍'
      const key = result.key || result.quoted?.key
      if (key) await sock.sendMessage(jid, { react: { text: emoji, key } }, sendOpts)
      return
    }

    // Botones (templateButtons)
    if (result.type === 'buttons') {
      const text = maybeStyleText(result.text || result.caption || 'Seleccione una opción:')
      const footer = result.footer || undefined
      const templateButtons = (result.buttons || []).slice(0, 5).map((b, i) => {
        if (b?.url) return { index: i + 1, urlButton: { displayText: b.text || b.title || `Opción ${i+1}`, url: b.url } }
        if (b?.phone) return { index: i + 1, callButton: { displayText: b.text || b.title || `Llamar`, phoneNumber: b.phone } }
        const id = b.id || b.payload || b.command || `/btn_${i+1}`
        return { index: i + 1, quickReplyButton: { displayText: b.text || b.title || `Opción ${i+1}`, id } }
      })
      const payload = footer ? { text, footer, templateButtons } : { text, templateButtons }
      await sock.sendMessage(jid, payload, sendOpts)
      return
    }

    // Listas (sections/rows)
    if (result.type === 'list') {
      const text = maybeStyleText(result.text || result.caption || 'Seleccione')
      const buttonText = result.buttonText || 'Elegir'
      const sections = (result.sections || []).map(s => ({
        title: s.title,
        rows: (s.rows||[]).map(r => ({ title: r.title, description: r.description, rowId: r.id || r.rowId || r.command }))
      }))
      await sock.sendMessage(jid, { text, buttonText, sections }, sendOpts)
      return
    }

    // Poll (encuesta)
    if (result.type === 'poll') {
      const name = result.title || result.name || 'Encuesta'
      const values = result.options || result.choices || []
      await sock.sendMessage(jid, { poll: { name, values } }, sendOpts)
      return
    }

    // Contenido nativo (proto)
    if (result.type === 'content' && result.content) {
      try {
        const msg = generateWAMessageFromContent(jid, result.content, { userJid: sock?.user?.id })
        await sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
        return
      } catch (_) {}
    }

    // Reenvío simple (forward) si se provee un mensaje fuente
    if (result.type === 'forward' && result.source && result.source.message) {
      try {
        await sock.relayMessage(jid, result.source.message, { messageId: result.newMessageId })
        return
      } catch (_) {}
    }

    // Fallback
    {
      let text = typeof result === 'string' ? result : (result.message || '✅ Listo')
      text = maybeStyleText(text)
      if (!result.ephemeralDuration) { const d = defaultEphemeralSeconds(); if (d) sendOpts.ephemeralExpiration = d }
      await sock.sendMessage(jid, { text }, sendOpts)
    }
  } catch (e) {
    try { await sock.sendMessage(jid, { text: `⚠️ Error enviando respuesta: ${e?.message || e}` }, sendOpts) } catch {}
  } finally {
    const typing = String(process.env.PRESENCE_TYPING || '').toLowerCase() === 'true'
    if (typing) { try { await sock.sendPresenceUpdate('paused', jid) } catch {} }
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

  // Respuesta de preámbulo para todos los comandos
  try { await sendPrelude(sock, remoteJid, ctx, command, entry) } catch {}
  try {
    if (String(process.env.LOG_CONSOLE_TRACE||'').toLowerCase()==='true') {
      const where = ctx?.isGroup ? 'grupo' : 'privado'
      const who = String(ctx?.usuario||'').split('@')[0]
      logger.info(`➡️ ${command} | usuario: +${who} | chat: ${remoteJid} | ${where}`)
    }
  } catch {}

  let result = null
  try {
    result = await entry.handler(params)
  } catch (e) {
    await sendResult(sock, remoteJid, { success: false, message: `⚠️ Error ejecutando ${command}: ${e?.message || e}` }, ctx)
    try { if (String(process.env.LOG_CONSOLE_TRACE||'').toLowerCase()==='true') logger.error(`✖️ ${command} falló: ${e?.message||e}`) } catch {}
    return true
  }
  if (Array.isArray(result)) {
    for (const r of result) {
      try { await sendResult(sock, remoteJid, r, ctx) } catch {}
    }
  } else {
    await sendResult(sock, remoteJid, result, ctx)
  }
  try { if (String(process.env.LOG_CONSOLE_TRACE||'').toLowerCase()==='true') logger.info(`✅ ${command} completado`) } catch {}
  return true
}

export default { dispatch }

