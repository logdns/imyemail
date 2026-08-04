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
  | sudo env IMYEMAIL_VERSION=v1.3.1 bash
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

`backup` 创建 SQLite 在线备份，文件位于 `/opt/imyemail/data/backups`。它不包含 Maildir、附件、DKIM 私钥和环境配置。完整灾难恢复备份应额外保存以下内容，并把副本放到安装目录之外：

SQLite 数据库及其备份权限会设置为 `0600`，但其中仍包含系统设置、ACME EAB HMAC、OAuth/SMTP 等服务端凭据。复制到外部存储时必须继续加密并限制访问。

```text
/opt/imyemail/.env
/opt/imyemail/data/
/opt/imyemail/mail/
/opt/imyemail/dkim/
/opt/imyemail/data/certificates/
```

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
