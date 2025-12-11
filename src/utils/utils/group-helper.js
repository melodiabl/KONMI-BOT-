import antibanSystem from './anti-ban.js'
import logger from '../../config/logger.js'

const onlyDigits = (v) => String(v || '').replace(/\D/g, '')

const normalizeDigits = (userOrJid) => {
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@')
    if (at > 0) s = s.slice(0, at)
    const col = s.indexOf(':')
    if (col > 0) s = s.slice(0, col)
    return s.replace(/\D/g, '')
  } catch {
    return onlyDigits(userOrJid)
  }
}

const isAdminFlag = (p) => {
  try {
    if (!p) return false
    if (p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner') return true
    if (p.isAdmin === true || p.isSuperAdmin === true) return true
    if (typeof p.privilege === 'string' && /admin/i.test(p.privilege)) return true
    return false
  } catch {
    return false
  }
}

const sameUser = (a, b) => {
  if (!a || !b) return false
  return normalizeDigits(a) === normalizeDigits(b)
}

export async function safeGetGroupMetadata(socket, groupJid) {
  try {
    return await antibanSystem.queryGroupMetadata(socket, groupJid)
  } catch (error) {
    logger.error(`Failed to get group metadata for ${groupJid}:`, error.message)
    throw error
  }
}

export async function safeGetGroupParticipants(socket, groupJid) {
  try {
    return await antibanSystem.fetchGroupParticipants(socket, groupJid)
  } catch (error) {
    logger.error(`Failed to get participants for ${groupJid}:`, error.message)
    throw error
  }
}

export async function getGroupAdmin(socket, groupJid) {
  try {
    const metadata = await safeGetGroupMetadata(socket, groupJid)
    return metadata.participants?.find((p) => p.admin === 'admin' || p.admin === 'superadmin')
  } catch (error) {
    logger.error(`Failed to get group admin for ${groupJid}:`, error.message)
    return null
  }
}

export async function getGroupOwner(socket, groupJid) {
  try {
    const metadata = await safeGetGroupMetadata(socket, groupJid)
    return metadata.participants?.find((p) => p.admin === 'owner')
  } catch (error) {
    logger.error(`Failed to get group owner for ${groupJid}:`, error.message)
    return null
  }
}

export async function getGroupAdmins(socket, groupJid) {
  try {
    const metadata = await safeGetGroupMetadata(socket, groupJid)
    return metadata.participants?.filter(
      (p) => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === 'owner'
    ) || []
  } catch (error) {
    logger.error(`Failed to get group admins for ${groupJid}:`, error.message)
    return []
  }
}

export function clearGroupCache(groupJid) {
  antibanSystem.clearGroupCache(groupJid)
}

export function getCacheInfo() {
  return antibanSystem.getCacheStats()
}

export function getCachedGroupInfo(groupJid) {
  return antibanSystem.getGroupInfoFromCache(groupJid)
}

/**
 * Obtiene metadata de grupo usando la caché del sistema anti-ban.
 * Atajo conveniente para comandos.
 */
export async function getGroupMetadataCached(socket, groupJid) {
  return safeGetGroupMetadata(socket, groupJid)
}

/**
 * Calcula roles de grupo (isAdmin / isBotAdmin) a partir de la metadata,
 * usando identificadores normalizados para evitar problemas de formato.
 */
export async function getGroupRoles(socket, groupJid, senderJid) {
  try {
    const metadata = await safeGetGroupMetadata(socket, groupJid)
    const participants = Array.isArray(metadata?.participants) ? metadata.participants : []

    const senderInfo = participants.find((p) =>
      sameUser(p.id || p.jid || p.lid, senderJid)
    )

    const isAdmin = isAdminFlag(senderInfo)

    const botJid = socket?.user?.id || null
    const botInfo = participants.find((p) =>
      sameUser(p.id || p.jid || p.lid, botJid)
    )

    const isBotAdmin = isAdminFlag(botInfo)

    logger.whatsapp?.metadata?.('Roles de grupo calculados', {
      groupId: groupJid,
      sender: senderJid,
      isAdmin,
      isBotAdmin,
      hasParticipants: participants.length > 0,
    })

    return { metadata, isAdmin, isBotAdmin }
  } catch (error) {
    logger.whatsapp?.metadata?.('Error calculando roles de grupo', {
      groupId: groupJid,
      sender: senderJid,
      error: error?.message || String(error),
    })
    return { metadata: null, isAdmin: false, isBotAdmin: false }
  }
}
