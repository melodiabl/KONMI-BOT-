/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasUsuarios = await knex.schema.hasTable('usuarios');

  if (!hasUsuarios) {
    await knex.schema.createTable('usuarios', (table) => {
      table.increments('id').primary();
      table.string('username').unique().notNullable();
      table.string('password').notNullable();
      table.string('rol').notNullable().defaultTo('usuario');
      table.string('whatsapp_number');
      table.string('grupo_registro');
      table.timestamp('fecha_registro').defaultTo(knex.fn.now());
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    return;
  }

  // Ensure columns exist (when altering, avoid defaults that SQLite cannot add)
  const ensureColumn = async (name, addCb) => {
    const exists = await knex.schema.hasColumn('usuarios', name);
    if (!exists) {
      await knex.schema.alterTable('usuarios', (table) => {
        addCb(table);
      });
    }
  };

  await ensureColumn('rol', (t) => t.string('rol'));
  await ensureColumn('whatsapp_number', (t) => t.string('whatsapp_number'));
  await ensureColumn('grupo_registro', (t) => t.string('grupo_registro'));
  await ensureColumn('fecha_registro', (t) => t.timestamp('fecha_registro'));
  await ensureColumn('created_at', (t) => t.timestamp('created_at'));

  // Backfill reasonable values where null
  try {
    await knex('usuarios').whereNull('rol').update({ rol: 'usuario' });
    const now = new Date().toISOString();
    await knex('usuarios').whereNull('fecha_registro').update({ fecha_registro: now });
    await knex('usuarios').whereNull('created_at').update({ created_at: now });
  } catch (e) {
    // ignore
  }
};

/**
 * @param { import('knex').Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down() {
  // No-op
};
