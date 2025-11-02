// commands/admin.js
// Admin/Owner wrappers and checks

import { isSuperAdmin } from '../global-config.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function isOwner(usuario){ try{ const env = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); if(env) return onlyDigits(usuario)===env }catch{}; try{ const first = Array.isArray(global.owner)&&global.owner[0]?.[0]; if(first) return onlyDigits(usuario)===onlyDigits(first) }catch{}; return false }

export async function ownerInfo({ usuario }) {
  const roles = []
  if (isOwner(usuario)) roles.push('owner')
  try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
  const superadmins = Array.isArray(global.owner) ? global.owner.length : 0
  const mods = Array.isArray(global.mods) ? global.mods.length : 0
  const prems = Array.isArray(global.prems) ? global.prems.length : 0
  const msg = [
    `👤 ${usuario}`,
    `🔖 Roles: ${roles.join(', ') || 'ninguno'}`,
    `👑 Superadmins: ${superadmins}`,
    `🛡️ Mods: ${mods}`,
    `💎 Premium: ${prems}`,
  ].join('\n')
  return { success:true, message: msg }
}

export async function checkOwner({ usuario }) {
  const ok = isOwner(usuario) || (()=>{ try{return isSuperAdmin(usuario)}catch{return false} })()
  return { success: true, message: ok ? '✅ Tienes rol de owner/superadmin' : '⛔ No eres owner ni superadmin' }
}

export async function setOwner({ args }) {
  const numero = (args||[])[0] && String((args||[])[0]).replace(/\D/g,'')
  const nombre = (args||[]).slice(1).join(' ') || 'Owner'
  if (!numero) return { success:true, message:'ℹ️ Uso: /setowner <numero> <nombre>' }
  try {
    if (!Array.isArray(global.owner)) global.owner = []
    const exists = global.owner.find(([n]) => String(n)===numero)
    if (!exists) global.owner.push([numero, nombre, true])
    return { success:true, message:`✅ Owner agregado: ${nombre} (+${numero})` }
  } catch { return { success:false, message:'⚠️ Error actualizando owner.' } }
}

export async function debugMe({ usuario }) {
  const roles = []
  if (isOwner(usuario)) roles.push('owner')
  try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
  return { success: true, message: `👤 ${usuario}\n🔖 Roles: ${roles.join(', ') || 'ninguno'}` }
}

export async function debugFull(ctx) {
  return ownerInfo(ctx)
}

export async function testAdmin({ usuario }) {
  const ok = isOwner(usuario) || (()=>{ try{return isSuperAdmin(usuario)}catch{return false} })()
  return { success: true, message: ok ? '✅ Admin OK' : '⛔ No admin' }
}

export default { ownerInfo, checkOwner, setOwner, debugMe, debugFull, testAdmin }
