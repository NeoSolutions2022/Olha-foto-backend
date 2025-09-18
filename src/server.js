import 'dotenv/config';
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

const server = app.listen(PORT, HOST, () => {
  console.log(`Authentication API running on http://${HOST}:${PORT}`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Closing server gracefully.`);

  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
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

    await pool.end();
    console.log('Database connections closed. Exiting process.');

    clearTimeout(timeout);
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(timeout);
    process.exit(1);
  }
};

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => {
    gracefulShutdown(signal);
  });
});

export default app;
