/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
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

const ensureIndex = async (knex, tableName, indexColumns, indexName) => {
  const client = knex.client.config.client;

  if (client === 'pg') {
    const { rows } = await knex.raw(
      `SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?`,
      [indexName]
    );
    if (rows.length) return;
  } else if (client === 'sqlite3') {
    const res = await knex.raw(`PRAGMA index_list('${tableName}')`);
    const rows = Array.isArray(res) ? (Array.isArray(res[0]) ? res[0] : res) : res?.rows || [];
    const exists = rows.some((row) => (row?.name || row?.Name) === indexName);
    if (exists) return;
  } else {
    try {
      await knex.schema.alterTable(tableName, (table) => {
        table.index(indexColumns, indexName);
      });
    } catch (error) {
      if (!/exists/i.test(error.message)) {
        throw error;
      }
    }
    return;
  }

  await knex.schema.alterTable(tableName, (table) => {
    table.index(indexColumns, indexName);
  });
};

const ensureColumn = async (knex, name, builder) => {
  const exists = await knex.schema.hasColumn('subbots', name);
  if (!exists) {
    await knex.schema.alterTable('subbots', builder);
  }
};

const up = async function(knex) {
  const hasTable = await knex.schema.hasTable('subbots');

  if (!hasTable) {
    await knex.schema.createTable('subbots', (table) => {
      table.increments('id').primary();
      table.string('request_jid').notNullable();
      table.string('session_id').unique();
      table.string('method').notNullable();
      table.string('label');
      table.string('bot_number');
      table.string('auth_path');
      table.string('status').defaultTo('pending');
      table.timestamp('last_check').defaultTo(knex.fn.now());
      table.timestamp('creation_time').defaultTo(knex.fn.now());
      if (typeof table.jsonb === 'function') {
        table.jsonb('meta').defaultTo(getJsonDefault(knex));
      } else if (typeof table.json === 'function') {
        table.json('meta').defaultTo('{}');
      } else {
        table.text('meta').defaultTo('{}');
      }
      table.index(['request_jid', 'status'], 'subbots_request_jid_status_index');
    });
    return;
  }

  await ensureColumn(knex, 'request_jid', (table) => table.string('request_jid'));
  await ensureColumn(knex, 'session_id', (table) => table.string('session_id').unique());
  await ensureColumn(knex, 'method', (table) => table.string('method'));
  await ensureColumn(knex, 'label', (table) => table.string('label'));
  await ensureColumn(knex, 'bot_number', (table) => table.string('bot_number'));
  await ensureColumn(knex, 'auth_path', (table) => table.string('auth_path'));
  await ensureColumn(knex, 'status', (table) => table.string('status').defaultTo('pending'));
  await ensureColumn(knex, 'last_check', (table) => table.timestamp('last_check').defaultTo(knex.fn.now()));
  await ensureColumn(knex, 'creation_time', (table) => table.timestamp('creation_time').defaultTo(knex.fn.now()));
  await ensureColumn(knex, 'meta', (table) => {
    if (typeof table.jsonb === 'function') {
      table.jsonb('meta').defaultTo(getJsonDefault(knex));
    } else if (typeof table.json === 'function') {
      table.json('meta').defaultTo('{}');
    } else {
      table.text('meta').defaultTo('{}');
    }
  });

  await ensureIndex(knex, 'subbots', ['request_jid', 'status'], 'subbots_request_jid_status_index');
};

const down = async function(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (hasTable) {
    await knex.schema.dropTable('subbots');
  }
};

export { up, down };