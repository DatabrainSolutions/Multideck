import { useEffect, useMemo, useState } from "react"
import {
  BookingAdvancedSearch,
  BookingBoardPreview,
  BookingFilterBar,
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
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { currentOperator, initialFavouriteBookingIds, bookingFilters, bookingScopeTabs, bookings } from "@/data/multideck-data"

const rowsPerPageOptions = [10, 20, 30, 50]
type BookingScope = (typeof bookingScopeTabs)[number]
const initialSearchCriteria: BookingSearchCriterion[] = [{ id: "booking-search-any", field: "any", value: "", valueTo: "" }]

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
  const [scope, setScope] = useState<BookingScope>("All Jobs")
  const [activeFilter, setActiveFilter] = useState<string>(bookingFilters[0])
  const [viewMode, setViewMode] = useState<BookingViewMode>(bookingViewModes[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set(initialFavouriteBookingIds))
  const [searchCriteria, setSearchCriteria] = useState<BookingSearchCriterion[]>(initialSearchCriteria)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dexterOpen, setDexterOpen] = useState(false)

  const statusFilteredBookings = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    const scopedBookings =
      scope === "My Jobs" ? bookings.filter((booking) => booking.owner === currentOperator.initials) :
        scope === "Starred Jobs" ? bookings.filter((booking) => favouriteIds.has(booking.id)) :
          bookings

    if (filter === "Open") return scopedBookings
    if (filter === "On-track") return scopedBookings.filter((booking) => booking.status === "On track")
    if (filter === "Delayed") return scopedBookings.filter((booking) => booking.status === "Delayed")
    if (filter === "Exceptions") return scopedBookings.filter((booking) => booking.status === "Exception")
    return scopedBookings
  }, [activeFilter, favouriteIds, scope])

  const visibleBookings = useMemo(() => {
    return statusFilteredBookings.filter((booking) => bookingMatchesSearch(booking, searchCriteria))
  }, [searchCriteria, statusFilteredBookings])

  const pageCount = Math.max(Math.ceil(visibleBookings.length / rowsPerPage), 1)
  const paginatedBookings = visibleBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter, scope, viewMode, searchCriteria])

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

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Bookings" className="md-page md-page-stack">
      <BookingListHeader viewMode={viewMode} onViewModeChange={setViewMode} onSpeakToDexter={() => setDexterOpen(true)} />
      <div className="flex justify-start">
        <SegmentedControl options={bookingScopeTabs} value={scope} onChange={setScope} />
      </div>
      <BookingMetricStrip />
      <BookingFilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        controls={(
          <BookingAdvancedSearch
            criteria={searchCriteria}
            onCriteriaChange={setSearchCriteria}
            resultCount={visibleBookings.length}
            totalCount={statusFilteredBookings.length}
          />
        )}
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
