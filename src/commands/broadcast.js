// src/commands/broadcast.js
import logger from '../config/logger.js'
import db from '../database/db.js'

async function createBroadcastList(ctx) {
  const { args, sender } = ctx;
  const listName = args.join(' ');
  if (!listName) return { text: '❌ Proporciona el nombre de la lista' };
  try {
    await db('broadcast_lists').insert({ name: listName, creator: sender, created_at: new Date().toISOString() });
    return { text: `✅ Lista de broadcast creada: ${listName}` };
  } catch (error) {
    logger.error('Error creando lista de broadcast:', error);
    return { text: `❌ Error: ${error.message}` };
  }
}

async function addToBroadcastList(ctx) {
    const { args } = ctx;
    const [listName, ...recipients] = args;
    if (!listName || recipients.length === 0) return { text: '❌ Uso: /broadcastadd [nombre_lista] [contacto1] ...' };
    try {
        const list = await db('broadcast_lists').where({ name: listName }).first();
        if (!list) return { text: '❌ Lista no encontrada' };
        const jids = recipients.map(r => `${String(r).replace(/\D/g, '')}@s.whatsapp.net`);
        await db('broadcast_recipients').insert(jids.map(jid => ({ list_id: list.id, jid })));
        return { text: `✅ ${jids.length} contactos agregados a ${listName}` };
    } catch (error) {
        logger.error('Error agregando a lista de broadcast:', error);
        return { text: `❌ Error: ${error.message}` };
    }
}

async function sendBroadcast(ctx) {
  const { args, sock } = ctx;
  const listName = args[0];
  const message = args.slice(1).join(' ');
  if (!listName || !message) return { text: '❌ Uso: /broadcast [nombre_lista] [mensaje]' };
  try {
    const list = await db('broadcast_lists').where({ name: listName }).first();
    if (!list) return { text: '❌ Lista no encontrada' };
    const recipients = await db('broadcast_recipients').where({ list_id: list.id }).select('jid');
    if (recipients.length === 0) return { text: '❌ La lista está vacía' };
    let sent = 0, failed = 0;
    for (const { jid } of recipients) {
      try {
        await sock.sendMessage(jid, { text: message });
        sent++;
      } catch (error) {
        failed++;
        logger.error(`Error enviando a ${jid}:`, error);
      }
    }
    return { text: `✅ Broadcast enviado: ${sent} exitosos, ${failed} fallidos` };
  } catch (error) {
    logger.error('Error enviando broadcast:', error);
    return { text: `❌ Error: ${error.message}` };
  }
}

async function sendStory(ctx) {
    const { args, sock } = ctx
    const messageText = args.join(' ')
    if (!messageText) return { text: '❌ Proporciona el contenido para la historia' }
    try {
        await sock.sendMessage('status@broadcast', { text: messageText })
        return { text: '✅ Contenido compartido en tu historia' }
    } catch (error) {
        logger.error('Error enviando historia:', error);
        return { text: `❌ Error: ${error.message}` }
    }
}

async function sendMediaStory(ctx) {
    const { args, sock } = ctx;
    const mediaUrl = args[0];
    const caption = args.slice(1).join(' ') || '';
    if (!mediaUrl) return { text: '❌ Proporciona la URL del media' };
    try {
        const storyJid = 'status@broadcast';
        if (mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
            await sock.sendMessage(storyJid, { image: { url: mediaUrl }, caption: caption });
        } else if (mediaUrl.match(/\.(mp4|mov|avi)$/i)) {
            await sock.sendMessage(storyJid, { video: { url: mediaUrl }, caption: caption });
        } else {
            return { text: '❌ Formato de media no soportado' };
        }
        return { text: '✅ Media compartida en tu historia' };
    } catch (error) {
        logger.error('Error enviando media a historia:', error);
        return { text: `❌ Error: ${error.message}` };
    }
}

async function listBroadcasts(ctx) {
    const { sender } = ctx;
    try {
        const lists = await db('broadcast_lists').where({ creator: sender }).select('name');
        if (lists.length === 0) return { text: '✅ No tienes listas de broadcast' };
        return { text: `📋 *Tus Listas de Broadcast:*\n${lists.map(l => `- ${l.name}`).join('\n')}` };
    } catch (error) {
        logger.error('Error listando broadcasts:', error);
        return { text: `❌ Error: ${error.message}` };
    }
}

export default [
    { name: 'broadcastcreate', description: 'Crea una nueva lista de broadcast.', category: 'broadcast', handler: createBroadcastList },
    { name: 'broadcastadd', description: 'Añade contactos a una lista de broadcast.', category: 'broadcast', handler: addToBroadcastList },
    { name: 'broadcast', description: 'Envía un mensaje a una lista de broadcast.', category: 'broadcast', handler: sendBroadcast },
    { name: 'story', description: 'Envía un mensaje de texto a tu historia.', category: 'broadcast', handler: sendStory },
    { name: 'mediastory', description: 'Envía una imagen o video a tu historia.', category: 'broadcast', handler: sendMediaStory },
    { name: 'broadcastlist', description: 'Muestra tus listas de broadcast.', category: 'broadcast', handler: listBroadcasts }
];
