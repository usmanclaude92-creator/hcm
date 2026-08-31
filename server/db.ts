import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
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
  return '•'.repeat(Math.max(4, trimmed.length - 4)) + visible;
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
  private stateVersion: number = 1;

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

    // Check for PostgreSQL environment variable
    if (POSTGRES_CONNECTION_STRING) {
      try {
        console.log('Checking PostgreSQL database connection...');
        this.pgPool = new pg.Pool({
          connectionString: POSTGRES_CONNECTION_STRING,
          ssl: POSTGRES_CONNECTION_STRING.includes('localhost') ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 2000,
        });
        const res = await this.pgPool.query('SELECT NOW()');
        this.isPostgresConnected = true;
        console.log('PostgreSQL connection established successfully at', res.rows[0].now);
        await this.initPostgresSchema();
      } catch (err) {
        console.warn('PostgreSQL connection failed or timed out, using persistent storage engine:', (err as Error).message);
        this.isPostgresConnected = false;
      }
    }

    if (this.isPostgresConnected) {
      await this.loadFromPostgres();
    } else {
      // Load from persistent local store (no-op if DATABASE_URL was set, since the
      // constructor skips disk access entirely on serverless/read-only filesystems)
      this.loadFromDisk();
    }

    // Ensure default admin user and initial demo dataset
    await this.ensureInitialSeed();
    this.isInitialized = true;
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

  private saveToDisk() {
    try {
      this.ensureDataDirectory();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.inMemoryData, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error('Error persisting database to disk:', e);
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
        console.error('Error persisting database to PostgreSQL:', (e as Error).message);
        return;
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
      storageType: this.isPostgresConnected ? 'PostgreSQL (Cloud Database)' : 'High-Integrity Persistent Storage (Cloud/JSON)',
      isPostgresConnected: this.isPostgresConnected,
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

  public async ensureInitialSeed(forceReset: boolean = false) {
    const timestamp = new Date().toISOString();
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    const managerPasswordHash = bcrypt.hashSync('manager123', 10);
    const userPasswordHash = bcrypt.hashSync('user123', 10);
    const viewerPasswordHash = bcrypt.hashSync('viewer123', 10);

    const defaultCoreUsers: User[] = [
      {
        id: 'user-admin-uuid-001',
        username: 'admin',
        name: 'System Administrator',
        email: 'admin@company.com',
        role: 'Administrator',
        passwordHash: adminPasswordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
      },
      {
        id: 'user-manager-uuid-002',
        username: 'manager',
        name: 'Payroll Manager',
        email: 'manager@company.com',
        role: 'Payroll Manager',
        passwordHash: managerPasswordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
      },
      {
        id: 'user-payroll-uuid-003',
        username: 'user',
        name: 'Operations Officer',
        email: 'user@company.com',
        role: 'Payroll User',
        passwordHash: userPasswordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
      },
      {
        id: 'user-payroll-uuid-003b',
        username: 'payroll_user',
        name: 'Operations Officer',
        email: 'payroll_user@company.com',
        role: 'Payroll User',
        passwordHash: userPasswordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
      },
      {
        id: 'user-viewer-uuid-004',
        username: 'viewer',
        name: 'Auditor / Viewer',
        email: 'viewer@company.com',
        role: 'Viewer',
        passwordHash: viewerPasswordHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        isActive: true,
      },
    ];

    // Ensure every default user exists; never overwrite one that's already there,
    // so a real password/role change survives future restarts (incl. serverless cold starts).
    for (const coreUser of defaultCoreUsers) {
      const existing = this.inMemoryData.users.find(u => u.username.toLowerCase() === coreUser.username.toLowerCase());
      if (!existing) {
        this.inMemoryData.users.push(coreUser);
      }
    }

    const initialProjects: Project[] = [
      {
        id: crypto.randomUUID(),
        projectCode: 'PRJ-A',
        projectName: 'Project A - Commercial Tower Muscat',
        status: 'Active',
        startDate: '2024-01-01',
        endDate: '2027-12-31',
        remarks: 'Major commercial build in Muscat CBD',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        projectCode: 'PRJ-B',
        projectName: 'Project B - Sohar Logistics Hub',
        status: 'Active',
        startDate: '2024-03-15',
        endDate: '2026-11-30',
        remarks: 'Warehouse and distribution expansion',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        projectCode: 'PRJ-C',
        projectName: 'Project C - Salalah Energy Plant',
        status: 'Active',
        startDate: '2024-06-01',
        endDate: '2028-06-01',
        remarks: 'Renewable power facility setup',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const initialEmployees: Employee[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        employeeName: 'Ahmed Al-Balushi',
        employeeType: 'Staff',
        nationalityType: 'Omani',
        wageType: 'Fixed Monthly',
        dateOfJoining: '2023-01-15',
        designation: 'Site Manager',
        employeeCompany: 'DGO',
        salaryPaidBy: 'DGO',
        monthlySalaryOrRate: 650.000,
        wpsEmployee: 'Yes',
        wpsSalary: 700.000,
        actualSalary: 650.000,
        recoverFrom: 'DGO',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        employeeName: 'Ali Hassan',
        employeeType: 'Worker',
        nationalityType: 'Expat',
        wageType: 'Per Hour',
        dateOfJoining: '2023-04-10',
        designation: 'Mason',
        employeeCompany: 'SMI',
        salaryPaidBy: 'SMI',
        monthlySalaryOrRate: 2.000,
        wpsEmployee: 'Yes',
        wpsSalary: 450.000,
        actualSalary: 480.000,
        recoverFrom: 'SMI',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        employeeName: 'Mohammed Tariq',
        employeeType: 'Worker',
        nationalityType: 'Expat',
        wageType: 'Per Hour',
        dateOfJoining: '2023-07-01',
        designation: 'Electrician',
        employeeCompany: 'NC',
        salaryPaidBy: 'NC',
        monthlySalaryOrRate: 2.250,
        wpsEmployee: 'No',
        wpsSalary: 0.000,
        actualSalary: 450.000,
        recoverFrom: '',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        employeeName: 'Khalid Al-Harthy',
        employeeType: 'Staff',
        nationalityType: 'Omani',
        wageType: 'Fixed Monthly',
        dateOfJoining: '2023-09-01',
        designation: 'Safety Officer',
        employeeCompany: 'Supplier',
        salaryPaidBy: 'Supplier',
        monthlySalaryOrRate: 550.000,
        wpsEmployee: 'Yes',
        wpsSalary: 600.000,
        actualSalary: 550.000,
        recoverFrom: 'Supplier',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        employeeName: 'Suresh Kumar',
        employeeType: 'Worker',
        nationalityType: 'Expat',
        wageType: 'Per Hour',
        dateOfJoining: '2024-02-15',
        designation: 'Carpenter',
        employeeCompany: 'Azad',
        salaryPaidBy: 'DGO',
        monthlySalaryOrRate: 1.850,
        wpsEmployee: 'No',
        wpsSalary: 0.000,
        actualSalary: 370.000,
        recoverFrom: '',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    // Seed designation & salary history
    const initialDesignationHistory: DesignationHistory[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        previousDesignation: 'Assistant Site Manager',
        newDesignation: 'Site Manager',
        effectiveDate: '2024-01-01',
        changedBy: 'System Init',
        createdAt: timestamp,
      }
    ];

    const initialSalaryHistory: SalaryHistory[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        previousSalary: 550.000,
        newSalary: 650.000,
        wageType: 'Fixed Monthly',
        effectiveDate: '2024-01-01',
        changedBy: 'System Init',
        createdAt: timestamp,
      }
    ];

    // Sample Attendance for 2026-08 (Ahmed with multi-project: PRJ-A 15 days, PRJ-B 10 days; Ali with PRJ-A 160h, PRJ-B 80h)
    const initialAttendance: AttendanceRecord[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        employeeInternalId: initialEmployees[0].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[0].id,
        projectCode: 'PRJ-A',
        projectName: 'Project A - Commercial Tower Muscat',
        daysWorked: 15,
        hoursWorked: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        employeeInternalId: initialEmployees[0].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[1].id,
        projectCode: 'PRJ-B',
        projectName: 'Project B - Sohar Logistics Hub',
        daysWorked: 10,
        hoursWorked: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        employeeInternalId: initialEmployees[1].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[0].id,
        projectCode: 'PRJ-A',
        projectName: 'Project A - Commercial Tower Muscat',
        daysWorked: 0,
        hoursWorked: 160,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        employeeInternalId: initialEmployees[1].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[1].id,
        projectCode: 'PRJ-B',
        projectName: 'Project B - Sohar Logistics Hub',
        daysWorked: 0,
        hoursWorked: 80,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        employeeInternalId: initialEmployees[2].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[2].id,
        projectCode: 'PRJ-C',
        projectName: 'Project C - Salalah Energy Plant',
        daysWorked: 0,
        hoursWorked: 200,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        employeeInternalId: initialEmployees[3].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[0].id,
        projectCode: 'PRJ-A',
        projectName: 'Project A - Commercial Tower Muscat',
        daysWorked: 28,
        hoursWorked: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        employeeInternalId: initialEmployees[4].id,
        payrollMonth: '2026-08',
        projectId: initialProjects[1].id,
        projectCode: 'PRJ-B',
        projectName: 'Project B - Sohar Logistics Hub',
        daysWorked: 0,
        hoursWorked: 190,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    ];

    // Seed a sample Employee Loan for EMP001 (Loan amount OMR 300, Monthly recovery OMR 50)
    const loanId1 = crypto.randomUUID();
    const initialLoans: EmployeeLoan[] = [
      {
        id: loanId1,
        employeeId: 'EMP001',
        employeeName: 'Ahmed Al-Balushi',
        loanAmount: 300.000,
        loanDate: '2026-06-01',
        monthlyRecoveryAmount: 50.000,
        totalRecovered: 50.000,
        outstandingBalance: 250.000,
        status: 'Active',
        remarks: 'Personal vehicle emergency repair',
        createdAt: timestamp,
        updatedAt: timestamp,
        recoveries: [
          {
            id: crypto.randomUUID(),
            loanId: loanId1,
            employeeId: 'EMP001',
            recoverySource: 'Payroll',
            payrollMonth: '2026-07',
            recoveryAmount: 50.000,
            recoveryDate: '2026-07-31',
            remarks: 'July Payroll Loan Deduction',
            createdAt: timestamp,
          }
        ]
      }
    ];

    // Seed Finalized Payroll for 2026-07 (July 2026) to show payment history, WPS, and outstanding calculations
    const payrollJulyId = crypto.randomUUID();
    const lineJuly1Id = crypto.randomUUID();
    const lineJuly2Id = crypto.randomUUID();
    const lineJuly3Id = crypto.randomUUID();

    const initialPayrollLines: PayrollLine[] = [
      {
        id: lineJuly1Id,
        payrollId: payrollJulyId,
        employeeId: 'EMP001',
        employeeName: 'Ahmed Al-Balushi',
        employeeType: 'Staff',
        nationalityType: 'Omani',
        wageType: 'Fixed Monthly',
        designation: 'Site Manager',
        employeeCompany: 'DGO',
        salaryPaidBy: 'DGO',
        projectsSummary: 'Project A (25d)',
        daysWorked: 25,
        hoursWorked: 0,
        basicSalaryOrRate: 650.000,
        grossSalary: roundOMR((650.000 / 30) * 25), // 541.667
        houseAllowance: 50.000,
        transportAllowance: 25.000,
        bonus: 0.000,
        otherAllowance: 0.000,
        totalAdditions: 75.000,
        loanRecovery: 50.000,
        otherDeductions: 0.000,
        totalDeductions: 50.000,
        netSalary: roundOMR(541.667 + 75.000 - 50.000), // 566.667
        paymentMethod: 'WPS',
        wpsSalary: 700.000,
        recoverableSalary: roundOMR(Math.max(700.000 - 566.667, 0)), // 133.333
        recoverFrom: 'DGO',
        wpsEmployee: 'Yes',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: lineJuly2Id,
        payrollId: payrollJulyId,
        employeeId: 'EMP002',
        employeeName: 'Ali Hassan',
        employeeType: 'Worker',
        nationalityType: 'Expat',
        wageType: 'Per Hour',
        designation: 'Mason',
        employeeCompany: 'SMI',
        salaryPaidBy: 'SMI',
        projectsSummary: 'Project A (240h)',
        daysWorked: 0,
        hoursWorked: 240,
        basicSalaryOrRate: 2.000,
        grossSalary: 480.000, // 240 * 2
        houseAllowance: 0.000,
        transportAllowance: 0.000,
        bonus: 20.000,
        otherAllowance: 0.000,
        totalAdditions: 20.000,
        loanRecovery: 0.000,
        otherDeductions: 0.000,
        totalDeductions: 0.000,
        netSalary: 500.000, // 480 + 20
        paymentMethod: 'WPS',
        wpsSalary: 450.000,
        recoverableSalary: 0.000,
        recoverFrom: 'SMI',
        wpsEmployee: 'Yes',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: lineJuly3Id,
        payrollId: payrollJulyId,
        employeeId: 'EMP003',
        employeeName: 'Mohammed Tariq',
        employeeType: 'Worker',
        nationalityType: 'Expat',
        wageType: 'Per Hour',
        designation: 'Electrician',
        employeeCompany: 'NC',
        salaryPaidBy: 'NC',
        projectsSummary: 'Project C (200h)',
        daysWorked: 0,
        hoursWorked: 200,
        basicSalaryOrRate: 2.250,
        grossSalary: 450.000, // 200 * 2.25
        houseAllowance: 0.000,
        transportAllowance: 0.000,
        bonus: 0.000,
        otherAllowance: 0.000,
        totalAdditions: 0.000,
        loanRecovery: 0.000,
        otherDeductions: 0.000,
        totalDeductions: 0.000,
        netSalary: 450.000,
        paymentMethod: 'Non-WPS',
        wpsSalary: 0.000,
        recoverableSalary: 0.000,
        recoverFrom: '',
        wpsEmployee: 'No',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    ];

    const initialPayrolls: MonthlyPayroll[] = [
      {
        id: payrollJulyId,
        payrollMonth: '2026-07',
        status: 'Finalized',
        totalEmployees: 3,
        totalGrossSalary: roundOMR(541.667 + 480.000 + 450.000),
        totalAdditions: 95.000,
        totalDeductions: 50.000,
        totalNetSalary: roundOMR(566.667 + 500.000 + 450.000), // 1516.667
        totalWpsSalary: 1150.000,
        totalRecoverableSalary: 133.333,
        finalizedAt: '2026-08-02T10:00:00.000Z',
        finalizedBy: 'admin',
        revisionNumber: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    ];

    // Seed Partial Payments for July 2026
    // Ahmed: Net 566.667. Paid 300.000 (Partially Paid, Outstanding 266.667)
    // Ali: Net 500.000. Paid 200.000 then 300.000 (Fully Paid, Outstanding 0.000)
    // Mohammed: Net 450.000. Unpaid (Paid 0.000, Outstanding 450.000)
    const initialPayments: SalaryPaymentTransaction[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        employeeName: 'Ahmed Al-Balushi',
        payrollMonth: '2026-07',
        payrollLineId: lineJuly1Id,
        paymentDate: '2026-08-05',
        payAmount: 300.000,
        payTo: 'Ahmed Al-Balushi',
        receiptStatus: 'Attached',
        receiptFileName: 'bank_slip_jul_ahmed_part1.pdf',
        remarks: 'Advance partial transfer via Bank Muscat',
        createdBy: 'admin',
        isReversed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        employeeName: 'Ali Hassan',
        payrollMonth: '2026-07',
        payrollLineId: lineJuly2Id,
        paymentDate: '2026-08-06',
        payAmount: 200.000,
        payTo: 'Ali Hassan',
        receiptStatus: 'Attached',
        receiptFileName: 'receipt_ali_part1.jpg',
        remarks: 'Cash remittance voucher #4421',
        createdBy: 'admin',
        isReversed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        employeeName: 'Ali Hassan',
        payrollMonth: '2026-07',
        payrollLineId: lineJuly2Id,
        paymentDate: '2026-08-15',
        payAmount: 300.000,
        payTo: 'Ali Hassan',
        receiptStatus: 'Attachment Pending',
        remarks: 'Final settlement for July salary',
        createdBy: 'admin',
        isReversed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    // Seed WPS Recovery for July 2026 (Ahmed: Total Recoverable 133.333, Recovered 80.000, Remaining 53.333)
    const wpsRecId1 = crypto.randomUUID();
    const initialWpsRecoveries: WPSRecovery[] = [
      {
        id: wpsRecId1,
        employeeId: 'EMP001',
        employeeName: 'Ahmed Al-Balushi',
        payrollMonth: '2026-07',
        wpsSalary: 700.000,
        netSalary: 566.667,
        totalRecoverable: 133.333,
        recoveredFrom: 'DGO',
        totalRecovered: 80.000,
        remainingBalance: 53.333,
        status: 'Partially Recovered',
        createdAt: timestamp,
        updatedAt: timestamp,
        transactions: [
          {
            id: crypto.randomUUID(),
            wpsRecoveryId: wpsRecId1,
            employeeId: 'EMP001',
            payrollMonth: '2026-07',
            recoveredFrom: 'DGO',
            recoveryAmount: 80.000,
            recoveryDate: '2026-08-10',
            remarks: 'Partial recovery from DGO petty cash refund',
            createdBy: 'admin',
            createdAt: timestamp,
          }
        ]
      }
    ];

    const initialAuditLogs: AuditLog[] = [
      {
        id: crypto.randomUUID(),
        username: 'system',
        userRole: 'Administrator',
        action: 'SYSTEM_INITIALIZATION',
        module: 'System',
        description: 'Initialized Employee & Payroll ERP persistent relational data and demo baseline.',
        timestamp,
      },
      {
        id: crypto.randomUUID(),
        username: 'admin',
        userRole: 'Administrator',
        action: 'PAYROLL_FINALIZED',
        module: 'Payroll',
        recordId: payrollJulyId,
        description: 'Finalized monthly payroll for 2026-07 (July 2026) for 3 employees.',
        timestamp,
      }
    ];

    const initialCivilIds: EmployeeCivilId[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        civilIdNumber: '10293847',
        issueDate: '2023-01-10',
        expiryDate: '2028-01-10',
        status: 'Valid',
        issuingAuthority: 'Royal Oman Police (ROP)',
        country: 'Oman',
        documentAttachment: 'civil_id_ahmed.pdf',
        fileName: 'civil_id_ahmed.pdf',
        storagePath: '/documents/civil_id_ahmed.pdf',
        remarks: 'Omani National Smart Civil ID Card',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        civilIdNumber: '83726194',
        issueDate: '2024-03-01',
        expiryDate: '2026-09-10',
        status: 'Expiring Soon',
        issuingAuthority: 'ROP Directorate General of Civil Status',
        country: 'Oman',
        documentAttachment: 'resident_card_ali.pdf',
        fileName: 'resident_card_ali.pdf',
        storagePath: '/documents/resident_card_ali.pdf',
        remarks: 'Expat Resident Identity Card - SMI Sponsorship',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        civilIdNumber: '74928103',
        issueDate: '2023-06-15',
        expiryDate: '2025-06-14',
        status: 'Expired',
        issuingAuthority: 'ROP Directorate General of Civil Status',
        country: 'Oman',
        remarks: 'Expired Resident Card - Renewal in process with MoL',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        civilIdNumber: '92837461',
        issueDate: '2022-08-20',
        expiryDate: '2027-08-19',
        status: 'Valid',
        issuingAuthority: 'Royal Oman Police (ROP)',
        country: 'Oman',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        civilIdNumber: '61928374',
        issueDate: '2024-02-01',
        expiryDate: '2026-09-25',
        status: 'Expiring Soon',
        issuingAuthority: 'ROP Directorate General of Civil Status',
        country: 'Oman',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const initialDrivingLicences: EmployeeDrivingLicence[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        licenceNumber: 'DL-OM-89214',
        category: 'Light Vehicle',
        issuingCountry: 'Oman',
        issuingAuthority: 'ROP Directorate General of Traffic',
        vehicleClass: 'Private / Light Commercial',
        issueDate: '2021-05-12',
        expiryDate: '2026-09-15',
        status: 'Expiring Soon',
        documentAttachment: 'dl_ahmed.pdf',
        fileName: 'dl_ahmed.pdf',
        remarks: 'Oman Light Vehicle Driving Licence',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        licenceNumber: 'DL-OM-47291',
        category: 'Heavy Equipment',
        issuingCountry: 'Oman',
        issuingAuthority: 'ROP Directorate General of Traffic',
        vehicleClass: 'Excavator / Bulldozer / Heavy Plant',
        restrictions: 'Corrective lenses required',
        issueDate: '2022-01-15',
        expiryDate: '2027-01-14',
        status: 'Valid',
        documentAttachment: 'heavy_dl_ali.pdf',
        fileName: 'heavy_dl_ali.pdf',
        remarks: 'Certified Plant & Heavy Machinery Operator',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        licenceNumber: 'DL-OM-10293',
        category: 'Motorcycle',
        issuingCountry: 'Oman',
        issuingAuthority: 'ROP Directorate General of Traffic',
        vehicleClass: 'Motorcycle / Delivery',
        issueDate: '2020-11-20',
        expiryDate: '2025-11-19',
        status: 'Expired',
        remarks: 'Expired Motorcycle Licence',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        licenceNumber: 'DL-OM-55612',
        category: 'Light Vehicle',
        issuingCountry: 'Oman',
        issuingAuthority: 'ROP Directorate General of Traffic',
        issueDate: '2020-04-10',
        expiryDate: '2030-04-09',
        status: 'Valid',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const initialVisas: EmployeeVisa[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        visaNumber: 'V-882910',
        tradeOnVisa: 'Mason',
        visaProfessionCode: '711201',
        visaType: 'Employment Visa',
        issueDate: '2024-03-01',
        expiryDate: '2026-09-10',
        sponsor: 'SMI LLC',
        sponsorshipType: 'Corporate',
        issuingAuthority: 'Royal Oman Police - Passports & Residence',
        country: 'Oman',
        status: 'Expiring Soon',
        documentAttachment: 'visa_ali.pdf',
        fileName: 'visa_ali.pdf',
        remarks: 'Matches job designation',
        isCurrent: true,
        effectiveFrom: '2024-03-01',
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        visaNumber: 'V-339182',
        tradeOnVisa: 'General Helper',
        visaProfessionCode: '931301',
        visaType: 'Employment Visa',
        issueDate: '2023-06-15',
        expiryDate: '2025-06-14',
        sponsor: 'NC Engineering',
        sponsorshipType: 'Corporate',
        issuingAuthority: 'Royal Oman Police - Passports & Residence',
        country: 'Oman',
        status: 'Expired',
        remarks: 'Trade on Visa is General Helper but active Designation is Electrician',
        isCurrent: true,
        effectiveFrom: '2023-06-15',
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        visaNumber: 'V-994821',
        tradeOnVisa: 'Carpenter',
        visaProfessionCode: '711501',
        visaType: 'Employment Visa',
        issueDate: '2024-02-01',
        expiryDate: '2026-09-25',
        sponsor: 'Artify DGO',
        sponsorshipType: 'Corporate',
        issuingAuthority: 'Royal Oman Police',
        country: 'Oman',
        status: 'Expiring Soon',
        isCurrent: true,
        effectiveFrom: '2024-02-01',
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const initialGovtDocs: EmployeeGovernmentDocument[] = [
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        documentType: 'Passport',
        documentNumber: 'P01928374',
        issueDate: '2020-02-15',
        expiryDate: '2030-02-14',
        issuingAuthority: 'ROP Passports Dept',
        country: 'Oman',
        status: 'Valid',
        documentAttachment: 'passport_ahmed.pdf',
        fileName: 'passport_ahmed.pdf',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP001',
        documentType: 'Employment Contract',
        documentNumber: 'CNT-2023-0192',
        issueDate: '2023-01-10',
        expiryDate: '2028-01-10',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Valid',
        documentAttachment: 'contract_ahmed.pdf',
        fileName: 'contract_ahmed.pdf',
        remarks: 'Permanent Senior Employment Contract under RD 53/2023',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        documentType: 'Passport',
        documentNumber: 'L9283741',
        issueDate: '2021-08-10',
        expiryDate: '2031-08-09',
        issuingAuthority: 'Regional Passport Office',
        country: 'India',
        status: 'Valid',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        documentType: 'Work Permit',
        documentNumber: 'WP-2024-9182',
        issueDate: '2024-03-01',
        expiryDate: '2026-09-10',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expiring Soon',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP002',
        documentType: 'Employment Contract',
        documentNumber: 'CNT-2024-4412',
        issueDate: '2024-03-01',
        expiryDate: '2026-09-10',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expiring Soon',
        remarks: '2-Year Expat Fixed Term Contract',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        documentType: 'Passport',
        documentNumber: 'Z8472910',
        issueDate: '2019-10-01',
        expiryDate: '2029-09-30',
        issuingAuthority: 'Directorate of Immigration',
        country: 'Pakistan',
        status: 'Valid',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        documentType: 'Work Permit',
        documentNumber: 'WP-2023-3391',
        issueDate: '2023-06-15',
        expiryDate: '2025-06-14',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expired',
        remarks: 'Expired Work Permit - Labour clearance pending',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP003',
        documentType: 'Employment Contract',
        documentNumber: 'CNT-2023-8821',
        issueDate: '2023-06-15',
        expiryDate: '2025-06-14',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expired',
        remarks: 'Expired Contract - Pending MoL Renewal',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        documentType: 'Passport',
        documentNumber: 'P8839201',
        issueDate: '2022-01-01',
        expiryDate: '2032-01-01',
        issuingAuthority: 'ROP Passports Dept',
        country: 'Oman',
        status: 'Valid',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP004',
        documentType: 'Employment Contract',
        documentNumber: 'CNT-2024-5519',
        issueDate: '2024-09-02',
        expiryDate: '2026-09-02',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Urgent',
        remarks: 'Renewing Contract - Notice period active',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        documentType: 'Passport',
        documentNumber: 'K7728193',
        issueDate: '2023-05-10',
        expiryDate: '2033-05-09',
        issuingAuthority: 'Passport Authority',
        country: 'India',
        status: 'Valid',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        documentType: 'Work Permit',
        documentNumber: 'WP-2024-7712',
        issueDate: '2024-02-01',
        expiryDate: '2026-09-25',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expiring Soon',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: crypto.randomUUID(),
        employeeId: 'EMP005',
        documentType: 'Employment Contract',
        documentNumber: 'CNT-2024-9921',
        issueDate: '2024-02-01',
        expiryDate: '2026-09-25',
        issuingAuthority: 'Ministry of Labour (MoL)',
        country: 'Oman',
        status: 'Expiring Soon',
        remarks: 'Expat Carpenter Employment Contract',
        isCurrent: true,
        createdBy: 'admin',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const initialPersonalDetails: Record<string, EmployeePersonalDetails> = {
      EMP001: {
        employeeId: 'EMP001',
        dateOfBirth: '1988-04-12',
        gender: 'Male',
        maritalStatus: 'Married',
        bloodGroup: 'O+',
        personalEmail: 'ahmed.balushi@artify.om',
        mobileNumber: '+968 9123 4567',
        whatsappNumber: '+968 9123 4567',
        residentialAddress: 'Villa 14, Way 2819, Al Khuwair, Muscat, Oman',
        permanentAddress: 'Barka, South Al Batinah Governorate, Oman',
        qualifications: [
          { degree: 'B.Sc. in Civil Engineering', institution: 'Sultan Qaboos University', yearOfPassing: '2010', grade: 'Distinction' }
        ],
        emergencyContacts: [
          { name: 'Said Al-Balushi', relationship: 'Brother', contactNumber: '+968 9234 5678', address: 'Muscat, Oman', isPrimary: true }
        ],
        skills: ['Site Supervision', 'AutoCAD', 'Structural Engineering', 'Project Safety'],
        notes: 'Senior Site Manager with over 14 years of civil construction experience in Oman.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      EMP002: {
        employeeId: 'EMP002',
        dateOfBirth: '1992-07-22',
        gender: 'Male',
        maritalStatus: 'Married',
        bloodGroup: 'B+',
        mobileNumber: '+968 9876 5432',
        residentialAddress: 'Al Ghubrah Labour Camp, Block B, Muscat',
        emergencyContacts: [
          { name: 'Fatima Hassan', relationship: 'Spouse', contactNumber: '+91 98765 43210', address: 'Kerala, India', isPrimary: true }
        ],
        skills: ['Masonry', 'Plastering', 'Heavy Equipment Operation', 'Tiling'],
        notes: 'Certified heavy plant operator and skilled master mason.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      EMP003: {
        employeeId: 'EMP003',
        dateOfBirth: '1995-11-05',
        gender: 'Male',
        maritalStatus: 'Single',
        bloodGroup: 'A+',
        mobileNumber: '+968 9345 6789',
        residentialAddress: 'Al Mabelah Camp, Building 4',
        emergencyContacts: [
          { name: 'Tariq Mehmood', relationship: 'Father', contactNumber: '+92 300 1234567', address: 'Lahore, Pakistan', isPrimary: true }
        ],
        skills: ['Industrial Electrical Wiring', 'Cable Tray Installation', 'DB Dressing'],
        notes: 'Electrician on site; visa trade amendment from General Helper currently requested.',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };

    if (!forceReset && this.inMemoryData.employees.length > 0) {
      // Ensure compliance records are backfilled if they were empty
      if (!this.inMemoryData.civilIds || this.inMemoryData.civilIds.length === 0) {
        this.inMemoryData.civilIds = initialCivilIds;
        this.inMemoryData.drivingLicences = initialDrivingLicences;
        this.inMemoryData.visas = initialVisas;
        this.inMemoryData.governmentDocuments = initialGovtDocs;
        this.inMemoryData.personalDetails = initialPersonalDetails;
      }
      await this.persist();
      return;
    }

    this.inMemoryData = {
      users: defaultCoreUsers,
      employees: initialEmployees,
      designationHistory: initialDesignationHistory,
      salaryHistory: initialSalaryHistory,
      projects: initialProjects,
      attendance: initialAttendance,
      attendanceMonths: [],
      timesheets: [],
      cifBatches: [],
      cifRecords: [],
      payrolls: initialPayrolls,
      payrollLines: initialPayrollLines,
      payrollRevisions: [],
      salaryPayments: initialPayments,
      paymentPlans: [],
      paymentPlanLines: [],
      wpsRecoveries: initialWpsRecoveries,
      wpsRecoveryTransactions: initialWpsRecoveries[0].transactions || [],
      loans: initialLoans,
      loanRecoveries: initialLoans[0].recoveries || [],
      auditLogs: initialAuditLogs,
      civilIds: initialCivilIds,
      drivingLicences: initialDrivingLicences,
      visas: initialVisas,
      governmentDocuments: initialGovtDocs,
      documents: [
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP001',
          documentType: 'Civil ID',
          category: 'civil-id',
          title: 'Ahmed Al-Balushi Civil ID Card (Front & Back)',
          documentNumber: '10928374',
          fileName: 'ahmed_civil_id_scan.pdf',
          storagePath: 'employees/EMP001/civil-id/sample_cid.pdf',
          fileSize: 1048576,
          mimeType: 'application/pdf',
          issueDate: '2022-05-15',
          expiryDate: '2027-05-14',
          status: 'Valid',
          remarks: 'Verified against ROP civil status database',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP001',
          documentType: 'Driving Licence',
          category: 'driving-licence',
          title: 'Light & Heavy Vehicle Driving Licence',
          documentNumber: 'DL-882910',
          fileName: 'ahmed_dl_oman.pdf',
          storagePath: 'employees/EMP001/driving-licence/sample_dl.pdf',
          fileSize: 845000,
          mimeType: 'application/pdf',
          issueDate: '2023-01-10',
          expiryDate: '2033-01-09',
          status: 'Valid',
          remarks: 'ROP issued licence with clean record',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP002',
          documentType: 'Visa',
          category: 'visa',
          title: 'Resident Employment Visa Stamp',
          documentNumber: 'VS-9928172',
          fileName: 'rahul_resident_visa.pdf',
          storagePath: 'employees/EMP002/visa/sample_visa.pdf',
          fileSize: 1250000,
          mimeType: 'application/pdf',
          issueDate: '2024-09-01',
          expiryDate: '2026-08-31',
          status: 'Valid',
          remarks: 'Trade: Civil Foreman. Sponsored by DGO.',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP002',
          documentType: 'Work Permit',
          category: 'govt-docs',
          title: 'Ministry of Labour Work Permit Card',
          documentNumber: 'WP-2024-9182',
          fileName: 'rahul_work_permit.pdf',
          storagePath: 'employees/EMP002/govt-docs/sample_wp.pdf',
          fileSize: 620000,
          mimeType: 'application/pdf',
          issueDate: '2024-03-01',
          expiryDate: '2026-09-10',
          status: 'Expiring Soon',
          remarks: 'Renewal paperwork to be initiated with MoL',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP001',
          documentType: 'Employment Contract',
          category: 'contract',
          title: 'MOL Registered Employment Contract',
          documentNumber: 'CTR-2022-001',
          fileName: 'ahmed_employment_contract.pdf',
          storagePath: 'employees/EMP001/contract/sample_contract.pdf',
          fileSize: 2100000,
          mimeType: 'application/pdf',
          issueDate: '2022-01-01',
          expiryDate: '2027-01-01',
          status: 'Valid',
          remarks: 'Indefinite duration contract attested by MoL',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
        {
          id: crypto.randomUUID(),
          employeeId: 'EMP001',
          documentType: 'Educational Certificate',
          category: 'education',
          title: 'B.Sc. Civil Engineering Degree Certificate',
          documentNumber: 'SQU-ENG-2010-09',
          fileName: 'squ_civil_eng_degree.pdf',
          storagePath: 'employees/EMP001/education/sample_degree.pdf',
          fileSize: 1800000,
          mimeType: 'application/pdf',
          issueDate: '2010-06-30',
          status: 'Valid',
          remarks: 'Sultan Qaboos University with distinction',
          uploadedBy: 'admin',
          uploadedAt: timestamp,
        },
      ],
      personalDetails: initialPersonalDetails,
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

    await this.persist();
    console.log('Database initialized with production baseline & realistic demo records.');
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
      saveMonthRecords: async (month: string, records: AttendanceRecord[]) => {
        // Remove existing records for this month
        this.inMemoryData.attendance = this.inMemoryData.attendance.filter(a => a.payrollMonth !== month);
        // Add new records
        this.inMemoryData.attendance.push(...records);
        await this.persist();
        return this.inMemoryData.attendance.filter(a => a.payrollMonth === month);
      }
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
      finalize: async (month: string, user: string) => {
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

        await this.persist();
        return {
          ...payroll,
          lines,
        };
      },
      revise: async (month: string, reason: string, user: string) => {
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

        await this.persist();
        return {
          payroll,
          revision,
        };
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
      addTransaction: async (tx: WPSRecoveryTransaction) => {
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
        if (wps.remainingBalance <= 0) {
          wps.status = 'Fully Recovered';
        } else {
          wps.status = 'Partially Recovered';
        }
        wps.updatedAt = new Date().toISOString();

        await this.persist();
        return tx;
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
      addRecovery: async (recovery: LoanRecoveryTransaction) => {
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

        await this.persist();
        return recovery;
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

  public get audit() {
    return {
      getAll: () => [...this.inMemoryData.auditLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      log: async (entry: Omit<AuditLog, 'id' | 'timestamp'>) => {
        const logEntry: AuditLog = {
          ...entry,
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
