// commands/bot-control.js
import db from '../db.js'
import { buildQuickReplyFlow } from '../utils/flows.js'

async function ensureGatingTables() {
  const tableExists = await db.schema.hasTable('bot_global_state');
  if (!tableExists) {
    await db.schema.createTable('bot_global_state', (table) => {
      table.increments('id').primary();
      table.boolean('is_on').notNullable().defaultTo(true);
      table.string('estado');
      table.string('activado_por');
      table.timestamp('fecha_cambio').defaultTo(db.fn.now());
    });
    await db('bot_global_state').insert({ id: 1, is_on: true, estado: 'on' });
  }

  const groupStateExists = await db.schema.hasTable('subbot_group_state');
  if (!groupStateExists) {
    await db.schema.createTable('subbot_group_state', (t) => {
      t.increments('id').primary();
      t.string('subbot_code', 120).notNullable();
      t.string('group_jid', 200).notNullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('updated_at').defaultTo(db.fn.now());
      t.unique(['subbot_code', 'group_jid']);
    });
  }
}

export async function bot(ctx) {
  const { usuario, args, isGroup, remoteJid, message, isOwner, isAdmin } = ctx;
  const command = args[0] || '';

  if (command === 'global') {
    if (!isOwner) {
      return { message: '⛔ Solo el owner puede usar comandos globales.' };
    }
    const action = args[1];
    if (action !== 'on' && action !== 'off') {
      return { type: 'content', content: buildQuickReplyFlow({ header: '⚙️ Control global', body: 'Activar o desactivar el bot globalmente', buttons: [{ text: '🌍 Global ON', command: '/bot global on' }, { text: '🌍 Global OFF', command: '/bot global off' }] }) };
    }
    const turnOn = action === 'on';
    await ensureGatingTables();
    await db('bot_global_state').update({ is_on: turnOn, estado: action, activado_por: usuario, fecha_cambio: db.fn.now() }).where({ id: 1 });
    const msg = turnOn ? '✅ Bot activado globalmente' : '⛔ Bot desactivado globalmente';
    return { message: msg, type: 'content', content: buildQuickReplyFlow({ header: msg, body: 'Control global actualizado', buttons: [{ text: '🏠 Menú', command: '/menu' }] }) };
  }

  if (!isGroup) {
    return { message: 'ℹ️ Este comando solo funciona en grupos.' };
  }

  if (!isOwner && !isAdmin) {
    return { message: '⛔ Solo admins o el owner pueden usar este comando.' };
  }

  const action = command;
  if (action !== 'on' && action !== 'off') {
    return { type: 'content', content: buildQuickReplyFlow({ header: '⚙️ Control del bot', body: 'Activar o desactivar en este grupo', buttons: [{ text: '✅ ON', command: '/bot on' }, { text: '⛔ OFF', command: '/bot off' }] }) };
  }

  const turnOn = action === 'on';
  await ensureGatingTables();
  await db('subbot_group_state')
    .insert({ subbot_code: 'main', group_jid: remoteJid, is_active: turnOn, updated_at: db.fn.now() })
    .onConflict(['subbot_code', 'group_jid'])
    .merge();

  const msg = turnOn ? '✅ Bot activado en este grupo' : '⛔ Bot desactivado en este grupo';
  return {
    message: msg,
    type: 'content',
    content: buildQuickReplyFlow({
      header: msg,
      body: `Grupo: ${remoteJid}`,
      buttons: [{ text: turnOn ? '⛔ OFF' : '✅ ON', command: turnOn ? '/bot off' : '/bot on' }, { text: '🏠 Menú', command: '/menu' }],
    }),
  };
}

export default { bot }


