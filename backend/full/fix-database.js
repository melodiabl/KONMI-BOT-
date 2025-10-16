// fix-database.js - Script para crear todas las tablas necesarias
import db from "./db.js";

console.log("\n╔═══════════════════════════════════════════════════════════╗");
console.log("║          🔧 REPARACIÓN DE BASE DE DATOS                   ║");
console.log("╚═══════════════════════════════════════════════════════════╝\n");

async function crearTablas() {
  try {
    // 1. Tabla bot_global_state
    console.log("1️⃣  Verificando tabla bot_global_state...");
    const hasBotGlobalState = await db.schema.hasTable("bot_global_state");
    if (!hasBotGlobalState) {
      await db.schema.createTable("bot_global_state", (table) => {
        table.increments("id").primary();
        table.boolean("is_on").defaultTo(true);
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("updated_at").defaultTo(db.fn.now());
      });
      await db("bot_global_state").insert({ is_on: true });
      console.log("   ✅ Tabla bot_global_state creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 2. Tabla groups
    console.log("2️⃣  Verificando tabla groups...");
    const hasGroups = await db.schema.hasTable("groups");
    if (!hasGroups) {
      await db.schema.createTable("groups", (table) => {
        table.increments("id").primary();
        table.string("group_id").unique().notNullable();
        table.string("group_name").nullable();
        table.boolean("is_active").defaultTo(true);
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("updated_at").defaultTo(db.fn.now());
      });
      console.log("   ✅ Tabla groups creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 3. Tabla users
    console.log("3️⃣  Verificando tabla users...");
    const hasUsers = await db.schema.hasTable("users");
    if (!hasUsers) {
      await db.schema.createTable("users", (table) => {
        table.increments("id").primary();
        table.string("phone").unique().notNullable();
        table.string("name").nullable();
        table.string("role").defaultTo("user"); // user, admin, owner
        table.boolean("is_banned").defaultTo(false);
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("updated_at").defaultTo(db.fn.now());
      });
      console.log("   ✅ Tabla users creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 4. Tabla aportes
    console.log("4️⃣  Verificando tabla aportes...");
    const hasAportes = await db.schema.hasTable("aportes");
    if (!hasAportes) {
      await db.schema.createTable("aportes", (table) => {
        table.increments("id").primary();
        table.string("user_phone").notNullable();
        table.string("user_name").nullable();
        table.string("content_type").notNullable(); // video, image, document
        table.string("file_path").notNullable();
        table.text("caption").nullable();
        table.string("status").defaultTo("pending"); // pending, approved, rejected
        table.string("category").nullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("updated_at").defaultTo(db.fn.now());
      });
      console.log("   ✅ Tabla aportes creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 5. Tabla subbots
    console.log("5️⃣  Verificando tabla subbots...");
    const hasSubbots = await db.schema.hasTable("subbots");
    if (!hasSubbots) {
      await db.schema.createTable("subbots", (table) => {
        table.increments("id").primary();
        table.string("code").unique().notNullable();
        table.string("user_phone").notNullable();
        table.string("user_name").nullable();
        table.string("status").defaultTo("pending");
        table.string("connection_type").defaultTo("qr");
        table.text("qr_code").nullable();
        table.string("pairing_code").nullable();
        table.text("session_data").nullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("last_activity").defaultTo(db.fn.now());
        table.timestamp("connected_at").nullable();
        table.boolean("is_active").defaultTo(false);
        table.integer("message_count").defaultTo(0);
        table.json("settings").nullable();
      });
      console.log("   ✅ Tabla subbots creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 6. Tabla subbot_events
    console.log("6️⃣  Verificando tabla subbot_events...");
    const hasSubbotEvents = await db.schema.hasTable("subbot_events");
    if (!hasSubbotEvents) {
      await db.schema.createTable("subbot_events", (table) => {
        table.increments("id").primary();
        table.string("code").notNullable();
        table.string("event").notNullable();
        table.json("payload").nullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
      console.log("   ✅ Tabla subbot_events creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    // 7. Tabla extra_content
    console.log("7️⃣  Verificando tabla extra_content...");
    const hasExtraContent = await db.schema.hasTable("extra_content");
    if (!hasExtraContent) {
      await db.schema.createTable("extra_content", (table) => {
        table.increments("id").primary();
        table.string("name").notNullable();
        table.string("type").notNullable(); // extra, ilustracion, pack
        table.string("file_path").notNullable();
        table.text("description").nullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
      console.log("   ✅ Tabla extra_content creada\n");
    } else {
      console.log("   ✅ Ya existe\n");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ TODAS LAS TABLAS VERIFICADAS Y CREADAS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  } catch (error) {
    console.error("❌ Error creando tablas:", error);
  } finally {
    await db.destroy();
  }
}

crearTablas();
