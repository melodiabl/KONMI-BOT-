// commands/bot-control.js
// Activar/desactivar bot en grupos o globalmente

import { setGroupConfig, getGroupBool } from '../utils/utils/group-config.js'
import { isBotGloballyActive, setBotGlobalState } from '../services/subbot-manager.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'

export async function bot(ctx) {
  const { isOwner, remoteJid, args, isGroup, sock, sender } = ctx

  let isAdmin = !!ctx.isAdmin
  if (!isAdmin && isGroup && sock && remoteJid && sender) {
    const roles = await getGroupRoles(sock, remoteJid, sender)
    isAdmin = roles.isAdmin
  }

  if (!isOwner && !isAdmin) {
    return { success: false, message: 'Solo owner o administradores pueden usar este comando.', quoted: true }
  }

  const action = String((args || [])[0] || '').toLowerCase()

  // Control global (solo owner)
  if (action === 'global') {
    if (!isOwner) {
      return { success: false, message: 'Solo el owner puede cambiar el estado global.', quoted: true }
    }
    const target = String((args || [])[1] || '').toLowerCase()
    const current = await isBotGloballyActive()
    if (!['on', 'off'].includes(target)) {
      return { success: true, message: `Estado global: ${current ? 'ON' : 'OFF'}\nUso: /bot global on|off`, quoted: true }
    }
    const turnOn = target === 'on'
    await setBotGlobalState(turnOn, { actor: ctx.senderNumber || ctx.sender || 'owner' })
    return { success: true, message: ` Bot global ${turnOn ? 'ON' : 'OFF'}`, quoted: true }
  }

  // Control por grupo
  if (!['on', 'off', 'status'].includes(action)) {
    const on = await getGroupBool(remoteJid, 'active', true)
    return { success: true, message: `🤖 Bot: ${on ? '✅ ACTIVO' : '❌ INACTIVO'}\n\nUso:\n/bot on - Activar\n/bot off - Desactivar\n/bot status - Ver estado`, quoted: true }
  }

  if (action === 'status') {
    const on = await getGroupBool(remoteJid, 'active', true)
    return { success: true, message: `🤖 Estado del bot en este grupo: ${on ? '✅ ACTIVO' : '❌ INACTIVO'}`, quoted: true }
  }

  const val = action === 'on'
  await setGroupConfig(remoteJid, 'active', val)

  const emoji = val ? '✅' : '❌'
  const estado = val ? 'ACTIVADO' : 'DESACTIVADO'
  return {
    success: true,
    message: `${emoji} Bot ${estado} en este grupo.\n\n${val ? 'Ahora responderé a todos los comandos.' : 'Solo responderé a /bot on para reactivarme.'}`,
    quoted: true
  }
}

export default { bot }

