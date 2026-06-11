import { useState, type CSSProperties, type ReactNode } from "react"
import { toast } from "sonner"
import {
  ArrowLeft,
  Boxes,
  Check,
  CircleDollarSign,
  FileText,
  MessageCircle,
  PanelRightClose,
  Paperclip,
  SendHorizontal,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  shipmentCargo,
  shipmentDocuments,
  shipmentFilters,
  shipmentMetrics,
  shipmentMilestones,
  shipments,
  shipmentTimeline,
  type ShipmentMode,
  type ShipmentStatus,
  type StatusTone,
} from "@/data/multideck-data"
import { FilterChips, SegmentedControl, TabsRail } from "./workflow-components"
import { StatusPill, toneToVar } from "./status-pill"
import { Surface } from "./surface"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

export type Shipment = (typeof shipments)[number]
export const shipmentViewModes = ["Table", "Board", "Map", "Timeline"] as const
export type ShipmentViewMode = (typeof shipmentViewModes)[number]
const shipmentDetailTabs = ["Overview", "Documents", "Customs", "Costs", "Comms", "Timeline"] as const
type ShipmentDetailTab = (typeof shipmentDetailTabs)[number]

const statusTone: Record<ShipmentStatus, StatusTone> = {
  "On track": "green",
  Delayed: "amber",
  Exception: "red",
}

const modeTone: Record<ShipmentMode, StatusTone> = {
  OCEAN: "blue",
  AIR: "green",
  ROAD: "amber",
}

const customsEntries: readonly [string, string, string, StatusTone][] = [
  ["CDS entry", "Submitted 08:30 by Wei Chen", "waiting docs", "amber" as StatusTone],
  ["CN export licence", "Missing from document set", "critical", "red" as StatusTone],
  ["HS-code match", "8517.62.00 dual-use telecom equipment", "flagged", "red" as StatusTone],
  ["Broker handoff", "Yong Hua Logistics + Wei Chen", "ready", "green" as StatusTone],
]

const costRows = [
  ["Ocean freight", "Booked with EVERGREEN", "USD 6,840.00"],
  ["Origin handling", "Shanghai terminal + drayage", "USD 1,120.00"],
  ["Destination handling", "Long Beach release + terminal", "USD 1,480.00"],
  ["Duty estimate", "HS 8517.62.00 · 2.6%", "USD 4,789.20"],
  ["Demurrage risk", "Hold may cross free-time window", "USD 720.00"],
]

const commMessages = [
  ["Elena Moreno", "Asked Yong Hua for the missing CN export licence and packing-list confirmation.", "09:48"],
  ["Wei Chen", "Broker can resubmit CDS as soon as licence PDF is attached to MD-22455.", "09:35"],
  ["AI draft", "Prepared shipper email with invoice, HS-code and container references included.", "09:28"],
]

const askStarterMessages = [
  {
    role: "assistant",
    text: "The customs hold was raised because the HS-code match expects a CN export licence. It is separate from the +36h berth congestion delay.",
  },
]

const askSuggestions = ["Explain the hold", "What costs changed?", "Draft shipper email"]

export function ShipmentStatusPill({ status }: { status: ShipmentStatus }) {
  return <StatusPill tone={statusTone[status]}>{status}</StatusPill>
}

export function ShipmentModePill({ mode }: { mode: ShipmentMode }) {
  return <StatusPill tone={modeTone[mode]} className="min-w-[88px] justify-center">{mode}</StatusPill>
}

export function ShipmentMetricCard({ label, value, tone }: (typeof shipmentMetrics)[number]) {
  return (
    <Surface padding="md" className="min-h-[92px] rounded-[var(--md-radius-xl)]">
      <p className="text-[13px] font-medium text-[var(--md-text)]">{label}</p>
      <strong
        className={cn(
          "mt-2 block text-[30px] font-medium leading-none tracking-normal",
          tone === "neutral" ? "text-[var(--md-ink)]" : undefined,
        )}
        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}
      >
        {value}
      </strong>
    </Surface>
  )
}

export function ShipmentMetricStrip() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {shipmentMetrics.map((metric) => (
        <ShipmentMetricCard key={metric.label} {...metric} />
      ))}
    </div>
  )
}

export function ShipmentViewSwitch({
  value,
  onChange,
}: {
  value: ShipmentViewMode
  onChange: (value: ShipmentViewMode) => void
}) {
  return <SegmentedControl options={shipmentViewModes} value={value} onChange={onChange} />
}

export function ShipmentListHeader({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ShipmentViewMode
  onViewModeChange: (mode: ShipmentViewMode) => void
}) {
  return (
    <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-[32px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Shipments</h1>
        <p className="mt-2 text-[16px] leading-6 text-[var(--md-ink)]">
          <span className="font-medium">23 in transit</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium text-[var(--md-red)]">2 exceptions</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium text-[var(--md-amber)]">3 delayed</span>
          <span className="text-[var(--md-text)]"> · </span>
          <span className="font-medium">4 delivered today</span>
        </p>
      </div>
      <ShipmentViewSwitch value={viewMode} onChange={onViewModeChange} />
    </div>
  )
}

export function ShipmentFilterBar({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
}) {
  return (
    <div className="my-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <FilterChips
        options={shipmentFilters}
        activeOption={activeFilter}
        onChange={onFilterChange}
        auxiliaryOptions={["+ Mode", "+ Carrier", "+ Customer", "+ Owner", "+ ETA range"]}
      />
      <p className="text-[13px] font-medium text-[var(--md-text)]">Sort · ETA ↑</p>
    </div>
  )
}

function SelectionBox({ selected }: { selected?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)]",
        selected && "bg-[var(--md-accent)] shadow-[0_0_0_3px_rgba(14,125,116,0.12)]",
      )}
    >
      {selected ? <Check className="size-3 text-white" strokeWidth={1.8} /> : null}
    </span>
  )
}

export function ShipmentRow({
  shipment,
  selected,
  onSelect,
  onOpen,
}: {
  shipment: Shipment
  selected?: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  return (
    <TableRow
      className={cn(
        "h-[78px] cursor-pointer border-[rgba(11,20,19,0.04)] hover:bg-white/35",
        shipment.status === "Exception" && "bg-[rgba(14,125,116,0.06)] hover:bg-[rgba(14,125,116,0.1)]",
      )}
      onClick={onOpen}
    >
      <TableCell className="w-12 pl-0">
        <button
          type="button"
          aria-label={`Select ${shipment.id}`}
          aria-pressed={selected}
          onClick={(event) => {
            event.stopPropagation()
            onSelect()
          }}
        >
          <SelectionBox selected={selected} />
        </button>
      </TableCell>
      <TableCell className="min-w-[130px]">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full" style={{ background: toneToVar(shipment.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(shipment.tone)} 12%, transparent)` }} />
          <p className="text-[14px] font-medium text-[var(--md-ink)]">{shipment.id}</p>
        </div>
      </TableCell>
      <TableCell className="min-w-[300px]">
        <p className="text-[15px] font-medium text-[var(--md-ink)]">{shipment.customer}</p>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">{shipment.route}</p>
      </TableCell>
      <TableCell className="min-w-[190px]">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{shipment.carrier}</p>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">{shipment.container}</p>
      </TableCell>
      <TableCell>
        <ShipmentModePill mode={shipment.mode} />
      </TableCell>
      <TableCell className="text-right text-[14px] font-medium text-[var(--md-ink)]">{shipment.value}</TableCell>
      <TableCell className="text-right">
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{shipment.eta}</p>
        <p className="text-[12px] text-[var(--md-text)]">{shipment.time}</p>
      </TableCell>
      <TableCell>
        <ShipmentStatusPill status={shipment.status} />
      </TableCell>
      <TableCell className="min-w-[150px]">
        <div className="flex items-center gap-3">
          <Progress
            value={shipment.progress}
            className="h-1.5 flex-1 rounded-full bg-[rgba(90,103,100,0.12)] [&>div]:bg-[var(--progress-color)]"
            style={{ "--progress-color": toneToVar(shipment.tone) } as CSSProperties}
          />
          <span className="w-8 text-right text-[13px] text-[var(--md-text)]">{shipment.progress}%</span>
        </div>
      </TableCell>
      <TableCell>
        <span className="grid size-8 place-items-center rounded-full bg-[rgba(14,125,116,0.12)] text-[12px] font-medium text-[var(--md-accent)]">{shipment.owner}</span>
      </TableCell>
    </TableRow>
  )
}

export function ShipmentsTable({
  rows,
  selectedIds,
  onToggleShipment,
  onOpenShipment,
}: {
  rows: Shipment[]
  selectedIds: Set<string>
  onToggleShipment: (id: string) => void
  onOpenShipment: (shipment: Shipment) => void
}) {
  return (
    <div className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <Table className="min-w-[1420px]">
        <TableHeader>
          <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
            <TableHead className="w-12 pl-0" />
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Shipment</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Customer · route</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Carrier · container</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Mode</TableHead>
            <TableHead className="text-right text-[12px] font-medium text-[var(--md-text)]">Value</TableHead>
            <TableHead className="text-right text-[12px] font-medium text-[var(--md-text)]">ETA</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Status</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Progress</TableHead>
            <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((shipment) => (
            <ShipmentRow
              key={shipment.id}
              shipment={shipment}
              selected={selectedIds.has(shipment.id)}
              onSelect={() => onToggleShipment(shipment.id)}
              onOpen={() => onOpenShipment(shipment)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ShipmentBoardPreview({ onOpenShipment }: { onOpenShipment: (shipment: Shipment) => void }) {
  const columns = [
    ["Open", shipments.slice(0, 3)],
    ["Exception", shipments.filter((shipment) => shipment.status === "Exception")],
    ["Delivered soon", shipments.slice(4, 7)],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map(([label, rows]) => (
        <Surface key={label} padding="md" className="rounded-[var(--md-radius-xl)]">
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{label}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {rows.map((shipment) => (
              <button key={shipment.id} type="button" className="rounded-[var(--md-radius-lg)] bg-white/55 p-3 text-left shadow-[var(--md-shadow-line)] transition-all hover:bg-white" onClick={() => onOpenShipment(shipment)}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-[var(--md-ink)]">{shipment.id}</span>
                  <ShipmentStatusPill status={shipment.status} />
                </div>
                <p className="mt-2 truncate text-[14px] font-medium text-[var(--md-ink)]">{shipment.customer}</p>
                <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{shipment.route}</p>
              </button>
            ))}
          </div>
        </Surface>
      ))}
    </div>
  )
}

function DetailSideRail({ navigate }: { navigate: (path: string) => void }) {
  const related = shipments.filter((shipment) => shipment.id !== "MD-22455").slice(0, 4)

  return (
    <aside className="hidden min-h-screen w-[262px] shrink-0 bg-[var(--md-sidebar-bg)] px-7 py-8 shadow-[inset_-1px_0_0_rgba(11,20,19,0.06)] lg:block">
      <img src={multideckFullLogo} alt="Multideck" className="h-[28px] w-auto" />
      <button type="button" className="mt-14 flex items-center gap-2 text-[14px] font-medium text-[var(--md-text)] hover:text-[var(--md-ink)]" onClick={() => navigate("/shipments")}>
        <ArrowLeft className="size-4" strokeWidth={1.2} />
        All shipments
      </button>
      <p className="mt-10 text-[12px] font-medium text-[var(--md-subtle)]">Related</p>
      <div className="mt-5 flex flex-col gap-5">
        {related.map((shipment) => (
          <button key={shipment.id} type="button" className="grid grid-cols-[10px_1fr] gap-3 text-left" onClick={() => navigate("/shipments/md-22455")}>
            <span className="mt-2 size-2 rounded-full" style={{ background: toneToVar(shipment.tone) }} />
            <span>
              <span className="block text-[13px] text-[var(--md-text)]">{shipment.id}</span>
              <span className="block text-[14px] font-medium leading-5 text-[var(--md-ink)]">{shipment.route}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function ShipmentDetailHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: ShipmentDetailTab
  onTabChange: (tab: ShipmentDetailTab) => void
}) {
  const tabs = shipmentDetailTabs.map((label) => ({ label }))
  return (
    <header className="border-b border-[rgba(11,20,19,0.08)] px-6 pt-8 md:px-9">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-[13px] font-medium text-[var(--md-text)]">
            <span className="uppercase tracking-normal">Shipment</span>
            <span>MD-22455</span>
            <StatusPill tone="red" className="h-7 px-3 text-[13px]">Customs hold</StatusPill>
            <StatusPill tone="neutral" className="h-7 px-3 text-[13px]">FCL · 40HC</StatusPill>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-2">
            <h1 className="text-[34px] font-medium leading-tight tracking-normal text-[var(--md-ink)] md:text-[40px]">Shanghai → Long Beach</h1>
            <p className="pb-1 text-[15px] font-medium text-[var(--md-text)]">EVERGREEN · vessel "Ever Given"</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="h-11 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[14px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65">
            Notify shipper
          </Button>
          <Button className="h-11 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-5 text-[14px] font-medium text-white hover:bg-[#0b6f67]">
            Resolve hold
          </Button>
        </div>
      </div>
      <TabsRail tabs={tabs} activeTab={activeTab} onChange={(tab) => onTabChange(tab as ShipmentDetailTab)} className="mt-7" />
    </header>
  )
}

export function ShipmentArrivalCard() {
  return (
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <p className="text-[14px] text-[var(--md-text)]">Predicted arrival · Long Beach, USLGB</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <strong className="text-[46px] font-medium leading-none tracking-normal text-[var(--md-ink)] md:text-[56px] 2xl:text-[64px]">Jun 09, 03:00 PT</strong>
            <span className="pb-2 text-[16px] font-medium text-[var(--md-amber)]">+ 2 days 4 hrs</span>
          </div>
          <p className="mt-5 text-[15px] text-[var(--md-text)]">Model confidence <span className="font-medium text-[var(--md-ink)]">87%</span> · last update 41 seconds ago</p>
        </div>
        <div className="min-w-[220px] text-left 2xl:text-right">
          <p className="text-[13px] text-[var(--md-text)]">Booked</p>
          <p className="mt-2 text-[18px] font-medium text-[var(--md-ink)]">Jun 07, 03:00</p>
          <p className="mt-6 text-[13px] text-[var(--md-text)]">Shipper</p>
          <p className="mt-2 text-[15px] font-medium text-[var(--md-ink)]">Yong Hua Logistics</p>
        </div>
      </div>
      <div className="mt-12 overflow-x-auto md-scrollbar">
        <div className="grid min-w-[680px] grid-cols-7 items-start">
          {shipmentMilestones.map((milestone, index) => (
            <div key={milestone.label} className="relative flex flex-col items-center text-center">
              {index < shipmentMilestones.length - 1 ? (
                <span
                  className={cn(
                    "absolute left-1/2 top-[9px] h-0.5 w-full",
                    index < 2 ? "bg-[var(--md-red)]" : "bg-[rgba(90,103,100,0.22)]",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 size-5 rounded-full bg-[var(--md-bg)] shadow-[0_0_0_3px_var(--md-bg)]",
                  milestone.state === "done" && "bg-[var(--md-green)]",
                  milestone.state === "current" && "bg-[var(--md-red)] shadow-[0_0_0_7px_rgba(209,78,78,0.16)]",
                  milestone.state === "pending" && "bg-[var(--md-bg)] shadow-[inset_0_0_0_2px_var(--md-text),0_0_0_3px_var(--md-bg)]",
                )}
              />
              <p className="mt-4 text-[12px] font-medium text-[var(--md-ink)]">{milestone.label}</p>
              <p className="mt-1 text-[13px] text-[var(--md-text)]">{milestone.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export function ShipmentExceptionPanel() {
  return (
    <section className="rounded-[var(--md-radius-xl)] bg-white/38 p-5 shadow-[inset_0_0_0_1px_rgba(209,78,78,0.28),0_0_0_1px_rgba(209,78,78,0.08)]">
      <div className="grid gap-4 md:grid-cols-[52px_1fr_auto]">
        <div className="grid size-[44px] place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]">
          <TriangleAlert className="size-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Customs hold · CN export licence missing</h2>
            <StatusPill tone="red" className="h-7 px-3 text-[13px]">Critical</StatusPill>
          </div>
          <p className="mt-2 text-[15px] leading-7 text-[var(--md-text)]">
            Multideck cross-referenced the commercial invoice from Yong Hua Logistics with HS code <span className="font-medium text-[var(--md-ink)]">8517.62.00</span> and detected a required export licence for dual-use telecom equipment. The licence is missing from the document set we hold.
          </p>
        </div>
        <p className="text-[13px] text-[var(--md-text)]">raised 2h 14m ago</p>
      </div>
      <div className="mt-5 grid gap-3 md:ml-[68px] md:grid-cols-3">
        {[
          ["Request licence from shipper", "Drafts an email · 1 click send"],
          ["Mark as own goods", "No licence required if first-party"],
          ["Escalate to broker", "Notify Wei Chen, Shanghai"],
        ].map(([title, body], index) => (
          <button
            key={title}
            type="button"
            className={cn(
              "rounded-[var(--md-radius-lg)] bg-white/36 px-4 py-4 text-left shadow-[var(--md-shadow-line)] transition-all hover:bg-white/65",
              index === 0 && "shadow-[inset_0_0_0_1px_rgba(14,125,116,0.65),0_0_0_1px_rgba(14,125,116,0.08)]",
            )}
          >
            <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
            <p className="mt-2 text-[13px] text-[var(--md-text)]">{body}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

export function ShipmentResolutionChecklist() {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set(["Confirm hold reason"]))
  const items = [
    ["Confirm hold reason", "HS-code match flagged a missing CN export licence."],
    ["Request licence from shipper", "Send the prepared email to Yong Hua Logistics."],
    ["Attach licence to document set", "Upload and link the licence to MD-22455."],
    ["Re-submit customs entry", "Notify broker once the document set is complete."],
  ]

  function toggleItem(label: string) {
    const wasChecked = checkedItems.has(label)
    setCheckedItems((current) => {
      const next = new Set(current)
      if (wasChecked) next.delete(label)
      else next.add(label)
      return next
    })
    toast.success(wasChecked ? "Checklist item reopened" : "Checklist item saved", {
      description: label,
    })
  }

  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-[var(--md-ink)]">Resolution checklist</h2>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">Shared task list for clearing the customs hold.</p>
        </div>
        <StatusPill tone="amber">{checkedItems.size} of {items.length}</StatusPill>
      </div>
      <div className="px-5 pb-5">
        {items.map(([label, detail]) => {
          const checked = checkedItems.has(label)

          return (
            <button
              key={label}
              type="button"
              className="grid w-full grid-cols-[28px_1fr] gap-3 border-t border-[rgba(11,20,19,0.08)] py-3 text-left transition-all hover:bg-white/35"
              onClick={() => toggleItem(label)}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 place-items-center rounded-[var(--md-radius-sm)] bg-white shadow-[var(--md-shadow-line)]",
                  checked && "bg-[var(--md-accent)] shadow-[0_0_0_3px_rgba(14,125,116,0.12)]",
                )}
              >
                {checked ? <Check className="size-3.5 text-white" strokeWidth={1.8} /> : null}
              </span>
              <span>
                <span className={cn("block text-[14px] font-medium text-[var(--md-ink)]", checked && "text-[var(--md-text)] line-through")}>{label}</span>
                <span className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">{detail}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Surface>
  )
}

function DetailDataPanel({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[14px] font-medium text-[var(--md-text)]">{title}</h2>
        {meta ? <span className="text-[13px] font-medium text-[var(--md-text)]">{meta}</span> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </Surface>
  )
}

function CargoPanel() {
  return (
    <DetailDataPanel title="Cargo">
      {shipmentCargo.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[140px_1fr] gap-4 border-t border-[rgba(11,20,19,0.08)] py-3">
          <p className="text-[13px] text-[var(--md-text)]">{label}</p>
          <p className="text-right text-[14px] font-medium text-[var(--md-ink)]">{value}</p>
        </div>
      ))}
    </DetailDataPanel>
  )
}

function DocumentsPanel() {
  return (
    <DetailDataPanel title="Documents" meta="6 of 7 parsed">
      {shipmentDocuments.map(([name, file, confidence]) => (
        <div key={name} className="grid grid-cols-[minmax(132px,1fr)_104px_68px] items-center gap-3 border-t border-[rgba(11,20,19,0.08)] py-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{name}</p>
            <p className="truncate text-[12px] text-[var(--md-text)]">{file}</p>
          </div>
          <p className="text-[13px] text-[var(--md-text)]">{confidence}</p>
          <StatusPill tone="green" className="justify-center px-2">parsed</StatusPill>
        </div>
      ))}
    </DetailDataPanel>
  )
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: StatusTone
}) {
  return (
    <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
      <p className="text-[13px] font-medium text-[var(--md-text)]">{label}</p>
      <strong
        className="mt-2 block text-[28px] font-medium leading-none tracking-normal text-[var(--md-ink)]"
        style={{ color: tone === "neutral" ? undefined : toneToVar(tone) }}
      >
        {value}
      </strong>
    </Surface>
  )
}

function OverviewPage() {
  return (
    <>
      <ShipmentArrivalCard />
      <div className="mt-5">
        <ShipmentExceptionPanel />
      </div>
      <div className="mt-5">
        <ShipmentResolutionChecklist />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <CargoPanel />
        <DocumentsPanel />
      </div>
    </>
  )
}

function DocumentsPage() {
  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStat label="Parsed documents" value="6/7" tone="green" />
          <MiniStat label="Average confidence" value="97%" tone="teal" />
          <MiniStat label="Missing item" value="1" tone="red" />
        </div>

        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Document set</h2>
              <p className="mt-1 text-[13px] text-[var(--md-text)]">Extraction status, source files, and action state for MD-22455.</p>
            </div>
            <Button variant="ghost" className="h-9 rounded-[var(--md-radius-md)] bg-white/55 px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]">
              <Paperclip data-icon="inline-start" strokeWidth={1.2} />
              Attach document
            </Button>
          </div>
          <div className="px-5 pb-5">
            {[...shipmentDocuments, ["CN export licence", "missing", "required"]].map(([name, file, confidence]) => {
              const missing = file === "missing"

              return (
                <div key={name} className="grid gap-3 border-t border-[rgba(11,20,19,0.08)] py-4 md:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_110px_92px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{name}</p>
                    <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">{file}</p>
                  </div>
                  <p className="text-[13px] text-[var(--md-text)]">{missing ? "Requested from Yong Hua Logistics" : confidence}</p>
                  <StatusPill tone={missing ? "red" : "green"} className="w-fit justify-center px-3">
                    {missing ? "missing" : "parsed"}
                  </StatusPill>
                  <Button variant="ghost" className="h-8 rounded-[var(--md-radius-md)] bg-white/35 px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)]">
                    {missing ? "Request" : "Open"}
                  </Button>
                </div>
              )
            })}
          </div>
        </Surface>
      </div>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]">
          <FileText className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Extraction summary</h2>
        <p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">
          Commercial invoice, packing list, BoL, certificate of origin, and insurance certificate are parsed. The licence is the only blocker for customs resubmission.
        </p>
      </Surface>
    </div>
  )
}

function CustomsPage() {
  return (
    <div className="flex flex-col gap-5">
      <ShipmentExceptionPanel />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Customs workstream</h2>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">Every open customs dependency for MD-22455.</p>
          </div>
          <div className="px-5 pb-5">
            {customsEntries.map(([title, detail, state, tone]) => (
              <div key={title} className="grid gap-3 border-t border-[rgba(11,20,19,0.08)] py-4 md:grid-cols-[minmax(160px,220px)_1fr_auto] md:items-center">
                <div>
                  <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p>
                </div>
                <div className="h-2 rounded-full bg-[rgba(90,103,100,0.1)]">
                  <div className="h-2 rounded-full" style={{ width: tone === "green" ? "78%" : tone === "amber" ? "48%" : "26%", background: toneToVar(tone) }} />
                </div>
                <StatusPill tone={tone}>{state}</StatusPill>
              </div>
            ))}
          </div>
        </Surface>

        <ShipmentResolutionChecklist />
      </div>
    </div>
  )
}

function CostsPage() {
  const total = costRows.reduce((sum, [, , value]) => sum + Number(value.replace(/[^\d.]/g, "")), 0)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Cost breakdown</h2>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">Current landed-cost view based on booking, documents, and hold risk.</p>
          </div>
          <StatusPill tone="amber">Demurrage watch</StatusPill>
        </div>
        <div className="px-5 pb-5">
          {costRows.map(([label, detail, amount]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_140px] gap-4 border-t border-[rgba(11,20,19,0.08)] py-4">
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{label}</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p>
              </div>
              <p className="text-right text-[14px] font-medium text-[var(--md-ink)]">{amount}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]">
          <CircleDollarSign className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Estimated total</h2>
        <strong className="mt-3 block text-[34px] font-medium leading-none text-[var(--md-ink)]">USD {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        <p className="mt-4 text-[14px] leading-6 text-[var(--md-text)]">The hold creates a small demurrage risk if the licence is not attached before free time closes.</p>
      </Surface>
    </div>
  )
}

function CommsPage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="px-5 py-4">
          <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Comms thread</h2>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">Operator, broker, shipper, and AI-prepared updates for the customs hold.</p>
        </div>
        <div className="px-5 pb-5">
          {commMessages.map(([sender, body, time]) => (
            <div key={`${sender}-${time}`} className="grid grid-cols-[42px_1fr_auto] gap-3 border-t border-[rgba(11,20,19,0.08)] py-4">
              <span className="grid size-9 place-items-center rounded-full bg-[rgba(14,125,116,0.1)] text-[12px] font-medium text-[var(--md-accent)]">
                {sender.split(" ").map((part) => part[0]).join("").slice(0, 2)}
              </span>
              <div>
                <p className="text-[14px] font-medium text-[var(--md-ink)]">{sender}</p>
                <p className="mt-1 text-[14px] leading-6 text-[var(--md-text)]">{body}</p>
              </div>
              <span className="text-[12px] text-[var(--md-subtle)]">{time}</span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <div className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[rgba(74,125,156,0.12)] text-[var(--md-blue)]">
          <MessageCircle className="size-5" strokeWidth={1.4} />
        </div>
        <h2 className="mt-4 text-[16px] font-medium text-[var(--md-ink)]">Prepared update</h2>
        <p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">
          Yong Hua Logistics needs to send the CN export licence for HS code 8517.62.00. Once attached, Wei Chen can resubmit the CDS entry.
        </p>
        <Button
          className="mt-5 h-10 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[13px] font-medium text-white hover:bg-[#0b6f67]"
          onClick={() =>
            toast.success("Prepared email sent", {
              description: "Yong Hua Logistics has the licence request for MD-22455.",
            })
          }
        >
          Send prepared email
        </Button>
      </Surface>
    </div>
  )
}

function TimelinePage() {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="px-5 py-4">
          <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Shipment timeline</h2>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">Chronological event history for MD-22455.</p>
        </div>
        <div className="px-5 pb-5">
          {shipmentTimeline.map((item) => (
            <div key={`${item.time}-${item.text}`} className="grid grid-cols-[18px_140px_1fr] gap-4 border-t border-[rgba(11,20,19,0.08)] py-5">
              <span className="mt-1.5 size-2.5 rounded-full" style={{ background: toneToVar(item.tone) }} />
              <p className="text-[13px] font-medium text-[var(--md-text)]">{item.time}</p>
              <p className="text-[15px] leading-6 text-[var(--md-ink)]">{item.text}</p>
            </div>
          ))}
        </div>
      </Surface>

      <Surface padding="md" className="h-fit rounded-[var(--md-radius-xl)]">
        <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Current model</h2>
        <p className="mt-1 text-[13px] text-[var(--md-text)]">Predicted arrival · Long Beach, USLGB</p>
        <strong className="mt-4 block text-[34px] font-medium leading-none tracking-normal text-[var(--md-ink)]">Jun 09, 03:00 PT</strong>
        <p className="mt-3 text-[14px] font-medium text-[var(--md-amber)]">+ 2 days 4 hrs</p>
        <div className="mt-6 space-y-3">
          {shipmentMilestones.slice(0, 5).map((milestone) => (
            <div key={milestone.label} className="flex items-center justify-between gap-4 rounded-[var(--md-radius-lg)] bg-white/42 px-3 py-3 shadow-[var(--md-shadow-line)]">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "size-2.5 rounded-full bg-[var(--md-bg)] shadow-[inset_0_0_0_1.5px_var(--md-text)]",
                    milestone.state === "done" && "bg-[var(--md-green)] shadow-none",
                    milestone.state === "current" && "bg-[var(--md-red)] shadow-[0_0_0_5px_rgba(209,78,78,0.12)]",
                  )}
                />
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{milestone.label}</span>
              </div>
              <span className="text-[12px] text-[var(--md-text)]">{milestone.detail}</span>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  )
}

function ShipmentDetailTabPage({ activeTab }: { activeTab: ShipmentDetailTab }) {
  if (activeTab === "Documents") return <DocumentsPage />
  if (activeTab === "Customs") return <CustomsPage />
  if (activeTab === "Costs") return <CostsPage />
  if (activeTab === "Comms") return <CommsPage />
  if (activeTab === "Timeline") return <TimelinePage />
  return <OverviewPage />
}

export function ShipmentAskPanel({
  collapsed = false,
  onCollapsedChange,
  className,
}: {
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState(askStarterMessages)

  function askQuestion(question: string) {
    const trimmed = question.trim()
    if (!trimmed) return
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      {
        role: "assistant",
        text: "For MD-22455, the key blocker is still the missing CN export licence. Costs are stable except demurrage risk if this crosses the free-time window.",
      },
    ])
    setDraft("")
  }

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Open shipment chat"
        className={cn(
          "relative grid size-14 place-items-center overflow-visible rounded-full bg-[var(--md-accent)] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.34),0_16px_38px_rgba(14,125,116,0.32),0_0_30px_rgba(14,125,116,0.28)] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] hover:bg-[#0b6f67]",
          className,
        )}
        onClick={() => onCollapsedChange?.(false)}
      >
        <span className="absolute inset-[-9px] -z-10 rounded-full bg-[rgba(14,125,116,0.18)] blur-md" />
        <Sparkles className="size-5" strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <aside className={cn("flex h-full min-h-[560px] flex-col overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] shadow-[var(--md-shadow-soft)]", className)}>
      <div className="flex items-center justify-between gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.08)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--md-accent)] text-white">
            <Sparkles className="size-4" strokeWidth={1.4} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium text-[var(--md-ink)]">Ask about this shipment</h2>
            <p className="mt-0.5 truncate text-[12px] text-[var(--md-text)]">MD-22455 · Shanghai to Long Beach</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Collapse shipment chat"
          className="size-8 rounded-[var(--md-radius-md)] bg-white/45 shadow-[var(--md-shadow-line)]"
          onClick={() => onCollapsedChange?.(true)}
        >
          <PanelRightClose data-icon="inline-start" strokeWidth={1.3} />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5 md-scrollbar">
        {messages.map((message, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={cn(
              "max-w-[92%] rounded-[var(--md-radius-lg)] px-4 py-3 text-[13px] leading-6 shadow-[var(--md-shadow-line)]",
              message.role === "assistant"
                ? "bg-white/62 text-[var(--md-ink)]"
                : "ml-auto bg-[var(--md-accent)] text-white shadow-[0_0_0_1px_rgba(14,125,116,0.06),0_12px_24px_rgba(14,125,116,0.16)]",
            )}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 pt-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.08)]">
        <div className="mb-3 flex flex-wrap gap-2">
          {askSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full bg-white/45 px-3 py-1.5 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-all hover:bg-white/75 hover:text-[var(--md-ink)]"
              onClick={() => askQuestion(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            askQuestion(draft)
          }}
        >
          <textarea
            aria-label="Ask about shipment"
            className="min-h-[46px] flex-1 resize-none rounded-[var(--md-radius-lg)] bg-white/65 px-3 py-3 text-[13px] leading-5 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none placeholder:text-[var(--md-subtle)]"
            placeholder="Ask about costs, customs, ETA..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" size="icon" className="size-[46px] rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-white hover:bg-[#0b6f67]">
            <SendHorizontal data-icon="inline-start" strokeWidth={1.4} />
          </Button>
        </form>
      </div>
    </aside>
  )
}

function FloatingShipmentAskPanel({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}) {
  return (
    <div
      className={cn(
        "fixed right-6 z-30 hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] xl:block",
        collapsed ? "top-6 size-14" : "bottom-6 top-6 w-[368px]",
      )}
    >
      <ShipmentAskPanel collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
    </div>
  )
}

export function ShipmentDetailWorkspace({ navigate }: { navigate: (path: string) => void }) {
  const [activeTab, setActiveTab] = useState<ShipmentDetailTab>("Overview")
  const [chatCollapsed, setChatCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="flex min-h-screen">
        <DetailSideRail navigate={navigate} />
        <main className={cn("min-w-0 flex-1 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", chatCollapsed ? "xl:pr-[96px]" : "xl:pr-[408px]")}>
          <ShipmentDetailHeader activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="px-6 py-7 md:px-9">
            <ShipmentDetailTabPage activeTab={activeTab} />
          </div>
          <div className="px-6 pb-7 md:px-9 xl:hidden">
            <ShipmentAskPanel />
          </div>
        </main>
      </div>
      <FloatingShipmentAskPanel collapsed={chatCollapsed} onCollapsedChange={setChatCollapsed} />
    </div>
  )
}

export function ShipmentEmptyMode({ mode }: { mode: ShipmentViewMode }) {
  return (
    <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
      <div className="grid min-h-[320px] place-items-center text-center">
        <div>
          <Boxes className="mx-auto size-8 text-[var(--md-accent)]" strokeWidth={1.2} />
          <h2 className="mt-4 text-[18px] font-medium text-[var(--md-ink)]">{mode} view</h2>
          <p className="mt-2 max-w-[420px] text-[14px] leading-6 text-[var(--md-text)]">
            Placeholder view for this prototype. The table view is wired for the main shipment operations flow.
          </p>
        </div>
      </div>
    </Surface>
  )
}
