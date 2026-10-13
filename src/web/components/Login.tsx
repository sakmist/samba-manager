import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Field } from './ui';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(username, password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1>Samba 管理器</h1>
        <p className="sub">请登录以管理共享、用户与权限</p>

        {error ? <div className="banner banner--error">{error}</div> : null}

        <Field label="用户名">
          <input
            value={username}
            autoComplete="username"
            autoFocus
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>

        <Field label="密码">
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <button className="btn btn--primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
