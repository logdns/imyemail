# v1.3.27 AI 连接与模型选择验证

2026-09-15 修复版本。已完成 Go 全量测试、AI 竞态/安全回归、Web 完整检查、固定版本资源两次构建一致性，以及 Rust API/Manager 的 fmt、Clippy、测试与 Manager 版本输出。Web/Rust 依赖审计无公告，Go 无可调用漏洞（3 个未调用模块公告）；源码机密扫描仅命中两个已有 Rspamd GPG SHA-256 常量。

新增覆盖：四种协议的 HTTPS 模型列表集成、根/版本/完整接口路径、推理模型 token 参数、Responses 网关消息状态兼容、错误脱敏、模型去重/筛选/大小上限、草稿不落库、跨目标 KEY 拒绝、匿名/只读/CSRF 与非法请求。保留拒绝、工具调用、未完成结果与 SSRF 防护。

Chrome/Firefox 各 40 组配置页回归：五模板 × 四宽度 × 浅深色，减少动态效果；验证获取、选择、手动模型、未保存测试、修改后清除旧结果、保存与 KEY 保护。三语空列表、加载、错误与 401 诊断另行覆盖；长模型 ID 的移动端下拉宽度和换行通过两引擎验证。九个 Dockerfile、五组隔离 Compose、Shell/Python/YAML/Pages 检查通过。

真实服务商付费联调仍未执行：没有测试 KEY。合成 transport 和 HTTPS 集成不能证明用户账户、区域、网关或模型已可用；使用方法见 [服务商接入](AI-PROVIDERS.md)。部署到用户服务器后的实际修复效果仍需用其配置验证。

本地 arm64 all-in-one、独立 API 和 Web 镜像构建通过；Dovecot 上游自测、SMTP TLS 25/465/587、IMAPS/POP3S、本地投递、错误鉴权与 v1.3.26 → v1.3.27 → v1.3.26 → v1.3.27 的 Maildir/线程索引回归通过。容器验证包含模型/测试接口跨目标 KEY 拒绝、独立 API 的匿名/私网目标拒绝与草稿不落库。all-in-one/Web 镜像的 12 个静态文件与正式构建逐一一致。

镜像扫描未忽略未修复项：all-in-one 66 条 High/Critical 包记录（20 个公告），API 51 条（12 个公告），Web 为零；无新增公告和可用修复版本，沿用下文 v1.3.26 已复核的默认配置可达性边界，不声称零漏洞。正式发布的远端 CI、镜像清单、Manager、CDN 与 Pages 最终结果见 Release 验证附件。回滚到 v1.3.26 前，将根地址或完整接口地址还原为包含版本路径的 Base URL 并重新输入 KEY 保存；无数据库迁移。

---

# v1.3.26 AI 接入验证记录

2026-09-15，v1.3.26 发布验证。此记录区分模拟协议测试、真实邮件容器回归和真实 AI 服务商联调；不将跳过的测试当作通过。

| 验证项 | 结果 |
| --- | --- |
| Go 全量测试 | `go test ./...` 通过 |
| AI 竞态与安全回归 | `go test -race ./internal/app -run TestAI -count=1` 通过 |
| 四协议请求/响应 | 模拟 transport 验证 Chat Completions、Responses、Messages、GenerateContent；鉴权头、文本提取、思考过滤、拒绝/截断/工具调用、错误脱敏通过 |
| 认证与隐私 | 会话、细粒度权限、本地/外部 IMAP 归属、CSRF、凭据切换、公网 URL/IP、限流、取消、正文上限通过 |
| Web 完整检查 | 使用 pnpm 11.24.0，组件、模板、三语、编辑器安全、TypeScript 和生产构建通过 |
| 浏览器 | Chrome、Firefox；生成弹窗与配置页各 80 组（五模板、四宽度、浅深色、减少动态效果）；预设切换、KEY 清空、保存后测试、生成采用/XSS、取消、总结、回复通过 |
| Rust API / Manager | fmt、Clippy、全量测试通过；Manager 发布构建输出 `imyemail 1.3.26` |
| 依赖审计 | Web 含开发依赖 audit 无漏洞；Go 无可调用漏洞（另有 3 个未调用的模块公告）；Rust 两套锁文件将 rustls 0.23.43 升级至 0.23.45，修复 RUSTSEC-2026-0285，复扫通过 |
| 源码机密扫描 | 发布源码快照检出 2 项，均为已有 Dockerfile 中公开 Rspamd GPG 文件的 SHA-256 校验常量（`RSPAMD_KEY_SHA256`）；未发现新增凭据 |
| 脚本、Pages、部署静态检查 | Shell/Python/JavaScript、Pages 三语、九个 Dockerfile、五组隔离 Compose 配置通过 |
| 前端固定版本产物 | `v1.3.26` 的版本、Release URL、jsDelivr Base URL 构建；第二次独立构建逐文件一致，all-in-one 与独立 Web 镜像内的 12 个文件也逐一匹配 SHA-256 |
| 本地 arm64 邮件镜像与容器 | all-in-one 构建含 Dovecot 上游自测通过；SMTP TLS 25/465/587、IMAPS、POP3S、本地投递、错误密码、登录前 ID、AI 设置与凭据脱敏通过；v1.3.25 → v1.3.26 → v1.3.25 → v1.3.26 的 Maildir/线程索引验证通过 |
| 拆分镜像与运行 | Go API、Web、Rust 代理、Operator 的 v1.3.26 本地镜像构建通过；健康、AI 会话透传和状态、匿名拒绝、Operator 令牌鉴权与版本输出通过，运行测试未挂载宿主 Docker Socket |
| 远端 CI | [运行 34930424752](https://github.com/logdns/imyemail/actions/runs/34930424752) 在源码提交 `7f26942` 全部通过：Web/API/Manager、原生 amd64 与 arm64 邮件镜像构建、Dovecot 上游自测、协议/鉴权和 v1.3.24 升级回滚回归 |
| 自动 AI 审查 | 任务因未配置 `OPENAI_API_KEY` 跳过，绿色状态不代表已完成模型审查；本记录依据人工代码复核与工具检查 |
| 镜像漏洞扫描 | 未忽略未修复项：all-in-one 为 66 条 High/Critical 包记录、20 个不同公告，均无发行版修复版本；独立 Go API / Rust API 各 51 条包记录、12 个公告，Web / Operator 为零；按现有默认配置可达性边界复核，见下文 |
| 真实 AI 服务商联调 | **未执行**：没有测试 KEY；`TestAILiveProviders` 明确 SKIP。逐家服务商、地区和模型的账户可用性仍需验证 |
| 发布验证边界 | 本版本按已通过的协议、安全、浏览器和双架构容器回归发布，AI 默认关闭；未执行的真实服务商联调作为部署启用前检查。正式发行状态、资产和标签以 [GitHub Release](https://github.com/logdns/imyemail/releases/tag/v1.3.26) 为准，发布后另核验 GHCR、Manager 哈希、Pages 和 CDN |

新增代码不迁移表、不开放新端口、不自动发送邮件。AI 默认关闭，配置和测试受现有权限限制，KEY 不返回浏览器，第三方请求使用专用 HTTPS transport，无代理、重定向、私网访问或自动重试。回复和写信生成内容进入已有纯文本预览与编辑器流程。

镜像剩余公告沿用 [运维安全边界](OPERATIONS.md#容器安全复核边界2026-09-11)，并重新核对 Rspamd 4.1.5 的 `src/libmime/archives.c`：默认仅在 7z 分支启用 libarchive；未启用 XAR/XML 解析。Supervisor XML-RPC 只开放容器内 Unix Socket，curl 健康检查只访问固定本地 URL；自定义 Lua、归档解析器、Supervisor 暴露或容器权限变更需要重新审计。本结论不表示系统软件包本身的漏洞已经修复。

真实联调的私密配置文件格式和运行方式见 [AI 服务商接入](AI-PROVIDERS.md#真实联调)。管理员也可先关闭 AI、保存配置、执行后台连接测试，再用合成内容验证三个生成动作。

回滚：先关闭 AI 并按需清除 KEY，再回滚到 v1.3.25 镜像；原有邮件、草稿、SQLite 与 Maildir 保留。数据库备份包含服务商 KEY，按机密备份管理；旧版本忽略新增配置，重新升级会恢复保留的配置。
