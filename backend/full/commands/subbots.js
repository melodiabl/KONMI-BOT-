// commands/subbots.js
// Listados de subbots (owner y personales)

import db from '../db.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function isOwner(usuario){ try{ const o=onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); return o && onlyDigits(usuario)===o }catch{return false} }

export async function mine({ usuario }){
  try{
    const phone = onlyDigits(usuario)
    const rows = await db('subbots').where({ user_phone: phone }).orderBy('created_at','desc').limit(50)
    if(!rows.length) return { success:true, message:'📦 No tienes subbots.' }
    let msg = `🤖 Mis Subbots (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true
      msg += `${i+1}. ${r.code||'-'} — ${r.connection_type||'qr'} — ${online?'🟢':'⚪'}\n`
    })
    return { success:true, message: msg }
  }catch{ return { success:false, message:'⚠️ Error listando subbots.' } }
}

export async function all({ usuario }){
  if (!isOwner(usuario)) return { success:true, message:'⛔ Solo el owner puede ver todos los subbots.' }
  try{
    const rows = await db('subbots').select('*').orderBy('created_at','desc').limit(100)
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

