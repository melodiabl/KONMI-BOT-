// commands/router.js
// Router simplificado y estable: parsea comandos, invoca registry y entrega respuestas con safeSend

import logger from '../config/logger.js'
import antibanMiddleware from '../utils/utils/anti-ban-middleware.js'
import antibanSystem from '../utils/utils/anti-ban.js'
import { getGroupBool } from '../utils/utils/group-config.js'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

/* ========================
   Compatibilidad ESM: __dirname
   ======================== */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ========================
   Helpers: utils reintento
   ======================== */

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function normalizeDigits(userOrJid){
  try{ let s=String(userOrJid||''); const at=s.indexOf('@'); if(at>0) s=s.slice(0,at); const col=s.indexOf(':'); if(col>0) s=s.slice(0,col); return s.replace(/\D/g,'') }catch{ return onlyDigits(userOrJid) }
}

// Verifica si un participante tiene flag de admin
function isAdminFlag(p){ try { return !!(p && ((p.admin==='admin'||p.admin==='superadmin')||p.admin===true||p.isAdmin===true||p.isSuperAdmin===true||(typeof p.privilege==='string'&&/admin/i.test(p.privilege)))) } catch { return false } }

async function isBotAdminInGroup(sock, groupJid){
  try{ const meta = await antibanSystem.queryGroupMetadata(sock, groupJid); const bot = normalizeDigits(sock?.user?.id||''); const me = (meta?.participants||[]).find(x=> normalizeDigits(x?.id||x?.jid)===bot ); return isAdminFlag(me) } catch { return false }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)) }

async function tryImportModuleWithRetries(modulePath, opts = {}) {
  const retries = Number.isFinite(Number(opts.retries)) ? Number(opts.retries) : 3
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 20000
  const backoffMs = Number.isFinite(Number(opts.backoffMs)) ? Number(opts.backoffMs) : 1500

  const start = Date.now()
  let resolvedPath = modulePath

  // Resolve to absolute file URL when looks like path
  try {
    if (modulePath.startsWith('.') || modulePath.startsWith('/') || /^[A-Za-z]:\\/.test(modulePath)) {
      const abs = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)
      resolvedPath = pathToFileURL(abs).href
    }
  } catch (e) {
    // keep modulePath as-is
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      console.log(`[registry] import attempt ${attempt}/${retries} for ${resolvedPath} (timeout ${timeoutMs}ms)`)
      const mod = await Promise.race([
        import(resolvedPath),
        new Promise((_, rej) => setTimeout(() => rej(new Error('import timeout')), timeoutMs))
      ])
      console.log(`[registry] import ok (${attempt}/${retries}) path=${resolvedPath} took=${Date.now()-attemptStart}ms total=${Date.now()-start}ms`)
      return mod
    } catch (err) {
      console.error(`[registry] import failed attempt ${attempt}/${retries} for ${resolvedPath}:`, err && (err.message || err))
      // log file size if possible
      try {
        if (resolvedPath.startsWith('file://')) {
          const filePath = new URL(resolvedPath).pathname
          if (fs.existsSync(filePath)) {
            const st = fs.statSync(filePath)
            console.log(`[registry] file size: ${st.size} bytes (${filePath})`)
          }
        } else {
          // try raw modulePath as path
          if (fs.existsSync(modulePath)) {
            const st = fs.statSync(modulePath)
            console.log(`[registry] file size: ${st.size} bytes (${modulePath})`)
          }
        }
      } catch (e) {}
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
        continue
      }
      // all attempts failed
      throw err
    }
  }
}

/* ========================
   Resto del router (original)
   ======================== */

function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return ''

      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        ''
      )
      if (base) return String(base).trim()
      const btnId = obj.buttonsResponseMessage?.selectedButtonId
        || obj.templateButtonReplyMessage?.selectedId
        || obj.buttonReplyMessage?.selectedButtonId
      if (btnId) return String(btnId).trim()
      const rowId = obj.listResponseMessage?.singleSelectReply?.selectedRowId
        || obj.listResponseMessage?.singleSelectReply?.selectedId
        || obj.interactiveResponseMessage?.listResponseMessage?.singleSelectReply?.selectedRowId
      if (rowId) return String(rowId).trim()

      // Handle interactiveResponseMessage
      if (obj.interactiveResponseMessage) {
        const intRes = obj.interactiveResponseMessage
        if (intRes?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intRes.nativeFlowResponseMessage.paramsJson)
            const id = params?.id || params?.command || params?.rowId || params?.row_id
            if (id && typeof id === 'string') return String(id).trim()
          } catch {}
        }
        if (intRes?.listResponseMessage?.singleSelectReply?.selectedRowId) {
          const rowId = intRes.listResponseMessage.singleSelectReply.selectedRowId
          if (rowId && typeof rowId === 'string') return String(rowId).trim()
        }
      }

      // Handle interactiveMessage
      if (obj.interactiveMessage) {
        const interMsg = obj.interactiveMessage
        const selectedRowId = interMsg?.replyMessage?.selectedRowId
          || interMsg?.selectedRowId
          || interMsg?.body?.selectedDisplayText
          || interMsg?.nativeFlowResponseMessage?.selectedRowId

        if (selectedRowId && typeof selectedRowId === 'string') return String(selectedRowId).trim()

        const displayText = interMsg?.replyMessage?.selectedDisplayText
          || interMsg?.body?.selectedDisplayText
        if (displayText && typeof displayText === 'string') return String(displayText).trim()

        const nativeFlowMsg = obj.interactiveMessage?.nativeFlowMessage
        if (nativeFlowMsg && Array.isArray(nativeFlowMsg.buttons)) {
          for (const btn of nativeFlowMsg.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson)
                if (params?.selectedButtonId || params?.response) {
                  const id = params.selectedButtonId || params.response?.selectedRowId
                  if (id) return String(id).trim()
                }
              } catch {}
            }
          }
        }

        const paramsJson = obj.interactiveMessage?.nativeFlowResponseMessage?.paramsJson
        if (paramsJson && typeof paramsJson === 'string') {
          try {
            const params = JSON.parse(paramsJson)
            const id = params?.id || params?.command || params?.rowId || params?.row_id
            if (id) return String(id).trim()
          } catch {}
        }
      }

      return ''
    }
    const m = message?.message || {}
    let out = pick(m)
    if (out) return out
    const inner = m.viewOnceMessage?.message || m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message || null
    if (inner) {
      out = pick(inner)
      if (out) return out
      const inner2 = inner.viewOnceMessage?.message || inner.ephemeralMessage?.message || null
      if (inner2) {
        out = pick(inner2)
        if (out) return out
      }
    }
    return ''
  } catch (e) {
    console.error('[extractText] error:', e?.message)
    return ''
  }
}

function parseCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return { command: '', args: [] }
  const prefixes = Array.from(new Set(((process.env.CMD_PREFIXES || '/!.#?$~').split('')).concat(['/','!','.'])))
  const s = raw.replace(/^\s+/, '')

  if (s.startsWith('/')) {
    const parts = s.slice(1).trim().split(/\s+/)
    return { command: `/${(parts.shift() || '').toLowerCase()}`, args: parts }
  }

  if (prefixes.includes(s[0])) {
    const parts = s.slice(1).trim().split(/\s+/)
    const token = (parts.shift() || '').toLowerCase().replace(/^[\/.!#?$~]+/, '')
    return { command: `/${token}`, args: parts }
  }

  if (s.includes('/') || s.startsWith('btn_') || s.startsWith('copy_') || s.startsWith('todo_')) {
    if (s.startsWith('btn_')) return { command: '', args: [] }
    if (s.startsWith('copy_')) return { command: '/handlecopy', args: [s] }
    if (s.startsWith('todo_')) {
      const parts = s.split('_')
      if (parts.length >= 3) {
        const action = parts[1]
        const listId = parts.slice(2).join('_')
        return { command: `/todo-${action}`, args: [listId] }
      }
    }
    return { command: s.toLowerCase(), args: [] }
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
    // try { await sock.sendMessage(jid, { text: '⚠️ No pude enviar respuesta. Usa /help' }); } catch {}
  }
  return false
}

function toMediaInput(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') {
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
  console.log(`[DEBUG] sendResult called with result:`, result ? 'present' : 'null', 'type:', result?.type || 'text')
  if (!result) {
    console.log(`[DEBUG] No result provided, sending fallback...`)
    await safeSend(sock, jid, { text: '✅' }, undefined)
    return
  }
  const opts = buildSendOptions(result)
  const targetJid = jid

  if (typeof result === 'string') { await safeSend(sock, targetJid, { text: result }, opts); return }
  if (result.message) { await safeSend(sock, targetJid, { text: result.message, mentions: result.mentions }, opts); return }

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
  if (result.type === 'buttons' && Array.isArray(result.buttons)) {
    const buttonList = result.buttons;

    const interactiveButtons = buttonList.map((b) => {
      const text = b.text || b.title || b.displayText || 'Acción';
      const id = b.command || b.id || b.url || b.buttonId || 'noop';
      if (b.url) {
        return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: text, url: b.url }) };
      }
      return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: text, id: id }) };
    });

    const interactivePayload = {
      text: result.text || result.caption || 'Opciones',
      title: result.header || result.title,
      footer: result.footer,
      interactiveButtons,
      mentions: result.mentions
    };
    if (await safeSend(sock, targetJid, interactivePayload, opts, true)) return;

    const templateButtons = buttonList.map((b, i) => {
      const text = b.text || b.title || b.displayText || 'Acción';
      if (b.url) return { index: i + 1, urlButton: { displayText: text, url: b.url } };
      return { index: i + 1, quickReplyButton: { displayText: text, id: b.command || b.id || b.buttonId || '/noop' } };
    });
    const legacyPayload = { text: result.text || result.caption || ' ', footer: result.footer, templateButtons, mentions: result.mentions };
    if (await safeSend(sock, targetJid, legacyPayload, opts, true)) return;

    const plain = [result.text || result.caption || 'Opciones:'];
    for (const b of buttonList) {
      const label = b.text || b.title || b.displayText || 'Acción';
      const cmd = b.command || b.id || b.url || b.buttonId || '';
      plain.push(`• ${label}${cmd ? ` → ${cmd}` : ''}`);
    }
    await safeSend(sock, targetJid, { text: plain.join('\n') }, opts);
    return;
  }
  if (result.type === 'list' && Array.isArray(result.sections)) {
    const mapSections = (result.sections || []).map((sec) => ({
      title: sec.title || undefined,
      rows: (sec.rows || []).map((r) => ({
        title: r.title || r.text || 'Opción',
        description: r.description || undefined,
        rowId: r.rowId || r.id || r.command || r.url || r.text || 'noop',
      })),
    }))

    const listPayload = {
      text: result.text || result.description || '📋 Menú disponible',
      buttonText: result.buttonText || 'Ver opciones',
      sections: mapSections,
      title: result.title || '📋 Menú',
      footer: result.footer,
    }

    if (await safeSend(sock, targetJid, listPayload, opts)) {
      return
    }

    const lines = []
    lines.push(result.text || 'Menú')
    for (const sec of result.sections) {
      lines.push(`\n— ${sec.title || ''}`)
      for (const row of (sec.rows || [])) lines.push(`• ${row.title} -> ${row.rowId}`)
    }
    await safeSend(sock, targetJid, { text: lines.join('\n') }, opts)
    return
  }
  if (result.type === 'content' && result.content && typeof result.content === 'object') {
    const payload = { ...result.content }
    try { if (payload.viewOnceMessage?.message?.interactiveMessage) payload.viewOnceMessage.message.interactiveMessage.contextInfo = { ...(payload.viewOnceMessage.message.interactiveMessage.contextInfo||{}), mentionedJid: result.mentions } } catch {}
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
  await safeSend(sock, targetJid, { text: result.text || '✅ Listo' }, opts)
}

export async function dispatch(ctx = {}) {
  const { sock, remoteJid, isGroup } = ctx
  if (!sock || !remoteJid) return false

  // ============================================================
  // LÓGICA FROM-ME / OWNER / SENDER
  // ============================================================
  const isFromMe = ctx.message?.key?.fromMe || false

  // Calcular el Sender ID real
  let senderId = ''
  if (isFromMe) {
    // Si viene de mí, el sender soy yo (sock.user.id)
    senderId = normalizeDigits(sock.user?.id || '')
    // Si viene de mí, soy Owner automáticamente
    ctx.isOwner = true
  } else {
    // Si viene de otro, usamos el sender normal
    senderId = normalizeDigits(ctx.sender || ctx.senderNumber || ctx.message?.key?.participant || '')
  }

  // Actualizar el contexto con el senderId correcto
  ctx.sender = `${senderId}@s.whatsapp.net`
  ctx.senderNumber = senderId
  ctx.usuario = `${senderId}@s.whatsapp.net` // Unificar usuario también

  // ============================================================

  if (isGroup) {
    const botEnabled = await getGroupBool(remoteJid, 'bot_enabled', true)
    if (!botEnabled) {
      return false
    }
  }

  const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message))

  const parsed = parseCommand(text)
  let command = parsed.command
  const args = parsed.args || []

  if (traceEnabled()) {
    const isGrp = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
    console.log(`[router] Comando: ${command || '(ninguno)'} | Grupo: ${isGrp} | User: ${senderId} | Owner: ${ctx.isOwner}`)
  }

  if (!command) {
    try {
      const msg = ctx.message?.message || {}
      const isListSelection =
        !!msg.listResponseMessage ||
        !!msg.buttonsResponseMessage ||
        !!msg.templateButtonReplyMessage ||
        !!msg.interactiveResponseMessage ||
        !!msg.interactiveMessage

      if (isListSelection) {
        const raw = String(text || '').trim()
        const first = raw.split(/\s+/)[0] || ''
        if (first) {
          command = first.startsWith('/') ? first.toLowerCase() : `/${first.toLowerCase()}`
        }
      }
    } catch {}
  }

  // FromMe: Permitir comandos sin prefijo si se desea,
  // pero ya manejamos fromMe al inicio, así que aquí solo es lógica extra.
  try {
    const allowNoPrefix = String(process.env.FROMME_ALLOW_NO_PREFIX || 'true').toLowerCase() === 'true'
    if (!command && allowNoPrefix && isFromMe) {
      const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
      if (parts.length) command = `/${(parts.shift() || '').toLowerCase()}`
    }
  } catch {}

  // Palabras clave sin prefijo (help, menu)
  try {
    if (!command && !isFromMe) { // Evitamos que el bot responda a su propio texto "menu" si no es comando explicito
      const raw = String(text || '').trim().toLowerCase()
      const list = String(process.env.ALLOW_NO_PREFIX_WORDS || 'help,menu,ayuda,comandos').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean)
      const first = raw.split(/\s+/)[0] || ''
      if (first && list.includes(first)) {
        command = '/help'
      }
    }
  } catch {}

  if (!command) {
    if (/^url\|/i.test(text)) {
      const url = text.split('|')[1] || ''
      if (url) { await safeSend(sock, remoteJid, { text: url }); return true }
    }
    return false
  }

  console.log(`[DEBUG] Command found: ${command}, checking registry...`)

  let registry = null
  try {
    if (global.__COMMAND_REGISTRY && global.__COMMAND_REGISTRY.timestamp) {
      registry = global.__COMMAND_REGISTRY.registry || null
    } else {
      try {
        const registryModulePath = path.resolve(__dirname, './registry/index.js')
        console.log('[registry] attempting to preload registry module:', registryModulePath)
        const mod = await tryImportModuleWithRetries(registryModulePath, { retries: 4, timeoutMs: 20000, backoffMs: 1500 })
        const get = mod?.getCommandRegistry
        registry = typeof get === 'function' ? get() : null
        global.__COMMAND_REGISTRY = { registry, loadedFrom: registryModulePath, timestamp: Date.now() }
        if (registry) console.log('[registry] precargado OK')
        else console.warn('[registry] módulo cargado pero no devolvió registry (getCommandRegistry missing)')
      } catch (impErr) {
        console.error('⚠️ ERROR CRÍTICO AL CARGAR EL REGISTRO DE COMANDOS:', impErr?.message || impErr)
      }
    }
  } catch (e) {
    console.error('[registry] unexpected error while loading registry:', e && (e.message || e))
  }
  console.log(`[DEBUG] Registry loaded: ${!!registry}, has command: ${registry?.has(command)}`)

  if (!registry || !registry.has(command)) {
    console.log(`[DEBUG] Command ${command} not found in registry, checking lazy fallbacks...`)
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
      console.log(`[DEBUG] Using lazy fallback for ${command}`)
      try {
        const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }
        const out = await antibanMiddleware.wrapCommand(
          () => lazy.get(command)(params),
          command
        )
        console.log(`[DEBUG] Lazy command executed, result:`, out)
        await sendResult(sock, remoteJid, out, ctx)
        return true
      } catch (e) {
        console.log(`[DEBUG] Lazy command failed:`, e?.message || e)
        return false
      }
    }
    console.log(`[DEBUG] No handler found for command ${command}`)
    return false
  }

  const entry = registry.get(command)
  console.log(`[DEBUG] Found registry entry for ${command}:`, !!entry)

  // ============================================================
  // Verificación de Admin usando senderId corregido
  // ============================================================
  if (isGroup && (entry.adminOnly || entry.isAdmin || entry.admin)) {
    try {
      const groupMeta = await antibanSystem.queryGroupMetadata(sock, remoteJid)
      const participants = groupMeta?.participants || []

      // Buscar participante usando el senderId calculado arriba (que ya maneja fromMe)
      const participant = participants.find(p => normalizeDigits(p.id) === senderId)

      if (!isAdminFlag(participant)) {
        console.log(`[router] Bloqueado comando ${command} por falta de privilegios admin. User: ${senderId}`)
        await safeSend(sock, remoteJid, { text: '⚠️ *Acceso denegado:* Este comando es solo para administradores.' }, { quoted: ctx.message })
        return true
      }
    } catch (errCheck) {
      console.error('[router] Error verificando admins:', errCheck)
    }
  }

  const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }
  try {
    console.log(`[DEBUG] Executing registry command ${command}...`)
    const result = await antibanMiddleware.wrapCommand(
      () => entry.handler(params),
      command
    )
    console.log(`[DEBUG] Registry command executed, result type:`, typeof result, 'keys:', result ? Object.keys(result) : 'null')

    const isSuccess = result?.success !== false && !result?.error;
    const reactionEmoji = isSuccess ? '✅' : '❌';

    try {
      await sock.sendMessage(remoteJid, {
        react: { text: reactionEmoji, key: ctx.message.key }
      });
    } catch (reactionError) {
      // Ignore reaction errors
    }

    console.log(`[DEBUG] Sending result to ${remoteJid}...`)
    if (Array.isArray(result)) { for (const r of result) await sendResult(sock, remoteJid, r, ctx) }
    else await sendResult(sock, remoteJid, result, ctx)
    console.log(`[DEBUG] Result sent successfully`)

    if (isSuccess && (result?.type === 'video' || result?.type === 'image' || result?.type === 'audio' || result?.type === 'sticker')) {
      try {
        await sock.sendMessage(remoteJid, {
          react: { text: '📤', key: ctx.message.key }
        });
      } catch (deliveryError) {
        // Ignore delivery reaction errors
      }
    }

    return true
  } catch (e) {
    console.log(`[DEBUG] Registry command failed:`, e?.message || e)
    try {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: ctx.message.key }
      });
    } catch (reactionError) {
      // Ignore reaction errors
    }

    await safeSend(sock, remoteJid, { text: `⚠️ Error ejecutando ${command}: ${e?.message || e}` })
    return true
  }
}

export default { dispatch }
