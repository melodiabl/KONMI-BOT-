// ==================== CONFIGURACIÓN GLOBAL DEL BOT ====================

// Lista de administradores globales (superadmins)
// Formato: [numero, nombre, esSuperAdmin]
global.owner = [
  ['595974154768', 'Melodia', true], // Número principal del bot
  // Agregar más administradores aquí si es necesario
]

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

// Autenticación por defecto del bot principal en entornos no interactivos
// Valores posibles para method: 'prompt' | 'qr' | 'pairing'
// Si usas 'pairing', configura pairingNumber solo con dígitos (incluye el código de país)

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
function normalizeNumber(value) {
  if (!value) return '';
  return String(value).split(':')[0].replace(/[^0-9]/g, '');
}

function setPrimaryOwner(number, name = 'Owner') {
  const normalized = normalizeNumber(number);
  if (!normalized) return;

  const existing = Array.isArray(global.owner) ? global.owner : [];
  const filtered = existing.filter(([num]) => normalizeNumber(num) !== normalized);
  const entry = [normalized, name || 'Owner', true];
  global.owner = [entry, ...filtered];
  console.log(`👑 Owner principal actualizado dinámicamente a +${normalized}`);
}

function isSuperAdmin(sender) {
  if (!global.owner || !Array.isArray(global.owner)) return false;

  const senderNumber = normalizeNumber(sender);
  return global.owner.some(([number]) => normalizeNumber(number) === senderNumber);
}

// Función para verificar si un usuario es moderador
function isModerator(sender) {
  if (!global.mods || !Array.isArray(global.mods)) return false;

  const senderNumber = normalizeNumber(sender);
  return global.mods.some((number) => normalizeNumber(number) === senderNumber);
}

// Función para verificar si un usuario es premium
function isPremium(sender) {
  if (!global.prems || !Array.isArray(global.prems)) return false;

  const senderNumber = normalizeNumber(sender);
  return global.prems.some((number) => normalizeNumber(number) === senderNumber);
}

// Función para obtener el nombre del owner por número
function getOwnerName(sender) {
  if (!global.owner || !Array.isArray(global.owner)) return 'Owner Desconocido';

  const senderNumber = normalizeNumber(sender);
  const ownerData = global.owner.find(([number]) => normalizeNumber(number) === senderNumber);

  return ownerData ? ownerData[1] : 'Owner Desconocido';
}

function getAuthDefaults() {
  const defaults = global.authDefaults || {};
  return {
    method: typeof defaults.method === 'string' ? defaults.method : 'prompt',
    pairingNumber: defaults.pairingNumber ? String(defaults.pairingNumber).replace(/[^0-9]/g, '') : null
  };
}

// Exportar funciones
export {
  isSuperAdmin,
  isModerator,
  isPremium,
  getOwnerName,
  getAuthDefaults,
  setPrimaryOwner
};

// Log de configuración cargada
console.log('🔧 Configuración global cargada:');
console.log(`👑 Superadmins: ${global.owner.map(([num, name]) => `${name} (${num})`).join(', ')}`);
console.log(`🛡️ Moderadores: ${global.mods.length}`);
console.log(`💎 Premium: ${global.prems.length}`);
console.log(`🤖 Bot: ${global.botname} v${global.vs}`);
