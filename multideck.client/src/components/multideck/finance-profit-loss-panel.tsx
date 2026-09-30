import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { Surface } from "./surface"

export type ProfitLossFigures = {
  revenue: number
  directCost: number
  overheads: number
}

type Line = {
  key: string
  label: string
  amount: number
  kind: "income" | "cost" | "result"
  note?: string | null
}

/**
 * A condensed profit and loss statement for one period, read top to bottom
 * the way an accountant reads it: revenue, less the cost of doing the work,
 * gross profit, less running the business, net profit.
 *
 * Amounts and margins sit in aligned tiles, with result lines separated
 * from the costs that feed them. Miniature bars retain the relative scale.
 */
export function FinanceProfitLossPanel({
  title,
  subtitle,
  figures,
  overheadAccounts,
  formatMoney,
  formatPercent,
  className,
}: {
  title: string
  subtitle?: string
  figures: ProfitLossFigures
  /** The largest overhead lines for the same period, biggest first. */
  overheadAccounts?: { code: string; name: string; amount: number }[]
  formatMoney: (value: number) => string
  formatPercent: (value: number | null) => string | null
  className?: string
}) {
  const { t } = useLanguage()
  const grossProfit = figures.revenue - figures.directCost
  const netProfit = grossProfit - figures.overheads
  const share = (value: number) => (figures.revenue > 0 ? value / figures.revenue : null)

  const lines: Line[] = [
    { key: "revenue", label: t("Revenue"), amount: figures.revenue, kind: "income" },
    { key: "direct", label: t("Cost of sales"), amount: -figures.directCost, kind: "cost" },
    { key: "gross", label: t("Gross profit"), amount: grossProfit, kind: "result", note: formatPercent(share(grossProfit)) },
    { key: "overheads", label: t("Overheads"), amount: -figures.overheads, kind: "cost" },
    { key: "net", label: t("Net profit"), amount: netProfit, kind: "result", note: formatPercent(share(netProfit)) },
  ]
  const scaleBase = Math.max(...lines.map((line) => Math.abs(line.amount)), 1)
  const overheadTotal = (overheadAccounts ?? []).reduce((total, account) => total + account.amount, 0)

  return (
    <Surface padding="none" className={cn("md-pnl-panel", className)}>
      <div className="md-breakdown-head">
        <h2 className="md-panel-title">{title}</h2>
        {subtitle ? <p className="md-panel-meta">{subtitle}</p> : null}
      </div>

      <dl className="md-pnl-lines">
        {lines.map((line) => {
          return (
            <div key={line.key} className="md-pnl-line" data-kind={line.kind} data-negative={line.kind === "result" && line.amount < 0 ? "true" : undefined}>
              <dt className="md-pnl-line-label">{line.label}</dt>
              <dd className="md-pnl-line-figure">
                <span className="md-pnl-line-amount" dir="ltr">{formatMoney(line.amount)}
                  <span className="md-mini-split" aria-hidden="true"><span style={{ transform: `scaleX(${Math.abs(line.amount) / scaleBase})`, background: line.amount < 0 && line.kind === "result" ? "var(--md-red)" : line.kind === "cost" ? "var(--md-fin-out)" : "var(--md-fin-in)" }} /></span>
                </span>
                {line.note ? <span className="md-pnl-line-note">{line.note} {t("margin")}</span> : null}
              </dd>

            </div>
          )
        })}
      </dl>

      {overheadAccounts?.length ? (
        <div className="md-pnl-overheads">
          <p className="md-pnl-overheads-title">{t("Largest overheads")}</p>
          <ul>
            {overheadAccounts.map((account) => (
              <li key={account.code || account.name}>
                <span className="md-pnl-overhead-name" data-i18n-skip>{account.name}</span>
                <span className="md-pnl-overhead-amount" dir="ltr">{formatMoney(account.amount)}
                  <span className="md-mini-split" aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(Math.abs(account.amount) / Math.max(Math.abs(figures.overheads), overheadTotal, 1), 1)})`, background: "var(--md-fin-out)" }} /></span>
                </span>
                <span className="md-pnl-overhead-share" dir="ltr">{overheadTotal > 0 && figures.overheads > 0 ? formatPercent(account.amount / figures.overheads) : null}</span>

              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  )
}
