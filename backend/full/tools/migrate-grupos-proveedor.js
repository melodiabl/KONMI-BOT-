import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrateGruposProveedor() {
  console.log(' Migrando tabla grupos_autorizados para agregar campo proveedor...');
  try {
    // Verificar si la columna proveedor ya existe en grupos_autorizados
    const tableInfo = await db.raw("PRAGMA table_info(grupos_autorizados)");
    const hasProveedorColumn = tableInfo && tableInfo.length > 0 && tableInfo.some(column => column.name === 'proveedor');

    if (!hasProveedorColumn) {
      console.log(' Agregando columna proveedor a la tabla grupos_autorizados...');
      await db.raw('ALTER TABLE grupos_autorizados ADD COLUMN proveedor TEXT');
      console.log(' Columna proveedor agregada correctamente');

      // Actualizar registros existentes con un proveedor por defecto
      await db('grupos_autorizados').whereNull('proveedor').update({ proveedor: 'General' });
      console.log(' Registros existentes actualizados con proveedor por defecto');
    } else {
      console.log(' La columna proveedor ya existe en grupos_autorizados');
    }
  } catch (error) {
    console.error(' Error durante la migracin:', error);
  } finally {
    console.log(' Migracin de grupos completada');
  }
}

migrateGruposProveedor().catch(console.error);
