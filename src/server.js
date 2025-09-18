import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/authRoutes.js';

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

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL environment variable is not set. Database operations will fail.');
}

const server = app.listen(PORT, () => {
  console.log(`Authentication API running on port ${PORT}`);
});

const gracefulShutdown = (signal) => {
  console.log(`${signal} received. Closing server gracefully.`);
  server.close(() => {
    console.log('Server closed. Exiting process.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
};

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

export default app;
