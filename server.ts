import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import authRouter from './server/routes/auth';
import employeesRouter from './server/routes/employees';
import projectsRouter from './server/routes/projects';
import attendanceRouter from './server/routes/attendance';
import payrollRouter from './server/routes/payroll';
import paymentsRouter from './server/routes/payments';
import wpsRouter from './server/routes/wps';
import loansRouter from './server/routes/loans';
import dashboardRouter from './server/routes/dashboard';
import reportsRouter from './server/routes/reports';
import auditRouter from './server/routes/audit';
import usersRouter from './server/routes/users';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB & ensure schema / seeds
  await db.init();

  // JSON payload parser with generous limit for base64 attachments / Excel imports
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API Routes
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

  // System & Health Status Endpoint
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

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`Employee & Payroll Management System Server`);
    console.log(`Running at: http://0.0.0.0:${PORT}`);
    console.log(`Currency Precision: OMR 3-Decimals`);
    console.log(`=======================================================`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
