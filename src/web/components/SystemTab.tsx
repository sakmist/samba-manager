import { useCallback, useEffect, useState } from 'react';
import type { SystemInfo } from '../../shared/types';
import { api } from '../api';
import { Banner, useToast } from './ui';

type Info = SystemInfo & { includePresent: boolean };

export function SystemTab() {
  const [info, setInfo] = useState<Info | null>(null);
  const [testparmOutput, setTestparmOutput] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setInfo(await api.system.info());
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const runTestparm = async () => {
    setBusy(true);
    try {
      const result = await api.system.testparm();
      setTestparmOutput(result.output || '（无输出）');
      if (result.ok) toast.success('配置校验通过');
      else toast.error('配置存在问题，请查看输出');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reload = async () => {
    setBusy(true);
    try {
      const result = await api.system.reload();
      toast.success(`已重载：${result.message}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    if (!window.confirm('重启 Samba 会断开所有当前连接，确定继续吗？')) return;
    setBusy(true);
    try {
      const result = await api.system.restart();
      toast.success(`已重启：${result.message}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ensureInclude = async () => {
    setBusy(true);
    try {
      const result = await api.system.ensureInclude();
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {info && !info.sambaInstalled ? (
        <Banner kind="error">
          未检测到 Samba。请在服务器上安装：<span className="mono">apt install samba</span>
        </Banner>
      ) : null}

      {info && !info.includePresent ? (
        <Banner kind="warn">
          主配置尚未包含本程序管理的共享文件，新建的共享不会生效。
          <div style={{ marginTop: 8 }}>
            <button className="btn btn--sm btn--primary" onClick={ensureInclude} disabled={busy}>
              自动写入 include 配置
            </button>
          </div>
        </Banner>
      ) : null}

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">系统信息</h2>
          <div className="spacer" />
          <button className="btn btn--ghost btn--sm" onClick={() => void load()}>
            重新检测
          </button>
        </div>
        <div className="card__body">
          {info ? (
            <div className="stat-row">
              <div className="stat">
                <div className="stat__label">主机名</div>
                <div className="stat__value" style={{ fontSize: 16 }}>
                  {info.hostname}
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">Samba</div>
                <div className="stat__value" style={{ fontSize: 16 }}>
                  <span className={`badge ${info.sambaInstalled ? 'badge--ok' : 'badge--bad'}`}>
                    {info.sambaInstalled ? '已安装' : '未安装'}
                  </span>
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">smbd 服务</div>
                <div className="stat__value" style={{ fontSize: 16 }}>
                  <span className={`badge ${info.smbdActive ? 'badge--ok' : 'badge--warn'}`}>
                    {info.smbdActive ? '运行中' : '未运行'}
                  </span>
                </div>
              </div>
              <div className="stat">
                <div className="stat__label">运行权限</div>
                <div className="stat__value" style={{ fontSize: 16 }}>
                  <span className={`badge ${info.privileged ? 'badge--ok' : 'badge--warn'}`}>
                    {info.privileged ? 'root' : '普通用户'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">检测中…</div>
          )}

          {info ? (
            <div style={{ marginTop: 18 }} className="grid grid--2">
              <div>
                <div className="stat__label">主配置</div>
                <div className="mono">{info.configPath}</div>
              </div>
              <div>
                <div className="stat__label">管理的共享文件</div>
                <div className="mono">{info.managedConfigPath}</div>
              </div>
              <div>
                <div className="stat__label">服务名</div>
                <div className="mono">{info.serviceName}</div>
              </div>
              <div>
                <div className="stat__label">版本</div>
                <div className="mono">{info.version}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">配置与服务</h2>
        </div>
        <div className="card__body">
          <div className="row">
            <button className="btn" onClick={runTestparm} disabled={busy}>
              校验配置 (testparm)
            </button>
            <button className="btn" onClick={reload} disabled={busy}>
              重载配置
            </button>
            <button className="btn btn--danger" onClick={restart} disabled={busy}>
              重启 Samba
            </button>
          </div>

          {testparmOutput ? (
            <div style={{ marginTop: 16 }}>
              <div className="stat__label" style={{ marginBottom: 6 }}>
                校验输出
              </div>
              <pre className="output">{testparmOutput}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
