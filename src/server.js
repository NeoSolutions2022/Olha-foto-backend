import 'dotenv/config';
import path from 'path';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import pool from './db/index.js';

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);

const logErrorDetails = (err, req, errorId, status) => {
  const { method, originalUrl, ip } = req;
  const baseMessage = err?.message || 'Unknown error';

  console.error(`Error ${errorId}: ${method} ${originalUrl} -> ${status} ${baseMessage}`);

  const context = {
    errorId,
    status,
    method,
    url: originalUrl,
    ipAddress: ip || undefined,
    userId: req.user?.sub
  };

  console.error('Request context:', Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  ));

  if (err && err.stack) {
    console.error(err.stack);
  } else {
    console.error(err);
  }
};

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const errorId = randomUUID();

  logErrorDetails(err, req, errorId, status);

  const isServerError = status >= 500;
  const responseMessage = isServerError && isProduction ? 'Internal server error' : err.message || 'Internal server error';

  const responsePayload = { error: responseMessage };

  if (isServerError) {
    responsePayload.errorId = errorId;
  }

  res.status(status).json(responsePayload);
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
