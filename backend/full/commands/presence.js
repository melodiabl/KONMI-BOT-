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
