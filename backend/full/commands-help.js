import db from './db-connection.js';

// Catálogo de comandos disponible para el bot
export const commandCatalog = {
  all: {
    name: 'Todos los Comandos',
    emoji: '📋',
    commands: [
      { cmd: '/ai <pregunta>', desc: 'Chat con IA de KONMI' },
      { cmd: '/music <canción>', desc: 'Descargar música de YouTube' },
      { cmd: '/meme', desc: 'Obtener meme aleatorio' },
      { cmd: '/joke', desc: 'Obtener chiste aleatorio' },
      { cmd: '/quote', desc: 'Cita inspiracional' },
      { cmd: '/fact', desc: 'Dato curioso' },
      { cmd: '/weather <ciudad>', desc: 'Clima de una ciudad' },
      { cmd: '/trivia', desc: 'Pregunta de trivia' },
      { cmd: '/horoscope <signo>', desc: 'Horóscopo del día' },
      { cmd: '/wallpaper <tema>', desc: 'Wallpaper por tema' },
      { cmd: '/translate <texto> <idioma>', desc: 'Traducir texto' },
      { cmd: '/image <descripción>', desc: 'Generar imagen con IA' },
      { cmd: '/status', desc: 'Estado del bot' },
      { cmd: '/ping', desc: 'Probar conexión' }
    ]
  },
  admin: {
    name: 'Comandos de Administrador',
    emoji: '👑',
    commands: [
      { cmd: '/serbot', desc: 'Crear nuevo sub-bot' },
      { cmd: '/bots', desc: 'Listar sub-bots' },
      { cmd: '/delsubbot <id>', desc: 'Eliminar sub-bot' },
      { cmd: '/qr <id>', desc: 'Obtener QR del sub-bot' },
      { cmd: '/cleansession', desc: 'Limpiar sesiones y generar QR' },
      { cmd: '/logs [tipo]', desc: 'Ver logs del sistema' },
      { cmd: '/stats', desc: 'Estadísticas del bot' },
      { cmd: '/export <formato>', desc: 'Exportar logs' }
    ]
  },
  media: {
    name: 'Comandos de Media',
    emoji: '🎵',
    commands: [
      { cmd: '/music <canción>', desc: 'Descargar música de YouTube' },
      { cmd: '/meme', desc: 'Obtener meme aleatorio' },
      { cmd: '/wallpaper <tema>', desc: 'Wallpaper por tema' },
      { cmd: '/image <descripción>', desc: 'Generar imagen con IA' }
    ]
  },
  entertainment: {
    name: 'Comandos de Entretenimiento',
    emoji: '🎮',
    commands: [
      { cmd: '/joke', desc: 'Obtener chiste aleatorio' },
      { cmd: '/quote', desc: 'Cita inspiracional' },
      { cmd: '/fact', desc: 'Dato curioso' },
      { cmd: '/trivia', desc: 'Pregunta de trivia' },
      { cmd: '/horoscope <signo>', desc: 'Horóscopo del día' }
    ]
  },
  ai: {
    name: 'Comandos de IA',
    emoji: '🤖',
    commands: [
      { cmd: '/ai <pregunta>', desc: 'Chat con IA de KONMI' },
      { cmd: '/image <descripción>', desc: 'Generar imagen con IA' },
      { cmd: '/translate <texto> <idioma>', desc: 'Traducir texto' }
    ]
  },
  utility: {
    name: 'Comandos de Utilidad',
    emoji: '🔧',
    commands: [
      { cmd: '/weather <ciudad>', desc: 'Clima de una ciudad' },
      { cmd: '/miinfo', desc: 'Tu información de usuario' },
      { cmd: '/status', desc: 'Estado del bot' },
      { cmd: '/ping', desc: 'Probar conexión' },
      { cmd: '/help [categoría]', desc: 'Mostrar esta ayuda' }
    ]
  }
};

/**
 * Handle the /help command to show all available commands
 */
async function handleHelp(category, usuario, grupo, fecha) {
  try {
    console.log(`❓ Comando /help recibido de ${usuario}: "${category}"`);

    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    const isAdmin = user && user.rol === 'admin';

    const categories = commandCatalog;

    const validCategories = Object.keys(categories);
    const selectedCategory = category && validCategories.includes(category.toLowerCase()) ?
      category.toLowerCase() : 'all';

    const BOT_NAME = 'KONMI BOT';
    const DEV_NAME = 'Melodia';
    const categoryData = categories[selectedCategory];
    let message = `╭─❍「 🤖 ${BOT_NAME} ✦ 」\n` +
      `│ Desarrollado por ${DEV_NAME}\n` +
      `├─ ${categoryData.emoji} *${categoryData.name}*\n│\n`;

    categoryData.commands.forEach((command, index) => {
      message += `├ ${index + 1}. *${command.cmd}*\n`;
      message += `│   ↳ ${command.desc}\n│\n`;
    });

    if (selectedCategory === 'all') {
      message += `├─ 📚 *Categorías disponibles:*\n`;
      validCategories.forEach(cat => {
        if (cat !== 'all') {
          const catName = categories[cat].name;
          const catEmoji = categories[cat].emoji;
          message += `├─ ${catEmoji} ${catName}: .help ${cat}\n`;
        }
      });
      message += `\n`;
    }

    if (isAdmin) {
      message += `├─ 👑 *Eres administrador*\n`;
      message += `├─ Usa .help admin para ver comandos de admin\n`;
    }

    message += `├─ 🤖 ${BOT_NAME}\n`;
    message += `├─ Desarrollado por ${DEV_NAME}\n`;
    message += `╰─✦`;

    return {
      success: true,
      message
    };
  } catch (error) {
    console.error('Error en help:', error);
    return {
      success: false,
      message: '❌ *Error al obtener ayuda*'
    };
  }
}

export {
  handleHelp
};
