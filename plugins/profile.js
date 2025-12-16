import logger from './config/logger.js'

export async function getProfile(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID o teléfono' }
  }

  try {
    const [result] = await sock.onWhatsApp(jid)
    if (!result?.exists) {
      return { success: false, message: '❌ El usuario no existe en WhatsApp' }
    }

    const profilePicture = await sock.profilePictureUrl(result.jid, 'image')
    
    return { 
      success: true, 
      message: `✅ Perfil encontrado\nJID: ${result.jid}\nFoto: ${profilePicture || 'No disponible'}` 
    }
  } catch (error) {
    logger.error('Error obteniendo perfil:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getProfilePicture(ctx) {
  const { args, sock, remoteJid } = ctx
  const jid = args[0] || remoteJid

  try {
    const picUrl = await sock.profilePictureUrl(jid, 'image')
    if (!picUrl) {
      return { success: false, message: '❌ Usuario sin foto de perfil' }
    }

    await sock.sendMessage(remoteJid, { image: { url: picUrl } })
    return { success: true, message: '✅ Foto de perfil enviada' }
  } catch (error) {
    logger.error('Error obteniendo foto de perfil:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateProfileName(ctx) {
  const { args, sock } = ctx
  const newName = args.join(' ')

  if (!newName) {
    return { success: false, message: '❌ Proporciona el nuevo nombre' }
  }

  try {
    await sock.updateProfileName(newName)
    return { success: true, message: `✅ Nombre actualizado a: ${newName}` }
  } catch (error) {
    logger.error('Error actualizando nombre:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateProfileStatus(ctx) {
  const { args, sock } = ctx
  const status = args.join(' ')

  if (!status) {
    return { success: false, message: '❌ Proporciona el nuevo estado' }
  }

  try {
    await sock.updateProfileStatus(status)
    return { success: true, message: `✅ Estado actualizado` }
  } catch (error) {
    logger.error('Error actualizando estado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function updateProfilePicture(ctx) {
  const { args, sock } = ctx
  const imageUrl = args[0]

  if (!imageUrl) {
    return { success: false, message: '❌ Proporciona la URL de la imagen' }
  }

  try {
    await sock.updateProfilePicture(imageUrl)
    return { success: true, message: '✅ Foto de perfil actualizada' }
  } catch (error) {
    logger.error('Error actualizando foto de perfil:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function removeProfilePicture(ctx) {
  const { sock } = ctx

  try {
    await sock.removeProfilePicture()
    return { success: true, message: '✅ Foto de perfil removida' }
  } catch (error) {
    logger.error('Error removiendo foto de perfil:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getBusinessProfile(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    const profile = await sock.getBusinessProfile(jid)
    if (!profile) {
      return { success: false, message: '❌ No es un perfil de negocio' }
    }

    let info = `📱 *Perfil de Negocio*\n`
    info += `Descripción: ${profile.description || 'N/D'}\n`
    info += `Categoría: ${profile.category || 'N/D'}\n`
    info += `Email: ${profile.email || 'N/D'}\n`
    info += `Teléfono: ${profile.phone || 'N/D'}\n`
    info += `Sitio Web: ${profile.website || 'N/D'}`

    return { success: true, message: info }
  } catch (error) {
    logger.error('Error obteniendo perfil de negocio:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getPresence(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID' }
  }

  try {
    const presence = await sock.getPresence(jid)
    const statusMap = {
      'available': '🟢 Disponible',
      'unavailable': '⚫ No disponible',
      'composing': '✏️ Escribiendo',
      'paused': '⏸️ Escribió'
    }
    
    const status = statusMap[presence] || presence

    return { success: true, message: `${status}` }
  } catch (error) {
    logger.error('Error obteniendo presencia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendPresence(ctx) {
  const { args, remoteJid, sock } = ctx
  const presence = args[0] || 'available'

  const validPresences = ['available', 'unavailable', 'composing', 'recording', 'paused']
  if (!validPresences.includes(presence)) {
    return { 
      success: false, 
      message: `❌ Presencia válida: ${validPresences.join(', ')}` 
    }
  }

  try {
    await sock.sendPresenceUpdate(presence, remoteJid)
    return { success: true, message: `✅ Presencia actualizada: ${presence}` }
  } catch (error) {
    logger.error('Error actualizando presencia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function checkUserExists(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona un JID o teléfono' }
  }

  try {
    const [result] = await sock.onWhatsApp(jid)
    if (result?.exists) {
      return { success: true, message: `✅ El usuario existe: ${result.jid}` }
    } else {
      return { success: false, message: '❌ El usuario no está en WhatsApp' }
    }
  } catch (error) {
    logger.error('Error verificando usuario:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
