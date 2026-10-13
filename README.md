# Samba Manager

Samba (SMB) 连接监控 + 可视化管理控制台。在原
[samba-monitor](https://github.com/milindpatel63/samba-monitor) 的基础上用
**TypeScript 重写**，并加入了一套完整的 Web 管理界面：可以直接在浏览器里配置共享目录、
Samba 用户和文件权限。

A TypeScript rewrite of `samba-monitor` that adds a full management console for
shares, users and permissions — plus the original connection monitoring.

---

## 功能

**监控（保留原有能力）**

- 定时轮询 `smbstatus`，展示活动会话、共享连接、锁定文件
- 新客户端连接时推送通知到 Discord / ntfy
- 支持排除指定 IP，不再对它们发通知
- 前端仪表盘每 10 秒自动刷新

**管理（新增）**

- **共享目录**：图形化增删改 `smb.conf` 共享段，设置路径、可见性、只读/读写、匿名访问、
  可访问用户、可写用户、掩码、强制用户等
- **用户**：创建 / 删除 Samba 账号、修改密码、启用停用；缺少同名系统账号时自动创建
- **权限**：对共享目录一键 `chown` / `chmod`（可选递归、目录不存在时自动创建）
- **系统**：`testparm` 配置校验、重载 / 重启 Samba、自动写入 include 配置、环境自检
- **设置**：通知渠道、排除 IP、轮询间隔、管理密码，全部在界面内完成，无需改环境变量重部署

**工程**

- 后端 Express + TypeScript（严格模式），前端 React + Vite + TypeScript
- 26 个单元 / 接口测试（`vitest` + `supertest`），GitHub Actions 做类型检查、测试与镜像构建
- 提供 Docker 与主机 systemd 两种部署方式

---

## 快速开始

### 方式一：Docker Compose

```bash
git clone https://github.com/sakmist/samba-manager.git
cd samba-manager
ADMIN_PASSWORD='换成你的强密码' docker compose up -d --build
```

打开 `http://<NAS地址>:5069`，用 `admin` 和你设置的密码登录。

> 镜像内自带 Samba 服务，容器同时扮演 SMB 服务器和管理控制台。
> 如果你的 NAS 上已经跑着 Samba，请把 compose 里的 `445:445` 端口映射去掉，
> 只保留 Web 端口。

### 方式二：主机安装（systemd）

适合“让管理器直接管理 NAS 上的 Samba”的场景：

```bash
git clone https://github.com/sakmist/samba-manager.git
cd samba-manager
sudo ./deploy/install.sh
```

脚本会：安装 `samba` 与 Node.js 22 → 构建前端后端 → 部署到 `/opt/samba-manager`
→ 注册并启动 `samba-manager.service` → 把受管共享文件 include 进 `smb.conf`。

若未设置 `ADMIN_PASSWORD`，首次启动会生成一个随机密码并打印到日志：

```bash
journalctl -u samba-manager | grep -i password
```

---

## 配置

所有配置都可以通过环境变量提供；除密码外，其余均可在界面「设置」页修改并持久化。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `5069` | Web 控制台端口（兼容原项目的 `FLASK_PORT`） |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 存放设置、凭据与会话密钥的目录 |
| `ADMIN_USER` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | *(空)* | 管理员密码；留空则首次启动随机生成并打印 |
| `AUTH_DISABLED` | `false` | 设为 `true` 关闭登录（仅限可信反向代理后使用） |
| `TRUST_PROXY` | `false` | 置于反向代理后时设为 `true`（启用 Secure Cookie） |
| `SAMBA_CONF` | `/etc/samba/smb.conf` | 主配置文件路径 |
| `SAMBA_MANAGER_CONF` | `/etc/samba/samba-manager.conf` | 本程序管理的共享文件 |
| `SAMBA_SERVICE` | `smbd` | systemd 服务名 |
| `SAMBA_MANAGER_SUDO` | `auto` | 设为 `never` 表示不通过 sudo 提权（已以 root 运行时自动跳过） |
| `POLL_INTERVAL_SEC` | `30` | 轮询 `smbstatus` 的间隔 |
| `DISCORD_WEBHOOK_URL` | *(空)* | Discord 通知 Webhook |
| `NTFY_TOPIC_URL` | *(空)* | ntfy 主题地址 |
| `EXCLUDED_IPS` | *(空)* | 逗号分隔，这些 IP 不触发通知 |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

---

## 权限与安全

控制台需要执行 `smbstatus`、`smbpasswd`、`pdbedit`、`chown`、`chmod` 等命令，这些都需要 root：

- **Docker 部署**：容器默认以 root 运行，无需额外配置。
- **主机部署**：`install.sh` 默认让服务以 root 运行（`SERVICE_USER` 可改）。
  如果希望降低权限，可创建一个专用账号并配置 sudoers 白名单，例如：

  ```
  samba-manager ALL=(root) NOPASSWD: /usr/bin/smbstatus, /usr/bin/smbpasswd, /usr/bin/pdbedit, /usr/bin/testparm, /usr/bin/systemctl reload smbd, /usr/bin/chown, /usr/bin/chmod, /usr/bin/useradd, /usr/bin/userdel, /usr/bin/tee, /usr/bin/cat, /usr/bin/mkdir
  ```

  `chown` / `chmod` 本质上等价于 root，因此**管理控制台应只在内网暴露**。

其它安全设计：

- 登录使用 scrypt 哈希 + HMAC 签名的 HttpOnly 会话 Cookie（12 小时有效）
- 修改共享前先经 `testparm` 校验，校验不通过不会重载 Samba
- 共享名、路径、用户名、权限掩码均有白名单校验，路径禁止 `..`
- 本程序只改写 `samba-manager.conf`，不会碰你手写的 `smb.conf` 内容

---

## 项目结构

```
src/
  shared/types.ts        前后端共享类型
  server/
    index.ts             Express 应用入口
    config.ts            环境变量、设置持久化、凭据
    auth.ts              会话 Cookie 认证
    exec.ts              命令执行（sudo 封装）
    smbstatus.ts         smbstatus 输出解析
    monitor.ts           轮询与通知循环
    notifier.ts          Discord / ntfy 推送
    samba/
      conf.ts            smb.conf 受管片段读写与校验
      users.ts           pdbedit / smbpasswd 用户管理
      permissions.ts     chown / chmod
      service.ts         testparm、服务重载、环境探测
      status.ts          smbstatus 调用
      fsops.ts           特权文件读写
    routes/              REST 接口
  web/                   React 前端
deploy/                  安装脚本、systemd 单元、容器入口
tests/                   vitest 测试
```

---

## 开发

```bash
npm install
npm run dev        # 前端 5173，后端 5069，前端自动代理 /api
npm run typecheck
npm test
npm run build && npm start
```

---

## 从 samba-monitor 迁移

原项目是单个 Flask 文件 + jQuery 模板。本项目的接口与原版保持兼容并扩展：

- `GET /health` — 健康检查（原样保留）
- `GET /api/status` — 替代原 `/refresh_data`，返回驼峰命名的新结构
- 原环境变量 `FLASK_PORT`、`DISCORD_WEBHOOK_URL`、`NTFY_TOPIC_URL`、`EXCLUDED_IPS`
  仍然可用

字段由 `snake_case` 改为 `camelCase`（如 `locked_files` → `lockedFiles`、
`connected_at` → `connectedAt`），前端已同步。

---

## License

MIT。本项目基于 [milindpatel63/samba-monitor](https://github.com/milindpatel63/samba-monitor)
（Copyright © 2025 Milind Patel）重写，原始许可证见 [LICENSE](LICENSE)。
