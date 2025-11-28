// router.js corregido sin DM fallback (versión simplificada)
// NOTA: Mantengo TODA la funcionalidad del router, excepto el bloque DM fallback.
// Eliminado por completo y reemplazado por targetJid = jid;

import logger from '../config/logger.js'
import antibanMiddleware from '../utils/utils/anti-ban-middleware.js'
import antibanSystem from '../utils/utils/anti-ban.js'
import { getGroupBool } from '../utils/utils/group-config.js'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function normalizeDigits(userOrJid){ try{ let s=String(userOrJid||''); const at=s.indexOf('@'); if(at>0) s=s.slice(0,at); const col=s.indexOf(':'); if(col>0) s=s.slice(0,col); return s.replace(/\D/g,'') }catch{ return onlyDigits(userOrJid) } }
function isAdminFlag(p){ try { return !!(p && ((p.admin==='admin'||p.admin==='superadmin')||p.admin===true||p.isAdmin===true||p.isSuperAdmin===true||(typeof p.privilege==='string'&&/admin/i.test(p.privilege)))) } catch { return false } }
async function isBotAdminInGroup(sock, groupJid){ try{ const meta = await antibanSystem.queryGroupMetadata(sock, groupJid); const bot = normalizeDigits(sock?.user?.id||''); const me = (meta?.participants||[]).find(x=> normalizeDigits(x?.id||x?.jid)===bot ); return isAdminFlag(me) } catch { return false } }

function sleep(ms){ return new Promise(r => setTimeout(r, ms)) }

async function tryImportModuleWithRetries(modulePath, opts = {}) {
  const retries = Number.isFinite(Number(opts.retries)) ? Number(opts.retries) : 3
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 20000
  const backoffMs = Number.isFinite(Number(opts.backoffMs)) ? Number(opts.backoffMs) : 1500

  const start = Date.now()
  let resolvedPath = modulePath

  try {
    if (modulePath.startsWith('.') || modulePath.startsWith('/') || /^[A-Za-z]:\\/.test(modulePath)) {
      const abs = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)
      resolvedPath = pathToFileURL(abs).href
    }
  } catch (e) {}

  for (let attempt = 1; attempt <= retries; attempt++) {
    const attemptStart = Date.now()
    try {
      console.log(`[registry] import attempt ${attempt}/${retries} for ${resolvedPath}`)
      const mod = await Promise.race([
        import(resolvedPath),
        new Promise((_, rej) => setTimeout(() => rej(new Error('import timeout')), timeoutMs))
      ])
      console.log(`[registry] import ok (${attempt}/${retries})`)
      return mod
    } catch (err) {
      console.error(`[registry] import failed attempt ${attempt}/${retries} for ${resolvedPath}:`, err?.message||err)
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
        continue
      }
      throw err
    }
  }
}

// -----------------------------------------------------------------------------
// extractText – (sin cambios)
// -----------------------------------------------------------------------------
function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return ''
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption || ''
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
      return ''
    }
    const m = message?.message || {}
    let out = pick(m)
    if (out) return out
    const inner = m.viewOnceMessage?.message || m.ephemeralMessage?.message || null
    if (inner) {
      out = pick(inner); if (out) return out
      const inner2 = inner.viewOnceMessage?.message || inner.ephemeralMessage?.message || null
      if (inner2) return pick(inner2)
    }
    return ''
  } catch { return '' }
}

// -----------------------------------------------------------------------------
// parseCommand – (sin cambios)
// -----------------------------------------------------------------------------
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
  return { command: '', args: [] }
}

function traceEnabled(){ try{ return String(process.env.TRACE_ROUTER||'false').toLowerCase()==='true' }catch{ return false } }
function summarizePayload(p){ try{ if(!p||typeof p!=='object') return typeof p; return Object.keys(p).slice(0,5).join(',') }catch{ return 'payload' } }

async function safeSend(sock, jid, payload, opts={}, silentOnFail=false){ try{ await sock.sendMessage(jid,payload,opts); return true }catch{} try{ const o={...(opts||{})}; if(o.quoted) delete o.quoted; await sock.sendMessage(jid,payload,o); return true }catch{} if(!silentOnFail){ try{ await sock.sendMessage(jid,{text:'⚠️ No pude enviar respuesta.'}) }catch{} } return false }

function toMediaInput(value){ if(!value) return null; if(Buffer.isBuffer(value)) return value; if(typeof value==='string'){ if(value.startsWith('data:')){ try{ return Buffer.from(value.split(',')[1]||'', 'base64') }catch{} } return {url:value} } return value }
function buildSendOptions(result){ try{ if(!result||typeof result!=='object') return undefined; const opts={}; if(result.quoted) opts.quoted=result.quoted; return Object.keys(opts).length?opts:undefined }catch{ return undefined } }

// -----------------------------------------------------------------------------
// sendResult – AQUI SE CORRIGE: NO DM FALLBACK, SIEMPRE RESPONDE AL GRUPO
// -----------------------------------------------------------------------------
async function sendResult(sock, jid, result, ctx) {
  let targetJid = jid; // <<< SIEMPRE RESPONDE AL MISMO LUGAR >>>

  if (!result) {
    await safeSend(sock, targetJid, { text: '✅' })
    return
  }

  const opts = buildSendOptions(result)

  if (typeof result === 'string') {
    await safeSend(sock, targetJid, { text: result }, opts)
    return
  }

  if (result.message) {
    await safeSend(sock, targetJid, { text: result.message, mentions: result.mentions }, opts)
    return
  }

  if (result.type === 'reaction' && result.emoji) {
    try { await sock.sendMessage(targetJid, { react:{text:result.emoji, key:ctx?.message?.key} }) } catch {}
    return
  }

  if (result.type === 'image' && result.image) {
    await safeSend(sock, targetJid, { image: toMediaInput(result.image), caption: result.caption }, opts)
    return
  }

  await safeSend(sock, targetJid, { text: result.text || 'Listo' }, opts)
}

// -----------------------------------------------------------------------------
// dispatch – sin modificaciones críticas
// -----------------------------------------------------------------------------
export async function dispatch(ctx={}) {
  const { sock, remoteJid, isGroup } = ctx
  if(!sock||!remoteJid) return false

  if (isGroup) {
    const botEnabled = await getGroupBool(remoteJid, 'bot_enabled', true)
    if (!botEnabled) return false
  }

  const text = ctx.text != null ? String(ctx.text) : extractText(ctx.message)
  const parsed = parseCommand(text)
  let command = parsed.command
  const args = parsed.args || []

  if (!command) return false

  let registry = null
  try {
    if (global.__COMMAND_REGISTRY) registry = global.__COMMAND_REGISTRY.registry
    else {
      const registryModulePath = path.resolve(__dirname, './registry/index.js')
      const mod = await tryImportModuleWithRetries(registryModulePath)
      registry = mod?.getCommandRegistry?.() || null
      global.__COMMAND_REGISTRY = { registry, timestamp: Date.now() }
    }
  } catch {}

  if (!registry || !registry.has(command)) return false
  const entry = registry.get(command)

  const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }

  try {
    const result = await antibanMiddleware.wrapCommand(() => entry.handler(params), command)
    if (Array.isArray(result)) {
      for (const r of result) await sendResult(sock, remoteJid, r, ctx)
    } else {
      await sendResult(sock, remoteJid, result, ctx)
    }
    return true
  } catch (e) {
    await safeSend(sock, remoteJid, { text:`Error ejecutando ${command}: ${e?.message}` })
    return true
  }
}

export default { dispatch }
