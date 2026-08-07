# imyemail Docker 部署说明

本文说明生产环境单容器部署、可选多容器调试部署、证书、镜像与常见故障。系统架构和组件边界见 [架构说明](../docs/ARCHITECTURE.md)。

## 一键安装与更新

推荐使用仓库根目录的最小 bootstrap 安装 Rust 管理器：

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh | sudo bash
```

后续操作：

```bash
sudo imyemail self-update
sudo imyemail update
sudo imyemail backup
sudo imyemail doctor
sudo imyemail status
sudo imyemail logs
sudo imyemail start
sudo imyemail stop
sudo imyemail restart
sudo imyemail rollback
```

bootstrap 从 GitHub Release 下载匹配架构的 Rust 静态二进制和 `.sha256`，校验后原子安装管理命令；它不会执行 `get.docker.com | sh`。一键安装会把配置和数据放在 `/opt/imyemail`，并部署内部 Operator 与 Watchtower。两者均不映射公网端口，仅接受带随机令牌的容器内请求；后台在线更新和回滚也只允许超级管理员执行。完整的更新、备份、回滚与永久卸载边界见 [安装与运维文档](../docs/OPERATIONS.md)。

注意：`imyemail backup` 只备份 SQLite。完整备份、迁移和恢复还必须成套保存 `.env`、`data`、`mail` 与 `dkim`，命令见 [停机完整备份](../docs/OPERATIONS.md#停机完整备份)。

## 最简单部署：单容器镜像版

服务器上不需要源码构建，只要 `docker-compose.yml` 和 `.env` 即可。

```bash
cd deploy
cp .env.example .env
# 修改 IMYEMAIL_PUBLIC_HOSTNAME / IMYEMAIL_PUBLIC_BASE_URL / IMYEMAIL_ADMIN_USERNAME / IMYEMAIL_ADMIN_PASSWORD
docker compose pull
docker compose up -d
```

网站名称和浏览器标题可在后台“系统设置 → 基础”修改；`IMYEMAIL_SITE_NAME`、`IMYEMAIL_SITE_TITLE` 仅提供首次启动默认值，后台保存后以数据库设置为准。

在源码仓库中也可通过兼容入口调用同一个 Rust 管理器安装流程（需要 root）：

```bash
sudo ./deploy/install.sh
```

默认启动一个业务容器和两个不对公网开放的运维容器：

```text
imyemail
operator
updater
```

容器内部包含：

- Go API
- Web 静态站点
- Nginx
- Postfix
- Dovecot
- Rspamd

常用命令：

```bash
# 查看日志
docker compose logs -f imyemail

# 更新镜像并重启
docker compose pull
docker compose up -d

# 停止
docker compose down
```

## GHCR 镜像权限

默认镜像：

```text
ghcr.io/logdns/imyemail:latest
ghcr.io/logdns/imyemail-api:latest
ghcr.io/logdns/imyemail-web:latest
ghcr.io/logdns/imyemail-gateway:latest
ghcr.io/logdns/imyemail-postfix:latest
ghcr.io/logdns/imyemail-dovecot:latest
ghcr.io/logdns/imyemail-rspamd:latest
```

正式镜像由 `vX.Y.Z` Git 标签触发 GitHub Actions 构建，并同时发布版本号、`latest` 和不可变的 `sha-*` 标签。生产环境建议固定完整版本标签；需要自动跟随最新正式版时再使用 `latest`。

验证远端镜像清单：

```bash
docker buildx imagetools inspect ghcr.io/logdns/imyemail:latest
```

如果拉取时报：

```text
unauthorized
```

说明 GHCR Package 还是私有，二选一：

1. 到 GitHub Packages 把镜像改成 Public。
2. 在服务器登录 GHCR：

```bash
echo "<github_token>" | docker login ghcr.io -u <github_user> --password-stdin
```

## 本地源码构建

如果你是在完整源码仓库里本机构建，使用 build override：

```bash
cd deploy
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

这样会使用 `deploy/all-in-one/Dockerfile` 构建单容器镜像。

如果构建服务器无法访问默认的 Go 模块代理，可在 `.env` 中切换代理后重试：

```env
IMYEMAIL_BUILD_GOPROXY=https://goproxy.cn,direct
```

该变量只在源码构建阶段传入 Dockerfile，不会写入运行时容器。应只使用可信的 Go 模块代理；网络恢复后可改回默认的 `https://proxy.golang.org,direct`。

## 可选：多容器调试部署

如果需要分别查看 Postfix / Dovecot / Rspamd 日志，可以使用 stack 编排。

拉取镜像版：

```bash
cd deploy
docker compose -f docker-compose.stack.yml up -d
```

源码构建版：

```bash
cd deploy
docker compose -f docker-compose.stack.yml -f docker-compose.stack.build.yml up -d --build
```

## DNS

进入 Web 管理后台后，在域名管理中查看每个域名需要配置的：

- MX
- SPF TXT
- DKIM TXT
- DMARC TXT

配置完成后点击“检测”。

## 邮件服务边界

- Postfix 读取 `/data/imyemail.db` 中的 `domains`、`mailboxes`、`aliases`。
- SQLite 主文件和 WAL/SHM 通过 `IMYEMAIL_DB_SHARED_GID` 与 Postfix 共享；默认 Debian Postfix 组 GID 为 `103`，不要把数据库改成全局可读。
- Dovecot 读取同一个 SQLite 数据库进行邮箱认证，并使用 `/var/mail/vhosts` 作为 Maildir 根目录。
- 第三方客户端可使用 IMAP SSL `993`、POP3 SSL `995`、SMTP SSL `465` 或 Submission `587`；SMTP Submission 同时支持 `AUTH PLAIN` 和 `AUTH LOGIN`。
- Rspamd 通过 milter 接入 Postfix，负责 DKIM 签名和垃圾邮件标记。
- Rspamd 规则缓存持久化在 `rspamd-cache`；milter 使用短超时并允许故障降级，避免过滤器启动时阻塞 SMTP。
- Rspamd 会周期性从 SQLite 导出域名 DKIM 私钥到容器内 `/var/lib/rspamd/dkim`。
- Go API 是 Webmail 和管理后台入口；浏览器不直接连接 SMTP/IMAP/POP3。
- Go API 会读取 `IMYEMAIL_MAILDIR_ROOT=/var/mail/vhosts`，周期扫描 Maildir，把 Postfix/Dovecot 入站邮件同步成 Webmail 索引。
- 第三方客户端可通过 imyemail API 提供的 SMTP `465/587` 发信；Webmail/API 和第三方客户端的“已发送”都由 API 写入，外发投递进入发送队列并由 API worker relay/retry，客户端后续 IMAP APPEND 到 Sent 会按 `Message-ID` 去重。
- 用户可在个人邮箱管理中接入外部 IMAP 账号；默认关闭，可在后台“系统设置 > 外部 IMAP”开启并配置密钥/OAuth。本地存储模式会同步到 imyemail，远端直连模式每次从远端读取。启用前必须配置外部 IMAP 密码加密密钥，默认不允许连接 localhost / 内网 / link-local IMAP 主机。Gmail / Microsoft 365 / Outlook OAuth2 需要在对应控制台配置回调地址：`/api/external-imap-oauth/gmail/callback` 或 `/api/external-imap-oauth/outlook/callback`。
- send-as v1 支持本人邮箱、启用的别名转发 source 指向本人邮箱，或数据库表 `send_as_grants` 中显式授权的地址。

## 邮件客户端 TLS 证书

imyemail 使用同一组证书保护 Web HTTPS、Postfix SMTP STARTTLS、API SMTP Submission、Dovecot IMAPS 和 POP3S。默认证书目录是 `/data/certificates`，首次启动会生成有效期 30 天的临时自签证书，确保各服务能够安全启动；生产环境应尽快在后台“系统设置 → SSL 证书”启用 ACME。

支持的证书机构：

| 提供商 | ACME 配置 |
| --- | --- |
| Let's Encrypt | 联系邮箱即可 |
| ZeroSSL | 联系邮箱、EAB KID、EAB HMAC Key |
| Google Trust Services | 联系邮箱、EAB KID、EAB HMAC Key |

自动签发采用 HTTP-01，必须满足：

- `IMYEMAIL_PUBLIC_HOSTNAME` 的 A/AAAA 指向本机公网 IP
- 公网 TCP `80` 能访问 imyemail Gateway
- CDN/反向代理不能拦截 `/.well-known/acme-challenge/`
- 提前续期天数设置在 7–60 天之间，默认 30 天

证书文件写入后，Gateway、Postfix、Dovecot 会在约 15 秒内检测变化并热重载；API SMTP Submission 每次 TLS 握手都会读取当前文件。状态、签发错误、签发机构和到期时间可在后台查看，也可以点击“立即签发/续期”。

相关环境变量：

```env
IMYEMAIL_CERTIFICATE_DIR=/data/certificates
IMYEMAIL_TLS_CERT_FILE=/data/certificates/fullchain.pem
IMYEMAIL_TLS_KEY_FILE=/data/certificates/privkey.pem
IMYEMAIL_CERTIFICATE_AUTO_ENABLED=false
IMYEMAIL_CERTIFICATE_PROVIDER=letsencrypt
IMYEMAIL_CERTIFICATE_EMAIL=admin@example.com
IMYEMAIL_CERTIFICATE_EAB_KID=
IMYEMAIL_CERTIFICATE_EAB_HMAC=
IMYEMAIL_CERTIFICATE_RENEW_BEFORE_DAYS=30
```

EAB HMAC Key 仅保存在服务端 SQLite 设置中，后台接口只返回“已设置”状态，不会把密钥返回浏览器。更换提供商时会使用相互隔离的 ACME 账号缓存。

Web 站点也可以由宿主机 Nginx / 宝塔反代到容器 `80`。此时可在 `.env` 调整端口绑定，避免冲突：

```dotenv
IMYEMAIL_HTTP_BIND=127.0.0.1:8088
IMYEMAIL_HTTPS_BIND=127.0.0.1:8443
```

宿主机 Nginx 必须把 `/.well-known/acme-challenge/` 原样代理到 `http://127.0.0.1:8088`，否则 HTTP-01 会失败。不使用宿主机反向代理时保留默认 `80/443` 即可。

如需使用外部已有证书，可以关闭后台自动证书，并把 `IMYEMAIL_TLS_CERT_FILE`、`IMYEMAIL_TLS_KEY_FILE` 指向挂载后的 PEM 文件；证书必须覆盖 `IMYEMAIL_PUBLIC_HOSTNAME`。

## 邮件健康评分

域名管理中的“邮件评分”按 100 分检测：MX 15、SPF 15、DKIM 15、DMARC 15、公网 A/AAAA 10、PTR/rDNS 10、SMTP STARTTLS 10、可信托管证书 10。检测 SMTP 时只会连接解析出的公网 IP，拒绝 localhost、私网、link-local、CGNAT 和文档保留网段，避免把后台检测变成 SSRF 通道。

评分反映域名与传输层的基础投递就绪度，不代表 Gmail/Outlook 的实际收件箱命中率，也不分析邮件正文的 SpamAssassin/Rspamd 分数。实际投递仍受 IP 信誉、发送频率、内容和收件方策略影响。

## SMTP 发信排查

单容器部署时，Webmail 发信默认提交给同容器内的 Postfix：

```env
IMYEMAIL_SMTP_HOST=127.0.0.1
IMYEMAIL_SMTP_PORT=25
IMYEMAIL_SMTP_REQUIRE_TLS=false
```

如需把上游服务商或 DSN 处理器的最终送达、退信、投诉、拒收事件写回开放 API，请设置：

```env
IMYEMAIL_DELIVERY_WEBHOOK_SECRET=replace-with-a-long-random-secret
```

回调地址、签名算法和事件格式见仓库中的 `docs/API.md` 与 `docs/openapi.json`。该接口未配置密钥时返回 `503`。

如需把状态变化主动推送到集成方，可额外设置：

```env
IMYEMAIL_STATUS_WEBHOOK_URL=https://integration.example.com/hooks/imyemail
IMYEMAIL_STATUS_WEBHOOK_SECRET=replace-with-another-long-random-secret
IMYEMAIL_STATUS_WEBHOOK_ALLOW_PRIVATE_HOSTS=false
```

事件先写入 SQLite outbox，再由后台 worker 投递；非 2xx 响应会按退避策略重试，最多 10 次。默认只允许公网 HTTPS，禁止重定向、URL 用户信息和私网/本机目标。只有可信内网或本地测试才应开启 `IMYEMAIL_STATUS_WEBHOOK_ALLOW_PRIVATE_HOSTS`。

Split stack 使用 `docker-compose.stack.yml` 时，API 容器默认会把 `IMYEMAIL_SMTP_HOST` 覆盖为 `postfix`，让 Webmail 和 SMTP 提交都 relay 到 Postfix service。只有改用外部 SMTP 时才需要在 `.env` 明确填写 `IMYEMAIL_STACK_SMTP_HOST` / `IMYEMAIL_STACK_SMTP_PORT`。

如果发送队列里出现 relay 失败，通常是 Postfix 会话被中断或外部 SMTP 配置错误。优先检查：

```bash
docker compose exec imyemail supervisorctl status
docker compose exec imyemail sh -lc 'stat -c "%U:%G %a %n" /data/imyemail.db*'
docker compose exec imyemail postconf -M smtp/inet
# SMTP 提交 465/587 由 imyemail API 提供，不再由 Postfix 监听。
docker compose exec imyemail sqlite3 /data/imyemail.db "select key,value from system_settings where key like 'smtp%' order by key;"
docker compose exec imyemail sqlite3 /data/imyemail.db "select status,attempt_count,last_error from send_queue order by created_at desc limit 10;"
docker compose logs --tail=200 imyemail
```

客户端添加账户失败时，不要只看“账户设置错误”的通用弹窗。先用 `openssl s_client` 分别检查 `465` 和 `587 -starttls smtp`，执行 `EHLO test.example` 后应看到 `AUTH PLAIN LOGIN`；再到用户的“通知与客户端”页判断具体失败的是 IMAP、POP3 还是 SMTP。用户名必须是完整邮箱地址；启用 2FA 后三种协议都必须使用对应邮箱的应用密码。

数据库及 WAL/SHM 在 all-in-one 中应为 `root:postfix 660`。如果出现 `read tcp 127.0.0.1:*->127.0.0.1:25: i/o timeout`，同时检查这些权限和 Rspamd 状态；不要只反复重试发送队列。

确认后台“系统设置”里没有把本机 Postfix 的 `SMTP Require TLS` 打开；本机 `127.0.0.1:25` 必须保持 TLS=false。

## 生产注意

- 建议在服务器或边缘网关配置 HTTPS。
- 云厂商通常默认封禁 25 端口，需要单独申请解封。
- SQLite 适合 V1 单机部署；多节点部署前迁移到 PostgreSQL，并把 Postfix/Dovecot maps 改为 PostgreSQL。
