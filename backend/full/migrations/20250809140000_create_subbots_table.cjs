const knex = require('knex');

exports.up = async function(knex) {
  const has = await knex.schema.hasTable('subbots');
  if (!has) {
    await knex.schema.createTable('subbots', (t) => {
      t.increments('id').primary();
      t.string('code').unique().notNullable();
      t.string('type').notNullable(); // 'qr' o 'code'
      t.string('status').defaultTo('pending'); // 'pending', 'connected', 'disconnected'
      t.integer('created_by').notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('last_heartbeat').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function(knex) {
  const has = await knex.schema.hasTable('subbots');
  if (has) await knex.schema.dropTable('subbots');
};
