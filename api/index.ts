import type { IncomingMessage, ServerResponse } from 'http';
import type { Express } from 'express';
import { createApp } from '../server/app';

// Reused across warm invocations of the same serverless instance; a fresh
// cold start creates a new module scope (and a new promise) automatically.
let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
