import { useEffect, useMemo, useState } from "react"
import bookingShapeIconSprite from "@/assets/booking-shape-icons/booking-shape-icons.png"
import {
  BookingAdvancedSearch,
  BookingBoardPreview,
  BookingListHeader,
  BookingMetricStrip,
  BookingsTable,
  getBookingDetailPath,
  bookingViewModes,
  type Booking,
  type BookingSearchCriterion,
  type BookingSearchField,
  type BookingViewMode,
} from "@/components/multideck/booking-components"
import { Pagination } from "@/components/multideck/pagination"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { FilterChips } from "@/components/multideck/workflow-components"
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

const bookingShapeIconCells: Record<string, readonly [column: number, row: number]> = {
  "All directions": [0, 0], Import: [1, 0], Export: [2, 0], Domestic: [3, 0], "Cross trade": [4, 0],
  OCEAN: [0, 1], AIR: [1, 1], ROAD: [2, 1], FAS: [3, 1], FSA: [3, 1], "All modes": [3, 1], "All types": [3, 1], Multiple: [3, 1], FCL: [4, 1],
  LCL: [0, 2], ULD: [1, 2], FTL: [2, 2], LTL: [3, 2], "Pallet network": [4, 2],
  Breakbulk: [4, 1], RoRo: [0, 2], "Dry bulk": [0, 2], "Liquid bulk": [0, 2], "Project cargo": [4, 1],
  "General cargo": [1, 2], "Air consolidation": [1, 2], "Back-to-back": [1, 2], "Express / courier": [1, 2], Charter: [1, 2],
  Groupage: [3, 2], "Dedicated vehicle": [2, 2], "Parcel / express": [4, 2],
}

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
    return scopedBookings.filter((booking) => {
      const shape = getBookingShape(booking.id)
      const matchesShape =
        (directionFilter === "All directions" || shape.direction === directionFilter) &&
        (modeFilter === "All modes" || booking.mode === modeFilter) &&
        (shipmentTypeFilter === "All types" || shape.shipmentType === shipmentTypeFilter)
      return matchesShape && bookingMatchesSearch(booking, searchCriteria)
    })
  }, [directionFilter, modeFilter, scopedBookings, searchCriteria, shipmentTypeFilter])

  const pageCount = Math.max(Math.ceil(visibleBookings.length / rowsPerPage), 1)
  const paginatedBookings = visibleBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [directionFilter, modeFilter, scope, shipmentTypeFilter, viewMode, searchCriteria])

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

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Bookings" className="md-page md-page-stack">
      <BookingListHeader viewMode={viewMode} onViewModeChange={setViewMode} onSpeakToDexter={() => setDexterOpen(true)} scopeOptions={bookingScopeTabs} scope={scope} onScopeChange={setScope} />
      <section aria-label={t("Booking shape")} className="flex flex-wrap items-center gap-2 rounded-[var(--md-radius-xl)] bg-white/32 p-2.5 shadow-[var(--md-shadow-line)]">
        <ShapeFilter label={t("Direction")} options={directionFilters} value={directionFilter} onChange={setDirectionFilter} />
        <span className="hidden h-7 w-px bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
        <ShapeFilter label={t("Mode")} options={modeFilters} value={modeFilter} onChange={changeMode} />
        <span className="hidden h-7 w-px bg-[rgba(11,20,19,0.08)] sm:block" aria-hidden="true" />
        <ShapeFilter label={t("Type")} options={shipmentTypeFilters} value={shipmentTypeFilter} onChange={setShipmentTypeFilter} />
      </section>
      <BookingMetricStrip />
      <BookingAdvancedSearch
        criteria={searchCriteria}
        onCriteriaChange={setSearchCriteria}
        resultCount={visibleBookings.length}
        totalCount={scopedBookings.length}
      />

      {viewMode === "Table" ? (
        <BookingsTable
          rows={paginatedBookings}
          selectedIds={selectedIds}
          favouriteIds={favouriteIds}
          onToggleBooking={toggleBooking}
          onToggleFavourite={toggleFavourite}
          onOpenBooking={openBooking}
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
      <FilterChips options={options} activeOption={value} onChange={(next) => onChange(next as T)} tooltipForOption={t} renderOption={(option, active) => {
        return <BookingShapeIcon option={option} active={active} />
      }} buttonClassName="size-11 justify-center rounded-[var(--md-radius-lg)] px-0" className="gap-1.5" />
    </div>
  )
}

function BookingShapeIcon({ option, active }: { option: string; active: boolean }) {
  const [column, row] = bookingShapeIconCells[option] ?? bookingShapeIconCells["All directions"]

  return (
    <span
      aria-hidden="true"
      className={`block size-7 bg-no-repeat transition-[opacity,filter] ${active ? "brightness-0 invert" : "opacity-90"}`}
      style={{
        backgroundImage: `url(${bookingShapeIconSprite})`,
        backgroundPosition: `${((column * 1.2 + 0.1) / 5) * 100}% ${((row * 1.2 + 0.1) / 2.6) * 100}%`,
        backgroundSize: "600% 360%",
      }}
    />
  )
}
