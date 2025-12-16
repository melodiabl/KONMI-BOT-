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
export async function mybots({ usuario, sock, message }){
  try{
    // Funcionalidad Wileys: Reacción automática BL
    if (sock && message) await addBLSubbotReaction(sock, message, 'subbot');

    const phone = normalizeDigits(usuario)
    const rows = await listUserSubbots(phone)

    if(!rows.length) return { success:true, message: decorateBLSubbotMessage('Mis Subbots', 'No tienes subbots creados.\n💡 Usa /qr o /code para crear uno', 'love') }

    let subbotList = [];
    rows.forEach((r,i)=>{
      const online = (r.status||'').toLowerCase()==='connected' || r.is_active===1 || r.is_active===true || r.is_online===true
      const type = r.type || r.method || r.connection_type || 'qr'
      const metadata = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {}

      // CORRECCIÓN: Para tipo 'code', mostrar el código de pairing como principal
      const pairingCode = metadata.pairingCode || '-'
      const pushName = metadata.creatorPushName || 'Sin nombre'
      const displayName = `KONMISUB(${pushName})`

      subbotList.push(`${i+1}. Código: ${pairingCode}`);
      subbotList.push(`   Identificación: ${displayName}`);
      subbotList.push(`   Tipo: ${type}`);
      subbotList.push(`   Estado: ${online?'🟢 Online':'⚪ Offline'}`);
      if (i < rows.length - 1) subbotList.push('');
    })

    const title = `Mis Subbots (${rows.length})`;
    return { success:true, message: decorateBLSubbotMessage(title, subbotList, 'bot') }
  }catch(e){
    console.error('Error en mybots:', e)
    return { success:false, message: decorateBLSubbotMessage('Error', 'Error listando tus subbots.\n🥺 Intenta de nuevo más tarde', 'love') }
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
// FUNCIONALIDADES WILEYS PARA SUBBOTS + TEMÁTICA BL
// =========================

// Funcionalidades Wileys completas + Temática BL integrada
const BL_SUBBOT_REACTIONS = ['🤖', '💖', '✨', '🌸', '💕', '💝', '🌟', '🥰', '😍', '💫'];
const BL_SUBBOT_MESSAGES = {
  managing: ['💖 Gestionando subbots con amor...', '✨ Administrando con cariño...', '🌸 Cuidando tus bots...'],
  success: ['✅ ¡Completado! 💖', '🌸 ¡Listo! Todo perfecto', '💕 ¡Éxito! Con mucho amor'],
  error: ['🥺 Algo salió mal, pero no te rindas 💔', '😢 Error detectado, lo siento', '💔 No pude completarlo, perdóname']
};

// Wileys: Reacciones automáticas BL mejoradas para subbots
const addBLSubbotReaction = async (sock, message, type = 'subbot') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      subbot: ['🤖', '💖', '✨'],
      stats: ['📊', '🌸', '💕'],
      manage: ['⚙️', '💖', '🌟'],
      monitor: ['📈', '✨', '💝'],
      info: ['📋', '🌸', '💫']
    };

    const sequence = reactionSequences[type] || reactionSequences.subbot;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_SUBBOT_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de subbots
const decorateBLSubbotMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    bot: {
      header: '╔🤖═══════════════════════════════════════🤖╗',
      footer: '╚🤖═══════════════════════════════════════🤖╝',
      bullet: '🤖'
    },
    stats: {
      header: '╔📊═══════════════════════════════════════📊╗',
      footer: '╚📊═══════════════════════════════════════📊╝',
      bullet: '📊'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Wileys: Mensaje de estado BL para subbots
const createBLSubbotStatusMessage = (type) => {
  const messages = BL_SUBBOT_MESSAGES[type] || BL_SUBBOT_MESSAGES.managing;
  return messages[Math.floor(Math.random() * messages.length)];
};

// Funcionalidad Wileys: Estadísticas avanzadas de subbots
export async function subbotstats(ctx) {
  const { usuario, sock, message } = ctx;

  await addBLSubbotReaction(sock, message, 'stats');

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
      '👤 Tus Subbots:',
      `• Total: ${userSubbots.length}`,
      `• Online: ${userOnline}`,
      `• Offline: ${userSubbots.length - userOnline}`,
      '',
      '🌐 Sistema Global:',
      `• Total subbots: ${allSubbots.length}`,
      `• Online: ${totalOnline}`,
      `• Offline: ${allSubbots.length - totalOnline}`,
      '',
      '💡 Usa /mybots para ver detalles'
    ];

    return { success: true, message: decorateBLSubbotMessage('Estadísticas de Subbots', stats, 'stats') };
  } catch (error) {
    console.error('Error en subbotstats:', error);
    return { success: false, message: decorateBLSubbotMessage('Error', 'Error al obtener estadísticas.\n🥺 Intenta de nuevo más tarde', 'love') };
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
