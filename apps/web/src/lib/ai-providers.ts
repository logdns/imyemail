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
