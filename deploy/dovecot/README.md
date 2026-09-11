# Dovecot 镜像构建与验证

从 v1.3.25 起，独立 Dovecot 与 all-in-one 镜像均通过 `build-source.sh` 构建上游 **2.4.5**，不再安装 Debian 13 的 Dovecot 2.4.1 包，也不混入 testing/sid 软件源。独立镜像保持既有发布架构；all-in-one 继续支持 amd64/arm64。

## 来源与供应链

- 源码：<https://dovecot.org/releases/2.4/dovecot-2.4.5.tar.gz>
- SHA-256：`868c2686a61b5f8e00a3e4721789b1ab46e6528fd773a5fbed07a6ecba7731e6`
- 签名：同路径 `.sig`；公钥：<https://repo.dovecot.org/DOVECOT-REPO-GPG-2.4>
- 固定主密钥指纹：`EF0882079FD4ED32BF8B23B2A1B09EF84EDC5219`。

每次源码构建先检查主密钥指纹、GPG 签名和 SHA-256，任意不一致立即失败，再编译并执行上游 `make check`。两个 Dockerfile 复用同一脚本，避免架构或版本分叉。构建输出为明确命名的 `imyemail-dovecot` 内部 Debian 包；编译器、GPG 和开发头文件不进入运行镜像。运行库继续来自 Debian 13，系统软件包层使用 `APP_VERSION` 失效缓存并更新安全包。

上游自测以低权限用户执行，并在只保留回环接口的构建网络中运行：保留文件权限断言、TCP 和 Unix Socket 测试，同时避免测试使用的私网地址访问宿主局域网或被虚拟机代理伪造连接。未删除或跳过测试。许可证和来源信息另行复制到运行镜像，避免 Debian slim 的文档包排除规则将其省略。

镜像内 `/usr/share/doc/imyemail-dovecot/` 保留 `SOURCE`、上游 NEWS 和许可证；Dovecot 使用其上游许可证，不受本仓库 MIT 许可证替代。由于它不是 Debian 官方 `dovecot-core` 包，扫描器未必能自动识别 C 程序源码公告：必须同时核验 `dovecot --version`、源码签名/哈希、上游安全公告和实际启用的功能，不能把缺少扫描条目当作无漏洞。

## 数据与兼容性

认证继续使用原有 SQLite SQL 查询和 Go API 的 auth-policy；`vmail` UID/GID 仍为 5000。配置仍位于 `/etc/dovecot`，邮件仍位于 `/var/mail/vhosts`；未增加 SQLite 表、监听端口或外部服务。

`dovecot_config_version` 保持 2.4.0 以保留原有配置默认值；`dovecot_storage_version` 提升为 2.4.5，启用 CVE-2026-40017 的线程索引修复。已有 `dovecot.index.thread` 会按需重建，首次 THREAD 请求可能增加 CPU/IO；邮件原文不是索引，不能为了清理索引删除 Maildir。上游同时修正部分包含 `~` 的层级邮箱名转义，因此更新前须保存完整 Maildir 备份，而不只是 SQLite 快照。

回滚镜像不回滚数据；旧 Dovecot 会重新生成不兼容的线程索引。正式发布前必须运行下面的旧版→新版→旧版→新版测试，核对嵌套文件夹、邮件字节和 THREAD；生产回滚后也必须核对实际文件夹与客户端状态。v1.3.24 含已知 Dovecot 漏洞，只能作为临时故障回退，不能作为长期安全替代。

## 隔离协议回归

在仓库根目录运行，镜像须已在本地构建或拉取：

```bash
python3 deploy/tests/check-mail-stack.py \
  --image imyemail:v1.3.25-local \
  --previous-image imyemail:v1.3.24-local
```

脚本创建随机容器、数据卷和凭据，只发布回环地址端口，只向测试域名发送邮件，结束时删除它创建的容器和数据卷。它不接受现有服务器地址，也不读取生产 `.env`；不要把该脚本改成针对生产运行。验证包含 SMTP 25/465/587 TLS 与本地投递、IMAPS 993、POP3S 995、无效鉴权、登录前 ID 参数、服务状态、线程索引和升级回滚后的邮件一致性。
