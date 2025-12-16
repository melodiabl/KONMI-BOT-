const getJsonDefault = (knex) => {
  const client = knex.client.config.client;
  if (client === 'pg') {
    return knex.raw("'{}'::jsonb");
  }
  if (client === 'sqlite3') {
    return '{}';
  }
  return knex.raw("'{}'");
};

async function up(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (!hasTable) {
    return;
  }

  const ensureColumn = async (name, builder) => {
    const exists = await knex.schema.hasColumn('subbots', name);
    if (!exists) {
      await knex.schema.alterTable('subbots', builder);
    }
  };

  await ensureColumn('connection_type', (table) => {
    table.string('connection_type', 20).defaultTo('qr');
  });

  await knex('subbots')
    .whereNull('connection_type')
    .update({ connection_type: 'qr' })
    .catch(() => {});

  await ensureColumn('is_active', (table) => {
    table.boolean('is_active').defaultTo(false);
  });

  await knex('subbots')
    .whereNull('is_active')
    .update({ is_active: false })
    .catch(() => {});

  await ensureColumn('message_count', (table) => {
    table.integer('message_count').defaultTo(0);
  });

  await knex('subbots')
    .whereNull('message_count')
    .update({ message_count: 0 })
    .catch(() => {});

  const client = knex.client.config.client;
  await ensureColumn('metadata', (table) => {
    if (typeof table.jsonb === 'function' && client === 'pg') {
      table.jsonb('metadata').defaultTo(getJsonDefault(knex));
    } else if (typeof table.json === 'function') {
      table.json('metadata').defaultTo('{}');
    } else {
      table.text('metadata');
    }
  });

  if (client === 'pg') {
    await knex('subbots')
      .whereNull('metadata')
      .update({ metadata: knex.raw("'{}'::jsonb") })
      .catch(() => {});
  } else {
    await knex('subbots')
      .whereNull('metadata')
      .update({ metadata: JSON.stringify({}) })
      .catch(() => {});
  }
}

async function down(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (!hasTable) {
    return;
  }

  const dropColumnIfExists = async (name) => {
    const exists = await knex.schema.hasColumn('subbots', name);
    if (exists) {
      await knex.schema.alterTable('subbots', (table) => {
        table.dropColumn(name);
      });
    }
  };

  await dropColumnIfExists('connection_type');
  await dropColumnIfExists('is_active');
  await dropColumnIfExists('message_count');

  const client = knex.client.config.client;
  if (client === 'pg') {
    await knex.schema.alterTable('subbots', (table) => {
      if (typeof table.dropColumn === 'function') {
        table.dropColumn('metadata');
      }
    });
  } else {
    await dropColumnIfExists('metadata');
  }
}

module.exports = { up, down };
