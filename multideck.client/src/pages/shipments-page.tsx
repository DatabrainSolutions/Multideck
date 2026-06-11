import { useEffect, useMemo, useState } from "react"
import {
  ShipmentBoardPreview,
  ShipmentEmptyMode,
  ShipmentFilterBar,
  ShipmentListHeader,
  ShipmentMetricStrip,
  ShipmentsTable,
  shipmentViewModes,
  type Shipment,
  type ShipmentViewMode,
} from "@/components/multideck/shipment-components"
import { Pagination } from "@/components/multideck/pagination"
import { shipmentFilters, shipments } from "@/data/multideck-data"

const rowsPerPageOptions = [10, 20, 30, 50]

export function ShipmentsPage({ navigate }: { navigate: (path: string) => void }) {
  const [activeFilter, setActiveFilter] = useState<string>(shipmentFilters[0])
  const [viewMode, setViewMode] = useState<ShipmentViewMode>(shipmentViewModes[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const visibleShipments = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    if (filter === "Open") return shipments
    if (filter === "On-track") return shipments.filter((shipment) => shipment.status === "On track")
    if (filter === "Delayed") return shipments.filter((shipment) => shipment.status === "Delayed")
    if (filter === "Exceptions") return shipments.filter((shipment) => shipment.status === "Exception")
    return shipments
  }, [activeFilter])

  const pageCount = Math.max(Math.ceil(visibleShipments.length / rowsPerPage), 1)
  const paginatedShipments = visibleShipments.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter, viewMode])

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

  function openShipment(shipment: Shipment) {
    if (shipment.id === "MD-22455") navigate("/shipments/md-22455")
    else {
      navigate("/shipments/md-22455")
    }
  }

  return (
    <div className="pb-8">
      <ShipmentListHeader viewMode={viewMode} onViewModeChange={setViewMode} />
      <ShipmentMetricStrip />
      <ShipmentFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {viewMode === "Table" ? (
        <ShipmentsTable
          rows={paginatedShipments}
          selectedIds={selectedIds}
          onToggleShipment={toggleShipment}
          onOpenShipment={openShipment}
        />
      ) : null}

      {viewMode === "Board" ? <ShipmentBoardPreview onOpenShipment={openShipment} /> : null}
      {viewMode === "Map" ? <ShipmentEmptyMode mode="Map" /> : null}
      {viewMode === "Timeline" ? <ShipmentEmptyMode mode="Timeline" /> : null}

      <Pagination
        className="mt-4"
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
    </div>
  )
}
