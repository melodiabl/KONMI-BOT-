exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('subbot_events');
  if (!hasTable) {
    await knex.schema.createTable('subbot_events', (t) => {
      t.increments('id').primary();
      t.string('code').notNullable().index();
      t.string('event').notNullable().index();
      t.jsonb('payload').nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now()).index();
    });
  }
}

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('subbot_events');
  if (hasTable) {
    await knex.schema.dropTable('subbot_events');
  }
}

