// commands/content.js
// Contenido: manhwas, series, extra, ilustraciones, packs

import db from '../db.js';
import { processWhatsAppMedia } from '../file-manager.js';

// Manhwas
async function ensureManhwasTable() {
  const exists = await db.schema.hasTable('manhwas')
  if (!exists) {
    await db.schema.createTable('manhwas', (t) => {
      t.increments('id')
      t.string('titulo')
      t.string('genero')
      t.text('descripcion')
      t.string('cover_path')
      t.timestamp('created_at').defaultTo(db.fn.now())
    })
  }
}

async function ensureAportesTable() {
  const exists = await db.schema.hasTable('aportes')
  if (!exists) {
    await db.schema.createTable('aportes', (t) => {
      t.increments('id')
      t.string('tipo').index()
      t.string('contenido').index()
      t.string('usuario')
      t.timestamp('fecha').defaultTo(db.fn.now())
    })
  }
}

export async function listManhwas() {
  try {
    await ensureManhwasTable()
    const manhwas = await db('manhwas').select('*').limit(10);
    if (manhwas.length === 0) {
      return { success: true, message: '📚 *Lista de manhwas*\n\nℹ️ No hay manhwas registrados.\n\n➕ Usa `/addmanhwa` para agregar uno.', quoted: true };
    }
    let text = '📚 *Lista de manhwas*\n\n';
    manhwas.forEach((m, i) => {
      text += `${i + 1}. **${m.titulo}**\n`;
      text += `   🏷️ Género: ${m.genero}\n`;
      text += `   🗓️ Agregado: ${new Date(m.created_at).toLocaleDateString('es-ES')}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch (e) {
    return { success: false, message: '⚠️ Error obteniendo manhwas. Intenta más tarde.', quoted: true };
  }
}

export async function addManhwa({ message, usuario, args }) {
  try {
    await ensureManhwasTable()
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
    return { success: true, message: msg, quoted: true };
  } catch (e) {
    return { success: false, message: '⚠️ Error agregando manhwa. Intenta más tarde.', quoted: true };
  }
}

// Series
export async function listSeries() {
  try {
    await ensureManhwasTable()
    const series = await db('manhwas').where('genero', 'like', '%serie%').limit(10);
    if (series.length === 0) {
      return { success: true, message: '📺 *Lista de series*\n\nℹ️ No hay series registradas.\n\n➕ Usa `/addserie` para agregar una.', quoted: true };
    }
    let text = '📺 *Lista de series*\n\n';
    series.forEach((s, i) => {
      text += `${i + 1}. **${s.titulo}**\n`;
      text += `   🏷️ Género: ${s.genero}\n`;
      text += `   🗓️ Agregada: ${new Date(s.created_at).toLocaleDateString('es-ES')}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch (e) {
    return { success: false, message: '⚠️ Error obteniendo series. Intenta más tarde.', quoted: true };
  }
}

export async function addSerie({ message, usuario, args }) {
  try {
    await ensureManhwasTable()
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
    return { success: true, message: msg, quoted: true };
  } catch (e) {
    return { success: false, message: '⚠️ Error agregando serie. Intenta más tarde.', quoted: true };
  }
}

// Extra / Ilustraciones / Packs
export async function listExtra() {
  try {
    await ensureAportesTable()
    const extras = await db('aportes').where('tipo', 'extra').limit(10);
    if (extras.length === 0) return { success: true, message: 'ℹ️ No hay contenido extra disponible.', quoted: true };
    let text = '✨ *Contenido extra:*\n\n';
    extras.forEach((e, i) => {
      text += `${i + 1}. **${e.contenido}**\n`;
      text += `   👤 Por: ${e.usuario}\n`;
      text += `   🗓️ ${new Date(e.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error obteniendo contenido extra.', quoted: true };
  }
}

export async function listIlustraciones() {
  try {
    await ensureAportesTable()
    const rows = await db('aportes').where('tipo', 'ilustracion').limit(10);
    if (!rows.length) return { success: true, message: 'ℹ️ No hay ilustraciones disponibles.', quoted: true };
    let text = '🖼️ *Ilustraciones:*\n\n';
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error obteniendo ilustraciones.', quoted: true };
  }
}

export async function obtenerExtra({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerextra [nombre]\nEjemplo: /obtenerextra wallpaper', quoted: true };
  const searchTerm = args.join(' ');
  try {
    await ensureAportesTable()
    const rows = await db('aportes').where('tipo', 'extra').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontró contenido extra con: "${searchTerm}"`, quoted: true };
    let text = `✨ *Resultados para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error buscando contenido extra.', quoted: true };
  }
}

export async function obtenerIlustracion({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerilustracion [nombre]\nEjemplo: /obtenerilustracion anime', quoted: true };
  const searchTerm = args.join(' ');
  try {
    await ensureAportesTable()
    const rows = await db('aportes').where('tipo', 'ilustracion').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontraron ilustraciones con: "${searchTerm}"`, quoted: true };
    let text = `🖼️ *Ilustraciones para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error buscando ilustraciones.', quoted: true };
  }
}

export async function obtenerPack({ args }) {
  if (!args || !args.length) return { success: true, message: 'ℹ️ Uso: /obtenerpack [nombre]\nEjemplo: /obtenerpack stickers', quoted: true };
  const searchTerm = args.join(' ');
  try {
    await ensureAportesTable()
    const rows = await db('aportes').where('tipo', 'pack').where('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { success: true, message: `🔎 No se encontraron packs con: "${searchTerm}"`, quoted: true };
    let text = `🧩 *Packs para "${searchTerm}":*\n\n`;
    rows.forEach((r, i) => {
      text += `${i + 1}. **${r.contenido}**\n`;
      text += `   👤 Por: ${r.usuario}\n`;
      text += `   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
    });
    return { success: true, message: text, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error buscando packs.', quoted: true };
  }
}

// Buscar manhwa por título o género
export async function obtenerManhwa({ args }) {
  if (!args || !args.length) {
    return { success: true, message: 'ℹ️ Uso: /obtenermanhwa [término]\nEjemplo: /obtenermanhwa romance', quoted: true }
  }
  const searchTerm = args.join(' ')
  try {
    await ensureManhwasTable()
    const rows = await db('manhwas')
      .where('titulo', 'like', `%${searchTerm}%`)
      .orWhere('genero', 'like', `%${searchTerm}%`)
      .limit(10)
    if (!rows.length) {
      return { success: true, message: `🔎 No se encontraron manhwas con: "${searchTerm}"`, quoted: true }
    }
    let text = `📚 Resultados para "${searchTerm}":\n\n`
    rows.forEach((m, i) => {
      text += `${i + 1}. ${m.titulo} — ${m.genero}\n`
    })
    return { success: true, message: text, quoted: true }
  } catch {
    return { success: false, message: '⚠️ Error buscando manhwas.', quoted: true }
  }
}
