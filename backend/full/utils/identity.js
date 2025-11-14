// utils/identity.js
// Normalización de números/JIDs y detección centralizada de owner/admin

export function onlyDigits(v) {
  return String(v || '').replace(/[^0-9]/g, '')
}

export function normalizeDigits(userOrJid) {
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
    const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
    return s.replace(/\D/g, '')
  } catch { return onlyDigits(userOrJid) }
}

export function isAdminFlag(participant) {
  try {
    const p = participant || {}
    if (p.admin === 'admin' || p.admin === 'superadmin') return true
    if (p.admin === true) return true
    if (p.isAdmin === true || p.isSuperAdmin === true) return true
    if (typeof p.privilege === 'string' && /admin/i.test(p.privilege)) return true
  } catch {}
  return false
}

function leftPart(v) { try { return String(v || '').split('@')[0] } catch { return '' } }

export async function isGroupAdmin(sock, remoteJid, usuario) {
  try {
    const meta = await sock.groupMetadata(remoteJid)
    const uDigits = normalizeDigits(usuario)
    const uLeft = leftPart(usuario)
    const parts = Array.isArray(meta?.participants) ? meta.participants : []
    const me = parts.find((x) => {
      const pid = x?.id || x?.jid || ''
      const pLeft = leftPart(pid)
      if (uLeft && pLeft && uLeft === pLeft) return true
      return normalizeDigits(pid) === uDigits
    })
    return isAdminFlag(me)
  } catch { return false }
}

export async function isBotAdmin(sock, remoteJid) {
  try {
    const meta = await sock.groupMetadata(remoteJid)
    const bDigits = normalizeDigits(sock?.user?.id || '')
    const bLeft = leftPart(sock?.user?.id || '')
    const parts = Array.isArray(meta?.participants) ? meta.participants : []
    let bot = parts.find((x) => normalizeDigits(x?.id || x?.jid) === bDigits)
    if (!bot && bLeft) bot = parts.find((x) => leftPart(x?.id || x?.jid) === bLeft)
    return isAdminFlag(bot)
  } catch { return false }
}

export function isOwnerNumber(usuario, sock = null) {
  const u = normalizeDigits(usuario)
  // Construir set de propietarios desde múltiples variables/envs
  const owners = new Set()
  try {
    const single = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || process.env.OWNER_NUMBER || '')
    if (single) owners.add(single)
  } catch {}
  try {
    const multi = String(process.env.OWNER_WHATSAPP_NUMBERS || process.env.OWNER_NUMBERS || '')
      .split(/[\s,;]+/)
      .map(onlyDigits)
      .filter(Boolean)
    for (const n of multi) owners.add(n)
  } catch {}
  try {
    if (Array.isArray(global.owner)) {
      for (const entry of global.owner) {
        const num = Array.isArray(entry) ? entry[0] : entry
        const d = onlyDigits(num)
        if (d) owners.add(d)
      }
    }
  } catch {}
  // Opcional: permitir que el número base del bot sea owner si se habilita
  try {
    const allowBotAsOwner = String(process.env.BOT_IS_OWNER || 'false').toLowerCase() === 'true'
    if (allowBotAsOwner) {
      const base = onlyDigits(global.BOT_BASE_NUMBER || '') || normalizeDigits(sock?.user?.id || '')
      if (base) owners.add(base)
    }
  } catch {}
  return u ? owners.has(u) : false
}

export function mentionOfDigits(digits) {
  const d = normalizeDigits(digits)
  return d ? `${d}@s.whatsapp.net` : undefined
}

export function toSWhatsAppJid(userOrJid) {
  const d = normalizeDigits(userOrJid)
  return d ? `${d}@s.whatsapp.net` : undefined
}

export default {
  onlyDigits,
  normalizeDigits,
  isAdminFlag,
  isGroupAdmin,
  isBotAdmin,
  isOwnerNumber,
  mentionOfDigits,
  toSWhatsAppJid,
}
