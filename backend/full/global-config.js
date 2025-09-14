// ==================== CONFIGURACIÓN GLOBAL DEL BOT ====================

import config from './config.js';

// Lista de administradores globales (superadmins)
// Se toma el número principal desde las variables de entorno
// Formato: [numero, nombre, esSuperAdmin]
const ownerNumber = config.owner.whatsapp;
if (!ownerNumber) {
  console.warn('OWNER_WHATSAPP_NUMBER no está definido; la lista de administradores globales está vacía');
}
global.owner = ownerNumber ? [[ownerNumber, 'Owner', true]] : [];

// Lista de moderadores (pueden usar comandos de moderación)
global.mods = [
  // Agregar números de moderadores aquí
]

// Lista de usuarios premium
global.prems = [
  // Agregar números de usuarios premium aquí
]

// Configuración del bot
global.namebot = 'KONMI BOT'
global.botname = 'KONMI BOT v2.5.0'
global.packname = 'KONMI BOT'
global.author = 'Hecho con ❤️ por Melodía'
global.moneda = 'KONMI Coins'
global.libreria = 'Baileys'
global.baileys = 'V 6.7.0'
global.vs = '2.5.0'
global.sessions = 'KONMI Bot'
global.jadi = 'KONMI Bots'

// Configuración de canales (opcional)
global.namecanal = 'KONMI BOT • Actualizaciones'
global.idcanal = '120363372883715167@newsletter'
global.canal = 'https://whatsapp.com/channel/0029VayXJte65yD6LQGiRB0R'

// Configuración de canales a seguir
global.ch = {
  ch1: '120363372883715167@newsletter'
}

// Configuración del sistema
global.multiplier = 100 // Multiplicador de experiencia
global.maxwarn = 3 // Máximo de advertencias antes del ban

// Configuración de subbots
global.yukiJadibts = true // Habilitar sistema de subbots

// Configuración de respuestas automáticas
global.rcanal = {
  contextInfo: {
    externalAdReply: {
      title: global.namebot,
      body: 'Bot de WhatsApp',
      thumbnailUrl: global.banner || '',
      sourceUrl: global.canal || '',
      mediaType: 1,
      renderLargerThumbnail: true
    }
  }
}

// Función para verificar si un usuario es superadmin
function isSuperAdmin(sender) {
  if (!global.owner || !Array.isArray(global.owner)) return false;
  
  const senderNumber = sender.replace(/[^0-9]/g, '');
  return global.owner.some(([number]) => {
    const ownerNumber = number.replace(/[^0-9]/g, '');
    return ownerNumber === senderNumber;
  });
}

// Función para verificar si un usuario es moderador
function isModerator(sender) {
  if (!global.mods || !Array.isArray(global.mods)) return false;
  
  const senderNumber = sender.replace(/[^0-9]/g, '');
  return global.mods.some((number) => {
    const modNumber = number.replace(/[^0-9]/g, '');
    return modNumber === senderNumber;
  });
}

// Función para verificar si un usuario es premium
function isPremium(sender) {
  if (!global.prems || !Array.isArray(global.prems)) return false;
  
  const senderNumber = sender.replace(/[^0-9]/g, '');
  return global.prems.some((number) => {
    const premNumber = number.replace(/[^0-9]/g, '');
    return premNumber === senderNumber;
  });
}

// Función para obtener el nombre del owner por número
function getOwnerName(sender) {
  if (!global.owner || !Array.isArray(global.owner)) return 'Owner Desconocido';
  
  const senderNumber = sender.replace(/[^0-9]/g, '');
  const ownerData = global.owner.find(([number]) => {
    const ownerNumber = number.replace(/[^0-9]/g, '');
    return ownerNumber === senderNumber;
  });
  
  return ownerData ? ownerData[1] : 'Owner Desconocido';
}

// Exportar funciones
export {
  isSuperAdmin,
  isModerator,
  isPremium,
  getOwnerName
};

// Log de configuración cargada
console.log('🔧 Configuración global cargada:');
console.log(`👑 Superadmins: ${global.owner.map(([num, name]) => `${name} (${num})`).join(', ')}`);
console.log(`🛡️ Moderadores: ${global.mods.length}`);
console.log(`💎 Premium: ${global.prems.length}`);
console.log(`🤖 Bot: ${global.botname} v${global.vs}`);
