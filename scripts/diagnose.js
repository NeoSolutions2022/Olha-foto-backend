import fs from 'fs';
import os from 'os';
import process from 'process';
import pg from 'pg';

import '../src/config/loadEnv.js';
import { getDatabaseConnectionString } from '../src/config/databaseConfig.js';
import { maskIdentifier } from '../src/utils/maskIdentifier.js';

const { Client } = pg;

const log = (message) => console.log(`[diagnostics] ${message}`);
const warn = (message) => console.warn(`[diagnostics] Warning: ${message}`);
const error = (message, detail) => {
  console.error(`[diagnostics] Error: ${message}`);
  if (detail) {
    console.error(detail);
  }
};

const insideContainer = () => fs.existsSync('/.dockerenv');

const summarizeHostConfiguration = () => {
  const host = (process.env.HOST || '0.0.0.0').trim();
  const portRaw = process.env.PORT;
  const port = Number.parseInt(portRaw, 10);
  const resolvedPort = Number.isFinite(port) && port > 0 ? port : 3000;

  log(`HTTP server target: http://${host}:${resolvedPort}`);

  if (['127.0.0.1', 'localhost'].includes(host)) {
    warn('The API is bound to a loopback interface. External requests (e.g. from a load balancer or another container) may fail.');
    if (insideContainer()) {
      warn('Detected Docker/LXC environment. Consider setting HOST=0.0.0.0 to expose the port to other services.');
    }
  }
};

const describeConnectionString = (connectionString) => {
  try {
    const url = new URL(connectionString);
    const database = url.pathname?.replace(/^\//, '') || undefined;
    const sslMode = url.searchParams.get('sslmode') || undefined;

    const summary = [
      `host=${url.hostname}`,
      url.port ? `port=${url.port}` : undefined,
      database ? `database=${database}` : undefined,
      url.username ? `user=${maskIdentifier(url.username)}` : undefined,
      sslMode ? `sslmode=${sslMode}` : undefined
    ].filter(Boolean);

    log(`DATABASE_URL looks valid (${summary.join(', ')}).`);
  } catch (parseError) {
    warn(`Failed to parse DATABASE_URL for summary output: ${parseError.message}`);
  }
};

const checkDatabaseConnection = async (connectionString) => {
  const connectionTimeoutMillis = Number.parseInt(process.env.DATABASE_DIAGNOSTIC_TIMEOUT || '5000', 10);
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) ? connectionTimeoutMillis : 5000
  });

  const startedAt = Date.now();

  try {
    await client.connect();
    const elapsed = Date.now() - startedAt;
    log(`Connected to PostgreSQL in ${elapsed}ms.`);

    const result = await client.query('SELECT NOW() AS current_time');
    if (result?.rows?.length) {
      const currentTime = result.rows[0]?.current_time;
      log(`Database current time: ${currentTime instanceof Date ? currentTime.toISOString() : currentTime}`);
    }
  } finally {
    await client.end().catch((disconnectError) => {
      warn(`Failed to close diagnostic database connection cleanly: ${disconnectError.message}`);
    });
  }
};

const run = async () => {
  log('Starting startup diagnostics...');
  log(`Node.js version: ${process.version}`);
  log(`Platform: ${process.platform} ${process.arch}`);
  log(`Hostname: ${os.hostname()}`);

  summarizeHostConfiguration();

  let connectionString;
  try {
    connectionString = getDatabaseConnectionString();
  } catch (configError) {
    error(configError.message);
    process.exit(1);
  }

  describeConnectionString(connectionString);

  try {
    await checkDatabaseConnection(connectionString);
  } catch (dbError) {
    error('Unable to establish a PostgreSQL connection.', dbError);
    process.exit(1);
  }

  log('Diagnostics completed successfully.');
};

run().catch((unhandledError) => {
  error('Unexpected diagnostics failure.', unhandledError);
  process.exit(1);
});
