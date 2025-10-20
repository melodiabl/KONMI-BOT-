#!/usr/bin/env node

/**
 * 🔍 Script de Verificación del Sistema
 * Verifica que todos los requisitos estén listos antes de arrancar el bot
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  section: (msg) =>
    console.log(
      `\n${colors.cyan}${colors.bright}━━━ ${msg} ━━━${colors.reset}\n`,
    ),
};

let errorCount = 0;
let warningCount = 0;

// Verificaciones
const checks = {
  async nodeVersion() {
    log.section("Verificando Node.js");
    try {
      const { stdout } = await execAsync("node --version");
      const version = stdout.trim();
      const majorVersion = parseInt(version.slice(1).split(".")[0]);

      if (majorVersion >= 16) {
        log.success(`Node.js ${version} detectado (Requisito: >=16)`);
        return true;
      } else {
        log.error(`Node.js ${version} es muy antiguo. Se requiere >=16`);
        errorCount++;
        return false;
      }
    } catch (error) {
      log.error("No se pudo verificar la versión de Node.js");
      errorCount++;
      return false;
    }
  },

  async npmVersion() {
    try {
      const { stdout } = await execAsync("npm --version");
      const version = stdout.trim();
      log.success(`npm ${version} detectado`);
      return true;
    } catch (error) {
      log.warning("npm no detectado, pero puede no ser necesario si usas yarn");
      warningCount++;
      return true;
    }
  },

  async nodeModules() {
    log.section("Verificando Dependencias");
    const nodeModulesPath = join(__dirname, "node_modules");

    if (existsSync(nodeModulesPath)) {
      log.success("Carpeta node_modules existe");

      // Verificar dependencias críticas
      const criticalDeps = [
        "@whiskeysockets/baileys",
        "baileys-mod",
        "express",
        "qrcode",
        "sqlite3",
        "jsonwebtoken",
        "dotenv",
      ];

      let allDepsOk = true;
      for (const dep of criticalDeps) {
        const depPath = join(nodeModulesPath, dep);
        if (existsSync(depPath)) {
          log.success(`  ${dep} instalado`);
        } else {
          log.error(`  ${dep} NO instalado`);
          allDepsOk = false;
          errorCount++;
        }
      }

      if (!allDepsOk) {
        log.error("Ejecuta: npm install");
      }

      return allDepsOk;
    } else {
      log.error("Carpeta node_modules NO existe");
      log.error("Ejecuta: npm install");
      errorCount++;
      return false;
    }
  },

  async storageFolders() {
    log.section("Verificando Estructura de Carpetas");
    const requiredFolders = [
      "storage",
      "storage/logs",
      "storage/subbots",
      "storage/sessions",
      "storage/baileys_full",
      "storage/media",
      "storage/downloads",
      "storage/backups",
    ];

    let allOk = true;
    for (const folder of requiredFolders) {
      const folderPath = join(__dirname, folder);
      if (existsSync(folderPath)) {
        log.success(`Carpeta ${folder}/ existe`);
      } else {
        log.warning(`Carpeta ${folder}/ NO existe - Será creada`);
        try {
          mkdirSync(folderPath, { recursive: true });
          log.success(`  ✓ Creada ${folder}/`);
        } catch (error) {
          log.error(`  ✗ Error al crear ${folder}/: ${error.message}`);
          errorCount++;
          allOk = false;
        }
      }
    }

    return allOk;
  },

  async database() {
    log.section("Verificando Base de Datos");
    const dbPath = join(__dirname, "storage", "database.sqlite");

    if (existsSync(dbPath)) {
      log.success("Base de datos SQLite existe");

      // Verificar que db.js es accesible
      try {
        const dbModule = await import('./db.js');
        log.success('Módulo db.js es accesible');

        // Intentar consulta simple
        try {
          const tables = await dbModule.default.raw(
            "SELECT name FROM sqlite_master WHERE type='table'",
          );
          const tableNames = tables.map((t) => t.name);

          const requiredTables = [
            "usuarios",
            "subbots",
            "grupos_autorizados",
            "aportes",
            "bot_global_state",
          ];

          let allTablesOk = true;
          for (const table of requiredTables) {
            if (tableNames.includes(table)) {
              log.success(`  Tabla '${table}' existe`);
            } else {
              log.error(`  Tabla '${table}' NO existe`);
              allTablesOk = false;
              errorCount++;
            }
          }

          if (!allTablesOk) {
            log.error("Ejecuta las migraciones: npm run migrate");
          }

          return allTablesOk;
        } catch (error) {
          log.warning(`No se pudo verificar tablas: ${error.message}`);
          warningCount++;
          return true;
        }
      } catch (error) {
        log.error(`Error al cargar db.js: ${error.message}`);
        errorCount++;
        return false;
      }
    } else {
      log.warning("Base de datos no existe - Será creada al arrancar");
      warningCount++;
      return true;
    }
  },

  async envFile() {
    log.section("Verificando Archivo .env");
    const envPath = join(__dirname, ".env");

    if (existsSync(envPath)) {
      log.success("Archivo .env existe");

      try {
        const envContent = readFileSync(envPath, "utf-8");

        const requiredVars = ["PORT", "JWT_SECRET"];

        const optionalVars = [
          "GEMINI_API_KEY",
          "LOG_LEVEL",
          "LOG_TO_FILE",
          "FRONTEND_URL",
        ];

        let allVarsOk = true;
        for (const varName of requiredVars) {
          if (envContent.includes(`${varName}=`)) {
            log.success(`  Variable ${varName} configurada`);
          } else {
            log.error(`  Variable ${varName} NO configurada`);
            allVarsOk = false;
            errorCount++;
          }
        }

        for (const varName of optionalVars) {
          if (envContent.includes(`${varName}=`)) {
            log.success(`  Variable ${varName} configurada (opcional)`);
          } else {
            log.info(`  Variable ${varName} no configurada (opcional)`);
          }
        }

        return allVarsOk;
      } catch (error) {
        log.error(`Error al leer .env: ${error.message}`);
        errorCount++;
        return false;
      }
    } else {
      log.error("Archivo .env NO existe");
      log.error("Crea un archivo .env con las variables necesarias");
      errorCount++;
      return false;
    }
  },

  async coreFiles() {
    log.section("Verificando Archivos Core");
    const coreFiles = [
      "index.js",
      "whatsapp.js",
      "api.js",
      "auth.js",
      "db.js",
      "config.js",
      "subbot-manager.js",
      "config/logger.js",
    ];

    let allOk = true;
    for (const file of coreFiles) {
      const filePath = join(__dirname, file);
      if (existsSync(filePath)) {
        log.success(`Archivo ${file} existe`);
      } else {
        log.error(`Archivo ${file} NO existe`);
        allOk = false;
        errorCount++;
      }
    }

    return allOk;
  },

  async portAvailable() {
    log.section("Verificando Puerto");
    try {
      // Cargar .env para obtener el puerto
      const envPath = join(__dirname, ".env");
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        const portMatch = envContent.match(/PORT=(\d+)/);
        const port = portMatch ? portMatch[1] : "3000";

        // Intentar verificar si el puerto está en uso (Windows)
        try {
          const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
          if (stdout.trim()) {
            log.warning(`Puerto ${port} parece estar en uso`);
            log.info("Si el bot ya está corriendo, ignora este mensaje");
            warningCount++;
          } else {
            log.success(`Puerto ${port} disponible`);
          }
        } catch (error) {
          // Si el comando falla, asumimos que el puerto está libre
          log.success(`Puerto ${port} probablemente disponible`);
        }
      } else {
        log.warning("No se pudo verificar puerto (archivo .env no existe)");
        warningCount++;
      }
      return true;
    } catch (error) {
      log.warning(
        `No se pudo verificar disponibilidad de puerto: ${error.message}`,
      );
      warningCount++;
      return true;
    }
  },
};

// Ejecutar todas las verificaciones
async function runAllChecks() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║    🔍 VERIFICACIÓN DEL SISTEMA - KONMI BOT v2.5.0         ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  const startTime = Date.now();

  // Ejecutar todas las verificaciones
  await checks.nodeVersion();
  await checks.npmVersion();
  await checks.nodeModules();
  await checks.storageFolders();
  await checks.database();
  await checks.envFile();
  await checks.coreFiles();
  await checks.portAvailable();

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Resumen final
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                   📊 RESUMEN FINAL                         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  if (errorCount === 0 && warningCount === 0) {
    log.success(`✨ SISTEMA 100% LISTO - Todo verificado correctamente`);
    log.info(`⏱️  Tiempo de verificación: ${duration}s`);
    console.log("\n");
    console.log(
      `${colors.green}${colors.bright}Puedes arrancar el bot con:${colors.reset}`,
    );
    console.log(`${colors.cyan}  npm start${colors.reset}`);
    console.log("\n");
    process.exit(0);
  } else if (errorCount === 0 && warningCount > 0) {
    log.warning(`Sistema listo con ${warningCount} advertencia(s)`);
    log.info(`⏱️  Tiempo de verificación: ${duration}s`);
    console.log("\n");
    console.log(
      `${colors.yellow}Puedes arrancar el bot, pero revisa las advertencias:${colors.reset}`,
    );
    console.log(`${colors.cyan}  npm start${colors.reset}`);
    console.log("\n");
    process.exit(0);
  } else {
    log.error(`❌ SISTEMA NO LISTO - ${errorCount} error(es) encontrado(s)`);
    if (warningCount > 0) {
      log.warning(`También hay ${warningCount} advertencia(s)`);
    }
    log.info(`⏱️  Tiempo de verificación: ${duration}s`);
    console.log("\n");
    console.log(
      `${colors.red}${colors.bright}Soluciona los errores antes de arrancar el bot${colors.reset}`,
    );
    console.log("\n");
    console.log(`${colors.yellow}Pasos sugeridos:${colors.reset}`);
    console.log(`${colors.cyan}  1. npm install${colors.reset}`);
    console.log(`${colors.cyan}  2. Revisa el archivo .env${colors.reset}`);
    console.log(`${colors.cyan}  3. Ejecuta: npm run migrate${colors.reset}`);
    console.log(
      `${colors.cyan}  4. Vuelve a ejecutar: node verify-system.js${colors.reset}`,
    );
    console.log("\n");
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on("unhandledRejection", (error) => {
  log.error(`Error no manejado: ${error.message}`);
  process.exit(1);
});

// Ejecutar
runAllChecks();
