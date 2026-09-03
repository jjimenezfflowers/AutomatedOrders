/*
 * The one Prisma client the process shares.
 *
 * Prisma 7 takes a driver adapter rather than a URL, and the URL is resolved from
 * the repository root rather than the working directory. The server used to read
 * its JSON with bare relative paths, so starting it from anywhere but the root
 * read the wrong files or none at all; the database does not inherit that.
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

const { databaseUrl } = require('../prisma.config.js');

/**
 * A client pointed at `url`, or at the committed database when none is given.
 * Tests pass their own so a run never writes into the real history.
 */
function createClient(url = databaseUrl()) {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

/*
 * Reused across requests. Opening a connection per call would be slower and, on
 * SQLite, would multiply the writers competing for the same file.
 */
let shared = null;

function db() {
  shared ??= createClient();
  return shared;
}

async function disconnect() {
  if (!shared) return;
  const client = shared;
  shared = null;
  await client.$disconnect();
}

module.exports = { db, createClient, disconnect, databaseUrl };
