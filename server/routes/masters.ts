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
} from '../../src/types/index';
import {
  listLeaveTypes,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType,
  toggleLeaveTypeStatus,
} from '../services/leaveTypes.js';

const router = Router();

// Pay Grades, Companies, Trades, and Geofences used to be in-memory arrays here
// (payGradesStore/companiesStore/tradesStore/geofencesStore) that reset to seed data on
// every deploy or cold start -- unlike every other master below, which is durable. They
// now all live directly in the normalized Postgres tables (companies, trades, pay_grades,
// project_geofence_locations) when connected, via db.payGrades / db.companies / db.trades
// / db.geofences (see server/db.ts), with the app_state-backed in-memory store kept only
// as an offline/local-dev fallback.

// Organisation master data: departments and designations. Designation used to be typed
// free-hand on every employee record, so "Site Engineer", "site engineer" and "Snr Site
// Eng." were three different roles as far as any report was concerned. The master is the
// governed list; the employee record still stores the title as text, so nothing had to be
// migrated and an existing record is never invalidated by a rename here.

async function usageCount(title: string): Promise<number> {
  const norm = title.trim().toLowerCase();
  return (await db.employees.getAll()).filter(e => String(e.designation || '').trim().toLowerCase() === norm).length;
}

// GET /api/masters/departments
router.get('/departments', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const departments = (await db.departments.getAll())
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
    if (await db.departments.findByName(name)) {
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
    const existing = await db.departments.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Department not found.' });

    const updates: Partial<Department> = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Department name cannot be empty.' });
      const clash = await db.departments.findByName(name);
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
    const existing = await db.departments.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Department not found.' });

    const designations = (await db.designations.getAll()).filter(d => d.departmentId === existing.id);
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
    const existing = await db.departments.findById(req.params.id);
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
router.get('/designations', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const departments = await db.departments.getAll();
    const allEmployees = await db.employees.getAll();
    const countByTitle = (title: string) => {
      const norm = title.trim().toLowerCase();
      return allEmployees.filter(e => String(e.designation || '').trim().toLowerCase() === norm).length;
    };
    const designations = (await db.designations.getAll())
      .filter(d => includeInactive || d.isActive)
      .map(d => ({
        ...d,
        departmentName: departments.find(dep => dep.id === d.departmentId)?.name || null,
        // How many employees currently carry this title, so a role cannot be retired
        // blindly and an unused one is visible as such.
        employeeCount: countByTitle(d.title),
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
    if (await db.designations.findByTitle(title)) {
      return res.status(400).json({ error: `A designation titled '${title}' already exists.` });
    }
    const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
    if (departmentId && !(await db.departments.findById(departmentId))) {
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
    const existing = await db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const updates: Partial<Designation> = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ error: 'Designation title cannot be empty.' });
      const clash = await db.designations.findByTitle(title);
      if (clash && clash.id !== existing.id) {
        return res.status(400).json({ error: `A designation titled '${title}' already exists.` });
      }
      updates.title = title;
    }
    if (req.body.departmentId !== undefined) {
      const departmentId = req.body.departmentId ? String(req.body.departmentId) : null;
      if (departmentId && !(await db.departments.findById(departmentId))) {
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
        const inUse = await usageCount(existing.title);
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
    const existing = await db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const inUse = await usageCount(existing.title);
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
    const existing = await db.designations.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Designation not found.' });

    const newStatus = !existing.isActive;
    if (!newStatus) {
      const inUse = await usageCount(existing.title);
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
// Backed by db.companies -- the normalized `companies` Postgres table (previously an
// in-memory array that reset to fake demo companies on every deploy). See server/db.ts.
// =================================================================
router.get('/companies', async (req, res) => {
  try {
    res.json(await db.companies.getAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch companies.' });
  }
});

router.post('/companies', async (req, res) => {
  try {
    const { companyCode, companyName, legalName, crNumber, country, currency, taxId, address, contactEmail, contactPhone, isActive } = req.body;
    if (!companyCode || !companyName) {
      return res.status(400).json({ error: 'Company Code and Company Name are required.' });
    }
    const code = String(companyCode).trim().toUpperCase();
    if (await db.companies.findByCode(code)) {
      return res.status(400).json({ error: `Company with code '${code}' already exists.` });
    }
    const now = new Date().toISOString();
    const newCompany: CompanyMaster = {
      id: crypto.randomUUID(),
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
    await db.companies.create(newCompany);
    res.status(201).json(newCompany);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create company.' });
  }
});

router.put('/companies/:id', async (req, res) => {
  try {
    const existing = await db.companies.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    const updates: Partial<CompanyMaster> = {
      ...req.body,
      companyCode: req.body.companyCode ? String(req.body.companyCode).trim().toUpperCase() : existing.companyCode,
      companyName: req.body.companyName ? String(req.body.companyName).trim() : existing.companyName,
    };
    delete (updates as any).id;
    const updated = await db.companies.update(existing.id, updates);
    if (!updated) return res.status(404).json({ error: 'Company not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update company.' });
  }
});

router.delete('/companies/:id', async (req, res) => {
  try {
    const existing = await db.companies.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Company not found.' });
    const removed = await db.companies.delete(existing.id);
    if (!removed) return res.status(404).json({ error: 'Company not found.' });
    res.json({ success: true, message: `Company '${existing.companyName}' removed successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete company.' });
  }
});

router.patch('/companies/:id/toggle-status', async (req, res) => {
  try {
    const existing = await db.companies.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Company not found.' });
    const updated = await db.companies.update(existing.id, { isActive: !existing.isActive });
    if (!updated) return res.status(404).json({ error: 'Company not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle company status.' });
  }
});

// =================================================================
// CENTRAL MASTER DATA API: TRADES
// Backed by db.trades -- the normalized `trades` Postgres table (previously an in-memory
// array with no persistence at all). See server/db.ts.
// =================================================================
router.get('/trades', async (req, res) => {
  try {
    res.json(await db.trades.getAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch trades.' });
  }
});

router.post('/trades', async (req, res) => {
  try {
    const { tradeCode, tradeName, category, isActive } = req.body;
    if (!tradeCode || !tradeName) {
      return res.status(400).json({ error: 'Trade Code and Trade Name are required.' });
    }
    const code = String(tradeCode).trim().toUpperCase();
    if (await db.trades.findByCode(code)) {
      return res.status(400).json({ error: `Trade with code '${code}' already exists.` });
    }
    const now = new Date().toISOString();
    const newTrade: TradeMaster = {
      id: crypto.randomUUID(),
      tradeCode: code,
      tradeName: String(tradeName).trim(),
      category: category || 'Civil',
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now
    };
    await db.trades.create(newTrade);
    res.status(201).json(newTrade);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create trade.' });
  }
});

router.put('/trades/:id', async (req, res) => {
  try {
    const existing = await db.trades.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Trade not found.' });
    }
    const updates: Partial<TradeMaster> = {
      ...req.body,
      tradeCode: req.body.tradeCode ? String(req.body.tradeCode).trim().toUpperCase() : existing.tradeCode,
      tradeName: req.body.tradeName ? String(req.body.tradeName).trim() : existing.tradeName,
    };
    delete (updates as any).id;
    const updated = await db.trades.update(existing.id, updates);
    if (!updated) return res.status(404).json({ error: 'Trade not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update trade.' });
  }
});

router.delete('/trades/:id', async (req, res) => {
  try {
    const existing = await db.trades.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Trade not found.' });
    const removed = await db.trades.delete(existing.id);
    if (!removed) return res.status(404).json({ error: 'Trade not found.' });
    res.json({ success: true, message: `Trade '${existing.tradeName}' removed successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete trade.' });
  }
});

router.patch('/trades/:id/toggle-status', async (req, res) => {
  try {
    const existing = await db.trades.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Trade not found.' });
    const updated = await db.trades.update(existing.id, { isActive: !existing.isActive });
    if (!updated) return res.status(404).json({ error: 'Trade not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle trade status.' });
  }
});

// =================================================================
// CENTRAL MASTER DATA API: GEOFENCES / PROJECT LOCATIONS
// Backed by db.geofences -- the normalized `project_geofence_locations` Postgres table.
// =================================================================
router.get('/geofences', async (req, res) => {
  try {
    const { projectId } = req.query;
    const all = await db.geofences.getAll();
    if (projectId) {
      return res.json(all.filter(g => g.projectId === projectId));
    }
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch geofence locations.' });
  }
});

router.post('/geofences', async (req, res) => {
  try {
    const { projectId, locationCode, locationName, locationType, latitude, longitude, radiusMeters, isPrimary, isActive, effectiveFrom } = req.body;
    if (!projectId || !locationCode || !locationName) {
      return res.status(400).json({ error: 'Project, Location Code, and Location Name are required.' });
    }
    const code = String(locationCode).trim().toUpperCase();
    const now = new Date().toISOString();
    const newLocation: ProjectGeofenceLocation = {
      id: crypto.randomUUID(),
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
    // db.geofences.create() unmarks other primary gates for this project internally.
    await db.geofences.create(newLocation);
    res.status(201).json(newLocation);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create geofence location.' });
  }
});

router.put('/geofences/:id', async (req, res) => {
  try {
    const existing = await db.geofences.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Geofence location not found.' });
    }
    const updated = await db.geofences.update(existing.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Geofence location not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update geofence location.' });
  }
});

router.delete('/geofences/:id', async (req, res) => {
  try {
    const existing = await db.geofences.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Geofence location not found.' });
    const removed = await db.geofences.delete(existing.id);
    if (!removed) return res.status(404).json({ error: 'Geofence location not found.' });
    res.json({ success: true, message: `Geofence location '${existing.locationName}' removed successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete geofence location.' });
  }
});

router.patch('/geofences/:id/toggle-status', async (req, res) => {
  try {
    const existing = await db.geofences.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Geofence location not found.' });
    const updated = await db.geofences.update(existing.id, { isActive: !existing.isActive });
    if (!updated) return res.status(404).json({ error: 'Geofence location not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle geofence location status.' });
  }
});

// Aliases for /locations -> /geofences
router.get('/locations', async (req, res) => {
  try {
    const { projectId } = req.query;
    const all = await db.geofences.getAll();
    if (projectId) {
      return res.json(all.filter(g => g.projectId === projectId));
    }
    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch locations.' });
  }
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
// Backed by db.payGrades -- the normalized `pay_grades` Postgres table.
// =================================================================
router.get('/pay-grades', async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const list = (await db.payGrades.getAll())
      .filter(g => includeInactive || g.isActive)
      .sort((a, b) => b.minimumSalary - a.minimumSalary);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pay grades.' });
  }
});

router.post('/pay-grades', async (req, res) => {
  try {
    const { gradeCode, gradeName, minimumSalary, maximumSalary, currency, standardAllowance, description, isActive } = req.body;
    if (!gradeCode || !gradeName) {
      return res.status(400).json({ error: 'Grade Code and Grade Name are required.' });
    }
    const code = String(gradeCode).trim().toUpperCase();
    if (await db.payGrades.findByCode(code)) {
      return res.status(400).json({ error: `Pay Grade with code '${code}' already exists.` });
    }
    const min = Number(minimumSalary) || 0;
    const max = Number(maximumSalary) || 0;
    if (max > 0 && max < min) {
      return res.status(400).json({ error: 'Maximum salary cannot be less than minimum salary.' });
    }

    const now = new Date().toISOString();
    const newGrade: PayGrade = {
      id: crypto.randomUUID(),
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
    await db.payGrades.create(newGrade);
    res.status(201).json(newGrade);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create pay grade.' });
  }
});

router.put('/pay-grades/:id', async (req, res) => {
  try {
    const existing = await db.payGrades.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Pay grade not found.' });
    }
    const updates: Partial<PayGrade> = {
      ...req.body,
      gradeCode: req.body.gradeCode ? String(req.body.gradeCode).trim().toUpperCase() : existing.gradeCode,
      gradeName: req.body.gradeName ? String(req.body.gradeName).trim() : existing.gradeName,
      minimumSalary: req.body.minimumSalary !== undefined ? Number(req.body.minimumSalary) : existing.minimumSalary,
      maximumSalary: req.body.maximumSalary !== undefined ? Number(req.body.maximumSalary) : existing.maximumSalary,
      standardAllowance: req.body.standardAllowance !== undefined ? Number(req.body.standardAllowance) : existing.standardAllowance,
    };
    delete (updates as any).id;
    const updated = await db.payGrades.update(existing.id, updates);
    if (!updated) return res.status(404).json({ error: 'Pay grade not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update pay grade.' });
  }
});

router.delete('/pay-grades/:id', async (req, res) => {
  try {
    const existing = await db.payGrades.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pay grade not found.' });
    const removed = await db.payGrades.delete(existing.id);
    if (!removed) return res.status(404).json({ error: 'Pay grade not found.' });
    res.json({ success: true, message: `Pay grade '${existing.gradeName}' removed successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete pay grade.' });
  }
});

router.patch('/pay-grades/:id/toggle-status', async (req, res) => {
  try {
    const existing = await db.payGrades.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pay grade not found.' });
    const updated = await db.payGrades.update(existing.id, { isActive: !existing.isActive });
    if (!updated) return res.status(404).json({ error: 'Pay grade not found.' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle pay grade status.' });
  }
});

// =================================================================
// CENTRAL MASTER DATA API: LEAVE-TYPES
// =================================================================
// Delegates to server/services/leaveTypes.ts -- shared with /api/leave/types
// (server/routes/leave.ts) so the Leave Management and Master Data Management
// screens can never validate or audit-log a leave type change differently.
router.get('/leave-types', (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    res.json(listLeaveTypes(includeInactive));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch leave types.' });
  }
});

router.post('/leave-types', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const type = await createLeaveType(req.body, req.user!);
    res.status(201).json(type);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create leave type.' });
  }
});

router.put('/leave-types/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateLeaveType(req.params.id, req.body, req.user!);
    res.json(updated);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update leave type.' });
  }
});

router.delete('/leave-types/:id', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { name } = await deleteLeaveType(req.params.id, req.user!);
    res.json({ success: true, message: `Leave type '${name}' deleted successfully.` });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete leave type.' });
  }
});

router.patch('/leave-types/:id/toggle-status', verifyAuth, requireRoles('Administrator', 'Payroll Manager'), async (req: AuthRequest, res: Response) => {
  try {
    const updated = await toggleLeaveTypeStatus(req.params.id, req.user!);
    res.json(updated);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to toggle leave type status.' });
  }
});

export default router;
