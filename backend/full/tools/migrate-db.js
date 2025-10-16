import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrateDatabase() {
  console.log(' Migrando base de datos...');
  try {
    // Verificar si la columna proveedor ya existe
    const tableInfo = await db.raw("PRAGMA table_info(manhwas)");
    const hasProveedorColumn = tableInfo && tableInfo.length > 0 && tableInfo.some(column => column.name === 'proveedor');

    if (!hasProveedorColumn) {
      console.log(' Agregando columna proveedor a la tabla manhwas...');
      await db.raw('ALTER TABLE manhwas ADD COLUMN proveedor TEXT');
      console.log(' Columna proveedor agregada correctamente');

      // Actualizar registros existentes con un proveedor por defecto
      await db('manhwas').whereNull('proveedor').update({ proveedor: 'Grupo BL General' });
      console.log(' Registros existentes actualizados con proveedor por defecto');
    } else {
      console.log(' La columna proveedor ya existe');
    }
  } catch (error) {
    console.error(' Error durante la migracion:', error);
  } finally {
    console.log(' Migracion completada');
  }
}

migrateDatabase().catch(console.error);
