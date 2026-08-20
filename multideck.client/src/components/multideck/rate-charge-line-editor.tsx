import { Plus, Trash2 } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import type { RateCharge } from "@/lib/rates-api"
import { cn } from "@/lib/utils"

const fieldClass = "h-10 rounded-[var(--md-radius-md)] text-base sm:text-[13px]"

function blankCharge(index: number): RateCharge {
  return { id: `charge-${index + 1}`, description: "", basis: "flat", buyAmount: 0, sellAmount: 0 }
}

export function RateChargeLineEditor({
  charges,
  onChange,
  amountKind = "buy",
  disabled = false,
  className,
}: {
  charges: RateCharge[]
  onChange: (charges: RateCharge[]) => void
  amountKind?: "buy" | "sell"
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const rows = charges.length ? charges : [blankCharge(0)]

  function update(index: number, changes: Partial<RateCharge>) {
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row)
    onChange(next)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium">{t("Charge lines")}</p>
        <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange([...rows, blankCharge(rows.length)])}>
          <Plus className="size-4" />{t("Add charge")}
        </Button>
      </div>
      <div className="grid gap-2">
        {rows.map((charge, index) => (
          <div key={charge.id ?? `charge-${index}`} className="grid gap-2 rounded-[calc(var(--md-radius-lg)-4px)] bg-[var(--md-surface-tint)] p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto] sm:items-end">
            <label className="grid gap-1.5">
              <span className="text-[11.5px] text-[var(--md-subtle)]">{t("Description")}</span>
              <Input className={fieldClass} value={charge.description} disabled={disabled} onChange={(event) => update(index, { description: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11.5px] text-[var(--md-subtle)]">{t("Basis")}</span>
              <Input className={fieldClass} value={charge.basis} disabled={disabled} onChange={(event) => update(index, { basis: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11.5px] text-[var(--md-subtle)]">{amountKind === "sell" ? t("Sell") : t("Cost")}</span>
              <Input
                dir="ltr"
                inputMode="decimal"
                className={fieldClass}
                value={amountKind === "sell" ? charge.sellAmount : charge.buyAmount}
                disabled={disabled}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  update(index, amountKind === "sell" ? { sellAmount: value, buyAmount: 0 } : { buyAmount: value })
                }}
              />
            </label>
            <Button type="button" variant="ghost" className="justify-self-end" disabled={disabled || rows.length === 1} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={t("Remove charge")}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
