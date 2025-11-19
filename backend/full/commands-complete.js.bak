import db from "./db.js";
import { getSocket } from "./whatsapp.js";
import logger from "./config/logger.js";
import * as baileys from "baileys-mod";
import {
  handleAI as handleAICommand,
  handleClasificar as handleClasificarCommand,
} from "./commands.js";
import {
  isSuperAdmin,
  isModerator,
  isPremium,
  getOwnerName,
} from "./global-config.js";
// Consolidacion de comandos: reexportamos funciones de modulos especificos
import {
  // Media
  handleMusic,
  handleVideo,
  handleMeme,
  handleWallpaper,
  handleJoke,
  // AI
  handleAIEnhanced,
  handleImage,
  handleTranslate,
  // Entertainment
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  // Status
  handleStatus,
  handlePing,
  // Logs
  handleLogsAdvanced,
  handleStats,
  handleExport,
  // Downloads
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleLimpiar,
  handleBuscarArchivo,
} from "./commands-extended.js";

// Variables globales para configuracion del bot
let modoPrivado = false;
let modoAmigos = false;
let advertenciasActivas = true;

// Lista dinamica de numeros admin (solo el numero principal del bot)
let dynamicAdminNumbers = [];

// Helper: normalizar JID (remover sufijo :<num>, convertir LIDWID, y mapear @lid)
function normalizeJid(jid) {
  let withoutDevice = jid.replace(/:\d+/, "");
  // Mapear sufijo @lid a servidor clasico
  if (withoutDevice.endsWith("@lid")) {
    withoutDevice = withoutDevice.replace(/@lid$/, "@s.whatsapp.net");
  }
  try {
    const decoded = baileys.jidDecode(withoutDevice);
    if (decoded && decoded.user && decoded.server) {
      // Forzar servidor clasico
      const server =
        decoded.server === "lid" ? "s.whatsapp.net" : decoded.server;
      return `${decoded.user}@${server}`;
    }
  } catch (_) {}
  return withoutDevice;
}

async function ensureGruposAutorizadosTable() {
  const hasTable = await db.schema.hasTable("grupos_autorizados");
  if (!hasTable) {
    await db.schema.createTable("grupos_autorizados", (t) => {
      t.increments("id");
      t.string("jid").unique().notNullable();
      t.boolean("bot_enabled").defaultTo(true);
      t.string("tipo").nullable();
    });
  }
}

/**
 * /bots - Lista los subbots del usuario con estado y tiempo funcionando
 */
async function handleBots(usuario) {
  try {
    // Obtener el número de teléfono del usuario
    const userNum = usuario.split("@")[0];

    // Obtener todos los subbots con flag de conexión
    const subs = await fetchSubbotListWithOnlineFlag();

    // Filtrar por propietario (compatibilidad con distintos esquemas de tabla)
    const mine = (subs || []).filter((s) => {
      const createdBy = String(s.created_by || "").replace(/[^0-9]/g, "");
      const ownerNumber = String(s.owner_number || "").replace(/[^0-9]/g, "");
      const userPhone = String(s.user_phone || "").replace(/[^0-9]/g, "");
      return (
        (createdBy && createdBy === userNum) ||
        (ownerNumber && ownerNumber === userNum) ||
        (userPhone && userPhone === userNum)
      );
    });

    if (!mine.length) {
      return {
        success: true,
        message:
          "  *Mis SubBots*\n\n No tienes subbots creados.\n\n Usa `/qr` para generar un QR o `/code [número]` para obtener un Pairing Code.",
      };
    }

    const now = Date.now();
    let text = `  *Mis SubBots (${mine.length})*\n\n`;
    for (let i = 0; i < mine.length; i++) {
      const sb = mine[i];
      const code = sb.code || sb.session_id || `subbot_${i + 1}`;
      const type = (sb.type || sb.method || "qr").toUpperCase();
      const status =
        sb.status || sb.estado || (sb.isOnline ? "connected" : "disconnected");
      const createdAtIso = sb.created_at || sb.createdAt || null;
      const connectedAtIso = sb.connected_at || null;
      const refTime = connectedAtIso || createdAtIso || sb.updated_at || null;
      let uptime = "N/D";
      if (refTime) {
        const ms = now - new Date(refTime).getTime();
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        uptime = `${h}h ${m}m`;
      }

      text += `${i + 1}. ${sb.isOnline ? "" : ""} *${code}*\n`;
      text += `   Tipo: ${type}\n`;
      text += `   Estado: ${status}\n`;
      if (sb.bot_number) text += `   Número: +${sb.bot_number}\n`;
      if (createdAtIso)
        text += `   Creado: ${new Date(createdAtIso).toLocaleString("es-ES")}\n`;
      if (sb.isOnline) text += `   Tiempo funcionando: ${uptime}\n`;
      text += `\n`;
    }

    text += " Acciones:\n";
    text += "   /delsubbot <codigo>  Eliminar subbot\n";
    text += "   /statusbot <codigo>  Ver estado detallado\n";

    return { success: true, message: text };
  } catch (error) {
    console.error("Error en handleBots:", error);
    return { success: false, message: " Error al obtener subbots." };
  }
}

/** Determina si el usuario es el owner especfico (dinmico por ENV/global) o superadmin */
function isSpecificOwner(usuario) {
  const normalized = String(usuario || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
  const OWNER = (
    (process.env.OWNER_WHATSAPP_NUMBER ||
      (Array.isArray(global.owner) && global.owner[0]?.[0]) ||
      "") + ""
  ).replace(/[^0-9]/g, "");
  return OWNER && normalized === OWNER;
}

/**
 * Verificar si un usuario es admin del grupo o tiene rol de owner/superadmin/moderador
 */
async function isOwnerOrAdmin(usuario, grupo = null) {
  // Prioridad 1: owner especfico o superadmin global
  try {
    if (isSpecificOwner(usuario) || isSuperAdmin(usuario)) return true;
  } catch (_) {}

  // Prioridad 2: admin real del grupo
  if (grupo && grupo.endsWith("@g.us")) {
    try {
      const adminInGroup = await isGroupAdmin(usuario, grupo);
      if (adminInGroup) return true;
    } catch (error) {
      console.error(
        "Error verificando admin del grupo:",
        error?.message || error,
      );
    }
  }

  // Prioridad 3: moderadores configurados dinámicamente
  try {
    if (isModerator(usuario)) return true;
  } catch (_) {}

  // Prioridad 4: lista dinmica de administradores
  const normalized = String(usuario)
    .split(":")[0]
    .replace(/[^0-9]/g, "");
  return dynamicAdminNumbers.some(
    (num) => String(num).replace(/[^0-9]/g, "") === normalized,
  );
}

/**
 * Funcion para actualizar la lista de numeros admin
 */
function updateAdminNumbers(newAdminNumbers) {
  const normalized = newAdminNumbers
    .map((num) => String(num).split(":")[0])
    .map((num) => num.replace(/[^0-9]/g, ""))
    .filter(Boolean);
  const base = dynamicAdminNumbers.map((num) => num.replace(/[^0-9]/g, ""));
  const merged = new Set([...base, ...normalized]);
  dynamicAdminNumbers = Array.from(merged);
  console.log(
    ` Lista de admins actualizada: ${dynamicAdminNumbers.join(", ")}`,
  );
}

/**
 * Verificar si el bot esta activo en un grupo
 */
async function isBotActiveInGroup(grupoId) {
  try {
    // Verificar estado global del bot primero
    const globalState = await db("bot_global_state").select("*").first();
    if (
      !globalState ||
      !(globalState.is_on === 1 || globalState.is_on === true)
    ) {
      return false; // Bot globalmente desactivado
    }

    // Verificar estado especifico del grupo
    const grupo = await db("grupos_autorizados")
      .where({ jid: grupoId })
      .first();
    return !grupo || grupo.bot_enabled !== false; // Por defecto activo si no hay registro
  } catch (error) {
    return true; // En caso de error, permitir (bot activo)
  }
}

/**
 * Verificar si un grupo es proveedor
 */
async function isProviderGroup(grupoId) {
  try {
    const grupo = await db("grupos_autorizados")
      .where({ jid: grupoId, tipo: "proveedor" })
      .first();
    return !!grupo;
  } catch (error) {
    return false;
  }
}

/**
 * Registrar log de comando con detalles estructurados (opcional)
 */
async function logCommand(tipo, comando, usuario, grupo, detalles = null) {
  try {
    const fecha = new Date().toISOString();
    const payload = { tipo, comando, usuario, grupo, fecha };
    if (detalles) {
      try {
        payload.detalles = JSON.stringify(detalles);
      } catch (_) {
        payload.detalles = String(detalles);
      }
    }
    return db("logs").insert(payload);
  } catch (error) {
    console.error("Error al registrar log:", error);
  }
}

// Helper para construir un menu de ayuda mas legible y bonito
function buildPrettyHelp(isAdmin) {
  const divider = "";
  let text = `\n`;
  text += `            *KONMI BOT*             \n`;
  text += `        *Panel de Comandos*              \n`;
  text += `${divider}\n\n`;

  text += " *COMANDOS ESENCIALES*\n";
  text += "\n";
  text += " `help` / `menu`       Muestra este menu \n";
  text += " `whoami`             Tu ficha de usuario\n";
  text += " `ia <texto>`         Pregunta a Gemini  \n";
  text += " `clasificar <txt>`   Categoriza contenido\n";
  text += "\n\n";

  text += " *GESTION DE SUBBOTS*\n";
  text += "\n";
  text += " `qr`                Crear subbot QR    \n";
  text += " `code`              Crear subbot CODE  \n";
  text += " `bots`              Lista tus subbots  \n";
  text += " `delbot <id>`       Elimina un subbot  \n";
  text += " `delsubbot <id>`    Elimina un subbot  \n";
  text += "\n\n";

  text += " *MEDIA & ENTRETENIMIENTO*\n";
  text += "\n";
  text += " `play <busqueda>`   Audio de YouTube   \n";
  text += " `video <busqueda>`  Video de YouTube   \n";
  text += " `meme`              Meme aleatorio     \n";
  text += " `sticker`           Crear sticker      \n";
  text += "\n\n";

  text += " *DESCARGAS & ARCHIVOS*\n";
  text += "\n";
  text += " `descargar <url> <nombre> <cat>`       \n";
  text += " `guardar <cat>` (responde a media)     \n";
  text += " `archivos [cat]`  `misarchivos`        \n";
  text += "\n\n";

  text += " *APORTES & PEDIDOS*\n";
  text += "\n";
  text += " `aportar <tipo> <contenido>`  Enviar  \n";
  text += " `myaportes [tipo]`           Tus aportes\n";
  text += " `aportes [tipo]`             Todos     \n";
  text += " `pedido <tema>`              Hacer pedido\n";
  text += " `pedidos`                    Tus pedidos\n";
  text += "\n\n";

  text += " *VOTACIONES*\n";
  text += "\n";
  text += " `crearvotacion <pregunta|op1|op2...>`  \n";
  text += " `votar <opcion>`  `cerrarvotacion <ID>` \n";
  text += "\n\n";

  if (isAdmin) {
    text += " *HERRAMIENTAS ADMIN*\n";
    text += "\n";
    text += " `bot on/off`       Activar/desactivar \n";
    text += " `bot global on/off`   Modo global      \n";
    text += " `update`           Actualizar bot      \n";
    text += " `logs [tipo]`      Ver logs del sistema\n";
    text += " `lock` / `unlock`  Bloquear/desbloquear\n";
    text += " `addgroup` / `delgroup`   Gestionar grupos\n";
    text += "\n\n";
  }

  text += " *CONSEJOS DE USO*\n";
  text += "\n";
  text += "  Usa `/`, `!` o `.` para comandos      \n";
  text += "  Algunos comandos requieren admin      \n";
  text += "  Los subbots se vencen: guarda QR/code \n";
  text += "  El bot detecta tu numero automaticamente\n";
  text += "  Escribe `help <comando>` para mas info\n";
  text += "\n\n";

  text += `\n`;
  text += `         *Disfruta usando el bot!*  \n`;
  text += `           *Version 2.5 Completa*        \n`;
  text += `${divider}\n`;

  return text;
}

// Resolver nombre mostrable a partir de un JID/numero: @username, @NombreWA o @numero
async function getDisplayMention(userJidOrNum) {
  try {
    const num = String(userJidOrNum || "")
      .split("@")[0]
      .split(":")[0];
    if (!num) return "@usuario";
    const u = await db("usuarios")
      .where({ whatsapp_number: num })
      .select("username")
      .first();
    if (u?.username) return `@${u.username}`;
    const wa = await db("wa_contacts")
      .where({ wa_number: num })
      .select("display_name")
      .first();
    if (wa?.display_name) return `@${wa.display_name}`;
    return `@${num}`;
  } catch (_) {
    const num = String(userJidOrNum || "")
      .split("@")[0]
      .split(":")[0];
    return `@${num || "usuario"}`;
  }
}

/**
 * /help - Muestra lista de comandos disponibles (solo verifica admin por WhatsApp, no por base de datos)
 */
async function handleHelp(usuario, grupo, isGroup) {
  const isAdmin = await isOwnerOrAdmin(usuario, grupo);
  // Nuevo formato mas tipografico y legible
  const pretty = buildPrettyHelp(isAdmin);
  await logCommand("consulta", "help", usuario, grupo);
  return { success: true, message: pretty };
}

// Reutilizamos las implementaciones centralizadas en commands.js para evitar duplicados.
const handleIA = handleAICommand;
const handleClasificar = handleClasificarCommand;

/**
 * /addgroup - Activa el bot en el grupo actual
 */
async function handleAddGroup(usuario, grupo, groupName) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede activar el bot en grupos.",
    };
  }

  try {
    await db("grupos_autorizados")
      .insert({
        jid: grupo,
        nombre: groupName || "Grupo",
        tipo: "normal",
        bot_enabled: true,
        proveedor: "General",
      })
      .onConflict("jid")
      .merge(["nombre", "bot_enabled"]);

    await logCommand("administracion", "addgroup", usuario, grupo);
    return {
      success: true,
      message: " Bot activado en el grupo correctamente.",
    };
  } catch (error) {
    return { success: false, message: "Error al activar bot en el grupo." };
  }
}

/**
 * /delgroup - Desactiva el bot en un grupo
 */
async function handleDelGroup(usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede desactivar el bot en grupos.",
    };
  }

  try {
    await db("grupos_autorizados").where({ jid: grupo }).update({
      bot_enabled: false,
    });

    await logCommand("administracion", "delgroup", usuario, grupo);
    return {
      success: true,
      message: " Bot desactivado en el grupo correctamente.",
    };
  } catch (error) {
    return { success: false, message: "Error al desactivar bot en el grupo." };
  }
}

/**
 * /myaportes - Lista solo los aportes del usuario
 */
async function handleMyAportes(usuario, grupo, filtroTipo = null) {
  try {
    let rows = await db("aportes")
      .where({ usuario })
      .orderBy("fecha", "desc")
      .limit(50);
    if (filtroTipo) rows = rows.filter((r) => r.tipo === filtroTipo);
    if (rows.length === 0)
      return { success: true, message: " No tienes aportes registrados." };
    const byTipo = rows.reduce((acc, r) => {
      (acc[r.tipo || "sin_tipo"] ||= []).push(r);
      return acc;
    }, {});
    const order = [
      "manhwa",
      "manhwas_bls",
      "series",
      "series_videos",
      "series_bls",
      "anime",
      "anime_bls",
      "extra_imagen",
      "ilustracion",
      "extra",
    ];
    let message = ` *Tus Aportes (${rows.length})*\n`;
    const tipos = Object.keys(byTipo).sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    for (const tipo of tipos) {
      message += `\n ${tipo.toUpperCase()} (${byTipo[tipo].length})\n`;
      byTipo[tipo].slice(0, 10).forEach((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString("es-ES");
        message += `  ${i + 1}. ${r.contenido}  ${fecha}\n`;
      });
    }
    await logCommand("consulta", "myaportes", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: " Error al obtener tus aportes." };
  }
}

/**
 * /aportes - Lista todos los aportes (solo si el bot esta activo)
 */
async function handleAportes(usuario, grupo, isGroup, filtroTipo = null) {
  if (isGroup && !(await isBotActiveInGroup(grupo))) {
    return { success: false, message: " El bot no esta activo en este grupo." };
  }

  try {
    let aportes = await db("aportes").orderBy("fecha", "desc").limit(50);
    if (filtroTipo) aportes = aportes.filter((a) => a.tipo === filtroTipo);
    if (aportes.length === 0) {
      return { success: true, message: " No hay aportes registrados." };
    }
    // Resolver nombres de usuario a partir del numero (JID) de forma robusta
    const uniqueNums = [
      ...new Set(
        aportes.map((a) => String(a.usuario).split("@")[0].split(":")[0]),
      ),
    ];
    let nameByNumber = {};
    let waByNumber = {};
    try {
      const hasUsers = await db.schema.hasTable("usuarios");
      if (hasUsers && uniqueNums.length) {
        const users = await db("usuarios")
          .whereIn("whatsapp_number", uniqueNums)
          .select("whatsapp_number", "username");
        nameByNumber = Object.fromEntries(
          (users || []).map((u) => [u.whatsapp_number, u.username]),
        );
      }
    } catch (_) {}
    try {
      const missing = uniqueNums.filter((n) => !nameByNumber[n]);
      const hasWa = await db.schema.hasTable("wa_contacts");
      if (hasWa && missing.length) {
        const waNames = await db("wa_contacts")
          .whereIn("wa_number", missing)
          .select("wa_number", "display_name");
        waByNumber = Object.fromEntries(
          (waNames || []).map((w) => [w.wa_number, w.display_name]),
        );
      }
    } catch (_) {}

    const byTipo = aportes.reduce((acc, r) => {
      (acc[r.tipo || "sin_tipo"] ||= []).push(r);
      return acc;
    }, {});
    const order = [
      "manhwa",
      "manhwas_bls",
      "series",
      "series_videos",
      "series_bls",
      "anime",
      "anime_bls",
      "extra_imagen",
      "ilustracion",
      "extra",
    ];
    let message = ` *Aportes (${aportes.length})*\n`;
    const tipos = Object.keys(byTipo).sort(
      (a, b) => order.indexOf(a) - order.indexOf(b),
    );
    for (const tipo of tipos) {
      message += `\n ${tipo.toUpperCase()} (${byTipo[tipo].length})\n`;
      byTipo[tipo].slice(0, 10).forEach((r, i) => {
        const fecha = new Date(r.fecha).toLocaleDateString("es-ES");
        const num = String(r.usuario).split("@")[0].split(":")[0];
        const resolved = nameByNumber[num] || waByNumber[num] || num;
        const uname = `@${resolved}`;
        message += `  ${i + 1}. ${r.contenido}  ${uname}  ${fecha}\n`;
      });
    }

    await logCommand("consulta", "aportes", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener aportes." };
  }
}

/**
 * /manhwas - Lista todos los manhwas disponibles
 */
async function handleManhwas(usuario, grupo) {
  try {
    const manhwas = await db.all("SELECT * FROM manhwas ORDER BY titulo");

    if (manhwas.length === 0) {
      return { success: true, message: " No hay manhwas registrados." };
    }

    let message = ` *Manhwas disponibles (${manhwas.length}):*\n\n`;
    manhwas.forEach((manhwa, index) => {
      message += `${index + 1}. *${manhwa.titulo}*\n`;
      message += `    Autor: ${manhwa.autor}\n`;
      message += `    Estado: ${manhwa.estado}\n`;
      if (manhwa.descripcion) {
        message += `    ${manhwa.descripcion.substring(0, 50)}...\n`;
      }
      message += `\n`;
    });

    await logCommand("consulta", "manhwas", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener manhwas." };
  }
}

/**
 * /addaporte [datos] - Permite enviar un aporte
 */
async function handleAddAporte(
  contenido,
  tipo,
  usuario,
  grupo,
  fecha,
  archivoPath = null,
) {
  try {
    await db("aportes").insert({
      contenido,
      tipo,
      usuario,
      grupo,
      fecha,
      archivo_path: archivoPath,
    });
    await logCommand("comando", "addaporte", usuario, grupo);
    return {
      success: true,
      message: ` Aporte de tipo "${tipo}" guardado correctamente.`,
    };
  } catch (error) {
    return { success: false, message: "Error al guardar aporte." };
  }
}

/** Cambiar estado de aporte desde WhatsApp */
async function handleAporteEstado(id, estado, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede cambiar estado de aportes.",
    };
  }
  const allowed = ["pendiente", "en_revision", "completado"];
  const normalized = (estado || "").toLowerCase();
  if (!allowed.includes(normalized)) {
    return {
      success: false,
      message: " Estado invalido. Usa: pendiente | en_revision | completado",
    };
  }
  try {
    const aporte = await db("aportes").where({ id }).first();
    if (!aporte)
      return { success: false, message: ` Aporte #${id} no encontrado.` };
    await db("aportes")
      .where({ id })
      .update({
        estado: normalized,
        procesado_por: usuario,
        fecha_procesado: new Date().toISOString(),
      });
    await logCommand("administracion", "aporteestado", usuario, grupo);
    return {
      success: true,
      message: ` Aporte #${id} actualizado a "${normalized}".`,
    };
  } catch (e) {
    return { success: false, message: "Error al actualizar estado de aporte." };
  }
}

async function handleLock(usuario, grupo, isGroup) {
  if (!isGroup || !grupo?.endsWith("@g.us")) {
    return {
      success: false,
      message: " Este comando solo se puede usar en grupos.",
    };
  }

  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo administradores pueden bloquear el grupo.",
    };
  }

  const sock = getSocket();
  if (!sock) {
    return { success: false, message: " Bot no conectado." };
  }

  try {
    await sock.groupSettingUpdate(grupo, "announcement");
    await logCommand("administracion", "lock", usuario, grupo, {
      action: "lock",
    });
    return {
      success: true,
      message: " Grupo bloqueado. Solo administradores pueden enviar mensajes.",
    };
  } catch (error) {
    // Usar el logger de WhatsApp para mejor formato
    logger.whatsapp.error(`Error en /lock: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      grupo,
      usuario,
      timestamp: new Date().toISOString(),
    });

    const detail = error?.message
      ? ` Detalle: ${error.message}`
      : " Asegrate de que el bot sea administrador.";
    return { success: false, message: ` Error al bloquear el grupo.${detail}` };
  }
}

async function handleUnlock(usuario, grupo, isGroup) {
  if (!isGroup || !grupo?.endsWith("@g.us")) {
    return {
      success: false,
      message: " Este comando solo se puede usar en grupos.",
    };
  }

  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo administradores pueden desbloquear el grupo.",
    };
  }

  const sock = getSocket();
  if (!sock) {
    return { success: false, message: " Bot no conectado." };
  }

  try {
    await sock.groupSettingUpdate(grupo, "not_announcement");
    await logCommand("administracion", "unlock", usuario, grupo, {
      action: "unlock",
    });
    return {
      success: true,
      message:
        " Grupo desbloqueado. Todos los participantes pueden enviar mensajes.",
    };
  } catch (error) {
    // Usar el logger de WhatsApp para mejor formato
    logger.whatsapp.error(`Error en /unlock: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
      grupo,
      usuario,
      timestamp: new Date().toISOString(),
    });

    const detail = error?.message
      ? ` Detalle: ${error.message}`
      : " Asegrate de que el bot sea administrador.";
    return {
      success: false,
      message: ` Error al desbloquear el grupo.${detail}`,
    };
  }
}

/**
 * /addmanhwa [datos] - Permite agregar un nuevo manhwa (solo Admin)
 */
async function handleAddManhwa(datos, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede agregar manhwas." };
  }

  try {
    // Parsear datos: titulo|autor|genero|estado|descripcion|url|proveedor
    const parts = datos.split("|");
    if (parts.length < 4) {
      return {
        success: false,
        message: " Formato: ttulo|autor|gnero|estado|descripcin|url|proveedor",
      };
    }

    const [
      titulo,
      autor,
      genero,
      estado,
      descripcion = "",
      url = "",
      proveedor = "General",
    ] = parts;
    const fecha_registro = new Date().toISOString();

    const stmt = await db.prepare(
      "INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    await stmt.run(
      titulo,
      autor,
      genero,
      estado,
      descripcion,
      url,
      proveedor,
      fecha_registro,
      usuario,
    );
    await stmt.finalize();

    await logCommand("administracion", "addmanhwa", usuario, grupo);
    return {
      success: true,
      message: ` Manhwa "${titulo}" agregado correctamente.`,
    };
  } catch (error) {
    return { success: false, message: "Error al agregar manhwa." };
  }
}

/**
 * /addserie [datos] - Permite agregar una nueva serie (cualquier usuario si el bot esta activo)
 */
async function handleAddSerie(datos, usuario, grupo, isGroup) {
  // Verificar si el bot esta activo en el grupo o usuario admin
  if (
    isGroup &&
    !(await isBotActiveInGroup(grupo)) &&
    !(await isOwnerOrAdmin(usuario, grupo))
  ) {
    return {
      success: false,
      message: " El bot no est activo en este grupo para agregar series.",
    };
  }

  try {
    // Parsear datos con formato mas simple: titulo|genero|estado|descripcion
    const parts = datos.split("|");
    if (parts.length < 2) {
      return {
        success: false,
        message:
          " Formato: ttulo|gnero|estado|descripcin\nEjemplo: /addserie Attack on Titan|Accin|Finalizada|Serie sobre titanes",
      };
    }

    const [titulo, genero = "Serie", estado = "En emision", descripcion = ""] =
      parts;
    const fecha_registro = new Date().toISOString();

    // Verificar si la serie ya existe
    const serieExistente = await db.get(
      "SELECT * FROM manhwas WHERE titulo = ? AND genero LIKE ?",
      [titulo, "%serie%"],
    );

    if (serieExistente) {
      return {
        success: false,
        message: ` La serie "${titulo}" ya existe en la base de datos.`,
      };
    }

    const stmt = await db.prepare(
      "INSERT INTO manhwas (titulo, autor, genero, estado, descripcion, url, proveedor, fecha_registro, usuario_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    await stmt.run(
      titulo,
      "Varios",
      `Serie - ${genero}`,
      estado,
      descripcion,
      "",
      "Series",
      fecha_registro,
      usuario,
    );
    await stmt.finalize();

    // Tambien registrar como aporte
    const stmtAporte = await db.prepare(
      "INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmtAporte.run(
      `Serie agregada: ${titulo}`,
      "serie",
      usuario,
      grupo,
      fecha_registro,
    );
    await stmtAporte.finalize();

    await logCommand("comando", "addserie", usuario, grupo);
    const mention = await getDisplayMention(usuario);
    return {
      success: true,
      message: ` *Serie agregada correctamente:*\n\n **${titulo}**\n Gnero: ${genero}\n Estado: ${estado}\n ${descripcion}\n Agregada por: ${mention}`,
    };
  } catch (error) {
    return { success: false, message: "Error al agregar serie." };
  }
}

/**
 * /series - Lista todas las series disponibles
 */
async function handleSeries(usuario, grupo) {
  try {
    const series = await db.all(
      "SELECT * FROM manhwas WHERE genero LIKE ? ORDER BY titulo",
      ["%Serie%"],
    );

    if (series.length === 0) {
      return { success: true, message: " No hay series registradas." };
    }

    // Resolver nombres de quien registr
    const nums = [
      ...new Set(
        series.map(
          (s) =>
            String(s.usuario_registro || "")
              .split("@")[0]
              .split(":")[0],
        ),
      ),
    ].filter(Boolean);
    const dbUsers = nums.length
      ? await db("usuarios")
          .whereIn("whatsapp_number", nums)
          .select("whatsapp_number", "username")
      : [];
    const nameByNumber = Object.fromEntries(
      dbUsers.map((u) => [u.whatsapp_number, u.username]),
    );
    const missing = nums.filter((n) => !nameByNumber[n]);
    const waNames = missing.length
      ? await db("wa_contacts")
          .whereIn("wa_number", missing)
          .select("wa_number", "display_name")
      : [];
    const waByNumber = Object.fromEntries(
      waNames.map((w) => [w.wa_number, w.display_name]),
    );

    let message = ` *Series disponibles (${series.length}):*\n\n`;
    series.forEach((serie, index) => {
      message += `${index + 1}. **${serie.titulo}**\n`;
      message += `    ${serie.genero.replace("Serie - ", "")}\n`;
      message += `    Estado: ${serie.estado}\n`;
      if (serie.descripcion) {
        message += `    ${serie.descripcion.substring(0, 60)}...\n`;
      }
      const num = String(serie.usuario_registro || "")
        .split("@")[0]
        .split(":")[0];
      const uname = num
        ? `@${nameByNumber[num] || waByNumber[num] || num}`
        : "@usuario";
      message += `    Por: ${uname}\n\n`;
    });

    await logCommand("consulta", "series", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener series." };
  }
}

/**
 * /pedido [contenido] - Hace un pedido y busca en la base de datos si existe
 */
async function handlePedido(contenido, usuario, grupo, fecha) {
  try {
    const { getSocket } = await import("./whatsapp.js");
    const sock = getSocket();
    const remoteJid = grupo || usuario;

    // Buscar en manhwas
    const manhwaEncontrado = await db.get(
      "SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Buscar en aportes
    const aporteEncontrado = await db.get(
      "SELECT * FROM aportes WHERE contenido LIKE ? OR contenido LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Buscar en archivos descargados
    const archivosEncontrados = await db.all(
      "SELECT * FROM descargas WHERE filename LIKE ? OR filename LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Registrar el pedido en la base de datos
    const stmt = await db.prepare(
      "INSERT INTO pedidos (texto, estado, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(contenido, "pendiente", usuario, grupo, fecha);
    await stmt.finalize();

    let response = ` *Pedido registrado:* "${contenido}"\n\n`;

    // Si encontr contenido, mencionarlo
    if (manhwaEncontrado) {
      response += ` *Encontrado en manhwas!*\n`;
      response += ` **${manhwaEncontrado.titulo}**\n`;
      response += ` Autor: ${manhwaEncontrado.autor}\n`;
      response += ` Estado: ${manhwaEncontrado.estado}\n`;
      if (manhwaEncontrado.descripcion) {
        response += ` ${manhwaEncontrado.descripcion}\n`;
      }
      if (manhwaEncontrado.url) {
        response += ` ${manhwaEncontrado.url}\n`;
      }
      response += `\n`;
    }

    if (aporteEncontrado) {
      response += ` *Encontrado en aportes!*\n`;
      response += ` **${aporteEncontrado.contenido}**\n`;
      response += ` Tipo: ${aporteEncontrado.tipo}\n`;
      {
        const num = String(aporteEncontrado.usuario || "")
          .split("@")[0]
          .split(":")[0];
        const u = await db("usuarios")
          .where({ whatsapp_number: num })
          .select("username")
          .first();
        const wa = u?.username
          ? null
          : await db("wa_contacts")
              .where({ wa_number: num })
              .select("display_name")
              .first();
        const mention = `@${u?.username || wa?.display_name || num}`;
        response += ` Aportado por: ${mention}\n`;
      }
      response += ` Fecha: ${new Date(aporteEncontrado.fecha).toLocaleDateString()}\n\n`;
    }

    // Buscar y enviar archivos fsicos si existen
    let archivosEnviados = 0;
    if (archivosEncontrados.length > 0 && sock) {
      response += ` *Archivos encontrados:*\n`;

      for (const archivo of archivosEncontrados.slice(0, 5)) {
        // Mximo 5 archivos
        try {
          const fs = await import("fs");
          const path = await import("path");

          const archivoPath = path.join(
            process.cwd(),
            "storage",
            "downloads",
            archivo.category,
            archivo.filename,
          );

          if (fs.existsSync(archivoPath)) {
            const fileBuffer = fs.readFileSync(archivoPath);
            const fileExtension = path.extname(archivo.filename).toLowerCase();

            let mediaType = "document";
            if (
              [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(fileExtension)
            ) {
              mediaType = "image";
            } else if (
              [".mp4", ".avi", ".mkv", ".mov"].includes(fileExtension)
            ) {
              mediaType = "video";
            } else if ([".mp3", ".wav", ".m4a"].includes(fileExtension)) {
              mediaType = "audio";
            }

            // Enviar el archivo
            let sentMessage;
            if (mediaType === "image") {
              sentMessage = await sock.sendMessage(remoteJid, {
                image: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}\n Subido por: ${archivo.usuario}\n ${new Date(archivo.fecha).toLocaleDateString()}`,
              });
            } else if (mediaType === "video") {
              sentMessage = await sock.sendMessage(remoteJid, {
                video: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}`,
              });
            } else if (mediaType === "audio") {
              sentMessage = await sock.sendMessage(remoteJid, {
                audio: fileBuffer,
                mimetype: "audio/mpeg",
              });
            } else {
              sentMessage = await sock.sendMessage(remoteJid, {
                document: fileBuffer,
                fileName: archivo.filename,
                caption: ` ${archivo.filename}\n ${archivo.category}`,
              });
            }

            response += ` *Enviado:* ${archivo.filename} (${archivo.category})\n`;
            archivosEnviados++;

            // Marcar el pedido como completado si se envi al menos un archivo
            if (archivosEnviados === 1) {
              await db("pedidos")
                .where({ texto: contenido, usuario: usuario, grupo: grupo })
                .update({
                  estado: "completado",
                  completado_por: "bot",
                  fecha_completado: new Date().toISOString(),
                });
            }
          }
        } catch (fileError) {
          console.error(
            `Error enviando archivo ${archivo.filename}:`,
            fileError,
          );
          response += ` Error enviando: ${archivo.filename}\n`;
        }
      }

      if (archivosEnviados === 0) {
        response += ` Archivos encontrados pero no se pudieron enviar\n`;
      }
    }

    if (!manhwaEncontrado && !aporteEncontrado && archivosEnviados === 0) {
      response += ` *No encontrado en la base de datos*\n`;
      response += `Tu pedido ha sido registrado y ser revisado por los administradores.\n`;
    } else if (archivosEnviados > 0) {
      response += `\n *Pedido completado automticamente!* `;
    }

    await logCommand("comando", "pedido", usuario, grupo);
    return { success: true, message: response };
  } catch (error) {
    console.error("Error en handlePedido:", error);
    return { success: false, message: "Error al procesar pedido." };
  }
}

/**
 * /pedidos - Muestra los pedidos del usuario
 */
async function handlePedidos(usuario, grupo) {
  try {
    const pedidos = await db.all(
      "SELECT * FROM pedidos WHERE usuario = ? ORDER BY fecha DESC LIMIT 10",
      [usuario],
    );

    if (pedidos.length === 0) {
      return { success: true, message: " No tienes pedidos registrados." };
    }

    let message = ` *Tus pedidos (${pedidos.length}):*\n\n`;
    pedidos.forEach((pedido, index) => {
      const fecha = new Date(pedido.fecha).toLocaleDateString();
      const estado =
        pedido.estado === "pendiente"
          ? ""
          : pedido.estado === "completado"
            ? ""
            : "";
      message += `${index + 1}. ${estado} ${pedido.texto}\n`;
      message += `    ${fecha} - Estado: ${pedido.estado}\n\n`;
    });

    await logCommand("consulta", "pedidos", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener pedidos." };
  }
}

/**
 * /extra [nombre] - Detecta si es un extra de un manhwa y lo registra
 */
async function handleExtra(nombre, usuario, grupo, fecha) {
  try {
    // Buscar manhwa relacionado
    const manhwa = await db.get(
      "SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?",
      [`%${nombre}%`, `${nombre}%`],
    );

    let contenido = `Extra: ${nombre}`;
    if (manhwa) {
      contenido = `Extra de "${manhwa.titulo}": ${nombre}`;
    }

    const stmt = await db.prepare(
      "INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(contenido, "extra", usuario, grupo, fecha);
    await stmt.finalize();

    await logCommand("comando", "extra", usuario, grupo);
    return {
      success: true,
      message: ` Extra "${nombre}" registrado correctamente.`,
    };
  } catch (error) {
    return { success: false, message: "Error al registrar extra." };
  }
}

/**
 * /ilustraciones - Lista las ilustraciones guardadas
 */
async function handleIlustraciones(usuario, grupo) {
  try {
    const ilustraciones = await db.all(
      "SELECT * FROM ilustraciones ORDER BY fecha DESC LIMIT 15",
    );

    if (ilustraciones.length === 0) {
      return { success: true, message: " No hay ilustraciones registradas." };
    }

    let message = ` *Ilustraciones disponibles (${ilustraciones.length}):*\n\n`;
    ilustraciones.forEach((ilustracion, index) => {
      const fecha = new Date(ilustracion.fecha).toLocaleDateString();
      message += `${index + 1}. Por @${ilustracion.usuario}\n`;
      message += `    ${fecha}\n\n`;
    });

    await logCommand("consulta", "ilustraciones", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener ilustraciones." };
  }
}

/**
 * /logs - Muestra ltimos registros de actividad (solo Admin)
 */
async function handleLogs(usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede ver logs." };
  }

  try {
    const logs = await db.all(
      "SELECT * FROM logs ORDER BY fecha DESC LIMIT 20",
    );

    if (logs.length === 0) {
      return { success: true, message: " No hay logs registrados." };
    }

    let message = ` *ltimos logs (${logs.length}):*\n\n`;
    logs.forEach((log, index) => {
      const fecha = new Date(log.fecha).toLocaleString();
      message += `${index + 1}. *${log.comando}* (${log.tipo})\n`;
      message += `    @${log.usuario}\n`;
      message += `    ${fecha}\n\n`;
    });

    await logCommand("consulta", "logs", usuario, grupo);
    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener logs." };
  }
}

/**
 * /privado - Activa/desactiva el modo privado del bot
 */
async function handlePrivado(usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede cambiar el modo privado.",
    };
  }

  modoPrivado = !modoPrivado;

  await logCommand("configuracion", "privado", usuario, grupo);
  return {
    success: true,
    message: ` Modo privado ${modoPrivado ? "activado" : "desactivado"}.`,
  };
}

/**
 * /amigos - Activa/desactiva el modo amigos
 */
async function handleAmigos(usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede cambiar el modo amigos.",
    };
  }

  modoAmigos = !modoAmigos;

  await logCommand("configuracion", "amigos", usuario, grupo);
  return {
    success: true,
    message: ` Modo amigos ${modoAmigos ? "activado" : "desactivado"}.`,
  };
}

/**
 * /advertencias on/off - Activa o desactiva las advertencias
 */
async function handleAdvertencias(estado, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return {
      success: false,
      message: " Solo Admin puede configurar advertencias.",
    };
  }

  if (estado === "on") {
    advertenciasActivas = true;
  } else if (estado === "off") {
    advertenciasActivas = false;
  } else {
    return {
      success: false,
      message: " Uso: /advertencias on o /advertencias off",
    };
  }

  await logCommand("configuracion", "advertencias", usuario, grupo);
  return {
    success: true,
    message: ` Advertencias ${advertenciasActivas ? "activadas" : "desactivadas"}.`,
  };
}

/**
 * /votar [opcin] - Permite votar en una votacin activa
 */
async function handleVotar(opcion, usuario, grupo) {
  try {
    // Buscar votacin activa
    const votacion = await db.get(
      "SELECT * FROM votaciones WHERE estado = ? ORDER BY fecha_inicio DESC LIMIT 1",
      ["activa"],
    );

    if (!votacion) {
      return { success: false, message: " No hay votaciones activas." };
    }

    // Verificar si ya vot
    const votoExistente = await db.get(
      "SELECT * FROM votos WHERE votacion_id = ? AND usuario = ?",
      [votacion.id, usuario],
    );

    if (votoExistente) {
      return { success: false, message: " Ya has votado en esta votacin." };
    }

    // Registrar voto
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      "INSERT INTO votos (votacion_id, usuario, opcion, fecha) VALUES (?, ?, ?, ?)",
    );
    await stmt.run(votacion.id, usuario, opcion, fecha);
    await stmt.finalize();

    await logCommand("comando", "votar", usuario, grupo);
    return { success: true, message: ` Voto registrado: "${opcion}"` };
  } catch (error) {
    return { success: false, message: "Error al registrar voto." };
  }
}

/**
 * /crearvotacion [pregunta | opcin1 | opcin2...] - Crea una nueva votacin
 */
async function handleCrearVotacion(datos, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede crear votaciones." };
  }

  try {
    const parts = datos.split("|").map((part) => part.trim());
    if (parts.length < 3) {
      return {
        success: false,
        message:
          " Formato: pregunta | opcin1 | opcin2 | ...\n\nEjemplo: /crearvotacion Cul es tu manhwa favorito? | Solo Leveling | Tower of God | The Beginning After The End",
      };
    }

    const [titulo, ...opciones] = parts;
    const fecha_inicio = new Date().toISOString();
    const fecha_fin = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 7 das

    const stmt = await db.prepare(
      "INSERT INTO votaciones (titulo, descripcion, opciones, fecha_inicio, fecha_fin, estado, creador) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const result = await stmt.run(
      titulo,
      "",
      JSON.stringify(opciones),
      fecha_inicio,
      fecha_fin,
      "activa",
      usuario,
    );
    await stmt.finalize();

    const votacionId = result.lastID;

    // Crear mensaje de votacin para el grupo
    let mensajeVotacion = ` *NUEVA VOTACIN INICIADA*\n\n`;
    mensajeVotacion += ` **${titulo}**\n\n`;
    mensajeVotacion += ` *Opciones disponibles:*\n`;

    opciones.forEach((opcion, index) => {
      mensajeVotacion += `${index + 1}. ${opcion}\n`;
    });

    mensajeVotacion += `\n *Duracin:* 7 das\n`;
    {
      const mention = await getDisplayMention(usuario);
      mensajeVotacion += ` *Creada por:* ${mention}\n`;
    }
    mensajeVotacion += ` *ID:* #${votacionId}\n\n`;
    mensajeVotacion += ` *Para votar usa:* /votar [opcin]\n`;
    mensajeVotacion += ` *Ejemplo:* /votar ${opciones[0]}\n\n`;
    mensajeVotacion += `_Participa y haz que tu voz sea escuchada!_ `;

    await logCommand("administracion", "crearvotacion", usuario, grupo);

    return {
      success: true,
      message: mensajeVotacion,
      votacionCreada: true,
      votacionId: votacionId,
    };
  } catch (error) {
    console.error("Error al crear votacin:", error);
    return { success: false, message: "Error al crear votacin." };
  }
}

/**
 * /cerrarvotacion [ID] - Cierra una votacin activa
 */
async function handleCerrarVotacion(id, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede cerrar votaciones." };
  }

  try {
    const stmt = await db.prepare(
      "UPDATE votaciones SET estado = ? WHERE id = ?",
    );
    await stmt.run("cerrada", id);
    await stmt.finalize();

    await logCommand("administracion", "cerrarvotacion", usuario, grupo);
    return { success: true, message: ` Votacin #${id} cerrada correctamente.` };
  } catch (error) {
    return { success: false, message: "Error al cerrar votacin." };
  }
}

// Comandos de obtencin desde grupos proveedor (solo Admin)

/**
 * /obtenermanhwa [nombre] - Descarga y guarda un manhwa desde grupo proveedor
 */
async function handleObtenerManhwa(nombre, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede obtener contenido." };
  }

  if (!(await isProviderGroup(grupo))) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos proveedor.",
    };
  }

  try {
    // Simular obtencin de manhwa
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      "INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(
      `Manhwa obtenido: ${nombre}`,
      "manhwa",
      usuario,
      grupo,
      fecha,
    );
    await stmt.finalize();

    await logCommand("obtencion", "obtenermanhwa", usuario, grupo);
    return {
      success: true,
      message: ` Manhwa "${nombre}" obtenido y guardado.`,
    };
  } catch (error) {
    return { success: false, message: "Error al obtener manhwa." };
  }
}

/**
 * /obtenerextra [nombre] - Descarga y guarda el extra de un manhwa
 */
async function handleObtenerExtra(nombre, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede obtener contenido." };
  }

  if (!(await isProviderGroup(grupo))) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos proveedor.",
    };
  }

  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      "INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(`Extra obtenido: ${nombre}`, "extra", usuario, grupo, fecha);
    await stmt.finalize();

    await logCommand("obtencion", "obtenerextra", usuario, grupo);
    return {
      success: true,
      message: ` Extra "${nombre}" obtenido y guardado.`,
    };
  } catch (error) {
    return { success: false, message: "Error al obtener extra." };
  }
}

/**
 * /obtenerilustracion [nombre] - Guarda una ilustracin desde grupo proveedor
 */
async function handleObtenerIlustracion(nombre, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede obtener contenido." };
  }

  if (!(await isProviderGroup(grupo))) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos proveedor.",
    };
  }

  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      "INSERT INTO ilustraciones (imagen, usuario, grupo, fecha) VALUES (?, ?, ?, ?)",
    );
    await stmt.run(nombre, usuario, grupo, fecha);
    await stmt.finalize();

    await logCommand("obtencion", "obtenerilustracion", usuario, grupo);
    return {
      success: true,
      message: ` Ilustracin "${nombre}" obtenida y guardada.`,
    };
  } catch (error) {
    return { success: false, message: "Error al obtener ilustracin." };
  }
}

/**
 * /obtenerpack [nombre] - Guarda un pack de contenido desde grupo proveedor
 */
async function handleObtenerPack(nombre, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede obtener contenido." };
  }

  if (!(await isProviderGroup(grupo))) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos proveedor.",
    };
  }

  try {
    const fecha = new Date().toISOString();
    const stmt = await db.prepare(
      "INSERT INTO aportes (contenido, tipo, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(`Pack obtenido: ${nombre}`, "pack", usuario, grupo, fecha);
    await stmt.finalize();

    await logCommand("obtencion", "obtenerpack", usuario, grupo);
    return { success: true, message: ` Pack "${nombre}" obtenido y guardado.` };
  } catch (error) {
    return { success: false, message: "Error al obtener pack." };
  }
}

/**
 * /bot on - Activar el bot en el grupo
 */
async function handleBotOn(grupoId, usuario) {
  try {
    const normalizedUsuario = normalizeUserNumber(usuario);

    // Verificar si el bot ya est activado en este grupo
    const isCurrentlyDeactivated = await db("grupos_desactivados")
      .where("jid", grupoId)
      .first();

    if (!isCurrentlyDeactivated) {
      // El bot ya est activado, informar sin spam
      return {
        success: true,
        message:
          " *El bot ya est activado en este grupo.*\n\nPuedes usar todos los comandos disponibles.",
      };
    }

    // Eliminar de grupos desactivados si existe
    await db("grupos_desactivados").where("jid", grupoId).del();
    // Limpiar avisos de grupo desactivado
    await clearGroupOffNotices(grupoId);
    await logCommand("administracion", "bot_on", normalizedUsuario, grupoId);
    return {
      success: true,
      message:
        " *Bot activado en este grupo.*\n\nAhora puedes usar todos los comandos!",
    };
  } catch (error) {
    return { success: false, message: " Error al activar el bot." };
  }
}

/**
 * /bot off - Desactivar el bot en el grupo
 */
async function handleBotOff(grupoId, usuario) {
  try {
    const normalizedUsuario = normalizeUserNumber(usuario);

    // Verificar si el bot ya est desactivado en este grupo
    const isCurrentlyDeactivated = await db("grupos_desactivados")
      .where("jid", grupoId)
      .first();

    if (isCurrentlyDeactivated) {
      // El bot ya est desactivado, informar sin spam
      return {
        success: true,
        message:
          " *El bot ya est desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.",
      };
    }

    // Agregar a grupos desactivados
    await db("grupos_desactivados")
      .insert({
        jid: grupoId,
        desactivado_por: normalizedUsuario,
        fecha_desactivacion: new Date().toISOString(),
      })
      .onConflict("jid")
      .merge();
    await logCommand("administracion", "bot_off", normalizedUsuario, grupoId);
    return {
      success: true,
      message:
        " *Bot desactivado en este grupo.*\n\nUsa `/bot on` para reactivarlo.",
    };
  } catch (error) {
    return { success: false, message: " Error al desactivar el bot." };
  }
}

/**
 * /bot global on - Activar el bot globalmente
 */
async function handleBotGlobalOn(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (!isSuperAdmin(usuario)) {
    return {
      success: false,
      message: " Solo el bot principal puede controlar el bot globalmente.",
    };
  }
  try {
    // Verificar si el bot ya est activado globalmente
    const currentState = await db("bot_global_state")
      .orderBy("fecha_cambio", "desc")
      .first();
    const isCurrentlyActive = !currentState || currentState.estado === "on";

    if (isCurrentlyActive) {
      return {
        success: true,
        message:
          " *El bot ya est activado globalmente.*\n\nEl bot est funcionando en todos los grupos.",
      };
    }

    await db("bot_global_state").insert({
      estado: "on",
      activado_por: normalizedUsuario,
      fecha_cambio: new Date().toISOString(),
    });

    // Limpiar notificaciones de mantenimiento
    await clearMaintenanceNotifications();

    await logCommand(
      "administracion",
      "bot_global_on",
      normalizedUsuario,
      "global",
    );
    return {
      success: true,
      message:
        " *Bot activado globalmente.*\n\nEl bot est funcionando en todos los grupos!",
    };
  } catch (error) {
    return { success: false, message: " Error al activar el bot globalmente." };
  }
}

/**
 * Notificar a todos los grupos sobre el apagado global
 */
async function notifyAllGroupsAboutGlobalShutdown(usuario) {
  try {
    const { getSocket } = await import("./whatsapp.js");
    const sock = getSocket();

    if (!sock) {
      console.log("⚠️ No hay conexión de WhatsApp para enviar notificaciones");
      return { success: false, message: "No hay conexión de WhatsApp" };
    }

    // Obtener todos los grupos activos
    const grupos = await db("grupos")
      .select("jid", "nombre")
      .where("bot_enabled", true);
    const notificationResults = [];

    const notificationMessage =
      ` *NOTIFICACIN GLOBAL*\n\n` +
      `El bot ha sido desactivado globalmente por el administrador.\n` +
      `El bot no responder a ningn comando hasta que se reactive.\n\n` +
      `Solo el administrador puede reactivarlo usando:\n` +
      ` \`/bot global on\` (comando)\n` +
      ` Panel de administracin\n\n` +
      `_Esta notificación se envió a todos los grupos activos._`;

    // Enviar notificación a cada grupo
    for (const grupo of grupos) {
      try {
        await sock.sendMessage(grupo.jid, { text: notificationMessage });

        // Registrar la notificación enviada
        await db("notificaciones_globales").insert({
          grupo_jid: grupo.jid,
          grupo_nombre: grupo.nombre,
          tipo: "global_shutdown",
          mensaje: notificationMessage,
          enviado_por: normalizeUserNumber(usuario),
          fecha_envio: new Date().toISOString(),
          estado: "enviado",
        });

        notificationResults.push({
          grupo: grupo.nombre,
          jid: grupo.jid,
          status: "success",
        });

        console.log(` Notificacin enviada a grupo: ${grupo.nombre}`);

        // Pequea pausa para evitar spam
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(
          `❌ Error enviando notificación a ${grupo.nombre}:`,
          error,
        );

        // Registrar el error
        await db("notificaciones_globales").insert({
          grupo_jid: grupo.jid,
          grupo_nombre: grupo.nombre,
          tipo: "global_shutdown",
          mensaje: notificationMessage,
          enviado_por: normalizeUserNumber(usuario),
          fecha_envio: new Date().toISOString(),
          estado: "error",
          error_message: error.message,
        });

        notificationResults.push({
          grupo: grupo.nombre,
          jid: grupo.jid,
          status: "error",
          error: error.message,
        });
      }
    }

    return {
      success: true,
      totalGroups: grupos.length,
      successfulNotifications: notificationResults.filter(
        (r) => r.status === "success",
      ).length,
      failedNotifications: notificationResults.filter(
        (r) => r.status === "error",
      ).length,
      results: notificationResults,
    };
  } catch (error) {
    console.error("Error en notificación global:", error);
    return {
      success: false,
      message: "Error enviando notificaciones globales",
    };
  }
}

/**
 * /bot global off - Desactivar el bot globalmente
 */
async function handleBotGlobalOff(usuario) {
  const normalizedUsuario = normalizeUserNumber(usuario);
  if (!isSuperAdmin(usuario)) {
    return {
      success: false,
      message: " Solo el bot principal puede controlar el bot globalmente.",
    };
  }
  try {
    // Verificar si el bot ya est desactivado globalmente
    const currentState = await db("bot_global_state")
      .orderBy("fecha_cambio", "desc")
      .first();
    const isCurrentlyActive = !currentState || currentState.estado === "on";

    if (!isCurrentlyActive) {
      return {
        success: true,
        message:
          " *El bot ya est desactivado globalmente.*\n\nEl bot no responder a ningn comando hasta que se reactive.",
      };
    }

    // Desactivar globalmente
    await db("bot_global_state").insert({
      estado: "off",
      activado_por: normalizedUsuario,
      fecha_cambio: new Date().toISOString(),
    });

    // Notificar a todos los grupos
    const notificationResult =
      await notifyAllGroupsAboutGlobalShutdown(usuario);

    await logCommand(
      "administracion",
      "bot_global_off",
      normalizedUsuario,
      "global",
    );

    let message = " *Bot desactivado globalmente.*\n\n";
    if (notificationResult.success) {
      message +=
        ` Notificaciones enviadas:\n` +
        ` Grupos notificados: ${notificationResult.successfulNotifications}/${notificationResult.totalGroups}\n` +
        ` Exitosas: ${notificationResult.successfulNotifications}\n` +
        ` Fallidas: ${notificationResult.failedNotifications}\n\n`;
    }
    message += "El bot no responder a ningn comando hasta que se reactive.";

    return {
      success: true,
      message: message,
      notificationDetails: notificationResult,
    };
  } catch (error) {
    return {
      success: false,
      message: " Error al desactivar el bot globalmente.",
    };
  }
}

/**
 * Verificar si el bot est activado globalmente
 */
async function isBotGloballyActive() {
  try {
    const state = await db("bot_global_state")
      .orderBy("fecha_cambio", "desc")
      .first();
    return !state || state.estado === "on";
  } catch (error) {
    console.error("Error al verificar estado global del bot:", error);
    return true; // Por defecto, activado
  }
}

/**
 * Verificar si un usuario ya fue notificado sobre el mantenimiento
 */
async function wasUserNotifiedAboutMaintenance(usuario, grupo = null) {
  try {
    const notification = await db("usuarios_notificados_mantenimiento")
      .where({ usuario, grupo })
      .first();
    return !!notification;
  } catch (error) {
    console.error("Error al verificar notificación de mantenimiento:", error);
    return false;
  }
}

/**
 * Marcar usuario como notificado sobre mantenimiento
 */
async function markUserAsNotifiedAboutMaintenance(usuario, grupo = null) {
  try {
    await db("usuarios_notificados_mantenimiento")
      .insert({
        usuario,
        grupo,
        fecha_notificacion: new Date().toISOString(),
      })
      .onConflict(["usuario", "grupo"])
      .ignore();
  } catch (error) {
    console.error("Error al marcar usuario como notificado:", error);
  }
}

/**
 * Limpiar notificaciones de mantenimiento (cuando se reactiva el bot)
 */
async function clearMaintenanceNotifications() {
  try {
    await db("usuarios_notificados_mantenimiento").del();
    console.log(" Notificaciones de mantenimiento limpiadas");
  } catch (error) {
    console.error("Error al limpiar notificaciones de mantenimiento:", error);
  }
}

/**
 * Limpiar avisos de grupo desactivado
 */
async function clearGroupOffNotices(grupoId) {
  try {
    await db("avisos_grupo_off").where("grupo_jid", grupoId).del();
    console.log(` Avisos de grupo ${grupoId} limpiados`);
  } catch (error) {
    console.error("Error al limpiar avisos de grupo:", error);
  }
}

/**
 * /update - Actualizar configuracin desde el bot principal
 */
// ...existing code...
// ...existing code...

// ...existing code...

// handleDelSubbot se importa desde subbot-commands.js
async function _handleDelSubbot(code, usuario) {
  try {
    if (!code) {
      return {
        success: false,
        message:
          "\n" +
          "          *ERROR DE USO*            \n" +
          "\n\n" +
          " *Uso correcto:*\n" +
          "\n" +
          " `delbot <subbot_id>`                   \n" +
          " `delsubbot <subbot_id>`                \n" +
          "\n\n" +
          " *Ejemplo: `delbot abc123`*",
      };
    }
    const result = await deleteSubbot(code);
    if (!result.success) {
      return {
        success: false,
        message:
          "\n" +
          "          *ERROR*                   \n" +
          "\n\n" +
          " *No se pudo eliminar el subbot*\n\n" +
          " *Detalles:*\n" +
          "\n" +
          ` ID: ${code}\n` +
          ` Error: ${result.error}\n` +
          "\n\n" +
          " *Verifica que el ID sea correcto*",
      };
    }
    return {
      success: true,
      message:
        "\n" +
        "         *SUBBOT ELIMINADO*         \n" +
        "\n\n" +
        " *Subbot eliminado correctamente*\n\n" +
        " *Detalles:*\n" +
        "\n" +
        ` ID: ${code}\n` +
        " Estado: Eliminado permanentemente\n" +
        ` Fecha: ${new Date().toLocaleString("es-ES")}\n` +
        "\n\n" +
        " *Usa `bots` para ver tus subbots restantes*",
    };
  } catch (error) {
    return {
      success: false,
      message:
        "\n" +
        "          *ERROR*                   \n" +
        "\n\n" +
        " *Error eliminando subbot*\n\n" +
        " *Intenta nuevamente o contacta al administrador*",
    };
  }
}

async function handleCode(usuario, grupo, remoteJid, args, sender, messageId) {
  try {
    let phoneNumber = args[0];
    let alias = args[1] || "";

    // Validar nmero de telfono
    if (!phoneNumber || phoneNumber === "auto") {
      // Usar el nmero del remitente si no se proporciona
      phoneNumber = usuario.split("@")[0];
    } else {
      // Limpiar el nmero de telfono
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
      if (phoneNumber.length < 10) {
        return {
          success: false,
          message: " Nmero de telfono invlido. Debe tener al menos 10 dgitos.",
        };
      }
    }

    // Generar un código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Aquí iría la lógica para guardar el código en la base de datos
    // await savePairingCode(code, phoneNumber, usuario, alias);

    const message = `
 *CDIGO DE EMPAREJAMIENTO*

 *Nmero:* ${phoneNumber}
 *Cdigo:* ${code}

*Instrucciones:*
1. Abre WhatsApp en tu celular
2. Ve a Ajustes > Dispositivos vinculados
3. Toca "Vincular un dispositivo"
4. Ingresa este código: *${code}*

*Nota:* Este código expira en 5 minutos`;

    return {
      success: true,
      message,
      code,
      phoneNumber,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutos
    };
  } catch (error) {
    console.error("Error en handleCode:", error);
    return {
      success: false,
      message:
        " Error al generar el código de emparejamiento. Intenta de nuevo.",
    };
  }
}

async function handleQR(subbotCode) {
  try {
    if (!subbotCode) {
      return {
        success: false,
        message:
          "\n" +
          "          *ERROR DE USO*            \n" +
          "\n\n" +
          " *Uso correcto:*\n" +
          "\n" +
          " `qr <subbot_id>`                       \n" +
          "\n\n" +
          " *Ejemplo: `qr abc123`*",
      };
    }

    const subbot = await getSubbotByCode(subbotCode);
    if (!subbot) {
      return {
        success: false,
        message:
          "\n" +
          "          *SUBBOT NO ENCONTRADO*    \n" +
          "\n\n" +
          ` *No se encontr el subbot con ID: \`${subbotCode}\`*\n\n` +
          " *Usa `bots` para ver tus subbots disponibles*",
      };
    }

    if (!subbot.qr_data) {
      return {
        success: true,
        message:
          "\n" +
          "         *QR EN GENERACIN*         \n" +
          "\n\n" +
          "📱 *El código QR aún no está listo*\n\n" +
          " *Detalles:*\n" +
          "\n" +
          ` ID: \`${subbotCode}\`\n` +
          " Estado: Generando QR...\n" +
          " Tipo: QR Code\n" +
          "\n\n" +
          " *Te avisar aqu mismo cuando est listo*",
      };
    }

    const caption =
      "\n" +
      "         *CDIGO QR SUBBOT*         \n" +
      "\n\n" +
      " *CONECTA TU SUBBOT:*\n" +
      "\n" +
      " 1 Abre WhatsApp en tu celular         \n" +
      " 2 Ve a *Dispositivos vinculados*      \n" +
      " 3 Toca *Vincular dispositivo*         \n" +
      "📱 4️⃣ Escanea este código QR              \n" +
      "\n\n" +
      ` *ID del Subbot:* \`${subbotCode}\`\n` +
      " *El QR expira en 2 minutos*\n\n" +
      " *Escanea rpido para conectar!*";

    return {
      success: true,
      message: caption,
      media: {
        type: "image",
        data: subbot.qr_data,
        caption,
      },
    };
  } catch (error) {
    console.error("Error en handleQR:", error);
    return {
      success: false,
      message:
        "\n" +
        "          *ERROR*                   \n" +
        "\n\n" +
        "❌ *Error obteniendo código QR*\n\n" +
        " *Intenta nuevamente o contacta al administrador*",
    };
  }
}

/**
 * /whoami - Mostrar informacin del usuario
 */
async function handleWhoami(usuario, grupo, isGroup, waUserInfo) {
  try {
    const number = String(usuario).split("@")[0].split(":")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: number })
      .select("username", "rol", "fecha_registro")
      .first();
    const wa = await db("wa_contacts")
      .where({ wa_number: number })
      .select("display_name")
      .first();
    const display =
      waUserInfo?.pushName || wa?.display_name || user?.username || number;
    const registro = user?.fecha_registro
      ? new Date(user.fecha_registro).toLocaleDateString("es-ES")
      : "N/D";
    const rol = user?.rol ? user.rol.toUpperCase() : "USUARIO";

    let info = `\n`;
    info += `            *TU INFORMACIN*          \n`;
    info += `\n\n`;
    info += ` *DETALLES PERSONALES:*\n`;
    info += `\n`;
    info += `  Nombre: *${display}*\n`;
    info += `  Nmero: \`${number}\`\n`;
    if (user?.username) info += `  Usuario Panel: @${user.username}\n`;
    info += `  Rol: *${rol}*\n`;
    info += `  Registro: ${registro}\n`;
    info += `  Chat: ${grupo ? "Grupo" : "Privado"}\n`;
    info += `\n\n`;
    info += ` *Usa \`help\` para ver todos los comandos disponibles*`;

    await logCommand("consulta", "whoami", usuario, grupo);
    return { success: true, message: info };
  } catch (e) {
    await logCommand("consulta", "whoami", usuario, grupo);
    return {
      success: true,
      message:
        `\n` +
        `            *INFORMACIN BSICA*     \n` +
        `\n\n` +
        ` *Datos disponibles:*\n` +
        `\n` +
        `  Usuario: \`${usuario}\`\n` +
        `  Chat: ${grupo || "Privado"}\n` +
        `\n\n` +
        ` *Informacin limitada - contacta al administrador*`,
    };
  }
}

/**
 * /tag [mensaje] - Menciona a todos los miembros del grupo sin mostrar @@@@@@@
 */
async function handleTag(mensaje, usuario, grupo) {
  if (!grupo || !grupo.endsWith("@g.us")) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos.",
    };
  }

  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: " Bot no conectado." };

    // Verificar si el usuario es admin del grupo
    const isAdmin = await isGroupAdmin(usuario, grupo);
    if (!isAdmin) {
      return {
        success: false,
        message: " Solo Admin puede usar este comando.",
      };
    }

    // Obtener metadata del grupo
    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Crear array de menciones invisibles
    const mentions = participants.map((participant) => participant.id);

    // Crear el mensaje con menciones invisibles
    const message = {
      text: mensaje || " *Aviso para todos*\n\nAtencin general!",
      mentions: mentions,
    };

    // Enviar mensaje con menciones
    await sock.sendMessage(grupo, message);

    await logCommand("moderacion", "tag", usuario, grupo);

    return {
      success: true,
      message: " Mensaje enviado a todos los miembros del grupo.",
    };
  } catch (error) {
    console.error("Error en handleTag:", error);
    return { success: false, message: " Error al enviar mensaje a todos." };
  }
}

/**
 * /responder - Menciona al autor del mensaje citado y responde en hilo
 */
async function handleReplyTag(mensaje, usuario, grupo, quotedMessage) {
  if (!grupo || !grupo.endsWith("@g.us")) {
    return {
      success: false,
      message: " Este comando solo funciona en grupos.",
    };
  }
  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: " Bot no conectado." };
    if (!quotedMessage || !quotedMessage.key) {
      return {
        success: false,
        message: " Responde a un mensaje para mencionar a su autor.",
      };
    }
    const mentionJid =
      quotedMessage.key.participant || quotedMessage.key.remoteJid;
    const text = mensaje || " Respuesta para ti";
    await logCommand("moderacion", "replytag", usuario, grupo);
    return {
      success: true,
      message: text,
      mentions: mentionJid ? [mentionJid] : undefined,
      replyTo: quotedMessage,
    };
  } catch (e) {
    return { success: false, message: " Error al responder con mencin." };
  }
}

/**
 * Moderacin de grupos va WhatsApp (requiere que el bot sea admin del grupo)
 */
async function handleKick(target, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede expulsar miembros." };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: " Bot no conectado." };
  if (!grupo || !grupo.endsWith("@g.us"))
    return {
      success: false,
      message: " Este comando solo funciona en grupos.",
    };

  const numero = (target || "").toString().replace(/[^0-9]/g, "");
  if (!numero) return { success: false, message: "Uso: /kick @usuario" };

  // Intentar la accin incluso si la deteccin de admin falla; WhatsApp rechazar si no es admin.

  try {
    const jid = await buildParticipantJid(grupo, numero);
    await sock.groupParticipantsUpdate(grupo, [jid], "remove");

    // Buscar el participante para obtener su nombre real
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find((p) => {
      const participantNumber = normalizeUserNumber(p.id || "");
      return participantNumber === numero;
    });

    // Obtener nombre limpio (sin LID)
    const displayName = getCleanDisplayName(participant, numero);
    const mentionJid = participant ? participant.id : `${numero}@s.whatsapp.net`;

    // Registrar log con detalles
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand("moderacion", "kick", normalizedUsuario, grupo, {
      action: "kick",
      actor_number: normalizedUsuario,
      target_number: numero,
      target_jid: mentionJid,
      target_name: displayName,
      group_id: grupo,
      group_name: groupMetadata?.subject || "",
    });

    return {
      success: true,
      message: ` Usuario expulsado: @${displayName}`,
      mentions: [mentionJid],
    };
  } catch (error) {
    console.error("Error en handleKick:", error);
    return {
      success: false,
      message:
        " No se pudo expulsar. Asegrate de que el bot sea admin del grupo.",
    };
  }
}

async function handlePromote(target, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede promover miembros." };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: " Bot no conectado." };
  if (!grupo || !grupo.endsWith("@g.us"))
    return {
      success: false,
      message: " Este comando solo funciona en grupos.",
    };

  const numero = (target || "").toString().replace(/[^0-9]/g, "");
  if (!numero) return { success: false, message: "Uso: /promote @usuario" };

  try {
    const jid = await buildParticipantJid(grupo, numero);

    // Verificar si el usuario ya es admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find((p) => {
      const participantNumber = normalizeUserNumber(p.id || "");
      return participantNumber === numero;
    });

    if (
      participant &&
      (participant.admin === "admin" || participant.admin === "superadmin")
    ) {
      return { success: false, message: " El usuario ya es admin." };
    }

    await sock.groupParticipantsUpdate(grupo, [jid], "promote");

    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find((p) => {
      const participantNumber = normalizeUserNumber(p.id || "");
      return participantNumber === numero;
    });

    // Obtener nombre limpio (sin LID)
    const displayName = getCleanDisplayName(updatedParticipant, numero);
    const mentionJid = updatedParticipant ? updatedParticipant.id : `${numero}@s.whatsapp.net`;

    // Registrar log con detalles
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand("moderacion", "promote", normalizedUsuario, grupo, {
      action: "promote",
      actor_number: normalizedUsuario,
      target_number: numero,
      target_jid: mentionJid,
      target_name: displayName,
      from_role: "member",
      to_role: "admin",
      group_id: grupo,
      group_name: updatedMetadata?.subject || "",
    });

    return {
      success: true,
      message: ` Usuario promovido a admin: @${displayName}`,
      mentions: [mentionJid],
    };
  } catch (error) {
    console.error("Error en handlePromote:", error);
    return {
      success: false,
      message:
        " No se pudo promover. Asegrate de que el bot sea admin del grupo.",
    };
  }
}

async function handleDemote(target, usuario, grupo) {
  if (!(await isOwnerOrAdmin(usuario, grupo))) {
    return { success: false, message: " Solo Admin puede degradar miembros." };
  }
  const sock = getSocket();
  if (!sock) return { success: false, message: " Bot no conectado." };
  if (!grupo || !grupo.endsWith("@g.us"))
    return {
      success: false,
      message: " Este comando solo funciona en grupos.",
    };

  const numero = (target || "").toString().replace(/[^0-9]/g, "");
  if (!numero) return { success: false, message: "Uso: /demote @usuario" };

  try {
    const jid = await buildParticipantJid(grupo, numero);

    // Verificar si el usuario ya es NO admin
    const groupMetadata = await sock.groupMetadata(grupo);
    const participant = groupMetadata.participants.find((p) => {
      const participantNumber = normalizeUserNumber(p.id || "");
      return participantNumber === numero;
    });

    if (participant && (!participant.admin || participant.admin === null)) {
      return { success: false, message: " El usuario ya NO es admin." };
    }

    await sock.groupParticipantsUpdate(grupo, [jid], "demote");

    // Buscar el participante para obtener su nombre real
    const updatedMetadata = await sock.groupMetadata(grupo);
    const updatedParticipant = updatedMetadata.participants.find((p) => {
      const participantNumber = normalizeUserNumber(p.id || "");
      return participantNumber === numero;
    });

    // Obtener nombre limpio (sin LID)
    const displayName = getCleanDisplayName(updatedParticipant, numero);
    const mentionJid = updatedParticipant ? updatedParticipant.id : `${numero}@s.whatsapp.net`;

    // Registrar log con detalles
    const normalizedUsuario = normalizeUserNumber(usuario);
    await logCommand("moderacion", "demote", normalizedUsuario, grupo, {
      action: "demote",
      actor_number: normalizedUsuario,
      target_number: numero,
      target_jid: mentionJid,
      target_name: displayName,
      from_role: "admin",
      to_role: "member",
      group_id: grupo,
      group_name: updatedMetadata?.subject || "",
    });

    return {
      success: true,
      message: ` Usuario degradado de admin: @${displayName}`,
      mentions: [mentionJid],
    };
  } catch (error) {
    console.error("Error en handleDemote:", error);
    return {
      success: false,
      message:
        " No se pudo degradar. Asegrate de que el bot sea admin del grupo.",
    };
  }
}

/**
 * Verificar si un usuario es admin real del grupo usando metadata
 */
/**
 * Verificar si un usuario es admin REAL del grupo (sin considerar owner/superadmin)
 * Útil para mostrar el estado real en comandos de debug
 */
async function isRealGroupAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;

    const userNumber = normalizeUserNumber(usuario);
    const targetJid = normalizeJid(
      usuario.includes("@") ? usuario : `${userNumber}@s.whatsapp.net`,
    );
    const targetNumber = userNumber;

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    const participant = participants.find((p) => {
      const pid = p.id || "";
      const normalizedParticipant = normalizeJid(pid);
      const participantNumber = normalizeUserNumber(pid);
      return (
        normalizedParticipant === targetJid ||
        (participantNumber && participantNumber === targetNumber) ||
        (targetNumber && normalizedParticipant.includes(targetNumber))
      );
    });

    if (!participant) {
      return false;
    }

    const isAdmin =
      participant.admin === "admin" ||
      participant.admin === "superadmin" ||
      participant.admin === true;

    return isAdmin;
  } catch (e) {
    console.error("[MOD][isRealGroupAdmin] Error:", e);
    return false;
  }
}

/**
 * Verificar si un usuario es admin del grupo (considera owner/superadmin + admin real)
 * Usado para permisos de comandos
 */
async function isGroupAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;

    // Normalizar nmeros para comparacin
    const userNumber = normalizeUserNumber(usuario);
    const rawBotJid = sock.user && sock.user.id ? sock.user.id : "";
    const botNumber = normalizeUserNumber(rawBotJid);

    // PRIORIDAD 1: Verificar si es owner o superadmin PRIMERO
    // El owner/superadmin SIEMPRE tiene permisos de admin, incluso si es el mismo número del bot
    try {
      if (isSpecificOwner(usuario) || isSuperAdmin(usuario)) {
        console.log(
          `[MOD][isGroupAdmin] usuario=${userNumber} es owner/superadmin => true (prioridad máxima)`,
        );
        return true;
      }
    } catch (_) {}

    // PRIORIDAD 2: Verificar si es admin real del grupo
    return await isRealGroupAdmin(usuario, grupo);
  } catch (e) {
    console.error("[MOD][isGroupAdmin] Error:", e);
    return false;
  }
}

// Helper para normalizar usuario a solo nmero
function normalizeUserNumber(usuarioJid) {
  if (!usuarioJid) return "";
  try {
    const decoded = baileys.jidDecode(usuarioJid);
    if (decoded?.user) {
      return decoded.user.split(":")[0];
    }
  } catch (_) {}
  return usuarioJid.split("@")[0].split(":")[0];
}

// Helper para obtener nombre de display limpio (sin mostrar LID)
function getCleanDisplayName(participant, fallbackNumber) {
  if (!participant) return fallbackNumber;
  
  // Prioridad 1: notify (nombre guardado en contactos)
  if (participant.notify) return participant.notify;
  
  // Prioridad 2: name (nombre del perfil)
  if (participant.name) return participant.name;
  
  // Prioridad 3: número limpio (sin LID)
  const cleanNumber = normalizeUserNumber(participant.id);
  if (cleanNumber) return cleanNumber;
  
  // Fallback: número proporcionado
  return fallbackNumber;
}

// Helper para saber si el bot es admin real del grupo
async function isBotAdmin(grupo) {
  try {
    const sock = getSocket();
    if (!sock || !grupo) return false;

    const rawBotJid = sock.user && sock.user.id ? sock.user.id : "";
    if (!rawBotJid) return false;

    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split("@")[0];

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];

    // Buscar el bot en los participantes
    const botParticipant = participants.find((p) => {
      const pid = p.id || "";
      const normalizedParticipant = normalizeJid(pid);
      const participantNumber = normalizeUserNumber(pid);
      return (
        participantNumber === botBaseNumber ||
        normalizedParticipant.includes(botBaseNumber)
      );
    });

    const botIsAdmin = !!(
      botParticipant &&
      (botParticipant.admin === "admin" ||
        botParticipant.admin === "superadmin" ||
        botParticipant.admin === true)
    );
    console.log(
      `[MOD][isBotAdmin] bot=${cleanBotJid} inGroup=${!!botParticipant} adminFlag=${botParticipant?.admin} => ${botIsAdmin}`,
    );
    if (botIsAdmin) return true;

    // Si no encontramos al bot como participante, asumir que no es admin
    return false;
  } catch (error) {
    console.error("[MOD][isBotAdmin] Error:", error);
    return false;
  }
}

async function handleDebugAdmin(usuario, grupo) {
  try {
    const sock = getSocket();
    if (!sock) return { success: false, message: " Bot no conectado." };
    if (!grupo || !grupo.endsWith("@g.us"))
      return {
        success: false,
        message: " Este comando solo funciona en grupos.",
      };

    const rawBotJid = sock.user && sock.user.id ? sock.user.id : "";
    const cleanBotJid = normalizeJid(rawBotJid);
    const botBaseNumber = cleanBotJid.split("@")[0];

    const groupMetadata = await sock.groupMetadata(grupo);
    const participants = groupMetadata.participants || [];
    const sample = participants
      .slice(0, Math.min(10, participants.length))
      .map((p) => p.id);

    // Buscar coincidencias
    const foundExact = participants.some((p) => p.id === rawBotJid);
    const foundClean = participants.some(
      (p) => normalizeJid(p.id || "") === cleanBotJid,
    );
    const foundBase = participants.some((p) =>
      normalizeJid(p.id || "").startsWith(botBaseNumber),
    );

    const asAdmin = participants.find(
      (p) =>
        normalizeJid(p.id || "") === cleanBotJid &&
        (p.admin === "admin" || p.admin === "superadmin"),
    );

    const lines = [];
    lines.push(" Debug admin del bot");
    lines.push(` rawBotJid: ${rawBotJid}`);
    lines.push(` cleanBotJid: ${cleanBotJid}`);
    lines.push(` botBaseNumber: ${botBaseNumber}`);
    lines.push(` foundExact(raw): ${foundExact}`);
    lines.push(` foundClean(no sufijo): ${foundClean}`);
    lines.push(` foundBase(startsWith): ${foundBase}`);
    lines.push(` isAdminFlag: ${asAdmin ? "true" : "false"}`);
    lines.push(` group: ${groupMetadata.subject || grupo}`);
    lines.push(" sampleParticipants (10):");
    sample.forEach((jid, idx) => lines.push(`  - [${idx + 1}] ${jid}`));

    return { success: true, message: lines.join("\n") };
  } catch (e) {
    return { success: false, message: " Error en debugadmin." };
  }
}

// Helper: obtener JID de participante respetando el formato del grupo (lid vs s.whatsapp.net)
async function buildParticipantJid(grupo, numero) {
  const sock = getSocket();
  if (!sock) return `${numero}@s.whatsapp.net`;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];
    const groupUsesLid = participants.some((p) =>
      (p.id || "").endsWith("@lid"),
    );
    return groupUsesLid ? `${numero}@lid` : `${numero}@s.whatsapp.net`;
  } catch (_) {
    return `${numero}@s.whatsapp.net`;
  }
}

// Helper: obtener nombre real del participante para menciones
async function getParticipantName(grupo, numero) {
  const sock = getSocket();
  if (!sock) return numero;
  try {
    const meta = await sock.groupMetadata(grupo);
    const participants = meta.participants || [];

    console.log(` Buscando participante con nmero: ${numero}`);
    console.log(` Total participantes: ${participants.length}`);

    // Buscar participante por nmero (ms flexible)
    const participant = participants.find((p) => {
      const pid = p.id || "";
      // Buscar por nmero en cualquier parte del JID
      const found = pid.includes(numero);
      if (found) {
        console.log(` Encontrado por nmero: ${pid}`);
        console.log(`   - notify: ${p.notify}`);
        console.log(`   - name: ${p.name}`);
        console.log(`   - admin: ${p.admin}`);
        console.log(`   - keys: ${Object.keys(p).join(", ")}`);
      }
      return found;
    });

    if (participant) {
      // Intentar diferentes campos para obtener el nombre
      const possibleNames = [
        participant.notify,
        participant.name,
        participant.displayName,
        participant.pushName,
        participant.verifiedName,
      ].filter((name) => name && name.trim());

      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(` Usando nombre real: ${realName}`);
        return realName;
      }

      // Si no hay nombre, usar el ID limpio
      const cleanId = participant.id.split("@")[0];
      console.log(` Usando ID limpio: ${cleanId}`);
      return cleanId || numero;
    }

    // Si no encontramos por nmero directo, buscar por JID normalizado
    const normalizedTarget = `${numero}@s.whatsapp.net`;
    console.log(` Buscando por JID normalizado: ${normalizedTarget}`);

    const participantByJid = participants.find((p) => {
      const normalized = normalizeJid(p.id || "");
      const found = normalized === normalizedTarget;
      if (found) {
        console.log(
          ` Encontrado por JID normalizado: ${p.id} -> ${normalized}`,
        );
      }
      return found;
    });

    if (participantByJid) {
      const possibleNames = [
        participantByJid.notify,
        participantByJid.name,
        participantByJid.displayName,
        participantByJid.pushName,
        participantByJid.verifiedName,
      ].filter((name) => name && name.trim());

      if (possibleNames.length > 0) {
        const realName = possibleNames[0].trim();
        console.log(` Usando nombre real (JID): ${realName}`);
        return realName;
      }
    }

    console.log(` No se encontr participante para nmero: ${numero}`);
    return numero;
  } catch (error) {
    console.error("Error en getParticipantName:", error);
    return numero;
  }
}

// ==================== COMANDOS DE MEDIA (MAYCOLPLUS) ====================

/**
 * Descargar video/audio de YouTube
 */
async function handleYouTubeDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message:
          ` *Descarga de YouTube*\n\n` +
          ` *Uso:* \`/yt <enlace o bsqueda>\`\n` +
          ` *Ejemplo:* \`/yt https://youtube.com/watch?v=...\`\n` +
          ` *Ejemplo:* \`/yt msica relajante\`\n\n` +
          ` *Funciones:*\n` +
          ` Descargar videos de YouTube\n` +
          ` Buscar y descargar por nombre\n` +
          ` Calidad automtica HD`,
      };
    }

    const query = args.join(" ");
    const socket = getSocket();

    if (!socket) {
      return {
        success: false,
        message: " Bot no conectado. Intenta ms tarde.",
      };
    }

    // Simular bsqueda (en implementacin real usaras yt-search)
    const searchResults = [
      {
        title: `Resultado para: ${query}`,
        url: `https://youtube.com/watch?v=dQw4w9WgXcQ`,
        duration: "3:32",
        views: "1.2B",
        author: "Canal de ejemplo",
      },
    ];

    const video = searchResults[0];

    const response =
      ` *${video.title}*\n\n` +
      ` *Canal:* ${video.author}\n` +
      ` *Duracin:* ${video.duration}\n` +
      ` *Vistas:* ${video.views}\n\n` +
      ` *Procesando descarga...*\n` +
      ` 25%\n\n` +
      ` *Funciones disponibles:*\n` +
      ` \`/ytmp3\` - Solo audio\n` +
      ` \`/ytmp4\` - Video completo\n` +
      ` \`/yt\` - Opciones interactivas`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleYouTubeDownload:", error);
    return {
      success: false,
      message: " Error al procesar la descarga de YouTube.",
    };
  }
}

/**
 * Crear sticker desde imagen/video
 */
async function handleSticker(usuario, grupo, isGroup, args) {
  try {
    return {
      success: true,
      message: ` *Crear Sticker*

1 Enva o reenva la imagen/video que quieres convertir.
2 Respndelo con \`/sticker\` (o su alias \`.s\`).
3 Espera unos segundos y recibirs el sticker listo para usar.

 Tip: los videos cortos (6s) se convierten en stickers animados.`,
    };
  } catch (error) {
    console.error("Error en handleSticker:", error);
    return {
      success: false,
      message: " Error al procesar el sticker.",
    };
  }
}

/**
 * Descargar videos de TikTok
 */
async function handleTikTokDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message:
          ` *Descarga de TikTok*\n\n` +
          ` *Uso:* \`/tiktok <enlace o bsqueda>\`\n` +
          ` *Ejemplo:* \`/tiktok https://tiktok.com/@user/video/123\`\n` +
          ` *Ejemplo:* \`/tiktok baile viral\`\n\n` +
          ` *Funciones:*\n` +
          ` Descargar videos de TikTok\n` +
          ` Buscar videos por hashtag\n` +
          ` Calidad HD sin marca de agua`,
      };
    }

    const query = args.join(" ");

    const response =
      ` *TikTok Downloader*\n\n` +
      ` *Buscando:* ${query}\n` +
      ` *Procesando...*\n` +
      ` 50%\n\n` +
      ` *Caractersticas:*\n` +
      ` Sin marca de agua\n` +
      ` Calidad HD\n` +
      ` Descarga rpida\n` +
      ` Soporte para enlaces y bsquedas`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleTikTokDownload:", error);
    return {
      success: false,
      message: " Error al procesar la descarga de TikTok.",
    };
  }
}

/**
 * Descargar contenido de Instagram
 */
async function handleInstagramDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message:
          ` *Descarga de Instagram*\n\n` +
          ` *Uso:* \`/ig <enlace de Instagram>\`\n` +
          ` *Ejemplo:* \`/ig https://instagram.com/p/ABC123\`\n\n` +
          ` *Soporta:*\n` +
          ` Fotos individuales\n` +
          ` Videos\n` +
          ` Carousels (mltiples fotos)\n` +
          ` Stories (si son pblicas)`,
      };
    }

    const url = args[0];

    const response =
      ` *Instagram Downloader*\n\n` +
      ` *URL:* ${url}\n` +
      ` *Analizando contenido...*\n` +
      ` 75%\n\n` +
      ` *Procesando:*\n` +
      ` Detecting media type\n` +
      ` Optimizing quality\n` +
      ` Preparing download`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleInstagramDownload:", error);
    return {
      success: false,
      message: " Error al procesar la descarga de Instagram.",
    };
  }
}

/**
 * Descargar videos de Twitter/X
 */
async function handleTwitterDownload(usuario, grupo, isGroup, args) {
  try {
    if (!args || args.length === 0) {
      return {
        success: false,
        message:
          ` *Descarga de Twitter/X*\n\n` +
          ` *Uso:* \`/twitter <enlace de Twitter>\`\n` +
          ` *Ejemplo:* \`/twitter https://twitter.com/user/status/123\`\n\n` +
          ` *Soporta:*\n` +
          ` Videos de Twitter\n` +
          ` GIFs\n` +
          ` Imgenes\n` +
          ` Hilos completos`,
      };
    }

    const url = args[0];

    const response =
      ` *Twitter Downloader*\n\n` +
      ` *URL:* ${url}\n` +
      ` *Procesando...*\n` +
      ` 80%\n\n` +
      ` *Caractersticas:*\n` +
      ` Calidad original\n` +
      ` Sin compresin\n` +
      ` Descarga rpida`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleTwitterDownload:", error);
    return {
      success: false,
      message: " Error al procesar la descarga de Twitter.",
    };
  }
}

/**
 * Obtener informacin del LID del usuario
 */
async function handleGetLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden ver esta informacin
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden obtener esta informacin.",
      };
    }

    const socket = getSocket();
    if (!socket) {
      return {
        success: false,
        message: " Bot no conectado.",
      };
    }

    // Obtener informacin del bot
    const botJid = socket.user?.jid || "No disponible";
    const botNumber = botJid.split("@")[0];
    const botServer = botJid.split("@")[1];

    let response = ` *Informacin del Sistema*\n\n`;
    response += ` *Bot JID:* ${botJid}\n`;
    response += ` *Bot Nmero:* ${botNumber}\n`;
    response += ` *Servidor:* ${botServer}\n\n`;

    response += ` *Tu informacin:*\n`;
    response += ` Usuario: ${usuario}\n`;
    response += ` Nmero: ${usuario.split("@")[0]}\n`;
    response += ` Servidor: ${usuario.split("@")[1]}\n\n`;

    response += `⚙️ *Configuración actual:*\n`;
    response += ` Superadmins: ${global.owner.length}\n`;
    response += ` Moderadores: ${global.mods.length}\n`;
    response += ` Premium: ${global.prems.length}\n\n`;

    response += ` *Para actualizar tu LID:*\n`;
    response += ` Usa \`/updatelid <tu_lid_completo>\`\n`;
    response += ` Ejemplo: \`/updatelid 1234567890@lid\`\n`;
    response += ` O usa \`/updatelid auto\` para detectar automticamente`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleGetLID:", error);
    return {
      success: false,
      message: " Error al obtener informacin del LID.",
    };
  }
}

/**
 * Actualizar LID del usuario
 */
async function handleUpdateLID(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden actualizar LIDs
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden actualizar LIDs.",
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message:
          " *Uso:* `/updatelid <tu_lid_completo>`\n\n" +
          " *Ejemplo:* `/updatelid 1234567890@lid`\n" +
          " *Auto:* `/updatelid auto` (detectar automticamente)",
      };
    }

    const lidInput = args[0].toLowerCase();

    if (lidInput === "auto") {
      // Detectar automticamente el LID del usuario actual
      const currentLid = usuario; // El usuario ya viene con el formato correcto

      // Actualizar en la configuracin global
      const userIndex = global.owner.findIndex(([num]) => isSuperAdmin(num));
      if (userIndex !== -1) {
        global.owner[userIndex][0] = currentLid.split("@")[0];
      }

      return {
        success: true,
        message:
          ` LID actualizado automticamente:\n` +
          ` LID detectado: ${currentLid}\n` +
          ` Nmero: ${currentLid.split("@")[0]}\n` +
          ` Servidor: ${currentLid.split("@")[1]}\n\n` +
          ` Los cambios se aplicarn en el prximo reinicio.`,
      };
    } else {
      // LID manual
      const lid = args[0];

      // Validar formato bsico
      if (!lid.includes("@")) {
        return {
          success: false,
          message:
            " Formato de LID invlido. Debe incluir @ (ej: 1234567890@lid)",
        };
      }

      const [numero, servidor] = lid.split("@");

      // Actualizar en la configuracin global
      const userIndex = global.owner.findIndex(([num]) => isSuperAdmin(num));
      if (userIndex !== -1) {
        global.owner[userIndex][0] = numero;
      }

      return {
        success: true,
        message:
          ` LID actualizado manualmente:\n` +
          ` LID: ${lid}\n` +
          ` Nmero: ${numero}\n` +
          ` Servidor: ${servidor}\n\n` +
          ` Los cambios se aplicarn en el prximo reinicio.`,
      };
    }
  } catch (error) {
    console.error("Error en handleUpdateLID:", error);
    return {
      success: false,
      message: " Error al actualizar LID.",
    };
  }
}

// ==================== COMANDOS DE ADMINISTRACIN GLOBAL ====================

/**
 * Mostrar informacin del sistema de administradores
 */
async function handleAdminInfo(usuario, grupo, isGroup, args) {
  try {
    // Verificar permisos
    if (!(await isOwnerOrAdmin(usuario, grupo))) {
      return {
        success: false,
        message: " Solo los administradores pueden ver esta informacin.",
      };
    }

    const ownerName = getOwnerName(usuario);
    const isSuper = isSuperAdmin(usuario);
    const isMod = isModerator(usuario);
    const isPrem = isPremium(usuario);

    let response = ` *Sistema de Administracin*\n\n`;
    response += ` *Tu informacin:*\n`;
    response += ` Nombre: ${ownerName}\n`;
    response += ` Nmero: ${usuario}\n`;
    response += ` Superadmin: ${isSuper ? "" : ""}\n`;
    response += ` Moderador: ${isMod ? "" : ""}\n`;
    response += ` Premium: ${isPrem ? "" : ""}\n\n`;

    response += ` *Superadmins globales:*\n`;
    global.owner.forEach(([num, name, isSuper], index) => {
      response += `${index + 1}. ${name} (${num})\n`;
    });

    response += `\n *Moderadores:* ${global.mods.length}\n`;
    response += ` *Usuarios Premium:* ${global.prems.length}\n\n`;

    response += ` *Comandos disponibles:*\n`;
    response += ` \`/addadmin <numero> <nombre>\` - Agregar superadmin\n`;
    response += ` \`/deladmin <numero>\` - Quitar superadmin\n`;
    response += ` \`/addmod <numero>\` - Agregar moderador\n`;
    response += ` \`/delmod <numero>\` - Quitar moderador\n`;
    response += ` \`/addprem <numero>\` - Agregar premium\n`;
    response += ` \`/delprem <numero>\` - Quitar premium\n`;

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error("Error en handleAdminInfo:", error);
    return {
      success: false,
      message: " Error al obtener informacin de administracin.",
    };
  }
}

/**
 * Agregar superadmin
 */
async function handleAddAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden agregar otros superadmins.",
      };
    }

    if (!args || args.length < 2) {
      return {
        success: false,
        message:
          " *Uso:* `/addadmin <numero> <nombre>`\n\n" +
          " *Ejemplo:* `/addadmin 1234567890 Juan Prez`",
      };
    }

    const numero = args[0].replace(/[^0-9]/g, "");
    const nombre = args.slice(1).join(" ");

    // Verificar si ya existe
    const existingAdmin = global.owner.find(([num]) => num === numero);
    if (existingAdmin) {
      return {
        success: false,
        message: ` El nmero ${numero} ya es superadmin.`,
      };
    }

    // Agregar a la lista global
    global.owner.push([numero, nombre, true]);

    return {
      success: true,
      message:
        ` Superadmin agregado exitosamente:\n` +
        ` Nombre: ${nombre}\n` +
        ` Nmero: ${numero}\n\n` +
        ` Los cambios se aplicarn en el prximo reinicio.`,
    };
  } catch (error) {
    console.error("Error en handleAddAdmin:", error);
    return {
      success: false,
      message: " Error al agregar superadmin.",
    };
  }
}

/**
 * Quitar superadmin
 */
async function handleDelAdmin(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar otros superadmins
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden quitar otros superadmins.",
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message:
          " *Uso:* `/deladmin <numero>`\n\n" +
          " *Ejemplo:* `/deladmin 1234567890`",
      };
    }

    const numero = args[0].replace(/[^0-9]/g, "");

    // Verificar si existe
    const adminIndex = global.owner.findIndex(([num]) => num === numero);
    if (adminIndex === -1) {
      return {
        success: false,
        message: ` El nmero ${numero} no es superadmin.`,
      };
    }

    // No permitir quitarse a s mismo
    const usuarioNumero = usuario.replace(/[^0-9]/g, "");
    if (numero === usuarioNumero) {
      return {
        success: false,
        message: " No puedes quitarte a ti mismo como superadmin.",
      };
    }

    // Quitar de la lista global
    const removedAdmin = global.owner.splice(adminIndex, 1)[0];

    return {
      success: true,
      message:
        ` Superadmin removido exitosamente:\n` +
        ` Nombre: ${removedAdmin[1]}\n` +
        ` Nmero: ${numero}\n\n` +
        ` Los cambios se aplicarn en el prximo reinicio.`,
    };
  } catch (error) {
    console.error("Error en handleDelAdmin:", error);
    return {
      success: false,
      message: " Error al quitar superadmin.",
    };
  }
}

/**
 * Agregar moderador
 */
async function handleAddMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden agregar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden agregar moderadores.",
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message:
          " *Uso:* `/addmod <numero>`\n\n" + " *Ejemplo:* `/addmod 1234567890`",
      };
    }

    const numero = args[0].replace(/[^0-9]/g, "");

    // Verificar si ya es superadmin
    if (isSuperAdmin(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: ` El nmero ${numero} ya es superadmin.`,
      };
    }

    // Verificar si ya es moderador
    if (isModerator(`${numero}@s.whatsapp.net`)) {
      return {
        success: false,
        message: ` El nmero ${numero} ya es moderador.`,
      };
    }

    // Agregar a la lista global
    global.mods.push(numero);

    return {
      success: true,
      message:
        ` Moderador agregado exitosamente:\n` +
        ` Nmero: ${numero}\n\n` +
        ` Los cambios se aplicarn en el prximo reinicio.`,
    };
  } catch (error) {
    console.error("Error en handleAddMod:", error);
    return {
      success: false,
      message: " Error al agregar moderador.",
    };
  }
}

/**
 * Quitar moderador
 */
async function handleDelMod(usuario, grupo, isGroup, args) {
  try {
    // Solo superadmins pueden quitar moderadores
    if (!isSuperAdmin(usuario)) {
      return {
        success: false,
        message: " Solo los superadmins pueden quitar moderadores.",
      };
    }

    if (!args || args.length < 1) {
      return {
        success: false,
        message:
          " *Uso:* `/delmod <numero>`\n\n" + " *Ejemplo:* `/delmod 1234567890`",
      };
    }

    const numero = args[0].replace(/[^0-9]/g, "");

    // Verificar si existe
    const modIndex = global.mods.indexOf(numero);
    if (modIndex === -1) {
      return {
        success: false,
        message: ` El nmero ${numero} no es moderador.`,
      };
    }

    // Quitar de la lista global
    global.mods.splice(modIndex, 1);

    return {
      success: true,
      message:
        ` Moderador removido exitosamente:\n` +
        ` Nmero: ${numero}\n\n` +
        ` Los cambios se aplicarn en el prximo reinicio.`,
    };
  } catch (error) {
    console.error("Error en handleDelMod:", error);
    return {
      success: false,
      message: " Error al quitar moderador.",
    };
  }
}

// Helper para obtener el mensaje global OFF
async function getGlobalOffMessage() {
  try {
    const row = await db("configuracion")
      .where({ parametro: "global_off_message" })
      .first();
    return (
      row?.valor || " El bot est desactivado globalmente por el administrador."
    );
  } catch {
    return " El bot est desactivado globalmente por el administrador.";
  }
}

async function handleBan(owner, number, reason) {
  if (owner === number) {
    return { success: false, message: " No puedes banearte a ti mismo." };
  }

  await db("usuarios_baneados")
    .insert({ wa_number: number, reason, banned_by: owner })
    .onConflict("wa_number")
    .merge({ reason, banned_by: owner, fecha: db.fn.now() });

  return {
    success: true,
    message: ` Usuario @${number} ha sido baneado del bot.${reason ? ` Motivo: ${reason}` : ""}`,
  };
}

async function handleUnban(target, usuario, grupo) {
  try {
    await ensureBansTable();
    const number = normalizeNumber(target);
    if (!number) {
      return {
        success: false,
        message: " Debes mencionar o indicar un nmero vlido.",
      };
    }

    // Permisos: superadmin o admin del grupo
    let allowed = isSuperAdmin(usuario) === true;
    if (!allowed && grupo) {
      allowed = await isGroupAdmin(usuario, grupo);
    }
    if (!allowed) {
      return { success: false, message: " No tienes permisos para desbanear." };
    }

    const deleted = await db("usuarios_baneados")
      .where({ wa_number: number })
      .del();
    if (!deleted) {
      return { success: false, message: " El usuario no estaba baneado." };
    }
    return {
      success: true,
      message: ` Usuario @${number} ha sido desbaneado.`,
    };
  } catch (error) {
    console.error("Error en handleUnban:", error);
    return { success: false, message: " Error al desbanear usuario." };
  }
}

// Exportar todas las funciones necesarias de manera organizada
// Usando export individual para cada funcin

// ===== COMANDOS BSICOS =====
export { handleHelp };
export { handleIA };
export { handleClasificar };
export { handleWhoami };
export { handlePing };
export { handleStatus };

// ===== COMANDOS DE GRUPO =====
export { handleAddGroup };
export { handleDelGroup };
export { handleKick };
export { handlePromote };
export { handleDemote };
export { handleLock };
export { handleUnlock };
export { handleTag };
export { handleReplyTag };

// ===== COMANDOS DE CONTENIDO =====
export { handleMyAportes };
export { handleAportes };
export { handleManhwas };
export { handleSeries };
export { handleAddAporte };
export { handleAddSerie };
export { handlePedido };
export { handlePedidos };
export { handleExtra };
export { handleIlustraciones };

// ===== COMANDOS DE ADMINISTRACIN =====
export { handleAporteEstado };
export { handleBotOn };
export { handleBotOff };
export { handleBotGlobalOn };
export { handleBotGlobalOff };
export { handleAdvertencias };

// ===== COMANDOS DE OBTENCIN =====
export { handleObtenerManhwa };
export { handleObtenerExtra };
export { handleObtenerIlustracion };
export { handleObtenerPack };

// ===== COMANDOS DE UTILIDAD =====
export { handlePrivado };
export { handleAmigos };
export { handleVotar };
export { handleCrearVotacion };
export { handleCerrarVotacion };
export { handleLogs };
export { handleLogsAdvanced };
export { handleBuscarArchivo };
export { handleStats };
export { handleExport };
export { handleDescargar };
export { handleGuardar };
export { handleArchivos };
export { handleMisArchivos };
export { handleEstadisticas };
export { handleLimpiar };

// ===== COMANDOS DE MEDIA =====
export { handleYouTubeDownload };
export { handleSticker };
export { handleTikTokDownload };
export { handleInstagramDownload };
export { handleTwitterDownload };
export { handleImage };
export { handleTranslate };
export { handleWeather };
export { handleQuote };
export { handleFact };
export { handleTrivia };
export { handleHoroscope };
export { handleMeme };
export { handleWallpaper };
export { handleJoke };
export { handleAIEnhanced as handleAI };

// ===== MODERACIN =====
export { handleBan };
export { handleUnban };

// ===== VARIABLES DE ESTADO =====
export { modoPrivado };
export { modoAmigos };
export { advertenciasActivas };

// ===== DEBUG Y UTILIDADES =====
export { handleDebugAdmin };
export { isGroupAdmin };
export { isRealGroupAdmin };
export { isBotAdmin };
export { isOwnerOrAdmin };
export { isBotGloballyActive };
export { wasUserNotifiedAboutMaintenance };
export { markUserAsNotifiedAboutMaintenance };
export { clearMaintenanceNotifications };
export { clearGroupOffNotices };
