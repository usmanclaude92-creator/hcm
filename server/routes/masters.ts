import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { verifyAuth, AuthRequest, requireRoles } from '../auth.js';
import type {
  Department,
  Designation,
  CompanyMaster,
  TradeMaster,
  ProjectGeofenceLocation,
  PayGrade,
  LeaveType
} from '../../src/types/index';

const router = Router();

// In-memory pay grades master store
let payGradesStore: PayGrade[] = [
  {
    id: 'grd-01',
    gradeCode: 'GRD-EXEC',
    gradeName: 'Executive & C-Suite',
    minimumSalary: 1800,
    maximumSalary: 3500,
    currency: 'OMR',
    standardAllowance: 500,
    description: 'Executive leadership, Project Directors, and General Managers',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'grd-02',
    gradeCode: 'GRD-SNR-ENG',
    gradeName: 'Senior Engineer / Section Head',
    minimumSalary: 1100,
    maximumSalary: 1800,
    currency: 'OMR',
    standardAllowance: 300,
    description: 'Lead Project Engineers, Commercial Managers, and HSE Leads',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'grd-03',
    gradeCode: 'GRD-MID-STAFF',
    gradeName: 'Mid-Level Staff & Site Engineers',
    minimumSalary: 650,
    maximumSalary: 1100,
    currency: 'OMR',
    standardAllowance: 180,
    description: 'Site Engineers, Quantity Surveyors, Accountants, HR Officers',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'grd-04',
    gradeCode: 'GRD-TECH-SUPER',
    gradeName: 'Technical Foremen & Supervisors',
    minimumSalary: 380,
    maximumSalary: 650,
    currency: 'OMR',
    standardAllowance: 90,
    description: 'General Foremen, Chargehands, Heavy Plant Operators, QA Inspectors',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'grd-05',
    gradeCode: 'GRD-SKILLED-WRK',
    gradeName: 'Skilled Trades & Artisans',
    minimumSalary: 200,
    maximumSalary: 380,
    currency: 'OMR',
    standardAllowance: 50,
    description: '6G Welders, Industrial Electricians, Masons, Carpenters, Steel Fixers',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'grd-06',
    gradeCode: 'GRD-GENERAL-LABOR',
    gradeName: 'General Site Labor / Helpers',
    minimumSalary: 140,
    maximumSalary: 200,
    currency: 'OMR',
    standardAllowance: 30,
    description: 'Site helpers, riggers, logistics assistants, and cleaners',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
];

// In-memory central master stores with standard initializations
let companiesStore: CompanyMaster[] = [
  {
    id: 'comp-01',
    companyCode: 'HO-OMAN',
    companyName: 'Head Office Oman LLC',
    legalName: 'Head Office Oman Construction LLC',
    crNumber: 'CR-1029384',
    country: 'Oman',
    currency: 'OMR',
    taxId: 'OM-TAX-998811',
    address: 'Azaiba North, Muscat, Sultanate of Oman',
    contactEmail: 'contact@headoffice-oman.com',
    contactPhone: '+968 2412 3456',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'comp-02',
    companyCode: 'AL-TURKI',
    companyName: 'Al Turki Contracting LLC',
    legalName: 'Al Turki Enterprises & Contracting LLC',
    crNumber: 'CR-2049182',
    country: 'Oman',
    currency: 'OMR',
    taxId: 'OM-TAX-554422',
    address: 'Ghubrah, Muscat, Sultanate of Oman',
    contactEmail: 'info@alturki.om',
    contactPhone: '+968 2456 7890',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'comp-03',
    companyCode: 'INFRA-TECH',
    companyName: 'InfraTech Oman Contracting',
    legalName: 'InfraTech Engineering & Contracting LLC',
    crNumber: 'CR-3392817',
    country: 'Oman',
    currency: 'OMR',
    taxId: 'OM-TAX-776633',
    address: 'Sohar Industrial Zone, Oman',
    contactEmail: 'admin@infratech.om',
    contactPhone: '+968 2684 1122',
    isActive: true,
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-01T00:00:00.000Z'
  }
];

let tradesStore: TradeMaster[] = [
  { id: 'trd-01', tradeCode: 'CARP', tradeName: 'Shuttering Carpenter', category: 'Civil', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-02', tradeCode: 'ST-FX', tradeName: 'Steel Fixer', category: 'Civil', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-03', tradeCode: 'MASON', tradeName: 'Block Mason / Plasterer', category: 'Civil', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-04', tradeCode: 'ELEC', tradeName: 'Industrial Electrician', category: 'Electrical', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-05', tradeCode: 'PIPE', tradeName: 'Pipe Fitter & Welder (6G)', category: 'Mechanical', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-06', tradeCode: 'HVAC', tradeName: 'HVAC Technician', category: 'Mechanical', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-07', tradeCode: 'OPER', tradeName: 'Heavy Equipment Operator', category: 'Logistics', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
  { id: 'trd-08', tradeCode: 'SFTY', tradeName: 'Site Safety Marshall', category: 'General', isActive: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }
];

let geofencesStore: ProjectGeofenceLocation[] = [
  {
    id: 'geo-01',
    projectId: 'PRJ-001',
    locationCode: 'GATE-01',
    locationName: 'Muscat Airport Expansion - Main Gate 1',
    locationType: 'Main Gate',
    latitude: 23.5933,
    longitude: 58.2844,
    radiusMeters: 350,
    isPrimary: true,
    isActive: true,
    effectiveFrom: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'geo-02',
    projectId: 'PRJ-001',
    locationCode: 'GATE-02',
    locationName: 'Muscat Airport Expansion - Batching Plant Gate',
    locationType: 'Work Zone',
    latitude: 23.5901,
    longitude: 58.2810,
    radiusMeters: 250,
    isPrimary: false,
    isActive: true,
    effectiveFrom: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'geo-03',
    projectId: 'PRJ-002',
    locationCode: 'SOHAR-HQ',
    locationName: 'Sohar Port Infrastructure - Site Office & Gate',
    locationType: 'Main Gate',
    latitude: 24.4981,
    longitude: 56.6315,
    radiusMeters: 400,
    isPrimary: true,
    isActive: true,
    effectiveFrom: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
];

// Organisation master data: departments and designations. Designation used to be typed
// free-hand on every employee record, so "Site Engineer", "site engineer" and "Snr Site
// Eng." were three different roles as far as any report was concerned. The master is the
// governed list; the employee record still stores the title as text, so nothing had to be
// migrated and an existing record is never invalidated by a rename here.

function usageCount(title: string): number {
  const norm = title.trim().toLowerCase();
  return db.employees.getAll().filter(e => String(e.designation || '').trim().toLowerCase() === norm).length;
}

// GET /api/masters/departments
router.get('/departments', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const departments = db.departments
      .getAll()
      .filter(d => includeInactive || d.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(departments);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch departments.' });
  }
});

// POST /api/masters/departments
router.post('/departments', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Department name is required.' });
    if (db.departments.findByName(name)) {
      return res.status(400).json({ error: `A department named '${name}' already exists.` });
    }

    const timestamp = new Date().toISOString();
    const department: Department = {
      id: crypto.randomUUID(),
      name,
      code: req.body.code ? String(req.body.code).trim().toUpperCase() : undefined,
      isActive: req.body.isActive !== false,
      remarks: req.body.remarks ? String(req.body.remarks).trim() : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.departments.create(department);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DEPARTMENT_CREATED',
      module: 'Master Data',
      recordId: department.id,
      description: `Created department '${department.name}'.`,
    });
    res.status(201).json(department);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create the department.' });
  }
});

// PUT /api/masters/departments/:id
router.put('/departments/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.departments.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Department not found.' });

    const updates: Partial<Department> = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Department name cannot be empty.' });
      const clash = db.departments.findByName(name);
      if (clash && clash.id !== existing.id) {
        return res.status(400).json({ error: `A department named '${name}' already exists.` });
      }
      updates.name = name;
    }
    if (req.body.code !== undefined) updates.code = String(req.body.code).trim().toUpperCase();
    if (req.body.remarks !== undefined) updates.remarks = String(req.body.remarks).trim();
    if (req.body.isActive !== undefined) updates.isActive = !!req.body.isActive;

    const result = await db.departments.update(existing.id, updates);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DEPARTMENT_UPDATED',
      module: 'Master Data',
      recordId: existing.id,
      description: `Updated department '${existing.name}'.`,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update the department.' });
  }
});

// DELETE /api/masters/departments/:id
router.delete('/departments/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.departments.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Department not found.' });

    const designations = db.designations.getAll().filter(d => d.departmentId === existing.id);
    if (designations.length > 0) {
      return res.status(400).json({
        error: `Cannot delete department '${existing.name}': it has ${designations.length} linked designation(s). Reassign them first.`
      });
    }

    await db.departments.delete(req.params.id);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DEPARTMENT_DELETED',
      module: 'Master Data',
      recordId: req.params.id,
      description: `Deleted department '${existing.name}'.`,
    });
    res.json({ success: true, message: `Department '${existing.name}' deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete department.' });
  }
});

// PATCH /api/masters/departments/:id/toggle-status
router.patch('/departments/:id/toggle-status', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.departments.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Department not found.' });

    const newStatus = !existing.isActive;
    const result = await db.departments.update(existing.id, { isActive: newStatus });
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DEPARTMENT_STATUS_TOGGLED',
      module: 'Master Data',
      recordId: existing.id,
      description: `Toggled status of department '${existing.name}' to ${newStatus ? 'Active' : 'Inactive'}.`,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle department status.' });
  }
});

// GET /api/masters/designations
router.get('/designations', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const departments = db.departments.getAll();
    const designations = db.designations
      .getAll()
      .filter(d => includeInactive || d.isActive)
      .map(d => ({
        ...d,
        departmentName: departments.find(dep => dep.id === d.departmentId)?.name || null,
        // How many employees currently carry this title, so a role cannot be retired
        // blindly and an unused one is visible as such.
        employeeCount: usageCount(d.title),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    res.json(designations);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch designations.' });
  }
});

// POST /api/masters/designations
router.post('/designations', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Designation title is required.' });
    if (db.designations.findByTitle(title)) {
      return res.status(400).json({ error: `A designation titled '${title}' already exists.` });
    }
    const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
    if (departmentId && !db.departments.findById(departmentId)) {
      return res.status(400).json({ error: 'The selected department does not exist.' });
    }

    const timestamp = new Date().toISOString();
    const designation: Designation = {
      id: crypto.randomUUID(),
      title,
      departmentId,
      isActive: req.body.isActive !== false,
      remarks: req.body.remarks ? String(req.body.remarks).trim() : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.designations.create(designation);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DESIGNATION_CREATED',
      module: 'Master Data',
      recordId: designation.id,
      description: `Created designation '${designation.title}'.`,
    });
    res.status(201).json(designation);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create the designation.' });
  }
});

// PUT /api/masters/designations/:id
router.put('/designations/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const updates: Partial<Designation> = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'Designation title cannot be empty.' });
      const clash = db.designations.findByTitle(title);
      if (clash && clash.id !== existing.id) {
        return res.status(400).json({ error: `A designation titled '${title}' already exists.` });
      }
      updates.title = title;
    }
    if (req.body.departmentId !== undefined) {
      const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
      if (departmentId && !db.departments.findById(departmentId)) {
        return res.status(400).json({ error: 'The selected department does not exist.' });
      }
      updates.departmentId = departmentId;
    }
    if (req.body.remarks !== undefined) updates.remarks = String(req.body.remarks).trim();
    if (req.body.isActive !== undefined) {
      const nextActive = !!req.body.isActive;
      // Retiring a title that people still hold would leave those employees pointing at a
      // role no longer offered for selection, so it is refused with the count that proves it.
      if (!nextActive && existing.isActive) {
        const inUse = usageCount(existing.title);
        if (inUse > 0) {
          return res.status(400).json({
            error: `'${existing.title}' is still held by ${inUse} employee(s). Move them to another designation before retiring this one.`,
            employeeCount: inUse,
          });
        }
      }
      updates.isActive = nextActive;
    }

    const result = await db.designations.update(existing.id, updates);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DESIGNATION_UPDATED',
      module: 'Master Data',
      recordId: existing.id,
      description: `Updated designation '${existing.title}'.`,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update the designation.' });
  }
});

// DELETE /api/masters/designations/:id
router.delete('/designations/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const inUse = usageCount(existing.title);
    if (inUse > 0) {
      return res.status(400).json({
        error: `Cannot delete designation '${existing.title}': it is currently assigned to ${inUse} employee(s). Reassign them first.`
      });
    }

    await db.designations.delete(req.params.id);
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DESIGNATION_DELETED',
      module: 'Master Data',
      recordId: req.params.id,
      description: `Deleted designation '${existing.title}'.`,
    });
    res.json({ success: true, message: `Designation '${existing.title}' deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete designation.' });
  }
});

// PATCH /api/masters/designations/:id/toggle-status
router.patch('/designations/:id/toggle-status', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const newStatus = !existing.isActive;
    if (!newStatus) {
      const inUse = usageCount(existing.title);
      if (inUse > 0) {
        return res.status(400).json({
          error: `'${existing.title}' is still held by ${inUse} employee(s). Move them to another designation before deactivating this one.`
        });
      }
    }
    const result = await db.designations.update(existing.id, { isActive: newStatus });
    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll Manager',
      action: 'DESIGNATION_STATUS_TOGGLED',
      module: 'Master Data',
      recordId: existing.id,
      description: `Toggled status of designation '${existing.title}' to ${newStatus ? 'Active' : 'Inactive'}.`,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle designation status.' });
  }
});

// =================================================================
// CENTRAL MASTER DATA API: COMPANIES
// =================================================================
router.get('/companies', (req, res) => {
  res.json(companiesStore);
});

router.post('/companies', (req, res) => {
  try {
    const { companyCode, companyName, legalName, crNumber, country, currency, taxId, address, contactEmail, contactPhone, isActive } = req.body;
    if (!companyCode || !companyName) {
      return res.status(400).json({ error: 'Company Code and Company Name are required.' });
    }
    const code = String(companyCode).trim().toUpperCase();
    if (companiesStore.some(c => c.companyCode.toUpperCase() === code)) {
      return res.status(400).json({ error: `Company with code '${code}' already exists.` });
    }
    const now = new Date().toISOString();
    const newCompany: CompanyMaster = {
      id: `comp-${crypto.randomUUID().slice(0, 8)}`,
      companyCode: code,
      companyName: String(companyName).trim(),
      legalName: legalName ? String(legalName).trim() : undefined,
      crNumber: crNumber ? String(crNumber).trim() : undefined,
      country: country ? String(country).trim() : 'Oman',
      currency: currency ? String(currency).trim().toUpperCase() : 'OMR',
      taxId: taxId ? String(taxId).trim() : undefined,
      address: address ? String(address).trim() : undefined,
      contactEmail: contactEmail ? String(contactEmail).trim() : undefined,
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    companiesStore.push(newCompany);
    res.status(201).json(newCompany);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create company.' });
  }
});

router.put('/companies/:id', (req, res) => {
  try {
    const idx = companiesStore.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const existing = companiesStore[idx];
    const updated: CompanyMaster = {
      ...existing,
      ...req.body,
      id: existing.id,
      companyCode: req.body.companyCode ? String(req.body.companyCode).trim().toUpperCase() : existing.companyCode,
      companyName: req.body.companyName ? String(req.body.companyName).trim() : existing.companyName,
      updatedAt: new Date().toISOString()
    };
    companiesStore[idx] = updated;
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update company.' });
  }
});

router.delete('/companies/:id', (req, res) => {
  const idx = companiesStore.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Company not found.' });
  const [removed] = companiesStore.splice(idx, 1);
  res.json({ success: true, message: `Company '${removed.companyName}' removed successfully.` });
});

router.patch('/companies/:id/toggle-status', (req, res) => {
  const comp = companiesStore.find(c => c.id === req.params.id);
  if (!comp) return res.status(404).json({ error: 'Company not found.' });
  comp.isActive = !comp.isActive;
  comp.updatedAt = new Date().toISOString();
  res.json(comp);
});

// =================================================================
// CENTRAL MASTER DATA API: TRADES
// =================================================================
router.get('/trades', (req, res) => {
  res.json(tradesStore);
});

router.post('/trades', (req, res) => {
  try {
    const { tradeCode, tradeName, category, isActive } = req.body;
    if (!tradeCode || !tradeName) {
      return res.status(400).json({ error: 'Trade Code and Trade Name are required.' });
    }
    const code = String(tradeCode).trim().toUpperCase();
    if (tradesStore.some(t => t.tradeCode.toUpperCase() === code)) {
      return res.status(400).json({ error: `Trade with code '${code}' already exists.` });
    }
    const now = new Date().toISOString();
    const newTrade: TradeMaster = {
      id: `trd-${crypto.randomUUID().slice(0, 8)}`,
      tradeCode: code,
      tradeName: String(tradeName).trim(),
      category: category || 'Civil',
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    tradesStore.push(newTrade);
    res.status(201).json(newTrade);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create trade.' });
  }
});

router.put('/trades/:id', (req, res) => {
  try {
    const idx = tradesStore.findIndex(t => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Trade not found.' });
    }
    const existing = tradesStore[idx];
    const updated: TradeMaster = {
      ...existing,
      ...req.body,
      id: existing.id,
      tradeCode: req.body.tradeCode ? String(req.body.tradeCode).trim().toUpperCase() : existing.tradeCode,
      tradeName: req.body.tradeName ? String(req.body.tradeName).trim() : existing.tradeName,
      updatedAt: new Date().toISOString()
    };
    tradesStore[idx] = updated;
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update trade.' });
  }
});

router.delete('/trades/:id', (req, res) => {
  const idx = tradesStore.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Trade not found.' });
  const [removed] = tradesStore.splice(idx, 1);
  res.json({ success: true, message: `Trade '${removed.tradeName}' removed successfully.` });
});

router.patch('/trades/:id/toggle-status', (req, res) => {
  const item = tradesStore.find(t => t.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Trade not found.' });
  item.isActive = !item.isActive;
  item.updatedAt = new Date().toISOString();
  res.json(item);
});

// =================================================================
// CENTRAL MASTER DATA API: GEOFENCES / PROJECT LOCATIONS
// =================================================================
router.get('/geofences', (req, res) => {
  const { projectId } = req.query;
  if (projectId) {
    return res.json(geofencesStore.filter(g => g.projectId === projectId));
  }
  res.json(geofencesStore);
});

router.post('/geofences', (req, res) => {
  try {
    const { projectId, locationCode, locationName, locationType, latitude, longitude, radiusMeters, isPrimary, isActive, effectiveFrom } = req.body;
    if (!projectId || !locationCode || !locationName) {
      return res.status(400).json({ error: 'Project, Location Code, and Location Name are required.' });
    }
    const code = String(locationCode).trim().toUpperCase();
    const now = new Date().toISOString();
    const newLocation: ProjectGeofenceLocation = {
      id: `geo-${crypto.randomUUID().slice(0, 8)}`,
      projectId: String(projectId),
      locationCode: code,
      locationName: String(locationName).trim(),
      locationType: locationType || 'Main Gate',
      latitude: Number(latitude) || 23.588,
      longitude: Number(longitude) || 58.3829,
      radiusMeters: Number(radiusMeters) || 300,
      isPrimary: !!isPrimary,
      isActive: isActive !== false,
      effectiveFrom: effectiveFrom || now.split('T')[0],
      createdAt: now,
      updatedAt: now
    };
    // If set as primary, unmark other primary gates for this project
    if (newLocation.isPrimary) {
      geofencesStore.forEach(g => {
        if (g.projectId === newLocation.projectId) g.isPrimary = false;
      });
    }
    geofencesStore.push(newLocation);
    res.status(201).json(newLocation);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create geofence location.' });
  }
});

router.put('/geofences/:id', (req, res) => {
  try {
    const idx = geofencesStore.findIndex(g => g.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Geofence location not found.' });
    }
    const existing = geofencesStore[idx];
    const isPrimary = req.body.isPrimary !== undefined ? !!req.body.isPrimary : existing.isPrimary;
    const projectId = req.body.projectId || existing.projectId;

    if (isPrimary) {
      geofencesStore.forEach(g => {
        if (g.projectId === projectId && g.id !== existing.id) g.isPrimary = false;
      });
    }

    const updated: ProjectGeofenceLocation = {
      ...existing,
      ...req.body,
      id: existing.id,
      projectId,
      isPrimary,
      updatedAt: new Date().toISOString()
    };
    geofencesStore[idx] = updated;
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update geofence location.' });
  }
});

router.delete('/geofences/:id', (req, res) => {
  const idx = geofencesStore.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Geofence location not found.' });
  const [removed] = geofencesStore.splice(idx, 1);
  res.json({ success: true, message: `Geofence location '${removed.locationName}' removed successfully.` });
});

router.patch('/geofences/:id/toggle-status', (req, res) => {
  const item = geofencesStore.find(g => g.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Geofence location not found.' });
  item.isActive = !item.isActive;
  item.updatedAt = new Date().toISOString();
  res.json(item);
});

// Aliases for /locations -> /geofences
router.get('/locations', (req, res) => {
  const { projectId } = req.query;
  if (projectId) {
    return res.json(geofencesStore.filter(g => g.projectId === projectId));
  }
  res.json(geofencesStore);
});
router.post('/locations', (req, res, next) => {
  req.url = '/geofences';
  router(req, res, next);
});
router.put('/locations/:id', (req, res, next) => {
  req.url = `/geofences/${req.params.id}`;
  router(req, res, next);
});
router.delete('/locations/:id', (req, res, next) => {
  req.url = `/geofences/${req.params.id}`;
  router(req, res, next);
});
router.patch('/locations/:id/toggle-status', (req, res, next) => {
  req.url = `/geofences/${req.params.id}/toggle-status`;
  router(req, res, next);
});

// =================================================================
// CENTRAL MASTER DATA API: PAY-GRADES
// =================================================================
router.get('/pay-grades', (req, res) => {
  const includeInactive = String(req.query.includeInactive || '') === 'true';
  const list = payGradesStore
    .filter(g => includeInactive || g.isActive)
    .sort((a, b) => b.minimumSalary - a.minimumSalary);
  res.json(list);
});

router.post('/pay-grades', (req, res) => {
  try {
    const { gradeCode, gradeName, minimumSalary, maximumSalary, currency, standardAllowance, description, isActive } = req.body;
    if (!gradeCode || !gradeName) {
      return res.status(400).json({ error: 'Grade Code and Grade Name are required.' });
    }
    const code = String(gradeCode).trim().toUpperCase();
    if (payGradesStore.some(g => g.gradeCode.toUpperCase() === code)) {
      return res.status(400).json({ error: `Pay Grade with code '${code}' already exists.` });
    }
    const min = Number(minimumSalary) || 0;
    const max = Number(maximumSalary) || 0;
    if (max > 0 && max < min) {
      return res.status(400).json({ error: 'Maximum salary cannot be less than minimum salary.' });
    }

    const now = new Date().toISOString();
    const newGrade: PayGrade = {
      id: `grd-${crypto.randomUUID().slice(0, 8)}`,
      gradeCode: code,
      gradeName: String(gradeName).trim(),
      minimumSalary: min,
      maximumSalary: max,
      currency: currency ? String(currency).trim().toUpperCase() : 'OMR',
      standardAllowance: standardAllowance !== undefined ? Number(standardAllowance) : 0,
      description: description ? String(description).trim() : '',
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    payGradesStore.push(newGrade);
    res.status(201).json(newGrade);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create pay grade.' });
  }
});

router.put('/pay-grades/:id', (req, res) => {
  try {
    const idx = payGradesStore.findIndex(g => g.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Pay grade not found.' });
    }
    const existing = payGradesStore[idx];
    const updated: PayGrade = {
      ...existing,
      ...req.body,
      id: existing.id,
      gradeCode: req.body.gradeCode ? String(req.body.gradeCode).trim().toUpperCase() : existing.gradeCode,
      gradeName: req.body.gradeName ? String(req.body.gradeName).trim() : existing.gradeName,
      minimumSalary: req.body.minimumSalary !== undefined ? Number(req.body.minimumSalary) : existing.minimumSalary,
      maximumSalary: req.body.maximumSalary !== undefined ? Number(req.body.maximumSalary) : existing.maximumSalary,
      standardAllowance: req.body.standardAllowance !== undefined ? Number(req.body.standardAllowance) : existing.standardAllowance,
      updatedAt: new Date().toISOString()
    };
    payGradesStore[idx] = updated;
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update pay grade.' });
  }
});

router.delete('/pay-grades/:id', (req, res) => {
  const idx = payGradesStore.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Pay grade not found.' });
  const [removed] = payGradesStore.splice(idx, 1);
  res.json({ success: true, message: `Pay grade '${removed.gradeName}' removed successfully.` });
});

router.patch('/pay-grades/:id/toggle-status', (req, res) => {
  const grade = payGradesStore.find(g => g.id === req.params.id);
  if (!grade) return res.status(404).json({ error: 'Pay grade not found.' });
  grade.isActive = !grade.isActive;
  grade.updatedAt = new Date().toISOString();
  res.json(grade);
});

// =================================================================
// CENTRAL MASTER DATA API: LEAVE-TYPES
// =================================================================
router.get('/leave-types', (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const types = db.leaveTypes.getAll()
      .filter(t => includeInactive || t.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave types.' });
  }
});

router.post('/leave-types', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, isPaid, annualEntitlementDays, remarks, isActive } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Leave type code and name are required.' });
    }
    const cleanCode = String(code).trim().toUpperCase();
    if (db.leaveTypes.findByCode(cleanCode)) {
      return res.status(400).json({ error: `A leave type with code '${cleanCode}' already exists.` });
    }
    const days = Number(annualEntitlementDays ?? 0);
    const timestamp = new Date().toISOString();
    const type: LeaveType = {
      id: crypto.randomUUID(),
      code: cleanCode,
      name: String(name).trim(),
      isPaid: isPaid !== false,
      annualEntitlementDays: Math.max(0, Math.round(days)),
      isActive: isActive !== false,
      remarks: remarks ? String(remarks).trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.leaveTypes.create(type);
    res.status(201).json(type);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create leave type.' });
  }
});

router.put('/leave-types/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveTypes.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found.' });

    const { name, isPaid, annualEntitlementDays, remarks, isActive } = req.body;
    const updates: Partial<LeaveType> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (isPaid !== undefined) updates.isPaid = Boolean(isPaid);
    if (remarks !== undefined) updates.remarks = String(remarks).trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (annualEntitlementDays !== undefined) {
      updates.annualEntitlementDays = Math.max(0, Math.round(Number(annualEntitlementDays)));
    }

    const updated = await db.leaveTypes.update(req.params.id, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update leave type.' });
  }
});

router.delete('/leave-types/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveTypes.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found.' });

    const used = db.leaveRequests.getAll().some(r => r.leaveTypeId === req.params.id);
    if (used) {
      return res.status(400).json({
        error: `Cannot delete leave type '${existing.name}': it is referenced in existing employee leave requests. Consider setting it to Inactive instead.`
      });
    }

    await db.leaveTypes.delete(req.params.id);
    res.json({ success: true, message: `Leave type '${existing.name}' deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete leave type.' });
  }
});

router.patch('/leave-types/:id/toggle-status', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = db.leaveTypes.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave type not found.' });

    const updated = await db.leaveTypes.update(req.params.id, { isActive: !existing.isActive });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle leave type status.' });
  }
});

export default router;
