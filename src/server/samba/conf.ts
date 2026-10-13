import type { Share, ShareInput } from '../../shared/types';
import { paths } from '../config';
import { log } from '../logger';
import { fileExists, readFilePrivileged, writeFilePrivileged } from './fsops';

/**
 * Reads and writes the smb.conf fragment owned by this application
 * (paths.managedConf). Keeping managed shares in their own file means an
 * operator's hand-written smb.conf is never rewritten by the UI.
 */

const HEADER = [
  '# ------------------------------------------------------------------',
  '# Managed by samba-manager. Do not edit by hand: the console rewrites',
  '# this file on every share change.',
  '# ------------------------------------------------------------------',
  '',
].join('\n');

/** Section names Samba reserves; they cannot be used for a normal share. */
const RESERVED_SECTIONS = new Set(['global', 'homes', 'printers', 'print$']);

const SHARE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._$-]{0,31}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateShareName(name: string): void {
  if (!SHARE_NAME_PATTERN.test(name)) {
    throw new ValidationError(
      'Share name must start with a letter or digit and contain only letters, digits, dot, underscore, dash or $ (max 32 characters).',
    );
  }
  if (RESERVED_SECTIONS.has(name.toLowerCase())) {
    throw new ValidationError(`"${name}" is a reserved Samba section name.`);
  }
}

export function validateSharePath(path: string): void {
  if (!path.startsWith('/')) {
    throw new ValidationError('Share path must be an absolute path (start with "/").');
  }
  if (path.includes('\n') || path.includes('\0')) {
    throw new ValidationError('Share path contains illegal characters.');
  }
  // Normalise away trailing slashes and any embedded ".." traversal.
  const segments = path.split('/');
  if (segments.includes('..')) {
    throw new ValidationError('Share path must not contain "..".');
  }
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (['yes', 'true', '1', 'on'].includes(normalised)) return true;
  if (['no', 'false', '0', 'off'].includes(normalised)) return false;
  return fallback;
}

function toList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseFragment(content: string): Share[] {
  const shares: Share[] = [];
  let current: Share | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const section = /^\[(.+)]$/.exec(line);
    if (section) {
      current = {
        name: section[1].trim(),
        path: '',
        comment: '',
        browseable: true,
        readOnly: true,
        guestOk: false,
        available: true,
        validUsers: [],
        writeList: [],
        createMask: '0664',
        directoryMask: '0775',
        forceUser: '',
        forceGroup: '',
      };
      shares.push(current);
      continue;
    }

    if (!current) continue;
    const assignment = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (!assignment) continue;
    const key = assignment[1].trim().toLowerCase();
    const value = assignment[2].trim();

    switch (key) {
      case 'path':
        current.path = value;
        break;
      case 'comment':
        current.comment = value;
        break;
      case 'browseable':
        current.browseable = toBool(value, current.browseable);
        break;
      case 'read only':
        current.readOnly = toBool(value, current.readOnly);
        break;
      case 'guest ok':
        current.guestOk = toBool(value, current.guestOk);
        break;
      case 'available':
        current.available = toBool(value, current.available);
        break;
      case 'valid users':
        current.validUsers = toList(value);
        break;
      case 'write list':
        current.writeList = toList(value);
        break;
      case 'create mask':
        current.createMask = value;
        break;
      case 'directory mask':
        current.directoryMask = value;
        break;
      case 'force user':
        current.forceUser = value;
        break;
      case 'force group':
        current.forceGroup = value;
        break;
      default:
        break;
    }
  }

  return shares;
}

function serialiseShare(share: Share): string {
  const lines: string[] = [`[${share.name}]`];
  const bool = (value: boolean) => (value ? 'yes' : 'no');

  if (share.comment) lines.push(`   comment = ${share.comment}`);
  lines.push(`   path = ${share.path}`);
  lines.push(`   browseable = ${bool(share.browseable)}`);
  lines.push(`   read only = ${bool(share.readOnly)}`);
  lines.push(`   available = ${bool(share.available)}`);
  lines.push(`   guest ok = ${bool(share.guestOk)}`);
  if (share.validUsers.length) lines.push(`   valid users = ${share.validUsers.join(', ')}`);
  if (share.writeList.length) lines.push(`   write list = ${share.writeList.join(', ')}`);
  if (share.forceUser) lines.push(`   force user = ${share.forceUser}`);
  if (share.forceGroup) lines.push(`   force group = ${share.forceGroup}`);
  lines.push(`   create mask = ${share.createMask}`);
  lines.push(`   directory mask = ${share.directoryMask}`);
  return lines.join('\n');
}

export function serialiseFragment(shares: Share[]): string {
  const body = shares.map(serialiseShare).join('\n\n');
  return `${HEADER}${body}${body ? '\n' : ''}`;
}

/** Every share currently managed by this application. */
export async function listShares(): Promise<Share[]> {
  if (!fileExists(paths.managedConf)) return [];
  const content = await readFilePrivileged(paths.managedConf);
  return parseFragment(content);
}

export async function getShare(name: string): Promise<Share | null> {
  const shares = await listShares();
  return shares.find((share) => share.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function normaliseInput(input: ShareInput): Share {
  validateShareName(input.name);
  validateSharePath(input.path);
  return {
    name: input.name.trim(),
    path: input.path.trim(),
    comment: (input.comment ?? '').trim(),
    browseable: input.browseable,
    readOnly: input.readOnly,
    guestOk: input.guestOk,
    available: input.available ?? true,
    validUsers: [...new Set((input.validUsers ?? []).map((u) => u.trim()).filter(Boolean))],
    writeList: [...new Set((input.writeList ?? []).map((u) => u.trim()).filter(Boolean))],
    createMask: input.createMask || '0664',
    directoryMask: input.directoryMask || '0775',
    forceUser: (input.forceUser ?? '').trim(),
    forceGroup: (input.forceGroup ?? '').trim(),
  };
}

/** Create a share. Rejects when the name is already taken. */
export async function createShare(input: ShareInput): Promise<Share> {
  const share = normaliseInput(input);
  const shares = await listShares();
  if (shares.some((existing) => existing.name.toLowerCase() === share.name.toLowerCase())) {
    throw new ValidationError(`Share "${share.name}" already exists.`);
  }
  shares.push(share);
  await persist(shares);
  return share;
}

/** Update an existing share in place. */
export async function updateShare(name: string, input: ShareInput): Promise<Share> {
  const share = normaliseInput(input);
  const shares = await listShares();
  const index = shares.findIndex((existing) => existing.name.toLowerCase() === name.toLowerCase());
  if (index === -1) {
    throw new ValidationError(`Share "${name}" does not exist.`);
  }
  const clash = shares.findIndex((existing) => existing.name.toLowerCase() === share.name.toLowerCase());
  if (clash !== -1 && clash !== index) {
    throw new ValidationError(`Share "${share.name}" already exists.`);
  }
  shares[index] = share;
  await persist(shares);
  return share;
}

export async function deleteShare(name: string): Promise<void> {
  const shares = await listShares();
  const remaining = shares.filter((share) => share.name.toLowerCase() !== name.toLowerCase());
  if (remaining.length === shares.length) {
    throw new ValidationError(`Share "${name}" does not exist.`);
  }
  await persist(remaining);
}

async function persist(shares: Share[]): Promise<void> {
  await writeFilePrivileged(paths.managedConf, serialiseFragment(shares));
  log.info(`managed share config written (${shares.length} share(s))`);
}

/**
 * Make sure smb.conf pulls in the managed fragment. Returns true when the file
 * was modified.
 */
export async function ensureInclude(): Promise<boolean> {
  if (!fileExists(paths.sambaConf)) {
    throw new Error(`${paths.sambaConf} not found - is Samba installed?`);
  }
  const content = await readFilePrivileged(paths.sambaConf);
  const includeLine = `include = ${paths.managedConf}`;

  const alreadyIncluded = content
    .split(/\r?\n/)
    .some((line) => /^\s*include\s*=\s*(.+)$/i.test(line) && line.includes(paths.managedConf));
  if (alreadyIncluded) return false;

  // Insert into [global]; append a new [global] block when there is none.
  const lines = content.split(/\r?\n/);
  const globalIndex = lines.findIndex((line) => /^\s*\[global]\s*$/i.test(line));

  if (globalIndex === -1) {
    const next = `${content.replace(/\s*$/, '')}\n\n[global]\n   ${includeLine}\n`;
    await writeFilePrivileged(paths.sambaConf, next);
  } else {
    let insertAt = globalIndex + 1;
    for (let i = globalIndex + 1; i < lines.length; i += 1) {
      if (/^\s*\[.+]/.test(lines[i])) break;
      insertAt = i + 1;
    }
    lines.splice(insertAt, 0, `   ${includeLine}`);
    await writeFilePrivileged(paths.sambaConf, lines.join('\n'));
  }

  log.info(`added "${includeLine}" to ${paths.sambaConf}`);
  return true;
}

/** True when smb.conf already includes the managed fragment. */
export async function includePresent(): Promise<boolean> {
  if (!fileExists(paths.sambaConf)) return false;
  try {
    const content = await readFilePrivileged(paths.sambaConf);
    return content.split(/\r?\n/).some((line) => /^\s*include\s*=/i.test(line) && line.includes(paths.managedConf));
  } catch {
    return false;
  }
}

export { parseFragment };
