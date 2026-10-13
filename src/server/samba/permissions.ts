import { run, tryRun } from '../exec';
import { log } from '../logger';
import { ValidationError } from './conf';
import { fileExists, isDirectory } from './fsops';

/**
 * Filesystem side of a share: the directory must exist, and ownership/mode are
 * applied so the Samba users named on the share can actually read and write it.
 */

const MODE_PATTERN = /^0?[0-7]{3,4}$/;

export interface PermissionInput {
  path: string;
  owner?: string;
  group?: string;
  /** Octal mode, e.g. "0775". */
  mode?: string;
  recursive?: boolean;
  /** Create the directory when it does not exist yet. */
  create?: boolean;
}

function validateMode(mode: string): void {
  if (!MODE_PATTERN.test(mode)) {
    throw new ValidationError(`Invalid mode "${mode}": expected an octal value such as 0775.`);
  }
}

function validateAccount(value: string, label: string): void {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/i.test(value)) {
    throw new ValidationError(`Invalid ${label} "${value}".`);
  }
}

/** Apply ownership and mode to a share directory, creating it when asked. */
export async function applyPermissions(input: PermissionInput): Promise<string[]> {
  const applied: string[] = [];

  if (!fileExists(input.path)) {
    if (!input.create) {
      throw new ValidationError(`Path "${input.path}" does not exist. Enable "create directory" to make it.`);
    }
    const mkdir = await run('mkdir', ['-p', input.path], { privileged: true, allowFailure: true });
    if (mkdir.code !== 0) {
      throw new Error(`could not create "${input.path}": ${mkdir.stderr.trim()}`);
    }
    applied.push(`created ${input.path}`);
  } else if (!isDirectory(input.path)) {
    throw new ValidationError(`"${input.path}" exists but is not a directory.`);
  }

  if (input.owner || input.group) {
    if (input.owner) validateAccount(input.owner, 'owner');
    if (input.group) validateAccount(input.group, 'group');
    const spec = `${input.owner ?? ''}:${input.group ?? ''}`;
    const args = input.recursive ? ['-R', spec, input.path] : [spec, input.path];
    const result = await run('chown', args, { privileged: true, allowFailure: true });
    if (result.code !== 0) {
      throw new Error(`chown failed: ${result.stderr.trim()}`);
    }
    applied.push(`chown ${input.recursive ? '-R ' : ''}${spec} ${input.path}`);
  }

  if (input.mode) {
    validateMode(input.mode);
    const args = input.recursive ? ['-R', input.mode, input.path] : [input.mode, input.path];
    const result = await run('chmod', args, { privileged: true, allowFailure: true });
    if (result.code !== 0) {
      throw new Error(`chmod failed: ${result.stderr.trim()}`);
    }
    applied.push(`chmod ${input.recursive ? '-R ' : ''}${input.mode} ${input.path}`);
  }

  log.info(`permissions applied to ${input.path}`, applied);
  return applied;
}

export interface PathStat {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  owner: string;
  group: string;
  mode: string;
  readable: boolean;
}

/** Stat a candidate share path so the UI can show what is already there. */
export async function statPath(path: string): Promise<PathStat> {
  if (!fileExists(path)) {
    return { path, exists: false, isDirectory: false, owner: '', group: '', mode: '', readable: false };
  }
  const result = await tryRun('stat', ['-c', '%U:%G:%a:%F', path]);
  if (!result || result.code !== 0) {
    return { path, exists: true, isDirectory: false, owner: '', group: '', mode: '', readable: false };
  }
  const [owner, group, mode, ...rest] = result.stdout.trim().split(':');
  return {
    path,
    exists: true,
    isDirectory: rest.join(':').toLowerCase().includes('directory'),
    owner,
    group,
    mode,
    readable: true,
  };
}
