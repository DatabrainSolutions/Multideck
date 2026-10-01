import type { BookingWorkflowCharge } from "@/lib/booking-workflow-api"

// Use the recorded source currencies, never the Booking's headline currency.
export function planningChargeReadback(charge: BookingWorkflowCharge, t: (text: string) => string): string | null {
  if (!charge.planningCurrency) return null
  const money = (amount: number | null | undefined, code: string | null | undefined) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) return t("Not recorded")
    const currency = typeof code === "string" && /^[A-Z]{3}$/.test(code) ? code : t("Currency not recorded")
    return `${currency} ${amount.toFixed(2)}`
  }
  const { cost, sell, base } = charge.planningCurrency
  return `${t("Cost")} ${money(charge.costAmount, cost)} · ${t("Sell")} ${money(charge.sellAmount, sell)} · ${t("Base cost")} ${money(charge.costLocal, base)} · ${t("Base sell")} ${money(charge.sellLocal, base)}`
}
