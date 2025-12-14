// src/commands/ai.js
import db from '../database/db.js'
import { chatWithAI, analyzeManhwaContent, analyzeContentWithAI } from '../../handler.js'

async function ai(ctx) {
  const { args, sender, remoteJid, fecha } = ctx;
  const pregunta = (args || []).join(' ').trim();
  if (!pregunta) return { text: 'ℹ️ Uso: /ai <pregunta>' };

  const aiResult = await chatWithAI(pregunta, `Usuario: ${sender}, Grupo: ${remoteJid}`);
  if (!aiResult?.success) return { text: `⚠️ ${aiResult?.error || 'IA no disponible'}` };

  try {
    await db('logs').insert({ tipo: 'ai_command', comando: '/ai', usuario: sender, grupo: remoteJid, fecha: fecha || new Date().toISOString(), detalles: JSON.stringify({ pregunta, respuesta: aiResult.response, modelo: aiResult.model || 'gemini' }) });
  } catch (e) {
    console.error('Error al guardar log de IA:', e);
  }

  return { text: `🤖 *Respuesta de IA:*\n\n${aiResult.response}\n\n_${aiResult.model || 'Gemini AI'}_` };
}

async function clasificar(ctx) {
  const { args, sender, remoteJid, fecha } = ctx;
  const texto = (args || []).join(' ').trim();
  if (!texto) return { text: 'ℹ️ Uso: /clasificar <texto>' };

  let res = await analyzeManhwaContent(texto);
  if (!res?.success) res = await analyzeContentWithAI(texto, '');
  if (!res?.success) return { text: `⚠️ Error IA: ${res?.error || 'no disponible'}` };

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
    console.error('Error al guardar log de clasificación:', e);
  }

  return { text: msg };
}

async function listClasificados() {
  try {
    const rows = await db('aportes').where({ fuente: 'auto_proveedor' }).select('contenido', 'tipo', 'fecha', 'metadata').orderBy('fecha', 'desc').limit(20);
    if (!rows.length) return { text: '📂 No hay contenido clasificado aún.' };

    let text = '📂 *Últimas clasificaciones automáticas*\n\n';
    rows.forEach((r, i) => {
      let meta = {};
      try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch {}
      const titulo = meta.titulo || r.contenido || 'Sin título';
      const tipo = r.tipo || meta.tipo || 'extra';
      const fec = r.fecha ? new Date(r.fecha).toLocaleDateString('es-ES') : '';
      text += `${i + 1}. *${titulo}*\n   › _${tipo}_ ${fec ? `| ${fec}` : ''}\n`;
    });

    return { text };
  } catch {
    return { text: '⚠️ Error al listar las clasificaciones.' };
  }
}

export default [
    {
        name: 'ai',
        description: 'Chatea con la inteligencia artificial.',
        category: 'ai',
        handler: ai
    },
    {
        name: 'clasificar',
        description: 'Clasifica contenido utilizando IA.',
        category: 'ai',
        handler: clasificar
    },
    {
        name: 'listclasificados',
        description: 'Muestra una lista del contenido clasificado.',
        category: 'ai',
        handler: listClasificados
    }
];
