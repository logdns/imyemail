# imyemail

imyemail 是一个可自建、可管理，包含 Webmail、管理后台和标准邮件协议服务的开源邮箱系统。

[![Release](https://img.shields.io/github/v/release/logdns/imyemail?display_name=tag&sort=semver)](https://github.com/logdns/imyemail/releases)
[![Docker Release](https://github.com/logdns/imyemail/actions/workflows/docker.yml/badge.svg)](https://github.com/logdns/imyemail/actions/workflows/docker.yml)
[![CI](https://github.com/logdns/imyemail/actions/workflows/ci.yml/badge.svg)](https://github.com/logdns/imyemail/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/logdns/imyemail)](LICENSE)

[版本发布](https://github.com/logdns/imyemail/releases) · [架构说明](docs/ARCHITECTURE.md) · [部署文档](deploy/README.md) · [安装与运维](docs/OPERATIONS.md) · [API](docs/API.md) · [English](README.en.md)

## 主要功能

| 模块 | 能力 |
| --- | --- |
| Webmail | 收件箱、会话阅读、写信、回复与转发、草稿、附件、全文搜索、星标、标签、自定义文件夹、稍后提醒、导入与导出 |
| 发信与投递 | 立即发送、定时发送、发送队列、失败重试、状态审计，以及 SMTP 上游投递 |
| 账号与邮箱 | 多邮箱切换、邮箱申请、配额、暂停收信、账号级/邮箱级转发，以及外部 IMAP 账号 |
| 自动化规则 | 按发件人、收件人、主题等条件匹配，并执行移动、标记、删除或转发；支持排序和批量应用 |
| 管理后台 | 用户与权限组、域名与 DNS 检测、邮件健康评分、邮箱与别名、邮件审计、发送队列、模板和系统设置 |
| 邮件协议 | Postfix、Dovecot、Rspamd、DKIM、SMTP、SMTP Submission、IMAP SSL 与 POP3 SSL |
| 安全 | 2FA、Turnstile、API Token 与 scope、转发邮箱验证、Webhook 签名、SSRF 防护、安全 Cookie，以及 Let's Encrypt / ZeroSSL / Google Trust Services 自动证书 |
| 集成与运维 | 开放 API、状态 Webhook、Docker 部署、健康诊断、在线更新、备份、回滚和 Rust 管理命令 |

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

Docker 缺失时只使用 Debian/Ubuntu 系统软件源安装，不再执行 `get.docker.com | sh`。非交互安装生成的初始管理员密码保存在 `/opt/imyemail/.initial-admin-password`，首次登录后请删除该文件。

安装完成后访问配置的 `IMYEMAIL_PUBLIC_BASE_URL`。首次登录后，在后台添加邮件域名并按照 DNS 检测页配置记录。

> 一键安装不会替你修改 DNS，也不能绕过云厂商对 25 端口的限制。公网收信前必须确认 25 端口可入站，公网发信前需确认 25 端口可出站。

## 更新与回滚

### 后台页面更新

超级管理员可点击后台侧栏中的版本号，查看当前版本、最新版本与更新日志。点击“立即更新”后，系统会先在线备份 SQLite 数据库，再拉取新镜像并重启；页面会等待服务恢复后自动刷新。

更新服务只在 Docker 内部网络开放，不映射公网端口。普通用户和普通后台权限组无法执行系统更新。

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

## 自动证书与邮件评分

后台“系统设置 → SSL 证书”支持 Let's Encrypt、ZeroSSL 和 Google Trust Services，通过 ACME HTTP-01 自动签发并提前续期。ZeroSSL 与 Google Trust Services 需要在对应控制台创建 EAB KID 和 HMAC Key。公网 `80` 端口必须可访问，续期成功后 Web、Postfix 和 Dovecot 会自动重载共享证书。

域名管理的“邮件评分”会检查 MX、SPF、DKIM、DMARC、公网 A/AAAA、PTR/rDNS、SMTP STARTTLS 和托管证书，给出 0–100 分及可执行的改进建议。它用于检查基础投递就绪度，不等同于第三方收件箱或内容垃圾分测试。

## 数据目录

默认部署目录为 `/opt/imyemail`：

```text
/opt/imyemail/
|-- .env                 # 环境配置与内部更新令牌
|-- .imyemail-managed    # 永久卸载安全标记
|-- docker-compose.yml   # 邮箱主服务与内部更新服务
|-- data/                # SQLite、附件、ACME 证书和更新前备份
|-- mail/                # Maildir 邮件原文
`-- dkim/                # DKIM 私钥
```

升级和重建容器不会删除这些目录。备份时应同时保存 `data`、`mail`、`dkim` 与 `.env`。

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
