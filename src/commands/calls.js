// src/commands/calls.js
import logger from '../config/logger.js'
import db from '../database/db.js'

async function rejectCall(ctx) {
  const { args, sock } = ctx
  const [callId, callFrom] = [args[0], args[1]]
  if (!callId || !callFrom) return { text: '❌ Uso: /rejectcall [callId] [caller_jid]' }
  try {
    await sock.rejectCall(callId, callFrom)
    return { text: '✅ Llamada rechazada' }
  } catch (error) {
    logger.error('Error rechazando llamada:', error)
    return { text: `❌ Error: ${error.message}` }
  }
}

async function blockCaller(ctx) {
  const { args, sock } = ctx
  const jid = args[0]
  if (!jid) return { text: '❌ Proporciona el JID del llamante' }
  try {
    await sock.updateBlockStatus(jid, 'block')
    return { text: '✅ Llamante bloqueado' }
  } catch (error) {
    logger.error('Error bloqueando llamante:', error)
    return { text: `❌ Error: ${error.message}` }
  }
}

async function enableCallBlock() {
  try {
    await db('bot_settings').update({ block_all_calls: true })
    return { text: '📞 Todas las llamadas serán rechazadas automáticamente' }
  } catch (error) {
    logger.error('Error habilitando bloqueo de llamadas:', error)
    return { text: `❌ Error: ${error.message}` }
  }
}

async function disableCallBlock() {
  try {
    await db('bot_settings').update({ block_all_calls: false })
    return { text: '📞 Llamadas permitidas nuevamente' }
  } catch (error) {
    logger.error('Error deshabilitando bloqueo de llamadas:', error)
    return { text: `❌ Error: ${error.message}` }
  }
}

async function addCallBlacklist(ctx) {
    const { args, sender } = ctx
    const jid = args[0]
    if (!jid) return { text: '❌ Proporciona el JID a bloquear' }
    try {
        await db('call_blocklist').insert({ jid, blocked_by: sender });
        return { text: `✅ ${jid} añadido a lista negra de llamadas` }
    } catch (error) {
        logger.error('Error añadiendo a lista negra:', error)
        return { text: `❌ Error: ${error.message}` }
    }
}

async function removeCallBlacklist(ctx) {
    const { args, sender } = ctx
    const jid = args[0]
    if (!jid) return { text: '❌ Proporciona el JID a desbloquear' }
    try {
        await db('call_blocklist').where({ jid, blocked_by: sender }).delete();
        return { text: `✅ ${jid} removido de lista negra de llamadas` }
    } catch (error) {
        logger.error('Error removiendo de lista negra:', error)
        return { text: `❌ Error: ${error.message}` }
    }
}

async function listCallBlacklist(ctx) {
    const { sender } = ctx;
    try {
        const list = await db('call_blocklist').where({ blocked_by: sender }).select('jid');
        if (list.length === 0) return { text: '✅ No tienes números bloqueados' };
        let message = '📞 *Números Bloqueados:*\n';
        list.forEach((item, idx) => { message += `${idx + 1}. ${item.jid}\n` });
        return { text: message };
    } catch (error) {
        logger.error('Error listando lista negra:', error);
        return { text: `❌ Error: ${error.message}` };
    }
}

export default [
    { name: 'rejectcall', description: 'Rechaza una llamada entrante.', category: 'calls', handler: rejectCall },
    { name: 'blockcaller', description: 'Bloquea a un llamante.', category: 'calls', handler: blockCaller },
    { name: 'enablecallblock', description: 'Habilita el bloqueo de todas las llamadas.', category: 'calls', handler: enableCallBlock },
    { name: 'disablecallblock', description: 'Deshabilita el bloqueo de todas las llamadas.', category: 'calls', handler: disableCallBlock },
    { name: 'addcallblacklist', description: 'Añade un JID a la lista negra de llamadas.', category: 'calls', handler: addCallBlacklist },
    { name: 'removecallblacklist', description: 'Remueve un JID de la lista negra de llamadas.', category: 'calls', handler: removeCallBlacklist },
    { name: 'listcallblacklist', description: 'Muestra la lista negra de llamadas.', category: 'calls', handler: listCallBlacklist }
];
