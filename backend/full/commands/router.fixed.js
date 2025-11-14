// commands/router.fixed.js
// Router simplificado y estable: parsea comandos, invoca registry y entrega respuestas con safeSend

import logger from '../config/logger.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function normalizeDigits(userOrJid){
  try{ let s=String(userOrJid||''); const at=s.indexOf('@'); if(at>0) s=s.slice(0,at); const col=s.indexOf(':'); if(col>0) s=s.slice(0,col); return s.replace(/\D/g,'') }catch{ return onlyDigits(userOrJid) }
}
function isAdminFlag(p){ try { return !!(p && ((p.admin==='admin'||p.admin==='superadmin')||p.admin===true||p.isAdmin===true||p.isSuperAdmin===true||(typeof p.privilege==='string'&&/admin/i.test(p.privilege)))) } catch { return false } }
async function isBotAdminInGroup(sock, groupJid){
  try{ const meta = await sock.groupMetadata(groupJid); const bot = normalizeDigits(sock?.user?.id||''); const me = (meta?.participants||[]).find(x=> normalizeDigits(x?.id||x?.jid)===bot ); return isAdminFlag(me) } catch { return false }
}

function extractText(message) {
  try {
    const m = message?.message || {}
    // Texto clásico o captions
    const base = (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      ''
    )
    if (base) return String(base).trim()
    // Respuestas de botones (template/quick reply)
    const btnId = m.buttonsResponseMessage?.selectedButtonId
      || m.templateButtonReplyMessage?.selectedId
      || m.buttonReplyMessage?.selectedButtonId
    if (btnId) return String(btnId).trim()
    // Respuesta de lista
    const rowId = m.listResponseMessage?.singleSelectReply?.selectedRowId
      || m.listResponseMessage?.singleSelectReply?.selectedId
      || m.interactiveResponseMessage?.listResponseMessage?.singleSelectReply?.selectedRowId
    if (rowId) return String(rowId).trim()
    // Respuesta de Native Flow (interactive)
    const paramsJson = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
    if (paramsJson) {
      try {
        const params = JSON.parse(paramsJson)
        const id = params?.id || params?.command || params?.rowId || params?.row_id
        if (id) return String(id).trim()
      } catch {}
    }
    return ''
  } catch { return '' }
}

function parseCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return { command: '', args: [] }
  const prefixes = Array.from(new Set(((process.env.CMD_PREFIXES || '/!.#?$~').split('')).concat(['/','!','.'])))
  const s = raw.replace(/^\s+/, '')
  if (s[0] === '/') {
    const parts = s.slice(1).trim().split(/\s+/)
    return { command: `/${(parts.shift() || '').toLowerCase()}`, args: parts }
  }
  if (prefixes.includes(s[0])) {
    const parts = s.slice(1).trim().split(/\s+/)
    const token = (parts.shift() || '').toLowerCase().replace(/^[\/.!#?$~]+/, '')
    return { command: `/${token}`, args: parts }
  }
  return { command: '', args: [] }
}

function traceEnabled() {
  try { return String(process.env.TRACE_ROUTER || process.env.LOG_CONSOLE_TRACE || 'false').toLowerCase() === 'true' } catch { return false }
}

function summarizePayload(p) {
  try {
    if (!p || typeof p !== 'object') return typeof p
    const keys = Object.keys(p)
    if (p.viewOnceMessage?.message?.interactiveMessage) return 'interactiveMessage'
    if (p.listMessage) return 'listMessage'
    if (p.templateButtons) return 'templateButtons'
    if (p.image) return 'image'
    if (p.video) return 'video'
    if (p.audio) return 'audio'
    if (p.sticker) return 'sticker'
    if (p.text) return 'text'
    return keys.slice(0,5).join(',')
  } catch { return 'payload' }
}

async function safeSend(sock, jid, payload, opts = {}, silentOnFail = false) {
  let e1 = null, e2 = null
  try { await sock.sendMessage(jid, payload, opts); return true } catch (err) { e1 = err }
  try { const o = { ...(opts||{}) }; if (o.quoted) delete o.quoted; await sock.sendMessage(jid, payload, o); return true } catch (err) { e2 = err }
  try { if (traceEnabled()) console.warn('[router.send] failed:', summarizePayload(payload), e1?.message || e1, '|', e2?.message || e2) } catch {}
  if (!silentOnFail) {
    try { await sock.sendMessage(jid, { text: '⚠️ No pude enviar respuesta. Usa /help' }); } catch {}
  }
  return false
}

function toMediaInput(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') {
    // dataURL base64 → Buffer, o URL/http
    if (value.startsWith('data:')) {
      try { const b = value.split(',')[1] || ''; return Buffer.from(b, 'base64') } catch { return null }
    }
    if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 80)) && value.length > 100) {
      try { return Buffer.from(value, 'base64') } catch { /* ignore */ }
    }
    return { url: value }
  }
  if (typeof value === 'object' && typeof value.url === 'string') return { url: value.url }
  return value
}

function buildSendOptions(result) {
  try {
    if (!result || typeof result !== 'object') return undefined
    const opts = {}
    if (result.quoted && typeof result.quoted === 'object') opts.quoted = result.quoted
    const ttl = Number(result.ephemeralDuration)
    if (Number.isFinite(ttl) && ttl > 0) opts.ephemeralExpiration = Math.floor(ttl)
    if (result.linkPreview === false) opts.linkPreview = false
    return Object.keys(opts).length ? opts : undefined
  } catch {
    return undefined
  }
}

function buildVCard(contact = {}) {
  try {
    const digits = normalizeDigits(contact.phone || contact.number || contact.id || '')
    const name = String(contact.name || contact.displayName || digits || 'Contacto').replace(/\n/g, ' ')
    if (!digits) return null
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${digits}:${digits}\nEND:VCARD`
  } catch {
    return null
  }
}

async function sendResult(sock, jid, result, ctx) {
  if (!result) {
    // Fallback seguro si el handler no devolvió nada
    await safeSend(sock, jid, { text: '✅' }, undefined)
    return
  }
  // Evitar quoted=true por compatibilidad; solo aceptar objeto explícito
  const opts = buildSendOptions(result)

  // Fallback a DM si el bot no es admin en grupos bloqueados
  let targetJid = jid
  try {
    const dmFallback = String(process.env.DM_FALLBACK_WHEN_NO_ADMIN || 'true').toLowerCase() === 'true'
    const isGroup = typeof jid === 'string' && jid.endsWith('@g.us')
    if (dmFallback && isGroup) {
      const ok = await isBotAdminInGroup(sock, jid)
      if (!ok) {
        // Preferir el JID real del participante (incluye @lid cuando aplica)
        const participantJid = ctx?.message?.key?.participant || ctx?.participantJid || ctx?.participant
        const usuarioJid = ctx?.usuario && String(ctx.usuario).includes('@') ? ctx.usuario : null
        if (participantJid && /@(?:s\.whatsapp\.net|lid)$/.test(participantJid)) {
          targetJid = participantJid
        } else if (usuarioJid && /@(?:s\.whatsapp\.net|lid)$/.test(usuarioJid)) {
          targetJid = usuarioJid
        } else {
          const userDigits = normalizeDigits(ctx?.usuario || sock?.user?.id || '')
          if (userDigits) targetJid = `${userDigits}@s.whatsapp.net`
        }
      }
    }
  } catch {}
  if (typeof result === 'string') { await safeSend(sock, targetJid, { text: result }, opts); return }
  if (result.message) { await safeSend(sock, targetJid, { text: result.message, mentions: result.mentions }, opts); return }
  // Reacciones y presencia
  if (result.type === 'reaction' && result.emoji) {
    const key = result.key || result.quoted?.key || ctx?.message?.key
    try { if (key) await sock.sendMessage(targetJid, { react: { text: result.emoji, key } }, opts) } catch {}
    return
  }
  if (result.type === 'presence') {
    try { await sock.sendPresenceUpdate(result.state || 'composing', targetJid) } catch {}
    return
  }
  if (result.type === 'edit' && result.text) {
    const key = result.key || result.quoted?.key
    if (key) {
      try { await sock.sendMessage(targetJid, { edit: key, text: result.text }) }
      catch (err) { try { await safeSend(sock, targetJid, { text: result.text }, opts) } catch {} }
      return
    }
  }
  if (result.type === 'delete') {
    const key = result.key || result.quoted?.key
    if (key) {
      try { await sock.sendMessage(targetJid, { delete: key }) } catch {}
      return
    }
  }
  if (result.type === 'image' && result.image) { await safeSend(sock, targetJid, { image: toMediaInput(result.image), caption: result.caption, mentions: result.mentions }, opts); return }
  if (result.type === 'video' && result.video) { await safeSend(sock, targetJid, { video: toMediaInput(result.video), caption: result.caption, mentions: result.mentions }, opts); return }
  if (result.type === 'audio' && result.audio) { await safeSend(sock, targetJid, { audio: toMediaInput(result.audio), mimetype: result.mimetype || 'audio/mpeg', ptt: !!result.ptt }, opts); return }
  if (result.type === 'sticker' && result.sticker) { await safeSend(sock, targetJid, { sticker: toMediaInput(result.sticker) }, opts, true); return }
  if (result.type === 'spotify') {
    let sentPrimary = false
    if (result.image) {
      sentPrimary = await safeSend(sock, targetJid, { image: toMediaInput(result.image), caption: result.caption, mentions: result.mentions }, opts, true)
    }
    if (!sentPrimary && result.caption) {
      await safeSend(sock, targetJid, { text: result.caption, mentions: result.mentions }, opts)
    }
    if (result.audio) {
      await safeSend(sock, targetJid, { audio: toMediaInput(result.audio), mimetype: result.mimetype || 'audio/mpeg', ptt: !!result.ptt }, opts)
    }
    return
  }
  if (result.type === 'poll') {
    const options = Array.isArray(result.options) && result.options.length ? result.options : ['Sí', 'No']
    const multi = result.allowMultiple === true || Number(result.selectableCount) > 1
    let selectableCount = 1
    if (multi) {
      const raw = Number(result.selectableCount)
      selectableCount = Number.isFinite(raw) && raw > 1 ? Math.min(options.length, Math.floor(raw)) : options.length
    }
    const pollPayload = { name: result.title || 'Encuesta', values: options }
    if (selectableCount > 1) pollPayload.selectableCount = selectableCount
    const ok = await safeSend(sock, targetJid, { poll: pollPayload }, opts, true)
    if (!ok) {
      const text = `${pollPayload.name}\n${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}`
      await safeSend(sock, targetJid, { text }, opts)
    }
    return
  }
  if (result.type === 'location') {
    const lat = Number(result.lat ?? result.latitude ?? 0)
    const lon = Number(result.lon ?? result.lng ?? result.longitude ?? 0)
    const payload = {
      location: {
        degreesLatitude: lat,
        degreesLongitude: lon,
        name: result.name || result.caption || 'Ubicación',
        address: result.address,
      },
      mentions: result.mentions,
    }
    const ok = await safeSend(sock, targetJid, payload, opts, true)
    if (!ok) {
      const mapLink = `https://maps.google.com/?q=${lat},${lon}`
      await safeSend(sock, targetJid, { text: `${result.name || 'Ubicación'}\n${mapLink}` }, opts)
    }
    return
  }
  if (result.type === 'liveLocation') {
    const lat = Number(result.lat ?? result.latitude ?? 0)
    const lon = Number(result.lon ?? result.lng ?? result.longitude ?? 0)
    const caption = result.caption || 'Ubicación en vivo'
    const ok = await safeSend(sock, targetJid, { location: { degreesLatitude: lat, degreesLongitude: lon, name: caption }, mentions: result.mentions }, opts, true)
    if (!ok) {
      const mapLink = `https://maps.google.com/?q=${lat},${lon}`
      await safeSend(sock, targetJid, { text: `${caption}\n${mapLink}` }, opts)
    }
    return
  }
  if (result.type === 'contact') {
    const vcard = buildVCard(result.contact)
    if (vcard) {
      await safeSend(sock, targetJid, { contacts: { displayName: result.contact?.name || result.contact?.displayName || 'Contacto', contacts: [{ vcard }] } }, opts)
    } else if (result.contact?.phone) {
      await safeSend(sock, targetJid, { text: `${result.contact.name || 'Contacto'}: +${normalizeDigits(result.contact.phone)}` }, opts)
    }
    return
  }
  // Botones (templateButtons)
  if (result.type === 'buttons' && Array.isArray(result.buttons)) {
    const templateButtons = result.buttons.map((b, i) => {
      const text = b.text || b.title || 'Acción'
      if (b.url) return { index: i + 1, urlButton: { displayText: text, url: b.url } }
      return { index: i + 1, quickReplyButton: { displayText: text, id: b.command || b.id || '/noop' } }
    })
    const payload = { text: result.text || result.caption || ' ', footer: result.footer, templateButtons, mentions: result.mentions }
    // Enviar como templateButtons; si falla, no mostrar error genérico (luego cae a texto)
    if (!(await safeSend(sock, targetJid, payload, opts, true))) {
      const plain = [result.text || result.caption || 'Opciones:']
      for (const b of (result.buttons||[])) {
        const label = b.text || b.title || 'Acción'
        const cmd = b.command || b.id || b.url || ''
        plain.push(`• ${label}${cmd?` → ${cmd}`:''}`)
      }
      await safeSend(sock, targetJid, { text: plain.join('\n') }, opts)
    }
    return
  }
  // Lista interactiva
  if (result.type === 'list' && Array.isArray(result.sections)) {
    const mapSections = (result.sections || []).map((sec) => ({
      title: sec.title || undefined,
      rows: (sec.rows || []).map((r) => ({
        title: r.title || r.text || 'Opción',
        description: r.description || undefined,
        rowId: r.rowId || r.id || r.command || r.url || r.text || 'noop',
      })),
    }))
    const listTop = {
      text: result.text || result.description || '📋 Ayuda por categorías',
      buttonText: result.buttonText || 'Ver opciones',
      sections: mapSections,
      footer: result.footer || undefined,
      title: result.title || undefined,
      mentions: result.mentions,
    }
    // Intento 1: forma top-level (la más compatible en forks actuales)
    let ok = await safeSend(sock, targetJid, listTop, opts, true)
    if (!ok) {
      // Intento 2: anidado en listMessage
      const listNested = {
        listMessage: {
          title: result.title || undefined,
          description: result.text || result.description || undefined,
          buttonText: result.buttonText || 'Ver opciones',
          sections: mapSections,
          footer: result.footer || undefined,
        },
        mentions: result.mentions,
      }
      ok = await safeSend(sock, targetJid, listNested, opts, true)
    }
    if (!ok) {
      // Fallback a texto
      const lines = []
      lines.push(result.text || 'Menú')
      for (const sec of result.sections) {
        lines.push(`\n— ${sec.title || ''}`)
        for (const row of (sec.rows || [])) lines.push(`• ${row.title} -> ${row.id}`)
      }
      await safeSend(sock, targetJid, { text: lines.join('\n') }, opts)
    }
    return
  }
  // Contenido crudo (interactiveMessage / nativeFlow)
  if (result.type === 'content' && result.content && typeof result.content === 'object') {
    const payload = { ...result.content }
    try { if (payload.viewOnceMessage?.message?.interactiveMessage) payload.viewOnceMessage.message.interactiveMessage.contextInfo = { ...(payload.viewOnceMessage.message.interactiveMessage.contextInfo||{}), mentionedJid: result.mentions } } catch {}
    // Si falla Native Flow, degradar a texto con botones simples
    if (!(await safeSend(sock, targetJid, payload, opts, true))) {
      try {
        const body = payload?.viewOnceMessage?.message?.interactiveMessage?.body?.text || 'Opciones'
        const buttons = payload?.viewOnceMessage?.message?.interactiveMessage?.nativeFlowMessage?.buttons || []
        const lines = [body]
        for (const b of buttons) {
          const meta = JSON.parse(b.buttonParamsJson||'{}')
          const label = meta.display_text || 'Acción'
          const id = meta.id || meta.copy_code || meta.url || ''
          lines.push(`• ${label}${id?` → ${id}`:''}`)
        }
        await safeSend(sock, targetJid, { text: lines.join('\n') }, opts)
      } catch {
        await safeSend(sock, targetJid, { text: result.text || '✅ Listo' }, opts)
      }
    }
    return
  }
  // fallback
  await safeSend(sock, targetJid, { text: result.text || '✅ Listo' }, opts)
}

export async function dispatch(ctx = {}) {
  const { sock, remoteJid } = ctx
  if (!sock || !remoteJid) return false
  const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message))
  const parsed = parseCommand(text)
  let command = parsed.command
  const args = parsed.args || []
  // fromMe sin prefijo → habilitable por env
  try {
    const allowNoPrefix = String(process.env.FROMME_ALLOW_NO_PREFIX || 'false').toLowerCase() === 'true'
    if (!command && allowNoPrefix && ctx?.message?.key?.fromMe) {
      const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
      if (parts.length) command = `/${(parts.shift() || '').toLowerCase()}`
    }
  } catch {}
  // Palabras sin prefijo comunes (help/menu) → habilitable por env
  try {
    if (!command) {
      const raw = String(text || '').trim().toLowerCase()
      const list = String(process.env.ALLOW_NO_PREFIX_WORDS || 'help,menu,ayuda,comandos').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
      const first = raw.split(/\s+/)[0] || ''
      if (first && list.includes(first)) {
        // Mapear todas a /help para unificar UI
        command = '/help'
      }
    }
  } catch {}
  if (!command) {
    // Acciones directas: url|https://...
    if (/^url\|/i.test(text)) {
      const url = text.split('|')[1] || ''
      if (url) { await safeSend(sock, remoteJid, { text: url }); return true }
    }
    // No-op
    return false
  }

  let registry = null
  try {
    const mod = await import('./registry/index.js')
    const get = mod?.getCommandRegistry
    registry = typeof get === 'function' ? get() : null
  } catch (e) {
    // IMPORTANTE: Loguear el error de importación para que el usuario pueda diagnosticar
    console.error('⚠️ ERROR CRÍTICO AL CARGAR EL REGISTRO DE COMANDOS. CAUSA DEL MODO DE EMERGENCIA:', e?.message || e)
    console.error('Stack Trace:', e?.stack)
  }
  if (!registry || !registry.has(command)) {
    // Fallback directo para comandos críticos si el registry falla
    const lazy = new Map()
    lazy.set('/debugbot', async (ctx) => (await import('./admin.js')).debugBot(ctx))
    lazy.set('/admins', async (ctx) => (await import('./groups.js')).admins(ctx))
    lazy.set('/debugadmin', async (ctx) => (await import('./groups.js')).debugadmin(ctx))
    lazy.set('/whoami', async (ctx) => (await import('./groups.js')).whoami(ctx))
    lazy.set('/bot', async (ctx) => (await import('./bot-control.js')).bot(ctx))
    lazy.set('/help', async (ctx) => {
      const keys = Array.from(lazy.keys()).sort()
      const text = '📋 Comandos disponibles\n\n' + keys.map(k => `• ${k}`).join('\n')
      return { success: true, message: text, quoted: true }
    })
    if (lazy.has(command)) {
      try {
        const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }
        const out = await lazy.get(command)(params)
        await sendResult(sock, remoteJid, out, ctx)
        return true
      } catch { return false }
    }
    return false
  }

  const entry = registry.get(command)
  const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }
  try {
    const result = await entry.handler(params)
    if (Array.isArray(result)) { for (const r of result) await sendResult(sock, remoteJid, r, ctx) }
    else await sendResult(sock, remoteJid, result, ctx)
    return true
  } catch (e) {
    await safeSend(sock, remoteJid, { text: `⚠️ Error ejecutando ${command}: ${e?.message || e}` })
    return true
  }
}

export default { dispatch }


