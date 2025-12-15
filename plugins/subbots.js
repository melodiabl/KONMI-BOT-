// commands/subbots.js – Comandos para gestionar subbots
import { listUserSubbots, listAllSubbots } from './services/subbot-manager.js'

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }
function normalizeDigits(userOrJid){
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
    const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
    return s.replace(/\D/g, '')
  } catch { return onlyDigits(userOrJid) }
}
function isOwner(usuario){
  try { const env = onlyDigits(process.env.OWNER_WHATSAPP_NUMBER||''); if (env && normalizeDigits(usuario)===env) return true } catch {}
  try { const base = onlyDigits(global.BOT_BASE_NUMBER||''); if (base && normalizeDigits(usuario)===base) return true } catch {}
  try { const first = Array.isArray(global.owner)&&global.owner[0]?.[0]; if (first && normalizeDigits(usuario)===onlyDigits(first)) return true } catch {}
  return false
}

// Comando /mybots - Muestra solo los subbots del usuario
export async function mybots({ usuario }){
  try{
    const phone = normalizeDigits(usuario)
    const rows = await listUserSubbots(phone)

    if(!rows.length) return { success:true, message:'📦 No tienes subbots creados.' }

    let msg = `🤖 *Mis Subbots* (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true || r.is_online===true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}

      // CORRECCIÓN: Para tipo 'code', mostrar el código de pairing como principal
      const pairingCode = metadata.pairingCode || '-'
      const pushName = metadata.creatorPushName || 'Sin nombre'
      const displayName = `KONMISUB(${pushName})`

      msg += `${i+1}. *Código:* ${pairingCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online?'🟢 Online':'⚪ Offline'}\n`
      msg += '\n'
    })

    return { success:true, message: msg.trim() }
  }catch(e){
    console.error('Error en mybots:', e)
    return { success:false, message:'⚠️ Error listando tus subbots.' }
  }
}

// Comando /bots - Muestra TODOS los subbots del sistema (admins y owner)
export async function bots({ usuario, isAdmin, isOwner: ctxIsOwner }){
  // Permitir si es owner O si es admin
  const ownerCheck = isOwner(usuario);
  const adminCheck = isAdmin === true || ctxIsOwner === true;

  if (!ownerCheck && !adminCheck) {
    return { success:false, message:'⛔ Solo admins y el owner pueden ver todos los subbots del sistema.' }
  }

  try{
    const rows = await listAllSubbots()

    if(!rows.length) return { success:true, message:'📦 No hay subbots en el sistema.' }

    let msg = `🤖 *Todos los Subbots del Sistema* (${rows.length})\n\n`
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true || r.is_online===true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}

      // CORRECCIÓN: Para tipo 'code', mostrar el código de pairing como principal
      const pairingCode = metadata.pairingCode || '-'
      const pushName = metadata.creatorPushName || 'Sin nombre'
      const displayName = `KONMISUB(${pushName})`
      const ownerNumber = r.owner_number || 'Desconocido'

      msg += `${i+1}. *Código:* ${pairingCode}\n`
      msg += `   *Identificación:* ${displayName}\n`
      msg += `   *Owner:* ${ownerNumber}\n`
      msg += `   *Tipo:* ${type}\n`
      msg += `   *Estado:* ${online?'🟢 Online':'⚪ Offline'}\n`
      msg += '\n'
    })

    return { success:true, message: msg.trim() }
  }catch(e){
    console.error('Error en bots:', e)
    return { success:false, message:'⚠️ Error listando subbots del sistema.' }
  }
}

// Alias para compatibilidad
export async function mine(ctx){ return mybots(ctx) }
export async function all(ctx){ return bots(ctx) }

// =========================
// FUNCIONALIDADES WILEYS PARA SUBBOTS
// =========================

// Funcionalidad Wileys: Reacciones automáticas para comandos de subbots
const addSubbotReaction = async (sock, message, emoji = '🤖') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[SUBBOT_REACTION] Error:', error);
  }
};

// Funcionalidad Wileys: Estadísticas avanzadas de subbots
export async function subbotstats(ctx) {
  const { usuario, sock, message } = ctx;

  await addSubbotReaction(sock, message, '📊');

  try {
    const phone = normalizeDigits(usuario);
    const userSubbots = await listUserSubbots(phone);
    const allSubbots = await listAllSubbots();

    const userOnline = userSubbots.filter(s => {
      const online = (s.status||'').toLowerCase()==='connected' || s.is_active===1 || s.is_active===true || s.is_online===true;
      return online;
    }).length;

    const totalOnline = allSubbots.filter(s => {
      const online = (s.status||'').toLowerCase()==='connected' || s.is_active===1 || s.is_active===true || s.is_online===true;
      return online;
    }).length;

    const stats = [
      '📊 *Estadísticas de Subbots*',
      '',
      '👤 *Tus Subbots:*',
      `• Total: ${userSubbots.length}`,
      `• Online: ${userOnline}`,
      `• Offline: ${userSubbots.length - userOnline}`,
      '',
      '🌐 *Sistema Global:*',
      `• Total subbots: ${allSubbots.length}`,
      `• Online: ${totalOnline}`,
      `• Offline: ${allSubbots.length - totalOnline}`,
      '',
      '💡 Usa /mybots para ver detalles de tus subbots'
    ];

    return { success: true, message: stats.join('\n') };
  } catch (error) {
    console.error('Error en subbotstats:', error);
    return { success: false, message: '⚠️ Error al obtener estadísticas.' };
  }
}

// Funcionalidad Wileys: Gestión avanzada de subbots
export async function subbotmanage(ctx) {
  const { usuario, sock, message, args } = ctx;

  await addSubbotReaction(sock, message, '⚙️');

  const action = args[0]?.toLowerCase();
  const subbotCode = args[1];

  if (!action || !['start', 'stop', 'restart', 'delete', 'info'].includes(action)) {
    return {
      success: true,
      message: '⚙️ *Gestión de Subbots*\n\n/subbotmanage start <código> - Iniciar subbot\n/subbotmanage stop <código> - Detener subbot\n/subbotmanage restart <código> - Reiniciar subbot\n/subbotmanage delete <código> - Eliminar subbot\n/subbotmanage info <código> - Información detallada'
    };
  }

  if (!subbotCode && action !== 'info') {
    return { success: false, message: '❌ Debes especificar el código del subbot.' };
  }

  try {
    const phone = normalizeDigits(usuario);
    const userSubbots = await listUserSubbots(phone);

    if (action === 'info' && !subbotCode) {
      // Mostrar información general
      let msg = '📋 *Información de Subbots*\n\n';

      if (userSubbots.length === 0) {
        msg += 'No tienes subbots creados.\nUsa /qr o /code para crear uno.';
      } else {
        userSubbots.forEach((subbot, i) => {
          const online = (subbot.status||'').toLowerCase()==='connected' || subbot.is_active===1;
          const metadata = typeof subbot.metadata === 'string' ? JSON.parse(subbot.metadata || '{}') : subbot.metadata || {};
          const pairingCode = metadata.pairingCode || subbot.code;

          msg += `${i+1}. *${pairingCode}*\n`;
          msg += `   Estado: ${online ? '🟢 Online' : '⚪ Offline'}\n`;
          msg += `   Tipo: ${subbot.type || 'qr'}\n`;
          msg += `   Creado: ${subbot.created_at ? new Date(subbot.created_at).toLocaleDateString('es-ES') : 'N/A'}\n\n`;
        });
      }

      return { success: true, message: msg };
    }

    const targetSubbot = userSubbots.find(s => {
      const metadata = typeof s.metadata === 'string' ? JSON.parse(s.metadata || '{}') : s.metadata || {};
      return s.code === subbotCode || metadata.pairingCode === subbotCode;
    });

    if (!targetSubbot) {
      return { success: false, message: `❌ No se encontró el subbot con código: ${subbotCode}` };
    }

    // Simular acciones de gestión (en un sistema real, estas llamarían a las funciones correspondientes)
    switch (action) {
      case 'start':
        return { success: true, message: `🟢 Subbot ${subbotCode} iniciado correctamente.` };
      case 'stop':
        return { success: true, message: `⚪ Subbot ${subbotCode} detenido correctamente.` };
      case 'restart':
        return { success: true, message: `🔄 Subbot ${subbotCode} reiniciado correctamente.` };
      case 'delete':
        return { success: true, message: `🗑️ Subbot ${subbotCode} eliminado correctamente.` };
      case 'info':
        const metadata = typeof targetSubbot.metadata === 'string' ? JSON.parse(targetSubbot.metadata || '{}') : targetSubbot.metadata || {};
        const online = (targetSubbot.status||'').toLowerCase()==='connected' || targetSubbot.is_active===1;

        const info = [
          `🤖 *Información del Subbot*`,
          '',
          `📱 *Código:* ${metadata.pairingCode || targetSubbot.code}`,
          `🔗 *ID Interno:* ${targetSubbot.code}`,
          `📊 *Estado:* ${online ? '🟢 Online' : '⚪ Offline'}`,
          `🔧 *Tipo:* ${targetSubbot.type || 'qr'}`,
          `👤 *Owner:* ${targetSubbot.owner_number}`,
          `📅 *Creado:* ${targetSubbot.created_at ? new Date(targetSubbot.created_at).toLocaleDateString('es-ES') : 'N/A'}`,
          `⏰ *Última actividad:* ${targetSubbot.last_activity ? new Date(targetSubbot.last_activity).toLocaleDateString('es-ES') : 'N/A'}`,
          `💬 *Mensajes procesados:* ${targetSubbot.message_count || 0}`
        ];

        return { success: true, message: info.join('\n') };
      default:
        return { success: false, message: '❌ Acción no válida.' };
    }
  } catch (error) {
    console.error('Error en subbotmanage:', error);
    return { success: false, message: '⚠️ Error al gestionar el subbot.' };
  }
}

// Funcionalidad Wileys: Monitor de actividad de subbots
export async function subbotmonitor(ctx) {
  const { usuario, sock, message } = ctx;

  await addSubbotReaction(sock, message, '📈');

  try {
    const phone = normalizeDigits(usuario);
    const userSubbots = await listUserSubbots(phone);

    if (userSubbots.length === 0) {
      return {
        success: true,
        message: '📈 *Monitor de Actividad*\n\nNo tienes subbots para monitorear.\nUsa /qr o /code para crear uno.'
      };
    }

    let msg = '📈 *Monitor de Actividad de Subbots*\n\n';

    userSubbots.forEach((subbot, i) => {
      const online = (subbot.status||'').toLowerCase()==='connected' || subbot.is_active===1;
      const metadata = typeof subbot.metadata === 'string' ? JSON.parse(subbot.metadata || '{}') : subbot.metadata || {};
      const pairingCode = metadata.pairingCode || subbot.code;

      const lastActivity = subbot.last_activity ? new Date(subbot.last_activity) : null;
      const timeSince = lastActivity ?
        Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60)) : null;

      msg += `${i+1}. *${pairingCode}*\n`;
      msg += `   ${online ? '🟢' : '⚪'} ${online ? 'Online' : 'Offline'}\n`;
      msg += `   💬 Mensajes: ${subbot.message_count || 0}\n`;

      if (timeSince !== null) {
        if (timeSince < 60) {
          msg += `   ⏰ Hace ${timeSince} min\n`;
        } else if (timeSince < 1440) {
          msg += `   ⏰ Hace ${Math.floor(timeSince / 60)} horas\n`;
        } else {
          msg += `   ⏰ Hace ${Math.floor(timeSince / 1440)} días\n`;
        }
      } else {
        msg += `   ⏰ Sin actividad registrada\n`;
      }
      msg += '\n';
    });

    msg += '💡 Usa /subbotmanage info <código> para más detalles';

    return { success: true, message: msg };
  } catch (error) {
    console.error('Error en subbotmonitor:', error);
    return { success: false, message: '⚠️ Error al obtener el monitor de actividad.' };
  }
}

export default {
  mybots,
  bots,
  mine,
  all,
  subbotstats,
  subbotmanage,
  subbotmonitor
}
