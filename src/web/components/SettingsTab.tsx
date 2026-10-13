import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';
import { api } from '../api';
import { Checkbox, Field, TagInput, useToast } from './ui';

export function SettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const toast = useToast();

  useEffect(() => {
    api.settings
      .get()
      .then(setSettings)
      .catch((error: Error) => toast.error(error.message));
  }, [toast]);

  if (!settings) return <div className="empty">加载中…</div>;

  const patch = (values: Partial<Settings>) => setSettings({ ...settings, ...values });

  const save = async () => {
    setBusy(true);
    try {
      setSettings(await api.settings.update(settings));
      toast.success('设置已保存');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const { results } = await api.settings.test();
      const summary = results.map((entry) => `${entry.channel}: ${entry.ok ? '成功' : '失败'}`).join('，');
      if (results.every((entry) => entry.ok)) toast.success(summary);
      else toast.error(summary);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const changePassword = async () => {
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('密码已更新');
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card__head">
          <h2 className="card__title">监控与通知</h2>
        </div>
        <div className="card__body">
          <div className="grid grid--2">
            <Field label="Discord Webhook" hint="留空则不发送 Discord 通知">
              <input
                value={settings.discordWebhookUrl}
                placeholder="https://discord.com/api/webhooks/…"
                onChange={(event) => patch({ discordWebhookUrl: event.target.value })}
              />
            </Field>
            <Field label="ntfy 主题地址" hint="留空则不发送 ntfy 通知">
              <input
                value={settings.ntfyTopicUrl}
                placeholder="https://ntfy.sh/my-topic"
                onChange={(event) => patch({ ntfyTopicUrl: event.target.value })}
              />
            </Field>
          </div>

          <Field label="排除的客户端 IP" hint="这些 IP 建立连接时不发送通知">
            <TagInput
              values={settings.excludedIps}
              onChange={(values) => patch({ excludedIps: values })}
              placeholder="输入 IP，回车添加"
            />
          </Field>

          <div className="grid grid--2">
            <Field label="轮询间隔（秒）" hint="检查 smbstatus 的频率，范围 5-3600">
              <input
                type="number"
                min={5}
                max={3600}
                value={settings.pollIntervalSec}
                onChange={(event) => patch({ pollIntervalSec: Number(event.target.value) })}
              />
            </Field>
            <div style={{ paddingTop: 24 }}>
              <Checkbox
                checked={settings.autoReload}
                onChange={(value) => patch({ autoReload: value })}
                label="修改共享后自动重载 Samba"
              />
            </div>
          </div>

          <div className="row">
            <button className="btn btn--primary" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存设置'}
            </button>
            <button className="btn" onClick={test}>
              发送测试通知
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2 className="card__title">管理员密码</h2>
        </div>
        <div className="card__body">
          <div className="grid grid--2">
            <Field label="当前密码">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="新密码" hint="至少 6 位">
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
          </div>
          <button
            className="btn btn--primary"
            onClick={changePassword}
            disabled={!currentPassword || newPassword.length < 6}
          >
            修改密码
          </button>
        </div>
      </div>
    </div>
  );
}
