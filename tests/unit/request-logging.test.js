const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { start, shouldLogRequest } = require('../../server');

describe('shouldLogRequest', () => {
  // Regression: the middleware recorded every request, including GET /api/logs,
  // which the Logs tab polls every 2s. At 30 entries/min an idle open tab
  // overwrote the whole 500-entry ring buffer in ~17 minutes, so the Playwright
  // [TEST] output the tab exists to surface was gone by the time anyone looked.
  test('excludes the endpoint the Logs tab polls', () => {
    assert.equal(shouldLogRequest('/api/logs'), false);
  });

  test('excludes the health endpoint', () => {
    assert.equal(shouldLogRequest('/api/health'), false);
  });

  test('still records the requests worth seeing', () => {
    for (const path of ['/api/run-test', '/api/order-config', '/api/products', '/']) {
      assert.equal(shouldLogRequest(path), true, path);
    }
  });

  test('does not exclude by prefix', () => {
    assert.equal(shouldLogRequest('/api/logs/export'), true);
  });
});

describe('log buffer under polling (integration)', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = start(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  async function readLogs() {
    const response = await fetch(`${baseUrl}/api/logs?limit=500`);
    assert.equal(response.status, 200);
    return response.json();
  }

  test('polling /api/logs does not grow the buffer', async () => {
    const before = (await readLogs()).total;

    // Roughly 100 seconds of the Logs tab's 2s polling.
    for (let i = 0; i < 50; i++) {
      await fetch(`${baseUrl}/api/logs`);
    }

    const after = await readLogs();

    assert.equal(after.total, before, 'log polling must not add entries');
    assert.equal(
      after.logs.filter((entry) => entry.path === '/api/logs').length,
      0,
      'no /api/logs request should be recorded',
    );
  });

  test('health checks do not grow the buffer either', async () => {
    const before = (await readLogs()).total;

    for (let i = 0; i < 20; i++) {
      await fetch(`${baseUrl}/api/health`);
    }

    assert.equal((await readLogs()).total, before);
  });

  test('a real request is still recorded', async () => {
    const before = (await readLogs()).total;

    await fetch(`${baseUrl}/api/products`);
    const after = await readLogs();

    // The route handler logs as well, so only assert the buffer grew and that the
    // middleware entry for the request is present.
    assert.ok(after.total > before, 'expected the buffer to grow');
    assert.ok(
      after.logs.some((entry) => entry.path === '/api/products' && entry.method === 'GET'),
      'expected the /api/products request in the buffer',
    );
  });

  test('the Playwright output the tab exists for survives sustained polling', async () => {
    // Seed a marker the way the test runner does, then poll hard and check it is
    // still there. Under the old middleware this is what got evicted.
    await fetch(`${baseUrl}/api/products`);
    const marker = (await readLogs()).logs.at(-1);

    for (let i = 0; i < 200; i++) {
      await fetch(`${baseUrl}/api/logs`);
    }

    const after = await readLogs();
    assert.ok(
      after.logs.some((entry) => entry.timestamp === marker.timestamp),
      'the seeded entry should not have been evicted by polling',
    );
  });
});
