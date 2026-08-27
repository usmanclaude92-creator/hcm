import type { UserRole } from './types/index';

// Granular permission strings for the Salary Payment / Payment Planning module.
// Still driven by the existing 4-role model (no user-manageable permission-assignment
// UI) -- this just names the checks more precisely than the coarse canWrite/isAdmin
// flags used elsewhere in the app.
export type Permission =
  | 'salary_payment.view'
  | 'salary_payment.create'
  | 'salary_payment.edit'
  | 'salary_payment.reverse'
  | 'salary_payment.import'
  | 'salary_payment.export'
  | 'payment_planning.view'
  | 'payment_planning.edit'
  | 'payment_planning.export';

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
  ],
  Viewer: [
    'salary_payment.view',
    'salary_payment.export',
    'payment_planning.view',
    'payment_planning.export',
  ],
};

export function roleHasPermission(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
