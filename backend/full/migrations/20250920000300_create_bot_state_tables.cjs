/**
 * @param { import('knex').Knex } knex
 */
async function up(knex) {
  const hasGrupos = await knex.schema.hasTable('grupos_desactivados');
  if (!hasGrupos) {
    await knex.schema.createTable('grupos_desactivados', (table) => {
      table.increments('id').primary();
      table.string('jid').notNullable().unique();
      table.string('nombre');
      table.timestamp('fecha').defaultTo(knex.fn.now());
      table.string('agregado_por');
    });
  }

  const hasAvisosGlobal = await knex.schema.hasTable('avisos_global_off');
  if (!hasAvisosGlobal) {
    await knex.schema.createTable('avisos_global_off', (table) => {
      table.increments('id').primary();
      table.string('usuario_jid').notNullable().unique();
      table.timestamp('fecha_aviso').defaultTo(knex.fn.now());
    });
  }

  const hasAvisosGrupo = await knex.schema.hasTable('avisos_grupo_off');
  if (!hasAvisosGrupo) {
    await knex.schema.createTable('avisos_grupo_off', (table) => {
      table.increments('id').primary();
      table.string('grupo_jid').notNullable();
      table.string('usuario_jid').notNullable();
      table.timestamp('fecha_aviso').defaultTo(knex.fn.now());
      table.unique(['grupo_jid', 'usuario_jid']);
    });
  }
}

/**
 * @param { import('knex').Knex } knex
 */
async function down(knex) {
  if (await knex.schema.hasTable('avisos_grupo_off')) {
    await knex.schema.dropTable('avisos_grupo_off');
  }
  if (await knex.schema.hasTable('avisos_global_off')) {
    await knex.schema.dropTable('avisos_global_off');
  }
  if (await knex.schema.hasTable('grupos_desactivados')) {
    await knex.schema.dropTable('grupos_desactivados');
  }
}

module.exports = { up, down };
