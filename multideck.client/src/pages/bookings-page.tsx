import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { Search, SlidersHorizontal, Star, X } from "lucide-react"
import {
  BookingBoardPreview,
  BookingListHeader,
  BookingMetricStrip,
  BookingShapeCell,
  BookingStatusPill,
  getBookingDetailPath,
  bookingViewModes,
  type Booking,
  type BookingSearchCriterion,
  type BookingSearchField,
  type BookingViewMode,
} from "@/components/multideck/booking-components"
import { BookingSearchBuilder } from "@/components/multideck/booking-search-builder"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { Pagination } from "@/components/multideck/pagination"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { ChoiceControl } from "@/components/multideck/workflow-components"
import { toneToVar } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { currentOperator, getBookingShape, initialFavouriteBookingIds, bookingScopeTabs, bookings } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { getSavedView, saveView } from "@/lib/view-preferences"

const rowsPerPageOptions = [10, 20, 30, 50]
const bookingViewStorageKey = "multideck.view.bookings"
type BookingScope = (typeof bookingScopeTabs)[number]
const initialSearchCriteria: BookingSearchCriterion[] = [{ id: "booking-search-any", field: "any", value: "", valueTo: "" }]
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

function dateInRange(dateValue: string, startValue: string, endValue?: string) {
  const start = startValue || endValue
  const end = endValue || startValue
  if (!start || !end) return true

  const date = Date.parse(`${dateValue}T00:00:00Z`)
  const startDate = Date.parse(`${start}T00:00:00Z`)
  const endDate = Date.parse(`${end}T00:00:00Z`)
  if (Number.isNaN(date) || Number.isNaN(startDate) || Number.isNaN(endDate)) return false

  return date >= Math.min(startDate, endDate) && date <= Math.max(startDate, endDate)
}

function bookingMatchesCriterion(booking: Booking, criterion: BookingSearchCriterion) {
  const query = normalized(criterion.value)
  const queryEnd = criterion.valueTo?.trim()
  if (!query && !queryEnd) return true

  if (criterion.field === "date") {
    return [booking.departureDate, booking.arrivalDate].some((date) => dateInRange(date, criterion.value, criterion.valueTo))
  }

  if (criterion.field === "departure") return dateInRange(booking.departureDate, criterion.value, criterion.valueTo)
  if (criterion.field === "arrival") return dateInRange(booking.arrivalDate, criterion.value, criterion.valueTo)

  return getBookingSearchValues(booking, criterion.field).some((value) => normalized(value).includes(query))
}

function criterionHasValue(criterion: BookingSearchCriterion) {
  return Boolean(criterion.value.trim() || criterion.valueTo?.trim())
}

function bookingMatchesSearch(booking: Booking, criteria: BookingSearchCriterion[]) {
  const groups = criteria.reduce<Array<{ id: string; connector: "and" | "or"; criteria: BookingSearchCriterion[] }>>((currentGroups, criterion, index) => {
    if (!criterionHasValue(criterion)) return currentGroups

    const groupId = criterion.groupId ?? "booking-search-main"
    const existingGroup = currentGroups.find((group) => group.id === groupId)

    if (existingGroup) {
      existingGroup.criteria.push(criterion)
      return currentGroups
    }

    currentGroups.push({
      id: groupId,
      connector: criterion.groupConnector ?? (index === 0 ? "and" : "or"),
      criteria: [criterion],
    })

    return currentGroups
  }, [])

  if (!groups.length) return true

  return groups.reduce<boolean>((searchMatches, group, groupIndex) => {
    const groupMatches = group.criteria.reduce<boolean>((matches, criterion, criterionIndex) => {
      const criterionMatches = bookingMatchesCriterion(booking, criterion)
      if (criterionIndex === 0) return criterionMatches
      return (criterion.connector ?? "and") === "or" ? matches || criterionMatches : matches && criterionMatches
    }, true)

    if (groupIndex === 0) return groupMatches
    return group.connector === "or" ? searchMatches || groupMatches : searchMatches && groupMatches
  }, true)
}

export function BookingsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [scope, setScope] = useState<BookingScope>("All Jobs")
  const [viewMode, setViewMode] = useState<BookingViewMode>(() => getSavedView(bookingViewStorageKey, bookingViewModes, bookingViewModes[0]))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set(initialFavouriteBookingIds))
  const [searchCriteria, setSearchCriteria] = useState<BookingSearchCriterion[]>(initialSearchCriteria)
  const [quickSearch, setQuickSearch] = useState("")
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [directionFilter, setDirectionFilter] = useState<(typeof directionFilters)[number]>(directionFilters[0])
  const [modeFilter, setModeFilter] = useState<(typeof modeFilters)[number]>(modeFilters[0])
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState<ShipmentTypeFilter>("All types")
  const shipmentTypeFilters = shipmentTypeFiltersByMode[modeFilter]

  const scopedBookings = useMemo(() => {
    return (
      scope === "My Jobs" ? bookings.filter((booking) => booking.owner === currentOperator.initials) :
        scope === "Starred Jobs" ? bookings.filter((booking) => favouriteIds.has(booking.id)) :
          bookings
    )
  }, [favouriteIds, scope])

  const visibleBookings = useMemo(() => {
    const quickQuery = normalized(quickSearch)
    return scopedBookings.filter((booking) => {
      const shape = getBookingShape(booking.id)
      const matchesShape =
        (directionFilter === "All directions" || shape.direction === directionFilter) &&
        (modeFilter === "All modes" || booking.mode === modeFilter) &&
        (shipmentTypeFilter === "All types" || shape.shipmentType === shipmentTypeFilter)
      const matchesQuickSearch = !quickQuery || getBookingSearchValues(booking, "any").some((candidate) => normalized(candidate).includes(quickQuery))
      return matchesShape && matchesQuickSearch && bookingMatchesSearch(booking, searchCriteria)
    })
  }, [directionFilter, modeFilter, quickSearch, scopedBookings, searchCriteria, shipmentTypeFilter])

  const pageCount = Math.max(Math.ceil(visibleBookings.length / rowsPerPage), 1)
  const paginatedBookings = visibleBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [directionFilter, modeFilter, quickSearch, scope, shipmentTypeFilter, viewMode, searchCriteria])

  useEffect(() => {
    saveView(bookingViewStorageKey, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function toggleBooking(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const columns = useMemo<DataTableColumn<Booking>[]>(() => [
    {
      id: "select",
      label: t("Select"),
      width: 54,
      minWidth: 54,
      maxWidth: 54,
      canHide: false,
      canPin: false,
      resizable: false,
      cell: (booking) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(booking.id)}
            onCheckedChange={() => toggleBooking(booking.id)}
            aria-label={t(`Select ${booking.id}`)}
          />
        </span>
      ),
    },
    {
      id: "star",
      label: t("Star"),
      width: 64,
      minWidth: 64,
      maxWidth: 64,
      resizable: false,
      cell: (booking) => {
        const favourite = favouriteIds.has(booking.id)
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(`${favourite ? "Remove" : "Add"} ${booking.id} favourite`)}
            className={favourite ? "size-8 text-[var(--md-amber)]" : "size-8 text-[var(--md-subtle)]"}
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
      id: "booking",
      label: t("Booking"),
      width: 142,
      minWidth: 120,
      resizable: true,
      defaultPinned: true,
      sortValue: (booking) => booking.id,
      cell: (booking) => (
        <div className="flex items-center gap-3" dir="ltr">
          <span className="size-2.5 rounded-full" style={{ background: toneToVar(booking.tone) }} />
          <span className="text-[13px] font-medium text-[var(--md-accent)]">{booking.id}</span>
        </div>
      ),
    },
    {
      id: "customer",
      label: t("Customer and route"),
      width: 300,
      minWidth: 220,
      maxWidth: 420,
      resizable: true,
      sortValue: (booking) => booking.customer,
      cell: (booking) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{booking.customer}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{booking.route}</p>
        </div>
      ),
    },
    {
      id: "carrier",
      label: t("Carrier and container"),
      width: 210,
      minWidth: 170,
      resizable: true,
      sortValue: (booking) => booking.carrier,
      cell: (booking) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{booking.carrier}</p>
          <p className="mt-1 truncate text-[12px] text-[var(--md-text)]" dir="ltr">{booking.container}</p>
        </div>
      ),
    },
    {
      id: "shape",
      label: t("Direction and mode"),
      width: 190,
      minWidth: 170,
      resizable: true,
      sortValue: (booking) => `${getBookingShape(booking.id).direction} ${booking.mode}`,
      cell: (booking) => <BookingShapeCell booking={booking} />,
    },
    {
      id: "value",
      label: t("Value"),
      width: 120,
      minWidth: 100,
      resizable: true,
      sortValue: (booking) => Number(booking.value.replace(/[^0-9.-]/g, "")),
      cell: (booking) => <span className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{booking.value}</span>,
    },
    {
      id: "eta",
      label: t("ETA"),
      width: 122,
      minWidth: 104,
      resizable: true,
      sortValue: (booking) => booking.arrivalDate,
      cell: (booking) => (
        <div dir="ltr">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{booking.eta}</p>
          <p className="text-[11px] text-[var(--md-text)]">{booking.time}</p>
        </div>
      ),
    },
    {
      id: "status",
      label: t("Status"),
      width: 120,
      minWidth: 110,
      resizable: true,
      sortValue: (booking) => booking.status,
      cell: (booking) => <BookingStatusPill status={booking.status} />,
    },
    {
      id: "progress",
      label: t("Progress"),
      width: 172,
      minWidth: 140,
      resizable: true,
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
      id: "owner",
      label: t("Owner"),
      width: 88,
      minWidth: 76,
      resizable: true,
      sortValue: (booking) => booking.owner,
      cell: (booking) => <span className="grid size-8 place-items-center rounded-full bg-[rgba(14,125,116,0.12)] text-[12px] font-medium text-[var(--md-accent)]">{booking.owner}</span>,
    },
  ], [favouriteIds, selectedIds, t])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Bookings" className="md-page md-page-stack">
      <BookingListHeader viewMode={viewMode} onViewModeChange={setViewMode} onSpeakToDexter={() => setDexterOpen(true)} scopeOptions={bookingScopeTabs} scope={scope} onScopeChange={setScope} />
      <section aria-label={t("Booking shape")} className="flex flex-wrap items-center gap-2 rounded-[var(--md-radius-xl)] bg-white/32 p-2.5 shadow-[var(--md-shadow-line)]">
        <ShapeFilter label={t("Direction")} options={directionFilters} value={directionFilter} onChange={setDirectionFilter} />
        <span className="hidden h-7 w-px bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
        <ShapeFilter label={t("Mode")} options={modeFilters} value={modeFilter} onChange={changeMode} />
        {shipmentTypeFilters.length > 1 ? (
          <>
            <span className="hidden h-7 w-px bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
            <ShapeFilter label={t("Type")} options={shipmentTypeFilters} value={shipmentTypeFilter} onChange={setShipmentTypeFilter} />
          </>
        ) : null}
      </section>
      <BookingMetricStrip />
      {advancedSearchOpen ? (
        <BookingSearchBuilder
          value={searchCriteria}
          onChange={setSearchCriteria}
          resultCount={visibleBookings.length}
          totalCount={scopedBookings.length}
        />
      ) : null}

      {viewMode === "Table" ? (
        <DataTable
          ariaLabel={t("Booking register")}
          columnsButtonLabel={t("Manage booking columns")}
          columns={columns}
          rows={paginatedBookings}
          getRowKey={(booking) => booking.id}
          storageKey="booking-register"
          rowClassName={(booking) => selectedIds.has(booking.id) ? "bg-[var(--md-surface-tint)]" : "hover:bg-[var(--md-hover)]"}
          onRowClick={openBooking}
          toolbarLeading={(
            <div className="flex min-w-0 items-center gap-2 px-1.5">
              <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Booking register")}</span>
              <span className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">{visibleBookings.length}</span>
            </div>
          )}
          toolbarActions={(
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
              <div className="relative min-w-[128px] max-w-[280px] flex-1 sm:min-w-[200px] sm:flex-none">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.35} />
                <Input
                  type="search"
                  value={quickSearch}
                  dir="auto"
                  aria-label={t("Search bookings")}
                  placeholder={t("Search bookings")}
                  className="h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] ps-8 pe-8 text-[12px] shadow-[var(--md-shadow-line)]"
                  onChange={(event) => setQuickSearch(event.target.value)}
                />
                {quickSearch ? (
                  <Button type="button" variant="ghost" size="icon" aria-label={t("Clear quick search")} className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-[var(--md-radius-sm)]" onClick={() => setQuickSearch("")}>
                    <X className="size-3.5" strokeWidth={1.4} />
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={advancedSearchOpen}
                className={advancedSearchOpen ? "h-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 text-[12px] shadow-[var(--md-shadow-line)]" : "h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]"}
                onClick={() => setAdvancedSearchOpen((current) => !current)}
              >
                <SlidersHorizontal className="size-3.5" strokeWidth={1.4} />
                <span className="hidden lg:inline">{t("Advanced search")}</span>
                {searchCriteria.filter(criterionHasValue).length ? (
                  <span className="grid min-w-4 place-items-center rounded-full bg-[rgba(14,125,116,0.11)] px-1 text-[10px] font-medium text-[var(--md-accent)]" data-i18n-skip>
                    {searchCriteria.filter(criterionHasValue).length}
                  </span>
                ) : null}
              </Button>
            </div>
          )}
        />
      ) : null}

      {viewMode === "Board" ? <BookingBoardPreview rows={visibleBookings} onOpenBooking={openBooking} /> : null}

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

function ShapeFilter<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
  const { t } = useLanguage()

  return (
    <div className="min-w-0">
      <p className="mb-1.5 px-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
      <ChoiceControl
        options={options.map((option) => ({ value: option, label: t(option) }))}
        value={value}
        onChange={onChange}
        ariaLabel={label}
      />
    </div>
  )
}
