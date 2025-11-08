import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'storage', 'database.sqlite');
const backupDir = join(__dirname, 'storage', 'backups');

// Crear directorio de respaldos si no existe
if (!existsSync(backupDir)) {
  mkdirSync(backupDir, { recursive: true });
}

// Generar nombre de archivo con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = join(backupDir, `database-${timestamp}.sqlite`);

try {
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, backupPath);
    console.log(` Copia de seguridad creada en: ${backupPath}`);
  } else {
    console.log(' No se encontr la base de datos original, creando una nueva...');
  }
} catch (error) {
  console.error(' Error al crear la copia de seguridad:', error.message);
}
