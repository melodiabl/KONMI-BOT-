import logger from '../config/logger.js'
import db from '../db.js'

export async function rejectCall(ctx) {
  const { args, sock } = ctx
  const [callId, callFrom] = [args[0], args[1]]

  if (!callId || !callFrom) {
    return { 
      success: false, 
      message: '❌ Uso: /rejectcall [callId] [caller_jid]' 
    }
  }

  try {
    await sock.rejectCall(callId, callFrom)
    return { success: true, message: '✅ Llamada rechazada' }
  } catch (error) {
    logger.error('Error rechazando llamada:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function blockCaller(ctx) {
  const { args, sock } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona el JID del llamante' }
  }

  try {
    await sock.updateBlockStatus(jid, 'block')
    return { success: true, message: '✅ Llamante bloqueado' }
  } catch (error) {
    logger.error('Error bloqueando llamante:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function enableCallBlock(ctx) {
  const { sock } = ctx

  try {
    await db('bot_settings').update({ block_all_calls: true })
    return { success: true, message: '📞 Todas las llamadas serán rechazadas automáticamente' }
  } catch (error) {
    logger.error('Error habilitando bloqueo de llamadas:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function disableCallBlock(ctx) {
  const { sock } = ctx

  try {
    await db('bot_settings').update({ block_all_calls: false })
    return { success: true, message: '📞 Llamadas permitidas nuevamente' }
  } catch (error) {
    logger.error('Error deshabilitando bloqueo de llamadas:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function addCallBlacklist(ctx) {
  const { args, sender } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona el JID a bloquear' }
  }

  try {
    await db('call_blocklist').insert({
      jid: jid,
      blocked_by: sender,
      created_at: new Date().toISOString()
    })
    return { success: true, message: `✅ ${jid} añadido a lista negra de llamadas` }
  } catch (error) {
    logger.error('Error añadiendo a lista negra:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function removeCallBlacklist(ctx) {
  const { args, sender } = ctx
  const jid = args[0]

  if (!jid) {
    return { success: false, message: '❌ Proporciona el JID a desbloquear' }
  }

  try {
    await db('call_blocklist').where({ jid: jid, blocked_by: sender }).delete()
    return { success: true, message: `✅ ${jid} removido de lista negra de llamadas` }
  } catch (error) {
    logger.error('Error removiendo de lista negra:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function listCallBlacklist(ctx) {
  const { sender } = ctx

  try {
    const list = await db('call_blocklist').where({ blocked_by: sender }).select('jid')
    
    if (list.length === 0) {
      return { success: true, message: '✅ No tienes números bloqueados' }
    }

    let message = '📞 *Números Bloqueados:*\n'
    list.forEach((item, idx) => {
      message += `${idx + 1}. ${item.jid}\n`
    })

    return { success: true, message }
  } catch (error) {
    logger.error('Error listando lista negra:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function getCallStats(ctx) {
  const { sender } = ctx

  try {
    const stats = await db('call_logs')
      .where({ user: sender })
      .count('* as total')
      .sum('duration as totalDuration')
      .first()

    let message = `📞 *Estadísticas de Llamadas:*\n`
    message += `Total: ${stats?.total || 0}\n`
    message += `Duración total: ${Math.floor((stats?.totalDuration || 0) / 60)} minutos`

    return { success: true, message }
  } catch (error) {
    logger.error('Error obteniendo estadísticas:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}

export async function logCallEvent(ctx) {
  const { args, sender } = ctx
  const [callId, from, to, duration, status] = args

  try {
    await db('call_logs').insert({
      call_id: callId,
      from_user: from,
      to_user: to,
      duration: parseInt(duration) || 0,
      status: status || 'completed',
      logged_by: sender,
      created_at: new Date().toISOString()
    })

    return { success: true, message: '✅ Evento de llamada registrado' }
  } catch (error) {
    logger.error('Error registrando evento de llamada:', error)
    return { success: false, message: `❌ Error: ${error.message}` }
  }
}
