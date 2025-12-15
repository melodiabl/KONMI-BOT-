import logger from './config/logger.js'

export async function blockUser(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    await sock.updateBlockStatus(jid, 'block')
    return { success: true, message: `✅ Usuario bloqueado` }
  } catch (error) {
    logger.error('Error bloqueando usuario:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function unblockUser(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    await sock.updateBlockStatus(jid, 'unblock')
    return { success: true, message: `✅ Usuario desbloqueado` }
  } catch (error) {
    logger.error('Error desbloqueando usuario:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getBlockList(ctx) {
  const { sock } = ctx

  try {
    const blocklist = await sock.fetchBlocklist()
    if (!blocklist || blocklist.length === 0) {
      return { success: true, message: '✅ No tienes usuarios bloqueados' }
    }

    let message = '🚫 *Usuarios Bloqueados:*\n'
    blocklist.forEach((jid, idx) => {
      message += `${idx + 1}. ${jid}\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo lista de bloqueados:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getPrivacySettings(ctx) {
  const { sock } = ctx

  try {
    const settings = await sock.getPrivacy()
    
    let message = '🔒 *Configuración de Privacidad:*\n'
    message += `LastSeen: ${settings.readreceipts || 'N/D'}\n`
    message += `Online: ${settings.online || 'N/D'}\n`
    message += `ProfilePicture: ${settings.profilePicture || 'N/D'}\n`
    message += `Status: ${settings.status || 'N/D'}\n`
    message += `ReadReceipts: ${settings.readreceipts || 'N/D'}\n`
    message += `GroupAdd: ${settings.groupAdd || 'N/D'}`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateLastSeenPrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      readreceipts: setting
    })
    return { success: true, message: `✅ Privacidad LastSeen: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateOnlinePrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      online: setting
    })
    return { success: true, message: `✅ Privacidad Online: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateProfilePicturePrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      profilePicture: setting
    })
    return { success: true, message: `✅ Privacidad de Foto: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateStatusPrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      status: setting
    })
    return { success: true, message: `✅ Privacidad de Estado: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateReadReceiptsPrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      readreceipts: setting
    })
    return { success: true, message: `✅ Privacidad de Confirmación: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateGroupAddPrivacy(ctx) {
  const { args, sock } = ctx
  const setting = args[0]

  const validSettings = ['all', 'contacts', 'none']
  if (!validSettings.includes(setting)) {
    return { 
      success: false, 
      message: `❌ Opciones: ${validSettings.join(', ')}` 
    }
  }

  try {
    await sock.updatePrivacySettings({
      groupAdd: setting
    })
    return { success: true, message: `✅ Privacidad de Agregar a Grupo: ${setting}` }
  } catch (error) {
    logger.error('Error actualizando privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateDefaultDisappearing(ctx) {
  const { args, sock } = ctx
  const days = parseInt(args[0])

  const validDays = [0, 1, 7, 30, 90]
  if (!validDays.includes(days)) {
    return { 
      success: false, 
      message: `❌ Opciones válidas (días): ${validDays.join(', ')}` 
    }
  }

  try {
    await sock.updateDefaultDisappearingMode(days)
    const label = days === 0 ? 'Deshabilitado' : `${days} días`
    return { success: true, message: `✅ Mensajes efímeros por defecto: ${label}` }
  } catch (error) {
    logger.error('Error actualizando mensajes efímeros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
