import logger from '../config/logger.js';
import {
  createSubbotWithPairing,
  createSubbotWithQr,
  listUserSubbots,
  deleteUserSubbot,
  attachRuntimeListeners,
  updateSubbotMetadata
} from '../subbot-manager.js';
import { formatDistanceToNow, format } from 'date-fns';
import pkg from 'date-fns/locale/es/index.js';
const { es } = pkg;

/**
 * Muestra la ayuda de comandos de subbots
 */
async function handleHelp(sock, from, isGroup, msg) {
  const helpText = `🤖 *Sistema de SubBots - Comandos Disponibles* 🤖

📱 *Gestión de SubBots:*
🔹 */subbot pair [número]* - Crear nuevo subbot usando código de emparejamiento
🔹 */subbot qr* - Generar código QR para nuevo subbot
🔹 */subbot list* - Ver lista de tus subbots activos
🔹 */subbot delete [id]* - Eliminar un subbot existente
🔹 */subbot status [id]* - Ver estado detallado de un subbot
🔹 */subbot restart [id]* - Reiniciar un subbot específico

⚙️ *Configuración:*
🔹 */subbot config [id]* - Ver/modificar configuración de un subbot
🔹 */subbot prefix [id] [prefijo]* - Cambiar prefijo de comandos
🔹 */subbot mode [id] [modo]* - Cambiar modo de operación

❓ *Ayuda:*
🔹 */subbot help* - Mostrar este menú de ayuda
🔹 */subbot info* - Ver información detallada del sistema

📝 *Nota:* Para más detalles sobre cada comando, usa */subbot help [comando]*`;

  await sock.sendMessage(from, {
    text: helpText,
    ...(isGroup ? { mentions: [msg.sender] } : {})
  });
}

/**
 * Maneja el comando de creacin de subbot con pairing code
 */
export async function handlePairSubbot(sock, from, isGroup, msg, args) {
  const rawSenderJid = msg?.sender || (isGroup ? msg?.key?.participant : msg?.key?.remoteJid) || from;
  const requesterJid = ensureJid(rawSenderJid);
  const groupMentions = isGroup && requesterJid ? { mentions: [requesterJid] } : {};
  const rawProvided = Array.isArray(args) ? args.join(' ') : '';
  const providedNumber = rawProvided.replace(/[^0-9]/g, '');
  const senderPart = String(rawSenderJid || '').split('@')[0] || '';
  const senderNumber = senderPart.split(':')[0]?.replace(/[^0-9]/g, '') || '';
  const targetNumber = providedNumber.length >= 8
    ? providedNumber
    : senderNumber.length >= 8
      ? senderNumber
      : null;

  if (!targetNumber) {
    return await sock.sendMessage(from, {
      text: '⚠️ *No pude detectar el número destino*\n\nIntenta enviar `/code` desde el dispositivo que quieras vincular o especifica el número manualmente con `/code <número>`.',
      ...groupMentions
    });
  }

  const intro = await sock.sendMessage(from, {
    text: '⏳ *Creando tu SubBot...*\n\nGenerando el Pairing Code, espera unos segundos. 🛠️',
    ...groupMentions
  });

  let resolved = false;
  let detachListeners = () => {};
  let timeoutHandle;
  let introDismissed = false;

  const dismissIntro = async () => {
    if (introDismissed || !intro?.key) return;
    introDismissed = true;
    try {
      await sock.sendMessage(from, { delete: intro.key });
    } catch (error) {
      logger.warn('No se pudo eliminar mensaje inicial de /subbot pair', { error: error?.message });
    }
  };

  const sendWithContext = async (jid, message, includeMention = false) => {
    const payload = { ...message };
    if (includeMention && isGroup && requesterJid && jid === from) {
      payload.mentions = [requesterJid];
    }
    await sock.sendMessage(jid, payload);
  };

  const cleanup = async (message, targetJid = from, mention = false) => {
    if (resolved) return;
    resolved = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    try {
      detachListeners();
    } catch (_) {}
    await dismissIntro();
    if (message) {
      await sendWithContext(targetJid, message, mention);
    }
  };

  try {
    const label = `KONMI-${Date.now().toString().slice(-4)}`;
    const { code } = await createSubbotWithPairing({
      ownerNumber: requesterJid,
      targetNumber,
      displayName: label,
      requestJid: from,
      requestParticipant: isGroup ? requesterJid : null
    });

    detachListeners = attachRuntimeListeners(code, [
      {
        event: 'pairing_code',
        handler: async (payload) => {
          const data = payload?.data || {};
          if (!data?.code) return;
          await dismissIntro();
          await updateSubbotMetadata(code, {
            lastPairingDeliveredAt: new Date().toISOString(),
            deliveredChat: from
          });

          const pairingMessage = {
            text: [
              '🔐 *Pairing Code listo*',
              '',
              `📞 *Número destino:* +${targetNumber}`,
              `🆔 *Código:* *${data.code}*`,
              '⏰ *Vence en:* ~10 minutos',
              '',
              '✨ *Cómo vincular*',
              '1️⃣ Abre WhatsApp en el teléfono destino',
              '2️⃣ Ve a *Ajustes ▸ Dispositivos vinculados*',
              '3️⃣ Toca *Vincular con código de teléfono*',
              `4️⃣ Escribe ${data.code}`,
              '',
              "⚠️ Si expira, vuelve a usar '/code'."
            ].join('\n')
          };

          try {
            await sendWithContext(requesterJid, pairingMessage);
            if (isGroup) {
              await sendWithContext(from, { text: '✅ Te envié el Pairing Code por privado. ¡Revisa tu chat! 💌' }, true);
            }
          } catch (error) {
            logger.warn('No se pudo enviar Pairing Code por privado', { error: error?.message });
            await sendWithContext(from, pairingMessage, true);
          }
        }
      },
      {
        event: 'connected',
        handler: async () => {
          await cleanup(
            {
              text: [
                '🟢 *SubBot conectado correctamente.*',
                '',
                "Consulta tus subbots con '/bots'."
              ].join('\n')
            },
            from,
            true
          );
        }
      },
      {
        event: 'error',
        handler: async (payload) => {
          const reason = payload?.data?.message || 'Error desconocido';
          await cleanup(
            {
              text: [
                '❌ *Ocurrió un problema generando el Pairing Code*',
                '',
                `Motivo: ${reason}`,
                '',
                "Intenta nuevamente con '/code'."
              ].join('\n')
            },
            from,
            true
          );
        }
      },
      {
        event: 'disconnected',
        handler: async (payload) => {
          const reason = payload?.data?.reason || payload?.data?.statusCode || 'Sesión cerrada';
          await cleanup(
            {
              text: [
                '⚠️ *SubBot desconectado mientras se vinculaba*',
                '',
                `Motivo: ${reason}`,
                "Vuelve a intentar con '/code' cuando estés listo."
              ].join('\n')
            },
            from,
            true
          );
        }
      }
    ]);

    timeoutHandle = setTimeout(async () => {
      await cleanup(
        {
          text: [
            '⌛ *No recibí respuesta de WhatsApp*',
            '',
            "Puede que el dispositivo tardara demasiado. Ejecuta '/code' cuando estés listo de nuevo."
          ].join('\n')
        },
        from,
        true
      );
    }, 60000);
  } catch (error) {
    logger.error('Error en comando /subbot pair:', error);
    await cleanup(
      { text: `❌ *No pude generar el Pairing Code*\n\nDetalle: ${error.message}` },
      from,
      true
    );
  }
}

/**
 * Maneja el comando de creacin de subbot con QR
 */
export async function handleQRSubbot(sock, from, isGroup, msg) {
  const requesterJid = ensureJid(msg.sender);
  const groupMentions = isGroup && requesterJid ? { mentions: [requesterJid] } : {};
  const intro = await sock.sendMessage(from, {
    text: '🌀 *Preparando QR...*\n\nMantén la cámara lista para escanear 📷',
    ...groupMentions
  });

  let resolved = false;
  let detachListeners = () => {};
  let timeoutHandle;
  let introDismissed = false;

  const dismissIntro = async () => {
    if (introDismissed || !intro?.key) return;
    introDismissed = true;
    try {
      await sock.sendMessage(from, { delete: intro.key });
    } catch (error) {
      logger.warn('No se pudo eliminar mensaje inicial de /subbot qr', { error: error?.message });
    }
  };

  const finalize = async (message) => {
    if (resolved) return;
    resolved = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    try {
      detachListeners();
    } catch (_) {}
    await dismissIntro();
    if (message) {
      await sock.sendMessage(from, { ...message, ...groupMentions });
    }
  };

  try {
    const label = `KONMI-QR-${Date.now().toString().slice(-4)}`;
    const { code } = await createSubbotWithQr({
      ownerNumber: requesterJid,
      displayName: label,
      requestJid: from
    });

    detachListeners = attachRuntimeListeners(code, [
      {
        event: 'qr_ready',
        handler: async (payload) => {
          const data = payload?.data || {};
          if (!data?.qrImage) return;
          await dismissIntro();
          const caption = `📲 *QR listo para escanear*\n\n🆔 *ID:* ${code}\n⏳ *Generado:* ${formatDistanceToNow(new Date(), { addSuffix: true, locale: es })}\n\n✨ *Pasos*\n1️⃣ Abre WhatsApp en tu teléfono\n2️⃣ Ve a *Ajustes ▸ Dispositivos vinculados*\n3️⃣ Toca *Vincular dispositivo*\n4️⃣ Escanea este código y espera la confirmación ✅`;
          await sock.sendMessage(from, {
            image: Buffer.from(data.qrImage, 'base64'),
            caption,
            ...groupMentions
          });
        }
      },
      {
        event: 'connected',
        handler: async () => {
          await finalize({
            text: `🟢 *SubBot conectado correctamente por QR.*\n\nConsulta tus subbots con ${'`/bots`'}.`
          });
        }
      },
      {
        event: 'error',
        handler: async (payload) => {
          const reason = payload?.data?.message || 'Error desconocido';
          await finalize({
            text: `❌ *No pude generar el QR*\n\nMotivo: ${reason}\nIntenta nuevamente con ${'`/qr`'}.`
          });
        }
      }
    ]);

    timeoutHandle = setTimeout(async () => {
      await finalize({
        text: `⌛ *No recibí el QR a tiempo*\n\nQuizás WhatsApp tardó demasiado. Intenta de nuevo con ${'`/qr`'}.`
      });
    }, 60000);
  } catch (error) {
    logger.error('Error en comando /subbot qr:', error);
    await finalize({
      text: `❌ *No pude generar el QR*\n\nDetalle: ${error.message}`
    });
  }
}

/**
 * Maneja el comando para listar subbots
 */
export async function handleListSubbots(sock, from, isGroup, msg) {
  const rawSenderJid = msg?.sender || (isGroup ? msg?.key?.participant : msg?.key?.remoteJid) || from;
  const cleanedSender = String(rawSenderJid || '').split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '') || '';
  const requesterJid = ensureJid(rawSenderJid);

  const mentionSet = new Set();
  if (isGroup && requesterJid) mentionSet.add(requesterJid);

  const addMention = (digits) => {
    const clean = String(digits || '').replace(/[^0-9]/g, '');
    if (!clean) return null;
    const jid = `${clean}@s.whatsapp.net`;
    mentionSet.add(jid);
    return jid;
  };

  try {
    const subbots = await listUserSubbots(cleanedSender || msg.sender);

    if (!subbots.length) {
      return await sock.sendMessage(from, {
        text: '🤖 *Aún no tienes SubBots*\n\nUsa `/code [número]` para Pairing Code o `/qr` para QR. ¡Conéctate ahora! ✨',
        mentions: Array.from(mentionSet)
      });
    }

    const now = Date.now();
    let message = `🤖 *Tus SubBots (${subbots.length})*\n\n`;

    subbots.forEach((subbot, index) => {
      const meta = subbot.metadata || {};
      const statusEmoji = getStatusEmoji(subbot.status, subbot.is_online);
      const display = meta.displayName || subbot.code;
      const ownerDigits = subbot.owner_number || subbot.created_by || subbot.user_phone || '';
      const botDigits = subbot.bot_number || '';
      const targetDigits = meta.targetNumber || subbot.target_number || '';

      const ownerJid = addMention(ownerDigits);
      const botJid = addMention(botDigits);
      const targetJid = addMention(targetDigits);

      const ownerText = ownerJid ? `@${ownerJid.split('@')[0]}` : 'N/D';
      const targetText = targetJid ? `@${targetJid.split('@')[0]}` : (targetDigits ? `@${String(targetDigits).replace(/[^0-9]/g, '')}` : 'N/D');
      const botText = botDigits ? `+${String(botDigits).replace(/[^0-9]/g, '')}` : 'N/D';

      const createdAtIso = subbot.created_at || subbot.createdAt || null;
      const connectedAtIso = subbot.connected_at || null;
      const lastActivityIso = subbot.last_heartbeat || subbot.updated_at || connectedAtIso || createdAtIso || null;

      let uptime = 'N/D';
      if (connectedAtIso && subbot.is_online) {
        const ms = now - new Date(connectedAtIso).getTime();
        if (ms > 0) {
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          uptime = `${h}h ${m}m`;
        }
      }

      const createdAtText = createdAtIso ? new Date(createdAtIso).toLocaleString('es-ES') : 'N/D';
      const connectedAtText = connectedAtIso ? new Date(connectedAtIso).toLocaleString('es-ES') : 'N/D';
      const lastActivityText = lastActivityIso ? new Date(lastActivityIso).toLocaleString('es-ES') : 'N/D';

      message += `${index + 1}. ${statusEmoji} *${display}*\n`;
      message += `   🔑 Código: ${subbot.code}\n`;
      message += `   📡 Estado: ${prettifyStatus(subbot.status)}\n`;
      message += `   🧑💻 Creado por: ${ownerText}\n`;
      message += `   👑 Propietario: ${targetText}\n`;
      message += `   🤖 Bot: ${botText}\n`;
      message += `   🗓 Creado: ${createdAtText}\n`;
      message += `   🔌 Conectado desde: ${connectedAtText}\n`;
      message += `   🔄 Última actividad: ${lastActivityText}\n`;
      if (subbot.is_online && uptime !== 'N/D') {
        message += `   ⏱ Uptime: ${uptime}\n`;
      }
      if (subbot.message_count != null) {
        message += `   ✉️ Mensajes manejados: ${subbot.message_count}\n`;
      }
      message += '\n';
    });

    message += '🧰 *Atajos útiles*\n';
    message += '   • `/delsubbot <código>` para eliminar\n';
    message += '   • `/code <número>` para otro Pairing Code\n';
    message += '   • `/qr` para generar un nuevo QR\n';

    await sock.sendMessage(from, {
      text: message,
      mentions: Array.from(mentionSet)
    });

  } catch (error) {
    logger.error('Error al listar subbots:', error);
    await sock.sendMessage(from, {
      text: '❌ *Error al listar tus SubBots*\n\nIntenta nuevamente en unos segundos.',
      mentions: Array.from(mentionSet)
    });
  }
}

/**
 * Maneja el comando para eliminar un subbot
 */
export async function handleDeleteSubbot(sock, from, isGroup, msg, args) {
  const rawSenderJid = msg?.sender || (isGroup ? msg?.key?.participant : msg?.key?.remoteJid) || from;
  const requesterJid = ensureJid(rawSenderJid);
  const cleanedSender = String(rawSenderJid || '').split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '') || '';

  if (!args[0]) {
    return await sock.sendMessage(from, {
      text: ' Debes proporcionar el ID del subbot a eliminar\n' +
            'Ejemplo: */subbot delete subbot_1234567890*',
      ...(isGroup && requesterJid ? { mentions: [requesterJid] } : {})
    });
  }

  const subbotId = args[0];

  try {
    await deleteUserSubbot(subbotId, cleanedSender || msg.sender);

    await sock.sendMessage(from, {
      text: `🗑️ *SubBot eliminado*\n\nID: ${subbotId}\nSe removió la sesión y sus credenciales.\n\nPuedes crear uno nuevo cuando quieras ✨`,
      ...(isGroup && requesterJid ? { mentions: [requesterJid] } : {})
    });
  } catch (error) {
    logger.error(`Error al eliminar subbot ${subbotId}:`, error);
    await sock.sendMessage(from, {
      text: `❌ *No pude eliminar el SubBot*\n\nDetalle: ${error.message}`,
      ...(isGroup && requesterJid ? { mentions: [requesterJid] } : {})
    });
  }
}

function getStatusEmoji(status, onlineFlag = false) {
  const statusEmojis = {
    connected: '🟢',
    pending: '🕒',
    error: '🔴',
    disconnected: '🛑',
    logged_out: '🚪',
    expired: '⌛'
  };

  if (onlineFlag) return '🟢';
  return statusEmojis[status] || '⚪';
}

function prettifyStatus(status) {
  const map = {
    connected: 'Conectado',
    pending: 'Esperando vinculación',
    disconnected: 'Desconectado',
    logged_out: 'Sesión cerrada',
    expired: 'Expirado',
    error: 'Con error'
  };
  return map[status] || status;
}

function safeFormatDistance(value) {
  if (!value) return 'N/D';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: es });
  } catch (error) {
    return 'N/D';
  }
}

function ensureJid(value) {
  if (!value) return null;
  return value.includes('@') ? value : `${value}@s.whatsapp.net`;
}

/**
 * Maneja los comandos de subbots
 */
export async function handleSubbotCommand(sock, from, isGroup, msg, args) {
  const subcommand = args[0]?.toLowerCase() || 'help';

  switch (subcommand) {
    case 'pair':
      await handlePairSubbot(sock, from, isGroup, msg, args.slice(1));
      break;

    case 'qr':
      await handleQRSubbot(sock, from, isGroup, msg);
      break;

    case 'list':
      await handleListSubbots(sock, from, isGroup, msg);
      break;

    case 'delete':
      await handleDeleteSubbot(sock, from, isGroup, msg, args.slice(1));
      break;

    case 'help':
    default:
      await handleHelp(sock, from, isGroup, msg);
      break;
  }
}

export default {
  name: 'subbot',
  description: 'Gestiona tus subbots',
  command: 'subbot',
  handler: handleSubbotCommand,
  help: ` *Comandos de SubBots*

` +
  ` */subbot pair [nmero]* - Crea un nuevo subbot con cdigo de emparejamiento\n` +
  ` */subbot qr* - Genera un cdigo QR para un nuevo subbot\n` +
  ` */subbot list* - Muestra tus subbots\n` +
  ` */subbot delete [id]* - Elimina un subbot\n` +
  ` */subbot help* - Muestra esta ayuda`
};
