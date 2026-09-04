import express, { Express } from 'express';
import path from 'path';
import { db } from './db.js';
import { verifyAuth } from './auth.js';
import { requestContextMiddleware } from './requestContext.js';
import authRouter from './routes/auth.js';
import employeesRouter from './routes/employees.js';
import projectsRouter from './routes/projects.js';
import attendanceRouter from './routes/attendance.js';
import timesheetsRouter from './routes/timesheets.js';
import cifRouter from './routes/cif.js';
import payrollRouter from './routes/payroll.js';
import paymentsRouter from './routes/payments.js';
import paymentPlanningRouter from './routes/paymentPlanning.js';
import wpsRouter from './routes/wps.js';
import loansRouter from './routes/loans.js';
import dashboardRouter from './routes/dashboard.js';
import reportsRouter from './routes/reports.js';
import auditRouter from './routes/audit.js';
import usersRouter from './routes/users.js';
import complianceRouter from './routes/compliance.js';
import storageRouter from './routes/storage.js';
import leaveRouter from './routes/leave.js';
import gratuityRouter from './routes/gratuity.js';
import mastersRouter from './routes/masters.js';

// Builds the Express app and ensures the database is initialized. Shared by the
// traditional long-running entrypoint (server.ts) and the Vercel serverless
// entrypoint (api/index.ts) so both stay in sync.
export async function createApp(): Promise<Express> {
  const app = express();

  await db.init();

  // Must precede every route so the audit log can reach the caller's IP address without
  // each call site having to pass it.
  app.use(requestContextMiddleware);

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/timesheets', timesheetsRouter);
  app.use('/api/cif', cifRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/payment-planning', paymentPlanningRouter);
  app.use('/api/wps', wpsRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/compliance', complianceRouter);
  app.use('/api/storage', storageRouter);
  app.use('/api/leave', leaveRouter);
  app.use('/api/gratuity', gratuityRouter);
  app.use('/api/masters', mastersRouter);

  // Public, pre-authentication. The sign-in screen used to assert "Production-grade
  // PostgreSQL / Persistent Data Store Enabled" as static text regardless of the truth;
  // it now reads the live state from here. Deliberately carries no record counts, so
  // nothing about the dataset is exposed before sign-in.
  app.get('/api/system/storage', (req, res) => {
    try {
      const dbStatus = db.getStatus();
      res.json({
        engine: dbStatus.storageType,
        isDurable: dbStatus.isDurable,
        warning: dbStatus.storageWarning,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Storage status unavailable.' });
    }
  });

  app.get('/api/system/status', verifyAuth, (req, res) => {
    try {
      // Report the ACTUAL live connection state (db.getStatus()'s isPostgresConnected),
      // not merely whether a Postgres env var string is present. A set-but-unreachable
      // connection string previously still reported "PostgreSQL (Cloud Database)" here
      // while the app had silently fallen back to the ephemeral local JSON file --
      // exactly the kind of silent split-brain this endpoint exists to catch.
      const dbStatus = db.getStatus();
      const employeesCount = db.employees.getAll().length;
      const projectsCount = db.projects.getAll().length;
      const payrollsCount = db.payroll.getAll().length;
      const paymentsCount = db.salaryPayments.getAll().length;
      const loansCount = db.loans.getAll().length;

      res.json({
        status: 'online',
        environment: process.env.NODE_ENV || 'development',
        databaseEngine: dbStatus.storageType,
        isPostgresConnected: dbStatus.isPostgresConnected,
        currency: 'OMR (Omani Rial)',
        decimalPlaces: 3,
        systemTime: new Date().toISOString(),
        stats: {
          employees: employeesCount,
          projects: projectsCount,
          payrolls: payrollsCount,
          paymentTransactions: paymentsCount,
          loans: loansCount,
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Static/dev-middleware serving is only relevant for the traditional long-running
  // server (server.ts). On Vercel, static assets and the SPA are served directly
  // from the build output, and this app instance only ever handles /api/* requests.
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}
