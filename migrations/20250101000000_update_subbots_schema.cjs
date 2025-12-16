/**
 * Migration to update subbots table schema to match handler.js implementation
 * @param { import('knex').Knex } knex
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('subbots');
  if (!hasTable) {
    await knex.schema.createTable('subbots', (table) => {
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
    });
    console.log('✅ Tabla `subbots` creada con esquema actualizado');
    return;
  }

  // Si la tabla ya existe, actualizar esquema
  const ensureColumn = async (name, type, options = {}) => {
    const exists = await knex.schema.hasColumn('subbots', name);
    if (!exists) {
      await knex.schema.alterTable('subbots', (table) => {
        if (type === 'string') {
          table.string(name, options.length).nullable();
        } else if (type === 'text') {
          table.text(name).nullable();
        } else if (type === 'timestamp') {
          table.timestamp(name).nullable();
        } else if (type === 'boolean') {
          table.boolean(name).defaultTo(options.default || false);
        } else if (type === 'integer') {
          table.integer(name).defaultTo(options.default || 0);
        } else if (type === 'json') {
          table.json(name).nullable();
        }
      });
    }
  };

  await ensureColumn('user_phone', 'string', { length: 255 });
  await ensureColumn('user_name', 'string', { length: 255 });
  await ensureColumn('status', 'string', { length: 50 });
  await ensureColumn('connection_type', 'string', { length: 20 });
  await ensureColumn('qr_code', 'text');
  await ensureColumn('pairing_code', 'string', { length: 20 });
  await ensureColumn('session_data', 'text');
  await ensureColumn('last_activity', 'timestamp');
  await ensureColumn('connected_at', 'timestamp');
  await ensureColumn('is_active', 'boolean', { default: false });
  await ensureColumn('message_count', 'integer', { default: 0 });
  await ensureColumn('settings', 'json');

  console.log('✅ Esquema de `subbots` actualizado');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function(knex) {
  // No se puede hacer rollback fácilmente de alter table
  console.log('⚠️ No se puede hacer rollback automático del esquema de subbots');
};

module.exports = { up: exports.up, down: exports.down };
