import { Router } from 'express';
import { ensureInclude, includePresent } from '../samba/conf';
import { getSystemInfo, reloadService, restartService, testparm } from '../samba/service';
import { asyncHandler } from '../util/http';
import { VERSION } from '../version';

export const systemRouter = Router();

systemRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const info = await getSystemInfo(VERSION);
    res.json({ ...info, includePresent: await includePresent() });
  }),
);

systemRouter.get(
  '/testparm',
  asyncHandler(async (_req, res) => {
    res.json(await testparm());
  }),
);

systemRouter.post(
  '/reload',
  asyncHandler(async (_req, res) => {
    res.json({ message: await reloadService() });
  }),
);

systemRouter.post(
  '/restart',
  asyncHandler(async (_req, res) => {
    res.json({ message: await restartService() });
  }),
);

/** Idempotently wire the managed fragment into smb.conf. */
systemRouter.post(
  '/ensure-include',
  asyncHandler(async (_req, res) => {
    const changed = await ensureInclude();
    res.json({ changed, message: changed ? 'include line added' : 'include line already present' });
  }),
);
