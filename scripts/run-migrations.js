import fs from 'fs';
import path from 'path';
import process from 'process';
import pg from 'pg';

import '../src/config/loadEnv.js';
import { getDatabaseConnectionString } from '../src/config/databaseConfig.js';

const { Client } = pg;
const MIGRATIONS_TABLE = 'auth_schema_migrations';
const migrationsDir = path.resolve('migrations');

const log = (message) => console.log(`[migrate] ${message}`);

const ensureMigrationsTable = async (client) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
       name TEXT PRIMARY KEY,
       run_on TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
};

const loadMigrations = () => {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
};

const showStatus = async (client, migrations) => {
  const applied = await client.query(`SELECT name, run_on FROM public.${MIGRATIONS_TABLE} ORDER BY name ASC`);
  const appliedMap = new Map(applied.rows.map((row) => [row.name, row.run_on]));

  migrations.forEach((migration) => {
    if (appliedMap.has(migration)) {
      log(`${migration} \u2713 applied at ${appliedMap.get(migration).toISOString()}`);
    } else {
      log(`${migration} \u2717 pending`);
    }
  });
};

const applyMigration = async (client, migration) => {
  const filePath = path.join(migrationsDir, migration);
  const sql = fs.readFileSync(filePath, 'utf8');

  log(`applying ${migration}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`INSERT INTO public.${MIGRATIONS_TABLE} (name) VALUES ($1)`, [migration]);
    await client.query('COMMIT');
    log(`migration ${migration} applied successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    error.message = `Failed to apply migration ${migration}: ${error.message}`;
    throw error;
  }
};

const run = async () => {
  let connectionString;
  try {
    connectionString = getDatabaseConnectionString();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const migrations = loadMigrations();

    if (process.argv.includes('--status')) {
      await showStatus(client, migrations);
      return;
    }

    const applied = await client.query(`SELECT name FROM public.${MIGRATIONS_TABLE}`);
    const appliedSet = new Set(applied.rows.map((row) => row.name));

    for (const migration of migrations) {
      if (!appliedSet.has(migration)) {
        await applyMigration(client, migration);
      }
    }

    log('All migrations applied.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
