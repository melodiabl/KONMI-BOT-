// plugins/example-plugin.js
// Ejemplo completo de plugin con todas las funcionalidades

// ===== MÉTODO 1: Configuración de comandos (RECOMENDADO) =====
export const commands = [
  {
    name: 'ejemplo',
    handler: 'handleEjemplo',
    category: '🎯 Ejemplos',
    description: '🌟 Comando de ejemplo con BL theming',
    admin: false
  },
  {
    name: 'test',
    handler: 'handleTest',
    category: '🎯 Ejemplos',
    description: '🧪 Comando de prueba',
    admin: false
  }
];

// ===== MÉTODO 2: Objeto COMMANDS (alternativo) =====
export const COMMANDS = {
  demo: {
    handler: 'handleDemo',
    category: '🎯 Ejemplos',
    description: '🎭 Demostración de funcionalidades',
    admin: false
  }
};

// ===== FUNCIONALIDADES WILEYS + TEMÁTICA BL =====
const BL_EXAMPLE_REACTIONS = ['💖', '✨', '🌸', '💕', '🌟', '🥰'];

const addBLExampleReaction = async (sock, message, type = 'example') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      example: ['💖', '✨', '🌸'],
      test: ['🧪', '💕', '🌟'],
      demo: ['🎭', '💖', '✨']
    };

    const sequence = reactionSequences[type] || reactionSequences.example;

    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_EXAMPLE_REACTION] Error:', error);
  }
};

const decorateBLMessage = (title, content) => {
  return `╔💖═══════════════════════════════════════💖╗
║              ${title.padEnd(19)}              ║
║                                         ║
║    ${content.padEnd(35)} ║
╚💖═══════════════════════════════════════💖╝`;
};

// ===== HANDLERS DE COMANDOS =====

export async function handleEjemplo(ctx) {
  const { sock, remoteJid, message, sender, pushName } = ctx;

  // Funcionalidad Wileys: Reacción automática BL
  await addBLExampleReaction(sock, message, 'example');

  const response = decorateBLMessage(
    'EJEMPLO PLUGIN',
    '¡Hola! Este es un ejemplo de plugin\ncon temática BL completa 💖'
  );

  return {
    success: true,
    message: response
  };
}

export async function handleTest(ctx) {
  const { sock, remoteJid, message, args } = ctx;

  await addBLExampleReaction(sock, message, 'test');

  const testMessage = `🧪 ¡Comando de prueba ejecutado!

💖 Argumentos recibidos: ${args.length}
✨ Contenido: ${args.join(' ') || 'Sin argumentos'}
🌸 Sistema funcionando perfectamente`;

  return {
    success: true,
    message: testMessage
  };
}

export async function handleDemo(ctx) {
  const { sock, remoteJid, message } = ctx;

  await addBLExampleReaction(sock, message, 'demo');

  return {
    success: true,
    message: `🎭 DEMOSTRACIÓN COMPLETA

🚀 Sistema de plugins: ✅ Funcionando
💖 Temática BL: ✅ Integrada
✨ Reacciones automáticas: ✅ Activas
🌸 Auto-discovery: ✅ Operativo

¡El sistema está completamente funcional!`
  };
}

// ===== MÉTODO 3: Auto-detección (funciones exportadas) =====
export async function ping(ctx) {
  return { success: true, message: '🏓 ¡Pong! Plugin example funcionando' };
}

export async function info(ctx) {
  return {
    success: true,
    message: 'ℹ️ Plugin de ejemplo - Demuestra todas las funcionalidades del sistema'
  };
}
