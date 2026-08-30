// Pure calculation functions ported verbatim from server/routes/payroll.ts's
// calculateEmployeeLine() and its line-override recompute block. Kept as a from-scratch
// client-side port (not an import) because server/ code pulls in Node-only deps (pg,
// bcryptjs, fs) that cannot ship in the browser bundle -- but the math itself has zero
// such dependency, so both demoData/payroll seeding and demoApi's live handlers call into
// this single module, guaranteeing seeded and live-recalculated numbers never drift apart.
import type { Employee, PayrollLine, PaymentMethod, EmployeeLoan } from '../types/index';

export function roundOMR(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

export function normalizeEmployeeId(id: string): string {
  return String(id || '').trim().toUpperCase();
}

interface DemoAttendanceRow {
  employeeId: string;
  projectCode: string;
  daysWorked: number;
  hoursWorked: number;
}

export function calculateEmployeeLine(
  emp: Employee,
  attendanceRecords: DemoAttendanceRow[],
  payrollId: string,
  existingLine?: Partial<PayrollLine>,
  activeLoans: EmployeeLoan[] = []
): PayrollLine {
  const empId = normalizeEmployeeId(emp.employeeId);
  const empAttendance = attendanceRecords.filter(a => normalizeEmployeeId(a.employeeId) === empId);

  const projectsSummary = empAttendance.length > 0
    ? empAttendance.map(a => `${a.projectCode} (${emp.employeeType === 'Staff' ? a.daysWorked + 'd' : a.hoursWorked + 'h'})`).join(', ')
    : 'No Attendance';

  const daysWorked = empAttendance.reduce((sum, a) => sum + (Number(a.daysWorked) || 0), 0);
  const hoursWorked = empAttendance.reduce((sum, a) => sum + (Number(a.hoursWorked) || 0), 0);

  const basicSalaryOrRate = existingLine && existingLine.basicSalaryOrRate !== undefined
    ? roundOMR(Number(existingLine.basicSalaryOrRate))
    : roundOMR(Number(emp.monthlySalaryOrRate));

  let grossSalary = 0;
  if (emp.employeeType === 'Worker') {
    grossSalary = roundOMR(hoursWorked * basicSalaryOrRate);
  } else {
    grossSalary = roundOMR((basicSalaryOrRate / 30) * Math.min(daysWorked, 30));
  }

  const houseAllowance = existingLine ? roundOMR(Number(existingLine.houseAllowance) || 0) : 0;
  const transportAllowance = existingLine ? roundOMR(Number(existingLine.transportAllowance) || 0) : 0;
  const bonus = existingLine ? roundOMR(Number(existingLine.bonus) || 0) : 0;
  const otherAllowance = existingLine ? roundOMR(Number(existingLine.otherAllowance) || 0) : 0;
  const totalAdditions = roundOMR(houseAllowance + transportAllowance + bonus + otherAllowance);

  let loanRecovery = existingLine ? roundOMR(Number(existingLine.loanRecovery) || 0) : 0;
  if (!existingLine) {
    const activeLoan = activeLoans.find(l => normalizeEmployeeId(l.employeeId) === empId && l.status === 'Active');
    if (activeLoan && (activeLoan.outstandingBalance || 0) > 0) {
      loanRecovery = roundOMR(Math.min(activeLoan.monthlyRecoveryAmount || 0, activeLoan.outstandingBalance || 0));
    }
  }

  const otherDeductions = existingLine ? roundOMR(Number(existingLine.otherDeductions) || 0) : 0;
  const totalDeductions = roundOMR(loanRecovery + otherDeductions);

  const netSalary = roundOMR(grossSalary + totalAdditions - totalDeductions);

  const wpsEmployee = emp.wpsEmployee === 'Yes' ? 'Yes' : 'No';
  const paymentMethod: PaymentMethod = existingLine?.paymentMethod || (wpsEmployee === 'Yes' ? 'WPS' : 'Non-WPS');
  const wpsSalary = roundOMR(Number(emp.wpsSalary) || 0);

  let recoverableSalary = 0;
  if (wpsEmployee === 'Yes' && wpsSalary > 0) {
    recoverableSalary = roundOMR(Math.max(wpsSalary - netSalary, 0));
  }

  const recoverFrom = emp.recoverFrom || (wpsEmployee === 'Yes' ? emp.employeeCompany : '');
  const timestamp = new Date().toISOString();

  return {
    id: existingLine?.id || crypto.randomUUID(),
    payrollId,
    employeeId: emp.employeeId,
    employeeName: emp.employeeName,
    employeeType: emp.employeeType,
    nationalityType: emp.nationalityType,
    wageType: emp.wageType,
    designation: emp.designation,
    employeeCompany: emp.employeeCompany,
    salaryPaidBy: emp.salaryPaidBy,
    projectsSummary,
    daysWorked,
    hoursWorked,
    basicSalaryOrRate,
    grossSalary,
    houseAllowance,
    transportAllowance,
    bonus,
    otherAllowance,
    totalAdditions,
    loanRecovery,
    otherDeductions,
    totalDeductions,
    netSalary,
    paymentMethod,
    wpsSalary,
    recoverableSalary,
    recoverFrom,
    wpsEmployee,
    createdAt: existingLine?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

// Ports the recompute block from PUT /api/payroll/:month/lines/:lineId.
export function recalculateLineOverride(
  currentLine: PayrollLine,
  overrides: Partial<Pick<PayrollLine,
    'basicSalaryOrRate' | 'houseAllowance' | 'transportAllowance' | 'bonus' | 'otherAllowance' |
    'loanRecovery' | 'otherDeductions' | 'paymentMethod' | 'wpsSalary' | 'recoverFrom'>>
): PayrollLine {
  const newRate = overrides.basicSalaryOrRate !== undefined ? roundOMR(Number(overrides.basicSalaryOrRate)) : currentLine.basicSalaryOrRate;
  const newHouse = overrides.houseAllowance !== undefined ? roundOMR(Number(overrides.houseAllowance)) : currentLine.houseAllowance;
  const newTransport = overrides.transportAllowance !== undefined ? roundOMR(Number(overrides.transportAllowance)) : currentLine.transportAllowance;
  const newBonus = overrides.bonus !== undefined ? roundOMR(Number(overrides.bonus)) : currentLine.bonus;
  const newOtherAdd = overrides.otherAllowance !== undefined ? roundOMR(Number(overrides.otherAllowance)) : currentLine.otherAllowance;
  const newLoanRec = overrides.loanRecovery !== undefined ? roundOMR(Number(overrides.loanRecovery)) : currentLine.loanRecovery;
  const newOtherDed = overrides.otherDeductions !== undefined ? roundOMR(Number(overrides.otherDeductions)) : currentLine.otherDeductions;
  const newWpsSalary = overrides.wpsSalary !== undefined ? roundOMR(Number(overrides.wpsSalary)) : currentLine.wpsSalary;

  let newGross = 0;
  if (currentLine.employeeType === 'Worker') {
    newGross = roundOMR(currentLine.hoursWorked * newRate);
  } else {
    newGross = roundOMR((newRate / 30) * Math.min(currentLine.daysWorked, 30));
  }

  const newTotalAdd = roundOMR(newHouse + newTransport + newBonus + newOtherAdd);
  const newTotalDed = roundOMR(newLoanRec + newOtherDed);
  const newNet = roundOMR(newGross + newTotalAdd - newTotalDed);

  let newRecoverable = 0;
  if (currentLine.wpsEmployee === 'Yes' && newWpsSalary > 0) {
    newRecoverable = roundOMR(Math.max(newWpsSalary - newNet, 0));
  }

  return {
    ...currentLine,
    basicSalaryOrRate: newRate,
    grossSalary: newGross,
    houseAllowance: newHouse,
    transportAllowance: newTransport,
    bonus: newBonus,
    otherAllowance: newOtherAdd,
    totalAdditions: newTotalAdd,
    loanRecovery: newLoanRec,
    otherDeductions: newOtherDed,
    totalDeductions: newTotalDed,
    netSalary: newNet,
    paymentMethod: overrides.paymentMethod || currentLine.paymentMethod,
    wpsSalary: newWpsSalary,
    recoverableSalary: newRecoverable,
    recoverFrom: overrides.recoverFrom !== undefined ? overrides.recoverFrom : currentLine.recoverFrom,
    updatedAt: new Date().toISOString(),
  };
}
