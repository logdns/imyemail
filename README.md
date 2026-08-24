# imyemail

imyemail 是一个可自建、可管理，包含 Webmail、管理后台和标准邮件协议服务的开源邮箱系统。

[![Release](https://img.shields.io/github/v/release/logdns/imyemail?display_name=tag&sort=semver)](https://github.com/logdns/imyemail/releases)
[![Docker Release](https://github.com/logdns/imyemail/actions/workflows/docker.yml/badge.svg)](https://github.com/logdns/imyemail/actions/workflows/docker.yml)
[![CI](https://github.com/logdns/imyemail/actions/workflows/ci.yml/badge.svg)](https://github.com/logdns/imyemail/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/logdns/imyemail)](LICENSE)

<a href="https://www.buymeacoffee.com/logdns"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me a Coffee" width="217" /></a>

[功能说明](docs/FEATURES.md) · [界面模板](docs/UI-TEMPLATES.md) · [更新日志](CHANGELOG.md) · [版本发布](https://github.com/logdns/imyemail/releases) · [架构说明](docs/ARCHITECTURE.md) · [开发规范](docs/DEVELOPMENT.md) · [部署文档](deploy/README.md) · [安装与运维](docs/OPERATIONS.md) · [API](docs/API.md) · [English](README.en.md)

## 主要功能

| 模块 | 能力 |
| --- | --- |
| Webmail | 收件箱、会话阅读、写信、回复与转发、草稿、附件、我的图库图片上传、全文搜索、星标、标签、自定义文件夹、稍后提醒、导入与导出 |
| 发信与投递 | 立即发送、定时发送、发送队列、失败重试、状态审计，以及 SMTP 上游投递 |
| 账号与邮箱 | 多邮箱切换、邮箱申请、配额、每邮箱附件上限、暂停收信、账号级/邮箱级转发，以及外部 IMAP 账号 |
| 自动化规则 | 按发件人、收件人、主题等条件匹配，并执行移动、标记、删除或转发；支持排序和批量应用 |
| 管理后台 | 用户与权限组、域名与 DNS 检测、邮件健康评分、邮件收发与账户使用统计、邮箱与别名、邮件审计、发送队列、全域公告、三语言默认设置、界面模板和系统设置 |
| 邮件协议 | Postfix、Dovecot、Rspamd、DKIM、SMTP Submission（PLAIN/LOGIN）、IMAP SSL、POP3 SSL 与客户端连接记录 |
| 安全 | 标准 TOTP 2FA、一次性恢复码、第三方客户端应用密码、Turnstile、API Token 与 scope、转发邮箱验证、Webhook 签名、SSRF 防护、安全 Cookie，以及自动证书 |
| 集成与运维 | 开放 API、状态 Webhook、Docker 部署、健康诊断、在线更新、备份、回滚和 Rust 管理命令 |

完整的页面入口、权限边界、客户端参数和运维能力见 [功能说明](docs/FEATURES.md)。

## 近期新增

- `v1.3.20`：完善后台关于信息和版本弹窗，支持安全删除旧回滚点，并优化 `imyemail-vbena` Webmail 左侧品牌区。
- `v1.3.19`：新增适配三语言、全端、深色与减少动态效果的 `imyemail-vbena` 前后台模板。
- `v1.3.18`：新增适配全端、深色与减少动态效果的 `imyemail-cloud-sy` 前后台模板。
- `v1.3.17`：安装完成后统一汇总访问地址、初始管理员用户名、密码安全获取方式和数据目录。
- `v1.3.16`：修复英文和繁體中文下写信、签名、自动回复及反馈表单残留简体中文 placeholder，并加强富文本与 textarea 的翻译检查。
- `v1.3.15`：新增简体中文、繁體中文和 English 全站默认语言，覆盖登录、Webmail、个人中心和管理后台。
- `v1.3.11`：新增 SMTP/IMAP/POP3 连接历史及批量删除、全站邮件与账号使用统计、“我的图库”上传。

逐版本变化见 [更新日志](CHANGELOG.md)。

## 一键安装

支持 Debian / Ubuntu 的 `amd64` 与 `arm64` 服务器。建议至少 2 核、2 GB 内存，并准备一个已解析到服务器的邮件主机名，例如 `mail.example.com`。

```bash
curl -fsSL https://raw.githubusercontent.com/logdns/imyemail/main/install.sh | sudo bash
```

脚本会自动完成：

- 下载 Linux amd64/arm64 Rust 管理器并校验 Release SHA-256
- 安装或检查 Docker Engine 与 Docker Compose v2
- 询问邮件域名、访问地址、管理员用户名和密码
- 创建 `/opt/imyemail` 持久化目录
- 拉取 GHCR 镜像并启动邮件服务
- 生成后台在线更新所需的内部鉴权令牌
- 等待 Web 与 API 健康检查通过
- 最后汇总访问地址、初始管理员用户名、密码获取方式和持久化数据目录

Docker 缺失时只使用 Debian/Ubuntu 系统软件源安装，不执行 `get.docker.com | sh`。交互安装可自行输入初始密码；留空或非交互安装未提供密码时会生成随机密码，以 `0600` 权限保存在 `/opt/imyemail/.initial-admin-password`。安装器不会把明文密码写入终端日志，按最终提示查看并在首次登录后删除该文件。

初始管理员只用于登录，不会自动创建同名邮箱或邮件域名。安装完成后访问配置的 `IMYEMAIL_PUBLIC_BASE_URL`，在后台添加邮件域名并按照 DNS 检测页配置记录。完整的交互式、非交互式安装和最终输出说明见 [安装与运维](docs/OPERATIONS.md#安装完成输出)。

> 一键安装不会替你修改 DNS，也不能绕过云厂商对 25 端口的限制。公网收信前必须确认 25 端口可入站，公网发信前需确认 25 端口可出站。

## 更新与回滚

### 后台页面更新

超级管理员可点击后台侧栏中的版本号，查看当前版本、最新版本、更新日志和上一回滚点。点击“立即更新”后，API 会先在线备份 SQLite，再可靠返回已受理状态，由内部运维服务保存当前镜像并异步触发更新，页面会等待服务恢复后自动刷新，不再因 API 容器重启显示 `Failed to fetch`。

更新完成并生成回滚点后，可在同一弹窗点击“回滚上一版本”。回滚前会再次备份数据库并要求二次确认；它只切换镜像和 Compose，不会把数据库恢复到旧时间点。不再需要该回滚点时，超级管理员可二次确认后删除保存的旧镜像与 Compose 回滚文件；当前版本、数据库、邮件、附件、证书和 DKIM 数据不会被删除。更新器和运维服务都只在 Docker 内部网络开放，不映射公网端口，并使用随机令牌鉴权。普通用户和普通后台权限组无法执行系统更新、回滚或删除回滚点。

### 命令行更新

```bash
sudo imyemail update
```

命令行更新会保留当前镜像、备份数据库并执行健康检查。需要回滚时运行：

```bash
sudo imyemail rollback
```

常用运维命令：

```bash
sudo imyemail self-update
sudo imyemail backup
sudo imyemail doctor
sudo imyemail status
sudo imyemail logs
sudo imyemail start
sudo imyemail stop
sudo imyemail restart
sudo imyemail uninstall
```

`uninstall` 移除容器和管理命令，但保留 `/opt/imyemail` 中的配置、数据库与邮件；`uninstall --keep-command` 可保留管理命令。`uninstall --purge` 会永久删除安装目录内的邮件、数据库、附件、配置、DKIM 私钥和备份，执行前必须把备份复制到安装目录之外。完整说明见 [安装与运维文档](docs/OPERATIONS.md)。

`imyemail backup` 只创建 SQLite 在线备份。灾难恢复、整机迁移和完整恢复必须同时保存 `.env`、`data`、`mail` 与 `dkim`；具体命令和校验步骤见 [备份、迁移与恢复](docs/OPERATIONS.md#停机完整备份)。

## DNS 与端口

至少需要以下 DNS 记录：

| 类型 | 示例 | 用途 |
| --- | --- | --- |
| A / AAAA | `mail.example.com -> 服务器 IP` | 邮件主机与 Webmail |
| MX | `example.com -> mail.example.com` | 接收邮件 |
| SPF TXT | 后台生成 | 声明允许发信的服务器 |
| DKIM TXT | 后台按域名生成 | 邮件签名验证 |
| DMARC TXT | 后台生成建议值 | 发信策略与报告 |

服务器防火墙和云安全组应按需开放：

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| 25 | TCP | SMTP 服务器间收发信 |
| 80 / 443 | TCP | Webmail 与证书签发 |
| 465 / 587 | TCP | 邮件客户端 SMTP 发信 |
| 993 | TCP | IMAP SSL |
| 995 | TCP | POP3 SSL |

第三方客户端必须把用户名填写为完整邮箱地址。SMTP 推荐 `465 + SSL/TLS`，也支持 `587 + STARTTLS`；IMAP 使用 `993 + SSL/TLS`，POP3 使用 `995 + SSL/TLS`。账号未启用 2FA 时三种协议使用邮箱登录密码，启用 2FA 后必须改用该邮箱单独生成的应用密码。用户可在“账号设置 → 通知与客户端”查看、选择并批量删除最近 90 天的连接成功和鉴权失败记录。

## 自动证书与邮件评分

后台“系统设置 → SSL 证书”支持 Let's Encrypt、ZeroSSL 和 Google Trust Services，通过 ACME HTTP-01 自动签发并提前续期。ZeroSSL 与 Google Trust Services 需要在对应控制台创建 EAB KID 和 HMAC Key。公网 `80` 端口必须可访问，续期成功后 Web、Postfix 和 Dovecot 会自动重载共享证书。

域名管理的“邮件评分”会检查 MX、SPF、DKIM、DMARC、公网 A/AAAA、PTR/rDNS、SMTP STARTTLS 和托管证书，给出 0–100 分及可执行的改进建议。它用于检查基础投递就绪度，不等同于第三方收件箱或内容垃圾分测试。

## 数据目录

默认部署目录为 `/opt/imyemail`：

```text
/opt/imyemail/
|-- .env                 # 环境配置与内部更新令牌
|-- .imyemail-managed    # 永久卸载安全标记
|-- docker-compose.yml   # 邮箱主服务与内部更新/回滚服务
|-- data/                # SQLite、附件、ACME 证书和更新前备份
|-- mail/                # Maildir 邮件原文
|-- dkim/                # DKIM 私钥
`-- rspamd-cache/        # Rspamd 规则编译缓存
```

升级和重建容器不会删除这些目录。备份时应同时保存 `data`、`mail`、`dkim` 与 `.env`；`rspamd-cache` 可在停机后重新生成。

## 手动部署

需要自行控制 Compose 配置时：

```bash
git clone https://github.com/logdns/imyemail.git
cd imyemail/deploy
cp .env.example .env
# 编辑 .env
docker compose pull
docker compose up -d
```

本地源码构建：

```bash
cd deploy
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

更完整的证书、外部 SMTP、Webhook 和排错说明见 [deploy/README.md](deploy/README.md)。

## 技术栈

- 后端：Go、Chi、SQLite；Rust、Axum（渐进重构入口）
- 前端：React、TypeScript、TanStack Query、shadcn/ui、Tailwind CSS
- 邮件：Postfix、Dovecot、Rspamd
- 部署：Docker、Docker Compose、GitHub Actions、GHCR

## 本地开发

```bash
cd apps/api
go run ./cmd/server
```

Rust API 入口位于 `apps/api-rs`，当前以兼容代理方式逐步承接 Go API。

```bash
cd apps/web
pnpm install
pnpm run dev
```

提交前建议运行：

```bash
cd apps/api && go test ./...
cd apps/api-rs && cargo +1.85.0 test --locked
cd apps/manager && cargo +1.85.0 test --locked
cd apps/web && pnpm run check
```

## 开源协议

[MIT](LICENSE)。

## 项目来源

本项目基于以下上游仓库继续维护：

- 原始上游项目：https://github.com/LanQin996/LanQin-Email
- 来源与备份快照：https://github.com/zxyszx/NewSzxcn-Email-backup

当前维护与发布仓库：https://github.com/logdns/imyemail

上游版权声明与 MIT 许可文本保留在 [LICENSE](LICENSE) 中。
