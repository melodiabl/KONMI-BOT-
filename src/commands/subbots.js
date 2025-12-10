// commands/subbots.js – Comandos para gestionar subbots
import { listUserSubbots, listAllSubbots } from '../services/subbot-manager.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function normalizeDigits(userOrJid){
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
    const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
    return s.replace(/\D/g, '')
  } catch { return onlyDigits(userOrJid) }
}
function isOwner(usuario){
  try { const env = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); if (env && normalizeDigits(usuario)===env) return true } catch {}
  try { const base = onlyDigits(global.BOT_BASE_NUMBER||''); if (base && normalizeDigits(usuario)===base) return true } catch {}
  try { const first = Array.isArray(global.owner)&&global.owner[0]?.[0]; if (first && normalizeDigits(usuario)===onlyDigits(first)) return true } catch {}
  return false
}

// Comando /mybots - Muestra solo los subbots del usuario
export async function mybots({ usuario }){
  try{
    const phone = normalizeDigits(usuario)
    const rows = await listUserSubbots(phone)

    if(!rows.length) return { success:true, message:'📦 No tienes subbots creados.' }

    let msg = `🤖 *Mis Subbots* (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true || r.is_online===true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}

      // CORRECCIÓN: Para tipo 'code', mostrar el código de pairing como principal
      const pairingCode = metadata.pairingCode || '-'
      const identificationCode = r.code || metadata.identificationCode || '-'
      const displayName = metadata.displayName || metadata.creatorPushName || 'Sin nombre'

      msg += `${i+1}. *Código:* ${type === 'code' && pairingCode !== '-' ? pairingCode : identificationCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online?'🟢 Online':'⚪ Offline'}\n`
      msg += '\n'
    })

    return { success:true, message: msg.trim() }
  }catch(e){
    console.error('Error en mybots:', e)
    return { success:false, message:'⚠️ Error listando tus subbots.' }
  }
}

// Comando /bots - Muestra TODOS los subbots del sistema (solo owner)
export async function bots({ usuario }){
  if (!isOwner(usuario)) {
    return { success:false, message:'⛔ Solo el owner puede ver todos los subbots del sistema.' }
  }

  try{
    const rows = await listAllSubbots()

    if(!rows.length) return { success:true, message:'📦 No hay subbots en el sistema.' }

    let msg = `🤖 *Todos los Subbots del Sistema* (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true || r.is_online===true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}

      // CORRECCIÓN: Para tipo 'code', mostrar el código de pairing como principal
      const pairingCode = metadata.pairingCode || '-'
      const identificationCode = r.code || metadata.identificationCode || '-'
      const displayName = metadata.displayName || metadata.creatorPushName || 'Sin nombre'
      const ownerNumber = r.owner_number || 'Desconocido'

      msg += `${i+1}. *Código:* ${type === 'code' && pairingCode !== '-' ? pairingCode : identificationCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Owner:* ${ownerNumber}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online?'🟢 Online':'⚪ Offline'}\n`
      msg += '\n'
    })

    return { success:true, message: msg.trim() }
  }catch(e){
    console.error('Error en bots:', e)
    return { success:false, message:'⚠️ Error listando subbots del sistema.' }
  }
}

// Alias para compatibilidad
export async function mine(ctx){ return mybots(ctx) }
export async function all(ctx){ return bots(ctx) }

export default { mybots, bots, mine, all }
