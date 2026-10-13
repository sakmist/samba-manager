import { readFileSync } from 'node:fs';
import type { SambaUser } from '../../shared/types';
import { run, tryRun } from '../exec';
import { log } from '../logger';
import { ValidationError } from './conf';

/**
 * Samba account management on top of the tdbsam passdb, driven by `pdbedit`
 * and `smbpasswd`. A Samba account needs a matching POSIX account, so creating
 * a user also creates a locked-down system account when one is missing.
 */

const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/i;

export function validateUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError(
      'Username must start with a letter or underscore and contain only letters, digits, underscore or dash (max 32 characters).',
    );
  }
}

export function validatePassword(password: string): void {
  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long.');
  }
  if (password.includes('\n') || password.includes('\0')) {
    throw new ValidationError('Password must not contain newlines.');
  }
}

/** POSIX accounts that exist on the host, from /etc/passwd. */
function systemAccounts(): Set<string> {
  try {
    const content = readFileSync('/etc/passwd', 'utf8');
    return new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.split(':')[0])
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

interface PassdbEntry {
  username: string;
  fullName: string;
  flags: string;
}

/** Parse the block-oriented output of `pdbedit -L -v`. */
export function parsePassdbVerbose(output: string): PassdbEntry[] {
  const entries: PassdbEntry[] = [];
  let current: Partial<PassdbEntry> | null = null;

  const flush = () => {
    if (current?.username) {
      entries.push({
        username: current.username,
        fullName: current.fullName ?? '',
        flags: current.flags ?? '',
      });
    }
    current = null;
  };

  for (const rawLine of output.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      flush();
      continue;
    }
    const match = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(rawLine);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (key === 'unix username') {
      flush();
      current = { username: value };
    } else if (current && key === 'nt username' && value) {
      current.fullName = current.fullName || value;
    } else if (current && key === 'full name') {
      current.fullName = value;
    } else if (current && key === 'account flags') {
      current.flags = value.replace(/[[\]]/g, '').trim();
    }
  }
  flush();

  return entries;
}

/** All Samba accounts, newest tooling output normalised into one shape. */
export async function listUsers(): Promise<SambaUser[]> {
  const verbose = await tryRun('pdbedit', ['-L', '-v'], { privileged: true });
  const accounts = systemAccounts();

  if (verbose && verbose.code === 0 && verbose.stdout.trim()) {
    return parsePassdbVerbose(verbose.stdout)
      .map((entry) => ({
        username: entry.username,
        uid: 0,
        disabled: entry.flags.toUpperCase().includes('D'),
        systemAccount: accounts.has(entry.username),
        fullName: entry.fullName,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  // Fall back to the terse listing: username:uid:full name
  const terse = await tryRun('pdbedit', ['-L'], { privileged: true });
  if (!terse || terse.code !== 0) return [];

  return terse.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [username, uid, ...rest] = line.split(':');
      return {
        username,
        uid: Number(uid) || 0,
        disabled: false,
        systemAccount: accounts.has(username),
        fullName: rest.join(':').trim(),
      } satisfies SambaUser;
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function userExists(username: string): Promise<boolean> {
  const users = await listUsers();
  return users.some((user) => user.username.toLowerCase() === username.toLowerCase());
}

/** Create the POSIX account when missing so pdbedit has something to attach to. */
async function ensureSystemAccount(username: string, fullName: string): Promise<void> {
  if (systemAccounts().has(username)) return;
  const args = ['-M', '-s', '/usr/sbin/nologin'];
  if (fullName) args.push('-c', fullName);
  args.push(username);

  const result = await run('useradd', args, { privileged: true, allowFailure: true });
  if (result.code !== 0) {
    throw new Error(`could not create system account "${username}": ${result.stderr.trim()}`);
  }
  log.info(`created system account ${username}`);
}

async function feedSmbpasswd(args: string[], password: string): Promise<void> {
  const result = await run('smbpasswd', ['-s', ...args], {
    privileged: true,
    input: `${password}\n${password}\n`,
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new Error(`smbpasswd ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
}

export async function createUser(username: string, password: string, fullName = ''): Promise<void> {
  validateUsername(username);
  validatePassword(password);
  if (await userExists(username)) {
    throw new ValidationError(`Samba user "${username}" already exists.`);
  }
  await ensureSystemAccount(username, fullName);
  await feedSmbpasswd(['-a', username], password);
  log.info(`created Samba user ${username}`);
}

export async function setPassword(username: string, password: string): Promise<void> {
  validateUsername(username);
  validatePassword(password);
  if (!(await userExists(username))) {
    throw new ValidationError(`Samba user "${username}" does not exist.`);
  }
  await feedSmbpasswd([username], password);
  log.info(`password updated for ${username}`);
}

export interface DeleteUserResult {
  systemAccountRemoved: boolean;
  /** Set when the Samba account went away but the POSIX account could not. */
  warning?: string;
}

/** Remove the Samba account; the POSIX account is kept unless removeSystem is set. */
export async function deleteUser(username: string, removeSystem = false): Promise<DeleteUserResult> {
  validateUsername(username);
  const result = await run('smbpasswd', ['-x', username], { privileged: true, allowFailure: true });
  if (result.code !== 0 && !result.stderr.includes('not found')) {
    throw new Error(`could not delete Samba user "${username}": ${result.stderr.trim()}`);
  }

  if (!removeSystem) {
    log.info(`deleted Samba user ${username}`);
    return { systemAccountRemoved: false };
  }

  // userdel refuses while the account still owns running processes, which is
  // common right after a session was open - report that instead of claiming
  // success.
  const removal = await run('userdel', [username], { privileged: true, allowFailure: true });
  if (removal.code !== 0) {
    const detail = removal.stderr.trim() || `userdel exited with code ${removal.code}`;
    log.warn(`system account ${username} not removed: ${detail}`);
    return {
      systemAccountRemoved: false,
      warning: `Samba account deleted, but the system account "${username}" is still present: ${detail}`,
    };
  }

  log.info(`deleted Samba user ${username} and its system account`);
  return { systemAccountRemoved: true };
}

export async function setEnabled(username: string, enabled: boolean): Promise<void> {
  validateUsername(username);
  const result = await run('smbpasswd', [enabled ? '-e' : '-d', username], {
    privileged: true,
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new Error(`could not ${enabled ? 'enable' : 'disable'} "${username}": ${result.stderr.trim()}`);
  }
  log.info(`${enabled ? 'enabled' : 'disabled'} Samba user ${username}`);
}
