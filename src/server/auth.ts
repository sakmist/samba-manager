import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { getAdminUser, paths, runtime, verifyPassword } from './config';
import { log } from './logger';
import { writeJsonPrivate } from './util/atomic';

/**
 * Cookie based session auth for the management console. Tokens are signed with
 * a per-installation secret and carry their own expiry, so no server side
 * session store is required.
 */

const COOKIE_NAME = 'samba_manager_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const secretFile = () => join(paths.dataDir, 'session-secret');

let cachedSecret: Buffer | null = null;

function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  if (existsSync(secretFile())) {
    cachedSecret = Buffer.from(readFileSync(secretFile(), 'utf8').trim(), 'hex');
  } else {
    cachedSecret = randomBytes(32);
    writeJsonPrivate(secretFile(), cachedSecret.toString('hex'));
  }
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function issueToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: username, exp: Date.now() + SESSION_TTL_MS }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

export function currentUser(req: Request): string | null {
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

export function checkCredentials(username: string, password: string): boolean {
  if (username !== getAdminUser()) return false;
  return verifyPassword(password);
}

export function setSessionCookie(res: Response, username: string): void {
  const token = issueToken(username);
  const secure = runtime.trustProxy ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000,
    )}${secure}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

/** Guard for every /api route except the auth endpoints. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (runtime.authDisabled) {
    next();
    return;
  }
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  next();
}

/** True when the request carries the session cookie (used by /api/auth/me). */
export function isAuthenticated(req: Request): boolean {
  return runtime.authDisabled || currentUser(req) !== null;
}

log.debug('auth module ready');
