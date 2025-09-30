import pg from 'pg';
import { getDatabaseConnectionString } from '../config/databaseConfig.js';
import { maskIdentifier } from '../utils/maskIdentifier.js';

const { Pool } = pg;

const describeConnection = (connectionString) => {
  try {
    const url = new URL(connectionString);
    const database = url.pathname?.replace(/^\//, '') || undefined;
    const sslMode = url.searchParams.get('sslmode') || undefined;

    return {
      host: url.hostname,
      port: url.port || undefined,
      database,
      user: maskIdentifier(url.username || undefined),
      sslMode
    };
  } catch (error) {
    console.error('[database] Failed to parse DATABASE_URL for diagnostics:', error);
    return undefined;
  }
};

const connectionString = getDatabaseConnectionString();

const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT || 30000)
});

const connectionDetails = describeConnection(connectionString);

if (connectionDetails && process.env.NODE_ENV !== 'test') {
  const detailsParts = [
    `host=${connectionDetails.host}`,
    connectionDetails.port ? `port=${connectionDetails.port}` : undefined,
    connectionDetails.database ? `database=${connectionDetails.database}` : undefined,
    connectionDetails.user ? `user=${connectionDetails.user}` : undefined,
    connectionDetails.sslMode ? `sslmode=${connectionDetails.sslMode}` : undefined
  ].filter(Boolean);

  console.log(`[database] PostgreSQL connection configured (${detailsParts.join(', ')}).`);
}

pool.on('error', (error) => {
  console.error('[database] Unexpected error on PostgreSQL client.', error);
});

export const query = (text, params) => pool.query(text, params);

export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;
