import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'appuser',
      password: process.env.DB_PASSWORD || 'superpass',
      database: process.env.DB_NAME || 'appdb'
    },
    migrations: {
      directory: join(__dirname, 'migrations'),
      loadExtensions: ['.js', '.cjs']
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'db',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'appuser',
      password: process.env.DB_PASSWORD || 'superpass',
      database: process.env.DB_NAME || 'appdb'
    },
    migrations: {
      directory: join(__dirname, 'migrations'),
      loadExtensions: ['.js', '.cjs']
    }
  }
};
