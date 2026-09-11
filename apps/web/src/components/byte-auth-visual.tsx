import { Mail } from "lucide-react"

// Decorative, local-only artwork. The form remains the accessible authentication entry point.
export function ByteAuthVisual({ siteName }: { siteName?: string }) {
  return (
    <div className="byte-auth-visual hidden" aria-hidden="true">
      <div className="byte-auth-brand">
        <span className="byte-brand-icon"><Mail size={22} /></span>
        <span data-imyemail-i18n-ignore>{siteName || "imyemail"}</span>
      </div>
      <div className="byte-auth-art">
        <div className="byte-auth-orbit" />
        <div className="byte-auth-letter"><span>@</span><i /><i /></div>
        <div className="byte-auth-envelope" />
        <span className="byte-auth-stamp"><Mail size={22} /></span>
      </div>
      <div className="byte-auth-copy">
        <h2>从容处理每一封邮件</h2>
        <p>收发、整理与协作，在清晰有序的空间里完成。</p>
      </div>
    </div>
  )
}
