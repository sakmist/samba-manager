import { Router } from 'express';
import { z } from 'zod';
import { createUser, deleteUser, listUsers, setEnabled, setPassword } from '../samba/users';
import { asyncHandler } from '../util/http';

export const usersRouter = Router();

const createSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  fullName: z.string().max(120).default(''),
});

const passwordSchema = z.object({ password: z.string().min(6) });
const enabledSchema = z.object({ enabled: z.boolean() });

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    await createUser(input.username, input.password, input.fullName);
    res.status(201).json({ username: input.username });
  }),
);

usersRouter.put(
  '/:name/password',
  asyncHandler(async (req, res) => {
    const input = passwordSchema.parse(req.body);
    await setPassword(req.params.name, input.password);
    res.json({ ok: true });
  }),
);

usersRouter.put(
  '/:name/enabled',
  asyncHandler(async (req, res) => {
    const input = enabledSchema.parse(req.body);
    await setEnabled(req.params.name, input.enabled);
    res.json({ username: req.params.name, enabled: input.enabled });
  }),
);

usersRouter.delete(
  '/:name',
  asyncHandler(async (req, res) => {
    const removeSystem = String(req.query.removeSystem ?? '').toLowerCase() === 'true';
    const outcome = await deleteUser(req.params.name, removeSystem);
    res.json({ deleted: req.params.name, ...outcome });
  }),
);
