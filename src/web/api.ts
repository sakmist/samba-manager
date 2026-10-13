import type {
  SambaUser,
  Settings,
  Share,
  StatusSnapshot,
  SystemInfo,
} from '../shared/types';

/** Thin fetch wrapper: JSON in, JSON out, errors surfaced as Error messages. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const detail = payload as { error?: string; detail?: string } | null;
    const message = [detail?.error, detail?.detail].filter(Boolean).join(' - ');
    throw new Error(message || `请求失败 (HTTP ${response.status})`);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export interface ReloadOutcome {
  reloaded: boolean;
  message: string;
}

export const api = {
  me: () => request<{ authenticated: boolean; username: string | null }>('/auth/me'),
  login: (username: string, password: string) =>
    request<{ authenticated: boolean }>('/auth/login', json({ username, password })),
  logout: () => request<{ authenticated: boolean }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', json({ currentPassword, newPassword })),

  status: () => request<StatusSnapshot>('/status'),
  refresh: () => request<StatusSnapshot>('/status/refresh', { method: 'POST' }),

  shares: {
    list: () => request<Share[]>('/shares'),
    create: (share: Share) => request<{ share: Share; reload: ReloadOutcome }>('/shares', json(share)),
    update: (name: string, share: Share) =>
      request<{ share: Share; reload: ReloadOutcome }>(`/shares/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(share),
      }),
    remove: (name: string) =>
      request<{ deleted: string; reload: ReloadOutcome }>(`/shares/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }),
    permissions: (
      name: string,
      input: { owner?: string; group?: string; mode?: string; recursive: boolean; create: boolean },
    ) => request<{ applied: string[] }>(`/shares/${encodeURIComponent(name)}/permissions`, json(input)),
    stat: (path: string) =>
      request<{ path: string; exists: boolean; isDirectory: boolean; owner: string; group: string; mode: string }>(
        `/shares/stat?path=${encodeURIComponent(path)}`,
      ),
  },

  users: {
    list: () => request<SambaUser[]>('/users'),
    create: (username: string, password: string, fullName: string) =>
      request<{ username: string }>('/users', json({ username, password, fullName })),
    setPassword: (username: string, password: string) =>
      request<{ ok: true }>(`/users/${encodeURIComponent(username)}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
      }),
    setEnabled: (username: string, enabled: boolean) =>
      request<{ enabled: boolean }>(`/users/${encodeURIComponent(username)}/enabled`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    remove: (username: string, removeSystem: boolean) =>
      request<{ deleted: string; systemAccountRemoved: boolean; warning?: string }>(
        `/users/${encodeURIComponent(username)}?removeSystem=${removeSystem}`,
        { method: 'DELETE' },
      ),
  },

  settings: {
    get: () => request<Settings>('/settings'),
    update: (patch: Partial<Settings>) =>
      request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
    test: () =>
      request<{ results: { channel: string; ok: boolean }[] }>('/settings/test-notification', {
        method: 'POST',
      }),
  },

  system: {
    info: () => request<SystemInfo & { includePresent: boolean }>('/system'),
    testparm: () => request<{ ok: boolean; output: string }>('/system/testparm'),
    reload: () => request<{ message: string }>('/system/reload', { method: 'POST' }),
    restart: () => request<{ message: string }>('/system/restart', { method: 'POST' }),
    ensureInclude: () =>
      request<{ changed: boolean; message: string }>('/system/ensure-include', { method: 'POST' }),
  },
};
