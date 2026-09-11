/*
 * A database of a test's own.
 *
 * Every test that writes gets an empty one, migrated from the same files the
 * real database was built from, so a test can never append to the committed
 * history — which is exactly the accident that made this migration necessary in
 * the first place.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createClient } = require('../../lib/db');

const ROOT = path.join(__dirname, '..', '..');

/**
 * An empty database with the schema applied, and a client pointed at it.
 *
 * `migrate deploy` rather than `db push`: it applies the committed migrations,
 * so a test proves those work rather than only that the schema parses.
 *
 * @returns {{ client: import('@prisma/client').PrismaClient, file: string, cleanup: () => Promise<void> }}
 */
function createTestDatabase() {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'automated-orders-')),
    'test.sqlite',
  );
  const url = `file:${file}`;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const client = createClient(url);

  return {
    client,
    file,
    url,
    async cleanup() {
      await client.$disconnect();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    },
  };
}

module.exports = { createTestDatabase };
