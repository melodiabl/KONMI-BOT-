// commands/pedidos.js
// Implementación directa para pedidos

import db from '../db.js'

export async function pedido({ args, usuario, remoteJid, fecha }) {
  try {
    const contenido = (args||[]).join(' ').trim()
    if (!contenido) return { success:true, message:'ℹ️ Uso: /pedido <texto>' }
    await db('pedidos').insert({ texto: contenido, estado: 'pendiente', usuario, grupo: remoteJid, fecha: fecha || new Date().toISOString() })
    return { success:true, message:`✅ Pedido registrado\n\n📝 ${contenido}` }
  } catch { return { success:false, message:'⚠️ Error registrando pedido.' } }
}

export async function pedidos({ usuario, remoteJid }) {
  try {
    const rows = await db('pedidos').where({ usuario, grupo: remoteJid }).orderBy('fecha','desc').limit(10)
    if (!rows.length) return { success:true, message:'📭 No tienes pedidos.' }
    let msg = '📝 *Tus Pedidos*\n\n'
    rows.forEach((r,i)=>{ msg += `${i+1}. ${r.texto} — ${r.estado||'pendiente'}\n` })
    return { success:true, message: msg }
  } catch { return { success:false, message:'⚠️ Error obteniendo pedidos.' } }
}
