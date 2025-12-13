
import db from './src/database/db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBBOTS_BASE_DIR = path.resolve(__dirname, "storage", "subbots");

async function checkSubbots() {
  try {
    const subbots = await db('subbots').select('*');
    console.log(`Found ${subbots.length} subbots in DB.`);

    for (const subbot of subbots) {
      console.log(`\nChecking subbot: ${subbot.code}`);
      console.log(`  ID: ${subbot.id}`);
      console.log(`  Auth Path (DB): ${subbot.auth_path}`);
      
      const calculatedAuthPath = path.join(SUBBOTS_BASE_DIR, subbot.code, "auth");
      console.log(`  Calculated Auth Path: ${calculatedAuthPath}`);

      const authDir = subbot.auth_path || calculatedAuthPath;
      const credsPath = path.join(authDir, "creds.json");

      console.log(`  Checking Auth Dir: ${authDir} -> ${fs.existsSync(authDir) ? 'EXISTS' : 'MISSING'}`);
      console.log(`  Checking Creds: ${credsPath} -> ${fs.existsSync(credsPath) ? 'EXISTS' : 'MISSING'}`);
    }
  } catch (error) {
    console.error('Error checking subbots:', error);
  } finally {
    process.exit(0);
  }
}

checkSubbots();
