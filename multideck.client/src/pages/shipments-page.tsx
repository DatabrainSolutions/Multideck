import { useEffect, useMemo, useState } from "react"
import {
  ShipmentAdvancedSearch,
  ShipmentBoardPreview,
  ShipmentFilterBar,
  ShipmentListHeader,
  ShipmentMetricStrip,
  ShipmentsTable,
  getShipmentDetailPath,
  shipmentViewModes,
  type Shipment,
  type ShipmentSearchCriterion,
  type ShipmentSearchField,
  type ShipmentViewMode,
} from "@/components/multideck/shipment-components"
import { Pagination } from "@/components/multideck/pagination"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { currentOperator, initialFavouriteShipmentIds, shipmentFilters, shipmentScopeTabs, shipments } from "@/data/multideck-data"

const rowsPerPageOptions = [10, 20, 30, 50]
type ShipmentScope = (typeof shipmentScopeTabs)[number]
const initialSearchCriteria: ShipmentSearchCriterion[] = [{ id: "shipment-search-any", field: "any", value: "", valueTo: "" }]

function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

function getCustomFieldValues(shipment: Shipment) {
  return shipment.customFields.flatMap((field) => [field.label, field.value, `${field.label} ${field.value}`])
}

type TextShipmentSearchField = Exclude<ShipmentSearchField, "date" | "departure" | "arrival">

function getShipmentSearchValues(shipment: Shipment, field: TextShipmentSearchField) {
  const fullTextValues = [
    shipment.id,
    shipment.customer,
    shipment.route,
    shipment.carrier,
    shipment.container,
    shipment.mode,
    shipment.value,
    shipment.eta,
    shipment.time,
    shipment.status,
    shipment.owner,
    shipment.invoice,
    shipment.jobRef,
    shipment.customerRef,
    shipment.supplierRef,
    shipment.origin,
    shipment.destination,
    shipment.vessel,
    shipment.vin,
    ...getCustomFieldValues(shipment),
  ]

  const valuesByField: Record<TextShipmentSearchField, string[]> = {
    any: fullTextValues,
    invoice: [shipment.invoice],
    jobRef: [shipment.jobRef],
    customerRef: [shipment.customerRef],
    supplierRef: [shipment.supplierRef],
    destination: [shipment.destination, shipment.route],
    origin: [shipment.origin, shipment.route],
    vessel: [shipment.vessel, shipment.carrier],
    vin: [shipment.vin],
    customFields: getCustomFieldValues(shipment),
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

function shipmentMatchesCriterion(shipment: Shipment, criterion: ShipmentSearchCriterion) {
  const query = normalized(criterion.value)
  const queryEnd = criterion.valueTo?.trim()
  if (!query && !queryEnd) return true

  if (criterion.field === "date") {
    return [shipment.departureDate, shipment.arrivalDate].some((date) => dateInRange(date, criterion.value, criterion.valueTo))
  }

  if (criterion.field === "departure") return dateInRange(shipment.departureDate, criterion.value, criterion.valueTo)
  if (criterion.field === "arrival") return dateInRange(shipment.arrivalDate, criterion.value, criterion.valueTo)

  return getShipmentSearchValues(shipment, criterion.field).some((value) => normalized(value).includes(query))
}

function criterionHasValue(criterion: ShipmentSearchCriterion) {
  return Boolean(criterion.value.trim() || criterion.valueTo?.trim())
}

function shipmentMatchesSearch(shipment: Shipment, criteria: ShipmentSearchCriterion[]) {
  const groups = criteria.reduce<Array<{ id: string; connector: "and" | "or"; criteria: ShipmentSearchCriterion[] }>>((currentGroups, criterion, index) => {
    if (!criterionHasValue(criterion)) return currentGroups

    const groupId = criterion.groupId ?? "shipment-search-main"
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
      const criterionMatches = shipmentMatchesCriterion(shipment, criterion)
      if (criterionIndex === 0) return criterionMatches
      return (criterion.connector ?? "and") === "or" ? matches || criterionMatches : matches && criterionMatches
    }, true)

    if (groupIndex === 0) return groupMatches
    return group.connector === "or" ? searchMatches || groupMatches : searchMatches && groupMatches
  }, true)
}

export function ShipmentsPage({ navigate }: { navigate: (path: string) => void }) {
  const [scope, setScope] = useState<ShipmentScope>("All Jobs")
  const [activeFilter, setActiveFilter] = useState<string>(shipmentFilters[0])
  const [viewMode, setViewMode] = useState<ShipmentViewMode>(shipmentViewModes[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set(initialFavouriteShipmentIds))
  const [searchCriteria, setSearchCriteria] = useState<ShipmentSearchCriterion[]>(initialSearchCriteria)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [dexterOpen, setDexterOpen] = useState(false)

  const statusFilteredShipments = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    const scopedShipments =
      scope === "My Jobs" ? shipments.filter((shipment) => shipment.owner === currentOperator.initials) :
        scope === "Starred Jobs" ? shipments.filter((shipment) => favouriteIds.has(shipment.id)) :
          shipments

    if (filter === "Open") return scopedShipments
    if (filter === "On-track") return scopedShipments.filter((shipment) => shipment.status === "On track")
    if (filter === "Delayed") return scopedShipments.filter((shipment) => shipment.status === "Delayed")
    if (filter === "Exceptions") return scopedShipments.filter((shipment) => shipment.status === "Exception")
    return scopedShipments
  }, [activeFilter, favouriteIds, scope])

  const visibleShipments = useMemo(() => {
    return statusFilteredShipments.filter((shipment) => shipmentMatchesSearch(shipment, searchCriteria))
  }, [searchCriteria, statusFilteredShipments])

  const pageCount = Math.max(Math.ceil(visibleShipments.length / rowsPerPage), 1)
  const paginatedShipments = visibleShipments.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter, scope, viewMode, searchCriteria])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function toggleShipment(id: string) {
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

  function openShipment(shipment: Shipment) {
    navigate(getShipmentDetailPath(shipment.id))
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Shipments" className="md-page md-page-stack">
      <ShipmentListHeader viewMode={viewMode} onViewModeChange={setViewMode} onSpeakToDexter={() => setDexterOpen(true)} />
      <div className="flex justify-start">
        <SegmentedControl options={shipmentScopeTabs} value={scope} onChange={setScope} />
      </div>
      <ShipmentMetricStrip />
      <ShipmentFilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        controls={(
          <ShipmentAdvancedSearch
            criteria={searchCriteria}
            onCriteriaChange={setSearchCriteria}
            resultCount={visibleShipments.length}
            totalCount={statusFilteredShipments.length}
          />
        )}
      />

      {viewMode === "Table" ? (
        <ShipmentsTable
          rows={paginatedShipments}
          selectedIds={selectedIds}
          favouriteIds={favouriteIds}
          onToggleShipment={toggleShipment}
          onToggleFavourite={toggleFavourite}
          onOpenShipment={openShipment}
        />
      ) : null}

      {viewMode === "Board" ? <ShipmentBoardPreview rows={visibleShipments} onOpenShipment={openShipment} /> : null}

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={visibleShipments.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="shipments"
        onPageChange={setPage}
        onPageSizeChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage)
          setPage(1)
        }}
      />
    </DexterDockedPage>
  )
}
