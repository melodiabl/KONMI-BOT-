import antibanSystem from './anti-ban.js'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

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
