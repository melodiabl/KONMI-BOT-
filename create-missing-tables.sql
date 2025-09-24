-- Tabla para aportes
CREATE TABLE IF NOT EXISTS aportes (
    id SERIAL PRIMARY KEY,
    contenido TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    usuario VARCHAR(50) NOT NULL,
    grupo VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'pendiente',
    procesado_por VARCHAR(50),
    fecha_procesado TIMESTAMP
);

-- Tabla para manhwas
CREATE TABLE IF NOT EXISTS manhwas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    autor VARCHAR(255),
    genero VARCHAR(100),
    estado VARCHAR(50),
    descripcion TEXT,
    url TEXT,
    proveedor VARCHAR(100),
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(50)
);

-- Tabla para pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    texto TEXT NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente',
    usuario VARCHAR(50) NOT NULL,
    grupo VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para ilustraciones
CREATE TABLE IF NOT EXISTS ilustraciones (
    id SERIAL PRIMARY KEY,
    imagen TEXT NOT NULL,
    usuario VARCHAR(50) NOT NULL,
    grupo VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para votaciones
CREATE TABLE IF NOT EXISTS votaciones (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    opciones TEXT NOT NULL,
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'activa',
    creador VARCHAR(50) NOT NULL
);

-- Tabla para votos
CREATE TABLE IF NOT EXISTS votos (
    id SERIAL PRIMARY KEY,
    votacion_id INTEGER REFERENCES votaciones(id),
    usuario VARCHAR(50) NOT NULL,
    opcion VARCHAR(255) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(votacion_id, usuario)
);

-- Tabla para archivos
CREATE TABLE IF NOT EXISTS archivos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    url TEXT,
    tipo VARCHAR(50),
    tamaño BIGINT,
    usuario VARCHAR(50) NOT NULL,
    grupo VARCHAR(255),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para configuración del sistema
CREATE TABLE IF NOT EXISTS configuracion (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(100) UNIQUE NOT NULL,
    valor TEXT,
    descripcion TEXT,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para estado global del bot
CREATE TABLE IF NOT EXISTS bot_global_state (
    id SERIAL PRIMARY KEY,
    is_on BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para códigos de subbots
CREATE TABLE IF NOT EXISTS subbot_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(8) UNIQUE NOT NULL,
    subbot_id VARCHAR(50),
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Tabla para códigos QR de subbots
CREATE TABLE IF NOT EXISTS subbot_qrs (
    id SERIAL PRIMARY KEY,
    qr_id VARCHAR(50) UNIQUE NOT NULL,
    subbot_id VARCHAR(50),
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    qr_data TEXT
);

-- Tabla principal de subbots
CREATE TABLE IF NOT EXISTS subbots (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'qr',
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_by VARCHAR(30),
    request_jid VARCHAR(150),
    request_participant VARCHAR(150),
    target_number VARCHAR(30),
    qr_data TEXT,
    pairing_code VARCHAR(12),
    api_token VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Tabla de logs del bot
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    comando VARCHAR(100) NOT NULL,
    usuario VARCHAR(100) NOT NULL,
    grupo VARCHAR(150),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    detalles TEXT
);

-- Insertar configuración inicial
INSERT INTO configuracion (clave, valor, descripcion) VALUES 
('bot_name', 'KONMI BOT', 'Nombre del bot'),
('bot_version', '2.5.0', 'Versión del bot'),
('modo_privado', 'false', 'Modo privado del bot'),
('modo_amigos', 'false', 'Modo amigos del bot'),
('advertencias_activas', 'true', 'Sistema de advertencias activo')
ON CONFLICT (clave) DO NOTHING;







