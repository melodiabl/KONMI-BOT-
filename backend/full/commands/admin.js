// commands/admin.js
// Admin/Owner wrappers and checks

import { isSuperAdmin, setPrimaryOwner } from '../global-config.js'
import { getTheme } from '../utils/theme.js'

export async function ownerInfo(ctx) {
  const { usuario, isOwner, isAdmin } = ctx
  const th = getTheme()
  const roles = []
  if (isOwner) roles.push('owner')
  if (isAdmin) roles.push('admin')
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
  return { success: true, message: msg, quoted: true }
}

export async function checkOwner({ isOwner }) {
  return { success: true, message: isOwner ? '✅ Tienes rol de owner' : '⛔ No eres owner', quoted: true }
}

export async function setOwner(ctx) {
  if (!ctx.isOwner) {
    return { success: false, message: '⛔ Este comando solo puede ser usado por el owner del bot.', quoted: true }
  }
  const numero = (ctx.args || [])[0] && String((ctx.args || [])[0]).replace(/\D/g, '')
  const nombre = (ctx.args || []).slice(1).join(' ') || 'Owner'
  if (!numero) return { success: true, message: 'ℹ️ Uso: /setowner <numero> <nombre>', quoted: true }

  try {
    setPrimaryOwner(numero, nombre)
    return { success: true, message: `✅ Owner principal actualizado: ${nombre} (+${numero})`, quoted: true }
  } catch (e) {
    return { success: false, message: `⚠️ Error actualizando owner: ${e.message}`, quoted: true }
  }
}

export async function debugMe({ usuario, isOwner, isAdmin }) {
  const roles = []
  if (isOwner) roles.push('owner')
  if (isAdmin) roles.push('admin')
  try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}
  return { success: true, message: `👤 ${usuario}\n🔖 Roles: ${roles.join(', ') || 'ninguno'}`, quoted: true }
}

export async function debugFull(ctx) {
  return ownerInfo(ctx)
}

export async function testAdmin({ isOwner, isAdmin }) {
  const ok = isOwner || isAdmin
  return { success: true, message: ok ? '✅ Admin OK' : '⛔ No admin', quoted: true }
}

export async function debugBot(ctx) {
  const { sock, usuario, isGroup, isBotAdmin, isOwner } = ctx
  try {
    const th = getTheme()
    const only = (v) => String(v || '').replace(/\D/g, '')
    const envOwner = (process.env.OWNER_WHATSAPP_NUMBER || '').split(',').map(only).join(', ')
    const baseNum = only(global.BOT_BASE_NUMBER || sock?.user?.id || '')
    const userNum = only(usuario)

    const roles = []
    if (isOwner) roles.push('owner')
    try { if (isSuperAdmin(usuario)) roles.push('superadmin') } catch {}

    const body = [
      `🤖 Debug Bot`,
      `• Bot JID: ${sock?.user?.id || '(n/a)'}`,
      `• BOT_BASE_NUMBER: +${baseNum || '(n/a)'}`,
      `• OWNER (env): +${envOwner || '(n/a)'}`,
      `• Tú: +${userNum} ${roles.length ? `(${roles.join(', ')})` : ''}`,
      isGroup ? `• Bot Admin en grupo: ${isBotAdmin ? 'Sí' : 'No'}` : null,
    ].filter(Boolean).join('\n')

    const msg = `${th.header('KONMI BOT')}\n${body}\n${th.footer()}`
    return { success: true, message: msg, quoted: true }
  } catch (e) {
    return { success: false, message: `⚠️ Error en /debugbot: ${e?.message || e}`, quoted: true }
  }
}

export default { ownerInfo, checkOwner, setOwner, debugMe, debugFull, testAdmin }
