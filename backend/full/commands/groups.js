// commands/groups.js
// Administración de grupos: implementación directa con dependencias locales

import db from '../db.js'

function onlyDigits(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function isOwner(usuario){ try { const o = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); return o && onlyDigits(usuario)===o } catch { return false } }

async function isGroupAdmin(sock, remoteJid, usuario){
  try{
    const meta = await sock.groupMetadata(remoteJid)
    const userNum = String(usuario).split(':')[0]
    const p = (meta?.participants||[]).find(x=>String(x.id).startsWith(userNum))
    return !!(p && (p.admin==='admin' || p.admin==='superadmin'))
  }catch{ return false }
}

async function ensureGroupsTable() {
  try {
    const exists = await db.schema.hasTable('grupos_autorizados')
    if (!exists) {
      await db.schema.createTable('grupos_autorizados', (t) => {
        t.increments('id')
        t.string('jid').unique().notNullable()
        t.boolean('bot_enabled').defaultTo(true)
        t.string('tipo').nullable()
        t.timestamp('updated_at').defaultTo(db.fn.now())
      })
    }
  } catch {}
}

export async function addGroup({ isGroup, usuario, remoteJid, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  try {
    await ensureGroupsTable()
    const row = await db('grupos_autorizados').where({ jid: remoteJid }).first()
    if (row) await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: true, updated_at: new Date().toISOString() })
    else await db('grupos_autorizados').insert({ jid: remoteJid, bot_enabled: true, tipo: 'general', updated_at: new Date().toISOString() })
    return {
      success: true,
      type: 'buttons',
      text: '✅ Grupo agregado y bot habilitado',
      footer: 'KONMI BOT',
      buttons: [ { text: '⚙️ /bot on', command: '/bot on' }, { text: '⛔ /bot off', command: '/bot off' }, { text: '📋 Ayuda', command: '/help' } ],
      quoted: true,
    }
  } catch { return { success:false, message:'⚠️ Error ejecutando /addgroup' } }
}

export async function delGroup({ isGroup, usuario, remoteJid, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  try {
    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false, updated_at: new Date().toISOString() })
    return { success: true, message: '🛑 Bot deshabilitado en este grupo', quoted: true }
  } catch { return { success:false, message:'⚠️ Error ejecutando /delgroup' } }
}

function first(v){ return (Array.isArray(v) && v.length) ? v[0] : null }

export async function kick({ isGroup, usuario, remoteJid, args, sock, message }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.', quoted: true }

  let targetJid = null
  try {
    const xt = message?.message?.extendedTextMessage
    const ctx = xt?.contextInfo
    const mentioned = first(ctx?.mentionedJid)
    if (mentioned) targetJid = mentioned
    if (!targetJid && ctx?.quotedMessage && ctx?.participant) targetJid = ctx.participant
  } catch {}

  if (!targetJid) {
    const raw = String((args||[]).join(' ') || '').trim()
    let digits = onlyDigits(raw)
    if (!digits && args && args[0]) digits = onlyDigits(args[0])
    if (digits) targetJid = `${digits}@s.whatsapp.net`
  }

  if (!targetJid) {
    return { success:true, message:'ℹ️ Uso: /kick @usuario | responder un mensaje con /kick | /kick <numero>', quoted: true }
  }

  const targetNum = onlyDigits(String(targetJid).split('@')[0])
  const actorNum = onlyDigits(usuario)
  try {
    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'remove')
    return {
      success:true,
      message:`👢 Usuario expulsado\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`,
      mentions:[ `${targetNum}@s.whatsapp.net`, `${actorNum}@s.whatsapp.net` ],
      quoted:true,
      ephemeralDuration:120,
    }
  } catch {
    return { success:false, message:`⚠️ Error ejecutando /kick${targetNum ? ` para +${targetNum}` : ''}` }
  }
}

export async function promote({ isGroup, usuario, remoteJid, args, sock, message }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.', quoted: true }
  let targetJid = null
  try {
    const xt = message?.message?.extendedTextMessage
    const ctx = xt?.contextInfo
    const mentioned = first(ctx?.mentionedJid)
    if (mentioned) targetJid = mentioned
    if (!targetJid && ctx?.quotedMessage && ctx?.participant) targetJid = ctx.participant
  } catch {}
  if (!targetJid) {
    const raw = String((args||[]).join(' ') || '').trim()
    let digits = onlyDigits(raw)
    if (!digits && args && args[0]) digits = onlyDigits(args[0])
    if (digits) targetJid = `${digits}@s.whatsapp.net`
  }
  if (!targetJid) return { success:true, message:'ℹ️ Uso: /promote @usuario | responder mensaje | /promote <numero>', quoted: true }
  const targetNum = onlyDigits(String(targetJid).split('@')[0])
  const actorNum = onlyDigits(usuario)
  const wantsConfirm = String((args||[])[0]||'').toLowerCase() === 'confirm'
  if (!wantsConfirm) {
    const flowConfirm = buildQuickReplyFlow({
      header: '⚠️ Confirmar promoción',
      body: `Usuario: @${targetNum}`,
      footer: 'Acciones',
      buttons: [ { text:'✅ Confirmar', command:`/promote confirm ${targetNum}` }, { text:'❌ Cancelar', command:'/menu' } ],
    })
    return [
      { success:true, message:`¿Confirmas promover a @${targetNum}?`, mentions:[ `${targetNum}@s.whatsapp.net` ], quoted:true, ephemeralDuration:300 },
      { type:'content', content: flowConfirm, quoted:true, ephemeralDuration:300 },
    ]
  }
  try {
    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'promote')
    const flow = buildQuickReplyFlow({
      header: '✅ Usuario promovido',
      body: `Objetivo: @${targetNum}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: '↩️ Deshacer', command: `/demote ${targetNum}` }, { text: '👑 Ver admins', command: '/admins' } ],
    })
    return [
      { success:true, message:`✅ Usuario promovido\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`, mentions:[ `${targetNum}@s.whatsapp.net`, `${actorNum}@s.whatsapp.net` ], quoted: true, ephemeralDuration: 120 },
      { type:'content', content: flow, quoted: true, ephemeralDuration: 300 }
    ]
  } catch { return { success:false, message:'⚠️ Error ejecutando /promote' } }
}

export async function demote({ isGroup, usuario, remoteJid, args, sock, message }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.', quoted: true }
  let targetJid = null
  try {
    const xt = message?.message?.extendedTextMessage
    const ctx = xt?.contextInfo
    const mentioned = first(ctx?.mentionedJid)
    if (mentioned) targetJid = mentioned
    if (!targetJid && ctx?.quotedMessage && ctx?.participant) targetJid = ctx.participant
  } catch {}
  if (!targetJid) {
    const raw = String((args||[]).join(' ') || '').trim()
    let digits = onlyDigits(raw)
    if (!digits && args && args[0]) digits = onlyDigits(args[0])
    if (digits) targetJid = `${digits}@s.whatsapp.net`
  }
  if (!targetJid) return { success:true, message:'ℹ️ Uso: /demote @usuario | responder mensaje | /demote <numero>', quoted: true }
  const targetNum = onlyDigits(String(targetJid).split('@')[0])
  const actorNum = onlyDigits(usuario)
  const wantsConfirm = String((args||[])[0]||'').toLowerCase() === 'confirm'
  if (!wantsConfirm) {
    const flow = buildQuickReplyFlow({
      header: '⚠️ Confirmar degradar',
      body: `Usuario: @${targetNum}`,
      footer: 'Acciones',
      buttons: [ { text:'✅ Confirmar', command:`/demote confirm ${targetNum}` }, { text:'❌ Cancelar', command:'/menu' } ],
    })
    return [
      { success:true, message:`¿Confirmas degradar a @${targetNum}?`, mentions:[ `${targetNum}@s.whatsapp.net` ], quoted:true, ephemeralDuration:300 },
      { type:'content', content: flow, quoted:true, ephemeralDuration:300 },
    ]
  }
  try {
    await sock.groupParticipantsUpdate(remoteJid, [targetJid], 'demote')
    const flow = buildQuickReplyFlow({
      header: '🪣 Usuario degradado',
      body: `Objetivo: @${targetNum}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: '↩️ Deshacer', command: `/promote ${targetNum}` }, { text: '👑 Ver admins', command: '/admins' } ],
    })
    return [
      { success:true, message:`🪣 Usuario degradado\n\n• Objetivo: @${targetNum}\n• Hecho por: @${actorNum}`, mentions:[ `${targetNum}@s.whatsapp.net`, `${actorNum}@s.whatsapp.net` ], quoted: true, ephemeralDuration: 120 },
      { type:'content', content: flow, quoted: true, ephemeralDuration: 300 }
    ]
  } catch { return { success:false, message:'⚠️ Error ejecutando /demote' } }
}

export async function lock({ isGroup, usuario, remoteJid, sock, args }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.', quoted: true }
  const wantsConfirm = String((args||[])[0]||'').toLowerCase() === 'confirm'
  if (!wantsConfirm) {
    const flowConfirm = buildQuickReplyFlow({ header:'⚠️ Confirmar bloqueo', body:`Grupo: ${remoteJid}`, footer:'Acciones', buttons:[ { text:'✅ Confirmar', command:'/lock confirm' }, { text:'❌ Cancelar', command:'/menu' } ] })
    return [ { success:true, message:'¿Confirmas bloquear el grupo?', quoted:true, ephemeralDuration:300 }, { type:'content', content: flowConfirm, quoted:true, ephemeralDuration:300 } ]
  }
  try {
    await sock.groupSettingUpdate(remoteJid, 'announcement')
    const flow = buildQuickReplyFlow({
      header: '🔒 Grupo bloqueado',
      body: `ID: ${remoteJid}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: '↩️ Deshacer', command: '/unlock' }, { text: '👑 Ver admins', command: '/admins' } ],
    })
    return [
      { success:true, message:'🔒 Grupo bloqueado', quoted: true },
      { type:'content', content: flow, quoted: true, ephemeralDuration: 300 }
    ]
  } catch { return { success:false, message:'⚠️ Error ejecutando /lock' } }
}

export async function unlock({ isGroup, usuario, remoteJid, sock, args }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.', quoted: true }
  const wantsConfirm = String((args||[])[0]||'').toLowerCase() === 'confirm'
  if (!wantsConfirm) {
    const flowConfirm = buildQuickReplyFlow({ header:'⚠️ Confirmar desbloqueo', body:`Grupo: ${remoteJid}`, footer:'Acciones', buttons:[ { text:'✅ Confirmar', command:'/unlock confirm' }, { text:'❌ Cancelar', command:'/menu' } ] })
    return [ { success:true, message:'¿Confirmas desbloquear el grupo?', quoted:true, ephemeralDuration:300 }, { type:'content', content: flowConfirm, quoted:true, ephemeralDuration:300 } ]
  }
  try {
    await sock.groupSettingUpdate(remoteJid, 'not_announcement')
    const flow = buildQuickReplyFlow({
      header: '🔓 Grupo desbloqueado',
      body: `ID: ${remoteJid}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: '↩️ Deshacer', command: '/lock' }, { text: '👑 Ver admins', command: '/admins' } ],
    })
    return [
      { success:true, message:'🔓 Grupo desbloqueado', quoted: true },
      { type:'content', content: flow, quoted: true, ephemeralDuration: 300 }
    ]
  } catch { return { success:false, message:'⚠️ Error ejecutando /unlock' } }
}

export async function tag({ message, usuario, remoteJid, sock, args }) {
  try {
    const md = await sock.groupMetadata(remoteJid)
    const all = (md?.participants||[]).map(p => p.id).filter(Boolean)
    // Intentar targets seleccionados: mención, citado, o números en args
    const xt = message?.message?.extendedTextMessage
    const ctx = xt?.contextInfo
    let targets = []
    try { if (ctx?.mentionedJid?.length) targets = targets.concat(ctx.mentionedJid) } catch {}
    try { if (ctx?.quotedMessage && ctx?.participant) targets.push(ctx.participant) } catch {}
    // Números en args (varios posibles)
    const nums = (args||[]).map(a=>onlyDigits(a)).filter(Boolean)
    targets = targets.concat(nums.map(n=>`${n}@s.whatsapp.net`))
    // Si no hubo targets explícitos, etiquetar a todos
    const mentions = (targets.length ? targets : all)
    const baseText = (xt?.text || message?.message?.conversation || '').trim()
    const text = baseText || (targets.length ? '🔔' : `🔔 ${mentions.length} mencionados`)
    return { success:true, message: text, mentions, quoted: true }
  } catch { return { success:false, message:'⚠️ Error ejecutando /tag' } }
}

export async function whoami({ usuario, remoteJid, isGroup }) {
  const num = usuario.split(':')[0]
  const info = [
    `👤 ${num}`,
    isGroup ? `👥 Grupo: ${remoteJid}` : '💬 Privado',
  ].join('\n')
  return { success:true, message: info }
}

export async function debugadmin({ usuario, remoteJid }) {
  const ok = await isAdminOfGroup(usuario, remoteJid)
  return { success:true, message: ok ? '✅ Tienes permisos de admin en este grupo' : '⛔ No tienes permisos de admin en este grupo' }
}

export async function admins({ remoteJid, sock }) {
  try {
    const md = await sock.groupMetadata(remoteJid)
    const admins = (md?.participants||[]).filter(p => p.admin==='admin' || p.admin==='superadmin')
    if (!admins.length) return { success:true, message:'ℹ️ No hay administradores en este grupo.', quoted: true }
    const list = admins.map((a,i)=> `${i+1}. @${String(a.id).split('@')[0]}`).join('\n')
    const mentions = admins.map(a => a.id)
    return { success:true, message:`👑 Administradores\n\n${list}`, mentions, quoted: true }
  } catch { return { success:false, message:'⚠️ Error obteniendo administradores.', quoted: true } }
}

