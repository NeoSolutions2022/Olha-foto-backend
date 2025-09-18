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

const shutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close((error) => {
    if (error) {
      console.error('Error while closing HTTP server', error);
      process.exit(1);
      return;
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
