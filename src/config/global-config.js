// ==================== CONFIGURACION GLOBAL DEL BOT ====================

// Lista de administradores globales (superadmins)
global.owner = [
  [
];

// Lista de moderadores
global.mods = [
  // Agregar números de moderadores aquí
];

// Lista de usuarios premium
global.prems = [
  // Agregar números premium aquí
];

// Configuracion del bot
global.namebot = 'KONMI BOT'
global.botname = 'KONMI BOT v2.5.0'
global.packname = 'KONMI BOT'
global.author = 'Hecho con  por Melodia'
global.moneda = 'KONMI Coins'
global.libreria = 'Baileys'
global.baileys = 'V 6.7.0'
global.vs = '2.5.0'
global.sessions = './storage/baileys_full' // Ruta centralizada de autenticacin
global.jadi = 'KONMI Bots'

// Autenticacion por defecto del bot principal en entornos no interactivos
// Valores posibles para method: 'prompt' | 'qr' | 'pairing'
// Si usas 'pairing', configura pairingNumber solo con digitos (incluye el codigo de pais)

// Configuracion de canales (opcional)
global.namecanal = 'KONMI BOT  Actualizaciones'
global.idcanal = '120363372883715167@newsletter'
global.canal = 'https://whatsapp.com/channel/0029VayXJte65yD6LQGiRB0R'

// Configuracin de canales a seguir
global.ch = {
  ch1: '120363372883715167@newsletter'
}

// Configuracin del sistema
global.multiplier = 100 // Multiplicador de experiencia
global.maxwarn = 3 // Maximo de advertencias antes del ban

// Configuracion de respuestas automaticas
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

// Funcin para verificar si un usuario es superadmin
function normalizeNumber(value) {
  if (!value) return '';
  // No cortar nmeros largos, solo eliminar caracteres no numricos
  return String(value).replace(/[^0-9]/g, '');
}

function setPrimaryOwner(number, name = 'Owner') {
  const normalized = normalizeNumber(number);
  if (!normalized) return;

  const existing = Array.isArray(global.owner) ? global.owner : [];
  const filtered = existing.filter(([num]) => normalizeNumber(num) !== normalized);
  const entry = [normalized, name || 'Owner', true];
  global.owner = [entry, ...filtered];
  console.log(` Owner principal actualizado dinmicamente a +${normalized}`);
}

function isSuperAdmin(sender) {
  if (!global.owner || !Array.isArray(global.owner)) return false;
  const senderNumber = normalizeNumber(sender);
  // Verificar si el sender es un superadmin por nmero (soporta LID y JID)
  return global.owner.some(([number]) => normalizeNumber(number) === senderNumber);
}

// Funcin para verificar si un usuario es moderador
function isModerator(sender) {
  if (!global.mods || !Array.isArray(global.mods)) return false;

  const senderNumber = normalizeNumber(sender);
  return global.mods.some((number) => normalizeNumber(number) === senderNumber);
}

// Funcin para verificar si un usuario es premium
function isPremium(sender) {
  if (!global.prems || !Array.isArray(global.prems)) return false;

  const senderNumber = normalizeNumber(sender);
  return global.prems.some((number) => normalizeNumber(number) === senderNumber);
}

// Funcin para obtener el nombre del owner por nmero
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

// Log de configuracin cargada
console.log(' Configuracin global cargada:');
console.log(` Superadmins: ${global.owner.map(([num, name]) => `${name} (${num})`).join(', ')}`);
console.log(` Moderadores: ${global.mods.length}`);
console.log(` Premium: ${global.prems.length}`);
console.log(` Bot: ${global.botname} v${global.vs}`);
