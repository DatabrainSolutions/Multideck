/** Suggest ordinary three-month VAT periods from a return period end date.
 * HMRC's obligation remains authoritative, including any short or long period. */
export function suggestUkVatQuarter(reference: "last" | "next", returnPeriodEnd: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnPeriodEnd)) throw new Error("Enter a valid return period end date.")
  const end = new Date(`${returnPeriodEnd}T00:00:00.000Z`)
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== returnPeriodEnd) {
    throw new Error("Enter a valid return period end date.")
  }
  const dayAfter = new Date(end)
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
  const moveMonths = (date: Date, months: number) => {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
    return target
  }
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (reference === "last") {
    const nextEnd = moveMonths(dayAfter, 3)
    nextEnd.setUTCDate(nextEnd.getUTCDate() - 1)
    return { start: iso(dayAfter), end: iso(nextEnd) }
  }
  if (reference === "next") return { start: iso(moveMonths(dayAfter, -3)), end: returnPeriodEnd }
  throw new Error("Choose the last or next return.")
}
