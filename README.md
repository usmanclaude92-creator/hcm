# HCMS — Human Capital Management System

Employee, attendance, payroll, WPS and Oman HR compliance management. Currency is OMR at
three decimal places throughout.

- **Frontend** — React 19 + Vite + Tailwind, TypeScript
- **Backend** — Express, TypeScript, mounted both as a long-running server and as a Vercel
  serverless function from the same app factory (`server/app.ts`)
- **Store** — PostgreSQL. See [Data storage](#data-storage) — the current shape is a known
  constraint, not a finished design.
- **Files** — Supabase object storage for employee documents and payment receipts

---

## Running locally

```bash
npm install
cp .env.example .env    # then fill in the values below
npm run dev             # http://localhost:3000
```

With no `DATABASE_URL` set, the app runs against a local JSON file at
`data/payroll_database.json` and seeds a demonstration dataset (five employees, one
finalized payroll, sample loans and compliance documents) plus development sign-in
accounts. This never happens when `NODE_ENV=production`.

```bash
npm run lint     # tsc --noEmit
npm test         # payroll arithmetic, expiry rules, IBAN generation
npm run build    # vite build + esbuild server bundle
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Production | PostgreSQL connection string. Use the **transaction pooler** on a serverless host, not the direct connection. `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` are also accepted. |
| `JWT_SECRET` | Always | Signing secret for session tokens. The server refuses to start without it. |
| `ADMIN_INITIAL_PASSWORD` | First production start | Password for the first administrator. Required when the database has no user accounts and `NODE_ENV=production`; the server refuses to start otherwise rather than create a known default. |
| `ADMIN_INITIAL_USERNAME` | Optional | Defaults to `admin`. |
| `ADMIN_INITIAL_EMAIL` | Optional | Defaults to `admin@company.com`. |
| `SUPABASE_URL` | Production | Object storage endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Object storage credentials. |
| `SUPABASE_DOCUMENTS_BUCKET` | Optional | Defaults to `employee-documents`. |
| `SUPABASE_RECEIPTS_BUCKET` | Optional | Defaults to `salary-payment-receipts`. |
| `GEMINI_API_KEY` | Optional | Enables the compliance assistant. Without it, a deterministic rule-based responder is used instead. |
| `WORKFORCE_SHIFT_STATUS_URL` / `WORKFORCE_SHIFT_STATUS_SECRET` | Optional | Populates "Shift Start"/"Shift End" on the Workforce Deployment dashboard's employee cards from the Artify Workforce app's live clock-in/clock-out data. Without these, cards show "Not Tracked" as before. |
| `DB_CONNECT_TIMEOUT_MS` | Optional | Database connect timeout, default 10000. |
| `ALLOW_DEMO_SEED` | Optional | Set to `false` to suppress the demonstration dataset outside production. |

Bootstrap the first administrator, then change the password through the UI:

```bash
ADMIN_INITIAL_PASSWORD='<a strong password>' npm start
```

---

## Data storage

All application data currently lives in a **single JSONB row** (`app_state`), not in the
per-entity tables the schema creates. Every mutation rewrites that row under an optimistic
version check.

Consequences to be aware of before building on this:

- No foreign keys, unique constraints or indexes are enforced by the database.
- Write cost scales with total dataset size, not with the size of the change.
- Concurrent writes are serialised by a version counter and retried; a conflict that
  survives the retries surfaces as an error to the caller.

Write failures **throw**. A request that returns success means the data was committed. If a
configured database is unreachable the server refuses to start rather than fall back to
local storage, because that fallback previously caused demonstration data to be served as
though it were production data.

Migrating each repository in `server/db.ts` onto real tables — starting with the
append-only financial records — is the highest-value structural work outstanding.

---

## Modules

| Area | Notes |
|---|---|
| Employee Master | Core record, bank details, Excel import/export with server-side re-validation |
| HR Compliance | Civil ID, visa, driving licence and government documents with expiry tracking and renewal history |
| Document Repository | Uploads to object storage, per-employee and organisation-wide views |
| Attendance | Multi-project day/hour allocation, four-stage workflow, Excel import |
| Timesheets | Per-entry labour capture for project costing. Does **not** feed payroll. |
| Payroll | Monthly calculation, per-line overrides, finalisation lock, reasoned revision |
| Salary Payments | Partial payments against a finalized entitlement, receipts, soft reversal |
| Payment Planning | Intended "should pay" figures. Never creates a payment. |
| WPS Recovery | Tracks recovery of the excess between declared WPS salary and net pay |
| Loans | Advances with payroll-driven and direct recovery |
| CIF | Bank file upload and reconciliation against payroll totals |
| Reports | Salary & payroll, payments, WPS, loans, project costing, employee ledger |
| Audit Trail | Action log across modules, retained to 5000 entries |

### Payroll rules

```
Worker   Gross = hoursWorked × rate
Staff    Gross = (monthlySalary ÷ 30) × min(daysWorked, 30)
Net          = Gross + Additions − Deductions
Recoverable  = max(wpsSalary − Net, 0)
```

Finalisation locks the month, posts loan recoveries and opens WPS recovery records.
Correcting a finalized month requires an explicit revision, which reverses those postings
and refuses outright where a WPS recovery has already received money.

Finalisation requires the month's attendance to be **Approved**. It can be overridden with
a recorded reason, which is written to the audit trail.

### Known functional gaps

These are absent by design at present and should not be assumed to work:

- **Leave management** — no leave entity of any kind
- **Overtime pay** — overtime hours are captured but never paid
- **Pro-rata** — no automatic calculation for mid-month joiners or leavers
- **Accounting** — no journals, ledger or posting; payroll cost must be journalised manually
- **End-of-service** — no gratuity or final settlement calculation
- **Company isolation** — every authenticated user can see every company's data

---

## Roles

| Role | Capability |
|---|---|
| Administrator | Everything, including user administration |
| Payroll Manager | Everything except user administration; may finalise and revise payroll |
| Payroll User | Day-to-day data entry; cannot finalise payroll or delete documents |
| Viewer | Read and export only |

Granular permissions are defined in `src/permissions.ts` and enforced server-side. Hiding a
control in the UI is never the access check.

---

## Deployment

Vercel, built with `vite build`; `api/index.ts` serves all `/api/*` routes and
`vercel.json` rewrites everything else to the SPA.

Before the first production deploy, confirm:

- `JWT_SECRET` is set to a value not used anywhere else
- `ADMIN_INITIAL_PASSWORD` is set, and changed through the UI after first sign-in
- `DATABASE_URL` uses the transaction pooler
- `npm run lint` and `npm test` both pass
