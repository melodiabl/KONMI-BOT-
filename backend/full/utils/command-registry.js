// Simple centralized command registry to drive help, hints and suggestions
// NOTE: This does not route commands; the existing switch continues to handle logic.

export const COMMANDS = [
  // Basics
  { name: '/help', aliases: ['/ayuda','/menu','/comandos'], category: 'Basicos', desc: 'Mostrar ayuda y comandos disponibles', usage: '/help [comando]', examples: ['/help', '/help play'] },
  { name: '/whoami', category: 'Basicos', desc: 'Tu ficha de usuario' },
  { name: '/status', category: 'Basicos', desc: 'Estado del bot' },
  { name: '/ping', category: 'Basicos', desc: 'Latencia' },

  // AI
  { name: '/ia', aliases: ['/ai'], category: 'IA', desc: 'Pregunta a Gemini', usage: '/ia <pregunta>' },
  { name: '/clasificar', category: 'IA', desc: 'Clasifica texto' },
  { name: '/image', category: 'IA', desc: 'Imagen por IA', usage: '/image <texto>' },

  // Media
  { name: '/play', category: 'Media', desc: 'Audio de YouTube', usage: '/play <busqueda|url>' },
  { name: '/video', aliases: ['/youtube'], category: 'Media', desc: 'Video de YouTube', usage: '/video <busqueda|url>' },
  { name: '/music', category: 'Media', desc: 'Música (YouTube)' },
  { name: '/meme', category: 'Media', desc: 'Meme aleatorio' },
  { name: '/sticker', category: 'Media', desc: 'Crea sticker' },
  { name: '/tts', category: 'Media', desc: 'Texto a voz', usage: '/tts <texto>|<voz>' },
  { name: '/wallpaper', category: 'Media', desc: 'Fondo de pantalla', usage: '/wallpaper <tema>' },
  { name: '/joke', category: 'Media', desc: 'Chiste aleatorio' },
  { name: '/quote', category: 'Media', desc: 'Frase célebre' },

  // Redes
  { name: '/tiktok', category: 'Redes', desc: 'Descargar TikTok', usage: '/tiktok <url>' },
  { name: '/instagram', category: 'Redes', desc: 'Descargar Instagram', usage: '/instagram <url>' },
  { name: '/facebook', category: 'Redes', desc: 'Descargar Facebook', usage: '/facebook <url>' },
  { name: '/twitter', aliases: ['/x'], category: 'Redes', desc: 'Descargar Twitter/X', usage: '/twitter <url>' },
  { name: '/pinterest', category: 'Redes', desc: 'Descargar Pinterest', usage: '/pinterest <url>' },

  // Utilidades
  { name: '/translate', category: 'Utilidades', desc: 'Traducir texto', usage: '/translate <texto>' },
  { name: '/weather', category: 'Utilidades', desc: 'Clima', usage: '/weather <ciudad>' },
  { name: '/fact', category: 'Utilidades', desc: 'Dato curioso' },
  { name: '/trivia', category: 'Utilidades', desc: 'Pregunta de trivia' },
  { name: '/horoscope', category: 'Utilidades', desc: 'Horóscopo', usage: '/horoscope <signo>' },

  // Archivos
  { name: '/descargar', category: 'Archivos', desc: 'Descargar por URL', usage: '/descargar <url> <nombre> <cat>' },
  { name: '/guardar', category: 'Archivos', desc: 'Guardar media (responder a archivo)' },
  { name: '/archivos', category: 'Archivos', desc: 'Ver archivos' },
  { name: '/misarchivos', category: 'Archivos', desc: 'Tus archivos' },

  // Aportes / Pedidos
  { name: '/aportes', category: 'Aportes', desc: 'Ver aportes' },
  { name: '/myaportes', category: 'Aportes', desc: 'Tus aportes' },
  { name: '/addaporte', category: 'Aportes', desc: 'Agregar aporte', usage: '/addaporte <tipo> <contenido>' },
  { name: '/aporteestado', category: 'Aportes', desc: 'Cambiar estado de aporte', usage: '/aporteestado <id> <estado>' },
  { name: '/pedido', category: 'Pedidos', desc: 'Hacer un pedido', usage: '/pedido <texto>' },
  { name: '/pedidos', category: 'Pedidos', desc: 'Ver tus pedidos' },

  // Subbots
  { name: '/qr', category: 'Subbots', desc: 'Crear subbot (QR)' },
  { name: '/code', category: 'Subbots', desc: 'Crear subbot (Pairing Code)', usage: '/code [numero]' },
  { name: '/mybots', aliases: ['/mibots'], category: 'Subbots', desc: 'Ver tus subbots' },
  { name: '/bots', category: 'Subbots', desc: 'Ver todos los subbots (admin)', admin: true },

  // Admin
  { name: '/bot', category: 'Admin', desc: 'Activar/desactivar bot', usage: '/bot on | /bot off' , admin: true},
  { name: '/bot global', category: 'Admin', desc: 'Modo global', usage: '/bot global on|off', admin: true },
  { name: '/kick', category: 'Admin', desc: 'Expulsar usuario', usage: '/kick @usuario', admin: true },
  { name: '/promote', category: 'Admin', desc: 'Promover admin', usage: '/promote @usuario', admin: true },
  { name: '/demote', category: 'Admin', desc: 'Quitar admin', usage: '/demote @usuario', admin: true },
  { name: '/lock', category: 'Admin', desc: 'Bloquear', admin: true },
  { name: '/unlock', category: 'Admin', desc: 'Desbloquear', admin: true },
  { name: '/logs', category: 'Admin', desc: 'Ver logs', admin: true },
  { name: '/stats', category: 'Admin', desc: 'Estadísticas', admin: true },
  { name: '/export', category: 'Admin', desc: 'Exportar', admin: true },
  { name: '/update', category: 'Admin', desc: 'Actualizar bot', admin: true },
];

const CATEGORY_ORDER = ['Basicos','IA','Media','Redes','Utilidades','Archivos','Aportes','Pedidos','Subbots','Admin'];

function normalize(s='') { return String(s).trim().toLowerCase(); }

export function getVisibleCommands(isAdmin=false) {
  return COMMANDS.filter(c => !c.admin || isAdmin);
}

export function getHelpText(isAdmin=false) {
  const icon = (cat) => ({
    Basicos:'🧪', IA:'🤖', Media:'🎵', Redes:'🌐', Utilidades:'🧰', Archivos:'📁', Aportes:'🗂️', Pedidos:'📝', Subbots:'🤝', Admin:'⚙️'
  }[cat] || '•');
  const cmds = getVisibleCommands(isAdmin);
  const byCat = new Map();
  for (const c of cmds) {
    const k = c.category || 'Otros';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(c);
  }
  const lines = [];
  lines.push('┌────────────────────────────────┐');
  lines.push('│ 🤖  KONMI BOT — Comandos       │');
  lines.push('└────────────────────────────────┘');
  lines.push('');
  for (const cat of CATEGORY_ORDER) {
    if (!byCat.has(cat)) continue;
    lines.push(`${icon(cat)}  ${cat}`);
    const arr = byCat.get(cat);
    for (const c of arr) {
      const alias = (c.aliases && c.aliases.length) ? ` (${c.aliases.join(', ')})` : '';
      const name = '`' + c.name + '`';
      lines.push(`  • ${name}${alias} ${c.desc ? '— '+c.desc : ''}`);
    }
    lines.push('');
  }
  lines.push('💡 Tip: usa /help <comando> para ver uso y ejemplos.');
  return lines.join('\n');
}

export function getCommandHelp(query, isAdmin=false) {
  const q = normalize(query);
  const cmds = getVisibleCommands(isAdmin);
  const found = cmds.find(c => normalize(c.name)===q || (c.aliases||[]).some(a => normalize(a)===q));
  if (!found) return null;
  const lines = [];
  lines.push('┌──────────────────────────────┐');
  lines.push(`│ ℹ️  Ayuda: ${found.name.padEnd(16).slice(0,16)}│`);
  lines.push('└──────────────────────────────┘');
  if (found.desc) lines.push(found.desc);
  if (found.usage) { lines.push('', 'Uso:', '  ' + found.usage); }
  if (found.examples && found.examples.length) {
    lines.push('', 'Ejemplos:');
    for (const ex of found.examples) lines.push('  ' + ex);
  }
  if (found.aliases && found.aliases.length) lines.push('', `Alias: ${found.aliases.join(', ')}`);
  return lines.join('\n');
}

function score(a,b){
  a=normalize(a); b=normalize(b);
  if (!a||!b) return 0;
  if (a===b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  // simple common length ratio
  let common=0; for (const ch of a){ if (b.includes(ch)) common++; }
  return common / Math.max(a.length,b.length);
}

export function getSuggestions(input, isAdmin=false, limit=3){
  const q=normalize(input); if(!q) return [];
  const cmds=getVisibleCommands(isAdmin);
  const names=cmds.flatMap(c=>[c.name,...(c.aliases||[])]);
  const scored=names.map(n=>({ n, s:score(n,q) })).sort((x,y)=>y.s-x.s);
  return scored.filter(x=>x.s>0.2).slice(0,limit).map(x=>x.n);
}

export default { COMMANDS, getVisibleCommands, getHelpText, getCommandHelp, getSuggestions };
