import logger from '../config/logger.js'

const MUTE_TIMES = {
  '8h': 8 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

export async function muteChat(ctx) {
  const { args, remoteJid, sock } = ctx
  const timeStr = args[0] || '8h'

  const time = MUTE_TIMES[timeStr]
  if (!time && timeStr !== 'forever') {
    return { 
      success: false, 
      message: `❌ Opciones: ${Object.keys(MUTE_TIMES).join(', ')}, forever` 
    }
  }

  try {
    const muteTime = timeStr === 'forever' ? true : time
    await sock.chatModify({ mute: muteTime }, remoteJid)
    const label = timeStr === 'forever' ? 'indefinidamente' : timeStr
    return { success: true, message: `🔇 Chat silenciado por ${label}` }
  } catch (error) {
    logger.error('Error silenciando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unmuteChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ mute: null }, remoteJid)
    return { success: true, message: '🔊 Chat desilenciado' }
  } catch (error) {
    logger.error('Error desilenciando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function archiveChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const lastMsg = await sock.loadMessage(remoteJid)
    if (lastMsg) {
      await sock.chatModify({ 
        archive: true, 
        lastMessages: [lastMsg] 
      }, remoteJid)
    } else {
      await sock.chatModify({ archive: true }, remoteJid)
    }
    return { success: true, message: '📦 Chat archivado' }
  } catch (error) {
    logger.error('Error archivando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unarchiveChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ archive: false }, remoteJid)
    return { success: true, message: '📬 Chat desarchivado' }
  } catch (error) {
    logger.error('Error desarchivando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function markChatRead(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const lastMsg = await sock.loadMessage(remoteJid)
    if (lastMsg) {
      await sock.chatModify({ 
        markRead: true, 
        lastMessages: [lastMsg] 
      }, remoteJid)
    }
    return { success: true, message: '✅ Chat marcado como leído' }
  } catch (error) {
    logger.error('Error marcando chat leído:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function markChatUnread(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const lastMsg = await sock.loadMessage(remoteJid)
    if (lastMsg) {
      await sock.chatModify({ 
        markRead: false, 
        lastMessages: [lastMsg] 
      }, remoteJid)
    }
    return { success: true, message: '🔵 Chat marcado como no leído' }
  } catch (error) {
    logger.error('Error marcando chat no leído:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function deleteChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const lastMsg = await sock.loadMessage(remoteJid)
    if (lastMsg) {
      await sock.chatModify({ 
        delete: true, 
        lastMessages: [
          {
            key: lastMsg.key,
            messageTimestamp: lastMsg.messageTimestamp
          }
        ]
      }, remoteJid)
    }
    return { success: true, message: '🗑️ Chat eliminado' }
  } catch (error) {
    logger.error('Error eliminando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function pinChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ pin: true }, remoteJid)
    return { success: true, message: '📌 Chat fijado' }
  } catch (error) {
    logger.error('Error fijando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unpinChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.chatModify({ pin: false }, remoteJid)
    return { success: true, message: '📍 Chat desfijado' }
  } catch (error) {
    logger.error('Error desfijando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function clearChat(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const messages = await sock.loadMessagesInChat(remoteJid, undefined, 10)
    if (messages && messages.length > 0) {
      await sock.chatModify({
        clear: {
          messages: messages.map(m => ({
            id: m.key.id,
            fromMe: m.key.fromMe,
            timestamp: m.messageTimestamp
          }))
        }
      }, remoteJid)
    }
    return { success: true, message: '✨ Últimos mensajes borrados para ti' }
  } catch (error) {
    logger.error('Error limpiando chat:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function enableDisappearing(ctx) {
  const { args, remoteJid, sock } = ctx
  const days = parseInt(args[0]) || 7

  const validDays = [0, 1, 7, 30, 90]
  if (!validDays.includes(days)) {
    return { 
      success: false, 
      message: `❌ Días válidos: ${validDays.join(', ')}` 
    }
  }

  try {
    const seconds = days * 86400
    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: seconds || false
    })
    const label = days === 0 ? 'Deshabilitado' : `${days} días`
    return { success: true, message: `⏰ Mensajes efímeros: ${label}` }
  } catch (error) {
    logger.error('Error habilitando efímeros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function disableDisappearing(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendMessage(remoteJid, {
      disappearingMessagesInChat: false
    })
    return { success: true, message: '✅ Mensajes efímeros deshabilitados' }
  } catch (error) {
    logger.error('Error deshabilitando efímeros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function readMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje a marcar como leído' }
  }

  try {
    await sock.readMessages([quoted.key])
    return { success: true, message: '✅ Mensaje marcado como leído' }
  } catch (error) {
    logger.error('Error marcando mensaje leído:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function readMessages(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const messages = await sock.loadMessagesInChat(remoteJid, undefined, 50)
    if (messages && messages.length > 0) {
      const keys = messages.map(m => m.key)
      await sock.readMessages(keys)
    }
    return { success: true, message: '✅ Últimos mensajes marcados como leídos' }
  } catch (error) {
    logger.error('Error marcando mensajes leídos:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
