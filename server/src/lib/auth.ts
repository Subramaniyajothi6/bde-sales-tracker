import type { Request, Response, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import { db } from './db.js';
import { env, isProd } from './env.js';
import { HttpError } from './http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: User }
  }
}

const COOKIE = 'session';
const MAX_AGE_DAYS = 7;

interface TokenBody { sub: number; v: number }

/** Log the user in by setting an httpOnly cookie the browser sends back automatically. */
export function startSession(res: Response, user: User) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion } satisfies TokenBody, env.JWT_SECRET, { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: MAX_AGE_DAYS * 864e5,
    path: '/'
  });
}

export function endSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** The logged-in user from the session cookie, or null. Deactivated users and old sessions count as logged out. */
export async function sessionUser(req: Request): Promise<User | null> {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  let body: TokenBody;
  try {
    body = jwt.verify(token, env.JWT_SECRET) as unknown as TokenBody;
  } catch {
    return null;
  }
  const user = await db.user.findUnique({ where: { id: Number(body.sub) } });
  if (!user || !user.active || user.tokenVersion !== body.v) return null;
  return user;
}

/** Every route except login goes through this. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const user = await sessionUser(req);
  if (!user) throw new HttpError(401, req.cookies?.[COOKIE] ? 'Your session has ended. Please log in again.' : 'Please log in');
  req.user = user;
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN') throw new HttpError(403, 'Only admins can do this');
  next();
};

export const requireBde: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'BDE') throw new HttpError(403, 'Only BDEs can do this');
  next();
};

/** The logged-in user. Use only after requireAuth. */
export const me = (req: Request) => req.user!;
export const isAdmin = (req: Request) => req.user?.role === 'ADMIN';

/** Short, readable temporary password, e.g. "Adz7KQ2M49". */
export function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'Adz';
  const bytes = crypto.getRandomValues(new Uint8Array(7));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

/** At least 8 characters with a letter and a number. */
export const strongEnough = (pw: string) => pw.length >= 8 && /\d/.test(pw) && /[a-z]/i.test(pw);
