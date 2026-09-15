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
import { aiProviders, aiProtocols, aiSettingsError } from "@/lib/ai-providers"
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
  const draft = { protocol, baseUrl, model, apiKey, clearApiKey }
  const test = useMutation({ mutationFn: () => api.testAISettings(draft) })
  const models = useMutation({ mutationFn: () => api.aiModels(draft) })
  const credentialReady = !clearApiKey && (apiKey.trim() !== "" || settings.apiKeySet && baseUrl.trim().replace(/\/+$/, "") === settings.baseUrl && protocol === settings.protocol)
  React.useEffect(() => { test.reset() }, [protocol, baseUrl, model, apiKey, clearApiKey]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { models.reset() }, [protocol, baseUrl, apiKey, clearApiKey]) // eslint-disable-line react-hooks/exhaustive-deps
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
      <fieldset disabled={!canUpdate || save.isPending || test.isPending || models.isPending} className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="flex items-center gap-3 md:col-span-2"><Switch id="ai-enabled" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="ai-enabled">启用 AI 邮件助手</Label></div>
        <div className="space-y-2"><Label htmlFor="ai-provider">AI 服务商</Label><Select value={preset} onValueChange={(id) => {
          const selected = aiProviders.find((item) => item.id === id)
          if (selected) { setProtocol(selected.protocol); setBaseUrl(selected.baseUrl); setModel(""); setApiKey(""); setClearApiKey(false) }
          else { setBaseUrl(""); setApiKey("") }
          test.reset()
        }}><SelectTrigger id="ai-provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="custom">自定义 / 第三方服务商</SelectItem>{aiProviders.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="ai-protocol">API 协议</Label><Select value={protocol} onValueChange={(value) => { setProtocol(value as AIProtocol); test.reset() }}><SelectTrigger id="ai-protocol"><SelectValue /></SelectTrigger><SelectContent>{aiProtocols.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="ai-url">服务商 Base URL</Label><Input id="ai-url" value={baseUrl} maxLength={2048} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="ai-model">模型名称</Label>
          <div className="flex gap-2"><Input id="ai-model" className="min-w-0" value={model} maxLength={200} placeholder="手动输入模型 ID" onChange={(e) => setModel(e.target.value)} /><Button type="button" variant="outline" disabled={!credentialReady || !baseUrl.trim() || models.isPending} onClick={() => models.mutate()}>{models.isPending ? "获取中…" : "获取模型"}</Button></div>
          {!!models.data?.models.length && <Select value={models.data.models.includes(model) ? model : ""} onValueChange={setModel}><SelectTrigger aria-label="选择已获取的模型" className="min-w-0"><SelectValue placeholder="选择已获取的模型" /></SelectTrigger><SelectContent>{models.data.models.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent></Select>}
          {models.isSuccess && models.data.models.length === 0 && <p role="status" className="text-sm">未返回可用模型，请手动输入模型 ID</p>}
          {models.data?.truncated && <p role="status" className="text-sm">仅显示部分模型，未列出的模型可手动输入</p>}
          {models.isError && <p role="alert" className="text-sm text-destructive">{aiSettingsError(models.error.message)}</p>}
        </div>
        <div className="space-y-2"><Label htmlFor="ai-key">{settings.apiKeySet ? "API KEY（已设置，留空保留）" : "API KEY"}</Label><Input id="ai-key" type="password" autoComplete="new-password" value={apiKey} maxLength={4096} disabled={clearApiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
        <div className="flex items-center gap-3"><Checkbox id="ai-clear-key" checked={clearApiKey} onCheckedChange={(value) => { setClearApiKey(value === true); setApiKey("") }} /><Label htmlFor="ai-clear-key">清除已保存的 KEY</Label></div>
      </fieldset>
      <p className="text-sm text-muted-foreground">支持公网 HTTPS 根地址、含版本路径的 Base URL 或完整接口地址。更换地址或协议时须重新填写 KEY。</p>
      <p className="break-all text-sm text-muted-foreground"><span>协议接口路径</span>：{aiProtocols.find((item) => item.id === protocol)?.suffix}</p>
      <p className="text-sm text-muted-foreground">模型名称以服务商账户为准；Gemini 填写模型 ID，豆包可填写推理接入点 ID。</p>
      <p className="text-sm text-muted-foreground">用户主动生成时，相关正文将发送到此服务商。请确认服务商的数据保留政策及费用。</p>
      {save.isError && <p role="alert" className="text-sm text-destructive">{aiSettingsError(save.error.message)}</p>}
      <p className="text-sm text-muted-foreground">获取模型和测试使用当前填写的配置，无需先保存或启用。测试仅发送合成文本，可能产生少量费用。</p>
      {test.isError && <p role="alert" className="text-sm text-destructive">{aiSettingsError(test.error.message)}</p>}
      {test.isSuccess && <p role="status" className="text-sm">AI 连接测试成功</p>}
      {canUpdate && <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending || test.isPending || models.isPending || !credentialReady || !model.trim() || !baseUrl.trim()} onClick={() => test.mutate()}>{test.isPending ? "测试中…" : "测试 AI 连接"}</Button><Button type="button" disabled={save.isPending || test.isPending || models.isPending} onClick={() => save.mutate()}>{save.isPending ? "保存中..." : "保存 AI 配置"}</Button></div>}
    </CardContent>
  </Card>
}
