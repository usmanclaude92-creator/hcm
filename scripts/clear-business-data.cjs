#!/usr/bin/env node
/**
 * Clears every business record from the real HCMS data store, leaving an empty system
 * that contains only what a user subsequently enters.
 *
 * Removes: employees, projects, attendance, timesheets, payroll and payroll lines,
 * salary payments, payment plans, loans and recoveries, WPS recoveries, CIF batches,
 * and all compliance records (Civil IDs, driving licences, visas, government documents,
 * uploaded document metadata, personal details).
 *
 * Preserves: user accounts (so you can still sign in) and the driving-licence category
 * list (configuration, not a record).
 *
 * Does NOT touch Demo Access. That dataset lives in src/demo/ and is generated in the
 * browser for a demo session only; it never reaches this store.
 *
 * Targets Postgres when DATABASE_URL is set, otherwise the local JSON file.
 *
 *   node scripts/clear-business-data.cjs                 # dry run, shows what would go
 *   node scripts/clear-business-data.cjs --confirm       # actually clear
 *   node scripts/clear-business-data.cjs --confirm --wipe-users --wipe-audit
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const WIPE_USERS = args.includes('--wipe-users');
const KEEP_AUDIT = !args.includes('--wipe-audit');

const DB_FILE = path.join(process.cwd(), 'data', 'payroll_database.json');
const CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

// Collections emptied by this script. Anything not listed here is left untouched.
const BUSINESS_COLLECTIONS = [
  'employees', 'designationHistory', 'salaryHistory', 'projects',
  'attendance', 'attendanceMonths', 'timesheets',
  'cifBatches', 'cifRecords',
  'payrolls', 'payrollLines', 'payrollRevisions',
  'salaryPayments', 'paymentPlans', 'paymentPlanLines',
  'wpsRecoveries', 'wpsRecoveryTransactions',
  'loans', 'loanRecoveries',
  'civilIds', 'drivingLicences', 'visas', 'governmentDocuments', 'documents',
];

function summarize(data) {
  const rows = [];
  for (const key of BUSINESS_COLLECTIONS) {
    const n = Array.isArray(data[key]) ? data[key].length : 0;
    if (n > 0) rows.push([key, n]);
  }
  const pd = data.personalDetails && typeof data.personalDetails === 'object'
    ? Object.keys(data.personalDetails).length : 0;
  if (pd > 0) rows.push(['personalDetails', pd]);
  if (!KEEP_AUDIT && Array.isArray(data.auditLogs) && data.auditLogs.length) {
    rows.push(['auditLogs', data.auditLogs.length]);
  }
  if (WIPE_USERS && Array.isArray(data.users) && data.users.length) {
    rows.push(['users', data.users.length]);
  }
  return rows;
}

function clear(data) {
  for (const key of BUSINESS_COLLECTIONS) {
    if (Array.isArray(data[key])) data[key] = [];
  }
  data.personalDetails = {};
  if (!KEEP_AUDIT) data.auditLogs = [];
  if (WIPE_USERS) data.users = [];
  return data;
}

function report(target, data) {
  const rows = summarize(data);
  console.log(`\nTarget: ${target}`);
  if (rows.length === 0) {
    console.log('  Already empty. Nothing to remove.');
    return false;
  }
  console.log('  Records that will be permanently removed:');
  let total = 0;
  for (const [name, n] of rows) {
    console.log(`    ${String(n).padStart(6)}  ${name}`);
    total += n;
  }
  console.log(`    ${String(total).padStart(6)}  TOTAL`);
  console.log(`\n  Preserved: ${WIPE_USERS ? '(users will also be removed)' : `${(data.users || []).length} user account(s)`}` +
    `${KEEP_AUDIT ? `, ${(data.auditLogs || []).length} audit entries` : ''}` +
    `, driving-licence categories.`);
  return true;
}

async function runPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: CONNECTION_STRING.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const res = await pool.query('SELECT data, version FROM app_state WHERE id = $1', ['main']);
  if (res.rows.length === 0) {
    console.log('\nNo app_state row found — the database is empty already.');
    await pool.end();
    return;
  }

  const data = res.rows[0].data;
  const version = res.rows[0].version ?? 1;
  const hasWork = report('PostgreSQL (app_state)', data);

  if (!hasWork) { await pool.end(); return; }

  if (!CONFIRM) {
    console.log('\nDry run. Re-run with --confirm to apply.\n');
    await pool.end();
    return;
  }

  const backup = path.join(process.cwd(), `payroll_database.pg-backup.${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n  Backup written: ${backup}`);

  const cleared = clear(data);
  // Version-guarded, matching the application's own optimistic-concurrency scheme, so a
  // write from the running app between the read above and this update is not clobbered.
  const upd = await pool.query(
    `UPDATE app_state SET data = $1, version = version + 1, updated_at = NOW()
     WHERE id = 'main' AND version = $2 RETURNING version`,
    [JSON.stringify(cleared), version]
  );
  if (upd.rowCount === 0) {
    console.error('\n  ABORTED: the database changed while this script was running. Nothing was written. Re-run.');
    process.exitCode = 1;
  } else {
    console.log(`  Cleared. app_state is now at version ${upd.rows[0].version}.`);
  }
  await pool.end();
}

function runLocalFile() {
  if (!fs.existsSync(DB_FILE)) {
    console.log(`\nNo local store at ${DB_FILE}. Nothing to do.`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  const hasWork = report(DB_FILE, data);
  if (!hasWork) return;

  if (!CONFIRM) {
    console.log('\nDry run. Re-run with --confirm to apply.\n');
    return;
  }

  const backup = `${DB_FILE}.backup.${Date.now()}`;
  fs.copyFileSync(DB_FILE, backup);
  console.log(`\n  Backup written: ${backup}`);

  fs.writeFileSync(DB_FILE, JSON.stringify(clear(data), null, 2), 'utf-8');
  console.log('  Cleared.');
}

(async () => {
  console.log('HCMS — clear business data');
  console.log('Demo Access data is generated in the browser and is not affected.');
  try {
    if (CONNECTION_STRING) {
      await runPostgres();
    } else {
      console.log('\nDATABASE_URL is not set — targeting the local JSON store.');
      runLocalFile();
    }
  } catch (err) {
    console.error('\nFailed:', err.message);
    process.exitCode = 1;
  }
})();
