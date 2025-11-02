// commands/content.js
// Contenido: manhwas, series, extra, ilustraciones, packs

import db from '../db.js';
import { processWhatsAppMedia } from '../file-manager.js';

// Manhwas
export async function listManhwas() {
  try {
    const manhwas = await db('manhwas').select('*').limit(10);
    if (manhwas.length === 0) {
      return { success: true, message: '📚 *Lista de manhwas*\n\nℹ️ No hay manhwas registrados.\n\n➕ Usa `/addmanhwa` para agregar uno.' };
    }
    let text = '📚 *Lista de manhwas*\n\n';
    manhwas.forEach((m, i) => {
      text += `${i + 1}. **${m.titulo}**\n`;
      text += `   🏷️ Género: ${m.genero}\n`;
      text += `   🗓️ Agregado: ${new Date(m.created_at).toLocaleDateString('es-ES')}\n\n`;
    });
    return { success: true, message: text };
  } catch (e) {
    return { success: false, message: '⚠️ Error obteniendo manhwas. Intenta más tarde.' };
  }
}

export async function addManhwa({ message, usuario, args }) {
  try {
    const raw = (args || []).join(' ').trim();
    const parts = (raw || '').split('|').map((p) => p.trim());
    const titulo = parts[0] || 'Sin titulo';
    const genero = parts[1] || 'General';
    const descripcion = parts[2] || 'Sin descripcion';

    const hasDirectMedia = !!(
      message?.message?.imageMessage ||
      message?.message?.videoMessage ||
      message?.message?.documentMessage ||
      message?.message?.audioMessage
    );
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let coverPath = null;

    if (hasDirectMedia) {
      const res = await processWhatsAppMedia(message, 'manhwa', usuario);
      if (res?.filepath) coverPath = res.filepath;
    } else if (
      quoted &&
      (quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage)
    ) {
      const qmsg = { message: quoted };
      const res = await processWhatsAppMedia(qmsg, 'manhwa', usuario);
      if (res?.filepath) coverPath = res.filepath;
    }

    await db('manhwas').insert({
      titulo,
      genero,
      descripcion,
      cover_path: coverPath || null,
      created_at: new Date().toISOString(),
    });

    const extra = coverPath ? '\n🖼️ Adjunto guardado' : '';
    const msg = `✅ *Manhwa agregado*\n\n📌 Título: ${titulo}\n🏷️ Género: ${genero}\n📝 Descripción: ${descripcion}${extra}\n👤 Por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString('es-ES')}`;
    return { success: true, message: msg };
  } catch (e) {
    return { success: false, message: '⚠️ Error agregando manhwa. Intenta más tarde.' };
  }
}

// Series
export async function listSeries() {
  try {
    const series = await db('manhwas').where('genero', 'like', '%serie%').limit(10);
    if (series.length === 0) {
      return { success: true, message: '📺 *Lista de series*\n\nℹ️ No hay series registradas.\n\n➕ Usa `/addserie` para agregar una.' };
    }
    let text = '📺 *Lista de series*\n\n';
    series.forEach((s, i) => {
      text += `${i + 1}. **${s.titulo}**\n`;
      text += `   🏷️ Género: ${s.genero}\n`;
      text += `   🗓️ Agregada: ${new Date(s.created_at).toLocaleDateString('es-ES')}\n\n`;
    });
    return { success: true, message: text };
  } catch (e) {
    return { success: false, message: '⚠️ Error obteniendo series. Intenta más tarde.' };
  }
}

export async function addSerie({ message, usuario, args }) {
  try {
    const raw = (args || []).join(' ').trim();
    const parts = (raw || '').split('|').map((p) => p.trim());
    const titulo = parts[0] || 'Sin titulo';
    const genero = parts[1] || 'Serie';
    const descripcion = parts[2] || 'Sin descripcion';

    const hasDirectMedia = !!(
      message?.message?.imageMessage ||
      message?.message?.videoMessage ||
      message?.message?.documentMessage ||
      message?.message?.audioMessage
    );
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let coverPath = null;

    if (hasDirectMedia) {
      const res = await processWhatsAppMedia(message, 'serie', usuario);
      if (res?.filepath) coverPath = res.filepath;
    } else if (
      quoted &&
      (quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage)
    ) {
      const qmsg = { message: quoted };
      const res = await processWhatsAppMedia(qmsg, 'serie', usuario);
      if (res?.filepath) coverPath = res.filepath;
    }

    await db('manhwas').insert({
      titulo,
      genero: `Serie - ${genero}`,
      descripcion,
      cover_path: coverPath || null,
      created_at: new Date().toISOString(),
    });

    const extra = coverPath ? '\n🖼️ Adjunto guardado' : '';
    const msg = `✅ *Serie agregada*\n\n📌 Título: ${titulo}\n🏷️ Género: ${genero}\n📝 Descripción: ${descripcion}${extra}\n👤 Por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString('es-ES')}`;
    return { success: true, message: msg };
  } catch (e) {
    return { success: false, message: '⚠️ Error agregando serie. Intenta más tarde.' };
  }
}

// Extra / Ilustraciones / Packs
export async function listExtra() {
  try {
    const extras = await db('aportes').where('tipo', 'extra').limit(10);
    if (extras.length === 0) return { success: true, message: 'ℹ️ No hay contenido extra disponible.' };
    let text = '✨ *Contenido extra:*\n\n';
    extras.forEach((e, i) => {
      text += `${i + 1}. **${e.contenido}**\n`;
      text += `   👤 Por: ${e.usuario}\n`;
      text += `   🗓️ ${new Date(e.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error obteniendo contenido extra.' };
  }
}

export async function listIlustraciones() {
  try {
    const rows = await db('aportes').where('tipo', 'ilustracion').limit(10);
    if (!rows.length) return { success: true, message: 'ℹ️ No hay ilustraciones disponibles.' };
    let text = '🖼️ *Ilustraciones:*\n\n';
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error obteniendo ilustraciones.' };
  }
}

export async function obtenerExtra({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerextra [nombre]\nEjemplo: /obtenerextra wallpaper' };
  const searchTerm = args.join(' ');
  try {
    const rows = await db('aportes').where('tipo', 'extra').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontró contenido extra con: "${searchTerm}"` };
    let text = `✨ *Resultados para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error buscando contenido extra.' };
  }
}

export async function obtenerIlustracion({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerilustracion [nombre]\nEjemplo: /obtenerilustracion anime' };
  const searchTerm = args.join(' ');
  try {
    const rows = await db('aportes').where('tipo', 'ilustracion').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontraron ilustraciones con: "${searchTerm}"` };
    let text = `🖼️ *Ilustraciones para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error buscando ilustraciones.' };
  }
}

export async function obtenerPack({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerpack [nombre]\nEjemplo: /obtenerpack stickers' };
  const searchTerm = args.join(' ');
  try {
    const rows = await db('aportes').where('tipo', 'pack').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontraron packs con: "${searchTerm}"` };
    let text = `🧩 *Packs para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text };
  } catch {
    return { success: false, message: '⚠️ Error buscando packs.' };
  }
}

