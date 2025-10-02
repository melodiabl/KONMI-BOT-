require('dotenv').config();
module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'appuser',
      password: process.env.DB_PASSWORD || 'superpass',
      database: process.env.DB_NAME || 'appdb',
      ssl: process.env.DB_SSL === 'true'
    },
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' }
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true'
    },
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' }
  }
};
