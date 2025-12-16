// commands/chat-management.js
// Gestión de chats

import logger from './config/logger.js'
import { getGroupRoles } from './utils/utils/group-helper.js'

const MUTE_TIMES = {
  '8h': 8 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

export async function muteChat(ctx) {
  const { args, remoteJid, sock, isGroup, isOwner, sender } = ctx

  if (isGroup) {
    try {
      const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
      if (!isAdmin && !isOwner) {
        return { success: false, message: '🚫 Solo administradores pueden silenciar chats en grupos' }
      }
      if (!isBotAdmin) {
        return { success: false, message: '🚫 El bot debe ser administrador para silenciar chats en grupos' }
      }
    } catch (e) {
      console.error('Error verificando roles:', e)
    }
  }

  const timeStr = args[0] || '8h'

  const time = MUTE_TIMES[timeStr]
  if (!time && timeStr !== 'forever') {
    return {
      success: false,
      message: `❌ Opciones: ${Object.keys(MUTE_TIMES).join(', ')}, forever`,
    }
  }

  try {
    const muteTime = timeStr === 'forever' ? true : time
    await sock.chatModify({ mute: muteTime }, remoteJid)
    const label = timeStr === 'forever' ? 'indefinidamente' : timeStr
    return { success: true, message: `🔇 Chat silenciado por ${label}` }
  } catch (error) {
    logger.error('Error silenciando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function unmuteChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ mute: null }, remoteJid)
    return { success: true, message: '🔊 Chat desilenciado' }
  } catch (error) {
    logger.error('Error desilenciando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function archiveChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ archive: true }, remoteJid)
    return { success: true, message: '📦 Chat archivado' }
  } catch (error) {
    logger.error('Error archivando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function unarchiveChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ archive: false }, remoteJid)
    return { success: true, message: '📂 Chat desarchivado' }
  } catch (error) {
    logger.error('Error desarchivando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function markChatRead(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ markRead: true }, remoteJid)
    return { success: true, message: '✅ Chat marcado como leido' }
  } catch (error) {
    logger.error('Error marcando chat leido:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function markChatUnread(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ markRead: false }, remoteJid)
    return { success: true, message: '❌ Chat marcado como no leido' }
  } catch (error) {
    logger.error('Error marcando chat no leido:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function deleteChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ delete: true }, remoteJid)
    return { success: true, message: '🗑️ Chat eliminado' }
  } catch (error) {
    logger.error('Error eliminando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function pinChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ pin: true }, remoteJid)
    return { success: true, message: '📌 Chat fijado' }
  } catch (error) {
    logger.error('Error fijando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function unpinChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ pin: false }, remoteJid)
    return { success: true, message: '📍 Chat desfijado' }
  } catch (error) {
    logger.error('Error desfijando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function clearChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const messages = await sock.loadMessagesInChat(remoteJid, undefined, 10)
    if (messages && messages.length > 0) {
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
        remoteJid,
      )
    }
    return { success: true, message: '🧹 ultimos mensajes borrados para ti' }
  } catch (error) {
    logger.error('Error limpiando chat:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function enableDisappearing(ctx) {
  const { args, remoteJid, sock, isGroup, isOwner, sender } = ctx

  if (isGroup) {
    try {
      const { isAdmin, isBotAdmin } = await getGroupRoles(sock, remoteJid, sender)
      if (!isAdmin && !isOwner) {
        return { success: false, message: '🚫 Solo administradores pueden cambiar mensajes efimeros en grupos' }
      }
      if (!isBotAdmin) {
        return { success: false, message: '🚫 El bot debe ser administrador para cambiar mensajes efimeros' }
      }
    } catch (e) {
      console.error('Error verificando roles:', e)
    }
  }

  const days = parseInt(args[0]) || 7

  const validDays = [0, 1, 7, 30, 90]
  if (!validDays.includes(days)) {
    return {
      success: false,
      message: `❌ Dias validos: ${validDays.join(', ')}`,
    }
  }

  try {
    const seconds = days * 86400
    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: seconds || false,
    })
    const label = days === 0 ? 'Deshabilitado' : `${days} dias`
    return { success: true, message: `⏰ Mensajes efimeros: ${label}` }
  } catch (error) {
    logger.error('Error habilitando efimeros:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function disableDisappearing(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: false,
    })
    return { success: true, message: '⏰ Mensajes efimeros deshabilitados' }
  } catch (error) {
    logger.error('Error deshabilitando efimeros:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function readMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje a marcar como leido' }
  }

  try {
    await sock.readMessages([quoted.key])
    return { success: true, message: '✅ Mensaje marcado como leido' }
  } catch (error) {
    logger.error('Error marcando mensaje leido:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
  }
}

export async function readMessages(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ markRead: true }, remoteJid)
    return { success: true, message: '✅ Chat marcado como leido' }
  } catch (error) {
    logger.error('Error marcando mensajes leidos:', error)
    return { success: false, message: `⚠️ Error: ${error.message}` }
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
