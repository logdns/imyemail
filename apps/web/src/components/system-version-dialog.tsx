import * as React from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckCircle2, Download, ExternalLink, History, Loader2, RefreshCcw, RotateCcw, Trash2, TriangleAlert } from "lucide-react"
import { api } from "@/lib/api"
import { cn, formatDate } from "@/lib/utils"
import { useMe } from "@/hooks/use-me"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const frontendVersion = import.meta.env.VITE_APP_VERSION || "dev"

export function SystemVersionDialog({ mode = "sidebar", className }: { mode?: "sidebar" | "inline"; className?: string }) {
  const me = useMe()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [updatePhase, setUpdatePhase] = React.useState<"idle" | "starting" | "restarting">("idle")
  const [activeAction, setActiveAction] = React.useState<"update" | "rollback">("update")
  const [rollbackConfirmation, setRollbackConfirmation] = React.useState<"rollback" | "delete" | null>(null)
  const version = useQuery({
    queryKey: ["admin", "system-version"],
    queryFn: api.systemVersion,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const currentVersion = version.data?.currentVersion || frontendVersion
  const isSystemAdmin = me.data?.user.role === "admin"
  const operation = useQuery({
    queryKey: ["admin", "system-operation"],
    queryFn: api.systemOperation,
    enabled: open && isSystemAdmin,
    retry: 1,
    refetchInterval: (query) => ["preparing", "running"].includes(query.state.data?.operation.phase || "") ? 2000 : false,
  })
  const update = useMutation({
    mutationFn: async () => {
      setActiveAction("update")
      setUpdatePhase("starting")
      const result = await api.updateSystem()
      setUpdatePhase("restarting")
      await waitForUpdatedService(result.targetVersion)
      return result
    },
    onError: (error) => {
      setUpdatePhase("idle")
      toast({ title: "更新失败", description: error.message })
    },
  })
  const rollback = useMutation({
    mutationFn: async () => {
      setActiveAction("rollback")
      setUpdatePhase("starting")
      const result = await api.rollbackSystem()
      setRollbackConfirmation(null)
      setUpdatePhase("restarting")
      await waitForChangedService(currentVersion)
      return result
    },
    onError: (error) => {
      setUpdatePhase("idle")
      operation.refetch()
      toast({ title: "回滚失败", description: error.message })
    },
  })
  const deleteRollback = useMutation({
    mutationFn: api.deleteSystemRollback,
    onSuccess: async () => {
      setRollbackConfirmation(null)
      await operation.refetch()
      toast({ title: "回滚版本已删除", description: "当前版本、数据库和邮件不受影响。" })
    },
    onError: (error) => {
      toast({ title: "删除失败", description: error.message })
    },
  })
  const serviceOperationPending = update.isPending || rollback.isPending
  const operationPending = update.isPending || rollback.isPending || deleteRollback.isPending

  const trigger = mode === "inline" ? (
    <Button type="button" variant="outline" className={cn("h-11 justify-start gap-2 px-4 text-base font-normal", className)}>
      <RefreshCcw className="h-5 w-5 text-primary" />
      {currentVersion}
      {version.data?.updateAvailable && <Badge className="ml-1">可更新</Badge>}
    </Button>
  ) : (
    <Button
      type="button"
      variant={version.data?.updateAvailable ? "secondary" : "ghost"}
      className={cn("h-8 w-fit max-w-full justify-start gap-2 rounded-md px-2 text-xs font-medium group-data-[collapsible=icon]:hidden", className)}
      aria-label={`系统版本 ${currentVersion}`}
    >
      <span className="truncate">{currentVersion}</span>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", version.data?.updateAvailable ? "bg-amber-500" : "bg-emerald-500")} aria-hidden="true" />
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setRollbackConfirmation(null) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4 pr-12 sm:px-6">
            <DialogTitle>系统版本</DialogTitle>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => { version.refetch(); operation.refetch() }} disabled={version.isFetching || operationPending} aria-label="重新检查更新" title="重新检查更新">
              <RefreshCcw className={cn("h-4 w-4", version.isFetching && "animate-spin")} />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="rounded-lg border bg-muted/20 px-4 py-5 text-center">
            <div className="text-sm text-muted-foreground">当前版本</div>
            <div className="mt-2 text-4xl font-semibold tabular-nums">{currentVersion}</div>
            {version.data?.latestVersion && <div className="mt-2 text-sm text-muted-foreground">最新版本：{version.data.latestVersion}</div>}
          </div>

          {version.isLoading && <VersionState icon={<Loader2 className="animate-spin" />} title="正在检查更新" description="正在连接 GitHub Release。" />}
          {version.data?.checkError && <VersionState icon={<TriangleAlert />} title="暂时无法检查更新" description={version.data.checkError} tone="warning" />}
          {version.data && !version.data.checkError && !version.data.updateAvailable && <VersionState icon={<CheckCircle2 />} title="已是最新版本" description="当前无需更新。" tone="success" />}
          {version.data?.updateAvailable && (
            <VersionState
              icon={<Download />}
              title="发现新版本"
              description={`${version.data.latestVersion} 已发布${version.data.publishedAt ? ` · ${formatDate(version.data.publishedAt)}` : ""}`}
              tone="warning"
            />
          )}

          {version.data?.releaseNotes && (
            <div className="space-y-2">
              <div className="text-sm font-medium">更新日志</div>
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
                {version.data.releaseNotes}
              </div>
            </div>
          )}

          {isSystemAdmin && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium"><History className="h-4 w-4" />版本回滚</div>
                {operation.data?.rollback.available && <Badge variant="outline">可回滚</Badge>}
              </div>
              {operation.isLoading && <div className="text-sm text-muted-foreground">正在检查回滚点…</div>}
              {operation.isError && <div className="text-sm text-muted-foreground">暂时无法读取回滚状态，请稍后重试。</div>}
              {operation.data?.rollback.available ? (
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div>上一版本：<span className="font-medium text-foreground">{operation.data.rollback.version || "已保存镜像"}</span></div>
                  {operation.data.rollback.createdAt && <div>创建时间：{formatDate(operation.data.rollback.createdAt)}</div>}
                  <div>仅回滚镜像与 Compose，数据库内容不会回滚。</div>
                </div>
              ) : operation.data ? (
                <div className="text-sm text-muted-foreground">{operation.data.rollback.reason || "目前没有可用的版本回滚点。完成一次更新后会自动创建。"}</div>
              ) : null}
              {operation.data?.operation.phase === "failed" && (
                <div className="text-sm text-destructive">上次{operation.data.operation.action === "rollback" ? "回滚" : "更新"}失败：{operation.data.operation.error || operation.data.operation.message}</div>
              )}
              {operation.data?.rollback.available && (
                <div className="space-y-3 border-t pt-3">
                  {rollbackConfirmation === "rollback" && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      确认回滚到上一版本？当前数据库和回滚后新增的数据都会保留。
                    </div>
                  )}
                  {rollbackConfirmation === "delete" && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      确认永久删除该回滚点？只会删除保存的旧镜像与 Compose 回滚文件，不影响当前版本、数据库或邮件；删除后不能通过页面恢复。
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rollbackConfirmation === "rollback" ? (
                      <Button type="button" variant="destructive" disabled={operationPending} onClick={() => rollback.mutate()}>
                        {rollback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        确认回滚
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" disabled={operationPending} onClick={() => setRollbackConfirmation("rollback")}>
                        <RotateCcw className="h-4 w-4" />回滚上一版本
                      </Button>
                    )}
                    {rollbackConfirmation === "delete" ? (
                      <Button type="button" variant="destructive" disabled={operationPending} onClick={() => deleteRollback.mutate()}>
                        {deleteRollback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        确认删除回滚点
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={operationPending} onClick={() => setRollbackConfirmation("delete")}>
                        <Trash2 className="h-4 w-4" />删除回滚版本
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {serviceOperationPending && (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="flex items-center gap-3 font-medium">
                <Loader2 className="h-5 w-5 animate-spin" />
                {updatePhase === "starting" ? `正在准备${activeAction === "rollback" ? "回滚" : "更新"}` : "正在重启服务"}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">请保持页面打开，服务恢复后会自动刷新。</div>
            </div>
          )}

          {version.data?.updateAvailable && !version.data.updateEnabled && (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              当前部署未启用页面更新，请在服务器执行 <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">sudo imyemail update</code>。
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex w-full gap-2 sm:w-auto">
            {version.data?.releaseUrl && (
              <Button type="button" variant="ghost" asChild>
                <a href={version.data.releaseUrl} target="_blank" rel="noreferrer">
                  更新详情<ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          {version.data?.updateAvailable && version.data.updateEnabled && (
            <Button type="button" className="w-full sm:w-auto" disabled={!isSystemAdmin || operationPending} onClick={() => update.mutate()}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isSystemAdmin ? "立即更新" : "仅超级管理员可更新"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VersionState({ icon, title, description, tone = "neutral" }: { icon: React.ReactNode; title: string; description: string; tone?: "neutral" | "success" | "warning" }) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-md border p-4",
      tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
      tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
    )}>
      <span className="mt-0.5 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm opacity-75">{description}</span>
      </span>
    </div>
  )
}

async function waitForUpdatedService(targetVersion: string) {
  return waitForServiceVersion((currentVersion) => currentVersion === targetVersion, "更新等待超时，请稍后手动刷新页面检查服务状态")
}

async function waitForChangedService(previousVersion: string) {
  return waitForServiceVersion((currentVersion) => Boolean(currentVersion) && currentVersion !== previousVersion, "回滚等待超时，请稍后手动刷新页面检查服务状态")
}

async function waitForServiceVersion(matches: (version?: string) => boolean, timeoutMessage: string) {
  const deadline = Date.now() + 8 * 60_000
  while (Date.now() < deadline) {
    await delay(3000)
    let operationFailure = ""
    try {
      const health = await fetch(`/healthz?update=${Date.now()}`, { cache: "no-store" })
      if (!health.ok) {
        continue
      }
      const response = await fetch(`/api/admin/system/version?update=${Date.now()}`, { credentials: "include", cache: "no-store" })
      if (!response.ok) continue
      const body = await response.json() as { currentVersion?: string }
      if (matches(body.currentVersion)) {
        window.location.reload()
        return
      }
      const operationResponse = await fetch(`/api/admin/system/operation?update=${Date.now()}`, { credentials: "include", cache: "no-store" })
      if (operationResponse.ok) {
        const operation = await operationResponse.json() as { operation?: { phase?: string; error?: string; message?: string } }
        if (operation.operation?.phase === "failed") {
          operationFailure = operation.operation.error || operation.operation.message || "系统操作失败"
        }
      }
    } catch {}
    if (operationFailure) throw new Error(operationFailure)
  }
  throw new Error(timeoutMessage)
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
