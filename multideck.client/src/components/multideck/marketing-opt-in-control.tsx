import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export function MarketingOptInControl({
  checked,
  onCheckedChange,
  source,
  updatedAt,
  disabled = false,
  compact = false,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => Promise<void> | void
  source?: string | null
  updatedAt?: string | null
  disabled?: boolean
  compact?: boolean
  className?: string
}) {
  const { language, t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const sourceLabel = source === "contact_card"
    ? t("Contact card")
    : source === "manual_override"
      ? t("Manual override")
      : null
  const dateLabel = updatedAt
    ? new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(updatedAt))
    : null

  async function change(next: boolean) {
    if (saving || disabled) return
    setSaving(true)
    try {
      await onCheckedChange(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cn("flex min-w-0 items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("font-medium text-[var(--md-ink)]", compact ? "text-[12px]" : "text-[13px]")}>{t("Opt-in marketing")}</p>
          {saving ? <LoaderCircle className="size-3.5 animate-spin text-[var(--md-accent)]" aria-hidden="true" /> : null}
        </div>
        <p className={cn("mt-1 leading-5 text-[var(--md-text)]", compact ? "text-[11px]" : "text-[12px]")}>
          {t(checked ? "Can receive marketing updates." : "No marketing updates will be sent.")}
        </p>
        {sourceLabel || dateLabel ? (
          <p className="mt-1 text-[10.5px] text-[var(--md-subtle)]" data-i18n-skip={Boolean(dateLabel) || undefined}>
            {[sourceLabel, dateLabel].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled || saving}
        onCheckedChange={(next) => void change(next)}
        aria-label={t("Opt-in marketing")}
        aria-busy={saving}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}
