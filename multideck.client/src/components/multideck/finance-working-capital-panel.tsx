import { motion, useReducedMotion } from "motion/react"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { CountUpValue } from "./rolling-digits"
import { Surface } from "./surface"

export type AgeingBucket = { key: "current" | "1-30" | "31-60" | "61-90" | "90+"; amount: number }

const bucketLabels: Record<AgeingBucket["key"], string> = {
  current: "Not yet due",
  "1-30": "1–30 days late",
  "31-60": "31–60 days late",
  "61-90": "61–90 days late",
  "90+": "Over 90 days late",
}

/**
 * Lateness is an ordered severity, so the buckets step from the accent through
 * amber to red rather than taking unrelated hues. The label and the amount sit
 * beside every miniature bar, so colour is never the only way to read it.
 */
const bucketColours: Record<AgeingBucket["key"], string> = {
  current: "var(--md-accent)",
  "1-30": "color-mix(in srgb, var(--md-amber) 70%, var(--md-accent))",
  "31-60": "var(--md-amber)",
  "61-90": "color-mix(in srgb, var(--md-red) 60%, var(--md-amber))",
  "90+": "var(--md-red)",
}

function AgeingLedger({ label, total, buckets, detail, formatMoney, delay }: {
  label: string
  total: number
  buckets: AgeingBucket[]
  detail?: string | null
  formatMoney: (value: number) => string
  delay: number
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const positive = buckets.filter((bucket) => bucket.amount > 0)
  const visible = buckets.filter((bucket) => bucket.amount !== 0)
  const chartTotal = positive.reduce((sum, bucket) => sum + bucket.amount, 0)
  const overdue = positive.filter((bucket) => bucket.key !== "current").reduce((sum, bucket) => sum + bucket.amount, 0)
  const hasCredits = visible.some((bucket) => bucket.amount < 0)
  return (
    <div className="md-capital-ledger">
      <div className="md-capital-ledger-head">
        <div>
          <span className="md-capital-ledger-label">{label}</span>
          <p className="md-capital-ledger-detail" data-overdue={overdue > 0 || undefined}>
            {overdue > 0 ? <><span dir="ltr">{formatMoney(overdue)}</span> {t("overdue")}</> : chartTotal > 0 ? t("Nothing overdue") : hasCredits ? t("Credit balance") : t("Nothing outstanding")}
          </p>
        </div>
        <span className="md-pnl-line-amount md-capital-ledger-total" dir="ltr">{formatMoney(total)}</span>
      </div>
      {visible.length > 0 ? <ul className="md-capital-legend">
        {visible.map((bucket, index) => (
          <li key={bucket.key}>
            <span className="md-capital-legend-label">
              {t(bucketLabels[bucket.key])}
              {bucket.amount < 0 ? <span className="md-capital-credit-label"> · {t("credit")}</span> : null}
            </span>
            <span className="md-pnl-line-amount md-capital-bucket-amount" dir="ltr">
              {formatMoney(bucket.amount)}
              {bucket.amount > 0 ? <span className="md-mini-split" aria-hidden="true">
                <motion.span
                  style={{ background: bucketColours[bucket.key] }}
                  initial={shouldReduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: chartTotal > 0 ? bucket.amount / chartTotal : 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.panel, delay: delay + staggerRamp(index, 0.035) }}
                />
              </span> : null}
            </span>
          </li>
        ))}
      </ul> : null}
      {detail ? <p className="md-capital-ledger-detail">{detail}</p> : null}
    </div>
  )
}

/**
 * Where the cash is and where it is tied up. The bank balance leads as one
 * figure; underneath, what customers owe and what the business owes, each
 * as an ageing statement with exact figures and miniature proportion bars.
 */
export function FinanceWorkingCapitalPanel({
  title,
  subtitle,
  cashAtBank,
  receivables,
  payables,
  debtorDays,
  formatMoney,
  className,
}: {
  title: string
  subtitle?: string
  /** Null when no bank account has a ledger nominal yet. */
  cashAtBank: number | null
  receivables: { total: number; buckets: AgeingBucket[] }
  payables: { total: number; buckets: AgeingBucket[] }
  debtorDays?: number | null
  formatMoney: (value: number) => string
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <Surface padding="none" className={cn("md-capital-panel", className)}>
      <div className="md-breakdown-head">
        <h2 className="md-panel-title">{title}</h2>
        {subtitle ? <p className="md-panel-meta">{subtitle}</p> : null}
      </div>
      <div className="md-capital-body">
        <div className="md-capital-hero">
          <span className="md-capital-hero-label">{t("Cash at bank")}</span>
          {cashAtBank === null ? (
            <span className="md-capital-hero-empty">{t("Link a bank account to its ledger nominal to see the balance here.")}</span>
          ) : (
            <CountUpValue value={formatMoney(cashAtBank)} className="md-capital-hero-value md-capital-bank-amount" />
          )}
        </div>
        <AgeingLedger
          label={t("Owed to you")}
          total={receivables.total}
          buckets={receivables.buckets}
          detail={debtorDays ? `${t("paid in")} ${debtorDays} ${t("days on average")}` : null}
          formatMoney={formatMoney}
          delay={0.2}
        />
        <AgeingLedger label={t("You owe")} total={payables.total} buckets={payables.buckets} formatMoney={formatMoney} delay={0.34} />
      </div>
    </Surface>
  )
}
