import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, BarChart3, Ban, Bell, BellOff, BookOpen, ChevronDown, ChevronUp, Clock3, Code2, Contact, Copy, HardDrive, Image, Info, KeyRound, Link2, LogOut, Mail, MailCheck, MailX, MessageSquare, Moon, PanelLeftOpen, PencilLine, PlayCircle, Plus, RefreshCcw, Search, SendHorizontal, Settings, ShieldCheck, SlidersHorizontal, Sun, Trash2, Users, X } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { api, APIToken, ClientAccessEvent, ExternalImapAccount, ExternalImapAccountPayload, ExternalImapFolder, ExternalImapOAuthProvider, ExternalImapStorageMode, ExternalImapSyncRun, ExternalImapTlsMode, FeedbackTicket, FeedbackTicketStatus, ForwardingSettings, ForwardingVerifiedEmail, MailLabel, MailRule, MailRuleAction, MailRuleCondition, Mailbox, MailboxApplyOptions, MailSignature, MailStats, PermissionLimits, User } from "@/lib/api"
import { cn, formatBytes } from "@/lib/utils"
import { applyTheme, getInitialTheme } from "@/lib/theme"
import { DisplayMode, useDisplayMode } from "@/lib/display-mode"
import { useMe } from "@/hooks/use-me"
import { useLogout } from "@/hooks/use-logout"
import { useIsMobile } from "@/hooks/use-mobile"
import { validatePasswordConfirm } from "@/lib/validation"
import { hasPermission } from "@/lib/permissions"
import { ImageHostingConfig, loadImageHostingConfig, saveImageHostingConfig } from "@/lib/image-hosting"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/hooks/use-toast"
import { LanguageSwitcher } from "@/components/language-switcher"

type Tab = "profile" | "mailboxes" | "contacts" | "cleanup" | "cleanupQueue" | "rules" | "blocked" | "stats" | "feedback" | "apiTokens"
type AccountSettingsTab = "account" | "mail" | "clients" | "security"
type PendingConfirm = { title: string; description?: string; confirmText: string; destructive?: boolean; onConfirm: () => void }
const tabs: Record<Tab, { label: string; icon: React.ReactNode }> = {
  profile: { label: "账号设置", icon: <Settings className="h-4 w-4" /> },
  mailboxes: { label: "邮箱管理", icon: <Mail className="h-4 w-4" /> },
  contacts: { label: "联系人管理", icon: <Contact className="h-4 w-4" /> },
  cleanup: { label: "邮件清理", icon: <Trash2 className="h-4 w-4" /> },
  cleanupQueue: { label: "待清理邮件", icon: <Clock3 className="h-4 w-4" /> },
  rules: { label: "收信规则", icon: <SlidersHorizontal className="h-4 w-4" /> },
  blocked: { label: "被拦截邮件", icon: <Ban className="h-4 w-4" /> },
  stats: { label: "数据统计", icon: <BarChart3 className="h-4 w-4" /> },
  feedback: { label: "反馈", icon: <MessageSquare className="h-4 w-4" /> },
  apiTokens: { label: "开发者", icon: <Code2 className="h-4 w-4" /> },
}
const tabKeys = Object.keys(tabs) as Tab[]
const accountSettingTabs: { key: AccountSettingsTab; label: string }[] = [
  { key: "account", label: "账号" },
  { key: "mail", label: "邮件" },
  { key: "clients", label: "通知与客户端" },
  { key: "security", label: "安全" },
]
const actionLabels: Record<string, string> = { archive: "移入归档", trash: "移入回收站", star: "添加星标", "mark-read": "标记已读", label: "添加标签", move: "移动到", forward: "邮件转发" }
export function ProfilePage() {
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { toast } = useToast()
  const passwordFormRef = React.useRef<HTMLFormElement>(null)
  const twoFactorFormRef = React.useRef<HTMLFormElement>(null)
  const [mailboxId, setMailboxId] = React.useState(() => localStorage.getItem("imyemail:selected-mailbox") || "")
  const [statsRangeDays, setStatsRangeDays] = React.useState(30)
  const [darkMode, setDarkMode] = React.useState(getInitialTheme)
  const [displayMode, setDisplayMode] = useDisplayMode()
  const [blockedMailboxId, setBlockedMailboxId] = React.useState("all")
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
  const [externalRunAccountId, setExternalRunAccountId] = React.useState("")
  const isMobile = useIsMobile()
  const themeMountedRef = React.useRef(false)

  const rawTab = params.get("tab") as Tab | null
  const rawAccountTab = params.get("accountTab") as AccountSettingsTab | null
  const user = me.data?.user
  const canAccessMail = hasPermission(user, "mail.access")
  const canReadMail = hasPermission(user, "mail.messages.read")
  const canOrganizeMail = hasPermission(user, "mail.messages.organize")
  const canManageLabels = hasPermission(user, "mail.labels.manage")
  const canManageContacts = hasPermission(user, "mail.contacts.manage")
  const canManageSignatures = hasPermission(user, "mail.signatures.manage")
  const canManageRules = hasPermission(user, "mail.rules.manage")
  const canManageBlocked = hasPermission(user, "mail.blocked_senders.manage")
  const canViewStats = hasPermission(user, "mail.stats.view")
  const canApplyMailbox = hasPermission(user, "mail.mailboxes.apply")
  const visibleTabKeys = tabKeys.filter((key) => {
    if (key === "profile") return true
    if (key === "mailboxes") return canAccessMail || canApplyMailbox
    if (key === "contacts") return canManageContacts
    if (key === "cleanup") return canOrganizeMail
    if (key === "cleanupQueue") return canOrganizeMail
    if (key === "rules") return canManageRules
    if (key === "blocked") return canManageBlocked
    if (key === "stats") return canViewStats
    if (key === "feedback") return true
    if (key === "apiTokens") return true
    return false
  })
  const tab: Tab = rawTab && visibleTabKeys.includes(rawTab) ? rawTab : "profile"
  const accountTab: AccountSettingsTab = rawAccountTab && accountSettingTabs.some((item) => item.key === rawAccountTab) ? rawAccountTab : "account"
  const mailboxes = useQuery({ queryKey: ["mailboxes", "mine"], queryFn: api.myMailboxes, enabled: canAccessMail })
  const mailboxApplyOptions = useQuery({ queryKey: ["mailbox-apply-options"], queryFn: api.mailboxApplyOptions, enabled: canApplyMailbox })
  const publicSettings = useQuery({ queryKey: ["public-settings"], queryFn: api.publicSettings })
  const apiTokens = useQuery({ queryKey: ["api-tokens"], queryFn: api.apiTokens })
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: api.contacts, enabled: canManageContacts })
  const signatures = useQuery({ queryKey: ["signatures"], queryFn: api.signatures, enabled: canManageSignatures })
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules, enabled: canManageRules })
  const ruleForwarding = useQuery({ queryKey: ["forwarding-settings"], queryFn: api.forwardingSettings, enabled: canManageRules && canAccessMail })
  const ruleVerifiedEmails = React.useMemo(() => ruleForwarding.data?.verifiedEmails.filter((item) => item.verified).map((item) => item.email) || [], [ruleForwarding.data?.verifiedEmails])
  const blocked = useQuery({ queryKey: ["blocked-senders"], queryFn: api.blockedSenders, enabled: canManageBlocked })
  const selectedMailbox = React.useMemo(() => mailboxes.data?.items.find((m) => m.id === mailboxId), [mailboxes.data?.items, mailboxId])
  const activeMailboxId = selectedMailbox?.id || ""
  const clientAccessEvents = useQuery({ queryKey: ["client-access-events", activeMailboxId], queryFn: () => api.clientAccessEvents(activeMailboxId), enabled: accountTab === "clients" && !!activeMailboxId && canAccessMail, refetchInterval: accountTab === "clients" ? 30_000 : false })
  const externalImapEnabled = publicSettings.data?.externalImapEnabled ?? false
  const externalImapAccounts = useQuery({ queryKey: ["external-imap-accounts", activeMailboxId], queryFn: () => api.externalImapAccounts(activeMailboxId), enabled: !!activeMailboxId && canAccessMail && externalImapEnabled })
  React.useEffect(() => {
    if (!externalRunAccountId) return
    if (externalImapAccounts.data?.items.some((item) => item.id === externalRunAccountId)) return
    setExternalRunAccountId("")
  }, [externalImapAccounts.data?.items, externalRunAccountId])
  const selectedExternalRunAccount = externalImapAccounts.data?.items.find((item) => item.id === externalRunAccountId)
  const externalRunFolders = useQuery({ queryKey: ["external-imap-run-folders", externalRunAccountId], queryFn: () => api.externalFolders(externalRunAccountId), enabled: !!externalRunAccountId && !!selectedExternalRunAccount && canAccessMail && externalImapEnabled })
  const externalSyncRuns = useQuery({ queryKey: ["external-imap-sync-runs", externalRunAccountId], queryFn: () => api.externalImapSyncRuns(externalRunAccountId), enabled: !!externalRunAccountId && !!selectedExternalRunAccount && canAccessMail && externalImapEnabled })
  const labels = useQuery({ queryKey: ["labels", activeMailboxId], queryFn: () => api.labels(activeMailboxId), enabled: !!activeMailboxId && (canReadMail || canManageLabels || canManageRules) })
  const stats = useQuery({ queryKey: ["mail-stats", activeMailboxId, statsRangeDays], queryFn: () => api.mailStats(activeMailboxId, statsRangeDays), enabled: !!activeMailboxId && canViewStats })

  const profile = useMutation({
    mutationFn: (form: FormData) => api.updateProfile({ displayName: String(form.get("displayName") || "") }),
    onSuccess: (data) => { qc.setQueryData(["me"], data); toast({ title: "个人资料已保存" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const password = useMutation({
    mutationFn: (form: FormData) => {
      const newPassword = String(form.get("newPassword") || "")
      validatePasswordConfirm(newPassword, String(form.get("confirmPassword") || ""), "两次输入的新密码不一致")
      return api.changePassword({ currentPassword: String(form.get("currentPassword") || ""), newPassword })
    },
    onSuccess: () => { passwordFormRef.current?.reset(); toast({ title: "密码已更新" }) },
    onError: (error) => toast({ title: "修改失败", description: error.message }),
  })
  const deleteClientAccessEvents = useMutation({
    mutationFn: api.deleteClientAccessEvents,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["client-access-events"] })
      toast({ title: `已删除 ${result.deleted} 条连接记录` })
    },
    onError: (error) => toast({ title: "删除失败", description: error.message }),
  })
  const setupTwoFactor = useMutation({
    mutationFn: api.setupTwoFactor,
    onSuccess: () => toast({ title: "双因素密钥已生成" }),
    onError: (error) => toast({ title: "生成失败", description: error.message }),
  })
  const enableTwoFactor = useMutation({
    mutationFn: (form: FormData) => api.enableTwoFactor(String(form.get("code") || "")),
    onSuccess: (data) => { qc.setQueryData(["me"], data); setupTwoFactor.reset(); twoFactorFormRef.current?.reset(); toast({ title: "双因素认证已启用" }) },
    onError: (error) => toast({ title: "启用失败", description: error.message }),
  })
  const disableTwoFactor = useMutation({
    mutationFn: (form: FormData) => api.disableTwoFactor(String(form.get("code") || "")),
    onSuccess: (data) => { qc.setQueryData(["me"], data); twoFactorFormRef.current?.reset(); toast({ title: "双因素认证已关闭" }) },
    onError: (error) => toast({ title: "关闭失败", description: error.message }),
  })
  const createApiToken = useMutation({
    mutationFn: (payload: { name: string; expiresAt?: string; scopes: string[] }) => api.createApiToken(payload),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); toast({ title: "API 密钥已创建" }); return res },
    onError: (error) => toast({ title: "创建失败", description: error.message }),
  })
  const updateApiToken = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name?: string; expiresAt?: string; disabled?: boolean; scopes?: string[] } }) => api.updateApiToken(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); toast({ title: "API 密钥已更新" }) },
    onError: (error) => toast({ title: "更新失败", description: error.message }),
  })
  const deleteApiToken = useMutation({
    mutationFn: api.deleteApiToken,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-tokens"] }); toast({ title: "API 密钥已撤销" }) },
    onError: (error) => toast({ title: "撤销失败", description: error.message }),
  })
  const createContact = useMutation({
    mutationFn: (form: FormData) => api.createContact({ name: String(form.get("name") || ""), email: String(form.get("email") || ""), note: String(form.get("note") || "") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast({ title: "联系人已保存" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const deleteContact = useMutation({ mutationFn: api.deleteContact, onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast({ title: "联系人已删除" }) } })
  const createSignature = useMutation({
    mutationFn: (form: FormData) => api.createSignature({ mailboxId: String(form.get("mailboxId") || ""), name: String(form.get("name") || ""), content: String(form.get("content") || ""), isDefault: form.get("isDefault") === "on" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signatures"] }); qc.invalidateQueries({ queryKey: ["signature"] }); toast({ title: "签名已保存" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const updateSignature = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FormData }) => api.updateSignature(id, { mailboxId: String(form.get("mailboxId") || ""), name: String(form.get("name") || ""), content: String(form.get("content") || ""), isDefault: form.get("isDefault") === "on" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signatures"] }); qc.invalidateQueries({ queryKey: ["signature"] }); toast({ title: "签名已更新" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const setDefaultSignature = useMutation({
    mutationFn: api.setDefaultSignature,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["signatures"] }); qc.invalidateQueries({ queryKey: ["signature"] }); toast({ title: "默认签名已更新" }) },
    onError: (error) => toast({ title: "设置失败", description: error.message }),
  })
  const deleteSignature = useMutation({ mutationFn: api.deleteSignature, onSuccess: () => { qc.invalidateQueries({ queryKey: ["signatures"] }); qc.invalidateQueries({ queryKey: ["signature"] }); toast({ title: "签名已删除" }) } })
  const createRule = useMutation({
    mutationFn: (payload: {
      mailboxId: string
      name: string
      matchMode: "all" | "any"
      conditions: MailRuleCondition[]
      actions: MailRuleAction[]
      applyToExisting: boolean
      stopProcessing: boolean
      enabled: boolean
    }) => api.createRule(payload),
    onSuccess: (rule) => {
      qc.invalidateQueries({ queryKey: ["rules"] })
      qc.invalidateQueries({ queryKey: ["messages"] })
      qc.invalidateQueries({ queryKey: ["mail-stats"] })
      qc.invalidateQueries({ queryKey: ["labels"] })
      setRuleDialogOpen(false)
      toast({ title: rule.appliedExistingCount ? `收件规则已保存，已应用 ${rule.appliedExistingCount} 封邮件` : "收件规则已保存" })
    },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const deleteRule = useMutation({ mutationFn: api.deleteRule, onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); toast({ title: "规则已删除" }) } })
  const updateRule = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<RuleCreatePayload> }) => api.updateRule(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); setRuleDialogOpen(false); toast({ title: "收件规则已更新" }) },
    onError: (error) => toast({ title: "更新失败", description: error.message }),
  })
  const moveRule = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => api.moveRule(id, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
    onError: (error) => toast({ title: "排序失败", description: error.message }),
  })
  const applyRule = useMutation({
    mutationFn: api.applyRule,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["messages"] })
      qc.invalidateQueries({ queryKey: ["folders"] })
      qc.invalidateQueries({ queryKey: ["mail-stats"] })
      qc.invalidateQueries({ queryKey: ["labels"] })
      toast({ title: `规则已应用到 ${res.affected} 封现有邮件` })
    },
    onError: (error) => toast({ title: "应用失败", description: error.message }),
  })
  const createBlocked = useMutation({
    mutationFn: (form: FormData) => api.createBlockedSender({ mailboxId: blockedMailboxId === "all" ? "" : blockedMailboxId, email: String(form.get("email") || ""), reason: String(form.get("reason") || "") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["blocked-senders"] }); toast({ title: "拦截规则已保存" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const deleteBlocked = useMutation({ mutationFn: api.deleteBlockedSender, onSuccess: () => { qc.invalidateQueries({ queryKey: ["blocked-senders"] }); toast({ title: "拦截规则已删除" }) } })
  const createLabel = useMutation({
    mutationFn: (form: FormData) => api.createLabel({ mailboxId: activeMailboxId, name: String(form.get("name") || ""), color: String(form.get("color") || "") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["labels"] }); toast({ title: "标签已创建" }) },
    onError: (error) => toast({ title: "创建失败", description: error.message }),
  })
  const deleteLabel = useMutation({
    mutationFn: (id: string) => api.deleteLabel(id, activeMailboxId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["labels"] }); toast({ title: "标签已删除" }) },
    onError: (error) => toast({ title: "删除失败", description: error.message }),
  })
  const cleanup = useMutation({
    mutationFn: (target: "empty-trash" | "empty-spam" | "archive-read-inbox") => api.cleanupMail({ mailboxId, target }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["mail-stats"] }); qc.invalidateQueries({ queryKey: ["folders"] }); qc.invalidateQueries({ queryKey: ["messages"] }); toast({ title: `已处理 ${res.affected} 封邮件` }) },
    onError: (error) => toast({ title: "清理失败", description: error.message }),
  })
  const applyMailbox = useMutation({
    mutationFn: api.applyMailbox,
    onSuccess: (mailbox) => {
      qc.invalidateQueries({ queryKey: ["mailboxes", "mine"] })
      qc.invalidateQueries({ queryKey: ["mailbox-apply-options"] })
      setMailboxId(mailbox.id)
      toast({ title: "邮箱已申请" })
    },
    onError: (error) => toast({ title: "申请失败", description: error.message }),
  })
  const createExternalImap = useMutation({
    mutationFn: api.createExternalImapAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["external-imap-accounts"] }); qc.invalidateQueries({ queryKey: ["mail-external-accounts"] }); toast({ title: "外部 IMAP 已保存" }) },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const updateExternalImap = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ExternalImapAccountPayload }) => api.updateExternalImapAccount(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["external-imap-accounts"] }); qc.invalidateQueries({ queryKey: ["mail-external-accounts"] }); toast({ title: "外部 IMAP 已更新" }) },
    onError: (error) => toast({ title: "更新失败", description: error.message }),
  })
  const deleteExternalImap = useMutation({
    mutationFn: api.deleteExternalImapAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["external-imap-accounts"] }); qc.invalidateQueries({ queryKey: ["mail-external-accounts"] }); toast({ title: "外部 IMAP 已删除" }) },
    onError: (error) => toast({ title: "删除失败", description: error.message }),
  })
  const testExternalImap = useMutation({
    mutationFn: api.testExternalImapAccount,
    onSuccess: (res) => toast({ title: `连接成功，发现 ${res.folders} 个文件夹` }),
    onError: (error) => toast({ title: "连接失败", description: error.message }),
  })
  const syncExternalImap = useMutation({
    mutationFn: api.syncExternalImapAccount,
    onSuccess: (run) => { qc.invalidateQueries({ queryKey: ["external-imap-accounts"] }); qc.invalidateQueries({ queryKey: ["external-imap-sync-runs"] }); qc.invalidateQueries({ queryKey: ["folders"] }); qc.invalidateQueries({ queryKey: ["messages"] }); toast({ title: `同步完成：导入 ${run.imported}，跳过 ${run.skipped}` }) },
    onError: (error) => toast({ title: "同步失败", description: error.message }),
  })
  const syncExternalImapFolder = useMutation({
    mutationFn: ({ id, folder }: { id: string; folder: string }) => api.syncExternalImapFolder(id, folder),
    onSuccess: (run) => { qc.invalidateQueries({ queryKey: ["external-imap-accounts"] }); qc.invalidateQueries({ queryKey: ["external-imap-sync-runs"] }); qc.invalidateQueries({ queryKey: ["folders"] }); qc.invalidateQueries({ queryKey: ["messages"] }); toast({ title: `${run.folder || "文件夹"} 同步完成：导入 ${run.imported}，跳过 ${run.skipped}` }) },
    onError: (error) => toast({ title: "同步失败", description: error.message }),
  })
  const startExternalOAuth = useMutation({
    mutationFn: ({ provider, mailboxId, email, storageMode }: { provider: ExternalImapOAuthProvider; mailboxId: string; email: string; storageMode: ExternalImapStorageMode }) => api.startExternalImapOAuth(provider, { mailboxId, email, storageMode, syncReadState: true, enabled: true }),
    onSuccess: (res) => { window.location.href = res.url },
    onError: (error) => toast({ title: "授权失败", description: error.message }),
  })

  React.useEffect(() => {
    if (!mailboxes.isSuccess) return
    const items = mailboxes.data?.items || []
    if (items.length === 0) {
      if (mailboxId) setMailboxId("")
      localStorage.removeItem("imyemail:selected-mailbox")
      return
    }
    if (!mailboxId || !items.some((m) => m.id === mailboxId)) setMailboxId(items[0].id)
  }, [mailboxId, mailboxes.isSuccess, mailboxes.data?.items])
  React.useEffect(() => { if (mailboxId) localStorage.setItem("imyemail:selected-mailbox", mailboxId); else localStorage.removeItem("imyemail:selected-mailbox") }, [mailboxId])
  React.useEffect(() => { applyTheme(darkMode, themeMountedRef.current); themeMountedRef.current = true }, [darkMode])

  const logout = useLogout()
  async function copy(text: string) { await navigator.clipboard.writeText(text); toast({ title: "已复制" }) }
  function setTab(next: Tab) {
    const visibleNext = visibleTabKeys.includes(next) ? next : "profile"
    const nextParams = new URLSearchParams(params)
    if (visibleNext === "profile") nextParams.delete("tab")
    else {
      nextParams.set("tab", visibleNext)
      nextParams.delete("accountTab")
    }
    setParams(nextParams)
    setMobileSidebarOpen(false)
  }
  function setAccountTab(next: AccountSettingsTab) {
    const nextParams = new URLSearchParams(params)
    nextParams.delete("tab")
    if (next === "account") nextParams.delete("accountTab")
    else nextParams.set("accountTab", next)
    setParams(nextParams)
  }
  if (me.isLoading) return <div className="grid h-svh place-items-center text-muted-foreground">加载中...</div>
  if (me.isError || !user) return <div className="grid h-svh place-items-center text-muted-foreground">登录状态已失效</div>

  const sidebarContent = (
    <div className="flex h-full w-[256px] shrink-0 flex-col border-r border-border bg-card">
      <div className="h-[64px] border-b">
        <AccountHeader name={user.displayName || selectedMailbox?.address || "imyemail"} email={user.loginName || user.email || selectedMailbox?.address} darkMode={darkMode} onToggleTheme={() => setDarkMode((v) => !v)} onBack={() => navigate("/")} />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="px-2 pb-2 pt-2 text-xs font-semibold text-muted-foreground">管理</div>
        <div className="space-y-1">
          {visibleTabKeys.map((key) => (
            <button
              key={key}
              type="button"
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors",
                tab === key ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
              onClick={() => setTab(key)}
            >
              <span className={cn("text-muted-foreground [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-[1.8]", tab === key && "text-foreground/70")}>{tabs[key].icon}</span>
              <span className="truncate">{tabs[key].label}</span>
            </button>
          ))}
        </div>
      </nav>
      <div className="border-t p-2">
        {user.role === "admin" && <Button type="button" variant="outline" size="sm" className="mb-1 h-9 w-full justify-start gap-2 px-3" onClick={() => navigate("/admin")}><ShieldCheck className="h-4 w-4" /><span>管理后台</span></Button>}
        <Button type="button" variant="ghost" size="sm" className="h-9 w-full justify-start gap-2 px-3 text-destructive hover:text-destructive" onClick={logout}>
          <LogOut className="h-4 w-4" />
          <span>退出登录</span>
        </Button>
      </div>
    </div>
  )

  const pageTitle = tab === "feedback" ? "反馈与工单" : tabs[tab].label
  const pageSubtitle = tab === "stats" ? "查看邮件收发趋势、分布情况和常用联系人。" : undefined
  const pageAction = tab === "stats"
    ? <StatsRangeTabs rangeDays={statsRangeDays} onRangeChange={setStatsRangeDays} />
    : tab === "apiTokens"
      ? <Button asChild variant="outline" size="sm" className="h-8 px-3 text-xs"><a href="https://github.com/logdns/imyemail/blob/main/docs/API.md" target="_blank" rel="noreferrer"><BookOpen className="h-4 w-4" />API 文档</a></Button>
      : undefined

  return (
    <div className="app-page app-page-profile h-svh overflow-hidden bg-background">
      {isMobile ? (
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="打开导航"><PanelLeftOpen className="h-4 w-4" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-80 p-0 [&>button]:hidden" aria-describedby={undefined}>
                <SheetTitle className="sr-only">管理导航</SheetTitle>
                <div className="h-svh">{sidebarContent}</div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1 text-sm font-semibold">{pageTitle}</div>
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="返回邮箱"><ArrowLeft className="h-4 w-4" /></Button>
          </header>
          <ScrollArea className="min-h-0 flex-1">
            <main className="w-full pb-10">
              <SettingsPageHeader title={pageTitle} subtitle={pageSubtitle} action={pageAction} activeTab={tab === "profile" ? accountTab : undefined} onAccountTabChange={setAccountTab} />
              <div className={contentFrameClass(tab)}>{renderTab()}</div>
            </main>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full">
          {sidebarContent}
          <section className="min-w-0 flex-1 overflow-y-auto">
            <main className="pb-12">
              <SettingsPageHeader title={pageTitle} subtitle={pageSubtitle} action={pageAction} activeTab={tab === "profile" ? accountTab : undefined} onAccountTabChange={setAccountTab} />
              <div className={contentFrameClass(tab)}>{renderTab()}</div>
            </main>
          </section>
        </div>
      )}
    </div>
  )
  function renderTab() {
    if (tab === "profile") return (
      <AccountSettingsSection
        activeTab={accountTab}
        user={user!}
        profile={profile}
        password={password}
        passwordFormRef={passwordFormRef}
        stats={canViewStats ? stats.data : undefined}
        showStats={canViewStats}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        twoFactorFormRef={twoFactorFormRef}
        setupTwoFactor={setupTwoFactor}
        enableTwoFactor={enableTwoFactor}
        disableTwoFactor={disableTwoFactor}
        onCopy={copy}
        mailboxes={mailboxes.data?.items || []}
        selectedMailboxId={mailboxId}
        selectedMailbox={selectedMailbox}
        labels={labels.data?.items || []}
        labelsLoading={labels.isLoading}
        labelsPending={createLabel.isPending || deleteLabel.isPending}
        onCreateLabel={(form) => createLabel.mutate(form)}
        onDeleteLabel={(id) => deleteLabel.mutate(id)}
        signatures={signatures.data?.items || []}
        signaturesLoading={signatures.isLoading}
        signaturesPending={createSignature.isPending || updateSignature.isPending || setDefaultSignature.isPending || deleteSignature.isPending}
        onCreateSignature={(form) => createSignature.mutate(form)}
        onUpdateSignature={(id, form) => updateSignature.mutate({ id, form })}
        onSetDefaultSignature={(id) => setDefaultSignature.mutate(id)}
        onDeleteSignature={(id) => deleteSignature.mutate(id)}
        clientHostname={publicSettings.data?.publicHostname}
        clientAccessEvents={clientAccessEvents.data?.items || []}
        clientAccessEventsLoading={clientAccessEvents.isLoading}
        clientAccessEventsDeleting={deleteClientAccessEvents.isPending}
        onRefreshClientAccessEvents={() => clientAccessEvents.refetch()}
        onDeleteClientAccessEvents={(ids) => deleteClientAccessEvents.mutateAsync(ids)}
        onSelectMailbox={setMailboxId}
        onOpenCleanup={() => setTab("cleanup")}
      />
    )
    if (tab === "mailboxes") return (
      <MailboxManagement
        mailboxes={canAccessMail ? mailboxes.data?.items || [] : []}
        applyOptions={mailboxApplyOptions.data}
        applyPending={applyMailbox.isPending}
        selectedMailboxId={mailboxId}
        externalImapEnabled={externalImapEnabled}
        externalAccounts={externalImapAccounts.data?.items || []}
        externalPending={createExternalImap.isPending || updateExternalImap.isPending || deleteExternalImap.isPending || testExternalImap.isPending || syncExternalImap.isPending || syncExternalImapFolder.isPending || startExternalOAuth.isPending}
        selectedExternalRunAccountId={externalRunAccountId}
        externalRunFolders={externalRunFolders.data?.items || []}
        externalSyncRuns={externalSyncRuns.data?.items || []}
        onSelectExternalRunAccount={setExternalRunAccountId}
        onSelect={setMailboxId}
        onCopy={copy}
        onOpen={(id) => { if (!canAccessMail) return; setMailboxId(id); navigate("/") }}
        onApply={(payload) => applyMailbox.mutateAsync(payload).then(() => undefined)}
        onCreateExternal={(payload) => createExternalImap.mutate(payload)}
        onStartExternalOAuth={(provider, payload) => startExternalOAuth.mutate({ provider, ...payload })}
        onUpdateExternal={(id, payload) => updateExternalImap.mutate({ id, payload })}
        onDeleteExternal={(id) => deleteExternalImap.mutate(id)}
        onTestExternal={(id) => testExternalImap.mutate(id)}
        onSyncExternal={(id) => syncExternalImap.mutate(id)}
        onSyncExternalFolder={(id, folder) => syncExternalImapFolder.mutate({ id, folder })}
      />
    )
    if (tab === "contacts") return <ContactsSection items={contacts.data?.items || []} loading={contacts.isLoading} pending={createContact.isPending} onCreate={(form) => createContact.mutate(form)} onDelete={(id) => deleteContact.mutate(id)} onCopy={copy} />
    if (tab === "cleanup") return <CleanupSection mailbox={selectedMailbox} stats={canViewStats ? stats.data : undefined} showStats={canViewStats} pending={cleanup.isPending} onCleanup={(target) => cleanup.mutate(target)} />
    if (tab === "cleanupQueue") return <CleanupQueueSection mailbox={selectedMailbox} stats={canViewStats ? stats.data : undefined} />
    if (tab === "rules") return <RulesSection items={rules.data?.items || []} mailboxes={mailboxes.data?.items || []} labels={labels.data?.items || []} verifiedEmails={ruleVerifiedEmails} open={ruleDialogOpen} onOpenChange={setRuleDialogOpen} onCreate={(payload) => createRule.mutate(payload)} onUpdate={(id, payload) => updateRule.mutate({ id, payload })} onToggle={(item) => updateRule.mutate({ id: item.id, payload: { enabled: !item.enabled } })} onMove={(id, direction) => moveRule.mutate({ id, direction })} onApply={(id) => applyRule.mutate(id)} onDelete={(id) => deleteRule.mutate(id)} pending={createRule.isPending || updateRule.isPending || moveRule.isPending || applyRule.isPending} />
    if (tab === "blocked") return <BlockedSection items={blocked.data?.items || []} mailboxes={mailboxes.data?.items || []} mailboxId={blockedMailboxId} spamCount={canViewStats ? stats.data?.byFolder.find((f) => f.role === "spam")?.count || 0 : 0} onMailboxChange={setBlockedMailboxId} onCreate={(form) => createBlocked.mutate(form)} onDelete={(id) => deleteBlocked.mutate(id)} pending={createBlocked.isPending} />
    if (tab === "stats") return <StatsSection stats={stats.data} mailbox={selectedMailbox} rangeDays={statsRangeDays} onRangeChange={setStatsRangeDays} onRefresh={() => stats.refetch()} />
    if (tab === "feedback") return <FeedbackSection />
    if (tab === "apiTokens") return <ApiTokensSection items={apiTokens.data?.items || []} loading={apiTokens.isLoading} pending={createApiToken.isPending || updateApiToken.isPending || deleteApiToken.isPending} onCreate={(payload) => createApiToken.mutateAsync(payload)} onUpdate={(id, payload) => updateApiToken.mutate({ id, payload })} onDelete={(id) => deleteApiToken.mutate(id)} onCopy={copy} />
    return null
  }
}

function contentFrameClass(tab: Tab) {
  return cn(
    "w-full",
    tab === "mailboxes" ? "pt-[34px]" : "pt-6",
    tab === "profile" || tab === "mailboxes" ? "mx-auto max-w-[896px]" :
      tab === "stats" ? "px-4 sm:px-6" :
      tab === "rules" || tab === "apiTokens" ? "mx-auto max-w-[896px] px-4 sm:px-0" :
      "mx-auto max-w-[1024px] px-4 sm:px-0",
  )
}

function SettingsPageHeader({ title, subtitle, action, activeTab, onAccountTabChange }: { title: string; subtitle?: string; action?: React.ReactNode; activeTab?: AccountSettingsTab; onAccountTabChange: (tab: AccountSettingsTab) => void }) {
  return (
    <div className="border-b px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold leading-7">{title}</h1>
          {subtitle && <p className="text-sm leading-5 text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {activeTab && (
        <div className="mt-3 flex overflow-x-auto border-b">
          {accountSettingTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "h-[38px] shrink-0 border-b-2 px-4 text-sm font-medium transition-colors",
                activeTab === item.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onAccountTabChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatsRangeTabs({ rangeDays, onRangeChange }: { rangeDays: number; onRangeChange: (days: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 sm:flex">
      {[
        [7, "7天"],
        [30, "30天"],
        [90, "90天"],
        [365, "365天"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={cn("h-[30px] rounded-md border px-3 text-xs font-normal transition-colors", rangeDays === value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted")}
          onClick={() => onRangeChange(Number(value))}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

type AccountSettingsSectionProps = {
  activeTab: AccountSettingsTab
  user: { id: string; loginName?: string; email: string; displayName: string; role: string; disabled: boolean; twoFactorEnabled: boolean; createdAt: string; limits?: PermissionLimits }
  profile: { mutate: (form: FormData) => void; isPending: boolean }
  password: { mutate: (form: FormData) => void; isPending: boolean }
  passwordFormRef: React.RefObject<HTMLFormElement>
  stats?: MailStats
  showStats: boolean
  displayMode: DisplayMode
  onDisplayModeChange: (mode: DisplayMode) => void
  twoFactorFormRef: React.RefObject<HTMLFormElement>
  setupTwoFactor: { data?: { secret: string; otpauthUrl: string; serverTime: string }; mutate: () => void; reset: () => void; isPending: boolean }
  enableTwoFactor: { data?: { user: User; recoveryCodes: string[] }; mutate: (form: FormData) => void; isPending: boolean }
  disableTwoFactor: { mutate: (form: FormData) => void; isPending: boolean }
  onCopy: (text: string) => void
  mailboxes: Mailbox[]
  selectedMailboxId: string
  selectedMailbox?: Mailbox
  labels: MailLabel[]
  labelsLoading: boolean
  labelsPending: boolean
  onCreateLabel: (form: FormData) => void
  onDeleteLabel: (id: string) => void
  signatures: MailSignature[]
  signaturesLoading: boolean
  signaturesPending: boolean
  onCreateSignature: (form: FormData) => void
  onUpdateSignature: (id: string, form: FormData) => void
  onSetDefaultSignature: (id: string) => void
  onDeleteSignature: (id: string) => void
  clientHostname?: string
  clientAccessEvents: ClientAccessEvent[]
  clientAccessEventsLoading: boolean
  clientAccessEventsDeleting: boolean
  onRefreshClientAccessEvents: () => void
  onDeleteClientAccessEvents: (ids: string[]) => Promise<unknown>
  onSelectMailbox: (id: string) => void
  onOpenCleanup: () => void
}

function AccountSettingsSection(props: AccountSettingsSectionProps) {
  if (props.activeTab === "mail") {
    return (
      <MailPreferencesSection
        labels={props.labels}
        labelsLoading={props.labelsLoading}
        labelsPending={props.labelsPending}
        onCreateLabel={props.onCreateLabel}
        onDeleteLabel={props.onDeleteLabel}
        selectedMailbox={props.selectedMailbox}
        signatures={props.signatures}
        signaturesLoading={props.signaturesLoading}
        signaturesPending={props.signaturesPending}
        mailboxes={props.mailboxes}
        onCreateSignature={props.onCreateSignature}
        onUpdateSignature={props.onUpdateSignature}
        onSetDefaultSignature={props.onSetDefaultSignature}
        onDeleteSignature={props.onDeleteSignature}
      />
    )
  }
  if (props.activeTab === "clients") {
    return <ClientSettingsSection mailboxes={props.mailboxes} selectedMailboxId={props.selectedMailboxId} hostname={props.clientHostname} twoFactorEnabled={props.user.twoFactorEnabled} accessEvents={props.clientAccessEvents} accessEventsLoading={props.clientAccessEventsLoading} accessEventsDeleting={props.clientAccessEventsDeleting} onRefreshAccessEvents={props.onRefreshClientAccessEvents} onDeleteAccessEvents={props.onDeleteClientAccessEvents} onSelectMailbox={props.onSelectMailbox} onCopy={props.onCopy} />
  }
  if (props.activeTab === "security") {
    return (
      <SecuritySettingsSection
        user={props.user}
        password={props.password}
        passwordFormRef={props.passwordFormRef}
        twoFactorFormRef={props.twoFactorFormRef}
        setupTwoFactor={props.setupTwoFactor}
        enableTwoFactor={props.enableTwoFactor}
        disableTwoFactor={props.disableTwoFactor}
        onCopy={props.onCopy}
        mailboxes={props.mailboxes}
      />
    )
  }
  return (
    <AccountTabSection
      user={props.user}
      profile={props.profile}
      stats={props.stats}
      showStats={props.showStats}
      displayMode={props.displayMode}
      onDisplayModeChange={props.onDisplayModeChange}
      selectedMailbox={props.selectedMailbox}
      mailboxes={props.mailboxes}
      onOpenCleanup={props.onOpenCleanup}
    />
  )
}

function SettingsCard({ title, subtitle, action, children, className, contentClassName }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; contentClassName?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="w-full shrink-0 sm:w-auto sm:justify-end [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">{action}</div>}
      </div>
      <div className={cn("px-6 pb-5", contentClassName)}>{children}</div>
    </section>
  )
}

function AccountTabSection({ user, stats, selectedMailbox, mailboxes, onOpenCleanup }: { user: AccountSettingsSectionProps["user"]; profile: AccountSettingsSectionProps["profile"]; stats?: MailStats; showStats: boolean; displayMode: DisplayMode; onDisplayModeChange: (mode: DisplayMode) => void; selectedMailbox?: Mailbox; mailboxes: Mailbox[]; onOpenCleanup: () => void }) {
  const version = useQuery({ queryKey: ["system-version"], queryFn: api.version, staleTime: 5 * 60_000 })
  const currentVersion = version.data?.currentVersion || "读取中..."
  const latestVersion = version.data?.latestVersion || currentVersion
  const releaseSummary = (version.data?.releaseNotes || "暂无版本说明").trim().slice(0, 300)
  const accountName = user.loginName || user.email
  const quotaBytes = stats?.quotaBytes || (selectedMailbox?.quotaMb ? selectedMailbox.quotaMb * 1024 * 1024 : 0)
  const storageBytes = stats?.storageBytes || 0
  const quotaPct = quotaBytes > 0 ? Math.min(100, Math.round((storageBytes / quotaBytes) * 100)) : 0
  return (
    <div className="space-y-6">
      <SettingsCard title="账号信息">
        <div className="space-y-5">
          <InfoLine label="用户名" value={accountName} />
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <Label className="text-base font-normal text-muted-foreground">时区</Label>
            <Select defaultValue="Asia/Shanghai">
              <SelectTrigger className="h-[29px] sm:ml-auto sm:w-[236px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
                <SelectItem value="Asia/Singapore">Asia/Singapore (UTC+8)</SelectItem>
                <SelectItem value="UTC">UTC (UTC+0)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="存储容量" action={<Button type="button" variant="outline" size="sm" onClick={onOpenCleanup}>邮件清理</Button>}>
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>{quotaBytes > 0 ? `${formatBytes(storageBytes)} / ${formatBytes(quotaBytes)}` : formatBytes(storageBytes)}</span>
          <span>{quotaBytes > 0 ? `${quotaPct}%` : "不限"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${quotaBytes > 0 ? quotaPct : 12}%` }} />
        </div>
      </SettingsCard>

      <SettingsCard title="账号配额" action={<span className="pt-1 text-sm text-muted-foreground">实时按当前账号配置计算</span>}>
        <div className="grid gap-3 md:grid-cols-2">
          <QuotaBox title="邮箱创建" lines={[`当前拥有 ${mailboxes.length} 个邮箱`, user.limits?.maxMailboxCount ? `最多可添加 ${user.limits.maxMailboxCount} 个邮箱` : "管理员不限制邮箱数量", user.limits?.maxMailboxCount ? "达到上限后不可继续自助申请" : "可继续添加邮箱"]} highlight={user.limits?.maxMailboxCount ? "普通额度" : "管理员无限"} />
          <QuotaBox title="验证邮箱" lines={["已绑定主账号邮箱", "可继续添加验证邮箱"]} />
          <QuotaBox title="发信频率" lines={[`每 24 小时 最多 ${user.limits?.smtpDailyLimit || "不限"} 封邮件`, `每分钟最多 ${user.limits?.smtpMinuteLimit || "不限"} 封`]} />
          <QuotaBox title="协议访问频率" lines={[`IMAP：每 1 分钟 最多 ${user.limits?.imapMinuteLimit || "不限"} 次命令`, `POP3：每 1 分钟 最多 ${user.limits?.pop3MinuteLimit || "不限"} 次命令`]} />
          <QuotaBox className="md:col-span-2" title="附件与应用密码" lines={[`单个附件上限 ${user.limits?.maxAttachmentMb || "不限"} MB`, user.twoFactorEnabled ? "已启用 2FA：客户端必须使用应用密码" : "未启用 2FA：客户端使用邮箱密码"]} />
        </div>
      </SettingsCard>

      <SettingsCard title="版本更新" subtitle="显示当前部署版本与 GitHub 最新正式版本。">
        <div className="rounded-md border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>当前 {currentVersion}</span>
            <span className="text-muted-foreground">·</span>
            <span>最新 {latestVersion}</span>
            {version.data?.updateAvailable && <Badge variant="secondary">可更新</Badge>}
            {!version.data?.updateAvailable && version.data?.latestVersion && <Badge variant="outline">已是最新</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{version.isError || version.data?.checkError ? "暂时无法连接版本服务，当前版本信息仍可正常使用。" : releaseSummary}</p>
          {version.data?.releaseUrl && <a className="mt-2 inline-block text-sm font-medium text-primary hover:underline" href={version.data.releaseUrl} target="_blank" rel="noreferrer">查看发布说明</a>}
        </div>
      </SettingsCard>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
      <div className="text-base text-muted-foreground">{label}</div>
      <div className="min-w-0 truncate text-base font-semibold sm:text-right">{value}</div>
    </div>
  )
}

function QuotaBox({ title, lines, highlight, className }: { title: string; lines: string[]; highlight?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <div className="mb-3 flex items-center gap-2">
        <div className="text-base font-semibold">{title}</div>
        {highlight && <Badge variant="secondary" className="text-[10px]">{highlight}</Badge>}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {lines.map((line) => <div key={line}>{line}</div>)}
      </div>
    </div>
  )
}

function MailPreferencesSection({
  labels,
  labelsLoading,
  labelsPending,
  onCreateLabel,
  onDeleteLabel,
  selectedMailbox,
  signatures,
  signaturesLoading,
  signaturesPending,
  mailboxes,
  onCreateSignature,
  onUpdateSignature,
  onSetDefaultSignature,
  onDeleteSignature,
}: {
  labels: MailLabel[]
  labelsLoading: boolean
  labelsPending: boolean
  onCreateLabel: (form: FormData) => void
  onDeleteLabel: (id: string) => void
  selectedMailbox?: Mailbox
  signatures: MailSignature[]
  signaturesLoading: boolean
  signaturesPending: boolean
  mailboxes: Mailbox[]
  onCreateSignature: (form: FormData) => void
  onUpdateSignature: (id: string, form: FormData) => void
  onSetDefaultSignature: (id: string) => void
  onDeleteSignature: (id: string) => void
}) {
  const { toast } = useToast()
  const [labelColor, setLabelColor] = React.useState("#3b82f6")
  const [signatureMailboxId, setSignatureMailboxId] = React.useState("all")
  const [signatureDefault, setSignatureDefault] = React.useState(false)
  const [editingSignature, setEditingSignature] = React.useState<MailSignature | null>(null)
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  const [whitelist, setWhitelist] = React.useState<string[]>(() => readLocalStringList("imyemail:mail-whitelist"))
  const [imageHosting, setImageHosting] = React.useState<ImageHostingConfig>(loadImageHostingConfig)
  const [autoReplyEnabled, setAutoReplyEnabled] = React.useState(() => readLocalString("imyemail:auto-reply-enabled") === "1")
  const [autoReplyText, setAutoReplyText] = React.useState(() => readLocalString("imyemail:auto-reply-text"))

  React.useEffect(() => { writeLocalStringList("imyemail:mail-whitelist", whitelist) }, [whitelist])
  React.useEffect(() => { writeLocalString("imyemail:auto-reply-enabled", autoReplyEnabled ? "1" : "0") }, [autoReplyEnabled])
  React.useEffect(() => { writeLocalString("imyemail:auto-reply-text", autoReplyText) }, [autoReplyText])

  function submitLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMailbox) return
    const form = new FormData(event.currentTarget)
    form.set("color", labelColor)
    onCreateLabel(form)
    event.currentTarget.reset()
    setLabelColor("#3b82f6")
  }

  function submitWhitelist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = String(form.get("whitelist") || "").trim()
    if (!value || whitelist.includes(value)) return
    setWhitelist((items) => [value, ...items])
    event.currentTarget.reset()
  }

  function submitSignature(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    form.set("mailboxId", signatureMailboxId === "all" ? "" : signatureMailboxId)
    form.set("isDefault", signatureDefault ? "on" : "")
    onCreateSignature(form)
    event.currentTarget.reset()
    setSignatureMailboxId("all")
    setSignatureDefault(false)
  }

  return (
    <div className="space-y-6">
      <SettingsCard title="标签管理">
        <form className="flex gap-2" onSubmit={submitLabel}>
          <Input name="name" className="h-[42px] flex-1 text-base" placeholder={selectedMailbox ? "标签名称" : "请先选择邮箱"} disabled={!selectedMailbox || labelsPending} required />
          <Input type="color" value={labelColor} onChange={(event) => setLabelColor(event.target.value)} className="h-10 w-12 cursor-pointer bg-background p-1" aria-label="标签颜色" />
          <Button className="h-10 px-4" disabled={!selectedMailbox || labelsPending}>{labelsPending ? "创建中" : "创建"}</Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {labels.map((label) => (
            <span key={label.id} className="inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm">
              <span className="size-3 rounded-full" style={{ backgroundColor: label.color || "#64748b" }} />
              {label.name}
              <Button type="button" variant="ghost" size="icon" className="h-5 w-5 p-0 text-muted-foreground shadow-none hover:text-destructive" disabled={labelsPending} onClick={() => onDeleteLabel(label.id)} aria-label={`删除标签 ${label.name}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </span>
          ))}
          {!labelsLoading && labels.length === 0 && <span className="text-sm text-muted-foreground">暂无标签</span>}
        </div>
      </SettingsCard>

      <SettingsCard title="白名单管理" subtitle="白名单内发件人的邮件将跳过垃圾邮件检测，直接进入收件箱。">
        <form className="flex gap-2" onSubmit={submitWhitelist}>
          <Input name="whitelist" className="h-[42px] flex-1 text-base" placeholder="发件人邮箱或域名（如 @example.com）" />
          <Button className="h-10 px-4">添加</Button>
        </form>
        <div className="mt-5 space-y-2">
          {whitelist.map((item) => (
            <div key={item} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{item}</span>
              <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => setWhitelist((items) => items.filter((value) => value !== item))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {whitelist.length === 0 && <div className="py-5 text-center text-sm text-muted-foreground">暂无白名单</div>}
        </div>
      </SettingsCard>

      <SettingsCard title="签名管理" subtitle="支持全局签名和按发件邮箱绑定的默认签名。" action={<span className="pt-1 text-sm text-muted-foreground">共 {signatures.length} 个签名</span>}>
        <form className="rounded-lg border p-4" onSubmit={submitSignature}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="签名名称"><Input name="name" className="h-10" required placeholder="例如：默认签名" /></Field>
            <Field label="绑定邮箱"><MailboxSelect value={signatureMailboxId} mailboxes={mailboxes} onChange={setSignatureMailboxId} /></Field>
          </div>
          <Field label="签名内容">
            <Textarea name="content" required className="min-h-[138px] text-base" placeholder="支持多行文本，写信时会自动转换为 HTML" />
          </Field>
          <label className="mb-4 mt-4 flex items-center gap-2 text-sm">
            <Checkbox checked={signatureDefault} onCheckedChange={(checked) => setSignatureDefault(checked === true)} />
            设为默认签名
          </label>
          <Button disabled={signaturesPending}>{signaturesPending ? "保存中..." : "创建签名"}</Button>
        </form>
        <div className="mt-4 space-y-3">
          {signatures.map((item) => {
            const mailbox = item.mailboxId ? mailboxes.find((m) => m.id === item.mailboxId)?.address || "未知邮箱" : "全局签名"
            return (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{item.name}</span>
                      {item.isDefault && <Badge>默认</Badge>}
                      <Badge variant="outline">{mailbox}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!item.isDefault && <Button type="button" variant="outline" size="sm" disabled={signaturesPending} onClick={() => onSetDefaultSignature(item.id)}>设为默认</Button>}
                    <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setEditingSignature(item)}><PencilLine className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setPendingConfirm({ title: "删除签名？", description: `签名“${item.name}”将被删除。`, confirmText: "删除签名", destructive: true, onConfirm: () => { onDeleteSignature(item.id); setPendingConfirm(null) } })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            )
          })}
          {!signaturesLoading && signatures.length === 0 && <div className="py-5 text-center text-sm text-muted-foreground">暂无签名</div>}
        </div>
      </SettingsCard>

      <SettingsCard title="我的图库" subtitle="写信时可上传图片到 tu.my；配置仅保存在当前浏览器，不会提交到 imyemail 服务端。">
        <div className="grid gap-4">
          <Field label="API 地址">
            <Input value={imageHosting.apiBase} onChange={(event) => setImageHosting((value) => ({ ...value, apiBase: event.target.value }))} className="h-10" placeholder="https://tu.my/api/v1" />
          </Field>
          <Field label="Bearer Token（可选）">
            <PasswordInput value={imageHosting.token} onChange={(event) => setImageHosting((value) => ({ ...value, token: event.target.value }))} placeholder="留空时按游客身份上传" autoComplete="off" />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="图片权限">
              <Select value={imageHosting.permission} onValueChange={(permission: "0" | "1") => setImageHosting((value) => ({ ...value, permission }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">公开（邮件推荐）</SelectItem><SelectItem value="0">私有</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="存储策略 ID（可选）"><Input value={imageHosting.strategyId} onChange={(event) => setImageHosting((value) => ({ ...value, strategyId: event.target.value }))} /></Field>
            <Field label="相册 ID（可选）"><Input value={imageHosting.albumId} onChange={(event) => setImageHosting((value) => ({ ...value, albumId: event.target.value }))} /></Field>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">令牌会由浏览器直接发送到这里填写的 HTTPS 地址。若使用兼容接口，请确认服务可信；S3 Access Key / Secret 不应保存在浏览器中。</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => { try { setImageHosting(saveImageHostingConfig(imageHosting)); toast({ title: "图床设置已保存" }) } catch (error) { toast({ title: "图床配置无效", description: error instanceof Error ? error.message : "请检查 API 地址" }) } }}>保存图床设置</Button>
            <a href="https://tu.my/page/api-docs.html" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">查看我的图库 API 文档</a>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="自动回复" subtitle="开启后作为本地偏好保存，后续可接入服务端自动回复任务。">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="font-medium">启用自动回复</div>
            <div className="text-sm text-muted-foreground">用于休假、临时离线等场景。</div>
          </div>
          <SwitchButton checked={autoReplyEnabled} onClick={() => setAutoReplyEnabled((value) => !value)} />
        </div>
        <Textarea value={autoReplyText} onChange={(event) => setAutoReplyText(event.target.value)} className="mt-3 min-h-28" placeholder="自动回复内容" />
      </SettingsCard>

      <Dialog open={!!editingSignature} onOpenChange={(open) => { if (!open) setEditingSignature(null) }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>编辑签名</DialogTitle></DialogHeader>
          {editingSignature && (
            <EditSignatureForm
              key={editingSignature.id}
              item={editingSignature}
              mailboxes={mailboxes}
              pending={signaturesPending}
              onCancel={() => setEditingSignature(null)}
              onSubmit={(id, form) => { onUpdateSignature(id, form); setEditingSignature(null) }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "删除"} destructive={!!pendingConfirm?.destructive} pending={signaturesPending} onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function EditSignatureForm({ item, mailboxes, pending, onCancel, onSubmit }: { item: MailSignature; mailboxes: Mailbox[]; pending: boolean; onCancel: () => void; onSubmit: (id: string, form: FormData) => void }) {
  const [mailboxId, setMailboxId] = React.useState(item.mailboxId || "all")
  const [isDefault, setIsDefault] = React.useState(item.isDefault)
  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); form.set("mailboxId", mailboxId === "all" ? "" : mailboxId); form.set("isDefault", isDefault ? "on" : ""); onSubmit(item.id, form) }}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="签名名称"><Input name="name" defaultValue={item.name} required /></Field>
        <Field label="绑定邮箱"><MailboxSelect value={mailboxId} mailboxes={mailboxes} onChange={setMailboxId} /></Field>
      </div>
      <Field label="签名内容"><Textarea name="content" required className="min-h-44" defaultValue={item.content} /></Field>
      <label className="flex items-center gap-3 text-sm font-medium">
        <Checkbox checked={isDefault} onCheckedChange={(value) => setIsDefault(value === true)} />
        <span>设为当前范围默认签名</span>
      </label>
      <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button disabled={pending}>{pending ? "保存中..." : "保存修改"}</Button>
      </DialogFooter>
    </form>
  )
}

function SecuritySettingsSection({ user, password, passwordFormRef, twoFactorFormRef, setupTwoFactor, enableTwoFactor, disableTwoFactor, onCopy, mailboxes }: { user: AccountSettingsSectionProps["user"]; password: AccountSettingsSectionProps["password"]; passwordFormRef: React.RefObject<HTMLFormElement>; twoFactorFormRef: React.RefObject<HTMLFormElement>; setupTwoFactor: AccountSettingsSectionProps["setupTwoFactor"]; enableTwoFactor: AccountSettingsSectionProps["enableTwoFactor"]; disableTwoFactor: AccountSettingsSectionProps["disableTwoFactor"]; onCopy: (text: string) => void; mailboxes: Mailbox[] }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [generatedAppPassword, setGeneratedAppPassword] = React.useState<{ mailboxId: string; password: string } | null>(null)
  const [appPasswordCode, setAppPasswordCode] = React.useState("")
  const createAppPassword = useMutation({ mutationFn: api.createMailboxAppPassword, onSuccess: (data, variables) => { setGeneratedAppPassword({ mailboxId: variables.id, password: data.password }); setAppPasswordCode(""); qc.invalidateQueries({ queryKey: ["mailboxes"] }); toast({ title: "应用密码已生成", description: "请立即复制，关闭后不能再次查看。" }) }, onError: (error) => toast({ title: "生成失败", description: error.message }) })
  const revokeAppPassword = useMutation({ mutationFn: api.deleteMailboxAppPassword, onSuccess: (_, mailboxId) => { if (generatedAppPassword?.mailboxId === mailboxId) setGeneratedAppPassword(null); qc.invalidateQueries({ queryKey: ["mailboxes"] }); toast({ title: "应用密码已撤销" }) }, onError: (error) => toast({ title: "撤销失败", description: error.message }) })
  return (
    <div className="space-y-6">
      <SettingsCard title="当前登录" contentClassName="border-t py-5">
        <div className="flex items-center gap-4">
          <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <div className="font-semibold">{user.loginName || user.email}</div>
            <div className="text-sm text-muted-foreground">当前浏览器会话有效</div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="密码管理">
        <form ref={passwordFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); password.mutate(new FormData(e.currentTarget)) }}>
          <Field label="当前密码"><PasswordInput name="currentPassword" required /></Field>
          <Field label="新密码"><PasswordInput name="newPassword" minLength={8} required placeholder="输入新密码" /></Field>
          <Field label="确认新密码"><PasswordInput name="confirmPassword" minLength={8} required placeholder="再次输入密码" /></Field>
          <Button disabled={password.isPending}>{password.isPending ? "设置中..." : "设置密码"}</Button>
        </form>
      </SettingsCard>

      <SettingsCard title="两步验证">
        <div className="mb-4 flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" />认证状态</div>
          <Badge variant={user.twoFactorEnabled ? "default" : "secondary"}>{user.twoFactorEnabled ? "已启用" : "未启用"}</Badge>
        </div>
        {!user.twoFactorEnabled && !setupTwoFactor.data && (
          <Button onClick={() => setupTwoFactor.mutate()} disabled={setupTwoFactor.isPending}>{setupTwoFactor.isPending ? "生成中..." : "启用两步验证"}</Button>
        )}
        {!user.twoFactorEnabled && setupTwoFactor.data && (
          <form ref={twoFactorFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); enableTwoFactor.mutate(new FormData(e.currentTarget)) }}>
            {Math.abs(Date.now() - new Date(setupTwoFactor.data.serverTime).getTime()) > 90_000 && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">当前设备与服务器时间相差超过 90 秒，请先开启设备自动校时后再绑定。</div>}
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <QRCodeSVG value={setupTwoFactor.data.otpauthUrl} size={184} level="M" />
              </div>
              <div className="space-y-4">
                <Field label="密钥">
                  <div className="flex gap-2">
                    <Input value={setupTwoFactor.data.secret} readOnly />
                    <Button type="button" variant="outline" onClick={() => onCopy(setupTwoFactor.data!.secret)}><Copy className="h-4 w-4" />复制</Button>
                  </div>
                </Field>
                <Field label="绑定地址">
                  <div className="flex gap-2">
                    <Input value={setupTwoFactor.data.otpauthUrl} readOnly />
                    <Button type="button" variant="outline" onClick={() => onCopy(setupTwoFactor.data!.otpauthUrl)}><Copy className="h-4 w-4" />复制</Button>
                  </div>
                </Field>
              </div>
            </div>
            <Field label="验证码"><Input name="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setupTwoFactor.reset()}>取消</Button>
              <Button disabled={enableTwoFactor.isPending}>{enableTwoFactor.isPending ? "启用中..." : "确认启用"}</Button>
            </div>
          </form>
        )}
        {!!enableTwoFactor.data?.recoveryCodes?.length && <div className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="font-semibold">请立即保存一次性恢复码</div><div className="text-sm">手机丢失或时间异常时，可用任意一个恢复码登录；每个只能使用一次。</div><div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">{enableTwoFactor.data.recoveryCodes.map((code) => <code key={code} className="rounded border bg-white px-2 py-1">{code}</code>)}</div><Button type="button" variant="outline" onClick={() => onCopy(enableTwoFactor.data!.recoveryCodes.join("\n"))}><Copy className="h-4 w-4" />复制全部</Button></div>}
        {user.twoFactorEnabled && (
          <form ref={twoFactorFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); disableTwoFactor.mutate(new FormData(e.currentTarget)) }}>
            <Field label="当前验证码或恢复码"><Input name="code" autoComplete="one-time-code" minLength={6} maxLength={20} required /></Field>
            <div className="flex justify-end">
              <Button variant="destructive" disabled={disableTwoFactor.isPending}>{disableTwoFactor.isPending ? "关闭中..." : "关闭两步验证"}</Button>
            </div>
          </form>
        )}
      </SettingsCard>

      <SettingsCard title="第三方客户端应用密码" subtitle="启用双因素认证后，IMAP/POP3/SMTP 客户端必须使用应用密码，不能使用网页登录密码。">
        {!user.twoFactorEnabled && <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">请先启用两步验证，再为每个邮箱生成独立应用密码。</div>}
        {user.twoFactorEnabled && <div className="space-y-3"><Field label="当前验证码或恢复码"><Input value={appPasswordCode} onChange={(event) => setAppPasswordCode(event.target.value)} autoComplete="one-time-code" minLength={6} maxLength={20} placeholder="生成前需要再次验证" /></Field>{mailboxes.map((mailbox) => <div key={mailbox.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{mailbox.address}</div><div className="text-xs text-muted-foreground">{mailbox.appPasswordSet ? `已设置${mailbox.appPasswordCreatedAt ? ` · ${new Date(mailbox.appPasswordCreatedAt).toLocaleString()}` : ""}` : "尚未生成"}</div></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={createAppPassword.isPending || !appPasswordCode.trim()} onClick={() => createAppPassword.mutate({ id: mailbox.id, code: appPasswordCode })}>{mailbox.appPasswordSet ? "重新生成" : "生成密码"}</Button>{mailbox.appPasswordSet && <Button type="button" size="sm" variant="destructive" disabled={revokeAppPassword.isPending} onClick={() => revokeAppPassword.mutate(mailbox.id)}>撤销</Button>}</div></div>{generatedAppPassword?.mailboxId === mailbox.id && <div className="mt-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3"><code className="min-w-0 flex-1 break-all font-mono text-amber-950">{generatedAppPassword.password}</code><Button type="button" size="sm" variant="outline" onClick={() => onCopy(generatedAppPassword.password)}><Copy className="h-4 w-4" />复制</Button></div>}</div>)}</div>}
      </SettingsCard>

    </div>
  )
}

function CleanupQueueSection({ mailbox, stats }: { mailbox?: Mailbox; stats?: MailStats }) {
  const rows = (stats?.byFolder || []).filter((item) => item.role === "trash" || item.role === "spam").map((item) => ({ name: folderLabel(item.folder), count: item.count, bytes: item.bytes }))
  return (
    <SettingsCard title="待清理邮件" subtitle={mailbox ? `当前邮箱：${mailbox.address}` : "请先选择邮箱"}>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border p-3 text-sm">
            <span className="font-medium">{row.name}</span>
            <Badge variant="secondary">{row.count} 封</Badge>
            <span className="text-muted-foreground">{formatBytes(row.bytes)}</span>
          </div>
        ))}
        {rows.length === 0 && <EmptyState text="暂无待清理邮件" />}
      </div>
    </SettingsCard>
  )
}

const feedbackStatusTabs: { key: "all" | FeedbackTicketStatus; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "processing", label: "处理中" },
  { key: "replied", label: "已回复" },
  { key: "closed", label: "已关闭" },
]
const feedbackStatusLabels: Record<FeedbackTicketStatus, string> = { pending: "待处理", processing: "处理中", replied: "已回复", closed: "已关闭" }

function FeedbackSection() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedTicketId, setSelectedTicketId] = React.useState("")
  const [confirmAction, setConfirmAction] = React.useState<"close" | "delete" | null>(null)
  const [status, setStatus] = React.useState<"all" | FeedbackTicketStatus>("all")
  const ticketsQuery = useQuery({ queryKey: ["feedback-tickets"], queryFn: () => api.feedbackTickets("all"), refetchInterval: 30_000 })
  const detailQuery = useQuery({ queryKey: ["feedback-tickets", selectedTicketId], queryFn: () => api.feedbackTicket(selectedTicketId), enabled: !!selectedTicketId, refetchInterval: selectedTicketId ? 15_000 : false })
  const tickets = ticketsQuery.data?.items || []
  const visibleTickets = status === "all" ? tickets : tickets.filter((item) => item.status === status)
  const invalidate = () => qc.invalidateQueries({ queryKey: ["feedback-tickets"] })
  const create = useMutation({
    mutationFn: (payload: { title: string; content: string }) => api.createFeedbackTicket(payload),
    onSuccess: (ticket) => { void invalidate(); setCreateOpen(false); setSelectedTicketId(ticket.id); toast({ title: "反馈已提交", description: "工单已发送给管理员，回复会显示在此页面。" }) },
    onError: (error) => toast({ title: "提交失败", description: error.message }),
  })
  const reply = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.replyFeedbackTicket(id, content),
    onSuccess: () => { void invalidate(); toast({ title: "回复已发送" }) },
    onError: (error) => toast({ title: "回复失败", description: error.message }),
  })
  const close = useMutation({
    mutationFn: api.closeFeedbackTicket,
    onSuccess: () => { setConfirmAction(null); void invalidate(); toast({ title: "工单已关闭" }) },
    onError: (error) => toast({ title: "关闭失败", description: error.message }),
  })
  const remove = useMutation({
    mutationFn: api.deleteFeedbackTicket,
    onSuccess: () => { setConfirmAction(null); setSelectedTicketId(""); void invalidate(); toast({ title: "工单已删除" }) },
    onError: (error) => toast({ title: "删除失败", description: error.message }),
  })

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get("title") || "").trim()
    const content = String(form.get("content") || "").trim()
    if (!title || !content) return
    create.mutate({ title, content })
  }

  function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    const content = String(form.get("content") || "").trim()
    if (!selectedTicketId || !content) return
    reply.mutate({ id: selectedTicketId, content }, { onSuccess: () => target.reset() })
  }

  return (
    <div className="space-y-4" data-ui-section="user-feedback-tickets">
      <div className="flex justify-stretch sm:justify-end">
        <Button type="button" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />提交反馈</Button>
      </div>
      <SettingsCard title="反馈与工单" contentClassName="pt-1">
        <div className="flex overflow-x-auto border-b">
          {feedbackStatusTabs.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              className={cn("h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors", status === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
              onClick={() => setStatus(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="pt-5">
          {ticketsQuery.isLoading && <div className="py-8 text-center text-sm text-muted-foreground">正在加载工单...</div>}
          {ticketsQuery.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><div className="text-destructive">工单加载失败，请检查网络后重试。</div><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void ticketsQuery.refetch()}>重新加载</Button></div>}
          {visibleTickets.map((item) => (
            <Button key={item.id} type="button" variant="ghost" className="mb-2 block h-auto w-full rounded-lg border bg-background p-4 text-left font-normal transition-colors hover:bg-muted/40" onClick={() => setSelectedTicketId(item.id)}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                  <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.lastMessage}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{feedbackStatusLabels[item.status]}</Badge>
                  <span>{item.messageCount} 条消息</span>
                  <span>{formatDateTime(item.updatedAt)}</span>
                </div>
              </div>
            </Button>
          ))}
          {!ticketsQuery.isLoading && !ticketsQuery.isError && visibleTickets.length === 0 && (
            <EmptyState
              icon={<MessageSquare />}
              text={status === "all" ? "暂无工单" : `暂无${feedbackStatusTabs.find((item) => item.key === status)?.label}工单`}
              description="提交反馈后，管理员回复会在这里显示"
            />
          )}
        </div>
      </SettingsCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[min(92vw,34rem)] max-w-none">
          <DialogHeader><DialogTitle>提交反馈</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="标题"><Input name="title" required maxLength={120} placeholder="简短描述问题" /></Field>
            <Field label="内容"><Textarea name="content" required maxLength={5000} className="min-h-36" placeholder="请描述复现步骤、期望行为或建议；不要填写密码、验证码或邮件正文" /></Field>
            <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button disabled={create.isPending}>{create.isPending ? "提交中..." : "提交反馈"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTicketId} onOpenChange={(open) => { if (!open) setSelectedTicketId("") }}>
        <DialogContent className="flex max-h-[86vh] w-[min(94vw,44rem)] max-w-none flex-col overflow-hidden">
          <DialogHeader><DialogTitle>{detailQuery.data?.title || "工单详情"}</DialogTitle></DialogHeader>
          {detailQuery.isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">正在加载工单...</div> : detailQuery.isError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">工单加载失败，请稍后重试。</div>
          ) : detailQuery.data ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-xs text-muted-foreground">
                <Badge variant="secondary">{feedbackStatusLabels[detailQuery.data.status]}</Badge>
                <span>更新于 {formatDateTime(detailQuery.data.updatedAt)}</span>
              </div>
              <ScrollArea className="min-h-0 flex-1 pr-3">
                <div className="space-y-3 py-4">
                  {(detailQuery.data.messages || []).map((message) => (
                    <div key={message.id} className={cn("max-w-[88%] rounded-xl border px-4 py-3 text-sm", message.authorRole === "admin" ? "mr-auto bg-muted" : "ml-auto border-primary/20 bg-primary/5")}>
                      <div className="mb-1 flex items-center justify-between gap-4 text-xs text-muted-foreground"><span>{message.authorRole === "admin" ? "管理员" : "我"}</span><span>{formatDateTime(message.createdAt)}</span></div>
                      <div className="whitespace-pre-wrap break-words leading-6">{message.content}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              {detailQuery.data.status !== "closed" && (
                <form className="space-y-3 border-t pt-3" onSubmit={submitReply}>
                  <Textarea name="content" required maxLength={5000} className="min-h-24" placeholder="补充信息或回复管理员；不要填写密码、验证码或邮件正文" />
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setConfirmAction("close")}>关闭工单</Button>
                      <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmAction("delete")}><Trash2 className="h-4 w-4" />删除</Button>
                    </div>
                    <Button disabled={reply.isPending}><SendHorizontal className="h-4 w-4" />{reply.isPending ? "发送中..." : "发送回复"}</Button>
                  </div>
                </form>
              )}
              {detailQuery.data.status === "closed" && (
                <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-muted-foreground">该工单已关闭，不能继续回复。</span><Button type="button" variant="destructive" onClick={() => setConfirmAction("delete")}><Trash2 className="h-4 w-4" />删除工单</Button></div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === "delete" ? "删除工单？" : "关闭工单？"}
        description={confirmAction === "delete" ? "将永久删除该工单及全部对话；不会删除账号、邮箱或邮件。" : "关闭后前台和后台都不能继续回复，但仍可查看或删除该工单。"}
        confirmText={confirmAction === "delete" ? "删除工单" : "关闭工单"}
        destructive={confirmAction === "delete"}
        pending={close.isPending || remove.isPending}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        onConfirm={() => { if (!selectedTicketId) return; confirmAction === "delete" ? remove.mutate(selectedTicketId) : close.mutate(selectedTicketId) }}
      />
    </div>
  )
}

function SwitchButton({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return <Switch checked={checked} onCheckedChange={onClick} aria-label="切换设置" />
}

function readLocalString(key: string) {
  try { return window.localStorage.getItem(key) || "" } catch { return "" }
}

function writeLocalString(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch {}
}

function readLocalStringList(key: string) {
  try {
    const value = window.localStorage.getItem(key)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function writeLocalStringList(key: string, value: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

type MailboxActionLog = { id: string; action: string; target: string; createdAt: string }

function readLocalRecord(key: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

function writeLocalRecord(key: string, value: Record<string, string>) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function readLocalLogs(key: string): MailboxActionLog[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is MailboxActionLog => !!item && typeof item.id === "string" && typeof item.action === "string" && typeof item.target === "string" && typeof item.createdAt === "string")
      .slice(0, 50)
  } catch {
    return []
  }
}

function writeLocalLogs(key: string, value: MailboxActionLog[]) {
  try { window.localStorage.setItem(key, JSON.stringify(value.slice(0, 50))) } catch {}
}

function ProfileOverview({ user, profile, password, passwordFormRef, stats, showStats, displayMode, onDisplayModeChange, twoFactorFormRef, setupTwoFactor, enableTwoFactor, disableTwoFactor, onCopy }: { user: { loginName?: string; email: string; displayName: string; role: string; disabled: boolean; twoFactorEnabled: boolean; createdAt: string; limits?: PermissionLimits }; profile: { mutate: (form: FormData) => void; isPending: boolean }; password: { mutate: (form: FormData) => void; isPending: boolean }; passwordFormRef: React.RefObject<HTMLFormElement>; stats?: MailStats; showStats: boolean; displayMode: DisplayMode; onDisplayModeChange: (mode: DisplayMode) => void; twoFactorFormRef: React.RefObject<HTMLFormElement>; setupTwoFactor: { data?: { secret: string; otpauthUrl: string }; mutate: () => void; reset: () => void; isPending: boolean }; enableTwoFactor: { mutate: (form: FormData) => void; isPending: boolean }; disableTwoFactor: { mutate: (form: FormData) => void; isPending: boolean }; onCopy: (text: string) => void }) {
  return (
    <div className="space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>账号配额</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <LimitBadge label="附件上限" value={user.limits?.maxAttachmentMb} unit="MB" />
            <LimitBadge label="SMTP 每日" value={user.limits?.smtpDailyLimit} unit="封" />
            <LimitBadge label="SMTP 每分钟" value={user.limits?.smtpMinuteLimit} unit="封" />
            <LimitBadge label="IMAP 每分钟" value={user.limits?.imapMinuteLimit} unit="次" />
            <LimitBadge label="POP3 每分钟" value={user.limits?.pop3MinuteLimit} unit="次" />
          </div>
        </CardContent>
      </Card>

      {showStats && <StatsSummary stats={stats} />}

      <Card>
        <CardHeader>
          <CardTitle>账户信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); profile.mutate(new FormData(e.currentTarget)) }}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="用户名">
                <Input value={user.loginName || user.email} readOnly />
              </Field>
              <Field label="显示名称">
                <Input name="displayName" defaultValue={user.displayName} required />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button disabled={profile.isPending}>{profile.isPending ? "保存中..." : "保存资料"}</Button>
            </div>
          </form>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4" />
                角色
              </div>
              <Badge>{user.role === "admin" ? "管理员" : "普通用户"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>账号状态</span>
              <Badge variant={user.disabled ? "secondary" : "default"}>{user.disabled ? "已停用" : "正常"}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>创建时间</span>
              <span>{new Date(user.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>界面设置</CardTitle>
        </CardHeader>
        <CardContent>
          <Field label="显示模式">
            <Select value={displayMode} onValueChange={(value) => onDisplayModeChange(value as DisplayMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detailed">详细</SelectItem>
                <SelectItem value="compact">简洁</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>双因素认证</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4" />
              认证状态
            </div>
            <Badge variant={user.twoFactorEnabled ? "default" : "secondary"}>{user.twoFactorEnabled ? "已启用" : "未启用"}</Badge>
          </div>

          {!user.twoFactorEnabled && !setupTwoFactor.data && (
            <Button onClick={() => setupTwoFactor.mutate()} disabled={setupTwoFactor.isPending}>{setupTwoFactor.isPending ? "生成中..." : "启用双因素认证"}</Button>
          )}

          {!user.twoFactorEnabled && setupTwoFactor.data && (
            <form ref={twoFactorFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); enableTwoFactor.mutate(new FormData(e.currentTarget)) }}>
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex justify-center rounded-lg border bg-white p-4">
                  <QRCodeSVG value={setupTwoFactor.data.otpauthUrl} size={184} level="M" />
                </div>
                <div className="space-y-4">
                  <Field label="密钥">
                    <div className="flex gap-2">
                      <Input value={setupTwoFactor.data.secret} readOnly />
                      <Button type="button" variant="outline" onClick={() => onCopy(setupTwoFactor.data!.secret)}><Copy className="h-4 w-4" />复制</Button>
                    </div>
                  </Field>
                  <Field label="绑定地址">
                    <div className="flex gap-2">
                      <Input value={setupTwoFactor.data.otpauthUrl} readOnly />
                      <Button type="button" variant="outline" onClick={() => onCopy(setupTwoFactor.data!.otpauthUrl)}><Copy className="h-4 w-4" />复制</Button>
                    </div>
                  </Field>
                </div>
              </div>
              <Field label="验证码">
                <Input name="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setupTwoFactor.reset()}>取消</Button>
                <Button disabled={enableTwoFactor.isPending}>{enableTwoFactor.isPending ? "启用中..." : "确认启用"}</Button>
              </div>
            </form>
          )}

          {user.twoFactorEnabled && (
            <form ref={twoFactorFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); disableTwoFactor.mutate(new FormData(e.currentTarget)) }}>
              <Field label="当前验证码">
                <Input name="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required />
              </Field>
              <div className="flex justify-end">
                <Button variant="destructive" disabled={disableTwoFactor.isPending}>{disableTwoFactor.isPending ? "关闭中..." : "关闭双因素认证"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={passwordFormRef} className="space-y-4" onSubmit={(e) => { e.preventDefault(); password.mutate(new FormData(e.currentTarget)) }}>
            <Field label="当前密码">
              <PasswordInput name="currentPassword" required />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="新密码">
                <PasswordInput name="newPassword" minLength={8} required />
              </Field>
              <Field label="确认新密码">
                <PasswordInput name="confirmPassword" minLength={8} required />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button disabled={password.isPending}>{password.isPending ? "更新中..." : "更新密码"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

    </div>
  )
}

function LimitBadge({ label, value, unit }: { label: string; value?: number; unit: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {value !== undefined && value > 0 ? value : "不限"}
      </div>
      {value !== undefined && value > 0 && <div className="text-xs text-muted-foreground">{unit}</div>}
    </div>
  )
}

function MailboxManagement({
  mailboxes,
  applyOptions,
  applyPending,
  selectedMailboxId,
  externalImapEnabled,
  externalAccounts,
  externalPending,
  selectedExternalRunAccountId,
  externalRunFolders,
  externalSyncRuns,
  onSelectExternalRunAccount,
  onSelect,
  onCopy,
  onOpen,
  onApply,
  onCreateExternal,
  onStartExternalOAuth,
  onUpdateExternal,
  onDeleteExternal,
  onTestExternal,
  onSyncExternal,
  onSyncExternalFolder,
}: {
  mailboxes: Mailbox[]
  applyOptions?: MailboxApplyOptions
  applyPending: boolean
  selectedMailboxId: string
  externalImapEnabled: boolean
  externalAccounts: ExternalImapAccount[]
  externalPending: boolean
  selectedExternalRunAccountId: string
  externalRunFolders: ExternalImapFolder[]
  externalSyncRuns: ExternalImapSyncRun[]
  onSelectExternalRunAccount: (id: string) => void
  onSelect: (id: string) => void
  onCopy: (text: string) => void
  onOpen: (id: string) => void
  onApply: (payload: { domainId: string; localPart: string; displayName: string }) => Promise<void>
  onCreateExternal: (payload: ExternalImapAccountPayload) => void
  onStartExternalOAuth: (provider: ExternalImapOAuthProvider, payload: { mailboxId: string; email: string; storageMode: ExternalImapStorageMode }) => void
  onUpdateExternal: (id: string, payload: ExternalImapAccountPayload) => void
  onDeleteExternal: (id: string) => void
  onTestExternal: (id: string) => void
  onSyncExternal: (id: string) => void
  onSyncExternalFolder: (id: string, folder: string) => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const canApply = !!applyOptions?.enabled && (applyOptions.domains || []).length > 0
  const [domainId, setDomainId] = React.useState(() => applyOptions?.domains?.[0]?.id || "")
  const [localPart, setLocalPart] = React.useState("")
  const [mailboxSearch, setMailboxSearch] = React.useState("")
  const [notes, setNotes] = React.useState<Record<string, string>>(() => readLocalRecord("imyemail:seek-mailbox-notes"))
  const [editingNote, setEditingNote] = React.useState<Mailbox | null>(null)
  const [noteDraft, setNoteDraft] = React.useState("")
  const [forwardingMailbox, setForwardingMailbox] = React.useState<Mailbox | null>(null)
  const [forwardDraft, setForwardDraft] = React.useState<string[]>([])
  const [accountForwardTargets, setAccountForwardTargets] = React.useState<string[]>([])
  const [verifiedDialogOpen, setVerifiedDialogOpen] = React.useState(false)
  const [verifiedEmailDraft, setVerifiedEmailDraft] = React.useState("")
  const [logs, setLogs] = React.useState<MailboxActionLog[]>(() => readLocalLogs("imyemail:seek-mailbox-action-logs"))
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  const forwarding = useQuery({ queryKey: ["forwarding-settings"], queryFn: api.forwardingSettings, enabled: mailboxes.length > 0 })
  const verifiedEmailItems = forwarding.data?.verifiedEmails || []
  const verifiedEmails = React.useMemo(() => verifiedEmailItems.filter((item) => item.verified).map((item) => item.email), [verifiedEmailItems])
  const hasPendingVerifiedEmails = verifiedEmailItems.some((item) => !item.verified)
  const mailboxForwards = React.useMemo<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {}
    for (const rule of forwarding.data?.mailboxRules || []) {
      const targets = forwardingTargetsFromRule(rule)
      if (targets.length > 0) next[rule.mailboxId] = targets
    }
    return next
  }, [forwarding.data?.mailboxRules])
  const normalizedMailboxSearch = mailboxSearch.trim().toLowerCase()
  const domainOptions = applyOptions?.domains || []
  const selectedDomain = domainOptions.find((domain) => domain.id === domainId) || domainOptions[0]
  const filteredMailboxes = normalizedMailboxSearch
    ? mailboxes.filter((mailbox) => `${mailbox.address} ${notes[mailbox.id] || ""}`.toLowerCase().includes(normalizedMailboxSearch))
    : mailboxes
  const setForwardingCache = React.useCallback((settings: ForwardingSettings) => {
    qc.setQueryData(["forwarding-settings"], settings)
  }, [qc])
  const refreshForwardingSettings = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["forwarding-settings"] })
  }, [qc])
  const addVerifiedEmail = useMutation({
    mutationFn: api.addForwardingVerifiedEmail,
    onSuccess: (settings, email) => {
      setForwardingCache(settings)
      refreshForwardingSettings()
      window.setTimeout(refreshForwardingSettings, 2500)
      window.setTimeout(refreshForwardingSettings, 7000)
      addLog("添加验证邮箱", email)
      setVerifiedEmailDraft("")
      const item = settings.verifiedEmails.find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase())
      toast({
        title: item?.deliveryStatus === "failed" ? "验证邮箱已添加，邮件发送失败" : "验证邮件已发送",
        description: item?.deliveryStatus === "failed" ? item.deliveryError || "请稍后重发验证邮件" : "请前往目标邮箱点击确认验证",
      })
    },
    onError: (error) => toast({ title: "添加失败", description: error.message }),
  })
  const resendVerifiedEmail = useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => api.resendForwardingVerifiedEmail(id),
    onSuccess: (settings, item) => {
      setForwardingCache(settings)
      refreshForwardingSettings()
      window.setTimeout(refreshForwardingSettings, 2500)
      window.setTimeout(refreshForwardingSettings, 7000)
      addLog("重发验证邮件", item.email)
      const next = settings.verifiedEmails.find((entry) => entry.id === item.id)
      toast({
        title: next?.deliveryStatus === "failed" ? "重发失败" : "验证邮件已重发",
        description: next?.deliveryStatus === "failed" ? next.deliveryError || "请稍后再试" : "请前往目标邮箱点击确认验证",
      })
    },
    onError: (error) => toast({ title: "重发失败", description: error.message }),
  })
  const deleteVerifiedEmail = useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => api.deleteForwardingVerifiedEmail(id),
    onSuccess: (settings, item) => {
      setForwardingCache(settings)
      addLog("移除验证邮箱", item.email)
      toast({ title: "验证邮箱已移除" })
    },
    onError: (error) => toast({ title: "移除失败", description: error.message }),
  })
  const saveAccountForwarding = useMutation({
    mutationFn: api.updateAccountForwarding,
    onSuccess: (settings, targets) => {
      setForwardingCache(settings)
      addLog("保存账号转发", forwardingTargetsLabel(Array.isArray(targets) ? targets : [targets].filter(Boolean)))
      toast({ title: "账号级转发已保存" })
    },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const saveMailboxForwarding = useMutation({
    mutationFn: ({ mailboxId, targetEmails }: { mailboxId: string; targetEmails: string[] }) => api.updateMailboxForwarding(mailboxId, targetEmails),
    onSuccess: (settings, payload) => {
      setForwardingCache(settings)
      const mailbox = mailboxes.find((item) => item.id === payload.mailboxId)
      addLog("保存邮箱转发", `${mailbox?.address || payload.mailboxId} -> ${forwardingTargetsLabel(payload.targetEmails)}`)
      setForwardingMailbox(null)
      setForwardDraft([])
      toast({ title: "邮箱转发已保存" })
    },
    onError: (error) => toast({ title: "保存失败", description: error.message }),
  })
  const forwardingBusy = forwarding.isLoading || addVerifiedEmail.isPending || resendVerifiedEmail.isPending || deleteVerifiedEmail.isPending || saveAccountForwarding.isPending || saveMailboxForwarding.isPending

  React.useEffect(() => {
    if (!domainOptions.length) return
    setDomainId((current) => domainOptions.some((domain) => domain.id === current) ? current : domainOptions[0].id)
  }, [domainOptions])

  React.useEffect(() => {
    setAccountForwardTargets(forwardingTargetsFromSettings(forwarding.data))
  }, [forwarding.data?.accountTargetEmail, forwarding.data?.accountTargetEmails])
  React.useEffect(() => {
    if (!hasPendingVerifiedEmails) return
    const timer = window.setInterval(() => { void forwarding.refetch() }, verifiedDialogOpen ? 3000 : 10000)
    return () => window.clearInterval(timer)
  }, [forwarding, hasPendingVerifiedEmails, verifiedDialogOpen])

  React.useEffect(() => { writeLocalRecord("imyemail:seek-mailbox-notes", notes) }, [notes])
  React.useEffect(() => { writeLocalLogs("imyemail:seek-mailbox-action-logs", logs) }, [logs])

  function addLog(action: string, target: string) {
    setLogs((items) => [{ id: `log-${Date.now()}`, action, target, createdAt: new Date().toISOString() }, ...items].slice(0, 50))
  }

  async function submitMailbox(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDomain || !localPart.trim()) return
    await onApply({ domainId: selectedDomain.id, localPart: localPart.trim(), displayName: "" })
    addLog("创建邮箱", `${localPart.trim()}@${selectedDomain.name}`)
    setLocalPart("")
  }

  function saveMailboxNote() {
    if (!editingNote) return
    setNotes((items) => ({ ...items, [editingNote.id]: noteDraft.trim() }))
    addLog("更新备注", editingNote.address)
    setEditingNote(null)
    setNoteDraft("")
  }

  function openMailboxNote(mailbox: Mailbox) {
    setEditingNote(mailbox)
    setNoteDraft(notes[mailbox.id] || "")
  }

  function openMailboxForward(mailbox: Mailbox) {
    setForwardingMailbox(mailbox)
    setForwardDraft(mailboxForwards[mailbox.id] || [])
  }

  function saveMailboxForward() {
    if (!forwardingMailbox) return
    saveMailboxForwarding.mutate({ mailboxId: forwardingMailbox.id, targetEmails: forwardDraft })
  }

  function submitVerifiedEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = verifiedEmailDraft.trim()
    if (!value) return
    addVerifiedEmail.mutate(value)
  }

  function removeVerifiedEmail(id: string, email: string) {
    setAccountForwardTargets((items) => items.filter((item) => item !== email))
    setForwardDraft((items) => items.filter((item) => item !== email))
    deleteVerifiedEmail.mutate({ id, email })
  }

  function resendVerification(item: ForwardingVerifiedEmail) {
    resendVerifiedEmail.mutate({ id: item.id, email: item.email })
  }

  function confirmLocalAction(action: string, mailbox: Mailbox, destructive = false) {
    setPendingConfirm({
      title: `${action}？`,
      description: `${mailbox.address} 的“${action}”入口已按参考站保留；当前后端暂无对应接口，本次只记录操作日志。`,
      confirmText: action,
      destructive,
      onConfirm: () => {
        addLog(action, mailbox.address)
        setPendingConfirm(null)
      },
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card px-6 py-6">
        <h2 className="mb-4 text-lg font-semibold leading-7">创建新邮箱</h2>
        <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_80px]" onSubmit={submitMailbox}>
          <Input
            value={localPart}
            onChange={(event) => setLocalPart(event.target.value)}
            className="h-[42px] text-base shadow-none"
            placeholder="输入邮箱地址前缀"
            disabled={!canApply || applyPending}
          />
          <select
            value={selectedDomain?.id || ""}
            onChange={(event) => setDomainId(event.target.value)}
            className="h-[42px] rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            disabled={!canApply || applyPending}
          >
            {domainOptions.map((domain) => <option key={domain.id} value={domain.id}>@{domain.name}</option>)}
            {domainOptions.length === 0 && <option value="">暂无域名</option>}
          </select>
          <Button className="h-[42px] px-0" disabled={!canApply || applyPending || !selectedDomain || !localPart.trim()}>{applyPending ? "创建中" : "创建"}</Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          {canApply ? "提示：邮箱数量受账号配额限制，管理员可在后台为单个账号调整可创建数量。" : "提示：当前账号暂不可创建新邮箱。"}
        </p>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <h2 className="text-lg font-semibold leading-7">我的邮箱 ({mailboxes.length})</h2>
          <div className="relative w-64 shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={mailboxSearch} onChange={(event) => setMailboxSearch(event.target.value)} className="h-[34px] pl-9 text-sm shadow-none" placeholder="搜索邮箱地址或备注..." />
          </div>
        </div>
        <div className="divide-y">
          {filteredMailboxes.map((mailbox) => {
            const note = notes[mailbox.id]?.trim()
            const forwardTargets = mailboxForwards[mailbox.id] || []
            const accountForwardTargetActive = forwardTargets.length === 0 && accountForwardTargets.length > 0
            const effectiveForwardTargets = forwardTargets.length > 0 ? forwardTargets : accountForwardTargetActive ? accountForwardTargets : []
            const forwardingActive = effectiveForwardTargets.length > 0
            return (
              <div key={mailbox.id} className={cn("grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", selectedMailboxId === mailbox.id && "bg-muted/50")}>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" className="h-auto min-w-0 max-w-full truncate justify-start p-0 text-left text-sm font-semibold hover:bg-transparent hover:underline" onClick={() => { onSelect(mailbox.id); onOpen(mailbox.id) }}>{mailbox.address}</Button>
                      {selectedMailboxId === mailbox.id && <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">当前</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>创建于 {formatDateTime(mailbox.createdAt)}</span>
                      {note && <span className="max-w-full truncate">备注：{note}</span>}
                      {forwardTargets.length > 0 && <span className="max-w-full truncate font-semibold text-foreground">转发：{forwardTargets.join("、")}</span>}
                      {accountForwardTargetActive && <span className="max-w-full truncate font-semibold text-foreground">转发：使用账号级 {accountForwardTargets.join("、")}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-[30px] w-[72px] gap-1 px-0" onClick={() => openMailboxNote(mailbox)}><PencilLine className="h-3.5 w-3.5" />备注</Button>
                  <Button type="button" variant="outline" size="sm" className={cn("h-[30px] w-[72px] gap-1 px-0", forwardingActive && "border-foreground/20 bg-foreground text-background hover:bg-foreground/90 hover:text-background")} onClick={() => { onSelect(mailbox.id); openMailboxForward(mailbox) }}><SendHorizontal className="h-3.5 w-3.5" />{forwardingActive ? "转发中" : "转发"}</Button>
                  <Button type="button" variant="outline" size="sm" className="h-[30px] w-[82px] px-0" onClick={() => confirmLocalAction("暂停收信", mailbox)}>暂停收信</Button>
                  <Button type="button" variant="outline" size="sm" className="h-[30px] w-[54px] px-0 text-destructive hover:text-destructive" onClick={() => confirmLocalAction("释放邮箱", mailbox, true)}>释放</Button>
                </div>
              </div>
            )
          })}
          {filteredMailboxes.length === 0 && <div className="px-6 py-10 text-center text-sm text-muted-foreground">{mailboxes.length === 0 ? "暂无邮箱，请创建一个新邮箱" : "没有匹配邮箱"}</div>}
        </div>
      </section>

      <section id="mailbox-forwarding-section" className="rounded-lg border bg-card px-6 py-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold leading-7">邮件转发</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setVerifiedDialogOpen(true)}>管理验证邮箱</Button>
        </div>
        <div className="rounded-xl bg-muted/20 px-5 py-5">
          <div className="mb-3 text-sm font-medium">账号级转发</div>
          <div className="mb-4 text-sm text-muted-foreground">对所有邮箱生效，可同时转发到多个已验证邮箱；邮箱单独设置优先级更高</div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_72px] md:items-start">
            <ForwardingTargetPicker emails={verifiedEmails} selected={accountForwardTargets} onChange={setAccountForwardTargets} disabled={forwardingBusy} />
            <Button type="button" className="h-[37px]" disabled={forwardingBusy} onClick={() => saveAccountForwarding.mutate(accountForwardTargets)}>{saveAccountForwarding.isPending ? "保存中" : "保存"}</Button>
          </div>
        </div>
        {verifiedEmailItems.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {verifiedEmailItems.map((item) => {
              const tone = forwardingEmailTone(item)
              return (
                <span key={item.id} className={cn("inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-sm", tone.chipClass)}>
                  <span className={cn("size-2 shrink-0 rounded-full", tone.dotClass)} />
                  <span className="min-w-0 truncate">{item.email} · {tone.shortLabel}</span>
                </span>
              )
            })}
          </div>
        )}
        {verifiedEmails.length === 0 && <p className="mt-4 text-sm text-muted-foreground">暂未添加验证邮箱，请先点击「管理验证邮箱」添加。</p>}
        <p className="mt-3 text-sm text-muted-foreground">提示：每个邮箱可单独设置多个转发目标（点击邮箱列表中的「转发」按钮），单独设置会覆盖账号级配置。</p>
      </section>

      <section className="rounded-lg border bg-card">
        <h2 className="px-6 py-4 text-lg font-semibold leading-7">操作日志</h2>
        <div className="divide-y">
          {logs.map((log) => (
            <div key={log.id} className="grid gap-2 px-6 py-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center">
              <div className="font-medium">{log.action}</div>
              <div className="min-w-0 truncate text-muted-foreground">{log.target}</div>
              <div className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</div>
            </div>
          ))}
          {logs.length === 0 && <div className="px-6 py-10 text-center text-sm text-muted-foreground">暂无操作记录</div>}
        </div>
      </section>

      <Dialog open={!!editingNote} onOpenChange={(open) => { if (!open) setEditingNote(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>邮箱备注</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="truncate text-sm text-muted-foreground">{editingNote?.address}</div>
            <Input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="输入备注" autoFocus />
          </div>
          <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" onClick={() => setEditingNote(null)}>取消</Button>
            <Button type="button" onClick={saveMailboxNote}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!forwardingMailbox} onOpenChange={(open) => { if (!open) setForwardingMailbox(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>邮件转发</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="truncate text-sm text-muted-foreground">{forwardingMailbox?.address}</div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">转发到</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-start gap-2">
                <ForwardingTargetPicker emails={verifiedEmails} selected={forwardDraft} onChange={setForwardDraft} disabled={forwardingBusy} />
                <Button type="button" variant="outline" className="h-[37px] px-0" disabled={forwardingBusy} onClick={() => setForwardingMailbox(null)}>取消</Button>
                <Button type="button" className="h-[37px] px-0" disabled={forwardingBusy} onClick={saveMailboxForward}>{saveMailboxForwarding.isPending ? "保存中" : "保存"}</Button>
              </div>
            </div>
            {verifiedEmails.length === 0 && <p className="text-sm text-muted-foreground">暂未添加验证邮箱，请先点击「管理验证邮箱」添加。</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={verifiedDialogOpen} onOpenChange={setVerifiedDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[640px]">
          <DialogHeader className="px-8 pt-8">
            <DialogTitle className="text-2xl leading-8">验证邮箱管理</DialogTitle>
          </DialogHeader>
          <div className="px-8 pt-5 text-[17px] leading-8 text-muted-foreground">
            添加并验证外部邮箱地址后，才能用作转发目标。这里只展示投递状态摘要，不展示验证邮件内容。
          </div>
          <form className="grid gap-3 px-8 pt-6 sm:grid-cols-[minmax(0,1fr)_96px]" onSubmit={submitVerifiedEmail}>
            <Input type="email" value={verifiedEmailDraft} onChange={(event) => setVerifiedEmailDraft(event.target.value)} className="h-12 text-base shadow-none" placeholder="输入邮箱地址" disabled={forwardingBusy} />
            <Button className="h-12 px-0 text-base" disabled={forwardingBusy || !verifiedEmailDraft.trim()}>{addVerifiedEmail.isPending ? "添加中" : "添加"}</Button>
          </form>
          <div className="mx-8 mt-6 max-h-[360px] overflow-y-auto rounded-lg border">
            {verifiedEmailItems.map((item) => (
              <div key={item.id} className="grid min-h-[82px] gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold leading-6">{item.email}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.verified ? `已验证 - ${formatDateTime(item.verifiedAt || item.createdAt)}` : "待验证"}</div>
                  {!item.verified && (
                    <div className={cn("mt-1 text-sm leading-5", forwardingEmailTone(item).detailClass)}>
                      {forwardingEmailStatusText(item)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <span className={cn("size-2.5 rounded-full", forwardingEmailTone(item).dotClass)} />
                  {!item.verified && (
                    <Button type="button" variant="outline" className="h-10 px-4" disabled={forwardingBusy} onClick={() => resendVerification(item)}>重发</Button>
                  )}
                  <Button type="button" variant="outline" className="h-10 px-4 text-destructive hover:text-destructive" disabled={forwardingBusy} onClick={() => removeVerifiedEmail(item.id, item.email)} aria-label={`移除 ${item.email}`}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
            {verifiedEmailItems.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">暂无验证邮箱</div>}
          </div>
          <DialogFooter className="border-t px-8 py-6">
            <Button type="button" variant="outline" className="h-12 px-8 text-base" onClick={() => setVerifiedDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "确认"} destructive={!!pendingConfirm?.destructive} pending={false} onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function ApplyMailboxDialog({ options, pending, onApply }: { options: MailboxApplyOptions; pending: boolean; onApply: (payload: { domainId: string; localPart: string; displayName: string }) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [domainId, setDomainId] = React.useState(options.domains[0]?.id || "")
  React.useEffect(() => {
    if (!open) return
    setDomainId((current) => options.domains.some((domain) => domain.id === current) ? current : options.domains[0]?.id || "")
  }, [open, options.domains])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await onApply({
        domainId,
        localPart: String(form.get("localPart") || ""),
        displayName: String(form.get("displayName") || ""),
      })
      event.currentTarget.reset()
      setOpen(false)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />申请邮箱</Button>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>申请邮箱</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="邮箱前缀"><Input name="localPart" autoFocus required placeholder="your-name" /></Field>
          <Field label="域名后缀">
            <Select value={domainId} onValueChange={setDomainId}>
              <SelectTrigger><SelectValue placeholder="选择域名" /></SelectTrigger>
              <SelectContent>{options.domains.map((domain) => <SelectItem key={domain.id} value={domain.id}>@{domain.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="显示名称"><Input name="displayName" placeholder="可选" /></Field>
          <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button disabled={pending || !domainId}>{pending ? "申请中..." : "申请"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}


function ExternalImapOAuthDialog({ provider, selectedMailbox, disabled, pending, onStart }: { provider: ExternalImapOAuthProvider; selectedMailbox?: Mailbox; disabled?: boolean; pending: boolean; onStart: (provider: ExternalImapOAuthProvider, payload: { mailboxId: string; email: string; storageMode: ExternalImapStorageMode }) => void }) {
  const [open, setOpen] = React.useState(false)
  const [storageMode, setStorageMode] = React.useState<ExternalImapStorageMode>("local")
  const label = provider === "gmail" ? "Gmail OAuth" : "Microsoft 365 / Outlook OAuth"

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMailbox) return
    const form = new FormData(event.currentTarget)
    onStart(provider, {
      mailboxId: selectedMailbox.id,
      email: String(form.get("email") || ""),
      storageMode,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" disabled={disabled || pending} onClick={() => setOpen(true)}>{label}</Button>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            OAuth 只适用于 {provider === "gmail" ? "Google Gmail" : "Microsoft 365 / Outlook / Exchange Online"} 托管邮箱。自建域名邮箱请使用“添加外部邮箱”的普通 IMAP 方式。
          </div>
          <Field label="外部邮箱地址（可选）"><Input name="email" type="email" placeholder={selectedMailbox?.address || "name@example.com"} /></Field>
          <div className="text-xs text-muted-foreground">留空时会以 OAuth 服务商返回的真实授权邮箱为准；填写后，回调时会校验它和真实授权邮箱一致。</div>
          <Field label="存储模式">
            <Select value={storageMode} onValueChange={(value) => setStorageMode(value as ExternalImapStorageMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="local">同步到本地</SelectItem><SelectItem value="remote">远端直连</SelectItem></SelectContent>
            </Select>
          </Field>
          <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button disabled={pending || !selectedMailbox}>{pending ? "跳转中..." : "前往授权"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ExternalImapDialog({ account, mailboxId, disabled, pending, onSubmit }: { account?: ExternalImapAccount; mailboxId: string; disabled?: boolean; pending: boolean; onSubmit: (payload: ExternalImapAccountPayload) => void }) {
  const [open, setOpen] = React.useState(false)
  const [tlsMode, setTlsMode] = React.useState<ExternalImapTlsMode>(account?.tlsMode || "tls")
  const [storageMode, setStorageMode] = React.useState<ExternalImapStorageMode>(account?.storageMode || "local")
  const [syncReadState, setSyncReadState] = React.useState(account?.syncReadState ?? true)
  const [enabled, setEnabled] = React.useState(account?.enabled ?? true)
  React.useEffect(() => {
    if (!open) return
    setTlsMode(account?.tlsMode || "tls")
    setStorageMode(account?.storageMode || "local")
    setSyncReadState(account?.syncReadState ?? true)
    setEnabled(account?.enabled ?? true)
  }, [account, open])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload: ExternalImapAccountPayload = {
      mailboxId,
      name: String(form.get("name") || ""),
      host: String(form.get("host") || ""),
      port: Number(form.get("port") || (tlsMode === "tls" ? 993 : 143)),
      tlsMode,
      username: String(form.get("username") || ""),
      password: String(form.get("password") || ""),
      storageMode,
      syncReadState,
      enabled,
    }
    onSubmit(payload)
    if (!pending) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant={account ? "outline" : "default"} size={account ? "sm" : "default"} disabled={disabled} onClick={() => setOpen(true)}>
        {account ? "编辑" : <><Plus className="h-4 w-4" />添加外部邮箱</>}
      </Button>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{account ? "编辑外部 IMAP" : "添加外部 IMAP"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="显示名称"><Input name="name" defaultValue={account?.name || ""} placeholder="Gmail / 工作邮箱" /></Field>
            <Field label="用户名"><Input name="username" defaultValue={account?.username || ""} required placeholder="name@example.com" /></Field>
            <Field label="服务器"><Input name="host" defaultValue={account?.host || ""} required placeholder="imap.example.com" /></Field>
            <Field label="端口"><Input name="port" type="number" min={1} max={65535} defaultValue={account?.port || (tlsMode === "tls" ? 993 : 143)} /></Field>
            <Field label="加密方式">
              <Select value={tlsMode} onValueChange={(value) => setTlsMode(value as ExternalImapTlsMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="tls">SSL/TLS</SelectItem><SelectItem value="starttls">STARTTLS</SelectItem><SelectItem value="plain">不加密</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="存储模式">
              <Select value={storageMode} onValueChange={(value) => setStorageMode(value as ExternalImapStorageMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="local">同步到本地</SelectItem><SelectItem value="remote">远端直连</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={account ? "密码（留空则不修改）" : "密码"}><PasswordInput name="password" required={!account} placeholder={account ? "不修改请留空" : "外部邮箱密码或授权码"} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={syncReadState} onCheckedChange={(checked) => setSyncReadState(checked === true)} />同步已读状态</label>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Checkbox checked={enabled} onCheckedChange={(checked) => setEnabled(checked === true)} />启用此账号</label>
          </div>
          <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button disabled={pending || !mailboxId}>{pending ? "保存中..." : "保存"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function externalPayloadFromAccount(account: ExternalImapAccount): ExternalImapAccountPayload {
  return { mailboxId: account.mailboxId, name: account.name, host: account.host, port: account.port, tlsMode: account.tlsMode, username: account.username, password: "", storageMode: account.storageMode, syncReadState: account.syncReadState, enabled: account.enabled }
}

function externalStatusLabel(status: string) {
  return ({ idle: "未同步", ok: "正常", partial: "部分成功", error: "错误", running: "同步中" } as Record<string, string>)[status] || status || "未知"
}

function externalOAuthProviderLabel(provider?: ExternalImapOAuthProvider) {
  return provider === "gmail" ? "Gmail OAuth" : provider === "outlook" ? "Microsoft 365 / Outlook OAuth" : "OAuth"
}

function ExternalImapSyncPanel({ account, folders, runs, pending, onSyncFolder }: { account: ExternalImapAccount; folders: ExternalImapFolder[]; runs: ExternalImapSyncRun[]; pending: boolean; onSyncFolder: (id: string, folder: string) => void }) {
  const [folder, setFolder] = React.useState("")
  React.useEffect(() => {
    if (folder && folders.some((item) => item.name === folder)) return
    setFolder(folders[0]?.name || "INBOX")
  }, [folder, folders])
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <Field label="单文件夹同步">
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger><SelectValue placeholder="选择远端文件夹" /></SelectTrigger>
            <SelectContent>{folders.map((item) => <SelectItem key={item.name} value={item.name}>{folderLabel(item.name)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Button type="button" variant="outline" disabled={pending || !folder} onClick={() => onSyncFolder(account.id, folder)}><RefreshCcw className="h-4 w-4" />同步文件夹</Button>
      </div>
      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">最近同步记录</div>
        {runs.length === 0 && <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">暂无同步记录</div>}
        {runs.slice(0, 6).map((run) => (
          <div key={run.id} className="grid gap-2 rounded-md border bg-background p-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={run.status === "ok" ? "secondary" : run.status === "failed" ? "destructive" : "outline"}>{externalStatusLabel(run.status)}</Badge>
                <span className="truncate">{run.folder ? folderLabel(run.folder) : "全部文件夹"}</span>
              </div>
              {run.error && <div className="mt-1 truncate text-xs text-destructive">{run.error}</div>}
            </div>
            <div className="text-xs text-muted-foreground md:text-right">
              <div>导入 {run.imported} · 跳过 {run.skipped} · 失败 {run.failed}</div>
              <div>{formatDateTime(run.startedAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function forwardingTargetsFromRule(rule: { targetEmail?: string; targetEmails?: string[] }) {
  const targets = rule.targetEmails?.length ? rule.targetEmails : rule.targetEmail ? [rule.targetEmail] : []
  return Array.from(new Set(targets.map((item) => item.trim()).filter(Boolean)))
}

function forwardingTargetsFromSettings(settings?: ForwardingSettings) {
  const targets = settings?.accountTargetEmails?.length ? settings.accountTargetEmails : settings?.accountTargetEmail ? [settings.accountTargetEmail] : []
  return Array.from(new Set(targets.map((item) => item.trim()).filter(Boolean)))
}

function forwardingTargetsLabel(targets: string[]) {
  const clean = Array.from(new Set(targets.map((item) => item.trim()).filter(Boolean)))
  return clean.length ? clean.join("、") : "不转发"
}

function ForwardingTargetPicker({ emails, selected, onChange, disabled, placement = "bottom" }: { emails: string[]; selected: string[]; onChange: (targets: string[]) => void; disabled?: boolean; placement?: "bottom" | "top" }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const sortedEmails = React.useMemo(() => {
    const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true })
    return Array.from(new Set(emails.map((email) => email.trim()).filter(Boolean))).sort((a, b) => collator.compare(a, b))
  }, [emails])
  const selectedEmails = React.useMemo(() => sortedEmails.filter((email) => selectedSet.has(email)), [selectedSet, sortedEmails])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEmails = normalizedQuery ? sortedEmails.filter((email) => email.toLowerCase().includes(normalizedQuery)) : sortedEmails
  const label = selectedEmails.length
    ? `已选择 ${selectedEmails.length} 个：${selectedEmails.slice(0, 2).join("、")}${selectedEmails.length > 2 ? ` 等 ${selectedEmails.length} 个` : ""}`
    : "不转发，点击选择邮箱"
  function toggle(email: string, checked: boolean) {
    if (disabled) return
    const next = checked ? Array.from(new Set([...selected, email])) : selected.filter((item) => item !== email)
    onChange(next)
  }
  if (emails.length === 0) {
    return <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">暂无已验证邮箱</div>
  }
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-[37px] w-full justify-between gap-2 bg-background px-3 text-left text-sm font-normal hover:bg-accent/60 hover:text-foreground",
          open && "border-primary/35 ring-1 ring-primary/15",
          disabled && "cursor-not-allowed opacity-60 hover:bg-background",
        )}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cn("min-w-0 flex-1 truncate", selectedEmails.length ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div className={cn("absolute left-0 right-0 z-30 rounded-md border bg-popover p-2 shadow-sm", placement === "top" ? "bottom-full mb-2" : "mt-2")}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-8 pr-8 text-sm shadow-none"
                placeholder="搜索已验证邮箱"
                autoFocus
              />
              {query && (
                <Button type="button" variant="ghost" size="icon" className="absolute right-0.5 top-0.5 size-7 text-muted-foreground" onClick={() => setQuery("")}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onChange([])}>
              清空
            </Button>
          </div>
          <div className="mt-2 max-h-[132px] overflow-y-auto pr-1">
            <div className="space-y-1">
              {filteredEmails.map((email) => {
                const checked = selectedSet.has(email)
                return (
                  <label
                    key={email}
                    className={cn(
                      "flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/70",
                      checked && "border-primary/30 bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => toggle(email, value === true)} />
                    <span className="min-w-0 flex-1 truncate">{email}</span>
                  </label>
                )
              })}
              {filteredEmails.length === 0 && <div className="px-2 py-8 text-center text-sm text-muted-foreground">没有匹配的已验证邮箱</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function forwardingEmailTone(item: ForwardingVerifiedEmail) {
  if (item.verified) {
    return {
      shortLabel: "已验证",
      dotClass: "bg-emerald-500",
      chipClass: "bg-emerald-100 text-emerald-800",
      detailClass: "text-emerald-700",
    }
  }
  if (item.deliveryStatus === "failed") {
    return {
      shortLabel: "发送失败",
      dotClass: "bg-destructive",
      chipClass: "bg-destructive/10 text-destructive",
      detailClass: "text-destructive",
    }
  }
  if (item.deliveryStatus === "delivered") {
    return {
      shortLabel: "待验证",
      dotClass: "bg-amber-500",
      chipClass: "bg-amber-100 text-amber-800",
      detailClass: "text-amber-700",
    }
  }
  return {
    shortLabel: "待验证",
    dotClass: "bg-muted-foreground",
    chipClass: "bg-muted text-foreground",
    detailClass: "text-foreground",
  }
}

function forwardingEmailStatusText(item: ForwardingVerifiedEmail) {
  const time = item.verificationSentAt ? ` · 最近尝试 ${formatDateTime(item.verificationSentAt)}` : ""
  if (item.deliveryStatus === "failed") {
    return `验证邮件发送失败${item.deliveryError ? `：${item.deliveryError}` : ""}${time}`
  }
  if (item.deliveryStatus === "delivered") {
    return `验证邮件已发送，请前往目标邮箱完成验证${time}`
  }
  if (item.deliveryStatus === "sending") {
    return `验证邮件发送中${time}`
  }
  return `验证邮件排队发送中${time}`
}

function dateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function dateInputToISOString(value: string) {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}

function ClientSettingsSection({ mailboxes, selectedMailboxId, hostname, twoFactorEnabled, accessEvents, accessEventsLoading, accessEventsDeleting, onRefreshAccessEvents, onDeleteAccessEvents, onSelectMailbox, onCopy }: { mailboxes: Mailbox[]; selectedMailboxId: string; hostname?: string; twoFactorEnabled: boolean; accessEvents: ClientAccessEvent[]; accessEventsLoading: boolean; accessEventsDeleting: boolean; onRefreshAccessEvents: () => void; onDeleteAccessEvents: (ids: string[]) => Promise<unknown>; onSelectMailbox: (id: string) => void; onCopy: (text: string) => void }) {
  const [selectedEventIds, setSelectedEventIds] = React.useState<string[]>([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const selected = mailboxes.find((item) => item.id === selectedMailboxId) || mailboxes[0]
  const visibleEventIds = accessEvents.map((item) => item.id)
  const visibleEventKey = visibleEventIds.join("\u0000")
  const allEventsSelected = visibleEventIds.length > 0 && visibleEventIds.every((id) => selectedEventIds.includes(id))
  React.useEffect(() => {
    setSelectedEventIds((current) => current.filter((id) => visibleEventIds.includes(id)))
  }, [visibleEventKey])
  const server = clientServerHost(hostname, selected?.address)
  const rows = [
    { protocol: "IMAP", server, port: "993", security: "SSL/TLS", authentication: "邮箱密码或应用密码" },
    { protocol: "POP3", server, port: "995", security: "SSL/TLS", authentication: "邮箱密码或应用密码" },
    { protocol: "SMTP", server, port: "465", security: "SSL/TLS", authentication: "PLAIN 或 LOGIN" },
    { protocol: "SMTP Submission", server, port: "587", security: "STARTTLS（必须启用）", authentication: "PLAIN 或 LOGIN" },
  ]
  return (
    <div className="space-y-6" data-ui-section="client-settings">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>第三方客户端</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">IMAP / POP3 / SMTP 配置用于 Thunderbird、Apple Mail、手机邮件客户端等。</div>
            </div>
            {!!selected && <Badge variant="secondary">{selected.address}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="选择邮箱">
            <Select value={selected?.id || ""} onValueChange={onSelectMailbox}>
              <SelectTrigger><SelectValue placeholder="选择邮箱" /></SelectTrigger>
              <SelectContent>{mailboxes.map((mailbox) => <SelectItem key={mailbox.id} value={mailbox.id}>{mailbox.address}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          {selected ? (
            <>
              <div className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{selected.address}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">● IMAP</Badge>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">● POP3</Badge>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">● SMTP</Badge>
                    </div>
                  </div>
                  <Badge variant="outline">已启用</Badge>
                </div>
              </div>

              <div className="rounded-lg bg-muted/70 p-4 sm:p-5" data-ui-section="client-configuration">
                <div className="mb-4 font-medium">客户端配置</div>
                <div className="hidden overflow-x-auto rounded-lg border bg-background md:block" data-ui-layout="client-configuration-table">
                  <Table className="min-w-[760px] border-collapse text-sm">
                    <TableHeader className="bg-muted/50 text-left">
                      <TableRow><TableHead className="border-b px-3 py-2.5 font-medium">协议</TableHead><TableHead className="border-b px-3 py-2.5 font-medium">服务器</TableHead><TableHead className="border-b px-3 py-2.5 font-medium">端口</TableHead><TableHead className="border-b px-3 py-2.5 font-medium">加密</TableHead><TableHead className="border-b px-3 py-2.5 font-medium">鉴权</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={`${row.protocol}-${row.port}`} className="border-b last:border-b-0">
                          <TableCell className="whitespace-nowrap px-3 py-2.5 font-medium">{row.protocol}</TableCell>
                          <TableCell className="px-3 py-2.5"><CopyValue value={row.server} onCopy={onCopy} /></TableCell>
                          <TableCell className="px-3 py-2.5"><CopyValue value={row.port} onCopy={onCopy} /></TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2.5">{row.security}</TableCell>
                          <TableCell className="whitespace-nowrap px-3 py-2.5">{row.authentication}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="space-y-3 md:hidden" data-ui-layout="client-configuration-cards">
                  {rows.map((row) => (
                    <div key={`${row.protocol}-${row.port}`} className="rounded-lg border bg-background p-3 text-sm">
                      <div className="mb-3 flex items-center justify-between gap-2"><span className="font-semibold">{row.protocol}</span><Badge variant="outline">{row.security}</Badge></div>
                      <div className="space-y-2">
                        <div><div className="mb-1 text-xs text-muted-foreground">服务器</div><CopyValue value={row.server} onCopy={onCopy} /></div>
                        <div><div className="mb-1 text-xs text-muted-foreground">端口</div><CopyValue value={row.port} onCopy={onCopy} /></div>
                        <div><div className="mb-1 text-xs text-muted-foreground">鉴权</div><div>{row.authentication}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
                <div className="grid gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="text-muted-foreground">用户名</div>
                  <CopyValue value={selected.address} onCopy={onCopy} />
                  <div className="text-muted-foreground">密码</div>
                  <div>{twoFactorEnabled ? "第三方客户端应用密码" : "邮箱登录密码"}</div>
                </div>
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                  SMTP 兼容 PLAIN 与 LOGIN 鉴权。推荐使用 465 + SSL；也可使用 587 + STARTTLS。{twoFactorEnabled ? "账号已启用双因素认证，收信和发信都必须使用为该邮箱生成的应用密码。" : "账号未启用双因素认证，收信和发信都使用邮箱登录密码。"}
                </div>
              </div>
            </>
          ) : (
            <EmptyState text="暂无邮箱，创建邮箱后可查看客户端配置" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>最近客户端连接</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">保留最近 90 天的 IMAP、POP3 和 SMTP 鉴权结果，便于排查客户端设置。</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedEventIds.length > 0 && <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)} disabled={accessEventsDeleting}><Trash2 className="h-4 w-4" />删除所选（{selectedEventIds.length}）</Button>}
              <Button type="button" variant="outline" size="sm" onClick={onRefreshAccessEvents} disabled={accessEventsLoading || accessEventsDeleting}>
                <RefreshCcw className={cn("h-4 w-4", accessEventsLoading && "animate-spin")} />刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {accessEventsLoading && accessEvents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">正在加载连接记录...</div>
          ) : accessEvents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无连接记录；新版本部署后的客户端鉴权会显示在这里。</div>
          ) : (
            <div className="divide-y rounded-lg border">
              <label className="flex items-center gap-3 bg-muted/40 px-4 py-2 text-sm font-medium">
                <Checkbox checked={allEventsSelected ? true : selectedEventIds.length > 0 ? "indeterminate" : false} onCheckedChange={(checked) => setSelectedEventIds(checked ? visibleEventIds : [])} aria-label="全选连接记录" />
                <span>全选当前列表</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground">共 {accessEvents.length} 条</span>
              </label>
              {accessEvents.map((event) => (
                <div key={event.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[20px_76px_88px_minmax(0,1fr)_160px] sm:items-center">
                  <Checkbox checked={selectedEventIds.includes(event.id)} onCheckedChange={(checked) => setSelectedEventIds((current) => checked ? [...new Set([...current, event.id])] : current.filter((id) => id !== event.id))} aria-label={`选择 ${event.protocol} 连接记录`} />
                  <Badge variant="outline" className="w-fit font-mono uppercase">{event.protocol}</Badge>
                  <span className={event.success ? "font-medium text-emerald-600" : "font-medium text-destructive"}>{event.success ? "连接成功" : "鉴权失败"}</span>
                  <div className="min-w-0">
                    <div className="truncate">{event.remoteIp || "未知地址"}{event.authMethod ? ` · ${event.authMethod}` : ""}</div>
                    {event.clientInfo && <div className="truncate text-xs text-muted-foreground">{event.clientInfo}</div>}
                  </div>
                  <span className="text-muted-foreground sm:text-right">{formatDateTime(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="删除连接记录？"
        description={`将永久删除选中的 ${selectedEventIds.length} 条 SMTP / IMAP / POP3 连接历史。`}
        confirmText="批量删除"
        destructive
        pending={accessEventsDeleting}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={() => void onDeleteAccessEvents(selectedEventIds).then(() => { setSelectedEventIds([]); setConfirmDeleteOpen(false) }).catch(() => undefined)}
      />
    </div>
  )
}

function CopyValue({ value, onCopy }: { value: string; onCopy: (text: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded border bg-muted/30 px-2 py-1 text-xs">{value}</code>
      <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs" aria-label={`复制 ${value}`} data-copy-value={value} onClick={() => onCopy(value)}><Copy className="h-3.5 w-3.5" />复制</Button>
    </div>
  )
}

const apiTokenScopeOptions = [
  ["messages:send", "发送邮件"], ["messages:read", "读取邮件与投递状态"], ["messages:manage", "重试或取消发送"],
  ["domains:read", "查看域名"], ["domains:write", "管理域名"], ["mailboxes:read", "查看邮箱"], ["mailboxes:write", "管理邮箱"],
  ["dns:read", "查看 DNS"], ["dns:check", "执行 DNS 检测"], ["aliases:read", "查看邮件转发"], ["aliases:write", "管理邮件转发"],
] as const

function ApiTokensSection({ items, loading, pending, onCreate, onUpdate, onDelete, onCopy }: { items: APIToken[]; loading: boolean; pending: boolean; onCreate: (payload: { name: string; expiresAt?: string; scopes: string[] }) => Promise<{ token: string; item: APIToken }>; onUpdate: (id: string, payload: { name?: string; expiresAt?: string; disabled?: boolean; scopes?: string[] }) => void; onDelete: (id: string) => void; onCopy: (text: string) => void }) {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createdToken, setCreatedToken] = React.useState("")
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  const [scopes, setScopes] = React.useState<string[]>(["messages:send", "messages:read"])
  const [editingToken, setEditingToken] = React.useState<APIToken | null>(null)
  const [editingScopes, setEditingScopes] = React.useState<string[]>([])
  const defaultExpiresAt = React.useMemo(() => dateInputValue(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)), [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    const expiresAt = dateInputToISOString(String(form.get("expiresAt") || ""))
    try {
      const res = await onCreate({ name: String(form.get("name") || "").trim(), expiresAt, scopes })
      setCreatedToken(res.token)
      target.reset()
      setScopes(["messages:send", "messages:read"])
      setCreateDialogOpen(false)
    } catch {
      // Mutation-level error handling already shows the toast.
    }
  }

  function openCreateDialog() {
    setCreatedToken("")
    setScopes(["messages:send", "messages:read"])
    setCreateDialogOpen(true)
  }

  return (
    <div>
      <section className="rounded-lg border bg-card">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-lg font-semibold leading-7">API 密钥</h2>
          <Button type="button" size="sm" className="h-8 rounded-md px-3 text-xs" onClick={openCreateDialog}>创建密钥</Button>
        </div>
        <div className="space-y-2 border-t px-4 py-4">
        {createdToken && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" />只显示一次</div>
            <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 overflow-x-auto rounded border bg-background px-3 py-2 text-xs">{createdToken}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => onCopy(createdToken)}><Copy className="h-4 w-4" />复制</Button>
            </div>
          </div>
        )}

        {items.map((item) => {
          const expired = item.expiresAt ? new Date(item.expiresAt).getTime() <= Date.now() : false
          return (
            <div key={item.id} className="grid min-h-[74px] gap-3 rounded-lg border bg-background px-3 py-3 transition-colors hover:bg-muted/30 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold">{item.name}</div>
                  <Badge variant={item.disabled || expired ? "secondary" : "default"} className="h-5 px-1.5 text-[10px]">{item.disabled ? "已禁用" : expired ? "已过期" : "可用"}</Badge>
                </div>
                <div className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-3">
                  <span>创建：{formatDateTime(item.createdAt)}</span>
                  <span>过期：{item.expiresAt ? formatDateTime(item.expiresAt) : "未设置"}</span>
                  <span>最后使用：{item.lastUsedAt ? formatDateTime(item.lastUsedAt) : "从未使用"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(item.scopes || ["*"]).map((scope) => <Badge key={scope} variant="outline" className="h-5 px-1.5 text-[10px] font-normal">{scope}</Badge>)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={pending} onClick={() => { setEditingToken(item); setEditingScopes(item.scopes?.includes("*") ? ["messages:send", "messages:read"] : item.scopes || []) }}>编辑权限</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={pending || expired} onClick={() => onUpdate(item.id, { disabled: !item.disabled })}>{item.disabled ? "启用" : "禁用"}</Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" disabled={pending} onClick={() => setPendingConfirm({ title: "撤销 API 密钥？", description: `密钥“${item.name}”撤销后无法恢复，正在使用它的集成会立即失效。`, confirmText: "撤销密钥", destructive: true, onConfirm: () => { onDelete(item.id); setPendingConfirm(null) } })}>撤销</Button>
              </div>
            </div>
          )
        })}
        {!loading && items.length === 0 && <div className="grid min-h-[56px] place-items-center text-sm text-muted-foreground">暂无 API 密钥，点击上方按钮创建</div>}
        {loading && items.length === 0 && <div className="grid min-h-[56px] place-items-center text-sm text-muted-foreground">正在加载 API 密钥</div>}
        </div>
      </section>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>创建 API 密钥</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Field label="名称"><Input name="name" required maxLength={80} placeholder="billing-system" autoFocus /></Field>
              <Field label="到期日期"><Input name="expiresAt" type="date" defaultValue={defaultExpiresAt} min={dateInputValue(new Date())} required /></Field>
            </div>
            <Field label="授权范围">
              <div className="grid gap-2 sm:grid-cols-2">
                {apiTokenScopeOptions.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50">
                    <Checkbox checked={scopes.includes(value)} onCheckedChange={(checked) => setScopes((current) => checked === true ? [...current, value] : current.filter((scope) => scope !== value))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
              <Button disabled={pending || scopes.length === 0}>{pending ? "创建中..." : "创建密钥"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingToken} onOpenChange={(open) => { if (!open) setEditingToken(null) }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>编辑密钥权限</DialogTitle></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {apiTokenScopeOptions.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Checkbox checked={editingScopes.includes(value)} onCheckedChange={(checked) => setEditingScopes((current) => checked === true ? [...current, value] : current.filter((scope) => scope !== value))} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingToken(null)}>取消</Button>
            <Button type="button" disabled={pending || editingScopes.length === 0} onClick={() => { if (editingToken) onUpdate(editingToken.id, { scopes: editingScopes }); setEditingToken(null) }}>保存权限</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "撤销"} destructive={!!pendingConfirm?.destructive} pending={pending} onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function SignaturesSection({ items, mailboxes, loading, pending, onCreate, onUpdate, onSetDefault, onDelete }: { items: MailSignature[]; mailboxes: Mailbox[]; loading: boolean; pending: boolean; onCreate: (form: FormData) => void; onUpdate: (id: string, form: FormData) => void; onSetDefault: (id: string) => void; onDelete: (id: string) => void }) {
  const [mailboxId, setMailboxId] = React.useState("all")
  const [isDefault, setIsDefault] = React.useState(false)
  const [editing, setEditing] = React.useState<MailSignature | null>(null)
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  const editingMailboxId = editing?.mailboxId || "all"
  const editingIsDefault = editing?.isDefault || false
  function resetCreateForm(form: HTMLFormElement) {
    form.reset()
    setMailboxId("all")
    setIsDefault(false)
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>签名管理</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">支持全局签名和按发件邮箱绑定的默认签名。</div>
            </div>
            <div className="text-sm text-muted-foreground">共 {items.length} 个签名</div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4 rounded-lg border p-4" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); form.set("mailboxId", mailboxId === "all" ? "" : mailboxId); form.set("isDefault", isDefault ? "on" : ""); onCreate(form); resetCreateForm(e.currentTarget) }}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="签名名称"><Input name="name" required placeholder="例如：默认签名" /></Field>
              <Field label="绑定邮箱">
                <MailboxSelect value={mailboxId} mailboxes={mailboxes} onChange={setMailboxId} />
              </Field>
            </div>
            <Field label="签名内容">
              <Textarea name="content" required className="min-h-40" placeholder="支持多行文本，写信时会自动转为 HTML" />
            </Field>
            <label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox checked={isDefault} onCheckedChange={(value) => setIsDefault(value === true)} />
              <span>设为当前范围默认签名</span>
            </label>
            <Button disabled={pending}>{pending ? "保存中..." : "创建签名"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>签名列表</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => {
            const mailbox = item.mailboxId ? mailboxes.find((m) => m.id === item.mailboxId)?.address || "未知邮箱" : "全局签名"
            return (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{item.name}</div>
                      {item.isDefault && <Badge>默认</Badge>}
                      <Badge variant="outline">{mailbox}</Badge>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.content}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!item.isDefault && <Button variant="outline" size="sm" disabled={pending} onClick={() => onSetDefault(item.id)}>设为默认</Button>}
                    <Button variant="ghost" size="icon" className="size-8" disabled={pending} onClick={() => setEditing(item)}><PencilLine className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive" disabled={pending} onClick={() => setPendingConfirm({ title: "删除签名？", description: `签名“${item.name}”将被删除。`, confirmText: "删除签名", onConfirm: () => { onDelete(item.id); setPendingConfirm(null) } })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            )
          })}
          {!loading && items.length === 0 && <EmptyState text="暂无签名" />}
        </CardContent>
      </Card>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>编辑签名</DialogTitle></DialogHeader>
          {editing && (
            <form key={editing.id} className="space-y-4" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); form.set("mailboxId", editingMailboxId === "all" ? "" : editingMailboxId); form.set("isDefault", editingIsDefault ? "on" : ""); onUpdate(editing.id, form); setEditing(null) }}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="签名名称"><Input name="name" defaultValue={editing.name} required /></Field>
                <Field label="绑定邮箱">
                  <MailboxSelect value={editingMailboxId} mailboxes={mailboxes} onChange={(value) => setEditing((current) => current ? { ...current, mailboxId: value === "all" ? "" : value } : current)} />
                </Field>
              </div>
              <Field label="签名内容">
                <Textarea name="content" required className="min-h-44" defaultValue={editing.content} />
              </Field>
              <label className="flex items-center gap-3 text-sm font-medium">
                <Checkbox checked={editingIsDefault} onCheckedChange={(value) => setEditing((current) => current ? { ...current, isDefault: value === true } : current)} />
                <span>设为当前范围默认签名</span>
              </label>
              <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button>
                <Button disabled={pending}>{pending ? "保存中..." : "保存修改"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "删除"} destructive pending={pending} onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function ContactsSection({ items, loading, onCreate, onDelete, onCopy, pending }: { items: { id: string; name: string; email: string; note: string }[]; loading: boolean; onCreate: (form: FormData) => void; onDelete: (id: string) => void; onCopy: (text: string) => void; pending: boolean }) {
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle>新增联系人</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onCreate(new FormData(e.currentTarget)); e.currentTarget.reset() }}>
            <Field label="姓名"><Input name="name" placeholder="张三" /></Field>
            <Field label="邮箱"><Input name="email" type="email" required /></Field>
            <Field label="备注"><Input name="note" /></Field>
            <Button className="w-full" disabled={pending}>{pending ? "保存中..." : "保存联系人"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>联系人列表</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="truncate text-xs text-muted-foreground">{item.email}{item.note ? ` · ${item.note}` : ""}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="size-8" onClick={() => onCopy(item.email)}><Copy className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setPendingConfirm({ title: "删除联系人？", description: `${item.email} 将从联系人列表中移除。`, confirmText: "删除联系人", onConfirm: () => { onDelete(item.id); setPendingConfirm(null) } })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          {!loading && items.length === 0 && <EmptyState text="暂无联系人" />}
        </CardContent>
      </Card>
      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "删除"} destructive onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function CleanupSection({ mailbox, stats, showStats, pending, onCleanup }: { mailbox?: Mailbox; stats?: MailStats; showStats: boolean; pending: boolean; onCleanup: (target: "empty-trash" | "empty-spam" | "archive-read-inbox") => void }) {
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  function confirmCleanup(target: "empty-trash" | "empty-spam" | "archive-read-inbox", title: string, destructive = false) {
    setPendingConfirm({
      title,
      description: mailbox ? `将对 ${mailbox.address} 执行此清理操作。` : "请先选择邮箱。",
      confirmText: destructive ? "确认清空" : "确认处理",
      destructive,
      onConfirm: () => { onCleanup(target); setPendingConfirm(null) },
    })
  }
  return (
    <div className="space-y-6">
      {showStats && <StatsSummary stats={stats} />}
      <Card>
        <CardHeader><CardTitle>清理当前邮箱</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <CleanupButton icon={<MailCheck className="h-4 w-4" />} title="归档已读收件箱" disabled={!mailbox || pending} onClick={() => confirmCleanup("archive-read-inbox", "归档已读收件箱？")} />
          <CleanupButton icon={<MailX className="h-4 w-4" />} title="清空垃圾邮件" disabled={!mailbox || pending} onClick={() => confirmCleanup("empty-spam", "清空垃圾邮件？", true)} />
          <CleanupButton icon={<Trash2 className="h-4 w-4" />} title="清空回收站" disabled={!mailbox || pending} onClick={() => confirmCleanup("empty-trash", "清空回收站？", true)} />
        </CardContent>
      </Card>
      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "确认"} destructive={!!pendingConfirm?.destructive} pending={pending} onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

type RuleCreatePayload = {
  mailboxId: string
  name: string
  matchMode: "all" | "any"
  conditions: MailRuleCondition[]
  actions: MailRuleAction[]
  applyToExisting: boolean
  stopProcessing: boolean
  enabled: boolean
}

type RuleConditionField = NonNullable<MailRuleCondition["field"]>
type RuleConditionOperator = NonNullable<MailRuleCondition["operator"]>
const conditionFieldLabels: Record<RuleConditionField, string> = { from: "发件人地址", to: "收件人地址", cc: "抄送地址", subject: "邮件主题", body: "邮件正文", attachment: "附件名称", size: "邮件大小", date: "收信日期" }
const conditionFieldShortLabels: Record<RuleConditionField, string> = { from: "发件人", to: "收件人", cc: "抄送", subject: "邮件主题", body: "body", attachment: "附件", size: "邮件大小", date: "收信日期" }
const conditionOperatorLabels: Record<RuleConditionOperator, string> = { contains: "包含", "not-contains": "不包含", equals: "等于", "not-equals": "不等于", "starts-with": "开头是", "ends-with": "结尾是", gt: "大于", gte: "大于等于", lt: "小于", lte: "小于等于", before: "早于", after: "晚于", on: "当天" }
const textConditionOperators: RuleConditionOperator[] = ["contains", "not-contains", "equals", "not-equals", "starts-with", "ends-with"]
const sizeConditionOperators: RuleConditionOperator[] = ["gt", "gte", "lt", "lte", "equals", "not-equals"]
const dateConditionOperators: RuleConditionOperator[] = ["before", "after", "on", "equals", "not-equals"]
const conditionFields = Object.keys(conditionFieldLabels) as RuleConditionField[]
const commonRuleFolders = ["Inbox", "Archive", "Spam", "Trash"]
const ruleActionLabels: Record<MailRuleAction["type"], string> = { archive: "移入归档", trash: "移入回收站", star: "添加星标", "mark-read": "标记已读", label: "添加标签", move: "移动到", forward: "邮件转发" }

function RulesSection({ items, mailboxes, labels, verifiedEmails, open, onOpenChange, onCreate, onUpdate, onToggle, onMove, onApply, onDelete, pending }: { items: MailRule[]; mailboxes: Mailbox[]; labels: MailLabel[]; verifiedEmails: string[]; open: boolean; onOpenChange: (open: boolean) => void; onCreate: (payload: RuleCreatePayload) => void; onUpdate: (id: string, payload: RuleCreatePayload) => void; onToggle: (item: MailRule) => void; onMove: (id: string, direction: "up" | "down") => void; onApply: (id: string) => void; onDelete: (id: string) => void; pending: boolean }) {
  const [editingRule, setEditingRule] = React.useState<MailRule | null>(null)

  function setDialogOpen(next: boolean) {
    if (!next) setEditingRule(null)
    onOpenChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-stretch sm:justify-end">
        <Button className="h-9 w-full rounded-md px-4 text-sm font-normal sm:w-auto" onClick={() => { setEditingRule(null); onOpenChange(true) }}>新建规则</Button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => <RuleListItem key={item.id} item={item} index={index} count={items.length} pending={pending} onEdit={() => { setEditingRule(item); onOpenChange(true) }} onToggle={() => onToggle(item)} onMove={(direction) => onMove(item.id, direction)} onApply={() => onApply(item.id)} onDelete={onDelete} />)}
        {items.length === 0 && <EmptyState icon={<SlidersHorizontal />} text="暂无收件规则" description="新建规则后，可自动标记、移动或转发符合条件的邮件。" className="min-h-[180px] border-solid bg-card" />}
      </div>
      <RuleDialog open={open} onOpenChange={setDialogOpen} mailboxes={mailboxes} labels={labels} verifiedEmails={verifiedEmails} pending={pending} initialRule={editingRule} onSave={(payload) => editingRule ? onUpdate(editingRule.id, payload) : onCreate(payload)} />
    </div>
  )
}

function RuleDialog({ open, onOpenChange, mailboxes, labels, verifiedEmails, pending, initialRule, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; mailboxes: Mailbox[]; labels: MailLabel[]; verifiedEmails: string[]; pending: boolean; initialRule: MailRule | null; onSave: (payload: RuleCreatePayload) => void }) {
  const [name, setName] = React.useState("我的规则")
  const [mailboxId, setMailboxId] = React.useState("all")
  const [matchMode, setMatchMode] = React.useState<"all" | "any">("all")
  const [conditions, setConditions] = React.useState<MailRuleCondition[]>([{ field: "to", operator: "contains", value: "" }])
  const [actions, setActions] = React.useState<MailRuleAction[]>([{ type: "forward", value: "" }])
  const [enabled, setEnabled] = React.useState(true)
  const [applyToExisting, setApplyToExisting] = React.useState(false)
  const [stopProcessing, setStopProcessing] = React.useState(false)
  const selectedMailboxId = mailboxId === "all" ? "" : mailboxId
  const labelQuery = useQuery({ queryKey: ["labels", "rule-dialog", selectedMailboxId], queryFn: () => api.labels(selectedMailboxId), enabled: !!selectedMailboxId })
  const availableLabels = selectedMailboxId ? (labelQuery.data?.items || []) : labels

  React.useEffect(() => {
    if (!open) return
    setName(initialRule?.name || "我的规则")
    setMailboxId(initialRule?.mailboxId || "all")
    setMatchMode(initialRule?.matchMode || "all")
    setConditions(initialRule?.conditions.length ? initialRule.conditions : [{ field: "to", operator: "contains", value: "" }])
    setActions(initialRule?.actions.length ? initialRule.actions : [{ type: "forward", value: "" }])
    setEnabled(initialRule?.enabled ?? true)
    setApplyToExisting(initialRule?.applyToExisting ?? false)
    setStopProcessing(initialRule?.stopProcessing ?? false)
  }, [initialRule, open])

  function updateCondition(index: number, patch: Partial<MailRuleCondition>) {
    setConditions((items) => items.map((item, i) => {
      if (i !== index) return item
      const next = { ...item, ...patch }
      if (patch.field && !conditionOperatorsForField(patch.field).includes(next.operator || "contains")) {
        next.operator = defaultConditionOperator(patch.field)
      }
      return next
    }))
  }
  function updateAction(index: number, patch: Partial<MailRuleAction>) {
    setActions((items) => items.map((item, i) => i === index ? normalizeDraftAction({ ...item, ...patch }, availableLabels) : item))
  }
  function addCondition() { setConditions((items) => [...items, { field: "subject", operator: "contains", value: "" }]) }
  function addAction() { setActions((items) => [...items, { type: "forward", value: "" }]) }
  function removeCondition(index: number) { setConditions((items) => items.length > 1 ? items.filter((_, i) => i !== index) : items) }
  function removeAction(index: number) { setActions((items) => items.length > 1 ? items.filter((_, i) => i !== index) : items) }

  const validConditions = conditions.map((item) => ({ ...item, value: (item.value || "").trim() })).filter((item) => item.field && item.operator && item.value)
  const validActions = actions.map((item) => normalizeDraftAction(item, availableLabels)).map((item) => item.type === "forward" ? { ...item, value: verifiedRuleForwardTargets(item.value || "", verifiedEmails).join(", ") } : item).filter((item) => item.type !== "label" || item.value || item.labelId).filter((item) => item.type !== "move" || item.value).filter((item) => item.type !== "forward" || item.value)
  const canCreate = validConditions.length > 0 && validActions.length > 0 && !pending

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    onSave({ mailboxId: selectedMailboxId, name: name.trim() || "我的规则", matchMode, conditions: validConditions, actions: validActions, applyToExisting, stopProcessing, enabled })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-svh w-screen max-w-none gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:w-[min(94vw,56rem)]">
        <DialogHeader className="border-b px-4 py-4 text-left sm:px-8 sm:py-6">
          <DialogTitle className="text-xl sm:text-2xl">{initialRule ? "编辑规则" : "新建规则"}</DialogTitle>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:space-y-7 sm:px-8 sm:py-7">
            <Field label="名称"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="我的规则" /></Field>
            <Field label="适用邮箱"><MailboxSelect value={mailboxId} mailboxes={mailboxes} onChange={setMailboxId} /></Field>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span>当新邮件到达时，满足以下</span>
                <Select value={matchMode} onValueChange={(value) => setMatchMode(value as "all" | "any")}>
                  <SelectTrigger className="h-9 w-[132px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">所有条件</SelectItem><SelectItem value="any">任一条件</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                {conditions.map((condition, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[180px_128px_minmax(0,1fr)_auto_auto]">
                    <Select value={condition.field || "from"} onValueChange={(value) => updateCondition(index, { field: value as RuleConditionField })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{conditionFields.map((value) => <SelectItem key={value} value={value}>{conditionFieldLabels[value]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={condition.operator || defaultConditionOperator(condition.field)} onValueChange={(value) => updateCondition(index, { operator: value as RuleConditionOperator })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{conditionOperatorsForField(condition.field).map((value) => <SelectItem key={value} value={value}>{conditionOperatorLabels[value]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type={condition.field === "date" ? "date" : "text"} value={condition.value || ""} onChange={(event) => updateCondition(index, { value: event.target.value })} placeholder={conditionPlaceholder(condition.field)} />
                    <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={() => removeCondition(index)} disabled={conditions.length === 1}><X className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" onClick={addCondition}><Plus className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm">执行以下动作</div>
              <div className="space-y-3">
                {actions.map((action, index) => (
                  <div key={index} className={cn("grid gap-3", action.type === "forward" ? "md:grid-cols-[180px_minmax(0,1fr)_auto]" : "md:grid-cols-[180px_minmax(0,1fr)_auto_auto]")}>
                    <Select value={action.type} onValueChange={(value) => updateAction(index, { type: value as MailRuleAction["type"], value: "", labelId: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(ruleActionLabels) as MailRuleAction["type"][]).map((value) => <SelectItem key={value} value={value}>{ruleActionLabels[value]}</SelectItem>)}</SelectContent>
                    </Select>
                    <RuleActionValue action={action} labels={availableLabels} verifiedEmails={verifiedEmails} onChange={(patch) => updateAction(index, patch)} />
                    <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" onClick={() => removeAction(index)} disabled={actions.length === 1}><X className="h-4 w-4" /></Button>
                    {action.type !== "forward" && <Button type="button" variant="ghost" size="icon" onClick={addAction}><Plus className="h-4 w-4" /></Button>}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <RuleCheckbox checked={enabled} onCheckedChange={setEnabled} label="立即启用" />
              <RuleCheckbox checked={applyToExisting} onCheckedChange={setApplyToExisting} label="应用于现有邮件" />
              <div className="flex items-center gap-2">
                <RuleCheckbox checked={stopProcessing} onCheckedChange={setStopProcessing} label="终止规则：命中此规则后不再应用其他规则" />
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t px-4 py-4 sm:px-8 sm:py-5 [&>button]:w-full sm:[&>button]:w-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button disabled={!canCreate}>{pending ? "保存中..." : initialRule ? "保存修改" : "创建"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RuleActionValue({ action, labels, verifiedEmails, onChange }: { action: MailRuleAction; labels: MailLabel[]; verifiedEmails: string[]; onChange: (patch: Partial<MailRuleAction>) => void }) {
  if (action.type === "label") {
    if (labels.length > 0) {
      return (
        <Select value={action.value || labels[0].name} onValueChange={(value) => onChange({ value, labelId: labels.find((item) => item.name === value)?.id || "" })}>
          <SelectTrigger><SelectValue placeholder="选择标签" /></SelectTrigger>
          <SelectContent>{labels.map((label) => <SelectItem key={label.id} value={label.name}>{label.name}</SelectItem>)}</SelectContent>
        </Select>
      )
    }
    return <Input value={action.value || ""} onChange={(event) => onChange({ value: event.target.value, labelId: "" })} placeholder="标签名称" />
  }
  if (action.type === "move") {
    const value = action.value || "Archive"
    return (
      <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
        <Select value={commonRuleFolders.includes(value) ? value : "__custom"} onValueChange={(next) => onChange({ value: next === "__custom" ? "" : next })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Inbox">收件箱</SelectItem>
            <SelectItem value="Archive">归档</SelectItem>
            <SelectItem value="Spam">垃圾邮件</SelectItem>
            <SelectItem value="Trash">回收站</SelectItem>
            <SelectItem value="__custom">自定义文件夹</SelectItem>
          </SelectContent>
        </Select>
        <Input value={value} onChange={(event) => onChange({ value: event.target.value })} placeholder="输入或选择文件夹名" />
      </div>
    )
  }
  if (action.type === "forward") {
    return <RuleForwardTargets value={action.value || ""} emails={verifiedEmails} onChange={(value) => onChange({ value })} />
  }
  return <Input value="无需填写" readOnly />
}

function RuleForwardTargets({ value, emails, onChange }: { value: string; emails: string[]; onChange: (value: string) => void }) {
  const selected = React.useMemo(() => verifiedRuleForwardTargets(value, emails), [emails, value])
  return <ForwardingTargetPicker emails={emails} selected={selected} onChange={(targets) => onChange(targets.join(", "))} placement="top" />
}

function verifiedRuleForwardTargets(value: string, verifiedEmails: string[]) {
  const verifiedByAddress = new Map(verifiedEmails.map((email) => [email.trim().toLowerCase(), email.trim()]))
  return Array.from(new Set(value.split(/[\n\r,，;；]+/).map((item) => verifiedByAddress.get(item.trim().toLowerCase())).filter((item): item is string => !!item)))
}

function RuleCheckbox({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (checked: boolean) => void; label: string }) {
  const id = React.useId()
  return <div className="flex items-center gap-3"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} /><Label htmlFor={id} className="text-base font-medium">{label}</Label></div>
}

function RuleListItem({ item, index, count, pending, onEdit, onToggle, onMove, onApply, onDelete }: { item: MailRule; index: number; count: number; pending: boolean; onEdit: () => void; onToggle: () => void; onMove: (direction: "up" | "down") => void; onApply: () => void; onDelete: (id: string) => void }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const conditionText = ruleConditionSummary(item.conditions, item.fromContains, item.subjectContains)
  const actionText = item.actions.map(ruleActionSummary).filter(Boolean).join("；") || "无动作"
  const moveDirection = index === 0 ? "down" : "up"
  const canMove = count > 1
  return (
    <div className="grid min-h-[110px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-4 py-4 transition-colors hover:bg-muted/20">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2 leading-6">
          <h3 className="truncate text-base font-semibold text-foreground">{item.name}</h3>
          <span className={cn("shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium", item.enabled ? "text-emerald-700" : "bg-muted text-muted-foreground")}>{item.enabled ? "已启用" : "已停用"}</span>
        </div>
        <div className="grid text-sm leading-6 text-muted-foreground">
          <p className="truncate"><span className="text-muted-foreground">条件：</span> {conditionText}</p>
          <p className="truncate"><span className="text-muted-foreground">动作：</span> {actionText}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={pending || !canMove} onClick={() => onMove(moveDirection)} aria-label={moveDirection === "up" ? "上移" : "下移"} title={moveDirection === "up" ? "上移" : "下移"}>{moveDirection === "up" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button>
        <span className="mx-1 h-6 w-px bg-border" />
        <Button type="button" variant="ghost" size="icon" className={cn("size-7", item.enabled ? "text-emerald-600" : "text-muted-foreground")} disabled={pending} onClick={onToggle} aria-label={item.enabled ? "禁用规则" : "启用规则"} title={item.enabled ? "禁用规则" : "启用规则"}>{item.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}</Button>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={pending} onClick={onEdit} aria-label="编辑规则" title="编辑规则"><PencilLine className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground" disabled={pending} onClick={onApply} aria-label="应用到现有邮件" title="应用到现有邮件"><PlayCircle className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => setConfirmOpen(true)} aria-label="删除规则" title="删除规则"><Trash2 className="h-4 w-4" /></Button>
      </div>
      <ConfirmDialog open={confirmOpen} title="删除收件规则？" description={`规则“${item.name}”将不再处理后续邮件。`} confirmText="删除规则" destructive onOpenChange={setConfirmOpen} onConfirm={() => { onDelete(item.id); setConfirmOpen(false) }} />
    </div>
  )
}

function normalizeDraftAction(action: MailRuleAction, labels: MailLabel[]): MailRuleAction {
  if (action.type === "label") {
    const value = action.value || labels[0]?.name || ""
    return { type: "label", value, labelId: labels.find((label) => label.name === value)?.id || action.labelId || "" }
  }
  if (action.type === "move") return { type: "move", value: action.value || "Archive" }
  if (action.type === "forward") return { type: "forward", value: (action.value || "").trim() }
  return { type: action.type }
}

function conditionOperatorsForField(field?: MailRuleCondition["field"]) {
  if (field === "size") return sizeConditionOperators
  if (field === "date") return dateConditionOperators
  return textConditionOperators
}

function defaultConditionOperator(field?: MailRuleCondition["field"]): RuleConditionOperator {
  if (field === "size") return "gte"
  if (field === "date") return "on"
  return "contains"
}

function conditionPlaceholder(field?: MailRuleCondition["field"]) {
  if (field === "size") return "例如 10mb"
  if (field === "date") return "选择日期"
  if (field === "attachment") return "输入附件名或扩展名"
  if (field === "to" || field === "from" || field === "cc") return "输入邮箱或关键词"
  if (field === "subject") return "输入主题关键词"
  return "输入值"
}

function ruleConditionSummary(conditions: MailRuleCondition[] = [], fromContains = "", subjectContains = "") {
  const items = conditions.length > 0 ? conditions : [fromContains ? { field: "from", operator: "contains", value: fromContains } as MailRuleCondition : undefined, subjectContains ? { field: "subject", operator: "contains", value: subjectContains } as MailRuleCondition : undefined].filter(Boolean) as MailRuleCondition[]
  return items.map(ruleConditionItemSummary).join("；") || "无条件"
}

function ruleConditionItemSummary(item: MailRuleCondition): string {
  if (item.conditions?.length) {
    const mode = item.matchMode === "any" ? "任一" : "全部"
    return `${mode}(${item.conditions.map(ruleConditionItemSummary).join("；")})`
  }
  const field = item.field || "from"
  const operator = item.operator || defaultConditionOperator(field)
  const value = item.value ? `"${item.value}"` : ""
  return `${conditionFieldShortLabels[field]}${conditionOperatorLabels[operator]}${value}`
}

function ruleActionSummary(action: MailRuleAction) {
  if (action.type === "label") return `${ruleActionLabels[action.type]}${action.value ? `："${action.value}"` : ""}`
  if (action.type === "move") return `${ruleActionLabels[action.type]}"${folderLabel(action.value || "Archive")}"`
  if (action.type === "forward") return `${ruleActionLabels[action.type]}${action.value ? `：${action.value}` : ""}`
  return ruleActionLabels[action.type]
}

function BlockedSection({ items, mailboxes, mailboxId, spamCount, onMailboxChange, onCreate, onDelete, pending }: { items: any[]; mailboxes: Mailbox[]; mailboxId: string; spamCount: number; onMailboxChange: (value: string) => void; onCreate: (form: FormData) => void; onDelete: (id: string) => void; pending: boolean }) {
  const [pendingConfirm, setPendingConfirm] = React.useState<PendingConfirm | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCreate(new FormData(event.currentTarget))
    event.currentTarget.reset()
    setDialogOpen(false)
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium text-muted-foreground">共 {spamCount} 封垃圾邮件 · {items.length} 条发件人拦截规则</div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />新增拦截</Button>
      </div>
      <SettingsCard title="被拦截邮件" subtitle="发件人命中拦截规则后会进入垃圾邮件，规则可随时移除。" contentClassName="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{item.email}</div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.mailboxId ? mailboxes.find((m) => m.id === item.mailboxId)?.address : "全部邮箱"}{item.reason ? ` · ${item.reason}` : ""}</div>
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setPendingConfirm({ title: "移除拦截规则？", description: `${item.email} 之后将不再被此规则拦截。`, confirmText: "移除规则", onConfirm: () => { onDelete(item.id); setPendingConfirm(null) } })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {items.length === 0 && <EmptyState icon={<ShieldCheck />} text="没有被拦截的邮件" description="当前没有发件人拦截规则，所有邮件都会按正常规则投递。" />}
      </SettingsCard>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[min(92vw,30rem)] max-w-none">
          <DialogHeader><DialogTitle>新增拦截发件人</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="适用邮箱"><MailboxSelect value={mailboxId} mailboxes={mailboxes} onChange={onMailboxChange} /></Field>
            <Field label="发件人邮箱"><Input name="email" type="email" required placeholder="sender@example.com" /></Field>
            <Field label="原因"><Input name="reason" placeholder="可选，例如：广告、骚扰邮件" /></Field>
            <DialogFooter className="gap-2 [&>button]:w-full sm:[&>button]:w-auto">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button disabled={pending}>{pending ? "保存中..." : "加入拦截"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!pendingConfirm} title={pendingConfirm?.title || ""} description={pendingConfirm?.description} confirmText={pendingConfirm?.confirmText || "移除"} destructive onOpenChange={(open) => { if (!open) setPendingConfirm(null) }} onConfirm={() => pendingConfirm?.onConfirm()} />
    </div>
  )
}

function StatsSection({ stats }: { stats?: MailStats; mailbox?: Mailbox; rangeDays: number; onRangeChange: (days: number) => void; onRefresh: () => void }) {
  const quotaLabel = stats?.quotaBytes ? `${formatBytes(stats.storageBytes || 0)} / ${formatBytes(stats.quotaBytes)}` : formatBytes(stats?.storageBytes || 0)
  const quotaPct = Math.min(stats?.quotaUsedPct || 0, 100)
  const primaryCards = [
    { label: "总收件", value: stats?.totalIncoming || 0, icon: <Mail className="h-4 w-4" />, tone: "bg-muted text-foreground" },
    { label: "总发件", value: stats?.totalOutgoing || 0, icon: <SendHorizontal className="h-4 w-4" />, tone: "bg-emerald-50 text-emerald-600" },
    { label: "未读邮件", value: stats?.unreadMessages || 0, icon: <MailCheck className="h-4 w-4" />, tone: "bg-amber-50 text-amber-600" },
    { label: "存储用量", value: formatBytes(stats?.storageBytes || 0), subvalue: stats?.quotaBytes ? `/ ${formatBytes(stats.quotaBytes)} (${quotaPct.toFixed(0)}%)` : "不限", icon: <HardDrive className="h-4 w-4" />, tone: "bg-violet-50 text-violet-600" },
  ]
  const secondaryStats = [
    { label: "今日发件", value: stats?.todayOutgoing || 0 },
    { label: "草稿", value: stats?.draftMessages || 0 },
    { label: "发送失败", value: stats?.failedSends || 0 },
    { label: "平均邮件大小", value: formatBytes(stats?.averageMessageBytes || 0) },
  ]
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {primaryCards.map((card) => (
          <div key={card.label} className="grid h-[106px] grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-card px-5">
            <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", card.tone)}>{card.icon}</div>
            <div className="min-w-0">
              <div className="truncate text-sm text-muted-foreground">{card.label}</div>
              <div className="truncate text-2xl font-semibold leading-8 text-foreground">{card.value}</div>
              {"subvalue" in card && <div className="truncate text-xs leading-4 text-muted-foreground">{card.subvalue}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryStats.map((item) => (
          <div key={item.label} className="flex h-[54px] items-center justify-between gap-3 rounded-lg border bg-background px-4 text-sm">
            <div className="truncate text-sm text-muted-foreground">{item.label}</div>
            <div className="shrink-0 font-semibold text-foreground">{item.value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <StatsPanel title="收发趋势" className="h-[321px]">
          <StatsTrendChart points={stats?.trend || []} />
        </StatsPanel>
        <StatsPanel title="邮件分布" className="h-[321px]">
          <StatsDistribution items={stats?.distribution || []} />
        </StatsPanel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <StatsPanel title="存储用量" className="h-[338px]">
          <StatsStorage quotaLabel={quotaLabel} quotaPct={quotaPct} hasQuota={!!stats?.quotaBytes} />
        </StatsPanel>
        <StatsPanel title="常用联系人" className="h-[338px]">
          <StatsContacts contacts={stats?.topContacts || []} />
        </StatsPanel>
      </div>
    </div>
  )
}

function StatsPanel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div className="px-5 pb-2 pt-4">
        <h2 className="text-base font-semibold leading-6 text-foreground">{title}</h2>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

function StatsTrendChart({ points }: { points: MailStats["trend"] }) {
  const data = points.length ? points : [{ date: "", incoming: 0, outgoing: 0 }]
  const maxValue = Math.max(...data.flatMap((item) => [item.incoming, item.outgoing]), 1)
  const width = 520
  const height = 148
  const padding = { top: 12, right: 10, bottom: 22, left: 32 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const xFor = (index: number) => padding.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth)
  const yFor = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight
  const pathFor = (key: "incoming" | "outgoing") => data.map((item, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(item[key]).toFixed(1)}`).join(" ")
  const ticks = trendTicks(data)
  return (
    <div className="h-[250px] rounded-md bg-background">
      <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-foreground" />收件</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />发件</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[226px] w-full overflow-visible" role="img" aria-label="邮件收发趋势">
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padding.top + plotHeight * step
          return <line key={step} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-border" strokeDasharray={step === 1 ? undefined : "3 5"} />
        })}
        <path d={pathFor("incoming")} fill="none" className="stroke-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor("outgoing")} fill="none" className="stroke-emerald-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => (
          <g key={`${item.date}-${index}`}>
            <circle cx={xFor(index)} cy={yFor(item.incoming)} r="2.8" className="fill-foreground" />
            <circle cx={xFor(index)} cy={yFor(item.outgoing)} r="2.8" className="fill-emerald-500" />
          </g>
        ))}
        <text x="0" y={padding.top + 4} className="fill-muted-foreground text-[11px]">{maxValue}</text>
        <text x="0" y={padding.top + plotHeight + 4} className="fill-muted-foreground text-[11px]">0</text>
        {ticks.map((tick) => (
          <text key={`${tick.index}-${tick.label}`} x={xFor(tick.index)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">{tick.label}</text>
        ))}
      </svg>
    </div>
  )
}

function trendTicks(data: MailStats["trend"]) {
  if (data.length === 0) return []
  const count = Math.min(5, data.length)
  const seen = new Set<number>()
  const ticks: { index: number; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const index = count === 1 ? 0 : Math.round((i / (count - 1)) * (data.length - 1))
    if (seen.has(index)) continue
    seen.add(index)
    ticks.push({ index, label: formatStatsDate(data[index]?.date || "") })
  }
  return ticks
}

function formatStatsDate(value: string) {
  if (!value) return ""
  const [, month, day] = value.split("-")
  return month && day ? `${month}-${day}` : value
}

function StatsDistribution({ items }: { items: MailStats["distribution"] }) {
  const rows = items.length ? items : [
    { key: "inbox", label: "收件箱", count: 0 },
    { key: "archive", label: "已归档", count: 0 },
    { key: "spam", label: "垃圾邮件", count: 0 },
    { key: "trash", label: "已删除", count: 0 },
    { key: "attachments", label: "有附件", count: 0 },
    { key: "starred", label: "已加旗标", count: 0 },
  ]
  const maxCount = Math.max(...rows.map((row) => row.count), 1)
  return (
    <div className="space-y-3 py-3">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
          <div className="truncate font-medium text-muted-foreground">{row.label}</div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", distributionBarTone(row.key))} style={{ width: `${Math.max(row.count > 0 ? 6 : 0, Math.round((row.count / maxCount) * 100))}%` }} />
          </div>
          <div className="text-right font-semibold text-foreground">{row.count}</div>
        </div>
      ))}
    </div>
  )
}

function distributionBarTone(key: string) {
  if (key === "archive") return "bg-sky-500"
  if (key === "spam") return "bg-amber-400"
  if (key === "trash") return "bg-red-500"
  if (key === "attachments") return "bg-violet-500"
  if (key === "starred") return "bg-slate-600"
  return "bg-slate-900"
}

function StatsStorage({ quotaLabel, quotaPct, hasQuota }: { quotaLabel: string; quotaPct: number; hasQuota: boolean }) {
  return (
    <div className="h-[260px] pt-3">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{quotaLabel}</div>
        <div className="text-xs font-semibold text-foreground">{hasQuota ? `${quotaPct.toFixed(0)}%` : "不限"}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${hasQuota ? quotaPct : 12}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{quotaPct >= 90 ? "存储容量接近上限，请及时清理。" : "存储容量使用正常。"}</p>
    </div>
  )
}

function StatsContacts({ contacts }: { contacts: MailStats["topContacts"] }) {
  if (contacts.length === 0) return <EmptyState icon={<Users />} text="暂无常用联系人" description="有邮件往来后会显示联系人排行" className="h-[260px] min-h-0 py-4" />
  return (
    <div className="h-[260px] space-y-1 overflow-hidden pt-1">
      {contacts.slice(0, 10).map((item, index) => (
        <div key={item.email} className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-sm leading-6">
          <div className="text-center font-semibold text-muted-foreground">{index + 1}</div>
          <div className="min-w-0 truncate font-medium text-foreground">{item.email}</div>
          <div className="text-right font-semibold text-muted-foreground">{item.count} 封</div>
        </div>
      ))}
    </div>
  )
}

function StatsSummary({ stats }: { stats?: MailStats }) {
  const quotaLabel = stats?.quotaBytes ? `${formatBytes(stats.storageBytes || 0)} / ${formatBytes(stats.quotaBytes)}` : formatBytes(stats?.storageBytes || 0)
  const cards = [
    { label: "总邮件", value: stats?.totalMessages || 0, icon: <Mail className="h-4 w-4" />, tone: "bg-zinc-100 text-zinc-700" },
    { label: "未读", value: stats?.unreadMessages || 0, icon: <MailCheck className="h-4 w-4" />, tone: "bg-emerald-50 text-emerald-600" },
    { label: "星标", value: stats?.starredMessages || 0, icon: <ShieldCheck className="h-4 w-4" />, tone: "bg-amber-50 text-amber-600" },
    { label: "附件", value: `${stats?.attachmentCount || 0} / ${formatBytes(stats?.attachmentBytes || 0)}`, icon: <Image className="h-4 w-4" />, tone: "bg-violet-50 text-violet-600" },
    { label: stats?.quotaBytes ? `容量 ${Math.min(stats.quotaUsedPct || 0, 999).toFixed(1)}%` : "容量", value: quotaLabel, icon: <BarChart3 className="h-4 w-4" />, tone: "bg-slate-100 text-slate-700" },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", card.tone)}>{card.icon}</div>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold leading-6 text-foreground">{card.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{card.label}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FolderDistribution({ stats }: { stats?: MailStats }) {
  const rows = stats?.byFolder || []
  const maxCount = Math.max(...rows.map((row) => row.count), 1)
  if (rows.length === 0) return <EmptyState text="暂无文件夹统计" />
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = Math.max(4, Math.round((row.count / maxCount) * 100))
        return (
          <div key={row.folder} className="grid gap-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
            <div className="font-medium text-foreground">{folderLabel(row.folder)}</div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/85" style={{ width: `${width}%` }} />
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:justify-end">
              <Badge variant="secondary">{row.count} 封</Badge>
              <span>未读 {row.unread}</span>
              <span>{formatBytes(row.bytes)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CleanupButton({ icon, title, disabled, onClick }: { icon: React.ReactNode; title: string; disabled: boolean; onClick: () => void }) { return <Button variant="outline" className="h-auto justify-start p-4 text-left" disabled={disabled} onClick={onClick}><div className="mr-3 rounded-lg bg-muted p-2">{icon}</div><div className="font-medium">{title}</div></Button> }
function MailboxSelect({ value, mailboxes, onChange }: { value: string; mailboxes: Mailbox[]; onChange: (value: string) => void }) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部邮箱</SelectItem>{mailboxes.map((m) => <SelectItem key={m.id} value={m.id}>{m.address}</SelectItem>)}</SelectContent></Select> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div> }
function EmptyState({ text, description, icon, action, className }: { text: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-h-[132px] place-items-center rounded-lg border border-dashed bg-background/60 px-6 py-8 text-center", className)}>
      <div className="flex max-w-sm flex-col items-center">
        {icon && <div className="mb-3 text-muted-foreground/70 [&>svg]:h-9 [&>svg]:w-9 [&>svg]:stroke-[1.5]">{icon}</div>}
        <div className="text-sm font-medium text-muted-foreground">{text}</div>
        {description && <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  )
}
function folderLabel(folder: string) { return ({ Inbox: "收件箱", Sent: "已发送", Drafts: "草稿箱", Archive: "归档", Spam: "垃圾邮件", Trash: "回收站" } as Record<string, string>)[folder] || folder }
function clientServerHost(hostname?: string, address?: string) { const value = (hostname || "").trim(); if (value) return value; const domain = (address || "").split("@")[1]; return domain ? `mail.${domain}` : "mail.example.com" }
function AccountHeader({ name, email, darkMode, onToggleTheme, onBack }: { name: string; email?: string; darkMode: boolean; onToggleTheme: () => void; onBack: () => void }) {
  const displayName = cleanAccountName(name, email)
  return (
    <div className="flex h-full items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-[32px] rounded-full">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{accountInitial(displayName, email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 truncate text-sm font-semibold leading-5">{displayName}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSwitcher compact />
        <Button type="button" variant="ghost" size="icon" className="size-[28px] rounded-md text-muted-foreground" onClick={onToggleTheme}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-[28px] rounded-md text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
function cleanAccountName(name: string, email?: string) { const value = name.trim(); if (!value || (email && value.toLowerCase() === email.toLowerCase())) return email?.split("@")[0] || "用户"; return value }
function accountInitial(name: string, email?: string) { const source = cleanAccountName(name, email); const first = Array.from(source.trim())[0]; return (first || "蓝").toUpperCase() }
