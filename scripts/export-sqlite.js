import knex from 'knex';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import knexfile from '../knexfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración para SQLite
const config = {
  ...knexfile.development,
  connection: {
    filename: join(__dirname, '..', 'storage', 'database.sqlite')
  }
};

const db = knex(config);

async function exportTableToJson(tableName) {
  try {
    const data = await db(tableName).select('*');
    const exportPath = join(__dirname, '..', 'exports', `${tableName}.json`);
    
    // Crear directorio si no existe
    if (!fs.existsSync(join(__dirname, '..', 'exports'))) {
      fs.mkdirSync(join(__dirname, '..', 'exports'));
    }
    
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
    console.log(`✅ Tabla ${tableName} exportada correctamente`);
    return data;
  } catch (error) {
    console.error(`❌ Error al exportar la tabla ${tableName}:`, error.message);
    return [];
  }
}

async function getAllTables() {
  // Obtener todas las tablas de SQLite
  const tables = await db.raw(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
  );
  return tables.map(row => row.name);
}

async function exportAllTables() {
  try {
    const tables = await getAllTables();
    console.log('📋 Tablas encontradas:', tables);
    
    for (const table of tables) {
      await exportTableToJson(table);
    }
    
    console.log('\n✅ Exportación completada. Los archivos se encuentran en la carpeta /backend/full/exports');
  } catch (error) {
    console.error('❌ Error al exportar tablas:', error);
  } finally {
    await db.destroy();
  }
}

exportAllTables();
