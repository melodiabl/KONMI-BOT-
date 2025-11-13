// commands/broadcast.js — Envío masivo a grupos autorizados (owner)
import db from '../db.js'

export async function broadcast(ctx){
  const { sock, isOwner, args } = ctx;
  if (!isOwner) return { message:'⛔ Solo el OWNER puede usar /broadcast' };
  const text = (args||[]).join(' ').trim();
  if (!text) return { success:true, message:'ℹ️ Uso: /broadcast [mensaje]', quoted:true }
  try {
    let groups = []
    try { groups = await db('grupos_autorizados').select('jid').where({ bot_enabled:true }) } catch {}
    if (!Array.isArray(groups) || groups.length===0) return { success:true, message:'ℹ️ No hay grupos autorizados', quoted:true }
    let sent=0, fail=0
    for (const g of groups) {
      try { await sock.sendMessage(g.jid, { text }); sent++ } catch { fail++ }
    }
    return { success:true, message:`📢 Broadcast enviado. OK=${sent} FAIL=${fail}`, quoted:true }
  } catch (e) {
    return { success:false, message:`⚠️ Error en broadcast: ${e?.message||e}`, quoted:true }
  }
}

export default { broadcast }

