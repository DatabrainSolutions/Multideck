import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowUpRight, Search, X } from "@/components/icons/hugeicons"

import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { RegisterViewSwitch } from "@/components/multideck/register-toolbar"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { Pagination } from "@/components/multideck/pagination"
import { Input } from "@/components/ui/input"
import { AdvancedFilterPopover } from "@/components/multideck/advanced-filter-popover"
import {
  createEmptyQuoteSearch,
  quoteSearchFieldOptions,
  type QuoteSearchQuery,
} from "@/lib/quote-filters"
import { filterQueryIsEmpty } from "@/lib/advanced-filters"
import { StatusPill } from "@/components/multideck/status-pill"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { type RegisterSort } from "@/lib/application-data-api"
import { listSalesQuotesPage, subscribeSalesQuotes } from "@/lib/quote-api"
import type { AuthUserSummary } from "@/lib/auth-user"
import { cn } from "@/lib/utils"

const rowsPerPageOptions = [10, 20, 30, 50]
const quoteTableStorageKey = "quote-register"
const quoteScopes = ["All", "Mine"] as const
type QuoteScope = (typeof quoteScopes)[number]

function withQuoteOwnerScope(query: QuoteSearchQuery, scope: QuoteScope, ownerName?: string | null): QuoteSearchQuery {
  const owner = ownerName?.trim()
  if (scope !== "Mine" || !owner) return query

  return {
    match: "all",
    groups: [
      ...query.groups,
      {
        id: "quote-owner-scope",
        match: "any",
        conditions: [
          { id: "quote-sales-owner", field: "salesOwner", operator: "is", value: owner },
          { id: "quote-operations-owner", field: "operationsOwner", operator: "is", value: owner },
        ],
      },
    ],
  }
}

function readSavedSort(storageKey: string, fallback: RegisterSort): RegisterSort {
  if (typeof window === "undefined") return fallback
  try {
    const saved = JSON.parse(window.localStorage.getItem(`multideck.table.${storageKey}`) ?? "null") as { sort?: RegisterSort | null } | null
    return saved?.sort?.id && (saved.sort.direction === "asc" || saved.sort.direction === "desc") ? saved.sort : fallback
  } catch {
    return fallback
  }
}

function formatDate(value: string, locale: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed)
}

function ltrValue(value: ReactNode, className = "") {
  return <span data-i18n-skip dir="ltr" className={className}>{value}</span>
}

export function QuotesRegisterPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser?: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const [search, setSearch] = useState<QuoteSearchQuery>(createEmptyQuoteSearch)
  const [quickSearch, setQuickSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "")
  const [scope, setScope] = useState<QuoteScope>("All")
  const [debouncedQuickSearch, setDebouncedQuickSearch] = useState(quickSearch)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [serverSort, setServerSort] = useState<RegisterSort | null>(() => readSavedSort(quoteTableStorageKey, { id: "updatedAt", direction: "desc" }))
  const [dexterOpen, setDexterOpen] = useState(false)
  const [quotes, setQuotes] = useState<QuoteRegisterRecord[]>([])
  const [quoteTotal, setQuoteTotal] = useState(0)
  const [availableQuoteTotal, setAvailableQuoteTotal] = useState(0)
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [quoteRevision, setQuoteRevision] = useState(0)

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedQuickSearch(quickSearch), 250)
    return () => globalThis.clearTimeout(timer)
  }, [quickSearch])

  useEffect(() => {
    const controller = new AbortController()
    setQuotesLoading(true)
    setQuotesError(null)
    void listSalesQuotesPage({
      search: debouncedQuickSearch,
      filterQuery: withQuoteOwnerScope(search, scope, currentUser?.name),
      sort: serverSort,
      limit: rowsPerPage,
      offset: (page - 1) * rowsPerPage,
    }, controller.signal).then((result) => {
      setQuotes(result.rows)
      setQuoteTotal(result.total)
      setAvailableQuoteTotal(result.availableTotal)
    }).catch((error) => {
      if ((error as { name?: string })?.name !== "AbortError") {
        setQuotesError(error instanceof Error ? error.message : "Quotes could not be loaded.")
      }
    }).finally(() => {
      if (!controller.signal.aborted) setQuotesLoading(false)
    })
    return () => controller.abort()
  }, [currentUser?.name, debouncedQuickSearch, page, quoteRevision, rowsPerPage, scope, search, serverSort])

  useEffect(() => subscribeSalesQuotes(() => setQuoteRevision((revision) => revision + 1)), [])

  /** Lets the filter panel show how many quotes a draft would return before it is applied. */
  const countDraftMatches = useCallback((draft: QuoteSearchQuery) => listSalesQuotesPage({
    search: quickSearch,
    filterQuery: withQuoteOwnerScope(draft, scope, currentUser?.name),
    sort: serverSort,
    limit: 1,
    offset: 0,
  }).then((result) => result.total), [currentUser?.name, quickSearch, scope, serverSort])
  const pageCount = Math.max(Math.ceil(quoteTotal / rowsPerPage), 1)

  function clearSearch() {
    setQuickSearch("")
    setSearch(createEmptyQuoteSearch())
    setPage(1)
  }

  useEffect(() => setPage(1), [quickSearch, rowsPerPage, scope, search, serverSort])
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const columns = useMemo<DataTableColumn<QuoteRegisterRecord>[]>(() => {
    const textColumn = (
      id: keyof QuoteRegisterRecord,
      label: string,
      width: number,
      options: { defaultHidden?: boolean; kind?: DataTableColumn<QuoteRegisterRecord>["kind"]; ltr?: boolean; cell?: (quote: QuoteRegisterRecord) => ReactNode } = {},
    ): DataTableColumn<QuoteRegisterRecord> => ({
      id,
      label,
      width,
      minWidth: Math.min(width, 110),
      maxWidth: Math.max(width + 120, 260),
      defaultHidden: options.defaultHidden,
      kind: options.kind,
      resizable: true,
      sortValue: (quote) => quote[id] as string | number | null,
      cell: options.cell ?? ((quote) => options.ltr
        ? ltrValue(String(quote[id] ?? "—"), "text-[12px] font-medium text-[var(--md-ink)]")
        : <span className="text-[12px] text-[var(--md-text)]">{t(String(quote[id] ?? "—"))}</span>),
    })

    const dateColumn = (id: "estimatedDeparture" | "estimatedArrival", label: string, defaultHidden = false) => textColumn(id, label, 142, {
      defaultHidden,
      kind: "date",
      cell: (quote) => ltrValue(formatDate(quote[id], language), "text-[12px] font-medium text-[var(--md-text)] tabular-nums"),
    })

    const moneyColumn = (id: "sellValue" | "estimatedProfit" | "estimatedCost", label: string) => textColumn(id, label, 132, {
      defaultHidden: true,
      kind: "number",
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
      textColumn("status", "Status", 132, { kind: "status", cell: (quote) => <StatusPill tone={quote.statusTone} indicator={false} className={cn(quote.status === "Accepted" && "bg-[var(--md-surface)] text-[var(--md-status-green-ink)] shadow-[var(--md-shadow-line)]")}>{t(quote.status)}</StatusPill> }),
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
      textColumn("priority", "Priority", 116, { defaultHidden: true, kind: "status", cell: (quote) => <StatusPill tone={quote.priorityTone}>{t(quote.priority)}</StatusPill> }),
      textColumn("quoteSource", "Quote source", 158, { defaultHidden: true }),
    ]
  }, [language, t])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Quotes")} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-5">
          <h1 className="shrink-0 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Quotes")}</h1>
          <div className="min-w-0 text-[12px] leading-5">
            <p className="font-medium text-[var(--md-text)]">
              {t("Quote register")} · <span data-i18n-skip dir="ltr">{new Intl.NumberFormat(language).format(quoteTotal)}</span> {t("quotes")}
            </p>
            <p className="text-[var(--md-subtle)]">
              {t("Search, review and open every customer quote from one place.")}
            </p>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <DexterActionPill onClick={() => setDexterOpen(true)} />
        </div>
      </header>

      {quotesError ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 py-3 text-[13px] text-[var(--md-red)]">{t("Quotes could not be loaded.")} <span className="text-[12px]">{quotesError}</span></div> : null}

      <DataTable
        ariaLabel="Quote register"
        columnsButtonLabel="Manage quote columns"
        columns={columns}
        rows={quotesLoading ? [] : quotes}
        getRowKey={(quote) => quote.reference}
        storageKey={quoteTableStorageKey}
        serverSorting={{ value: serverSort, onChange: setServerSort }}
        rowClassName={(quote) => cn(
          "transition-colors",
          quote.status === "Accepted"
            ? "bg-[var(--md-status-green-bg)] hover:bg-[color-mix(in_srgb,var(--md-status-green-bg)_82%,var(--md-green))]"
            : "hover:bg-[var(--md-hover)]",
        )}
        onRowClick={(quote) => navigate(`/quotes/${quote.reference.toLowerCase()}`)}
        toolbarTabs={(
          <RegisterViewSwitch
            options={quoteScopes}
            value={scope}
            onChange={setScope}
            ariaLabel={t("Quote ownership")}
            compact
          />
        )}
        toolbarSearch={(
          <div className="relative min-w-[128px] max-w-[280px] flex-1 sm:min-w-[200px] sm:flex-none">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.35} aria-hidden="true" />
              <Input
                type="text"
                role="searchbox"
                value={quickSearch}
                dir="auto"
                aria-label={t("Search quotes")}
                placeholder={t("Search quotes")}
                className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] ps-8 pe-8 text-base shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] md:text-[12px]"
                onChange={(event) => setQuickSearch(event.target.value)}
              />
              {quickSearch ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("Clear quick search")}
                  className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
                  onClick={() => setQuickSearch("")}
                >
                  <X className="size-3.5" strokeWidth={1.4} />
                </Button>
              ) : null}
          </div>
        )}
        toolbarFilters={(
            <AdvancedFilterPopover
              fields={quoteSearchFieldOptions}
              value={search}
              onChange={setSearch}
              storageKey="quote-register"
              label="Advanced search"
              title="Advanced quote search"
              itemLabel="quotes"
              countMatches={countDraftMatches}
              totalCount={availableQuoteTotal}
            />
        )}
        emptyState={quotesLoading ? (
          <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading quotes…" /></div>
        ) : scope === "Mine" && !quickSearch && filterQueryIsEmpty(search) ? (
          <div className="mx-auto grid max-w-sm place-items-center py-5 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No quotes assigned to you")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Quotes appear here when you are set as the sales or operations owner.")}</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
              <Search className="size-4" strokeWidth={1.3} />
            </span>
            <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No quotes match this search")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Change or clear the search to see more quotes.")}</p>
            <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-3 text-[12px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" onClick={clearSearch}>
              {t("Clear search")}
            </Button>
          </div>
        )}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={quoteTotal}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="quotes"
        onPageChange={setPage}
        onPageSizeChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage)
          setPage(1)
        }}
      />
    </DexterDockedPage>
  )
}
