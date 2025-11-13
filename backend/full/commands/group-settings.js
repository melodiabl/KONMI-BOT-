// commands/group-settings.js
import { setGroupConfig, getGroupBool, getGroupNumber, getGroupConfig } from '../utils/group-config.js'

const requireGroupAdmin = (handler) => async (ctx) => {
  if (!ctx.isGroup) return { message: 'ℹ️ Este comando solo funciona en grupos' };
  if (!ctx.isAdmin && !ctx.isOwner) return { message: '⛔ Solo admins o el owner pueden usar este comando' };
  return handler(ctx);
};

export const antilink = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String(args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(on)) return { message: 'ℹ️ Uso: /antilink on|off' };
  await setGroupConfig(remoteJid, 'antilink', on === 'on');
  return { message: `🔗 Antilink: ${on === 'on' ? 'ON' : 'OFF'}` };
});

export const antilinkmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const mode = String(args[0] || '').toLowerCase();
  if (!['warn', 'kick'].includes(mode)) return { message: 'ℹ️ Uso: /antilinkmode warn|kick' };
  await setGroupConfig(remoteJid, 'antilink_mode', mode);
  return { message: `🔧 Antilink mode: ${mode.toUpperCase()}` };
});

export const slowmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const n = Number(args[0] || 0);
  if (!Number.isFinite(n) || n < 0) return { message: 'ℹ️ Uso: /slowmode [segundos] (0 para desactivar)' };
  await setGroupConfig(remoteJid, 'slowmode_s', Math.floor(n));
  return { message: `🐢 Slowmode: ${Math.floor(n)}s` };
});

export const antiflood = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String(args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(on)) return { message: 'ℹ️ Uso: /antiflood on|off' };
  await setGroupConfig(remoteJid, 'antiflood_on', on === 'on');
  return { message: `🚫 Anti-flood: ${on === 'on' ? 'ON' : 'OFF'}` };
});

export const antifloodmode = requireGroupAdmin(async ({ remoteJid, args }) => {
  const mode = String(args[0] || '').toLowerCase();
  if (!['warn', 'kick'].includes(mode)) return { message: 'ℹ️ Uso: /antifloodmode warn|kick' };
  await setGroupConfig(remoteJid, 'antiflood_mode', mode);
  return { message: `🚫 Anti-flood mode: ${mode.toUpperCase()}` };
});

export const antifloodrate = requireGroupAdmin(async ({ remoteJid, args }) => {
  const n = Number(args[0] || 5);
  if (!Number.isFinite(n) || n <= 0) return { message: 'ℹ️ Uso: /antifloodrate [mensajes/10s] (ej 5)' };
  await setGroupConfig(remoteJid, 'antiflood_rate', Math.floor(n));
  return { message: `🚫 Anti-flood rate: ${Math.floor(n)}/10s` };
});

export const welcome = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String(args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(on)) return { message: 'ℹ️ Uso: /welcome on|off' };
  await setGroupConfig(remoteJid, 'welcome_on', on === 'on');
  return { message: `👋 Welcome: ${on === 'on' ? 'ON' : 'OFF'}` };
});

export const setwelcome = requireGroupAdmin(async ({ remoteJid, args }) => {
  const text = args.join(' ').trim();
  if (!text) return { message: 'ℹ️ Uso: /setwelcome [texto]' };
  await setGroupConfig(remoteJid, 'welcome_text', text);
  return { message: '✅ Mensaje de bienvenida guardado' };
});

export async function settings({ remoteJid }) {
  const [al, sm, wo, wt, mode] = await Promise.all([
    getGroupBool(remoteJid, 'antilink', false),
    getGroupNumber(remoteJid, 'slowmode_s', 0),
    getGroupBool(remoteJid, 'welcome_on', false),
    getGroupConfig(remoteJid, 'welcome_text', 'Bienvenido @user a @group'),
    getGroupConfig(remoteJid, 'antilink_mode', 'warn'),
  ]);
  const msg = `⚙️ Ajustes del grupo\n• Antilink: ${al ? 'ON' : 'OFF'}\n• Antilink Mode: ${mode}\n• Slowmode: ${sm}s\n• Welcome: ${wo ? 'ON' : 'OFF'}\n• Msg: ${wt}`;
  return { message: msg };
}

export const rules = requireGroupAdmin(async ({ remoteJid, args }) => {
  const on = String(args[0] || 'show').toLowerCase();
  if (['on', 'off'].includes(on)) {
    await setGroupConfig(remoteJid, 'rules_on', on === 'on');
    return { message: `📜 Rules: ${on === 'on' ? 'ON' : 'OFF'}` };
  }
  const text = await getGroupConfig(remoteJid, 'rules_text', 'Reglas: respeta a todos, no spam, no links.');
  return { message: `📜 Reglas del grupo\n\n${text}` };
});

export const setrules = requireGroupAdmin(async ({ remoteJid, args }) => {
  const text = args.join(' ').trim();
  if (!text) return { message: 'ℹ️ Uso: /setrules [texto]' };
  await setGroupConfig(remoteJid, 'rules_text', text);
  return { message: '✅ Reglas guardadas' };
});

export default { antilink, slowmode, welcome, setwelcome, settings }
