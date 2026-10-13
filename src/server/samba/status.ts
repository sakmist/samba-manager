import type { SmbStatus } from '../../shared/types';
import { run } from '../exec';
import { parseSmbStatus } from '../smbstatus';

/** Result of a status probe: either a snapshot or the reason it failed. */
export type StatusProbe = { ok: true; status: SmbStatus } | { ok: false; error: string };

/**
 * Run `smbstatus` and parse it. smbstatus needs root to read the locking and
 * session databases, so the call is routed through sudo when necessary.
 */
export async function readSmbStatus(): Promise<StatusProbe> {
  const result = await run('smbstatus', [], { privileged: true, allowFailure: true });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || `smbstatus exited with code ${result.code}`;
    return { ok: false, error: detail };
  }
  return { ok: true, status: parseSmbStatus(result.stdout) };
}
