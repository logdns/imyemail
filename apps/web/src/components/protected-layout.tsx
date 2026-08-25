import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Outlet, Link, useLocation } from "react-router-dom"
import { BarChart3, ClipboardList, Forward, Globe2, Inbox, LogOut, Mail, Mailbox, MessageSquare, Settings, ShieldCheck, UserCog } from "lucide-react"
import { useMe } from "@/hooks/use-me"
import { useLogout } from "@/hooks/use-logout"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SystemVersionDialog } from "@/components/system-version-dialog"
import { hasAnyPermission } from "@/lib/permissions"
import type { PermissionKey } from "@/lib/api-types"
import { api } from "@/lib/api"
import { getInitialUITemplate } from "@/lib/ui-template"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const adminSections: { key: string; label: string; icon: React.ReactNode; permissions: PermissionKey[] }[] = [
  { key: "overview", label: "数据总览", icon: <BarChart3 />, permissions: ["admin.overview.view"] },
  { key: "users", label: "账号管理", icon: <UserCog />, permissions: ["admin.users.view"] },
  { key: "permissionGroups", label: "权限配额", icon: <ShieldCheck />, permissions: ["admin.permission_groups.view"] },
  { key: "domains", label: "域名管理", icon: <Globe2 />, permissions: ["admin.domains.view", "admin.dns.view"] },
  { key: "mailboxes", label: "邮箱管理", icon: <Mailbox />, permissions: ["admin.mailboxes.view"] },
  { key: "aliases", label: "邮件转发", icon: <Forward />, permissions: ["admin.aliases.view"] },
  { key: "messages", label: "全部邮件", icon: <Inbox />, permissions: ["admin.messages.view"] },
  { key: "sendAudit", label: "发送队列", icon: <ClipboardList />, permissions: ["admin.messages.view"] },
  { key: "feedback", label: "反馈工单", icon: <MessageSquare />, permissions: ["admin.feedback.view"] },
  { key: "settings", label: "系统设置", icon: <Settings />, permissions: ["admin.settings.view", "admin.templates.view"] },
]

export function ProtectedLayout() {
  return (
    <AuthGuard>
      <ProtectedContent />
    </AuthGuard>
  )
}

function ProtectedContent() {
  const me = useMe()
  const location = useLocation()
  const logout = useLogout()
  const publicSettings = useQuery({ queryKey: ["public-settings"], queryFn: api.publicSettings })

  const user = me.data!.user
  const isMailRoute = location.pathname === "/" || location.pathname.startsWith("/mail")
  const isProfileRoute = location.pathname.startsWith("/profile")
  const isAdminRoute = location.pathname.startsWith("/admin")
  const adminSection = new URLSearchParams(location.search).get("section") || "overview"
  const visibleAdminSections = adminSections.filter((item) => hasAnyPermission(user, item.permissions))
  const siteName = publicSettings.data?.siteName || "imyemail"
  const uiTemplate = publicSettings.data?.uiTemplate || getInitialUITemplate()

  if (isMailRoute || isProfileRoute) {
    return <Outlet />
  }

  return (
    <SidebarProvider className="app-page app-page-admin">
      <Sidebar collapsible="icon" variant={uiTemplate === "imyemailcloud" ? "inset" : "sidebar"}>
        <SidebarHeader className="border-b">
          <div className="space-y-1 group-data-[collapsible=icon]:space-y-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Mail className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{siteName}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {isAdminRoute && <SystemVersionDialog className="ml-10" />}
          </div>
        </SidebarHeader>
        <SidebarContent>
          {isAdminRoute && visibleAdminSections.length > 0 && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <AdminSectionItems activeSection={adminSection} sections={visibleAdminSections} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:!p-0" asChild>
                <Link to="/profile">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-muted text-foreground">
                      {user.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.loginName || user.email}</span>
                  </div>
                  <Badge variant={user.role === "admin" ? "default" : "secondary"} className="ml-auto text-[10px]">
                    {user.role === "admin" ? "管理员" : "普通用户"}
                  </Badge>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="p-2">
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />退出登录
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <div className="admin-page-shell flex min-h-svh flex-col bg-muted/20">
          <header className="sy-admin-header hidden h-14 shrink-0 items-center justify-between border-b bg-background px-5">
            <div className="min-w-0">
              <span className="text-xs text-muted-foreground">{siteName} / 系统管理</span>
              <div className="truncate text-sm font-medium">{visibleAdminSections.find((item) => item.key === adminSection)?.label || "系统管理"}</div>
            </div>
            <Badge variant="secondary" className="font-normal">{user.displayName}</Badge>
          </header>
          <div className="flex h-12 items-center gap-3 border-b bg-background px-3 md:hidden">
            <SidebarTrigger aria-label="打开导航" />
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">
              {isAdminRoute ? visibleAdminSections.find((item) => item.key === adminSection)?.label || "系统管理" : siteName}
            </div>
          </div>
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function AdminSectionItems({ activeSection, sections }: { activeSection: string; sections: typeof adminSections }) {
  const { isMobile, setOpenMobile } = useSidebar()

  function closeMobile() {
    if (isMobile) setOpenMobile(false)
  }
  return sections.map((item) => (
    <SidebarMenuItem key={item.key}>
      <SidebarMenuButton asChild isActive={activeSection === item.key} tooltip={item.label}>
        <Link to={`/admin?section=${item.key}`} onClick={closeMobile}>
          {item.icon}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  ))
}
