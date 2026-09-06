import { useId, useMemo, type CSSProperties, type ReactNode } from "react"
import { AiBrain, ArrowRight, Download, LayoutGrid, List, Mail, Map as MapIcon, MapPin, Phone, Plus, X } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { cn } from "@/lib/utils"
import {
  customers as galleryCustomers,
  customerFilters,
  customerScopeTabs,
  marlowAccount,
  marlowActiveBookings,
  marlowActivity,
  marlowContacts,
  marlowLaneMix,
  marlowMetrics,
  type CustomerRecord,
  type CustomerStatus,
  type StatusTone,
} from "@/data/operational-data"
import { SectionHeader, Surface } from "./surface"
import { StatusPill, attributeToneFor, toneToVar } from "./status-pill"
import { FilterChips, SegmentedControl } from "./workflow-components"
import { DexterActionPill } from "./dexter-action-pill"
import { PageSettingsMenu, type PageSettingsViewOption } from "./page-settings-menu"

type Customer = CustomerRecord
type MarlowContact = (typeof marlowContacts)[number]
export const customerViewModes = ["List", "Cards", "Map"] as const
export type CustomerViewMode = (typeof customerViewModes)[number]
export const customerViewOptions = [
  { value: "List", label: "List", icon: List },
  { value: "Map", label: "Map", icon: MapIcon },
  { value: "Cards", label: "Board", icon: LayoutGrid },
] satisfies readonly PageSettingsViewOption<CustomerViewMode>[]

const avatarToneClass: Record<string, string> = {
  olive: "bg-[#dce1d6] text-[#786b37] dark:bg-[rgba(232,241,235,0.1)] dark:text-[var(--md-text)]",
  blue: "bg-[rgba(74,125,156,0.14)] text-[var(--md-blue)] dark:bg-[rgba(127,176,207,0.14)]",
  cream: "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] dark:bg-[rgba(229,163,76,0.14)]",
  teal: "bg-[var(--md-accent-a12)] text-[var(--md-accent)] dark:bg-[var(--md-accent-a14)]",
}

const statusTone: Record<CustomerStatus, StatusTone> = {
  Premium: "teal",
  Standard: "neutral",
  Trial: "amber",
  New: "green",
}

export function CustomerAvatar({
  initials,
  tone = "teal",
  size = "md",
  className,
}: {
  initials: string
  tone?: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-[var(--md-radius-md)] font-medium",
        avatarToneClass[tone] ?? avatarToneClass.teal,
        size === "sm" && "size-8 text-[12px]",
        size === "md" && "size-10 text-[13px]",
        size === "lg" && "size-[74px] rounded-[var(--md-radius-lg)] text-[30px]",
        className,
      )}
    >
      {initials}
    </span>
  )
}

export function CustomerSparkline({
  values,
  tone,
  className,
}: {
  values: number[]
  tone: StatusTone
  className?: string
}) {
  const id = useId().replace(/:/g, "")
  const width = 150
  const height = 38
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 1)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 8) - 4
    return [x, y] as const
  })
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${path} L ${width} ${height} L 0 ${height} Z`
  const color = toneToVar(tone)

  return (
    <svg className={cn("h-[38px] w-[150px] shrink-0 overflow-visible", className)} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`customer-spark-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#customer-spark-${id})`} />
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  )
}

export function CustomerStatusPill({ status }: { status: CustomerStatus }) {
  return <StatusPill tone={statusTone[status]}>{status}</StatusPill>
}

export function CustomerMetricCard({
  label,
  value,
  detail,
  tone,
}: (typeof marlowMetrics)[number]) {
  const isMuted = tone === "neutral"

  return (
    <Surface className="min-h-[104px] rounded-[var(--md-radius-xl)]" padding="md">
      <div className="flex h-full flex-col justify-between gap-4">
        <p className="truncate text-[13px] font-medium text-[var(--md-text)]">{label}</p>
        <div>
          <strong className={cn("text-[28px] font-medium leading-none tracking-normal", isMuted ? "text-[var(--md-ink)]" : "text-[var(--md-green)]")}>{value}</strong>
          <p className="mt-2 text-[12px] text-[var(--md-text)]">{detail}</p>
        </div>
      </div>
    </Surface>
  )
}

export function CustomerCard({ customer, onOpen }: { customer: Customer; onOpen: () => void }) {
  return (
    <button type="button" className="rounded-[var(--md-radius-xl)] bg-white/65 p-4 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar initials={customer.initials} tone={customer.avatarTone} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-[var(--md-ink)]">{customer.name}</p>
            <p className="truncate text-[12px] text-[var(--md-text)]">{customer.location}</p>
          </div>
        </div>
        <CustomerStatusPill status={customer.status} />
      </div>
      <div className="mt-[var(--md-page-stack-gap)] grid grid-cols-3 gap-[var(--md-gap-md)] text-[12px] text-[var(--md-text)]">
        <div>
          <p>Billed</p>
          <p className="mt-1 text-[16px] font-medium text-[var(--md-ink)]">{customer.billedYtd}</p>
        </div>
        <div>
          <p>On-time</p>
          <p className="mt-1 text-[16px] font-medium text-[var(--md-green)]">{customer.onTime}</p>
        </div>
        <div>
          <p>Active</p>
          <p className="mt-1 text-[16px] font-medium text-[var(--md-ink)]">{customer.active}</p>
        </div>
      </div>
      <CustomerSparkline values={customer.bookings30d} tone={customer.sparkTone} className="mt-4 w-full" />
    </button>
  )
}

export function CustomerListHeader({
  onExport,
  onSpeakToDexter,
  scope,
  onScopeChange,
  viewMode,
  onViewModeChange,
  customerCount = galleryCustomers.length,
}: {
  onExport?: () => void
  onSpeakToDexter: () => void
  scope: (typeof customerScopeTabs)[number]
  onScopeChange: (scope: (typeof customerScopeTabs)[number]) => void
  viewMode: CustomerViewMode
  onViewModeChange: (mode: CustomerViewMode) => void
  customerCount?: number
}) {
  const customers = { length: customerCount }

  return (
    <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Customers</h1>
        <p className="mt-2 text-[15px] leading-6 text-[var(--md-text)]">
          <span className="font-medium text-[var(--md-ink)]">{customers.length} active</span> · 1,184 bookings YTD ·{" "}
          <span className="font-medium text-[var(--md-ink)]">€18.4M</span> billed YTD · 3 nearing renewal
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl options={customerScopeTabs} value={scope} onChange={onScopeChange} />
        <DexterActionPill onClick={onSpeakToDexter} />
        <PageSettingsMenu
          viewOptions={customerViewOptions}
          value={viewMode}
          onViewChange={onViewModeChange}
          actions={onExport ? [{ id: "export-customers", label: "Export CSV", icon: Download, onSelect: onExport }] : []}
        />
      </div>
    </div>
  )
}

export function CustomerViewModeSwitch({
  viewMode,
  onViewModeChange,
}: {
  viewMode: CustomerViewMode
  onViewModeChange: (mode: CustomerViewMode) => void
}) {
  return (
    <PageSettingsMenu viewOptions={customerViewOptions} value={viewMode} onViewChange={onViewModeChange} />
  )
}

export function CustomerFilterBar({
  activeFilter,
  onFilterChange,
  filters = customerFilters,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
  filters?: string[]
}) {
  return (
    <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-center xl:justify-between">
      <FilterChips
        options={filters}
        activeOption={activeFilter}
        onChange={onFilterChange}
        auxiliaryOptions={["+ Owner", "+ Region", "+ Industry"]}
      />
      <p className="text-[13px] font-medium text-[var(--md-text)]">Sort · YTD volume ↓</p>
    </div>
  )
}

export function CustomerListTable({
  customers,
  loadAllExportRows,
  selectedIds,
  onToggleCustomer,
  onOpenCustomer,
}: {
  customers: Customer[]
  loadAllExportRows?: (signal: AbortSignal) => Promise<readonly Customer[]>
  selectedIds: Set<string>
  onToggleCustomer: (id: string) => void
  onOpenCustomer: (customer: Customer) => void
}) {
  const columns = useMemo<DataTableColumn<Customer>[]>(() => [
    {
      id: "select",
      label: "Select",
      kind: "actions",
      width: 52,
      canHide: false,
      canPin: false,
      cell: (customer) => {
        const selected = selectedIds.has(customer.id)
        return (
          <button
            type="button"
            aria-label={`Select ${customer.name}`}
            aria-pressed={selected}
            className={cn("grid size-8 place-items-center rounded-[var(--md-radius-md)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]")}
            onClick={(event) => {
              event.stopPropagation()
              onToggleCustomer(customer.id)
            }}
          >
            <span className={cn("grid size-[18px] place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)] transition-[background,box-shadow]", selected && "bg-[var(--md-accent)] shadow-[0_0_0_3px_var(--md-accent-a12)]")}>
              <span className={cn("size-1.5 rounded-full bg-white opacity-0", selected && "opacity-100")} />
            </span>
          </button>
        )
      },
    },
    {
      id: "customer",
      label: "Customer",
      kind: "identity",
      width: 310,
      minWidth: 240,
      resizable: true,
      sortValue: (customer) => customer.name,
      cellTitle: (customer) => `${customer.name} · ${customer.location}`,
      cell: (customer) => <div className="flex min-w-0 items-center gap-3"><CustomerAvatar initials={customer.initials} tone={customer.avatarTone} /><div className="min-w-0"><p className="truncate text-[15px] font-medium text-[var(--md-ink)]">{customer.name}</p><p className="truncate text-[12px] text-[var(--md-text)]">{customer.location}</p></div></div>,
    },
    {
      id: "industry",
      label: "Industry",
      kind: "attribute",
      width: 190,
      resizable: true,
      sortValue: (customer) => customer.industry,
      cell: (customer) => <StatusPill kind="attribute" tone={attributeToneFor(customer.industry)}>{customer.industry}</StatusPill>,
    },
    { id: "contacts", label: "Contacts", kind: "number", width: 104, sortValue: (customer) => customer.contacts, cell: (customer) => <span className="font-medium text-[var(--md-ink)]">{customer.contacts}</span> },
    { id: "active", label: "Active", kind: "number", width: 96, sortValue: (customer) => Number.parseFloat(customer.active), cell: (customer) => <span className={cn("font-medium", customer.activeTone === "amber" ? "text-[var(--md-amber)]" : "text-[var(--md-ink)]")}>{customer.active}</span> },
    { id: "bookings", label: "30d bookings", kind: "custom", width: 170, canPin: false, cell: (customer) => <CustomerSparkline values={customer.bookings30d} tone={customer.sparkTone} /> },
    { id: "billed", label: "Billed YTD", kind: "number", width: 132, sortValue: (customer) => Number.parseFloat(customer.billedYtd.replace(/[^0-9.-]/g, "")), cell: (customer) => <span className="text-[15px] font-medium text-[var(--md-ink)]">{customer.billedYtd}</span> },
    { id: "on-time", label: "On-time", kind: "number", width: 104, sortValue: (customer) => Number.parseFloat(customer.onTime), cell: (customer) => <span className={cn("font-medium", customer.onTimeTone === "green" ? "text-[var(--md-green)]" : customer.onTimeTone === "amber" ? "text-[var(--md-amber)]" : "text-[var(--md-ink)]")}>{customer.onTime}</span> },
    { id: "status", label: "Status", kind: "status", width: 120, sortValue: (customer) => customer.status, cell: (customer) => <StatusPill kind="status" tone={statusTone[customer.status]}>{customer.status}</StatusPill> },
    { id: "owner", label: "Owner", kind: "identity", width: 96, sortValue: (customer) => customer.owner, cell: (customer) => <span className="grid size-7 place-items-center rounded-full bg-[var(--md-accent-a12)] text-[12px] font-medium text-[var(--md-accent)]" aria-label={`Owner ${customer.owner}`}>{customer.owner}</span> },
  ], [onToggleCustomer, selectedIds])

  return (
    <DataTable
      ariaLabel="Customers"
      exportConfig={loadAllExportRows ? { fileName: "customers", register: {
        dateLabel: "Last contact date", dateValue: (customer) => customer.lastContactAt, loadAllRows: loadAllExportRows,
      } } : undefined}
      columnsButtonLabel="Manage customer columns"
      columns={columns}
      rows={customers}
      getRowKey={(customer) => customer.id}
      storageKey="customer-register"
      selectedRowKeys={selectedIds}
      onRowClick={onOpenCustomer}
      rowAriaLabel={(customer) => `Open ${customer.name}`}
      rowClassName="h-[72px]"
    />
  )
}

export function CustomerCardsGrid({
  customers,
  onOpenCustomer,
}: {
  customers: Customer[]
  onOpenCustomer: (customer: Customer) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {customers.map((customer) => (
        <CustomerCard key={customer.id} customer={customer} onOpen={() => onOpenCustomer(customer)} />
      ))}
    </div>
  )
}

export function CustomerFootprintMap({
  customers,
  onOpenCustomer,
}: {
  customers: Customer[]
  onOpenCustomer: (customer: Customer) => void
}) {
  const mapPins = [
    ["London", "42%", "26%", "MA"],
    ["Hamburg", "50%", "36%", "BI"],
    ["Oakland", "22%", "44%", "PG"],
    ["Athens", "54%", "58%", "MS"],
    ["Helsinki", "63%", "19%", "HM"],
  ] as const

  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex items-center justify-between border-b border-[rgba(11,20,19,0.06)] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Customer footprint</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Grouped by commercial region and active booking volume.</p>
        </div>
        <MapPin className="size-5 text-[var(--md-accent)]" strokeWidth={1.2} />
      </div>
      <div className="grid gap-4 p-4 lg:min-h-[340px] lg:grid-cols-[1fr_340px]">
        <div className="relative min-h-[280px] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)] lg:min-h-0">
          {mapPins.map(([city, left, top, initials]) => {
            const matchingCustomer = customers.find((customer) => customer.initials === initials) ?? customers[0]

            return (
              <button
                key={city}
                type="button"
                className="absolute grid size-10 place-items-center rounded-full bg-white/85 text-[12px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-lift)] transition-[background,color,box-shadow,opacity,transform] hover:scale-[1.04]"
                style={{ left, top }}
                onClick={() => onOpenCustomer(matchingCustomer)}
              >
                {initials}
              </button>
            )
          })}
        </div>
        <div className="md-scrollbar flex max-h-[340px] flex-col gap-3 overflow-y-auto pr-1">
          {customers.map((customer) => (
            <CustomerCard key={customer.id} customer={customer} onOpen={() => onOpenCustomer(customer)} />
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function ActiveBookingRow({ booking }: { booking: (typeof marlowActiveBookings)[number] }) {
  return (
    <div className="grid min-h-[64px] grid-cols-[24px_minmax(110px,150px)_1fr_90px_96px_92px] items-center gap-4 border-t border-[rgba(11,20,19,0.06)] px-5 py-3">
      <span className="size-2.5 rounded-full" style={{ background: toneToVar(booking.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(booking.tone)} 12%, transparent)` }} />
      <p className="text-[13px] font-medium text-[var(--md-text)]">{booking.id}</p>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-[var(--md-ink)]">{booking.route}</p>
        <p className="truncate text-[12px] text-[var(--md-text)]">{booking.detail}</p>
      </div>
      <StatusPill tone={booking.mode === "AIR" ? "green" : "blue"}>{booking.mode}</StatusPill>
      <p className="text-[13px] text-[var(--md-text)]">ETA {booking.eta}</p>
      <div className="flex items-center gap-2">
        <Progress
          value={booking.progress}
          className="h-1.5 flex-1 rounded-full bg-[rgba(90,103,100,0.14)] [&>div]:bg-[var(--progress-color)]"
          style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties}
        />
        <span className="w-8 text-right text-[12px] text-[var(--md-text)]">{booking.progress}%</span>
      </div>
    </div>
  )
}

export function ContactRow({
  contact,
  selected,
  onOpen,
}: {
  contact: MarlowContact
  selected?: boolean
  onOpen?: () => void
}) {
  const interactive = Boolean(onOpen)

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "grid grid-cols-[44px_1fr_auto] items-center gap-4 border-t border-[rgba(11,20,19,0.06)] px-5 py-4 transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        interactive && "cursor-pointer hover:bg-white/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a12)]",
        selected && "bg-white/60",
      )}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!interactive) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen?.()
        }
      }}
    >
      <CustomerAvatar initials={contact.initials} tone={contact.tone} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-[var(--md-ink)]">{contact.name}</p>
          {contact.primary ? <StatusPill tone="teal">Primary</StatusPill> : null}
        </div>
        <p className="truncate text-[12px] text-[var(--md-text)]">{contact.role}</p>
        <p className="truncate text-[12px] text-[var(--md-text)]">{contact.email}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <p className="text-[12px] text-[var(--md-text)]">{contact.status}</p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Mail data-icon="inline-start" strokeWidth={1.2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
            onClick={(event) => event.stopPropagation()}
          >
            <Phone data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ContactDataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-3">
      <p className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</p>
      <div className="min-w-0 text-[13px] leading-5 text-[var(--md-ink)]">{value}</div>
    </div>
  )
}

export function ContactProfileModule({
  contact,
  onClose,
}: {
  contact: MarlowContact
  onClose?: () => void
}) {
  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 items-start gap-4">
          <CustomerAvatar initials={contact.initials} tone={contact.tone} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{contact.name}</h2>
              {contact.primary ? <StatusPill tone="teal">Primary contact</StatusPill> : null}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{contact.role}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                <Mail data-icon="inline-start" strokeWidth={1.2} />
                Email
              </Button>
              <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                <Phone data-icon="inline-start" strokeWidth={1.2} />
                Call
              </Button>
            </div>
          </div>
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close contact module"
            className="size-8 shrink-0 rounded-[var(--md-radius-md)] bg-white/50 shadow-[var(--md-shadow-line)]"
            onClick={onClose}
          >
            <X data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        ) : null}
      </div>

      <div className="grid gap-0 border-t border-[rgba(11,20,19,0.06)] 2xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="px-5 py-4">
          <ContactDataRow label="Email" value={<a className="text-[var(--md-accent)] hover:text-[var(--md-ink)]" href={`mailto:${contact.email}`}>{contact.email}</a>} />
          <ContactDataRow label="Phone" value={contact.phone} />
          <ContactDataRow label="Mobile" value={contact.mobile} />
          <ContactDataRow label="Location" value={contact.location} />
          <ContactDataRow label="Department" value={contact.department} />
          <ContactDataRow label="Preference" value={contact.preference} />
          <ContactDataRow label="Influence" value={contact.influence} />
        </div>

        <div className="bg-[var(--md-surface-soft)] px-5 py-4 2xl:shadow-[inset_1px_0_0_rgba(11,20,19,0.05)]">
          <div>
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Next step</p>
            <p className="mt-2 text-[14px] font-medium leading-6 text-[var(--md-ink)]">{contact.nextStep}</p>
          </div>
          <div className="mt-[var(--md-page-stack-gap)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Last touch</p>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{contact.lastTouch}</p>
          </div>
          <div className="mt-[var(--md-page-stack-gap)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Open items</p>
            <div className="mt-2 flex flex-col gap-2">
              {contact.openItems.map((item) => (
                <span key={item} className="rounded-[var(--md-radius-md)] bg-white/65 px-3 py-2 text-[12px] font-medium leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-[var(--md-page-stack-gap)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">Linked work</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {contact.linkedBookings.map((booking) => (
                <StatusPill key={booking} tone="neutral">{booking}</StatusPill>
              ))}
            </div>
          </div>
          <p className="mt-[var(--md-page-stack-gap)] border-t border-[rgba(11,20,19,0.06)] pt-[var(--md-gap-lg)] text-[13px] leading-6 text-[var(--md-text)]">{contact.notes}</p>
        </div>
      </div>
    </Surface>
  )
}

export function LaneMixPanel() {
  const max = Math.max(...marlowLaneMix.map((lane) => lane.value))

  return (
    <Surface className="rounded-[var(--md-radius-xl)]" padding="none">
      <div className="px-5 py-4">
        <SectionHeader title="Lane mix · last 90d" meta="6 lanes · 71 bookings" />
      </div>
      <div className="px-5 pb-5">
        {marlowLaneMix.map((lane) => (
          <div key={lane.lane} className="grid grid-cols-[220px_1fr_32px] items-center gap-4 border-t border-[rgba(11,20,19,0.06)] py-3">
            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{lane.lane}</p>
            <div className="h-2 rounded-full bg-[rgba(90,103,100,0.12)]">
              <div className="h-full rounded-full bg-[var(--md-accent)]" style={{ width: `${(lane.value / max) * 100}%` }} />
            </div>
            <p className="text-right text-[13px] font-medium text-[var(--md-ink)]">{lane.value}</p>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function CustomerPanelHeader({
  title,
  meta,
  action,
}: {
  title: string
  meta?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta ? <span className="text-[13px] text-[var(--md-text)]">{meta}</span> : null}
      </div>
      {action}
    </div>
  )
}

export function AddContactButton() {
  return (
    <button type="button" className="mx-[var(--md-page-stack-gap)] mb-[var(--md-page-stack-gap)] mt-[var(--md-gap-lg)] flex h-10 items-center justify-center gap-[var(--md-gap-sm)] rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a12)]">
      <Plus className="size-4" strokeWidth={1.3} />
      Add contact
    </button>
  )
}

export function ArrowTextButton({ children }: { children: ReactNode }) {
  return (
    <Button variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-2 text-[13px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]">
      {children}
      <ArrowRight data-icon="inline-end" strokeWidth={1.2} />
    </Button>
  )
}

export function CustomerDetailHero() {
  return (
    <section className="flex flex-col gap-[var(--md-page-stack-gap)] xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-col gap-[var(--md-page-stack-gap)] md:flex-row md:items-center">
        <CustomerAvatar initials="MA" tone="olive" size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Marlow Apparel Ltd</h1>
            <StatusPill tone="teal">Premium</StatusPill>
            <StatusPill tone="green">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--md-green)]" />
                Active
              </span>
            </StatusPill>
            <StatusPill tone="amber">1 open exception</StatusPill>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-[14px] text-[var(--md-text)]">
            <span className="text-[var(--md-ink)]">Apparel & textiles</span>
            <span>HQ London, UK</span>
            <span>Customer since <span className="text-[var(--md-ink)]">Mar 2022</span></span>
            <span>Lanes <span className="text-[var(--md-ink)]">Asia → UK / EU</span></span>
            <span>Account exec <span className="text-[var(--md-ink)]">Elena Moreno</span></span>
          </div>
        </div>
      </div>
    </section>
  )
}

export function CustomerMetricsGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {marlowMetrics.map((metric) => (
        <CustomerMetricCard key={metric.label} {...metric} />
      ))}
    </div>
  )
}

export function ActiveBookingsPanel() {
  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <CustomerPanelHeader
        title="Active bookings"
        meta="6 · 1 exception"
        action={<ArrowTextButton>View all 287</ArrowTextButton>}
      />
      <div className="overflow-x-auto md-scrollbar">
        <div className="min-w-[760px]">
          {marlowActiveBookings.map((booking) => (
            <ActiveBookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function PrimaryContactsPanel({
  selectedContact,
  onSelectContact,
}: {
  selectedContact?: MarlowContact | null
  onSelectContact: (contact: MarlowContact) => void
}) {
  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <CustomerPanelHeader title="Primary contacts" meta="4" action={<ArrowTextButton>View all</ArrowTextButton>} />
      {marlowContacts.map((contact) => (
        <ContactRow
          key={contact.email}
          contact={contact}
          selected={selectedContact?.email === contact.email}
          onOpen={() => onSelectContact(contact)}
        />
      ))}
      <AddContactButton />
    </Surface>
  )
}

export function DexterPulsePanel() {
  return (
    <section className="rounded-[var(--md-radius-xl)] bg-[var(--md-accent-a12)] p-[var(--md-page-stack-gap)] shadow-[inset_0_0_0_1px_var(--md-accent-a22)]">
      <div className="flex items-center gap-3">
        <AiBrain className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Dexter · customer pulse</h2>
      </div>
      <p className="mt-[var(--md-page-stack-gap)] text-[15px] leading-7 text-[var(--md-ink)]">
        Healthy and growing. Sandra mentioned in last week's email that volumes for AW26 may run 20% above forecast — worth touching base on capacity before September. One open hold; everything else on track.
      </p>
      <div className="mt-[var(--md-page-stack-gap)] flex flex-wrap gap-[var(--md-gap-sm)]">
        <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          Draft capacity check-in
        </Button>
        <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
          Resolve open hold
        </Button>
      </div>
    </section>
  )
}

export function AccountPanel() {
  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="px-5 py-4">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Account</h2>
      </div>
      <div className="px-5 pb-5">
        {marlowAccount.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[120px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-3">
            <p className="text-[13px] text-[var(--md-text)]">{label}</p>
            <p className={cn("text-right text-[14px] font-medium text-[var(--md-ink)]", label === "Open balance" && "text-[var(--md-amber)]")}>{value}</p>
          </div>
        ))}
        <div className="grid grid-cols-[120px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-3">
          <p className="text-[13px] text-[var(--md-text)]">Tags</p>
          <div className="flex justify-end gap-2">
            <StatusPill tone="teal">premium</StatusPill>
            <StatusPill tone="blue">strategic</StatusPill>
          </div>
        </div>
      </div>
    </Surface>
  )
}

export function CustomerActivityPanel() {
  return (
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex items-center gap-3 px-5 py-4">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Activity</h2>
        <span className="text-[13px] text-[var(--md-text)]">last 14 days</span>
      </div>
      <div className="px-5 pb-4">
        {marlowActivity.map((item) => (
          <div key={item.title} className="grid grid-cols-[120px_16px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-4">
            <p className="text-[12px] text-[var(--md-text)]">{item.time}</p>
            <span className="mt-1.5 size-2 rounded-full" style={{ background: toneToVar(item.tone as StatusTone) }} />
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[var(--md-ink)]">{item.title}</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{item.source}</p>
            </div>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function CustomerSimpleTabPanel({ tab }: { tab: string }) {
  const message = {
    Contacts: "Primary contacts, comms preferences, and owner notes for this account.",
    Bookings: "All active, delayed, and completed bookings for Marlow Apparel.",
    Documents: "Commercial invoices, packing lists, bills of lading, and customs docs.",
    Quotes: "Open and accepted commercial quotes linked to this account.",
    Activity: "Account timeline across AI, email, bookings, quotes, and exceptions.",
    Notes: "Internal account notes, renewal context, and customer-specific preferences.",
  }[tab] ?? "Customer overview."

  return (
    <Surface className="rounded-[var(--md-radius-xl)]" padding="lg">
      <h2 className="text-[18px] font-medium text-[var(--md-ink)]">{tab}</h2>
      <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-[var(--md-text)]">{message}</p>
      <div className="mt-[var(--md-gap-xl)] grid gap-[var(--md-gap-md)] md:grid-cols-3">
        {marlowMetrics.slice(0, 3).map((metric) => (
          <CustomerMetricCard key={metric.label} {...metric} />
        ))}
      </div>
    </Surface>
  )
}
