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
  MonthlyPayroll,
  PayrollLine,
  PayrollRevision,
  SalaryPaymentTransaction,
  WPSRecovery,
  WPSRecoveryTransaction,
  EmployeeLoan,
  LoanRecoveryTransaction,
  LoanStatus,
  AuditLog,
} from '../src/types/index';

// 3-decimal safe monetary arithmetic helper
export function roundOMR(amount: number): number {
  if (isNaN(amount) || amount === null || amount === undefined) return 0;
  return Math.round((Number(amount) + Number.EPSILON) * 1000) / 1000;
}

export function normalizeEmployeeId(id: string): string {
  if (!id) return '';
  return id.trim().toUpperCase();
}

interface DatabaseSchema {
  users: User[];
  employees: Employee[];
  designationHistory: DesignationHistory[];
  salaryHistory: SalaryHistory[];
  projects: Project[];
  attendance: AttendanceRecord[];
  payrolls: MonthlyPayroll[];
  payrollLines: PayrollLine[];
  payrollRevisions: PayrollRevision[];
  salaryPayments: SalaryPaymentTransaction[];
  wpsRecoveries: WPSRecovery[];
  wpsRecoveryTransactions: WPSRecoveryTransaction[];
  loans: EmployeeLoan[];
  loanRecoveries: LoanRecoveryTransaction[];
  auditLogs: AuditLog[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'payroll_database.json');

class DatabaseManager {
  private inMemoryData: DatabaseSchema = {
    users: [],
    employees: [],
    designationHistory: [],
    salaryHistory: [],
    projects: [],
    attendance: [],
    payrolls: [],
    payrollLines: [],
    payrollRevisions: [],
    salaryPayments: [],
    wpsRecoveries: [],
    wpsRecoveryTransactions: [],
    loans: [],
    loanRecoveries: [],
    auditLogs: [],
  };

  private pgPool: pg.Pool | null = null;
  private isPostgresConnected: boolean = false;
  private isInitialized: boolean = false;

  constructor() {
    // On a serverless deploy (DATABASE_URL set) the filesystem is read-only/ephemeral,
    // so local JSON-file bootstrapping is skipped entirely and Postgres is loaded in init().
    if (!process.env.DATABASE_URL) {
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
    if (process.env.DATABASE_URL) {
      try {
        console.log('Checking PostgreSQL database at DATABASE_URL...');
        this.pgPool = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
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
      payrolls: parsed.payrolls || [],
      payrollLines: parsed.payrollLines || [],
      payrollRevisions: parsed.payrollRevisions || [],
      salaryPayments: parsed.salaryPayments || [],
      wpsRecoveries: parsed.wpsRecoveries || [],
      wpsRecoveryTransactions: parsed.wpsRecoveryTransactions || [],
      loans: parsed.loans || [],
      loanRecoveries: parsed.loanRecoveries || [],
      auditLogs: parsed.auditLogs || [],
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
      const res = await this.pgPool.query('SELECT data FROM app_state WHERE id = $1', ['main']);
      if (res.rows.length > 0 && res.rows[0].data) {
        this.applyParsedData(res.rows[0].data);
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
  private async persist(): Promise<void> {
    if (this.isPostgresConnected && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO app_state (id, data, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
          ['main', JSON.stringify(this.inMemoryData)]
        );
        return;
      } catch (e) {
        console.error('Error persisting database to PostgreSQL:', (e as Error).message);
        return;
      }
    }
    this.saveToDisk();
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

    if (!forceReset && this.inMemoryData.employees.length > 0) {
      await this.persist();
      return;
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

    this.inMemoryData = {
      users: defaultCoreUsers,
      employees: initialEmployees,
      designationHistory: initialDesignationHistory,
      salaryHistory: initialSalaryHistory,
      projects: initialProjects,
      attendance: initialAttendance,
      payrolls: initialPayrolls,
      payrollLines: initialPayrollLines,
      payrollRevisions: [],
      salaryPayments: initialPayments,
      wpsRecoveries: initialWpsRecoveries,
      wpsRecoveryTransactions: initialWpsRecoveries[0].transactions || [],
      loans: initialLoans,
      loanRecoveries: initialLoans[0].recoveries || [],
      auditLogs: initialAuditLogs,
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
      create: async (payment: SalaryPaymentTransaction) => {
        payment.payAmount = roundOMR(payment.payAmount);
        this.inMemoryData.salaryPayments.push(payment);
        await this.persist();
        return payment;
      },
      update: async (id: string, updates: Partial<SalaryPaymentTransaction>) => {
        const index = this.inMemoryData.salaryPayments.findIndex(p => p.id === id);
        if (index === -1) return null;
        if (updates.payAmount !== undefined) {
          updates.payAmount = roundOMR(updates.payAmount);
        }
        this.inMemoryData.salaryPayments[index] = {
          ...this.inMemoryData.salaryPayments[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        await this.persist();
        return this.inMemoryData.salaryPayments[index];
      },
      reverse: async (id: string, reason: string, user: string) => {
        const index = this.inMemoryData.salaryPayments.findIndex(p => p.id === id);
        if (index === -1) return null;
        const current = this.inMemoryData.salaryPayments[index];
        if (current.isReversed) {
          throw new Error('This payment transaction has already been reversed.');
        }

        current.isReversed = true;
        current.reversedAt = new Date().toISOString();
        current.reversedBy = user;
        current.reversalReason = reason;
        current.updatedAt = new Date().toISOString();

        await this.persist();
        return current;
      }
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
}

export const db = new DatabaseManager();
