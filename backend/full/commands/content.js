import db from '../db.js';
import { processWhatsAppMedia } from '../file-manager.js';

const requireAdmin = (handler) => async (ctx) => {
  if (!ctx.isOwner && !ctx.isAdmin) return { message: '⛔ Solo admins o el owner pueden agregar contenido.' };
  return handler(ctx);
};

const listContent = async (type, title, emptyMsg) => {
  const items = await db('aportes').where({ tipo: type }).limit(10);
  if (!items.length) return { message: emptyMsg };
  let text = `✨ *${title}:*\n\n`;
  items.forEach((e, i) => {
    text += `${i + 1}. **${e.contenido}**\n   👤 Por: ${e.usuario}\n   🗓️ ${new Date(e.fecha).toLocaleDateString()}\n\n`;
  });
  return { message: text };
};

const findContent = async (type, searchTerm, title) => {
  if (!searchTerm) return { message: `ℹ️ Uso: /obtener${type} [nombre]` };
  const rows = await db('aportes').where({ tipo: type }).where('contenido', 'like', `%${searchTerm}%`).limit(5);
  if (!rows.length) return { message: `🔎 No se encontró contenido con: "${searchTerm}"` };
  let text = `✨ *Resultados para "${searchTerm}":*\n\n`;
  rows.forEach((r, i) => {
    text += `${i + 1}. **${r.contenido}**\n   👤 Por: ${r.usuario}\n   🗓️ ${new Date(r.fecha).toLocaleDateString()}\n\n`;
  });
  return { message: text };
};

export const listManhwas = () => listContent('manhwa', 'Lista de manhwas', 'ℹ️ No hay manhwas registrados.');
export const listSeries = () => listContent('serie', 'Lista de series', 'ℹ️ No hay series registradas.');
export const listExtra = () => listContent('extra', 'Contenido extra', 'ℹ️ No hay contenido extra disponible.');
export const listIlustraciones = () => listContent('ilustracion', 'Ilustraciones', 'ℹ️ No hay ilustraciones disponibles.');

export const obtenerManhwa = (ctx) => findContent('manhwa', ctx.args.join(' '), 'manhwas');
export const obtenerSerie = (ctx) => findContent('serie', ctx.args.join(' '), 'series');
export const obtenerExtra = (ctx) => findContent('extra', ctx.args.join(' '), 'contenido extra');
export const obtenerIlustracion = (ctx) => findContent('ilustracion', ctx.args.join(' '), 'ilustraciones');
export const obtenerPack = (ctx) => findContent('pack', ctx.args.join(' '), 'packs');

const addContent = (type) => requireAdmin(async (ctx) => {
  const { message, usuario, args } = ctx;
  const [titulo, genero, descripcion] = args.join(' ').split('|').map(p => p.trim());
  if (!titulo) return { message: `ℹ️ Uso: /add${type} <título>|<género>|<descripción>` };

  const media = message?.message?.imageMessage || message?.message?.videoMessage || message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  let cover_path = null;
  if (media) {
    const res = await processWhatsAppMedia({ message: media }, type, usuario);
    cover_path = res?.filepath;
  }

  await db('aportes').insert({
    tipo: type,
    contenido: titulo,
    usuario: usuario.split('@')[0],
    metadata: JSON.stringify({ genero, descripcion, cover_path })
  });

  return { message: `✅ *${type.charAt(0).toUpperCase() + type.slice(1)} agregado:*\n\n📌 Título: ${titulo}` };
});

export const addManhwa = addContent('manhwa');
export const addSerie = addContent('serie');
