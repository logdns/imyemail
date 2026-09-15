import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type AISettings, type AIProtocol } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { aiProviders, aiProtocols } from "@/lib/ai-providers"
import { useToast } from "@/hooks/use-toast"

export function AISettingsCard({ canUpdate }: { canUpdate: boolean }) {
  const settings = useQuery({ queryKey: ["admin", "ai-settings"], queryFn: api.aiSettings })
  if (settings.isPending) return <p role="status">正在加载…</p>
  if (settings.isError) return <div role="alert"><p>AI 配置加载失败</p><Button type="button" variant="outline" onClick={() => settings.refetch()}>重新加载</Button></div>
  return <AISettingsFields key={JSON.stringify(settings.data)} settings={settings.data} canUpdate={canUpdate} />
}

function AISettingsFields({ settings, canUpdate }: { settings: AISettings; canUpdate: boolean }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [protocol, setProtocol] = React.useState<AIProtocol>(settings.protocol || "openai-chat")
  const [enabled, setEnabled] = React.useState(settings.enabled)
  const [baseUrl, setBaseUrl] = React.useState(settings.baseUrl)
  const [model, setModel] = React.useState(settings.model)
  const [apiKey, setApiKey] = React.useState("")
  const [clearApiKey, setClearApiKey] = React.useState(false)
  const test = useMutation({ mutationFn: api.testAISettings })
  const dirty = enabled !== settings.enabled || protocol !== (settings.protocol || "openai-chat") || baseUrl !== settings.baseUrl || model !== settings.model || apiKey !== "" || clearApiKey
  const preset = aiProviders.find((item) => item.baseUrl !== "" && item.baseUrl === baseUrl && item.protocol === protocol)?.id || "custom"
  const save = useMutation({
    mutationFn: () => api.updateAISettings({ enabled, protocol, baseUrl, model, apiKey, clearApiKey }),
    onSuccess: (result) => {
      test.reset()
      setApiKey("")
      setClearApiKey(false)
      qc.setQueryData(["admin", "ai-settings"], result)
      qc.invalidateQueries({ queryKey: ["ai-status"] })
      toast({ title: "AI 配置已保存" })
    },
  })
  return <Card>
    <CardHeader><CardTitle>AI 邮件助手</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <fieldset disabled={!canUpdate || save.isPending || test.isPending} className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3 md:col-span-2"><Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="ai-enabled">启用 AI 邮件助手</Label></div>
        <div className="space-y-2"><Label htmlFor="ai-provider">AI 服务商</Label><Select value={preset} onValueChange={(id) => {
          const selected = aiProviders.find((item) => item.id === id)
          if (selected) { setProtocol(selected.protocol); setBaseUrl(selected.baseUrl); setModel(""); setApiKey(""); setClearApiKey(false) }
          else { setBaseUrl(""); setApiKey("") }
          test.reset()
        }}><SelectTrigger id="ai-provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">自定义 / 第三方服务商</SelectItem>{aiProviders.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="ai-protocol">API 协议</Label><Select value={protocol} onValueChange={(value) => { setProtocol(value as AIProtocol); test.reset() }}><SelectTrigger id="ai-protocol"><SelectValue /></SelectTrigger><SelectContent>{aiProtocols.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="ai-url">服务商 Base URL</Label><Input id="ai-url" value={baseUrl} maxLength={2048} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" /></div>
        <div className="space-y-2"><Label htmlFor="ai-model">模型名称</Label><Input id="ai-model" value={model} maxLength={200} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="ai-key">{settings.apiKeySet ? "API KEY（已设置，留空保留）" : "API KEY"}</Label><Input id="ai-key" type="password" autoComplete="new-password" value={apiKey} maxLength={4096} disabled={clearApiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
        <div className="flex items-center gap-3"><Checkbox id="ai-clear-key" checked={clearApiKey} onCheckedChange={(value) => { setClearApiKey(value === true); setApiKey("") }} /><Label htmlFor="ai-clear-key">清除已保存的 KEY</Label></div>
      </fieldset>
      <p className="text-sm text-muted-foreground">仅支持公网 HTTPS 地址；填写包含版本路径的 Base URL。更换地址或协议时须重新填写或清除 KEY。</p>
      <p className="break-all text-sm text-muted-foreground"><span>自动追加路径</span>：{aiProtocols.find((item) => item.id === protocol)?.suffix}</p>
      <p className="text-sm text-muted-foreground">模型名称以服务商账户为准；Gemini 填写模型 ID，豆包可填写推理接入点 ID。</p>
      <p className="text-sm text-muted-foreground">用户主动生成时，相关正文将发送到此服务商。请确认服务商的数据保留政策及费用。</p>
      {save.isError && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <p className="text-sm text-muted-foreground">先保存配置，再测试连接；无需启用。测试仅发送合成文本，可能产生少量费用。</p>
      {test.isError && !dirty && <p role="alert" className="text-sm text-destructive">{test.error.message}</p>}
      {test.isSuccess && !dirty && <p role="status" className="text-sm">AI 连接测试成功</p>}
      {canUpdate && <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={dirty || save.isPending || test.isPending || !settings.apiKeySet || !settings.model || !settings.baseUrl} onClick={() => test.mutate()}>{test.isPending ? "测试中…" : "测试 AI 连接"}</Button><Button type="button" disabled={save.isPending || test.isPending} onClick={() => save.mutate()}>{save.isPending ? "保存中..." : "保存 AI 配置"}</Button></div>}
    </CardContent>
  </Card>
}
