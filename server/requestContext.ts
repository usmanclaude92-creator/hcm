import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

// Per-request context, so anything deep in the stack can reach request metadata without
// it being threaded through every function signature. Used by the audit log: entries for
// payroll, payments, loans and WPS previously carried no IP address because each call
// site had to remember to pass req.ip, and most did not.
export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run(
    {
      ipAddress: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      requestId: Math.random().toString(36).slice(2, 12),
    },
    () => next()
  );
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
