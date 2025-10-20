/** Determina si el usuario es el owner específico o el mismo bot */
function isSpecificOwner(usuario) {
  if (!usuario) return false;

  // Obtener el número del usuario normalizado (sin @s.whatsapp.net)
  const userNum = String(usuario).split("@")[0].split(":")[0].replace(/[^0-9]/g, "");

  // Obtener el número del owner desde las variables de entorno o configuración
  const ownerNum = String(
    process.env.OWNER_WHATSAPP_NUMBER ||
    (Array.isArray(global.owner) ? global.owner[0]?.[0] : "") ||
    ""
  ).replace(/[^0-9]/g, "");

  // Obtener el número del bot actual (si está disponible en el socket)
  let botNumber = "";
  try {
    const socket = getSocket();
    if (socket?.user?.id) {
      botNumber = String(socket.user.id.split("@")[0]).replace(/[^0-9]/g, "");
    }
  } catch (e) {
    console.error("Error obteniendo número del bot:", e);
  }

  // Verificar si el usuario es el owner o el mismo bot
  const isOwner = ownerNum && userNum === ownerNum;
  const isBot = botNumber && userNum === botNumber;

  if (isOwner || isBot) {
    console.log(`[AUTH] Usuario autenticado como ${isBot ? 'BOT' : 'OWNER'}: ${userNum}`);
    return true;
  }

  return false;
}
