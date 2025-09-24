/**
 * @param { import('knex').Knex } knex
 */
async function up(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (hasTable) {
    // Ensure required columns exist
    const ensureColumn = async (name, cb) => {
      const exists = await knex.schema.hasColumn('subbots', name);
      if (!exists) {
        await knex.schema.alterTable('subbots', cb);
      }
    };

    await ensureColumn('type', (table) => table.string('type').defaultTo('qr'));
    await ensureColumn('status', (table) => table.string('status').defaultTo('pending'));
    await ensureColumn('created_by', (table) => table.string('created_by'));
    await ensureColumn('request_jid', (table) => table.string('request_jid'));
    await ensureColumn('request_participant', (table) => table.string('request_participant'));
    await ensureColumn('target_number', (table) => table.string('target_number'));
    await ensureColumn('qr_data', (table) => table.text('qr_data'));
    await ensureColumn('pairing_code', (table) => table.string('pairing_code'));
    await ensureColumn('api_token', (table) => table.string('api_token'));
    await ensureColumn('last_heartbeat', (table) => table.timestamp('last_heartbeat'));
    await ensureColumn('updated_at', (table) => table.timestamp('updated_at'));
    return;
  }

  await knex.schema.createTable('subbots', (table) => {
    table.increments('id').primary();
    table.string('code').notNullable().unique();
    table.string('type').notNullable().defaultTo('qr');
    table.string('status').notNullable().defaultTo('pending');
    table.string('created_by');
    table.string('request_jid');
    table.string('request_participant');
    table.string('target_number');
    table.text('qr_data');
    table.string('pairing_code');
    table.string('api_token');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_heartbeat').defaultTo(knex.fn.now());
    table.jsonb('metadata').nullable();
  });
}

/**
 * @param { import('knex').Knex } knex
 */
async function down(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (!hasTable) return;
  await knex.schema.dropTable('subbots');
}

module.exports = { up, down };
