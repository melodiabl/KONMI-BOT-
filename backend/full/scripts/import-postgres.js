import knex from 'knex';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import knexfile from '../knexfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración para PostgreSQL
const config = {
  ...knexfile.development,
  client: 'pg', // Forzar cliente PostgreSQL
};

const db = knex(config);

async function importTableFromJson(tableName) {
  try {
    const filePath = join(__dirname, '..', 'exports', `${tableName}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Archivo no encontrado para la tabla ${tableName}`);
      return 0;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (data.length === 0) {
      console.log(`ℹ️  La tabla ${tableName} está vacía, omitiendo...`);
      return 0;
    }
    
    // Insertar datos en lotes para evitar problemas de rendimiento
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      await db.batchInsert(tableName, batch).returning('*');
      inserted += batch.length;
      console.log(`  → Lote de ${batch.length} registros insertados en ${tableName} (${inserted}/${data.length})`);
    }
    
    console.log(`✅ Tabla ${tableName} importada correctamente (${inserted} registros)`);
    return inserted;
  } catch (error) {
    console.error(`❌ Error al importar la tabla ${tableName}:`, error.message);
    return 0;
  }
}

async function getAllJsonFiles() {
  const exportsDir = join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) {
    console.error('❌ No se encontró el directorio de exportaciones');
    return [];
  }
  
  const files = fs.readdirSync(exportsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
    
  return files;
}

async function importAllTables() {
  try {
    const tables = await getAllJsonFiles();
    
    if (tables.length === 0) {
      console.log('❌ No se encontraron archivos de exportación. Ejecuta primero export-sqlite.js');
      return;
    }
    
    console.log('📋 Tablas a importar:', tables);
    
    let totalImported = 0;
    
    for (const table of tables) {
      console.log(`\n📥 Importando tabla: ${table}`);
      const count = await importTableFromJson(table);
      totalImported += count;
    }
    
    console.log(`\n✅ Importación completada. Total de registros importados: ${totalImported}`);
  } catch (error) {
    console.error('❌ Error durante la importación:', error);
  } finally {
    await db.destroy();
  }
}

// Ejecutar la importación
importAllTables();
