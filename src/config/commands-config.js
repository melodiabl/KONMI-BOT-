// src/config/commands-config.js
// Configuración centralizada de todos los comandos del bot

export const COMMAND_DEFINITIONS = {
  // ===== COMANDOS BÁSICOS =====
  help: {
    aliases: ['ayuda', 'menu', 'comandos'],
    category: 'Básicos',
    description: 'Mostrar ayuda y comandos disponibles',
    usage: '/help [comando]',
    examples: ['/help', '/help play'],
    handler: 'help'
  },

  ping: {
    category: 'Básicos',
    description: 'Verificar latencia del bot',
    handler: 'ping'
  },

  status: {
    category: 'Básicos',
    description: 'Estado del bot y sistema',
    handler: 'status'
  },

  whoami: {
    category: 'Básicos',
    description: 'Tu información de usuario',
    handler: 'profile'
  },

  // ===== INTELIGENCIA ARTIFICIAL =====
  ia: {
    aliases: ['ai'],
    category: 'IA',
    description: 'Pregunta a Gemini AI',
    usage: '/ia <pregunta>',
    examples: ['/ia ¿Cuál es la capital de Francia?'],
    handler: 'ai'
  },

  image: {
    category: 'IA',
    description: 'Generar imagen con IA',
    usage: '/image <descripción>',
    handler: 'images'
  },

  clasificar: {
    category: 'IA',
    description: 'Clasificar texto con IA',
    usage: '/clasificar <texto>',
    handler: 'ai'
  },

  // ===== DESCARGAS DE REDES SOCIALES =====
  tiktok: {
    category: 'Redes',
    description: 'Descargar video de TikTok',
    usage: '/tiktok <url>',
    examples: ['/tiktok https://tiktok.com/@user/video/123'],
    handler: 'download-commands'
  },

  instagram: {
    aliases: ['ig'],
    category: 'Redes',
    description: 'Descargar contenido de Instagram',
    usage: '/instagram <url>',
    handler: 'download-commands'
  },

  facebook: {
    aliases: ['fb'],
    category: 'Redes',
    description: 'Descargar video de Facebook',
    usage: '/facebook <url>',
    handler: 'download-commands'
  },

  twitter: {
    aliases: ['x'],
    category: 'Redes',
    description: 'Descargar contenido de Twitter/X',
    usage: '/twitter <url>',
    handler: 'download-commands'
  },

  pinterest: {
    category: 'Redes',
    description: 'Descargar imagen de Pinterest',
    usage: '/pinterest <url>',
    handler: 'download-commands'
  },

  spotify: {
    category: 'Redes',
    description: 'Buscar en Spotify y descargar de YouTube',
    usage: '/spotify <canción>',
    examples: ['/spotify Bad Bunny Tití Me Preguntó'],
    handler: 'download-commands'
  },

  // ===== MEDIA Y ENTRETENIMIENTO =====
  play: {
    category: 'Media',
    description: 'Reproducir audio de YouTube',
    usage: '/play <búsqueda|url>',
    examples: ['/play Despacito', '/play https://youtube.com/watch?v=123'],
    handler: 'download-commands'
  },

  video: {
    aliases: ['youtube'],
    category: 'Media',
    description: 'Descargar video de YouTube',
    usage: '/video <búsqueda|url>',
    handler: 'download-commands'
  },

  music: {
    category: 'Media',
    description: 'Descargar música de YouTube',
    usage: '/music <búsqueda>',
    handler: 'download-commands'
  },

  meme: {
    category: 'Media',
    description: 'Meme aleatorio',
    handler: 'download-commands'
  },

  sticker: {
    aliases: ['s'],
    category: 'Media',
    description: 'Crear sticker (responder a imagen)',
    handler: 'stickers'
  },

  tts: {
    category: 'Media',
    description: 'Texto a voz',
    usage: '/tts <texto>',
    handler: 'media'
  },

  wallpaper: {
    category: 'Media',
    description: 'Buscar fondo de pantalla',
    usage: '/wallpaper <tema>',
    handler: 'images'
  },

  joke: {
    category: 'Media',
    description: 'Chiste aleatorio',
    handler: 'utils'
  },

  quote: {
    category: 'Media',
    description: 'Frase célebre aleatoria',
    handler: 'download-commands'
  },

  // ===== UTILIDADES =====
  translate: {
    aliases: ['tr'],
    category: 'Utilidades',
    description: 'Traducir texto',
    usage: '/translate <texto> <idioma>',
    examples: ['/translate Hola mundo en'],
    handler: 'download-commands'
  },

  weather: {
    aliases: ['clima'],
    category: 'Utilidades',
    description: 'Consultar clima',
    usage: '/weather <ciudad>',
    examples: ['/weather Madrid'],
    handler: 'download-commands'
  },

  fact: {
    category: 'Utilidades',
    description: 'Dato curioso aleatorio',
    handler: 'download-commands'
  },

  trivia: {
    category: 'Utilidades',
    description: 'Pregunta de trivia',
    handler: 'download-commands'
  },

  horoscope: {
    aliases: ['horoscopo'],
    category: 'Utilidades',
    description: 'Horóscopo por signo',
    usage: '/horoscope <signo>',
    handler: 'utils'
  },

  // ===== GESTIÓN DE ARCHIVOS =====
  descargar: {
    category: 'Archivos',
    description: 'Descargar archivo por URL',
    usage: '/descargar <url> <nombre> <categoría>',
    handler: 'files'
  },

  guardar: {
    category: 'Archivos',
    description: 'Guardar media (responder a archivo)',
    handler: 'files'
  },

  archivos: {
    category: 'Archivos',
    description: 'Ver archivos disponibles',
    handler: 'files'
  },

  misarchivos: {
    category: 'Archivos',
    description: 'Ver tus archivos',
    handler: 'files'
  },

  // ===== APORTES Y PEDIDOS =====
  addaporte: {
    category: 'Aportes',
    description: 'Agregar aporte (responder a contenido)',
    usage: '/addaporte <tipo> <descripción>',
    handler: 'aportes'
  },

  aportes: {
    category: 'Aportes',
    description: 'Ver aportes de la comunidad',
    handler: 'aportes'
  },

  myaportes: {
    aliases: ['misaportes'],
    category: 'Aportes',
    description: 'Ver tus aportes',
    handler: 'aportes'
  },

  aporteestado: {
    category: 'Aportes',
    description: 'Cambiar estado de aporte (admin)',
    usage: '/aporteestado <id> <estado>',
    admin: true,
    handler: 'aportes'
  },

  pedido: {
    category: 'Pedidos',
    description: 'Hacer un pedido',
    usage: '/pedido <título> - <descripción>',
    examples: ['/pedido Nuevo comando - Necesito un comando para...'],
    handler: 'pedidos'
  },

  pedidos: {
    aliases: ['mispedidos'],
    category: 'Pedidos',
    description: 'Ver tus pedidos',
    handler: 'pedidos'
  },

  // ===== SUBBOTS =====
  qr: {
    category: 'Subbots',
    description: 'Crear subbot con código QR',
    handler: 'subbots'
  },

  code: {
    aliases: ['pair'],
    category: 'Subbots',
    description: 'Crear subbot con código de emparejamiento',
    usage: '/code [número]',
    handler: 'subbots'
  },

  mybots: {
    aliases: ['mibots'],
    category: 'Subbots',
    description: 'Ver tus subbots',
    handler: 'mybots'
  },

  bots: {
    category: 'Subbots',
    description: 'Ver todos los subbots (admin)',
    admin: true,
    handler: 'bots'
  },

  stopbot: {
    category: 'Subbots',
    description: 'Detener subbot',
    usage: '/stopbot [código]',
    handler: 'subbots'
  },

  // ===== ADMINISTRACIÓN =====
  bot: {
    category: 'Admin',
    description: 'Controlar estado del bot',
    usage: '/bot on|off|global on|off',
    admin: true,
    handler: 'bot-control'
  },

  kick: {
    category: 'Admin',
    description: 'Expulsar usuario del grupo',
    usage: '/kick @usuario',
    admin: true,
    handler: 'groups'
  },

  promote: {
    category: 'Admin',
    description: 'Promover a administrador',
    usage: '/promote @usuario',
    admin: true,
    handler: 'groups'
  },

  demote: {
    category: 'Admin',
    description: 'Quitar administrador',
    usage: '/demote @usuario',
    admin: true,
    handler: 'groups'
  },

  lock: {
    category: 'Admin',
    description: 'Bloquear grupo',
    admin: true,
    handler: 'groups'
  },

  unlock: {
    category: 'Admin',
    description: 'Desbloquear grupo',
    admin: true,
    handler: 'groups'
  },

  logs: {
    category: 'Admin',
    description: 'Ver logs del sistema',
    admin: true,
    handler: 'logs'
  },

  stats: {
    aliases: ['estadisticas'],
    category: 'Admin',
    description: 'Estadísticas del bot',
    admin: true,
    handler: 'system-info'
  },

  export: {
    category: 'Admin',
    description: 'Exportar datos',
    admin: true,
    handler: 'system'
  },

  update: {
    category: 'Admin',
    description: 'Actualizar bot',
    admin: true,
    handler: 'maintenance'
  },

  broadcast: {
    aliases: ['bc'],
    category: 'Admin',
    description: 'Enviar mensaje masivo',
    usage: '/broadcast <mensaje>',
    admin: true,
    handler: 'broadcast'
  },

  // ===== JUEGOS Y DIVERSIÓN =====
  game: {
    aliases: ['juego'],
    category: 'Juegos',
    description: 'Juegos interactivos',
    handler: 'games'
  },

  poll: {
    aliases: ['encuesta'],
    category: 'Interactivo',
    description: 'Crear encuesta',
    usage: '/poll <pregunta> | <opción1> | <opción2>',
    handler: 'polls'
  },

  // ===== CONFIGURACIÓN =====
  settings: {
    aliases: ['config'],
    category: 'Config',
    description: 'Configuración del bot',
    handler: 'group-settings'
  }
};

// Categorías ordenadas para mostrar en el menú
export const CATEGORY_ORDER = [
  'Básicos',
  'IA',
  'Media',
  'Redes',
  'Utilidades',
  'Archivos',
  'Aportes',
  'Pedidos',
  'Subbots',
  'Juegos',
  'Interactivo',
  'Config',
  'Admin'
];

// Iconos para cada categoría
export const CATEGORY_ICONS = {
  'Básicos': '🧪',
  'IA': '🤖',
  'Media': '🎵',
  'Redes': '🌐',
  'Utilidades': '🧰',
  'Archivos': '📁',
  'Aportes': '🗂️',
  'Pedidos': '📝',
  'Subbots': '🤝',
  'Juegos': '🎮',
  'Interactivo': '🎯',
  'Config': '⚙️',
  'Admin': '👑'
};

// Función para obtener comandos visibles según permisos
export function getVisibleCommands(isAdmin = false) {
  return Object.entries(COMMAND_DEFINITIONS)
    .filter(([_, cmd]) => !cmd.admin || isAdmin)
    .reduce((acc, [name, cmd]) => {
      acc[name] = cmd;
      return acc;
    }, {});
}

// Función para generar texto de ayuda
export function generateHelpText(isAdmin = false) {
  const commands = getVisibleCommands(isAdmin);
  const commandsByCategory = {};

  // Agrupar comandos por categoría
  Object.entries(commands).forEach(([name, cmd]) => {
    const category = cmd.category || 'Otros';
    if (!commandsByCategory[category]) {
      commandsByCategory[category] = [];
    }
    commandsByCategory[category].push({ name, ...cmd });
  });

  let helpText = '┌────────────────────────────────┐\n';
  helpText += '│ 🤖  KONMI BOT — Comandos       │\n';
  helpText += '└────────────────────────────────┘\n\n';

  // Mostrar comandos por categoría
  CATEGORY_ORDER.forEach(category => {
    if (commandsByCategory[category]) {
      const icon = CATEGORY_ICONS[category] || '•';
      helpText += `${icon}  **${category}**\n`;

      commandsByCategory[category].forEach(cmd => {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        helpText += `  • \`/${cmd.name}\`${aliases} — ${cmd.description}\n`;
      });

      helpText += '\n';
    }
  });

  helpText += '💡 Tip: usa /help <comando> para ver uso y ejemplos.';
  return helpText;
}

// Función para obtener ayuda de un comando específico
export function getCommandHelp(commandName, isAdmin = false) {
  const commands = getVisibleCommands(isAdmin);

  // Buscar por nombre o alias
  const cmd = Object.entries(commands).find(([name, cmd]) =>
    name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
  );

  if (!cmd) return null;

  const [name, cmdData] = cmd;

  let helpText = '┌──────────────────────────────┐\n';
  helpText += `│ ℹ️  Ayuda: /${name.padEnd(16).slice(0,16)}│\n`;
  helpText += '└──────────────────────────────┘\n';

  if (cmdData.description) {
    helpText += `${cmdData.description}\n`;
  }

  if (cmdData.usage) {
    helpText += `\n**Uso:**\n  ${cmdData.usage}\n`;
  }

  if (cmdData.examples && cmdData.examples.length > 0) {
    helpText += `\n**Ejemplos:**\n`;
    cmdData.examples.forEach(example => {
      helpText += `  ${example}\n`;
    });
  }

  if (cmdData.aliases && cmdData.aliases.length > 0) {
    helpText += `\n**Alias:** ${cmdData.aliases.join(', ')}\n`;
  }

  if (cmdData.admin) {
    helpText += `\n⚠️ **Requiere permisos de administrador**`;
  }

  return helpText;
}

export default {
  COMMAND_DEFINITIONS,
  CATEGORY_ORDER,
  CATEGORY_ICONS,
  getVisibleCommands,
  generateHelpText,
  getCommandHelp
};
