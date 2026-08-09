import { useEffect, useMemo, useState, type FormEvent } from "react"
import { LoaderCircle, RefreshCw } from "@/components/icons/hugeicons"
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
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { Pagination } from "@/components/multideck/pagination"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { currentOperator, customerScopeTabs, type CustomerRecord } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { createCustomer, getCustomerReference, listCustomers, type CreateCustomerInput, type CustomerReference } from "@/lib/customer-api"

const rowsPerPageOptions = [10, 20, 30, 50]
type CustomerScope = (typeof customerScopeTabs)[number]

export function CustomersPage({ navigate }: { navigate: (path: string) => void }) {
  const [scope, setScope] = useState<CustomerScope>("All customers")
  const [activeFilter, setActiveFilter] = useState("All · 0")
  const [viewMode, setViewMode] = useState<CustomerViewMode>(customerViewModes[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [customerReference, setCustomerReference] = useState<CustomerReference | null>(null)
  const [newCustomer, setNewCustomer] = useState<CreateCustomerInput>(emptyCustomer())
  const { t } = useLanguage()

  useEffect(() => {
    let isMounted = true
    setLoadState("loading")

    listCustomers()
      .then((data) => {
        if (!isMounted) return
        setCustomers(data.map((customer, index) => ({
          id: customer.id,
          initials: customer.initials,
          name: customer.name,
          location: customer.location ?? "—",
          industry: customer.industry,
          contacts: customer.contactCount,
          active: "—",
          activeTone: "neutral",
          bookings30d: Array.from({ length: 12 }, () => 0),
          sparkTone: "teal",
          billedYtd: "—",
          onTime: "—",
          onTimeTone: "neutral",
          status: customer.status,
          owner: "",
          avatarTone: (["teal", "blue", "olive", "cream"] as const)[index % 4],
        })))
        setLoadState("ready")
      })
      .catch((error) => {
        console.error("Customers could not be loaded.", error)
        if (isMounted) setLoadState("error")
      })

    return () => {
      isMounted = false
    }
  }, [reloadToken])

  useEffect(() => {
    getCustomerReference()
      .then((reference) => {
        setCustomerReference(reference)
        setNewCustomer((current) => current.orgTypeId ? current : { ...current, orgTypeId: reference.organisationTypes[0]?.id ?? "" })
      })
      .catch((error) => console.error("Customer organisation types could not be loaded.", error))
  }, [])

  useEffect(() => {
    const openCreateCustomer = () => {
      setCreateError(null)
      setCreateOpen(true)
    }
    window.addEventListener("multideck:create-customer", openCreateCustomer)
    return () => window.removeEventListener("multideck:create-customer", openCreateCustomer)
  }, [])

  const customerFilters = useMemo(() => {
    const count = (status: CustomerRecord["status"]) => customers.filter((customer) => customer.status === status).length
    return ["All", "Premium", "Standard", "Trial", "New"].map((filter) => `${filter} · ${filter === "All" ? customers.length : count(filter as CustomerRecord["status"])}`)
  }, [customers])

  const visibleCustomers = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    const scopedCustomers = scope === "My customers" ? customers.filter((customer) => customer.owner === currentOperator.initials) : customers
    if (filter === "All") return scopedCustomers
    return scopedCustomers.filter((customer) => customer.status === filter)
  }, [activeFilter, customers, scope])

  const pageCount = Math.max(Math.ceil(visibleCustomers.length / rowsPerPage), 1)
  const paginatedCustomers = visibleCustomers.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter, scope, viewMode, customers])

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

  function openCustomer(customer: CustomerRecord) {
    navigate(`/customers/${customer.id}`)
  }

  async function submitNewCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreating(true)
    setCreateError(null)
    try {
      await createCustomer(newCustomer)
      toast.success(t("Customer created"))
      setCreateOpen(false)
      setNewCustomer(emptyCustomer(customerReference?.organisationTypes[0]?.id))
      setReloadToken((value) => value + 1)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t("Unable to create the customer. Check the details and try again."))
    } finally {
      setIsCreating(false)
    }
  }

  function updateNewCustomer<K extends keyof CreateCustomerInput>(key: K, value: CreateCustomerInput[K]) {
    setNewCustomer((current) => ({ ...current, [key]: value }))
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Customers" className="md-page md-page-stack">
      <CustomerListHeader
        scope={scope}
        onScopeChange={setScope}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={() => toast.success("Customer CSV prepared")}
        onSpeakToDexter={() => setDexterOpen(true)}
        customerCount={customers.length}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[560px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("New customer")}</DialogTitle>
            <DialogDescription>{t("Add the customer’s core organisation, address, and primary contact. You can complete the rest later.")}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitNewCustomer}>
            <CustomerInput label={t("Customer name")} required value={newCustomer.name} onChange={(value) => updateNewCustomer("name", value)} />
            <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]">
              <span>{t("Organisation type")} <span className="text-[var(--md-red)]">*</span></span>
              <select value={newCustomer.orgTypeId} onChange={(event) => updateNewCustomer("orgTypeId", event.target.value)} required className="h-10 w-full rounded-[var(--md-radius-md)] border border-[rgba(11,20,19,0.12)] bg-white/65 px-3 text-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]">
                {customerReference?.organisationTypes.length ? customerReference.organisationTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>) : <option value="">{t("Loading organisation types")}</option>}
              </select>
            </label>
            <CustomerInput label={t("Address line 1")} value={newCustomer.addressLine1 ?? ""} onChange={(value) => updateNewCustomer("addressLine1", value || null)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CustomerInput label={t("Town or city")} value={newCustomer.townCity ?? ""} onChange={(value) => updateNewCustomer("townCity", value || null)} />
              <CustomerInput label={t("Country code")} hint={t("Two-letter ISO code, e.g. GB")} value={newCustomer.countryCode ?? ""} onChange={(value) => updateNewCustomer("countryCode", value || null)} />
            </div>
            <CustomerInput label={t("Postcode")} value={newCustomer.postZipCode ?? ""} onChange={(value) => updateNewCustomer("postZipCode", value || null)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CustomerInput label={t("Contact first name")} value={newCustomer.contactFirstName ?? ""} onChange={(value) => updateNewCustomer("contactFirstName", value || null)} />
              <CustomerInput label={t("Contact last name")} value={newCustomer.contactLastName ?? ""} onChange={(value) => updateNewCustomer("contactLastName", value || null)} />
            </div>
            <CustomerInput label={t("Contact email")} type="email" value={newCustomer.contactEmail ?? ""} onChange={(value) => updateNewCustomer("contactEmail", value || null)} />
            {createError ? <p className="text-[13px] font-medium text-destructive" role="alert">{createError}</p> : null}
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating}>{t("Cancel")}</Button>
              <Button type="submit" disabled={isCreating}>{isCreating ? t("Creating customer") : t("Create customer")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CustomerFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} filters={customerFilters} />

      {loadState !== "ready" ? (
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" aria-live="polite">
          {loadState === "error" ? (
            <div className="max-w-md">
              <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Customer data is unavailable")}</p>
              <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("Unable to load the customer directory. Check your connection and try again.")}</p>
              <Button type="button" variant="outline" className="mt-4 rounded-[var(--md-radius-lg)]" onClick={() => setReloadToken((value) => value + 1)}>
                <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.25} />
                {t("Try again")}
              </Button>
            </div>
          ) : (
            <div>
              <LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)]" strokeWidth={1.25} />
              <p className="mt-3 text-[13px] font-medium text-[var(--md-text)]">{t("Loading customers")}</p>
            </div>
          )}
        </Surface>
      ) : null}

      {loadState === "ready" && viewMode === "List" ? <CustomerListTable customers={paginatedCustomers} selectedIds={selectedIds} onToggleCustomer={toggleCustomer} onOpenCustomer={openCustomer} /> : null}
      {loadState === "ready" && viewMode === "Cards" ? <CustomerCardsGrid customers={paginatedCustomers} onOpenCustomer={openCustomer} /> : null}
      {loadState === "ready" && viewMode === "Map" ? <CustomerFootprintMap customers={paginatedCustomers} onOpenCustomer={openCustomer} /> : null}

      {loadState === "ready" ? <Pagination
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
      /> : null}
    </DexterDockedPage>
  )
}

function emptyCustomer(orgTypeId = ""): CreateCustomerInput {
  return { name: "", orgTypeId, addressLine1: null, townCity: null, postZipCode: null, countryCode: null, contactFirstName: null, contactLastName: null, contactEmail: null }
}

function CustomerInput({ label, hint, required, type = "text", value, onChange }: { label: string; hint?: string; required?: boolean; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]">
      <span>{label}{required ? <span className="text-[var(--md-red)]"> *</span> : null}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="h-10 rounded-[var(--md-radius-md)] bg-white/65" />
      {hint ? <span className="text-[12px] font-normal text-[var(--md-text)]">{hint}</span> : null}
    </label>
  )
}
