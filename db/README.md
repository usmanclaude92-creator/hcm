# Database — relational migration

The application still stores everything in a single JSONB document
(`app_state`). These migrations build the relational schema that replaces it.
**They are additive: nothing here reads, writes or drops `app_state`.**

## Status

| Stage | State |
|---|---|
| 001 schema designed and written | Done |
| 002 integrity controls written | Done |
| Rehearsed on real PostgreSQL 16 | Done — 3 consecutive passes, 0 errors |
| Integrity test suite | Done — 38/38 assertions pass |
| Applied to production | **Not yet** — awaiting a staging database decision |
| Data backfilled from `app_state` | Not yet |
| Application reads/writes switched over | Not yet |

## Files

| File | Purpose |
|---|---|
| `migrations/000_legacy_baseline.sql` | The schema that already exists in production, so 001+ can be rehearsed from an identical starting point on a throwaway database. Never run against production. |
| `migrations/001_relational_core.sql` | 43 tables, 61 foreign keys, 84 check constraints, 105 indexes. Non-destructive: the eight pre-existing empty tables are `ALTER`ed into shape, never dropped. |
| `migrations/002_integrity_controls.sql` | Triggers and a reconciliation view: append-only audit, finalized-payroll and approved-attendance locks, payment/loan/WPS ceilings, payroll-month consistency. |
| `tests/integrity_test.sql` | 38 assertions that each attempt a forbidden operation and confirm the database refuses it. |

## Rehearsing locally

```bash
createdb hcm_rehearsal
psql -d hcm_rehearsal -f db/migrations/000_legacy_baseline.sql
psql -d hcm_rehearsal -f db/migrations/001_relational_core.sql
psql -d hcm_rehearsal -f db/migrations/002_integrity_controls.sql
psql -d hcm_rehearsal -f db/tests/integrity_test.sql     # expect 38 passed, 0 failed
```

001 and 002 are idempotent — re-running them is a no-op. This was verified over
three consecutive passes.

## Design decisions

- **Money is `NUMERIC(14,3)`**, never floating point. OMR carries three decimals.
- **Deletes are `RESTRICT`** on every financial relationship. No cascade can
  remove payroll or payment history.
- **Payroll lines carry a snapshot** of the employee master as at calculation
  time (name, company, designation, rate), so a payslip renders identically
  years later. `payroll_line_inputs` records which attendance, leave and loan
  records produced each figure.
- **Locks are enforced by trigger**, not by application convention. A legitimate
  correction sets `SET LOCAL hcms.allow_locked_write = 'on'` inside its
  transaction; the flag is transaction-scoped and cannot leak.
- **Statuses are `text` + `CHECK`** rather than PostgreSQL enums, which need a
  migration for every new value.

## Before applying to production

Per the project's own rule, migrations run in staging first. The Supabase free
plan caps this organisation at two active projects (`hcm`, `staff`), so a
separate staging project could not be created. That decision is open — see the
production-readiness notes.

Regardless of that, a backup exists: `app_state` row
`backup-preaudit-20260906` (inert; the application only reads `main`) and two
JSON exports in the `HCMS-backups` folder on the administrator workstation.
Those exports contain personal data and password hashes and must not be
committed to this repository.
