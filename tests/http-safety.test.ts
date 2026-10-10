import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import type { PrismaClient } from '@prisma/client';

const app = createApp({} as PrismaClient);
test('security headers apply to normal and rejected responses', async () => {
  for (const path of ['/', '/missing-route']) {
    const response = await app.request(path);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
test('reject oversized JSON before route processing, with and without content length', async () => {
  const body = JSON.stringify({ content: 'x'.repeat(65536) });
  for (const mode of ['stream', 'length', 'chunked']) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (mode === 'length') headers['Content-Length'] = String(Buffer.byteLength(body));
    if (mode === 'chunked') {
      headers['Transfer-Encoding'] = 'chunked';
      headers['Content-Length'] = '1';
    }
    const response = await app.request('/orders', { method: 'POST', headers, body });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'Request body exceeds 64 KiB' });
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  }
});
