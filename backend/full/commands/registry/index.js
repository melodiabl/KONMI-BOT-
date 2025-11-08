// commands/registry/index.js
// Registro centralizado de comandos con categorias y alias
// Objetivo: organizar por carpeta y reducir líneas en el router

import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleFacebookDownload,
  handleTwitterDownload,
  handlePinterestDownload,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTriviaCommand,
  handleMemeCommand,
} from '../download-commands.js';

// Nota: importamos desde commands.js únicamente funciones ya exportadas ahí
import * as ai from '../ai.js';
import * as system from '../system.js';

// Dominios adicionales
import * as groupCmd from '../groups.js';
import * as groupSettings from '../group-settings.js';
import * as groupAdminX from '../group-admin-extra.js';
import * as mod from '../moderation.js';
import * as aporteCmd from '../aportes.js';
import * as pedidoCmd from '../pedidos.js';
import * as sysInfo from '../system-info.js';
import * as content from '../content.js';
import * as images from '../images.js';
import * as stickers from '../stickers.js';
import * as gextra from '../group-extra.js';
import * as pairing from '../pairing.js';
// Subbots: listas globales/personales
import * as subbots from '../subbots.js';
// Básicos de estado
// (status/ping los maneja sysInfo y util)
import * as files from '../files.js';
// Mantenimiento
import * as maintenance from '../maintenance.js';
import * as utils from '../utils.js';
import * as utilmath from '../util-math.js';
import * as admin from '../admin.js';
import * as adminMenu from '../admin-menu.js';
import * as botctl from '../bot-control.js';
import * as menu from '../menu.js';
import { getTheme } from '../../utils/theme.js';
import * as diag from '../diag.js';
import * as demo from '../demo.js';
import * as broadcast from '../broadcast.js';
import * as promo from '../promo.js';

// Estructura de entrada de registro
// key: comando (lowercase, con "/")
// value: { handler(ctx), description?, category? }

const registry = new Map();

function add(cmd, handler, meta = {}) {
  if (!cmd || typeof handler !== 'function') return;
  registry.set(cmd.toLowerCase(), { handler, ...meta });
}

// ---- Categoria: IA / Analisis ----
add('/ai', async (ctx) => ai.ai(ctx), { category: 'ai' });

add('/ia', async (ctx) => registry.get('/ai').handler(ctx), { category: 'ai' });

add('/clasificar', async (ctx) => ai.clasificar(ctx), { category: 'ai' });

add('/listclasificados', async () => ai.listClasificados(), { category: 'ai' });

// ---- Categoria: Usuarios / Cuenta ----
add('/registrar', async (ctx) => system.registrar(ctx), { category: 'user' });

add('/resetpass', async (ctx) => system.resetpass(ctx), { category: 'user' });

add('/miinfo', async (ctx) => system.miinfo(ctx), { category: 'user' });

// ---- Categoria: Grupos ----
add('/addgroup', async (ctx) => groupCmd.addGroup(ctx), { category: 'group' });
add('/delgroup', async (ctx) => groupCmd.delGroup(ctx), { category: 'group' });
add('/kick', async (ctx) => groupCmd.kick(ctx), { category: 'group' });
add('/promote', async (ctx) => groupCmd.promote(ctx), { category: 'group' });
add('/demote', async (ctx) => groupCmd.demote(ctx), { category: 'group' });
add('/lock', async (ctx) => groupCmd.lock(ctx), { category: 'group' });
add('/unlock', async (ctx) => groupCmd.unlock(ctx), { category: 'group' });
add('/tag', async (ctx) => groupCmd.tag(ctx), { category: 'group' });
add('/whoami', async (ctx) => groupCmd.whoami(ctx), { category: 'group' });
add('/debugadmin', async (ctx) => groupCmd.debugadmin(ctx), { category: 'group' });
add('/admins', async (ctx) => groupCmd.admins(ctx), { category: 'group' });
add('/debuggroup', async (ctx) => groupCmd.debuggroup(ctx), { category: 'group' });
add('/adminmenu', async (ctx) => adminMenu.adminMenu(ctx), { category: 'group' });
add('/admin', async (ctx) => adminMenu.adminMenu(ctx), { category: 'group' });
add('/tagall', async (ctx) => gextra.tagall(ctx), { category: 'group' });
add('/all', async (ctx) => gextra.tagall(ctx), { category: 'group' });
add('/groupinfo', async (ctx) => gextra.groupinfo(ctx), { category: 'group' });
add('/muteall', async (ctx) => groupAdminX.muteall(ctx), { category: 'group' });
add('/lockinfo', async (ctx) => groupAdminX.lockinfo(ctx), { category: 'group' });
add('/subject', async (ctx) => groupAdminX.subject(ctx), { category: 'group' });
add('/desc', async (ctx) => groupAdminX.desc(ctx), { category: 'group' });
add('/invite', async (ctx) => groupAdminX.invite(ctx), { category: 'group' });
add('/warn', async (ctx) => mod.warn(ctx), { category: 'group' });
add('/unwarn', async (ctx) => mod.unwarn(ctx), { category: 'group' });
add('/warns', async (ctx) => mod.warns(ctx), { category: 'group' });
// Group settings
add('/antilink', async (ctx) => groupSettings.antilink(ctx), { category: 'group' });
add('/antilinkmode', async (ctx) => groupSettings.antilinkmode(ctx), { category: 'group' });
add('/slowmode', async (ctx) => groupSettings.slowmode(ctx), { category: 'group' });
add('/antiflood', async (ctx) => groupSettings.antiflood(ctx), { category: 'group' });
add('/antifloodmode', async (ctx) => groupSettings.antifloodmode(ctx), { category: 'group' });
add('/antifloodrate', async (ctx) => groupSettings.antifloodrate(ctx), { category: 'group' });
add('/welcome', async (ctx) => groupSettings.welcome(ctx), { category: 'group' });
add('/setwelcome', async (ctx) => groupSettings.setwelcome(ctx), { category: 'group' });
add('/settings', async (ctx) => groupSettings.settings(ctx), { category: 'group' });
add('/rules', async (ctx) => groupSettings.rules(ctx), { category: 'group' });
add('/setrules', async (ctx) => groupSettings.setrules(ctx), { category: 'group' });

// ---- Categoria: Sistema / Config ----
add('/cleansession', async () => system.cleanSession(), { category: 'system' });

add('/logs', async (ctx) => system.logs(ctx), { category: 'system' });

add('/config', async (ctx) => system.config(ctx), { category: 'system' });

// ---- Categoria: Mantenimiento ----
add('/update', async (ctx) => maintenance.update(ctx), { category: 'system' });
add('/upgrade', async (ctx) => maintenance.update(ctx), { category: 'system' });
add('/actualizar', async (ctx) => maintenance.update(ctx), { category: 'system' });

// ---- Categoria: Aportes ----
add('/myaportes', async (ctx) => aporteCmd.myAportes(ctx), { category: 'aportes' });
add('/aportes', async (ctx) => aporteCmd.listAportes(ctx), { category: 'aportes' });
add('/aporteestado', async (ctx) => aporteCmd.setAporteEstado(ctx), { category: 'aportes' });
add('/addaporte', async (ctx) => aporteCmd.addAporteWithMedia(ctx), { category: 'aportes' });

// ---- Categoria: Pedidos ----
add('/pedido', async (ctx) => pedidoCmd.pedido(ctx), { category: 'pedidos' });
add('/pedidos', async (ctx) => pedidoCmd.pedidos(ctx), { category: 'pedidos' });

// ---- Categoria: Media / Descargas ----
add('/tiktok', async ({ args, usuario }) => {
  const url = (args || []).join(' ').trim();
  return await handleTikTokDownload(url, usuario);
}, { category: 'media' });
// Aliases para plataformas
add('/tt', async (ctx) => registry.get('/tiktok').handler(ctx), { category: 'media' });

add('/instagram', async ({ args, usuario }) => {
  const url = (args || []).join(' ').trim();
  return await handleInstagramDownload(url, usuario);
}, { category: 'media' });
add('/ig', async (ctx) => registry.get('/instagram').handler(ctx), { category: 'media' });

add('/facebook', async ({ args, usuario }) => {
  const url = (args || []).join(' ').trim();
  return await handleFacebookDownload(url, usuario);
}, { category: 'media' });
add('/fb', async (ctx) => registry.get('/facebook').handler(ctx), { category: 'media' });

add('/twitter', async ({ args, usuario }) => {
  const url = (args || []).join(' ').trim();
  return await handleTwitterDownload(url, usuario);
}, { category: 'media' });
add('/x', async (ctx) => registry.get('/twitter').handler(ctx), { category: 'media' });

add('/pinterest', async ({ args, usuario }) => {
  const url = (args || []).join(' ').trim();
  return await handlePinterestDownload(url, usuario);
}, { category: 'media' });

// Utilidades
add('/translate', async ({ args, usuario }) => {
  const text = (args || []).slice(0, -1).join(' ').trim();
  const target = (args || []).slice(-1)[0] || 'es';
  return await handleTranslate(text, target, usuario);
}, { category: 'utils' });

add('/weather', async ({ args, usuario }) => {
  const city = (args || []).join(' ').trim();
  return await handleWeather(city, usuario);
}, { category: 'utils' });
add('/clima', async (ctx) => registry.get('/weather').handler(ctx), { category: 'utils' });
// Imágenes AI y QR de texto
add('/image', async (ctx) => images.imageFromPrompt(ctx), { category: 'utils' });
add('/imagen', async (ctx) => images.imageFromPrompt(ctx), { category: 'utils' });
// Eliminado: /qrtexto — se mantiene solo el QR de subbots (/qr)
add('/brat', async (ctx) => images.brat(ctx), { category: 'utils' });
add('/bratvd', async (ctx) => images.bratvd(ctx), { category: 'utils' });

add('/quote', async ({ usuario }) => handleQuote(usuario), { category: 'fun' });
add('/frase', async (ctx) => registry.get('/quote').handler(ctx), { category: 'fun' });
add('/fact', async ({ usuario }) => handleFact(usuario), { category: 'fun' });
add('/trivia', async ({ usuario }) => handleTriviaCommand(usuario), { category: 'fun' });
add('/meme', async ({ usuario }) => handleMemeCommand(usuario), { category: 'fun' });

// ---- Categoria: Estado / Info ----
add('/status', async () => sysInfo.status(), { category: 'info' });
add('/serverinfo', async () => sysInfo.serverInfo(), { category: 'info' });
add('/hardware', async () => sysInfo.hardware(), { category: 'info' });
add('/runtime', async () => sysInfo.runtime(), { category: 'info' });
add('/info', async () => sysInfo.status(), { category: 'info' });
// ---- Pairing / QR Subbots y Main ----
add('/qr', async (ctx) => pairing.qr(ctx), { category: 'pairing' });
add('/code', async (ctx) => pairing.code(ctx), { category: 'pairing' });
// ---- Categoria: Biblioteca (Manhwas/Series) ----
add('/manhwas', async () => content.listManhwas(), { category: 'library' });
add('/addmanhwa', async (ctx) => content.addManhwa(ctx), { category: 'library' });
add('/series', async () => content.listSeries(), { category: 'library' });
add('/addserie', async (ctx) => content.addSerie(ctx), { category: 'library' });
// ---- Categoria: Aportes filtrados ----
add('/extra', async () => content.listExtra(), { category: 'aportes' });
add('/ilustraciones', async () => content.listIlustraciones(), { category: 'aportes' });
add('/obtenerextra', async (ctx) => content.obtenerExtra(ctx), { category: 'aportes' });
add('/obtenerilustracion', async (ctx) => content.obtenerIlustracion(ctx), { category: 'aportes' });
add('/obtenerpack', async (ctx) => content.obtenerPack(ctx), { category: 'aportes' });
add('/obtenermanhwa', async ({ args, usuario, remoteJid }) => handleObtenerManhwa((args||[]).join(' ').trim(), usuario, remoteJid), { category: 'library' });
// ---- Categoria: Descargas unificadas ----
import { handleMusicDownload, handleVideoDownload, handleSpotifySearch } from '../download-commands.js';
add('/video', async ({ args, usuario }) => handleVideoDownload((args||[]).join(' ').trim(), usuario), { category: 'media' });
add('/music', async ({ args, usuario }) => handleMusicDownload((args||[]).join(' ').trim(), usuario), { category: 'media' });
add('/musica', async (ctx) => registry.get('/music').handler(ctx), { category: 'media' });
add('/youtube', async (ctx) => registry.get('/video').handler(ctx), { category: 'media' });
add('/spotify', async ({ args, usuario }) => handleSpotifySearch((args||[]).join(' ').trim(), usuario), { category: 'media' });
add('/spot', async (ctx) => registry.get('/spotify').handler(ctx), { category: 'media' });
add('/download', async (ctx) => registry.get('/video').handler(ctx), { category: 'media' });
add('/dl', async (ctx) => registry.get('/video').handler(ctx), { category: 'media' });
add('/descargar', async (ctx) => registry.get('/video').handler(ctx), { category: 'media' });
add('/tiktok', async ({ args, usuario }) => handleTikTokDownload((args||[]).join(' ').trim(), usuario), { category: 'media' });
add('/tiktoksearch', async ({ args, usuario }) => {
  const q = (args||[]).join(' ').trim()
  if (!q) return { success:false, message:'❌ Uso: /tiktoksearch <texto o URL>\n\nPega un enlace de TikTok o usa /video <consulta> para buscar en YouTube.' }
  if (/tiktok\.com/i.test(q)) return handleTikTokDownload(q, usuario)
  return { success:false, message:'🔎 Aún no tengo buscador de TikTok por texto.\n\nPega un enlace de TikTok (usa /tiktok <url>) o usa /video <consulta> para buscar en YouTube.' }
}, { category: 'media' });
// Aliases/populares
add('/play', async (ctx) => registry.get('/music').handler(ctx), { category: 'media' });
add('/pin', async (ctx) => registry.get('/pinterest').handler(ctx), { category: 'media' });
// Legados normalizados
add('/codigo', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
add('/code_legacy', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
add('/paircode', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
// Eliminado alias legacy: /qr_legacy

// ---- Categoria: Básicos ----
// Unificar /menu con /help para que muestren el mismo listado/categorías
add('/menu', async (ctx) => registry.get('/help').handler(ctx), { category: 'info' });
add('/poll', async (ctx) => demo.poll(ctx), { category: 'demo' });
add('/location', async (ctx) => demo.location(ctx), { category: 'demo' });
add('/contact', async (ctx) => demo.contact(ctx), { category: 'demo' });
add('/buttons', async (ctx) => demo.buttons(ctx), { category: 'demo' });
add('/listdemo', async (ctx) => demo.listdemo(ctx), { category: 'demo' });
add('/live', async (ctx) => demo.live(ctx), { category: 'demo' });
add('/react', async (ctx) => demo.react(ctx), { category: 'demo' });
add('/edit', async (ctx) => demo.edit(ctx), { category: 'demo' });
add('/delete', async (ctx) => demo.del(ctx), { category: 'demo' });
add('/presence', async (ctx) => demo.presence(ctx), { category: 'demo' });
add('/ping', async () => ({ success:true, message:'🏓 Pong' }), { category: 'info' });
add('/status', async () => sysInfo.status(), { category: 'info' });
add('/test', async ({ usuario }) => ({ success: true, message: `✅ Bot funcionando\n\n👤 ${usuario}\n🕒 ${new Date().toLocaleString('es-ES')}` }), { category: 'info' });
add('/whoami', async (ctx) => groupCmd.whoami(ctx), { category: 'info' });
add('/mynumber', async (ctx) => registry.get('/whoami').handler(ctx), { category: 'info' });
add('/bot', async (ctx) => botctl.bot(ctx), { category: 'group' });
add('/broadcast', async (ctx) => broadcast.broadcast(ctx), { category: 'system' });
add('/promo', async (ctx) => promo.promo(ctx), { category: 'utils' });

// ---- Categoria: Archivos/Descargas (file manager) ----
add('/guardar', async (ctx) => files.guardar(ctx), { category: 'files' });
add('/save', async (ctx) => registry.get('/guardar').handler(ctx), { category: 'files' });
add('/archivos', async (ctx) => files.archivos(ctx), { category: 'files' });
add('/misarchivos', async (ctx) => files.misArchivos(ctx), { category: 'files' });
add('/myfiles', async (ctx) => registry.get('/misarchivos').handler(ctx), { category: 'files' });
add('/files', async (ctx) => registry.get('/archivos').handler(ctx), { category: 'files' });
add('/buscararchivo', async (ctx) => files.buscarArchivo(ctx), { category: 'files' });
add('/findfile', async (ctx) => registry.get('/buscararchivo').handler(ctx), { category: 'files' });
add('/estadisticas', async () => files.estadisticas(), { category: 'files' });
add('/stats', async () => files.stats(), { category: 'files' });

// ---- Categoria: Utilidades ----
add('/short', async ({ args, usuario }) => utils.shortUrl((args||[]).join(' ').trim(), usuario), { category: 'utils' });
add('/acortar', async (ctx) => registry.get('/short').handler(ctx), { category: 'utils' });
// Fun: definir /joke primero y mapear /chiste como alias para evitar undefined
add('/joke', async ({ usuario }) => handleFact(usuario), { category: 'fun' });
add('/chiste', async (ctx) => registry.get('/joke').handler(ctx), { category: 'fun' });
add('/dato', async (ctx) => registry.get('/fact').handler(ctx), { category: 'fun' });
add('/tts', async (ctx) => utils.tts(ctx), { category: 'utils' });
add('/calc', async (ctx) => utilmath.calc(ctx), { category: 'utils' });
add('/stickerurl', async (ctx) => stickers.stickerurl(ctx), { category: 'utils' });
add('/toimg', async (ctx) => stickers.toimg(ctx), { category: 'utils' });
add('/sticker', async (ctx) => stickers.sticker(ctx), { category: 'utils' });

// ---- Categoria: Votaciones ----
import * as votes from '../votes.js';
add('/crearvotacion', async (ctx) => votes.crear(ctx), { category: 'group' });
add('/votar', async (ctx) => votes.votar(ctx), { category: 'group' });
add('/cerrarvotacion', async (ctx) => votes.cerrar(ctx), { category: 'group' });

// ---- Categoria: Admin/Owner ----
add('/owner', async (ctx) => admin.ownerInfo(ctx), { category: 'system' });
add('/checkowner', async (ctx) => admin.checkOwner(ctx), { category: 'system' });
add('/setowner', async (ctx) => admin.setOwner(ctx), { category: 'system' });
add('/debugme', async (ctx) => admin.debugMe(ctx), { category: 'system' });
add('/debugfull', async (ctx) => admin.debugFull(ctx), { category: 'system' });
add('/testadmin', async (ctx) => admin.testAdmin(ctx), { category: 'system' });
add('/debugbot', async (ctx) => admin.debugBot(ctx), { category: 'system' });

import { promotionalLinks } from '../../config/links.js';
import * as logsCmd from '../logs.js';
add('/logfind', async (ctx) => logsCmd.find(ctx), { category: 'system' });
add('/topcmd', async (ctx) => logsCmd.topcmd(ctx), { category: 'system' });

// ---- Ayuda dinámica con categorías ----
async function buildHelp(ctx) {
  const th = getTheme();
  const byCat = {};
  for (const [cmd, meta] of registry.entries()) {
    const cat = (meta.category || 'otros').toLowerCase();
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(cmd);
  }

  const categories = ['ai','group','aportes','pedidos','library','media','utils','fun','pairing','system','info','user','otros'];

  // Si viene categoría específica: /help <cat>
  const selected = (ctx?.args && ctx.args[0]) ? String(ctx.args[0]).toLowerCase().trim() : null;
  if (selected && byCat[selected]) {
    const cmds = byCat[selected].slice().sort();
    const text = `${th.accent} Comandos de ${selected}\n\n${cmds.map(c=>`${th.bullet} ${c}`).join('\n') || 'Sin comandos en esta categoría'}`;
    return [
      { success: true, message: `${th.header('KONMI BOT')}\n${text}\n${th.footer()}`, quoted: true },
      { type: 'buttons', text: '¿Volver al menú?', footer: 'KONMI BOT', buttons: [ { text: '⬅️ Volver', command: '/help' }, { text: '🧪 SelfTest', command: '/selftest' } ], quoted: true }
    ];
  }

  const sections = [
    {
      title: `${th.accent} Categorías disponibles`,
      rows: categories.map(cat => ({ title: cat, description: `${(byCat[cat] || []).length} comando(s)`, id: `/help ${cat}` }))
    },
    {
      title: 'Comunidades / Enlaces',
      rows: promotionalLinks.map(link => ({ title: link.text, description: link.url, id: `url|${link.url}` }))
    }
  ];

  return { type: 'list', text: `${th.accent} ${th.strings.helpTitle}`, buttonText: `${th.accent} ${th.strings.viewOptions}`, sections, quoted: true };
}add('/help', async (ctx) => buildHelp(ctx), { category: 'info' });

add('/ayuda', async (ctx) => registry.get('/help').handler(ctx), { category: 'info' });
add('/comandos', async (ctx) => registry.get('/help').handler(ctx), { category: 'info' });

export function getCommandRegistry() {
  return registry;
}

// ---- Categoria: Subbots (listas) ----
// Owner: lista todos los subbots
add('/bots', async (ctx) => subbots.all(ctx), { category: 'pairing' });
// Usuario: lista sus propios subbots (alias mybots/mibots)
add('/mybots', async (ctx) => subbots.mine(ctx), { category: 'pairing' });
add('/mibots', async (ctx) => subbots.mine(ctx), { category: 'pairing' });




add('/selftest', async (ctx) => diag.selftest(ctx), { category: 'system' });
add('/diag', async (ctx) => diag.selftest(ctx), { category: 'system' });
add('/diagnostico', async (ctx) => diag.selftest(ctx), { category: 'system' });


