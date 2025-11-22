// utils/wa-logging.js
// Logging centralizado de eventos/mensajes de WhatsApp en DB (tabla `logs`).
// Registra: texto, media (imagen/video/audio/document), sticker, interacciones (botón/lista/flow),
// comandos ejecutados y eventos de sistema.

import db from '../../database/db.js'
import logger from '../../config/logger.js'

const toStr = (v) => {
  try { if (v == null) return ''; if (typeof v === 'string') return v; return JSON.stringify(v) } catch { return String(v) }
}

function onlyDigits(v) { return String(v || '').replace(/\D/g, '') }

function unwrapMessageRoot(msg) {
  let x = msg?.message || {}
  let guard = 0
  while (guard++ < 6) {
    if (x?.ephemeralMessage?.message) { x = x.ephemeralMessage.message; continue }
    if (x?.viewOnceMessage?.message) { x = x.viewOnceMessage.message; continue }
    if (x?.viewOnceMessageV2?.message) { x = x.viewOnceMessageV2.message; continue }
    if (x?.viewOnceMessageV2Extension?.message) { x = x.viewOnceMessageV2Extension.message; continue }
    if (x?.message && typeof x.message === 'object') { x = x.message; continue }
    break
  }
  return x || {}
}

function detectKind(msg) {
  try {
    const m = unwrapMessageRoot(msg)
    if (m.stickerMessage) return { tipo: 'sticker', kind: 'stickerMessage' }
    if (m.imageMessage) return { tipo: 'media', kind: 'imageMessage' }
    if (m.videoMessage) return { tipo: 'media', kind: 'videoMessage' }
    if (m.audioMessage) return { tipo: 'media', kind: 'audioMessage' }
    if (m.documentMessage) return { tipo: 'media', kind: 'documentMessage' }
    if (m.buttonsResponseMessage) return { tipo: 'interaction', kind: 'buttonsResponseMessage' }
    if (m.templateButtonReplyMessage) return { tipo: 'interaction', kind: 'templateButtonReplyMessage' }
    if (m.listResponseMessage) return { tipo: 'interaction', kind: 'listResponseMessage' }
    if (m.interactiveResponseMessage?.nativeFlowResponseMessage) return { tipo: 'interaction', kind: 'nativeFlowResponseMessage' }
    if (m.conversation || m.extendedTextMessage?.text) return { tipo: 'mensaje', kind: 'text' }
    return { tipo: 'mensaje', kind: 'unknown' }
  } catch { return { tipo: 'mensaje', kind: 'unknown' } }
}

function extractBody(msg) {
  try {
    const m = unwrapMessageRoot(msg)
    return (
      m.conversation
      || m.extendedTextMessage?.text
      || m.imageMessage?.caption
      || m.videoMessage?.caption
      || ''
    )?.toString()?.trim() || ''
  } catch { return '' }
}

function extractInteraction(msg) {
  try {
    const m = unwrapMessageRoot(msg)
    if (m.buttonsResponseMessage?.selectedButtonId) {
      return { type: 'button', id: m.buttonsResponseMessage.selectedButtonId, text: m.buttonsResponseMessage.selectedDisplayText }
    }
    if (m.templateButtonReplyMessage?.selectedId) {
      return { type: 'template', id: m.templateButtonReplyMessage.selectedId, text: m.templateButtonReplyMessage.selectedDisplayText }
    }
    const lr = m.listResponseMessage
    if (lr?.singleSelectReply?.selectedRowId) {
      return { type: 'list', id: lr.singleSelectReply.selectedRowId, text: lr.title }
    }
    const nfr = m.interactiveResponseMessage?.nativeFlowResponseMessage
    if (nfr) {
      const params = nfr.paramsJson ? JSON.parse(nfr.paramsJson) : {}
      return { type: 'native', name: nfr.name, id: params.id || params.selectedId || params.copy_code, text: params.display_text }
    }
  } catch {}
  return null
}

export async function logIncomingMessage(msg) {
  try {
    const remoteJid = msg?.key?.remoteJid || ''
    const participant = msg?.key?.participant || null
    const isGroup = remoteJid.endsWith('@g.us')
    const usuario = isGroup ? (participant || '') : (remoteJid || '')
    const phone = onlyDigits(usuario)
    const { tipo, kind } = detectKind(msg)
    const body = extractBody(msg)
    const interaction = extractInteraction(msg)
    const commandId = interaction?.id || (body || kind || 'message')
    const detalles = {
      kind,
      fromMe: !!msg?.key?.fromMe,
      id: msg?.key?.id,
      body,
      interaction,
    }

    // Siempre loguear por logger (aunque la DB falle)
    try {
      logger.whatsapp.message(
        tipo,
        commandId,
        phone || usuario || 'desconocido',
        isGroup ? remoteJid : null,
        detalles,
      )
    } catch {}

    // Intentar guardar en DB, pero sin romper el flujo si falla
    try {
      await db('logs').insert({
        tipo,
        comando: commandId,
        usuario: phone || usuario || 'desconocido',
        grupo: isGroup ? remoteJid : null,
        fecha: new Date().toISOString(),
        detalles: JSON.stringify(detalles),
      })
    } catch (e) {
      try {
        logger.database.error('logs.insert', e?.message || e)
      } catch {}
    }
  } catch (e) {
    try {
      logger.whatsapp.error(`logIncomingMessage failed`, { error: e?.message || e })
    } catch {}
  }
}

export async function logCommandExecuted({ command, usuario, remoteJid, args, meta = {} }) {
  try {
    const u = onlyDigits(usuario)

    // Siempre loguear el comando por logger
    try {
      logger.whatsapp.command(
        command,
        u || usuario || 'desconocido',
        (remoteJid && remoteJid.endsWith('@g.us')) ? remoteJid : null,
        { args, ...meta },
      )
    } catch {}

    // Intentar guardar en DB sin romper el flujo si falla
    try {
      await db('logs').insert({
        tipo: 'comando',
        comando: command,
        usuario: u || usuario || 'desconocido',
        grupo: (remoteJid && remoteJid.endsWith('@g.us')) ? remoteJid : null,
        fecha: new Date().toISOString(),
        detalles: JSON.stringify({ args, ...meta }),
      })
    } catch (e) {
      try {
        logger.database.error('logs.insert.command', e?.message || e)
      } catch {}
    }
  } catch (e) {
    try {
      logger.whatsapp.error(`logCommandExecuted failed`, { error: e?.message || e })
    } catch {}
  }
}

export default { logIncomingMessage, logCommandExecuted }
