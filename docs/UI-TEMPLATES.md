# 界面模板

imyemail 的登录、注册、Webmail、个人中心和管理后台共用 React 业务组件与后端 API。管理员可在“系统设置 → 界面模板”选择全站视觉方案；首次部署也可设置 `IMYEMAIL_UI_TEMPLATE`。

| 模板 | 定位 |
| --- | --- |
| `imyemaildefault` | 经典、高信息密度 |
| `imyemailcloud` | 靛蓝、柔和背景、圆角与悬浮层次 |
| `imyemail-cloud-sy` | Soybean 风格的紫蓝 token、纵向侧栏、56px 顶栏与分层内容区 |

## imyemail-cloud-sy 设计来源

该模板基于 2026-08-12 获取的 [SoybeanAdmin 中文文档](https://docs.soybeanjs.cn/zh/guide/quick-start.html)及其公开默认主题配置设计。实现吸收主题 token、容器/布局分色、侧栏、顶栏、响应式和暗色模式等交互约定，但不复制 SoybeanAdmin 的 Vue、NaiveUI、路由或请求层；项目继续使用现有 React、shadcn/ui、权限守卫和 API 客户端。

模板覆盖 375、768、1440 与 2560 CSS 像素布局。桌面端 Webmail 使用 220px 基准导航与流式邮件列表，宽屏按可用空间扩展；移动端保持单栏。浅色、深色和 `prefers-reduced-motion` 均有独立规则。

## 安全边界

- 后端只接受三种固定模板值，非法值返回 `400`。
- 公开设置只下发白名单内的模板名，不下发密钥或用户数据。
- 模板仅改变 CSS token 与受控布局锚点，不改变认证、授权、资源归属、输入净化、邮件发送或数据请求。
- 前端缓存值也会再次归一化，未知值回退到 `imyemaildefault`。

## 升级与回滚

`imyemail-cloud-sy` 不新增数据库表或迁移，不改变邮件、附件、证书和 DKIM 数据。若新模板不符合当前站点需要，管理员可直接在“系统设置 → 界面模板”切回 `imyemaildefault` 或 `imyemailcloud`；若进行版本回滚，仍按运维手册回滚镜像与 Compose，数据库内容不会随镜像回退。

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
