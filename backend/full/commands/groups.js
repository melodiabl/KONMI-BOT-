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
    return { success: true, message: '✅ Grupo agregado y bot habilitado' }
  } catch { return { success:false, message:'⚠️ Error ejecutando /addgroup' } }
}

export async function delGroup({ isGroup, usuario, remoteJid, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  try {
    await ensureGroupsTable()
    await db('grupos_autorizados').where({ jid: remoteJid }).update({ bot_enabled: false, updated_at: new Date().toISOString() })
    return { success: true, message: '🛑 Bot deshabilitado en este grupo' }
  } catch { return { success:false, message:'⚠️ Error ejecutando /delgroup' } }
}

export async function kick({ isGroup, usuario, remoteJid, args, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  const target = onlyDigits(args?.[0] || '')
  if (!target) return { success:true, message:'ℹ️ Uso: /kick <numero>' }
  try { await sock.groupParticipantsUpdate(remoteJid, [`${target}@s.whatsapp.net`], 'remove'); return { success:true, message:'✅ Usuario expulsado' } } catch { return { success:false, message:'⚠️ Error ejecutando /kick' } }
}

export async function promote({ isGroup, usuario, remoteJid, args, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  const target = onlyDigits(args?.[0] || '')
  if (!target) return { success:true, message:'ℹ️ Uso: /promote <numero>' }
  try { await sock.groupParticipantsUpdate(remoteJid, [`${target}@s.whatsapp.net`], 'promote'); return { success:true, message:'✅ Usuario promovido' } } catch { return { success:false, message:'⚠️ Error ejecutando /promote' } }
}

export async function demote({ isGroup, usuario, remoteJid, args, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  const target = onlyDigits(args?.[0] || '')
  if (!target) return { success:true, message:'ℹ️ Uso: /demote <numero>' }
  try { await sock.groupParticipantsUpdate(remoteJid, [`${target}@s.whatsapp.net`], 'demote'); return { success:true, message:'✅ Usuario degradado' } } catch { return { success:false, message:'⚠️ Error ejecutando /demote' } }
}

export async function lock({ isGroup, usuario, remoteJid, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  try { await sock.groupSettingUpdate(remoteJid, 'announcement'); return { success:true, message:'🔒 Grupo bloqueado' } } catch { return { success:false, message:'⚠️ Error ejecutando /lock' } }
}

export async function unlock({ isGroup, usuario, remoteJid, sock }) {
  if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos' }
  const allowed = isOwner(usuario) || await isGroupAdmin(sock, remoteJid, usuario)
  if (!allowed) return { success: false, message: '⛔ Solo owner o administradores del grupo pueden usar este comando.' }
  try { await sock.groupSettingUpdate(remoteJid, 'not_announcement'); return { success:true, message:'🔓 Grupo desbloqueado' } } catch { return { success:false, message:'⚠️ Error ejecutando /unlock' } }
}

export async function tag({ message, usuario, remoteJid, sock }) {
  try {
    const md = await sock.groupMetadata(remoteJid)
    const mentions = (md?.participants||[]).map(p => p.id).filter(Boolean)
    const text = (message?.message?.extendedTextMessage?.text || message?.message?.conversation || '') || '🔔'
    return { success:true, message: text, mentions }
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

