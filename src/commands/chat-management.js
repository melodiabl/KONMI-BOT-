// commands/chat-management.js
// Gestión de chats con context-builder

import logger from '../config/logger.js'
import { buildCommandContext, validateAdminInGroup, validateBotAdminInGroup, logContext } from '../utils/context-builder.js'
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

export async function muteChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'mutechat_command')

    if (fullCtx.isGroup) {
      const adminCheck = await validateAdminInGroup(fullCtx)
      if (!adminCheck.valid) {
        logCommandExecution('mutechat', fullCtx, false, { reason: adminCheck.reason })
        return errorResponse(adminCheck.message, { command: 'mutechat', reason: adminCheck.reason })
      }

      const botAdminCheck = await validateBotAdminInGroup(fullCtx)
      if (!botAdminCheck.valid) {
        logCommandExecution('mutechat', fullCtx, false, { reason: botAdminCheck.reason })
        return errorResponse(botAdminCheck.message, { command: 'mutechat', reason: botAdminCheck.reason })
      }
    }

    const timeStr = fullCtx.args?.[0] || '8h'
    const time = MUTE_TIMES[timeStr]

    if (!time && timeStr !== 'forever') {
      logCommandExecution('mutechat', fullCtx, false, { reason: 'invalid_time' })
      return errorResponse(`❌ Opciones válidas: ${Object.keys(MUTE_TIMES).join(', ')}, forever`, {
        command: 'mutechat',
        reason: 'invalid_time',
        validOptions: Object.keys(MUTE_TIMES),
      })
    }

    const muteTime = timeStr === 'forever' ? true : time
    await fullCtx.sock.chatModify({ mute: muteTime }, fullCtx.remoteJid)

    const label = timeStr === 'forever' ? 'indefinidamente' : timeStr
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'mutechat', executor: executorInfo.number, duration: timeStr, chat: fullCtx.remoteJid },
      `🔇 Chat silenciado por ${label} por ${executorInfo.mention}`
    )

    logCommandExecution('mutechat', fullCtx, true, { executor: executorInfo.number, duration: timeStr })

    return successResponse(`🔇 Chat silenciado por ${label}.`, {
      metadata: { executor: executorInfo.number, duration: timeStr, muteTime },
    })
  } catch (e) {
    logCommandError('mutechat', ctx, e)
    return errorResponse('⚠️ Error al silenciar el chat.', { command: 'mutechat', error: e.message })
  }
}

export async function unmuteChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unmutechat_command')

    await fullCtx.sock.chatModify({ mute: null }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'unmutechat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `🔊 Chat desilenciado por ${executorInfo.mention}`
    )

    logCommandExecution('unmutechat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('🔊 Chat desilenciado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('unmutechat', ctx, e)
    return errorResponse('⚠️ Error al dessilenciar el chat.', { command: 'unmutechat', error: e.message })
  }
}

export async function archiveChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'archivechat_command')

    await fullCtx.sock.chatModify({ archive: true }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'archivechat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `📦 Chat archivado por ${executorInfo.mention}`
    )

    logCommandExecution('archivechat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('📦 Chat archivado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('archivechat', ctx, e)
    return errorResponse('⚠️ Error al archivar el chat.', { command: 'archivechat', error: e.message })
  }
}

export async function unarchiveChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unarchivechat_command')

    await fullCtx.sock.chatModify({ archive: false }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'unarchivechat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `📂 Chat desarchivado por ${executorInfo.mention}`
    )

    logCommandExecution('unarchivechat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('📂 Chat desarchivado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('unarchivechat', ctx, e)
    return errorResponse('⚠️ Error al desarchivar el chat.', { command: 'unarchivechat', error: e.message })
  }
}

export async function markChatRead(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'markchatread_command')

    await fullCtx.sock.chatModify({ markRead: true }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'markchatread', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `✅ Chat marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('markchatread', fullCtx, true, { executor: executorInfo.number })

    return successResponse('✅ Chat marcado como leído.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('markchatread', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como leído.', { command: 'markchatread', error: e.message })
  }
}

export async function markChatUnread(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'markchatunread_command')

    await fullCtx.sock.chatModify({ markRead: false }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'markchatunread', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `❌ Chat marcado como no leído por ${executorInfo.mention}`
    )

    logCommandExecution('markchatunread', fullCtx, true, { executor: executorInfo.number })

    return successResponse('❌ Chat marcado como no leído.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('markchatunread', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como no leído.', { command: 'markchatunread', error: e.message })
  }
}

export async function deleteChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'deletechat_command')

    await fullCtx.sock.chatModify({ delete: true }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'deletechat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `🗑️ Chat eliminado por ${executorInfo.mention}`
    )

    logCommandExecution('deletechat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('🗑️ Chat eliminado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('deletechat', ctx, e)
    return errorResponse('⚠️ Error al eliminar el chat.', { command: 'deletechat', error: e.message })
  }
}

export async function pinChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'pinchat_command')

    await fullCtx.sock.chatModify({ pin: true }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'pinchat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `📌 Chat fijado por ${executorInfo.mention}`
    )

    logCommandExecution('pinchat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('📌 Chat fijado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('pinchat', ctx, e)
    return errorResponse('⚠️ Error al fijar el chat.', { command: 'pinchat', error: e.message })
  }
}

export async function unpinChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'unpinchat_command')

    await fullCtx.sock.chatModify({ pin: false }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'unpinchat', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `📍 Chat desfijado por ${executorInfo.mention}`
    )

    logCommandExecution('unpinchat', fullCtx, true, { executor: executorInfo.number })

    return successResponse('📍 Chat desfijado.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('unpinchat', ctx, e)
    return errorResponse('⚠️ Error al desfijar el chat.', { command: 'unpinchat', error: e.message })
  }
}

export async function clearChat(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'clearchat_command')

    const messages = await fullCtx.sock.loadMessagesInChat(fullCtx.remoteJid, undefined, 10)

    if (!messages || messages.length === 0) {
      logCommandExecution('clearchat', fullCtx, true, { messagesCleared: 0 })
      return successResponse('ℹ️ No hay mensajes para limpiar.', { metadata: { messagesCleared: 0 } })
    }

    await fullCtx.sock.chatModify(
      {
        clear: {
          messages: messages.map((m) => ({
            id: m.key.id,
            fromMe: m.key.fromMe,
            timestamp: m.messageTimestamp,
          })),
        },
      },
      fullCtx.remoteJid
    )

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'clearchat', executor: executorInfo.number, messagesCleared: messages.length, chat: fullCtx.remoteJid },
      `🧹 ${messages.length} últimos mensajes borrados por ${executorInfo.mention}`
    )

    logCommandExecution('clearchat', fullCtx, true, { executor: executorInfo.number, messagesCleared: messages.length })

    return successResponse(`🧹 ${messages.length} últimos mensajes borrados para ti.`, {
      metadata: { executor: executorInfo.number, messagesCleared: messages.length },
    })
  } catch (e) {
    logCommandError('clearchat', ctx, e)
    return errorResponse('⚠️ Error al limpiar el chat.', { command: 'clearchat', error: e.message })
  }
}

export async function enableDisappearing(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'enabledisappearing_command')

    if (fullCtx.isGroup) {
      const adminCheck = await validateAdminInGroup(fullCtx)
      if (!adminCheck.valid) {
        logCommandExecution('enabledisappearing', fullCtx, false, { reason: adminCheck.reason })
        return errorResponse(adminCheck.message, { command: 'enabledisappearing', reason: adminCheck.reason })
      }

      const botAdminCheck = await validateBotAdminInGroup(fullCtx)
      if (!botAdminCheck.valid) {
        logCommandExecution('enabledisappearing', fullCtx, false, { reason: botAdminCheck.reason })
        return errorResponse(botAdminCheck.message, { command: 'enabledisappearing', reason: botAdminCheck.reason })
      }
    }

    const days = parseInt(fullCtx.args?.[0]) || 7
    const validDays = [0, 1, 7, 30, 90]

    if (!validDays.includes(days)) {
      logCommandExecution('enabledisappearing', fullCtx, false, { reason: 'invalid_days' })
      return errorResponse(`❌ Días válidos: ${validDays.join(', ')}`, {
        command: 'enabledisappearing',
        reason: 'invalid_days',
        validDays,
      })
    }

    const seconds = days * 86400
    await fullCtx.sock.sendMessage(fullCtx.remoteJid, {
      disappearingMessagesInChat: seconds || false,
    })

    const label = days === 0 ? 'Deshabilitado' : `${days} día(s)`
    const executorInfo = extractUserInfo(fullCtx.sender)

    logger.info(
      { scope: 'command', command: 'enabledisappearing', executor: executorInfo.number, days, chat: fullCtx.remoteJid },
      `⏰ Mensajes efímeros configurados a ${label} por ${executorInfo.mention}`
    )

    logCommandExecution('enabledisappearing', fullCtx, true, { executor: executorInfo.number, days })

    return successResponse(`⏰ Mensajes efímeros: ${label}`, {
      metadata: { executor: executorInfo.number, days, seconds },
    })
  } catch (e) {
    logCommandError('enabledisappearing', ctx, e)
    return errorResponse('⚠️ Error al configurar mensajes efímeros.', { command: 'enabledisappearing', error: e.message })
  }
}

export async function disableDisappearing(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'disabledisappearing_command')

    await fullCtx.sock.sendMessage(fullCtx.remoteJid, {
      disappearingMessagesInChat: false,
    })

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'disabledisappearing', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `⏰ Mensajes efímeros deshabilitados por ${executorInfo.mention}`
    )

    logCommandExecution('disabledisappearing', fullCtx, true, { executor: executorInfo.number })

    return successResponse('⏰ Mensajes efímeros deshabilitados.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('disabledisappearing', ctx, e)
    return errorResponse('⚠️ Error al desactivar mensajes efímeros.', { command: 'disabledisappearing', error: e.message })
  }
}

export async function readMessage(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'readmessage_command')

    if (!fullCtx.quoted || !fullCtx.quoted.key) {
      logCommandExecution('readmessage', fullCtx, false, { reason: 'no_quoted' })
      return errorResponse('❌ Responde al mensaje a marcar como leído.', { command: 'readmessage', reason: 'no_quoted' })
    }

    await fullCtx.sock.readMessages([fullCtx.quoted.key])

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'readmessage', executor: executorInfo.number, messageId: fullCtx.quoted.key.id },
      `✅ Mensaje marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('readmessage', fullCtx, true, { executor: executorInfo.number })

    return successResponse('✅ Mensaje marcado como leído.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('readmessage', ctx, e)
    return errorResponse('⚠️ Error al marcar mensaje como leído.', { command: 'readmessage', error: e.message })
  }
}

export async function readMessages(ctx) {
  try {
    const fullCtx = await buildCommandContext(ctx.sock, ctx.message, ctx.remoteJid, ctx.sender, ctx.pushName)
    logContext(fullCtx, 'readmessages_command')

    await fullCtx.sock.chatModify({ markRead: true }, fullCtx.remoteJid)

    const executorInfo = extractUserInfo(fullCtx.sender)
    logger.info(
      { scope: 'command', command: 'readmessages', executor: executorInfo.number, chat: fullCtx.remoteJid },
      `✅ Chat marcado como leído por ${executorInfo.mention}`
    )

    logCommandExecution('readmessages', fullCtx, true, { executor: executorInfo.number })

    return successResponse('✅ Chat marcado como leído.', { metadata: { executor: executorInfo.number } })
  } catch (e) {
    logCommandError('readmessages', ctx, e)
    return errorResponse('⚠️ Error al marcar chat como leído.', { command: 'readmessages', error: e.message })
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
