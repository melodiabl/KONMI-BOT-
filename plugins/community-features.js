// commands/community-features.js
// Funcionalidades avanzadas de comunidades de WhatsApp

import logger from './config/logger.js'

// Crear comunidad
export async function createCommunity(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede crear comunidades' }
  }

  if (args.length < 1) {
    return { success: false, message: '❌ Uso: /createcommunity [nombre]' }
  }

  const name = args.join(' ')

  try {
    const community = await sock.communityCreate(name, 'Comunidad creada con Konmi Bot')
    if (!community) {
      return { success: false, message: '❌ Error creando comunidad' }
    }

    return {
      success: true,
      message: `✅ Comunidad "${name}" creada exitosamente\n\n📝 *JID:* ${community.id}\n👥 *Tipo:* Comunidad`
    }
  } catch (error) {
    logger.error('Error creando comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Crear grupo en comunidad
export async function createCommunityGroup(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede crear grupos en comunidades' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /createcommunitygroup [JID_comunidad] [nombre_grupo]' }
  }

  const communityJid = args[0]
  const groupName = args.slice(1).join(' ')

  try {
    const group = await sock.communityCreateGroup(groupName, [], communityJid)
    if (!group) {
      return { success: false, message: '❌ Error creando grupo en comunidad' }
    }

    return {
      success: true,
      message: `✅ Grupo "${groupName}" creado en comunidad\n\n📝 *JID:* ${group.id}\n👥 *Tipo:* Grupo de Comunidad`
    }
  } catch (error) {
    logger.error('Error creando grupo en comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Unir grupo a comunidad
export async function linkGroupToCommunity(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede vincular grupos a comunidades' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /linkgroup [JID_grupo] [JID_comunidad]' }
  }

  const groupJid = args[0]
  const communityJid = args[1]

  try {
    await sock.communityLinkGroup(groupJid, communityJid)
    return { success: true, message: '✅ Grupo vinculado a comunidad exitosamente' }
  } catch (error) {
    logger.error('Error vinculando grupo a comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Desvincular grupo de comunidad
export async function unlinkGroupFromCommunity(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede desvincular grupos de comunidades' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /unlinkgroup [JID_grupo] [JID_comunidad]' }
  }

  const groupJid = args[0]
  const communityJid = args[1]

  try {
    await sock.communityUnlinkGroup(groupJid, communityJid)
    return { success: true, message: '✅ Grupo desvinculado de comunidad exitosamente' }
  } catch (error) {
    logger.error('Error desvinculando grupo de comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener información de comunidad
export async function getCommunityInfo(ctx) {
  const { args, remoteJid, sock } = ctx

  const communityJid = args[0] || remoteJid

  try {
    const community = await sock.communityMetadata(communityJid)
    if (!community) {
      return { success: false, message: '❌ Comunidad no encontrada' }
    }

    const linkedGroups = await sock.communityFetchLinkedGroups(communityJid)

    let message = `🏘️ *Información de Comunidad*

📝 *Nombre:* ${community.subject || 'Sin nombre'}
👑 *Creador:* ${community.creator || 'Desconocido'}
📅 *Creado:* ${community.creation ? new Date(community.creation * 1000).toLocaleDateString() : 'Desconocido'}
👥 *Miembros:* ${community.participants?.length || 0}
📝 *Descripción:* ${community.desc || 'Sin descripción'}

🔗 *Grupos Vinculados:* ${linkedGroups.linkedGroups?.length || 0}
`

    if (linkedGroups.linkedGroups?.length > 0) {
      message += '\n*Grupos:*\n'
      linkedGroups.linkedGroups.slice(0, 5).forEach((group, index) => {
        message += `${index + 1}. ${group.subject || 'Sin nombre'}\n`
      })
      if (linkedGroups.linkedGroups.length > 5) {
        message += `... y ${linkedGroups.linkedGroups.length - 5} más`
      }
    }

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo información de comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Cambiar nombre de comunidad
export async function changeCommunityName(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede cambiar nombres de comunidades' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /communityname [JID_comunidad] [nuevo_nombre]' }
  }

  const communityJid = args[0]
  const newName = args.slice(1).join(' ')

  try {
    await sock.communityUpdateSubject(communityJid, newName)
    return { success: true, message: `✅ Nombre de comunidad cambiado a "${newName}"` }
  } catch (error) {
    logger.error('Error cambiando nombre de comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Cambiar descripción de comunidad
export async function changeCommunityDescription(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede cambiar descripciones de comunidades' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /communitydesc [JID_comunidad] [nueva_descripción]' }
  }

  const communityJid = args[0]
  const newDescription = args.slice(1).join(' ')

  try {
    await sock.communityUpdateDescription(communityJid, newDescription)
    return { success: true, message: '✅ Descripción de comunidad actualizada' }
  } catch (error) {
    logger.error('Error cambiando descripción de comunidad:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Configurar modo de aprobación de comunidad
export async function setCommunityApprovalMode(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede configurar modos de aprobación' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /communityapproval [JID_comunidad] [on|off]' }
  }

  const communityJid = args[0]
  const mode = args[1].toLowerCase()

  if (!['on', 'off'].includes(mode)) {
    return { success: false, message: '❌ Modo debe ser "on" o "off"' }
  }

  try {
    await sock.communityJoinApprovalMode(communityJid, mode)
    return {
      success: true,
      message: `✅ Modo de aprobación de comunidad ${mode === 'on' ? 'activado' : 'desactivado'}`
    }
  } catch (error) {
    logger.error('Error configurando modo de aprobación:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Configurar modo de adición de miembros
export async function setCommunityMemberAddMode(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede configurar modos de adición de miembros' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /communitymembermode [JID_comunidad] [all_member_add|admin_add]' }
  }

  const communityJid = args[0]
  const mode = args[1].toLowerCase()

  if (!['all_member_add', 'admin_add'].includes(mode)) {
    return { success: false, message: '❌ Modo debe ser "all_member_add" o "admin_add"' }
  }

  try {
    await sock.communityMemberAddMode(communityJid, mode)
    const modeText = mode === 'all_member_add' ? 'todos los miembros' : 'solo admins'
    return {
      success: true,
      message: `✅ Modo de adición de miembros configurado: ${modeText}`
    }
  } catch (error) {
    logger.error('Error configurando modo de adición de miembros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Activar mensajes efímeros en comunidad
export async function setCommunityEphemeral(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede configurar mensajes efímeros' }
  }

  if (args.length < 2) {
    return { success: false, message: '❌ Uso: /communityephemeral [JID_comunidad] [tiempo_segundos]\n\nEjemplos:\n• 86400 (24 horas)\n• 604800 (7 días)\n• 0 (desactivar)' }
  }

  const communityJid = args[0]
  const ephemeralExpiration = parseInt(args[1])

  if (isNaN(ephemeralExpiration) || ephemeralExpiration < 0) {
    return { success: false, message: '❌ El tiempo debe ser un número válido en segundos (0 para desactivar)' }
  }

  try {
    await sock.communityToggleEphemeral(communityJid, ephemeralExpiration)
    const status = ephemeralExpiration > 0 ? `activados (${Math.floor(ephemeralExpiration / 3600)}h)` : 'desactivados'
    return {
      success: true,
      message: `✅ Mensajes efímeros en comunidad ${status}`
    }
  } catch (error) {
    logger.error('Error configurando mensajes efímeros:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Obtener lista de solicitudes de unión
export async function getCommunityRequests(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede ver solicitudes de unión' }
  }

  const communityJid = args[0] || remoteJid

  try {
    const requests = await sock.communityRequestParticipantsList(communityJid)
    if (!requests || requests.length === 0) {
      return { success: false, message: '❌ No hay solicitudes pendientes' }
    }

    let message = `📋 *Solicitudes de Unión a Comunidad*\n\n`
    requests.slice(0, 10).forEach((request, index) => {
      message += `${index + 1}. ${request.jid?.split('@')[0] || 'Usuario desconocido'}\n`
    })

    if (requests.length > 10) {
      message += `\n... y ${requests.length - 10} solicitudes más`
    }

    message += `\n\nUsa /approvereq [JID] para aprobar\nUsa /rejectreq [JID] para rechazar`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo solicitudes:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Aprobar solicitud de unión
export async function approveCommunityRequest(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede aprobar solicitudes' }
  }

  if (args.length < 1) {
    return { success: false, message: '❌ Uso: /approvereq [JID_usuario]' }
  }

  const userJid = args[0]
  const communityJid = args[1] || remoteJid

  try {
    await sock.communityRequestParticipantsUpdate(communityJid, [userJid], 'approve')
    return { success: true, message: '✅ Solicitud aprobada' }
  } catch (error) {
    logger.error('Error aprobando solicitud:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

// Rechazar solicitud de unión
export async function rejectCommunityRequest(ctx) {
  const { args, remoteJid, sock, isOwner } = ctx

  if (!isOwner) {
    return { success: false, message: '❌ Solo el owner puede rechazar solicitudes' }
  }

  if (args.length < 1) {
    return { success: false, message: '❌ Uso: /rejectreq [JID_usuario]' }
  }

  const userJid = args[0]
  const communityJid = args[1] || remoteJid

  try {
    await sock.communityRequestParticipantsUpdate(communityJid, [userJid], 'reject')
    return { success: true, message: '✅ Solicitud rechazada' }
  } catch (error) {
    logger.error('Error rechazando solicitud:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export default {
  createCommunity,
  createCommunityGroup,
  linkGroupToCommunity,
  unlinkGroupFromCommunity,
  getCommunityInfo,
  changeCommunityName,
  changeCommunityDescription,
  setCommunityApprovalMode,
  setCommunityMemberAddMode,
  setCommunityEphemeral,
  getCommunityRequests,
  approveCommunityRequest,
  rejectCommunityRequest
}