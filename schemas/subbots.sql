CREATE TABLE IF NOT EXISTS subbots (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) UNIQUE NOT NULL,
    user_phone VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    session_data TEXT,
    qr_code TEXT,
    pairing_code VARCHAR(50),
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);