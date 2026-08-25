# 界面模板

imyemail 的登录、注册、Webmail、个人中心和管理后台共用 React 业务组件与后端 API。管理员可在“系统设置 → 界面模板”选择全站视觉方案；首次部署也可设置 `IMYEMAIL_UI_TEMPLATE`。

| 模板 | 定位 |
| --- | --- |
| `imyemaildefault` | 经典、高信息密度 |
| `imyemailcloud` | 靛蓝、柔和背景、圆角与悬浮层次 |
| `imyemail-cloud-sy` | Soybean 风格的紫蓝 token、纵向侧栏、56px 顶栏与分层内容区 |
| `imyemail-vbena` | Vben Admin 风格的蓝色品牌 token、224px 侧栏、50px 顶栏与模块化内容区 |

## imyemail-cloud-sy 设计来源

该模板基于 2026-08-12 获取的 [SoybeanAdmin 中文文档](https://docs.soybeanjs.cn/zh/guide/quick-start.html)及其公开默认主题配置设计。实现吸收主题 token、容器/布局分色、侧栏、顶栏、响应式和暗色模式等交互约定，但不复制 SoybeanAdmin 的 Vue、NaiveUI、路由或请求层；项目继续使用现有 React、shadcn/ui、权限守卫和 API 客户端。

模板覆盖 375、768、1440 与 2560 CSS 像素布局。桌面端 Webmail 使用 220px 基准导航与流式邮件列表，宽屏按可用空间扩展；移动端保持单栏。浅色、深色和 `prefers-reduced-motion` 均有独立规则。

## imyemail-vbena 设计来源

该模板基于 2026-08-24 获取的 [Vben Admin 5.7 文档](https://doc.vben.pro/)及其[项目介绍](https://doc.vben.pro/guide/introduction/vben.html)设计。实现参考其 `sidebar-nav` 布局、224px 侧栏、50px 固定顶栏、蓝色品牌 token、shadcn 风格语义变量、圆角导航、模块化卡片、暗色主题、权限菜单和国际化约定；没有复制 Vben 的 Vue、Pinia、路由、请求层或权限实现，继续使用 imyemail 现有 React、shadcn/ui、服务端权限与 API 客户端。

模板覆盖登录、注册、Webmail、个人中心和管理后台，在 375、768、1440 与 2560 CSS 像素宽度下自适应。Vben 登录页桌面左侧使用真实 DOM `@` 符号与公开站点名称组成邮箱品牌视觉，移动端隐藏该纯展示区域并回退单栏；Webmail 左侧栏同样显示公开站点名称，未配置时回退为 `imyemail`。桌面端使用全宽内容区并按可用空间扩展邮件导航和列表；简体中文、繁体中文和英文共享业务翻译目录，登录、注册、Webmail 与个人中心均提供用户语言入口，浅色、深色与 `prefers-reduced-motion` 均有独立规则。

## 安全边界

- 后端只接受四种固定模板值，非法值返回 `400`。
- 公开设置只下发白名单内的模板名，不下发密钥或用户数据。
- 模板仅改变 CSS token 与受控布局锚点，不改变认证、授权、资源归属、输入净化、邮件发送或数据请求。
- 前端缓存值也会再次归一化，未知值回退到 `imyemaildefault`。

## 升级与回滚

`imyemail-cloud-sy` 与 `imyemail-vbena` 均不新增数据库表或迁移，不改变邮件、附件、证书和 DKIM 数据。若新模板不符合当前站点需要，管理员可直接在“系统设置 → 界面模板”切换到任一其他白名单模板；若进行版本回滚，先切回旧版本支持的模板，再按运维手册回滚镜像与 Compose，数据库内容不会随镜像回退。

新增或修改模板后，运行：

```bash
corepack pnpm --dir apps/web run check
(cd apps/api && go test ./...)
```

## v1.3.18 验证记录

2026-08-12 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 151：127 项浏览器断言，覆盖三套模板、375/768/1440/2560 视口、登录、Webmail、个人中心、管理后台、浅色、深色和减少动态效果；无横向溢出、页面脚本错误或关键入口缺失。
- Firefox 154：13 项浏览器断言，覆盖 `imyemail-cloud-sy` 四档视口与深色登录；另验证加载、超时重试、空数据、长站点名和权限受限状态。
- Web 冻结安装、类型检查、shadcn/ui、模板契约、三语言和生产构建通过；Go 与两套 Rust 工程的格式、Clippy 和测试通过。
- Shell、JSON、YAML、HTML5、五组 Compose 配置和九个 Dockerfile BuildKit `--check` 通过；本地 API/Web 健康检查及 Manager `1.3.18` 版本输出通过。
- pnpm、Go 与两个 Rust 锁文件的依赖安全扫描未发现当前代码可利用的漏洞。
- 使用 `v1.3.18` 固定 jsDelivr 地址连续构建两次，12 个发布文件的 SHA-256 完全一致。

## v1.3.19 验证记录

2026-08-24 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 及 Firefox：覆盖 `imyemail-vbena` 的 375/768/1440/2560 视口、登录、Webmail、个人中心、管理后台、浅色、深色、减少动态效果，以及简体中文、繁体中文和英文；无横向溢出或页面脚本错误。
- Web 冻结依赖、shadcn/ui、四模板契约、1304 项三语言检查、TypeScript 与生产构建通过；Go 与两套 Rust 工程的格式、Clippy 和测试通过。
- Shell、JSON、YAML、HTML5、五组 Compose 配置和九个 Dockerfile BuildKit `--check` 通过；Manager 实际输出 `imyemail 1.3.19`。
- pnpm、Go 与两个 Rust 锁文件的依赖安全扫描未发现当前代码可利用的漏洞；Go 模块图包含未调用的已弃用 `openpgp` 包公告，不影响当前可达代码路径。
- 使用 `v1.3.19` 固定 jsDelivr 地址连续构建两次，12 个发布文件的 SHA-256 完全一致。

## v1.3.20 验证记录

2026-08-24 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 151：覆盖 375/768/1440/2560 视口；Firefox 155：覆盖浏览器可用的 500/768/1440/2560 视口。两种引擎均验证 `imyemail-vbena` 的三语言、Webmail 左侧品牌区、后台关于页、系统版本弹窗、删除确认及 DELETE 请求，无横向溢出或页面脚本错误。
- Web 冻结安装、shadcn/ui、四模板契约、1312 项三语言检查、TypeScript 与生产构建通过；Go 与两套 Rust 工程的格式、Clippy 和测试通过。
- Shell、Pages JavaScript、JSON、YAML、五组 Compose 和九个 Dockerfile BuildKit `--check` 通过；本地 arm64 all-in-one 与 Operator 镜像构建成功，Manager 与 Operator 实际输出 `imyemail 1.3.20`。
- pnpm、Go 与两个 Rust 锁文件的依赖安全扫描通过；认证授权、删除确认、内部令牌、操作锁、普通文件与符号链接边界均已复核。
- 使用 `v1.3.20` 固定 jsDelivr 地址连续构建两次，12 个发布文件的 SHA-256 完全一致。

## v1.3.21 验证记录

2026-08-25 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 152 与 Firefox 153 均覆盖 375/768/1440/2560 视口，验证 Vben 登录页 `@` 品牌视觉、移动端回退、登录/注册语言选择、Webmail 与个人中心语言入口、浅色、深色和减少动态效果；无横向溢出或非预期页面脚本错误。
- Web 冻结安装、shadcn/ui、四模板契约、1312 项三语言检查、TypeScript 与生产构建通过；Go 与两套 Rust 工程的格式、Clippy 和 28 项测试通过。
- Shell、Pages JavaScript、JSON、YAML、HTML5、五组 Compose 和九个 Dockerfile BuildKit `--check` 通过；本地 arm64 all-in-one 与 Operator 镜像构建成功，all-in-one 健康检查正常，Manager 与 Operator 实际输出 `imyemail 1.3.21`。
- pnpm 与两套 Rust 锁文件未发现已知漏洞；Go 可达代码和直接导入包无漏洞，模块图中的未调用 `openpgp` 公告不影响当前代码路径。本次只增加受控视觉与固定语言选项，不改变认证、授权、邮件数据或部署权限边界。
- 使用 `v1.3.21` 固定 jsDelivr 地址连续构建两次，12 个发布文件的 SHA-256 完全一致；应用镜像和 Compose 可按既有流程回滚，SQLite、Maildir、附件、证书与 DKIM 持久化数据不会随镜像回退。

## v1.3.22 验证记录

2026-08-25 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 151 与 Firefox 153 分别完成 288 项自动化界面断言，覆盖四套模板、简体中文/繁體中文/English、浅色/深色、减少动态效果和 375/768/1440/2560 视口；客户端桌面表格、移动卡片、9 个可见独立复制按钮、用户工单、后台工单均无横向溢出或非预期脚本错误。
- 浏览器实际完成用户提交与回复、管理员读取与回复、用户看到管理员回复的闭环；Go 测试另覆盖未登录拒绝、跨用户 `404`、后台只读权限、管理权限组合、关闭、二次确认删除、外键级联、长度校验和删除后不可绕过的持久化限流。
- Web 的 shadcn/ui、四模板契约、1357 项三语言检查、TypeScript 和生产构建通过；Go 全量测试、Rust API 与 Manager 的格式、Clippy 和测试通过。
- Shell、Pages JavaScript、JSON/YAML 解析、五组 Compose 与九个 Dockerfile BuildKit `--check` 通过；本地 arm64 all-in-one 与 Operator 镜像构建成功，all-in-one 健康检查正常，Manager 与 Operator 均输出 `imyemail 1.3.22`。
- pnpm、Go 可达代码和两套 Rust 锁文件未发现已知漏洞；差异检查未发现密钥、测试密码、本机路径或 sourcemap。使用 `v1.3.22` 固定 jsDelivr 地址连续构建两次，12 个发布文件 SHA-256 完全一致。
- 本版新增 SQLite 工单与限流表。旧镜像不会读取这些表但不会删除它们；常规镜像回滚保留现有数据库、Maildir、附件、证书和 DKIM。需要回退工单数据时必须按运维文档恢复整个 SQLite 备份。

## v1.3.23 验证记录

2026-08-25 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Chrome 与 Firefox 覆盖四套模板、375/768/1320/2560 视口和三语言，Chrome 另补充 1440 视口；桌面表格、窄屏卡片、9 个可见独立复制按钮和 IMAP/POP3“请求”文案无横向溢出或页面脚本错误。另用应用真实主题持久化流程复核浅色和深色对比度。
- Web 冻结安装、shadcn/ui、四模板契约、1358 项三语言检查、TypeScript 和生产构建通过；Go 全量测试、Rust API 与 Manager 的格式、Clippy 和测试通过。
- Shell、Pages JavaScript、JSON/YAML 解析、5 组 Compose 和 9 个 Dockerfile BuildKit `--check` 通过；本地 arm64 all-in-one 与 Operator 镜像构建成功，all-in-one 健康检查正常，Manager 与 Operator 均输出 `imyemail 1.3.23`。
- pnpm 生产依赖和两套 Rust 锁文件未发现已知漏洞；本次未修改后端接口、认证、授权、邮件数据或部署权限边界。
- 使用 `v1.3.23` 固定 jsDelivr 地址连续构建两次，12 个发布文件 SHA-256 完全一致。应用镜像与 Compose 可按既有流程回滚，SQLite、Maildir、附件、证书和 DKIM 持久化数据不随镜像回退。

## v1.3.24 验证记录

2026-08-25 按 `docs/DEVELOPMENT.md` 完成以下发布前验证：

- Web 冻结安装、shadcn/ui、四模板契约、1358 项三语言检查、TypeScript 与 Vite 8.2.2 生产构建通过；Go 1.27 全量测试、Rust API 与 Manager 1.98 的格式、Clippy 和 28 项测试通过。
- Shell、Pages JavaScript、JSON/YAML/HTML 解析、5 组 Compose 和 9 个 Dockerfile BuildKit `--check` 通过；API、Rust API、Web、Operator、Gateway、Postfix、Dovecot、Rspamd 与 all-in-one 九套本地镜像均构建成功，Manager 与 Operator 均输出 `imyemail 1.3.24`。
- Debian 13 all-in-one 健康检查与 Supervisor 进程检查通过；Postfix 3.10.13、Dovecot 2.4.1、Rspamd 4.1.5 配置检查通过，SMTP 25/465/587、IMAPS 993、POP3S 995 TLS 握手及完整鉴权收发链路通过。
- pnpm 生产依赖、Go 可达代码与两套 Rust 锁文件未发现已知漏洞；Trivy 对九套本地镜像扫描未发现已有修复的 High/Critical 漏洞。认证授权、输入输出、敏感信息、端口、Docker Socket、持久化目录和回滚边界均完成复核。
- 使用 `v1.3.24` 固定 jsDelivr 地址连续构建两次，12 个发布文件 SHA-256 完全一致，且无 sourcemap、密钥特征或本机路径。升级不修改数据库结构；镜像与 Compose 可回滚到 `v1.3.23`，SQLite、Maildir、附件、证书和 DKIM 数据继续保留并须独立备份。
