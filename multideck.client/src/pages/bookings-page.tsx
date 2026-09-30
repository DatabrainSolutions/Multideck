import { useRegisterPage } from "@/lib/use-register-page"
import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { bookingLifecycleLabel } from "@/lib/booking-lifecycle"
import { defaultPaginationPageSize } from "@/lib/pagination"
import { collectExportPages } from "@/lib/table-export"
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { toast } from "sonner"
import { ArrowDownAZ, ArrowUpAZ, CalendarClock, Search, Star, TriangleAlert, X } from "@/components/icons/hugeicons"
import {
  BookingBoardPreview,
  BookingListHeader,
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
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Pagination } from "@/components/multideck/pagination"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { RegisterViewSwitch, RegisterRevalidatingMark, RegisterRefreshButton } from "@/components/multideck/register-toolbar"
import { ChoiceControl } from "@/components/multideck/workflow-components"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import { getSavedView, saveView } from "@/lib/view-preferences"
import { useStarredJobs } from "@/lib/starred-jobs"
import {
  createEmptyFilterQuery,
  type FilterFieldOption,
  type FilterQuery,
} from "@/lib/advanced-filters"
import {
  listLiveBookingsPage,
  bookingRegisterResource,
  type BookingRegisterSummary,
  type LiveBooking,
  type RegisterSort,
} from "@/lib/application-data-api"

const rowsPerPageOptions = [10, 20, 30, 50]
const bookingViewStorageKey = "multideck.view.bookings"
const bookingTableStorageKey = "booking-register-operations-v4"
const bookingOwnershipScopes = ["All", "Mine"] as const
type BookingScope = (typeof bookingOwnershipScopes)[number]
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
const emptyBookingSummary: BookingRegisterSummary = { active: 0, inTransit: 0, atDestination: 0, exceptions: 0, complete: 0, total: 0 }

function readSavedSort(storageKey: string, fallback: RegisterSort): RegisterSort {
  if (typeof window === "undefined") return fallback
  try {
    const saved = JSON.parse(window.localStorage.getItem(`multideck.table.${storageKey}`) ?? "null") as { sort?: RegisterSort | null } | null
    return saved?.sort?.id && (saved.sort.direction === "asc" || saved.sort.direction === "desc") ? saved.sort : fallback
  } catch {
    return fallback
  }
}

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

function bookingDirectionLabel(value: string) {
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").trim().replace(/\s+/gu, " ").toLocaleLowerCase()
  if (normalized === "import") return "Import"
  if (normalized === "export") return "Export"
  if (normalized === "domestic") return "Domestic"
  if (normalized === "cross trade") return "Cross trade"
  return value.trim() || "Domestic"
}

function bookingDirectionTone(direction: string) {
  if (direction === "Import") return "blue" as const
  if (direction === "Export") return "teal" as const
  if (direction === "Cross trade") return "purple" as const
  if (direction === "Domestic") return "orange" as const
  return "neutral" as const
}

function formatOperationalDate(value: string, language: string) {
  if (!value) return "–"
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

const bookingFilterFields: readonly FilterFieldOption[] = bookingSearchFieldOptions.map((option) => (
  dateSearchFields.has(option.value)
    ? { value: option.value, label: option.label, kind: "date" as const }
    : { value: option.value, label: option.label, placeholder: option.placeholder }
))

export function BookingsPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser: AuthUserSummary | null }) {
  const { language, t } = useLanguage()
  const [scope, setScope] = useState<BookingScope>("All")
  const [viewMode, setViewMode] = useState<BookingViewMode>(() => getSavedView(bookingViewStorageKey, bookingViewModes, bookingViewModes[0]))
  const [boardOrder, setBoardOrder] = useState<string[]>([])
  // The register's own favourite flag is the saved truth; anything the operator
  // stars here is kept alongside it so Home and every other screen agree.
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set())
  const [serverSort, setServerSort] = useState<RegisterSort | null>(() => readSavedSort(bookingTableStorageKey, { id: "customerCargo", direction: "asc" }))
  const [search, setSearch] = useState<FilterQuery>(createEmptyFilterQuery)
  const [quickSearch, setQuickSearch] = useState("")
  const [debouncedQuickSearch, setDebouncedQuickSearch] = useState("")
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(defaultPaginationPageSize)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [directionFilter, setDirectionFilter] = useState<(typeof directionFilters)[number]>(directionFilters[0])
  const [modeFilter, setModeFilter] = useState<(typeof modeFilters)[number]>(modeFilters[0])
  const [shipmentTypeFilter, setShipmentTypeFilter] = useState<ShipmentTypeFilter>("All types")
  const shipmentTypeFilters = shipmentTypeFiltersByMode[modeFilter]
  const registerScope: "My Jobs" | "All Jobs" = scope === "Mine" ? "My Jobs" : "All Jobs"
  const currentOperatorCode = currentUser?.initials ?? ""
  const { isStarred, toggleStar } = useStarredJobs(currentUser?.id)

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedQuickSearch(quickSearch), 250)
    return () => globalThis.clearTimeout(timer)
  }, [quickSearch])

  const registerInput = useMemo(() => ({
    search: debouncedQuickSearch,
    scope: registerScope,
    operatorCode: currentOperatorCode,
    direction: directionFilter === "All directions" ? undefined : directionFilter,
    mode: modeFilter === "All modes" ? undefined : modeFilter,
    shipmentType: shipmentTypeFilter === "All types" ? undefined : shipmentTypeFilter,
    filterQuery: search,
    sort: serverSort,
    limit: rowsPerPage,
    offset: (page - 1) * rowsPerPage,
  }), [debouncedQuickSearch, registerScope, currentOperatorCode, directionFilter, modeFilter, shipmentTypeFilter, search, serverSort, rowsPerPage, page])
  const { data: bookingPage, loading: bookingsLoading, initialLoading, error: bookingsError, refreshing, refresh } = useRegisterPage({
    scope: currentUser?.id,
    resource: bookingRegisterResource(registerInput),
    load: signal => listLiveBookingsPage(registerInput, signal),
  })
  const tableRows = bookingPage?.rows ?? []
  const tableTotal = bookingPage?.total ?? 0
  const tableSummary = bookingPage?.summary ?? emptyBookingSummary
  const visibleBookings = useMemo(() => {
    const order = new Map(boardOrder.map((id, index) => [id, index]))
    return [...(bookingPage?.rows ?? [])].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity))
  }, [bookingPage, boardOrder])
  useEffect(() => {
    if (bookingPage) setFavouriteIds(new Set(bookingPage.rows.filter(record => record.isFavourite).map(record => record.id)))
  }, [bookingPage])

  const countDraftMatches = useCallback((draft: FilterQuery) => {
    return listLiveBookingsPage({
      search: quickSearch,
      scope: registerScope,
      operatorCode: currentOperatorCode,
      direction: directionFilter === "All directions" ? undefined : directionFilter,
      mode: modeFilter === "All modes" ? undefined : modeFilter,
      shipmentType: shipmentTypeFilter === "All types" ? undefined : shipmentTypeFilter,
      filterQuery: draft,
      sort: serverSort,
      limit: 1,
      offset: 0,
    }).then((result) => result.total)
  }, [currentOperatorCode, directionFilter, modeFilter, quickSearch, registerScope, serverSort, shipmentTypeFilter])

  const totalBookings = tableTotal
  const pageCount = Math.max(Math.ceil(totalBookings / rowsPerPage), 1)

  useEffect(() => {
    setPage(1)
  }, [directionFilter, modeFilter, quickSearch, scope, shipmentTypeFilter, viewMode, search, serverSort])

  useEffect(() => {
    saveView(bookingViewStorageKey, viewMode)
  }, [viewMode])

  useEffect(() => {
    if (!bookingsLoading && bookingPage && page > pageCount) setPage(pageCount)
  }, [page, pageCount, bookingsLoading, bookingPage])


  function openBooking(booking: Booking) {
    navigate(getBookingDetailPath(booking.id))
  }

  function changeMode(nextMode: (typeof modeFilters)[number]) {
    setModeFilter(nextMode)
    if (!shipmentTypeFiltersByMode[nextMode].includes(shipmentTypeFilter as never)) setShipmentTypeFilter("All types")
  }

  function clearFilters() {
    setScope("All")
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
        const favourite = isStarred(booking.id, favouriteIds.has(booking.id))
        return (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(`${favourite ? "Remove" : "Add"} ${booking.id} favourite`)}
            className={favourite ? "size-8 text-[var(--md-amber)] transition-transform active:scale-[0.96] motion-reduce:transition-none" : "size-8 text-[var(--md-subtle)] transition-transform active:scale-[0.96] motion-reduce:transition-none"}
            onClick={(event) => {
              event.stopPropagation()
              void toggleStar(booking.id, favouriteIds.has(booking.id)).catch(() => {
                toast.error(t("The job star could not be saved. Try again."))
              })
            }}
          >
            <Star className={favourite ? "size-4 fill-current" : "size-4"} strokeWidth={1.35} />
          </Button>
        )
      },
    },
    {
      id: "status",
      label: t("Status"),
      kind: "status",
      width: 160,
      minWidth: 136,
      maxWidth: 200,
      resizable: true,
      sortValue: (booking) => booking.lifecycleStatus ? bookingLifecycleLabel(booking.lifecycleStatus) : booking.status,
      cell: (booking) => booking.lifecycleStatus
        ? <StatusPill tone={bookingLifecycleLabel(booking.lifecycleStatus) === "Provisional" ? "amber" : "green"}>{t(bookingLifecycleLabel(booking.lifecycleStatus))}</StatusPill>
        : <BookingStatusPill status={booking.status} />,
    },
    {
      id: "trackingStatus", label: t("Tracking status"), kind: "status", width: 140,
      sortValue: booking => booking.status,
      cell: booking => <BookingStatusPill status={booking.status} />,
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
            {getCustomField(booking, ["Source"]) === "Accepted quote" ? <StatusPill kind="attribute" tone="teal" className="h-5 shrink-0 px-1.5 text-[9.5px]">{t("From quote")}</StatusPill> : null}
          </div>
          <p className="mt-1.5 truncate ps-4 text-[11px] text-[var(--md-text)]" title={booking.jobRef || booking.customerRef}>
            {booking.jobRef || booking.customerRef || t("No linked reference")}
          </p>
        </div>
      ),
    },
    {
      id: "customerCargo",
      label: t("Customer"),
      width: 176,
      minWidth: 150,
      maxWidth: 240,
      resizable: true,
      sortValue: (booking) => booking.customer,
      cell: (booking) => (
        <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" title={booking.customer} data-i18n-skip dir="auto">{booking.customer}</p>
      ),
    },
    {
      id: "mode",
      label: t("Mode"),
      kind: "attribute",
      width: 112,
      minWidth: 104,
      maxWidth: 132,
      resizable: true,
      sortValue: (booking) => booking.mode,
      cell: (booking) => <BookingModePill mode={booking.mode} />,
    },
    {
      id: "movement",
      label: t("Movement"),
      kind: "attribute",
      width: 128,
      minWidth: 116,
      maxWidth: 160,
      resizable: true,
      cell: (booking) => {
        const direction = bookingDirectionLabel(booking.direction)
        return <StatusPill tone={bookingDirectionTone(direction)}>{t(direction)}</StatusPill>
      },
    },
    {
      id: "origin",
      label: t("Origin"),
      width: 166,
      minWidth: 138,
      maxWidth: 240,
      resizable: true,
      cell: (booking) => <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" title={booking.origin} data-i18n-skip dir="auto">{booking.origin || "–"}</p>,
    },
    {
      id: "destination",
      label: t("Destination"),
      width: 166,
      minWidth: 138,
      maxWidth: 240,
      resizable: true,
      cell: (booking) => <p className="truncate text-[12px] font-medium text-[var(--md-ink)]" title={booking.destination} data-i18n-skip dir="auto">{booking.destination || "–"}</p>,
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
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--md-accent-a12)] text-[12px] font-medium text-[var(--md-accent)]">{booking.owner || "–"}</span>
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
      cell: (booking) => <span className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr">{booking.value || "–"}</span>,
    },
    {
      id: "customerReference",
      label: t("Customer reference"),
      width: 170,
      minWidth: 140,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.customerRef,
      cell: (booking) => <span className="text-[12px] text-[var(--md-ink)]" dir="auto">{booking.customerRef || "–"}</span>,
    },
    {
      id: "supplierReference",
      label: t("Supplier reference"),
      width: 170,
      minWidth: 140,
      resizable: true,
      defaultHidden: true,
      sortValue: (booking) => booking.supplierRef,
      cell: (booking) => <span className="text-[12px] text-[var(--md-ink)]" dir="auto">{booking.supplierRef || "–"}</span>,
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
  ], [favouriteIds, isStarred, language, t, toggleStar])

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Bookings")} className="md-page md-page-stack">
      <BookingListHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSpeakToDexter={() => setDexterOpen(true)}
      />
      {bookingsError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-4 py-3 text-[13px] text-[var(--md-text)]">
        <div><p>{t(bookingPage ? "Bookings could not be refreshed." : "Bookings could not be loaded.")}</p><p>{bookingPage ? t("Showing the last loaded results. Try again to get the latest changes.") : bookingsError}</p></div>
        <Button variant="outline" size="sm" onClick={refresh}>{t("Try again")}</Button>
      </div> : null}
      {viewMode === "Table" ? (
        <DataTable
          ariaLabel={t("Bookings")}
          columnsButtonLabel={t("Manage booking columns")}
          columns={columns}
          rows={tableRows}
          getRowKey={(booking) => booking.id}
          storageKey={bookingTableStorageKey}
          exportConfig={{ fileName: "multideck-bookings", register: {
            dateLabel: "Departure date", dateValue: (booking) => booking.departureAt,
            busy: bookingsLoading || Boolean(bookingsError) || quickSearch !== debouncedQuickSearch,
            loadAllRows: (signal) => collectExportPages((page) => listLiveBookingsPage({
              search: debouncedQuickSearch, scope: registerScope, operatorCode: currentOperatorCode,
              direction: directionFilter === "All directions" ? undefined : directionFilter,
              mode: modeFilter === "All modes" ? undefined : modeFilter,
              shipmentType: shipmentTypeFilter === "All types" ? undefined : shipmentTypeFilter,
              filterQuery: search, sort: serverSort, ...page,
            }, signal), (booking) => booking.id, signal),
          } }}
          serverSorting={{ value: serverSort, onChange: setServerSort }}
          rowClassName={() => "hover:bg-[var(--md-hover)]"}
          onRowClick={openBooking}
          toolbarTabs={<RegisterViewSwitch options={bookingOwnershipScopes} value={scope} onChange={setScope} counts={{ [scope]: tableTotal } as Partial<Record<BookingScope, number>>} ariaLabel="Booking ownership filter" compact />}
          toolbarFilters={(
            <>
              <div aria-label={t("Booking shape")} className="flex max-w-full flex-wrap items-center gap-1.5 group-data-[mobile=true]/table-controls:grid group-data-[mobile=true]/table-controls:grid-cols-2 group-data-[mobile=true]/table-controls:gap-2">
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
                totalCount={tableSummary.total}
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
            <>
              <RegisterRevalidatingMark active={refreshing} />
              <RegisterRefreshButton pending={bookingsLoading} onRefresh={() => { if (!bookingsLoading) refresh() }} />
              <Button
                type="button"
                variant="ghost"
                aria-label={t(serverSort?.id === "customerCargo" && serverSort.direction === "desc" ? "Sort bookings A to Z" : "Sort bookings Z to A")}
                aria-pressed={serverSort?.id === "customerCargo" && serverSort.direction === "desc"}
                className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] active:scale-[0.96]"
                onClick={() => setServerSort((current) => ({ id: "customerCargo", direction: current?.id === "customerCargo" && current.direction === "asc" ? "desc" : "asc" }))}
              >
                {serverSort?.id === "customerCargo" && serverSort.direction === "desc" ? <ArrowUpAZ className="size-3.5" strokeWidth={1.45} /> : <ArrowDownAZ className="size-3.5" strokeWidth={1.45} />}
                <span aria-hidden="true"><span className="hidden group-data-[mobile=true]/table-controls:inline">{t("Customer name")}{": "}</span>{serverSort?.id === "customerCargo" && serverSort.direction === "desc" ? "Z–A" : "A–Z"}</span>
              </Button>
            </>
          )}
          emptyState={initialLoading ? <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading bookings…" /></div> : bookingsError && !bookingPage ? <div className="grid min-h-[180px] place-items-center text-[13px] text-[var(--md-text)]">{t("Bookings could not be loaded. Use Try again above to reload them.")}</div> : (
            <div className="mx-auto grid max-w-sm place-items-center py-3 text-center">
              <EmptyStateIllustration variant="search" />
              <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t(scope === "Mine" ? "No bookings assigned to you" : "No bookings match this search")}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(scope === "Mine" ? "Bookings appear here when you are recorded as their owner." : "Change or clear a filter to see more bookings.")}</p>
              <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-3 text-[12px] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" onClick={clearFilters}>
                {t("Clear filters")}
              </Button>
            </div>
          )}
        />
      ) : null}

      {viewMode === "Board" ? (
        <div className="grid gap-2">
          <div className="flex min-w-0 items-center">
            <RegisterViewSwitch options={bookingOwnershipScopes} value={scope} onChange={setScope} counts={{ [scope]: tableTotal } as Partial<Record<BookingScope, number>>} ariaLabel="Booking ownership filter" compact />
          </div>
          {bookingsLoading && !bookingPage ? <div className="grid min-h-[180px] place-items-center"><DotGridLoader label="Loading bookings…" /></div> : bookingsError && !bookingPage ? null : <BookingBoardPreview
            rows={visibleBookings}
            onOpenBooking={openBooking}
            onMoveBooking={(_bookingId, _status, orderedRows) => setBoardOrder(orderedRows.map(booking => booking.id))}
          />}
        </div>
      ) : null}

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={totalBookings}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        loading={initialLoading}
        error={Boolean(bookingsError) && !bookingPage}
        itemCount={tableRows.length}
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
        className={compact ? "h-8 min-w-[148px] px-2.5 text-[12px] group-data-[mobile=true]/table-controls:min-w-0 group-data-[mobile=true]/table-controls:w-full" : undefined}
      />
    </div>
  )
}
