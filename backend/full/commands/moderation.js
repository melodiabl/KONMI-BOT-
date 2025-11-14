// commands/moderation.js — sistema de advertencias por grupo
import db from '../db.js'

async function ensureWarningsTable(){
  try { const exists = await db.schema.hasTable('group_warnings'); if (!exists) await db.schema.createTable('group_warnings', t=>{ t.increments('id'); t.string('group_id'); t.string('user'); t.integer('count').defaultTo(0); t.timestamp('updated_at').defaultTo(db.fn.now()) }) } catch {}
}

function first(arr){ return Array.isArray(arr) && arr.length ? arr[0] : null }
function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }

async function extractTargetFromContext(message){
  try {
    const xt = message?.message?.extendedTextMessage
    const ctx = xt?.contextInfo
    const mentioned = first(ctx?.mentionedJid)
    if (mentioned) return mentioned
    if (ctx?.quotedMessage && ctx?.participant) return ctx.participant
  } catch {}
  return null
}

function requireGroupAdmin(handler){
  return async (ctx) => {
    const { isGroup, isOwner, isAdmin } = ctx
    if (!isGroup) return { success:true, message:'ℹ️ Este comando solo funciona en grupos', quoted:true }
    if (!isOwner && !isAdmin) return { success:true, message:'⛔ Solo administradores del grupo u owner pueden usar este comando.', quoted:true }
    return handler(ctx)
  }
}


export const warn = requireGroupAdmin(async ({ sock, remoteJid, usuario, args, message })=>{
  await ensureWarningsTable()
  const mentioned = await extractTargetFromContext(message)
  let target = mentioned
  if (!target && args && args[0]) target = `${onlyDigits(args[0])}@s.whatsapp.net`
  if (!target) return { success:true, message:'ℹ️ Uso: /warn @usuario | responde a un mensaje con /warn', quoted:true }
  const user = onlyDigits(target)
  const row = await db('group_warnings').where({ group_id: remoteJid, user }).first()
  const count = row ? (row.count+1) : 1
  if (row) await db('group_warnings').where({ group_id: remoteJid, user }).update({ count, updated_at: new Date().toISOString() })
  else await db('group_warnings').insert({ group_id: remoteJid, user, count, updated_at: new Date().toISOString() })
  return { success:true, message:`⚠️ Advertencia para @${user}. Total: ${count}`, mentions:[`${user}@s.whatsapp.net`], quoted:true }
})

export const unwarn = requireGroupAdmin(async ({ remoteJid, args })=>{
  await ensureWarningsTable()
  const user = onlyDigits((args||[])[0]||'')
  if (!user) return { success:true, message:'ℹ️ Uso: /unwarn <numero_sin_+>', quoted:true }
  await db('group_warnings').where({ group_id: remoteJid, user }).del()
  return { success:true, message:`♻️ Advertencias reseteadas para +${user}`, quoted:true }
})

export async function warns({ remoteJid }){
  await ensureWarningsTable()
  const rows = await db('group_warnings').where({ group_id: remoteJid }).orderBy('count','desc').limit(15)
  if (!rows.length) return { success:true, message:'ℹ️ No hay advertencias registradas en este grupo', quoted:true }
  let msg = '📋 Advertencias por usuario (top 15)\n\n'
  rows.forEach((r,i)=>{ msg += `${i+1}. +${r.user} — ${r.count}\n` })
  return { success:true, message: msg, quoted:true }
}

export default { warn, unwarn, warns }
