import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { getPort, requireDatabase } from '../src/operations.js';
import type { PrismaClient } from '@prisma/client';

test('readiness follows database availability without disclosing errors', async () => {
  const healthy = createApp({} as PrismaClient, { readiness: async () => 1 });
  assert.equal((await healthy.request('/health/live')).status, 200);
  const response = await healthy.request('/health/ready');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready' });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('X-Request-ID')!, /^[a-f0-9-]{36}$/);
  const unhealthy = createApp({} as PrismaClient, { readiness: async () => { throw new Error("private-database-detail"); } });
  const failure = await unhealthy.request('/health/ready');
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { status: 'unavailable' });
  assert.equal((await unhealthy.request('/health/live')).status, 200);
});
test('readiness times out instead of hanging', { timeout: 4000 }, async () => {
  const app = createApp({} as PrismaClient, { readiness: () => new Promise(() => {}) });
  assert.equal((await app.request('/health/ready')).status, 503);
});
test('startup validates configuration without echoing credentials', () => {
  assert.equal(getPort('3000'), 3000);
  for (const port of ['', '0', '65536', '-1', '1.5', 'abc', '1e3']) assert.throws(() => getPort(port), /PORT/);
  requireDatabase('postgresql://example:example@127.0.0.1:5432/test');
  for (const url of ['', 'not-a-url', 'https://example.test']) assert.throws(() => requireDatabase(url), /DATABASE_URL/);
});
