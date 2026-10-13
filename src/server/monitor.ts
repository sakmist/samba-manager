import type { NotificationItem, SmbStatus, StatusSnapshot } from '../shared/types';
import { getSettings } from './config';
import { log } from './logger';
import { sendNotifications } from './notifier';
import { readSmbStatus } from './samba/status';

const MAX_NOTIFICATIONS = 200;

/**
 * Polls `smbstatus` on an interval, keeps the latest snapshot for the UI, and
 * raises a notification whenever a client IP appears that was not connected on
 * the previous pass.
 */
export class Monitor {
  private status: SmbStatus = { sessions: [], services: [], lockedFiles: [] };
  private lastChecked: string | null = null;
  private error: string | null = null;
  private notifications: NotificationItem[] = [];
  private previousClients = new Set<string>();
  /**
   * Whether a first poll has already established the baseline. Tracked
   * separately from previousClients, because an idle server legitimately has an
   * empty client set and the next connection must still be announced.
   */
  private hasBaseline = false;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /** Perform one poll. Safe to call concurrently with the timer. */
  async poll(announce = true): Promise<void> {
    const probe = await readSmbStatus();

    if (!probe.ok) {
      this.error = probe.error;
      this.lastChecked = new Date().toISOString();
      log.warn(`smbstatus unavailable: ${probe.error}`);
      return;
    }

    this.error = null;
    this.status = probe.status;
    this.lastChecked = new Date().toISOString();

    const clients = new Set(probe.status.sessions.map((session) => session.client));
    if (announce && this.hasBaseline) {
      const added = [...clients].filter((client) => !this.previousClients.has(client));
      for (const client of added) {
        await this.handleNewConnection(client, probe.status);
      }
    }
    this.previousClients = clients;
    this.hasBaseline = true;
  }

  private async handleNewConnection(client: string, status: SmbStatus): Promise<void> {
    const settings = getSettings();
    const session = status.sessions.find((candidate) => candidate.client === client);
    const username = session?.username ?? 'unknown';

    this.pushNotification({
      time: new Date().toISOString(),
      message: `New connection from ${client} (${username})`,
      severity: 'info',
    });

    if (settings.excludedIps.includes(client)) {
      log.debug(`notification suppressed for excluded client ${client}`);
      return;
    }

    const service = session ? status.services.find((candidate) => candidate.pid === session.pid) : undefined;
    const locks = session ? status.lockedFiles.filter((file) => file.pid === session.pid) : [];
    const lockNames = locks.length ? locks.map((file) => file.name).join(', ') : 'none';

    const message = [
      `New SMB connection from ${client}`,
      `Username: ${username}`,
      `Service: ${service?.service ?? 'unknown'}`,
      `Locked files: ${lockNames}`,
    ].join('\n');

    await sendNotifications(message);
  }

  pushNotification(item: NotificationItem): void {
    this.notifications.push(item);
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(-MAX_NOTIFICATIONS);
    }
  }

  snapshot(): StatusSnapshot {
    return {
      status: this.status,
      lastChecked: this.lastChecked,
      notifications: this.notifications.slice(-20).reverse(),
      smbstatusError: this.error,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll(false);

    const schedule = () => {
      const intervalMs = Math.max(5, getSettings().pollIntervalSec) * 1000;
      this.timer = setTimeout(async () => {
        await this.poll(true);
        if (this.running) schedule();
      }, intervalMs);
      this.timer.unref?.();
    };
    schedule();
    log.info('monitor started');
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Reset the baseline so the next poll treats current clients as known. */
  resetBaseline(): void {
    this.previousClients = new Set();
    this.hasBaseline = false;
  }
}

export const monitor = new Monitor();
