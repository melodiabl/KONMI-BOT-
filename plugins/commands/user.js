function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '')
}

export function normalizeDigits(userOrJid) {
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@')
    if (at > 0) s = s.slice(0, at)
    const colon = s.indexOf(':')
    if (colon > 0) s = s.slice(0, colon)
    return s.replace(/\D/g, '')
  } catch {
    return onlyDigits(userOrJid)
  }
}

export function isOwner(usuario) {
  try {
    const env = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER || '')
    if (env && normalizeDigits(usuario) === env) return true
  } catch {}
  try {
    const base = onlyDigits(global.BOT_BASE_NUMBER || '')
    if (base && normalizeDigits(usuario) === base) return true
  } catch {}
  try {
    const first = Array.isArray(global.owner) && global.owner[0]?.[0]
    if (first && normalizeDigits(usuario) === onlyDigits(first)) return true
  } catch {}
  return false
}
