// commands/admin.js
// Admin/Owner wrappers and checks

import { isSuperAdmin } from '../global-config.js'
import { getTheme } from '../utils/theme.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function isOwner(usuario){
  try { const env = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); if(env && onlyDigits(usuario)===env) return true } catch {}
  try { const base = onlyDigits(global.BOT_BASE_NUMBER||''); if(base && onlyDigits(usuario)===base) return true } catch {}
  try { const first = Array.isArray(global.owner)&&global.owner[0]?.[0]; if(first && onlyDigits(usuario)===onlyDigits(first)) return true } catch {}
  return false
}

export async function ownerInfo({ usuario }) {
  const th = getTheme()
  const roles = []
  if (isOwner(usuario)) roles.push('owner')
  try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
  const superadmins = Array.isArray(global.owner) ? global.owner.length : 0
  const mods = Array.isArray(global.mods) ? global.mods.length : 0
  const prems = Array.isArray(global.prems) ? global.prems.length : 0
  const body = [
    `👤 ${usuario}`,
    `🔖 Roles: ${roles.join(', ') || 'ninguno'}`,
    `👑 Superadmins: ${superadmins}`,
    `🛡️ Mods: ${mods}`,
    `💎 Premium: ${prems}`,
  ].join('\n')
  const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`
  return { success:true, message: msg, quoted: true }
}

export async function checkOwner({ usuario }) {
  const ok = isOwner(usuario) || (()=>{ try{return isSuperAdmin(usuario)}catch{return false} })()
  return { success: true, message: ok ? '✅ Tienes rol de owner/superadmin' : '⛔ No eres owner ni superadmin', quoted: true }
}

export async function setOwner({ args }) {
  const numero = (args||[])[0] && String((args||[])[0]).replace(/\D/g,'')
  const nombre = (args||[]).slice(1).join(' ') || 'Owner'
  if (!numero) return { success:true, message:'ℹ️ Uso: /setowner <numero> <nombre>', quoted: true }
  try {
    if (!Array.isArray(global.owner)) global.owner = []
    const exists = global.owner.find(([n]) => String(n)===numero)
    if (!exists) global.owner.push([numero, nombre, true])
    return { success:true, message:`✅ Owner agregado: ${nombre} (+${numero})`, quoted: true }
  } catch { return { success:false, message:'⚠️ Error actualizando owner.', quoted: true } }
}

export async function debugMe({ usuario }) {
  const roles = []
  if (isOwner(usuario)) roles.push('owner')
  try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
  return { success: true, message: `👤 ${usuario}\n🔖 Roles: ${roles.join(', ') || 'ninguno'}`, quoted: true }
}

export async function debugFull(ctx) {
  return ownerInfo(ctx)
}

export async function testAdmin({ usuario }) {
  const ok = isOwner(usuario) || (()=>{ try{return isSuperAdmin(usuario)}catch{return false} })()
  return { success: true, message: ok ? '✅ Admin OK' : '⛔ No admin', quoted: true }
}

export async function debugBot({ sock, remoteJid, usuario, isGroup }) {
  try {
    const th = getTheme()
    const only = (v)=>String(v||'').replace(/\D/g,'')
    const envOwner = only(process.env.OWNER_WHATSAPP_NUMBER||'')
    const baseNum = only(global.BOT_BASE_NUMBER||sock?.user?.id||'')
    const userNum = only(usuario)
    let botIsAdmin = false
    try {
      if (isGroup && remoteJid && sock?.groupMetadata) {
        const meta = await sock.groupMetadata(remoteJid)
        const p = (meta?.participants||[]).find(x=> only(x?.id) === baseNum )
        botIsAdmin = !!(p && (p.admin==='admin' || p.admin==='superadmin'))
      }
    } catch {}
    const roles = []
    try { if (isOwner(usuario)) roles.push('owner') } catch {}
    try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
    const body = [
      `🤖 Debug Bot`,
      `• Bot JID: ${sock?.user?.id || '(n/a)'}`,
      `• BOT_BASE_NUMBER: +${baseNum || '(n/a)'}`,
      `• OWNER (env): +${envOwner || '(n/a)'}`,
      `• Tú: +${userNum} ${roles.length?`(${roles.join(', ')})`:''}`,
      isGroup ? `• Bot Admin en grupo: ${botIsAdmin?'Sí':'No'}` : null,
    ].filter(Boolean).join('\n')
    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`
    return { success:true, message: msg, quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ Error en /debugbot: ${e?.message||e}`, quoted:true }
  }
}

export default { ownerInfo, checkOwner, setOwner, debugMe, debugFull, testAdmin }
