// Imprime qué módulo de Baileys se cargará y su versión
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

try { dotenv.config({ path: join(__dirname, '..', '.env'), override: true }) } catch {}

const modName = process.env.BAILEYS_MODULE || '@whiskeysockets/baileys'
console.log('BAILEYS_MODULE =', modName)

const req = createRequire(import.meta.url)
try {
  const pkgPath = req.resolve(modName + '/package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  console.log('Resolved package:', pkg.name)
  console.log('Version:', pkg.version)
  console.log('Main:', pkg.main || pkg.module || 'lib/index.js')
} catch (e) {
  console.error('❌ No se pudo resolver el paquete:', modName, e?.message || e)
}

