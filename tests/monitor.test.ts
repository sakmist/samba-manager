import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../src/shared/types';

const { readSmbStatus, getSettings } = vi.hoisted(() => ({
  readSmbStatus: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('../src/server/samba/status', () => ({ readSmbStatus }));
vi.mock('../src/server/config', () => ({ getSettings }));

import { Monitor } from '../src/server/monitor';

const BASE_SETTINGS: Settings = {
  discordWebhookUrl: '',
  ntfyTopicUrl: '',
  excludedIps: [],
  pollIntervalSec: 30,
  autoReload: true,
};

/** Build a probe result containing one session per supplied client IP. */
function probeWith(clients: string[]) {
  return {
    ok: true as const,
    status: {
      sessions: clients.map((client, index) => ({
        pid: String(1000 + index),
        username: 'alice',
        group: 'users',
        client,
        protocol: 'SMB3_11',
        encryption: '-',
      })),
      services: [],
      lockedFiles: [],
    },
  };
}

describe('Monitor baseline handling', () => {
  beforeEach(() => {
    readSmbStatus.mockReset();
    getSettings.mockReset();
    getSettings.mockReturnValue(BASE_SETTINGS);
  });

  it('announces a connection that follows an idle baseline', async () => {
    readSmbStatus.mockResolvedValueOnce(probeWith([])).mockResolvedValueOnce(probeWith(['10.0.0.5']));

    const monitor = new Monitor();
    await monitor.poll(false); // server starts with nobody connected
    expect(monitor.snapshot().notifications).toHaveLength(0);

    await monitor.poll(true);
    const { notifications } = monitor.snapshot();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('10.0.0.5');
  });

  it('does not repeat a notification for a client that stays connected', async () => {
    readSmbStatus
      .mockResolvedValueOnce(probeWith([]))
      .mockResolvedValue(probeWith(['10.0.0.5']));

    const monitor = new Monitor();
    await monitor.poll(false);
    await monitor.poll(true); // announces the first sighting
    await monitor.poll(true); // same client, nothing new

    expect(monitor.snapshot().notifications).toHaveLength(1);
  });

  it('treats clients already connected at baseline as known', async () => {
    readSmbStatus.mockResolvedValue(probeWith(['10.0.0.5']));

    const monitor = new Monitor();
    await monitor.poll(false);
    await monitor.poll(true);

    expect(monitor.snapshot().notifications).toHaveLength(0);
  });

  it('never announces on the very first poll', async () => {
    readSmbStatus.mockResolvedValue(probeWith(['10.0.0.5']));

    const monitor = new Monitor();
    await monitor.poll(true); // no baseline yet

    expect(monitor.snapshot().notifications).toHaveLength(0);
  });

  it('records excluded clients on the dashboard but does not push them', async () => {
    getSettings.mockReturnValue({ ...BASE_SETTINGS, excludedIps: ['10.0.0.9'] });
    readSmbStatus.mockResolvedValueOnce(probeWith([])).mockResolvedValueOnce(probeWith(['10.0.0.9']));

    const monitor = new Monitor();
    await monitor.poll(false);
    await monitor.poll(true);

    const { notifications } = monitor.snapshot();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toContain('10.0.0.9');
  });

  it('surfaces the smbstatus error without clearing the last snapshot', async () => {
    readSmbStatus.mockResolvedValueOnce(probeWith(['10.0.0.5'])).mockResolvedValueOnce({
      ok: false,
      error: 'sudo: a password is required',
    });

    const monitor = new Monitor();
    await monitor.poll(false);
    await monitor.poll(true);

    const snapshot = monitor.snapshot();
    expect(snapshot.smbstatusError).toBe('sudo: a password is required');
    expect(snapshot.status.sessions).toHaveLength(1);
  });

  it('newest notifications come first', async () => {
    readSmbStatus
      .mockResolvedValueOnce(probeWith([]))
      .mockResolvedValueOnce(probeWith(['10.0.0.1']))
      .mockResolvedValueOnce(probeWith(['10.0.0.1', '10.0.0.2']));

    const monitor = new Monitor();
    await monitor.poll(false);
    await monitor.poll(true);
    await monitor.poll(true);

    const messages = monitor.snapshot().notifications.map((item) => item.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('10.0.0.2');
  });
});
