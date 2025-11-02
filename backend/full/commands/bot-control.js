// commands/bot-control.js
// Control del bot por grupo y global

import db from '../db.js'


function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function isOwnerNumber(usuario){ try { const o = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); return o && onlyDigits(usuario)===o } catch { return false } }

async function isGroupAdmin(sock, remoteJid, usuario){
  try{
    const meta = await sock.groupMetadata(remoteJid)
    const userNum = String(usuario).split(':')[0]
    const p = (meta?.participants||[]).find(x=>String(x.id).startsWith(userNum))
    return !!(p && (p.admin==='admin' || p.admin==='superadmin'))
  }catch{ return false }
}

export async function bot({ usuario, args, isGroup, remoteJid, sock }) {
  try {
    const a0 = (args||[])[0]
    // Global on/off (solo owner)
    if (a0 === 'global') {
      if (!isOwnerNumber(usuario)) {
        return { success: true, message: '⛔ Solo el owner puede usar comandos globales' }
      }
      const v = (args||[])[1]
      if (v !== 'on' && v !== 'off') {
        return { success: true, message: 'ℹ️ Uso: /bot global on | /bot global off' }
      }
      const turnOn = v === 'on'
      try {
        const row = await db('bot_global_state').first('*')
        if (row) await db('bot_global_state').update({ is_on: turnOn }).where({ id: 1 })
        else await db('bot_global_state').insert({ id: 1, is_on: turnOn })
      } catch {}
      return { success: true, message: turnOn ? '✅ Bot activado globalmente' : '⛔ Bot desactivado globalmente' }
    }

    // Grupo on/off
    if (!isGroup) return { success: true, message: 'ℹ️ Este comando solo funciona en grupos' }
    const allowed = isOwnerNumber(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
    if (!allowed) return { success: true, message: '⛔ Solo owner o administradores del grupo pueden usar /bot on/off.' }
    const turnOn = a0 === 'on'
    const turnOff = a0 === 'off'
    if (!turnOn && !turnOff) return { success: true, message: 'ℹ️ Uso: /bot on | /bot off | /bot global on | /bot global off' }
    try {
      const row = await db('group_settings').where({ group_id: remoteJid }).first()
      if (row) await db('group_settings').where({ group_id: remoteJid }).update({ is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
      else await db('group_settings').insert({ group_id: remoteJid, is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
    } catch {}
    return { success: true, message: turnOn ? '✅ Bot activado en este grupo' : '⛔ Bot desactivado en este grupo' }
  } catch (e) {
    return { success: false, message: `⚠️ Error en /bot: ${e?.message||e}` }
  }
}

export default { bot }

