import knex from 'knex';
import knexfile from './knexfile.js';

const environment = process.env.NODE_ENV || 'development';
const config = (knexfile.default || knexfile)[environment];

if (!config) {
  throw new Error(`Knex configuration for environment '${environment}' not found. Check your knexfile.js.`);
}

const db = knex(config);

// Compatibilidad: agregar helpers tipo SQLite (.all, .get, .prepare, .run)
function normalizeRows(res) {
  // knex.raw puede devolver distintos formatos segun el cliente
  if (!res) return [];
  if (Array.isArray(res)) {
    // sqlite3/mariadb a veces devuelven [rows, fields]
    return Array.isArray(res[0]) ? res[0] : res;
  }
  if (res.rows) return res.rows; // pg
  if (res[0] && typeof res[0] === 'object') return res[0];
  return res;
}

db.all = async function(sql, params = []) {
  const res = await db.raw(sql, params);
  return normalizeRows(res);
};

db.get = async function(sql, params = []) {
  const rows = await db.all(sql, params);
  return rows && rows.length ? rows[0] : null;
};

db.prepare = async function(sql) {
  return {
    run: async (...args) => {
      // Soporta run(a,b,c) y run([a,b,c])
      const bind = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      await db.raw(sql, bind);
    },
    finalize: async () => {}
  };
};

db.run = async function(sql, params = []) {
  await db.raw(sql, params);
};

export default db;
