import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { Pagination } from "@/components/multideck/pagination"
import {
  CarrierFilterControl,
  MarketRateRequestBar,
  RateCompareResults,
  RateOfferBreakdown,
  RateShapeFilters,
  RateSourcePill,
  ZoneLookupField,
  type MarketRequestState,
} from "@/components/multideck/rate-workspace-components"
import { StatusPill } from "@/components/multideck/status-pill"
import { FilterChips } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  comparePresets,
  coverageFromOffers,
  createDraftSheet,
  customerById,
  defaultCompareRequest,
  formatMoney,
  formatTransit,
  libraryCarriersFor,
  matchTariffOffers,
  modesForDirection,
  rateCarriers,
  rateCustomers,
  rateSheets,
  requestMarketRates,
  sourceFilterMatches,
  sourceFilters,
  typesForDirection,
  type RateCompareOffer,
  type RateCompareRequest,
  type RateDirection,
  type RateMode,
  type RateSheet,
  type RateSourceFilter,
  type RateSourceKind,
} from "@/data/rate-workspace-data"
import { useLanguage } from "@/i18n/language-provider"

const rowsPerPageOptions = [10, 20, 30]

const directionCopy: Record<RateDirection, { title: string; detail: string }> = {
  Import: {
    title: "Import",
    detail: "Filed contracts and spot tariffs for inbound sea, air, rail, and road.",
  },
  Export: {
    title: "Export",
    detail: "Outbound rate book. Sea and air often hold contracts; everything else is usually spot.",
  },
  "Cross trade": {
    title: "Cross trade",
    detail: "Third-country moves. Expect spot first, with the occasional sea or air contract.",
  },
  Domestic: {
    title: "Domestic",
    detail: "UK road tariffs: next-day, pallet networks, FTL and LTL. Add as many haulier sheets as the customer holds.",
  },
}

function directionFromRoute(route: string): RateDirection | null {
  if (route === "/rates/import") return "Import"
  if (route === "/rates/export") return "Export"
  if (route === "/rates/cross-trade") return "Cross trade"
  if (route === "/rates/domestic") return "Domestic"
  return null
}

function ltr(value: string, className = "") {
  return <span data-i18n-skip dir="ltr" className={className}>{value}</span>
}

export function RatesPage({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const direction = directionFromRoute(route)
  if (direction) return <RateLibraryWorkspace direction={direction} navigate={navigate} />
  return <RateCompareWorkspace navigate={navigate} />
}

function RateCompareWorkspace({ navigate }: { navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [dexterOpen, setDexterOpen] = useState(false)
  const [request, setRequest] = useState<RateCompareRequest>(defaultCompareRequest)
  const [includeMarket, setIncludeMarket] = useState(defaultCompareRequest.includeMarket)
  const [carrierFilter, setCarrierFilter] = useState<string[]>([])
  const [honourNominated, setHonourNominated] = useState(true)
  const [tariffOffers, setTariffOffers] = useState<RateCompareOffer[]>([])
  const [marketOffers, setMarketOffers] = useState<RateCompareOffer[]>([])
  const [marketState, setMarketState] = useState<MarketRequestState>("idle")
  const [errorCount, setErrorCount] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const customer = customerById(request.customerId)
  const nominatedName = customer?.nominatedCarrierId
    ? rateCarriers.find((carrier) => carrier.id === customer.nominatedCarrierId)?.name
    : undefined

  const [marketNonce, setMarketNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const nextTariffs = matchTariffOffers(rateSheets, request)
    setTariffOffers(nextTariffs)
    setMarketOffers([])
    setErrorCount(0)
    setSelectedId(null)
    if (!includeMarket) {
      setMarketState("idle")
      return
    }
    setMarketState("searching")
    void requestMarketRates(request).then((result) => {
      if (cancelled) return
      setMarketOffers(result.offers)
      setErrorCount(result.errors.length)
      setMarketState(result.errors.length ? "partial" : "ready")
    })
    return () => {
      cancelled = true
    }
  }, [includeMarket, marketNonce, request])

  const coverage = coverageFromOffers(tariffOffers)
  const carrierOptions = useMemo(() => {
    const names = [...tariffOffers, ...marketOffers].map((row) => row.carrierName)
    return [...new Set(names)].sort((left, right) => left.localeCompare(right))
  }, [marketOffers, tariffOffers])
  const nominatedInList = Boolean(nominatedName && carrierOptions.includes(nominatedName))
  const combined = useMemo(() => {
    const rows = includeMarket ? [...tariffOffers, ...marketOffers] : tariffOffers
    const nominatedLock = honourNominated && nominatedInList && nominatedName ? [nominatedName] : carrierFilter
    return nominatedLock.length ? rows.filter((row) => nominatedLock.includes(row.carrierName)) : rows
  }, [carrierFilter, honourNominated, includeMarket, marketOffers, nominatedInList, nominatedName, tariffOffers])
  const selected = combined.find((row) => row.id === selectedId) ?? combined[0] ?? null
  const modeOptions = modesForDirection(request.direction)
  const typeOptions = typesForDirection(request.direction, request.mode)

  function patch(partial: Partial<RateCompareRequest>) {
    setRequest((current) => {
      const next = { ...current, ...partial }
      if (partial.direction && partial.direction !== current.direction) {
        const modes = modesForDirection(next.direction)
        next.mode = modes.includes(current.mode) ? current.mode : modes[0]
        const types = typesForDirection(next.direction, next.mode)
        next.shipmentType = types.includes(current.shipmentType) ? current.shipmentType : types[0]
      }
      if (partial.mode && partial.mode !== current.mode) {
        const types = typesForDirection(next.direction, next.mode)
        next.shipmentType = types[0]
      }
      return next
    })
  }

  function applyPreset(id: string) {
    const preset = comparePresets.find((item) => item.id === id)
    if (!preset) return
    setRequest({ ...preset.request })
    setIncludeMarket(preset.request.includeMarket)
    setHonourNominated(true)
    setCarrierFilter([])
  }

  function pullMarket() {
    if (includeMarket) setMarketNonce((value) => value + 1)
    else setIncludeMarket(true)
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Compare rates")} className="md-page md-page-stack">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Compare rates")}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--md-text)]">
            {t("Match filed tariffs, then go to spot for an indicative market price before choosing a direction.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => navigate("/rates/domestic")}>
            {t("Open domestic book")}
          </Button>
          <DexterActionPill onClick={() => setDexterOpen(true)} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Examples")}</span>
        {comparePresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="h-8 rounded-full bg-white/40 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color] hover:bg-white/70 hover:text-[var(--md-ink)]"
            onClick={() => applyPreset(preset.id)}
          >
            {t(preset.label)}
          </button>
        ))}
      </div>

      <section className="grid gap-3 rounded-[var(--md-radius-xl)] bg-white/32 p-3 shadow-[var(--md-shadow-line)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Customer")}</span>
          <Select
            value={request.customerId}
            onValueChange={(value) => {
              setHonourNominated(true)
              setCarrierFilter([])
              patch({ customerId: value })
            }}
          >
            <SelectTrigger className="w-full rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rateCustomers.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <ZoneLookupField id="rate-origin" label="Origin" value={request.origin} onChange={(origin) => patch({ origin })} placeholder="Postcode or area" />
          <ZoneLookupField id="rate-destination" label="Destination" value={request.destination} onChange={(destination) => patch({ destination })} placeholder="Postcode or area" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Pallets")}</span>
            <Input type="number" min={1} value={request.pallets} className="rounded-[var(--md-radius-md)]" onChange={(event) => patch({ pallets: Number(event.target.value) || 1 })} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Weight (kg)")}</span>
            <Input type="number" min={0} value={request.weightKg} className="rounded-[var(--md-radius-md)]" onChange={(event) => patch({ weightKg: Number(event.target.value) || 0 })} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Service")}</span>
            <Select value={request.serviceLevel} onValueChange={(serviceLevel) => patch({ serviceLevel })}>
              <SelectTrigger className="w-full rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Any", "Next-day", "Economy 48", "Contract sailings", "Spot sailing"].map((option) => (
                  <SelectItem key={option} value={option}>{t(option)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips options={["Import", "Export", "Cross trade", "Domestic"]} activeOption={request.direction} onChange={(direction) => patch({ direction: direction as RateDirection })} labelForOption={t} />
      </div>

      <RateShapeFilters
        modeOptions={modeOptions}
        mode={request.mode}
        onModeChange={(mode) => patch({ mode: mode as RateMode })}
        typeOptions={typeOptions}
        shipmentType={request.shipmentType}
        onTypeChange={(shipmentType) => patch({ shipmentType })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          options={["In-house only", "Include market"]}
          activeOption={includeMarket ? "Include market" : "In-house only"}
          onChange={(option) => setIncludeMarket(option === "Include market")}
          labelForOption={t}
        />
        <CarrierFilterControl
          carriers={carrierOptions}
          value={honourNominated && nominatedInList && nominatedName ? [nominatedName] : carrierFilter}
          onChange={(value) => {
            setHonourNominated(false)
            setCarrierFilter(value)
          }}
          nominatedCarrierName={nominatedInList ? nominatedName : undefined}
          nominatedLocked={Boolean(honourNominated && nominatedInList)}
          onClearNominated={() => setHonourNominated(false)}
        />
      </div>

      <MarketRateRequestBar
        coverage={coverage}
        state={marketState}
        errorCount={errorCount}
        onRequest={pullMarket}
        onRefresh={pullMarket}
      />

      <RateCompareResults
        offers={[...combined].sort((left, right) => left.buyTotal - right.buyTotal)}
        selectedId={selected?.id}
        onSelect={(offer) => setSelectedId(offer.id)}
      />

      {selected ? <RateOfferBreakdown offer={selected} /> : null}

      <p className="text-[11px] text-[var(--md-subtle)]">
        {t("Prices in")} {ltr(language === "en-GB" ? "GBP / USD / EUR" : "GBP / USD / EUR", "text-[11px]")} · {combined.length} {t("offers")}
      </p>
    </DexterDockedPage>
  )
}

function RateLibraryWorkspace({ direction, navigate }: { direction: RateDirection; navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [dexterOpen, setDexterOpen] = useState(false)
  const [sheets, setSheets] = useState(rateSheets)
  const [mode, setMode] = useState<RateMode>(modesForDirection(direction)[0])
  const [shipmentType, setShipmentType] = useState("All types")
  const [source, setSource] = useState<RateSourceFilter>("Spot")
  const [carrierFilter, setCarrierFilter] = useState<string[]>([])
  const [customerId, setCustomerId] = useState(rateCustomers[0].id)
  const [honourNominated, setHonourNominated] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const copy = directionCopy[direction]
  const customer = customerById(customerId)
  const nominatedName = customer?.nominatedCarrierId
    ? rateCarriers.find((carrier) => carrier.id === customer.nominatedCarrierId)?.name
    : undefined

  const modeOptions = modesForDirection(direction)
  const typeOptions = ["All types", ...typesForDirection(direction, mode)]

  const carriers = libraryCarriersFor(sheets.filter((sheet) => sheet.direction === direction))
  const nominatedInSlice = Boolean(nominatedName && carriers.includes(nominatedName))

  useEffect(() => {
    const nextMode = modesForDirection(direction)[0]
    setMode(nextMode)
    setShipmentType("All types")
    setSource("Spot")
    setSelectedId(null)
    setPage(1)
  }, [direction])

  const visible = useMemo(() => {
    const nominatedLock = honourNominated && nominatedInSlice && nominatedName ? [nominatedName] : carrierFilter
    return sheets.filter((sheet) => {
      if (sheet.direction !== direction) return false
      if (sheet.mode !== mode) return false
      if (shipmentType !== "All types" && sheet.shipmentType !== shipmentType) return false
      if (!sourceFilterMatches(sheet, source)) return false
      const carrierName = rateCarriers.find((carrier) => carrier.id === sheet.carrierId)?.name ?? sheet.carrierId
      if (nominatedLock.length && !nominatedLock.includes(carrierName)) return false
      return true
    }).sort((left, right) => {
      const leftName = rateCarriers.find((carrier) => carrier.id === left.carrierId)?.name ?? left.carrierId
      const rightName = rateCarriers.find((carrier) => carrier.id === right.carrierId)?.name ?? right.carrierId
      return leftName.localeCompare(rightName) || left.name.localeCompare(right.name)
    })
  }, [carrierFilter, direction, honourNominated, mode, nominatedInSlice, nominatedName, sheets, shipmentType, source])

  const pageCount = Math.max(Math.ceil(visible.length / rowsPerPage), 1)
  const paged = visible.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const selected = sheets.find((sheet) => sheet.id === selectedId) ?? visible[0] ?? null

  useEffect(() => {
    setPage(1)
  }, [mode, shipmentType, source, carrierFilter, honourNominated, customerId])

  const columns = useMemo<DataTableColumn<RateSheet>[]>(() => [
    {
      id: "carrier",
      label: t("Carrier"),
      width: 168,
      sortValue: (row) => rateCarriers.find((carrier) => carrier.id === row.carrierId)?.name ?? row.carrierId,
      cell: (row) => <span className="text-[12px] font-medium text-[var(--md-ink)]">{rateCarriers.find((carrier) => carrier.id === row.carrierId)?.name ?? row.carrierId}</span>,
    },
    {
      id: "name",
      label: t("Tariff"),
      width: 210,
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className="grid">
          <span className="text-[12px] font-medium text-[var(--md-ink)]">{row.name}</span>
          {ltr(row.code, "text-[11px] text-[var(--md-subtle)]")}
        </span>
      ),
    },
    {
      id: "type",
      label: t("Type"),
      width: 130,
      sortValue: (row) => row.shipmentType,
      cell: (row) => <span className="text-[12px] text-[var(--md-text)]">{t(row.shipmentType)}</span>,
    },
    {
      id: "source",
      label: t("Source"),
      width: 120,
      sortValue: (row) => row.source,
      cell: (row) => <RateSourcePill source={row.source} />,
    },
    {
      id: "service",
      label: t("Service"),
      width: 140,
      sortValue: (row) => row.serviceLevel,
      cell: (row) => <span className="text-[12px] text-[var(--md-text)]">{t(row.serviceLevel)}</span>,
    },
    {
      id: "lane",
      label: t("Lane"),
      width: 180,
      sortValue: (row) => `${row.originName ?? ""}-${row.destinationName ?? ""}`,
      cell: (row) => row.originName && row.destinationName
        ? ltr(`${row.originName} → ${row.destinationName}`, "text-[12px] text-[var(--md-ink)]")
        : <span className="text-[12px] text-[var(--md-subtle)]">{t("Zoned UK")}</span>,
    },
    {
      id: "transit",
      label: t("Transit"),
      width: 96,
      sortValue: (row) => row.transitDays,
      cell: (row) => ltr(formatTransit(row.transitDays), "text-[12px] tabular-nums"),
    },
    {
      id: "validity",
      label: t("Validity"),
      width: 150,
      sortValue: (row) => row.validTo,
      cell: (row) => ltr(`${row.validFrom} – ${row.validTo}`, "text-[12px] tabular-nums text-[var(--md-text)]"),
    },
    {
      id: "status",
      label: t("Status"),
      width: 100,
      sortValue: (row) => row.status,
      cell: (row) => <StatusPill tone={row.status === "Live" ? "green" : row.status === "Draft" ? "blue" : "red"}>{t(row.status)}</StatusPill>,
    },
  ], [t])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t(copy.title)} className="md-page md-page-stack">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t(copy.title)}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--md-text)]">{t(copy.detail)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => navigate("/rates")}>
            {t("Compare rates")}
          </Button>
          <Button type="button" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => setAddOpen(true)}>
            <Plus data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
            {t("Add tariff")}
          </Button>
          <DexterActionPill onClick={() => setDexterOpen(true)} />
        </div>
      </header>

      <RateShapeFilters
        modeOptions={modeOptions}
        mode={mode}
        onModeChange={(next) => {
          const nextMode = next as RateMode
          setMode(nextMode)
          setShipmentType("All types")
        }}
        typeOptions={typeOptions}
        shipmentType={shipmentType}
        onTypeChange={setShipmentType}
        sourceOptions={sourceFilters}
        source={source}
        onSourceChange={(next) => setSource(next as RateSourceFilter)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="grid min-w-[180px] gap-1.5">
          <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Customer")}</span>
          <Select
            value={customerId}
            onValueChange={(value) => {
              setCustomerId(value)
              setHonourNominated(true)
              setCarrierFilter([])
            }}
          >
            <SelectTrigger className="w-full rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rateCustomers.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <CarrierFilterControl
          carriers={carriers}
          value={honourNominated && nominatedInSlice && nominatedName ? [nominatedName] : carrierFilter}
          onChange={(value) => {
            setHonourNominated(false)
            setCarrierFilter(value)
          }}
          nominatedCarrierName={nominatedInSlice ? nominatedName : undefined}
          nominatedLocked={Boolean(honourNominated && nominatedInSlice)}
          onClearNominated={() => setHonourNominated(false)}
        />
      </div>

      <DataTable
        ariaLabel={t("Rate book")}
        columnsButtonLabel={t("Manage rate columns")}
        columns={columns}
        rows={paged}
        getRowKey={(row) => row.id}
        storageKey={`rate-library-${direction}`}
        selectedRowKey={selected?.id}
        onRowClick={(row) => setSelectedId(row.id)}
        rowClassName="hover:bg-[var(--md-hover)]"
        emptyState={(
          <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No tariffs in this slice")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add a tariff, or widen the mode, type, source, or carrier filter.")}</p>
          </div>
        )}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={visible.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="tariffs"
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setRowsPerPage(next)
          setPage(1)
        }}
      />

      {selected ? <RateSheetDetail sheet={selected} locale={language} /> : null}

      <AddTariffDialog
        open={addOpen}
        direction={direction}
        mode={mode}
        shipmentType={shipmentType === "All types" ? typesForDirection(direction, mode)[0] : shipmentType}
        onClose={() => setAddOpen(false)}
        onAdd={(sheet) => {
          setSheets((current) => [sheet, ...current])
          setSelectedId(sheet.id)
          setSource("All")
          setAddOpen(false)
        }}
      />
    </DexterDockedPage>
  )
}

function RateSheetDetail({ sheet, locale }: { sheet: RateSheet; locale: string }) {
  const { t } = useLanguage()
  const carrier = rateCarriers.find((item) => item.id === sheet.carrierId)

  return (
    <section className="rounded-[var(--md-radius-xl)] bg-white/40 p-4 shadow-[var(--md-shadow-line)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{sheet.name}</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{carrier?.name} · {t(sheet.serviceLevel)}</p>
        </div>
        <RateSourcePill source={sheet.source} />
      </div>
      {sheet.notes ? <p className="mt-3 max-w-3xl text-[13px] leading-5 text-[var(--md-text)]">{t(sheet.notes)}</p> : null}
      <div className="mt-4 overflow-hidden rounded-[calc(var(--md-radius-xl)-16px)] bg-[var(--md-surface-tint)]">
        {sheet.lines.length ? sheet.lines.map((line) => (
          <div key={line.id} className="grid gap-2 px-3 py-2.5 text-[12px] sm:grid-cols-[minmax(0,1.4fr)_90px_110px_minmax(0,1fr)]">
            <span className="text-[var(--md-ink)]">{line.description}</span>
            {ltr(line.chargeCode, "font-medium text-[var(--md-subtle)]")}
            {ltr(formatMoney(line.unitRate, sheet.currency, locale), "tabular-nums font-medium text-[var(--md-ink)]")}
            <span className="text-[var(--md-text)]">
              {line.originZone && line.destinationZone ? ltr(`${line.originZone} → ${line.destinationZone}`) : t(line.basis.replace("per-", "Per "))}
            </span>
          </div>
        )) : (
          <p className="px-3 py-3 text-[12px] text-[var(--md-text)]">{t("No charge lines yet. Complete this tariff from the supplier file.")}</p>
        )}
      </div>
    </section>
  )
}

function AddTariffDialog({
  open,
  direction,
  mode,
  shipmentType,
  onClose,
  onAdd,
}: {
  open: boolean
  direction: RateDirection
  mode: RateMode
  shipmentType: string
  onClose: () => void
  onAdd: (sheet: RateSheet) => void
}) {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [carrierId, setCarrierId] = useState(rateCarriers[0].id)
  const [source, setSource] = useState<RateSourceKind>("tariff")
  const [serviceLevel, setServiceLevel] = useState(direction === "Domestic" ? "Next-day" : "Spot sailing")

  useEffect(() => {
    if (!open) return
    setName("")
    setCarrierId(rateCarriers[0].id)
    setSource(direction === "Domestic" ? "tariff" : "spot")
    setServiceLevel(direction === "Domestic" ? "Next-day" : "Spot sailing")
  }, [direction, open])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t("Add tariff")}</DialogTitle>
          <DialogDescription>{t("Add another supplier sheet to this rate book. Existing tariffs stay in place.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Tariff name")}</span>
            <Input value={name} dir="auto" className="rounded-[var(--md-radius-md)]" placeholder={t("Supplier tariff")} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Carrier")}</span>
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger className="w-full rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rateCarriers.map((carrier) => (
                  <SelectItem key={carrier.id} value={carrier.id}>{carrier.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Source")}</span>
              <Select value={source} onValueChange={(value) => setSource(value as RateSourceKind)}>
                <SelectTrigger className="w-full rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tariff">{t("Tariff")}</SelectItem>
                  <SelectItem value="spot">{t("Spot")}</SelectItem>
                  <SelectItem value="contract">{t("Contract")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Service")}</span>
              <Input value={serviceLevel} dir="auto" className="rounded-[var(--md-radius-md)]" onChange={(event) => setServiceLevel(event.target.value)} />
            </label>
          </div>
          <p className="text-[12px] text-[var(--md-text)]">
            {t("This sheet will be added to")} {t(direction)} · {t(mode)} · {t(shipmentType)}.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-[var(--md-radius-md)]" onClick={onClose}>{t("Cancel")}</Button>
          <Button
            type="button"
            className="rounded-[var(--md-radius-md)]"
            onClick={() => onAdd(createDraftSheet({
              name,
              carrierId,
              direction,
              mode,
              shipmentType,
              source,
              serviceLevel,
              currency: direction === "Domestic" ? "GBP" : "USD",
              validFrom: "2026-08-20",
              validTo: "2026-12-31",
              transitDays: direction === "Domestic" ? 1 : 28,
            }, rateSheets.length))}
          >
            {t("Add tariff")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
