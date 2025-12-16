/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
async function up(knex) {
  const exists = await knex.schema.hasTable('subbots');
  
  if (exists) {
    console.log('✅ Tabla subbots ya existe, saltando...');
    return;
  }

  console.log('📦 Creando tabla subbots...');
  return knex.schema.createTable('subbots', (table) => {
    table.increments('id').primary();
    table.string('code').unique().notNullable();
    table.string('user_phone').notNullable();
    table.string('user_name').nullable();
    table.string('status').defaultTo('pending');
    table.string('connection_type').defaultTo('qr');
    table.text('qr_code').nullable();
    table.string('pairing_code').nullable();
    table.text('session_data').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_activity').defaultTo(knex.fn.now());
    table.timestamp('connected_at').nullable();
    table.boolean('is_active').defaultTo(false);
    table.integer('message_count').defaultTo(0);
    table.json('settings').nullable();

    table.index('user_phone');
    table.index('status');
    table.index('is_active');
    table.index('last_activity');
  });
}

async function down(knex) {
  return knex.schema.dropTableIfExists('subbots');
}

module.exports = { up, down };
