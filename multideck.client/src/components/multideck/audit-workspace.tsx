import { useEffect, useId, useMemo, useState } from "react"
import {
  ArrowRightLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  FilePlus2,
  FilterX,
  ListTree,
  MailCheck,
  MapPinned,
  RotateCcw,
  SearchX,
  ShieldCheck,
  Ship,
  UserRound,
  X,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { AuditTimeline, type AuditTimelineEvent } from "@/components/multideck/audit-timeline"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { MultideckDateTimePicker } from "@/components/multideck/date-picker"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type QuoteAuditView = "summary" | "detailed"

export type QuoteAuditEventType =
  | "record"
  | "pricing"
  | "routing"
  | "document"
  | "approval"
  | "communication"
  | "booking"

export type QuoteAuditRecord = {
  id: string
  timestamp: string
  actor: string
  actorRole?: string
  sender?: string
  action: string
  detail: string
  eventType: QuoteAuditEventType
  field: string
  oldValue: string
  newValue: string
  source: string
  state: AuditTimelineEvent["state"]
}

export type QuoteAuditFilters = {
  from: string
  to: string
  actor: string
  eventType: QuoteAuditEventType | "all"
}

export type AuditWorkspaceProps = {
  records?: readonly QuoteAuditRecord[]
  title?: string
  description?: string
  defaultView?: QuoteAuditView
  view?: QuoteAuditView
  onViewChange?: (view: QuoteAuditView) => void
  className?: string
}

export const QUOTE_AUDIT_SAMPLE_DATA = [
  {
    id: "quote-created",
    timestamp: "2026-07-22T08:42:17+01:00",
    actor: "Maya Stone",
    actorRole: "Sales executive",
    action: "Quote created",
    detail: "Spot quote SPQ-74218 was opened for Atlas Homeware Ltd.",
    eventType: "record",
    field: "Quote record",
    oldValue: "Not created",
    newValue: "SPQ-74218",
    source: "Quote workspace",
    state: "completed",
  },
  {
    id: "customer-assigned",
    timestamp: "2026-07-22T08:45:03+01:00",
    actor: "Maya Stone",
    actorRole: "Sales executive",
    action: "Customer assigned",
    detail: "The quote was linked to the approved customer account.",
    eventType: "record",
    field: "Customer",
    oldValue: "Not selected",
    newValue: "ATL001 · Atlas Homeware Ltd",
    source: "Quote details",
    state: "completed",
  },
  {
    id: "routing-updated",
    timestamp: "2026-07-22T08:54:26+01:00",
    actor: "Theo Grant",
    actorRole: "Operations coordinator",
    action: "Destination routing updated",
    detail: "The final delivery point was changed after the customer confirmed the consignee address.",
    eventType: "routing",
    field: "Final destination",
    oldValue: "Hamburg, DE",
    newValue: "Bremen, DE",
    source: "Quote routing",
    state: "completed",
  },
  {
    id: "charge-cost-updated",
    timestamp: "2026-07-22T09:18:44+01:00",
    actor: "Theo Grant",
    actorRole: "Operations coordinator",
    action: "Ocean freight cost updated",
    detail: "The supplier rate was entered in euros from the latest rate confirmation.",
    eventType: "pricing",
    field: "OFRT · Cost",
    oldValue: "GBP 1,240.00",
    newValue: "EUR 1,455.30",
    source: "Quote charges",
    state: "completed",
  },
  {
    id: "margin-recalculated",
    timestamp: "2026-07-22T09:18:45+01:00",
    actor: "Multideck",
    actorRole: "Automatic calculation",
    action: "Quote margin recalculated",
    detail: "Base values were refreshed using the active rate of exchange.",
    eventType: "pricing",
    field: "Gross profit margin",
    oldValue: "14.92%",
    newValue: "16.18%",
    source: "Pricing engine",
    state: "completed",
  },
  {
    id: "supplier-rate-added",
    timestamp: "2026-07-22T09:31:02+01:00",
    actor: "Maya Stone",
    actorRole: "Sales executive",
    sender: "rates@oceangate.example",
    action: "Supplier rate confirmation added",
    detail: "The supplier email attachment was saved against the quote.",
    eventType: "document",
    field: "Supporting document",
    oldValue: "No document",
    newValue: "OceanGate rate confirmation.pdf",
    source: "Connected inbox",
    state: "completed",
  },
  {
    id: "quote-issued",
    timestamp: "2026-07-22T09:47:11+01:00",
    actor: "Maya Stone",
    actorRole: "Sales executive",
    sender: "maya.stone@multideck.example",
    action: "Quote issued to customer",
    detail: "Revision 2 was emailed to the primary customer contact.",
    eventType: "communication",
    field: "Quote status",
    oldValue: "Draft",
    newValue: "Issued",
    source: "Quote email",
    state: "completed",
  },
  {
    id: "approval-requested",
    timestamp: "2026-07-22T10:02:33+01:00",
    actor: "Maya Stone",
    actorRole: "Sales executive",
    action: "Commercial approval requested",
    detail: "The current margin and customer terms were sent to the commercial team for review.",
    eventType: "approval",
    field: "Approval status",
    oldValue: "Not requested",
    newValue: "In review",
    source: "Approval workflow",
    state: "current",
  },
] as const satisfies readonly QuoteAuditRecord[]

const eventTypeLabels: Record<QuoteAuditEventType, string> = {
  record: "Record",
  pricing: "Pricing",
  routing: "Routing",
  document: "Document",
  approval: "Approval",
  communication: "Communication",
  booking: "Booking",
}

const timelineKinds: Record<QuoteAuditEventType, AuditTimelineEvent["kind"]> = {
  record: "created",
  pricing: "pricing",
  routing: "booking",
  document: "created",
  approval: "approval",
  communication: "approval",
  booking: "booking",
}

const eventTypeIcons: Record<QuoteAuditEventType, LucideIcon> = {
  record: FilePlus2,
  pricing: CircleDollarSign,
  routing: MapPinned,
  document: FileClock,
  approval: ShieldCheck,
  communication: MailCheck,
  booking: Ship,
}

const eventTypeClasses: Record<QuoteAuditEventType, string> = {
  record: "bg-[rgba(90,103,100,0.08)] text-[var(--md-text)] shadow-[0_0_0_1px_rgba(90,103,100,0.08)]",
  pricing: "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[0_0_0_1px_var(--md-accent-a10)]",
  routing: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)] shadow-[0_0_0_1px_rgba(74,125,156,0.1)]",
  document: "bg-[rgba(90,103,100,0.08)] text-[var(--md-text)] shadow-[0_0_0_1px_rgba(90,103,100,0.08)]",
  approval: "bg-[rgba(221,138,43,0.1)] text-[var(--md-amber)] shadow-[0_0_0_1px_rgba(221,138,43,0.1)]",
  communication: "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[0_0_0_1px_var(--md-accent-a10)]",
  booking: "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)] shadow-[0_0_0_1px_rgba(74,125,156,0.1)]",
}

const emptyFilters: QuoteAuditFilters = {
  from: "",
  to: "",
  actor: "all",
  eventType: "all",
}

const auditFilterControlClass = "!h-10 text-[12px]"

function parseFilterBoundary(value: string, includeMinuteEnd = false) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return timestamp + (includeMinuteEnd && value.length === 16 ? 59_999 : 0)
}

function formatDateTime(timestamp: string, language: string, includeSeconds = false) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp

  return new Intl.DateTimeFormat(language, includeSeconds
    ? {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }
    : {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
}

function toSummaryEvent(record: QuoteAuditRecord, language: string): AuditTimelineEvent {
  const date = new Date(record.timestamp)
  const validDate = !Number.isNaN(date.getTime())

  return {
    id: record.id,
    title: record.action,
    detail: record.detail,
    date: validDate
      ? new Intl.DateTimeFormat(language, { year: "numeric", month: "short", day: "numeric" }).format(date)
      : record.timestamp,
    time: validDate
      ? new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(date)
      : undefined,
    actor: record.actor,
    source: record.source,
    state: record.state,
    kind: timelineKinds[record.eventType],
  }
}

function AuditEmptyState({ onReset, hasFilters }: { onReset: () => void; hasFilters: boolean }) {
  const { t } = useLanguage()

  return (
    <Surface
      padding="lg"
      className="grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)] text-center"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-sm">
        <span className="mx-auto grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
          {hasFilters ? <SearchX className="size-5" strokeWidth={1.4} /> : <FileClock className="size-5" strokeWidth={1.4} />}
        </span>
        <h3 className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">
          {t(hasFilters ? "No audit events match these filters" : "No audit events yet")}
        </h3>
        <p className="mt-1.5 text-[12px] leading-5 text-[var(--md-text)]">
          {t(hasFilters
            ? "Adjust the date, actor, or event type to widen the audit history."
            : "Changes to this quote will appear here with the person, source, and exact time.")}
        </p>
        {hasFilters ? (
          <Button type="button" variant="outline" className="mt-4" onClick={onReset}>
            <RotateCcw className="size-3.5" strokeWidth={1.5} />
            {t("Reset filters")}
          </Button>
        ) : null}
      </div>
    </Surface>
  )
}

function DetailedAuditTable({ records }: { records: readonly QuoteAuditRecord[] }) {
  const { direction, language, t } = useLanguage()
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const tableRecords = useMemo(() => [...records], [records])
  const selectedRecord = tableRecords.find((record) => record.id === selectedRecordId) ?? null

  useEffect(() => {
    if (selectedRecordId && !records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(null)
    }
  }, [records, selectedRecordId])

  const columns = useMemo<DataTableColumn<QuoteAuditRecord>[]>(() => [
    {
      id: "timestamp",
      label: "Date and time",
      width: 190,
      minWidth: 176,
      maxWidth: 230,
      canHide: false,
      resizable: true,
      sortValue: (record) => new Date(record.timestamp).getTime(),
      cell: (record) => (
        <time
          dateTime={record.timestamp}
          dir="auto"
          data-i18n-skip
          className="font-medium tabular-nums text-[var(--md-ink)]"
        >
          {formatDateTime(record.timestamp, language, true)}
        </time>
      ),
    },
    {
      id: "event",
      label: "Event",
      width: 300,
      minWidth: 240,
      maxWidth: 440,
      resizable: true,
      sortValue: (record) => record.action,
      cell: (record) => {
        const Icon = record.actor === "Multideck" ? Bot : eventTypeIcons[record.eventType]
        return (
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]",
              record.state === "current" ? "text-[var(--md-amber)]" : "text-[var(--md-accent)]",
            )}>
              <Icon className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-[var(--md-ink)]">{t(record.action)}</span>
              <span className="mt-0.5 block truncate text-[10px] text-[var(--md-subtle)]">{t(record.detail)}</span>
            </span>
          </div>
        )
      },
    },
    {
      id: "eventType",
      label: "Event type",
      width: 128,
      minWidth: 112,
      maxWidth: 170,
      resizable: true,
      sortValue: (record) => t(eventTypeLabels[record.eventType]),
      cell: (record) => (
        <span className={cn(
          "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium",
          eventTypeClasses[record.eventType],
        )}>
          {t(eventTypeLabels[record.eventType])}
        </span>
      ),
    },
    {
      id: "field",
      label: "Field",
      width: 170,
      minWidth: 130,
      maxWidth: 280,
      resizable: true,
      sortValue: (record) => record.field,
      cell: (record) => <span className="block truncate font-medium text-[var(--md-text)]">{t(record.field)}</span>,
    },
    {
      id: "change",
      label: "Change",
      width: 250,
      minWidth: 200,
      maxWidth: 380,
      resizable: true,
      sortValue: (record) => record.newValue,
      cell: (record) => (
        <div className="flex min-w-0 items-center gap-1.5 text-[10.5px]">
          <span className="min-w-0 flex-1 truncate text-[var(--md-subtle)]">{t(record.oldValue)}</span>
          <ArrowRightLeft className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--md-ink)]">{t(record.newValue)}</span>
        </div>
      ),
    },
    {
      id: "actor",
      label: "Actor or sender",
      width: 210,
      minWidth: 170,
      maxWidth: 300,
      resizable: true,
      sortValue: (record) => record.actor,
      cell: (record) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-[var(--md-ink)]">{t(record.actor)}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[var(--md-subtle)]" dir="auto">
            {record.sender ? record.sender : record.actorRole ? t(record.actorRole) : "—"}
          </span>
        </span>
      ),
    },
    {
      id: "source",
      label: "Source",
      kind: "attribute",
      width: 170,
      minWidth: 140,
      maxWidth: 260,
      resizable: true,
      sortValue: (record) => record.source,
      cell: (record) => <span className="block truncate text-[var(--md-text)]">{t(record.source)}</span>,
    },
  ], [language, t])

  return (
    <>
      <DataTable
        ariaLabel="Detailed audit events table"
        columnsButtonLabel="Manage audit table columns"
        columns={columns}
        rows={tableRecords}
        getRowKey={(record) => record.id}
        storageKey="quote-detailed-audit-log"
        selectedRowKey={selectedRecordId}
        onRowClick={(record) => setSelectedRecordId(record.id)}
        rowClassName={(record) => record.state === "current" ? "[&_td]:bg-[rgba(221,138,43,0.035)]" : ""}
        toolbarOptions={(
          <span className="hidden truncate text-[10px] text-[var(--md-subtle)] lg:block">
            {t("Select a row to inspect the complete audit event.")}
          </span>
        )}
        className="rounded-[var(--md-radius-xl)] !bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)] [&_th]:!bg-[var(--md-surface)] [&_td]:!bg-[var(--md-surface)] [&_tr[data-state=selected]_td]:!bg-[var(--md-selected-bg)]"
        tableClassName="text-[11px] [&_th]:h-9 [&_td]:h-12 [&_td]:px-3 [&_td]:py-1.5"
      />

      <Sheet open={selectedRecord !== null} onOpenChange={(open) => !open && setSelectedRecordId(null)}>
        {selectedRecord ? (
          <SheetContent
            side={direction === "rtl" ? "left" : "right"}
            showCloseButton={false}
            dir={direction}
            aria-label={t("Selected audit event")}
            className="max-w-[calc(100vw-16px)] gap-0 overflow-hidden bg-[var(--md-surface)] p-0 data-[side=left]:w-[calc(100vw-16px)] data-[side=right]:w-[calc(100vw-16px)] sm:max-w-[440px] sm:data-[side=left]:w-[440px] sm:data-[side=right]:w-[440px]"
          >
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("Close event details")}
                className="absolute end-3 top-3 z-10 rounded-[var(--md-radius-md)]"
              >
                <X className="size-3.5" strokeWidth={1.4} />
              </Button>
            </SheetClose>

            <SheetHeader className="gap-3 bg-[var(--md-surface-soft)] px-5 pb-5 pt-5 pe-12 shadow-[inset_0_-1px_0_var(--md-line)]">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium",
                  eventTypeClasses[selectedRecord.eventType],
                )}>
                  {t(eventTypeLabels[selectedRecord.eventType])}
                </span>
                <span className="text-[10px] tabular-nums text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
                  {selectedRecord.id}
                </span>
              </div>
              <div>
                <SheetTitle className="text-[16px] leading-6 text-[var(--md-ink)]">{t(selectedRecord.action)}</SheetTitle>
                <SheetDescription className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">
                  {t(selectedRecord.detail)}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md-scrollbar">
              <div className="flex items-start gap-2.5 pb-4">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                <div>
                  <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("Exact time")}</p>
                  <time dateTime={selectedRecord.timestamp} data-i18n-skip dir="auto" className="mt-1 block text-[11.5px] font-medium tabular-nums text-[var(--md-ink)]">
                    {formatDateTime(selectedRecord.timestamp, language, true)}
                  </time>
                </div>
              </div>

              <dl className="divide-y divide-[var(--md-line)] shadow-[inset_0_1px_0_var(--md-line),inset_0_-1px_0_var(--md-line)]">
                {([
                  ["Field", selectedRecord.field],
                  ["Actor", selectedRecord.actor],
                  ["Role", selectedRecord.actorRole ?? "—"],
                  ["Sender", selectedRecord.sender ?? "—"],
                  ["Source", selectedRecord.source],
                ] as const).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-3">
                    <dt className="text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</dt>
                    <dd className="min-w-0 break-words text-[11.5px] font-medium text-[var(--md-ink)]" dir="auto">{t(value)}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-5">
                <p className="text-[10px] font-medium text-[var(--md-subtle)]">{t("Recorded change")}</p>
                <div className="mt-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
                  <div>
                    <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("Previous value")}</p>
                    <p className="mt-1 break-words text-[12px] text-[var(--md-text)]" dir="auto">{t(selectedRecord.oldValue)}</p>
                  </div>
                  <ArrowRightLeft className="my-3 size-3.5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                  <div>
                    <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("New value")}</p>
                    <p className="mt-1 break-words text-[12px] font-medium text-[var(--md-ink)]" dir="auto">{t(selectedRecord.newValue)}</p>
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  )
}

export function AuditWorkspace({
  records = QUOTE_AUDIT_SAMPLE_DATA,
  title = "Quote audit",
  description = "Review the operational summary or inspect every recorded change.",
  defaultView = "summary",
  view,
  onViewChange,
  className,
}: AuditWorkspaceProps) {
  const { language, t } = useLanguage()
  const [internalView, setInternalView] = useState<QuoteAuditView>(defaultView)
  const [filters, setFilters] = useState<QuoteAuditFilters>(emptyFilters)
  const filterId = useId()
  const activeView = view ?? internalView

  const actorOptions = useMemo(() => {
    const values = new Set<string>()
    records.forEach((record) => {
      values.add(record.actor)
      if (record.sender) values.add(record.sender)
    })
    return [...values].sort((a, b) => a.localeCompare(b, language))
  }, [language, records])

  const eventTypeOptions = useMemo(() => {
    const values = new Set<QuoteAuditEventType>()
    records.forEach((record) => values.add(record.eventType))
    return [...values].sort((a, b) => t(eventTypeLabels[a]).localeCompare(t(eventTypeLabels[b]), language))
  }, [language, records, t])

  const filteredRecords = useMemo(() => {
    const from = parseFilterBoundary(filters.from)
    const to = parseFilterBoundary(filters.to, true)

    return records.filter((record) => {
      const timestamp = new Date(record.timestamp).getTime()
      if (Number.isNaN(timestamp)) return false
      if (from !== null && timestamp < from) return false
      if (to !== null && timestamp > to) return false
      if (filters.actor !== "all" && record.actor !== filters.actor && record.sender !== filters.actor) return false
      if (filters.eventType !== "all" && record.eventType !== filters.eventType) return false
      return true
    })
  }, [filters, records])

  const summaryEvents = useMemo(
    () => [...filteredRecords]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((record) => toSummaryEvent(record, language)),
    [filteredRecords, language],
  )

  const detailedRecords = useMemo(
    () => [...filteredRecords].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [filteredRecords],
  )

  const hasFilters = filters.from !== "" || filters.to !== "" || filters.actor !== "all" || filters.eventType !== "all"

  const updateView = (nextView: QuoteAuditView) => {
    if (view === undefined) setInternalView(nextView)
    onViewChange?.(nextView)
  }

  const resetFilters = () => setFilters(emptyFilters)

  return (
    <div className={cn("min-w-0 space-y-[var(--md-page-stack-gap)]", className)}>
      <Surface padding="md" className="rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeader title={t(title)} meta={t(description)} className="min-w-0 flex-1" />
          <SegmentedControl
            options={["summary", "detailed"] as const}
            value={activeView}
            onChange={updateView}
            ariaLabel={t("Audit view")}
            className="w-full self-start sm:w-auto"
            renderOption={(option) => (
              <>
                {option === "summary"
                  ? <CheckCircle2 className="size-3.5" strokeWidth={1.4} />
                  : <ListTree className="size-3.5" strokeWidth={1.4} />}
                {t(option === "summary" ? "Summary" : "Detailed log")}
              </>
            )}
          />
        </div>

        <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto] xl:items-end">
            <div className="grid min-w-0 gap-1.5">
              <span className="text-[10.5px] font-medium text-[var(--md-text)]">{t("From date and time")}</span>
              <MultideckDateTimePicker
                value={filters.from}
                max={filters.to || undefined}
                onChange={(from) => setFilters((current) => ({ ...current, from }))}
                placeholder="From date"
                title="From date and time"
                description="Pick the start of the audit period."
                defaultTime="00:00"
                triggerClassName={auditFilterControlClass}
                timeClassName={auditFilterControlClass}
              />
            </div>

            <div className="grid min-w-0 gap-1.5">
              <span className="text-[10.5px] font-medium text-[var(--md-text)]">{t("To date and time")}</span>
              <MultideckDateTimePicker
                value={filters.to}
                min={filters.from || undefined}
                onChange={(to) => setFilters((current) => ({ ...current, to }))}
                placeholder="To date"
                title="To date and time"
                description="Pick the end of the audit period."
                defaultTime="23:59"
                triggerClassName={auditFilterControlClass}
                timeClassName={auditFilterControlClass}
              />
            </div>

            <div className="grid min-w-0 gap-1.5">
              <label htmlFor={`${filterId}-actor`} className="text-[10.5px] font-medium text-[var(--md-text)]">{t("Actor or sender")}</label>
              <Select value={filters.actor} onValueChange={(actor) => setFilters((current) => ({ ...current, actor }))}>
                <SelectTrigger id={`${filterId}-actor`} className={cn(auditFilterControlClass, "w-full min-w-0")} aria-label={t("Filter by actor or sender")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All people and senders")}</SelectItem>
                  {actorOptions.map((actor) => <SelectItem key={actor} value={actor} dir="auto">{t(actor)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-0 gap-1.5">
              <label htmlFor={`${filterId}-event-type`} className="text-[10.5px] font-medium text-[var(--md-text)]">{t("Event type")}</label>
              <Select
                value={filters.eventType}
                onValueChange={(eventType) => setFilters((current) => ({ ...current, eventType: eventType as QuoteAuditFilters["eventType"] }))}
              >
                <SelectTrigger id={`${filterId}-event-type`} className={cn(auditFilterControlClass, "w-full min-w-0")} aria-label={t("Filter by event type")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All event types")}</SelectItem>
                  {eventTypeOptions.map((eventType) => (
                    <SelectItem key={eventType} value={eventType}>
                      {t(eventTypeLabels[eventType])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={resetFilters}
              disabled={!hasFilters}
              className={cn(auditFilterControlClass, "w-full justify-center xl:w-auto")}
            >
              <FilterX className="size-3.5" strokeWidth={1.4} />
              {t("Clear filters")}
            </Button>
          </div>

          <p className="mt-3 text-[10.5px] text-[var(--md-subtle)]" role="status" aria-live="polite">
            {t("Showing")} <span className="font-medium text-[var(--md-text)] tabular-nums">{filteredRecords.length}</span> {t("of")} <span className="font-medium text-[var(--md-text)] tabular-nums">{records.length}</span> {t("events")}
          </p>
        </div>
      </Surface>

      {filteredRecords.length === 0 ? (
        <AuditEmptyState onReset={resetFilters} hasFilters={hasFilters} />
      ) : activeView === "summary" ? (
        <AuditTimeline
          events={summaryEvents}
          title={t("Audit summary")}
          description={t("A clear operational history of changes, decisions, and current actions.")}
        />
      ) : (
        <DetailedAuditTable records={detailedRecords} />
      )}
    </div>
  )
}
