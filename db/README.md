# Database — relational migration

The application still stores everything in a single JSONB document
(`app_state`). These migrations build the relational schema that replaces it.
**They are additive: nothing here reads, writes or drops `app_state`.**

## Status

| Stage | State |
|---|---|
| 001 schema designed and written | Done |
| 002 integrity controls written | Done |
| 003 scoped overrides | Done — closes a control bypass 002 shipped with |
| Rollback proven | Done — forward → rollback → forward, lossless both ways |
| Rehearsed on real PostgreSQL 16 | Done — 3 consecutive passes, 0 errors |
| Applied to a staging Supabase project | Done — `hcm-staging`, PostgreSQL 17.6 |
| Integrity test suite | Done — 43/43 assertions pass on staging |
| 001 applied to production | Done — 43 tables, 60/61 FKs, 84 checks, 105 indexes |
| 001e + 002 + 003 applied to production | **Not yet** — see below |
| Data backfilled from `app_state` | Not yet |
| Application reads/writes switched over | Not yet |

### What is live in production right now

The relational tables, columns, foreign keys, check constraints and indexes of
001 are applied. `app_state` was not touched and the application ran normally
throughout — it advanced from version 186 to 192 and gained an employee while
the migration was being applied, which is the intended property: the relational
side is built alongside the live store, not in place of it.

Three pieces are still outstanding, all of them additive and none of them
blocking the running application (nothing writes these tables yet):

| Step | File | What it does |
|---|---|---|
| `001e` | tail of `001_relational_core.sql` | Converts `audit_logs.id` / `user_id` to `uuid` and the remaining varchar columns to `text`, then adds `audit_logs_user_fk`. `audit_logs` holds 0 rows, so this rewrites nothing. |
| `002` | `002_integrity_controls.sql` | The trigger layer and the reconciliation view. |
| `003` | `003_scoped_overrides.sql` | Must be applied immediately after 002 — 002 alone ships the global override this replaces. |

Until 002 and 003 are applied, the relational tables have their **structural**
integrity (keys, FKs, checks, uniqueness) but not their **behavioural** locks
(append-only audit, finalized-payroll immutability, payment and loan ceilings).
That is safe only while the tables are empty, which they are. Apply 002 and 003
before the backfill puts a single financial row in them.

## Files

| File | Purpose |
|---|---|
| `migrations/000_legacy_baseline.sql` | The schema that already exists in production, so 001+ can be rehearsed from an identical starting point on a throwaway database. Never run against production. |
| `migrations/001_relational_core.sql` | 43 tables, 61 foreign keys, 84 check constraints, 105 indexes. Non-destructive: the eight pre-existing empty tables are `ALTER`ed into shape, never dropped. |
| `migrations/002_integrity_controls.sql` | Triggers and a reconciliation view: append-only audit, finalized-payroll and approved-attendance locks, payment/loan/WPS ceilings, payroll-month consistency. |
| `migrations/003_scoped_overrides.sql` | Replaces 002's single global override switch with one named scope per control. Required: without it, any one authorised correction unlocks every financial control for the rest of the transaction. |
| `tests/integrity_test.sql` | 43 assertions that each attempt a forbidden operation and confirm the database refuses it, including four that specifically prove one control's override does not open another's. |

## Rehearsing locally

```bash
createdb hcm_rehearsal
psql -d hcm_rehearsal -f db/migrations/000_legacy_baseline.sql
psql -d hcm_rehearsal -f db/migrations/001_relational_core.sql
psql -d hcm_rehearsal -f db/migrations/002_integrity_controls.sql
psql -d hcm_rehearsal -f db/migrations/003_scoped_overrides.sql
psql -d hcm_rehearsal -f db/tests/integrity_test.sql     # expect 43 passed, 0 failed
```

001, 002 and 003 are idempotent — re-running them is a no-op. This was verified
over three consecutive passes.

**Rehearse in a single transaction as well as under autocommit.** psql
autocommit puts every statement in its own transaction, which hides any
override that outlives the statement that set it. That is not how the
application talks to the database. Running the suite through one connection in
one transaction is what caught the defect 003 fixes.

## Design decisions

- **Money is `NUMERIC(14,3)`**, never floating point. OMR carries three decimals.
- **Deletes are `RESTRICT`** on every financial relationship. No cascade can
  remove payroll or payment history.
- **Payroll lines carry a snapshot** of the employee master as at calculation
  time (name, company, designation, rate), so a payslip renders identically
  years later. `payroll_line_inputs` records which attendance, leave and loan
  records produced each figure.
- **Locks are enforced by trigger**, not by application convention. A legitimate
  correction opens one named scope for the duration of its transaction:

  ```sql
  SELECT hcms_override('attendance_correction');
  UPDATE attendance_records ...;
  SELECT hcms_override_clear();
  ```

  Each guard accepts only its own scope, so an attendance correction cannot
  authorise a payroll edit or a loan over-recovery. 002 shipped a single global
  switch and its header claimed the flag "cannot leak into another statement";
  that was wrong — `SET LOCAL` is transaction-scoped, not statement-scoped.
  Under a pooled connection one correction disarmed every financial control for
  the rest of the request. 003 fixes this; callers must still clear the scope.
- **Statuses are `text` + `CHECK`** rather than PostgreSQL enums, which need a
  migration for every new value.

## Before applying to production

Per the project's own rule, migrations run in staging first. The Supabase free
plan caps this organisation at two active projects; the `staff` project was
paused to free the slot, and `hcm-staging` (region `ap-northeast-2`,
PostgreSQL 17.6) now holds 000+001+002+003 with 43/43 integrity assertions
passing. Production has **not** been touched.

Regardless of that, a backup exists: `app_state` row
`backup-preaudit-20260906` (inert; the application only reads `main`) and two
JSON exports in the `HCMS-backups` folder on the administrator workstation.
Those exports contain personal data and password hashes and must not be
committed to this repository.
