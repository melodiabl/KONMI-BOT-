import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno desde backend/full/.env (y tambin intentar fallback genrico)
try { dotenv.config({ path: join(__dirname, '.env') }); } catch {}
try { dotenv.config(); } catch {}

function makePgConnection(env) {
  // Prefer DATABASE_URL when provided
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const defaultHost = env === 'production' ? 'db' : 'localhost';
  return {
    host: process.env.DB_HOST || defaultHost,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD || 'superpass',
    database: process.env.DB_NAME || 'appdb'
  };
}

function makeSqliteConnection() {
  const file = process.env.DATABASE_PATH || join(__dirname, 'storage', 'database.sqlite');
  return {
    filename: file
  };
}

function makeConfig(env) {
  const explicitClient = (process.env.DB_CLIENT || '').toLowerCase();

  if (explicitClient === 'sqlite3' || explicitClient === 'sqlite') {
    return {
      client: 'sqlite3',
      connection: makeSqliteConnection(),
      useNullAsDefault: true,
      migrations: {
        directory: join(__dirname, 'migrations'),
        loadExtensions: ['.cjs']
      },
      pool: {
        afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
      }
    };
  }

  // Autodetección solo si no se fuerza SQLite
  const hasPg = !!(process.env.DATABASE_URL || process.env.DB_HOST || process.env.DB_USER || process.env.DB_NAME);
  const client = hasPg ? 'pg' : 'sqlite3';

  const base = {
    migrations: {
      directory: join(__dirname, 'migrations'),
      loadExtensions: ['.cjs']
    }
  };

  if (client === 'sqlite3') {
    return {
      ...base,
      client: 'sqlite3',
      connection: makeSqliteConnection(),
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn, cb) => conn.run('PRAGMA foreign_keys = ON', cb)
      }
    };
  }

  // Default a Postgres
  return {
    ...base,
    client: 'pg',
    connection: makePgConnection(env)
  };
}

export default {
  development: makeConfig('development'),
  production: makeConfig('production')
};
