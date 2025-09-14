import db from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateDatabaseForProviders() {
  try {
    console.log('🔄 Actualizando base de datos para sistema de proveedores automático...');

    // Agregar columnas a la tabla aportes para proveedores
    const alterQueries = [
      'ALTER TABLE aportes ADD COLUMN archivo_path TEXT DEFAULT NULL',
      'ALTER TABLE aportes ADD COLUMN archivo_size INTEGER DEFAULT 0',
      'ALTER TABLE aportes ADD COLUMN proveedor TEXT DEFAULT NULL',
      'ALTER TABLE aportes ADD COLUMN manhwa_titulo TEXT DEFAULT NULL',
      'ALTER TABLE aportes ADD COLUMN contenido_tipo TEXT DEFAULT NULL',
      'ALTER TABLE aportes ADD COLUMN mensaje_original TEXT DEFAULT NULL'
    ];

    for (const query of alterQueries) {
      try {
        await db.raw(query);
        console.log(`✅ Columna agregada: ${query.split('ADD COLUMN ')[1]?.split(' ')[0]}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⚠️ Columna ya existe: ${query.split('ADD COLUMN ')[1]?.split(' ')[0]}`);
        } else {
          console.error(`❌ Error agregando columna: ${error.message}`);
        }
      }
    }

    // Crear tabla para estadísticas de proveedores
    await db.exec(`
      CREATE TABLE IF NOT EXISTS estadisticas_proveedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proveedor TEXT NOT NULL,
        fecha DATE NOT NULL,
        total_aportes INTEGER DEFAULT 0,
        total_archivos INTEGER DEFAULT 0,
        espacio_usado INTEGER DEFAULT 0,
        manhwas_detectados INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(proveedor, fecha)
      )
    `);

    // Crear tabla para títulos de manhwa detectados
    await db.exec(`
      CREATE TABLE IF NOT EXISTS manhwa_titulos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT UNIQUE NOT NULL,
        titulo_normalizado TEXT NOT NULL,
        frecuencia INTEGER DEFAULT 1,
        primera_deteccion DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultima_deteccion DATETIME DEFAULT CURRENT_TIMESTAMP,
        estado TEXT DEFAULT 'activo',
        sinonimos TEXT DEFAULT '[]'
      )
    `);

    // Crear tabla para configuración de detección automática
    await db.exec(`
      CREATE TABLE IF NOT EXISTS configuracion_deteccion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave TEXT UNIQUE NOT NULL,
        valor TEXT NOT NULL,
        descripcion TEXT,
        tipo TEXT DEFAULT 'string',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insertar configuraciones por defecto para detección
    await db.exec(`
      INSERT OR IGNORE INTO configuracion_deteccion (clave, valor, descripcion, tipo) VALUES
      ('auto_detection_enabled', 'true', 'Activar detección automática de aportes', 'boolean'),
      ('min_title_length', '3', 'Longitud mínima para títulos de manhwa', 'number'),
      ('max_title_length', '50', 'Longitud máxima para títulos de manhwa', 'number'),
      ('detection_confidence_threshold', '0.7', 'Umbral de confianza para detección', 'number'),
      ('auto_cleanup_enabled', 'true', 'Activar limpieza automática de títulos duplicados', 'boolean'),
      ('provider_notification_enabled', 'true', 'Enviar notificaciones de nuevos aportes', 'boolean')
    `);

    // Crear índices para optimizar consultas
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_aportes_proveedor ON aportes(proveedor)',
      'CREATE INDEX IF NOT EXISTS idx_aportes_manhwa_titulo ON aportes(manhwa_titulo)',
      'CREATE INDEX IF NOT EXISTS idx_aportes_contenido_tipo ON aportes(contenido_tipo)',
      'CREATE INDEX IF NOT EXISTS idx_aportes_tipo_fecha ON aportes(tipo, fecha)',
      'CREATE INDEX IF NOT EXISTS idx_estadisticas_proveedor_fecha ON estadisticas_proveedores(proveedor, fecha)',
      'CREATE INDEX IF NOT EXISTS idx_manhwa_titulos_normalizado ON manhwa_titulos(titulo_normalizado)'
    ];

    for (const indexQuery of indexes) {
      try {
        await db.exec(indexQuery);
        console.log(`✅ Índice creado: ${indexQuery.split('idx_')[1]?.split(' ')[0]}`);
      } catch (error) {
        console.log(`⚠️ Índice ya existe o error: ${error.message}`);
      }
    }

    // Actualizar tabla logs para incluir más detalles
    try {
      await db.exec('ALTER TABLE logs ADD COLUMN detalles TEXT DEFAULT NULL');
      console.log('✅ Columna detalles agregada a logs');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('❌ Error agregando columna detalles a logs:', error.message);
      }
    }

    // Verificar estructura final
    const tablesInfo = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN (
        'aportes', 'estadisticas_proveedores', 'manhwa_titulos', 'configuracion_deteccion'
      )
    `);

    console.log('✅ Tablas verificadas:', tablesInfo.map(t => t.name).join(', '));

    // Mostrar estructura de la tabla aportes actualizada
    const aportesColumns = await db.all('PRAGMA table_info(aportes)');
    console.log('📋 Estructura tabla aportes actualizada:');
    aportesColumns.forEach(col => {
      console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
    });

    // Insertar algunos títulos de manhwa conocidos para mejorar la detección
    const knownTitles = [
      'Jinx', 'Painter of the Night', 'Killing Stalking', 'BJ Alex',
      'Cherry Blossoms After Winter', 'Love is an Illusion', 'Warehouse',
      'Sign', 'Pearl Boy', 'Banana Scandal', 'Semantic Error', 'Viewfinder',
      'Under the Green Light', 'Define the Relationship', 'Love Shuttle',
      'At the End of the Road', 'Walk on Water', 'Royal Servant',
      'Blood Bank', 'Ten Count', 'Given', 'Doukyuusei', 'Hitorijime My Hero'
    ];

    for (const title of knownTitles) {
      try {
        await db.run(`
          INSERT OR IGNORE INTO manhwa_titulos (titulo, titulo_normalizado, frecuencia) 
          VALUES (?, ?, 0)
        `, [title, title.toLowerCase().replace(/[^a-z0-9]/g, '')]);
      } catch (error) {
        console.error(`Error insertando título ${title}:`, error.message);
      }
    }

    console.log(`✅ ${knownTitles.length} títulos de manhwa conocidos insertados`);

    await db.close();
    console.log('✅ Base de datos actualizada correctamente para sistema de proveedores automático');

  } catch (error) {
    console.error('❌ Error actualizando base de datos:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  updateDatabaseForProviders()
    .then(() => {
      console.log('🎉 Actualización de proveedores completada exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en la actualización:', error);
      process.exit(1);
    });
}

export { updateDatabaseForProviders };
