import knex from 'knex';
import knexfile from './knexfile.js';

const environment = process.env.NODE_ENV || 'development';
const config = (knexfile.default || knexfile)[environment];

if (!config) {
  throw new Error(`Knex configuration for environment '${environment}' not found. Check your knexfile.js.`);
}

const db = knex(config);


export default db;
