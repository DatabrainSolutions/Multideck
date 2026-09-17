import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import type { DexterRecordTable as RecordTable } from "@/lib/dexter-api"
import { useLanguage } from "@/i18n/language-provider"

export function DexterRecordTable({ table }: { table: RecordTable }) {
  const { language, t } = useLanguage()
  type Row = RecordTable["rows"][number]
  const format = (row: Row, field: RecordTable["columns"][number]) => {
    const value = row.values[field.key]
    if (value === null || value === undefined || value === "") return t("Not set")
    if (field.kind === "number" && typeof value === "number") return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value)
    if (field.kind === "date" && typeof value === "string" && Number.isFinite(Date.parse(value))) {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
      return new Intl.DateTimeFormat(language, dateOnly ? { dateStyle: "medium" } : {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      }).format(new Date(dateOnly ? `${value}T12:00:00` : value))
    }
    return field.kind === "status" ? String(value).replaceAll("_", " ").replace(/^\w/, letter => letter.toUpperCase()) : String(value)
  }
  const columns: DataTableColumn<Row>[] = table.columns.filter((field, index) => index === 0 || field.required || table.rows.some(row => row.values[field.key] != null && row.values[field.key] !== "")).map((field, index) => ({
    id: field.key,
    label: t(field.label),
    kind: index === 0 ? "identity" : field.kind ?? "text",
    minWidth: index === 0 ? 180 : field.kind === "date" ? 190 : 120,
    sortValue: row => row.values[field.key],
    cell: row => index === 0 && row.url && /^\/(?!\/)[^\\]*$/.test(row.url)
      ? <a className="text-[var(--md-accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--md-accent)]" href={row.url}>{format(row, field)}</a>
      : <span className={field.kind === "number" ? "tabular-nums" : undefined}>{format(row, field)}</span>,
  }))
  return (
    <section className="my-4 min-w-0" aria-label={table.title}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-medium text-[var(--md-ink)]">{table.title}</h3>
        <p className="text-[11px] text-[var(--md-subtle)]">{table.rows.length} {t("shown")} · <time dateTime={table.retrievedAt} title={Number.isFinite(Date.parse(table.retrievedAt)) ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(table.retrievedAt)) : undefined}>{t("Saved snapshot")}</time></p>
      </div>
      <DataTable columns={columns} rows={table.rows} getRowKey={row => row.id} ariaLabel={table.title}
        enableSelectionExport={false} showToolbar={false} minimumWidth={Math.max(360, columns.length * 135)}
        emptyState={<p className="p-4 text-[12px]">{t("No matching records.")}</p>} />
    </section>
  )
}
