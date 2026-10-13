/**
 * Types shared between the Express server and the browser UI.
 * Keep this file free of any Node or DOM specific imports.
 */

/** One line of the `smbstatus` sessions table. */
export interface Session {
  pid: string;
  username: string;
  group: string;
  client: string;
  protocol: string;
  encryption: string;
}

/** One line of the `smbstatus` services (share) table. */
export interface Service {
  service: string;
  pid: string;
  machine: string;
  connectedAt: string;
  encryption: string;
  signing: string;
}

/** One line of the `smbstatus` locked files table. */
export interface LockedFile {
  pid: string;
  user: string;
  denyMode: string;
  access: string;
  rw: string;
  oplock: string;
  sharePath: string;
  name: string;
  time: string;
}

/** Full parse of a `smbstatus` run. */
export interface SmbStatus {
  sessions: Session[];
  services: Service[];
  lockedFiles: LockedFile[];
}

/** A connection notice surfaced on the dashboard. */
export interface NotificationItem {
  time: string;
  message: string;
  severity: 'info' | 'warning';
}

/** A share managed by this application (written to the managed smb.conf fragment). */
export interface Share {
  name: string;
  path: string;
  comment: string;
  browseable: boolean;
  readOnly: boolean;
  guestOk: boolean;
  available: boolean;
  validUsers: string[];
  writeList: string[];
  createMask: string;
  directoryMask: string;
  forceUser: string;
  forceGroup: string;
}

/** Payload accepted when creating or updating a share. */
export type ShareInput = Omit<Share, 'name'> & { name: string };

/** A Samba account as reported by `pdbedit`. */
export interface SambaUser {
  username: string;
  uid: number;
  /** True when the account is disabled in the Samba passdb. */
  disabled: boolean;
  /** True when a matching POSIX account exists on the host. */
  systemAccount: boolean;
  /** Full name / GECOS field when available. */
  fullName: string;
}

/** Runtime settings persisted by the application. */
export interface Settings {
  discordWebhookUrl: string;
  ntfyTopicUrl: string;
  /** Client IPs that never raise a notification. */
  excludedIps: string[];
  /** Seconds between smbstatus polls. */
  pollIntervalSec: number;
  /** Reload smbd automatically after a share change. */
  autoReload: boolean;
}

/** Snapshot returned by GET /api/status. */
export interface StatusSnapshot {
  status: SmbStatus;
  lastChecked: string | null;
  notifications: NotificationItem[];
  /** True when smbstatus could not be executed (usually a permissions problem). */
  smbstatusError: string | null;
}

/** Result of a system capability probe, used to warn the operator early. */
export interface SystemInfo {
  hostname: string;
  platform: string;
  sambaInstalled: boolean;
  smbstatusAvailable: boolean;
  smbdActive: boolean;
  privileged: boolean;
  configPath: string;
  managedConfigPath: string;
  serviceName: string;
  version: string;
}

/** Envelope for every API error response. */
export interface ApiError {
  error: string;
  detail?: string;
}
