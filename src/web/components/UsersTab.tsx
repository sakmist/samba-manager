import { useCallback, useEffect, useState } from 'react';
import type { SambaUser } from '../../shared/types';
import { api } from '../api';
import { Banner, Checkbox, Field, Modal, useToast } from './ui';

export function UsersTab() {
  const [users, setUsers] = useState<SambaUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<SambaUser | null>(null);
  const [loadError, setLoadError] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setUsers(await api.users.list());
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (user: SambaUser) => {
    try {
      await api.users.setEnabled(user.username, user.disabled);
      toast.success(`已${user.disabled ? '启用' : '停用'}用户 ${user.username}`);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const remove = async (user: SambaUser) => {
    const removeSystem = window.confirm(
      `删除 Samba 用户 "${user.username}"？\n\n点击“确定”同时删除系统账号，点击“取消”仅删除 Samba 账号。`,
    );
    try {
      const result = await api.users.remove(user.username, removeSystem);
      if (result.warning) toast.error(result.warning);
      else toast.success(`已删除用户 ${user.username}`);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div>
      {loadError ? <Banner kind="error">{loadError}</Banner> : null}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">Samba 用户</h2>
          <span className="card__sub">共 {users.length} 个账号</span>
          <div className="spacer" />
          <button className="btn btn--ghost btn--sm" onClick={() => void load()}>
            重新加载
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
            新建用户
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>全名</th>
                <th>系统账号</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.length ? (
                users.map((user) => (
                  <tr key={user.username}>
                    <td>
                      <strong>{user.username}</strong>
                    </td>
                    <td>{user.fullName || <span className="hint">—</span>}</td>
                    <td>
                      <span className={`badge ${user.systemAccount ? 'badge--ok' : 'badge--warn'}`}>
                        {user.systemAccount ? '存在' : '缺失'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.disabled ? 'badge--bad' : 'badge--ok'}`}>
                        {user.disabled ? '已停用' : '正常'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn--sm" onClick={() => setPasswordFor(user)}>
                          改密码
                        </button>
                        <button className="btn btn--sm" onClick={() => void toggle(user)}>
                          {user.disabled ? '启用' : '停用'}
                        </button>
                        <button className="btn btn--sm btn--danger" onClick={() => void remove(user)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty">
                    还没有 Samba 用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating ? <CreateUserModal onClose={() => setCreating(false)} onCreated={load} /> : null}
      {passwordFor ? (
        <PasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} onChanged={load} />
      ) : null}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [makeSystem, setMakeSystem] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.users.create(username, password, fullName);
      toast.success(`已创建用户 ${username}`);
      onCreated();
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="新建 Samba 用户"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={submit}
            disabled={busy || !username || password.length < 6}
          >
            {busy ? '创建中…' : '创建'}
          </button>
        </>
      }
    >
      <div className="grid grid--2">
        <Field label="用户名" hint="字母、数字、下划线或短横线">
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </Field>
        <Field label="全名（可选）">
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>
      </div>

      <Field label="密码" hint="至少 6 位">
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>

      <Checkbox
        checked={makeSystem}
        onChange={setMakeSystem}
        label="同时创建同名系统账号（推荐，Samba 需要）"
      />
    </Modal>
  );
}

function PasswordModal({
  user,
  onClose,
  onChanged,
}: {
  user: SambaUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.users.setPassword(user.username, password);
      toast.success(`已更新 ${user.username} 的密码`);
      onChanged();
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`修改密码 - ${user.username}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn--primary" onClick={submit} disabled={busy || password.length < 6}>
            {busy ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <Field label="新密码" hint="至少 6 位">
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
