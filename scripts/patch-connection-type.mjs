import db from '../db.js';

async function ensureColumn(name, builder, seedValue) {
  const exists = await db.schema.hasColumn('subbots', name);
  if (!exists) {
    await db.schema.alterTable('subbots', builder);
    if (typeof seedValue !== 'undefined') {
      await db('subbots').update({ [name]: seedValue }).catch(() => {});
    }
  }
}

try {
  await ensureColumn('connection_type', (table) => table.string('connection_type', 20).defaultTo('qr'), 'qr');
  await ensureColumn('is_active', (table) => table.boolean('is_active').defaultTo(false), false);
  await ensureColumn('message_count', (table) => table.integer('message_count').defaultTo(0), 0);

  const hasMetadata = await db.schema.hasColumn('subbots', 'metadata');
  if (!hasMetadata) {
    const client = db.client.config.client;
    await db.schema.alterTable('subbots', (table) => {
      if (client === 'pg' && typeof table.jsonb === 'function') {
        table.jsonb('metadata').defaultTo(db.raw("'{}'::jsonb"));
      } else if (typeof table.json === 'function') {
        table.json('metadata').defaultTo({});
      } else {
        table.text('metadata');
      }
    });

    if (client === 'pg') {
      await db('subbots').update({ metadata: db.raw("'{}'::jsonb") }).catch(() => {});
    } else {
      await db('subbots').update({ metadata: JSON.stringify({}) }).catch(() => {});
    }
  }

  console.log('Parche aplicado correctamente.');
} catch (error) {
  console.error('Error aplicando parche:', error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
