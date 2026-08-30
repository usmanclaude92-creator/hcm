// The mutable in-memory "database" for a demo session, plus session lifecycle. Lives only
// as a module-level variable -- never serialized to any Web Storage, so a hard refresh
// naturally clears it (demo data must not survive a refresh pretending to be persistent).
import type {
  Employee, Project, AttendanceRecord, AttendanceMonth, MonthlyPayroll, PayrollLine,
  SalaryPaymentTransaction, EmployeeLoan, WPSRecoveryRecord, PaymentPlan, UserRole, User,
} from '../types/index';
import { buildSeedData, DEMO_USERS } from './demoSeed';

export class DemoStore {
  employees: Employee[] = [];
  projects: Project[] = [];
  attendanceRecords: AttendanceRecord[] = [];
  attendanceMonths: AttendanceMonth[] = [];
  payrolls: MonthlyPayroll[] = [];
  salaryPayments: SalaryPaymentTransaction[] = [];
  loans: EmployeeLoan[] = [];
  wpsRecords: WPSRecoveryRecord[] = [];
  paymentPlans: PaymentPlan[] = [];

  constructor() {
    const seed = buildSeedData();
    Object.assign(this, seed);
  }

  getPayroll(month: string): MonthlyPayroll | undefined {
    return this.payrolls.find(p => p.payrollMonth === month);
  }

  getAttendanceMonth(month: string): AttendanceMonth | undefined {
    return this.attendanceMonths.find(a => a.payrollMonth === month);
  }

  getOrCreateAttendanceMonth(month: string): AttendanceMonth {
    let m = this.getAttendanceMonth(month);
    if (!m) {
      m = { id: crypto.randomUUID(), payrollMonth: month, status: 'Draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      this.attendanceMonths.push(m);
    }
    return m;
  }
}

const DEMO_SESSION_KEY = 'payroll_demo_session';

let activeStore: DemoStore | null = null;

export function isDemoSessionActive(): boolean {
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

// True only once a demo session has actually been started IN THIS PAGE LOAD. A hard
// refresh wipes the module-level `activeStore` but not the sessionStorage marker, so this
// is how callers distinguish "genuinely mid-demo" from "marker survived a reload" -- the
// latter should cleanly drop back to LoginView, never attempt a demo API call that throws.
export function hasLiveDemoStore(): boolean {
  return activeStore !== null;
}

export function getDemoStore(): DemoStore {
  if (!activeStore) {
    // Marker present but store missing (e.g. a reload mid-session, or a fresh tab in
    // an inconsistent state) -- treat as an expired demo rather than silently reseeding,
    // so a stray reload can't quietly hand a demo user a brand-new dataset mid-task.
    throw new Error('Demo session has expired. Please return to the login screen and start a new demo.');
  }
  return activeStore;
}

export function startDemoSession(role: UserRole): User {
  activeStore = new DemoStore();
  const marker = { active: true, role, startedAt: new Date().toISOString() };
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(marker));
  } catch {
    // sessionStorage unavailable (e.g. privacy mode) -- the in-memory activeStore still
    // works for this page lifetime, it just won't survive a refresh, which is acceptable.
  }
  return DEMO_USERS[role];
}

export function getDemoUser(): User | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const marker = JSON.parse(raw) as { role: UserRole };
    return DEMO_USERS[marker.role] || null;
  } catch {
    return null;
  }
}

export function endDemoSession(): void {
  activeStore = null;
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // ignore
  }
}
