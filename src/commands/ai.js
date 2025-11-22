// commands/ai.js
// IA: chat y clasificación, refactorizado para usar el contexto (ctx) unificado

import db from '../database/db.js'
import { chatWithAI, analyzeManhwaContent, analyzeContentWithAI } from '../../handler.js'

export async function ai(ctx) {
  const { args, sender, remoteJid, fecha } = ctx;
  const pregunta = (args || []).join(' ').trim();
  if (!pregunta) return { success: true, message: 'ℹ️ Uso: /ai <pregunta>' };

  const aiResult = await chatWithAI(pregunta, `Usuario: ${sender}, Grupo: ${remoteJid}`);
  if (!aiResult?.success) return { success: false, message: `⚠️ ${aiResult?.error || 'IA no disponible'}` };

  try {
    await db('logs').insert({ tipo: 'ai_command', comando: '/ai', usuario: sender, grupo: remoteJid, fecha: fecha || new Date().toISOString(), detalles: JSON.stringify({ pregunta, respuesta: aiResult.response, modelo: aiResult.model || 'gemini' }) });
  } catch (e) {
      console.error('Error al guardar log de IA:', e.message);
  }

  return { success: true, message: `🤖 *Respuesta de IA:*\n\n${aiResult.response}\n\n_${aiResult.model || 'Gemini AI'}_` };
}

export async function clasificar(ctx) {
  const { args, sender, remoteJid, fecha } = ctx;
  const texto = (args || []).join(' ').trim();
  if (!texto) return { success: true, message: 'ℹ️ Uso: /clasificar <texto>' };

  let res = await analyzeManhwaContent(texto);
  if (!res?.success) res = await analyzeContentWithAI(texto, '');
  if (!res?.success) return { success: false, message: `⚠️ Error IA: ${res?.error || 'no disponible'}` };

  const data = res.analysis || {};
  const msg = [
    '🧠 *Clasificación de IA*',
    `• *Título:* ${data.titulo || 'N/A'}`,
    `• *Tipo:* ${data.tipo || 'extra'}`,
    data.capitulo ? `• *Capítulo:* ${data.capitulo}` : null,
    `• *Confianza:* ${Math.round(data.confianza || 50)}%`,
  ].filter(Boolean).join('\n');

  try {
    await db('logs').insert({ tipo: 'clasificar_command', comando: '/clasificar', usuario: sender, grupo: remoteJid, fecha: fecha || new Date().toISOString(), detalles: JSON.stringify({ texto, resultado: data }) });
  } catch (e) {
      console.error('Error al guardar log de clasificación:', e.message);
  }

  return { success: true, message: msg };
}

export async function listClasificados() {
  try {
    const rows = await db('aportes').where({ fuente: 'auto_proveedor' }).select('contenido', 'tipo', 'fecha', 'metadata').orderBy('fecha', 'desc').limit(20);
    if (!rows.length) return { success: true, message: '📂 No hay contenido clasificado aún.' };

    let text = '📂 *Últimas clasificaciones automáticas*\n\n';
    rows.forEach((r, i) => {
      let meta = {};
      try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch {}
      const titulo = meta.titulo || r.contenido || 'Sin título';
      const tipo = r.tipo || meta.tipo || 'extra';
      const fec = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '';
      text += `${i + 1}. *${titulo}*\n   › _${tipo}_ ${fec ? `| ${fec}` : ''}\n`;
    });

    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error al listar las clasificaciones.' };
  }
}

export default { ai, clasificar, listClasificados };
