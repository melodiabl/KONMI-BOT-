// commands/group-settings.js
// Configuración por grupo: antilink, slowmode, welcome

import { setGroupConfig, getGroupBool, getGroupNumber, getGroupConfig } from './utils/group-config.js'
import { getGroupRoles } from './utils/group-helper.js'

function requireGroupAdmin(handler) {
  return async (ctx) => {
    const { isGroup, isOwner, sock, remoteJid, sender } = ctx
    if (!isGroup) {
      return {
        success: true,
        message: ' Este comando solo funciona en grupos',
        quoted: true,
      }
    }

    let isAdmin = !!ctx.isAdmin
    if (!isAdmin && sock && remoteJid && sender) {
      const roles = await getGroupRoles(sock, remoteJid, sender)
      isAdmin = roles.isAdmin
    }

    if (!isOwner && !isAdmin) {
      return {
        success: true,
        message: 'Solo administradores del grupo u owner pueden usar este comando.',
        quoted: true,
      }
    }

    return handler({ ...ctx, isAdmin })
  }
}

export const antilink = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String((args || [])[0] || '').toLowerCase()
  if (!['on', 'off', 'true', 'false', '1', '0'].includes(on)) {
    return { success: true, message: ' Uso: /antilink on|off', quoted: true }
  }
  const val = ['on', 'true', '1'].includes(on)
  await setGroupConfig(remoteJid, 'antilink', val)
  return { success: true, message: ` Antilink: ${val ? 'ON' : 'OFF'}`, quoted: true }
})

export const antilinkmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const mode = String((args || [])[0] || '').toLowerCase()
  if (!['warn', 'kick'].includes(mode)) {
    return { success: true, message: ' Uso: /antilinkmode warn|kick', quoted: true }
  }
  await setGroupConfig(remoteJid, 'antilink_mode', mode)
  return { success: true, message: `Antilink mode: ${mode.toUpperCase()}`, quoted: true }
})

export const slowmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const n = Number((args || [])[0] || 0)
  if (!Number.isFinite(n) || n < 0) {
    return { success: true, message: ' Uso: /slowmode [segundos] (0 para desactivar)', quoted: true }
  }
  await setGroupConfig(remoteJid, 'slowmode_s', Math.floor(n))
  return { success: true, message: ` Slowmode: ${Math.floor(n)}s`, quoted: true }
})

export const antiflood = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String((args || [])[0] || '').toLowerCase()
  if (!['on', 'off', 'true', 'false', '1', '0'].includes(on)) {
    return { success: true, message: ' Uso: /antiflood on|off', quoted: true }
  }
  const val = ['on', 'true', '1'].includes(on)
  await setGroupConfig(remoteJid, 'antiflood_on', val)
  return { success: true, message: `Anti-flood: ${val ? 'ON' : 'OFF'}`, quoted: true }
})

export const antifloodmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const mode = String((args || [])[0] || '').toLowerCase()
  if (!['warn', 'kick'].includes(mode)) {
    return { success: true, message: 'Uso: /antifloodmode warn|kick', quoted: true }
  }
  await setGroupConfig(remoteJid, 'antiflood_mode', mode)
  return { success: true, message: ` Anti-flood mode: ${mode.toUpperCase()}`, quoted: true }
})

export const antifloodrate = requireGroupAdmin(async ({ remoteJid, args }) => {
  const n = Number((args || [])[0] || 5)
  if (!Number.isFinite(n) || n <= 0) {
    return { success: true, message: ' Uso: /antifloodrate [mensajes/10s] (ej 5)', quoted: true }
  }
  await setGroupConfig(remoteJid, 'antiflood_rate', Math.floor(n))
  return { success: true, message: `Anti-flood rate: ${Math.floor(n)}/10s`, quoted: true }
})

export const welcome = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String((args || [])[0] || '').toLowerCase()
  if (!['on', 'off', 'true', 'false', '1', '0'].includes(on)) {
    return { success: true, message: 'Uso: /welcome on|off', quoted: true }
  }
  const val = ['on', 'true', '1'].includes(on)
  await setGroupConfig(remoteJid, 'welcome_on', val)
  return { success: true, message: `Welcome: ${val ? 'ON' : 'OFF'}`, quoted: true }
})

export const setwelcome = requireGroupAdmin(async ({ remoteJid, args }) => {
  const text = (args || []).join(' ').trim()
  if (!text) {
    return { success: true, message: ' Uso: /setwelcome [texto]', quoted: true }
  }
  await setGroupConfig(remoteJid, 'welcome_text', text)
  return { success: true, message: ' Mensaje de bienvenida guardado', quoted: true }
})

export async function settings(ctx) {
  const { remoteJid } = ctx
  const al = await getGroupBool(remoteJid, 'antilink', false)
  const sm = await getGroupNumber(remoteJid, 'slowmode_s', 0)
  const wo = await getGroupBool(remoteJid, 'welcome_on', false)
  const wt = await getGroupConfig(remoteJid, 'welcome_text', 'Bienvenido @user a @group')
  const mode = await getGroupConfig(remoteJid, 'antilink_mode', 'warn')
  const msg = `Ajustes del grupo
 Antilink: ${al ? 'ON' : 'OFF'}
 Antilink Mode: ${mode}
 Slowmode: ${sm}s
 Welcome: ${wo ? 'ON' : 'OFF'}
 Msg: ${wt}`
  return { success: true, message: msg, quoted: true }
}

export const rules = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String((args || [])[0] || 'show').toLowerCase()
  if (on === 'on' || on === 'off') {
    const val = on === 'on'
    await setGroupConfig(remoteJid, 'rules_on', val)
    return { success: true, message: `Rules: ${val ? 'ON' : 'OFF'}`, quoted: true }
  }
  const text = await getGroupConfig(remoteJid, 'rules_text', 'Reglas: respeta a todos, no spam, no links.')
  return { success: true, message: ` Reglas del grupo\n\n${text}`, quoted: true }
})

export const setrules = requireGroupAdmin(async ({ remoteJid, args }) => {
  const text = (args || []).join(' ').trim()
  if (!text) {
    return { success: true, message: ' Uso: /setrules [texto]', quoted: true }
  }
  await setGroupConfig(remoteJid, 'rules_text', text)
  return { success: true, message: ' Reglas guardadas', quoted: true }
})

export default { antilink, slowmode, welcome, setwelcome, settings }

