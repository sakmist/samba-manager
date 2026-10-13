import { useCallback, useEffect, useState } from 'react';
import type { StatusSnapshot } from '../../shared/types';
import { api } from '../api';
import { Banner, useToast } from './ui';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

export function MonitorTab() {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setSnapshot(await api.status());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    try {
      setSnapshot(await api.refresh());
      toast.success('数据已刷新');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = snapshot?.status;

  return (
    <div>
      {snapshot?.smbstatusError ? (
        <Banner kind="warn">
          无法读取 smbstatus：{snapshot.smbstatusError}
          <div className="hint">
            通常是因为服务账号没有权限执行 smbstatus。请为运行用户配置免密 sudo，或让容器以 root 运行。
          </div>
        </Banner>
      ) : null}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">概览</h2>
          <span className="card__sub">最近检查：{formatTime(snapshot?.lastChecked ?? null)}</span>
          <div className="spacer" />
          <button className="btn btn--primary btn--sm" onClick={refresh} disabled={busy}>
            {busy ? '刷新中…' : '立即刷新'}
          </button>
        </div>
        <div className="card__body">
          <div className="stat-row">
            <div className="stat">
              <div className="stat__label">会话</div>
              <div className="stat__value">{status?.sessions.length ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat__label">连接的服务</div>
              <div className="stat__value">{status?.services.length ?? 0}</div>
            </div>
            <div className="stat">
              <div className="stat__label">锁定文件</div>
              <div className="stat__value">{status?.lockedFiles.length ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">最近事件</h2>
        </div>
        <div className="card__body">
          {snapshot?.notifications.length ? (
            <div className="notice-list">
              {snapshot.notifications.map((notice, index) => (
                <div className="notice" key={`${notice.time}-${index}`}>
                  <time>{formatTime(notice.time)}</time>
                  {notice.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">暂无新连接事件</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">活动会话</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>客户端 IP</th>
                <th>组</th>
                <th>协议</th>
                <th>PID</th>
                <th>加密</th>
              </tr>
            </thead>
            <tbody>
              {status?.sessions.length ? (
                status.sessions.map((session) => (
                  <tr key={`${session.pid}-${session.client}`}>
                    <td>{session.username}</td>
                    <td className="mono">{session.client}</td>
                    <td>{session.group}</td>
                    <td>{session.protocol}</td>
                    <td className="mono">{session.pid}</td>
                    <td className="mono">{session.encryption}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    当前没有活动会话
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">共享连接</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>共享</th>
                <th>客户端</th>
                <th>连接时间</th>
                <th>PID</th>
                <th>加密</th>
                <th>签名</th>
              </tr>
            </thead>
            <tbody>
              {status?.services.length ? (
                status.services.map((service, index) => (
                  <tr key={`${service.pid}-${service.service}-${index}`}>
                    <td>{service.service}</td>
                    <td className="mono">{service.machine}</td>
                    <td>{service.connectedAt}</td>
                    <td className="mono">{service.pid}</td>
                    <td className="mono">{service.encryption}</td>
                    <td className="mono">{service.signing}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    当前没有共享连接
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">锁定文件</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>共享路径</th>
                <th>文件</th>
                <th>权限</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {status?.lockedFiles.length ? (
                status.lockedFiles.map((file, index) => (
                  <tr key={`${file.pid}-${file.name}-${index}`}>
                    <td>{file.user}</td>
                    <td className="mono">{file.sharePath}</td>
                    <td className="mono">{file.name}</td>
                    <td className="mono">{file.rw}</td>
                    <td className="mono">{file.time}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty">
                    当前没有锁定文件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
