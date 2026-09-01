// Demo request dispatcher. Mirrors the shape of the real server/routes/*.ts handlers for
// the in-scope modules, operating entirely on the in-memory DemoStore. Thrown Errors here
// match the {error: '...'} message shape the real backend returns, so every existing view's
// `catch (err) { setError(err.message) }` block behaves identically to production.
import type {
  Employee, Project, PayrollLine, MonthlyPayroll, SalaryPaymentTransaction,
  EmployeeLoan, LoanRepayment, WPSRecoveryTransaction, UserRole, AttendanceRecord,
} from '../types/index';
import type { Permission } from '../permissions';
import { roleHasPermission } from '../permissions';
import { getDemoStore, getDemoUser, hasLiveDemoStore } from './demoStore';
import { calculateEmployeeLine, recalculateLineOverride, roundOMR, normalizeEmployeeId } from './demoCalculations';

const WRITE_ROLES: UserRole[] = ['Administrator', 'Payroll Manager', 'Payroll User'];

function currentRole(): UserRole {
  const user = getDemoUser();
  if (!user) throw new Error('Demo session has expired. Please return to the login screen.');
  return user.role;
}
function assertWrite(role: UserRole) {
  if (!WRITE_ROLES.includes(role)) throw new Error('You do not have permission to perform this action.');
}
function assertManager(role: UserRole) {
  if (role !== 'Administrator' && role !== 'Payroll Manager') {
    throw new Error('Only Administrators and Payroll Managers can perform this action.');
  }
}
function assertPermission(role: UserRole, permission: Permission) {
  if (!roleHasPermission(role, permission)) throw new Error('You do not have permission to perform this action.');
}

// ---- Tiny path matcher, mirrors Express's :param syntax ----
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pSegs = pattern.split('/').filter(Boolean);
  const aSegs = path.split('/').filter(Boolean);
  if (pSegs.length !== aSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i].startsWith(':')) params[pSegs[i].slice(1)] = decodeURIComponent(aSegs[i]);
    else if (pSegs[i] !== aSegs[i]) return null;
  }
  return params;
}

type Handler = (ctx: { params: Record<string, string>; query: URLSearchParams; body: any; role: UserRole }) => any;
const ROUTES: { method: string; pattern: string; handler: Handler }[] = [];
function route(method: string, pattern: string, handler: Handler) {
  ROUTES.push({ method, pattern, handler });
}

// ==================== Dashboard ====================
// Mirrors server/routes/dashboard.ts's period-filtering logic exactly (kept in lockstep
// deliberately -- apiRequest() routes here instead of the real server whenever a demo
// session is active, so a period filter left unmirrored here would silently be a no-op).
function monthRangeDemo(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}
function monthBeforeDemo(month: string, count: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonthLabelDemo(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

route('GET', '/api/dashboard', ({ query }) => {
  const store = getDemoStore();
  const periodMode = (query.get('periodMode') || 'month') as 'month' | 'range' | 'all';
  const monthParam = query.get('month') || '';
  const fromMonth = query.get('fromMonth') || '';
  const toMonth = query.get('toMonth') || '';

  const employees = store.employees || [];
  const activeEmployees = employees.filter(e => e && e.isActive);
  const workers = activeEmployees.filter(e => e?.employeeType === 'Worker');
  const staff = activeEmployees.filter(e => e?.employeeType === 'Staff');
  const omani = activeEmployees.filter(e => e?.nationalityType === 'Omani');
  const expat = activeEmployees.filter(e => e?.nationalityType === 'Expat');

  const payrolls = [...store.payrolls].sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth));
  const allMonthsAsc = [...payrolls].map(p => p.payrollMonth).sort((a, b) => a.localeCompare(b));
  const latestPayroll = payrolls[0] || null;

  let periodMonths: string[];
  if (periodMode === 'month') {
    periodMonths = payrolls.some(p => p.payrollMonth === monthParam) ? [monthParam] : [];
  } else if (periodMode === 'range') {
    periodMonths = payrolls.filter(p => p.payrollMonth >= fromMonth && p.payrollMonth <= toMonth).map(p => p.payrollMonth);
  } else {
    periodMonths = allMonthsAsc;
  }
  const periodMonthSet = new Set(periodMonths);

  let periodLabel: string;
  if (periodMode === 'month') {
    periodLabel = monthParam ? formatMonthLabelDemo(monthParam) : 'No Period Selected';
  } else if (periodMode === 'range') {
    periodLabel = fromMonth && toMonth ? `${formatMonthLabelDemo(fromMonth)} – ${formatMonthLabelDemo(toMonth)}` : 'No Range Selected';
  } else {
    periodLabel = 'All Time';
  }

  const allFinalized = payrolls.filter(p => p.status === 'Finalized' && periodMonthSet.has(p.payrollMonth));
  const allPayments = store.salaryPayments.filter(p => !p.isReversed && periodMonthSet.has(p.payrollMonth));

  let totalFinalizedNetSalary = 0;
  for (const p of allFinalized) {
    for (const line of p.lines || []) totalFinalizedNetSalary = roundOMR(totalFinalizedNetSalary + line.netSalary);
  }
  const totalActuallyPaid = roundOMR(allPayments.reduce((s, p) => s + (p.payAmount || 0), 0));
  const totalOutstandingSalary = roundOMR(Math.max(0, totalFinalizedNetSalary - totalActuallyPaid));

  const activeLoans = store.loans.filter(l => l.status === 'Active');
  const totalOutstandingLoans = roundOMR(activeLoans.reduce((s, l) => s + (l.outstandingBalance || 0), 0));
  const totalActiveLoanPrincipal = roundOMR(activeLoans.reduce((s, l) => s + l.loanAmount, 0));
  const totalLoanRecovered = roundOMR(activeLoans.reduce((s, l) => s + (l.totalRecovered || 0), 0));
  const loanRecoveryPercentage = totalActiveLoanPrincipal > 0 ? roundOMR((totalLoanRecovered / totalActiveLoanPrincipal) * 100) : 0;
  const periodRecovery = roundOMR(
    store.loans.reduce((sum, l) => {
      const recoveriesInPeriod = (l.recoveries || []).filter(r => periodMonthSet.has((r.recoveryDate || '').slice(0, 7)));
      return sum + recoveriesInPeriod.reduce((s, r) => s + (r.recoveryAmount || 0), 0);
    }, 0)
  );

  const wpsInScope = store.wpsRecords.filter(w => periodMonthSet.has((w.payrollMonth || (w as any).month || '') as string));
  const totalWpsRecoverable = roundOMR(wpsInScope.reduce((s, w) => s + w.totalRecoverable, 0));
  const totalWpsRecovered = roundOMR(wpsInScope.reduce((s, w) => s + w.totalRecovered, 0));
  const totalWpsRemaining = roundOMR(wpsInScope.reduce((s, w) => s + w.remainingBalance, 0));

  const workforceCostByCategory = ['Staff', 'Worker'].map(type => {
    const lines = allFinalized.flatMap(p => p.lines || []).filter(l => l.employeeType === type);
    const totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
    return { name: type, count: lines.length, totalNetSalary, avgNetSalary: lines.length > 0 ? roundOMR(totalNetSalary / lines.length) : 0 };
  });
  const workforceCostSourceMonth = allFinalized.length > 0
    ? [...allFinalized].sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth))[0].payrollMonth
    : null;

  let trendMonths: string[];
  if (periodMode === 'month' && monthParam) {
    trendMonths = monthRangeDemo(monthBeforeDemo(monthParam, 5), monthParam);
  } else if (periodMode === 'range' && fromMonth && toMonth) {
    trendMonths = monthRangeDemo(fromMonth, toMonth);
  } else if (allMonthsAsc.length > 0) {
    trendMonths = monthRangeDemo(allMonthsAsc[0], allMonthsAsc[allMonthsAsc.length - 1]);
  } else {
    trendMonths = [];
  }
  const allPaymentsForTrends = store.salaryPayments.filter(p => !p.isReversed);
  const monthlyTrends = trendMonths.map(month => {
    const p = payrolls.find(pr => pr.payrollMonth === month);
    const paymentsForMonth = allPaymentsForTrends.filter(tx => tx.payrollMonth === month);
    const paidAmount = roundOMR(paymentsForMonth.reduce((s, tx) => s + (tx.payAmount || 0), 0));
    return { month, grossSalary: p ? roundOMR(p.totalGrossSalary) : 0, netSalary: p ? roundOMR(p.totalNetSalary) : 0, paidSalary: paidAmount, status: p ? p.status : 'No Payroll Run' };
  });

  let currentPayrollSource = latestPayroll;
  if (periodMode === 'month') {
    currentPayrollSource = monthParam ? (payrolls.find(p => p.payrollMonth === monthParam) || null) : null;
  } else if (periodMode === 'range' && periodMonths.length > 0) {
    const lastMonthInScope = [...periodMonths].sort((a, b) => b.localeCompare(a))[0];
    currentPayrollSource = payrolls.find(p => p.payrollMonth === lastMonthInScope) || null;
  }

  return {
    counts: {
      totalEmployees: employees.length, activeEmployees: activeEmployees.length, inactiveEmployees: employees.length - activeEmployees.length,
      workers: workers.length, staff: staff.length, omani: omani.length, expat: expat.length,
    },
    currentPayroll: {
      month: currentPayrollSource ? currentPayrollSource.payrollMonth : (monthParam || new Date().toISOString().slice(0, 7)),
      status: currentPayrollSource ? currentPayrollSource.status : 'No Payroll Run',
      grossSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalGrossSalary) : 0,
      netSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalNetSalary) : 0,
      wpsSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalWpsSalary) : 0,
      recoverableSalary: currentPayrollSource ? roundOMR(currentPayrollSource.totalRecoverableSalary) : 0,
    },
    finances: { totalFinalizedNetSalary, totalActuallyPaid, totalOutstandingSalary, totalOutstandingLoans, totalWpsRecoverable, totalWpsRecovered, totalWpsRemaining },
    loanAnalytics: { totalPrincipal: totalActiveLoanPrincipal, totalRecovered: totalLoanRecovered, outstandingBalance: totalOutstandingLoans, activeLoanCount: activeLoans.length, recoveryPercentage: loanRecoveryPercentage, monthlyRecovery: periodRecovery },
    workforceCostByCategory,
    workforceCostSourceMonth,
    distribution: {
      employeeTypes: [{ name: 'Staff', value: staff.length }, { name: 'Workers', value: workers.length }],
      nationalities: [{ name: 'Omani', value: omani.length }, { name: 'Expat', value: expat.length }],
      salaryStatus: [{ name: 'Paid Salary', value: totalActuallyPaid }, { name: 'Unpaid Outstanding', value: totalOutstandingSalary }],
      wpsStatus: [{ name: 'Recovered', value: totalWpsRecovered }, { name: 'Pending Recovery', value: totalWpsRemaining }],
    },
    monthlyTrends,
    periodMode,
    periodLabel,
    periodMonths,
  };
});

// ==================== System ====================
route('GET', '/api/system/status', () => ({ databaseEngine: 'In-Memory Demo Store', status: 'ok', mode: 'demo' }));

// ==================== Employees ====================
route('GET', '/api/employees', ({ query }) => {
  const store = getDemoStore();
  let employees = [...store.employees];
  const search = query.get('search');
  const employeeType = query.get('employeeType');
  const nationalityType = query.get('nationalityType');
  const employeeCompany = query.get('employeeCompany');
  const salaryPaidBy = query.get('salaryPaidBy');
  const wageType = query.get('wageType');
  const status = query.get('status');

  if (search) {
    const q = search.trim().toLowerCase();
    employees = employees.filter(e => e.employeeId.toLowerCase().includes(q) || e.employeeName.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q));
  }
  if (employeeType && employeeType !== 'ALL') employees = employees.filter(e => e.employeeType === employeeType);
  if (nationalityType && nationalityType !== 'ALL') employees = employees.filter(e => e.nationalityType === nationalityType);
  if (employeeCompany && employeeCompany !== 'ALL') employees = employees.filter(e => String(e.employeeCompany) === employeeCompany);
  if (salaryPaidBy && salaryPaidBy !== 'ALL') employees = employees.filter(e => String(e.salaryPaidBy) === salaryPaidBy);
  if (wageType && wageType !== 'ALL') employees = employees.filter(e => e.wageType === wageType);
  if (status === 'active') employees = employees.filter(e => e.isActive);
  else if (status === 'inactive') employees = employees.filter(e => !e.isActive);

  employees.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return employees;
});

route('GET', '/api/employees/:id', ({ params }) => {
  const store = getDemoStore();
  const employee = store.employees.find(e => e.id === params.id || e.employeeId === params.id);
  if (!employee) throw new Error('Employee not found.');
  return { ...employee, designationHistory: [], salaryHistory: [] };
});

route('GET', '/api/employees/:id/compliance', ({ params }) => {
  const store = getDemoStore();
  const employee = store.employees.find(e => e.id === params.id || e.employeeId === params.id);
  if (!employee) throw new Error('Employee not found.');

  const normId = employee.employeeId;
  const isOmani = employee.nationalityType === 'Omani';
  const numericId = parseInt(normId.replace(/\D/g, '') || '1', 10);
  const birthYear = 1982 + (numericId % 16);
  const birthMonth = String(1 + (numericId % 12)).padStart(2, '0');
  const birthDay = String(1 + (numericId % 28)).padStart(2, '0');
  const dob = `${birthYear}-${birthMonth}-${birthDay}`;

  const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-'];
  const bloodGroup = bloodGroups[numericId % bloodGroups.length];
  const marital = numericId % 3 === 0 ? 'Single' : 'Married';
  const emailName = employee.employeeName.toLowerCase().replace(/[^a-z0-9]/g, '.');

  const civilIdNumber = isOmani ? `1092${String(numericId).padStart(4, '0')}` : `8091${String(numericId).padStart(4, '0')}`;
  const passportNumber = isOmani ? `P-OM-${String(numericId).padStart(6, '0')}` : `P-EXP-${String(numericId).padStart(6, '0')}`;

  const personalDetails = {
    employeeId: normId,
    dateOfBirth: dob,
    dob,
    gender: 'Male',
    maritalStatus: marital,
    bloodGroup,
    mobileNumber: `+968 9${String(1000000 + numericId * 3421).slice(0, 7)}`,
    whatsappNumber: `+968 9${String(1000000 + numericId * 3421).slice(0, 7)}`,
    personalEmail: `${emailName}@artify.om`,
    residentialAddress: isOmani
      ? `Villa ${10 + numericId}, Way 2819, Al Khuwair, Muscat, Sultanate of Oman`
      : `Al Ghubrah Labour Camp, Block ${String.fromCharCode(65 + (numericId % 4))}, Muscat, Oman`,
    permanentAddress: isOmani ? 'Muscat Governorate, Sultanate of Oman' : 'Kerala, India',
    emergencyContactName: isOmani ? 'Said Al-Balushi' : 'Suresh Kumar',
    emergencyContactRelation: isOmani ? 'Brother' : 'Spouse',
    emergencyContactPhone: `+968 9${String(2000000 + numericId * 5432).slice(0, 7)}`,
    emergencyContacts: [
      {
        name: isOmani ? 'Said Al-Balushi' : 'Suresh Kumar',
        relationship: isOmani ? 'Brother' : 'Spouse',
        contactNumber: `+968 9${String(2000000 + numericId * 5432).slice(0, 7)}`,
        isPrimary: true,
      },
    ],
  };

  const currentCivilId = {
    id: `cid-${normId}`,
    employeeId: normId,
    civilIdNumber,
    issueDate: '2023-01-15',
    expiryDate: '2028-01-14',
    status: 'Valid',
    issuingAuthority: 'Royal Oman Police (ROP)',
    country: 'Oman',
    isCurrent: true,
  };

  const governmentDocuments = [
    {
      id: `gov-pass-${normId}`,
      employeeId: normId,
      documentType: 'Passport',
      documentNumber: passportNumber,
      issueDate: '2022-04-10',
      expiryDate: '2032-04-09',
      status: 'Valid',
      issuingAuthority: isOmani ? 'ROP Directorate of Passport' : 'Immigration Authority',
      country: isOmani ? 'Oman' : 'India',
      isCurrent: true,
    },
  ];

  return {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    employeeType: employee.employeeType,
    nationalityType: employee.nationalityType,
    designation: employee.designation,
    employeeCompany: employee.employeeCompany,
    overallCompliance: 'Compliant',
    currentCivilId,
    governmentDocuments,
    personalDetails,
  };
});

route('GET', '/api/employees/:id/personal-details', ({ params }) => {
  const store = getDemoStore();
  const employee = store.employees.find(e => e.id === params.id || e.employeeId === params.id);
  if (!employee) throw new Error('Employee not found.');

  const normId = employee.employeeId;
  const isOmani = employee.nationalityType === 'Omani';
  const numericId = parseInt(normId.replace(/\D/g, '') || '1', 10);
  const birthYear = 1982 + (numericId % 16);
  const birthMonth = String(1 + (numericId % 12)).padStart(2, '0');
  const birthDay = String(1 + (numericId % 28)).padStart(2, '0');
  const dob = `${birthYear}-${birthMonth}-${birthDay}`;
  const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-'];
  const bloodGroup = bloodGroups[numericId % bloodGroups.length];
  const marital = numericId % 3 === 0 ? 'Single' : 'Married';
  const emailName = employee.employeeName.toLowerCase().replace(/[^a-z0-9]/g, '.');

  return {
    details: {
      employeeId: normId,
      dateOfBirth: dob,
      dob,
      gender: 'Male',
      maritalStatus: marital,
      bloodGroup,
      mobileNumber: `+968 9${String(1000000 + numericId * 3421).slice(0, 7)}`,
      whatsappNumber: `+968 9${String(1000000 + numericId * 3421).slice(0, 7)}`,
      personalEmail: `${emailName}@artify.om`,
      residentialAddress: isOmani
        ? `Villa ${10 + numericId}, Way 2819, Al Khuwair, Muscat, Sultanate of Oman`
        : `Al Ghubrah Labour Camp, Block ${String.fromCharCode(65 + (numericId % 4))}, Muscat, Oman`,
      permanentAddress: isOmani ? 'Muscat Governorate, Sultanate of Oman' : 'Kerala, India',
      emergencyContactName: isOmani ? 'Said Al-Balushi' : 'Suresh Kumar',
      emergencyContactRelation: isOmani ? 'Brother' : 'Spouse',
      emergencyContactPhone: `+968 9${String(2000000 + numericId * 5432).slice(0, 7)}`,
      emergencyContacts: [
        {
          name: isOmani ? 'Said Al-Balushi' : 'Suresh Kumar',
          relationship: isOmani ? 'Brother' : 'Spouse',
          contactNumber: `+968 9${String(2000000 + numericId * 5432).slice(0, 7)}`,
          isPrimary: true,
        },
      ],
    },
  };
});

route('POST', '/api/employees', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { employeeId, employeeName, employeeType, nationalityType, wageType, dateOfJoining, dateOfLeaving, designation, employeeCompany, salaryPaidBy, monthlySalaryOrRate, wpsEmployee, wpsSalary, actualSalary, recoverFrom } = body;
  if (!employeeId || !employeeName || !employeeType || !nationalityType || !wageType || !designation || !employeeCompany || !salaryPaidBy) {
    throw new Error('Please fill in all mandatory employee fields.');
  }
  const normalizedId = normalizeEmployeeId(employeeId);
  if (store.employees.find(e => e.employeeId === normalizedId)) {
    throw new Error(`Employee ID '${normalizedId}' already exists in the system.`);
  }
  const numericSalary = Number(monthlySalaryOrRate);
  if (isNaN(numericSalary) || numericSalary < 0) throw new Error('Monthly Salary / Wage Rate cannot be negative.');

  const timestamp = new Date().toISOString();
  const newEmployee: Employee = {
    id: crypto.randomUUID(), employeeId: normalizedId, employeeName: String(employeeName).trim(), employeeType, nationalityType, wageType,
    dateOfJoining: dateOfJoining || timestamp.split('T')[0], dateOfLeaving: dateOfLeaving || null, designation: String(designation).trim(),
    employeeCompany, salaryPaidBy, monthlySalaryOrRate: roundOMR(numericSalary), wpsEmployee: wpsEmployee === 'Yes' ? 'Yes' : 'No',
    wpsSalary: roundOMR(Number(wpsSalary) || 0), actualSalary: roundOMR(Number(actualSalary) || numericSalary),
    recoverFrom: recoverFrom ? String(recoverFrom).trim() : (wpsEmployee === 'Yes' ? employeeCompany : ''),
    isActive: true, createdAt: timestamp, updatedAt: timestamp,
  };
  store.employees.push(newEmployee);
  return newEmployee;
});

route('PUT', '/api/employees/:id', ({ params, body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.employees.findIndex(e => e.id === params.id);
  if (idx === -1) throw new Error('Employee not found.');
  const current = store.employees[idx];
  const updated: Employee = {
    ...current,
    ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  };
  if (body.monthlySalaryOrRate !== undefined) updated.monthlySalaryOrRate = roundOMR(Number(body.monthlySalaryOrRate));
  if (body.wpsSalary !== undefined) updated.wpsSalary = roundOMR(Number(body.wpsSalary));
  if (body.actualSalary !== undefined) updated.actualSalary = roundOMR(Number(body.actualSalary));
  store.employees[idx] = updated;
  return updated;
});

route('PATCH', '/api/employees/:id/toggle-active', ({ params, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.employees.findIndex(e => e.id === params.id);
  if (idx === -1) throw new Error('Employee not found.');
  const emp = store.employees[idx];
  const newStatus = !emp.isActive;
  store.employees[idx] = { ...emp, isActive: newStatus, dateOfLeaving: newStatus ? null : (emp.dateOfLeaving || new Date().toISOString().split('T')[0]), updatedAt: new Date().toISOString() };
  return store.employees[idx];
});

// ==================== Projects ====================
route('GET', '/api/projects', ({ query }) => {
  const store = getDemoStore();
  let projects = [...store.projects];
  const search = query.get('search');
  const status = query.get('status');
  if (search) {
    const q = search.trim().toLowerCase();
    projects = projects.filter(p => p.projectCode.toLowerCase().includes(q) || p.projectName.toLowerCase().includes(q));
  }
  if (status && status !== 'ALL') projects = projects.filter(p => p.status === status);
  projects.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
  return projects;
});

route('POST', '/api/projects', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { projectCode, projectName, status, startDate, endDate, remarks, allowedCompanies } = body;
  if (!projectCode || !projectName) throw new Error('Project Code and Project Name are mandatory.');
  const normCode = String(projectCode).trim().toUpperCase();
  if (store.projects.find(p => p.projectCode === normCode)) throw new Error(`Project with code '${normCode}' already exists.`);
  const timestamp = new Date().toISOString();
  const newProject: Project = {
    id: crypto.randomUUID(), projectCode: normCode, projectName: String(projectName).trim(), status: status === 'Inactive' ? 'Inactive' : 'Active',
    startDate: startDate || null, endDate: endDate || null, remarks: remarks ? String(remarks).trim() : '',
    allowedCompanies: Array.isArray(allowedCompanies) && allowedCompanies.length > 0 ? allowedCompanies : undefined,
    createdAt: timestamp, updatedAt: timestamp,
  };
  store.projects.push(newProject);
  return newProject;
});

route('PUT', '/api/projects/:id', ({ params, body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.projects.findIndex(p => p.id === params.id);
  if (idx === -1) throw new Error('Project not found.');
  store.projects[idx] = { ...store.projects[idx], ...body, updatedAt: new Date().toISOString() };
  return store.projects[idx];
});

route('PATCH', '/api/projects/:id/toggle-status', ({ params, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.projects.findIndex(p => p.id === params.id);
  if (idx === -1) throw new Error('Project not found.');
  const newStatus = store.projects[idx].status === 'Active' ? 'Inactive' : 'Active';
  store.projects[idx] = { ...store.projects[idx], status: newStatus, updatedAt: new Date().toISOString() };
  return store.projects[idx];
});

// ==================== Attendance ====================
function buildAttendanceGrouped(month: string) {
  const store = getDemoStore();
  const records = store.attendanceRecords.filter(a => a.payrollMonth === month);
  const employees = store.employees.filter(e => e.isActive);
  const grouped = employees.map(emp => {
    const empRecords = records.filter(r => normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(emp.employeeId));
    const totalDays = empRecords.reduce((s, r) => s + (Number(r.daysWorked) || 0), 0);
    const totalHours = empRecords.reduce((s, r) => s + (Number(r.hoursWorked) || 0), 0);
    const totalOvertimeHours = empRecords.reduce((s, r) => s + (Number(r.overtimeHours) || 0), 0);
    return {
      employeeId: emp.employeeId, employeeName: emp.employeeName, employeeType: emp.employeeType, designation: emp.designation,
      employeeCompany: emp.employeeCompany, salaryPaidBy: emp.salaryPaidBy, monthlySalaryOrRate: emp.monthlySalaryOrRate, wageType: emp.wageType,
      totalDays, totalHours, totalOvertimeHours, totalBonus: 0, totalDeduction: 0,
      records: empRecords.map(r => ({ id: r.id, projectId: r.projectId, projectCode: r.projectCode, projectName: r.projectName, daysWorked: r.daysWorked, hoursWorked: r.hoursWorked, overtimeHours: r.overtimeHours || 0, bonus: 0, deduction: 0 })),
    };
  });
  return { month, monthStatus: store.getOrCreateAttendanceMonth(month), grouped, rawRecords: records, allProjects: store.projects };
}

route('GET', '/api/attendance', ({ query }) => {
  const month = query.get('month');
  if (!month) throw new Error('Payroll month is required (YYYY-MM).');
  return buildAttendanceGrouped(month);
});

route('POST', '/api/attendance', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { month, records } = body;
  if (!month || !Array.isArray(records)) throw new Error('Month and attendance records array are required.');
  const existingPayroll = store.getPayroll(month);
  if (existingPayroll && existingPayroll.status === 'Finalized') throw new Error(`Payroll for ${month} is Finalized. Modify attendance only during Revision.`);

  const timestamp = new Date().toISOString();
  const processed: AttendanceRecord[] = [];
  for (const r of records) {
    if (!r.employeeId || !r.projectId) continue;
    const emp = store.employees.find(e => e.employeeId === normalizeEmployeeId(r.employeeId));
    const proj = store.projects.find(p => p.id === r.projectId || p.projectCode === r.projectId);
    if (!emp || !proj) continue;
    const days = Math.max(0, Number(r.daysWorked) || 0);
    const hours = Math.max(0, Number(r.hoursWorked) || 0);
    if (days === 0 && hours === 0) continue;
    processed.push({
      id: r.id || crypto.randomUUID(), employeeId: emp.employeeId, employeeInternalId: emp.id, payrollMonth: month,
      projectId: proj.id, projectCode: proj.projectCode, projectName: proj.projectName,
      daysWorked: emp.employeeType === 'Staff' ? days : 0, hoursWorked: emp.employeeType === 'Worker' ? hours : 0,
      overtimeHours: Math.max(0, Number(r.overtimeHours) || 0), bonus: Math.max(0, Number(r.bonus) || 0), deduction: Math.max(0, Number(r.deduction) || 0),
      company: emp.employeeCompany, payrollType: 'Monthly', payBy: emp.salaryPaidBy, createdAt: timestamp, updatedAt: timestamp,
    });
  }
  store.attendanceRecords = store.attendanceRecords.filter(a => a.payrollMonth !== month).concat(processed);
  return { success: true, count: processed.length, month };
});

route('GET', '/api/attendance/:month/status', ({ params }) => getDemoStore().getOrCreateAttendanceMonth(params.month));

route('GET', '/api/attendance/:month/dashboard', ({ params }) => {
  const store = getDemoStore();
  const month = params.month;
  const records = store.attendanceRecords.filter(a => a.payrollMonth === month);
  const activeEmployees = store.employees.filter(e => e.isActive);
  const empHasRecord = new Set<string>();
  const projectTotals = new Map<string, number>();
  let totalDays = 0, totalHours = 0, totalOvertimeHours = 0;
  for (const r of records) {
    empHasRecord.add(normalizeEmployeeId(r.employeeId));
    totalDays += Number(r.daysWorked) || 0;
    totalHours += Number(r.hoursWorked) || 0;
    totalOvertimeHours += Number(r.overtimeHours) || 0;
    const volume = (Number(r.daysWorked) || 0) + (Number(r.hoursWorked) || 0);
    projectTotals.set(r.projectCode, (projectTotals.get(r.projectCode) || 0) + volume);
  }
  const grandVolume = Array.from(projectTotals.values()).reduce((s, v) => s + v, 0);
  const projectAllocation = Array.from(projectTotals.entries()).map(([projectCode, volume]) => ({
    projectCode, projectName: store.projects.find(p => p.projectCode === projectCode)?.projectName || projectCode,
    volume, percentage: grandVolume > 0 ? Number(((volume / grandVolume) * 100).toFixed(1)) : 0,
  }));
  const exceptions: any[] = [];
  for (const emp of activeEmployees) {
    if (!empHasRecord.has(normalizeEmployeeId(emp.employeeId))) {
      exceptions.push({ type: 'Missing Attendance', employeeId: emp.employeeId, employeeName: emp.employeeName, message: `No attendance recorded for ${emp.employeeId} (${emp.employeeName}) in ${month}.` });
    }
  }
  return {
    month, totalEmployees: activeEmployees.length,
    totalStaff: activeEmployees.filter(e => e.employeeType === 'Staff').length,
    totalWorkers: activeEmployees.filter(e => e.employeeType === 'Worker').length,
    totalDays, totalHours, totalOvertimeHours,
    completionPercentage: activeEmployees.length > 0 ? Number(((empHasRecord.size / activeEmployees.length) * 100).toFixed(1)) : 0,
    multiProjectEmployeeCount: 1,
    projectAllocation, exceptions,
  };
});

function attendanceWorkflow(status: 'Submitted' | 'Approved' | 'Finalized', month: string) {
  const store = getDemoStore();
  const m = store.getOrCreateAttendanceMonth(month);
  m.status = status;
  m.updatedAt = new Date().toISOString();
  return m;
}
route('POST', '/api/attendance/:month/submit', ({ params, role }) => { assertPermission(role, 'attendance.submit'); return attendanceWorkflow('Submitted', params.month); });
route('POST', '/api/attendance/:month/approve', ({ params, role }) => { assertPermission(role, 'attendance.approve'); return attendanceWorkflow('Approved', params.month); });
route('POST', '/api/attendance/:month/finalize', ({ params, role }) => { assertPermission(role, 'attendance.finalize'); return attendanceWorkflow('Finalized', params.month); });
route('POST', '/api/attendance/:month/revert', ({ params, body, role }) => {
  assertPermission(role, 'attendance.revert');
  if (!body?.reason || !String(body.reason).trim()) throw new Error('Revert reason is mandatory for the audit trail.');
  return attendanceWorkflow('Approved', params.month);
});

// ==================== Payroll ====================
route('GET', '/api/payroll', () => [...getDemoStore().payrolls].sort((a, b) => b.payrollMonth.localeCompare(a.payrollMonth)));

route('GET', '/api/payroll/:month', ({ params }) => {
  const payroll = getDemoStore().getPayroll(params.month);
  if (!payroll) return { exists: false, payrollMonth: params.month, status: 'Draft', lines: [] };
  return { exists: true, ...payroll };
});

route('POST', '/api/payroll/calculate', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { month } = body;
  if (!month) throw new Error('Payroll month (YYYY-MM) is required.');
  const existing = store.getPayroll(month);
  if (existing && existing.status === 'Finalized') throw new Error(`Payroll for ${month} is Finalized. Click 'Revise Payroll' to unlock revisions.`);

  const activeEmployees = store.employees.filter(e => e.isActive);
  const attendanceRecords = store.attendanceRecords.filter(a => a.payrollMonth === month);
  const activeLoans = store.loans.filter(l => l.status === 'Active');
  const payrollId = existing?.id || crypto.randomUUID();
  const existingLinesMap = new Map<string, PayrollLine>();
  (existing?.lines || []).forEach(l => existingLinesMap.set(normalizeEmployeeId(l.employeeId), l));

  const lines = activeEmployees.map(emp => calculateEmployeeLine(emp, attendanceRecords as any, payrollId, existingLinesMap.get(normalizeEmployeeId(emp.employeeId)), activeLoans));

  const payrollData: MonthlyPayroll = {
    id: payrollId, payrollMonth: month, status: existing?.status === 'In Revision' ? 'In Revision' : 'Draft',
    totalEmployees: lines.length,
    totalGrossSalary: roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0)),
    totalAdditions: roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0)),
    totalDeductions: roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0)),
    totalNetSalary: roundOMR(lines.reduce((s, l) => s + l.netSalary, 0)),
    totalWpsSalary: roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0)),
    totalRecoverableSalary: roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0)),
    revisionNumber: existing?.revisionNumber || 0,
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), lines,
  };
  store.payrolls = store.payrolls.filter(p => p.payrollMonth !== month).concat(payrollData);
  return payrollData;
});

route('PUT', '/api/payroll/:month/lines/:lineId', ({ params, body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const payroll = store.getPayroll(params.month);
  if (!payroll) throw new Error('Payroll not found.');
  if (payroll.status === 'Finalized') throw new Error('Cannot edit finalized payroll. Please initiate a revision.');
  const lines = payroll.lines || [];
  const lineIndex = lines.findIndex(l => l.id === params.lineId);
  if (lineIndex === -1) throw new Error('Payroll line not found.');
  lines[lineIndex] = recalculateLineOverride(lines[lineIndex], body);
  payroll.totalGrossSalary = roundOMR(lines.reduce((s, l) => s + l.grossSalary, 0));
  payroll.totalAdditions = roundOMR(lines.reduce((s, l) => s + l.totalAdditions, 0));
  payroll.totalDeductions = roundOMR(lines.reduce((s, l) => s + l.totalDeductions, 0));
  payroll.totalNetSalary = roundOMR(lines.reduce((s, l) => s + l.netSalary, 0));
  payroll.totalWpsSalary = roundOMR(lines.reduce((s, l) => s + l.wpsSalary, 0));
  payroll.totalRecoverableSalary = roundOMR(lines.reduce((s, l) => s + l.recoverableSalary, 0));
  payroll.updatedAt = new Date().toISOString();
  return payroll;
});

route('POST', '/api/payroll/:month/finalize', ({ params, role }) => {
  assertManager(role);
  const store = getDemoStore();
  const payroll = store.getPayroll(params.month);
  if (!payroll) throw new Error('Payroll not found for this month.');
  payroll.status = 'Finalized';
  payroll.finalizedAt = new Date().toISOString();
  payroll.finalizedBy = getDemoUser()?.name;
  return payroll;
});

route('POST', '/api/payroll/:month/revise', ({ params, body, role }) => {
  assertManager(role);
  const store = getDemoStore();
  const payroll = store.getPayroll(params.month);
  if (!payroll) throw new Error('Payroll not found.');
  if (payroll.status !== 'Finalized') throw new Error('Only a Finalized payroll can be revised.');
  payroll.status = 'In Revision';
  payroll.revisionNumber = (payroll.revisionNumber || 0) + 1;
  return {
    payroll,
    revision: { id: crypto.randomUUID(), payrollId: payroll.id, payrollMonth: params.month, revisionNumber: payroll.revisionNumber, revisionDate: new Date().toISOString(), revisedBy: getDemoUser()?.name || 'Demo Manager', reason: body?.reason || 'Revision requested', previousGross: payroll.totalGrossSalary, previousNet: payroll.totalNetSalary, newGross: payroll.totalGrossSalary, newNet: payroll.totalNetSalary, createdAt: new Date().toISOString() },
  };
});

route('GET', '/api/payroll/:month/revisions', () => []);

// ==================== Payments ====================
function computeGroupedPayments(query: URLSearchParams) {
  const store = getDemoStore();
  const month = query.get('month');
  const company = query.get('company');
  const paidBy = query.get('paidBy');
  const status = query.get('status');
  const search = query.get('search');
  const receiptStatus = query.get('receiptStatus');

  const finalizedPayrolls = store.payrolls.filter(p => p.status === 'Finalized');
  const payments = store.salaryPayments.filter(p => !p.isReversed);
  const groups = new Map<string, any>();

  for (const payroll of finalizedPayrolls) {
    if (month && month !== 'ALL' && payroll.payrollMonth !== month) continue;
    for (const line of payroll.lines || []) {
      const normId = normalizeEmployeeId(line.employeeId);
      if (search && !normId.toLowerCase().includes(search.toLowerCase()) && !line.employeeName.toLowerCase().includes(search.toLowerCase())) continue;
      if (company && company !== 'ALL' && String(line.employeeCompany) !== company) continue;
      if (paidBy && paidBy !== 'ALL' && String(line.salaryPaidBy) !== paidBy) continue;

      const linePayments = payments.filter(p => normalizeEmployeeId(p.employeeId) === normId && p.payrollMonth === payroll.payrollMonth);
      const totalPaid = roundOMR(linePayments.reduce((s, p) => s + (p.payAmount || 0), 0));
      const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));
      let paymentStatus = 'Unpaid';
      if (totalPaid >= line.netSalary) paymentStatus = 'Fully Paid';
      else if (totalPaid > 0) paymentStatus = 'Partially Paid';
      if (status && status !== 'ALL' && paymentStatus !== status) continue;

      let lineReceiptStatus: 'Attached' | 'Attachment Pending' | 'No Payments' = 'No Payments';
      if (linePayments.length > 0) lineReceiptStatus = linePayments.some(p => p.receiptStatus === 'Attachment Pending') ? 'Attachment Pending' : 'Attached';
      if (receiptStatus && receiptStatus !== 'ALL' && lineReceiptStatus !== receiptStatus) continue;

      if (!groups.has(normId)) {
        groups.set(normId, { employeeId: line.employeeId, employeeName: line.employeeName, employeeCompany: line.employeeCompany, salaryPaidBy: line.salaryPaidBy, wpsEmployee: line.wpsEmployee, months: [], totalNetSalary: 0, totalPaid: 0, totalOutstanding: 0 });
      }
      const g = groups.get(normId);
      g.months.push({ payrollMonth: payroll.payrollMonth, payrollLineId: line.id, employeeType: line.employeeType, designation: line.designation, paymentMethod: line.paymentMethod, grossSalary: line.grossSalary, totalAdditions: line.totalAdditions, totalDeductions: line.totalDeductions, netSalary: line.netSalary, totalPaid, outstanding, status: paymentStatus, receiptStatus: lineReceiptStatus, transactions: linePayments });
      g.totalNetSalary = roundOMR(g.totalNetSalary + line.netSalary);
      g.totalPaid = roundOMR(g.totalPaid + totalPaid);
      g.totalOutstanding = roundOMR(g.totalOutstanding + outstanding);
    }
  }
  return Array.from(groups.values());
}

route('GET', '/api/payments/grouped', ({ query }) => computeGroupedPayments(query).sort((a, b) => a.employeeId.localeCompare(b.employeeId)));

route('GET', '/api/payments/summary', ({ query }) => {
  const summaries = computeGroupedPayments(query);
  let totalNetSalary = 0, totalPaid = 0, totalOutstanding = 0, unpaidCount = 0, partiallyPaidCount = 0, fullyPaidCount = 0, pendingReceiptsCount = 0;
  for (const emp of summaries) {
    for (const m of emp.months) {
      totalNetSalary = roundOMR(totalNetSalary + m.netSalary);
      totalPaid = roundOMR(totalPaid + m.totalPaid);
      totalOutstanding = roundOMR(totalOutstanding + m.outstanding);
      if (m.status === 'Unpaid') unpaidCount++;
      else if (m.status === 'Partially Paid') partiallyPaidCount++;
      else if (m.status === 'Fully Paid') fullyPaidCount++;
      for (const tx of m.transactions) if (tx.receiptStatus === 'Attachment Pending') pendingReceiptsCount++;
    }
  }
  return { totalNetSalary, totalPaid, totalOutstanding, unpaidCount, partiallyPaidCount, fullyPaidCount, pendingReceiptsCount, totalEmployeeGroups: summaries.length };
});

route('GET', '/api/payments/transactions', ({ query }) => {
  const store = getDemoStore();
  let txs = [...store.salaryPayments];
  const employeeId = query.get('employeeId');
  const month = query.get('month');
  if (employeeId) txs = txs.filter(t => normalizeEmployeeId(t.employeeId) === normalizeEmployeeId(employeeId));
  if (month && month !== 'ALL') txs = txs.filter(t => t.payrollMonth === month);
  return txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

route('POST', '/api/payments/check-duplicate', ({ body }) => {
  const store = getDemoStore();
  const normId = normalizeEmployeeId(body.employeeId);
  const amount = roundOMR(Number(body.payAmount) || 0);
  const existing = store.salaryPayments.find(t => !t.isReversed && normalizeEmployeeId(t.employeeId) === normId && t.payrollMonth === body.payrollMonth && t.paymentDate === body.paymentDate && roundOMR(t.payAmount || 0) === amount);
  if (existing) return { isDuplicate: true, warning: `Possible duplicate payment transaction for ${normId}.` };
  return { isDuplicate: false };
});

route('POST', '/api/payments/transactions', ({ body, role }) => {
  assertPermission(role, 'salary_payment.create');
  const store = getDemoStore();
  const { employeeId, payrollMonth, paymentDate, payAmount, payTo, paymentMode, bankName, referenceNumber, remarks } = body;
  if (!employeeId || !payrollMonth || !paymentDate || !payAmount || !payTo) throw new Error('Employee ID, Month, Payment Date, Amount, and Pay To are required.');
  const normId = normalizeEmployeeId(employeeId);
  const payroll = store.getPayroll(payrollMonth);
  if (!payroll) throw new Error(`Payroll for month ${payrollMonth} does not exist.`);
  if (payroll.status !== 'Finalized') throw new Error(`Payroll for ${payrollMonth} must be Finalized before recording salary payments.`);
  const line = (payroll.lines || []).find(l => normalizeEmployeeId(l.employeeId) === normId);
  if (!line) throw new Error(`No payroll line found for ${normId} in ${payrollMonth}.`);

  const numericAmount = roundOMR(Number(payAmount));
  if (numericAmount <= 0) throw new Error('Payment amount must be greater than zero.');
  const existingPayments = store.salaryPayments.filter(p => !p.isReversed && normalizeEmployeeId(p.employeeId) === normId && p.payrollMonth === payrollMonth);
  const totalPaidBefore = roundOMR(existingPayments.reduce((s, p) => s + (p.payAmount || 0), 0));
  const currentOutstanding = roundOMR(Math.max(0, line.netSalary - totalPaidBefore));
  if (numericAmount > currentOutstanding) throw new Error(`Payment amount OMR ${numericAmount.toFixed(3)} cannot exceed current outstanding salary of OMR ${currentOutstanding.toFixed(3)}.`);

  const timestamp = new Date().toISOString();
  const tx: SalaryPaymentTransaction = {
    id: crypto.randomUUID(), employeeId: normId, employeeName: line.employeeName, payrollMonth, payrollLineId: line.id,
    paymentDate: paymentDate || timestamp.split('T')[0], payAmount: numericAmount, payTo: String(payTo).trim(),
    paymentMode: paymentMode || undefined, bankName: bankName ? String(bankName).trim() : undefined, referenceNumber: referenceNumber ? String(referenceNumber).trim() : undefined,
    receiptStatus: 'Attachment Pending', remarks: remarks ? String(remarks).trim() : '', createdBy: getDemoUser()?.username, isReversed: false, createdAt: timestamp, updatedAt: timestamp,
  };
  store.salaryPayments.push(tx);
  const totalPaidAfter = roundOMR(totalPaidBefore + numericAmount);
  const outstandingAfter = roundOMR(Math.max(0, line.netSalary - totalPaidAfter));
  return { transaction: tx, summary: { totalPaid: totalPaidAfter, outstanding: outstandingAfter, status: totalPaidAfter >= line.netSalary ? 'Fully Paid' : 'Partially Paid' } };
});

route('PUT', '/api/payments/transactions/:id', ({ params, body, role }) => {
  assertPermission(role, 'salary_payment.edit');
  const store = getDemoStore();
  const idx = store.salaryPayments.findIndex(t => t.id === params.id);
  if (idx === -1) throw new Error('Payment transaction not found.');
  if (store.salaryPayments[idx].isReversed) throw new Error('Cannot edit a reversed payment transaction.');
  store.salaryPayments[idx] = { ...store.salaryPayments[idx], ...body, updatedAt: new Date().toISOString() };
  return store.salaryPayments[idx];
});

route('POST', '/api/payments/transactions/:id/reverse', ({ params, body, role }) => {
  assertPermission(role, 'salary_payment.reverse');
  if (!body?.reason || !String(body.reason).trim()) throw new Error('Reversal reason is mandatory for financial audit trail.');
  const store = getDemoStore();
  const idx = store.salaryPayments.findIndex(t => t.id === params.id);
  if (idx === -1) throw new Error('Payment transaction not found.');
  store.salaryPayments[idx] = { ...store.salaryPayments[idx], isReversed: true, reversedAt: new Date().toISOString(), reversedBy: getDemoUser()?.username, reversalReason: String(body.reason).trim() };
  return store.salaryPayments[idx];
});

// ==================== Payment Planning ====================
const VARIANCE_TOLERANCE = 0.001;
function computePlanningRows() {
  const store = getDemoStore();
  const finalizedPayrolls = store.payrolls.filter(p => p.status === 'Finalized');
  const payments = store.salaryPayments.filter(p => !p.isReversed);
  const rows: any[] = [];
  for (const payroll of finalizedPayrolls) {
    const plan = store.paymentPlans.find(p => p.payrollMonth === payroll.payrollMonth);
    const planLineMap = new Map((plan?.lines || []).map(l => [normalizeEmployeeId(l.employeeId), l]));
    for (const line of payroll.lines || []) {
      const normId = normalizeEmployeeId(line.employeeId);
      const linePayments = payments.filter(p => normalizeEmployeeId(p.employeeId) === normId && p.payrollMonth === payroll.payrollMonth);
      const totalPaid = roundOMR(linePayments.reduce((s, p) => s + (p.payAmount || 0), 0));
      const outstanding = roundOMR(Math.max(0, line.netSalary - totalPaid));
      let status = 'Unpaid';
      if (totalPaid >= line.netSalary) status = 'Fully Paid';
      else if (totalPaid > 0) status = 'Partially Paid';
      const lastPayment = linePayments.reduce((latest: any, p) => (!latest || p.paymentDate > latest.paymentDate ? p : latest), null);
      const planLine = planLineMap.get(normId);
      rows.push({
        payrollId: payroll.id, payrollMonth: payroll.payrollMonth, employeeId: line.employeeId, employeeName: line.employeeName,
        employeeCompany: line.employeeCompany, salaryPaidBy: line.salaryPaidBy, wpsEmployee: line.wpsEmployee, wageType: line.wageType, employeeType: line.employeeType,
        netSalary: line.netSalary, totalPaid, outstanding, status,
        lastPaidSalary: lastPayment ? lastPayment.payAmount : 0, lastPaymentDate: lastPayment ? lastPayment.paymentDate : null,
        savedShouldPay: planLine ? planLine.shouldPayAmount : null, remarks: planLine ? (planLine.remarks || '') : '',
      });
    }
  }
  rows.sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.payrollMonth.localeCompare(b.payrollMonth));
  const oldestFoundFor = new Set<string>();
  for (const r of rows) {
    const normId = normalizeEmployeeId(r.employeeId);
    if (r.status !== 'Fully Paid' && !oldestFoundFor.has(normId)) { r.isOldestUnpaid = true; oldestFoundFor.add(normId); }
    else r.isOldestUnpaid = false;
  }
  for (const r of rows) {
    if (r.status !== 'Fully Paid') {
      const saved = r.savedShouldPay;
      const requested = saved !== null && saved !== undefined ? roundOMR(Number(saved) || 0) : r.outstanding;
      r.shouldPayAmount = Math.min(Math.max(0, requested), r.outstanding);
    } else r.shouldPayAmount = 0;
    delete r.savedShouldPay;
  }
  return rows;
}

route('GET', '/api/payment-planning', ({ role }) => { assertPermission(role, 'payment_planning.view'); return { rows: computePlanningRows() }; });

route('POST', '/api/payment-planning/save', ({ body, role }) => {
  assertPermission(role, 'payment_planning.edit');
  const store = getDemoStore();
  const { plans } = body;
  if (!Array.isArray(plans) || plans.length === 0) throw new Error('No plans provided to save.');
  let savedCount = 0;
  for (const p of plans) {
    const { payrollMonth, payrollId, lines } = p;
    if (!payrollMonth || !Array.isArray(lines)) continue;
    const authoritative = computePlanningRows().filter(r => r.payrollMonth === payrollMonth);
    const byEmp = new Map(authoritative.map(r => [normalizeEmployeeId(r.employeeId), r]));
    const normalized: any[] = [];
    for (const line of lines) {
      const normId = normalizeEmployeeId(line.employeeId);
      const auth = byEmp.get(normId);
      if (!auth) continue;
      let shouldPayAmount = 0;
      if (auth.status !== 'Fully Paid' && line.shouldPayAmount !== undefined && line.shouldPayAmount !== null && line.shouldPayAmount !== '') {
        const requested = Number(line.shouldPayAmount);
        if (!Number.isFinite(requested) || requested < 0) throw new Error(`Should Pay for ${line.employeeId} must be a non-negative number.`);
        if (requested > auth.outstanding + VARIANCE_TOLERANCE) throw new Error(`Should Pay for ${line.employeeId} cannot exceed outstanding balance of OMR ${auth.outstanding.toFixed(3)}.`);
        shouldPayAmount = roundOMR(requested);
      }
      normalized.push({ id: crypto.randomUUID(), planId: '', employeeId: line.employeeId, employeeName: line.employeeName, shouldPayAmount, remarks: typeof line.remarks === 'string' ? line.remarks : '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    const existingIdx = store.paymentPlans.findIndex(pl => pl.payrollMonth === payrollMonth);
    const planObj = { id: existingIdx >= 0 ? store.paymentPlans[existingIdx].id : crypto.randomUUID(), payrollId, payrollMonth, createdBy: getDemoUser()?.username || 'Demo User', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lines: normalized };
    if (existingIdx >= 0) store.paymentPlans[existingIdx] = planObj; else store.paymentPlans.push(planObj);
    savedCount++;
  }
  return { success: true, savedCount };
});

// ==================== WPS Recovery ====================
route('GET', '/api/wps', ({ query }) => {
  const store = getDemoStore();
  let list = [...store.wpsRecords];
  const month = query.get('month');
  const status = query.get('status');
  const search = query.get('search');
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(w => w.employeeId.toLowerCase().includes(q) || w.employeeName.toLowerCase().includes(q));
  }
  if (month && month !== 'ALL') list = list.filter(w => w.payrollMonth === month);
  if (status && status !== 'ALL') list = list.filter(w => w.status === status);
  list.sort((a, b) => String(b.payrollMonth).localeCompare(String(a.payrollMonth)) || a.employeeId.localeCompare(b.employeeId));
  return {
    summary: {
      totalRecoverable: roundOMR(list.reduce((s, w) => s + w.totalRecoverable, 0)),
      totalRecovered: roundOMR(list.reduce((s, w) => s + w.totalRecovered, 0)),
      totalRemaining: roundOMR(list.reduce((s, w) => s + w.remainingBalance, 0)),
      outstandingCount: list.filter(w => w.status === 'Outstanding').length,
      partiallyRecoveredCount: list.filter(w => w.status === 'Partially Recovered').length,
      fullyRecoveredCount: list.filter(w => w.status === 'Fully Recovered').length,
    },
    items: list,
  };
});

route('POST', '/api/wps/transactions', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { wpsRecoveryId, recoveryAmount, recoveryDate, recoveredFrom, remarks } = body;
  if (!wpsRecoveryId || !recoveryAmount || !recoveryDate || !recoveredFrom) throw new Error('WPS Recovery ID, Amount, Date, and Recovered From are required.');
  const numAmount = roundOMR(Number(recoveryAmount));
  if (numAmount <= 0) throw new Error('Recovery amount must be greater than zero.');
  const idx = store.wpsRecords.findIndex(w => w.id === wpsRecoveryId);
  if (idx === -1) throw new Error('WPS Recovery record not found.');
  const wps = store.wpsRecords[idx];
  if (numAmount > wps.remainingBalance) throw new Error(`Recovery amount OMR ${numAmount.toFixed(3)} cannot exceed remaining balance of OMR ${wps.remainingBalance.toFixed(3)}.`);

  const tx: WPSRecoveryTransaction = { id: crypto.randomUUID(), wpsRecoveryId, employeeId: wps.employeeId, payrollMonth: wps.payrollMonth, recoveredFrom: String(recoveredFrom).trim(), recoveryAmount: numAmount, recoveryDate, remarks: remarks ? String(remarks).trim() : '', createdBy: getDemoUser()?.username, createdAt: new Date().toISOString() };
  const newRecovered = roundOMR((wps.totalRecovered || 0) + numAmount);
  const newRemaining = roundOMR(wps.totalRecoverable - newRecovered);
  store.wpsRecords[idx] = { ...wps, totalRecovered: newRecovered, remainingBalance: newRemaining, status: newRemaining <= 0 ? 'Fully Recovered' : 'Partially Recovered', transactions: [...(wps.transactions || []), tx], updatedAt: new Date().toISOString() };
  return store.wpsRecords[idx];
});

// ==================== Loans ====================
route('GET', '/api/loans', ({ query }) => {
  const store = getDemoStore();
  let loans = [...store.loans];
  const status = query.get('status');
  const search = query.get('search');
  const employeeId = query.get('employeeId');
  if (search) {
    const q = search.toLowerCase();
    loans = loans.filter(l => l.employeeId.toLowerCase().includes(q) || l.employeeName.toLowerCase().includes(q));
  }
  if (employeeId) {
    const norm = normalizeEmployeeId(employeeId);
    loans = loans.filter(l => normalizeEmployeeId(l.employeeId) === norm);
  }
  if (status && status !== 'ALL') loans = loans.filter(l => l.status === status);
  loans.sort((a, b) => new Date(b.loanDate).getTime() - new Date(a.loanDate).getTime());
  return {
    summary: {
      totalLoanAmount: roundOMR(loans.reduce((s, l) => s + l.loanAmount, 0)),
      totalRecovered: roundOMR(loans.reduce((s, l) => s + (l.totalRecovered || 0), 0)),
      totalOutstanding: roundOMR(loans.reduce((s, l) => s + (l.outstandingBalance || 0), 0)),
      activeCount: loans.filter(l => l.status === 'Active').length,
      completedCount: loans.filter(l => l.status === 'Completed').length,
    },
    loans,
  };
});

route('POST', '/api/loans', ({ body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const { employeeId, loanAmount, loanDate, monthlyRecoveryAmount, remarks } = body;
  if (!employeeId || !loanAmount || !loanDate || !monthlyRecoveryAmount) throw new Error('Employee ID, Loan Amount, Date, and Monthly Recovery are mandatory.');
  const emp = store.employees.find(e => e.employeeId === normalizeEmployeeId(employeeId));
  if (!emp) throw new Error(`Employee '${employeeId}' not found.`);
  const numAmount = roundOMR(Number(loanAmount));
  const numMonthly = roundOMR(Number(monthlyRecoveryAmount));
  if (numAmount <= 0 || numMonthly <= 0) throw new Error('Loan Amount and Monthly Recovery must be greater than zero.');
  const timestamp = new Date().toISOString();
  const newLoan: EmployeeLoan = { id: crypto.randomUUID(), employeeId: emp.employeeId, employeeName: emp.employeeName, loanAmount: numAmount, loanDate, monthlyRecoveryAmount: numMonthly, totalRecovered: 0, outstandingBalance: numAmount, status: 'Active', remarks: remarks ? String(remarks).trim() : '', createdAt: timestamp, updatedAt: timestamp, recoveries: [] };
  store.loans.push(newLoan);
  return newLoan;
});

route('POST', '/api/loans/:id/repayments', ({ params, body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.loans.findIndex(l => l.id === params.id);
  if (idx === -1) throw new Error('Loan not found.');
  const loan = store.loans[idx];
  const numAmount = roundOMR(Number(body.recoveryAmount));
  if (numAmount <= 0) throw new Error('Repayment amount must be greater than zero.');
  if (numAmount > (loan.outstandingBalance || 0)) throw new Error(`Repayment amount OMR ${numAmount.toFixed(3)} exceeds outstanding balance of OMR ${(loan.outstandingBalance || 0).toFixed(3)}.`);
  const rec: LoanRepayment = { id: crypto.randomUUID(), loanId: params.id, employeeId: loan.employeeId, recoverySource: 'Direct Payment', recoveryAmount: numAmount, recoveryDate: body.recoveryDate || new Date().toISOString().split('T')[0], remarks: body.remarks || 'Direct cashier repayment', createdByName: getDemoUser()?.name, createdAt: new Date().toISOString() };
  const newRecovered = roundOMR((loan.totalRecovered || 0) + numAmount);
  const newOutstanding = roundOMR(loan.loanAmount - newRecovered);
  store.loans[idx] = { ...loan, totalRecovered: newRecovered, outstandingBalance: newOutstanding, status: newOutstanding <= 0 ? 'Completed' : 'Active', recoveries: [...(loan.recoveries || []), rec], updatedAt: new Date().toISOString() };
  return store.loans[idx];
});

route('PATCH', '/api/loans/:id/status', ({ params, body, role }) => {
  assertWrite(role);
  const store = getDemoStore();
  const idx = store.loans.findIndex(l => l.id === params.id);
  if (idx === -1) throw new Error('Loan not found.');
  if (!['Active', 'Completed', 'Cancelled'].includes(body.status)) throw new Error('Invalid loan status.');
  store.loans[idx] = { ...store.loans[idx], status: body.status, updatedAt: new Date().toISOString() };
  return store.loans[idx];
});

// ==================== Reports: Salary & Payroll Report (simplified, real analytics) ====================
route('GET', '/api/reports/salary-payroll', ({ query }) => {
  const store = getDemoStore();
  const pageSize = query.get('pageSize');
  const rows: any[] = [];
  for (const payroll of store.payrolls) {
    for (const line of payroll.lines || []) {
      const payments = store.salaryPayments.filter(p => !p.isReversed && normalizeEmployeeId(p.employeeId) === normalizeEmployeeId(line.employeeId) && p.payrollMonth === payroll.payrollMonth);
      const totalPaid = roundOMR(payments.reduce((s, p) => s + (p.payAmount || 0), 0));
      const outstanding = payroll.status === 'Finalized' ? roundOMR(Math.max(0, line.netSalary - totalPaid)) : null;
      let paymentStatus: string = 'In Revision';
      if (payroll.status === 'Finalized') {
        paymentStatus = totalPaid >= line.netSalary ? 'Fully Paid' : totalPaid > 0 ? 'Partially Paid' : 'Unpaid';
      }
      rows.push({ ...line, payrollMonth: payroll.payrollMonth, payrollStatus: payroll.status, totalPaid: payroll.status === 'Finalized' ? totalPaid : null, outstanding, paymentStatus });
    }
  }
  const summary = {
    totalEmployees: new Set(rows.map(r => r.employeeId)).size,
    totalGross: roundOMR(rows.reduce((s, r) => s + r.grossSalary, 0)),
    totalAdditions: roundOMR(rows.reduce((s, r) => s + r.totalAdditions, 0)),
    totalDeductions: roundOMR(rows.reduce((s, r) => s + r.totalDeductions, 0)),
    totalNet: roundOMR(rows.reduce((s, r) => s + r.netSalary, 0)),
    totalPaid: roundOMR(rows.reduce((s, r) => s + (r.totalPaid || 0), 0)),
    totalOutstanding: roundOMR(rows.reduce((s, r) => s + (r.outstanding || 0), 0)),
    totalWpsSalary: roundOMR(rows.reduce((s, r) => s + r.wpsSalary, 0)),
    wpsExceptions: 0,
  };
  const companyMap = new Map<string, any>();
  rows.forEach(r => {
    const key = String(r.employeeCompany);
    if (!companyMap.has(key)) companyMap.set(key, { company: key, employees: new Set(), gross: 0, net: 0, paid: 0, outstanding: 0 });
    const c = companyMap.get(key);
    c.employees.add(r.employeeId); c.gross += r.grossSalary; c.net += r.netSalary; c.paid += r.totalPaid || 0; c.outstanding += r.outstanding || 0;
  });
  const analytics = {
    reconciliation: summary,
    companyBreakdown: Array.from(companyMap.values()).map(c => ({ company: c.company, employees: c.employees.size, gross: roundOMR(c.gross), net: roundOMR(c.net), paid: roundOMR(c.paid), outstanding: roundOMR(c.outstanding) })),
    payByBreakdown: [], employeeTypeBreakdown: [], wpsBreakdown: [], paymentStatusBreakdown: [], additionsBreakdown: [], deductionsBreakdown: [], projectBreakdown: [],
    monthlyTrend: store.payrolls.map(p => ({ month: p.payrollMonth, gross: p.totalGrossSalary, net: p.totalNetSalary })).sort((a, b) => a.month.localeCompare(b.month)),
  };
  const fullRows = pageSize === 'all' ? rows : rows.slice(0, 25);
  return { reportingPeriod: { months: store.payrolls.map(p => p.payrollMonth) }, summary, analytics, exceptions: [], rows: fullRows, totalCount: rows.length, page: 1, pageSize: pageSize === 'all' ? rows.length : 25 };
});

// ==================== Dispatch ====================
export function dispatchDemoRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (!hasLiveDemoStore()) {
          throw new Error('Demo session has expired. Please return to the login screen and start a new demo.');
        }
        const role = currentRole();
        const method = (options.method || 'GET').toUpperCase();
        const [rawPath, queryString] = endpoint.split('?');
        const query = new URLSearchParams(queryString || '');
        let body: any = {};
        if (options.body) {
          try { body = JSON.parse(options.body as string); } catch { body = {}; }
        }

        for (const r of ROUTES) {
          if (r.method !== method) continue;
          const params = matchPath(r.pattern, rawPath);
          if (params) {
            const result = r.handler({ params, query, body, role });
            resolve(result as T);
            return;
          }
        }
        throw new Error(`Demo mode: no handler for ${method} ${rawPath}. This area isn't covered by the demo yet.`);
      } catch (err) {
        reject(err);
      }
    }, 120 + Math.random() * 180);
  });
}
