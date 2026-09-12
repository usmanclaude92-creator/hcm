import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db.js';
import { verifyAuth, AuthRequest, requireRoles } from '../auth.js';
import type {
  Department,
  Designation,
  CompanyMaster,
  TradeMaster,
  ProjectGeofenceLocation
} from '../../src/types/index';

const router = Router();

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

export default router;
