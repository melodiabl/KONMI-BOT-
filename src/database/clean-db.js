import Database from 'better-sqlite3';

const db = new Database('./database.db');

console.log('🔧 Verificando estructura de la tabla subbots...');

// Verificar si la tabla existe
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subbots'").get();

if (tableExists) {
  console.log('📋 Tabla subbots existe, verificando columnas...');
  
  // Ver estructura actual
  const columns = db.prepare("PRAGMA table_info(subbots)").all();
  console.log('Columnas actuales:', columns.map(c => c.name).join(', '));
  
  // Verificar si falta la columna connected_at
  const hasConnectedAt = columns.some(c => c.name === 'connected_at');
  
  if (!hasConnectedAt) {
    console.log('⚠️  Falta columna connected_at, recreando tabla...');
    
    // Respaldar datos existentes
    const existingData = db.prepare("SELECT * FROM subbots").all();
    console.log(`📦 Respaldando ${existingData.length} registros...`);
    
    // Eliminar tabla antigua
    db.exec("DROP TABLE subbots");
    
    // Crear tabla con estructura correcta
    db.exec(`
      CREATE TABLE subbots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(255) UNIQUE NOT NULL,
        user_phone VARCHAR(255) NOT NULL,
        user_name VARCHAR(255),
        status VARCHAR(255) DEFAULT 'pending',
        connection_type VARCHAR(255) DEFAULT 'qr',
        qr_code TEXT,
        pairing_code VARCHAR(255),
        session_data TEXT,
        auth_path VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        connected_at DATETIME,
        is_active INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        settings JSON
      )
    `);
    
    // Crear índices
    db.exec(`
      CREATE INDEX idx_subbots_user_phone ON subbots(user_phone);
      CREATE INDEX idx_subbots_status ON subbots(status);
      CREATE INDEX idx_subbots_is_active ON subbots(is_active);
      CREATE INDEX idx_subbots_last_activity ON subbots(last_activity);
    `);
    
    console.log('✅ Tabla subbots recreada con estructura correcta');
    
    // Restaurar datos si había alguno
    if (existingData.length > 0) {
      const insert = db.prepare(`
        INSERT INTO subbots (code, user_phone, user_name, status, connection_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const row of existingData) {
        insert.run(
          row.code || `SUB${Date.now()}`,
          row.user_phone || row.request_jid || 'unknown',
          row.user_name,
          row.status || 'pending',
          row.connection_type || 'qr',
          row.created_at || new Date().toISOString()
        );
      }
      console.log(`✅ ${existingData.length} registros restaurados`);
    }
  } else {
    console.log('✅ Tabla subbots tiene todas las columnas necesarias');
  }
} else {
  console.log('❌ Tabla subbots no existe, será creada por las migraciones');
}

db.close();
console.log('\n✅ Verificación completada');