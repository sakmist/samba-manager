import { execFile } from 'node:child_process';
import { log } from './logger';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class ExecError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly result: ExecResult,
  ) {
    super(message);
    this.name = 'ExecError';
  }
}

export interface RunOptions {
  /** Prefix the command with sudo. Ignored when running as root. */
  privileged?: boolean;
  /** Data written to the process stdin (used to feed smbpasswd). */
  input?: string;
  timeoutMs?: number;
  /** When true a non-zero exit code resolves instead of throwing. */
  allowFailure?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** True when the current process already has root, so sudo is unnecessary. */
export function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

/**
 * Whether privileged commands should be routed through sudo. Set
 * SAMBA_MANAGER_SUDO=never on systems where the service already runs as root
 * but sudo is not installed.
 */
export function sudoEnabled(): boolean {
  if (isRoot()) return false;
  return (process.env.SAMBA_MANAGER_SUDO ?? 'auto').toLowerCase() !== 'never';
}

function buildArgv(command: string, args: string[], privileged: boolean): { file: string; argv: string[] } {
  if (privileged && sudoEnabled()) {
    // -n keeps sudo from ever blocking on a password prompt.
    return { file: 'sudo', argv: ['-n', command, ...args] };
  }
  return { file: command, argv: args };
}

/** Run a command and return its output. Rejects with ExecError on failure. */
export function run(command: string, args: string[] = [], options: RunOptions = {}): Promise<ExecResult> {
  const { file, argv } = buildArgv(command, args, options.privileged ?? false);
  const display = [file, ...argv].join(' ');

  return new Promise<ExecResult>((resolve, reject) => {
    const child = execFile(
      file,
      argv,
      { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
          ? ((error as unknown as { code: number }).code)
          : error
            ? 1
            : 0;
        const result: ExecResult = { stdout: stdout.toString(), stderr: stderr.toString(), code };

        if (error && !options.allowFailure) {
          log.debug(`command failed: ${display}`, result.stderr.trim());
          const detail = result.stderr.trim() || (error as Error).message;
          reject(new ExecError(`${command} failed: ${detail}`, display, result));
          return;
        }
        resolve(result);
      },
    );

    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input);
    }
  });
}

/** Run a command, returning null when it fails instead of throwing. */
export async function tryRun(command: string, args: string[] = [], options: RunOptions = {}): Promise<ExecResult | null> {
  try {
    return await run(command, args, { ...options, allowFailure: true });
  } catch (error) {
    log.debug(`tryRun failed: ${command}`, (error as Error).message);
    return null;
  }
}

/** True when the command exists on PATH (or is reachable through sudo). */
export async function commandExists(command: string): Promise<boolean> {
  const result = await tryRun('sh', ['-c', `command -v ${command} >/dev/null 2>&1`]);
  return result !== null && result.code === 0;
}
