// src/utils/context-builder.js
// Constructor de contexto mejorado con validaciones reales

import logger from '../config/logger.js'
import { getGroupRoles, getGroupMetadataCached } from './utils/group-helper.js'
import { isSuperAdmin } from '../config/global-config.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

/**
 * Construye el contexto completo para un comando
 * Incluye validaciones reales de admin y metadata
 */
export async function buildCommandContext(sock, message, remoteJid, sender, pushName = '') {
  try {
    const isGroup = typeof remoteJid === 'string' && remoteJid.endsWith('@g.us')
    const botNumber = onlyDigits(sock?.user?.id || '')
    const senderNumber = onlyDigits(sender || '')
    const usuarioNumber = senderNumber

    // Verificar si es owner global
    const isOwner = await isSuperAdmin(senderNumber)

    // Inicializar valores por defecto
    let isAdmin = false
    let isBotAdmin = false
    let groupMetadata = null

    // Si es grupo, obtener roles reales
    if (isGroup) {
      try {
        const rolesResult = await getGroupRoles(sock, remoteJid, sender)
        isAdmin = rolesResult.isAdmin === true
        isBotAdmin = rolesResult.isBotAdmin === true
        groupMetadata = rolesResult.metadata

        logger.info(
          {
            scope: 'context',
            action: 'build_context',
            group: remoteJid,
            sender: senderNumber,
            isAdmin,
            isBotAdmin,
            hasMetadata: !!groupMetadata,
          },
          `🔍 Contexto construido | Admin: ${isAdmin ? '✅' : '❌'} | BotAdmin: ${isBotAdmin ? '✅' : '❌'}`
        )
      } catch (e) {
        logger.warn(
          {
            scope: 'context',
            action: 'build_context_error',
            group: remoteJid,
            sender: senderNumber,
            error: e.message,
          },
          `⚠️ Error obteniendo roles del grupo: ${e.message}`
        )
      }
    }

    // Construir contexto completo
    const ctx = {
      // Socket y conexión
      sock,
      message,
      remoteJid,
      sender,
      pushName,

      // Información del usuario
      usuarioNumber,
      senderNumber,
      botNumber,

      // Información del grupo
      isGroup,
      isAdmin,
      isBotAdmin,
      isOwner,
      groupMetadata,

      // Información del mensaje
      text: extractMessageText(message),
      args: [],
      quoted: message?.message?.extendedTextMessage?.contextInfo,

      // Metadata
      timestamp: new Date().toISOString(),
      messageId: message?.key?.id,
      messageTimestamp: message?.messageTimestamp,

      // Helpers
      isPrivate: !isGroup,
      isSuperAdmin: isOwner,
    }

    return ctx
  } catch (e) {
    logger.error(
      {
        scope: 'context',
        action: 'build_context_fatal',
        error: e.message,
        stack: e.stack,
      },
      `❌ Error fatal construyendo contexto: ${e.message}`
    )

    // Retornar contexto mínimo en caso de error
    return {
      sock,
      message,
      remoteJid,
      sender,
      pushName,
      isGroup: typeof remoteJid === 'string' && remoteJid.endsWith('@g.us'),
      isAdmin: false,
      isBotAdmin: false,
      isOwner: false,
      text: extractMessageText(message),
      args: [],
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * Extrae el texto del mensaje
 */
function extractMessageText(message) {
  try {
    if (!message || !message.message) return ''

    const msg = message.message

    // Texto normal
    if (msg.conversation) return String(msg.conversation).trim()
    if (msg.extendedTextMessage?.text) return String(msg.extendedTextMessage.text).trim()
    if (msg.imageMessage?.caption) return String(msg.imageMessage.caption).trim()
    if (msg.videoMessage?.caption) return String(msg.videoMessage.caption).trim()

    // Respuestas de botones/listas
    if (msg.buttonsResponseMessage?.selectedButtonId)
      return String(msg.buttonsResponseMessage.selectedButtonId).trim()
    if (msg.templateButtonReplyMessage?.selectedId)
      return String(msg.templateButtonReplyMessage.selectedId).trim()
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
      return String(msg.listResponseMessage.singleSelectReply.selectedRowId).trim()

    // Respuestas interactivas
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const params = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
        if (params.id) return String(params.id).trim()
      } catch {}
    }

    return ''
  } catch (e) {
    logger.warn(
      { scope: 'context', action: 'extract_text_error', error: e.message },
      `⚠️ Error extrayendo texto: ${e.message}`
    )
    return ''
  }
}

/**
 * Valida que el usuario sea admin en el grupo
 */
export async function validateAdminInGroup(ctx) {
  if (!ctx.isGroup) {
    return {
      valid: false,
      reason: 'not_in_group',
      message: '❌ Este comando solo funciona en grupos.',
    }
  }

  if (!ctx.isAdmin && !ctx.isOwner) {
    logger.warn(
      {
        scope: 'context',
        action: 'admin_validation_failed',
        sender: ctx.senderNumber,
        group: ctx.remoteJid,
      },
      `🚫 Usuario no es admin: ${ctx.senderNumber}`
    )

    return {
      valid: false,
      reason: 'not_admin',
      message: '🚫 Solo los administradores pueden usar este comando.',
    }
  }

  return { valid: true }
}

/**
 * Valida que el bot sea admin en el grupo
 */
export async function validateBotAdminInGroup(ctx) {
  if (!ctx.isGroup) {
    return {
      valid: false,
      reason: 'not_in_group',
      message: '❌ Este comando solo funciona en grupos.',
    }
  }

  if (!ctx.isBotAdmin) {
    logger.warn(
      {
        scope: 'context',
        action: 'bot_admin_validation_failed',
        group: ctx.remoteJid,
        botNumber: ctx.botNumber,
      },
      `🚫 Bot no es admin en el grupo`
    )

    return {
      valid: false,
      reason: 'bot_not_admin',
      message: '🚫 El bot necesita ser administrador para ejecutar este comando.',
    }
  }

  return { valid: true }
}

/**
 * Valida que el usuario sea owner
 */
export async function validateOwner(ctx) {
  if (!ctx.isOwner) {
    logger.warn(
      {
        scope: 'context',
        action: 'owner_validation_failed',
        sender: ctx.senderNumber,
      },
      `🚫 Usuario no es owner: ${ctx.senderNumber}`
    )

    return {
      valid: false,
      reason: 'not_owner',
      message: '🚫 Solo el owner puede usar este comando.',
    }
  }

  return { valid: true }
}

/**
 * Log de contexto para debugging
 */
export function logContext(ctx, action = 'command_execution') {
  logger.info(
    {
      scope: 'context',
      action,
      sender: ctx.senderNumber,
      group: ctx.isGroup ? ctx.remoteJid : 'private',
      isAdmin: ctx.isAdmin,
      isBotAdmin: ctx.isBotAdmin,
      isOwner: ctx.isOwner,
      messageId: ctx.messageId,
      timestamp: ctx.timestamp,
    },
    `📋 Contexto: ${ctx.senderNumber} | Grupo: ${ctx.isGroup ? '✅' : '❌'} | Admin: ${ctx.isAdmin ? '✅' : '❌'} | BotAdmin: ${ctx.isBotAdmin ? '✅' : '❌'} | Owner: ${ctx.isOwner ? '✅' : '❌'}`
  )
}

export default {
  buildCommandContext,
  validateAdminInGroup,
  validateBotAdminInGroup,
  validateOwner,
  logContext,
}
