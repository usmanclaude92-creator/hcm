#!/usr/bin/env node
/**
 * Resets a user's password in the real HCMS store, for when nobody can sign in.
 *
 * Generates a strong password, writes the bcrypt hash into the app_state users array
 * under an optimistic version guard, and prints the new password to THIS terminal only.
 * Nothing is written to a file and nothing leaves the machine.
 *
 * Connects however you can reach the database:
 *   DATABASE_URL                                  direct Postgres (preferred)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY      Supabase REST, no Postgres port needed
 *
 * Both are read from the environment or from a local .env file.
 *
 *   node scripts/reset-admin-password.cjs                    # dry run
 *   node scripts/reset-admin-password.cjs --confirm
 *   node scripts/reset-admin-password.cjs --confirm --user manager
 *   node scripts/reset-admin-password.cjs --confirm --password 'MyOwnPassword9'
 *
 * The reset password deliberately satisfies the password policy, so the account is NOT
 * forced to change it at next sign-in. Change it yourself once you are back in.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const argVal = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const TARGET_USER = (argVal('--user') || 'admin').trim().toLowerCase();
const SUPPLIED_PASSWORD = argVal('--password');

// Load .env without adding a dependency.
function loadEnvFile() {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadEnvFile();

function resolvePostgresConnectionString() {
  let raw =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!raw) return undefined;
  raw = raw.trim();
  if (/^postgres(ql)?:\/\//i.test(raw)) {
    return raw;
  }
  if (process.env.SUPABASE_URL) {
    try {
      const url = new URL(process.env.SUPABASE_URL);
      const host = url.hostname.startsWith('db.') ? url.hostname : `db.${url.hostname}`;
      const encodedPassword = encodeURIComponent(raw);
      return `postgresql://postgres:${encodedPassword}@${host}:5432/postgres`;
    } catch {
      // ignore
    }
  }
  return raw;
}

const CONNECTION_STRING = resolvePostgresConnectionString();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Unambiguous alphabet: no 0/O/1/l/I, so the password can be read aloud or retyped.
function generatePassword(len = 18) {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const pool = upper + lower + digit;
  const buf = crypto.randomBytes(len + 8);
  let out = upper[buf[0] % upper.length] + lower[buf[1] % lower.length] + digit[buf[2] % digit.length];
  for (let i = 3; i < len; i++) out += pool[buf[i] % pool.length];
  return out;
}

function describe(users) {
  console.log(`\n  Accounts in this database (${users.length}):`);
  for (const u of users) {
    const mark = String(u.username).toLowerCase() === TARGET_USER ? ' <-- target' : '';
    console.log(`    ${String(u.username).padEnd(16)} ${String(u.role || '').padEnd(18)} ${u.isActive === false ? 'INACTIVE' : 'active'}${mark}`);
  }
}

function applyReset(users, hash) {
  let found = false;
  const next = users.map((u) => {
    if (String(u.username).toLowerCase() !== TARGET_USER) return u;
    found = true;
    return { ...u, passwordHash: hash, isActive: true, updatedAt: new Date().toISOString() };
  });
  return { next, found };
}

function reportTarget(password) {
  console.log('\n  ------------------------------------------------------------');
  console.log(`  Username: ${TARGET_USER}`);
  console.log(`  Password: ${password}`);
  console.log('  ------------------------------------------------------------');
  console.log('  Shown here only. Sign in and change it, then clear your terminal.\n');
}

async function runPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: CONNECTION_STRING.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    const res = await pool.query('SELECT data, version FROM app_state WHERE id = $1', ['main']);
    if (res.rows.length === 0) {
      console.log('\nNo app_state row found. This database holds no HCMS data.');
      return;
    }

    const data = res.rows[0].data;
    const version = res.rows[0].version ?? 1;
    const users = Array.isArray(data.users) ? data.users : [];
    console.log(`\nTarget: PostgreSQL (app_state version ${version})`);
    describe(users);

    if (!users.some((u) => String(u.username).toLowerCase() === TARGET_USER)) {
      console.error(`\n  No account named '${TARGET_USER}' exists here. Use --user with one of the names above.`);
      process.exitCode = 1;
      return;
    }

    if (!CONFIRM) {
      console.log('\nDry run. Re-run with --confirm to reset the password.\n');
      return;
    }

    const password = SUPPLIED_PASSWORD || generatePassword();
    const { next } = applyReset(users, bcrypt.hashSync(password, 10));
    data.users = next;

    const upd = await pool.query(
      `UPDATE app_state SET data = $1, version = version + 1, updated_at = NOW()
       WHERE id = 'main' AND version = $2 RETURNING version`,
      [JSON.stringify(data), version]
    );

    if (upd.rowCount === 0) {
      console.error('\n  ABORTED: the database changed while this script ran. Nothing was written. Re-run.');
      process.exitCode = 1;
      return;
    }

    console.log(`\n  Password reset. app_state is now at version ${upd.rows[0].version}.`);
    reportTarget(password);
  } finally {
    await pool.end();
  }
}

async function runSupabaseRest() {
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  const readRes = await fetch(`${base}/rest/v1/app_state?id=eq.main&select=data,version`, { headers });
  if (!readRes.ok) {
    throw new Error(`Read failed (${readRes.status}): ${(await readRes.text()).slice(0, 200)}`);
  }
  const rows = await readRes.json();
  if (!rows.length) {
    console.log('\nNo app_state row found. This database holds no HCMS data.');
    return;
  }

  const { data, version } = rows[0];
  const users = Array.isArray(data.users) ? data.users : [];
  console.log(`\nTarget: Supabase REST (app_state version ${version})`);
  describe(users);

  if (!users.some((u) => String(u.username).toLowerCase() === TARGET_USER)) {
    console.error(`\n  No account named '${TARGET_USER}' exists here. Use --user with one of the names above.`);
    process.exitCode = 1;
    return;
  }

  if (!CONFIRM) {
    console.log('\nDry run. Re-run with --confirm to reset the password.\n');
    return;
  }

  const password = SUPPLIED_PASSWORD || generatePassword();
  const { next } = applyReset(users, bcrypt.hashSync(password, 10));
  data.users = next;

  // Version-guarded, same optimistic scheme the application uses.
  const updRes = await fetch(
    `${base}/rest/v1/app_state?id=eq.main&version=eq.${version}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ data, version: version + 1, updated_at: new Date().toISOString() }),
    }
  );
  if (!updRes.ok) {
    throw new Error(`Write failed (${updRes.status}): ${(await updRes.text()).slice(0, 200)}`);
  }
  const updated = await updRes.json();
  if (!updated.length) {
    console.error('\n  ABORTED: the database changed while this script ran. Nothing was written. Re-run.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Password reset. app_state is now at version ${updated[0].version}.`);
  reportTarget(password);
}

(async () => {
  console.log('HCMS — reset a sign-in password');
  try {
    if (CONNECTION_STRING) {
      await runPostgres();
    } else if (SUPABASE_URL && SERVICE_KEY) {
      console.log('\nDATABASE_URL is not set — using the Supabase REST API instead.');
      await runSupabaseRest();
    } else {
      console.error(
        '\nNo connection available. Set DATABASE_URL, or SUPABASE_URL together with\n' +
        'SUPABASE_SERVICE_ROLE_KEY, for the database the live site actually uses.\n'
      );
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\nFailed:', err.message);
    process.exitCode = 1;
  }
})();
