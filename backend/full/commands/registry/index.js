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
import * as aporteCmd from '../aportes.js';
import * as pedidoCmd from '../pedidos.js';
import * as sysInfo from '../system-info.js';
import * as content from '../content.js';
import * as images from '../images.js';
import * as pairing from '../pairing.js';
// Subbots: listas globales/personales
import * as subbots from '../subbots.js';
// Básicos de estado
// (status/ping los maneja sysInfo y util)
import * as files from '../files.js';
// Mantenimiento
import * as maintenance from '../maintenance.js';
import * as utils from '../utils.js';
import * as admin from '../admin.js';
import * as adminMenu from '../admin-menu.js';
import * as botctl from '../bot-control.js';
import * as menu from '../menu.js';
import * as demo from '../demo.js';

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
add('/adminmenu', async (ctx) => adminMenu.adminMenu(ctx), { category: 'group' });
add('/admin', async (ctx) => adminMenu.adminMenu(ctx), { category: 'group' });

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
// Aliases/populares
add('/play', async (ctx) => registry.get('/music').handler(ctx), { category: 'media' });
add('/pin', async (ctx) => registry.get('/pinterest').handler(ctx), { category: 'media' });
// Legados normalizados
add('/codigo', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
add('/code_legacy', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
add('/paircode', async (ctx) => registry.get('/code').handler(ctx), { category: 'pairing' });
// Eliminado alias legacy: /qr_legacy

// ---- Categoria: Básicos ----
add('/menu', async (ctx) => menu.menu(ctx), { category: 'basic' });
add('/help', async (ctx) => menu.help(ctx), { category: 'basic' });
add('/poll', async (ctx) => demo.poll(ctx), { category: 'demo' });
add('/location', async (ctx) => demo.location(ctx), { category: 'demo' });
add('/contact', async (ctx) => demo.contact(ctx), { category: 'demo' });
add('/buttons', async (ctx) => demo.buttons(ctx), { category: 'demo' });
add('/listdemo', async (ctx) => demo.listdemo(ctx), { category: 'demo' });
add('/ping', async () => ({ success:true, message:'🏓 Pong' }), { category: 'info' });
add('/status', async () => sysInfo.status(), { category: 'info' });
add('/test', async ({ usuario }) => ({ success: true, message: `✅ Bot funcionando\n\n👤 ${usuario}\n🕒 ${new Date().toLocaleString('es-ES')}` }), { category: 'info' });
add('/whoami', async (ctx) => groupCmd.whoami(ctx), { category: 'info' });
add('/mynumber', async (ctx) => registry.get('/whoami').handler(ctx), { category: 'info' });
add('/bot', async (ctx) => botctl.bot(ctx), { category: 'group' });

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
add('/chiste', async (ctx) => registry.get('/joke').handler(ctx), { category: 'fun' });
add('/dato', async (ctx) => registry.get('/fact').handler(ctx), { category: 'fun' });
add('/tts', async (ctx) => utils.tts(ctx), { category: 'utils' });

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

import { promotionalLinks } from '../../config/links.js';

// ---- Ayuda dinámica construida desde el registro ----
async function buildHelp(ctx) {
  const byCat = {};
  for (const [cmd, meta] of registry.entries()) {
    const cat = (meta.category || 'otros').toLowerCase();
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(cmd);
  }

  const categories = ['ai', 'group', 'aportes', 'pedidos', 'library', 'media', 'utils', 'fun', 'pairing', 'system', 'info', 'user', 'otros'];
  
  const categoryButtons = categories.map(cat => ({
    buttonId: `help_category_${cat}`,
    buttonText: { displayText: cat },
    type: 1,
  }));

  const linkButtons = promotionalLinks.map(link => ({
    buttonId: `url|${link.url}`,
    buttonText: { displayText: link.text },
    type: 1,
  }));

  const buttons = [...linkButtons, ...categoryButtons];

  const buttonMessage = {
    text: '¡Hola! Soy KONMI-BOT, tu asistente personal. Elige una categoría para ver los comandos o únete a nuestras comunidades.',
    footer: 'Selecciona una opción',
    buttons: buttons,
    headerType: 1,
  };

  await ctx.sock.sendMessage(ctx.remoteJid, buttonMessage);
}

add('/help', async (ctx) => {
  await buildHelp(ctx);
  return { handled: true };
}, { category: 'info' });

add('/ayuda', async (ctx) => registry.get('/help').handler(ctx), { category: 'info' });
add('/menu', async (ctx) => registry.get('/help').handler(ctx), { category: 'info' });
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
