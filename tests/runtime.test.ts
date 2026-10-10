import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test('compiled production server serves health checks and exits cleanly on SIGTERM', { timeout: 15000 }, async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'A dedicated test database is required');
  const port = await freePort();
  const child = spawn(process.execPath, ['dist/src/index.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DATABASE_URL: process.env.TEST_DATABASE_URL, SERVICE_API_KEY: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', exited = false;
  child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-3000); });
  child.stderr.on('data', () => {});
  const completion = new Promise<number | null>(resolve => child.once('exit', code => { exited = true; resolve(code); }));
  try {
    for (let i = 0; i < 200 && !output.includes('Server is running') && !exited; i++) await pause(25);
    assert.ok(output.includes('Server is running'), 'Compiled server did not start');
    const live = await fetch(`http://127.0.0.1:${port}/health/live`, { signal: AbortSignal.timeout(5000) });
    assert.equal(live.status, 200); await live.arrayBuffer();
    const ready = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.status, 200); await ready.arrayBuffer();
    child.kill('SIGTERM');
    assert.equal(await completion, 0);
  } finally { if (!exited) child.kill('SIGKILL'); }
});
