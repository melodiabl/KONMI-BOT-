// diagnostico.js - Script para diagnosticar problemas del bot
import db from "./db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\n╔═══════════════════════════════════════════════════════════╗");
console.log("║          🔍 DIAGNÓSTICO DEL BOT KONMI                     ║");
console.log("╚═══════════════════════════════════════════════════════════╝\n");

async function diagnosticar() {
  try {
    // 1. Verificar estado global del bot
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("1️⃣  ESTADO GLOBAL DEL BOT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    try {
      const hasTable = await db.schema.hasTable("bot_global_state");
      if (!hasTable) {
        console.log("⚠️  Tabla 'bot_global_state' NO EXISTE");
        console.log("   Creando tabla...");
        await db.schema.createTable("bot_global_state", (table) => {
          table.increments("id").primary();
          table.boolean("is_on").defaultTo(true);
          table.timestamp("updated_at").defaultTo(db.fn.now());
        });
        await db("bot_global_state").insert({ is_on: true });
        console.log("✅ Tabla creada y bot activado globalmente\n");
      } else {
        const globalState = await db("bot_global_state").select("*").first();
        console.log("✅ Tabla 'bot_global_state' existe");
        console.log("   Estado actual:", JSON.stringify(globalState, null, 2));
        
        if (!globalState) {
          console.log("⚠️  No hay registro en la tabla");
          console.log("   Insertando registro por defecto...");
          await db("bot_global_state").insert({ is_on: true });
          console.log("✅ Registro creado con bot activo\n");
        } else {
          const isActive = globalState.is_on === 1 || globalState.is_on === true;
          if (isActive) {
            console.log("✅ Bot ACTIVO globalmente\n");
          } else {
            console.log("❌ Bot DESACTIVADO globalmente");
            console.log("   Para activarlo, ejecuta: /bot global on\n");
          }
        }
      }
    } catch (error) {
      console.error("❌ Error verificando estado global:", error.message);
    }

    // 2. Verificar autenticación de Baileys
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("2️⃣  AUTENTICACIÓN DE WHATSAPP");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    const authPath = path.join(__dirname, "storage", "baileys_full");
    const credsPath = path.join(authPath, "creds.json");
    
    if (fs.existsSync(credsPath)) {
      console.log("✅ Archivo creds.json existe");
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
        const hasKeys = creds?.noiseKey?.public && 
                       creds?.signedIdentityKey?.public && 
                       creds?.signedPreKey?.keyPair?.public;
        
        if (hasKeys) {
          console.log("✅ Credenciales válidas");
          console.log("   Número registrado:", creds.me?.id || "No disponible");
        } else {
          console.log("❌ Credenciales incompletas o corruptas");
          console.log("   Solución: Elimina la carpeta storage/baileys_full y reconecta");
        }
      } catch (error) {
        console.log("❌ Error leyendo credenciales:", error.message);
      }
    } else {
      console.log("❌ No hay archivo creds.json");
      console.log("   El bot necesita ser conectado con QR o pairing code");
    }
    console.log();

    // 3. Verificar grupos registrados
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("3️⃣  GRUPOS REGISTRADOS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    try {
      const hasGroupsTable = await db.schema.hasTable("groups");
      if (!hasGroupsTable) {
        console.log("⚠️  Tabla 'groups' NO EXISTE");
      } else {
        const groups = await db("groups").select("*");
        console.log(`✅ ${groups.length} grupo(s) registrado(s):`);
        
        for (const group of groups) {
          const isActive = group.is_active === 1 || group.is_active === true;
          const status = isActive ? "✅ ACTIVO" : "❌ INACTIVO";
          console.log(`   ${status} - ${group.group_id} (${group.group_name || "Sin nombre"})`);
        }
      }
    } catch (error) {
      console.error("❌ Error verificando grupos:", error.message);
    }
    console.log();

    // 4. Verificar owner
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("4️⃣  CONFIGURACIÓN DE OWNER");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
    if (ownerNumber) {
      console.log("✅ Owner configurado:", ownerNumber);
    } else {
      console.log("❌ No hay owner configurado en .env");
      console.log("   Agrega: OWNER_WHATSAPP_NUMBER=tu_numero");
    }
    console.log();

    // 5. Verificar proceso Node
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("5️⃣  RESUMEN Y RECOMENDACIONES");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    console.log("📋 Checklist:");
    console.log("   [ ] Bot conectado a WhatsApp");
    console.log("   [ ] Bot activo globalmente");
    console.log("   [ ] Grupos registrados y activos");
    console.log("   [ ] Owner configurado correctamente");
    console.log();
    console.log("🔧 Si el bot no procesa comandos:");
    console.log("   1. Verifica que el bot esté conectado (debe tener creds.json válido)");
    console.log("   2. Verifica que esté activo globalmente: /bot global on");
    console.log("   3. En grupos, verifica que esté activo: /bot on");
    console.log("   4. Prueba con un comando simple: /ping");
    console.log();

  } catch (error) {
    console.error("❌ Error durante diagnóstico:", error);
  } finally {
    await db.destroy();
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }
}

diagnosticar();
