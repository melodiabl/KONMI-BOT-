import logger from '../config/logger.js'

export async function editMessage(ctx) {
  const { args, quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje que deseas editar' }
  }

  const newText = args.join(' ')
  if (!newText) {
    return { success: false, message: '❌ Proporciona el nuevo texto' }
  }

  try {
    await sock.sendMessage(remoteJid, {
      text: newText,
      edit: quoted.key
    })
    return { success: true, message: '✅ Mensaje editado' }
  } catch (error) {
    logger.error('Error editando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function deleteMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje que deseas eliminar' }
  }

  try {
    await sock.sendMessage(remoteJid, { delete: quoted.key })
    return { success: true, message: '✅ Mensaje eliminado para todos' }
  } catch (error) {
    logger.error('Error eliminando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function reactMessage(ctx) {
  const { args, quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje para reaccionar' }
  }

  const emoji = args[0] || '👍'

  try {
    await sock.sendMessage(remoteJid, {
      react: {
        text: emoji,
        key: quoted.key
      }
    })
    return { success: true, message: `✅ Reacción ${emoji} enviada` }
  } catch (error) {
    logger.error('Error reaccionando:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function removeReaction(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje para remover reacción' }
  }

  try {
    await sock.sendMessage(remoteJid, {
      react: {
        text: '',
        key: quoted.key
      }
    })
    return { success: true, message: '✅ Reacción removida' }
  } catch (error) {
    logger.error('Error removiendo reacción:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function pinMessage(ctx) {
  const { args, quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje a fijar' }
  }

  const timeStr = args[0] || '24h'
  const timeMap = {
    '24h': 86400,
    '7d': 604800,
    '30d': 2592000
  }
  const time = timeMap[timeStr] || 86400

  try {
    await sock.sendMessage(remoteJid, {
      pin: {
        type: 1,
        time: time,
        key: quoted.key
      }
    })
    return { success: true, message: `✅ Mensaje fijado por ${timeStr}` }
  } catch (error) {
    logger.error('Error fijando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unpinMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje a desfijar' }
  }

  try {
    await sock.sendMessage(remoteJid, {
      pin: {
        type: 0,
        key: quoted.key
      }
    })
    return { success: true, message: '✅ Mensaje desfijado' }
  } catch (error) {
    logger.error('Error desfijando mensaje:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function starMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje para marcar como favorito' }
  }

  try {
    await sock.chatModify({
      star: {
        messages: [
          {
            id: quoted.key.id,
            fromMe: quoted.key.fromMe || false
          }
        ],
        star: true
      }
    }, remoteJid)
    return { success: true, message: '⭐ Mensaje marcado como favorito' }
  } catch (error) {
    logger.error('Error marcando como favorito:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unstarMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje' }
  }

  try {
    await sock.chatModify({
      star: {
        messages: [
          {
            id: quoted.key.id,
            fromMe: quoted.key.fromMe || false
          }
        ],
        star: false
      }
    }, remoteJid)
    return { success: true, message: '✅ Marcado como no favorito' }
  } catch (error) {
    logger.error('Error removiendo favorito:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Marcar chat como leído
export async function readMessage(ctx) {
  const { quoted, remoteJid, sock } = ctx

  if (!quoted || !quoted.key) {
    return { success: false, message: '❌ Responde al mensaje' }
  }

  try {
    await sock.chatModify({
      read: true,
      jid: remoteJid
    }, remoteJid)
    return { success: true, message: '✅ Mensaje marcado como leído' }
  } catch (error) {
    logger.error('Error marcando como leído:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
