import logger from '../config/logger.js'

export async function createGroup(ctx) {
  const { args, sock, sender } = ctx
  const [groupName, ...participants] = args

  if (!groupName || participants.length === 0) {
    return { 
      success: false, 
      message: '❌ Uso: /creategroup [nombre] [participante1] [participante2] ...' 
    }
  }

  try {
    const jids = participants.map(p => {
      const digits = String(p).replace(/\D/g, '')
      return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null
    }).filter(Boolean)

    if (jids.length === 0) {
      return { success: false, message: '❌ No hay participantes válidos' }
    }

    const group = await sock.groupCreate(groupName, jids)
    return { success: true, message: `✅ Grupo creado: ${group.gid}` }
  } catch (error) {
    logger.error('Error creando grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getGroupInfo(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const metadata = await sock.groupMetadata(remoteJid)
    
    let info = `📋 *Información del Grupo*\n`
    info += `Nombre: ${metadata.subject}\n`
    info += `Descripción: ${metadata.desc || 'N/D'}\n`
    info += `Participantes: ${metadata.participants.length}\n`
    info += `Admins: ${metadata.participants.filter(p => p.admin).length}\n`
    info += `Creado: ${new Date(metadata.creation * 1000).toLocaleDateString()}`

    return { success: true, message: info }
  } catch (error) {
    logger.error('Error obteniendo info del grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function leaveGroup(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupLeave(remoteJid)
    return { success: true, message: '✅ Has salido del grupo' }
  } catch (error) {
    logger.error('Error saliendo del grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function changeGroupSubject(ctx) {
  const { args, remoteJid, sock } = ctx
  const newSubject = args.join(' ')

  if (!newSubject) {
    return { success: false, message: '❌ Proporciona el nuevo nombre' }
  }

  try {
    await sock.groupUpdateSubject(remoteJid, newSubject)
    return { success: true, message: `✅ Nombre del grupo actualizado` }
  } catch (error) {
    logger.error('Error actualizando nombre del grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function changeGroupDescription(ctx) {
  const { args, remoteJid, sock } = ctx
  const newDesc = args.join(' ')

  if (!newDesc) {
    return { success: false, message: '❌ Proporciona la nueva descripción' }
  }

  try {
    await sock.groupUpdateDescription(remoteJid, newDesc)
    return { success: true, message: `✅ Descripción actualizada` }
  } catch (error) {
    logger.error('Error actualizando descripción:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function changeGroupPicture(ctx) {
  const { args, remoteJid, sock } = ctx
  const imageUrl = args[0]

  if (!imageUrl) {
    return { success: false, message: '❌ Proporciona la URL de la imagen' }
  }

  try {
    await sock.updateGroupPicture(remoteJid, imageUrl)
    return { success: true, message: '✅ Foto del grupo actualizada' }
  } catch (error) {
    logger.error('Error actualizando foto del grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function removeGroupPicture(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.removeGroupPicture(remoteJid)
    return { success: true, message: '✅ Foto del grupo removida' }
  } catch (error) {
    logger.error('Error removiendo foto del grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function toggleAnnouncement(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupSettingUpdate(remoteJid, 'announcement')
    return { success: true, message: '✅ Grupo en modo anuncio (solo admins escriben)' }
  } catch (error) {
    logger.error('Error actualizando modo anuncio:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function toggleAnnounceOff(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupSettingUpdate(remoteJid, 'not_announcement')
    return { success: true, message: '✅ Grupo: todos pueden escribir' }
  } catch (error) {
    logger.error('Error desactivando anuncio:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function toggleGroupLocked(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupSettingUpdate(remoteJid, 'locked')
    return { success: true, message: '✅ Grupo bloqueado (solo admins editarán configuración)' }
  } catch (error) {
    logger.error('Error bloqueando grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function toggleGroupUnlocked(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupSettingUpdate(remoteJid, 'unlocked')
    return { success: true, message: '✅ Grupo desbloqueado' }
  } catch (error) {
    logger.error('Error desbloqueando grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getGroupInviteCode(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const code = await sock.groupInviteCode(remoteJid)
    const url = `https://chat.whatsapp.com/${code}`
    return { success: true, message: `🔗 Enlace de invitación:\n${url}` }
  } catch (error) {
    logger.error('Error obteniendo código de invitación:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function revokeGroupInvite(ctx) {
  const { remoteJid, sock } = ctx

  try {
    await sock.groupRevokeInvite(remoteJid)
    return { success: true, message: '✅ Código de invitación revocado' }
  } catch (error) {
    logger.error('Error revocando invitación:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function joinGroupByCode(ctx) {
  const { args, sock } = ctx
  const code = args[0]

  if (!code) {
    return { success: false, message: '❌ Proporciona el código de invitación' }
  }

  try {
    const groupJid = await sock.groupAcceptInvite(code)
    return { success: true, message: `✅ Te uniste al grupo: ${groupJid}` }
  } catch (error) {
    logger.error('Error uniéndose al grupo:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function toggleEphemeral(ctx) {
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
    return { success: true, message: `✅ Mensajes efímeros: ${label}` }
  } catch (error) {
    logger.error('Error toggling efímeros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getGroupRequestList(ctx) {
  const { remoteJid, sock } = ctx

  try {
    const requests = await sock.groupRequestParticipantsList(remoteJid)
    if (!requests || requests.length === 0) {
      return { success: true, message: '✅ No hay solicitudes pendientes' }
    }

    let message = `📋 *Solicitudes de unirse:*\n`
    requests.forEach((req, idx) => {
      message += `${idx + 1}. ${req.jid}\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo solicitudes:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function approveGroupRequest(ctx) {
  const { args, remoteJid, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona el JID del usuario' }
  }

  try {
    await sock.groupRequestParticipantsUpdate(remoteJid, [jid], 'approve')
    return { success: true, message: '✅ Solicitud aprobada' }
  } catch (error) {
    logger.error('Error aprobando solicitud:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function rejectGroupRequest(ctx) {
  const { args, remoteJid, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona el JID del usuario' }
  }

  try {
    await sock.groupRequestParticipantsUpdate(remoteJid, [jid], 'reject')
    return { success: true, message: '✅ Solicitud rechazada' }
  } catch (error) {
    logger.error('Error rechazando solicitud:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
