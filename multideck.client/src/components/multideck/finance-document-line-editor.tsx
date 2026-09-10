import { useEffect, useMemo, useRef, useState } from "react"
import { Copy, FileSpreadsheet, ListPlus, Plus, Printer, RefreshCcw, Trash2, Upload } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type FinanceDocumentLine = {
  id: string
  description: string
  chargeCode: string
  jobCostingLineId: string | null
  lineType: "service" | "ancillary"
  quantity: string
  unitAmount: string
  currencyCode: string
  exchangeRate: string
  taxRatePercent: string
  taxCode: string
}

export type FinanceDocumentChargeOption = {
  id: string
  code: string
  name: string
  description: string | null
  defaultTaxCode: string | null
}

export type FinanceDocumentTaxOption = {
  id: string
  code: string
  name: string
  ratePercent: number
  approved: boolean
}

export type FinanceJobChargeOption = {
  id: string
  lineNo: number
  chargeCode: string | null
  description: string
  expectedAmount: number
  nominalCode: string | null
}

type FinanceDocumentLineEditorProps = {
  lines: FinanceDocumentLine[]
  onLinesChange: (lines: FinanceDocumentLine[]) => void
  taxOptions: FinanceDocumentTaxOption[]
  chargeOptions?: FinanceDocumentChargeOption[]
  currencyOptions?: string[]
  jobChargeOptions?: FinanceJobChargeOption[]
  sourceKind: "manual" | "job"
  currencyCode: string
  appearance?: "panel" | "document"
  showQuantity?: boolean
  credit?: boolean
  disabled?: boolean
  readOnly?: boolean
  onClear: () => void
  onImport: (file: File) => void | Promise<void>
  onExport: () => void
  onPrint: () => void
}

function lineId() {
  return globalThis.crypto?.randomUUID?.() ?? `finance-line-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createFinanceDocumentLine(treatment?: Pick<FinanceDocumentTaxOption, "code" | "ratePercent">, currencyCode = ""): FinanceDocumentLine {
  return {
    id: lineId(),
    description: "",
    chargeCode: "",
    jobCostingLineId: null,
    lineType: "service",
    quantity: "1",
    unitAmount: "",
    currencyCode,
    exchangeRate: "1",
    taxRatePercent: String(treatment?.ratePercent ?? 0),
    taxCode: treatment?.code ?? "",
  }
}

export function financeDocumentLineTotals(lines: FinanceDocumentLine[]) {
  return lines.reduce(
    (totals, line) => {
      const net = (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0) * (Number(line.exchangeRate) || 0)
      const tax = net * (Number(line.taxRatePercent) || 0) / 100
      return { net: totals.net + net, tax: totals.tax + tax, gross: totals.gross + net + tax }
    },
    { net: 0, tax: 0, gross: 0 },
  )
}

export function FinanceDocumentLineEditor({
  lines,
  onLinesChange,
  taxOptions,
  chargeOptions = [],
  currencyOptions = [],
  jobChargeOptions = [],
  sourceKind,
  currencyCode,
  appearance = "panel",
  showQuantity = true,
  credit = false,
  disabled = false,
  readOnly = false,
  onClear,
  onImport,
  onExport,
  onPrint,
}: FinanceDocumentLineEditorProps) {
  const { language, t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedLineId, setSelectedLineId] = useState(readOnly ? "" : lines[0]?.id ?? "")

  useEffect(() => {
    if (readOnly) {
      if (selectedLineId) setSelectedLineId("")
      return
    }
    if (!lines.some((line) => line.id === selectedLineId)) setSelectedLineId(lines[0]?.id ?? "")
  }, [lines, readOnly, selectedLineId])

  const selectedIndex = readOnly ? -1 : lines.findIndex((line) => line.id === selectedLineId)
  const formatter = useMemo(
    () => new Intl.NumberFormat(language, /^[A-Z]{3}$/.test(currencyCode)
      ? { style: "currency", currency: currencyCode }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [currencyCode, language],
  )
  const totals = financeDocumentLineTotals(lines)
  const polarity = credit ? -1 : 1
  const taxPending = lines.some((line) => !line.taxCode || !taxOptions.some((option) => option.approved && option.code === line.taxCode))
  const editDisabled = disabled || readOnly

  const defaultTreatment = taxOptions.find((option) => option.approved) ?? taxOptions[0]
  const selectLine = (id: string) => { if (!readOnly) setSelectedLineId(id) }
  const updateLine = (id: string, value: Partial<FinanceDocumentLine>) => {
    onLinesChange(lines.map((line) => line.id === id ? { ...line, ...value } : line))
  }
  const addLine = () => {
    const next = createFinanceDocumentLine(defaultTreatment, currencyCode)
    onLinesChange([...lines, next])
    setSelectedLineId(next.id)
  }
  const insertLine = () => {
    const next = createFinanceDocumentLine(defaultTreatment, currencyCode)
    const insertionIndex = selectedIndex >= 0 ? selectedIndex : lines.length
    onLinesChange([...lines.slice(0, insertionIndex), next, ...lines.slice(insertionIndex)])
    setSelectedLineId(next.id)
  }
  const duplicateLine = () => {
    const selected = lines[selectedIndex]
    if (!selected) return
    const next = { ...selected, id: lineId() }
    onLinesChange([...lines.slice(0, selectedIndex + 1), next, ...lines.slice(selectedIndex + 1)])
    setSelectedLineId(next.id)
  }
  const removeLine = () => {
    if (selectedIndex < 0) return
    if (lines.length === 1) {
      const next = createFinanceDocumentLine(defaultTreatment, currencyCode)
      onLinesChange([next])
      setSelectedLineId(next.id)
      return
    }
    const remaining = lines.filter((_, index) => index !== selectedIndex)
    onLinesChange(remaining)
    setSelectedLineId(remaining[Math.min(selectedIndex, remaining.length - 1)]?.id ?? "")
  }

  const commandClass = "h-8 rounded-[var(--md-radius-md)] px-2 text-[12px]"
  const gridInputClass = "h-9 rounded-[var(--md-radius-sm)] !border-transparent !bg-transparent px-2 !shadow-none hover:!bg-[var(--md-surface-soft)] focus-visible:!bg-[var(--md-surface)] focus-visible:!ring-2 focus-visible:!ring-[var(--md-accent-a18)] disabled:!bg-transparent"
  const gridSelectClass = "h-9 w-full rounded-[var(--md-radius-sm)] !border-transparent !bg-transparent px-2 !shadow-none hover:!bg-[var(--md-surface-soft)] focus-visible:!bg-[var(--md-surface)] focus-visible:!ring-2 focus-visible:!ring-[var(--md-accent-a18)] data-[state=open]:!bg-[var(--md-surface)]"

  return (
    <section aria-labelledby="finance-lines-title" className={cn("bg-[var(--md-surface)]", appearance === "document" ? "overflow-visible rounded-none shadow-none" : "overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]")}>
      <div className={cn("flex flex-wrap items-center gap-1.5 bg-[var(--md-surface-soft)] p-1.5", appearance === "document" ? "rounded-[var(--md-radius-xl)]" : "shadow-[inset_0_-1px_0_var(--md-line)]")}>
        <Button type="button" variant="ghost" className={commandClass} onClick={addLine} disabled={editDisabled}>
          <Plus data-icon="inline-start" />{t("Add row")}
        </Button>
        <Button type="button" variant="ghost" className={commandClass} onClick={insertLine} disabled={editDisabled || selectedIndex < 0}>
          <ListPlus data-icon="inline-start" />{t("Insert row")}
        </Button>
        <Button type="button" variant="ghost" className={commandClass} onClick={duplicateLine} disabled={editDisabled || selectedIndex < 0}>
          <Copy data-icon="inline-start" />{t("Copy row")}
        </Button>
        <Button type="button" variant="ghost" className={commandClass} onClick={removeLine} disabled={editDisabled || selectedIndex < 0}>
          <Trash2 data-icon="inline-start" />{t("Remove row")}
        </Button>
        <span className="mx-0.5 h-5 w-px bg-[var(--md-line)]" aria-hidden="true" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (file) await onImport(file)
            event.target.value = ""
          }}
        />
        <Button type="button" variant="ghost" className={commandClass} onClick={() => fileInputRef.current?.click()} disabled={editDisabled}>
          <Upload data-icon="inline-start" />{t("Import Excel")}
        </Button>
        <Button type="button" variant="ghost" className={commandClass} onClick={onExport} disabled={disabled}>
          <FileSpreadsheet data-icon="inline-start" />{t("Export Excel")}
        </Button>
        <Button type="button" variant="ghost" className={commandClass} onClick={onPrint} disabled={disabled}>
          <Printer data-icon="inline-start" />{t("Print proforma")}
        </Button>
        <Button type="button" variant="ghost" className={cn(commandClass, "ms-auto text-[var(--md-red)] hover:text-[var(--md-red)]")} onClick={onClear} disabled={editDisabled}>
          <RefreshCcw data-icon="inline-start" />{t("Clear form")}
        </Button>
      </div>

      <div className="px-3 pb-2 pt-3">
        <h3 id="finance-lines-title" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Charges")}</h3>
        <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Choose a controlled charge code, then adjust its description, currency, rate of exchange and tax where required.")}</p>
      </div>

      <div className={cn("overflow-x-auto", appearance === "document" && "rounded-t-[var(--md-radius-xl)]")}>
        <table className={cn("w-full table-fixed border-separate border-spacing-0 text-[12px]", showQuantity ? "min-w-[1160px]" : "min-w-[1080px]")}>
          <thead>
            <tr className="bg-[var(--md-surface-soft)] text-start text-[var(--md-subtle)] shadow-[inset_0_-1px_0_var(--md-line-strong)]">
              <th scope="col" className="w-11 px-2 py-2.5 text-center font-medium">{t("Line")}</th>
              <th scope="col" className="w-[210px] px-2 py-2.5 text-start font-medium">{t("Charge code")}</th>
              <th scope="col" className="min-w-[260px] px-2 py-2.5 text-start font-medium">{t("Description")}</th>
              {showQuantity ? <th scope="col" className="w-[70px] px-2 py-2.5 text-end font-medium">{t("Qty")}</th> : null}
              <th scope="col" className="w-[86px] px-2 py-2.5 text-start font-medium">{t("Currency")}</th>
              <th scope="col" className="w-[70px] px-2 py-2.5 text-end font-medium">{t("Rate")}</th>
              <th scope="col" className="w-[70px] px-2 py-2.5 text-end font-medium">{t("ROE")}</th>
              <th scope="col" className="w-[190px] px-2 py-2.5 text-start font-medium">{t("Tax")}</th>
              <th scope="col" className="w-[115px] px-2 py-2.5 text-end font-medium">{t("Invoice amount")}</th>
              <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const selected = !readOnly && line.id === selectedLineId
              const lineCurrencyCode = line.currencyCode || currencyCode
              const lineExchangeRate = lineCurrencyCode === currencyCode ? 1 : (Number(line.exchangeRate) || 0)
              const lineNet = (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0) * lineExchangeRate * polarity
              const recordedCharge = line.chargeCode && !chargeOptions.some((option) => option.code === line.chargeCode)
                ? { id: `recorded-${line.chargeCode}`, code: line.chargeCode, name: line.description || line.chargeCode, description: line.description || null, defaultTaxCode: null }
                : null
              const availableCharges = recordedCharge ? [recordedCharge, ...chargeOptions] : chargeOptions
              return (
                <tr key={line.id} className={cn("group transition-colors", selected ? "bg-[var(--md-selected-bg)]" : "bg-[var(--md-surface)]", !readOnly && !selected && "hover:bg-[var(--md-surface-soft)]")} onClick={readOnly ? undefined : () => selectLine(line.id)}>
                  <td className="border-b border-[var(--md-line)] px-2 py-1 text-center text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{index + 1}</td>
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="item_code">{sourceKind === "job" && jobChargeOptions.length ? (
                    <Select value={line.jobCostingLineId || "unmatched"} disabled={editDisabled} onValueChange={(value) => { const option = jobChargeOptions.find((item) => item.id === value); updateLine(line.id, option ? { jobCostingLineId: option.id, chargeCode: option.chargeCode || `LINE-${option.lineNo}`, description: option.description } : { jobCostingLineId: null }) }}>
                      <SelectTrigger aria-label={`${t("Job charge")} ${index + 1}`} className={gridSelectClass}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="unmatched">{t("Unmatched actual")}</SelectItem>{jobChargeOptions.map((option) => <SelectItem key={option.id} value={option.id}><span data-i18n-skip dir="ltr">{option.lineNo} · {option.chargeCode || option.description}</span></SelectItem>)}</SelectContent>
                    </Select>
                  ) : <Select value={line.chargeCode || undefined} disabled={editDisabled || !availableCharges.length} onValueChange={(value) => { const option = availableCharges.find((item) => item.code === value); const defaultTax = option?.defaultTaxCode ? taxOptions.find((tax) => tax.code === option.defaultTaxCode) : null; updateLine(line.id, { chargeCode: value, description: option?.description || option?.name || line.description, jobCostingLineId: null, ...(defaultTax ? { taxCode: defaultTax.code, taxRatePercent: String(defaultTax.approved ? defaultTax.ratePercent : 0) } : {}) }) }}>
                    <SelectTrigger aria-label={`${t("Charge code")} ${index + 1}`} className={gridSelectClass}><SelectValue placeholder={t("Select code")}>{line.chargeCode ? <span className="truncate" data-i18n-skip dir="ltr">{line.chargeCode}</span> : undefined}</SelectValue></SelectTrigger>
                    <SelectContent>{availableCharges.map((option) => <SelectItem key={option.id} value={option.code}><span className="font-medium" data-i18n-skip dir="ltr">{option.code}</span><span className="ms-2 text-[var(--md-subtle)]" dir="auto">{option.name}</span></SelectItem>)}</SelectContent>
                  </Select>}</td>
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="description"><Input aria-label={`${t("Description")} ${index + 1}`} className={gridInputClass} value={line.description} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { description: event.target.value })} disabled={editDisabled} required /></td>
                  {showQuantity ? <td className="border-b border-[var(--md-line)] p-1" data-provider-field="qty"><Input aria-label={`${t("Quantity")} ${index + 1}`} className={cn(gridInputClass, "text-end")} type="number" min="0.0001" step="0.0001" value={line.quantity} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} data-i18n-skip dir="ltr" disabled={editDisabled} required /></td> : null}
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="source_currency"><Select value={lineCurrencyCode} disabled={editDisabled} onValueChange={(value) => updateLine(line.id, { currencyCode: value, exchangeRate: value === currencyCode ? "1" : line.currencyCode === currencyCode ? "" : line.exchangeRate })}>
                    <SelectTrigger aria-label={`${t("Currency")} ${index + 1}`} className={gridSelectClass}><SelectValue /></SelectTrigger>
                    <SelectContent>{[...new Set([currencyCode, ...currencyOptions, lineCurrencyCode].filter(Boolean))].map((code) => <SelectItem key={code} value={code}><span data-i18n-skip dir="ltr">{code}</span></SelectItem>)}</SelectContent>
                  </Select></td>
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="rate"><Input aria-label={`${t("Rate")} ${index + 1}`} className={cn(gridInputClass, "text-end")} type="number" min="0" step="0.01" value={line.unitAmount} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { unitAmount: event.target.value })} data-i18n-skip dir="ltr" disabled={editDisabled} required /></td>
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="conversion_rate"><Input aria-label={`${t("ROE")} ${index + 1}`} className={cn(gridInputClass, "text-end")} type="number" min="0.0000000001" step="0.0000000001" value={lineCurrencyCode === currencyCode ? "1" : line.exchangeRate} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { exchangeRate: event.target.value })} data-i18n-skip dir="ltr" disabled={editDisabled || lineCurrencyCode === currencyCode} required /></td>
                  <td className="border-b border-[var(--md-line)] p-1" data-provider-field="item_tax_template">
                    <Select value={line.taxCode} disabled={editDisabled || !taxOptions.length} onValueChange={(value) => { const treatment = taxOptions.find((item) => item.code === value); updateLine(line.id, { taxCode: value, taxRatePercent: String(treatment?.approved ? treatment.ratePercent : 0) }) }}>
                      <SelectTrigger aria-label={`${t("Tax treatment")} ${index + 1}`} className={gridSelectClass}><SelectValue placeholder={t("Pending")}>{line.taxCode ? <span data-i18n-skip dir="ltr">{line.taxCode} · {line.taxRatePercent}%</span> : undefined}</SelectValue></SelectTrigger>
                      <SelectContent>{taxOptions.map((treatment) => <SelectItem key={`${treatment.approved ? "approved" : "pending"}-${treatment.id}`} value={treatment.code}><span className="font-medium" data-i18n-skip dir="ltr">{treatment.code} · {treatment.ratePercent}%</span><span className="ms-2 text-[var(--md-subtle)]">{treatment.name} · {t(treatment.approved ? "Approved" : "Rate pending approval")}</span></SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="border-b border-[var(--md-line)] px-2 py-1 text-end font-medium text-[var(--md-ink)] tabular-nums" data-provider-field="amount" data-i18n-skip dir="ltr">{formatter.format(lineNet)}</td>
                  <td className="border-b border-[var(--md-line)] p-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("Remove line")} ${index + 1}`} onClick={(event) => { event.stopPropagation(); setSelectedLineId(line.id); if (lines.length === 1) { const next = createFinanceDocumentLine(defaultTreatment, currencyCode); onLinesChange([next]); setSelectedLineId(next.id) } else { const remaining = lines.filter((candidate) => candidate.id !== line.id); onLinesChange(remaining); setSelectedLineId(remaining[Math.min(index, remaining.length - 1)]?.id ?? "") } }} disabled={editDisabled}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-7 gap-y-2 px-4 py-3 text-[13px]">
        <span>{t("Net")} <strong className="ms-1 tabular-nums" data-i18n-skip dir="ltr">{formatter.format(totals.net * polarity)}</strong></span>
        <span>{t("Tax")} <strong className="ms-1 tabular-nums" data-i18n-skip={taxPending ? undefined : true} dir={taxPending ? undefined : "ltr"}>{taxPending ? t("Pending") : formatter.format(totals.tax * polarity)}</strong></span>
        <span className="text-[var(--md-ink)]">{t(taxPending ? "Draft subtotal" : "Gross")} <strong className="ms-1 tabular-nums" data-i18n-skip dir="ltr">{formatter.format((taxPending ? totals.net : totals.gross) * polarity)}</strong></span>
      </div>
    </section>
  )
}
