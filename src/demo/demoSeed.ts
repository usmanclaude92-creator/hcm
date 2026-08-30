// Fully fictional demo dataset. Two companies, 24 employees, 5 projects, and 4 months of
// attendance/payroll history. Payroll numbers are always computed via demoCalculations.ts
// (never hand-authored), so seeded and later live-recalculated figures never disagree.
// No fabricated concepts: no "Leave" data (this app has no Leave module), no photos, no
// geofence/mobility (none exist anywhere in the real product either).
import type {
  Employee, Project, AttendanceRecord, AttendanceMonth, MonthlyPayroll, PayrollLine,
  SalaryPaymentTransaction, EmployeeLoan, LoanRepayment, WPSRecoveryRecord, WPSRecoveryTransaction,
  PaymentPlan, EmployeeCompany, SalaryPaidBy, User,
} from '../types/index';
import { calculateEmployeeLine, roundOMR } from './demoCalculations';

export const ARTIFY_SOLUTIONS = 'Artify Solutions LLC' as unknown as EmployeeCompany;
export const ARTIFY_CONSTRUCTION = 'Artify Construction LLC' as unknown as EmployeeCompany;
const PAID_BY_SOLUTIONS = 'Artify Solutions LLC' as unknown as SalaryPaidBy;
const PAID_BY_CONSTRUCTION = 'Artify Construction LLC' as unknown as SalaryPaidBy;

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

export const MONTH_OLD = monthsAgo(3);
export const MONTH_MID = monthsAgo(2);
export const MONTH_RECENT = monthsAgo(1);
export const MONTH_CURRENT = monthsAgo(0);

export interface DemoState {
  employees: Employee[];
  projects: Project[];
  attendanceRecords: AttendanceRecord[];
  attendanceMonths: AttendanceMonth[];
  payrolls: MonthlyPayroll[]; // each carries its own .lines; only the 3 finalized months exist here
  salaryPayments: SalaryPaymentTransaction[];
  loans: EmployeeLoan[];
  wpsRecords: WPSRecoveryRecord[];
  paymentPlans: PaymentPlan[];
}

const uid = () => crypto.randomUUID();
const NOW = new Date().toISOString();

// ---- Projects ----
function buildProjects(): Project[] {
  return [
    {
      id: uid(), projectCode: 'PRJ-CON-1', projectName: 'Muscat Bay Towers', status: 'Active',
      startDate: '2025-01-01', endDate: null, remarks: 'Flagship residential tower development',
      createdAt: NOW, updatedAt: NOW,
    },
    {
      id: uid(), projectCode: 'PRJ-CON-2', projectName: 'Sohar Warehouse Fitout', status: 'Active',
      startDate: '2025-06-01', endDate: null, remarks: 'Logistics warehouse interior fitout',
      createdAt: NOW, updatedAt: NOW,
    },
    {
      id: uid(), projectCode: 'PRJ-CON-3', projectName: 'Salalah Road Upgrade', status: 'Inactive',
      startDate: '2024-01-01', endDate: '2025-03-01', remarks: 'Completed road resurfacing contract',
      createdAt: NOW, updatedAt: NOW,
    },
    {
      id: uid(), projectCode: 'PRJ-SOL-1', projectName: 'Corporate HQ Fitout', status: 'Active',
      startDate: '2025-02-01', endDate: null, remarks: 'Head office interior and IT fitout',
      allowedCompanies: [ARTIFY_SOLUTIONS], createdAt: NOW, updatedAt: NOW,
    },
    {
      id: uid(), projectCode: 'PRJ-SOL-2', projectName: 'Data Center Setup', status: 'Active',
      startDate: '2025-04-01', endDate: null, remarks: 'Regional data center build-out',
      createdAt: NOW, updatedAt: NOW,
    },
  ];
}

// ---- Employees ----
const OMANI_NAMES = ['Ahmed Al-Balushi', 'Said Al-Harthy', 'Khalid Al-Rawahi', 'Mohammed Al-Farsi', 'Salim Al-Saadi', 'Nasser Al-Kindi'];
const EXPAT_NAMES = ['Rajesh Kumar', 'Suresh Sharma', 'Vikram Singh', 'Arjun Rao', 'Muhammad Faisal', 'Carlos Reyes', 'John Fernandez', 'Sanjay Patel', 'Ravi Menon', 'Ali Hassan'];
const CONSTRUCTION_WORKER_DESIGNATIONS = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Welder', 'Steel Fixer', 'Painter', 'Scaffolder'];
const CONSTRUCTION_STAFF_DESIGNATIONS = ['Site Manager', 'Safety Officer', 'Site Engineer', 'Foreman'];
const SOLUTIONS_WORKER_DESIGNATIONS = ['Field Technician', 'Support Technician', 'Cable Installer', 'Rigger', 'Delivery Assistant', 'Warehouse Assistant', 'Junior Technician', 'Maintenance Assistant'];
const SOLUTIONS_STAFF_DESIGNATIONS = ['IT Manager', 'Systems Engineer', 'HR Officer', 'Accountant'];

function buildEmployees(): Employee[] {
  const employees: Employee[] = [];
  let nameIdx = 0;
  const nextName = (preferOmani: boolean) => {
    const name = preferOmani ? OMANI_NAMES[nameIdx % OMANI_NAMES.length] : EXPAT_NAMES[nameIdx % EXPAT_NAMES.length];
    nameIdx++;
    return name;
  };

  function buildCompanyEmployees(
    prefix: string,
    company: EmployeeCompany,
    payBy: SalaryPaidBy,
    workerDesigs: string[],
    staffDesigs: string[],
  ) {
    // 8 Workers (Per Hour), 4 Staff (Fixed Monthly); ~1:3 Omani:Expat; a mix of WPS Yes/No.
    for (let i = 0; i < 8; i++) {
      const isOmani = i % 4 === 0;
      const id = `${prefix}-W${String(i + 1).padStart(2, '0')}`;
      const isWps = i < 3; // 3 of 8 workers per company are WPS-registered
      const rate = 1.8 + (i % 3) * 0.3;
      employees.push({
        id: uid(),
        employeeId: id,
        employeeName: nextName(isOmani),
        employeeType: 'Worker',
        nationalityType: isOmani ? 'Omani' : 'Expat',
        wageType: 'Per Hour',
        dateOfJoining: '2024-03-01',
        dateOfLeaving: i === 7 ? '2026-06-30' : null, // last worker per company is inactive/terminated
        designation: workerDesigs[i % workerDesigs.length],
        employeeCompany: company,
        salaryPaidBy: payBy,
        monthlySalaryOrRate: roundOMR(rate),
        wpsEmployee: isWps ? 'Yes' : 'No',
        wpsSalary: isWps ? roundOMR(rate * 190) : 0,
        actualSalary: roundOMR(rate * 176),
        recoverFrom: isWps ? String(company) : '',
        isActive: i !== 7,
        createdAt: NOW, updatedAt: NOW,
      });
    }
    // 4 Staff
    for (let i = 0; i < 4; i++) {
      const isOmani = i % 2 === 0;
      const id = `${prefix}-S${String(i + 1).padStart(2, '0')}`;
      const isWps = i < 2; // 2 of 4 staff per company are WPS-registered
      const salary = 550 + i * 120;
      employees.push({
        id: uid(),
        employeeId: id,
        employeeName: nextName(isOmani),
        employeeType: 'Staff',
        nationalityType: isOmani ? 'Omani' : 'Expat',
        wageType: 'Fixed Monthly',
        dateOfJoining: '2023-09-01',
        dateOfLeaving: null,
        designation: staffDesigs[i % staffDesigs.length],
        employeeCompany: company,
        salaryPaidBy: payBy,
        monthlySalaryOrRate: roundOMR(salary),
        wpsEmployee: isWps ? 'Yes' : 'No',
        // Deliberately set above the eventual computed net for the first staff member of
        // each company, guaranteeing a real non-zero WPS-recoverable balance to demo.
        wpsSalary: isWps ? roundOMR(salary * (i === 0 ? 1.35 : 1.0)) : 0,
        actualSalary: roundOMR(salary),
        recoverFrom: isWps ? String(company) : '',
        isActive: true,
        createdAt: NOW, updatedAt: NOW,
      });
    }
  }

  buildCompanyEmployees('SOL', ARTIFY_SOLUTIONS, PAID_BY_SOLUTIONS, SOLUTIONS_WORKER_DESIGNATIONS, SOLUTIONS_STAFF_DESIGNATIONS);
  buildCompanyEmployees('CON', ARTIFY_CONSTRUCTION, PAID_BY_CONSTRUCTION, CONSTRUCTION_WORKER_DESIGNATIONS, CONSTRUCTION_STAFF_DESIGNATIONS);

  return employees;
}

// ---- Attendance (identical shape across all 4 months for simplicity) ----
function buildAttendanceForMonth(month: string, employees: Employee[], projects: Project[]): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const conProjects = projects.filter(p => p.projectCode.startsWith('PRJ-CON') && p.status === 'Active');
  const solProjects = projects.filter(p => p.projectCode.startsWith('PRJ-SOL') && p.status === 'Active');

  const activeEmployees = employees.filter(e => e.isActive);
  activeEmployees.forEach((emp, idx) => {
    const isConstruction = emp.employeeCompany === ARTIFY_CONSTRUCTION;
    const pool = isConstruction ? conProjects : solProjects;
    if (pool.length === 0) return;
    const primaryProject = pool[idx % pool.length];

    const push = (proj: Project, days: number, hours: number, ot: number) => {
      records.push({
        id: uid(),
        employeeId: emp.employeeId,
        employeeInternalId: emp.id,
        payrollMonth: month,
        projectId: proj.id,
        projectCode: proj.projectCode,
        projectName: proj.projectName,
        daysWorked: days,
        hoursWorked: hours,
        overtimeHours: ot,
        bonus: 0,
        deduction: 0,
        company: emp.employeeCompany,
        payrollType: 'Monthly',
        payBy: emp.salaryPaidBy,
        createdAt: NOW, updatedAt: NOW,
      });
    };

    // SOL-W01 is the explicit multi-project employee: split across both Solutions projects.
    if (emp.employeeId === 'SOL-W01' && solProjects.length >= 2) {
      push(solProjects[0], 0, 100, 4);
      push(solProjects[1], 0, 76, 0);
      return;
    }

    if (emp.employeeType === 'Staff') {
      push(primaryProject, 26, 0, 0);
    } else {
      push(primaryProject, 0, 176, idx % 5 === 0 ? 6 : 0);
    }
  });

  return records;
}

// ---- Loans ----
function buildLoans(employees: Employee[]): EmployeeLoan[] {
  const activeWorkers = employees.filter(e => e.employeeCompany === ARTIFY_CONSTRUCTION && e.employeeType === 'Worker' && e.isActive);
  const emp1 = activeWorkers[0];
  const emp2 = activeWorkers[1];
  const emp3 = activeWorkers[2];

  const loans: EmployeeLoan[] = [];
  if (emp1) {
    const repayment: LoanRepayment = {
      id: uid(), loanId: '', employeeId: emp1.employeeId, recoverySource: 'Direct Payment',
      recoveryAmount: 40, recoveryDate: MONTH_MID + '-15', remarks: 'Partial cash repayment',
      createdByName: 'Demo Payroll Manager', createdAt: NOW,
    };
    const loanId = uid();
    repayment.loanId = loanId;
    loans.push({
      id: loanId, employeeId: emp1.employeeId, employeeName: emp1.employeeName,
      loanAmount: 200, loanDate: MONTH_OLD + '-05', monthlyRecoveryAmount: 20,
      totalRecovered: 40, outstandingBalance: 160, status: 'Active',
      remarks: 'Emergency vehicle repair', createdAt: NOW, updatedAt: NOW, recoveries: [repayment],
    });
  }
  if (emp2) {
    loans.push({
      id: uid(), employeeId: emp2.employeeId, employeeName: emp2.employeeName,
      loanAmount: 150, loanDate: MONTH_RECENT + '-01', monthlyRecoveryAmount: 15,
      totalRecovered: 0, outstandingBalance: 150, status: 'Active',
      remarks: 'Family travel advance', createdAt: NOW, updatedAt: NOW, recoveries: [],
    });
  }
  if (emp3) {
    loans.push({
      id: uid(), employeeId: emp3.employeeId, employeeName: emp3.employeeName,
      loanAmount: 100, loanDate: monthsAgo(6) + '-01', monthlyRecoveryAmount: 25,
      totalRecovered: 100, outstandingBalance: 0, status: 'Completed',
      remarks: 'Tool purchase advance (fully repaid)', createdAt: NOW, updatedAt: NOW, recoveries: [],
    });
  }
  return loans;
}

// ---- Payroll for one finalized month ----
function buildPayrollForMonth(
  month: string,
  employees: Employee[],
  attendanceRecords: AttendanceRecord[],
  activeLoans: EmployeeLoan[],
): MonthlyPayroll {
  const payrollId = uid();
  const activeEmployees = employees.filter(e => e.isActive);
  const monthAttendance = attendanceRecords.filter(a => a.payrollMonth === month);
  const lines: PayrollLine[] = activeEmployees.map(emp =>
    calculateEmployeeLine(emp, monthAttendance as any, payrollId, undefined, activeLoans)
  );

  const totalGross = roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0));
  const totalAdditions = roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0));
  const totalDeductions = roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0));
  const totalNet = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
  const totalWps = roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0));
  const totalRecoverable = roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0));

  return {
    id: payrollId,
    payrollMonth: month,
    status: 'Finalized',
    totalEmployees: lines.length,
    totalGrossSalary: totalGross,
    totalAdditions,
    totalDeductions,
    totalNetSalary: totalNet,
    totalWpsSalary: totalWps,
    totalRecoverableSalary: totalRecoverable,
    finalizedAt: NOW,
    finalizedBy: 'Demo Payroll Manager',
    revisionNumber: 0,
    createdAt: NOW,
    updatedAt: NOW,
    lines,
  };
}

// ---- Payments, generated to hit per-month completeness targets ----
function buildPaymentsForMonth(payroll: MonthlyPayroll, targetRatio: 'full' | 'mixed' | 'none'): SalaryPaymentTransaction[] {
  if (targetRatio === 'none' || !payroll.lines) return [];
  const txs: SalaryPaymentTransaction[] = [];
  payroll.lines.forEach((line, idx) => {
    let amount = 0;
    if (targetRatio === 'full') {
      amount = line.netSalary;
    } else if (targetRatio === 'mixed') {
      if (idx % 4 === 0) amount = 0; // untouched
      else if (idx % 4 === 1) amount = roundOMR(line.netSalary * 0.5); // partial
      else amount = line.netSalary; // full
    }
    if (amount <= 0) return;
    txs.push({
      id: uid(),
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      payrollMonth: payroll.payrollMonth,
      payrollLineId: line.id,
      paymentDate: payroll.payrollMonth + '-28',
      payAmount: amount,
      payTo: line.employeeName,
      paymentMode: 'Bank Transfer',
      referenceNumber: `DEMO-${payroll.payrollMonth}-${idx}`,
      receiptStatus: 'Attachment Pending',
      remarks: '',
      createdBy: 'Demo Payroll User',
      isReversed: false,
      createdAt: NOW, updatedAt: NOW,
    });
  });
  return txs;
}

// ---- WPS Recovery, generated for every line with a real recoverable balance ----
function buildWpsForMonth(payroll: MonthlyPayroll): { records: WPSRecoveryRecord[]; transactions: WPSRecoveryTransaction[] } {
  const records: WPSRecoveryRecord[] = [];
  const transactions: WPSRecoveryTransaction[] = [];
  (payroll.lines || []).forEach((line, idx) => {
    if (line.wpsEmployee !== 'Yes' || line.recoverableSalary <= 0) return;
    const recId = uid();
    const partiallyRecover = idx % 2 === 0;
    const recoveredAmount = partiallyRecover ? roundOMR(line.recoverableSalary * 0.4) : 0;
    const remaining = roundOMR(line.recoverableSalary - recoveredAmount);
    records.push({
      id: recId,
      payrollMonth: payroll.payrollMonth,
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      employeeCompany: line.employeeCompany,
      salaryPaidBy: line.salaryPaidBy,
      wpsSalary: line.wpsSalary,
      netSalary: line.netSalary,
      totalRecoverable: line.recoverableSalary,
      totalRecovered: recoveredAmount,
      remainingBalance: remaining,
      recoveredFrom: line.recoverFrom,
      status: remaining <= 0 ? 'Fully Recovered' : recoveredAmount > 0 ? 'Partially Recovered' : 'Outstanding',
      createdAt: NOW, updatedAt: NOW,
      transactions: [],
    });
    if (recoveredAmount > 0) {
      transactions.push({
        id: uid(),
        wpsRecoveryId: recId,
        employeeId: line.employeeId,
        payrollMonth: payroll.payrollMonth,
        recoveredFrom: line.recoverFrom,
        recoveryAmount: recoveredAmount,
        recoveryDate: payroll.payrollMonth + '-20',
        remarks: '',
        createdBy: 'Demo Payroll Manager',
        createdAt: NOW,
      });
    }
  });
  return { records, transactions };
}

export function buildSeedData(): DemoState {
  const employees = buildEmployees();
  const projects = buildProjects();

  const attendanceRecords = [
    ...buildAttendanceForMonth(MONTH_OLD, employees, projects),
    ...buildAttendanceForMonth(MONTH_MID, employees, projects),
    ...buildAttendanceForMonth(MONTH_RECENT, employees, projects),
    ...buildAttendanceForMonth(MONTH_CURRENT, employees, projects),
  ];

  const attendanceMonths: AttendanceMonth[] = [
    ...[MONTH_OLD, MONTH_MID, MONTH_RECENT].map((m): AttendanceMonth => ({
      id: uid(), payrollMonth: m, status: 'Finalized',
      submittedBy: 'Demo Payroll User', submittedAt: NOW, approvedBy: 'Demo Payroll Manager', approvedAt: NOW,
      finalizedBy: 'Demo Payroll Manager', finalizedAt: NOW,
      createdAt: NOW, updatedAt: NOW,
    })),
    { id: uid(), payrollMonth: MONTH_CURRENT, status: 'Draft', createdAt: NOW, updatedAt: NOW },
  ];

  const loans = buildLoans(employees);
  const activeLoans = loans.filter(l => l.status === 'Active');

  const payrollOld = buildPayrollForMonth(MONTH_OLD, employees, attendanceRecords, activeLoans);
  const payrollMid = buildPayrollForMonth(MONTH_MID, employees, attendanceRecords, activeLoans);
  const payrollRecent = buildPayrollForMonth(MONTH_RECENT, employees, attendanceRecords, activeLoans);

  const salaryPayments = [
    ...buildPaymentsForMonth(payrollOld, 'full'),
    ...buildPaymentsForMonth(payrollMid, 'mixed'),
    ...buildPaymentsForMonth(payrollRecent, 'none'),
  ];

  const wpsOld = buildWpsForMonth(payrollOld);
  const wpsMid = buildWpsForMonth(payrollMid);
  const wpsRecent = buildWpsForMonth(payrollRecent);
  const wpsRecords = [...wpsOld.records, ...wpsMid.records, ...wpsRecent.records].map(r => ({
    ...r,
    transactions: [...wpsOld.transactions, ...wpsMid.transactions, ...wpsRecent.transactions].filter(t => t.wpsRecoveryId === r.id),
  }));

  return {
    employees,
    projects,
    attendanceRecords,
    attendanceMonths,
    payrolls: [payrollOld, payrollMid, payrollRecent],
    salaryPayments,
    loans,
    wpsRecords,
    paymentPlans: [],
  };
}

export const DEMO_USERS: Record<string, User> = {
  Administrator: { id: 'demo-admin', username: 'demo-admin', name: 'Demo System Administrator', email: 'demo-admin@artify-demo.local', role: 'Administrator', isActive: true, createdAt: NOW, updatedAt: NOW },
  'Payroll Manager': { id: 'demo-manager', username: 'demo-manager', name: 'Demo Payroll Manager', email: 'demo-manager@artify-demo.local', role: 'Payroll Manager', isActive: true, createdAt: NOW, updatedAt: NOW },
  'Payroll User': { id: 'demo-user', username: 'demo-user', name: 'Demo Payroll User', email: 'demo-user@artify-demo.local', role: 'Payroll User', isActive: true, createdAt: NOW, updatedAt: NOW },
  Viewer: { id: 'demo-viewer', username: 'demo-viewer', name: 'Demo Auditor', email: 'demo-viewer@artify-demo.local', role: 'Viewer', isActive: true, createdAt: NOW, updatedAt: NOW },
};
