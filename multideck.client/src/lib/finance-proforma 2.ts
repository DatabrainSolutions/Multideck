import { financeDocumentLineTotals, type FinanceDocumentLine } from "@/components/multideck/finance-document-line-editor"

type ProformaInput = {
  typeLabel: string
  credit: boolean
  entityName: string
  partyLabel: string
  partyName: string
  partyAccountCode?: string | null
  documentDate: string
  dueDate?: string | null
  currencyCode: string
  lines: FinanceDocumentLine[]
  taxPending: boolean
  language: string
  direction: "ltr" | "rtl"
  translate: (value: string) => string
}

function html(value: unknown) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#039;" })[character] ?? character)
}

export function printFinanceProforma(input: ProformaInput) {
  const printWindow = window.open("", "_blank", "width=1120,height=820")
  if (!printWindow) return false
  printWindow.opener = null
  const { translate: t } = input
  const formatter = new Intl.NumberFormat(input.language, /^[A-Z]{3}$/.test(input.currencyCode) ? { style: "currency", currency: input.currencyCode } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dateFormatter = new Intl.DateTimeFormat(input.language, { dateStyle: "medium" })
  const formatDate = (value?: string | null) => value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : "—"
  const polarity = input.credit ? -1 : 1
  const totals = financeDocumentLineTotals(input.lines)
  const lineRows = input.lines.map((line, index) => {
    const net = (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0) * polarity
    const tax = net * (Number(line.taxRatePercent) || 0) / 100
    return `<tr><td>${index + 1}</td><td>${html(line.chargeCode)}</td><td class="description">${html(line.description || "—")}</td><td class="number">${html(line.quantity)}</td><td class="number">${html(formatter.format(Number(line.unitAmount) || 0))}</td><td>${html(line.taxCode || t("Pending"))}</td><td class="number">${html(formatter.format(net))}</td><td class="number">${input.taxPending ? html(t("Pending")) : html(formatter.format(tax))}</td></tr>`
  }).join("")

  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="${html(input.language)}" dir="${input.direction}"><head><meta charset="utf-8"><title>${html(`${t("Proforma")} · ${input.typeLabel}`)}</title><style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #122321; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 12px; line-height: 1.45; }
    .masthead { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; border-bottom: 2px solid #244d48; padding-bottom: 18px; }
    h1 { margin: 0; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; }
    .legal { margin-top: 5px; color: #667571; }
    .proforma { color: #244d48; text-align: end; }
    .proforma strong { display: block; font-size: 22px; letter-spacing: 0.08em; }
    .proforma span { display: block; margin-top: 3px; color: #a4453b; font-size: 10px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
    .details { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; margin: 22px 0; }
    .label { margin-bottom: 6px; color: #667571; font-size: 10px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
    .party { font-size: 16px; font-weight: 650; }
    .account { margin-top: 4px; color: #667571; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 8px 20px; margin: 0; }
    dt { color: #667571; } dd { margin: 0; font-weight: 600; text-align: end; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 9px 8px; background: #244d48; color: #fff; font-size: 10px; font-weight: 650; text-align: start; }
    td { padding: 9px 8px; border-bottom: 1px solid #d7e0de; vertical-align: top; }
    th.number, td.number { text-align: end; white-space: nowrap; }
    .description { min-width: 260px; }
    .summary { display: flex; justify-content: flex-end; margin-top: 18px; }
    .summary dl { width: 310px; font-size: 13px; }
    .summary .total { border-top: 1px solid #8ca09b; padding-top: 8px; color: #122321; font-size: 15px; }
    footer { margin-top: 30px; border-top: 1px solid #d7e0de; padding-top: 10px; color: #667571; font-size: 10px; }
  </style></head><body><div class="masthead"><div><h1>${html(input.typeLabel)}</h1><div class="legal">${html(input.entityName || t("Legal entity"))}</div></div><div class="proforma"><strong>${html(t("PROFORMA"))}</strong><span>${html(t("Not a tax document"))}</span></div></div><div class="details"><div><div class="label">${html(input.partyLabel)}</div><div class="party">${html(input.partyName || t("Not selected"))}</div>${input.partyAccountCode ? `<div class="account">${html(`${t("Account code")}: ${input.partyAccountCode}`)}</div>` : ""}</div><dl><dt>${html(t("Document number"))}</dt><dd>${html(t("Assigned when saved"))}</dd><dt>${html(t("Document date"))}</dt><dd>${html(formatDate(input.documentDate))}</dd><dt>${html(t("Due date"))}</dt><dd>${html(formatDate(input.dueDate))}</dd><dt>${html(t("Currency"))}</dt><dd>${html(input.currencyCode)}</dd></dl></div><table><thead><tr><th>${html(t("Line"))}</th><th>${html(t("Charge code"))}</th><th>${html(t("Description"))}</th><th class="number">${html(t("Quantity"))}</th><th class="number">${html(t("Unit price"))}</th><th>${html(t("Tax treatment"))}</th><th class="number">${html(t("Net"))}</th><th class="number">${html(t("Tax"))}</th></tr></thead><tbody>${lineRows}</tbody></table><div class="summary"><dl><dt>${html(t("Net"))}</dt><dd>${html(formatter.format(totals.net * polarity))}</dd><dt>${html(t("Tax"))}</dt><dd>${input.taxPending ? html(t("Pending")) : html(formatter.format(totals.tax * polarity))}</dd><dt class="total">${html(input.taxPending ? t("Draft subtotal") : t("Gross"))}</dt><dd class="total">${html(formatter.format((input.taxPending ? totals.net : totals.gross) * polarity))}</dd></dl></div><footer>${html(t("This proforma is a draft preview only. It does not post to the ledger or accounting provider."))}</footer></body></html>`)
  printWindow.document.close()
  window.setTimeout(() => { printWindow.focus(); printWindow.print() }, 160)
  return true
}
