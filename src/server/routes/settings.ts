import { Router } from 'express';
import { z } from 'zod';
import { getSettings, updateSettings } from '../config';
import { sendTestNotification } from '../notifier';
import { asyncHandler } from '../util/http';

export const settingsRouter = Router();

const settingsSchema = z.object({
  discordWebhookUrl: z.string().max(500).optional(),
  ntfyTopicUrl: z.string().max(500).optional(),
  excludedIps: z.array(z.string()).optional(),
  pollIntervalSec: z.number().int().min(5).max(3600).optional(),
  autoReload: z.boolean().optional(),
});

settingsRouter.get('/', (_req, res) => {
  res.json(getSettings());
});

settingsRouter.put('/', (req, res) => {
  const patch = settingsSchema.parse(req.body);
  res.json(updateSettings(patch));
});

settingsRouter.post(
  '/test-notification',
  asyncHandler(async (_req, res) => {
    const results = await sendTestNotification();
    if (!results.length) {
      res.status(400).json({ error: 'no notification channel configured' });
      return;
    }
    res.json({ results });
  }),
);
