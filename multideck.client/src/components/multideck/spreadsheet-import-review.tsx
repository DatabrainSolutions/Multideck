import { useLanguage } from "@/i18n/language-provider"
import { InlineNotice } from "./inline-notice"

export type SpreadsheetReviewRow = {
  row: number
  sku?: string | null
  code?: string | null
  success: boolean
  error: string | null
  values?: Record<string, string | number | boolean | null>
}

/** A bounded, keyboard-scrollable review of every source row, including errors. */
export function SpreadsheetImportReview({ rows, completed = false }: { rows: SpreadsheetReviewRow[]; completed?: boolean }) {
  const { t } = useLanguage()
  const failed = rows.filter((row) => !row.success).length
  return <div className="grid min-w-0 gap-3">
    <InlineNotice tone={failed ? "warning" : completed ? "success" : "info"}>
      {completed
        ? `${rows.filter((row) => row.success).length} ${t("created.")}`
        : `${rows.length} ${t("rows checked. Nothing has been created yet.")}`}
      {completed && failed > 0 ? <p>{t("Remove the created rows before uploading corrections.")}</p> : null}
      {failed > 0 ? <p>{`${failed} ${t("rows need attention. Correct the file and upload it again.")}`}</p> : null}
    </InlineNotice>
    <div tabIndex={0} role="region" aria-label={t("Spreadsheet row review")} className="max-h-64 overflow-auto rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)] focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">
      <table className="w-full text-start text-[12px]">
        <thead className="sticky top-0 bg-[var(--md-surface-soft)] text-[var(--md-subtle)]"><tr>
          {["Row", "Code / SKU", "Details", "Result"].map((label) => <th key={label} scope="col" className="px-3 py-2 text-start font-medium">{t(label)}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.row} className="border-t border-[var(--md-hairline)] align-top">
          <td className="px-3 py-2 tabular-nums">{row.row}</td>
          <td className="max-w-40 break-words px-3 py-2" data-i18n-skip>{row.sku ?? row.code ?? "—"}</td>
          <td className="min-w-40 max-w-72 break-words px-3 py-2 text-[var(--md-text)]"><details><summary className="cursor-pointer">{t("View values")}</summary><dl className="mt-2 grid gap-1">{Object.entries(row.values ?? {}).filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}><dt className="inline font-medium">{label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase())}: </dt><dd className="inline" data-i18n-skip>{String(value)}</dd></div>)}</dl></details></td>
          <td className="min-w-36 max-w-80 break-words px-3 py-2">{row.success ? t(completed ? "Created" : "Ready") : row.error}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
