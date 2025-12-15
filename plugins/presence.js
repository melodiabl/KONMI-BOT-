// src/commands/presence.js
// Sistema de estados de presencia

export async function typing(ctx) {
  const { sock, remoteJid, args } = ctx;

  const duration = parseInt(args[0]) || 5; // Duración en segundos (default: 5)

  if (duration > 30) {
    return { text: '❌ Duración máxima: 30 segundos' };
  }

  try {
    // Mostrar "escribiendo..."
    await sock.sendPresenceUpdate('composing', remoteJid);

    // Después del tiempo, volver a disponible
    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', remoteJid);
    }, duration * 1000);

    return { text: `✅ Mostrando "escribiendo..." por ${duration} segundos` };
  } catch (error) {
    console.error('[TYPING] Error:', error);
    return { text: '❌ Error al actualizar presencia' };
  }
}

export async function recording(ctx) {
  const { sock, remoteJid, args } = ctx;

  const duration = parseInt(args[0]) || 5; // Duración en segundos (default: 5)

  if (duration > 30) {
    return { text: '❌ Duración máxima: 30 segundos' };
  }

  try {
    // Mostrar "grabando audio..."
    await sock.sendPresenceUpdate('recording', remoteJid);

    // Después del tiempo, volver a disponible
    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', remoteJid);
    }, duration * 1000);

    return { text: `✅ Mostrando "grabando audio..." por ${duration} segundos` };
  } catch (error) {
    console.error('[RECORDING] Error:', error);
    return { text: '❌ Error al actualizar presencia' };
  }
}

export async function online(ctx) {
  const { sock, remoteJid } = ctx;

  try {
    await sock.sendPresenceUpdate('available', remoteJid);
    return { text: '✅ Estado: Disponible' };
  } catch (error) {
    console.error('[ONLINE] Error:', error);
    return { text: '❌ Error al actualizar presencia' };
  }
}

export async function offline(ctx) {
  const { sock, remoteJid } = ctx;

  try {
    await sock.sendPresenceUpdate('unavailable', remoteJid);
    return { text: '✅ Estado: No disponible' };
  } catch (error) {
    console.error('[OFFLINE] Error:', error);
    return { text: '❌ Error al actualizar presencia' };
  }
}

// 🎯 NUEVAS FUNCIONALIDADES WILEYS

export async function away(ctx) {
  const { sock, remoteJid } = ctx;
  try {
    await sock.sendPresenceUpdate('unavailable', remoteJid);
    return { text: '✅ Estado: Ausente' };
  } catch (error) {
    return { text: '❌ Error al actualizar presencia' };
  }
}

export async function busy(ctx) {
  const { sock, remoteJid } = ctx;
  try {
    await sock.sendPresenceUpdate('unavailable', remoteJid);
    return { text: '✅ Estado: Ocupado' };
  } catch (error) {
    return { text: '❌ Error al actualizar presencia' };
  }
}

export async function readall(ctx) {
  const { sock, remoteJid, isGroup } = ctx;

  if (!isGroup) {
    return { text: '❌ Este comando solo funciona en grupos' };
  }

  try {
    // Marcar todos los mensajes como leídos
    await sock.readMessages([{ remoteJid, id: undefined, participant: undefined }]);
    return { text: '✅ Todos los mensajes marcados como leídos' };
  } catch (error) {
    return { text: '❌ Error al marcar mensajes como leídos' };
  }
}

// Función helper para usar en otros comandos
export async function showTyping(sock, jid, duration = 3000) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', jid);
    }, duration);
  } catch (error) {
    console.error('[SHOW_TYPING] Error:', error);
  }
}

export async function showRecording(sock, jid, duration = 3000) {
  try {
    await sock.sendPresenceUpdate('recording', jid);
    setTimeout(async () => {
      await sock.sendPresenceUpdate('paused', jid);
    }, duration);
  } catch (error) {
    console.error('[SHOW_RECORDING] Error:', error);
  }
}

export default { typing, recording, online, offline, showTyping, showRecording };
