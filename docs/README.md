# 文档导航

按任务选择入口；当前功能以仓库代码和正式版本为准，历史发布变化集中在更新日志。

| 任务 | 文档 | 维护范围 |
| --- | --- | --- |
| 了解项目 | [中文 README](../README.md) / [English README](../README.en.md) | 功能概览与快速入口 |
| 安装、配置 Docker | [部署说明](../deploy/README.md) | 镜像、Compose、环境变量、DNS、TLS 和投递排错 |
| 更新、备份、恢复、迁移 | [安装与运维](OPERATIONS.md) | Manager、持久化数据、版本兼容、安全边界和回滚 |
| 查找产品能力 | [功能说明](FEATURES.md) | 用户入口、管理员权限与协议支持 |
| 理解组件和数据流 | [系统架构](ARCHITECTURE.md) | Go/Rust 职责、邮件流、认证与部署边界 |
| 开发、构建、测试、发布 | [开发规范](DEVELOPMENT.md) | 工具准备、验证矩阵、组件规则、缓存清理与发布门禁 |
| 修改界面模板 | [界面模板](UI-TEMPLATES.md) | 设计来源、响应式契约、切换/回滚与当前验证记录 |
| 接入 API | [API 文档](API.md) / [OpenAPI 3.1](openapi.json) | 会话接口说明与稳定开放 API 契约 |
| 构建和验证 Dovecot | [Dovecot 说明](../deploy/dovecot/README.md) | 源码验证、上游自测、许可证与隔离协议回归 |
| 审查代码 | [AGENTS.md](../AGENTS.md) | 安全、正确性与修复规则；自动审查复用同一份规则 |
| 查询版本历史 | [更新日志](../CHANGELOG.md) / [GitHub Releases](https://github.com/logdns/imyemail/releases) | 版本变化、标签与发行附件 |

部署文档维护具体配置，运维文档维护数据操作流程；修改时更新对应职责文档，并从其他入口链接，避免复制整段命令或长期保留多份版本验证流水。历史验证可从对应 Git 标签查询，许可、安全风险与回滚说明应继续保留。
