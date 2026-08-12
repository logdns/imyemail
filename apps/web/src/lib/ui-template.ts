import type { UITemplate } from "@/lib/api-types"

export const defaultUITemplate: UITemplate = "imyemaildefault"
export const uiTemplates: UITemplate[] = [defaultUITemplate, "imyemailcloud", "imyemail-cloud-sy"]

const storageKey = "imyemail:ui-template"

export function normalizeUITemplate(value?: string | null): UITemplate {
  return uiTemplates.includes(value as UITemplate) ? value as UITemplate : defaultUITemplate
}

export function getInitialUITemplate(): UITemplate {
  if (typeof window === "undefined") return defaultUITemplate
  return normalizeUITemplate(window.localStorage.getItem(storageKey))
}

export function applyUITemplate(value?: string | null, persist = true): UITemplate {
  const template = normalizeUITemplate(value)
  document.documentElement.dataset.uiTemplate = template
  if (persist) window.localStorage.setItem(storageKey, template)
  return template
}
