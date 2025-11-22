// commands/privacy-features.js
// Funcionalidades avanzadas de privacidad de WhatsApp

import logger from '../config/logger.js'

// Obtener configuración de privacidad
export async function getPrivacySettings(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const settings = await sock.fetchPrivacySettings(true)

    let message = '🔒 *Configuración de Privacidad*\n\n'

    // Estado en línea
    message += `👀 *Última conexión:* ${settings.privacy?.readreceipts || 'desconocido'}\n`

    // Recibos de lectura
    message += `📖 *Confirmación de lectura:* ${settings.privacy?.readreceipts || 'desconocido'}\n`

    // Foto de perfil
    message += `📸 *Foto de perfil:* ${settings.privacy?.profile || 'desconocido'}\n`

    // Estado
    message += `📝 *Estado:* ${settings.privacy?.status || 'desconocido'}\n`

    // Grupos
    message += `👥 *Agregar a grupos:* ${settings.privacy?.groupadd || 'desconocido'}\n`

    // Llamadas
    message += `📞 *Llamadas:* ${settings.privacy?.calladd || 'desconocido'}\n`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo configuración de privacidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de última conexión
export async function updateLastSeenPrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'contacts', 'contact_blacklist', 'none']
  const privacy = args[0] || 'contacts'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• contacts - Contactos\n• contact_blacklist - Excepto contactos bloqueados\n• none - Nadie`
    }
  }

  try {
    await sock.updateLastSeenPrivacy(privacy)
    return { success: true, message: `✅ Privacidad de "última conexión" actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de última conexión:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de estado en línea
export async function updateOnlinePrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'match_last_seen']
  const privacy = args[0] || 'match_last_seen'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• match_last_seen - Igual que "última conexión"`
    }
  }

  try {
    await sock.updateOnlinePrivacy(privacy)
    return { success: true, message: `✅ Privacidad de estado en línea actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de estado en línea:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de foto de perfil
export async function updateProfilePicturePrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'contacts', 'contact_blacklist', 'none']
  const privacy = args[0] || 'contacts'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• contacts - Contactos\n• contact_blacklist - Excepto contactos bloqueados\n• none - Nadie`
    }
  }

  try {
    await sock.updateProfilePicturePrivacy(privacy)
    return { success: true, message: `✅ Privacidad de foto de perfil actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de foto de perfil:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de estado
export async function updateStatusPrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'contacts', 'contact_blacklist', 'none']
  const privacy = args[0] || 'contacts'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• contacts - Contactos\n• contact_blacklist - Excepto contactos bloqueados\n• none - Nadie`
    }
  }

  try {
    await sock.updateStatusPrivacy(privacy)
    return { success: true, message: `✅ Privacidad de estado actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de estado:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de confirmación de lectura
export async function updateReadReceiptsPrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'none']
  const privacy = args[0] || 'all'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• none - Nadie`
    }
  }

  try {
    await sock.updateReadReceiptsPrivacy(privacy)
    return { success: true, message: `✅ Privacidad de confirmación de lectura actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de confirmación de lectura:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Actualizar privacidad de agregar a grupos
export async function updateGroupAddPrivacy(ctx) {
  const { args, remoteJid, sock } = ctx

  const options = ['all', 'contacts', 'contact_blacklist', 'none']
  const privacy = args[0] || 'all'

  if (!options.includes(privacy)) {
    return {
      success: false,
      message: `❌ Opción inválida. Opciones disponibles:\n• all - Todos\n• contacts - Contactos\n• contact_blacklist - Excepto contactos bloqueados\n• none - Nadie`
    }
  }

  try {
    await sock.updateGroupAddPrivacy(privacy)
    return { success: true, message: `✅ Privacidad de "agregar a grupos" actualizada: ${privacy}` }
  } catch (error) {
    logger.error('Error actualizando privacidad de agregar a grupos:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener lista de bloqueados
export async function getBlockList(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const blocked = await sock.fetchBlocklist()

    if (!blocked || blocked.length === 0) {
      return { success: false, message: '❌ No tienes usuarios bloqueados' }
    }

    let message = '🚫 *Lista de Usuarios Bloqueados*\n\n'
    blocked.forEach((jid, index) => {
      const number = jid?.split('@')[0] || 'desconocido'
      message += `${index + 1}. ${number}\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo lista de bloqueados:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Bloquear usuario
export async function blockUser(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0]
  if (!jid) {
    return { success: false, message: '❌ Uso: /block [número/JID]' }
  }

  try {
    await sock.updateBlockStatus(jid, 'block')
    return { success: true, message: '✅ Usuario bloqueado' }
  } catch (error) {
    logger.error('Error bloqueando usuario:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Desbloquear usuario
export async function unblockUser(ctx) {
  const { args, remoteJid, sock } = ctx

  const jid = args[0]
  if (!jid) {
    return { success: false, message: '❌ Uso: /unblock [número/JID]' }
  }

  try {
    await sock.updateBlockStatus(jid, 'unblock')
    return { success: true, message: '✅ Usuario desbloqueado' }
  } catch (error) {
    logger.error('Error desbloqueando usuario:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Agregar contacto
export async function addContact(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /addcontact [número] [nombre]' }
  }

  const number = args[0]
  const name = args.slice(1).join(' ')

  try {
    await sock.addOrEditContact(`${number}@s.whatsapp.net`, { name })
    return { success: true, message: `✅ Contacto "${name}" agregado` }
  } catch (error) {
    logger.error('Error agregando contacto:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Editar contacto
export async function editContact(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /editcontact [número] [nuevo_nombre]' }
  }

  const number = args[0]
  const name = args.slice(1).join(' ')

  try {
    await sock.addOrEditContact(`${number}@s.whatsapp.net`, { name })
    return { success: true, message: `✅ Contacto actualizado: "${name}"` }
  } catch (error) {
    logger.error('Error editando contacto:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Agregar respuesta rápida
export async function addQuickReply(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /addquickreply [atajo] [mensaje]' }
  }

  const shortcut = args[0]
  const message = args.slice(1).join(' ')

  try {
    await sock.addOrEditQuickReply({
      shortcut,
      message,
      keywords: [shortcut],
      count: 1
    })
    return { success: true, message: `✅ Respuesta rápida "${shortcut}" agregada` }
  } catch (error) {
    logger.error('Error agregando respuesta rápida:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Editar respuesta rápida
export async function editQuickReply(ctx) {
  const { args, remoteJid, sock } = ctx

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /editquickreply [atajo] [nuevo_mensaje]' }
  }

  const shortcut = args[0]
  const message = args.slice(1).join(' ')

  try {
    await sock.addOrEditQuickReply({
      shortcut,
      message,
      keywords: [shortcut],
      count: 1
    })
    return { success: true, message: `✅ Respuesta rápida "${shortcut}" actualizada` }
  } catch (error) {
    logger.error('Error editando respuesta rápida:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export default {
  getPrivacySettings,
  updateLastSeenPrivacy,
  updateOnlinePrivacy,
  updateProfilePicturePrivacy,
  updateStatusPrivacy,
  updateReadReceiptsPrivacy,
  updateGroupAddPrivacy,
  getBlockList,
  blockUser,
  unblockUser,
  addContact,
  editContact,
  addQuickReply,
  editQuickReply
}