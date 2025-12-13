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

const normalizeComparableKey = (userOrJid) => {
  try {
    const raw = String(userOrJid || '').trim()
    if (!raw) return { type: 'none', value: '' }

    const lower = raw.toLowerCase()
    let base = lower

    const at = base.indexOf('@')
    if (at > 0) base = base.slice(0, at)
    const col = base.indexOf(':')
    if (col > 0) base = base.slice(0, col)

    const digits = base.replace(/[^0-9]/g, '')
    if (digits) return { type: 'digits', value: digits }

    // Fallback para IDs tipo @lid (no tienen dígitos): comparar el string completo normalizado.
    return { type: 'raw', value: lower }
  } catch {
    return { type: 'none', value: '' }
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
  const ka = normalizeComparableKey(a)
  const kb = normalizeComparableKey(b)
  if (!ka.value || !kb.value) return false
  if (ka.type === 'digits' && kb.type === 'digits') return ka.value === kb.value
  return ka.value === kb.value
}

export async function safeGetGroupMetadata(socket, groupJid) {
  try {
    return await antibanSystem.queryGroupMetadata(socket, groupJid)
  } catch (error) {
    const message = error?.message || String(error)
    logger.warn(`antibanSystem.queryGroupMetadata falló para ${groupJid}: ${message}`)

    // Fallback directo a Baileys para evitar falsos positivos de admin/botAdmin.
    try {
      if (socket && typeof socket.groupMetadata === 'function') {
        return await socket.groupMetadata(groupJid)
      }
    } catch (fallbackError) {
      logger.error(
        `Failed to get group metadata for ${groupJid}:`,
        fallbackError?.message || String(fallbackError)
      )
      throw fallbackError
    }

    logger.error(`Failed to get group metadata for ${groupJid}:`, message)
    throw error
  }
}

export async function safeGetGroupParticipants(socket, groupJid) {
  try {
    return await antibanSystem.fetchGroupParticipants(socket, groupJid)
  } catch (error) {
    const message = error?.message || String(error)
    logger.warn(`antibanSystem.fetchGroupParticipants falló para ${groupJid}: ${message}`)

    try {
      if (socket && typeof socket.groupMetadata === 'function') {
        const metadata = await socket.groupMetadata(groupJid)
        return Array.isArray(metadata?.participants) ? metadata.participants : []
      }
    } catch (fallbackError) {
      logger.error(
        `Failed to get participants for ${groupJid}:`,
        fallbackError?.message || String(fallbackError)
      )
      throw fallbackError
    }

    logger.error(`Failed to get participants for ${groupJid}:`, message)
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

    const participantMatches = (p, target) => {
      if (!p || !target) return false
      return (
        sameUser(p.id, target) ||
        sameUser(p.jid, target) ||
        sameUser(p.lid, target)
      )
    }

    const senderInfo = participants.find((p) => participantMatches(p, senderJid))

    const isAdmin = isAdminFlag(senderInfo)

    const botIds = [socket?.user?.id, socket?.user?.lid].filter(Boolean)
    const botInfo = participants.find((p) => botIds.some((id) => participantMatches(p, id)))

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
