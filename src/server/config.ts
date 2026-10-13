import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Settings } from '../shared/types';
import { log } from './logger';
import { writeJsonAtomic, writeJsonPrivate } from './util/atomic';

/** Filesystem locations the application works with. Override through env vars. */
export const paths = {
  dataDir: resolve(process.env.DATA_DIR ?? 'data'),
  sambaConf: process.env.SAMBA_CONF ?? '/etc/samba/smb.conf',
  /** Fragment owned by this application; included from smb.conf. */
  managedConf: process.env.SAMBA_MANAGER_CONF ?? '/etc/samba/samba-manager.conf',
  sambaService: process.env.SAMBA_SERVICE ?? 'smbd',
};

export const runtime = {
  port: Number(process.env.PORT ?? process.env.FLASK_PORT ?? 5069),
  host: process.env.HOST ?? '0.0.0.0',
  /** Disable authentication entirely (only sane behind a trusted reverse proxy). */
  authDisabled: (process.env.AUTH_DISABLED ?? '').toLowerCase() === 'true',
  adminUser: process.env.ADMIN_USER ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  trustProxy: (process.env.TRUST_PROXY ?? '').toLowerCase() === 'true',
};

const DEFAULT_SETTINGS: Settings = {
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? '',
  ntfyTopicUrl: process.env.NTFY_TOPIC_URL ?? '',
  excludedIps: (process.env.EXCLUDED_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
  pollIntervalSec: Number(process.env.POLL_INTERVAL_SEC ?? 30),
  autoReload: (process.env.AUTO_RELOAD ?? 'true').toLowerCase() !== 'false',
};

const settingsFile = () => join(paths.dataDir, 'settings.json');
const authFile = () => join(paths.dataDir, 'auth.json');

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (error) {
    log.warn(`could not read ${file}: ${(error as Error).message}`);
    return null;
  }
}

let cachedSettings: Settings | null = null;

/** Current settings, merging persisted values over environment defaults. */
export function getSettings(): Settings {
  if (!cachedSettings) {
    const stored = readJson<Partial<Settings>>(settingsFile());
    cachedSettings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }
  return cachedSettings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cachedSettings = next;
  writeJsonAtomic(settingsFile(), next);
  return next;
}

interface AuthRecord {
  username: string;
  /** scrypt hash, hex encoded, with the salt stored alongside. */
  hash: string;
  salt: string;
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { hash: string; salt: string } {
  return { hash: scryptSync(password, salt, 64).toString('hex'), salt };
}

export function verifyPassword(password: string): boolean {
  const record = readJson<AuthRecord>(authFile());
  if (!record) return false;
  const candidate = scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function getAdminUser(): string {
  return readJson<AuthRecord>(authFile())?.username ?? runtime.adminUser;
}

export function setCredentials(username: string, password: string): void {
  const { hash, salt } = hashPassword(password);
  writeJsonAtomic(authFile(), { username, hash, salt } satisfies AuthRecord);
}

export function hasCredentials(): boolean {
  return existsSync(authFile());
}

/**
 * Seed credentials on first boot: ADMIN_PASSWORD when provided, otherwise a
 * random password printed once to the log so the console is never left open.
 */
export function initAuth(): void {
  if (runtime.authDisabled) {
    log.warn('authentication is disabled (AUTH_DISABLED=true)');
    return;
  }
  if (existsSync(authFile())) return;

  if (runtime.adminPassword) {
    setCredentials(runtime.adminUser, runtime.adminPassword);
    log.info(`admin account "${runtime.adminUser}" created from ADMIN_PASSWORD`);
    return;
  }

  const generated = randomBytes(9).toString('base64url');
  setCredentials(runtime.adminUser, generated);
  log.warn('='.repeat(64));
  log.warn(`No ADMIN_PASSWORD set. Generated credentials for user "${runtime.adminUser}":`);
  log.warn(`    password: ${generated}`);
  log.warn('Set ADMIN_PASSWORD and remove the data volume to re-seed.');
  log.warn('='.repeat(64));
}

/** Persist the session signing secret outside the JSON stores. */
export function writeSecret(hex: string): void {
  writeJsonPrivate(join(paths.dataDir, 'session-secret'), hex);
}
