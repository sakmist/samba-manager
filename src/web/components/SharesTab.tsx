import { useCallback, useEffect, useState } from 'react';
import type { SambaUser, Share } from '../../shared/types';
import { api } from '../api';
import { Banner, Checkbox, Field, Modal, TagInput, useToast } from './ui';

const EMPTY_SHARE: Share = {
  name: '',
  path: '',
  comment: '',
  browseable: true,
  readOnly: false,
  guestOk: false,
  available: true,
  validUsers: [],
  writeList: [],
  createMask: '0664',
  directoryMask: '0775',
  forceUser: '',
  forceGroup: '',
};

export function SharesTab() {
  const [shares, setShares] = useState<Share[]>([]);
  const [users, setUsers] = useState<SambaUser[]>([]);
  const [editing, setEditing] = useState<{ original: string | null; draft: Share } | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [shareList, userList] = await Promise.all([api.shares.list(), api.users.list()]);
      setShares(shareList);
      setUsers(userList);
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { original, draft } = editing;
      const result = original ? await api.shares.update(original, draft) : await api.shares.create(draft);
      toast.success(original ? `已更新共享 ${draft.name}` : `已创建共享 ${draft.name}`);
      if (!result.reload.reloaded) {
        toast.error(`配置已写入，但 Samba 未重载：${result.reload.message}`);
      }
      setEditing(null);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (share: Share) => {
    if (!window.confirm(`确定删除共享 "${share.name}" 吗？\n共享目录 ${share.path} 不会被删除。`)) return;
    try {
      await api.shares.remove(share.name);
      toast.success(`已删除共享 ${share.name}`);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const suggestions = users.map((user) => user.username);

  return (
    <div>
      {loadError ? <Banner kind="error">{loadError}</Banner> : null}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">共享目录</h2>
          <span className="card__sub">共 {shares.length} 个，由本程序管理</span>
          <div className="spacer" />
          <button className="btn btn--ghost btn--sm" onClick={() => void load()}>
            重新加载
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => setEditing({ original: null, draft: { ...EMPTY_SHARE } })}
          >
            新建共享
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>路径</th>
                <th>权限</th>
                <th>可访问用户</th>
                <th>状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shares.length ? (
                shares.map((share) => (
                  <tr key={share.name}>
                    <td>
                      <strong>{share.name}</strong>
                      {share.comment ? <div className="hint">{share.comment}</div> : null}
                    </td>
                    <td className="mono">{share.path}</td>
                    <td>
                      <span className={`badge ${share.readOnly ? '' : 'badge--ok'}`}>
                        {share.readOnly ? '只读' : '读写'}
                      </span>
                    </td>
                    <td>
                      {share.validUsers.length ? share.validUsers.join(', ') : <span className="hint">所有用户</span>}
                    </td>
                    <td>
                      <span className={`badge ${share.available ? 'badge--ok' : 'badge--bad'}`}>
                        {share.available ? '启用' : '停用'}
                      </span>
                      {share.guestOk ? <span className="badge badge--warn" style={{ marginLeft: 6 }}>访客</span> : null}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn--sm"
                          onClick={() => setEditing({ original: share.name, draft: { ...share } })}
                        >
                          编辑
                        </button>
                        <button className="btn btn--sm" onClick={() => setPermissionsFor(share)}>
                          权限
                        </button>
                        <button className="btn btn--sm btn--danger" onClick={() => void remove(share)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    还没有共享，点击“新建共享”开始
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <ShareEditor
          draft={editing.draft}
          isNew={editing.original === null}
          suggestions={suggestions}
          busy={busy}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      {permissionsFor ? (
        <PermissionsEditor share={permissionsFor} onClose={() => setPermissionsFor(null)} />
      ) : null}
    </div>
  );
}

function ShareEditor({
  draft,
  isNew,
  suggestions,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Share;
  isNew: boolean;
  suggestions: string[];
  busy: boolean;
  onChange: (draft: Share) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [pathInfo, setPathInfo] = useState<string>('');
  const patch = (values: Partial<Share>) => onChange({ ...draft, ...values });

  const checkPath = async () => {
    if (!draft.path) return;
    try {
      const stat = await api.shares.stat(draft.path);
      if (!stat.exists) {
        setPathInfo('目录不存在（保存后可在“权限”中创建）');
      } else {
        setPathInfo(
          `${stat.isDirectory ? '目录' : '不是目录'} · 属主 ${stat.owner}:${stat.group} · 权限 ${stat.mode}`,
        );
      }
    } catch (error) {
      setPathInfo((error as Error).message);
    }
  };

  return (
    <Modal
      title={isNew ? '新建共享' : `编辑共享 ${draft.name}`}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="btn btn--primary" onClick={onSave} disabled={busy || !draft.name || !draft.path}>
            {busy ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="grid grid--2">
        <Field label="共享名称" hint="客户端访问时使用的名称，如 data">
          <input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        </Field>
        <Field label="备注">
          <input value={draft.comment} onChange={(event) => patch({ comment: event.target.value })} />
        </Field>
      </div>

      <Field label="目录路径" hint={pathInfo || '服务器上的绝对路径，如 /srv/data'}>
        <div className="row">
          <input
            style={{ flex: 1, minWidth: 220 }}
            value={draft.path}
            placeholder="/srv/data"
            onChange={(event) => patch({ path: event.target.value })}
          />
          <button className="btn btn--sm" onClick={() => void checkPath()} type="button">
            检查
          </button>
        </div>
      </Field>

      <div className="grid grid--3">
        <Checkbox checked={draft.browseable} onChange={(value) => patch({ browseable: value })} label="在网络中可见" />
        <Checkbox checked={!draft.readOnly} onChange={(value) => patch({ readOnly: !value })} label="允许写入" />
        <Checkbox checked={draft.guestOk} onChange={(value) => patch({ guestOk: value })} label="允许匿名访问" />
        <Checkbox checked={draft.available} onChange={(value) => patch({ available: value })} label="启用该共享" />
      </div>

      <Field label="可访问用户" hint="留空表示所有 Samba 用户都可访问">
        <TagInput
          values={draft.validUsers}
          onChange={(values) => patch({ validUsers: values })}
          placeholder={suggestions.length ? `输入用户名，如 ${suggestions[0]}` : '输入用户名'}
        />
      </Field>

      <Field label="可写用户" hint="在只读共享中仍可写入的用户，留空则所有可访问用户均可写">
        <TagInput
          values={draft.writeList}
          onChange={(values) => patch({ writeList: values })}
          placeholder="输入用户名"
        />
      </Field>

      <div className="grid grid--3">
        <Field label="创建文件掩码">
          <input value={draft.createMask} onChange={(event) => patch({ createMask: event.target.value })} />
        </Field>
        <Field label="创建目录掩码">
          <input value={draft.directoryMask} onChange={(event) => patch({ directoryMask: event.target.value })} />
        </Field>
        <Field label="强制用户" hint="所有操作以该用户身份执行">
          <input value={draft.forceUser} onChange={(event) => patch({ forceUser: event.target.value })} />
        </Field>
        <Field label="强制用户组">
          <input value={draft.forceGroup} onChange={(event) => patch({ forceGroup: event.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function PermissionsEditor({ share, onClose }: { share: Share; onClose: () => void }) {
  const [owner, setOwner] = useState('');
  const [group, setGroup] = useState('');
  const [mode, setMode] = useState('0775');
  const [recursive, setRecursive] = useState(true);
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const apply = async () => {
    setBusy(true);
    try {
      const result = await api.shares.permissions(share.name, {
        owner: owner || undefined,
        group: group || undefined,
        mode: mode || undefined,
        recursive,
        create,
      });
      toast.success(result.applied.length ? `已应用：${result.applied.join('；')}` : '没有需要应用的更改');
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`设置权限 - ${share.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn--primary" onClick={apply} disabled={busy}>
            {busy ? '应用中…' : '应用'}
          </button>
        </>
      }
    >
      <Banner kind="warn">
        将对目录 <span className="mono">{share.path}</span> 执行 chown / chmod 操作，请确认路径无误。
      </Banner>

      <div className="grid grid--3">
        <Field label="属主用户" hint="留空表示不修改">
          <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="如 sakmist" />
        </Field>
        <Field label="属主用户组" hint="留空表示不修改">
          <input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="如 users" />
        </Field>
        <Field label="目录权限" hint="八进制，如 0775">
          <input value={mode} onChange={(event) => setMode(event.target.value)} />
        </Field>
      </div>

      <div className="grid grid--2">
        <Checkbox checked={recursive} onChange={setRecursive} label="递归应用到子目录与文件" />
        <Checkbox checked={create} onChange={setCreate} label="目录不存在时自动创建" />
      </div>
    </Modal>
  );
}
