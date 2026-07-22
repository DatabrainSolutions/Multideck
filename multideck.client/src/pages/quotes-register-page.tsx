import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowUpRight, Search } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { Pagination } from "@/components/multideck/pagination"
import {
  QuoteSearchBuilder,
  createEmptyQuoteSearch,
  quoteMatchesSearch,
  type QuoteSearchQuery,
} from "@/components/multideck/quote-search-builder"
import { StatusPill } from "@/components/multideck/status-pill"
import { quoteRegisterRecords, type QuoteRegisterRecord } from "@/data/quote-register-data"
import { useLanguage } from "@/i18n/language-provider"

const rowsPerPageOptions = [10, 20, 30, 50]

function formatDate(value: string, locale: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed)
}

function ltrValue(value: ReactNode, className = "") {
  return <span data-i18n-skip dir="ltr" className={className}>{value}</span>
}

export function QuotesRegisterPage({ navigate }: { navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [search, setSearch] = useState<QuoteSearchQuery>(createEmptyQuoteSearch)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dexterOpen, setDexterOpen] = useState(false)

  const filteredQuotes = useMemo(
    () => quoteRegisterRecords.filter((quote) => quoteMatchesSearch(quote, search)),
    [search],
  )
  const pageCount = Math.max(Math.ceil(filteredQuotes.length / rowsPerPage), 1)
  const paginatedQuotes = filteredQuotes.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => setPage(1), [rowsPerPage, search])
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const columns = useMemo<DataTableColumn<QuoteRegisterRecord>[]>(() => {
    const textColumn = (
      id: keyof QuoteRegisterRecord,
      label: string,
      width: number,
      options: { defaultHidden?: boolean; ltr?: boolean; cell?: (quote: QuoteRegisterRecord) => ReactNode } = {},
    ): DataTableColumn<QuoteRegisterRecord> => ({
      id,
      label,
      width,
      minWidth: Math.min(width, 110),
      maxWidth: Math.max(width + 120, 260),
      defaultHidden: options.defaultHidden,
      resizable: true,
      sortValue: (quote) => quote[id] as string | number | null,
      cell: options.cell ?? ((quote) => options.ltr
        ? ltrValue(String(quote[id] ?? "—"), "text-[12px] font-medium text-[var(--md-ink)]")
        : <span className="text-[12px] text-[var(--md-text)]">{t(String(quote[id] ?? "—"))}</span>),
    })

    const dateColumn = (id: "estimatedDeparture" | "estimatedArrival", label: string, defaultHidden = false) => textColumn(id, label, 142, {
      defaultHidden,
      cell: (quote) => ltrValue(formatDate(quote[id], language), "text-[12px] font-medium text-[var(--md-text)] tabular-nums"),
    })

    const moneyColumn = (id: "sellValue" | "estimatedProfit" | "estimatedCost", label: string) => textColumn(id, label, 132, {
      defaultHidden: true,
      cell: (quote) => ltrValue(
        new Intl.NumberFormat(language, { style: "currency", currency: quote.currency, maximumFractionDigits: 0 }).format(quote[id]),
        "text-[12px] font-medium tabular-nums text-[var(--md-ink)]",
      ),
    })

    return [
      textColumn("reference", "Quote reference", 142, {
        ltr: true,
        cell: (quote) => (
          <span className="group/reference inline-flex items-center gap-1.5 font-medium text-[var(--md-accent)]">
            {ltrValue(quote.reference, "text-[12px]")}
            <ArrowUpRight className="size-3 text-[var(--md-subtle)] opacity-0 transition-[opacity,transform] group-hover/reference:translate-x-0.5 group-hover/reference:opacity-100" strokeWidth={1.4} aria-hidden="true" />
          </span>
        ),
      }),
      textColumn("status", "Status", 132, { cell: (quote) => <StatusPill tone={quote.statusTone}>{t(quote.status)}</StatusPill> }),
      textColumn("customer", "Customer", 190),
      textColumn("origin", "Origin port / airport", 170, { ltr: true }),
      textColumn("destination", "Destination port / airport", 188, { ltr: true }),
      dateColumn("estimatedDeparture", "Estimated departure (ETD)"),
      dateColumn("estimatedArrival", "Estimated arrival (ETA)"),
      textColumn("transportTime", "Transport time", 120, { defaultHidden: true }),
      textColumn("transportMode", "Transport mode", 126),
      textColumn("equipmentLoad", "Equipment / load", 174),
      textColumn("pickup", "Pickup", 190, { defaultHidden: true }),
      textColumn("delivery", "Delivery", 190, { defaultHidden: true }),
      textColumn("routingVia", "Routing via", 160, { defaultHidden: true, ltr: true }),
      textColumn("incoterms", "Incoterms", 104, { defaultHidden: true, ltr: true }),
      textColumn("incotermsPlace", "Incoterms place", 170, { defaultHidden: true }),
      textColumn("serviceLevel", "Service level", 164, { defaultHidden: true }),
      textColumn("shipmentType", "Shipment type", 136, { defaultHidden: true }),
      textColumn("carrier", "Carrier", 158, { defaultHidden: true }),
      textColumn("supplier", "Supplier", 210, { defaultHidden: true }),
      textColumn("salesOwner", "Sales owner", 150, { defaultHidden: true }),
      textColumn("operationsOwner", "Operations owner", 164, { defaultHidden: true }),
      textColumn("quoteType", "Quote type", 140, { defaultHidden: true }),
      textColumn("direction", "Direction", 108, { defaultHidden: true }),
      textColumn("customerPurchaseOrder", "Customer purchase order", 188, { defaultHidden: true, ltr: true }),
      textColumn("shipperReference", "Shipper reference", 164, { defaultHidden: true, ltr: true }),
      textColumn("validity", "Validity", 150, { defaultHidden: true }),
      textColumn("estimatedQuote", "Estimated quote", 150, { defaultHidden: true }),
      moneyColumn("sellValue", "Sell value"),
      moneyColumn("estimatedProfit", "Estimated profit"),
      moneyColumn("estimatedCost", "Estimated cost"),
      textColumn("estimatedMargin", "Estimated margin", 148, {
        defaultHidden: true,
        cell: (quote) => quote.estimatedMargin === null
          ? <span className="text-[12px] text-[var(--md-subtle)]">{t("Pending")}</span>
          : ltrValue(`${quote.estimatedMargin.toFixed(2)}%`, "text-[12px] font-medium tabular-nums text-[var(--md-ink)]"),
      }),
      textColumn("documentStatus", "Document status", 172, { defaultHidden: true }),
      textColumn("workflowStage", "Workflow stage", 176, { defaultHidden: true }),
      textColumn("priority", "Priority", 116, { defaultHidden: true, cell: (quote) => <StatusPill tone={quote.priorityTone}>{t(quote.priority)}</StatusPill> }),
      textColumn("quoteSource", "Quote source", 158, { defaultHidden: true }),
    ]
  }, [language, t])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Quotes")} className="md-page md-page-stack">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Quotes")}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--md-text)]">
            {t("Search, review and open every customer quote from one place.")}
          </p>
        </div>
        <DexterActionPill onClick={() => setDexterOpen(true)} />
      </header>

      <QuoteSearchBuilder
        value={search}
        onChange={setSearch}
        resultCount={filteredQuotes.length}
        totalCount={quoteRegisterRecords.length}
      />

      <DataTable
        ariaLabel="Quote register"
        columnsButtonLabel="Manage quote columns"
        columns={columns}
        rows={paginatedQuotes}
        getRowKey={(quote) => quote.reference}
        storageKey="quote-register"
        rowClassName="hover:bg-[var(--md-hover)]"
        onRowClick={(quote) => navigate(`/quotes/${quote.reference.toLowerCase()}`)}
        toolbarLeading={(
          <div className="flex min-w-0 items-center gap-2 px-1.5">
            <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Quote register")}</span>
            <span className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{filteredQuotes.length}</span>
          </div>
        )}
        emptyState={(
          <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
              <Search className="size-4" strokeWidth={1.3} />
            </span>
            <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No quotes match this search")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Change or clear a condition to see more quotes.")}</p>
          </div>
        )}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={filteredQuotes.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="quotes"
        onPageChange={setPage}
        onPageSizeChange={setRowsPerPage}
      />
    </DexterDockedPage>
  )
}
