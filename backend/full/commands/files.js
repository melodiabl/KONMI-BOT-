// commands/files.js
// Gestión de archivos / descargas

import { processWhatsAppMedia, listDownloads, getDownloadStats } from '../file-manager.js'

export async function guardar({ message, usuario }) {
  try {
    const res = await processWhatsAppMedia(message, 'user', usuario)
    if (res?.filepath) return { success:true, message:`✅ Guardado: ${res.filepath}` }
    return { success:true, message:'ℹ️ Responde a una imagen/video/documento/audio con /guardar' }
  } catch { return { success:false, message:'⚠️ Error guardando media.' } }
}

export async function archivos() {
  try {
    const rows = await listDownloads()
    if (!rows?.length) return { success:true, message:'📁 No hay archivos.' }
    let msg = '📁 Archivos\n\n'
    rows.slice(0,20).forEach((r,i)=>{ msg+=`${i+1}. ${r.name||r.file||'-'} — ${Math.round((r.size||0)/1024)}KB\n` })
    return { success:true, message: msg }
  } catch { return { success:false, message:'⚠️ Error listando archivos.' } }
}

export async function misArchivos({ usuario }) {
  try {
    const rows = await listDownloads(onlyDigits(usuario))
    if (!rows?.length) return { success:true, message:'📁 No tienes archivos.' }
    let msg = '📁 Tus archivos\n\n'
    rows.slice(0,20).forEach((r,i)=>{ msg+=`${i+1}. ${r.name||r.file||'-'} — ${Math.round((r.size||0)/1024)}KB\n` })
    return { success:true, message: msg }
  } catch { return { success:false, message:'⚠️ Error listando tus archivos.' } }
}

export async function buscarArchivo({ args }) {
  const q = (args||[]).join(' ').trim().toLowerCase()
  if (!q) return { success:true, message:'ℹ️ Uso: /buscararchivo <texto>' }
  try {
    const rows = await listDownloads()
    const hits = rows.filter(r => (r.name||r.file||'').toLowerCase().includes(q))
    if (!hits.length) return { success:true, message:'🔎 Sin resultados.' }
    let msg = '🔎 Resultados\n\n'
    hits.slice(0,20).forEach((r,i)=>{ msg+=`${i+1}. ${r.name||r.file||'-'}\n` })
    return { success:true, message: msg }
  } catch { return { success:false, message:'⚠️ Error buscando archivos.' } }
}

export async function estadisticas() {
  try {
    const s = await getDownloadStats()
    return { success:true, message:`📊 Archivos: ${s?.count||0} — Tamaño total: ${Math.round((s?.totalSize||0)/1024/1024)}MB` }
  } catch { return { success:false, message:'⚠️ Error obteniendo estadísticas.' } }
}

export async function stats() { return estadisticas() }

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }

export default { guardar, archivos, misArchivos, buscarArchivo, estadisticas, stats }

