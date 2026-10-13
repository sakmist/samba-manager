import type { LockedFile, Service, Session, SmbStatus } from '../shared/types';

/**
 * Parsers for the column-aligned tables printed by `smbstatus`.
 *
 * The tool emits three sections (sessions, services, locked files) whose columns
 * are separated by runs of spaces. Field values themselves may contain single
 * spaces, so the patterns rely on the surrounding two-space column gaps rather
 * than a naive split.
 */

const SESSION_PATTERN = new RegExp(
  '^(\\d+)\\s+' + // PID
    '(\\S+)\\s+' + // Username
    '(\\S+)\\s+' + // Group
    '(\\S+)\\s+' + // Machine (short form)
    '\\(ipv4:(\\d+\\.\\d+\\.\\d+\\.\\d+):\\d+\\)\\s+' + // (ipv4:IP:port)
    '(\\S+)\\s+' + // Protocol
    '(.+)$', // Encryption / signing detail
);

const SERVICE_PATTERN = new RegExp(
  '^(\\S+)\\s+' + // Service name
    '(\\d+)\\s+' + // PID
    '(\\S+)\\s+' + // Machine
    '(.+?)\\s+' + // Connected at (non-greedy)
    '(\\S+)\\s+' + // Encryption
    '(\\S+)$', // Signing
);

const LOCKED_FILE_PATTERN = new RegExp(
  '^(\\d+)\\s+' + // PID
    '(\\S+)\\s+' + // User
    '(\\S+)\\s+' + // DenyMode
    '(\\S+)\\s+' + // Access
    '(\\S+)\\s+' + // R/W
    '(\\S+)\\s+' + // Oplock
    '(.+?)\\s{2,}' + // SharePath
    '(.+?)\\s{2,}' + // Name
    '(.+)$', // Time
);

type Section = 'sessions' | 'services' | 'lockedFiles';

/** True for the `------...` separator rows smbstatus prints under each header. */
function isSeparator(line: string): boolean {
  return line.length > 0 && line.split('').every((ch) => ch === '-');
}

function detectSection(line: string): Section | null {
  if (line.startsWith('PID') && line.includes('Username')) return 'sessions';
  if (line.startsWith('Service') && line.includes('pid')) return 'services';
  if (line.startsWith('Locked files:')) return 'lockedFiles';
  return null;
}

function parseSession(line: string): Session | null {
  const match = SESSION_PATTERN.exec(line);
  if (!match) return null;
  const [, pid, username, group, , client, protocol, encryption] = match;
  return {
    pid,
    username,
    group,
    client,
    protocol,
    encryption: encryption.trim(),
  };
}

function parseService(line: string): Service | null {
  const match = SERVICE_PATTERN.exec(line);
  if (!match) return null;
  const [, service, pid, machine, connectedAt, encryption, signing] = match;
  return {
    service,
    pid,
    machine,
    connectedAt: connectedAt.trim(),
    encryption,
    signing,
  };
}

function parseLockedFile(line: string): LockedFile | null {
  const match = LOCKED_FILE_PATTERN.exec(line);
  if (!match) return null;
  const [, pid, user, denyMode, access, rw, oplock, sharePath, name, time] = match;
  return {
    pid,
    user,
    denyMode,
    access,
    rw,
    oplock,
    sharePath: sharePath.trim(),
    name: name.trim(),
    time: time.trim(),
  };
}

/** Parse raw `smbstatus` stdout into a structured snapshot. */
export function parseSmbStatus(output: string): SmbStatus {
  const data: SmbStatus = { sessions: [], services: [], lockedFiles: [] };
  let section: Section | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const stripped = line.replace(/^\s+/, '');

    const detected = detectSection(stripped);
    if (detected) {
      section = detected;
      continue;
    }

    if (!stripped || isSeparator(stripped)) continue;

    if (section === 'sessions') {
      if (!/^\d/.test(stripped)) continue;
      const session = parseSession(stripped);
      if (session) data.sessions.push(session);
    } else if (section === 'services') {
      const service = parseService(stripped);
      if (service) data.services.push(service);
    } else if (section === 'lockedFiles') {
      const locked = parseLockedFile(stripped);
      if (locked) data.lockedFiles.push(locked);
    }
  }

  return data;
}
