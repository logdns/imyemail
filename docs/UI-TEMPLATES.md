# 界面模板

imyemail 的登录、注册、Webmail、个人中心和管理后台共用 React 业务组件与后端 API。管理员可在“系统设置 → 界面模板”选择全站视觉方案；首次部署也可设置 `IMYEMAIL_UI_TEMPLATE`。

| 模板 | 定位 |
| --- | --- |
| `imyemaildefault` | 经典、高信息密度 |
| `imyemailcloud` | 靛蓝、柔和背景、圆角与悬浮层次 |
| `imyemail-cloud-sy` | Soybean 风格的紫蓝 token、纵向侧栏、56px 顶栏与分层内容区 |
| `imyemail-vbena` | Vben Admin 风格的蓝色品牌 token、224px 侧栏、50px 顶栏与模块化内容区 |
| `imyemail-cloud-byte` | Arco Design 风格的清新品牌蓝、240px 基准侧栏、60px 顶栏、轻量表单与有序卡片 |

## imyemail-cloud-sy 设计来源

该模板基于 2026-08-12 获取的 [SoybeanAdmin 中文文档](https://docs.soybeanjs.cn/zh/guide/quick-start.html)及其公开默认主题配置设计。实现吸收主题 token、容器/布局分色、侧栏、顶栏、响应式和暗色模式等交互约定，但不复制 SoybeanAdmin 的 Vue、NaiveUI、路由或请求层；项目继续使用现有 React、shadcn/ui、权限守卫和 API 客户端。

模板覆盖 375、768、1440 与 2560 CSS 像素布局。桌面端 Webmail 使用 220px 基准导航与流式邮件列表，宽屏按可用空间扩展；移动端保持单栏。浅色、深色和 `prefers-reduced-motion` 均有独立规则。

## imyemail-vbena 设计来源

该模板基于 2026-08-24 获取的 [Vben Admin 5.7 文档](https://doc.vben.pro/)及其[项目介绍](https://doc.vben.pro/guide/introduction/vben.html)设计。实现参考其 `sidebar-nav` 布局、224px 侧栏、50px 固定顶栏、蓝色品牌 token、shadcn 风格语义变量、圆角导航、模块化卡片、暗色主题、权限菜单和国际化约定；没有复制 Vben 的 Vue、Pinia、路由、请求层或权限实现，继续使用 imyemail 现有 React、shadcn/ui、服务端权限与 API 客户端。

模板覆盖登录、注册、Webmail、个人中心和管理后台，在 375、768、1440 与 2560 CSS 像素宽度下自适应。Vben 登录页桌面左侧使用真实 DOM `@` 符号与公开站点名称组成邮箱品牌视觉，移动端隐藏该纯展示区域并回退单栏；Webmail 左侧栏同样显示公开站点名称，未配置时回退为 `imyemail`。桌面端使用全宽内容区并按可用空间扩展邮件导航和列表；简体中文、繁体中文和英文共享业务翻译目录，登录、注册、Webmail 与个人中心均提供用户语言入口，浅色、深色与 `prefers-reduced-motion` 均有独立规则。

## imyemail-cloud-byte 设计来源

新模板参考 2026-09-11 获取的 [Arco Design 官网](https://arco.design/)和 [React 2.66.16 稳定版源码与文档](https://github.com/arco-design/arco-design/tree/2.66.16)。核对 npm `latest` 与官方稳定标签一致；文档来源覆盖 71 份 React 组件说明、38 份设计规范和 37 份开发指南，重点审阅设计价值观、设计原则、样式指南、布局、菜单、表单、表格、弹层、空状态、主题、国际化与 Arco Pro 权限约定。

| 官方设计约定 | imyemail 中的实现 |
| --- | --- |
| 清晰、一致、韵律、开放 | 共用五套业务页面与权限守卫，在统一设置入口切换模板 |
| 主色 `#165DFF`、中性色、功能色 | 映射为现有语义 token，深色独立调整表面与文字对比度 |
| 4px 尺寸节奏、4/8px 圆角、轻量阴影 | 表单、菜单、卡片、表格与弹层保持一致层次 |
| Layout / Menu / PageHeader | 240px 基准后台侧栏、60px 顶栏、流式邮箱列表和阅读区 |
| Form / Input / Select / Modal / Drawer | 复用现有 shadcn/ui 输入、焦点管理、校验、确认与移动导航 |
| Typography / Empty / Skeleton / Message | 保留共享页面的文字层级、加载、空数据、错误恢复与反馈 |
| 主题和国际化 | 简体、繁体、英文，浅色、深色、减少动态效果及键盘操作 |

登录与注册页在 1024px 以上显示以 `@`、信封和站点名称组成的品牌区，插画使用本地 DOM/CSS 与现有图标绘制，较窄视口回退单栏。邮箱侧栏显示公开站点名称，未配置时使用 `imyemail`。模板选择卡片按屏幕宽度排成 1/2/3/5 列，长模板名称可换行。

实现保留 React、shadcn/ui、现有请求层和服务端权限，不引入第二套组件运行时、在线字体、Arco 外链图片或统计脚本。样式限定在 `data-ui-template="imyemail-cloud-byte"` 下；切回已有模板即恢复原有样式。

## 安全边界

- 后端只接受五种固定模板值，非法值返回 `400`，拒绝更新不会改变当前模板。
- 公开设置只下发白名单内的模板名，不下发密钥或用户数据。
- 模板仅改变 CSS token 与受控布局锚点，不改变认证、授权、资源归属、输入净化、邮件发送或数据请求。
- 前端缓存值也会再次归一化，未知值回退到 `imyemaildefault`。

## 升级与回滚

`imyemail-cloud-sy`、`imyemail-vbena` 与 `imyemail-cloud-byte` 均不新增数据库表或迁移，不改变邮件、附件、证书和 DKIM 数据。若新模板不符合当前站点需要，管理员可直接在“系统设置 → 界面模板”切换到任一其他白名单模板；若进行版本回滚，先切回旧版本支持的模板，再按运维手册回滚镜像与 Compose，数据库内容不会随镜像回退。

先按 [开发规范](DEVELOPMENT.md#3-验证矩阵) 准备工具；新增或修改模板后，从仓库根目录运行：

```bash
pnpm --dir apps/web run check
(cd apps/api && go test ./...)
```

## v1.3.25 验证记录

2026-09-11：按开发与发布规范完成应用、容器和邮件栈验证，原生 amd64/arm64 的上游测试、真实协议、鉴权和升级回滚均已通过，见 [主分支 CI](https://github.com/logdns/imyemail/actions/runs/34575461171)。排查并修正了上游清理 `.test` 导致临时目录退回共享磁盘的问题：测试使用保留原绝对路径的 tmpfs 工作区，不引入路径别名，不修改或跳过上游源码及断言。Dovecot 来源、数据兼容性和容器剩余风险见 [运维说明](OPERATIONS.md)。

- Chrome 与 Firefox 完成 1264 项界面断言，覆盖 Arco 模板的登录、注册、邮箱列表与阅读、个人中心、后台模板选择，三语言、浅深色、375/768/1440/2560 视口及移动导航；实际保存五种模板并验证公开登录页切换和样式隔离。
- 补充 68 项边界断言，覆盖长站点名、总览宽表格、客户端配置、前后台反馈工单、语言记忆、键盘焦点、减少动态效果、登录失败、关闭注册、非法模板回退和普通用户 `403`。修正预览缩略图压到名称、长站点名挤压页头和后台宽表格撑开滚动容器的问题。
- Node.js 24 / pnpm 11.24.0 冻结依赖、shadcn/ui、五模板契约、1361 项三语言目录、TypeScript 与生产构建通过；Go 全量测试、Rust API 与 Manager 的格式、Clippy 和 28 项测试通过。
- Shell、Pages JavaScript 与 155 项英文翻译检查、五组 Compose 配置校验、九个 Dockerfile BuildKit `--check` 通过。构建产物未包含本机路径、测试凭证或 sourcemap。
- 两轮差异审查确认模板写入仍受 `PermissionSettingsUpdate` 保护，公开值与浏览器缓存经过白名单归一化，站点名以文本渲染，新模板未增加外部资源、依赖、数据库迁移或邮件处理分支。
- 发布前依赖复扫发现并修补 Tiptap 两条公告及 nanoid 构建依赖公告：Tiptap 统一为 3.30.5，nanoid 为 3.3.18，Rust 的 chacha20 从已撤回的 0.10.1 更新为 0.10.2。pnpm 全量审计及 peer 检查、两套 Rust audit 均通过；Go 可达代码无已知漏洞，模块图另有三条未导入包公告。新增有时限的 Markdown 解析和原型属性回归检查，并接入 Web 检查、CI 和 Release 门禁。
- Manager 本地 release 构建输出 `imyemail 1.3.25`。九个本地 arm64 镜像已构建；all-in-one 与独立 Dovecot 已使用经签名及哈希校验的 2.4.5，并核验 OpenSSL `3.5.7-1~deb13u2` 修复包。本地及远程双架构上游 158 个测试程序全部通过，未跳过测试；协议、鉴权及旧版→新版→旧版→新版的 Maildir/线程索引回归通过。CPU 压力测试保留超时失败门禁与进程计时诊断，未修改上游源码或断言。
- 全量容器扫描仍有发行版未修复公告，已按默认配置和源码调用点核对适用范围；数量、限制和后续处置见 [运维安全复核](OPERATIONS.md#容器安全复核边界2026-09-11)，不能把没有可用补丁或默认路径不可达写成“零漏洞”。
- 使用 `v1.3.25` 固定 CDN 地址独立构建两次，12 个 Web 文件逐字节一致。Gitleaks 扫描当前全部受版本控制的文件，只有两处 Rspamd 公开签名密钥 SHA-256 校验常量误报；未发现新增密钥泄露。公开站点、版本固定资源和发行说明同步更新；Release 后仍须独立核验 Manager 哈希、镜像清单、Pages 与 CDN，不能只依据构建成功判断发布完成。

## 历史验证记录

本页保留当前版本的模板契约与验证范围。v1.3.18–v1.3.24 的浏览器、构建、依赖及 CDN 验证明细保存在 [v1.3.24 标签的模板文档](https://github.com/logdns/imyemail/blob/v1.3.24/docs/UI-TEMPLATES.md#v1318-验证记录)；逐版本功能变化见 [更新日志](../CHANGELOG.md)。旧版扫描结论仅代表当时的依赖与公告状态，不能代替当前版本审计。
