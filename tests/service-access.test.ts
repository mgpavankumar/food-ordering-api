import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';

const key = randomBytes(32).toString('hex');
test('service access blocks missing and incorrect keys before database operations', async () => {
  const app = createApp({} as PrismaClient, { serviceKey: key, readiness: async () => 1 });
  for (const headers of [{}, { 'X-API-Key': 'wrong' }]) {
    const response = await app.request('/customers/top', { headers });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
  assert.equal((await app.request('/', { headers: { 'X-API-Key': key } })).status, 200);
  assert.equal((await app.request('/health/live')).status, 200);
  assert.equal((await app.request('/health/ready')).status, 200);
  assert.equal((await app.request('/health/live', { method: 'POST' })).status, 401);
});
test('production refuses to run without a sufficiently long service key', () => {
  const previous = process.env.NODE_ENV, oldKey = process.env.SERVICE_API_KEY;
  try {
    process.env.NODE_ENV = 'production'; delete process.env.SERVICE_API_KEY;
    assert.throws(() => createApp({} as PrismaClient), /required in production/);
    assert.throws(() => createApp({} as PrismaClient, { serviceKey: 'short' }), /at least 32 bytes/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    if (oldKey === undefined) delete process.env.SERVICE_API_KEY; else process.env.SERVICE_API_KEY = oldKey;
  }
});
