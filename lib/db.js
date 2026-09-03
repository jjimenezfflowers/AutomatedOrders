/*
 * The one Prisma client the process shares.
 *
 * DATABASE_URL is defaulted here rather than required, so a fresh checkout runs
 * with no setup step: the database is committed, and pointing at it is not a
 * decision anyone needs to make. Setting the variable overrides it, which is how
 * the tests get a database of their own.
 */

const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

/** The committed database, alongside the schema and its migrations. */
const DATABASE_FILE = path.join(__dirname, '..', 'prisma', 'db.sqlite');

const databaseUrl = () => process.env.DATABASE_URL || `file:${DATABASE_FILE}`;

/** A client pointed at `url`, or at the committed database when none is given. */
function createClient(url = databaseUrl()) {
  return new PrismaClient({ datasources: { db: { url } } });
}

/*
 * Reused across requests. A connection per call would be slower and, on SQLite,
 * would multiply the writers competing for the same file.
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

module.exports = { db, createClient, disconnect, databaseUrl, DATABASE_FILE };
