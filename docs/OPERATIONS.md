# imyemail 安装与运维

本文覆盖安装、更新、备份、回滚、诊断和卸载。部署拓扑与组件边界见 [架构说明](ARCHITECTURE.md)。

仓库根目录的 `install.sh` 只负责下载并校验 Rust 管理器；安装、更新、备份、健康检查、回滚和卸载均由 `imyemail` 二进制实现。支持 Debian/Ubuntu Linux 的 amd64 与 arm64。

## 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh | sudo bash
```

安装器从 GitHub Release 下载与当前架构匹配的管理器和同名 `.sha256`，校验后原子安装到 `/usr/local/bin/imyemail`。Docker 缺失时仅通过 Debian/Ubuntu 系统软件源安装，不执行远程 Docker 安装脚本。

如需先审阅 bootstrap：

```bash
curl -fsSLo imyemail-install.sh https://raw.githubusercontent.com/logdns/imyemail/main/install.sh
less imyemail-install.sh
sudo bash imyemail-install.sh
```

可以固定管理器 Release 版本：

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh \
  | sudo env IMYEMAIL_VERSION=v1.3.7 bash
```

SHA-256 用于检测下载损坏或附件不一致；管理器与校验文件来自同一个 GitHub Release，目前不提供独立代码签名。

非交互安装必须提供 `IMYEMAIL_PUBLIC_HOSTNAME`。未提供管理员密码时会生成随机密码，并以 `0600` 权限写入 `/opt/imyemail/.initial-admin-password`；首次登录并安全保存密码后应删除该文件。

首次启动会在 `/opt/imyemail/data/certificates` 生成仅用于引导的 30 天自签证书。登录后台“系统设置 → SSL 证书”，选择 Let's Encrypt、ZeroSSL 或 Google Trust Services，填写联系邮箱并启用自动签发。ZeroSSL/GTS 还需对应平台提供的 EAB KID 与 HMAC Key。HTTP-01 要求公网 DNS 已指向服务器且 TCP 80 可达；成功后 Web、SMTP、IMAP 和 POP3 会在约 15 秒内重载新证书。

## 管理命令

```bash
sudo imyemail install
sudo imyemail self-update
sudo imyemail update
sudo imyemail update --skip-manager-update
sudo imyemail backup
sudo imyemail doctor
sudo imyemail status
sudo imyemail logs
sudo imyemail logs --tail 500 --no-follow
sudo imyemail start
sudo imyemail stop
sudo imyemail restart
sudo imyemail rollback
```

`update` 的顺序是：在线备份 SQLite、保存当前镜像与 Compose、刷新内嵌部署文件、拉取和启动新版本、健康检查；启动或健康检查失败时会自动恢复上一次镜像与 Compose。`rollback` 只回滚最近一次命令行更新保存的镜像，不回滚数据库内容。

安装、更新、备份、回滚和卸载等写操作共用系统级排他锁；另一个管理操作正在运行时，新命令会直接报错，避免并发更新和重复备份互相覆盖。

`backup` 创建一致性的 SQLite 在线备份，文件位于 `/opt/imyemail/data/backups`：

```bash
sudo imyemail backup
sudo ls -lh /opt/imyemail/data/backups
```

它只适合数据库级快速恢复，不包含 Maildir、附件、DKIM 私钥和环境配置。完整灾难恢复备份必须同时保存以下内容，并把副本放到安装目录之外：

SQLite 数据库及其备份权限会设置为 `0600`，但其中仍包含系统设置、ACME EAB HMAC、OAuth/SMTP 等服务端凭据。复制到外部存储时必须继续加密并限制访问。

```text
/opt/imyemail/.env
/opt/imyemail/data/
/opt/imyemail/mail/
/opt/imyemail/dkim/
/opt/imyemail/data/certificates/
```

`data/certificates` 已包含在 `data` 中，此处单列是为了强调 TLS 私钥不可遗漏。建议在独立加密存储中保留至少一份异机副本，并定期实际演练恢复。

### 停机完整备份

以下示例会短暂停止服务，避免数据库、Maildir 和附件处于不同时间点。将 `/srv/imyemail-backups` 换成独立磁盘或已挂载的备份存储：

```bash
sudo install -d -m 0700 /srv/imyemail-backups
sudo imyemail stop
sudo tar --numeric-owner --acls --xattrs -C /opt -czf \
  "/srv/imyemail-backups/imyemail-full-$(date -u +%Y%m%dT%H%M%SZ).tar.gz" \
  imyemail/.env imyemail/.imyemail-managed imyemail/docker-compose.yml \
  imyemail/data imyemail/mail imyemail/dkim
sudo imyemail start
sudo imyemail doctor
```

如果不能停机，先运行 `imyemail backup` 获得 SQLite 一致性副本，再快照 `mail`、`dkim` 和 `.env`。普通文件复制无法保证所有目录属于同一时间点，因此生产环境更推荐 LVM/ZFS/云盘快照。

### 同机完整恢复

恢复会替换当前数据。先确认归档路径和内容，再为当前状态额外制作一份可回退备份：

```bash
sudo tar -tzf /srv/imyemail-backups/imyemail-full-YYYYMMDDTHHMMSSZ.tar.gz | less
sudo imyemail stop
sudo mv /opt/imyemail "/opt/imyemail.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
sudo tar --numeric-owner --acls --xattrs -C /opt -xzf \
  /srv/imyemail-backups/imyemail-full-YYYYMMDDTHHMMSSZ.tar.gz
sudo chmod 0600 /opt/imyemail/.env
sudo chown -R 5000:5000 /opt/imyemail/mail
sudo imyemail start
sudo imyemail doctor
sudo imyemail status
```

保留的 `/opt/imyemail.before-restore-*` 是恢复失败时的回退点，确认邮件、附件、账号和客户端协议均正常后再删除。不要在两个副本上同时启动同一域名的邮件服务。

### 仅恢复 SQLite

仅在 Maildir、附件、DKIM 和 `.env` 都完好，且明确只需要回退账号或索引数据时使用。先停止服务，备份当前数据库，然后把在线备份复制为 `/opt/imyemail/data/imyemail.db`；同时删除同名 `-wal` 和 `-shm` 边车文件，最后启动并检查同步状态。SQLite 回退到早于 Maildir 的时间点后，Maildir 同步会重新索引仍存在的邮件，但无法找回已经从磁盘删除的原文或附件。

### 迁移到新服务器

1. 在旧服务器降低 MX/A 记录 TTL，运行 `imyemail backup`，然后按“停机完整备份”制作最终归档。最终切换时停止旧服务，避免新旧服务器同时接收或发出邮件。
2. 在新服务器安装相同或更高版本的 `imyemail` 管理器，停止服务，并把完整归档安全传输到新服务器。
3. 将归档恢复到 `/opt/imyemail`，保持 `.env`、`data`、`mail` 和 `dkim` 成套迁移；执行 `chmod 0600 /opt/imyemail/.env` 和 `chown -R 5000:5000 /opt/imyemail/mail`。
4. 如主机名改变，更新 `.env` 中的公网地址，重新签发证书，并同步修改 A/AAAA、MX、SPF、DKIM、DMARC 和 PTR/rDNS。域名不变时也要确认新 IP 的 PTR 与出站 25 端口。
5. 启动后运行 `imyemail doctor`、`imyemail status`，验证 Web 登录、收信、外发、IMAPS 993、Submission 587/465、POP3S 995、附件下载和 DKIM 签名。
6. DNS 完全收敛并观察队列无异常后，再下线旧服务器；至少保留旧机最终备份一个完整保留周期。

### 双因素认证与服务器时间

TOTP 依赖准确时间。Manager 在安装和更新时会尝试开启系统 NTP；异常时执行：

```bash
timedatectl status
sudo timedatectl set-ntp true
```

如果服务器使用 chrony，可再执行 `sudo chronyc makestep`。应用允许有限的时间漂移，并在绑定页面比较浏览器与服务器时间。启用 2FA 时会生成 8 个一次性恢复码，必须离线保存；验证器丢失或时间异常时可用恢复码登录。管理员也可在用户管理中重置 2FA，重置会同时撤销该账号的应用密码。

启用 2FA 后，第三方 IMAP/POP3/SMTP 客户端不能继续使用网页登录密码。用户需在“个人设置 → 安全 → 第三方客户端应用密码”按邮箱生成密码，生成前必须再次输入当前 TOTP 或恢复码；明文只显示一次，重新生成或撤销会立即使旧密码失效。

### 第三方邮件客户端

客户端用户名必须填写完整邮箱地址，收件与发件服务器都使用同一用户名和密码：

| 协议 | 服务器 | 端口 | 加密 | 鉴权 |
| --- | --- | --- | --- | --- |
| IMAP | 邮件公网主机名 | 993 | SSL/TLS | 邮箱密码或应用密码 |
| POP3 | 邮件公网主机名 | 995 | SSL/TLS | 邮箱密码或应用密码 |
| SMTP | 邮件公网主机名 | 465 | SSL/TLS | PLAIN 或 LOGIN |
| SMTP Submission | 邮件公网主机名 | 587 | STARTTLS（必须启用） | PLAIN 或 LOGIN |

“个人设置 → 通知与客户端”会显示选中邮箱最近 90 天、最多 100 条 IMAP/POP3/SMTP 鉴权结果，包括时间、来源 IP、协议、成功状态和客户端标识。记录只对邮箱所属用户开放；页面每 30 秒自动刷新。升级前的连接不会补录。

排错时先在该页面判断是收件协议还是 SMTP 鉴权失败，再检查容器日志和 TLS 能力：

```bash
sudo imyemail logs --tail 300 --no-follow
openssl s_client -connect mail.example.com:465 -crlf -quiet
# 连接后输入 EHLO test.example；响应应包含 AUTH PLAIN LOGIN
openssl s_client -connect mail.example.com:587 -starttls smtp -crlf -quiet
openssl s_client -connect mail.example.com:993 -crlf -quiet
openssl s_client -connect mail.example.com:995 -crlf -quiet
```

不要把密码放进命令行参数或公开日志。若 2FA 已启用，网页登录密码被协议服务拒绝是预期行为，必须使用当前邮箱的应用密码。

### 全域公告

具备系统设置修改权限的管理员可在“管理后台 → 系统设置 → 全域公告”发布普通、重要或紧急公告。新公告会自动替换当前公告；下线后前台不再展示。公告按纯文本渲染，不支持 HTML，以避免脚本注入。

建议在每次更新后运行：

```bash
sudo imyemail doctor
sudo imyemail status
```

`doctor` 检查 Docker、Compose、目录、健康端点、`.env` 权限、默认管理员密码和内部更新令牌。若 Web TLS 由可信反向代理终止，HTTP 公网 URL 提示可结合实际拓扑判断。

## 卸载与永久清除

默认卸载只移除容器和管理命令，保留 `/opt/imyemail` 中的配置、数据库、邮件、附件、DKIM 私钥和备份：

```bash
sudo imyemail uninstall
```

需要保留管理命令时：

```bash
sudo imyemail uninstall --keep-command
```

永久清除会删除整个安装目录，且不可恢复：

```bash
sudo imyemail uninstall --purge
```

交互确认必须输入 `DELETE`。自动化可使用 `--purge --yes`，但仅应在已核对 `IMYEMAIL_INSTALL_DIR` 且备份已复制到该目录之外时使用。管理器会校验绝对路径、拒绝宽泛路径和符号链接，并要求安装目录内存在有效的 `.imyemail-managed` 标记。

## 源码构建管理器

```bash
cd apps/manager
cargo +1.85.0 fmt --check
cargo +1.85.0 clippy --locked --all-targets --all-features -- -D warnings
cargo +1.85.0 test --locked
cargo +1.85.0 build --release --locked
```

本地构建产物位于 `apps/manager/target/release/imyemail`。正式 Release 由 GitHub Actions 分别生成 `imyemail-linux-amd64` 和 `imyemail-linux-arm64` 静态二进制。
