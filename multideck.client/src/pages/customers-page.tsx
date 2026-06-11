import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CustomerCardsGrid,
  CustomerFilterBar,
  CustomerFootprintMap,
  CustomerListHeader,
  CustomerListTable,
  customerViewModes,
  type CustomerViewMode,
} from "@/components/multideck/customer-components"
import { Pagination } from "@/components/multideck/pagination"
import { customers, customerFilters } from "@/data/multideck-data"

const rowsPerPageOptions = [10, 20, 30, 50]

export function CustomersPage({ navigate }: { navigate: (path: string) => void }) {
  const [activeFilter, setActiveFilter] = useState(customerFilters[0])
  const [viewMode, setViewMode] = useState<CustomerViewMode>(customerViewModes[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)

  const visibleCustomers = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    if (filter === "All") return customers
    return customers.filter((customer) => customer.status === filter)
  }, [activeFilter])

  const pageCount = Math.max(Math.ceil(visibleCustomers.length / rowsPerPage), 1)
  const paginatedCustomers = visibleCustomers.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter, viewMode])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function toggleCustomer(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCustomer() {
    navigate("/customers/marlow-apparel")
  }

  return (
    <div className="pb-8">
      <CustomerListHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={() => toast.success("Customer CSV prepared")}
      />

      <CustomerFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      {viewMode === "List" ? (
        <CustomerListTable
          customers={paginatedCustomers}
          selectedIds={selectedIds}
          onToggleCustomer={toggleCustomer}
          onOpenCustomer={openCustomer}
        />
      ) : null}

      {viewMode === "Cards" ? (
        <CustomerCardsGrid customers={paginatedCustomers} onOpenCustomer={openCustomer} />
      ) : null}

      {viewMode === "Map" ? (
        <CustomerFootprintMap customers={paginatedCustomers} onOpenCustomer={openCustomer} />
      ) : null}

      <Pagination
        className="mt-4"
        page={page}
        pageCount={pageCount}
        totalItems={visibleCustomers.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="customers"
        onPageChange={setPage}
        onPageSizeChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage)
          setPage(1)
        }}
      />
    </div>
  )
}
