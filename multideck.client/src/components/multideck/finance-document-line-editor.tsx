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
  taxRatePercent: string
  taxCode: string
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
  jobChargeOptions?: FinanceJobChargeOption[]
  sourceKind: "manual" | "job"
  currencyCode: string
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

export function createFinanceDocumentLine(treatment?: Pick<FinanceDocumentTaxOption, "code" | "ratePercent">): FinanceDocumentLine {
  return {
    id: lineId(),
    description: "",
    chargeCode: "ADHOC",
    jobCostingLineId: null,
    lineType: "service",
    quantity: "1",
    unitAmount: "",
    taxRatePercent: String(treatment?.ratePercent ?? 0),
    taxCode: treatment?.code ?? "",
  }
}

export function financeDocumentLineTotals(lines: FinanceDocumentLine[]) {
  return lines.reduce(
    (totals, line) => {
      const net = (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0)
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
  jobChargeOptions = [],
  sourceKind,
  currencyCode,
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
  const [selectedLineId, setSelectedLineId] = useState(lines[0]?.id ?? "")

  useEffect(() => {
    if (!lines.some((line) => line.id === selectedLineId)) setSelectedLineId(lines[0]?.id ?? "")
  }, [lines, selectedLineId])

  const selectedIndex = lines.findIndex((line) => line.id === selectedLineId)
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
  const selectLine = (id: string) => setSelectedLineId(id)
  const updateLine = (id: string, value: Partial<FinanceDocumentLine>) => {
    onLinesChange(lines.map((line) => line.id === id ? { ...line, ...value } : line))
  }
  const addLine = () => {
    const next = createFinanceDocumentLine(defaultTreatment)
    onLinesChange([...lines, next])
    setSelectedLineId(next.id)
  }
  const insertLine = () => {
    const next = createFinanceDocumentLine(defaultTreatment)
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
      const next = createFinanceDocumentLine(defaultTreatment)
      onLinesChange([next])
      setSelectedLineId(next.id)
      return
    }
    const remaining = lines.filter((_, index) => index !== selectedIndex)
    onLinesChange(remaining)
    setSelectedLineId(remaining[Math.min(selectedIndex, remaining.length - 1)]?.id ?? "")
  }

  const commandClass = "h-8 rounded-[var(--md-radius-md)] px-2 text-[12px]"

  return (
    <section aria-labelledby="finance-lines-title" className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
      <div className="flex flex-wrap items-center gap-1.5 bg-[var(--md-surface-soft)] p-1.5 shadow-[inset_0_-1px_0_var(--md-line)]">
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
        <h3 id="finance-lines-title" className="text-[13px] font-medium text-[var(--md-ink)]">{t("Document lines")}</h3>
        <p className="mt-0.5 text-[12px] text-[var(--md-subtle)]">{t("Select a row before inserting, copying or removing it. Amounts are calculated automatically.")}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr className="bg-[var(--md-ink)] text-start text-white">
              <th scope="col" className="w-12 px-2 py-2 text-center font-medium">{t("Line")}</th>
              <th scope="col" className="w-[125px] px-2 py-2 text-start font-medium">{t("Charge code")}</th>
              <th scope="col" className="min-w-[250px] px-2 py-2 text-start font-medium">{t("Description")}</th>
              <th scope="col" className="w-[125px] px-2 py-2 text-start font-medium">{t("Line type")}</th>
              <th scope="col" className="w-[92px] px-2 py-2 text-end font-medium">{t("Quantity")}</th>
              <th scope="col" className="w-[125px] px-2 py-2 text-end font-medium">{t("Unit price")}</th>
              <th scope="col" className="w-[185px] px-2 py-2 text-start font-medium">{t("Tax treatment")}</th>
              <th scope="col" className="w-[120px] px-2 py-2 text-end font-medium">{t("Net")}</th>
              <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const selected = line.id === selectedLineId
              const lineNet = (Number(line.quantity) || 0) * (Number(line.unitAmount) || 0) * polarity
              return (
                <tr key={line.id} className={cn("group transition-colors", selected ? "bg-[var(--md-surface-tint)]" : "bg-[var(--md-surface)] hover:bg-[var(--md-surface-soft)]")} onClick={() => selectLine(line.id)}>
                  <td className="border-b border-[var(--md-line)] px-2 py-1.5 text-center text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{index + 1}</td>
                  <td className="border-b border-[var(--md-line)] p-1.5">{sourceKind === "job" && jobChargeOptions.length ? (
                    <Select value={line.jobCostingLineId || "unmatched"} disabled={editDisabled} onValueChange={(value) => { const option = jobChargeOptions.find((item) => item.id === value); updateLine(line.id, option ? { jobCostingLineId: option.id, chargeCode: option.chargeCode || `LINE-${option.lineNo}`, description: line.description || option.description } : { jobCostingLineId: null }) }}>
                      <SelectTrigger aria-label={`${t("Job charge")} ${index + 1}`} className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="unmatched">{t("Unmatched actual")}</SelectItem>{jobChargeOptions.map((option) => <SelectItem key={option.id} value={option.id}><span data-i18n-skip dir="ltr">{option.lineNo} · {option.chargeCode || option.description}</span></SelectItem>)}</SelectContent>
                    </Select>
                  ) : <Input aria-label={`${t("Charge code")} ${index + 1}`} className="h-8 uppercase" value={line.chargeCode} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { chargeCode: event.target.value.toUpperCase(), jobCostingLineId: null })} data-i18n-skip dir="ltr" disabled={editDisabled} required />}</td>
                  <td className="border-b border-[var(--md-line)] p-1.5"><Input aria-label={`${t("Description")} ${index + 1}`} className="h-8" value={line.description} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { description: event.target.value })} disabled={editDisabled} required /></td>
                  <td className="border-b border-[var(--md-line)] p-1.5">
                    {sourceKind === "job" ? <Input aria-label={`${t("Line type")} ${index + 1}`} className="h-8" value={t("Freight")} disabled /> : (
                      <Select value={line.lineType} disabled={editDisabled} onValueChange={(lineType: "service" | "ancillary") => updateLine(line.id, { lineType })}>
                        <SelectTrigger aria-label={`${t("Line type")} ${index + 1}`} className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="service">{t("Service")}</SelectItem><SelectItem value="ancillary">{t("Ancillary")}</SelectItem></SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="border-b border-[var(--md-line)] p-1.5"><Input aria-label={`${t("Quantity")} ${index + 1}`} className="h-8 text-end" type="number" min="0.0001" step="0.0001" value={line.quantity} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} data-i18n-skip dir="ltr" disabled={editDisabled} required /></td>
                  <td className="border-b border-[var(--md-line)] p-1.5"><Input aria-label={`${t("Unit price")} ${index + 1}`} className="h-8 text-end" type="number" min="0" step="0.01" value={line.unitAmount} onFocus={() => selectLine(line.id)} onChange={(event) => updateLine(line.id, { unitAmount: event.target.value })} data-i18n-skip dir="ltr" disabled={editDisabled} required /></td>
                  <td className="border-b border-[var(--md-line)] p-1.5">
                    <Select value={line.taxCode} disabled={editDisabled || !taxOptions.length} onValueChange={(value) => { const treatment = taxOptions.find((item) => item.code === value); updateLine(line.id, { taxCode: value, taxRatePercent: String(treatment?.approved ? treatment.ratePercent : 0) }) }}>
                      <SelectTrigger aria-label={`${t("Tax treatment")} ${index + 1}`} className="h-8"><SelectValue placeholder={t("Pending finance setup")} /></SelectTrigger>
                      <SelectContent>{taxOptions.map((treatment) => <SelectItem key={`${treatment.approved ? "approved" : "pending"}-${treatment.id}`} value={treatment.code}>{treatment.name} · {treatment.approved ? <><span data-i18n-skip dir="ltr">{treatment.ratePercent}%</span> · {t("Approved")}</> : t("Rate pending approval")}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="border-b border-[var(--md-line)] px-2 py-1.5 text-end font-medium text-[var(--md-ink)] tabular-nums" data-i18n-skip dir="ltr">{formatter.format(lineNet)}</td>
                  <td className="border-b border-[var(--md-line)] p-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`${t("Remove line")} ${index + 1}`} onClick={(event) => { event.stopPropagation(); setSelectedLineId(line.id); if (lines.length === 1) { const next = createFinanceDocumentLine(defaultTreatment); onLinesChange([next]); setSelectedLineId(next.id) } else { const remaining = lines.filter((candidate) => candidate.id !== line.id); onLinesChange(remaining); setSelectedLineId(remaining[Math.min(index, remaining.length - 1)]?.id ?? "") } }} disabled={editDisabled}>
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
