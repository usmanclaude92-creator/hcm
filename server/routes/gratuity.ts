import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import {
  db,
  roundOMR,
  normalizeEmployeeId,
  isHourlyPaid,
  STANDARD_DAYS_PER_MONTH,
  STANDARD_HOURS_PER_DAY,
} from '../db.js';
import { verifyAuth, AuthRequest, companyScopeOf, canSeeCompany } from '../auth.js';
import type { Employee, GratuityLine } from '../../src/types/index';

const router = Router();

// ---------------------------------------------------------------------------
// End-of-service gratuity, Oman Labour Law (Royal Decree 53/2023), Article 61:
// a non-Omani worker who completes at least one continuous year of service is
// entitled, on termination, to
//   * half a month's basic wage for each of the first three years of service, and
//   * one month's basic wage for each year of service thereafter,
// pro-rated for part of a year.
//
// Omani nationals are covered by the Social Protection Fund rather than by this
// gratuity, so they are reported separately and are excluded from the liability
// total unless includeOmani=true is passed.
//
// The rates below are the statutory ones and are kept as named constants so a
// different contractual entitlement can be applied deliberately rather than by
// editing arithmetic buried in a loop.
// ---------------------------------------------------------------------------
export const GRATUITY_MIN_SERVICE_YEARS = 1;
export const GRATUITY_FIRST_TIER_YEARS = 3;
export const GRATUITY_FIRST_TIER_MONTHS_PER_YEAR = 0.5;
export const GRATUITY_LATER_MONTHS_PER_YEAR = 1;
export const DAYS_PER_SERVICE_YEAR = 365.25;

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function daysBetween(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (isNaN(s) || isNaN(e)) return 0;
  // Inclusive of the joining day, matching how service is counted on a contract.
  return Math.max(0, Math.round((e - s) / 86400000) + 1);
}

// The monthly basic wage the gratuity is a multiple of. An hourly-paid worker has no
// monthly figure on record, so the standard month defined in the payroll engine
// (8 hours x 30 days) is used, and the basis is reported alongside the amount so the
// number is never mistaken for a contractual monthly salary.
export function monthlyBasicWage(emp: Employee): { wage: number; basis: string } {
  const rate = Number(emp.monthlySalaryOrRate) || 0;
  if (isHourlyPaid(emp)) {
    return {
      wage: roundOMR(rate * STANDARD_HOURS_PER_DAY * STANDARD_DAYS_PER_MONTH),
      basis: `${rate.toFixed(3)}/hour x ${STANDARD_HOURS_PER_DAY}h x ${STANDARD_DAYS_PER_MONTH}d`,
    };
  }
  return { wage: roundOMR(rate), basis: 'Fixed monthly basic wage' };
}

export function computeGratuity(emp: Employee, asOf: string): GratuityLine {
  const endDate = emp.dateOfLeaving && isValidDate(emp.dateOfLeaving) ? emp.dateOfLeaving : asOf;
  const joining = emp.dateOfJoining && isValidDate(emp.dateOfJoining) ? emp.dateOfJoining : null;
  const { wage, basis } = monthlyBasicWage(emp);

  if (!joining) {
    return {
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      employeeCompany: emp.employeeCompany,
      nationalityType: emp.nationalityType,
      isActive: emp.isActive,
      dateOfJoining: emp.dateOfJoining || '',
      serviceEndDate: endDate,
      serviceDays: 0,
      serviceYears: 0,
      monthlyBasicWage: wage,
      wageBasis: basis,
      firstTierYears: 0,
      laterYears: 0,
      gratuityAmount: 0,
      isEntitled: false,
      note: 'No valid joining date on record, so no service period can be established.',
    };
  }

  const serviceDays = endDate < joining ? 0 : daysBetween(joining, endDate);
  const serviceYears = serviceDays / DAYS_PER_SERVICE_YEAR;
  const firstTierYears = Math.min(serviceYears, GRATUITY_FIRST_TIER_YEARS);
  const laterYears = Math.max(serviceYears - GRATUITY_FIRST_TIER_YEARS, 0);

  const meetsMinimum = serviceYears >= GRATUITY_MIN_SERVICE_YEARS;
  const isOmani = emp.nationalityType === 'Omani';
  const isEntitled = meetsMinimum && !isOmani;

  const rawAmount =
    wage * GRATUITY_FIRST_TIER_MONTHS_PER_YEAR * firstTierYears +
    wage * GRATUITY_LATER_MONTHS_PER_YEAR * laterYears;

  let note = '';
  if (isOmani) {
    note = 'Omani national — covered by the Social Protection Fund, so no statutory gratuity accrues. Amount shown for information only.';
  } else if (!meetsMinimum) {
    note = `Under ${GRATUITY_MIN_SERVICE_YEARS} year of continuous service — no entitlement yet.`;
  } else if (emp.dateOfLeaving) {
    note = `Service ended ${emp.dateOfLeaving}. Amount is final and payable.`;
  } else {
    note = `Accrued liability as at ${asOf}. Payable only on termination.`;
  }

  return {
    employeeId: emp.employeeId,
    employeeName: emp.employeeName,
    employeeCompany: emp.employeeCompany,
    nationalityType: emp.nationalityType,
    isActive: emp.isActive,
    dateOfJoining: joining,
    serviceEndDate: endDate,
    serviceDays,
    serviceYears: Math.round(serviceYears * 1000) / 1000,
    monthlyBasicWage: wage,
    wageBasis: basis,
    firstTierYears: Math.round(firstTierYears * 1000) / 1000,
    laterYears: Math.round(laterYears * 1000) / 1000,
    // The amount is always computed, so an Omani or short-service employee shows what
    // would accrue; only isEntitled decides whether it counts toward the liability.
    gratuityAmount: roundOMR(rawAmount),
    isEntitled,
    note,
  };
}

function buildRows(req: AuthRequest): { rows: GratuityLine[]; asOf: string; error?: string } {
  const asOfRaw = String(req.query.asOf || '').trim();
  const asOf = asOfRaw || new Date().toISOString().slice(0, 10);
  if (asOfRaw && !isValidDate(asOfRaw)) {
    return { rows: [], asOf, error: 'asOf must be a real calendar date in YYYY-MM-DD format.' };
  }

  const { company, status, employeeId, nationality } = req.query as Record<string, string>;
  const scope = companyScopeOf(req.user);

  let employees = db.employees.getAll().filter(e => canSeeCompany(scope, e.employeeCompany));
  if (company && company !== 'ALL') employees = employees.filter(e => e.employeeCompany === company);
  if (nationality && nationality !== 'ALL') employees = employees.filter(e => e.nationalityType === nationality);
  if (status === 'active') employees = employees.filter(e => e.isActive);
  else if (status === 'former') employees = employees.filter(e => !e.isActive);
  if (employeeId) {
    const norm = normalizeEmployeeId(employeeId);
    employees = employees.filter(e => normalizeEmployeeId(e.employeeId) === norm);
  }

  const rows = employees
    .map(e => computeGratuity(e, asOf))
    .sort((a, b) => b.gratuityAmount - a.gratuityAmount || a.employeeId.localeCompare(b.employeeId));

  return { rows, asOf };
}

// GET /api/gratuity?asOf=&company=&status=&nationality=&employeeId=
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { rows, asOf, error } = buildRows(req);
    if (error) return res.status(400).json({ error });

    const entitled = rows.filter(r => r.isEntitled);
    const summary = {
      asOf,
      employeeCount: rows.length,
      entitledCount: entitled.length,
      // Only entitled employees are added up: an information-only figure must never
      // silently inflate the balance-sheet provision.
      totalLiability: roundOMR(entitled.reduce((s, r) => s + r.gratuityAmount, 0)),
      activeLiability: roundOMR(
        entitled.filter(r => r.isActive).reduce((s, r) => s + r.gratuityAmount, 0)
      ),
      payableOnExit: roundOMR(
        entitled.filter(r => !r.isActive).reduce((s, r) => s + r.gratuityAmount, 0)
      ),
      notYetEntitledCount: rows.filter(r => !r.isEntitled && r.nationalityType !== 'Omani').length,
      omaniExcludedCount: rows.filter(r => r.nationalityType === 'Omani').length,
      basis:
        'Oman Labour Law RD 53/2023 Art. 61 — half a month basic wage per year for the first ' +
        `${GRATUITY_FIRST_TIER_YEARS} years, one month per year thereafter, minimum ` +
        `${GRATUITY_MIN_SERVICE_YEARS} year of service, non-Omani employees.`,
    };

    res.json({ summary, rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compute end-of-service gratuity.' });
  }
});

// GET /api/gratuity/export
router.get('/export', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { rows, asOf, error } = buildRows(req);
    if (error) return res.status(400).json({ error });

    const data = rows.map((r, idx) => ({
      'Sr#': idx + 1,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Company': r.employeeCompany,
      'Nationality': r.nationalityType,
      'Status': r.isActive ? 'Active' : 'Former',
      'Date of Joining': r.dateOfJoining,
      'Service Counted To': r.serviceEndDate,
      'Service Days': r.serviceDays,
      'Service Years': r.serviceYears.toFixed(3),
      'Monthly Basic Wage (OMR)': r.monthlyBasicWage.toFixed(3),
      'Wage Basis': r.wageBasis,
      'Years in First Tier (0.5 month/yr)': r.firstTierYears.toFixed(3),
      'Years Beyond Tier (1 month/yr)': r.laterYears.toFixed(3),
      'Gratuity (OMR)': r.gratuityAmount.toFixed(3),
      'Counts Toward Liability': r.isEntitled ? 'Yes' : 'No',
      'Note': r.note,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Gratuity');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="End_Of_Service_Gratuity_${asOf}.xlsx"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to export the gratuity report.' });
  }
});

export default router;
