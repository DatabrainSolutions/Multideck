import { useEffect, useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, Download, RefreshCw } from "@/components/icons/hugeicons"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import { exportPresetRange, inExportDateRange, validExportRange, type ExportDatePreset, type ExportDateRange, type TableExportScope } from "@/lib/table-export"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { buildCsv, sanitiseCsvFileName, type CsvExportField, type CsvExportSource } from "@/lib/csv-export"
import { cn } from "@/lib/utils"

export function TableCsvExportDialog<Row>({
  open,
  onOpenChange,
  sources,
  fields,
  fileName,
  loading = false,
  error,
  onRetry,
  onDownloaded,
  restoreFocus,
  register,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: readonly CsvExportSource<Row>[]
  fields: readonly CsvExportField<Row>[]
  fileName: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onDownloaded?: () => void
  restoreFocus?: () => void
  register?: {
    scope: TableExportScope
    onScopeChange: (scope: TableExportScope) => void
    dateLabel: string
    dateValue: (row: Row) => string | Date | null | undefined
    scopeDescription?: string
    pageCount: number
  }
}) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const id = useId()
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(new Set())
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [preset, setPreset] = useState<ExportDatePreset>("All time")
  const [customRange, setCustomRange] = useState<ExportDateRange>({ start: null, end: null })
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const fieldsInitialised = useRef(false)
  const range = preset === "Custom" ? customRange : exportPresetRange(preset)
  const rangeValid = !register || preset === "All time" || validExportRange(range)
  const includedSources = register ? rangeValid ? sources.filter(({ row }) => inExportDateRange(register.dateValue(row), range)) : [] : sources

  const categories = useMemo(() => {
    const grouped = new Map<string, CsvExportField<Row>[]>()
    for (const field of fields) grouped.set(field.category, [...(grouped.get(field.category) ?? []), field])
    return [...grouped.entries()].sort(([left], [right]) => {
      if (left === "Columns") return -1
      if (right === "Columns") return 1
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
    })
  }, [fields])

  useEffect(() => {
    if (!open) { fieldsInitialised.current = false; return }
    if (loading || !fields.length) return
    if (!fieldsInitialised.current) {
      fieldsInitialised.current = true
      setSelectedFieldIds(new Set(fields.filter((field) => field.defaultSelected).map((field) => field.id)))
    }
  }, [fields, loading, open])

  useEffect(() => {
    if (open) {
      setOpenCategories(new Set())
      setPreset("All time")
      setCustomRange({ start: null, end: null })
      setDownloadError(null)
    }
  }, [open])

  const selectedFields = fields.filter((field) => selectedFieldIds.has(field.id))
  const allFieldsSelected = fields.length > 0 && selectedFields.length === fields.length

  function toggleCategoryOpen(category: string) {
    setOpenCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function toggleCategoryFields(categoryFields: readonly CsvExportField<Row>[]) {
    setSelectedFieldIds((current) => {
      const next = new Set(current)
      const allSelected = categoryFields.every((field) => next.has(field.id))
      for (const field of categoryFields) {
        if (allSelected) next.delete(field.id)
        else next.add(field.id)
      }
      return next
    })
  }

  function toggleField(fieldId: string) {
    setSelectedFieldIds((current) => {
      const next = new Set(current)
      if (next.has(fieldId)) next.delete(fieldId)
      else next.add(fieldId)
      return next
    })
  }

  function downloadCsv() {
    if (!includedSources.length || !selectedFields.length || !rangeValid) return
    try {
      const csv = buildCsv(includedSources, selectedFields)
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = sanitiseCsvFileName(register ? `${fileName}-${register.scope}-${range.start ?? "all-time"}${range.end ? `-to-${range.end}` : ""}` : fileName)
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      onDownloaded?.()
      onOpenChange(false)
    } catch {
      setDownloadError("The CSV could not be created. Your export choices have been kept. Try again.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={(event) => { if (restoreFocus) { event.preventDefault(); restoreFocus() } }} className="grid max-h-[calc(100svh-16px)] max-w-[calc(100%-16px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-0 sm:max-h-[min(760px,calc(100svh-32px))] sm:max-w-[640px]">
        <DialogHeader className="border-b border-[var(--md-line)] px-4 py-3 pe-12 text-start sm:px-5 sm:py-4 sm:pe-14">
          <DialogTitle className="text-[17px] font-medium text-[var(--md-ink)]">{t(register ? "Export records" : "Export selected rows")}</DialogTitle>
          <DialogDescription className="text-[12px] leading-5 text-[var(--md-text)]">
            {t("Choose table columns or expand a record section to include fields that are not currently visible.")}
          </DialogDescription>
        </DialogHeader>

        <div data-table-export-scroll-area className="min-h-0 overflow-y-auto overscroll-contain px-2 py-3 md-scrollbar sm:px-3">
          {register ? <div className="grid gap-4 px-2 pb-4">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Records to include")}</legend>
              {([ ["all", "All records"], ["page", "Records on this page"] ] as const).map(([value, label]) => <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 text-[13px] text-[var(--md-ink)]">
                <input type="radio" name={`${id}-scope`} value={value} checked={register.scope === value} onChange={() => register.onScopeChange(value)} className="size-4 accent-[var(--md-accent)]" />
                {t(label)}{value === "page" ? <span className="ms-auto text-[12px] tabular-nums text-[var(--md-subtle)]">{register.pageCount}</span> : null}
              </label>)}
              <p className="text-[12px] leading-5 text-[var(--md-text)]">{t(register.scopeDescription ?? "All records includes every authorised record matching the current search, filters and ownership scope. This page includes only the current paginated page, in its displayed order. The date range narrows either choice.")}</p>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t(register.dateLabel)}</legend>
              <div className="flex flex-wrap gap-1" role="group" aria-label={t("Export date presets")}>
                {(["7D", "30D", "90D", "All time", "Custom"] as const).map((value) => <Button key={value} type="button" variant={preset === value ? "secondary" : "ghost"} aria-pressed={preset === value} className="h-9 px-3 text-[12px]" onClick={() => setPreset(value)}>{t(value)}</Button>)}
              </div>
              {preset === "Custom" ? <MultideckDateRangePicker value={customRange} onChange={setCustomRange} title="Export date range" description="Choose the first and last calendar days to include." triggerLabel="Choose export dates" closeOnSelect /> : null}
              <p className="text-[11px] leading-5 text-[var(--md-subtle)]">{t("Dates use UTC, including the whole first and last day. Presets include today. Undated records are included only with All time.")}</p>
              {!rangeValid ? <p role="status" className="text-[12px] text-[var(--md-text)]">{t("Choose both a start date and an end date.")}</p> : null}
            </fieldset>
          </div> : null}
          {loading ? (
            <div className="grid min-h-52 place-items-center sm:min-h-[300px]">
              <DotGridLoader label={register?.scope === "all" ? "Loading all matching records and their details…" : "Loading full record details…"} />
            </div>
          ) : error ? (
            <div className="grid min-h-52 place-items-center px-4 text-center sm:min-h-[300px] sm:px-6">
              <div className="max-w-sm">
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{t("Full record details could not be loaded")}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(error)}</p>
                {onRetry ? <Button type="button" variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="size-4" />{t("Try again")}</Button> : null}
              </div>
            </div>
          ) : (
            <div aria-labelledby={`${id}-fields`}>
              <div className="mb-2 flex min-h-9 flex-wrap items-center justify-between gap-2 px-2">
                <div>
                  <p id={`${id}-fields`} className="text-[12px] font-medium text-[var(--md-ink)]">{t("Fields to include")}</p>
                  <p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">
                    <span data-i18n-skip dir="ltr">{selectedFields.length}</span> {t("of")} <span data-i18n-skip dir="ltr">{fields.length}</span> {t("fields selected")}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[11px] font-medium text-[var(--md-accent)] transition-[background,transform] hover:bg-[var(--md-accent-a10)] active:scale-[0.96] motion-reduce:transform-none"
                  onClick={() => setSelectedFieldIds(allFieldsSelected ? new Set() : new Set(fields.map((field) => field.id)))}
                >
                  {t(allFieldsSelected ? "Deselect all fields" : "Select all fields")}
                </button>
              </div>

              <div className="grid gap-1">
                {categories.map(([category, categoryFields]) => {
                  const categorySelectedCount = categoryFields.filter((field) => selectedFieldIds.has(field.id)).length
                  const categoryOpen = openCategories.has(category)
                  const categoryChecked = categorySelectedCount === categoryFields.length
                    ? true
                    : categorySelectedCount > 0 ? "indeterminate" : false
                  return (
                    <section key={category} className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)]">
                      <div className="flex min-h-11 items-center gap-1 px-2">
                        <Checkbox
                          checked={categoryChecked}
                          onCheckedChange={() => toggleCategoryFields(categoryFields)}
                          aria-label={`${t(categoryChecked === true ? "Deselect section" : "Select section")}: ${t(category)}`}
                          className="size-[18px] rounded-[var(--md-radius-xs)]"
                        />
                        <button
                          type="button"
                          aria-expanded={categoryOpen}
                          onClick={() => toggleCategoryOpen(category)}
                          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--md-radius-md)] px-1.5 text-start outline-none transition-[background,color] hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]"
                        >
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--md-ink)]">{t(category)}</span>
                          <span className="text-[10.5px] tabular-nums text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{categorySelectedCount}/{categoryFields.length}</span>
                          <ChevronDown className={cn("size-3.5 shrink-0 text-[var(--md-subtle)] transition-transform duration-200", categoryOpen && "rotate-180")} strokeWidth={1.4} />
                        </button>
                      </div>

                      <AnimatePresence initial={false}>
                        {categoryOpen ? (
                          <motion.div
                            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="relative mb-2 ms-[17px] me-2 border-s border-[var(--md-line-strong)] ps-4">
                              {categoryFields.map((field) => (
                                <label key={field.id} className="relative flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-[11.5px] text-[var(--md-text)] transition-colors hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]">
                                  <span className="absolute -start-4 top-1/2 h-px w-3 bg-[var(--md-line-strong)]" aria-hidden="true" />
                                  <Checkbox
                                    checked={selectedFieldIds.has(field.id)}
                                    onCheckedChange={() => toggleField(field.id)}
                                    className="size-[17px] rounded-[var(--md-radius-xs)]"
                                  />
                                  <span className="min-w-0 flex-1 break-words leading-4">{t(field.label)}</span>
                                </label>
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </section>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 flex flex-col-reverse items-stretch gap-2 rounded-none border-t border-[var(--md-line)] bg-[var(--md-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="text-[11px] text-[var(--md-subtle)]" role="status" aria-live="polite">
            {loading ? t("Preparing export…") : error ? t("Export not ready") : <><span data-i18n-skip dir="ltr">{includedSources.length}</span> {t(includedSources.length === 1 ? "row" : "rows")}{!includedSources.length && rangeValid ? <p>{t("No records match this scope and date range.")}</p> : null}{!selectedFields.length ? <p>{t("Select at least one field.")}</p> : null}</>}
            {downloadError ? <p role="alert">{t(downloadError)}</p> : null}
          </div>
          <div className="grid grid-cols-2 items-center gap-2 sm:flex">
            <Button type="button" variant="ghost" className="h-10" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
            <Button type="button" className="h-10 px-4" disabled={loading || Boolean(error) || !selectedFields.length || !includedSources.length || !rangeValid} onClick={downloadCsv}>
              <Download className="size-[18px]" />
              {t("Download CSV")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
