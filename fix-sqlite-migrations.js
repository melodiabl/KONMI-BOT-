// Script para corregir migraciones SQLite con knex.fn.now() problemáticas
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, 'migrations');

// Función para corregir el contenido de las migraciones
function fixMigrationContent(content) {
    // Reemplazar knex.fn.now() en ALTER TABLE con una solución compatible con SQLite
    let fixed = content;

    // Patrón para encontrar alterTable con knex.fn.now()
    const alterTablePattern = /await knex\.schema\.alterTable\([^}]+table\.timestamp\([^)]+\)\.defaultTo\(knex\.fn\.now\(\)\)[^}]+\}\);/g;

    // Reemplazar con versión compatible con SQLite
    fixed = fixed.replace(alterTablePattern, (match) => {
        const columnMatch = match.match(/table\.timestamp\('([^']+)'\)/);
        if (columnMatch) {
            const columnName = columnMatch[1];
            return match.replace(
                /table\.timestamp\([^)]+\)\.defaultTo\(knex\.fn\.now\(\)\)/,
                `table.timestamp('${columnName}').nullable()`
            ) + `\n      // Actualizar registros existentes\n      await knex('${getTableName(match)}').update({ ${columnName}: new Date().toISOString() }).whereNull('${columnName}');`;
        }
        return match;
    });

    return fixed;
}

function getTableName(alterTableMatch) {
    const tableMatch = alterTableMatch.match(/alterTable\('([^']+)'/);
    return tableMatch ? tableMatch[1] : 'unknown_table';
}

async function fixMigrations() {
    try {
        const files = fs.readdirSync(migrationsDir);
        const migrationFiles = files.filter(file => file.endsWith('.cjs'));

        console.log(`🔧 Corrigiendo ${migrationFiles.length} archivos de migración...`);

        for (const file of migrationFiles) {
            const filePath = path.join(migrationsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');

            // Solo procesar si contiene knex.fn.now() en alterTable
            if (content.includes('knex.fn.now()') && content.includes('alterTable')) {
                console.log(`📝 Corrigiendo: ${file}`);
                const fixedContent = fixMigrationContent(content);

                // Crear backup
                fs.writeFileSync(filePath + '.backup', content);

                // Escribir versión corregida
                fs.writeFileSync(filePath, fixedContent);
                console.log(`✅ Corregido: ${file}`);
            }
        }

        console.log('🎉 Todas las migraciones han sido corregidas');
    } catch (error) {
        console.error('❌ Error corrigiendo migraciones:', error);
    }
}

fixMigrations();
