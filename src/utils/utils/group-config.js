// utils/group-config.js
// Configuración por grupo usando tabla bot_config (clave/valor)

import db from '../../database/db.js'

async function ensureConfigTable() {
  try {
    const exists = await db.schema.hasTable('bot_config')
    if (!exists) await db.schema.createTable('bot_config', t => { t.string('key').primary(); t.text('value').nullable() })
  } catch {}
}

function keyOf(groupId, k) { return `group:${groupId}:${k}` }

export async function setGroupConfig(groupId, key, value) {
  if (!groupId || !key) return false
  await ensureConfigTable()
  const k = keyOf(groupId, key)
  const exists = await db('bot_config').where({ key: k }).first()
  if (exists) await db('bot_config').where({ key: k }).update({ value: String(value) })
  else await db('bot_config').insert({ key: k, value: String(value) })
  return true
}

export async function getGroupConfig(groupId, key, def = null) {
  if (!groupId || !key) return def
  await ensureConfigTable()
  const k = keyOf(groupId, key)
  const row = await db('bot_config').where({ key: k }).first()
  return row ? row.value : def
}

export async function getGroupBool(groupId, key, def = false) {
  const v = await getGroupConfig(groupId, key, null)
  if (v == null) return def
  const s = String(v).trim().toLowerCase()
  return ['1','true','on','yes','si'].includes(s)
}

export async function getGroupNumber(groupId, key, def = 0) {
  const v = await getGroupConfig(groupId, key, null)
  if (v == null) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export default { setGroupConfig, getGroupConfig, getGroupBool, getGroupNumber }

