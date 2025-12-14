// src/commands/bot-control.js
import { setGroupConfig, getGroupBool } from '../utils/utils/group-config.js'
import { isBotGloballyActive, setBotGlobalState } from '../services/subbot-manager.js'
import { getGroupRoles } from '../utils/utils/group-helper.js'

async function bot(ctx) {
  const { isOwner, remoteJid, args, isGroup, sock, sender } = ctx

  let isAdmin = !!ctx.isAdmin
  if (!isAdmin && isGroup && sock && remoteJid && sender) {
    const roles = await getGroupRoles(sock, remoteJid, sender)
    isAdmin = roles.isAdmin
  }

  if (!isOwner && !isAdmin) {
    return { text: 'Solo owner o administradores pueden usar este comando.' }
  }

  const action = String((args || [])[0] || '').toLowerCase()

  if (action === 'global') {
    if (!isOwner) {
      return { text: 'Solo el owner puede cambiar el estado global.' }
    }
    const target = String((args || [])[1] || '').toLowerCase()
    const current = await isBotGloballyActive()
    if (!['on', 'off'].includes(target)) {
      return { text: `Estado global: ${current ? 'ON' : 'OFF'}\nUso: /bot global on|off` }
    }
    const turnOn = target === 'on'
    await setBotGlobalState(turnOn, { actor: ctx.senderNumber || ctx.sender || 'owner' })
    return { text: ` Bot global ${turnOn ? 'ON' : 'OFF'}` }
  }

  if (!['on', 'off'].includes(action)) {
    const on = await getGroupBool(remoteJid, 'bot_enabled', true)
    return { text: ` Bot: ${on ? 'ON' : 'OFF'}\n\nUso: /bot on|off` }
  }

  const val = action === 'on'
  await setGroupConfig(remoteJid, 'bot_enabled', val)
  return { text: `Bot ${val ? 'habilitado' : 'deshabilitado'} en este grupo.` }
}

export default {
    name: 'bot',
    description: 'Activa o desactiva el bot en un grupo o globalmente.',
    category: 'admin',
    handler: bot
};
