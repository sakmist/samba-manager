import { Router } from 'express';
import { z } from 'zod';
import { checkCredentials, clearSessionCookie, isAuthenticated, requireAuth, setSessionCookie } from '../auth';
import { getAdminUser, setCredentials, verifyPassword } from '../config';
import { log } from '../logger';
import { asyncHandler } from '../util/http';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.get('/me', (req, res) => {
  const authenticated = isAuthenticated(req);
  res.json({ authenticated, username: authenticated ? getAdminUser() : null });
});

authRouter.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }
  if (!checkCredentials(parsed.data.username, parsed.data.password)) {
    log.warn(`failed login for "${parsed.data.username}" from ${req.ip}`);
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  setSessionCookie(res, parsed.data.username);
  res.json({ authenticated: true, username: parsed.data.username });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

authRouter.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = passwordSchema.parse(req.body);
    if (!verifyPassword(input.currentPassword)) {
      res.status(401).json({ error: 'current password is incorrect' });
      return;
    }
    setCredentials(getAdminUser(), input.newPassword);
    log.info('admin password changed');
    res.json({ ok: true });
  }),
);
