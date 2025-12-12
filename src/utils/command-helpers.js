// src/utils/command-helpers.js
// Helpers centralizados para comandos con logging y validaciones

import logger from '../config/logger.js'
import { getGroupRoles } from './utils/group-helper.js'

/**
 * Extrae solo dígitos de una cadena
 * @param {string} v - Valor a procesar
 * @returns {string} Solo dígitos
 */
export const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

/**
 * Valida si un JID tiene formato válido
 * @param {string} jid - JID a validar
 * @returns {boolean}
 */
export function isValidJid(jid) {
  if (!jid || typeof jid !== 'string') return false
  const match = jid.match(/^(\d+)@s\.whatsapp\.net$/)
  return !!match && match[1].length >= 10
}

/**
 * Valida si un número de teléfono es válido
 * @param {string} digits - Solo dígitos
 * @returns {boolean}
 */
export function isValidPhoneNumber(digits) {
  return digits && digits.length >= 10 && digits.length <= 15
}

/**
 * Extrae el primer elemento de un array
 * @param {any} v - Valor a procesar
 * @returns {any} Primer elemento o null
 */
export const first = (v) => (Array.isArray(v) && v.length ? v[0] : null)

/**
 * Extrae el JID del usuario objetivo desde el contexto
 * @param {object} ctx - Contexto del comando
 * @returns {string|null} JID válido o null
 */
export function extractTargetJid(ctx) {
  const { message, args } = ctx
  const quoted = message?.message?.extendedTextMessage?.contextInfo

  // Intenta obtener desde menciones en mensaje citado
  if (quoted?.mentionedJid?.length > 0) {
    const jid = quoted.mentionedJid[0]
    if (isValidJid(jid)) return jid
  }

  // Intenta obtener desde participante del mensaje citado
  if (quoted?.participant) {
    if (isValidJid(quoted.participant)) return quoted.participant
  }

  // Intenta obtener desde argumentos
  if (Array.isArray(args) && args.length > 0) {
    const mention = String(args[0] || '').replace('@', '').trim()
    const digits = onlyDigits(mention)

    if (isValidPhoneNumber(digits)) {
      return `${digits}@s.whatsapp.net`
    }
  }

  return null
}

/**
 * Verifica si el usuario tiene permisos de administrador
 * @param {object} ctx - Contexto del comando
 * @returns {Promise<boolean>}
 */
export async function checkAdminPermission(ctx) {
  const { isOwner, isAdmin, sock, remoteJid, sender } = ctx

  if (isOwner) return true
  if (isAdmin) return true

  // Verifica roles en el grupo si es necesario
  if (sock && remoteJid && sender) {
    try {
      const roles = await getGroupRoles(sock, remoteJid, sender)
      return roles.isAdmin || roles.isSuperAdmin
    } catch (e) {
      logger.warn(
        { scope: 'command', error: e.message, sender, remoteJid },
        `⚠️ Error al verificar roles del grupo: ${e.message}`
      )
      return false
    }
  }

  return false
}

/**
 * Crea una respuesta de error con metadata
 * @param {string} message - Mensaje de error
 * @param {object} metadata - Metadata adicional
 * @returns {object}
 */
export function errorResponse(message, metadata = {}) {
  return {
    success: false,
    message,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  }
}

/**
 * Crea una respuesta de éxito con metadata
 * @param {string} message - Mensaje de éxito
 * @param {object} options - Opciones adicionales
 * @returns {object}
 */
export function successResponse(message, options = {}) {
  const { mentions = [], metadata = {} } = options
  return {
    success: true,
    message,
    ...(mentions.length > 0 && { mentions }),
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  }
}

/**
 * Registra la ejecución de un comando
 * @param {string} command - Nombre del comando
 * @param {object} ctx - Contexto del comando
 * @param {boolean} success - Si fue exitoso
 * @param {object} details - Detalles adicionales
 */
export function logCommandExecution(command, ctx, success, details = {}) {
  const { sender, remoteJid, isGroup } = ctx
  const userName = (sender || '').split('@')[0] || 'desconocido'
  const groupName = isGroup ? (remoteJid || '').split('@')[0] : 'privado'

  logger.commands.executed(command, userName, success)

  if (success) {
    logger.info(
      {
        scope: 'command',
        command,
        user: userName,
        group: groupName,
        isGroup,
        ...details,
      },
      `✅ Comando ejecutado: /${command} | Usuario: ${userName} | Contexto: ${isGroup ? `Grupo ${groupName}` : 'Privado'}`
    )
  } else {
    logger.warn(
      {
        scope: 'command',
        command,
        user: userName,
        group: groupName,
        isGroup,
        ...details,
      },
      `⚠️ Comando fallido: /${command} | Usuario: ${userName} | Razón: ${details.reason || 'desconocida'}`
    )
  }
}

/**
 * Registra un error de comando
 * @param {string} command - Nombre del comando
 * @param {object} ctx - Contexto del comando
 * @param {Error} error - Error ocurrido
 * @param {object} details - Detalles adicionales
 */
export function logCommandError(command, ctx, error, details = {}) {
  const { sender, remoteJid, isGroup } = ctx
  const userName = (sender || '').split('@')[0] || 'desconocido'
  const groupName = isGroup ? (remoteJid || '').split('@')[0] : 'privado'

  logger.error(
    {
      scope: 'command',
      command,
      user: userName,
      group: groupName,
      isGroup,
      error: error.message,
      stack: error.stack,
      ...details,
    },
    `❌ Error en comando /${command}: ${error.message}`
  )
}

/**
 * Extrae información de usuario desde JID
 * @param {string} jid - JID del usuario
 * @returns {object}
 */
export function extractUserInfo(jid) {
  if (!jid) return { number: 'desconocido', mention: 'desconocido' }
  const number = jid.split('@')[0]
  return {
    number,
    mention: `@${number}`,
    jid,
  }
}

/**
 * Formatea una lista de usuarios para mostrar
 * @param {array} users - Array de usuarios (JID o números)
 * @param {number} limit - Límite de usuarios a mostrar
 * @returns {string}
 */
export function formatUserList(users, limit = 20) {
  if (!Array.isArray(users) || users.length === 0) {
    return '(ninguno)'
  }

  const limited = users.slice(0, limit)
  const list = limited
    .map((u, i) => {
      const info = extractUserInfo(u)
      return `${i + 1}. ${info.mention}`
    })
    .join('\n')

  const suffix = users.length > limit ? `\n... y ${users.length - limit} más` : ''
  return list + suffix
}

/**
 * Valida permisos de administrador con logging
 * @param {object} ctx - Contexto del comando
 * @param {string} commandName - Nombre del comando
 * @returns {Promise<{allowed: boolean, response: object}>}
 */
export async function validateAdminPermission(ctx, commandName) {
  const { isGroup, remoteJid, sender } = ctx

  if (!isGroup) {
    return {
      allowed: false,
      response: errorResponse('❌ Este comando solo funciona en grupos.', {
        command: commandName,
        reason: 'not_in_group',
      }),
    }
  }

  try {
    const hasPermission = await checkAdminPermission(ctx)
    if (!hasPermission) {
      logCommandExecution(commandName, ctx, false, {
        reason: 'insufficient_permissions',
      })
      return {
        allowed: false,
        response: errorResponse('🚫 Solo los administradores pueden usar este comando.', {
          command: commandName,
          reason: 'insufficient_permissions',
        }),
      }
    }

    return { allowed: true, response: null }
  } catch (e) {
    logCommandError(commandName, ctx, e, { stage: 'permission_check' })
    return {
      allowed: false,
      response: errorResponse('⚠️ Error al verificar permisos. Intenta de nuevo.', {
        command: commandName,
        reason: 'permission_check_error',
      }),
    }
  }
}

export default {
  onlyDigits,
  isValidJid,
  isValidPhoneNumber,
  first,
  extractTargetJid,
  checkAdminPermission,
  errorResponse,
  successResponse,
  logCommandExecution,
  logCommandError,
  extractUserInfo,
  formatUserList,
  validateAdminPermission,
}
