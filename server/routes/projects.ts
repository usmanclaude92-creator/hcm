import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { verifyAuth, requireWritePermission, AuthRequest } from '../auth';
import type { Project } from '../../src/types/index';

const router = Router();

// GET /api/projects - List projects with filters
router.get('/', verifyAuth, (req: AuthRequest, res: Response) => {
  try {
    const { search, status } = req.query;
    let projects = db.projects.getAll();

    if (search) {
      const q = String(search).trim().toLowerCase();
      projects = projects.filter(p =>
        p.projectCode.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q) ||
        (p.remarks && p.remarks.toLowerCase().includes(q))
      );
    }

    if (status && status !== 'ALL') {
      projects = projects.filter(p => p.status === status);
    }

    projects.sort((a, b) => a.projectCode.localeCompare(b.projectCode));
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch projects' });
  }
});

// POST /api/projects - Create project
router.post('/', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { projectCode, projectName, status, startDate, endDate, remarks } = req.body;

    if (!projectCode || !projectName) {
      return res.status(400).json({ error: 'Project Code and Project Name are mandatory.' });
    }

    const normCode = projectCode.trim().toUpperCase();
    const existing = db.projects.findByCode(normCode);
    if (existing) {
      return res.status(400).json({ error: `Project with code '${normCode}' already exists.` });
    }

    const timestamp = new Date().toISOString();
    const newProject: Project = {
      id: crypto.randomUUID(),
      projectCode: normCode,
      projectName: projectName.trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      startDate: startDate || null,
      endDate: endDate || null,
      remarks: remarks ? remarks.trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await db.projects.create(newProject);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PROJECT_CREATED',
      module: 'Project Master',
      recordId: newProject.id,
      description: `Created project ${newProject.projectCode} - ${newProject.projectName}.`,
    });

    res.status(201).json(newProject);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const project = db.projects.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const { projectCode, projectName, status, startDate, endDate, remarks } = req.body;

    if (projectCode) {
      const normCode = projectCode.trim().toUpperCase();
      const existing = db.projects.findByCode(normCode);
      if (existing && existing.id !== id) {
        return res.status(400).json({ error: `Project Code '${normCode}' is already used by another project.` });
      }
    }

    const updates: Partial<Project> = {};
    if (projectCode) updates.projectCode = projectCode.trim().toUpperCase();
    if (projectName) updates.projectName = projectName.trim();
    if (status) updates.status = status;
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (endDate !== undefined) updates.endDate = endDate || null;
    if (remarks !== undefined) updates.remarks = remarks.trim();

    const updated = await db.projects.update(id, updates);

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PROJECT_UPDATED',
      module: 'Project Master',
      recordId: id,
      description: `Updated project ${project.projectCode} details.`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update project' });
  }
});

// PATCH /api/projects/:id/toggle-status
router.patch('/:id/toggle-status', verifyAuth, requireWritePermission, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const project = db.projects.findById(id);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const newStatus = project.status === 'Active' ? 'Inactive' : 'Active';
    const updated = await db.projects.update(id, { status: newStatus });

    await db.audit.log({
      userId: req.user?.id,
      username: req.user?.username || 'User',
      userRole: req.user?.role || 'Payroll User',
      action: 'PROJECT_STATUS_CHANGED',
      module: 'Project Master',
      recordId: id,
      description: `Changed status of project ${project.projectCode} to ${newStatus}.`,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to toggle project status' });
  }
});

export default router;
