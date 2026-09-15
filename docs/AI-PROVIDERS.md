# AI 服务商接入

在「后台 → 系统设置 → AI 邮件助手」选择服务商预设或「自定义 / 第三方服务商」，核对 API 协议、包含版本路径的公网 HTTPS Base URL 和账户可用的模型，再填写 KEY。预设只填地址和协议，不自动选择模型、启用功能或发送请求。当前每个部署使用一组服务商配置，不提供自动故障切换或跨服务商发送。

先保持关闭并保存，点击「测试 AI 连接」；成功后再启用。测试调用真实服务商，但只发送固定合成文本，不读取邮件，不返回生成内容，可能产生少量费用。修改后必须先保存才可测试；读取设置的权限不能执行测试。连接测试与生成共享每账号每分钟 10 次、每进程并发 4 次限制。

## 协议和预设

| 协议值 | 追加路径 | 鉴权 | 输出限制 |
| --- | --- | --- | --- |
| `openai-chat`（旧配置默认） | `/chat/completions` | Bearer KEY | `max_tokens: 2000`，纯文本 Chat Completions |
| `openai-responses` | `/responses` | Bearer KEY | `max_output_tokens: 2000`、`store: false` |
| `anthropic` | `/messages` | `x-api-key`，`anthropic-version: 2023-06-01` | `max_tokens: 2000`，独立 system 字段 |
| `gemini` | `/models/{model}:generateContent` | `x-goog-api-key` 请求头 | `maxOutputTokens: 2000`，独立 systemInstruction |

| 服务商预设 | Base URL | 协议 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | Responses |
| Anthropic / Claude | `https://api.anthropic.com/v1` | Messages |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | GenerateContent |
| DeepSeek | `https://api.deepseek.com/v1` | Chat Completions |
| 通义千问（中国 / 国际） | `https://dashscope.aliyuncs.com/compatible-mode/v1` / `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | Chat Completions |
| Moonshot / Kimi | `https://api.moonshot.cn/v1` | Chat Completions |
| 智谱 / GLM | `https://open.bigmodel.cn/api/paas/v4` | Chat Completions |
| 火山引擎 / 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | Chat Completions |
| SiliconFlow | `https://api.siliconflow.cn/v1` | Chat Completions |
| OpenRouter | `https://openrouter.ai/api/v1` | Chat Completions |
| Groq | `https://api.groq.com/openai/v1` | Chat Completions |
| Mistral | `https://api.mistral.ai/v1` | Chat Completions |
| xAI / Grok | `https://api.x.ai/v1` | Chat Completions |
| Together AI | `https://api.together.xyz/v1` | Chat Completions |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | Chat Completions |

预设不代表已使用付费 KEY 对所有服务商逐一验收。账户、区域、模型权限、额度和服务商协议变更会影响可用性；启用前应通过连接测试，并用合成内容验证写信、总结、回复。模型以账户控制台为准，Gemini 只填模型 ID（不带 `models/`）；豆包可填推理接入点 ID。需要其他 token 参数或不输出纯文本的模型，应选择对应协议或兼容网关。

第三方服务商、聚合平台及公网自建网关支持上述四种协议，可自定义 Base URL 和模型。地址不含最终操作路径，不接受 URL 用户信息、查询参数、片段、私网地址或 HTTP。KEY 只放在协议指定的请求头中；不支持任意自定义请求头、Azure 旧版带 `api-version` 的接口、Bedrock 签名鉴权、Vertex 服务账号、私网 Ollama 或工具执行。这些接入方式需使用提供上述协议的可信公网 HTTPS 网关。

更换地址或协议必须重新输入或清除 KEY。响应拒绝、工具调用、截断和空文本会报错；思考内容不会展示。失败无自动重试，也不会发送邮件。隐私、凭据备份与回滚见 [运维说明](OPERATIONS.md#ai-邮件助手)。

协议参考：[OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create)、[Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)、[Gemini GenerateContent](https://ai.google.dev/api/generate-content)。

## 真实联调

普通 Go 测试通过模拟服务商响应验证四种协议，不产生计费。真实测试必须显式指定测试配置文件；文件置于仓库之外，权限为 `0600`，内容为 JSON 数组，每项包含 `protocol`、`baseUrl`、`model`、`apiKey`。不要使用生产邮件或把 KEY 粘贴到终端命令参数、聊天和日志中。

```bash
cd apps/api
IMYEMAIL_AI_LIVE_CONFIG=/absolute/private/ai-test.json \
  go test ./internal/app -run '^TestAILiveProviders$' -count=1 -v
```

每个配置执行写信、总结、回复各一次；仅发送合成文本。日志只报告配置序号、协议、动作和成败，不显示 KEY、地址、模型和生成内容。默认测试输出 `SKIP`，不能作为真实联调通过的证据。
