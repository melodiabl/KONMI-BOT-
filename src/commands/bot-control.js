// commands/bot-control.js
// Activar/desactivar bot en grupos o globalmente

import { setGroupConfig, getGroupBool } from '../utils/utils/group-config.js'
import { isBotGloballyActive, setBotGlobalState } from '../services/subbot-manager.js'

export async function bot(ctx) {
  const { isOwner, isAdmin, remoteJid, args } = ctx
  if (!isOwner && !isAdmin) {
    return { success: false, message: '⚠️ Solo owner o administradores pueden usar este comando.', quoted: true }
  }

  const action = String((args || [])[0] || '').toLowerCase()

  // Control global (solo owner)
  if (action === 'global') {
    if (!isOwner) {
      return { success: false, message: '⚠️ Solo el owner puede cambiar el estado global.', quoted: true }
    }
    const target = String((args || [])[1] || '').toLowerCase()
    const current = await isBotGloballyActive()
    if (!['on', 'off'].includes(target)) {
      return { success: true, message: `Estado global: ${current ? 'ON' : 'OFF'}\nUso: /bot global on|off`, quoted: true }
    }
    const turnOn = target === 'on'
    await setBotGlobalState(turnOn, { actor: ctx.senderNumber || ctx.sender || 'owner' })
    return { success: true, message: `✅ Bot global ${turnOn ? 'ON' : 'OFF'}`, quoted: true }
  }

  // Control por grupo
  if (!['on', 'off'].includes(action)) {
    const on = await getGroupBool(remoteJid, 'bot_enabled', true)
    return { success: true, message: `ℹ️ Bot: ${on ? 'ON' : 'OFF'}\n\nUso: /bot on|off`, quoted: true }
  }

  const val = action === 'on'
  await setGroupConfig(remoteJid, 'bot_enabled', val)
  return { success: true, message: `✅ Bot ${val ? 'habilitado' : 'deshabilitado'} en este grupo.`, quoted: true }
}

export default { bot }
