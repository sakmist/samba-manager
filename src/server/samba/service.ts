import type { SystemInfo } from '../../shared/types';
import { commandExists, run, tryRun } from '../exec';
import { paths } from '../config';
import { log } from '../logger';
import { includePresent } from './conf';
import { fileExists } from './fsops';

/** Outcome of a `testparm` run against the on-disk configuration. */
export interface ConfigCheck {
  ok: boolean;
  output: string;
}

/** Validate smb.conf. `testparm -s` prints the effective config and exits non-zero on errors. */
export async function testparm(): Promise<ConfigCheck> {
  const result = await tryRun('testparm', ['-s'], { privileged: true });
  if (!result) return { ok: false, output: 'testparm is not available' };
  const combined = `${result.stdout}${result.stderr}`.trim();
  const failed = result.code !== 0 || /error|unknown parameter/i.test(combined);
  return { ok: !failed, output: combined };
}

async function serviceActive(service: string): Promise<boolean> {
  const result = await tryRun('systemctl', ['is-active', service]);
  return result?.stdout.trim() === 'active';
}

/**
 * Ask smbd to pick up the new configuration. Prefers a reload, which keeps
 * existing sessions alive, and falls back to a restart on hosts without a
 * reload target (or without systemd at all).
 */
export async function reloadService(): Promise<string> {
  const hasSystemctl = await commandExists('systemctl');
  if (hasSystemctl) {
    const reload = await run('systemctl', ['reload', paths.sambaService], {
      privileged: true,
      allowFailure: true,
    });
    if (reload.code === 0) return 'reloaded via systemctl';

    const restart = await run('systemctl', ['restart', paths.sambaService], {
      privileged: true,
      allowFailure: true,
    });
    if (restart.code === 0) return 'restarted via systemctl';
    log.warn(`systemctl reload/restart failed: ${restart.stderr.trim()}`);
  }

  // Container-friendly path: poke a running smbd directly.
  const control = await run('smbcontrol', ['smbd', 'reload-config'], { privileged: true, allowFailure: true });
  if (control.code === 0) return 'reloaded via smbcontrol';

  throw new Error('could not reload Samba: systemctl and smbcontrol both failed');
}

export async function restartService(): Promise<string> {
  const result = await run('systemctl', ['restart', paths.sambaService], {
    privileged: true,
    allowFailure: true,
  });
  if (result.code === 0) return 'restarted via systemctl';
  const control = await run('smbcontrol', ['smbd', 'force-shutdown'], { privileged: true, allowFailure: true });
  if (control.code === 0) return 'shutdown requested via smbcontrol';
  throw new Error(`could not restart Samba: ${result.stderr.trim()}`);
}

/** Probe the host so the UI can warn about missing pieces up front. */
export async function getSystemInfo(version: string): Promise<SystemInfo> {
  const [hasSamba, hasSmbstatus, smbdActive, included] = await Promise.all([
    commandExists('smbd'),
    commandExists('smbstatus'),
    serviceActive(paths.sambaService),
    includePresent(),
  ]);

  const hostnameResult = await tryRun('hostname');

  return {
    hostname: hostnameResult?.stdout.trim() || 'unknown',
    platform: `${process.platform} ${process.arch}`,
    sambaInstalled: hasSamba && fileExists(paths.sambaConf),
    smbstatusAvailable: hasSmbstatus,
    smbdActive,
    privileged: typeof process.getuid === 'function' ? process.getuid() === 0 : false,
    configPath: paths.sambaConf,
    managedConfigPath: paths.managedConf,
    serviceName: paths.sambaService,
    version: included ? version : `${version} (managed include not present)`,
  };
}

export { serviceActive };
