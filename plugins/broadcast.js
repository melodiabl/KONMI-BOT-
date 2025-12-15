import logger from './config/logger.js'
import db from './database/db.js'

export async function createBroadcastList(ctx) {
  const { args, sock, sender } = ctx
  const listName = args.join(' ')

  if (!listName) {
    return { success: false, message: '❌ Proporciona el nombre de la lista' }
  }

  try {
    await db('broadcast_lists').insert({
      name: listName,
      creator: sender,
      created_at: new Date().toISOString()
    })

    return { success: true, message: `✅ Lista de broadcast creada: ${listName}` }
  } catch (error) {
    logger.error('Error creando lista de broadcast:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function addToBroadcastList(ctx) {
  const { args, sock, sender } = ctx
  const [listName, ...recipients] = args

  if (!listName || recipients.length === 0) {
    return {
      success: false,
      message: '❌ Uso: /broadcastadd [nombre_lista] [contacto1] [contacto2] ...'
    }
  }

  try {
    const list = await db('broadcast_lists').where({ name: listName }).first()
    if (!list) {
      return { success: false, message: '❌ Lista no encontrada' }
    }

    const jids = recipients.map(r => {
      const digits = String(r).replace(/\D/g, '')
      return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null
    }).filter(Boolean)

    await db('broadcast_recipients').insert(
      jids.map(jid => ({
        list_id: list.id,
        jid: jid,
        added_at: new Date().toISOString()
      }))
    )

    return { success: true, message: `✅ ${jids.length} contactos agregados a ${listName}` }
  } catch (error) {
    logger.error('Error agregando a lista de broadcast:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendBroadcast(ctx) {
  const { args, sock, sender } = ctx
  const listName = args[0]
  const message = args.slice(1).join(' ')

  if (!listName || !message) {
    return {
      success: false,
      message: '❌ Uso: /broadcast [nombre_lista] [mensaje]'
    }
  }

  try {
    const list = await db('broadcast_lists').where({ name: listName }).first()
    if (!list) {
      return { success: false, message: '❌ Lista no encontrada' }
    }

    const recipients = await db('broadcast_recipients').where({ list_id: list.id }).select('jid')

    if (recipients.length === 0) {
      return { success: false, message: '❌ La lista está vacía' }
    }

    let sent = 0
    let failed = 0

    for (const { jid } of recipients) {
      try {
        await sock.sendMessage(jid, { text: message })
        sent++
      } catch (error) {
        failed++
        logger.error(`Error enviando a ${jid}:`, error)
      }
    }

    return {
      success: true,
      message: `✅ Broadcast enviado: ${sent} exitosos, ${failed} fallidos`
    }
  } catch (error) {
    logger.error('Error enviando broadcast:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendStory(ctx) {
  const { args, remoteJid, sock } = ctx
  const messageText = args.join(' ')

  if (!messageText) {
    return { success: false, message: '❌ Proporciona el contenido para la historia' }
  }

  try {
    const storyJid = 'status@broadcast'
    await sock.sendMessage(storyJid, { text: messageText })
    return { success: true, message: '✅ Contenido compartido en tu historia' }
  } catch (error) {
    logger.error('Error enviando historia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function sendMediaStory(ctx) {
  const { args, sock } = ctx
  const mediaUrl = args[0]
  const caption = args.slice(1).join(' ') || ''

  if (!mediaUrl) {
    return { success: false, message: '❌ Proporciona la URL del media' }
  }

  try {
    const storyJid = 'status@broadcast'

    if (mediaUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
      await sock.sendMessage(storyJid, {
        image: { url: mediaUrl },
        caption: caption
      })
    } else if (mediaUrl.match(/\.(mp4|mov|avi)$/i)) {
      await sock.sendMessage(storyJid, {
        video: { url: mediaUrl },
        caption: caption
      })
    } else {
      return { success: false, message: '❌ Formato de media no soportado' }
    }

    return { success: true, message: '✅ Media compartida en tu historia' }
  } catch (error) {
    logger.error('Error enviando media a historia:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function listBroadcasts(ctx) {
  const { sender } = ctx

  try {
    const lists = await db('broadcast_lists').where({ creator: sender }).select('name', 'created_at')

    if (lists.length === 0) {
      return { success: true, message: '✅ No tienes listas de broadcast' }
    }

    let message = '📋 *Tus Listas de Broadcast:*\n'
    lists.forEach((list, idx) => {
      message += `${idx + 1}. ${list.name} (${list.created_at})\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error listando broadcasts:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function deleteBroadcastList(ctx) {
  const { args, sender } = ctx
  const listName = args.join(' ')

  if (!listName) {
    return { success: false, message: '❌ Proporciona el nombre de la lista' }
  }

  try {
    const list = await db('broadcast_lists').where({ name: listName, creator: sender }).first()
    if (!list) {
      return { success: false, message: '❌ Lista no encontrada' }
    }

    await db('broadcast_recipients').where({ list_id: list.id }).delete()
    await db('broadcast_lists').where({ id: list.id }).delete()

    return { success: true, message: `✅ Lista ${listName} eliminada` }
  } catch (error) {
    logger.error('Error eliminando lista de broadcast:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function listBroadcastRecipients(ctx) {
  const { args } = ctx
  const listName = args.join(' ')

  if (!listName) {
    return { success: false, message: '❌ Proporciona el nombre de la lista' }
  }

  try {
    const list = await db('broadcast_lists').where({ name: listName }).first()
    if (!list) {
      return { success: false, message: '❌ Lista no encontrada' }
    }

    const recipients = await db('broadcast_recipients').where({ list_id: list.id }).select('jid')

    if (recipients.length === 0) {
      return { success: true, message: '✅ La lista está vacía' }
    }

    let message = `👥 *Contactos en ${listName}:*\n`
    recipients.forEach((r, idx) => {
      message += `${idx + 1}. ${r.jid}\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error listando recipientes:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
