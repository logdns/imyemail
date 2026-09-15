import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { api, type AIMailInput, type AIMailResult, type MailMessage } from "@/lib/api"
import { useMe } from "@/hooks/use-me"
import { hasPermission } from "@/lib/permissions"
import { useLanguage } from "@/lib/language"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function AIMailAssistant({ action, message, draftText = "", onApply }: {
  action: AIMailInput["action"]; message?: MailMessage; draftText?: string; onApply?: (text: string) => void
}) {
  const me = useMe()
  const allowed = hasPermission(me.data?.user, "mail.access") && hasPermission(me.data?.user, action === "summary" ? "mail.messages.read" : "mail.messages.send")
  const canReadSource = !message || hasPermission(me.data?.user, "mail.messages.read")
  const status = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, enabled: allowed && canReadSource, staleTime: 30_000 })
  const [language] = useLanguage()
  const [open, setOpen] = React.useState(false)
  const [instruction, setInstruction] = React.useState("")
  const [result, setResult] = React.useState<AIMailResult>()
  const [error, setError] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const controller = React.useRef<AbortController>()
  const instructionID = React.useId()
  const resultID = React.useId()
  React.useEffect(() => () => { controller.current?.abort() }, [])
  React.useEffect(() => {
    controller.current?.abort()
    setPending(false)
    setResult(undefined)
    setError("")
  }, [language])
  const title = action === "summary" ? "AI 总结" : action === "reply" ? "AI 回复" : "AI 写邮件"
  function changeOpen(value: boolean) {
    controller.current?.abort()
    controller.current = undefined
    setPending(false)
    setError("")
    setResult(undefined)
    setOpen(value)
  }
  async function generate() {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setPending(true)
    setError("")
    setResult(undefined)
    try {
      const output = await api.aiMail({ action, instruction, language, ...(action === "compose" ? { text: draftText } : {}) }, current.signal, message)
      if (!current.signal.aborted) setResult(output)
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : "AI 生成失败")
    } finally {
      if (!current.signal.aborted) setPending(false)
    }
  }
  if (!allowed || !canReadSource || !status.data?.enabled) return null
  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => changeOpen(true)}><Sparkles className="size-4" />{title}</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <p className="text-sm text-muted-foreground">点击生成会将写作要求和当前正文（阅读时含主题）发送给管理员配置的第三方 AI；不发送附件或收件人列表。</p>
          <p className="text-sm text-muted-foreground">AI 内容可能有误，请核对后再使用。邮件不会自动发送。</p>
          {action !== "summary" && <div className="space-y-2"><Label htmlFor={instructionID}>写作要求</Label><Textarea id={instructionID} value={instruction} disabled={pending} maxLength={2000} onChange={(e) => { setInstruction(e.target.value); setResult(undefined) }} placeholder="说明目的、语气和需要包含的要点" className="min-h-24" /></div>}
          {action === "compose" && Array.from(draftText).length > 20000 && <p role="alert" className="text-sm text-destructive">正文超过 20000 字，请缩短后重试。</p>}
          {pending && <p role="status">AI 生成中…</p>}
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
          {result && <div className="space-y-2" aria-live="polite">
            <Label htmlFor={resultID}>生成结果</Label>
            {result.truncated && <p className="text-sm text-muted-foreground">邮件过长，仅处理了前 20000 字。</p>}
            <Textarea id={resultID} value={result.text} readOnly={action === "summary"} onChange={(e) => setResult({ ...result, text: e.target.value })} className="min-h-56" data-imyemail-i18n-ignore />
          </div>}
        </div>
        <DialogFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>{pending ? "取消生成" : "关闭"}</Button>
          <Button type="button" disabled={pending || (action === "compose" && (!instruction.trim() || Array.from(draftText).length > 20000))} onClick={generate}>{result ? "重新生成" : "生成"}</Button>
          {onApply && result && <Button type="button" disabled={pending || !result.text.trim()} onClick={() => { onApply(result.text); changeOpen(false) }}>{action === "reply" ? "采用并打开回复" : "追加到正文"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
