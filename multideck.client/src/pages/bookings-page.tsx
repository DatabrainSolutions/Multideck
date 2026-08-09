import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { ArrowDownAZ, ArrowUpAZ, CalendarClock, Search, Star, TriangleAlert, X } from "@/components/icons/hugeicons"
import {
  BookingBoardPreview,
  BookingListHeader,
  BookingMetricStrip,
  BookingModePill,
  BookingStatusPill,
  bookingSearchFieldOptions,
  getBookingDetailPath,
  bookingViewModes,
  type Booking,
  type BookingSearchField,
  type BookingViewMode,
} from "@/components/multideck/booking-components"
import { AdvancedFilterPopover } from "@/components/multideck/advanced-filter-popover"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { Pagination } from "@/components/multideck/pagination"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { ChoiceControl } from "@/components/multideck/workflow-components"
import { toneToVar } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { currentOperator, getBookingShape, bookingScopeTabs } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { getSavedView, saveView } from "@/lib/view-preferences"
import {
  createEmptyFilterQuery,
  matchesFilterQuery,
  type FilterFieldOption,
  type FilterQuery,
} from "@/lib/advanced-filters"
import { listLiveBookings, type LiveBooking } from "@/lib/application-data-api"

const rowsPerPageOptions = [10, 20, 30, 50]
const bookingViewStorageKey = "multideck.view.bookings"
type BookingScope = (typeof bookingScopeTabs)[number]
type BookingSortDirection = "asc" | "desc"
const dateSearchFields = new Set<BookingSearchField>(["date", "departure", "arrival"])
const directionFilters = ["All directions", "Import", "Export", "Domestic", "Cross trade"] as const
const modeFilters = ["All modes", "OCEAN", "AIR", "ROAD", "FAS", "FSA"] as const
const shipmentTypeFiltersByMode = {
  "All modes": ["All types"],
  OCEAN: ["All types", "FCL", "LCL", "Breakbulk", "RoRo", "Dry bulk", "Liquid bulk", "Project cargo"],
  AIR: ["All types", "General cargo", "ULD", "Air consolidation", "Back-to-back", "Express / courier", "Charter"],
  ROAD: ["All types", "FTL", "LTL", "Groupage", "Pallet network", "Dedicated vehicle", "Parcel / express"],
  FAS: ["All types", "Multiple"],
  FSA: ["All types", "Multiple"],
} as const
type ShipmentTypeFilter = (typeof shipmentTypeFiltersByMode)[keyof typeof shipmentTypeFiltersByMode][number]

function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

function getCustomField(booking: LiveBooking, labels: readonly string[]) {
  const normalizedLabels = labels.map(normalized)
  return booking.customFields.find((field) => normalizedLabels.includes(normalized(field.label)))?.value ?? ""
}

function getBookingExceptionSummary(booking: LiveBooking) {
  const detail = getCustomField(booking, ["Exception", "Delay reason", "Licence", "Blocker", "Tracking"])
  if (detail) return detail
  if (booking.status === "Exception") return "Action required"
  if (booking.status === "Delayed") return "Schedule changed"
  return "No open exception"
}

function getBookingNextAction(booking: LiveBooking) {
  if (booking.status === "Exception") return getBookingExceptionSummary(booking)
  if (booking.status === "Delayed") return "Review schedule and update customer"
  if (booking.progress >= 100) return "Complete"
  if (booking.progress < 25) return "Confirm booking and departure"
  if (booking.progress < 75) return "Monitor movement"
  return "Prepare arrival and delivery"
}

function formatOperationalDate(value: string, language: string) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", timeZone: "UTC" }).format(date)
}

function formatLastActivity(value: string, language: string) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)
}

function getCustomFieldValues(booking: Booking) {
  return booking.customFields.flatMap((field) => [field.label, field.value, `${field.label} ${field.value}`])
}

type TextBookingSearchField = Exclude<BookingSearchField, "date" | "departure" | "arrival">

function getBookingSearchValues(booking: Booking, field: TextBookingSearchField) {
  const fullTextValues = [
    booking.id,
    booking.customer,
    booking.route,
    booking.carrier,
    booking.container,
    booking.mode,
    booking.value,
    booking.eta,
    booking.time,
    booking.status,
    booking.owner,
    booking.invoice,
    booking.jobRef,
    booking.customerRef,
    booking.supplierRef,
    booking.origin,
    booking.destination,
    booking.vessel,
    booking.vin,
    ...getCustomFieldValues(booking),
  ]

  const valuesByField: Record<TextBookingSearchField, string[]> = {
    any: fullTextValues,
    invoice: [booking.invoice],
    jobRef: [booking.jobRef],
    customerRef: [booking.customerRef],
    supplierRef: [booking.supplierRef],
    destination: [booking.destination, booking.route],
    origin: [booking.origin, booking.route],
    vessel: [booking.vessel, booking.carrier],
    vin: [booking.vin],
    customFields: getCustomFieldValues(booking),
  }

  return valuesByField[field]
}

const bookingFilterFields: readonly FilterFieldOption[] = bookingSearchFieldOptions.map((option) => (
  dateSearchFields.has(option.value)
    ? { value: option.value, label: option.label, kind: "date" as const }
    : { value: option.value, label: option.label, placeholder: option.placeholder }
))

function bookingFilterValue(booking: Booking, field: string) {
  if (field === "date") return [booking.departureDate, booking.arrivalDate]
  if (field === "departure") return booking.departureDate
  if (field === "arrival") return booking.arrivalDate
  return getBookingSearchValues(booking, field as TextBookingSearchField)
}

function bookingMatchesSearch(booking: Booking, search: FilterQuery) {
  return matchesFilterQuery(booking, search, bookingFilterValue)
}

export function BookingsPage({ navigate }: { navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [scope, setScope] = useState<BookingScope>("All Jobs")
  const [viewMode, setViewMode] = useState<BookingViewMode>(() => getSavedView(bookingViewStorageKey, bookingViewModes, bookingViewModes[0]))
  const [bookingRecords, setBookingRecords] = useState<LiveBooking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [bookingsError, setBookingsError] = useState<string | null>(null)
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set())
  const [sortDirection, setSortDirection] = useState<BookingSortDirection>("asc")
  const [search, setSearch] = useState<FilterQuery>(createEmptyFilterQuery)
  const [quickSearch, setQuickSearch] = useState("")
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [directionFilter, setDirectionFilter] = useState<(typeof directionFilters)[number]>(directionFilters[0])
  const [modeFilter, setModeFilter] = useState<(typeof modeFilters)[number]>(modeFilters[0])
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState<ShipmentTypeFilter>("All types")
  const shipmentTypeFilters = shipmentTypeFiltersByMode[modeFilter]

  useEffect(() => {
    let cancelled = false
    setBookingsLoading(true)
    setBookingsError(null)
    void listLiveBookings().then((records) => {
      if (!cancelled) {
        setBookingRecords(records)
        setFavouriteIds(new Set(records.filter((record) => record.isFavourite).map((record) => record.id)))
      }
    }).catch((error) => {
      if (!cancelled) setBookingsError(error instanceof Error ? error.message : "Bookings could not be loaded.")
    }).finally(() => { if (!cancelled) setBookingsLoading(false) })
    return () => { cancelled = true }
  }, [])

  const scopedBookings = useMemo(() => {
    return (
      scope === "My Jobs" ? bookingRecords.filter((booking) => booking.owner === currentOperator.initials) :
        scope === "Staged Jobs" ? bookingRecords.filter((booking) => booking.progress < 25) :
          bookingRecords
    )
  }, [bookingRecords, scope])

  /** The shape pills and quick search apply alongside the advanced filter, so both share one predicate. */
  const matchesToolbarFilters = useCallback((booking: LiveBooking) => {
    const quickQuery = normalized(quickSearch)
    const shape = getBookingShape(booking.id)
    return (directionFilter === "All directions" || shape.direction === directionFilter)
      && (modeFilter === "All modes" || booking.mode === modeFilter)
      && (shipmentTypeFilter === "All types" || shape.shipmentType === shipmentTypeFilter)
      && (!quickQuery || getBookingSearchValues(booking, "any").some((candidate) => normalized(candidate).includes(quickQuery)))
  }, [directionFilter, modeFilter, quickSearch, shipmentTypeFilter])

  const visibleBookings = useMemo(() => (
    scopedBookings
      .filter((booking) => matchesToolbarFilters(booking) && bookingMatchesSearch(booking, search))
      .sort((a, b) => {
        const result = a.customer.localeCompare(b.customer, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)
        return sortDirection === "asc" ? result : -result
      })
  ), [matchesToolbarFilters, scopedBookings, search, sortDirection])

  const countDraftMatches = useCallback(
    (draft: FilterQuery) => scopedBookings.filter((booking) => matchesToolbarFilters(booking) && bookingMatchesSearch(booking, draft)).length,
    [matchesToolbarFilters, scopedBookings],
  )

  const pageCount = Math.max(Math.ceil(visibleBookings.length / rowsPerPage), 1)
  const paginatedBookings = visibleBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [directionFilter, modeFilter, quickSearch, scope, shipmentTypeFilter, viewMode, search])

  useEffect(() => {
    saveView(bookingViewStorageKey, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function toggleFavourite(id: string) {
    setFavouriteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openBooking(booking: Booking) {
    navigate(getBookingDetailPath(booking.id))
  }

  function changeMode(nextMode: (typeof modeFilters)[number]) {
    setModeFilter(nextMode)
    if (!shipmentTypeFiltersByMode[nextMode].includes(shipmentTypeFilter as never)) setShipmentTypeFilter("All types")
  }

  function clearFilters() {
    setQuickSearch("")
    setSearch(createEmptyFilterQuery())
    setDirectionFilter(directionFilters[0])
    setModeFilter(modeFilters[0])
    setShipmentTypeFilter("All types")
    setPage(1)
  }

  const columns = useMemo<DataTableColumn<LiveBooking>[]>(() => [
    {
      id: "star",
      label: t("Star"),
      width: 52,
      minWidth: 52,
      maxWidth: 52,
      resizable: false,
      cell: (booking) => {
        const favourite = favouriteIds.has(booking.id)
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(`${favourite ? "Remove" : "Add"} ${booking.id} favourite`)}
            className={favourite ? "size-8 text-[var(--md-amber)] transition-transform active:scale-[0.96] motion-reduce:transition-none" : "size-8 text-[var(--md-subtle)] transition-transform active:scale-[0.96] motion-reduce:transition-none"}
            onClick={(event) => {
              event.stopPropagation()
              toggleFavourite(booking.id)
            }}
          >
            <Star className={favourite ? "size-4 fill-current" : "size-4"} strokeWidth={1.35} />
          </Button>
        )
      },
    },
    {
      id: "status",
      label: t("Status and exception"),
      kind: "status",
      width: 220,
      minWidth: 188,
      resizable: true,
      sortValue: (booking) => `${booking.status} ${getBookingExceptionSummary(booking)}`,
      cell: (booking) => (
        <div className="min-w-0">
          <BookingStatusPill status={booking.status} />
          <p className="mt-1.5 truncate text-[11px] leading-4 text-[var(--md-text)]" title={getBookingExceptionSummary(booking)}>
            {t(getBookingExceptionSummary(booking))}
          </p>
        </div>
      ),
    },
    {
      id: "booking",
      label: t("Booking and references"),
      width: 188,
      minWidth: 164,
      resizable: true,
      sortValue: (booking) => booking.id,
      cell: (booking) => (
        <div className="min-w-0" dir="ltr">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: toneToVar(booking.tone) }} />
            <span className="truncate text-[13px] font-medium text-[var(--md-accent)]">{booking.id}</span>
          </div>
          <p className="mt-1.5 truncate ps-4 text-[11px] text-[var(--md-text)]" title={booking.jobRef || booking.customerRef}>
            {booking.jobRef || booking.customerRef || t("No linked reference")}
          </p>
        </div>
      ),
    },
    {
      id: "customerCargo",
      label: t("Customer and cargo"),
      width: 240,
      minWidth: 200,
      maxWidth: 340,
      resizable: true,
      sortValue: (booking) => booking.customer,
      cell: (booking) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" title={booking.customer}>{booking.customer}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--md-text)]" title={`${booking.shipmentType} · ${booking.container}`}>
            {booking.shipmentType || t("General cargo")} · <bdi>{booking.container || t("Equipment pending")}</bdi>
          </p>
        </div>
      ),
    },
    {
      id: "movement",
      label: t("Movement"),
      width: 320,
      minWidth: 272,
      maxWidth: 420,
      resizable: true,
      cellClassName: "align-top py-3",
      sortValue: (booking) => `${booking.origin} ${booking.destination} ${booking.carrier}`,
      cell: (booking) => {
        const shape = getBookingShape(booking.id)
        const direction = booking.direction || shape.direction
        const shipmentType = booking.shipmentType || shape.shipmentType

        return (
          <div className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[12px] font-medium text-[var(--md-ink)]">{t(direction)}</p>
              <BookingModePill mode={booking.mode} />
            </div>
            <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" title={booking.route}>{booking.route}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-[var(--md-text)]">
              <span className="truncate">{t(shipmentType)}</span>
              <span className="shrink-0 text-[var(--md-subtle)]" aria-hidden="true">·</span>
              <span className="truncate text-[var(--md-subtle)]" title={booking.carrier}>{booking.carrier || t("Carrier pending")}</span>
            </p>
            {booking.vessel ? <p className="truncate text-[10.5px] text-[var(--md-subtle)]" title={booking.vessel}>{booking.vessel}</p> : null}
          </div>
        )
      },
    },
    {
      id: "schedule",
      label: t("Schedule"),
      width: 190,
      minWidth: 170,
      resizable: true,
      cellClassName: "align-top py-3",
      sortValue: (booking) => booking.arrivalDate,
      cell: (booking) => (
        <div className="grid grid-cols-2 gap-3 tabular-nums" dir="ltr">
          <div>
            <p className="text-[10px] font-medium text-[var(--md-subtle)]">{t("ETD")}</p>
            <p className="mt-1 text-[12px] font-medium text-[var(--md-ink)]">{formatOperationalDate(booking.departureDate, language)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--md-subtle)]">{t("ETA")}</p>
            <p className="mt-1 text-[12px] font-medium text-[var(--md-ink)]">{formatOperationalDate(booking.arrivalDate, language)}</p>
          </div>
        </div>
      ),
    },
    {
      id: "nextAction",
      label: t("Next action"),
      width: 220,
      minWidth: 180,
      maxWidth: 300,
      resizable: true,
      sortValue: (booking) => getBookingNextAction(booking),
      cell: (booking) => (
        <div className="flex min-w-0 items-start gap-2">
          {booking.status === "Exception" ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--md-red)]" strokeWidth={1.5} aria-hidden="true" /> : <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" />}
          <div className="min-w-0">
            <p className="line-clamp-2 text-[12px] font-medium leading-4 text-[var(--md-ink)]">{t(getBookingNextAction(booking))}</p>
            <p className="mt-1 text-[11px] text-[var(--md-text)]">{booking.eta} · <bdi>{booking.currentLocation}</bdi></p>
          </div>
        </div>
      ),
    },
    {
      id: "ownerActivity",
      label: t("Owner and activity"),
      width: 160,
      minWidth: 140,
      resizable: true,
      sortValue: (booking) => booking.updatedAt,
      cell: (booking) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--md-accent-a12)] text-[12px] font-medium text-[var(--md-accent)]">{booking.owner || "—"}</span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-[var(--md-ink)]">{t("Updated")}</p>
            <p className="mt-0.5 truncate text-[10px] tabular-nums text-[var(--md-text)]" title={formatLastActivity(booking.updatedAt, language)}>{t(formatLastActivity(booking.updatedAt, language))}</p>
          </div>
        </div>
      ),
    },
    {
      id: "progress",
      label: t("Progress"),
      width: 172,
      minWidth: 140,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.progress,
      cell: (booking) => (
        <div className="flex items-center gap-3">
          <Progress
            value={booking.progress}
            className="h-1.5 flex-1 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--progress-color)]"
            style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties}
          />
          <span className="w-8 text-right text-[12px] tabular-nums text-[var(--md-text)]">{booking.progress}%</span>
        </div>
      ),
    },
    {
      id: "value",
      label: t("Booking value"),
      width: 130,
      minWidth: 110,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => Number(booking.value.replace(/[^0-9.-]/g, "")),
      cell: (booking) => <span className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{booking.value || "—"}</span>,
    },
    {
      id: "customerReference",
      label: t("Customer reference"),
      width: 170,
      minWidth: 140,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.customerRef,
      cell: (booking) => <span className="text-[12px] text-[var(--md-ink)]" dir="auto">{booking.customerRef || "—"}</span>,
    },
    {
      id: "supplierReference",
      label: t("Supplier reference"),
      width: 170,
      minWidth: 140,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.supplierRef,
      cell: (booking) => <span className="text-[12px] text-[var(--md-ink)]" dir="auto">{booking.supplierRef || "—"}</span>,
    },
    {
      id: "invoice",
      label: t("Invoice"),
      width: 160,
      minWidth: 130,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.invoice,
      cell: (booking) => <span className="text-[12px] text-[var(--md-ink)]" dir="ltr">{booking.invoice || t("Not raised")}</span>,
    },
  ], [favouriteIds, language, t])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Bookings")} className="md-page md-page-stack">
      <BookingListHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSpeakToDexter={() => setDexterOpen(true)}
        scopeOptions={bookingScopeTabs}
        scope={scope}
        onScopeChange={setScope}
      />
      <BookingMetricStrip rows={scopedBookings} />
      {bookingsError ? <div role="alert" className="rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 py-3 text-[13px] text-[var(--md-red)]">{t("Bookings could not be loaded.")} {bookingsError}</div> : null}
      {viewMode === "Table" ? (
        <DataTable
          ariaLabel={t("Bookings")}
          columnsButtonLabel={t("Manage booking columns")}
          columns={columns}
          rows={bookingsLoading ? [] : paginatedBookings}
          getRowKey={(booking) => booking.id}
          storageKey="booking-register-operations-v2"
          rowClassName={() => "hover:bg-[var(--md-hover)]"}
          onRowClick={openBooking}
          toolbarFilters={(
            <>
              <div aria-label={t("Booking shape")} className="flex max-w-full flex-wrap items-center gap-1.5">
                <ShapeFilter compact label={t("Direction")} options={directionFilters} value={directionFilter} onChange={setDirectionFilter} />
                <ShapeFilter compact label={t("Mode")} options={modeFilters} value={modeFilter} onChange={changeMode} />
                {shipmentTypeFilters.length > 1 ? <ShapeFilter compact label={t("Type")} options={shipmentTypeFilters} value={shipmentTypeFilter} onChange={setShipmentTypeFilter} /> : null}
              </div>
              <AdvancedFilterPopover
                fields={bookingFilterFields}
                value={search}
                onChange={setSearch}
                storageKey="booking-register"
                label="Advanced search"
                title="Advanced booking search"
                itemLabel="bookings"
                countMatches={countDraftMatches}
                totalCount={scopedBookings.length}
              />
            </>
          )}
          toolbarSearch={(
            <div className="relative min-w-[128px] max-w-[280px] flex-1 sm:min-w-[200px] sm:flex-none">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.35} />
                <Input
                  type="search"
                  value={quickSearch}
                  dir="auto"
                  aria-label={t("Search bookings")}
                  placeholder={t("Search bookings")}
                  className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] ps-8 pe-8 text-base shadow-[var(--md-shadow-line)] md:text-[12px]"
                  onChange={(event) => setQuickSearch(event.target.value)}
                />
                {quickSearch ? (
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Clear quick search")} className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-[var(--md-radius-sm)]" onClick={() => setQuickSearch("")}>
                    <X className="size-3.5" strokeWidth={1.4} />
                  </Button>
                ) : null}
            </div>
          )}
          toolbarOptions={(
              <Button
                type="button"
                variant="ghost"
                aria-label={t(sortDirection === "asc" ? "Sort bookings Z to A" : "Sort bookings A to Z")}
                aria-pressed={sortDirection === "desc"}
                className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] active:scale-[0.96]"
                onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
              >
                {sortDirection === "asc" ? <ArrowDownAZ className="size-3.5" strokeWidth={1.45} /> : <ArrowUpAZ className="size-3.5" strokeWidth={1.45} />}
                <span aria-hidden="true">{sortDirection === "asc" ? "A–Z" : "Z–A"}</span>
              </Button>
          )}
          emptyState={bookingsLoading ? <div className="mx-auto py-8 text-center text-[13px] text-[var(--md-text)]">{t("Loading bookings...")}</div> : (
            <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
                <Search className="size-4" strokeWidth={1.3} aria-hidden="true" />
              </span>
              <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No bookings match this search")}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Change or clear a filter to see more bookings.")}</p>
              <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-3 text-[12px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" onClick={clearFilters}>
                {t("Clear filters")}
              </Button>
            </div>
          )}
        />
      ) : null}

      {viewMode === "Board" ? (
        <BookingBoardPreview
          rows={visibleBookings}
          onOpenBooking={openBooking}
          onMoveBooking={(_bookingId, _status, orderedRows) => {
            const orderedIndex = new Map(orderedRows.map((booking, index) => [booking.id, index]))
            setBookingRecords((current) => [...current].sort((first, second) => {
              const firstIndex = orderedIndex.get(first.id)
              const secondIndex = orderedIndex.get(second.id)
              if (firstIndex === undefined || secondIndex === undefined) return 0
              return firstIndex - secondIndex
            }))
          }}
        />
      ) : null}

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={visibleBookings.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="bookings"
        onPageChange={setPage}
        onPageSizeChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage)
          setPage(1)
        }}
      />
    </DexterDockedPage>
  )
}

function ShapeFilter<T extends string>({ label, options, value, onChange, compact = false }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void; compact?: boolean }) {
  const { t } = useLanguage()

  return (
    <div className="min-w-0">
      {compact ? null : <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>}
      <ChoiceControl
        options={options.map((option) => ({ value: option, label: t(option) }))}
        value={value}
        onChange={onChange}
        ariaLabel={label}
        className={compact ? "h-8 min-w-[148px] px-2.5 text-[12px]" : undefined}
      />
    </div>
  )
}
