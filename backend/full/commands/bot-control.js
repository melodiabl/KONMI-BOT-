// commands/bot-control.js
// Control del bot por grupo y global

import db from '../db.js'
import { buildQuickReplyFlow } from '../utils/flows.js'


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

export async function bot({ usuario, args, isGroup, remoteJid, sock, message }) {
  try {
    const a0 = (args||[])[0]
    // Global on/off (solo owner)
    if (a0 === 'global') {
      if (!isOwnerNumber(usuario)) {
        return {
          success: true,
          type: 'buttons',
          text: '⛔ Solo el owner puede usar comandos globales',
          footer: 'KONMI BOT',
          buttons: [ { text: '📋 Ayuda', command: '/help' }, { text: '🏠 Menú', command: '/menu' } ],
          quoted: true,
          ephemeralDuration: 120,
        }
      }
      const v = (args||[])[1]
      if (v !== 'on' && v !== 'off') {
        const flow = buildQuickReplyFlow({
          header: '⚙️ Control global',
          body: 'Activar o desactivar el bot globalmente',
          footer: 'KONMI BOT',
          buttons: [
            { text: '🌍 Global ON', command: '/bot global on' },
            { text: '🌍 Global OFF', command: '/bot global off' },
            { text: '🏠 Menú', command: '/menu' },
          ],
        })
        return [
          { success:true, message:'⚙️ Control global del bot', quoted: true, ephemeralDuration: 120 },
          { type:'content', content: flow, quoted: true, ephemeralDuration: 300 },
        ]
      }
      const turnOn = v === 'on'
      try {
        const row = await db('bot_global_state').first('*')
        if (row) await db('bot_global_state').update({ is_on: turnOn }).where({ id: 1 })
        else await db('bot_global_state').insert({ id: 1, is_on: turnOn })
      } catch {}
      const msg = turnOn ? '✅ Bot activado globalmente' : '⛔ Bot desactivado globalmente'
      const flow = buildQuickReplyFlow({
        header: msg,
        body: 'Control global actualizado',
        footer: 'Acciones rápidas',
        buttons: [ { text: '🏠 Menú', command: '/menu' }, { text: '📋 Ayuda', command: '/help' } ],
      })
      return [
        { success: true, message: msg, quoted: true, ephemeralDuration: 120 },
        { type: 'content', content: flow, quoted: true, ephemeralDuration: 300 },
      ]
    }

    // Grupo on/off
    if (!isGroup) return { success: true, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true, ephemeralDuration: 120 }
    const allowed = isOwnerNumber(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
    if (!allowed) return { success: true, message: '⛔ Solo owner o administradores del grupo pueden usar /bot on/off.', quoted: true, ephemeralDuration: 120 }
    const turnOn = a0 === 'on'
    const turnOff = a0 === 'off'
    if (!turnOn && !turnOff) {
      const flow = buildQuickReplyFlow({
        header: '⚙️ Control del bot',
        body: 'Activar o desactivar en este grupo',
        footer: 'KONMI BOT',
        buttons: [ { text: '✅ ON', command: '/bot on' }, { text: '⛔ OFF', command: '/bot off' }, { text: '🌍 Global', command: '/bot global' }, { text: '👑 Admins', command: '/admins' } ],
      })
      return [
        { success:true, message:'⚙️ Control del bot en este grupo', quoted: true, ephemeralDuration: 120 },
        { type:'content', content: flow, quoted: true, ephemeralDuration: 300 },
      ]
    }
    try {
      const row = await db('group_settings').where({ group_id: remoteJid }).first()
      if (row) await db('group_settings').where({ group_id: remoteJid }).update({ is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
      else await db('group_settings').insert({ group_id: remoteJid, is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
    } catch {}
    const msg = turnOn ? '✅ Bot activado en este grupo' : '⛔ Bot desactivado en este grupo'
    const flow = buildQuickReplyFlow({
      header: msg,
      body: `Grupo: ${remoteJid}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: turnOn ? '⛔ OFF' : '✅ ON', command: turnOn ? '/bot off' : '/bot on' }, { text: '👑 Admins', command: '/admins' }, { text: '🏠 Menú', command: '/menu' } ],
    })
    return [
      { success: true, message: msg, quoted: true, ephemeralDuration: 120 },
      { type: 'reaction', emoji: '✅', key: message?.key },
      { type: 'content', content: flow, quoted: true, ephemeralDuration: 300 },
    ]
  } catch (e) {
    return { success: false, message: `⚠️ Error en /bot: ${e?.message||e}` }
  }
}

export default { bot }

