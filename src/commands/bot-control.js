// commands/bot-control.js
// Activar/desactivar bot en grupos

import { setGroupConfig, getGroupBool } from '../utils/utils/group-config.js'

export async function bot(ctx) {
  const { isOwner, isAdmin, remoteJid, args } = ctx
  if (!isOwner && !isAdmin) {
    return { success: false, message: '⛔ Solo owner o administradores pueden usar este comando.', quoted: true }
  }

  const action = String((args||[])[0]||'').toLowerCase()
  if (!['on','off'].includes(action)) {
    const on = await getGroupBool(remoteJid, 'bot_enabled', true)
    return { success:true, message:`ℹ️ Bot: ${on?'ON':'OFF'}\n\nUso: /bot on|off`, quoted:true }
  }

  const val = action==='on'
  await setGroupConfig(remoteJid, 'bot_enabled', val)
  return { success:true, message:`✅ Bot ${val?'habilitado':'deshabilitado'} en este grupo.`, quoted:true }
}

export default { bot }
