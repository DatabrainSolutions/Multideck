import { useMemo, type ReactNode } from "react"
import { ArrowUpRight, LoaderCircle, MapPin, RefreshCw, Search } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { StatusPill } from "@/components/multideck/status-pill"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { FilterChips } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { StatusTone } from "@/data/multideck-data"
import {
  formatMoney,
  formatTransit,
  type RateCompareOffer,
  type RateCoverageStatus,
  type RateOfferConfidence,
  type RateSourceKind,
} from "@/data/rate-workspace-data"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type MarketRequestState = "idle" | "searching" | "ready" | "partial" | "expired"

function ltrValue(value: ReactNode, className = "") {
  return <span data-i18n-skip dir="ltr" className={className}>{value}</span>
}

export function RateSourcePill({
  source,
  confidence,
}: {
  source: RateSourceKind | "carrier-api" | "third-party" | string
  confidence?: RateOfferConfidence
}) {
  const { t } = useLanguage()
  const label = source === "contract"
    ? "Contract"
    : source === "tariff"
      ? "Tariff"
      : source === "carrier-api"
        ? "Carrier API"
        : source === "third-party"
          ? "Market index"
          : "Spot"
  const tone: StatusTone = source === "contract" ? "green" : source === "tariff" ? "teal" : "amber"
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusPill tone={tone}>{t(label)}</StatusPill>
      {confidence === "indicative" ? <StatusPill tone="amber">{t("Indicative")}</StatusPill> : null}
      {confidence === "firm" ? <StatusPill tone="green">{t("Firm")}</StatusPill> : null}
    </span>
  )
}

export function ZoneLookupField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const { t } = useLanguage()

  return (
    <label htmlFor={id} className="grid min-w-0 gap-1.5">
      <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t(label)}</span>
      <div className="relative">
        <MapPin className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
        <Input
          id={id}
          value={value}
          dir="ltr"
          data-i18n-skip
          placeholder={placeholder}
          className="rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] ps-8 text-[13px]"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  )
}

export function CarrierFilterControl({
  carriers,
  value,
  onChange,
  nominatedCarrierName,
  nominatedLocked,
  onClearNominated,
}: {
  carriers: string[]
  value: string[]
  onChange: (value: string[]) => void
  nominatedCarrierName?: string
  nominatedLocked?: boolean
  onClearNominated?: () => void
}) {
  const { t } = useLanguage()

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="min-w-[168px] max-w-[260px] flex-1">
        <MultiSelectMenu
          compact
          label="Carriers"
          placeholder="All carriers"
          options={carriers}
          value={value}
          onValueChange={onChange}
        />
      </div>
      {nominatedCarrierName ? (
        <p className="text-[11px] text-[var(--md-text)]">
          {t("Customer nominated")}: <span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{nominatedCarrierName}</span>
          {nominatedLocked && onClearNominated ? (
            <button type="button" className="ms-2 text-[11px] font-medium text-[var(--md-accent)]" onClick={onClearNominated}>
              {t("Compare all carriers")}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

export function RateShapeFilters({
  modeOptions,
  mode,
  onModeChange,
  typeOptions,
  shipmentType,
  onTypeChange,
  sourceOptions,
  source,
  onSourceChange,
}: {
  modeOptions: readonly string[]
  mode: string
  onModeChange: (value: string) => void
  typeOptions: readonly string[]
  shipmentType: string
  onTypeChange: (value: string) => void
  sourceOptions?: readonly string[]
  source?: string
  onSourceChange?: (value: string) => void
}) {
  const { t } = useLanguage()

  return (
    <section aria-label={t("Rate shape")} className="flex flex-wrap items-start gap-3 rounded-[var(--md-radius-xl)] bg-white/32 p-2.5 shadow-[var(--md-shadow-line)]">
      <div className="min-w-0">
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{t("Mode")}</p>
        <FilterChips options={modeOptions} activeOption={mode} onChange={onModeChange} labelForOption={t} />
      </div>
      <span className="hidden h-12 w-px self-center bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
      <div className="min-w-0">
        <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{t("Type")}</p>
        <FilterChips options={typeOptions} activeOption={shipmentType} onChange={onTypeChange} labelForOption={t} />
      </div>
      {sourceOptions && source && onSourceChange ? (
        <>
          <span className="hidden h-12 w-px self-center bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
          <div className="min-w-0">
            <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{t("Source")}</p>
            <FilterChips options={sourceOptions} activeOption={source} onChange={onSourceChange} labelForOption={t} />
          </div>
        </>
      ) : null}
    </section>
  )
}

export function MarketRateRequestBar({
  coverage,
  state,
  errorCount,
  onRequest,
  onRefresh,
}: {
  coverage: RateCoverageStatus
  state: MarketRequestState
  errorCount?: number
  onRequest: () => void
  onRefresh?: () => void
}) {
  const { t } = useLanguage()
  const coverageCopy = {
    covered: { title: "In tariffs", detail: "Filed rates cover this request. Market rates can still sit beside them for context.", tone: "green" as StatusTone },
    partial: { title: "Partial coverage", detail: "Some in-house rates match, but the book is thin. Request market rates before deciding.", tone: "amber" as StatusTone },
    uncovered: { title: "Not in tariffs", detail: "This request is not sitting in our rate book. Go to spot for an indicative market price.", tone: "amber" as StatusTone },
  }[coverage]
  const stateCopy = {
    idle: null,
    searching: t("Searching market"),
    ready: t("Indicative rates ready"),
    partial: t("Some sources failed or timed out"),
    expired: t("Spot expired — refresh"),
  }[state]

  return (
    <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={coverageCopy.tone}>{t(coverageCopy.title)}</StatusPill>
            {stateCopy ? <StatusPill tone={state === "ready" ? "teal" : "neutral"}>{stateCopy}</StatusPill> : null}
            {errorCount ? <span className="text-[11px] text-[var(--md-subtle)]">{errorCount} {t("sources unavailable")}</span> : null}
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-5 text-[var(--md-text)]">{t(coverageCopy.detail)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state === "expired" && onRefresh ? (
            <Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={onRefresh}>
              <RefreshCw data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
              {t("Refresh spot")}
            </Button>
          ) : (
            <Button type="button" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={onRequest} disabled={state === "searching"}>
              {state === "searching" ? <LoaderCircle data-icon="inline-start" className="size-3.5 animate-spin" strokeWidth={1.4} /> : <Search data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />}
              {t("Request market rates")}
            </Button>
          )}
        </div>
      </div>
    </Surface>
  )
}

export function markBestOffers(offers: RateCompareOffer[]) {
  const live = offers.filter((offer) => !offer.expired)
  const bestFirmId = live.filter((offer) => offer.confidence === "firm").sort((left, right) => left.buyTotal - right.buyTotal)[0]?.id
  const bestIndicativeId = live.filter((offer) => offer.confidence === "indicative").sort((left, right) => left.buyTotal - right.buyTotal)[0]?.id
  return { bestFirmId, bestIndicativeId }
}

export function RateCompareResults({
  offers,
  selectedId,
  onSelect,
  emptyLabel,
  emptyDetail,
  storageKey = "rate-compare-results",
}: {
  offers: RateCompareOffer[]
  selectedId?: string | null
  onSelect?: (offer: RateCompareOffer) => void
  emptyLabel?: string
  emptyDetail?: string
  storageKey?: string
}) {
  const { language, t } = useLanguage()
  const { bestFirmId, bestIndicativeId } = useMemo(() => markBestOffers(offers), [offers])

  const columns = useMemo<DataTableColumn<RateCompareOffer>[]>(() => [
    {
      id: "carrier",
      label: t("Carrier"),
      width: 168,
      sortValue: (row) => row.carrierName,
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-[var(--md-ink)]">{row.carrierName}</span>
          {row.id === selectedId ? <ArrowUpRight className="size-3 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" /> : null}
        </span>
      ),
    },
    {
      id: "tariff",
      label: t("Tariff"),
      width: 190,
      sortValue: (row) => row.tariffName,
      cell: (row) => <span className="text-[12px] text-[var(--md-text)]">{row.tariffName}</span>,
    },
    {
      id: "source",
      label: t("Source"),
      width: 168,
      sortValue: (row) => `${row.sourceLabel}-${row.confidence}`,
      cell: (row) => <RateSourcePill source={row.sourceKind} confidence={row.confidence} />,
    },
    {
      id: "service",
      label: t("Service"),
      width: 140,
      sortValue: (row) => row.serviceLevel,
      cell: (row) => <span className="text-[12px] text-[var(--md-text)]">{t(row.serviceLevel)}</span>,
    },
    {
      id: "originZone",
      label: t("Origin zone"),
      width: 120,
      sortValue: (row) => row.originZone ?? "",
      cell: (row) => row.originZone ? ltrValue(row.originZone, "text-[12px] font-medium text-[var(--md-ink)]") : <span className="text-[12px] text-[var(--md-subtle)]">—</span>,
    },
    {
      id: "destinationZone",
      label: t("Destination zone"),
      width: 136,
      sortValue: (row) => row.destinationZone ?? "",
      cell: (row) => row.destinationZone ? ltrValue(row.destinationZone, "text-[12px] font-medium text-[var(--md-ink)]") : <span className="text-[12px] text-[var(--md-subtle)]">—</span>,
    },
    {
      id: "transit",
      label: t("Transit"),
      width: 100,
      sortValue: (row) => row.transitDays,
      cell: (row) => ltrValue(formatTransit(row.transitDays), "text-[12px] tabular-nums text-[var(--md-ink)]"),
    },
    {
      id: "price",
      label: t("Buy price"),
      width: 120,
      sortValue: (row) => row.buyTotal,
      cell: (row) => (
        <span className="inline-flex flex-col">
          {ltrValue(formatMoney(row.buyTotal, row.currency, language), "text-[12px] font-medium tabular-nums text-[var(--md-ink)]")}
          {row.id === bestFirmId ? <span className="text-[10px] font-medium text-[var(--md-green)]">{t("Best firm")}</span> : null}
          {row.id === bestIndicativeId ? <span className="text-[10px] font-medium text-[var(--md-amber)]">{t("Best indicative")}</span> : null}
        </span>
      ),
    },
    {
      id: "validity",
      label: t("Validity"),
      width: 128,
      sortValue: (row) => row.validUntil,
      cell: (row) => (
        <span className="text-[12px] text-[var(--md-text)]">
          {ltrValue(row.validUntil.slice(0, 10), "tabular-nums")}
          {row.expired ? <StatusPill tone="red" className="ms-1">{t("Expired")}</StatusPill> : null}
        </span>
      ),
    },
  ], [bestFirmId, bestIndicativeId, language, selectedId, t])

  return (
    <DataTable
      ariaLabel={t("Supplier rates")}
      columnsButtonLabel={t("Manage rate columns")}
      columns={columns}
      rows={offers}
      getRowKey={(row) => row.id}
      storageKey={storageKey}
      selectedRowKey={selectedId ?? undefined}
      onRowClick={onSelect}
      rowClassName={(row) => cn("hover:bg-[var(--md-hover)]", row.id === bestFirmId && "bg-[rgba(14,125,116,0.04)]")}
      emptyState={(
        <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(emptyLabel ?? "No supplier rates match")}</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(emptyDetail ?? "Change the lane, cargo, or carrier filter, or request market rates.")}</p>
        </div>
      )}
    />
  )
}

export function RateOfferBreakdown({ offer }: { offer: RateCompareOffer }) {
  const { language, t } = useLanguage()

  return (
    <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
      <SectionHeader
        title={offer.tariffName}
        meta={`${offer.carrierName} · ${offer.serviceLevel}`}
        action={<RateSourcePill source={offer.sourceKind} confidence={offer.confidence} />}
      />
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Buy price")}</dt>
          <dd>{ltrValue(formatMoney(offer.buyTotal, offer.currency, language), "text-[14px] font-medium tabular-nums text-[var(--md-ink)]")}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Transit")}</dt>
          <dd className="text-[14px] font-medium text-[var(--md-ink)]">{ltrValue(formatTransit(offer.transitDays))}</dd>
        </div>
        {offer.originZone ? (
          <div>
            <dt className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Origin zone")}</dt>
            <dd>{ltrValue(offer.originZone, "text-[13px] text-[var(--md-ink)]")}</dd>
          </div>
        ) : null}
        {offer.destinationZone ? (
          <div>
            <dt className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Destination zone")}</dt>
            <dd>{ltrValue(offer.destinationZone, "text-[13px] text-[var(--md-ink)]")}</dd>
          </div>
        ) : null}
        {offer.routingSummary ? (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Routing")}</dt>
            <dd>{ltrValue(offer.routingSummary, "text-[13px] text-[var(--md-ink)]")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 overflow-hidden rounded-[calc(var(--md-radius-xl)-16px)] bg-[var(--md-surface-tint)]">
        {offer.breakdown.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
            <span className="text-[var(--md-text)]">{t(line.label)}</span>
            {ltrValue(formatMoney(line.amount, offer.currency, language), "tabular-nums font-medium text-[var(--md-ink)]")}
          </div>
        ))}
      </div>
      {offer.confidence === "indicative" ? (
        <p className="mt-3 text-[12px] leading-5 text-[var(--md-text)]">
          {t("Indicative market price only. Confirm a firm supplier quote before booking.")}
        </p>
      ) : null}
    </Surface>
  )
}
