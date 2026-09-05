import 'dotenv/config';
import { createApp } from './server/app';

async function startServer() {
  const app = await createApp();
  const PORT = 3000;

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`Employee & Payroll Management System Server`);
    console.log(`Running at: http://0.0.0.0:${PORT}`);
    console.log(`Currency Precision: OMR 3-Decimals`);
    console.log(`=======================================================`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please terminate any duplicate instance.`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  const cleanup = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
