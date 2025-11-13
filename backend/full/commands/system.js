import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const requireOwner = (handler) => async (ctx) => {
  if (!ctx.isOwner) return { message: '⛔ Este comando solo puede ser usado por el owner del bot.' };
  return handler(ctx);
};

export const cleanSession = requireOwner(async () => {
  const targets = [path.join(process.cwd(), 'backend', 'full', 'storage', 'baileys_full')];
  let cleaned = 0;
  for (const dir of targets) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      cleaned++;
    }
  }
  return { message: `🧹 ${cleaned} sesión(es) limpiada(s). Reinicia el bot.` };
});

export const logs = requireOwner(async ({ args }) => {
  const limit = parseInt(args[0] || '10', 10);
  const rows = await db('logs').select('*').orderBy('fecha', 'desc').limit(isNaN(limit) ? 10 : limit);
  if (!rows.length) return { message: '🗒️ No hay logs.' };
  const logList = rows.map((r, i) => `${i + 1}. [${r.tipo || '-'}] ${r.comando || ''} - ${new Date(r.fecha).toLocaleString('es-ES')}`).join('\n');
  return { message: `🗒️ Logs recientes\n\n${logList}` };
});

export const config = requireOwner(async ({ args }) => {
  const [sub, key, ...valueParts] = args;
  const value = valueParts.join(' ');

  if (sub === 'set') {
    if (!key) return { message: 'ℹ️ Uso: /config set <key> <valor>' };
    await db('bot_config').insert({ key, value }).onConflict('key').merge();
    return { message: `✅ Config ${key} = ${value}` };
  }
  if (sub === 'get') {
    if (!key) return { message: 'ℹ️ Uso: /config get <key>' };
    const row = await db('bot_config').where({ key }).first();
    return { message: row ? `🔧 ${key} = ${row.value || ''}` : 'ℹ️ No definido' };
  }
  return { message: 'ℹ️ Uso: /config get <key> | /config set <key> <valor>' };
});

export async function registrar(ctx) {
  const { args, usuario } = ctx;
  const username = args[0];
  if (!username) return { message: 'ℹ️ Uso: /registrar <username>' };
  const whatsapp_number = usuario.split('@')[0];
  const existing = await db('usuarios').where({ username }).orWhere({ whatsapp_number }).first();
  if (existing) return { message: '⚠️ Ya existe un usuario con ese nombre o número.' };

  const tempPassword = Math.random().toString(36).slice(-8);
  const password = await bcrypt.hash(tempPassword, 10);

  await db('usuarios').insert({ username, whatsapp_number, password, rol: 'usuario' });
  return { message: `✅ Usuario ${username} registrado.\n\n🔑 Tu contraseña temporal es: ${tempPassword}\n\nÚsala para iniciar sesión en el panel.` };
}

export const resetpass = requireOwner(async ({ args }) => {
  const [username, newPass] = args;
  if (!username || !newPass) return { message: 'ℹ️ Uso: /resetpass <username> <newpass>' };
  const password = await bcrypt.hash(newPass, 10);
  const updated = await db('usuarios').where({ username }).update({ password });
  return { message: updated ? '✅ Password actualizado' : 'ℹ️ Usuario no encontrado' };
});

export async function miinfo(ctx) {
  const { usuario } = ctx;
  const whatsapp_number = usuario.split('@')[0];
  const row = await db('usuarios').where({ whatsapp_number }).first();
  if (!row) return { message: 'ℹ️ Aún no estás registrado. Usa /registrar <username>' };
  const { username, rol, created_at } = row;
  const fecha = created_at ? new Date(created_at).toLocaleString('es-ES') : 'N/A';
  return { message: `👤 ${username}\n📱 +${whatsapp_number}\n🔖 ${rol || 'usuario'}\n📅 ${fecha}` };
}

export default { cleanSession, logs, config, registrar, resetpass, miinfo }
