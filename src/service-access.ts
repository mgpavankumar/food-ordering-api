import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

export function serviceAccess(configuredKey = process.env.SERVICE_API_KEY) {
  if (configuredKey && Buffer.byteLength(configuredKey) < 32) throw new Error('SERVICE_API_KEY must contain at least 32 bytes');
  if (process.env.NODE_ENV === 'production' && !configuredKey) throw new Error('SERVICE_API_KEY is required in production');
  const expected = configuredKey ? createHash('sha256').update(configuredKey).digest() : undefined;
  return createMiddleware(async (c, next) => {
    if (c.req.method === 'GET' && ['/health/live', '/health/ready'].includes(c.req.path)) return next();
    if (expected) {
      const supplied = c.req.header('X-API-Key');
      if (!supplied || !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  });
}
