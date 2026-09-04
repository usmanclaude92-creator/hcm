#!/usr/bin/env node
/*
 * One-way migration of the local JSON store (data/payroll_database.json) into the
 * app_state row in PostgreSQL.
 *
 * The whole application state lives in a single JSONB document, so this is a single
 * row write -- but it is a destructive one, and the row it replaces may be the live
 * production dataset. The script therefore:
 *   1. refuses to do anything without --confirm;
 *   2. always writes the current database row to a timestamped backup file FIRST;
 *   3. prints a side-by-side count of what is in the database versus what is about to
 *      replace it, so the operator can see exactly what changes;
 *   4. respects the same optimistic version column the application uses, so a
 *      concurrent write by a running server is detected rather than silently lost.
 *
 * Usage:
 *   node scripts/migrate-json-to-postgres.cjs            # dry run, shows the diff
 *   node scripts/migrate-json-to-postgres.cjs --confirm  # performs the migration
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const pg = require('pg');

const CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

const JSON_PATH = path.join(__dirname, '..', 'data', 'payroll_database.json');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const CONFIRM = process.argv.includes('--confirm');

// Counts every collection in the document so the operator sees the whole picture, not
// just the few tables someone remembered to check.
function summarise(doc) {
  const out = {};
  for (const key of Object.keys(doc || {}).sort()) {
    const v = doc[key];
    if (Array.isArray(v)) out[key] = v.length;
    else if (v && typeof v === 'object') out[key] = `${Object.keys(v).length} keys`;
    else out[key] = typeof v;
  }
  return out;
}

function diffTable(dbDoc, fileDoc) {
  const keys = [...new Set([...Object.keys(dbDoc || {}), ...Object.keys(fileDoc || {})])].sort();
  const rows = [];
  for (const k of keys) {
    const a = Array.isArray(dbDoc?.[k]) ? dbDoc[k].length : dbDoc?.[k] === undefined ? '-' : 'obj';
    const b = Array.isArray(fileDoc?.[k]) ? fileDoc[k].length : fileDoc?.[k] === undefined ? '-' : 'obj';
    const flag = a === b ? '' : (a === '-' ? '  NEW' : b === '-' ? '  LOST' : '  CHANGED');
    rows.push(`  ${k.padEnd(28)} db=${String(a).padStart(5)}  ->  file=${String(b).padStart(5)}${flag}`);
  }
  return rows.join('\n');
}

(async () => {
  if (!CONNECTION_STRING) {
    console.error('DATABASE_URL is not set. Add it to .env before running this migration.');
    process.exit(1);
  }
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`No local store found at ${JSON_PATH}. Nothing to migrate.`);
    process.exit(1);
  }

  const fileDoc = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));

  const pool = new pg.Pool({
    connectionString: CONNECTION_STRING,
    ssl: CONNECTION_STRING.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15000,
  });

  const client = await pool.connect();
  try {
    const now = await client.query('SELECT NOW() AS now, current_database() AS db, current_user AS usr');
    console.log(`Connected to ${now.rows[0].db} as ${now.rows[0].usr} at ${now.rows[0].now.toISOString()}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id VARCHAR(32) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query('ALTER TABLE app_state ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;');

    const existing = await client.query('SELECT data, version, updated_at FROM app_state WHERE id = $1', ['main']);
    const dbDoc = existing.rows[0]?.data || null;
    const dbVersion = existing.rows[0]?.version ?? 0;

    if (dbDoc) {
      console.log(`\nExisting app_state row: version ${dbVersion}, last updated ${existing.rows[0].updated_at.toISOString()}`);
    } else {
      console.log('\nNo existing app_state row -- this will be the first write.');
    }

    console.log('\nCollection counts (database -> local file):');
    console.log(diffTable(dbDoc, fileDoc));

    // The backup is written whether or not --confirm was passed, so a dry run also
    // leaves the operator holding a copy of what is currently live.
    if (dbDoc) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `app_state_before_migration_${stamp}.json`);
      fs.writeFileSync(backupPath, JSON.stringify({ version: dbVersion, data: dbDoc }, null, 2));
      console.log(`\nBackup of the current database row written to:\n  ${backupPath}`);
    }

    if (!CONFIRM) {
      console.log('\nDRY RUN -- nothing was written. Re-run with --confirm to migrate.');
      return;
    }

    // Version-guarded write. If a running server saved between the read above and this
    // statement, no row matches and the migration aborts instead of overwriting it.
    let written;
    if (dbDoc) {
      written = await client.query(
        `UPDATE app_state
            SET data = $1, version = version + 1, updated_at = NOW()
          WHERE id = 'main' AND version = $2
      RETURNING version`,
        [JSON.stringify(fileDoc), dbVersion]
      );
    } else {
      written = await client.query(
        `INSERT INTO app_state (id, data, version, updated_at)
         VALUES ('main', $1, 1, NOW())
         ON CONFLICT (id) DO NOTHING
         RETURNING version`,
        [JSON.stringify(fileDoc)]
      );
    }

    if (written.rowCount === 0) {
      console.error(
        '\nMigration ABORTED: the app_state row changed while this script was running.\n' +
        'Stop the application server, then run the migration again.'
      );
      process.exitCode = 1;
      return;
    }

    const check = await client.query('SELECT version, updated_at, pg_column_size(data) AS bytes FROM app_state WHERE id = $1', ['main']);
    console.log(`\nMigration complete. app_state is now version ${check.rows[0].version} (${check.rows[0].bytes} bytes, ${check.rows[0].updated_at.toISOString()}).`);
    console.log('Read-back verification:');
    const readBack = await client.query('SELECT data FROM app_state WHERE id = $1', ['main']);
    console.log(JSON.stringify(summarise(readBack.rows[0].data), null, 1));
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
