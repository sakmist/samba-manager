import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { run } from '../exec';

/** True when the current process can write to the given path. */
function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file that may live outside the service account's reach. Falls back to
 * `sudo -n cat` so a root-owned smb.conf is still readable.
 */
export async function readFilePrivileged(path: string): Promise<string> {
  if (existsSync(path)) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      /* fall through to sudo */
    }
  }
  const result = await run('cat', [path], { privileged: true, allowFailure: true });
  if (result.code !== 0) {
    throw new Error(`cannot read ${path}: ${result.stderr.trim() || 'permission denied'}`);
  }
  return result.stdout;
}

/**
 * Write a file, escalating through `sudo -n tee` when the service account lacks
 * permission. Content is streamed over stdin so it never appears in the process
 * table.
 */
export async function writeFilePrivileged(path: string, content: string): Promise<void> {
  if (isWritable(path) || (!existsSync(path) && isWritable(dirOf(path)))) {
    writeFileSync(path, content, 'utf8');
    return;
  }
  const result = await run('tee', [path], {
    privileged: true,
    input: content,
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new Error(`cannot write ${path}: ${result.stderr.trim() || 'permission denied'}`);
  }
}

export function dirOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx <= 0 ? '/' : path.slice(0, idx);
}

/** Create a directory (with parents) when missing. */
export async function ensureDir(path: string): Promise<void> {
  if (existsSync(path)) return;
  try {
    mkdirSync(path, { recursive: true });
  } catch {
    const result = await run('mkdir', ['-p', path], { privileged: true, allowFailure: true });
    if (result.code !== 0) {
      throw new Error(`cannot create ${path}: ${result.stderr.trim()}`);
    }
  }
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
