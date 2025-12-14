// src/commands/aportes.js
import db from '../database/db.js'
import { processWhatsAppMedia } from '../services/file-manager.js'

async function myAportes({ usuario }) {
  try {
    const rows = await db('aportes').where({ usuario }).orderBy('fecha','desc').limit(10);
    if (!rows.length) return { text:'📭 *Mis Aportes*\n\nNo tienes aportes registrados.' };
    let msg = '📋 *Mis Aportes*\n\n';
    rows.forEach((r,i)=>{ msg += `${i+1}. **${r.contenido}**\n   • Tipo: ${r.tipo}\n   • Estado: ${r.estado||'pendiente'}\n   • Fecha: ${new Date(r.fecha).toLocaleDateString('es-ES')}\n\n` });
    return { text: msg };
  } catch { return { text:'⚠️ Error obteniendo tus aportes.' } }
}

async function listAportes({ isGroup, remoteJid }) {
  try {
    let q = db('aportes').orderBy('fecha','desc').limit(20);
    if (isGroup && remoteJid) q = q.where({ grupo: remoteJid });
    const rows = await q;
    if (!rows.length) return { text:'📭 *Lista de Aportes*\n\nNo hay aportes disponibles.' };
    let msg = '📚 *Lista de Aportes*\n\n';
    rows.forEach((r,i)=>{ msg += `${i+1}. **${r.contenido}**\n   • Usuario: ${r.usuario}\n   • Fecha: ${new Date(r.fecha).toLocaleDateString('es-ES')}\n\n` });
    return { text: msg };
  } catch { return { text:'⚠️ Error listando aportes.' } }
}

async function addAporteCmd({ args, usuario, remoteJid, fecha }) {
  try {
    const raw = (args||[]).join(' ').trim();
    const parts = raw.includes('|') ? raw.split('|').map(s=>s.trim()) : [raw,'extra'];
    const contenido = parts[0] || '';
    const tipo = parts[1] || 'extra';
    await db('aportes').insert({ usuario, grupo: remoteJid, contenido, tipo, fecha: fecha || new Date().toISOString(), estado:'pendiente' });
    return { text:`✅ Aporte registrado\n\n📝 ${contenido}\n🏷️ ${tipo}` };
  } catch { return { text:'⚠️ Error agregando aporte.' } }
}

async function addAporteWithMedia({ message, args, usuario, remoteJid, fecha }) {
  const raw = (args||[]).join(' ').trim();
  const parts = raw.includes('|') ? raw.split('|').map(s=>s.trim()) : [raw,'extra'];
  const contenido = parts[0] || '';
  const tipo = parts[1] || 'extra';
  let mediaPath = null;
  const hasDirect = !!(message?.message?.imageMessage||message?.message?.videoMessage);
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  try {
    if (hasDirect) { const res = await processWhatsAppMedia(message,'aporte',usuario); if (res?.filepath) mediaPath = res.filepath; }
    else if (quoted) { const qmsg = { message: quoted }; const res = await processWhatsAppMedia(qmsg,'aporte',usuario); if (res?.filepath) mediaPath = res.filepath; }
  } catch {}
  try {
    await db('aportes').insert({ usuario, grupo: remoteJid, contenido, tipo, archivo_path: mediaPath, fecha: fecha || new Date().toISOString(), estado:'pendiente' });
    return { text:`✅ Aporte registrado${mediaPath?' (con adjunto)':''}\n\n📝 ${contenido}\n🏷️ ${tipo}` };
  } catch { return { text:'⚠️ Error agregando aporte con media.' } }
}

async function setAporteEstado({ args }) {
  try {
    const id = parseInt(args?.[0]||'0',10);
    const nuevoEstado = String(args?.[1]||'').toLowerCase();
    const valid = ['pendiente','aprobado','rechazado','publicado'];
    if (!id || !valid.includes(nuevoEstado)) return { text:'ℹ️ Uso: /aporteestado <id> <pendiente|aprobado|rechazado|publicado>' };
    await db('aportes').where({ id }).update({ estado: nuevoEstado });
    return { text:`✅ Estado del aporte #${id} actualizado a ${nuevoEstado}` };
  } catch { return { text:'⚠️ Error actualizando estado.' } }
}

export default [
    {
        name: 'misaportes',
        description: 'Muestra tus aportes realizados.',
        category: 'aportes',
        handler: myAportes
    },
    {
        name: 'listaportes',
        description: 'Muestra los últimos aportes.',
        category: 'aportes',
        handler: listAportes
    },
    {
        name: 'aporte',
        description: 'Añade un nuevo aporte de texto.',
        category: 'aportes',
        handler: addAporteCmd
    },
    {
        name: 'aportemedia',
        description: 'Añade un nuevo aporte con imagen o video.',
        category: 'aportes',
        handler: addAporteWithMedia
    },
    {
        name: 'aporteestado',
        description: 'Cambia el estado de un aporte (admin).',
        category: 'admin',
        handler: setAporteEstado
    }
];
