import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { ValidationError } from '../samba/conf';
import { ExecError } from '../exec';
import { log } from '../logger';

/** Wrap an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Terminal error handler: maps known error types onto sensible status codes. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'invalid request',
      detail: error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '),
    });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof ExecError) {
    res.status(500).json({ error: error.message, detail: error.result.stderr.trim() });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  log.error(`unhandled error: ${message}`);
  res.status(500).json({ error: message });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'not found' });
}
