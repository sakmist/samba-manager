import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Create the parent directory of a file when it does not exist yet. */
function ensureParent(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

/**
 * Write through a temporary file and rename into place, so a crash mid-write
 * cannot leave a truncated config behind.
 */
export function writeJsonAtomic(file: string, value: unknown): void {
  ensureParent(file);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

/** Same as writeJsonAtomic, but stores a plain string with 0600 permissions. */
export function writeJsonPrivate(file: string, contents: string): void {
  ensureParent(file);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${contents}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, file);
}
