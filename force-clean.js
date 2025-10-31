// Wrapper para ejecutar la limpieza desde la raíz del repo
// Redirige a backend/full/force-clean.js manteniendo flags
import { spawnSync } from 'child_process';
import path from 'path';

const target = path.join('backend', 'full', 'force-clean.js');
const args = process.argv.slice(2);

const res = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit' });
process.exit(res.status || 0);

