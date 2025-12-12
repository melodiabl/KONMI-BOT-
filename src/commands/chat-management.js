// commands/chat-management.js
// Gestión de chats con logging mejorado y metadata real

import logger from '../config/logger.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'
import {
  successResponse,
  errorResponse,
  logCommandExecution,
  logCommandError,
  extractUserInfo,
} from '../utils/command-helpers.js'

const MUTE_TIMES = {
  '8h': 8 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/**
 * Silencia un chat
 */
export async function muteChat(ctx) {
  try {
    const { args, remoteJid, sock, isGroup, isOwner, sender } = ctx

    if (isGroup) {
      const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
      if (!isAdmin && !isOwner) {
        logCommandExecution('mutechat', ctx, false, { reason: 'not_admin' })
        return errorResponse('🚫 Solo administradores pueden silenciar chats en grupos.', {
          command: 'mutechat',
          reason: 'not_admin',
        })
      }
      if (!isBotAdmin) {
        logCommandExecution('mutechat', ctx, false, { reason: 'bot_not_admin' })
        return errorResponse('🚫 El bot debe ser administrador para silenciar chats en grupos.', {
          command: 'mutechat',
          reason: 'bot_not_admin',
        })
      }
    }

    const timeStr = args[0] || '8h'
    const time = MUTE_TIMES[timeStr]

    if (!time && timeStr !== 'forever') {
      logCommandExecution('mutechat', ctx, false, { reason: 'invalid_time' })
      return errorResponse(
        `❌ Opciones válidas: ${Object.keys(MUTE_TIMES).join(', ')}, forever`,
        {
          command: 'mutechat',
          reason: 'invalid_time',
          validOptions: Object.keys(MUTE_TIMES),
        }
      )
    }

    const muteTime = timeStr === 'forever' ? true : time
    await sock.chatModify({ mute: muteTime }, remoteJid)

    const label = timeStr === 'forever' ? 'indefinidamente' : timeStr
    const executorInfo = extractUserInfo(sender)

    logger.info(
      {
        scope: 'command',
        command: 'mutechat',
        executor: executorInfo.number,
        duration: timeStr,
        chat: remoteJid,
      },
      `🔇 Chat silenciado por ${label} por ${executorInfo.mention}`
    )

    logCommandExecution('mutechat', ctx, true, {
      executor: executorInfo.number,
      duration: timeStr,
    })

    return successResponse(`🔇 Chat silenciado por ${label}.`, {
      metadata: {
        executor: executorInfo.number,
        duration: timeStr,
        muteTime,
      },
    })
  } catch (e) {
    logCommandError('mutechat', ctx, e)
    return errorResponse('⚠️ Error al silenciar el chat. Intenta de nuevo.', {
      command: 'mutechat',
      error: e.message,
    })
  }
}

/**
 * Dessilencia un chat
 */
export async function unmuteChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ mute: null }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'unmutechat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `🔊 Chat desilenciado por ${executorInfo.mention}`
    )

    logCommandExecution('unmutechat', ctx, true, { executor: executorInfo.number })

    return successResponse('🔊 Chat desilenciado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unmutechat', ctx, e)
    return errorResponse('⚠️ Error al dessilenciar el chat. Intenta de nuevo.', {
      command: 'unmutechat',
      error: e.message,
    })
  }
}

/**
 * Archiva un chat
 */
export async function archiveChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ archive: true }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'archivechat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `📦 Chat archivado por ${executorInfo.mention}`
    )

    logCommandExecution('archivechat', ctx, true, { executor: executorInfo.number })

    return successResponse('📦 Chat archivado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('archivechat', ctx, e)
    return errorResponse('⚠️ Error al archivar el chat. Intenta de nuevo.', {
      command: 'archivechat',
      error: e.message,
    })
  }
}

/**
 * Desarchiva un chat
 */
export async function unarchiveChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ archive: false }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'unarchivechat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `📂 Chat desarchivado por ${executorInfo.mention}`
    )

    logCommandExecution('unarchivechat', ctx, true, { executor: executorInfo.number })

    return successResponse('📂 Chat desarchivado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unarchivechat', ctx, e)
    return errorResponse('⚠️ Error al desarchivar el chat. Intenta de nuevo.', {
      command: 'unarchivechat',
      error: e.message,
    })
  }
}

/**
 * Marca un chat como leído
 */
export async function markChatRead(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ markRead: true }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'markchatread',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `✅ Chat marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('markchatread', ctx, true, { executor: executorInfo.number })

    return successResponse('✅ Chat marcado como leído.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('markchatread', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como leído. Intenta de nuevo.', {
      command: 'markchatread',
      error: e.message,
    })
  }
}

/**
 * Marca un chat como no leído
 */
export async function markChatUnread(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ markRead: false }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'markchatunread',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `❌ Chat marcado como no leído por ${executorInfo.mention}`
    )

    logCommandExecution('markchatunread', ctx, true, { executor: executorInfo.number })

    return successResponse('❌ Chat marcado como no leído.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('markchatunread', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como no leído. Intenta de nuevo.', {
      command: 'markchatunread',
      error: e.message,
    })
  }
}

/**
 * Elimina un chat
 */
export async function deleteChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ delete: true }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'deletechat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `🗑️ Chat eliminado por ${executorInfo.mention}`
    )

    logCommandExecution('deletechat', ctx, true, { executor: executorInfo.number })

    return successResponse('🗑️ Chat eliminado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('deletechat', ctx, e)
    return errorResponse('⚠️ Error al eliminar el chat. Intenta de nuevo.', {
      command: 'deletechat',
      error: e.message,
    })
  }
}

/**
 * Fija un chat
 */
export async function pinChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ pin: true }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'pinchat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `📌 Chat fijado por ${executorInfo.mention}`
    )

    logCommandExecution('pinchat', ctx, true, { executor: executorInfo.number })

    return successResponse('📌 Chat fijado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('pinchat', ctx, e)
    return errorResponse('⚠️ Error al fijar el chat. Intenta de nuevo.', {
      command: 'pinchat',
      error: e.message,
    })
  }
}

/**
 * Desfixa un chat
 */
export async function unpinChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ pin: false }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'unpinchat',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `📍 Chat desfijado por ${executorInfo.mention}`
    )

    logCommandExecution('unpinchat', ctx, true, { executor: executorInfo.number })

    return successResponse('📍 Chat desfijado.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('unpinchat', ctx, e)
    return errorResponse('⚠️ Error al desfijar el chat. Intenta de nuevo.', {
      command: 'unpinchat',
      error: e.message,
    })
  }
}

/**
 * Limpia los últimos mensajes del chat
 */
export async function clearChat(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    const messages = await sock.loadMessagesInChat(remoteJid, undefined, 10)

    if (!messages || messages.length === 0) {
      logCommandExecution('clearchat', ctx, true, { messagesCleared: 0 })
      return successResponse('ℹ️ No hay mensajes para limpiar.', {
        metadata: { messagesCleared: 0 },
      })
    }

    await sock.chatModify(
      {
        clear: {
          messages: messages.map((m) => ({
            id: m.key.id,
            fromMe: m.key.fromMe,
            timestamp: m.messageTimestamp,
          })),
        },
      },
      remoteJid
    )

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'clearchat',
        executor: executorInfo.number,
        messagesCleared: messages.length,
        chat: remoteJid,
      },
      `🧹 ${messages.length} últimos mensajes borrados por ${executorInfo.mention}`
    )

    logCommandExecution('clearchat', ctx, true, {
      executor: executorInfo.number,
      messagesCleared: messages.length,
    })

    return successResponse(`🧹 ${messages.length} últimos mensajes borrados para ti.`, {
      metadata: {
        executor: executorInfo.number,
        messagesCleared: messages.length,
      },
    })
  } catch (e) {
    logCommandError('clearchat', ctx, e)
    return errorResponse('⚠️ Error al limpiar el chat. Intenta de nuevo.', {
      command: 'clearchat',
      error: e.message,
    })
  }
}

/**
 * Habilita mensajes efímeros
 */
export async function enableDisappearing(ctx) {
  try {
    const { args, remoteJid, sock, isGroup, isOwner, sender } = ctx

    if (isGroup) {
      const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
      if (!isAdmin && !isOwner) {
        logCommandExecution('enabledisappearing', ctx, false, { reason: 'not_admin' })
        return errorResponse('🚫 Solo administradores pueden cambiar mensajes efímeros en grupos.', {
          command: 'enabledisappearing',
          reason: 'not_admin',
        })
      }
      if (!isBotAdmin) {
        logCommandExecution('enabledisappearing', ctx, false, { reason: 'bot_not_admin' })
        return errorResponse('🚫 El bot debe ser administrador para cambiar mensajes efímeros.', {
          command: 'enabledisappearing',
          reason: 'bot_not_admin',
        })
      }
    }

    const days = parseInt(args[0]) || 7
    const validDays = [0, 1, 7, 30, 90]

    if (!validDays.includes(days)) {
      logCommandExecution('enabledisappearing', ctx, false, { reason: 'invalid_days' })
      return errorResponse(`❌ Días válidos: ${validDays.join(', ')}`, {
        command: 'enabledisappearing',
        reason: 'invalid_days',
        validDays,
      })
    }

    const seconds = days * 86400
    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: seconds || false,
    })

    const label = days === 0 ? 'Deshabilitado' : `${days} día(s)`
    const executorInfo = extractUserInfo(sender)

    logger.info(
      {
        scope: 'command',
        command: 'enabledisappearing',
        executor: executorInfo.number,
        days,
        chat: remoteJid,
      },
      `⏰ Mensajes efímeros configurados a ${label} por ${executorInfo.mention}`
    )

    logCommandExecution('enabledisappearing', ctx, true, {
      executor: executorInfo.number,
      days,
    })

    return successResponse(`⏰ Mensajes efímeros: ${label}`, {
      metadata: {
        executor: executorInfo.number,
        days,
        seconds,
      },
    })
  } catch (e) {
    logCommandError('enabledisappearing', ctx, e)
    return errorResponse('⚠️ Error al configurar mensajes efímeros. Intenta de nuevo.', {
      command: 'enabledisappearing',
      error: e.message,
    })
  }
}

/**
 * Desactiva mensajes efímeros
 */
export async function disableDisappearing(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: false,
    })

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'disabledisappearing',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `⏰ Mensajes efímeros deshabilitados por ${executorInfo.mention}`
    )

    logCommandExecution('disabledisappearing', ctx, true, { executor: executorInfo.number })

    return successResponse('⏰ Mensajes efímeros deshabilitados.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('disabledisappearing', ctx, e)
    return errorResponse('⚠️ Error al desactivar mensajes efímeros. Intenta de nuevo.', {
      command: 'disabledisappearing',
      error: e.message,
    })
  }
}

/**
 * Marca un mensaje como leído
 */
export async function readMessage(ctx) {
  try {
    const { quoted, remoteJid, sock, sender } = ctx

    if (!quoted || !quoted.key) {
      logCommandExecution('readmessage', ctx, false, { reason: 'no_quoted' })
      return errorResponse('❌ Responde al mensaje a marcar como leído.', {
        command: 'readmessage',
        reason: 'no_quoted',
      })
    }

    await sock.readMessages([quoted.key])

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'readmessage',
        executor: executorInfo.number,
        messageId: quoted.key.id,
      },
      `✅ Mensaje marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('readmessage', ctx, true, { executor: executorInfo.number })

    return successResponse('✅ Mensaje marcado como leído.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('readmessage', ctx, e)
    return errorResponse('⚠️ Error al marcar mensaje como leído. Intenta de nuevo.', {
      command: 'readmessage',
      error: e.message,
    })
  }
}

/**
 * Marca todos los mensajes del chat como leídos
 */
export async function readMessages(ctx) {
  try {
    const { remoteJid, sock, sender } = ctx

    await sock.chatModify({ markRead: true }, remoteJid)

    const executorInfo = extractUserInfo(sender)
    logger.info(
      {
        scope: 'command',
        command: 'readmessages',
        executor: executorInfo.number,
        chat: remoteJid,
      },
      `✅ Chat marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('readmessages', ctx, true, { executor: executorInfo.number })

    return successResponse('✅ Chat marcado como leído.', {
      metadata: { executor: executorInfo.number },
    })
  } catch (e) {
    logCommandError('readmessages', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como leído. Intenta de nuevo.', {
      command: 'readmessages',
      error: e.message,
    })
  }
}

export default {
  muteChat,
  unmuteChat,
  archiveChat,
  unarchiveChat,
  markChatRead,
  markChatUnread,
  deleteChat,
  pinChat,
  unpinChat,
  clearChat,
  enableDisappearing,
  disableDisappearing,
  readMessage,
  readMessages,
}
