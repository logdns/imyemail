export type ImageHostingPermission = "0" | "1"

export type ImageHostingConfig = {
  apiBase: string
  token: string
  permission: ImageHostingPermission
  strategyId: string
  albumId: string
}

const storageKey = "imyemail:image-hosting"
export const defaultImageHostingConfig: ImageHostingConfig = {
  apiBase: "https://tu.my/api/v1",
  token: "",
  permission: "1",
  strategyId: "",
  albumId: "",
}

export function loadImageHostingConfig(): ImageHostingConfig {
  if (typeof window === "undefined") return { ...defaultImageHostingConfig }
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Partial<ImageHostingConfig>
    return {
      apiBase: typeof stored.apiBase === "string" && stored.apiBase.trim() ? stored.apiBase.trim() : defaultImageHostingConfig.apiBase,
      token: typeof stored.token === "string" ? stored.token : "",
      permission: stored.permission === "0" ? "0" : "1",
      strategyId: typeof stored.strategyId === "string" ? stored.strategyId : "",
      albumId: typeof stored.albumId === "string" ? stored.albumId : "",
    }
  } catch {
    return { ...defaultImageHostingConfig }
  }
}

export function saveImageHostingConfig(config: ImageHostingConfig) {
  const normalized = normalizeImageHostingConfig(config)
  window.localStorage.setItem(storageKey, JSON.stringify(normalized))
  return normalized
}

export function normalizeImageHostingConfig(config: ImageHostingConfig): ImageHostingConfig {
  const url = new URL(config.apiBase.trim())
  if (url.protocol !== "https:") throw new Error("图床 API 地址必须使用 HTTPS")
  if (url.username || url.password) throw new Error("图床 API 地址不能包含用户名或密码")
  url.hash = ""
  url.search = ""
  return {
    apiBase: url.toString().replace(/\/$/, ""),
    token: config.token.trim(),
    permission: config.permission === "1" ? "1" : "0",
    strategyId: config.strategyId.trim(),
    albumId: config.albumId.trim(),
  }
}

export async function uploadImageToHosting(file: File, inputConfig?: ImageHostingConfig): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("只能上传图片文件")
  if (file.size > 25 * 1024 * 1024) throw new Error("图片大小不能超过 25 MB")
  const config = normalizeImageHostingConfig(inputConfig || loadImageHostingConfig())
  const form = new FormData()
  form.set("file", file)
  form.set("permission", config.permission)
  if (config.token) form.set("token", config.token)
  if (config.strategyId) form.set("strategy_id", config.strategyId)
  if (config.albumId) form.set("album_id", config.albumId)
  const headers: HeadersInit = { Accept: "application/json" }
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2 * 60_000)
  let response: Response
  try {
    response = await fetch(`${config.apiBase}/upload`, { method: "POST", headers, body: form, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("图片上传超时，请稍后重试")
    throw new Error("无法连接图床，请检查 API 地址、网络和跨域设置")
  } finally {
    window.clearTimeout(timeout)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(response.ok ? "图床返回了无法识别的响应" : `上传失败（HTTP ${response.status}）`)
  }
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "message" in payload ? String((payload as { message?: unknown }).message || "") : ""
    throw new Error(message || `上传失败（HTTP ${response.status}）`)
  }
  const url = (payload as { data?: { links?: { url?: unknown } } })?.data?.links?.url
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) throw new Error("图床响应中没有有效的 HTTPS 图片地址")
  return url
}
