// test-bot-connection.js - Script para verificar la conexión del bot
import { getSocket, getConnectionStatus } from "./whatsapp.js";

console.log("\n╔═══════════════════════════════════════════════════════════╗");
console.log("║          🔌 TEST DE CONEXIÓN DEL BOT                      ║");
console.log("╚═══════════════════════════════════════════════════════════╝\n");

async function testConnection() {
  try {
    console.log("1️⃣  Verificando socket...");
    const sock = getSocket();

    if (!sock) {
      console.log("❌ No hay socket disponible");
      console.log("   El bot no está conectado o no se ha iniciado\n");
      return;
    }

    console.log("✅ Socket disponible");
    console.log("   Tipo:", typeof sock);
    console.log("   Tiene ev:", !!sock.ev);
    console.log("   Tiene sendMessage:", typeof sock.sendMessage === "function");
    console.log();

    console.log("2️⃣  Verificando estado de conexión...");
    const status = getConnectionStatus();
    console.log("   Estado:", JSON.stringify(status, null, 2));
    console.log();

    console.log("3️⃣  Verificando información del bot...");
    if (sock.user) {
      console.log("✅ Bot autenticado:");
      console.log("   ID:", sock.user.id);
      console.log("   Nombre:", sock.user.name || "No disponible");
      console.log();
    } else {
      console.log("⚠️  No hay información de usuario disponible");
      console.log("   El bot puede no estar completamente conectado\n");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 RESUMEN:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (sock && sock.user && status.status === "connected") {
      console.log("✅ El bot está CONECTADO y listo para recibir mensajes");
      console.log("   Si no procesa comandos, verifica:");
      console.log("   1. Que el bot esté activo globalmente: /bot global on");
      console.log("   2. En grupos, que esté activo: /bot on");
      console.log("   3. Que el grupo esté registrado: /addgroup");
    } else if (sock && !sock.user) {
      console.log("⚠️  El bot tiene socket pero no está autenticado");
      console.log("   Posiblemente está esperando escanear QR o pairing code");
    } else {
      console.log("❌ El bot NO está conectado");
      console.log("   Inicia el bot con: npm start");
    }
    console.log();

  } catch (error) {
    console.error("❌ Error durante el test:", error.message);
  }
}

// Esperar un poco para que el módulo se cargue
setTimeout(testConnection, 1000);
