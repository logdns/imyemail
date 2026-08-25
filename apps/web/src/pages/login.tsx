import * as React from "react"
import { Link, Navigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, KeyRound, LockKeyhole } from "lucide-react"
import { api } from "@/lib/api"
import { useMe } from "@/hooks/use-me"
import { TurnstileBox } from "@/components/turnstile-box"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { LanguageSwitcher } from "@/components/language-switcher"

export function LoginPage() {
  const me = useMe()
  const qc = useQueryClient()
  const { toast } = useToast()
  const publicSettings = useQuery({ queryKey: ["public-settings"], queryFn: api.publicSettings })
  const [turnstileToken, setTurnstileToken] = React.useState("")
  const [challengeToken, setChallengeToken] = React.useState("")
  const login = useMutation({
    mutationFn: (form: FormData) => challengeToken
      ? api.login({ challengeToken, twoFactorCode: String(form.get("twoFactorCode") || "") })
      : api.login({ loginName: String(form.get("loginName") || ""), password: String(form.get("password") || ""), turnstileToken }),
    onSuccess: async (data) => {
      if (data.twoFactorRequired && data.challengeToken) {
        setChallengeToken(data.challengeToken)
        toast({ title: "请输入双因素验证码" })
        return
      }
      await qc.invalidateQueries({ queryKey: ["me"] })
    },
    onError: (e) => toast({ title: "登录失败", description: e.message }),
  })
  const turnstileRequired = !!publicSettings.data?.turnstileEnabled
  if (me.data?.user) return <Navigate to="/" replace />
  return (
    <div className="auth-page flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
      <div className="fixed right-4 top-4 z-20 sm:right-6 sm:top-6">
        <LanguageSwitcher />
      </div>
      <div className="auth-brand-visual hidden" aria-hidden="true">
        <span className="auth-brand-at">@</span>
        <span className="auth-brand-name">{publicSettings.data?.siteName || "imyemail"}</span>
      </div>
      <div className="auth-panel w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">{publicSettings.data?.siteName || "imyemail"}</h1>
        </div>
        <div className="auth-card rounded-lg border bg-background p-6 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {challengeToken ? <KeyRound className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
            {challengeToken ? "双因素验证" : "账号登录"}
          </div>
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (!challengeToken && turnstileRequired && !turnstileToken) { toast({ title: "请先完成人机验证" }); return }; login.mutate(new FormData(e.currentTarget)) }}>
            {!challengeToken ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="loginName" className="text-sm font-medium">登录名或邮箱</Label>
                  <Input id="loginName" name="loginName" type="text" autoComplete="username" required className="h-11 text-base" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">密码</Label>
                  <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11 text-base" />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode" className="text-sm font-medium">验证码或恢复码</Label>
                <Input id="twoFactorCode" name="twoFactorCode" autoComplete="one-time-code" minLength={6} maxLength={20} required className="h-11 text-center text-lg tracking-[0.15em]" />
              </div>
            )}
            {!challengeToken && turnstileRequired && (
              <TurnstileBox siteKey={publicSettings.data?.turnstileSiteKey || ""} onToken={setTurnstileToken} />
            )}
            <Button className="h-11 w-full text-base" disabled={login.isPending}>
              {login.isPending ? "登录中..." : challengeToken ? "验证登录" : "登录"}
              {!login.isPending && <ArrowRight className="h-4 w-4" />}
            </Button>
            {challengeToken && <Button type="button" variant="ghost" className="w-full" onClick={() => setChallengeToken("")}>返回登录</Button>}
          </form>
        </div>
        {!challengeToken && publicSettings.data?.openRegistration && (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>没有账号？</span>
            <Button type="button" variant="link" className="h-auto px-0 text-sm" asChild>
              <Link to="/register">注册账号</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
