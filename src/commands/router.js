// commands/router.js - VERSIÓN CORREGIDA
// ✅ Botones interactivos funcionando en grupos y privados
// ✅ Normalización de JIDs robusta
// ✅ Detección correcta de admins

import logger from '../config/logger.js'
import antibanMiddleware from '../utils/utils/anti-ban-middleware.js'
import antibanSystem from '../utils/utils/anti-ban.js'
import { getGroupBool } from '../utils/utils/group-config.js'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ========================
   NORMALIZACIÓN DE JIDs ROBUSTA
   ======================== */
function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

function normalizeDigits(userOrJid) {
  try {
    let s = String(userOrJid || '')
    // Remover todo después de @ o :
    const at = s.indexOf('@')
    if (at > 0) s = s.slice(0, at)
    const col = s.indexOf(':')
    if (col > 0) s = s.slice(0, col)
    return s.replace(/\D/g, '')
  } catch {
    return onlyDigits(userOrJid)
  }
}

function normalizeJidForDisplay(jid) {
  const digits = normalizeDigits(jid)
  return digits ? `+${digits}` : ''
}

/* ========================
   DETECCIÓN DE ADMINISTRADORES
   ======================== */
function isAdminFlag(p) {
  try {
    if (!p) return false
    // Soportar múltiples formatos de Baileys
    return !!(
      p.admin === 'admin' ||
      p.admin === 'superadmin' ||
      p.admin === true ||
      p.isAdmin === true ||
      p.isSuperAdmin === true ||
      (typeof p.role === 'string' && /admin/i.test(p.role)) ||
      (typeof p.privilege === 'string' && /admin/i.test(p.privilege))
    )
  } catch {
    return false
  }
}

async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await antibanSystem.queryGroupMetadata(sock, groupJid)
    const bot = normalizeDigits(sock?.user?.id || '')
    const me = (meta?.participants || []).find(x =>
      normalizeDigits(x?.id || x?.jid) === bot
    )
    return isAdminFlag(me)
  } catch {
    return false
  }
}

/* ========================
   EXTRACCIÓN DE TEXTO MEJORADA
   ======================== */
function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return ''

      // Texto plano
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        ''
      )
      if (base) return String(base).trim()

      // Botones legacy
      const btnId = obj.buttonsResponseMessage?.selectedButtonId ||
                    obj.templateButtonReplyMessage?.selectedId ||
                    obj.buttonReplyMessage?.selectedButtonId
      if (btnId) return String(btnId).trim()

      // Listas legacy
      const rowId = obj.listResponseMessage?.singleSelectReply?.selectedRowId ||
                    obj.listResponseMessage?.singleSelectReply?.selectedId
      if (rowId) return String(rowId).trim()

      // Interactivos modernos
      if (obj.interactiveResponseMessage) {
        const intRes = obj.interactiveResponseMessage

        // Native Flow (botones modernos)
        if (intRes?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intRes.nativeFlowResponseMessage.paramsJson)
            const id = params?.id || params?.command || params?.rowId || params?.row_id
            if (id && typeof id === 'string') return String(id).trim()
          } catch {}
        }

        // Lista moderna
        if (intRes?.listResponseMessage?.singleSelectReply?.selectedRowId) {
          return String(intRes.listResponseMessage.singleSelectReply.selectedRowId).trim()
        }
      }

      // Interactive Message (nuevo formato)
      if (obj.interactiveMessage) {
        const interMsg = obj.interactiveMessage

        const selectedRowId = interMsg?.replyMessage?.selectedRowId ||
                              interMsg?.selectedRowId ||
                              interMsg?.body?.selectedDisplayText
        if (selectedRowId && typeof selectedRowId === 'string') {
          return String(selectedRowId).trim()
        }

        // Native flow buttons
        if (interMsg?.nativeFlowMessage?.buttons) {
          for (const btn of interMsg.nativeFlowMessage.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson)
                const id = params?.selectedButtonId || params?.response?.selectedRowId
                if (id) return String(id).trim()
              } catch {}
            }
          }
        }

        // Params JSON
        if (interMsg?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(interMsg.nativeFlowResponseMessage.paramsJson)
            const id = params?.id || params?.command || params?.rowId
            if (id) return String(id).trim()
          } catch {}
        }
      }

      return ''
    }

    const m = message?.message || {}
    let out = pick(m)
    if (out) return out

    // Mensajes anidados
    const inner = m.viewOnceMessage?.message ||
                  m.ephemeralMessage?.message ||
                  m.documentWithCaptionMessage?.message
    if (inner) {
      out = pick(inner)
      if (out) return out

      const inner2 = inner.viewOnceMessage?.message || inner.ephemeralMessage?.message
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

/* ========================
   PARSEO DE COMANDOS
   ======================== */
function parseCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return { command: '', args: [] }

  const prefixes = Array.from(new Set(
    ((process.env.CMD_PREFIXES || '/!.#?$~').split('')).concat(['/', '!', '.'])
  ))
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

  // Comandos especiales
  if (s.startsWith('copy_')) return { command: '/handlecopy', args: [s] }
  if (s.startsWith('todo_')) {
    const parts = s.split('_')
    if (parts.length >= 3) {
      return { command: `/todo-${parts[1]}`, args: [parts.slice(2).join('_')] }
    }
  }

  return { command: '', args: [] }
}

/* ========================
   ENVÍO SEGURO CON FALLBACK
   ======================== */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function safeSend(sock, jid, payload, opts = {}, silentOnFail = false) {
  let lastError = null

  // Intento 1: Envío normal
  try {
    await sock.sendMessage(jid, payload, opts)
    return true
  } catch (err) {
    lastError = err
  }

  // Intento 2: Sin quoted
  try {
    const o = { ...opts }
    delete o.quoted
    await sock.sendMessage(jid, payload, o)
    return true
  } catch (err) {
    lastError = err
  }

  // Intento 3: Fallback a texto plano
  if (!silentOnFail && (payload.viewOnceMessage || payload.interactiveMessage ||
      payload.buttonsMessage || payload.listMessage)) {
    try {
      const fallbackText = extractFallbackText(payload)
      await sock.sendMessage(jid, { text: fallbackText }, opts)
      return true
    } catch {}
  }

  console.error('[safeSend] Todos los intentos fallaron:', lastError?.message)
  return false
}

function extractFallbackText(payload) {
  try {
    if (payload.buttonsMessage) {
      return payload.buttonsMessage.contentText || 'Opciones no disponibles'
    }
    if (payload.listMessage) {
      return payload.listMessage.description || 'Menú no disponible'
    }
    if (payload.interactiveMessage) {
      return payload.interactiveMessage.body?.text || 'Contenido interactivo no compatible'
    }
    return '⚠️ Tu versión de WhatsApp no soporta este formato'
  } catch {
    return '⚠️ Error mostrando contenido'
  }
}

/* ========================
   CONSTRUCCIÓN DE MENSAJES INTERACTIVOS
   ======================== */
function createInteractiveMessage(data, isGroup = true) {
  const { body, footer, title, buttons, sections, mentions } = data

  // Listas
  if (sections && sections.length > 0) {
    const listMessage = {
      title: title || 'Menú',
      description: body || 'Selecciona una opción',
      buttonText: data.buttonText || 'Ver opciones',
      sections: sections.map(s => ({
        title: s.title || 'Sección',
        rows: (s.rows || []).map(r => ({
          title: r.title || r.text || 'Opción',
          description: r.description || '',
          rowId: r.rowId || r.id || r.command || 'noop'
        }))
      }))
    }
    if (footer) listMessage.footerText = footer
    if (mentions?.length) listMessage.contextInfo = { mentionedJid: mentions }
    return { listMessage }
  }

  // Botones
  if (buttons && buttons.length > 0) {
    const buttonsMessage = {
      contentText: body || 'Opciones',
      footerText: footer || '',
      buttons: buttons.map(btn => ({
        buttonId: btn.id || btn.command || '',
        buttonText: { displayText: btn.text || btn.displayText || 'Acción' },
        type: 1
      })),
      headerType: title ? 1 : undefined,
      ...(title && { headerText: title })
    }
    if (mentions?.length) buttonsMessage.contextInfo = { mentionedJid: mentions }
    return { buttonsMessage }
  }

  // Fallback texto
  return { text: body || 'Opciones' }
}

/* ========================
   CONVERSIÓN DE MEDIA
   ======================== */
function toMediaInput(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value

  if (typeof value === 'string') {
    // Data URI
    if (value.startsWith('data:')) {
      try {
        const b = value.split(',')[1] || ''
        return Buffer.from(b, 'base64')
      } catch {
        return null
      }
    }
    // Base64 directo
    if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 80)) && value.length > 100) {
      try {
        return Buffer.from(value, 'base64')
      } catch {}
    }
    // URL
    return { url: value }
  }

  if (typeof value === 'object' && value.url) return { url: value.url }
  return value
}

/* ========================
   ENVÍO DE RESULTADOS
   ======================== */
function buildSendOptions(result) {
  try {
    if (!result || typeof result !== 'object') return undefined
    const opts = {}
    if (result.quoted?.key) opts.quoted = result.quoted

    const ttl = Number(result.ephemeralDuration)
    if (Number.isFinite(ttl) && ttl > 0) {
      opts.ephemeralExpiration = Math.floor(ttl)
    }
    if (result.linkPreview === false) opts.linkPreview = false

    return Object.keys(opts).length ? opts : undefined
  } catch {
    return undefined
  }
}

async function sendResult(sock, jid, result, ctx) {
  if (!result) {
    await safeSend(sock, jid, { text: '✅' })
    return
  }

  const opts = buildSendOptions(result)

  // Tipo string directo
  if (typeof result === 'string') {
    await safeSend(sock, jid, { text: result }, opts)
    return
  }

  // Mensaje simple
  if (result.message) {
    await safeSend(sock, jid, {
      text: result.message,
      mentions: result.mentions
    }, opts)
    return
  }

  // Reacciones
  if (result.type === 'reaction' && result.emoji) {
    const key = result.key || ctx?.message?.key
    if (key) {
      try {
        await sock.sendMessage(jid, { react: { text: result.emoji, key } })
      } catch {}
    }
    return
  }

  // Presencia
  if (result.type === 'presence') {
    try {
      await sock.sendPresenceUpdate(result.state || 'composing', jid)
    } catch {}
    return
  }

  // Media types
  if (result.type === 'image' && result.image) {
    await safeSend(sock, jid, {
      image: toMediaInput(result.image),
      caption: result.caption,
      mentions: result.mentions
    }, opts)
    return
  }

  if (result.type === 'video' && result.video) {
    await safeSend(sock, jid, {
      video: toMediaInput(result.video),
      caption: result.caption,
      mentions: result.mentions,
      gifPlayback: result.gifPlayback
    }, opts)
    return
  }

  if (result.type === 'audio' && result.audio) {
    await safeSend(sock, jid, {
      audio: toMediaInput(result.audio),
      mimetype: result.mimetype || 'audio/mpeg',
      ptt: !!result.ptt
    }, opts)
    return
  }

  // ✅ STICKER CORREGIDO CON VALIDACIÓN ESTRICTA
  if (result.type === 'sticker' && result.sticker) {
    try {
      // Asegurar que es un Buffer válido
      let stickerBuffer = result.sticker

      if (!Buffer.isBuffer(stickerBuffer)) {
        console.error('[sendResult] Sticker no es un Buffer, tipo:', typeof stickerBuffer)
        throw new Error('El sticker debe ser un Buffer')
      }

      // Validar que el buffer no esté vacío
      if (stickerBuffer.length === 0) {
        throw new Error('El buffer del sticker está vacío')
      }

      // Validar tamaño mínimo (un webp válido tiene al menos 100 bytes)
      if (stickerBuffer.length < 100) {
        throw new Error('El buffer del sticker es demasiado pequeño')
      }

      console.log('[sendResult] Enviando sticker, size:', stickerBuffer.length, 'bytes')

      // Intentar envío directo
      await sock.sendMessage(jid, { sticker: stickerBuffer }, opts)
      console.log('[sendResult] ✅ Sticker enviado exitosamente')
      return

    } catch (error) {
      console.error('[sendResult] ❌ Error enviando sticker:', error?.message)
      await safeSend(sock, jid, {
        text: `⚠️ Error enviando sticker: ${error.message}\n\nPor favor, intenta con otra imagen/video.`
      })
    }
    return
  }

  // Botones
  if (result.type === 'buttons' && result.buttons) {
    const payload = createInteractiveMessage({
      body: result.text || result.caption || 'Opciones',
      footer: result.footer,
      title: result.header || result.title,
      buttons: result.buttons,
      mentions: result.mentions
    }, ctx.isGroup)

    if (await safeSend(sock, jid, payload, opts, true)) return

    // Fallback texto
    const lines = [result.text || 'Opciones:']
    for (const b of result.buttons) {
      const label = b.text || b.displayText || 'Acción'
      const cmd = b.command || b.id || ''
      lines.push(`• ${label}${cmd ? ` → ${cmd}` : ''}`)
    }
    await safeSend(sock, jid, { text: lines.join('\n') }, opts)
    return
  }

  // Listas
  if (result.type === 'list' && result.sections) {
    const payload = createInteractiveMessage({
      body: result.text || result.description || 'Menú',
      footer: result.footer,
      title: result.title,
      buttonText: result.buttonText || 'Ver Opciones',
      sections: result.sections,
      mentions: result.mentions
    }, ctx.isGroup)

    if (await safeSend(sock, jid, payload, opts, true)) return

    // Fallback texto
    const lines = [result.text || 'Menú']
    for (const sec of result.sections) {
      lines.push(`\n— ${sec.title || ''}`)
      for (const row of (sec.rows || [])) {
        lines.push(`• ${row.title} → ${row.rowId}`)
      }
    }
    await safeSend(sock, jid, { text: lines.join('\n') }, opts)
    return
  }

  // Fallback genérico
  await safeSend(sock, jid, { text: result.text || '✅ Listo' }, opts)
}

/* ========================
   DISPATCHER PRINCIPAL
   ======================== */
export async function dispatch(ctx = {}) {
  const { sock, remoteJid, isGroup } = ctx
  if (!sock || !remoteJid) return false

  const isFromMe = ctx.message?.key?.fromMe || false

  // ✅ DETECCIÓN CORRECTA DEL REMITENTE
  let senderId = ''
  if (isFromMe) {
    senderId = normalizeDigits(sock.user?.id || '')
    ctx.isOwner = true
  } else {
    if (isGroup) {
      // En grupos, usar participant
      senderId = normalizeDigits(ctx.message?.key?.participant || ctx.sender || '')
    } else {
      // En privados, usar remoteJid
      senderId = normalizeDigits(ctx.sender || remoteJid || '')
    }
  }

  ctx.sender = `${senderId}@s.whatsapp.net`
  ctx.senderNumber = senderId
  ctx.usuario = ctx.sender

  // Verificar si el bot está habilitado en el grupo
  if (isGroup) {
    const botEnabled = await getGroupBool(remoteJid, 'bot_enabled', true)
    if (!botEnabled) return false
  }

  const text = ctx.text != null ? String(ctx.text) : extractText(ctx.message)
  const parsed = parseCommand(text)
  let command = parsed.command
  const args = parsed.args || []

  // Ignorar mensajes fromMe sin comando
  if (isFromMe) {
    const isInteractive = !!(
      ctx.message?.message?.buttonsResponseMessage ||
      ctx.message?.message?.listResponseMessage ||
      ctx.message?.message?.interactiveResponseMessage
    )
    if (!isInteractive && !command) return false
  }

  if (!command) return false

  // Cargar registry
  let registry = global.__COMMAND_REGISTRY?.registry
  if (!registry) {
    try {
      const mod = await import('./registry/index.js')
      registry = mod?.getCommandRegistry?.()
      global.__COMMAND_REGISTRY = { registry, timestamp: Date.now() }
    } catch (e) {
      console.error('[registry] Error:', e?.message)
      return false
    }
  }

  if (!registry?.has(command)) return false

  const entry = registry.get(command)

  // ✅ VERIFICACIÓN DE ADMIN CORREGIDA
  if (isGroup && (entry.adminOnly || entry.isAdmin || entry.admin)) {
    if (!ctx.isOwner) {
      // Verificar si el usuario es admin
      let userIsAdmin = false
      try {
        const meta = await sock.groupMetadata(remoteJid)
        const participant = meta.participants.find(p =>
          normalizeDigits(p.id || p.jid) === senderId
        )
        userIsAdmin = isAdminFlag(participant)
      } catch (e) {
        console.error('[dispatch] Error verificando admin:', e?.message)
      }

      if (!userIsAdmin) {
        await safeSend(sock, remoteJid, {
          text: '⚠️ *Acceso denegado:* Este comando es solo para administradores.'
        }, { quoted: ctx.message })
        return true
      }

      // Verificar si el bot es admin
      const botIsAdmin = await isBotAdminInGroup(sock, remoteJid)
      if (!botIsAdmin) {
        await safeSend(sock, remoteJid, {
          text: '⚠️ *Error:* El bot debe ser administrador para ejecutar este comando.'
        }, { quoted: ctx.message })
        return true
      }
    }
  }

  // Ejecutar comando
  const params = { ...ctx, text, command, args, fecha: new Date().toISOString() }

  try {
    const result = await antibanMiddleware.wrapCommand(
      () => entry.handler(params),
      command
    )

    // Reacción de éxito/error
    const isSuccess = result?.success !== false && !result?.error
    try {
      await sock.sendMessage(remoteJid, {
        react: { text: isSuccess ? '✅' : '❌', key: ctx.message.key }
      })
    } catch {}

    // Enviar resultado
    if (Array.isArray(result)) {
      for (const r of result) await sendResult(sock, remoteJid, r, ctx)
    } else {
      await sendResult(sock, remoteJid, result, ctx)
    }

    return true
  } catch (e) {
    console.error('[dispatch] Error ejecutando comando:', e?.message)

    try {
      await sock.sendMessage(remoteJid, {
        react: { text: '❌', key: ctx.message.key }
      })
    } catch {}

    await safeSend(sock, remoteJid, {
      text: `⚠️ Error ejecutando ${command}: ${e?.message || 'Error desconocido'}`
    })
    return true
  }
}

export default { dispatch }
