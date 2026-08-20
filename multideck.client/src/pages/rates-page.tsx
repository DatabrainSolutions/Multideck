import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Globe2, Plane, Plus, Ship, Truck, type LucideIcon } from "lucide-react"

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
import { FilterChips, SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  comparePresets,
  compareRequestForShape,
  coverageFromOffers,
  createDraftSheet,
  customerById,
  defaultShapeFor,
  formatMoney,
  formatTransit,
  libraryCarriersFor,
  matchTariffOffers,
  modesForDirection,
  rateCarriers,
  rateCustomers,
  rateDirections,
  rateSheets,
  requestMarketRates,
  routeForDirection,
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
const workspaceViews = ["Rate book", "Compare"] as const
type RatesWorkspaceView = (typeof workspaceViews)[number]

const directionCopy: Record<RateDirection, { title: string; detail: string; icon: LucideIcon }> = {
  Import: {
    title: "Import",
    detail: "Inbound sea, air, rail, and road. Choose a mode, then a type such as FCL or LCL.",
    icon: Ship,
  },
  Export: {
    title: "Export",
    detail: "Outbound rate book. Sea and air often hold contracts; everything else is usually spot.",
    icon: Plane,
  },
  "Cross trade": {
    title: "Cross trade",
    detail: "Third-country moves. Expect spot first, with the occasional sea or air contract.",
    icon: Globe2,
  },
  Domestic: {
    title: "Domestic",
    detail: "UK road only: next-day, pallet networks, FTL and LTL. No sea types here.",
    icon: Truck,
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
  const [view, setView] = useState<RatesWorkspaceView>("Rate book")
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null)
  const onPresetConsumed = useCallback(() => setPendingPresetId(null), [])

  useEffect(() => {
    if (!direction) setView("Rate book")
  }, [direction])

  if (!direction) return <RatesDirectionHome navigate={navigate} />
  return (
    <RateDirectionWorkspace
      direction={direction}
      view={view}
      pendingPresetId={pendingPresetId}
      onViewChange={setView}
      onPresetConsumed={onPresetConsumed}
      onQueuePreset={setPendingPresetId}
      navigate={navigate}
    />
  )
}

function RatesDirectionHome({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [dexterOpen, setDexterOpen] = useState(false)

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Rates & Contracts")} className="md-page md-page-stack">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{t("Rates & Contracts")}</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--md-text)]">
            {t("Choose a direction first. Then a mode. Then a type.")}
          </p>
        </div>
        <DexterActionPill onClick={() => setDexterOpen(true)} />
      </header>

      <p className="max-w-2xl text-[13px] leading-5 text-[var(--md-text)]">
        {t("FCL and LCL belong to sea. Air, rail, and road have their own types. Domestic is road only.")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {rateDirections.map((direction) => {
          const copy = directionCopy[direction]
          const Icon = copy.icon
          return (
            <button
              key={direction}
              type="button"
              className="rounded-[var(--md-radius-2xl)] bg-white/40 p-3 text-start shadow-[var(--md-shadow-line)] transition-[background,opacity] hover:bg-white/70"
              onClick={() => navigate(routeForDirection(direction))}
            >
              <span className="inline-flex size-9 items-center justify-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-ink)]">
                <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="mt-3 block text-[15px] font-medium text-[var(--md-ink)]">{t(copy.title)}</span>
              <span className="mt-1 block text-[13px] leading-5 text-[var(--md-text)]">{t(copy.detail)}</span>
            </button>
          )
        })}
      </div>
    </DexterDockedPage>
  )
}

function RateDirectionWorkspace({
  direction,
  view,
  pendingPresetId,
  onViewChange,
  onPresetConsumed,
  onQueuePreset,
  navigate,
}: {
  direction: RateDirection
  view: RatesWorkspaceView
  pendingPresetId: string | null
  onViewChange: (view: RatesWorkspaceView) => void
  onPresetConsumed: () => void
  onQueuePreset: (id: string) => void
  navigate: (path: string) => void
}) {
  const { language, t } = useLanguage()
  const initialShape = defaultShapeFor(direction)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [sheets, setSheets] = useState(rateSheets)
  const [mode, setMode] = useState<RateMode>(initialShape.mode)
  const [shipmentType, setShipmentType] = useState(initialShape.shipmentType)
  const [source, setSource] = useState<RateSourceFilter>("Spot")
  const [carrierFilter, setCarrierFilter] = useState<string[]>([])
  const [customerId, setCustomerId] = useState(rateCustomers[0].id)
  const [honourNominated, setHonourNominated] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [request, setRequest] = useState<RateCompareRequest>(() => compareRequestForShape(direction, initialShape.mode, initialShape.shipmentType))
  const [includeMarket, setIncludeMarket] = useState(() => compareRequestForShape(direction, initialShape.mode, initialShape.shipmentType).includeMarket)
  const [tariffOffers, setTariffOffers] = useState<RateCompareOffer[]>([])
  const [marketOffers, setMarketOffers] = useState<RateCompareOffer[]>([])
  const [marketState, setMarketState] = useState<MarketRequestState>("idle")
  const [errorCount, setErrorCount] = useState(0)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [marketNonce, setMarketNonce] = useState(0)
  const pendingPresetRef = useRef(pendingPresetId)
  pendingPresetRef.current = pendingPresetId
  const copy = directionCopy[direction]
  const bookCustomer = customerById(customerId)
  const compareCustomer = customerById(request.customerId)
  const nominatedName = (view === "Compare" ? compareCustomer : bookCustomer)?.nominatedCarrierId
    ? rateCarriers.find((carrier) => carrier.id === (view === "Compare" ? compareCustomer : bookCustomer)?.nominatedCarrierId)?.name
    : undefined

  const modeOptions = modesForDirection(direction)
  const typeOptions = view === "Rate book"
    ? [...typesForDirection(direction, mode), "All types"]
    : typesForDirection(direction, mode)

  const bookCarriers = libraryCarriersFor(sheets.filter((sheet) => sheet.direction === direction))
  const nominatedInBook = Boolean(nominatedName && bookCarriers.includes(nominatedName))

  useEffect(() => {
    const queuedPresetId = pendingPresetRef.current
    if (queuedPresetId) {
      const preset = comparePresets.find((item) => item.id === queuedPresetId)
      onPresetConsumed()
      if (preset) {
        setMode(preset.request.mode)
        setShipmentType(preset.request.shipmentType)
        setRequest({ ...preset.request })
        setIncludeMarket(preset.request.includeMarket)
        setSource("Spot")
        setSelectedId(null)
        setPage(1)
        return
      }
    }
    const shape = defaultShapeFor(direction)
    setMode(shape.mode)
    setShipmentType(shape.shipmentType)
    setSource("Spot")
    setSelectedId(null)
    setPage(1)
    setRequest(compareRequestForShape(direction, shape.mode, shape.shipmentType))
    setIncludeMarket(compareRequestForShape(direction, shape.mode, shape.shipmentType).includeMarket)
  }, [direction, onPresetConsumed])

  useEffect(() => {
    if (view === "Compare" && shipmentType === "All types") {
      setShipmentType(typesForDirection(direction, mode)[0])
    }
  }, [direction, mode, shipmentType, view])

  const visible = useMemo(() => {
    const nominatedLock = honourNominated && nominatedInBook && nominatedName ? [nominatedName] : carrierFilter
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
  }, [carrierFilter, direction, honourNominated, mode, nominatedInBook, nominatedName, sheets, shipmentType, source])

  const pageCount = Math.max(Math.ceil(visible.length / rowsPerPage), 1)
  const paged = visible.slice((page - 1) * rowsPerPage, page * rowsPerPage)
  const selectedSheet = sheets.find((sheet) => sheet.id === selectedId) ?? visible[0] ?? null

  useEffect(() => {
    setPage(1)
  }, [mode, shipmentType, source, carrierFilter, honourNominated, customerId])

  const compareQuery = useMemo<RateCompareRequest>(() => ({
    ...request,
    direction,
    mode,
    shipmentType: shipmentType === "All types" ? typesForDirection(direction, mode)[0] : shipmentType,
    includeMarket,
  }), [direction, includeMarket, mode, request, shipmentType])

  useEffect(() => {
    if (view !== "Compare") return
    let cancelled = false
    const nextTariffs = matchTariffOffers(sheets, compareQuery)
    setTariffOffers(nextTariffs)
    setMarketOffers([])
    setErrorCount(0)
    setSelectedOfferId(null)
    if (!includeMarket) {
      setMarketState("idle")
      return
    }
    setMarketState("searching")
    void requestMarketRates(compareQuery).then((result) => {
      if (cancelled) return
      setMarketOffers(result.offers)
      setErrorCount(result.errors.length)
      setMarketState(result.errors.length ? "partial" : "ready")
    })
    return () => {
      cancelled = true
    }
  }, [compareQuery, includeMarket, marketNonce, sheets, view])

  const coverage = coverageFromOffers(tariffOffers)
  const compareCarrierOptions = useMemo(() => {
    const names = [...tariffOffers, ...marketOffers].map((row) => row.carrierName)
    return [...new Set(names)].sort((left, right) => left.localeCompare(right))
  }, [marketOffers, tariffOffers])
  const nominatedInCompare = Boolean(nominatedName && compareCarrierOptions.includes(nominatedName))
  const combinedOffers = useMemo(() => {
    const rows = includeMarket ? [...tariffOffers, ...marketOffers] : tariffOffers
    const nominatedLock = honourNominated && nominatedInCompare && nominatedName ? [nominatedName] : carrierFilter
    return nominatedLock.length ? rows.filter((row) => nominatedLock.includes(row.carrierName)) : rows
  }, [carrierFilter, honourNominated, includeMarket, marketOffers, nominatedInCompare, nominatedName, tariffOffers])
  const selectedOffer = combinedOffers.find((row) => row.id === selectedOfferId) ?? combinedOffers[0] ?? null

  function applyMode(nextMode: RateMode) {
    const nextType = typesForDirection(direction, nextMode)[0]
    setMode(nextMode)
    setShipmentType(nextType)
    const nextRequest = compareRequestForShape(direction, nextMode, nextType)
    setRequest(nextRequest)
    setIncludeMarket(nextRequest.includeMarket)
  }

  function applyType(nextType: string) {
    setShipmentType(nextType)
    if (nextType === "All types") return
    const nextRequest = compareRequestForShape(direction, mode, nextType)
    setRequest((current) => ({
      ...nextRequest,
      customerId: current.customerId,
      origin: current.origin,
      destination: current.destination,
      pallets: current.pallets,
      weightKg: current.weightKg,
    }))
  }

  function applyPreset(id: string) {
    const preset = comparePresets.find((item) => item.id === id)
    if (!preset) return
    onViewChange("Compare")
    setHonourNominated(true)
    setCarrierFilter([])
    if (preset.request.direction !== direction) {
      onQueuePreset(id)
      navigate(routeForDirection(preset.request.direction))
      return
    }
    setMode(preset.request.mode)
    setShipmentType(preset.request.shipmentType)
    setRequest({ ...preset.request })
    setIncludeMarket(preset.request.includeMarket)
  }

  function patchRequest(partial: Partial<RateCompareRequest>) {
    setRequest((current) => ({ ...current, ...partial }))
  }

  function pullMarket() {
    if (includeMarket) setMarketNonce((value) => value + 1)
    else setIncludeMarket(true)
  }

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
          <SegmentedControl
            options={workspaceViews}
            value={view}
            onChange={onViewChange}
            ariaLabel={t("Rate workspace view")}
            renderOption={(option) => t(option)}
          />
          {view === "Rate book" ? (
            <Button type="button" className="h-8 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" className="size-3.5" strokeWidth={1.4} />
              {t("Add tariff")}
            </Button>
          ) : null}
          <DexterActionPill onClick={() => setDexterOpen(true)} />
        </div>
      </header>

      <RateShapeFilters
        directionOptions={rateDirections}
        direction={direction}
        onDirectionChange={(next) => navigate(routeForDirection(next as RateDirection))}
        modeOptions={modeOptions}
        mode={mode}
        onModeChange={(next) => applyMode(next as RateMode)}
        typeOptions={typeOptions}
        shipmentType={shipmentType}
        onTypeChange={applyType}
        sourceOptions={view === "Rate book" ? sourceFilters : undefined}
        source={view === "Rate book" ? source : undefined}
        onSourceChange={view === "Rate book" ? (next) => setSource(next as RateSourceFilter) : undefined}
      />

      {view === "Compare" ? (
        <>
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
                  patchRequest({ customerId: value })
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
              <ZoneLookupField id="rate-origin" label="Origin" value={request.origin} onChange={(origin) => patchRequest({ origin })} placeholder="Postcode or area" />
              <ZoneLookupField id="rate-destination" label="Destination" value={request.destination} onChange={(destination) => patchRequest({ destination })} placeholder="Postcode or area" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Pallets")}</span>
                <Input type="number" min={1} value={request.pallets} className="rounded-[var(--md-radius-md)]" onChange={(event) => patchRequest({ pallets: Number(event.target.value) || 1 })} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Weight (kg)")}</span>
                <Input type="number" min={0} value={request.weightKg} className="rounded-[var(--md-radius-md)]" onChange={(event) => patchRequest({ weightKg: Number(event.target.value) || 0 })} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Service")}</span>
                <Select value={request.serviceLevel} onValueChange={(serviceLevel) => patchRequest({ serviceLevel })}>
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips
              options={["In-house only", "Include market"]}
              activeOption={includeMarket ? "Include market" : "In-house only"}
              onChange={(option) => setIncludeMarket(option === "Include market")}
              labelForOption={t}
            />
            <CarrierFilterControl
              carriers={compareCarrierOptions}
              value={honourNominated && nominatedInCompare && nominatedName ? [nominatedName] : carrierFilter}
              onChange={(value) => {
                setHonourNominated(false)
                setCarrierFilter(value)
              }}
              nominatedCarrierName={nominatedInCompare ? nominatedName : undefined}
              nominatedLocked={Boolean(honourNominated && nominatedInCompare)}
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
            offers={[...combinedOffers].sort((left, right) => left.buyTotal - right.buyTotal)}
            selectedId={selectedOffer?.id}
            onSelect={(offer) => setSelectedOfferId(offer.id)}
          />

          {selectedOffer ? <RateOfferBreakdown offer={selectedOffer} /> : null}

          <p className="text-[11px] text-[var(--md-subtle)]">
            {t("Prices in")} {ltr(language === "en-GB" ? "GBP / USD / EUR" : "GBP / USD / EUR", "text-[11px]")} · {combinedOffers.length} {t("offers")}
          </p>
        </>
      ) : (
        <>
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
              carriers={bookCarriers}
              value={honourNominated && nominatedInBook && nominatedName ? [nominatedName] : carrierFilter}
              onChange={(value) => {
                setHonourNominated(false)
                setCarrierFilter(value)
              }}
              nominatedCarrierName={nominatedInBook ? nominatedName : undefined}
              nominatedLocked={Boolean(honourNominated && nominatedInBook)}
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
            selectedRowKey={selectedSheet?.id}
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

          {selectedSheet ? <RateSheetDetail sheet={selectedSheet} locale={language} /> : null}
        </>
      )}

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
