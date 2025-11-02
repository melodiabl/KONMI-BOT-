// commands/system.js
// Sistema: clean session, logs, config, registrar, resetpass, miinfo

import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import db from '../db.js'

export async function cleanSession() {
  let cleaned = 0
  const targets = [
    path.join(process.cwd(), 'backend', 'full', 'storage', 'baileys_full'),
    path.join(process.cwd(), 'backend', 'full', 'sessions'),
    path.join(process.cwd(), 'backend', 'full', 'tmp')
  ]
  for (const dir of targets) {
    try { if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive:true, force:true }); cleaned++ } } catch {}
  }
  return { success:true, message:`🧹 Sesiones limpiadas (${cleaned} carpeta(s)). Reinicia el bot para generar nuevo QR.` }
}

export async function logs({ args }) {
  const limit = parseInt((args||[])[0]||'10',10)
  try {
    const rows = await db('logs').select('*').orderBy('fecha','desc').limit(isNaN(limit)?10:limit)
    if (!rows.length) return { success:true, message:'🗒️ No hay logs.' }
    let msg = '🗒️ Logs recientes\n\n'
    rows.forEach((r,i)=>{ msg += `${i+1}. [${r.tipo||'-'}] ${r.comando||''} — ${new Date(r.fecha).toLocaleString('es-ES')}\n` })
    return { success:true, message: msg }
  } catch { return { success:false, message:'⚠️ Error obteniendo logs.' } }
}

async function ensureConfigTable() {
  try {
    const exists = await db.schema.hasTable('bot_config')
    if (!exists) await db.schema.createTable('bot_config', t => { t.string('key').primary(); t.text('value').nullable() })
  } catch {}
}

export async function config({ args }) {
  const sub = (args||[])[0]
  await ensureConfigTable()
  if (sub === 'set') {
    const key = (args||[])[1]; const value = (args||[]).slice(2).join(' ')
    if (!key) return { success:true, message:'ℹ️ Uso: /config set <key> <valor>' }
    try { const exists = await db('bot_config').where({ key }).first(); if (exists) await db('bot_config').where({ key }).update({ value }); else await db('bot_config').insert({ key, value }); return { success:true, message:`✅ Config ${key} = ${value}` } } catch { return { success:false, message:'⚠️ Error guardando configuración.' } }
  }
  if (sub === 'get') {
    const key = (args||[])[1]
    if (!key) return { success:true, message:'ℹ️ Uso: /config get <key>' }
    try { const row = await db('bot_config').where({ key }).first(); return { success:true, message: row ? `🔧 ${key} = ${row.value||''}` : 'ℹ️ No definido' } } catch { return { success:false, message:'⚠️ Error leyendo configuración.' } }
  }
  return { success:true, message:'ℹ️ Uso: /config get <key> | /config set <key> <valor>' }
}

async function ensureUsersTable() {
  try {
    const exists = await db.schema.hasTable('usuarios')
    if (!exists) await db.schema.createTable('usuarios', t => { t.increments('id'); t.string('username').unique(); t.string('whatsapp_number'); t.string('password_hash'); t.string('rol').defaultTo('user'); t.timestamp('created_at').defaultTo(db.fn.now()) })
  } catch {}
}

export async function registrar({ args, usuario }) {
  await ensureUsersTable()
  const username = (args||[])[0]
  if (!username) return { success:true, message:'ℹ️ Uso: /registrar <username>' }
  try { await db('usuarios').insert({ username, whatsapp_number: usuario.split(':')[0] }); return { success:true, message:`✅ Usuario ${username} registrado` } } catch { return { success:false, message:'⚠️ Error registrando usuario (quizá ya existe).' } }
}

export async function resetpass({ args }) {
  await ensureUsersTable()
  const username = (args||[])[0]
  const newPass = (args||[])[1]
  if (!username || !newPass) return { success:true, message:'ℹ️ Uso: /resetpass <username> <newpass>' }
  try { const hash = await bcrypt.hash(newPass, 10); const updated = await db('usuarios').where({ username }).update({ password_hash: hash }); return { success:true, message: updated? '✅ Password actualizado' : 'ℹ️ Usuario no encontrado' } } catch { return { success:false, message:'⚠️ Error actualizando password.' } }
}

export async function miinfo({ usuario }) {
  await ensureUsersTable()
  try { const row = await db('usuarios').where({ username: usuario.split(':')[0] }).first(); if (!row) return { success:true, message:'ℹ️ Aún no estás registrado. Usa /registrar <username>' }; const rol = row.rol || 'user'; const fecha = row.created_at ? new Date(row.created_at).toLocaleString('es-ES') : ''; return { success:true, message:`👤 ${row.username}\n📱 ${row.whatsapp_number||'-'}\n🔖 ${rol}\n📅 ${fecha}` } } catch { return { success:false, message:'⚠️ Error obteniendo tu info.' } }
}

export default { cleanSession, logs, config, registrar, resetpass, miinfo }

