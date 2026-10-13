import { Router } from 'express';
import { z } from 'zod';
import { getSettings } from '../config';
import { log } from '../logger';
import { createShare, deleteShare, listShares, updateShare } from '../samba/conf';
import { applyPermissions, statPath } from '../samba/permissions';
import { reloadService, testparm } from '../samba/service';
import { asyncHandler } from '../util/http';

export const sharesRouter = Router();

const shareSchema = z.object({
  name: z.string().min(1).max(32),
  path: z.string().min(1),
  comment: z.string().max(200).default(''),
  browseable: z.boolean().default(true),
  readOnly: z.boolean().default(true),
  guestOk: z.boolean().default(false),
  available: z.boolean().default(true),
  validUsers: z.array(z.string()).default([]),
  writeList: z.array(z.string()).default([]),
  createMask: z.string().default('0664'),
  directoryMask: z.string().default('0775'),
  forceUser: z.string().default(''),
  forceGroup: z.string().default(''),
});

const permissionsSchema = z.object({
  owner: z.string().optional(),
  group: z.string().optional(),
  mode: z.string().optional(),
  recursive: z.boolean().default(false),
  create: z.boolean().default(false),
});

/** Validate the resulting config and reload smbd when the operator opted in. */
async function applyAndReload(): Promise<{ reloaded: boolean; message: string }> {
  const check = await testparm();
  if (!check.ok) {
    log.warn('testparm reported problems after a share change');
    return { reloaded: false, message: check.output.split('\n').slice(0, 6).join('\n') };
  }
  if (!getSettings().autoReload) {
    return { reloaded: false, message: 'auto reload disabled; reload from the System tab' };
  }
  try {
    const message = await reloadService();
    return { reloaded: true, message };
  } catch (error) {
    return { reloaded: false, message: (error as Error).message };
  }
}

sharesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listShares());
  }),
);

sharesRouter.get(
  '/stat',
  asyncHandler(async (req, res) => {
    const target = String(req.query.path ?? '');
    if (!target) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }
    res.json(await statPath(target));
  }),
);

sharesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = shareSchema.parse(req.body);
    const share = await createShare(input);
    const reload = await applyAndReload();
    res.status(201).json({ share, reload });
  }),
);

sharesRouter.put(
  '/:name',
  asyncHandler(async (req, res) => {
    const input = shareSchema.parse(req.body);
    const share = await updateShare(req.params.name, input);
    const reload = await applyAndReload();
    res.json({ share, reload });
  }),
);

sharesRouter.delete(
  '/:name',
  asyncHandler(async (req, res) => {
    await deleteShare(req.params.name);
    const reload = await applyAndReload();
    res.json({ deleted: req.params.name, reload });
  }),
);

sharesRouter.post(
  '/:name/permissions',
  asyncHandler(async (req, res) => {
    const input = permissionsSchema.parse(req.body);
    const shares = await listShares();
    const share = shares.find((candidate) => candidate.name.toLowerCase() === req.params.name.toLowerCase());
    if (!share) {
      res.status(404).json({ error: `share "${req.params.name}" does not exist` });
      return;
    }
    const applied = await applyPermissions({ ...input, path: share.path });
    res.json({ applied });
  }),
);
