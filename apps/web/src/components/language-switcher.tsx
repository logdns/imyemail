import { Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { languageOptions, useLanguage } from "@/lib/language"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [language, setLanguage] = useLanguage()
  const currentLanguage = languageOptions.find((item) => item.value === language) || languageOptions[0]

  return (
    <Select value={language} onValueChange={setLanguage}>
      <SelectTrigger
        className={cn(
          compact ? "h-8 w-[58px] gap-1 px-2" : "h-9 w-[148px] bg-background/90 shadow-sm backdrop-blur",
          className,
        )}
        aria-label="切换语言"
        title="切换语言"
      >
        {!compact && <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <SelectValue>
          <span className={cn("truncate", compact ? "text-xs font-semibold" : "text-sm")}>{compact ? currentLanguage.shortLabel : currentLanguage.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {languageOptions.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
