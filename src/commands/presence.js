import logger from '../config/logger.js'

export async function setStatusOnline(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('available', remoteJid)
    return { success: true, message: '🟢 Estado: En línea' }
  } catch (error) {
    logger.error('Error estableciendo estado en línea:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function setStatusOffline(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('unavailable', remoteJid)
    return { success: true, message: '⚫ Estado: Desconectado' }
  } catch (error) {
    logger.error('Error estableciendo estado desconectado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function setStatusTyping(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('composing', remoteJid)
    return { success: true, message: '✏️ Estado: Escribiendo' }
  } catch (error) {
    logger.error('Error estableciendo estado escribiendo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function setStatusRecording(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('recording', remoteJid)
    return { success: true, message: '🎥 Estado: Grabando' }
  } catch (error) {
    logger.error('Error estableciendo estado grabando:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function setStatusPaused(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('paused', remoteJid)
    return { success: true, message: '⏸️ Estado: Pausado' }
  } catch (error) {
    logger.error('Error estableciendo estado pausado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getStatus(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    const presence = await sock.getPresence(jid)
    const statusMap = {
      'available': '🟢 En línea',
      'unavailable': '⚫ Desconectado',
      'composing': '✏️ Escribiendo',
      'recording': '🎥 Grabando',
      'paused': '⏸️ Pausado'
    }
    
    const status = statusMap[presence] || presence
    return { success: true, message: `📊 Estado: ${status}` }
  } catch (error) {
    logger.error('Error obteniendo estado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function subscribePresence(ctx) {
  const { args, sock, remoteJid } = ctx
  const jid = args[0] || remoteJid

  try {
    await sock.subscribePresence(jid)
    return { success: true, message: '✅ Suscrito a presencia' }
  } catch (error) {
    logger.error('Error suscribiéndose a presencia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unsubscribePresence(ctx) {
  const { args, sock, remoteJid } = ctx
  const jid = args[0] || remoteJid

  try {
    await sock.unsubscribePresence(jid)
    return { success: true, message: '✅ Desuscrito de presencia' }
  } catch (error) {
    logger.error('Error desuscribiéndose de presencia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getStatusText(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    const status = await sock.fetchStatus(jid)
    if (!status) {
      return { success: false, message: '❌ Usuario sin estado' }
    }

    let message = `📝 *Estado del Usuario:*\n`
    message += `Texto: ${status.status || 'N/D'}\n`
    message += `Actualizado: ${new Date(status.setAt * 1000).toLocaleString()}`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo texto de estado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function simulateTyping(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('composing', remoteJid)
    
    setTimeout(async () => {
      try {
        await sock.sendPresenceUpdate('paused', remoteJid)
      } catch (error) {
        logger.error('Error pausando escritura:', error)
      }
    }, 3000)

    return { success: true, message: '✏️ Simulando escritura...' }
  } catch (error) {
    logger.error('Error simulando escritura:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function simulateRecording(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.sendPresenceUpdate('recording', remoteJid)

    setTimeout(async () => {
      try {
        await sock.sendPresenceUpdate('paused', remoteJid)
      } catch (error) {
        logger.error('Error pausando grabación:', error)
      }
    }, 5000)

    return { success: true, message: '🎥 Simulando grabación...' }
  } catch (error) {
    logger.error('Error simulando grabación:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Funcionalidades avanzadas de presencia
export async function setCustomPresence(ctx) {
  const { args, remoteJid, sock } = ctx

  const presenceType = args[0] || 'available'
  const validTypes = ['available', 'unavailable', 'composing', 'recording', 'paused']

  if (!validTypes.includes(presenceType)) {
    return {
      success: false,
      message: `❌ Tipo de presencia inválido. Opciones: ${validTypes.join(', ')}`
    }
  }

  try {
    await sock.sendPresenceUpdate(presenceType, remoteJid)
    return { success: true, message: `✅ Presencia cambiada a: ${presenceType}` }
  } catch (error) {
    logger.error('Error setting custom presence:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function broadcastPresence(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede hacer broadcast de presencia' }
  }

  const presenceType = args[0] || 'available'
  const validTypes = ['available', 'unavailable']

  if (!validTypes.includes(presenceType)) {
    return {
      success: false,
      message: `❌ Tipo de presencia inválido para broadcast. Opciones: ${validTypes.join(', ')}`
    }
  }

  try {
    // Obtener todos los chats
    const chats = await sock.store?.chats?.keys() || []
    let successCount = 0

    for (const chatId of chats) {
      try {
        await sock.sendPresenceUpdate(presenceType, chatId)
        successCount++
      } catch (error) {
        // Ignorar errores individuales
      }
    }

    return { success: true, message: `✅ Presencia ${presenceType} enviada a ${successCount} chats` }
  } catch (error) {
    logger.error('Error broadcasting presence:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function monitorPresence(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0]
  const duration = parseInt(args[1]) || 30000 // 30 segundos por defecto

  if (!jid) {
    return { success: false, message: '❌ Uso: /monitorpresence [número/JID] [duración_ms]' }
  }

  try {
    // Suscribirse a presencia
    await sock.subscribePresence(jid)

    // Monitorear por el tiempo especificado
    setTimeout(async () => {
      try {
        const presence = await sock.getPresence(jid)
        const statusMessage = presence ?
          `📊 Estado actual: ${presence.lastKnownPresence || 'Desconocido'}` :
          '❌ No se pudo obtener presencia'

        await sock.sendMessage(remoteJid, {
          text: `⏰ *Monitoreo de presencia finalizado*\n\n👤 Usuario: ${jid.split('@')[0]}\n${statusMessage}`
        })
      } catch (error) {
        logger.error('Error finalizando monitoreo de presencia:', error)
      }
    }, duration)

    return {
      success: true,
      message: `✅ Monitoreando presencia de ${jid.split('@')[0]} por ${duration}ms`
    }
  } catch (error) {
    logger.error('Error monitoring presence:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getPresence(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0] || remoteJid.replace('@g.us', '@s.whatsapp.net')

  try {
    const presence = await sock.getPresence(jid)
    if (!presence) {
      return { success: false, message: '❌ No se pudo obtener la presencia' }
    }

    let message = `👀 *Presencia de ${jid.split('@')[0]}*\n\n`
    message += `📊 *Estado:* ${presence.lastKnownPresence || 'Desconocido'}\n`
    message += `🕒 *Última vez:* ${presence.lastSeen ? new Date(presence.lastSeen * 1000).toLocaleString() : 'Nunca'}\n`

    return { success: true, message }
  } catch (error) {
    logger.error('Error getting presence:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
