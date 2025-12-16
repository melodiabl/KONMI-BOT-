/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function up(knex) {
  return knex.schema.createTable('subbots', (table) => {
    table.increments('id').primary();
    table.string('code').unique().notNullable();
    table.string('user_phone').notNullable(); // Numero del usuario que creo el subbot
    table.string('user_name').nullable();
    table.string('status').defaultTo('pending'); // pending, waiting_scan, waiting_pairing, connected, disconnected, inactive, error
    table.string('connection_type').defaultTo('qr'); // qr, pairing
    table.text('qr_code').nullable();
    table.string('pairing_code').nullable();
    table.text('session_data').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('last_activity').defaultTo(knex.fn.now());
    table.timestamp('connected_at').nullable();
    table.boolean('is_active').defaultTo(false);
    table.integer('message_count').defaultTo(0);
    table.json('settings').nullable(); // Configuraciones del subbot

    // Indices para optimizar consultas
    table.index('user_phone');
    table.index('status');
    table.index('is_active');
    table.index('last_activity');
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export function down(knex) {
  return knex.schema.dropTable('subbots');
}
