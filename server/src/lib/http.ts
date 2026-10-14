import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

/** Throw this from a route to send a clear error message to the app. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Item') => new HttpError(404, `${what} not found`);
export const forbidden = () => new HttpError(403, "You don't have access to this");

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Some fields are missing or wrong',
      fields: Object.fromEntries(err.issues.map(i => [i.path.join('.'), i.message]))
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  // A malformed id in the address (e.g. /leaves/abc) reaches the database as NaN
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request body is not valid JSON' });
    return;
  }
  if (err?.name === 'MulterError') {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 5 MB' : err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
};
