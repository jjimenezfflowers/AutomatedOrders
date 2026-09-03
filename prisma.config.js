/*
 * Prisma 7 moved the connection out of schema.prisma: the CLI reads it here, and
 * the client is handed a driver adapter instead of a URL.
 *
 * The path is resolved from this file rather than the working directory. The
 * server used to read its JSON with bare relative paths, so starting it from
 * anywhere but the repository root read the wrong files or none; the database
 * should not inherit that.
 */

const path = require('node:path');
const { defineConfig } = require('prisma/config');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');

/** The committed database, alongside the schema and its migrations. */
const DATABASE_FILE = path.join(__dirname, 'prisma', 'db.sqlite');

/** `DATABASE_URL` overrides it, which is how the tests get their own database. */
const databaseUrl = () => process.env.DATABASE_URL ?? `file:${DATABASE_FILE}`;

module.exports = defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(__dirname, 'prisma', 'migrations'),
  },
  // `datasource` is what migrate and studio connect through; `adapter` is what
  // the client uses at runtime. Both, or the CLI has no database to talk to.
  datasource: { url: databaseUrl() },
  adapter: () => new PrismaBetterSqlite3({ url: databaseUrl() }),
});

module.exports.DATABASE_FILE = DATABASE_FILE;
module.exports.databaseUrl = databaseUrl;
