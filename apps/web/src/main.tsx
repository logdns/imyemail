import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { LanguageDomSync, setDefaultLanguage } from "@/lib/language"
import { ProtectedLayout } from "@/components/protected-layout"
import { AdminOnly } from "@/components/admin-only"
import { LoginPage } from "@/pages/login"
import { RegisterPage } from "@/pages/register"
import { NotFoundPage } from "@/pages/not-found"
import { api } from "@/lib/api"
import { applyUITemplate, getInitialUITemplate } from "@/lib/ui-template"
import "./index.css"
import "./templates/imyemailcloud.css"

applyUITemplate(getInitialUITemplate(), false)

const MailPage = React.lazy(() => import("@/pages/mail").then((module) => ({ default: module.MailPage })))
const AdminPage = React.lazy(() => import("@/pages/admin").then((module) => ({ default: module.AdminPage })))
const ProfilePage = React.lazy(() => import("@/pages/profile").then((module) => ({ default: module.ProfilePage })))

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } } })
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/", element: <ProtectedLayout />, children: [
    { index: true, element: <MailPage /> },
    { path: "mail", element: <Navigate to="/" replace /> },
    { path: "mail/starred", element: <Navigate to="/" replace /> },
    { path: "profile", element: <ProfilePage /> },
    { path: "admin", element: <AdminOnly><AdminPage /></AdminOnly> },
  ] },
  { path: "*", element: <NotFoundPage /> },
])

function BrandingSync() {
  const settings = useQuery({ queryKey: ["public-settings"], queryFn: api.publicSettings })
  React.useEffect(() => {
    const title = settings.data?.siteTitle?.trim() || settings.data?.siteName?.trim() || "imyemail"
    document.title = title
    document.querySelector('meta[property="og:site_name"]')?.setAttribute("content", title)
    if (settings.data?.uiTemplate) applyUITemplate(settings.data.uiTemplate)
    if (settings.data?.defaultLanguage) setDefaultLanguage(settings.data.defaultLanguage)
  }, [settings.data?.siteName, settings.data?.siteTitle, settings.data?.uiTemplate, settings.data?.defaultLanguage])
  return null
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrandingSync />
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground" role="status">正在加载…</div>}>
        <RouterProvider router={router} />
      </React.Suspense>
      <Toaster />
      <LanguageDomSync />
    </QueryClientProvider>
  </React.StrictMode>,
)
