// commands/aportes.js
// Implementación directa para aportes

import db from './database/db.js'
import { processWhatsAppMedia } from './services/file-manager.js'

export async function myAportes({ usuario, remoteJid }) {
  try {
    const rows = await db('aportes').where({ usuario }).orderBy('fecha','desc').limit(10)
    if (!rows.length) return { success:true, message:'📭 *Mis Aportes*\n\nNo tienes aportes registrados.', quoted: true }
    let msg = '📋 *Mis Aportes*\n\n'
    rows.forEach((r,i)=>{ msg += `${i+1}. **${r.contenido}**\n   • Tipo: ${r.tipo}\n   • Estado: ${r.estado||'pendiente'}\n   • Fecha: ${new Date(r.fecha).toLocaleDateString('es-ES')}\n\n` })
    return { success:true, message: msg, quoted: true }
  } catch { return { success:false, message:'⚠️ Error obteniendo tus aportes.', quoted: true } }
}

export async function listAportes({ isGroup, usuario, remoteJid }) {
  try {
    let q = db('aportes').orderBy('fecha','desc').limit(20)
    if (isGroup && remoteJid) q = q.where({ grupo: remoteJid })
    const rows = await q
    if (!rows.length) return { success:true, message:'📭 *Lista de Aportes*\n\nNo hay aportes disponibles.', quoted: true }
    let msg = '📚 *Lista de Aportes*\n\n'
    rows.forEach((r,i)=>{ msg += `${i+1}. **${r.contenido}**\n   • Tipo: ${r.tipo}\n   • Estado: ${r.estado||'pendiente'}\n   • Usuario: ${r.usuario}\n   • Fecha: ${new Date(r.fecha).toLocaleDateString('es-ES')}\n\n` })
    return { success:true, message: msg, quoted: true }
  } catch { return { success:false, message:'⚠️ Error listando aportes.', quoted: true } }
}

export async function addAporteCmd({ args, usuario, remoteJid, fecha }) {
  try {
    const raw = (args||[]).join(' ').trim()
    const parts = raw.includes('|') ? raw.split('|').map(s=>s.trim()) : [raw,'extra']
    const contenido = parts[0] || ''
    const tipo = parts[1] || 'extra'
    await db('aportes').insert({ usuario, grupo: remoteJid, contenido, tipo, fecha: fecha || new Date().toISOString(), estado:'pendiente' })
    return { success:true, message:`✅ Aporte registrado\n\n📝 ${contenido}\n🏷️ ${tipo}`, quoted: true }
  } catch { return { success:false, message:'⚠️ Error agregando aporte.', quoted: true } }
}

export async function addAporteWithMedia({ message, args, usuario, remoteJid, fecha }) {
  const raw = (args||[]).join(' ').trim()
  const parts = raw.includes('|') ? raw.split('|').map(s=>s.trim()) : [raw,'extra']
  const contenido = parts[0] || ''
  const tipo = parts[1] || 'extra'
  let mediaPath = null
  const hasDirect = !!(message?.message?.imageMessage||message?.message?.videoMessage||message?.message?.documentMessage||message?.message?.audioMessage)
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage
  try {
    if (hasDirect) { const res = await processWhatsAppMedia(message,'aporte',usuario); if (res?.filepath) mediaPath = res.filepath }
    else if (quoted && (quoted.imageMessage||quoted.videoMessage||quoted.documentMessage||quoted.audioMessage)) { const qmsg = { message: quoted }; const res = await processWhatsAppMedia(qmsg,'aporte',usuario); if (res?.filepath) mediaPath = res.filepath }
  } catch {}
  try {
    await db('aportes').insert({ usuario, grupo: remoteJid, contenido, tipo, archivo_path: mediaPath, fecha: fecha || new Date().toISOString(), estado:'pendiente' })
    return { success:true, message:`✅ Aporte registrado${mediaPath?' (con adjunto)':''}\n\n📝 ${contenido}\n🏷️ ${tipo}`, quoted: true }
  } catch { return { success:false, message:'⚠️ Error agregando aporte con media.', quoted: true } }
}

export async function setAporteEstado({ args, usuario }) {
  try {
    const id = parseInt(args?.[0]||'0',10)
    const nuevoEstado = String(args?.[1]||'').toLowerCase()
    const valid = ['pendiente','aprobado','rechazado','publicado']
    if (!id || !valid.includes(nuevoEstado)) return { success:true, message:'ℹ️ Uso: /aporteestado <id> <pendiente|aprobado|rechazado|publicado>', quoted: true }
    await db('aportes').where({ id }).update({ estado: nuevoEstado })
    return { success:true, message:`✅ Estado del aporte #${id} actualizado a ${nuevoEstado}`, quoted: true }
  } catch { return { success:false, message:'⚠️ Error actualizando estado.', quoted: true } }
}
