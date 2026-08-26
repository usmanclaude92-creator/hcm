import express, { Express } from 'express';
import path from 'path';
import { db } from './db';
import authRouter from './routes/auth';
import employeesRouter from './routes/employees';
import projectsRouter from './routes/projects';
import attendanceRouter from './routes/attendance';
import payrollRouter from './routes/payroll';
import paymentsRouter from './routes/payments';
import wpsRouter from './routes/wps';
import loansRouter from './routes/loans';
import dashboardRouter from './routes/dashboard';
import reportsRouter from './routes/reports';
import auditRouter from './routes/audit';
import usersRouter from './routes/users';

// Builds the Express app and ensures the database is initialized. Shared by the
// traditional long-running entrypoint (server.ts) and the Vercel serverless
// entrypoint (api/index.ts) so both stay in sync.
export async function createApp(): Promise<Express> {
  const app = express();

  await db.init();

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/wps', wpsRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/users', usersRouter);

  app.get('/api/system/status', (req, res) => {
    try {
      const isPg = Boolean(process.env.DATABASE_URL);
      const employeesCount = db.employees.getAll().length;
      const projectsCount = db.projects.getAll().length;
      const payrollsCount = db.payroll.getAll().length;
      const paymentsCount = db.salaryPayments.getAll().length;
      const loansCount = db.loans.getAll().length;

      res.json({
        status: 'online',
        environment: process.env.NODE_ENV || 'development',
        databaseEngine: isPg ? 'PostgreSQL (Cloud Database)' : 'Persistent Storage Engine (Cloud & Server Ready)',
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
