import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { currentRequestContext } from './requestContext.js';
import type {
  User,
  Employee,
  DesignationHistory,
  SalaryHistory,
  Project,
  AttendanceRecord,
  AttendanceMonth,
  TimesheetEntry,
  CifBatch,
  CifRecord,
  MonthlyPayroll,
  PayrollLine,
  PayrollRevision,
  SalaryPaymentTransaction,
  PaymentPlan,
  PaymentPlanLine,
  WPSRecovery,
  WPSRecoveryTransaction,
  EmployeeLoan,
  LoanRecoveryTransaction,
  LoanStatus,
  LeaveType,
  Department,
  Designation,
  LeaveRequest,
  AuditLog,
  EmployeeCivilId,
  EmployeeDrivingLicence,
  EmployeeVisa,
  EmployeeGovernmentDocument,
  EmployeePersonalDetails,
  EmployeeDocument,
  EmployeeDocumentCategory,
  DocumentExpiryStatus,
  OverallComplianceStatus,
  DrivingLicenceCategory,
} from '../src/types/index';

// 3-decimal safe monetary arithmetic helper
export function roundOMR(amount: number): number {
  if (isNaN(amount) || amount === null || amount === undefined) return 0;
  // Strip accumulated floating-point noise before rounding to 3 decimals; a fixed
  // Number.EPSILON offset has no effect once amount's magnitude exceeds ~2.
  return Math.round(Number(Number(amount).toFixed(10)) * 1000) / 1000;
}

export function normalizeEmployeeId(id: string): string {
  if (!id) return '';
  return id.trim().toUpperCase();
}

// --- Wage basis ---------------------------------------------------------------------
// wageType used to be stored and displayed but never consulted: attendance capture and
// the payroll calculation both branched on employeeType, so a Staff employee marked
// "Per Hour" was paid a monthly salary while every screen said otherwise. wageType is
// now the single source of truth for both, falling back to employeeType only when it is
// missing on an older record.
export function isHourlyPaid(emp: { wageType?: string | null; employeeType?: string | null }): boolean {
  if (emp?.wageType === 'Per Hour') return true;
  if (emp?.wageType === 'Fixed Monthly') return false;
  return emp?.employeeType === 'Worker';
}

// --- Oman payroll constants ----------------------------------------------------------
// Oman Labour Law (RD 53/2023): a standard working month is treated as 30 days and a
// standard working day as 8 hours. Overtime is paid at not less than 125% of the normal
// hourly wage for daytime hours.
export const STANDARD_DAYS_PER_MONTH = 30;
export const STANDARD_HOURS_PER_DAY = 8;
export const DEFAULT_OVERTIME_MULTIPLIER = 1.25;

// The normal hourly wage used as the overtime base: the rate itself for an hourly
// employee, otherwise the monthly salary reduced to an hour.
export function normalHourlyWage(emp: { wageType?: string | null; employeeType?: string | null }, rate: number): number {
  if (isHourlyPaid(emp)) return roundOMR(rate);
  return roundOMR(rate / STANDARD_DAYS_PER_MONTH / STANDARD_HOURS_PER_DAY);
}

// Days in `month` (YYYY-MM) during which the employee was actually employed. Used to stop
// a mid-month joiner or leaver being paid for days before they joined or after they left.
export function employedDaysInMonth(
  emp: { dateOfJoining?: string | null; dateOfLeaving?: string | null },
  month: string
): number {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return STANDARD_DAYS_PER_MONTH;
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const calendarDays = monthEnd.getUTCDate();

  const join = emp?.dateOfJoining ? new Date(emp.dateOfJoining + 'T00:00:00Z') : null;
  const leave = emp?.dateOfLeaving ? new Date(emp.dateOfLeaving + 'T00:00:00Z') : null;

  const start = join && join > monthStart ? join : monthStart;
  const end = leave && leave < monthEnd ? leave : monthEnd;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  // A 31-day calendar month is still a 30-day payroll month, so a full month of
  // employment is never reported as more than the payroll month length.
  const proportionOfMonth = days / calendarDays;
  return Math.min(STANDARD_DAYS_PER_MONTH, Math.round(proportionOfMonth * STANDARD_DAYS_PER_MONTH));
}

// --- Leave date arithmetic -----------------------------------------------------------
// Inclusive calendar-day count. Leave in Oman is granted in calendar days, so a Thursday
// to Saturday absence is three days regardless of the weekend.
export function inclusiveDayCount(startDate: string, endDate: string): number {
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

// How many days of a leave request fall inside a given payroll month (YYYY-MM). A request
// spanning a month boundary is split across both months rather than counted twice.
export function leaveDaysInMonth(startDate: string, endDate: string, month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return 0;
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const from = s > monthStart ? s : monthStart;
  const to = e < monthEnd ? e : monthEnd;
  if (to < from) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
}

// Deterministic expiry status calculation based on configurable thresholds
// >60 days: Valid
// 31-60 days: Expiring Soon
// 0-30 days: Urgent
// <0 days: Expired
export function calculateExpiryStatus(expiryDateStr: string | null | undefined): DocumentExpiryStatus {
  if (!expiryDateStr) return 'Missing';
  const exp = new Date(expiryDateStr);
  if (isNaN(exp.getTime())) return 'Missing';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);

  const diffTime = exp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Expired';
  if (diffDays <= 30) return 'Urgent';
  if (diffDays <= 60) return 'Expiring Soon';
  return 'Valid';
}

// Sensitive document number masking (leaves last 4 visible, masks prefix)
export function maskSensitiveId(val: string | null | undefined): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed.length <= 4) return '••••';
  const visible = trimmed.slice(-4);
  return '•'.repeat(trimmed.length - 4) + visible;
}

// Compare designation vs trade on visa for discrepancy warnings
export function checkTradeDiscrepancy(
  designation?: string | null,
  tradeOnVisa?: string | null
): { hasWarning: boolean; designation: string; tradeOnVisa: string; message: string } {
  const des = (designation || '').trim();
  const trade = (tradeOnVisa || '').trim();
  if (!des || !trade) {
    return { hasWarning: false, designation: des, tradeOnVisa: trade, message: '' };
  }
  const dLow = des.toLowerCase();
  const tLow = trade.toLowerCase();
  const isMatch = dLow === tLow || dLow.includes(tLow) || tLow.includes(dLow);

  if (!isMatch) {
    return {
      hasWarning: true,
      designation: des,
      tradeOnVisa: trade,
      message: `HR REVIEW: Internal Designation (${des}) and Trade on Visa (${trade}) differ.`,
    };
  }
  return { hasWarning: false, designation: des, tradeOnVisa: trade, message: '' };
}

// Calculates overall deterministic compliance status
export function calculateOverallCompliance(
  employee: Employee,
  civilId?: EmployeeCivilId | null,
  visa?: EmployeeVisa | null,
  drivingLicence?: EmployeeDrivingLicence | null,
  govtDocs: EmployeeGovernmentDocument[] = []
): OverallComplianceStatus {
  // If no civil id is recorded for an active employee
  if (!civilId) return 'Critical / Expired';
  const civilStatus = calculateExpiryStatus(civilId.expiryDate);
  if (civilStatus === 'Expired') return 'Critical / Expired';

  // For Expat employees, visa is mandatory
  if (employee.nationalityType === 'Expat') {
    if (!visa) return 'Critical / Expired';
    const visaStatus = calculateExpiryStatus(visa.expiryDate);
    if (visaStatus === 'Expired') return 'Critical / Expired';
    if (visaStatus === 'Urgent' || visaStatus === 'Expiring Soon') return 'Attention Required';
  }

  // Check passport from government documents
  const passport = govtDocs.find((d) => d.documentType === 'Passport' && d.isCurrent);
  if (passport) {
    const passStatus = calculateExpiryStatus(passport.expiryDate);
    if (passStatus === 'Expired') return 'Critical / Expired';
    if (passStatus === 'Urgent' || passStatus === 'Expiring Soon') return 'Attention Required';
  }

  // Check driving licence if present
  if (drivingLicence && drivingLicence.isCurrent) {
    const dlStatus = calculateExpiryStatus(drivingLicence.expiryDate);
    if (dlStatus === 'Expired') return 'Attention Required';
    if (dlStatus === 'Urgent' || dlStatus === 'Expiring Soon') return 'Attention Required';
  }

  if (civilStatus === 'Urgent' || civilStatus === 'Expiring Soon') return 'Attention Required';

  return 'Compliant';
}

// Thrown by persist() when the app_state row's version doesn't match what was last
// loaded — another serverless invocation wrote in between. Callers retry via
// withOptimisticRetry() rather than silently clobbering the concurrent write.
export class ConcurrencyConflictError extends Error {
  constructor() {
    super('The record changed concurrently; please retry.');
    this.name = 'ConcurrencyConflictError';
  }
}

interface DatabaseSchema {
  users: User[];
  employees: Employee[];
  designationHistory: DesignationHistory[];
  salaryHistory: SalaryHistory[];
  projects: Project[];
  attendance: AttendanceRecord[];
  attendanceMonths: AttendanceMonth[];
  timesheets: TimesheetEntry[];
  cifBatches: CifBatch[];
  cifRecords: CifRecord[];
  payrolls: MonthlyPayroll[];
  payrollLines: PayrollLine[];
  payrollRevisions: PayrollRevision[];
  salaryPayments: SalaryPaymentTransaction[];
  paymentPlans: PaymentPlan[];
  paymentPlanLines: PaymentPlanLine[];
  wpsRecoveries: WPSRecovery[];
  wpsRecoveryTransactions: WPSRecoveryTransaction[];
  loans: EmployeeLoan[];
  loanRecoveries: LoanRecoveryTransaction[];
  leaveTypes: LeaveType[];
  leaveRequests: LeaveRequest[];
  // Organisation master data. Designations were free text on every employee record,
  // so the same role existed under several spellings and could not be reported on.
  departments: Department[];
  designations: Designation[];
  auditLogs: AuditLog[];
  // Oman HR Compliance Architecture
  civilIds: EmployeeCivilId[];
  drivingLicences: EmployeeDrivingLicence[];
  visas: EmployeeVisa[];
  governmentDocuments: EmployeeGovernmentDocument[];
  documents: EmployeeDocument[];
  personalDetails: Record<string, EmployeePersonalDetails>;
  drivingLicenceCategories: string[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'payroll_database.json');

// Different Postgres marketplace integrations (Vercel Postgres, Supabase, Neon)
// inject the connection string under different env var names.
export const POSTGRES_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

class DatabaseManager {
  private inMemoryData: DatabaseSchema = {
    users: [],
    employees: [],
    designationHistory: [],
    salaryHistory: [],
    projects: [],
    attendance: [],
    attendanceMonths: [],
    timesheets: [],
    cifBatches: [],
    cifRecords: [],
    payrolls: [],
    payrollLines: [],
    payrollRevisions: [],
    salaryPayments: [],
    paymentPlans: [],
    paymentPlanLines: [],
    wpsRecoveries: [],
    wpsRecoveryTransactions: [],
    loans: [],
    loanRecoveries: [],
    leaveTypes: [],
    leaveRequests: [],
    departments: [],
    designations: [],
    auditLogs: [],
    civilIds: [],
    drivingLicences: [],
    visas: [],
    governmentDocuments: [],
    documents: [],
    personalDetails: {},
    drivingLicenceCategories: [
      'Light Vehicle',
      'Heavy Vehicle',
      'Motorcycle',
      'Bus',
      'Truck',
      'Heavy Equipment',
      'Other',
    ],
  };

  private pgPool: pg.Pool | null = null;
  private isPostgresConnected: boolean = false;
  private isInitialized: boolean = false;
  // True only when production was deliberately started on the local JSON store via
  // ALLOW_FILE_STORE. Surfaced through getStatus() so the UI can say so plainly.
  private fileStoreAcknowledged: boolean = false;
  private stateVersion: number = 1;
  // Bookkeeping for syncFromDurableStore(): when the last reload finished, and the
  // reload currently in flight, so several handlers in one request cannot each issue
  // their own round trip to Postgres for the same state.
  private lastDurableSyncAt: number = 0;
  private inFlightDurableSync: Promise<void> | null = null;

  constructor() {
    // On a serverless deploy (a Postgres connection string is set) the filesystem is
    // read-only/ephemeral, so local JSON-file bootstrapping is skipped entirely and
    // Postgres is loaded in init().
    if (!POSTGRES_CONNECTION_STRING) {
      this.ensureDataDirectory();
      this.loadFromDisk();
    }
  }

  private ensureDataDirectory() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.error('Error ensuring local data directory (expected on read-only filesystems):', (e as Error).message);
    }
  }

  public async init() {
    if (this.isInitialized) return;

    // A production deployment with NO connection string configured at all used to start
    // silently on the local JSON file. On a serverless host that filesystem is per-instance
    // and ephemeral, so every finalized payroll and recorded payment written after a cold
    // start is lost at the next one, with concurrent instances diverging in the meantime --
    // and nothing surfaced that to the operator. Production must therefore have a database.
    //
    // ALLOW_FILE_STORE=true is the deliberate, documented escape hatch for a single-process
    // production install on durable local disk (an on-premise server). It is never safe on
    // a serverless host and the startup banner says so every time.
    if (process.env.NODE_ENV === 'production' && !POSTGRES_CONNECTION_STRING) {
      if (process.env.ALLOW_FILE_STORE !== 'true') {
        throw new Error(
          'Refusing to start: NODE_ENV=production but no database is configured. ' +
          'Set DATABASE_URL (use the transaction pooler on a serverless host). ' +
          'If this is a single-process on-premise install on durable local disk, set ' +
          'ALLOW_FILE_STORE=true to run on the local JSON store deliberately.'
        );
      }
      this.fileStoreAcknowledged = true;
      console.warn(
        '[storage] PRODUCTION IS RUNNING ON THE LOCAL JSON FILE (ALLOW_FILE_STORE=true). ' +
        'This is only safe on a single process with durable local disk. On a serverless ' +
        'host every write will be lost at the next cold start.'
      );
    }

    // Check for PostgreSQL environment variable
    if (POSTGRES_CONNECTION_STRING) {
      try {
        console.log('Checking PostgreSQL database connection...');
        this.pgPool = new pg.Pool({
          connectionString: POSTGRES_CONNECTION_STRING,
          ssl: POSTGRES_CONNECTION_STRING.includes('localhost') ? false : { rejectUnauthorized: false },
          // A slow cold start now fails the request rather than silently degrading to
          // local storage, so this needs enough headroom for a pooler waking up.
          connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
        });
        const res = await this.pgPool.query('SELECT NOW()');
        this.isPostgresConnected = true;
        console.log('PostgreSQL connection established successfully at', res.rows[0].now);
        await this.initPostgresSchema();
      } catch (err) {
        // A configured-but-unreachable database must fail loudly. Falling through to the
        // local JSON store here used to leave the app serving an empty dataset that the
        // seed below then filled with demo employees and a demo payroll -- fabricated
        // records presented as production data, with every write going to an ephemeral
        // filesystem. Refusing to start is the only safe outcome.
        console.error('PostgreSQL connection failed:', (err as Error).message);
        this.pgPool = null;
        this.isPostgresConnected = false;
        throw new Error(
          `Database connection failed: ${(err as Error).message}. ` +
          'DATABASE_URL is configured but unreachable; refusing to start on local storage to avoid serving unsaved data.'
        );
      }
    }

    if (this.isPostgresConnected) {
      await this.loadFromPostgres();
    } else {
      // Reached only when no connection string is configured at all (local development).
      this.loadFromDisk();
    }

    // Ensure default admin user and initial demo dataset
    await this.ensureInitialSeed();
    await this.applyRecoveryPassword();
    this.isInitialized = true;
  }

  // Break-glass account recovery. When nobody can sign in, an operator sets
  // ADMIN_RECOVERY_PASSWORD in the hosting environment and redeploys; the named account
  // (ADMIN_RECOVERY_USERNAME, default "admin") is reset to that password on the next boot.
  //
  // This is not a backdoor: the value can only be set by whoever already controls the
  // deployment environment, which is strictly more privileged than any application account.
  // The reset is recorded in the audit log, and it is skipped entirely once the stored
  // password already matches, so a forgotten variable does not rewrite the database on
  // every cold start.
  private async applyRecoveryPassword(): Promise<void> {
    const password = process.env.ADMIN_RECOVERY_PASSWORD;
    if (!password || !password.trim()) return;

    const username = (process.env.ADMIN_RECOVERY_USERNAME || 'admin').trim().toLowerCase();
    const index = this.inMemoryData.users.findIndex(
      (u) => u.username.trim().toLowerCase() === username
    );

    if (index === -1) {
      console.error(
        `[recovery] ADMIN_RECOVERY_PASSWORD is set but no account named "${username}" exists. ` +
        `Known accounts: ${this.inMemoryData.users.map((u) => u.username).join(', ') || '(none)'}.`
      );
      return;
    }

    const user = this.inMemoryData.users[index];
    if (user.passwordHash && bcrypt.compareSync(password, user.passwordHash)) {
      console.warn(
        `[recovery] "${username}" already matches ADMIN_RECOVERY_PASSWORD. No change made. ` +
        'Remove the variable from the environment now that you can sign in.'
      );
      return;
    }

    this.inMemoryData.users[index] = {
      ...user,
      passwordHash: bcrypt.hashSync(password, 10),
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    await this.audit.log({
      username: 'system',
      userRole: 'Administrator',
      action: 'ADMIN_PASSWORD_RECOVERED',
      module: 'Authentication',
      recordId: user.id,
      description:
        `Password for "${username}" was reset from ADMIN_RECOVERY_PASSWORD in the deployment environment.`,
    });

    console.warn(
      `[recovery] Password for "${username}" has been reset. ` +
      'Sign in, change it, then DELETE ADMIN_RECOVERY_PASSWORD from the environment.'
    );
  }

  private async initPostgresSchema() {
    if (!this.pgPool) return;
    const client = await this.pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(64) UNIQUE NOT NULL,
          name VARCHAR(128) NOT NULL,
          email VARCHAR(128) NOT NULL,
          role VARCHAR(64) NOT NULL,
          password_hash VARCHAR(256) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS employees (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) UNIQUE NOT NULL,
          employee_name VARCHAR(128) NOT NULL,
          employee_type VARCHAR(32) NOT NULL,
          nationality_type VARCHAR(32) NOT NULL,
          wage_type VARCHAR(32) NOT NULL,
          date_of_joining VARCHAR(32) NOT NULL,
          date_of_leaving VARCHAR(32),
          designation VARCHAR(128) NOT NULL,
          employee_company VARCHAR(64) NOT NULL,
          salary_paid_by VARCHAR(64) NOT NULL,
          monthly_salary_or_rate NUMERIC(15,3) NOT NULL,
          wps_employee VARCHAR(8) NOT NULL,
          wps_salary NUMERIC(15,3) NOT NULL,
          actual_salary NUMERIC(15,3) NOT NULL,
          recover_from VARCHAR(128),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR(64) PRIMARY KEY,
          project_code VARCHAR(64) UNIQUE NOT NULL,
          project_name VARCHAR(128) NOT NULL,
          status VARCHAR(32) NOT NULL,
          start_date VARCHAR(32),
          end_date VARCHAR(32),
          remarks TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS app_state (
          id VARCHAR(64) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE app_state ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64),
          username VARCHAR(64) NOT NULL,
          user_role VARCHAR(64) NOT NULL,
          action VARCHAR(64) NOT NULL,
          module VARCHAR(64) NOT NULL,
          record_id VARCHAR(64),
          description TEXT NOT NULL,
          ip_address VARCHAR(64),
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS employee_civil_ids (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          civil_id_number VARCHAR(128) NOT NULL,
          issue_date VARCHAR(32) NOT NULL,
          expiry_date VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          issuing_authority VARCHAR(128) NOT NULL,
          country VARCHAR(64) NOT NULL,
          document_attachment TEXT,
          file_name VARCHAR(256),
          storage_path TEXT,
          remarks TEXT,
          is_current BOOLEAN DEFAULT TRUE,
          replaced_date VARCHAR(32),
          replace_reason TEXT,
          created_by VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS employee_driving_licences (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          licence_number VARCHAR(128) NOT NULL,
          category VARCHAR(64) NOT NULL,
          issuing_country VARCHAR(64) NOT NULL,
          issuing_authority VARCHAR(128) NOT NULL,
          vehicle_class VARCHAR(64),
          restrictions TEXT,
          issue_date VARCHAR(32) NOT NULL,
          expiry_date VARCHAR(32) NOT NULL,
          status VARCHAR(32) NOT NULL,
          document_attachment TEXT,
          file_name VARCHAR(256),
          storage_path TEXT,
          remarks TEXT,
          is_current BOOLEAN DEFAULT TRUE,
          previous_licence_id VARCHAR(64),
          renewal_date VARCHAR(32),
          created_by VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS employee_visas (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          visa_number VARCHAR(128) NOT NULL,
          trade_on_visa VARCHAR(128) NOT NULL,
          visa_profession_code VARCHAR(64),
          visa_type VARCHAR(64) NOT NULL,
          issue_date VARCHAR(32) NOT NULL,
          expiry_date VARCHAR(32) NOT NULL,
          sponsor VARCHAR(128) NOT NULL,
          sponsorship_type VARCHAR(64),
          issuing_authority VARCHAR(128) NOT NULL,
          country VARCHAR(64) NOT NULL,
          status VARCHAR(32) NOT NULL,
          document_attachment TEXT,
          file_name VARCHAR(256),
          storage_path TEXT,
          remarks TEXT,
          is_current BOOLEAN DEFAULT TRUE,
          effective_from VARCHAR(32) NOT NULL,
          effective_to VARCHAR(32),
          reason_for_change TEXT,
          created_by VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS employee_government_documents (
          id VARCHAR(64) PRIMARY KEY,
          employee_id VARCHAR(64) NOT NULL,
          document_type VARCHAR(64) NOT NULL,
          document_number VARCHAR(128) NOT NULL,
          issue_date VARCHAR(32) NOT NULL,
          expiry_date VARCHAR(32) NOT NULL,
          issuing_authority VARCHAR(128),
          country VARCHAR(64),
          status VARCHAR(32) NOT NULL,
          document_attachment TEXT,
          file_name VARCHAR(256),
          storage_path TEXT,
          remarks TEXT,
          is_current BOOLEAN DEFAULT TRUE,
          created_by VARCHAR(64),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('PostgreSQL schema verified and ready.');
    } catch (e) {
      console.error('Error initializing PostgreSQL schema:', e);
    } finally {
      client.release();
    }
  }

  private applyParsedData(parsed: any) {
    this.inMemoryData = {
      users: parsed.users || [],
      employees: parsed.employees || [],
      designationHistory: parsed.designationHistory || [],
      salaryHistory: parsed.salaryHistory || [],
      projects: parsed.projects || [],
      attendance: parsed.attendance || [],
      attendanceMonths: parsed.attendanceMonths || [],
      timesheets: parsed.timesheets || [],
      cifBatches: parsed.cifBatches || [],
      cifRecords: parsed.cifRecords || [],
      payrolls: parsed.payrolls || [],
      payrollLines: parsed.payrollLines || [],
      payrollRevisions: parsed.payrollRevisions || [],
      salaryPayments: parsed.salaryPayments || [],
      paymentPlans: parsed.paymentPlans || [],
      paymentPlanLines: parsed.paymentPlanLines || [],
      wpsRecoveries: parsed.wpsRecoveries || [],
      wpsRecoveryTransactions: parsed.wpsRecoveryTransactions || [],
      loans: parsed.loans || [],
      loanRecoveries: parsed.loanRecoveries || [],
      leaveTypes: parsed.leaveTypes || [],
      leaveRequests: parsed.leaveRequests || [],
      departments: parsed.departments || [],
      designations: parsed.designations || [],
      auditLogs: parsed.auditLogs || [],
      civilIds: parsed.civilIds || [],
      drivingLicences: parsed.drivingLicences || [],
      visas: parsed.visas || [],
      governmentDocuments: parsed.governmentDocuments || [],
      personalDetails: parsed.personalDetails || {},
      documents: parsed.documents || [],
      drivingLicenceCategories: parsed.drivingLicenceCategories || [
        'Light Vehicle',
        'Heavy Vehicle',
        'Motorcycle',
        'Bus',
        'Truck',
        'Heavy Equipment',
        'Other',
      ],
    };
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.applyParsedData(JSON.parse(fileContent));
        console.log(`Database loaded from persistent disk: ${this.inMemoryData.employees.length} employees, ${this.inMemoryData.payrolls.length} payrolls.`);
      } else {
        this.saveToDisk();
      }
    } catch (e) {
      console.error('Error loading database from disk:', e);
    }
  }

  private async loadFromPostgres(): Promise<boolean> {
    if (!this.pgPool) return false;
    try {
      const res = await this.pgPool.query('SELECT data, version FROM app_state WHERE id = $1', ['main']);
      if (res.rows.length > 0 && res.rows[0].data) {
        this.applyParsedData(res.rows[0].data);
        this.stateVersion = res.rows[0].version ?? 1;
        console.log(`Database loaded from PostgreSQL: ${this.inMemoryData.employees.length} employees, ${this.inMemoryData.payrolls.length} payrolls.`);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error loading database from PostgreSQL:', (e as Error).message);
      return false;
    }
  }

  // On a serverless host, `init()` only runs once per warm instance -- it populates
  // inMemoryData from the app_state row at that instance's cold start and never again. A
  // record created or edited by a request served by a DIFFERENT concurrent/later-cold-start
  // instance is invisible here until this instance happens to reload, which previously only
  // happened on a version conflict during a WRITE. A plain read-then-mutate on a stale
  // instance (e.g. "create employee" on one invocation, then "save employment tab" on the
  // very next one) found nothing and reported a perfectly real record as "not found."
  //
  // Call this at the start of a find-then-mutate flow, before consulting inMemoryData, so
  // that flow sees whatever the durable store actually holds right now. A no-op on the local
  // JSON file path: that path has exactly one process, so there is no cross-instance
  // divergence to correct there.
  // `maxAgeMs` lets a pure READ accept state this instance loaded a moment ago instead of
  // paying for another round trip (several handlers can run per request). A MUTATION must
  // pass 0 -- the default -- because the record it is about to find-then-write may have
  // been created by another instance milliseconds ago, which is the whole point.
  public async syncFromDurableStore(maxAgeMs: number = 0): Promise<void> {
    if (!this.isPostgresConnected) return;
    if (maxAgeMs > 0 && Date.now() - this.lastDurableSyncAt < maxAgeMs) return;
    if (this.inFlightDurableSync) return this.inFlightDurableSync;

    this.inFlightDurableSync = (async () => {
      try {
        await this.loadFromPostgres();
        this.lastDurableSyncAt = Date.now();
      } finally {
        this.inFlightDurableSync = null;
      }
    })();
    return this.inFlightDurableSync;
  }

  // One line describing where the data this instance is serving actually came from.
  // Attached to "not found" replies so an operator can tell a genuinely absent record
  // apart from an instance that failed to see one.
  public describeLoadedState(): string {
    const engine = this.isPostgresConnected ? 'PostgreSQL' : 'local JSON store';
    return `${engine}, ${this.inMemoryData.employees.length} employees loaded, state v${this.stateVersion}`;
  }

  // Throws on failure. A write that did not land must never be reported to the caller as
  // success -- that is how a finalized payroll or a recorded payment silently disappears.
  private saveToDisk() {
    try {
      this.ensureDataDirectory();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.inMemoryData, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error('Error persisting database to disk:', e);
      throw new Error(`Database write failed (local store): ${(e as Error).message}`);
    }
  }

  // Single source of truth for durability: writes the whole in-memory dataset to
  // Postgres (serverless-safe) when connected, otherwise falls back to the local JSON file.
  //
  // The Postgres write is a conditional upsert keyed on `version`: it inserts the row if
  // absent, or updates it only if the row's version still matches what we last loaded.
  // If another concurrent invocation wrote in between, 0 rows are affected and we throw
  // ConcurrencyConflictError instead of silently clobbering that write — see
  // withOptimisticRetry(), which callers use to reload fresh state and retry the mutation.
  private async persist(): Promise<void> {
    if (this.isPostgresConnected && this.pgPool) {
      const data = JSON.stringify(this.inMemoryData);
      try {
        const res = await this.pgPool.query(
          `INSERT INTO app_state (id, data, version, updated_at) VALUES ($1, $2, 1, NOW())
           ON CONFLICT (id) DO UPDATE
             SET data = $2, version = app_state.version + 1, updated_at = NOW()
             WHERE app_state.version = $3
           RETURNING version`,
          ['main', data, this.stateVersion]
        );
        if (res.rowCount === 0) {
          await this.loadFromPostgres();
          throw new ConcurrencyConflictError();
        }
        this.stateVersion = res.rows[0].version;
        return;
      } catch (e) {
        if (e instanceof ConcurrencyConflictError) throw e;
        // Never swallow a failed write. Returning normally here would tell the route --
        // and therefore the user -- that a payroll, payment or loan movement was saved
        // when nothing was committed at all.
        console.error('Error persisting database to PostgreSQL:', (e as Error).message);
        throw new Error(`Database write failed: ${(e as Error).message}`);
      }
    }
    this.saveToDisk();
  }

  // Wraps a mutation that (a) reads current in-memory state, (b) mutates it, in a retry
  // loop against ConcurrencyConflictError. On conflict, fresh state is loaded and `mutate`
  // is re-run from scratch against it (never a blind retry of stale intent) before
  // persisting again. `mutate` reports `changed: false` when it found nothing to do (e.g.
  // record not found), in which case no write is attempted at all.
  private async withOptimisticRetry<T>(
    mutate: () => { changed: boolean; value: T },
    maxRetries: number = 3
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      const { changed, value } = mutate();
      if (!changed) return value;
      try {
        await this.persist();
        return value;
      } catch (e) {
        if (!(e instanceof ConcurrencyConflictError) || attempt >= maxRetries) throw e;
        attempt++;
      }
    }
  }

  public getStatus() {
    return {
      // Name the store for what it actually is. "High-Integrity Persistent Storage
      // (Cloud/JSON)" read as a database to every operator who saw it, while the data
      // was in a file on local disk.
      storageType: this.isPostgresConnected
        ? 'PostgreSQL database'
        : 'Local JSON file (data/payroll_database.json)',
      isPostgresConnected: this.isPostgresConnected,
      isDurable: this.isPostgresConnected,
      fileStoreAcknowledged: this.fileStoreAcknowledged,
      storageWarning: this.isPostgresConnected
        ? null
        : 'Data is stored in a local JSON file, not a database. This is not durable on a serverless or containerised host.',
      counts: {
        users: this.inMemoryData.users.length,
        employees: this.inMemoryData.employees.length,
        projects: this.inMemoryData.projects.length,
        attendance: this.inMemoryData.attendance.length,
        payrolls: this.inMemoryData.payrolls.length,
        salaryPayments: this.inMemoryData.salaryPayments.length,
        wpsRecoveries: this.inMemoryData.wpsRecoveries.length,
        loans: this.inMemoryData.loans.length,
        auditLogs: this.inMemoryData.auditLogs.length,
        civilIds: this.inMemoryData.civilIds?.length || 0,
        drivingLicences: this.inMemoryData.drivingLicences?.length || 0,
        visas: this.inMemoryData.visas?.length || 0,
        governmentDocuments: this.inMemoryData.governmentDocuments?.length || 0,
      }
    };
  }

  // Creates the first administrator account and nothing else. This function previously
  // wrote a complete fabricated business -- five invented employees, a finalized payroll,
  // salary payments, a loan, WPS recoveries, Civil IDs, visas, passports and personal
  // details -- which was indistinguishable from real data once written. The system now
  // starts empty and every record in it is one a user entered.
  public async ensureInitialSeed(forceReset: boolean = false) {
    if (this.inMemoryData.users.length > 0) return;

    const timestamp = new Date().toISOString();
    const bootstrapUsername = (process.env.ADMIN_INITIAL_USERNAME || 'admin').trim().toLowerCase();
    const bootstrapPassword = process.env.ADMIN_INITIAL_PASSWORD;

    if (process.env.NODE_ENV === 'production' && !bootstrapPassword) {
      throw new Error(
        'No user accounts exist and ADMIN_INITIAL_PASSWORD is not set. ' +
        'Set ADMIN_INITIAL_PASSWORD (and optionally ADMIN_INITIAL_USERNAME) to create the first administrator.'
      );
    }

    this.inMemoryData.users.push({
      id: crypto.randomUUID(),
      username: bootstrapUsername,
      name: 'System Administrator',
      email: process.env.ADMIN_INITIAL_EMAIL || 'admin@company.com',
      role: 'Administrator',
      passwordHash: bcrypt.hashSync(bootstrapPassword || 'ChangeMe123', 10),
      createdAt: timestamp,
      updatedAt: timestamp,
      isActive: true,
    });

    if (!bootstrapPassword) {
      console.warn('[bootstrap] Created administrator "' + bootstrapUsername + '" with the placeholder password "ChangeMe123". Change it immediately and set ADMIN_INITIAL_PASSWORD before deploying.');
    }

    await this.persist();
    console.log('Database initialized. No sample data was created.');
  }

  // --- REPOSITORIES & TRANSACTIONAL METHODS ---

  public get users() {
    return {
      getAll: () => [...this.inMemoryData.users],
      findById: (id: string) => this.inMemoryData.users.find(u => u.id === id),
      findByUsername: (username: string) => this.inMemoryData.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()),
      create: async (user: User) => {
        this.inMemoryData.users.push(user);
        await this.persist();
        return user;
      },
      update: async (id: string, updates: Partial<User>) => {
        const index = this.inMemoryData.users.findIndex(u => u.id === id);
        if (index === -1) return null;
        this.inMemoryData.users[index] = {
          ...this.inMemoryData.users[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.users[index];
      },
      delete: async (id: string) => {
        const index = this.inMemoryData.users.findIndex(u => u.id === id);
        if (index === -1) return false;
        this.inMemoryData.users.splice(index, 1);
        await this.persist();
        return true;
      }
    };
  }

  public get employees() {
    return {
      getAll: () => [...this.inMemoryData.employees],
      findById: (id: string) => this.inMemoryData.employees.find(e => e.id === id),
      findByEmployeeId: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.employees.find(e => normalizeEmployeeId(e.employeeId) === norm);
      },
      create: async (emp: Employee) => {
        emp.employeeId = normalizeEmployeeId(emp.employeeId);
        // Enforced here (not just in the route handler) so the uniqueness
        // invariant holds regardless of caller — the model layer is the
        // closest equivalent to a DB unique constraint in this architecture.
        if (this.inMemoryData.employees.some(e => normalizeEmployeeId(e.employeeId) === emp.employeeId)) {
          throw new Error(`Employee ID '${emp.employeeId}' already exists in the system.`);
        }
        emp.monthlySalaryOrRate = roundOMR(emp.monthlySalaryOrRate);
        emp.wpsSalary = roundOMR(emp.wpsSalary);
        emp.actualSalary = roundOMR(emp.actualSalary);
        this.inMemoryData.employees.push(emp);
        await this.persist();
        return emp;
      },
      update: async (id: string, updates: Partial<Employee>, user?: string) => {
        const index = this.inMemoryData.employees.findIndex(e => e.id === id);
        if (index === -1) return null;
        const current = this.inMemoryData.employees[index];

        // Track designation change history
        if (updates.designation && updates.designation !== current.designation) {
          this.inMemoryData.designationHistory.push({
            id: crypto.randomUUID(),
            employeeId: current.employeeId,
            previousDesignation: current.designation,
            newDesignation: updates.designation,
            effectiveDate: new Date().toISOString().split('T')[0],
            changedBy: user || 'System',
            createdAt: new Date().toISOString(),
          });
        }

        // Track salary change history
        if (
          (updates.monthlySalaryOrRate !== undefined && roundOMR(updates.monthlySalaryOrRate) !== roundOMR(current.monthlySalaryOrRate)) ||
          (updates.wageType !== undefined && updates.wageType !== current.wageType)
        ) {
          this.inMemoryData.salaryHistory.push({
            id: crypto.randomUUID(),
            employeeId: current.employeeId,
            previousSalary: current.monthlySalaryOrRate,
            newSalary: updates.monthlySalaryOrRate !== undefined ? roundOMR(updates.monthlySalaryOrRate) : current.monthlySalaryOrRate,
            wageType: updates.wageType || current.wageType,
            effectiveDate: new Date().toISOString().split('T')[0],
            changedBy: user || 'System',
            createdAt: new Date().toISOString(),
          });
        }

        if (updates.employeeId) {
          updates.employeeId = normalizeEmployeeId(updates.employeeId);
        }
        if (updates.monthlySalaryOrRate !== undefined) {
          updates.monthlySalaryOrRate = roundOMR(updates.monthlySalaryOrRate);
        }
        if (updates.wpsSalary !== undefined) {
          updates.wpsSalary = roundOMR(updates.wpsSalary);
        }
        if (updates.actualSalary !== undefined) {
          updates.actualSalary = roundOMR(updates.actualSalary);
        }

        this.inMemoryData.employees[index] = {
          ...current,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.employees[index];
      },
      getDesignationHistory: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.designationHistory.filter(h => normalizeEmployeeId(h.employeeId) === norm);
      },
      getSalaryHistory: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.salaryHistory.filter(h => normalizeEmployeeId(h.employeeId) === norm);
      }
    };
  }

  public get projects() {
    return {
      getAll: () => [...this.inMemoryData.projects],
      findById: (id: string) => this.inMemoryData.projects.find(p => p.id === id),
      findByCode: (code: string) => this.inMemoryData.projects.find(p => p.projectCode.trim().toUpperCase() === code.trim().toUpperCase()),
      create: async (proj: Project) => {
        proj.projectCode = proj.projectCode.trim().toUpperCase();
        this.inMemoryData.projects.push(proj);
        await this.persist();
        return proj;
      },
      update: async (id: string, updates: Partial<Project>) => {
        const index = this.inMemoryData.projects.findIndex(p => p.id === id);
        if (index === -1) return null;
        if (updates.projectCode) {
          updates.projectCode = updates.projectCode.trim().toUpperCase();
        }
        this.inMemoryData.projects[index] = {
          ...this.inMemoryData.projects[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.projects[index];
      }
    };
  }

  public get attendance() {
    return {
      getByMonth: (month: string) => this.inMemoryData.attendance.filter(a => a.payrollMonth === month),
      getByEmployeeAndMonth: (empId: string, month: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.attendance.filter(a => normalizeEmployeeId(a.employeeId) === norm && a.payrollMonth === month);
      },
      // DESTRUCTIVE: replaces the whole month. Only for the full-month grid, which always
      // submits every employee. Any partial write must use mergeMonthRecords instead.
      saveMonthRecords: async (month: string, records: AttendanceRecord[]) => {
        return this.withOptimisticRetry(() => {
          this.inMemoryData.attendance = this.inMemoryData.attendance.filter(a => a.payrollMonth !== month);
          this.inMemoryData.attendance.push(...records);
          return { changed: true, value: this.inMemoryData.attendance.filter(a => a.payrollMonth === month) };
        });
      },
      // Non-destructive: replaces the month's rows only for the employees present in
      // `records`, leaving every other employee's attendance for that month untouched.
      // This is what a partial import or a single-employee assignment needs -- the
      // month-wide replace above silently erased everyone absent from the payload.
      mergeMonthRecords: async (month: string, records: AttendanceRecord[]) => {
        return this.withOptimisticRetry(() => {
          const affected = new Set(records.map(r => normalizeEmployeeId(r.employeeId)));
          this.inMemoryData.attendance = this.inMemoryData.attendance.filter(
            a => a.payrollMonth !== month || !affected.has(normalizeEmployeeId(a.employeeId))
          );
          this.inMemoryData.attendance.push(...records);
          return {
            changed: true,
            value: this.inMemoryData.attendance.filter(
              a => a.payrollMonth === month && affected.has(normalizeEmployeeId(a.employeeId))
            ),
          };
        });
      },
      countForMonth: (month: string) => this.inMemoryData.attendance.filter(a => a.payrollMonth === month).length
    };
  }

  // One row per calendar month -- the atomic unit the attendance workflow status applies
  // to (mirrors MonthlyPayroll's parent/lines split). Informational only: payroll.ts keeps
  // reading db.attendance.getByMonth() directly regardless of this status.
  public get attendanceMonths() {
    return {
      getAll: () => [...this.inMemoryData.attendanceMonths],
      getByMonth: (month: string) => this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month) || null,
      getOrCreate: async (month: string) => {
        const existing = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
        if (existing) return existing;
        return this.withOptimisticRetry(() => {
          const already = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
          if (already) return { changed: false, value: already };
          const timestamp = new Date().toISOString();
          const created: AttendanceMonth = {
            id: crypto.randomUUID(),
            payrollMonth: month,
            status: 'Draft',
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          this.inMemoryData.attendanceMonths.push(created);
          return { changed: true, value: created as AttendanceMonth };
        });
      },
      submit: async (month: string, user: string) => {
        return this.withOptimisticRetry(() => {
          let record = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
          if (!record) {
            const timestamp = new Date().toISOString();
            record = { id: crypto.randomUUID(), payrollMonth: month, status: 'Draft', createdAt: timestamp, updatedAt: timestamp };
            this.inMemoryData.attendanceMonths.push(record);
          }
          if (record.status !== 'Draft') {
            throw new Error(`Attendance for ${month} is already ${record.status}; cannot submit.`);
          }
          record.status = 'Submitted';
          record.submittedBy = user;
          record.submittedAt = new Date().toISOString();
          record.updatedAt = record.submittedAt;
          return { changed: true, value: record as AttendanceMonth };
        });
      },
      approve: async (month: string, user: string) => {
        return this.withOptimisticRetry(() => {
          const record = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
          if (!record) throw new Error(`No attendance submission found for ${month}.`);
          if (record.status !== 'Submitted') {
            throw new Error(`Attendance for ${month} is ${record.status}, not Submitted; cannot approve.`);
          }
          record.status = 'Approved';
          record.approvedBy = user;
          record.approvedAt = new Date().toISOString();
          record.updatedAt = record.approvedAt;
          return { changed: true, value: record as AttendanceMonth };
        });
      },
      finalize: async (month: string, user: string) => {
        return this.withOptimisticRetry(() => {
          const record = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
          if (!record) throw new Error(`No attendance submission found for ${month}.`);
          if (record.status !== 'Approved') {
            throw new Error(`Attendance for ${month} is ${record.status}, not Approved; cannot finalize.`);
          }
          record.status = 'Finalized';
          record.finalizedBy = user;
          record.finalizedAt = new Date().toISOString();
          record.updatedAt = record.finalizedAt;
          return { changed: true, value: record as AttendanceMonth };
        });
      },
      revert: async (month: string, reason: string, user: string) => {
        return this.withOptimisticRetry(() => {
          const record = this.inMemoryData.attendanceMonths.find(m => m.payrollMonth === month);
          if (!record) throw new Error(`No attendance submission found for ${month}.`);
          if (record.status !== 'Finalized') {
            throw new Error(`Attendance for ${month} is not Finalized; nothing to revert.`);
          }
          record.status = 'Approved';
          record.revertedBy = user;
          record.revertedAt = new Date().toISOString();
          record.revertReason = reason;
          record.updatedAt = record.revertedAt;
          return { changed: true, value: record as AttendanceMonth };
        });
      },
    };
  }

  // Independent per-entry records (NOT a month-batch-replace like AttendanceRecord) --
  // editing/voiding one entry never touches any other. Does not feed payroll math; coexists
  // with Attendance's day/hour totals for granular per-day/per-task labor tracking.
  public get timesheets() {
    return {
      getAll: () => [...this.inMemoryData.timesheets],
      getByMonth: (month: string) => this.inMemoryData.timesheets.filter(t => t.payrollMonth === month && !t.isVoided),
      getByEmployeeAndMonth: (empId: string, month: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.timesheets.filter(
          t => normalizeEmployeeId(t.employeeId) === norm && t.payrollMonth === month && !t.isVoided
        );
      },
      getByProject: (projectId: string, month?: string) =>
        this.inMemoryData.timesheets.filter(
          t => t.projectId === projectId && !t.isVoided && (!month || t.payrollMonth === month)
        ),
      create: async (entry: TimesheetEntry) => {
        return this.withOptimisticRetry(() => {
          this.inMemoryData.timesheets.push(entry);
          return { changed: true, value: entry };
        });
      },
      update: async (id: string, updates: Partial<TimesheetEntry>) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.timesheets.findIndex(t => t.id === id);
          if (index === -1) return { changed: false, value: null as TimesheetEntry | null };
          this.inMemoryData.timesheets[index] = {
            ...this.inMemoryData.timesheets[index],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.timesheets[index] as TimesheetEntry | null };
        });
      },
      voidEntry: async (id: string, reason: string, user: string) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.timesheets.findIndex(t => t.id === id);
          if (index === -1) return { changed: false, value: null as TimesheetEntry | null };
          const entry = this.inMemoryData.timesheets[index];
          if (entry.isVoided) throw new Error('This timesheet entry has already been voided.');
          entry.isVoided = true;
          entry.voidReason = reason;
          entry.updatedAt = new Date().toISOString();
          return { changed: true, value: entry as TimesheetEntry | null };
        });
      },
      importBatch: async (entries: TimesheetEntry[]) => {
        return this.withOptimisticRetry(() => {
          this.inMemoryData.timesheets.push(...entries);
          return { changed: true, value: entries };
        });
      },
      setApprovalStatus: async (id: string, status: TimesheetEntry['approvalStatus'], user: string) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.timesheets.findIndex(t => t.id === id);
          if (index === -1) return { changed: false, value: null as TimesheetEntry | null };
          const entry = this.inMemoryData.timesheets[index];
          entry.approvalStatus = status;
          entry.updatedAt = new Date().toISOString();
          return { changed: true, value: entry as TimesheetEntry | null };
        });
      },
    };
  }

  // Modeled on Attendance's own template/validate/preview/confirm pattern -- generic
  // accountReference/amount fields, not a specific bank's regulatory column spec.
  public get cif() {
    return {
      getBatches: (filters?: { company?: string; payrollMonth?: string }) => {
        let batches = [...this.inMemoryData.cifBatches];
        if (filters?.company) batches = batches.filter(b => b.company === filters.company);
        if (filters?.payrollMonth) batches = batches.filter(b => b.payrollMonth === filters.payrollMonth);
        return batches.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      },
      getBatch: (id: string) => this.inMemoryData.cifBatches.find(b => b.id === id) || null,
      getRecordsByBatch: (batchId: string) => this.inMemoryData.cifRecords.filter(r => r.batchId === batchId),
      createBatch: async (batch: CifBatch, records: CifRecord[]) => {
        return this.withOptimisticRetry(() => {
          this.inMemoryData.cifBatches.push(batch);
          this.inMemoryData.cifRecords.push(...records);
          return { changed: true, value: batch };
        });
      },
      updateBatch: async (id: string, updates: Partial<CifBatch>) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.cifBatches.findIndex(b => b.id === id);
          if (index === -1) return { changed: false, value: null as CifBatch | null };
          this.inMemoryData.cifBatches[index] = {
            ...this.inMemoryData.cifBatches[index],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.cifBatches[index] as CifBatch | null };
        });
      },
      process: async (batchId: string, user: string, override?: { reason: string }) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.cifBatches.findIndex(b => b.id === batchId);
          if (index === -1) return { changed: false, value: null as CifBatch | null };
          const batch = this.inMemoryData.cifBatches[index];
          if (batch.status !== 'Validated' && batch.status !== 'Previewed' && batch.status !== 'Reconciled') {
            throw new Error(`CIF batch is ${batch.status}; must be validated/previewed before processing.`);
          }
          const hasCriticalErrors = (batch.invalidCount || 0) > 0 || (batch.duplicateCount || 0) > 0;
          const varianceExceedsTolerance = Math.abs(batch.variance || 0) > 0.001;
          if ((hasCriticalErrors || varianceExceedsTolerance) && !override?.reason) {
            throw new Error(
              'Cannot process: critical reconciliation errors exist (invalid/duplicate records or a payroll/CIF variance). Provide an override reason to proceed.'
            );
          }
          batch.status = 'Processed';
          batch.processedBy = user;
          batch.processedAt = new Date().toISOString();
          batch.updatedAt = batch.processedAt;
          if (override?.reason) {
            batch.overrideUsed = true;
            batch.overrideReason = override.reason;
            batch.overrideBy = user;
          }
          return { changed: true, value: batch as CifBatch | null };
        });
      },
    };
  }

  public get payroll() {
    return {
      getAll: () => [...this.inMemoryData.payrolls],
      getByMonth: (month: string) => {
        const payroll = this.inMemoryData.payrolls.find(p => p.payrollMonth === month);
        if (!payroll) return null;
        const lines = this.inMemoryData.payrollLines.filter(l => l.payrollId === payroll.id);
        return {
          ...payroll,
          lines,
        };
      },
      saveDraft: async (payroll: MonthlyPayroll, lines: PayrollLine[]) => {
        const existingIndex = this.inMemoryData.payrolls.findIndex(p => p.payrollMonth === payroll.payrollMonth);
        if (existingIndex !== -1) {
          // If already finalized, cannot overwrite directly without revision
          if (this.inMemoryData.payrolls[existingIndex].status === 'Finalized') {
            throw new Error(`Payroll for ${payroll.payrollMonth} is already Finalized. Please request a Revision to make corrections.`);
          }
          this.inMemoryData.payrolls[existingIndex] = {
            ...payroll,
            id: this.inMemoryData.payrolls[existingIndex].id,
            updatedAt: new Date().toISOString(),
          };
          payroll.id = this.inMemoryData.payrolls[existingIndex].id;
        } else {
          this.inMemoryData.payrolls.push(payroll);
        }

        // Replace lines for this payroll
        this.inMemoryData.payrollLines = this.inMemoryData.payrollLines.filter(l => l.payrollId !== payroll.id);
        const processedLines = lines.map(l => ({
          ...l,
          payrollId: payroll.id,
          basicSalaryOrRate: roundOMR(l.basicSalaryOrRate),
          grossSalary: roundOMR(l.grossSalary),
          houseAllowance: roundOMR(l.houseAllowance),
          transportAllowance: roundOMR(l.transportAllowance),
          bonus: roundOMR(l.bonus),
          otherAllowance: roundOMR(l.otherAllowance),
          totalAdditions: roundOMR(l.totalAdditions),
          loanRecovery: roundOMR(l.loanRecovery),
          otherDeductions: roundOMR(l.otherDeductions),
          totalDeductions: roundOMR(l.totalDeductions),
          netSalary: roundOMR(l.netSalary),
          wpsSalary: roundOMR(l.wpsSalary),
          recoverableSalary: roundOMR(l.recoverableSalary),
        }));
        this.inMemoryData.payrollLines.push(...processedLines);

        await this.persist();
        return {
          ...payroll,
          lines: processedLines,
        };
      },
      // Wrapped in the retry helper so the loan-balance and WPS side effects below either
      // commit together or are re-run from scratch against fresh state. Previously these
      // mutated memory and then attempted a single unprotected write.
      finalize: async (month: string, user: string) => {
        return this.withOptimisticRetry(() => {
        const payroll = this.inMemoryData.payrolls.find(p => p.payrollMonth === month);
        if (!payroll) throw new Error(`No payroll found for month ${month}`);
        if (payroll.status === 'Finalized') throw new Error(`Payroll for ${month} is already finalized.`);

        const lines = this.inMemoryData.payrollLines.filter(l => l.payrollId === payroll.id);
        if (lines.length === 0) throw new Error(`Cannot finalize empty payroll. Please calculate lines first.`);

        payroll.status = 'Finalized';
        payroll.finalizedAt = new Date().toISOString();
        payroll.finalizedBy = user;
        payroll.updatedAt = new Date().toISOString();

        // Process Loan Deductions into loan balances
        for (const line of lines) {
          if (line.loanRecovery > 0) {
            const activeLoan = this.inMemoryData.loans.find(l => normalizeEmployeeId(l.employeeId) === normalizeEmployeeId(line.employeeId) && l.status === 'Active');
            if (activeLoan) {
              const recAmount = Math.min(line.loanRecovery, activeLoan.outstandingBalance);
              activeLoan.totalRecovered = roundOMR(activeLoan.totalRecovered + recAmount);
              activeLoan.outstandingBalance = roundOMR(Math.max(0, activeLoan.loanAmount - activeLoan.totalRecovered));
              if (activeLoan.outstandingBalance <= 0) {
                activeLoan.status = 'Completed';
              }
              activeLoan.updatedAt = new Date().toISOString();

              const loanRecTx: LoanRecoveryTransaction = {
                id: crypto.randomUUID(),
                loanId: activeLoan.id,
                employeeId: activeLoan.employeeId,
                recoverySource: 'Payroll',
                payrollMonth: month,
                recoveryAmount: recAmount,
                recoveryDate: new Date().toISOString().split('T')[0],
                remarks: `Automatic recovery from ${month} finalized payroll`,
                createdAt: new Date().toISOString(),
              };
              this.inMemoryData.loanRecoveries.push(loanRecTx);
            }
          }

          // Create or update WPS Recovery entry if recoverableSalary > 0
          if (line.wpsEmployee === 'Yes' && line.recoverableSalary > 0) {
            const existingWps = this.inMemoryData.wpsRecoveries.find(w => normalizeEmployeeId(w.employeeId) === normalizeEmployeeId(line.employeeId) && w.payrollMonth === month);
            if (!existingWps) {
              const wpsEntry: WPSRecovery = {
                id: crypto.randomUUID(),
                employeeId: line.employeeId,
                employeeName: line.employeeName,
                payrollMonth: month,
                wpsSalary: roundOMR(line.wpsSalary),
                netSalary: roundOMR(line.netSalary),
                totalRecoverable: roundOMR(line.recoverableSalary),
                recoveredFrom: line.recoverFrom || line.employeeCompany,
                totalRecovered: 0,
                remainingBalance: roundOMR(line.recoverableSalary),
                status: 'Outstanding',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                transactions: [],
              };
              this.inMemoryData.wpsRecoveries.push(wpsEntry);
            }
          }
        }

        return { changed: true, value: { ...payroll, lines } };
        });
      },
      revise: async (month: string, reason: string, user: string) => {
        return this.withOptimisticRetry(() => {
        const payroll = this.inMemoryData.payrolls.find(p => p.payrollMonth === month);
        if (!payroll) throw new Error(`No payroll found for month ${month}`);
        if (payroll.status !== 'Finalized') throw new Error(`Only finalized payroll can be revised.`);

        const currentLines = this.inMemoryData.payrollLines.filter(l => l.payrollId === payroll.id);

        // Pre-check: block the whole revision if any WPS recovery finalize() created for this
        // month already has recovery transactions posted against it — money has already moved
        // against that snapshot and needs manual reconciliation before we can safely revise.
        for (const line of currentLines) {
          if (line.wpsEmployee === 'Yes' && line.recoverableSalary > 0) {
            const wpsEntry = this.inMemoryData.wpsRecoveries.find(w => normalizeEmployeeId(w.employeeId) === normalizeEmployeeId(line.employeeId) && w.payrollMonth === month);
            if (wpsEntry) {
              const hasTransactions = this.inMemoryData.wpsRecoveryTransactions.some(t => t.wpsRecoveryId === wpsEntry.id);
              if (hasTransactions) {
                throw new Error(`Cannot revise payroll for ${month}: WPS recovery for ${line.employeeId} already has recorded recovery transactions. Please reconcile WPS Recovery manually before revising.`);
              }
            }
          }
        }

        // Roll back the loan recoveries finalize() posted for this month, so a
        // finalize -> revise -> re-finalize cycle doesn't double-apply them.
        for (const line of currentLines) {
          if (line.loanRecovery > 0) {
            const tx = this.inMemoryData.loanRecoveries.find(r =>
              normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(line.employeeId) &&
              r.payrollMonth === month &&
              r.recoverySource === 'Payroll' &&
              !r.isReversed
            );
            if (tx) {
              const loan = this.inMemoryData.loans.find(l => l.id === tx.loanId);
              if (loan) {
                const recAmount = tx.recoveryAmount || 0;
                loan.totalRecovered = roundOMR(Math.max(0, loan.totalRecovered - recAmount));
                loan.outstandingBalance = roundOMR(Math.max(0, loan.loanAmount - loan.totalRecovered));
                if (loan.status === 'Completed' && loan.outstandingBalance > 0) {
                  loan.status = 'Active';
                }
                loan.updatedAt = new Date().toISOString();
              }
              tx.isReversed = true;
              tx.reversedAt = new Date().toISOString();
            }
          }
        }

        // Remove WPS recovery entries finalize() created for this month that have no
        // transactions yet (safe — the pre-check above already blocked the unsafe case).
        // They'll be regenerated by finalize() on re-finalization if still applicable.
        for (const line of currentLines) {
          if (line.wpsEmployee === 'Yes' && line.recoverableSalary > 0) {
            const wpsIndex = this.inMemoryData.wpsRecoveries.findIndex(w => normalizeEmployeeId(w.employeeId) === normalizeEmployeeId(line.employeeId) && w.payrollMonth === month);
            if (wpsIndex !== -1) {
              this.inMemoryData.wpsRecoveries.splice(wpsIndex, 1);
            }
          }
        }

        const revision: PayrollRevision = {
          id: crypto.randomUUID(),
          payrollId: payroll.id,
          payrollMonth: month,
          revisionNumber: (payroll.revisionNumber || 0) + 1,
          revisionDate: new Date().toISOString(),
          revisedBy: user,
          reason: reason || 'Correction requested',
          previousGross: payroll.totalGrossSalary,
          previousNet: payroll.totalNetSalary,
          newGross: payroll.totalGrossSalary,
          newNet: payroll.totalNetSalary,
          snapshotLinesJson: JSON.stringify(currentLines),
          createdAt: new Date().toISOString(),
        };

        this.inMemoryData.payrollRevisions.push(revision);
        payroll.status = 'In Revision';
        payroll.revisionNumber = revision.revisionNumber;
        payroll.updatedAt = new Date().toISOString();

        return { changed: true, value: { payroll, revision } };
        });
      },
      getRevisions: (month: string) => {
        return this.inMemoryData.payrollRevisions.filter(r => r.payrollMonth === month);
      }
    };
  }

  public get salaryPayments() {
    return {
      getAll: () => [...this.inMemoryData.salaryPayments],
      getByEmployeeAndMonth: (empId: string, month: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.salaryPayments.filter(p => normalizeEmployeeId(p.employeeId) === norm && p.payrollMonth === month && !p.isReversed);
      },
      // `revalidate`, when given, is re-run against the CURRENT in-memory state on every
      // retry attempt (not just once, upfront) — it should throw if the mutation is no
      // longer valid (e.g. a concurrent payment already used up the outstanding balance).
      // This is what actually closes the race, not just the version-conflict retry itself.
      create: async (payment: SalaryPaymentTransaction, revalidate?: () => void) => {
        return this.withOptimisticRetry(() => {
          if (revalidate) revalidate();
          payment.payAmount = roundOMR(payment.payAmount);
          this.inMemoryData.salaryPayments.push(payment);
          return { changed: true, value: payment };
        });
      },
      update: async (id: string, updates: Partial<SalaryPaymentTransaction>, revalidate?: () => void) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.salaryPayments.findIndex(p => p.id === id);
          if (index === -1) return { changed: false, value: null as SalaryPaymentTransaction | null };
          if (revalidate) revalidate();
          if (updates.payAmount !== undefined) {
            updates.payAmount = roundOMR(updates.payAmount);
          }
          this.inMemoryData.salaryPayments[index] = {
            ...this.inMemoryData.salaryPayments[index],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.salaryPayments[index] as SalaryPaymentTransaction | null };
        });
      },
      reverse: async (id: string, reason: string, user: string) => {
        return this.withOptimisticRetry(() => {
          const index = this.inMemoryData.salaryPayments.findIndex(p => p.id === id);
          if (index === -1) return { changed: false, value: null as SalaryPaymentTransaction | null };
          const current = this.inMemoryData.salaryPayments[index];
          if (current.isReversed) {
            throw new Error('This payment transaction has already been reversed.');
          }

          current.isReversed = true;
          current.reversedAt = new Date().toISOString();
          current.reversedBy = user;
          current.reversalReason = reason;
          current.updatedAt = new Date().toISOString();

          return { changed: true, value: current as SalaryPaymentTransaction | null };
        });
      }
    };
  }

  // Payment Planning is an intentional "should pay" figure only -- upsert() never touches
  // salaryPayments, and nothing here ever reads/writes totalPaid/outstanding/status.
  public get paymentPlans() {
    return {
      getAll: () => [...this.inMemoryData.paymentPlans],
      getByPayrollMonth: (month: string) => {
        const plan = this.inMemoryData.paymentPlans.find(p => p.payrollMonth === month);
        if (!plan) return null;
        const lines = this.inMemoryData.paymentPlanLines.filter(l => l.planId === plan.id);
        return { ...plan, lines };
      },
      upsert: async (
        payrollMonth: string,
        payrollId: string,
        lines: Array<{ employeeId: string; employeeName: string; shouldPayAmount: number; remarks?: string }>,
        user: string
      ) => {
        return this.withOptimisticRetry(() => {
          const timestamp = new Date().toISOString();
          let plan = this.inMemoryData.paymentPlans.find(p => p.payrollMonth === payrollMonth);
          if (!plan) {
            plan = {
              id: crypto.randomUUID(),
              payrollId,
              payrollMonth,
              createdBy: user,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            this.inMemoryData.paymentPlans.push(plan);
          } else {
            plan.updatedAt = timestamp;
            plan.payrollId = payrollId;
          }

          // Full-replace this plan's lines with the new set (same pattern as payroll.saveDraft).
          const planId = plan.id;
          this.inMemoryData.paymentPlanLines = this.inMemoryData.paymentPlanLines.filter(l => l.planId !== planId);
          const processedLines: PaymentPlanLine[] = lines.map(l => ({
            id: crypto.randomUUID(),
            planId,
            employeeId: normalizeEmployeeId(l.employeeId),
            employeeName: l.employeeName,
            shouldPayAmount: roundOMR(l.shouldPayAmount),
            remarks: l.remarks || '',
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          this.inMemoryData.paymentPlanLines.push(...processedLines);

          return { changed: true, value: { ...plan, lines: processedLines } };
        });
      },
    };
  }

  public get wps() {
    return {
      getAll: () => {
        return this.inMemoryData.wpsRecoveries.map(w => ({
          ...w,
          transactions: this.inMemoryData.wpsRecoveryTransactions.filter(t => t.wpsRecoveryId === w.id),
        }));
      },
      findById: (id: string) => {
        const item = this.inMemoryData.wpsRecoveries.find(w => w.id === id);
        if (!item) return null;
        return {
          ...item,
          transactions: this.inMemoryData.wpsRecoveryTransactions.filter(t => t.wpsRecoveryId === item.id),
        };
      },
      create: async (wps: WPSRecovery) => {
        this.inMemoryData.wpsRecoveries.push(wps);
        await this.persist();
        return wps;
      },
      // The balance check is re-evaluated inside the retry closure, so a concurrent
      // recovery cannot slip past a ceiling that was checked against stale state.
      addTransaction: async (tx: WPSRecoveryTransaction) => {
        return this.withOptimisticRetry(() => {
          const wps = this.inMemoryData.wpsRecoveries.find(w => w.id === tx.wpsRecoveryId);
          if (!wps) throw new Error('WPS Recovery record not found.');

          const amount = roundOMR(tx.recoveryAmount);
          if (amount <= 0) throw new Error('Recovery amount must be greater than 0.');
          if (amount > wps.remainingBalance) {
            throw new Error(`Recovery amount OMR ${amount.toFixed(3)} cannot exceed remaining balance of OMR ${wps.remainingBalance.toFixed(3)}.`);
          }

          tx.recoveryAmount = amount;
          this.inMemoryData.wpsRecoveryTransactions.push(tx);

          wps.totalRecovered = roundOMR(wps.totalRecovered + amount);
          wps.remainingBalance = roundOMR(Math.max(0, wps.totalRecoverable - wps.totalRecovered));
          wps.status = wps.remainingBalance <= 0 ? 'Fully Recovered' : 'Partially Recovered';
          wps.updatedAt = new Date().toISOString();

          return { changed: true, value: tx };
        });
      }
    };
  }

  public get loans() {
    return {
      getAll: () => {
        return this.inMemoryData.loans.map(l => ({
          ...l,
          recoveries: this.inMemoryData.loanRecoveries.filter(r => r.loanId === l.id),
        }));
      },
      findById: (id: string) => {
        const item = this.inMemoryData.loans.find(l => l.id === id);
        if (!item) return null;
        return {
          ...item,
          recoveries: this.inMemoryData.loanRecoveries.filter(r => r.loanId === item.id),
        };
      },
      create: async (loan: EmployeeLoan) => {
        loan.employeeId = normalizeEmployeeId(loan.employeeId);
        loan.loanAmount = roundOMR(loan.loanAmount);
        loan.monthlyRecoveryAmount = roundOMR(loan.monthlyRecoveryAmount);
        loan.totalRecovered = 0;
        loan.outstandingBalance = loan.loanAmount;
        loan.status = 'Active';
        this.inMemoryData.loans.push(loan);
        await this.persist();
        return loan;
      },
      // Balance ceiling re-checked inside the retry closure against fresh state.
      addRecovery: async (recovery: LoanRecoveryTransaction) => {
        return this.withOptimisticRetry(() => {
          const loan = this.inMemoryData.loans.find(l => l.id === recovery.loanId);
          if (!loan) throw new Error('Loan record not found.');

          const amount = roundOMR(recovery.recoveryAmount);
          if (amount <= 0) throw new Error('Recovery amount must be greater than 0.');
          if (amount > loan.outstandingBalance) {
            throw new Error(`Recovery amount OMR ${amount.toFixed(3)} cannot exceed outstanding loan of OMR ${loan.outstandingBalance.toFixed(3)}.`);
          }

          recovery.recoveryAmount = amount;
          this.inMemoryData.loanRecoveries.push(recovery);

          loan.totalRecovered = roundOMR(loan.totalRecovered + amount);
          loan.outstandingBalance = roundOMR(Math.max(0, loan.loanAmount - loan.totalRecovered));
          if (loan.outstandingBalance <= 0) {
            loan.status = 'Completed';
          }
          loan.updatedAt = new Date().toISOString();

          return { changed: true, value: recovery };
        });
      },
      updateStatus: async (id: string, status: LoanStatus) => {
        const loan = this.inMemoryData.loans.find(l => l.id === id);
        if (!loan) return null;
        loan.status = status;
        loan.updatedAt = new Date().toISOString();
        await this.persist();
        return loan;
      }
    };
  }

  // --- Organisation master data -------------------------------------------------------

  public get departments() {
    return {
      getAll: () => [...this.inMemoryData.departments],
      findById: (id: string) => this.inMemoryData.departments.find(d => d.id === id),
      findByName: (name: string) =>
        this.inMemoryData.departments.find(
          d => d.name.trim().toLowerCase() === String(name).trim().toLowerCase()
        ),
      create: async (department: Department) => {
        this.inMemoryData.departments.push(department);
        await this.persist();
        return department;
      },
      update: async (id: string, updates: Partial<Department>) => {
        return this.withOptimisticRetry(() => {
          const idx = this.inMemoryData.departments.findIndex(d => d.id === id);
          if (idx === -1) return { changed: false, value: null };
          this.inMemoryData.departments[idx] = {
            ...this.inMemoryData.departments[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.departments[idx] };
        });
      },
    };
  }

  public get designations() {
    return {
      getAll: () => [...this.inMemoryData.designations],
      findById: (id: string) => this.inMemoryData.designations.find(d => d.id === id),
      findByTitle: (title: string) =>
        this.inMemoryData.designations.find(
          d => d.title.trim().toLowerCase() === String(title).trim().toLowerCase()
        ),
      create: async (designation: Designation) => {
        this.inMemoryData.designations.push(designation);
        await this.persist();
        return designation;
      },
      update: async (id: string, updates: Partial<Designation>) => {
        return this.withOptimisticRetry(() => {
          const idx = this.inMemoryData.designations.findIndex(d => d.id === id);
          if (idx === -1) return { changed: false, value: null };
          this.inMemoryData.designations[idx] = {
            ...this.inMemoryData.designations[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.designations[idx] };
        });
      },
    };
  }

  // --- Leave management ---------------------------------------------------------------

  public get leaveTypes() {
    return {
      getAll: () => [...this.inMemoryData.leaveTypes],
      findById: (id: string) => this.inMemoryData.leaveTypes.find(t => t.id === id),
      findByCode: (code: string) =>
        this.inMemoryData.leaveTypes.find(t => t.code.toUpperCase() === String(code).trim().toUpperCase()),
      create: async (type: LeaveType) => {
        this.inMemoryData.leaveTypes.push(type);
        await this.persist();
        return type;
      },
      update: async (id: string, updates: Partial<LeaveType>) => {
        return this.withOptimisticRetry(() => {
          const idx = this.inMemoryData.leaveTypes.findIndex(t => t.id === id);
          if (idx === -1) return { changed: false, value: null };
          this.inMemoryData.leaveTypes[idx] = {
            ...this.inMemoryData.leaveTypes[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.leaveTypes[idx] };
        });
      },
    };
  }

  public get leaveRequests() {
    return {
      getAll: () => [...this.inMemoryData.leaveRequests],
      findById: (id: string) => this.inMemoryData.leaveRequests.find(r => r.id === id),
      getByEmployee: (employeeId: string) =>
        this.inMemoryData.leaveRequests.filter(
          r => normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(employeeId)
        ),
      create: async (request: LeaveRequest) => {
        this.inMemoryData.leaveRequests.push(request);
        await this.persist();
        return request;
      },
      update: async (id: string, updates: Partial<LeaveRequest>) => {
        return this.withOptimisticRetry(() => {
          const idx = this.inMemoryData.leaveRequests.findIndex(r => r.id === id);
          if (idx === -1) return { changed: false, value: null };
          this.inMemoryData.leaveRequests[idx] = {
            ...this.inMemoryData.leaveRequests[idx],
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          return { changed: true, value: this.inMemoryData.leaveRequests[idx] };
        });
      },
    };
  }

  public get audit() {
    return {
      getAll: () => [...this.inMemoryData.auditLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      log: async (entry: Omit<AuditLog, 'id' | 'timestamp'>) => {
        const logEntry: AuditLog = {
          ...entry,
          // Every audit entry gets the caller's IP address, whether or not the call site
          // remembered to pass one. Financial actions -- payroll finalisation, payments,
          // loan recoveries -- previously recorded no IP at all.
          ipAddress: entry.ipAddress || currentRequestContext()?.ipAddress,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        };
        this.inMemoryData.auditLogs.unshift(logEntry);
        // Keep up to 5000 audit logs
        if (this.inMemoryData.auditLogs.length > 5000) {
          this.inMemoryData.auditLogs.pop();
        }
        await this.persist();
        return logEntry;
      }
    };
  }

  // --- Oman HR Compliance Repositories ---

  public get civilIds() {
    return {
      getAll: () => [...this.inMemoryData.civilIds],
      getByEmployeeId: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.civilIds
          .filter((c) => normalizeEmployeeId(c.employeeId) === norm)
          .map((c) => ({
            ...c,
            status: calculateExpiryStatus(c.expiryDate),
          }))
          .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
      },
      getCurrent: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        const record = this.inMemoryData.civilIds.find(
          (c) => normalizeEmployeeId(c.employeeId) === norm && c.isCurrent
        );
        if (!record) return null;
        return {
          ...record,
          status: calculateExpiryStatus(record.expiryDate),
        };
      },
      create: async (record: EmployeeCivilId) => {
        const norm = normalizeEmployeeId(record.employeeId);
        record.employeeId = norm;
        record.status = calculateExpiryStatus(record.expiryDate);
        if (record.isCurrent) {
          this.inMemoryData.civilIds.forEach((c) => {
            if (normalizeEmployeeId(c.employeeId) === norm && c.id !== record.id) {
              c.isCurrent = false;
              c.updatedAt = new Date().toISOString();
            }
          });
        }
        this.inMemoryData.civilIds.push(record);
        await this.persist();
        return record;
      },
      renew: async (empId: string, newRecord: EmployeeCivilId, reason: string, user: string) => {
        const norm = normalizeEmployeeId(empId);
        const timestamp = new Date().toISOString();
        this.inMemoryData.civilIds.forEach((c) => {
          if (normalizeEmployeeId(c.employeeId) === norm && c.isCurrent) {
            c.isCurrent = false;
            c.replacedDate = timestamp.slice(0, 10);
            c.replaceReason = reason || 'Renewed with new Civil ID Card';
            c.updatedAt = timestamp;
          }
        });
        newRecord.employeeId = norm;
        newRecord.isCurrent = true;
        newRecord.status = calculateExpiryStatus(newRecord.expiryDate);
        newRecord.createdBy = user;
        newRecord.createdAt = timestamp;
        newRecord.updatedAt = timestamp;
        this.inMemoryData.civilIds.push(newRecord);
        await this.persist();
        return newRecord;
      },
      update: async (id: string, updates: Partial<EmployeeCivilId>) => {
        const index = this.inMemoryData.civilIds.findIndex((c) => c.id === id);
        if (index === -1) return null;
        if (updates.expiryDate) {
          updates.status = calculateExpiryStatus(updates.expiryDate);
        }
        this.inMemoryData.civilIds[index] = {
          ...this.inMemoryData.civilIds[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.civilIds[index];
      },
    };
  }

  public get drivingLicences() {
    return {
      getAll: () => [...this.inMemoryData.drivingLicences],
      getByEmployeeId: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.drivingLicences
          .filter((d) => normalizeEmployeeId(d.employeeId) === norm)
          .map((d) => ({
            ...d,
            status: calculateExpiryStatus(d.expiryDate),
          }))
          .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
      },
      getCurrent: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        const record = this.inMemoryData.drivingLicences.find(
          (d) => normalizeEmployeeId(d.employeeId) === norm && d.isCurrent
        );
        if (!record) return null;
        return {
          ...record,
          status: calculateExpiryStatus(record.expiryDate),
        };
      },
      create: async (record: EmployeeDrivingLicence) => {
        const norm = normalizeEmployeeId(record.employeeId);
        record.employeeId = norm;
        record.status = calculateExpiryStatus(record.expiryDate);
        if (record.isCurrent) {
          // Deactivate previous active licence for same category/employee if applicable
          this.inMemoryData.drivingLicences.forEach((d) => {
            if (
              normalizeEmployeeId(d.employeeId) === norm &&
              d.category === record.category &&
              d.id !== record.id
            ) {
              d.isCurrent = false;
              d.updatedAt = new Date().toISOString();
            }
          });
        }
        this.inMemoryData.drivingLicences.push(record);
        await this.persist();
        return record;
      },
      renew: async (
        empId: string,
        oldLicenceId: string,
        newRecord: EmployeeDrivingLicence,
        reason: string,
        user: string
      ) => {
        const norm = normalizeEmployeeId(empId);
        const timestamp = new Date().toISOString();
        const oldIndex = this.inMemoryData.drivingLicences.findIndex((d) => d.id === oldLicenceId);
        if (oldIndex !== -1) {
          this.inMemoryData.drivingLicences[oldIndex].isCurrent = false;
          this.inMemoryData.drivingLicences[oldIndex].renewalDate = timestamp.slice(0, 10);
          this.inMemoryData.drivingLicences[oldIndex].remarks = `${this.inMemoryData.drivingLicences[oldIndex].remarks || ''} (Renewed: ${reason})`.trim();
          this.inMemoryData.drivingLicences[oldIndex].updatedAt = timestamp;
        }
        newRecord.employeeId = norm;
        newRecord.isCurrent = true;
        newRecord.previousLicenceId = oldLicenceId;
        newRecord.status = calculateExpiryStatus(newRecord.expiryDate);
        newRecord.createdBy = user;
        newRecord.createdAt = timestamp;
        newRecord.updatedAt = timestamp;
        this.inMemoryData.drivingLicences.push(newRecord);
        await this.persist();
        return newRecord;
      },
      update: async (id: string, updates: Partial<EmployeeDrivingLicence>) => {
        const index = this.inMemoryData.drivingLicences.findIndex((d) => d.id === id);
        if (index === -1) return null;
        if (updates.expiryDate) {
          updates.status = calculateExpiryStatus(updates.expiryDate);
        }
        this.inMemoryData.drivingLicences[index] = {
          ...this.inMemoryData.drivingLicences[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.drivingLicences[index];
      },
    };
  }

  public get visas() {
    return {
      getAll: () => [...this.inMemoryData.visas],
      getByEmployeeId: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.visas
          .filter((v) => normalizeEmployeeId(v.employeeId) === norm)
          .map((v) => ({
            ...v,
            status: calculateExpiryStatus(v.expiryDate),
          }))
          .sort((a, b) => new Date(b.effectiveFrom || b.issueDate || 0).getTime() - new Date(a.effectiveFrom || a.issueDate || 0).getTime());
      },
      getCurrent: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        const record = this.inMemoryData.visas.find(
          (v) => normalizeEmployeeId(v.employeeId) === norm && v.isCurrent
        );
        if (!record) return null;
        return {
          ...record,
          status: calculateExpiryStatus(record.expiryDate),
        };
      },
      create: async (record: EmployeeVisa) => {
        const norm = normalizeEmployeeId(record.employeeId);
        record.employeeId = norm;
        record.status = calculateExpiryStatus(record.expiryDate);
        if (record.isCurrent) {
          this.inMemoryData.visas.forEach((v) => {
            if (normalizeEmployeeId(v.employeeId) === norm && v.id !== record.id) {
              v.isCurrent = false;
              v.effectiveTo = record.effectiveFrom || new Date().toISOString().slice(0, 10);
              v.updatedAt = new Date().toISOString();
            }
          });
        }
        this.inMemoryData.visas.push(record);
        await this.persist();
        return record;
      },
      renewOrChangeTrade: async (
        empId: string,
        newRecord: EmployeeVisa,
        reason: string,
        user: string
      ) => {
        const norm = normalizeEmployeeId(empId);
        const timestamp = new Date().toISOString();
        const effectiveDate = newRecord.effectiveFrom || timestamp.slice(0, 10);

        this.inMemoryData.visas.forEach((v) => {
          if (normalizeEmployeeId(v.employeeId) === norm && v.isCurrent) {
            v.isCurrent = false;
            v.effectiveTo = effectiveDate;
            v.reasonForChange = reason || 'Visa renewal / trade designation amendment';
            v.updatedAt = timestamp;
          }
        });

        newRecord.employeeId = norm;
        newRecord.isCurrent = true;
        newRecord.effectiveFrom = effectiveDate;
        newRecord.status = calculateExpiryStatus(newRecord.expiryDate);
        newRecord.createdBy = user;
        newRecord.createdAt = timestamp;
        newRecord.updatedAt = timestamp;
        this.inMemoryData.visas.push(newRecord);
        await this.persist();
        return newRecord;
      },
      update: async (id: string, updates: Partial<EmployeeVisa>) => {
        const index = this.inMemoryData.visas.findIndex((v) => v.id === id);
        if (index === -1) return null;
        if (updates.expiryDate) {
          updates.status = calculateExpiryStatus(updates.expiryDate);
        }
        this.inMemoryData.visas[index] = {
          ...this.inMemoryData.visas[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.visas[index];
      },
    };
  }

  public get governmentDocuments() {
    return {
      getAll: () => [...this.inMemoryData.governmentDocuments],
      getByEmployeeId: (empId: string) => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.governmentDocuments
          .filter((d) => normalizeEmployeeId(d.employeeId) === norm)
          .map((d) => ({
            ...d,
            status: calculateExpiryStatus(d.expiryDate),
          }))
          .sort((a, b) => new Date(b.issueDate || 0).getTime() - new Date(a.issueDate || 0).getTime());
      },
      create: async (record: EmployeeGovernmentDocument) => {
        const norm = normalizeEmployeeId(record.employeeId);
        record.employeeId = norm;
        record.status = calculateExpiryStatus(record.expiryDate);
        if (record.isCurrent) {
          this.inMemoryData.governmentDocuments.forEach((d) => {
            if (
              normalizeEmployeeId(d.employeeId) === norm &&
              d.documentType === record.documentType &&
              d.id !== record.id
            ) {
              d.isCurrent = false;
              d.updatedAt = new Date().toISOString();
            }
          });
        }
        this.inMemoryData.governmentDocuments.push(record);
        await this.persist();
        return record;
      },
      renew: async (
        empId: string,
        oldDocId: string,
        newRecord: EmployeeGovernmentDocument,
        reason: string,
        user: string
      ) => {
        const norm = normalizeEmployeeId(empId);
        const timestamp = new Date().toISOString();
        const oldIndex = this.inMemoryData.governmentDocuments.findIndex((d) => d.id === oldDocId);
        if (oldIndex !== -1) {
          this.inMemoryData.governmentDocuments[oldIndex].isCurrent = false;
          this.inMemoryData.governmentDocuments[oldIndex].replacedDate = timestamp.slice(0, 10);
          this.inMemoryData.governmentDocuments[oldIndex].replaceReason = reason || 'Renewed with updated document copy';
          this.inMemoryData.governmentDocuments[oldIndex].updatedAt = timestamp;
        }
        newRecord.employeeId = norm;
        newRecord.isCurrent = true;
        newRecord.previousDocId = oldDocId;
        newRecord.status = calculateExpiryStatus(newRecord.expiryDate);
        newRecord.createdBy = user;
        newRecord.createdAt = timestamp;
        newRecord.updatedAt = timestamp;
        this.inMemoryData.governmentDocuments.push(newRecord);
        await this.persist();
        return newRecord;
      },
      update: async (id: string, updates: Partial<EmployeeGovernmentDocument>) => {
        const index = this.inMemoryData.governmentDocuments.findIndex((d) => d.id === id);
        if (index === -1) return null;
        if (updates.expiryDate) {
          updates.status = calculateExpiryStatus(updates.expiryDate);
        }
        this.inMemoryData.governmentDocuments[index] = {
          ...this.inMemoryData.governmentDocuments[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.governmentDocuments[index];
      },
      delete: async (id: string) => {
        const index = this.inMemoryData.governmentDocuments.findIndex((d) => d.id === id);
        if (index === -1) return false;
        this.inMemoryData.governmentDocuments.splice(index, 1);
        await this.persist();
        return true;
      },
    };
  }

  public get personalDetails() {
    return {
      get: (empId: string): EmployeePersonalDetails | null => {
        const norm = normalizeEmployeeId(empId);
        return this.inMemoryData.personalDetails[norm] || null;
      },
      save: async (empId: string, details: EmployeePersonalDetails) => {
        const norm = normalizeEmployeeId(empId);
        const timestamp = new Date().toISOString();
        details.employeeId = norm;
        details.updatedAt = timestamp;
        if (!details.createdAt) details.createdAt = timestamp;
        this.inMemoryData.personalDetails[norm] = details;
        await this.persist();
        return details;
      },
    };
  }

  public get documents() {
    return {
      getAll: () => [...this.inMemoryData.documents],
      getByEmployeeId: (empId: string, category?: string) => {
        const norm = normalizeEmployeeId(empId);
        let list = this.inMemoryData.documents.filter((d) => normalizeEmployeeId(d.employeeId) === norm);
        if (category && category !== 'ALL') {
          list = list.filter((d) => d.category === category);
        }
        return list
          .map((d) => ({
            ...d,
            status: d.expiryDate ? calculateExpiryStatus(d.expiryDate) : undefined,
          }))
          .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
      },
      getById: (id: string) => {
        const doc = this.inMemoryData.documents.find((d) => d.id === id);
        if (!doc) return null;
        return {
          ...doc,
          status: doc.expiryDate ? calculateExpiryStatus(doc.expiryDate) : undefined,
        };
      },
      create: async (doc: EmployeeDocument) => {
        const norm = normalizeEmployeeId(doc.employeeId);
        doc.employeeId = norm;
        if (doc.expiryDate) {
          doc.status = calculateExpiryStatus(doc.expiryDate);
        }
        this.inMemoryData.documents.push(doc);
        await this.persist();
        return doc;
      },
      update: async (id: string, updates: Partial<EmployeeDocument>) => {
        const index = this.inMemoryData.documents.findIndex((d) => d.id === id);
        if (index === -1) return null;
        if (updates.expiryDate) {
          updates.status = calculateExpiryStatus(updates.expiryDate);
        }
        this.inMemoryData.documents[index] = {
          ...this.inMemoryData.documents[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.documents[index];
      },
      delete: async (id: string) => {
        const index = this.inMemoryData.documents.findIndex((d) => d.id === id);
        if (index === -1) return false;
        this.inMemoryData.documents.splice(index, 1);
        await this.persist();
        return true;
      },
    };
  }

  public get drivingLicenceCategories() {
    return {
      getAll: () => [...this.inMemoryData.drivingLicenceCategories],
      add: async (category: string) => {
        const trimmed = category.trim();
        if (!trimmed) return this.inMemoryData.drivingLicenceCategories;
        if (!this.inMemoryData.drivingLicenceCategories.includes(trimmed)) {
          this.inMemoryData.drivingLicenceCategories.push(trimmed);
          await this.persist();
        }
        return [...this.inMemoryData.drivingLicenceCategories];
      },
    };
  }
}

export const db = new DatabaseManager();
