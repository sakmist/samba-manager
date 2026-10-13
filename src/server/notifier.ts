import { getSettings } from './config';
import { log } from './logger';

/**
 * Outbound notifications for new client connections. Both channels are optional
 * and configured from the Settings tab; failures are logged, never thrown, so a
 * dead webhook cannot take the monitor loop down.
 */

async function post(url: string, init: RequestInit, label: string): Promise<void> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      log.warn(`${label} notification rejected: HTTP ${response.status}`);
      return;
    }
    log.debug(`${label} notification delivered`);
  } catch (error) {
    log.warn(`${label} notification failed: ${(error as Error).message}`);
  }
}

export async function sendNotifications(message: string): Promise<void> {
  const settings = getSettings();
  const jobs: Promise<void>[] = [];

  if (settings.ntfyTopicUrl) {
    jobs.push(
      post(
        settings.ntfyTopicUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: message,
        },
        'ntfy',
      ),
    );
  }

  if (settings.discordWebhookUrl) {
    jobs.push(
      post(
        settings.discordWebhookUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        },
        'discord',
      ),
    );
  }

  if (jobs.length) await Promise.all(jobs);
}

/** Send a one-off test message to every configured channel. */
export async function sendTestNotification(): Promise<{ channel: string; ok: boolean }[]> {
  const settings = getSettings();
  const results: { channel: string; ok: boolean }[] = [];
  const message = `samba-manager test notification at ${new Date().toISOString()}`;

  if (settings.ntfyTopicUrl) {
    const ok = await probe(settings.ntfyTopicUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: message,
    });
    results.push({ channel: 'ntfy', ok });
  }
  if (settings.discordWebhookUrl) {
    const ok = await probe(settings.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    results.push({ channel: 'discord', ok });
  }
  return results;
}

async function probe(url: string, init: RequestInit): Promise<boolean> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch (error) {
    log.warn(`test notification failed: ${(error as Error).message}`);
    return false;
  }
}
