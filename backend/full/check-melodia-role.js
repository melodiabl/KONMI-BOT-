import db from './db-connection.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkUser() {
  try {
    const user = await db('usuarios').where({ username: 'Melodia' }).first();
    console.log('Usuario Melodia:', user);
  } catch (e) {
    console.error('Error:', e);
  }
}

checkUser().catch(console.error);
