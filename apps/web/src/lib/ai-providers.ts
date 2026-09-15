import type { AIProtocol } from "./api-types"

// Presets fill editable fields only; the server validates all destinations.
// Model availability depends on the provider account. No model is selected silently.
export const aiProviders: { id: string; name: string; protocol: AIProtocol; baseUrl: string }[] = [
  { id: "openai", name: "OpenAI", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic / Claude", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1" },
  { id: "gemini", name: "Google Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "deepseek", name: "DeepSeek", protocol: "openai-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "qwen", name: "Alibaba Cloud / Qwen (China)", protocol: "openai-chat", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { id: "qwen-intl", name: "Alibaba Cloud / Qwen (International)", protocol: "openai-chat", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  { id: "moonshot", name: "Moonshot / Kimi", protocol: "openai-chat", baseUrl: "https://api.moonshot.cn/v1" },
  { id: "zhipu", name: "Zhipu / GLM", protocol: "openai-chat", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  { id: "doubao", name: "Volcengine / Doubao", protocol: "openai-chat", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { id: "siliconflow", name: "SiliconFlow", protocol: "openai-chat", baseUrl: "https://api.siliconflow.cn/v1" },
  { id: "openrouter", name: "OpenRouter", protocol: "openai-chat", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", name: "Groq", protocol: "openai-chat", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "mistral", name: "Mistral", protocol: "openai-chat", baseUrl: "https://api.mistral.ai/v1" },
  { id: "xai", name: "xAI / Grok", protocol: "openai-chat", baseUrl: "https://api.x.ai/v1" },
  { id: "together", name: "Together AI", protocol: "openai-chat", baseUrl: "https://api.together.xyz/v1" },
  { id: "fireworks", name: "Fireworks AI", protocol: "openai-chat", baseUrl: "https://api.fireworks.ai/inference/v1" },
]

export const aiProtocols: { id: AIProtocol; name: string; suffix: string }[] = [
  { id: "openai-chat", name: "OpenAI Chat Completions", suffix: "/chat/completions" },
  { id: "openai-responses", name: "OpenAI Responses", suffix: "/responses" },
  { id: "anthropic", name: "Anthropic Messages", suffix: "/messages" },
  { id: "gemini", name: "Gemini GenerateContent", suffix: "/models/{model}:generateContent" },
]

const aiErrorMessages: Record<string, string> = {
  "AI request timed out; check server connectivity or try a faster model": "AI 请求超时，请检查服务器网络或选择更快的模型",
  "AI DNS lookup failed; check provider hostname and server DNS": "AI 域名解析失败，请检查服务商域名和服务器 DNS",
  "AI connection failed; check server network, HTTPS certificate and public provider URL": "AI 连接失败，请检查服务器网络、HTTPS 证书和公网接口地址",
  "AI response is empty, incomplete or incompatible; check API protocol and model, or try a non-reasoning text model": "AI 响应为空、不完整或不兼容，请检查协议和模型，或尝试非推理文本模型",
  "AI model list is too large or unreadable; enter a model manually": "模型列表过大或无法读取，请手动输入模型",
  "AI model list is unsupported or incompatible; check protocol or enter a model manually": "服务商不支持此模型列表接口，请检查协议或手动输入模型",
  "re-enter or clear AI key when changing provider URL": "更换服务商地址或协议后，请重新填写 KEY",
  "AI provider HTTP 400: check API protocol, model and supported request parameters": "AI HTTP 400：请检查协议、模型及服务商支持的请求参数",
  "AI provider HTTP 422: check API protocol, model and supported request parameters": "AI HTTP 422：请检查协议、模型及服务商支持的请求参数",
  "AI provider HTTP 401: API KEY was rejected; re-enter a valid key": "AI HTTP 401：KEY 被拒绝，请重新填写有效 KEY",
  "AI provider HTTP 402: check provider account balance": "AI HTTP 402：请检查服务商账户余额",
  "AI provider HTTP 403: check key permissions, model access and provider region restrictions": "AI HTTP 403：请检查 KEY 权限、模型权限和地区限制",
  "AI provider HTTP 404: check Base URL, API protocol and model; this endpoint may be unsupported": "AI HTTP 404：接口或模型不存在，请检查地址、协议和模型",
  "AI provider HTTP 405: check Base URL, API protocol and model; this endpoint may be unsupported": "AI HTTP 405：接口或模型不存在，请检查地址、协议和模型",
  "AI provider HTTP 408: provider timed out; try again later or choose a faster model": "AI HTTP 408：服务商超时，请稍后重试或选择更快的模型",
  "AI provider HTTP 504: provider timed out; try again later or choose a faster model": "AI HTTP 504：服务商超时，请稍后重试或选择更快的模型",
  "AI provider HTTP 429: check provider quota, balance and rate limits": "AI HTTP 429：请检查服务商配额、余额和请求频率",
  "AI provider HTTP 500: check provider availability": "AI HTTP 500：服务商暂不可用，请稍后重试",
  "AI provider HTTP 502: check provider availability": "AI HTTP 502：服务商暂不可用，请稍后重试",
  "AI provider HTTP 503: check provider availability": "AI HTTP 503：服务商暂不可用，请稍后重试"
}

export function aiSettingsError(message: string): string { return aiErrorMessages[message] || message }
