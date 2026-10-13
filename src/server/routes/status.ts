import { Router } from 'express';
import { monitor } from '../monitor';
import { asyncHandler } from '../util/http';

export const statusRouter = Router();

/** Latest cached snapshot; cheap enough for the UI to poll. */
statusRouter.get('/', (_req, res) => {
  res.json(monitor.snapshot());
});

/** Force an immediate smbstatus read and return the fresh snapshot. */
statusRouter.post(
  '/refresh',
  asyncHandler(async (_req, res) => {
    await monitor.poll(false);
    res.json(monitor.snapshot());
  }),
);
