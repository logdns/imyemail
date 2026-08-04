import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { LanguageDomSync } from "@/lib/language"
import { ProtectedLayout } from "@/components/protected-layout"
import { AdminOnly } from "@/components/admin-only"
import { LoginPage } from "@/pages/login"
import { RegisterPage } from "@/pages/register"
import { NotFoundPage } from "@/pages/not-found"
import "./index.css"

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground" role="status">正在加载…</div>}>
        <RouterProvider router={router} />
      </React.Suspense>
      <Toaster />
      <LanguageDomSync />
    </QueryClientProvider>
  </React.StrictMode>,
)
