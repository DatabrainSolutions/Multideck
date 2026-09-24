import type { Journal } from "./finance-ledger-api"

/** Prepare a separate draft; never change or repost the source journal. */
export function prepareJournalReversal(source: Journal, id: string): Journal {
  if (source.status !== "posted" || !source.number) throw new Error("Only posted journals can be reversed.")
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source.accounting_date)
  if (!match) throw new Error("The original journal needs a valid accounting date.")
  const year = Number(match[1]), month = Number(match[2])
  if (month < 1 || month > 12 || year >= 9999) throw new Error("The original journal needs a valid accounting date.")
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
  return {
    id,
    accounting_date: nextMonth,
    reference: `Reversal of JN-${source.number}`,
    description: `Reversal of JN-${source.number} · ${source.description}`.slice(0, 500),
    currency: source.currency,
    lines: source.lines.map(line => ({ ...line, debit: line.credit, credit: line.debit })),
    status: "draft",
    mirror_status: "not_required",
  }
}
