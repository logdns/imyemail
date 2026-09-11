# imyemail 开发与发布规范

本文定义新增功能、界面修改、缺陷修复和版本发布的统一完成标准。目标是让每次修改都能自然融入现有产品，并在发布前完成设计、验证、构建、测试、安全审计和文档同步。

## 1. 设计与融合

开始编码前先明确用户入口、目标用户、权限边界、成功/失败状态和数据来源。界面修改至少覆盖桌面、宽屏、移动端、浅色、深色和减少动态效果模式，并优先复用 `apps/web/src/components/ui` 中的 shadcn/ui 组件。

- 新功能应进入已有导航、设置或业务流程，不创建无法发现的孤立入口。
- `imyemaildefault`、`imyemailcloud`、`imyemail-cloud-sy`、`imyemail-vbena` 与 `imyemail-cloud-byte` 共用业务组件和 API，只通过模板变量与受控布局规则形成视觉差异。
- 模板不得修改认证、授权、数据请求或业务状态；模板值必须继续由后端白名单校验。
- 宽屏页面应使用可用空间，阅读内容再在内部设置合理行宽，避免用固定外框制造大面积无效留白。
- 错误、空状态、加载、禁用、权限不足和网络失败必须有明确反馈。

### Web 组件规则

- UI 基础控件统一从 `@/components/ui/*` 引入；缺少组件时，在 `apps/web` 执行 `pnpm dlx shadcn@latest add <component>`，审阅生成源码后再使用。
- 业务 TSX 不直接使用原生 `button`、`input`、`textarea`、`select`、`table` 及其子控件、`dialog`、`aside`；`src/components/ui` 内部实现与语义布局标签不受此限制。
- 业务页面不使用 `CardDescription`、`DialogDescription`、`SheetDescription` 或标题下方的说明性小字；必要提示通过清晰标题、Label、Badge 和操作控件表达。
- 共享业务 TSX 保持 shadcn `new-york + neutral`，不硬编码蓝色品牌色、渐变或重阴影。扩展模板通过 `src/templates/` 中限定作用域的 CSS 和语义变量表达各自配色与布局，契约见 [界面模板](UI-TEMPLATES.md)。
- `pnpm --dir apps/web run check:shadcn` 与 `check:templates` 分别检查组件使用和模板契约；两者均包含在 `check` 中。

## 2. 实现与代码审查

- 保持 API 向后兼容；新增字段应有安全默认值和服务端校验。
- 权限必须由后端执行，前端隐藏按钮不能作为安全边界。
- 用户内容在展示前转义或净化，禁止把密码、Token、Cookie、邮件正文或个人信息写入日志。
- 数据库修改需要迁移、回滚和备份影响说明；队列、邮件发送和 Webhook 需要考虑幂等与安全重试。
- Docker、Compose 和 CI 修改必须检查最小权限、端口、健康检查、持久化数据及回滚路径。

详细审查重点见仓库根目录的 `AGENTS.md`。

## 3. 验证矩阵

### 工具准备与本地启动

以下命令均从仓库根目录执行。使用 Node.js 24 LTS（附带 npm）、Go 1.27，以及 rustup；邮件容器验证还需要运行中的 Docker Engine、Compose 和 Buildx。版本来源为 [CI](../.github/workflows/ci.yml)、[Go 模块](../apps/api/go.mod)、[Web 包配置](../apps/web/package.json) 与 [Rust 工具链](../rust-toolchain.toml)。

```bash
npm install --global pnpm@11.24.0
rustup toolchain install 1.98.0 --profile minimal --component rustfmt --component clippy
pnpm install --frozen-lockfile --filter imyemail-web...
```

不便全局安装 pnpm 时，可将下方命令的 `pnpm` 替换为 `npm exec --yes --package=pnpm@11.24.0 -- pnpm`。无需依赖本机是否预装 Corepack。仓库内 `cargo` 自动使用固定工具链，避免默认 Rust 低于两个 crate 的最低版本要求；工具链安装完成后再并行执行检查。

分别在两个终端启动 API 与 Web：

```bash
(cd apps/api && go run ./cmd/server)
```

```bash
pnpm --dir apps/web run dev
```

Web 开发服务器默认监听 `5173`，将 `/api` 和 `/healthz` 代理到本机 `8080`。Rust API 是可选兼容代理，职责见 [架构说明](ARCHITECTURE.md)。

### 提交前检查

提交前按影响范围执行；正式版本必须执行完整矩阵。

```bash
pnpm --dir apps/web run check

(cd apps/api && go test ./...)
(cd apps/api-rs && cargo fmt --check && cargo clippy --locked --all-targets --all-features -- -D warnings && cargo test --locked)
(cd apps/manager && cargo fmt --check && cargo clippy --locked --all-targets --all-features -- -D warnings && cargo test --locked)

bash -n install.sh deploy/install.sh deploy/dovecot/run-test.sh
sh -n deploy/dovecot/build-source.sh deploy/dovecot/check-source.sh
python3 -m py_compile deploy/tests/check-mail-stack.py
node --check site/i18n.js
node --check site/app.js
node site/check-i18n.mjs
```

Dockerfile 和五组 Compose 校验命令以 CI 中的 `Validate Dockerfiles`、`Validate Compose configurations` 为准。在本地校验时不要覆盖已有 `deploy/.env`；只使用示例配置或隔离副本。Docker 守护进程不可用时，容器构建和邮件协议回归不算已完成。

界面修改还要人工检查：

| 场景 | 最低检查项 |
| --- | --- |
| 视口 | 375、768、1440、2560 CSS 像素宽度 |
| 模板 | `imyemaildefault`、`imyemailcloud`、`imyemail-cloud-sy`、`imyemail-vbena`、`imyemail-cloud-byte` |
| 主题 | 浅色、深色、系统减少动态效果 |
| 状态 | 加载、空数据、长文本、错误、权限受限 |
| 浏览器 | 当前 Chrome/Edge、Safari 或 Firefox 中至少两种引擎 |

发布前还应验证 Shell/HTML/JSON/YAML 语法、Docker 构建上下文、镜像健康检查、Manager 版本输出和正式 CDN 构建可复现性。

CI 的原生 amd64/arm64 邮件任务会编译完整 all-in-one、以低权限用户运行 Dovecot 上游自测，并执行 `deploy/tests/check-mail-stack.py`，验证本地收发、鉴权、Maildir 与线程索引的升级/回滚一致性。该脚本只创建隔离容器和测试数据卷，不得改为访问生产实例；参见 [Dovecot 验证说明](../deploy/dovecot/README.md)。

### 构建产物与清理

可再生成的本地缓存包括 `apps/api-rs/target/`、`apps/manager/target/`、`apps/web/tsconfig.tsbuildinfo` 与 `deploy/tests/__pycache__/`，停止相关构建后可清理；依赖目录按需重装即可。不要用全仓库 `git clean -fdx` 清理工作区，它会同时删除被忽略的环境配置和运行数据。

`apps/web/dist/` 是受版本控制的正式 CDN 快照，必须保留。日常 `check` 会重建它；仅验证构建而不更新快照时，可按顺序运行四项 `check:*`，再执行 `pnpm --dir apps/web exec tsc -b` 和 `pnpm --dir apps/web exec vite build --outDir /tmp/imyemail-web-check`。正式发布仍须按发布配置重建并核验固定版本资源。

文档按职责维护：当前规则留在本规范，版本变化留在 `CHANGELOG.md`，旧版验证明细通过对应 Git 标签查阅。合并重复文档后同步修改引用；保留 `AGENTS.md`、许可、锁文件、部署模板、OpenAPI 契约和安全/回滚说明。

## 4. 安全审计清单

- 认证、会话、2FA、应用密码及恢复流程不存在绕过路径。
- 每个受保护接口都验证角色、细粒度权限和资源归属。
- 输入处理覆盖注入、路径穿越、SSRF、XSS、CSRF、文件类型与大小限制。
- 邮件流程检查头部注入、伪造发件人、收件人泄露、模板净化和附件安全。
- 密钥、Token、密码、验证码、Cookie、私人邮件与服务器配置未进入仓库、构建产物或公开日志。
- 依赖和容器基础镜像没有已知的高危可利用问题；发现例外时必须记录影响和缓解措施。
- 容器审计需检查尚无发行版补丁的公告及真实可达性，不得仅依赖 `--ignore-unfixed`；发现邮件协议可达风险必须先修复再发布。刷新基础镜像不会自动失效已有 apt 软件包构建层，须同时核验安装版本和缓存刷新策略。
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

Pages 始终从 GitHub Latest Release 的已发布标签构建；主分支中的候选站点资源先经过 CI 和 Release 的脚本、翻译与版本一致性预检，不会提前展示为正式版本。Docker Release 成功后自动触发 Pages 更新，也可从 main 手动重部署当前已发布标签；保留 GitHub Pages 环境仅允许 main 部署的保护，不为候选标签放宽权限。站点修改因此需要随正式版本发布。

没有完成验证、安全审计、文档同步或可回滚性确认的修改，不视为可发布。
