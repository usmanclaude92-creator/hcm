import type { UserRole } from './types/index';

// Granular permission strings for the Salary Payment / Payment Planning / Attendance /
// Timesheet / CIF modules. Still driven by the existing 4-role model (no user-manageable
// permission-assignment UI) -- this just names the checks more precisely than the coarse
// canWrite/isAdmin flags used elsewhere in the app.
export type Permission =
  | 'salary_payment.view'
  | 'salary_payment.create'
  | 'salary_payment.edit'
  | 'salary_payment.reverse'
  | 'salary_payment.import'
  | 'salary_payment.export'
  | 'payment_planning.view'
  | 'payment_planning.edit'
  | 'payment_planning.export'
  | 'attendance.view'
  | 'attendance.create'
  | 'attendance.import'
  | 'attendance.export'
  | 'attendance.submit'
  | 'attendance.approve'
  | 'attendance.finalize'
  | 'attendance.revert'
  | 'timesheet.view'
  | 'timesheet.create'
  | 'timesheet.edit'
  | 'timesheet.import'
  | 'timesheet.export'
  | 'timesheet.approve'
  | 'cif.view'
  | 'cif.upload'
  | 'cif.process'
  | 'cif.export'
  | 'compliance.view'
  | 'compliance.edit'
  | 'compliance.reveal'
  | 'compliance.export';

const ALL_PERMISSIONS: Permission[] = [
  'salary_payment.view',
  'salary_payment.create',
  'salary_payment.edit',
  'salary_payment.reverse',
  'salary_payment.import',
  'salary_payment.export',
  'payment_planning.view',
  'payment_planning.edit',
  'payment_planning.export',
  'attendance.view',
  'attendance.create',
  'attendance.import',
  'attendance.export',
  'attendance.submit',
  'attendance.approve',
  'attendance.finalize',
  'attendance.revert',
  'timesheet.view',
  'timesheet.create',
  'timesheet.edit',
  'timesheet.import',
  'timesheet.export',
  'timesheet.approve',
  'cif.view',
  'cif.upload',
  'cif.process',
  'cif.export',
  'compliance.view',
  'compliance.edit',
  'compliance.reveal',
  'compliance.export',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  Administrator: ALL_PERMISSIONS,
  'Payroll Manager': ALL_PERMISSIONS,
  'Payroll User': [
    'salary_payment.view',
    'salary_payment.create',
    'salary_payment.export',
    'payment_planning.view',
    'payment_planning.edit',
    'payment_planning.export',
    'attendance.view',
    'attendance.create',
    'attendance.import',
    'attendance.export',
    'attendance.submit',
    'timesheet.view',
    'timesheet.create',
    'timesheet.edit',
    'timesheet.import',
    'timesheet.export',
    'cif.view',
    'cif.upload',
    'cif.export',
    'compliance.view',
    'compliance.edit',
    'compliance.reveal',
    'compliance.export',
  ],
  Viewer: [
    'salary_payment.view',
    'salary_payment.export',
    'payment_planning.view',
    'payment_planning.export',
    'attendance.view',
    'attendance.export',
    'timesheet.view',
    'timesheet.export',
    'cif.view',
    'cif.export',
    'compliance.view',
    'compliance.export',
  ],
};

export function roleHasPermission(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
