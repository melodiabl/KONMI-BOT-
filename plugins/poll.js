// src/commands/poll.js
// Sistema de encuestas/polls + Funcionalidades Wileys

// Funcionalidad Wileys: Reacciones automáticas para encuestas
const addPollReaction = async (sock, message, emoji = '📊') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[POLL_REACTION] Error:', error);
  }
};

export async function poll(ctx) {
  const { sock, remoteJid, args, text, message } = ctx;

  // Funcionalidad Wileys: Reacción automática
  await addPollReaction(sock, message, '📊');

  if (args.length === 0) {
    return {
      text: `📊 *CREAR ENCUESTA*

*Uso:*
/poll <pregunta> | opción1 | opción2 | opción3

*Ejemplo:*
/poll ¿Cuál prefieres? | Pizza | Hamburguesa | Tacos

*Notas:*
• Mínimo 2 opciones
• Máximo 12 opciones
• Usa | para separar opciones`
    };
  }

  // Extraer pregunta y opciones
  const fullText = text.replace(/^\/poll\s+/i, '');
  const parts = fullText.split('|').map(p => p.trim());

  if (parts.length < 2) {
    return {
      text: '❌ Debes proporcionar al menos una pregunta y una opción.\n\n*Ejemplo:*\n/poll ¿Te gusta? | Sí | No'
    };
  }

  const question = parts[0];
  const options = parts.slice(1);

  if (options.length < 2) {
    return {
      text: '❌ Debes proporcionar al menos 2 opciones.'
    };
  }

  if (options.length > 12) {
    return {
      text: '❌ Máximo 12 opciones permitidas.'
    };
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: 1 // 1 = una sola opción, 0 = múltiples opciones
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[POLL] Error:', error);
    return {
      text: '❌ Error al crear encuesta. Asegúrate de que tu WhatsApp esté actualizado.'
    };
  }
}

export async function pollMultiple(ctx) {
  const { sock, remoteJid, args, text } = ctx;

  if (args.length === 0) {
    return {
      text: `📊 *CREAR ENCUESTA MÚLTIPLE*

*Uso:*
/pollmultiple <pregunta> | opción1 | opción2 | opción3

Permite seleccionar múltiples opciones.

*Ejemplo:*
/pollmultiple ¿Qué te gusta? | Pizza | Hamburguesa | Tacos | Sushi`
    };
  }

  // Extraer pregunta y opciones
  const fullText = text.replace(/^\/pollmultiple\s+/i, '');
  const parts = fullText.split('|').map(p => p.trim());

  if (parts.length < 3) {
    return {
      text: '❌ Debes proporcionar una pregunta y al menos 2 opciones.'
    };
  }

  const question = parts[0];
  const options = parts.slice(1);

  if (options.length > 12) {
    return {
      text: '❌ Máximo 12 opciones permitidas.'
    };
  }

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: options,
        selectableCount: 0 // 0 = múltiples opciones
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[POLL_MULTIPLE] Error:', error);
    return {
      text: '❌ Error al crear encuesta. Asegúrate de que tu WhatsApp esté actualizado.'
    };
  }
}

// 🎯 NUEVAS FUNCIONALIDADES WILEYS

export async function quickpoll(ctx) {
  const { sock, remoteJid, args } = ctx;

  if (args.length === 0) {
    return { text: '❌ Uso: /quickpoll <pregunta>' };
  }

  const question = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: ['👍 Sí', '👎 No'],
        selectableCount: 1
      }
    });
    return { success: true };
  } catch (error) {
    return { text: '❌ Error al crear encuesta rápida' };
  }
}

export async function rating(ctx) {
  const { sock, remoteJid, args } = ctx;

  if (args.length === 0) {
    return { text: '❌ Uso: /rating <pregunta>' };
  }

  const question = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: ['⭐ 1', '⭐⭐ 2', '⭐⭐⭐ 3', '⭐⭐⭐⭐ 4', '⭐⭐⭐⭐⭐ 5'],
        selectableCount: 1
      }
    });
    return { success: true };
  } catch (error) {
    return { text: '❌ Error al crear encuesta de rating' };
  }
}

export async function yesno(ctx) {
  const { sock, remoteJid, args } = ctx;

  if (args.length === 0) {
    return { text: '❌ Uso: /yesno <pregunta>' };
  }

  const question = args.join(' ');

  try {
    await sock.sendMessage(remoteJid, {
      poll: {
        name: question,
        values: ['✅ Sí', '❌ No', '🤷 No sé'],
        selectableCount: 1
      }
    });
    return { success: true };
  } catch (error) {
    return { text: '❌ Error al crear encuesta sí/no' };
  }
}

export default { poll, pollMultiple, quickpoll, rating, yesno };
