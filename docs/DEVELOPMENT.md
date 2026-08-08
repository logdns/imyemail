# imyemail 开发与发布规范

本文定义新增功能、界面修改、缺陷修复和版本发布的统一完成标准。目标是让每次修改都能自然融入现有产品，并在发布前完成设计、验证、构建、测试、安全审计和文档同步。

## 1. 设计与融合

开始编码前先明确用户入口、目标用户、权限边界、成功/失败状态和数据来源。界面修改至少覆盖桌面、宽屏、移动端、浅色、深色和减少动态效果模式，并优先复用 `apps/web/src/components/ui` 中的 shadcn/ui 组件。

- 新功能应进入已有导航、设置或业务流程，不创建无法发现的孤立入口。
- `imyemaildefault` 与 `imyemailcloud` 共用业务组件和 API，只通过模板变量与受控布局规则形成视觉差异。
- 模板不得修改认证、授权、数据请求或业务状态；模板值必须继续由后端白名单校验。
- 宽屏页面应使用可用空间，阅读内容再在内部设置合理行宽，避免用固定外框制造大面积无效留白。
- 错误、空状态、加载、禁用、权限不足和网络失败必须有明确反馈。

## 2. 实现与代码审查

- 保持 API 向后兼容；新增字段应有安全默认值和服务端校验。
- 权限必须由后端执行，前端隐藏按钮不能作为安全边界。
- 用户内容在展示前转义或净化，禁止把密码、Token、Cookie、邮件正文或个人信息写入日志。
- 数据库修改需要迁移、回滚和备份影响说明；队列、邮件发送和 Webhook 需要考虑幂等与安全重试。
- Docker、Compose 和 CI 修改必须检查最小权限、端口、健康检查、持久化数据及回滚路径。

详细审查重点见仓库根目录的 `AGENTS.md`。

## 3. 验证矩阵

提交前按影响范围执行；正式版本必须执行完整矩阵。

```bash
corepack pnpm --dir apps/web install --frozen-lockfile
corepack pnpm --dir apps/web run check

(cd apps/api && go test ./...)
(cd apps/api-rs && cargo fmt --check && cargo clippy --locked --all-targets --all-features -- -D warnings && cargo test --locked)
(cd apps/manager && cargo fmt --check && cargo clippy --locked --all-targets --all-features -- -D warnings && cargo test --locked)
```

界面修改还要人工检查：

| 场景 | 最低检查项 |
| --- | --- |
| 视口 | 375、768、1440、2560 CSS 像素宽度 |
| 模板 | `imyemaildefault`、`imyemailcloud` |
| 主题 | 浅色、深色、系统减少动态效果 |
| 状态 | 加载、空数据、长文本、错误、权限受限 |
| 浏览器 | 当前 Chrome/Edge、Safari 或 Firefox 中至少两种引擎 |

发布前还应验证 Shell/HTML/JSON/YAML 语法、Docker 构建上下文、镜像健康检查、Manager 版本输出和正式 CDN 构建可复现性。

## 4. 安全审计清单

- 认证、会话、2FA、应用密码及恢复流程不存在绕过路径。
- 每个受保护接口都验证角色、细粒度权限和资源归属。
- 输入处理覆盖注入、路径穿越、SSRF、XSS、CSRF、文件类型与大小限制。
- 邮件流程检查头部注入、伪造发件人、收件人泄露、模板净化和附件安全。
- 密钥、Token、密码、验证码、Cookie、私人邮件与服务器配置未进入仓库、构建产物或公开日志。
- 依赖和容器基础镜像没有已知的高危可利用问题；发现例外时必须记录影响和缓解措施。
- 更新、备份、迁移和回滚不会静默丢失 SQLite、Maildir、附件、证书或 DKIM 数据。

## 5. 文档与发布

用户可见变化必须同步更新：

1. `CHANGELOG.md` 与 `VERSION`。
2. 中英文 README 和 `docs/FEATURES.md`。
3. 涉及边界或数据流时更新 `docs/ARCHITECTURE.md`。
4. 涉及安装、配置、备份或回滚时更新 `docs/OPERATIONS.md` 与部署文档。
5. 更新 `site/` 中的版本、功能说明和发布链接，确保 GitHub Pages 与正式版本一致。
6. 构建版本固定的前端静态文件，提交标签，等待 CI、GHCR 和 GitHub Release 全部成功。
7. 核验 amd64/arm64 Manager SHA-256、所有远端镜像清单、Latest Release 和 Pages 部署状态。

没有完成验证、安全审计、文档同步或可回滚性确认的修改，不视为可发布。
