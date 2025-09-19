import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import pool from './db/index.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL environment variable is not set. Database operations will fail.');
}

let server;
let isShuttingDown = false;
let hasRegisteredSignalHandlers = false;

const gracefulShutdown = async (signal, shouldExit = true) => {
  if (isShuttingDown || !server) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Closing server gracefully.`);

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    if (shouldExit) {
      process.exit(1);
    }
  }, 10000);

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    console.log('Server closed.');

    server = undefined;

    await pool.end();
    console.log(shouldExit ? 'Database connections closed. Exiting process.' : 'Database connections closed.');

    clearTimeout(timeout);

    if (shouldExit) {
      process.exit(0);
    }
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(timeout);

    if (shouldExit) {
      process.exit(1);
    } else {
      throw error;
    }
  } finally {
    isShuttingDown = false;
  }
};

const registerSignalHandlers = () => {
  if (hasRegisteredSignalHandlers) {
    return;
  }

  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.on(signal, () => {
      gracefulShutdown(signal).catch((error) => {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      });
    });
  });

  hasRegisteredSignalHandlers = true;
};

export const startServer = () => {
  if (server) {
    return server;
  }

  server = app.listen(PORT, HOST, () => {
    console.log(`Authentication API running on http://${HOST}:${PORT}`);
  });

  registerSignalHandlers();

  return server;
};

export const stopServer = async () => {
  if (!server) {
    return;
  }

  await gracefulShutdown('STOP', false);
};

const isRunDirectly = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
);

if (isRunDirectly) {
  startServer();
}

export default app;
