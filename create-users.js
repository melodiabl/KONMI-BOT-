import bcrypt from 'bcryptjs';
import db from './backend/full/db.js';
import config from './backend/full/config.js';

async function createUsers() {
    try {
        console.log('🔧 Verificando y creando usuarios del sistema...');

        // Check if users table exists and create if not
        try {
            await db.raw('SELECT 1 FROM usuarios LIMIT 1');
            console.log('✅ Tabla usuarios existe');
        } catch (error) {
            console.log('⚠️ Creando tabla usuarios...');
            await db.schema.createTable('usuarios', (table) => {
                table.increments('id').primary();
                table.string('username').unique().notNullable();
                table.string('password').notNullable();
                table.string('rol').notNullable().defaultTo('usuario');
                table.string('whatsapp_number').nullable();
                table.string('grupo_registro').nullable();
                table.timestamp('fecha_registro').defaultTo(db.fn.now());
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log('✅ Tabla usuarios creada');
        }

        // Create owner and admin accounts
        const ownerPassword = await bcrypt.hash('melodia@2010', config.security.bcryptRounds);
        const adminPassword = await bcrypt.hash('admin@123', config.security.bcryptRounds);

        // Insert users using knex
        const users = [
            { username: 'melodia', password: ownerPassword, rol: 'owner' },
            { username: 'admin', password: adminPassword, rol: 'admin' }
        ];

        for (const user of users) {
            try {
                // Check if user already exists
                const existingUser = await db('usuarios').where({ username: user.username }).first();
                
                if (existingUser) {
                    console.log(`⚠️ Usuario '${user.username}' ya existe, actualizando contraseña...`);
                    await db('usuarios')
                        .where({ username: user.username })
                        .update({ 
                            password: user.password,
                            rol: user.rol 
                        });
                    console.log(`✅ Usuario '${user.username}' actualizado`);
                } else {
                    await db('usuarios').insert(user);
                    console.log(`✅ Usuario '${user.username}' creado`);
                }
            } catch (userError) {
                console.error(`❌ Error con usuario '${user.username}':`, userError.message);
            }
        }

        console.log('\n🎉 Proceso completado:');
        console.log('👤 Usuario: melodia, Contraseña: melodia@2010, Rol: owner');
        console.log('👤 Usuario: admin, Contraseña: admin@123, Rol: admin');
        console.log('\n🌐 Puedes acceder al panel en: http://localhost:3001');

    } catch (error) {
        console.error('❌ Error general:', error);
    } finally {
        await db.destroy();
    }
}

createUsers();
