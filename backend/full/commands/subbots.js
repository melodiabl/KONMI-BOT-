// commands/subbots.js
import db from '../db.js'

const normalizeDigits = (v) => String(v || '').replace(/\D/g, '').split('@')[0];

export async function mine(ctx){
  const { usuario } = ctx;
  try {
    const phone = normalizeDigits(usuario);
    const rows = await db('subbots').where({ user_phone: phone }).orderBy('created_at','desc').limit(50);
    if(!rows.length) return { success:true, message:'📦 No tienes subbots.' }
    let msg = `🤖 Mis Subbots (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true
      msg += `${i+1}. ${r.code||'-'} — ${r.connection_type||'qr'} — ${online?'🟢':'⚪'}\n`
    })
    return { success:true, message: msg }
  }catch{ return { success:false, message:'⚠️ Error listando subbots.' } }
}

export async function all(ctx){
  const { isOwner } = ctx;
  if (!isOwner) return { message:'⛔ Solo el owner puede ver todos los subbots.' };
  try{
    const rows = await db('subbots').select('*').orderBy('created_at','desc').limit(100);
    if(!rows.length) return { success:true, message:'📦 No hay subbots registrados.' }
    let msg = `🤖 Subbots (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true
      msg += `${i+1}. ${r.code||'-'} — +${r.user_phone||'-'} — ${online?'🟢':'⚪'}\n`
    })
    return { success:true, message: msg }
  }catch{ return { success:false, message:'⚠️ Error listando subbots globales.' } }
}

export default { mine, all }
