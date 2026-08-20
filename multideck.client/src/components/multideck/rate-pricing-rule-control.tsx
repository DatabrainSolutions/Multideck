import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import type { RatePricingMode } from "@/lib/rates-api"
import { cn } from "@/lib/utils"

const fieldClass = "h-10 rounded-[var(--md-radius-md)] text-base sm:text-[13px]"

export type RatePricingRuleValue = {
  pricingMode: RatePricingMode
  markupPercent: number
  markupAmount: number
  sellTotal: number
}

export function RatePricingRuleControl({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: RatePricingRuleValue
  onChange: (value: RatePricingRuleValue) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const amountLabel = value.pricingMode === "override" ? t("Fixed sell") : value.pricingMode === "markup_amount" ? t("Markup amount") : t("Markup %")
  const amountValue = value.pricingMode === "override" ? value.sellTotal : value.pricingMode === "markup_amount" ? value.markupAmount : value.markupPercent

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <label className="grid gap-1.5">
        <span className="text-[12px] font-medium">{t("Pricing rule")}</span>
        <Select value={value.pricingMode} disabled={disabled} onValueChange={(pricingMode: RatePricingMode) => onChange({ ...value, pricingMode })}>
          <SelectTrigger className={fieldClass}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="markup_percent">{t("Markup %")}</SelectItem>
            <SelectItem value="markup_amount">{t("Markup amount")}</SelectItem>
            <SelectItem value="override">{t("Override")}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-[12px] font-medium">{amountLabel}</span>
        <Input
          dir="ltr"
          inputMode="decimal"
          className={fieldClass}
          value={amountValue}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (value.pricingMode === "override") onChange({ ...value, sellTotal: next })
            else if (value.pricingMode === "markup_amount") onChange({ ...value, markupAmount: next })
            else onChange({ ...value, markupPercent: next })
          }}
        />
      </label>
      <p className="text-[11.5px] leading-4 text-[var(--md-subtle)] sm:col-span-2">
        {value.pricingMode === "override"
          ? t("A fixed sell stays put when the linked cost tariff changes.")
          : t("Markup is recalculated when the linked cost tariff changes. The pack then needs approval.")}
      </p>
    </div>
  )
}
