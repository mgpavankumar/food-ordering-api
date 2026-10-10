import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import type { Server } from 'node:http';

export function getPort(value = process.env.PORT ?? '3000'): number {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  return Number(value);
}

export function requireDatabase(value = process.env.DATABASE_URL): void {
  if (!value) throw new Error('DATABASE_URL is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname) throw new Error('DATABASE_URL must be a PostgreSQL URL');
}

export function addOperations(app: Hono, checkDatabase: () => Promise<unknown>) {
  app.use('*', async (c, next) => {
    // Generate locally: never use an untrusted request header as a log identifier.
    c.header('X-Request-ID', randomUUID());
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.get('/health/live', c => c.json({ status: 'ok' }));
  app.get('/health/ready', async c => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        checkDatabase(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 2000); }),
      ]);
      return c.json({ status: 'ready' });
    } catch {
      return c.json({ status: 'unavailable' }, 503);
    } finally { if (timer) clearTimeout(timer); }
  });
}

export function registerShutdown(server: Server, disconnect: () => Promise<void>) {
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    if (closing) return;
    closing = true;
    const timer = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000);
    timer.unref();
    server.close(() => {
      void disconnect().then(() => { clearTimeout(timer); process.exit(0); }, () => { clearTimeout(timer); process.exit(1); });
    });
    server.closeIdleConnections();
  });
}
