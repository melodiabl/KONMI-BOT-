// commands/ai.js
// IA: chat y clasificación usando funciones del handler principal

import db from '../db.js'
import { chatWithAI, analyzeManhwaContent, analyzeContentWithAI } from '../handler.js'

export async function ai({ args, usuario, remoteJid, fecha }) {
  const pregunta = (args||[]).join(' ').trim()
  if (!pregunta) return { success:true, message:'ℹ️ Uso: /ai <pregunta>', quoted: true }
  const aiResult = await chatWithAI(pregunta, `Usuario: ${usuario}, Grupo: ${remoteJid}`)
  if (!aiResult?.success) return { success:false, message:`⚠️ ${aiResult?.error || 'IA no disponible'}`, quoted: true }
  try {
    await db('logs').insert({ tipo:'ai_command', comando:'/ai', usuario, grupo: remoteJid, fecha: fecha||new Date().toISOString(), detalles: JSON.stringify({ pregunta, respuesta: aiResult.response, modelo: aiResult.model||'gemini' }) })
  } catch {}
  return { success:true, message:`🤖 Respuesta de IA:\n\n${aiResult.response}\n\n_${aiResult.model || 'Gemini'}_`, quoted: true }
}

export async function clasificar({ args, usuario, remoteJid, fecha }) {
  const texto = (args||[]).join(' ').trim()
  if (!texto) return { success:true, message:'ℹ️ Uso: /clasificar <texto>', quoted: true }
  let res = await analyzeManhwaContent(texto)
  if (!res?.success) res = await analyzeContentWithAI(texto, '')
  if (!res?.success) return { success:false, message:`⚠️ Error IA: ${res?.error || 'no disponible'}`, quoted: true }
  const data = res.analysis || res.data || {}
  const msg = [
    '🧠 Clasificación de IA',
    `• Título: ${data.titulo || 'N/A'}`,
    `• Tipo: ${data.tipo || 'extra'}`,
    data.capitulo ? `• Capítulo: ${data.capitulo}` : null,
    data.descripcion ? `• Descripción: ${data.descripcion}` : null,
    `• Confianza: ${Math.round(data.confianza || 50)}%`,
  ].filter(Boolean).join('\n')
  try { await db('logs').insert({ tipo:'clasificar_command', comando:'/clasificar', usuario, grupo: remoteJid, fecha: fecha||new Date().toISOString(), detalles: JSON.stringify({ texto, resultado: data }) }) } catch {}
  return { success:true, message: msg, quoted: true }
}

export async function listClasificados() {
  try {
    const rows = await db('aportes').where({ fuente:'auto_proveedor' }).select('contenido','tipo','fecha','metadata').orderBy('fecha','desc').limit(20)
    if (!rows.length) return { success:true, message:'📂 No hay contenido clasificado aún.', quoted: true }
    let text = '📂 Últimas clasificaciones\n\n'
    for (let i=0;i<rows.length;i++){
      const r = rows[i]
      let meta = {}
      try { meta = r.metadata ? JSON.parse(r.metadata) : {} } catch {}
      const titulo = meta.titulo || r.contenido || 'Sin título'
      const tipo = r.tipo || meta.tipo || 'extra'
      const fec = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : ''
      text += `${i+1}. ${titulo}\n   ${tipo}${fec?` | ${fec}`:''}\n\n`
    }
    return { success:true, message:text, quoted: true }
  } catch { return { success:false, message:'⚠️ Error listando clasificaciones.', quoted: true } }
}

export default { ai, clasificar, listClasificados }
