-- Tabla para almacenar los aportes de los usuarios
CREATE TABLE IF NOT EXISTS aportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL,           -- ID del usuario que hizo el aporte
    grupo TEXT,                      -- ID del grupo (opcional)
    tipo TEXT NOT NULL,              -- Tipo de aporte: 'general', 'media', etc.
    contenido TEXT NOT NULL,         -- Contenido del aporte
    descripcion TEXT DEFAULT '',     -- Descripción opcional
    archivo_path TEXT,               -- Ruta al archivo multimedia
    estado TEXT DEFAULT 'pendiente', -- Estado: 'pendiente', 'aprobado', 'rechazado'
    fuente TEXT DEFAULT '',          -- Fuente: 'whatsapp', 'web', etc.
    metadata TEXT,                   -- Metadatos en formato JSON
    fecha TEXT NOT NULL,             -- Fecha de creación en ISO
    updated_at TEXT NOT NULL         -- Fecha de actualización en ISO
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_aporte_usuario ON aportes(usuario);
CREATE INDEX IF NOT EXISTS idx_aporte_grupo ON aportes(grupo);
CREATE INDEX IF NOT EXISTS idx_aporte_estado ON aportes(estado);
CREATE INDEX IF NOT EXISTS idx_aporte_fecha ON aportes(fecha);
