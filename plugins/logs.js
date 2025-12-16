// commands/logs.js — utilidades de consulta de logs desde WhatsApp
import db from './database/db.js'

export async function find({ args }) {
  const q = (args||[]).join(' ').trim()
  if (!q) return { success:true, message:'ℹ️ Uso: /logfind [texto|número]\nEj: /logfind sticker | /logfind 5959', quoted:true }
  try {
    const limit = 20
    const rows = await db('logs')
      .where('comando','like',`%${q}%`)
      .orWhere('usuario','like',`%${q}%`)
      .orWhere('tipo','like',`%${q}%`)
      .orderBy('fecha','desc')
      .limit(limit)
    if (!rows.length) return { success:true, message:'🗒️ Sin coincidencias', quoted:true }
    let msg = `🗒️ Logs que coinciden con "${q}" (máx ${limit})\n\n`
    rows.forEach((r,i)=>{ msg += `${i+1}. [${r.tipo||'-'}] ${r.comando||''} — +${r.usuario||''} — ${new Date(r.fecha).toLocaleString('es-ES')}\n` })
    return { success:true, message: msg, quoted:true, ephemeralDuration: 300 }
  } catch (e) {
    return { success:false, message:`⚠️ Error buscando logs: ${e?.message||e}`, quoted:true }
  }
}

export async function topcmd({ args }) {
  const limit = Number((args||[])[0]||10)
  try {
    const rows = await db('logs')
      .select('comando')
      .count('id as count')
      .where({ tipo: 'comando' })
      .groupBy('comando')
      .orderBy('count','desc')
      .limit(Number.isFinite(limit)?limit:10)
    if (!rows.length) return { success:true, message:'ℹ️ Aún no hay comandos registrados', quoted:true }
    let msg = `📈 Top comandos (últimos registros)\n\n`
    rows.forEach((r,i)=>{ msg += `${i+1}. ${r.comando} — ${r.count}\n` })
    return { success:true, message: msg, quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ Error obteniendo top: ${e?.message||e}`, quoted:true }
  }
}

export default { find, topcmd }
