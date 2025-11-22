// commands/content.js
// Contenido: manhwas, series, extra, ilustraciones, packs. Refactorizado para ctx.

import db from '../database/db.js';
import { processWhatsAppMedia } from '../services/file-manager.js';

// --- Tablas ---
async function ensureManhwasTable() {
  const exists = await db.schema.hasTable('manhwas');
  if (!exists) {
    await db.schema.createTable('manhwas', (t) => {
      t.increments('id');
      t.string('titulo');
      t.string('genero');
      t.text('descripcion');
      t.string('cover_path');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }
}

async function ensureAportesTable() {
  const exists = await db.schema.hasTable('aportes');
  if (!exists) {
    await db.schema.createTable('aportes', (t) => {
      t.increments('id');
      t.string('tipo').index();
      t.string('contenido').index();
      t.string('usuario');
      t.timestamp('fecha').defaultTo(db.fn.now());
    });
  }
}

// --- Comandos Refactorizados ---

export async function listManhwas(ctx) {
  await ensureManhwasTable();
  const manhwas = await db('manhwas').select('*').orderBy('created_at', 'desc').limit(10);
  if (manhwas.length === 0) return { message: '📚 No hay manhwas registrados.' };

  const list = manhwas.map((m, i) => `${i + 1}. *${m.titulo}*\n   › _${m.genero}_`).join('\n\n');
  return { message: `📚 *Últimos manhwas registrados*\n\n${list}` };
}

export async function addManhwa(ctx) {
  const { message, sender, args } = ctx;
  const parts = (args.join(' ') || '').split('|').map(p => p.trim());
  const [titulo, genero, descripcion] = parts;

  if (!titulo) return { success: false, message: '❌ Uso: /addmanhwa <título>|<género>|<descripción>' };

  await ensureManhwasTable();
  let coverPath = null;
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const mediaMsg = quoted ? { message: quoted } : message;

  if (mediaMsg?.message?.imageMessage) {
      const res = await processWhatsAppMedia(mediaMsg, 'manhwa_covers', sender);
      if (res.filepath) coverPath = res.filepath;
  }

  await db('manhwas').insert({ titulo, genero, descripcion, cover_path: coverPath });
  return { success: true, message: `✅ Manhwa "${titulo}" agregado.` };
}

export async function listSeries(ctx) {
  await ensureManhwasTable();
  const series = await db('manhwas').where('genero', 'like', '%serie%').orderBy('created_at', 'desc').limit(10);
  if (series.length === 0) return { message: '📺 No hay series registradas.' };

  const list = series.map((s, i) => `${i + 1}. *${s.titulo}*`).join('\n');
  return { message: `📺 *Últimas series registradas*\n\n${list}` };
}

export async function addSerie(ctx) {
  const { message, sender, args } = ctx;
  const parts = (args.join(' ') || '').split('|').map(p => p.trim());
  const [titulo, genero, descripcion] = parts;

  if (!titulo) return { success: false, message: '❌ Uso: /addserie <título>|<género>|<descripción>' };

  await ensureManhwasTable();
  let coverPath = null;
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const mediaMsg = quoted ? { message: quoted } : message;

  if (mediaMsg?.message?.imageMessage) {
      const res = await processWhatsAppMedia(mediaMsg, 'serie_covers', sender);
      if (res.filepath) coverPath = res.filepath;
  }

  await db('manhwas').insert({ titulo, genero: `Serie - ${genero || 'General'}`, descripcion, cover_path: coverPath });
  return { success: true, message: `✅ Serie "${titulo}" agregada.` };
}

async function listContentByType(type, title) {
    await ensureAportesTable();
    const rows = await db('aportes').where({ tipo: type }).orderBy('fecha', 'desc').limit(10);
    if (rows.length === 0) return { message: `ℹ️ No hay contenido de tipo "${type}" disponible.` };

    const list = rows.map((r, i) => `${i + 1}. *${r.contenido}*\n   › Por: @${r.usuario.split('@')[0]}`).join('\n\n');
    const mentions = rows.map(r => r.usuario);
    return { message: `${title}\n\n${list}`, mentions };
}

export const listExtra = () => listContentByType('extra', '✨ *Contenido extra*');
export const listIlustraciones = () => listContentByType('ilustracion', '🖼️ *Ilustraciones*');

// Aliases requeridos por el registry (nombres exactos)
export const listExtras = () => listExtra()


async function findContent(type, searchTerm, title) {
    await ensureAportesTable();
    const rows = await db('aportes').where({ tipo: type }).andWhere('contenido', 'like', `%${searchTerm}%`).limit(5);
    if (!rows.length) return { message: `😕 No encontré resultados para "${searchTerm}" en ${type}.` };

    const list = rows.map((r, i) => `${i + 1}. *${r.contenido}*\n   › Por: @${r.usuario.split('@')[0]}`).join('\n\n');
    const mentions = rows.map(r => r.usuario);
    return { message: `${title} para "${searchTerm}":\n\n${list}`, mentions };
}

export async function obtenerExtra(ctx) {
    const searchTerm = ctx.args.join(' ');
    if (!searchTerm) return { success: false, message: '❌ Uso: /obtenerextra [búsqueda]' };
    return findContent('extra', searchTerm, '✨ Resultados de Extras');
}

export async function obtenerIlustracion(ctx) {
    const searchTerm = ctx.args.join(' ');
    if (!searchTerm) return { success: false, message: '❌ Uso: /obtenerilustracion [búsqueda]' };
    return findContent('ilustracion', searchTerm, '🖼️ Resultados de Ilustraciones');
}

export async function obtenerPack(ctx) {
    const searchTerm = ctx.args.join(' ');
    if (!searchTerm) return { success: false, message: '❌ Uso: /obtenerpack [búsqueda]' };
    return findContent('pack', searchTerm, '🧩 Resultados de Packs');
}

export async function obtenerManhwa(ctx) {
  const searchTerm = ctx.args.join(' ');
  if (!searchTerm) return { success: false, message: '❌ Uso: /obtenermanhwa [búsqueda]' };

  await ensureManhwasTable();
  const rows = await db('manhwas')
    .where('titulo', 'like', `%${searchTerm}%`)
    .orWhere('genero', 'like', `%${searchTerm}%`)
    .limit(10);

  if (!rows.length) return { message: `😕 No se encontraron manhwas para "${searchTerm}".` };

  const list = rows.map((m, i) => `${i + 1}. *${m.titulo}* - _${m.genero}_`).join('\n');
  return { message: `📚 Resultados para "${searchTerm}":\n\n${list}` };
}

// Aliases con nombres esperados en registry
export const getExtra = (ctx) => obtenerExtra(ctx)
export const getIlustracion = (ctx) => obtenerIlustracion(ctx)
export const getPack = (ctx) => obtenerPack(ctx)
export const getManhwa = (ctx) => obtenerManhwa(ctx)

export default {
  listManhwas,
  addManhwa,
  listSeries,
  addSerie,
  listExtra,
  listExtras,
  listIlustraciones,
  obtenerExtra,
  obtenerIlustracion,
  obtenerPack,
  obtenerManhwa,
  getExtra,
  getIlustracion,
  getPack,
  getManhwa,
}
