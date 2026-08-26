import { createApp } from './server/app';

async function startServer() {
  const app = await createApp();
  const PORT = 3000;

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
