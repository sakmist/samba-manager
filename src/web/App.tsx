import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Login } from './components/Login';
import { MonitorTab } from './components/MonitorTab';
import { SettingsTab } from './components/SettingsTab';
import { SharesTab } from './components/SharesTab';
import { SystemTab } from './components/SystemTab';
import { UsersTab } from './components/UsersTab';
import { ToastProvider } from './components/ui';

const TABS = [
  { id: 'monitor', label: '监控', render: () => <MonitorTab /> },
  { id: 'shares', label: '共享', render: () => <SharesTab /> },
  { id: 'users', label: '用户', render: () => <UsersTab /> },
  { id: 'settings', label: '设置', render: () => <SettingsTab /> },
  { id: 'system', label: '系统', render: () => <SystemTab /> },
] as const;

type TabId = (typeof TABS)[number]['id'];

function Console({ username, onLogout }: { username: string | null; onLogout: () => void }) {
  const [tab, setTab] = useState<TabId>('monitor');
  const [healthy, setHealthy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const snapshot = await api.status();
        if (!cancelled) setHealthy(!snapshot.smbstatusError);
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0];

  return (
    <div>
      <header className="app-header">
        <div className="app-header__inner">
          <div className="brand">
            <span className={`brand__dot ${healthy ? '' : 'brand__dot--bad'}`} />
            Samba 管理器
          </div>

          <nav className="tabs">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                className={`tab ${entry.id === tab ? 'tab--active' : ''}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="spacer" />

          <span className="card__sub">{username ?? ''}</span>
          <button className="btn btn--ghost btn--sm" onClick={onLogout}>
            退出
          </button>
        </div>
      </header>

      <main className="page">{active.render()}</main>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [username, setUsername] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const me = await api.me();
      setUsername(me.username);
      setState(me.authenticated ? 'in' : 'out');
    } catch {
      setState('out');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setState('out');
      setUsername(null);
    }
  };

  if (state === 'loading') {
    return <div className="empty">加载中…</div>;
  }

  return (
    <ToastProvider>
      {state === 'in' ? (
        <Console username={username} onLogout={logout} />
      ) : (
        <Login
          onSuccess={() => {
            void check();
          }}
        />
      )}
    </ToastProvider>
  );
}
