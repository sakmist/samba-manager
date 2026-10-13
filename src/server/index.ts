import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { requireAuth } from './auth';
import { initAuth, runtime } from './config';
import { log } from './logger';
import { monitor } from './monitor';
import { authRouter } from './routes/auth';
import { settingsRouter } from './routes/settings';
import { sharesRouter } from './routes/shares';
import { statusRouter } from './routes/status';
import { systemRouter } from './routes/system';
import { usersRouter } from './routes/users';
import { errorHandler, notFound } from './util/http';
import { VERSION } from './version';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  if (runtime.trustProxy) app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
  });

  // Login/logout/me stay open; everything else under /api needs a session.
  app.use('/api/auth', authRouter);
  app.use('/api/status', requireAuth, statusRouter);
  app.use('/api/shares', requireAuth, sharesRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/system', requireAuth, systemRouter);

  app.use('/api', notFound);

  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // SPA fallback for client-side routes.
    app.get('*', (_req, res) => {
      res.sendFile(join(publicDir, 'index.html'));
    });
  } else {
    log.warn(`web assets not found at ${publicDir}; run "npm run build:web"`);
  }

  app.use(errorHandler);
  return app;
}

function main(): void {
  initAuth();
  const app = createApp();
  monitor.start();

  const server = app.listen(runtime.port, runtime.host, () => {
    log.info(`samba-manager ${VERSION} listening on http://${runtime.host}:${runtime.port}`);
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    monitor.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main();
}
