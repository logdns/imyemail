# v1.3.28 发布验证

2026-11-24 在隔离邮箱和数据卷验证了回收站彻底删除、邮件组件升级及回滚。升级已有部署前先检查 Postfix 待投递队列并备份。[运维说明](OPERATIONS.md#v1328-邮件服务升级回收站与回滚)

## 功能和构建

| 范围 | 核验结果 |
| --- | --- |
| Webmail | Chrome 和 Firefox 覆盖 375、768、1440、2560 像素、五套模板、三种语言、浅深色和减少动画。使用真实 API 导入带附件邮件，核验批量确认、取消、删除和部分失败后只重试失败项。两个浏览器都验证了富文本编辑和草稿保存。 |
| Web 构建 | 固定 Node.js 26.13.1、pnpm 12.23.0 和锁文件。组件、翻译、编辑器安全、类型检查和构建通过。两次独立输出以及 Linux Web 镜像中的 12 个静态文件与仓库发布快照逐字节一致。 |
| 服务端 | Go 全量测试、vet、邮件移动与删除相关竞态测试通过。Rust API 7 项测试、Manager 21 项测试、fmt 和 Clippy 通过。Manager 本机发布构建输出 imyemail 1.3.28。 |
| 邮件协议 | 从 v1.3.27 升级到候选镜像，再回滚并重新升级。验证 SMTP 25/465/587 投递、IMAPS、POP3S、拒绝错误凭据及 Maildir 和线程索引一致性。Dovecot 2.4.5 上游自测在隔离构建阶段以非特权用户运行。 |
| 部署和权限 | 九份 Dockerfile、五组 Compose、Shell、Python 和 Pages 三语检查通过。邮件删除继续走原有会话、组织邮件权限和服务端邮件归属检查。测试使用生成的数据与凭据，外部 AI 付费接口未调用。 |

## 依赖和容器审计

- pnpm 审计最初发现 Tailwind 构建依赖 source-map-js 1.2.1 的高危公告。已固定为 1.2.4，重新安装后所有严重级别均为零。[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- govulncheck 检查应用调用路径，未报告漏洞。两份 Cargo 锁文件均移除停止维护的 chrono，改用 jiff 1.0.2。RustSec 数据库截至 11 月 23 日，两份 cargo audit 均无漏洞或维护警告。[RUSTSEC-2026-0543](https://rustsec.org/advisories/RUSTSEC-2026-0543.html)
- Postfix 3.11.8-1 在 Debian 13 上从固定 Debian 源包构建，同时验证上游 SHA-256 与发布者签名。运行镜像验证 SQLite 映射和 Dovecot SASL。Rspamd 使用签名稳定仓库包 4.3.1-1~73b8fe1~trixie，Nginx 使用 1.30.8。[Postfix 源包](https://tracker.debian.org/pkg/postfix) · [Nginx 安全公告](https://nginx.org/en/security_advisories.html)
- Trivy 0.76.2 使用 2026-11-24 01:05 UTC 漏洞库，纳入尚无补丁的公告。源码快照机密扫描未检出凭据。下表为本机 linux/arm64 镜像的 High/Critical 结果，同一公告可涉及多个二进制包。

| 镜像 | 包记录 | 不同公告 | 有发行版修复版本 |
| --- | ---: | ---: | ---: |
| All-in-one | 102 | 40 | 0 |
| Go API、可选 Rust API（各自） | 56 | 15 | 0 |
| Postfix | 61 | 20 | 0 |
| Dovecot | 52 | 13 | 0 |
| Rspamd | 67 | 23 | 0 |
| Web、Gateway、Operator、Watchtower（逐个扫描） | 0 | 0 | 0 |

默认配置的核对范围如下。新增解析插件、接入外部数据库、启用新协议或改变容器权限时，需要重新评估。

| 公告涉及的功能 | 已核对的输入或配置 |
| --- | --- |
| OpenSSL QUIC、SQLite FTS5 和 session changeset、LMDB 损坏数据库 | 默认邮件协议使用 TCP/TLS，Web 未启用 HTTP/3。Postfix 和 Dovecot 使用固定 SQL 查询，应用和 Rspamd 不导入 FTS 索引或 SQLite changeset。LMDB 文件由服务端管理，用户仅能导入邮件。恢复备份时应核验来源和完整性。 |
| libxml2、Expat、Python HTML、TLS 和归档处理 | Rspamd 4.3.1 的默认邮件解析仅在 7z 分支启用 libarchive 的 7zip 格式，仓库没有调用支持 XAR 的通用 Lua 归档接口。Supervisor 的 XML-RPC 绑定容器内 0700 Unix Socket。邮件正文、TLS 会话和上传附件不交给 Supervisor 的 Python 进程解析。 |
| curl、rsyslog | curl 健康检查仅访问固定本地地址。仓库没有配置 SFTP/SCP、共享用户连接池、用户控制的动态日志路径或 ClickHouse 输出。 |
| util-linux、systemd、ACL、ncurses 和 Perl | 公告需要特权挂载、本地账户记录、可控文件树、终端数据或归档处理。邮件进程没有相应的宿主挂载权限。Operator 与 Watchtower 单独审计，两者能访问 Docker Socket，应继续限制管理接口访问。 |

有修复版本的数量为零表示扫描时发行版尚未提供对应补丁。上述结果只覆盖所列镜像、架构和默认配置。远端双架构构建和正式产物状态可在 [GitHub Actions](https://github.com/logdns/imyemail/actions) 和[版本页面](https://github.com/logdns/imyemail/releases/tag/v1.3.28)核对。
