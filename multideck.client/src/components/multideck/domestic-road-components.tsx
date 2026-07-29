import { useEffect, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { ArrowUpRight, MapPin, Star, Truck } from "lucide-react"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import type { StatusTone } from "@/data/multideck-data"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"
import { useKanbanPointerDrag } from "@/lib/kanban-drag"

export type RoadJobStageId = "intake" | "ready" | "carrier" | "live" | "close"

export type RoadJobStage = {
  id: RoadJobStageId
  label: string
  helper: string
  count: number
  tone: StatusTone
}

export type DomesticRoadJob = {
  id: string
  bookingId: string
  owner: string
  office: string
  stage: RoadJobStageId
  customer: string
  reference: string
  collection: string
  delivery: string
  timing: string
  service: string
  carrier: string
  status: string
  tone: StatusTone
  margin: string
  blocker?: string
}

export const roadJobStages: RoadJobStage[] = [
  { id: "intake", label: "Intake", helper: "Capture and validate", count: 4, tone: "amber" },
  { id: "ready", label: "Ready to plan", helper: "Confirm service and carrier", count: 6, tone: "teal" },
  { id: "carrier", label: "Carrier confirmation", helper: "Get a vehicle commitment", count: 3, tone: "blue" },
  { id: "live", label: "Live movement", helper: "Monitor pickup and delivery", count: 8, tone: "green" },
  { id: "close", label: "Financial close", helper: "Check cost and raise invoice", count: 5, tone: "neutral" },
]

export const roadJobStageStatus: Record<RoadJobStageId, Pick<DomesticRoadJob, "status" | "tone">> = {
  intake: { status: "Needs planning", tone: "amber" },
  ready: { status: "Plan now", tone: "teal" },
  carrier: { status: "Confirmation due", tone: "blue" },
  live: { status: "On track", tone: "green" },
  close: { status: "Cost check due", tone: "neutral" },
}

export const domesticRoadJobs: DomesticRoadJob[] = [
  { id: "RD-10682", bookingId: "MD-22682", owner: "JL", office: "UK Distribution", stage: "intake", customer: "Jenkar", reference: "JK-PO-48216", collection: "Leicester, GB", delivery: "Bristol, GB", timing: "Collection date missing", service: "Pallet network", carrier: "Not assigned", status: "Needs planning date", tone: "amber", margin: "—", blocker: "Waiting for customer confirmation" },
  { id: "RD-10683", bookingId: "MD-22683", owner: "EM", office: "UK Distribution", stage: "intake", customer: "Jenkar", reference: "JK-PO-48228", collection: "Dartford, GB", delivery: "Manchester, GB", timing: "Tomorrow · 10:00–12:00", service: "LTL", carrier: "Not assigned", status: "Check dimensions", tone: "amber", margin: "—", blocker: "Pallet height not supplied" },
  { id: "RD-10676", bookingId: "MD-22676", owner: "EM", office: "UK Distribution", stage: "ready", customer: "Jenkar", reference: "JK-PO-48191", collection: "Birmingham, GB", delivery: "Glasgow, GB", timing: "Today · collection by 14:00", service: "Dedicated 7.5t", carrier: "Carrier shortlist ready", status: "Plan now", tone: "teal", margin: "18.4% est." },
  { id: "RD-10679", bookingId: "MD-22679", owner: "JL", office: "UK Distribution", stage: "ready", customer: "Jenkar", reference: "JK-PO-48203", collection: "Coventry, GB", delivery: "Leeds, GB", timing: "Tomorrow · delivery by 09:00", service: "Next-day pallet", carrier: "Carrier shortlist ready", status: "Plan now", tone: "teal", margin: "22.1% est." },
  { id: "RD-10671", bookingId: "MD-22671", owner: "WC", office: "UK Distribution", stage: "carrier", customer: "Jenkar", reference: "JK-PO-48172", collection: "Rugby, GB", delivery: "Exeter, GB", timing: "Today · collection 15:00–17:00", service: "Dedicated van", carrier: "Redline Transport", status: "Confirmation due 11:30", tone: "blue", margin: "20.7% est." },
  { id: "RD-10664", bookingId: "MD-22664", owner: "EM", office: "UK Distribution", stage: "live", customer: "Jenkar", reference: "JK-PO-48126", collection: "Milton Keynes, GB", delivery: "Newcastle, GB", timing: "Out for delivery · ETA 15:20", service: "Dedicated 18t", carrier: "Grove Haulage", status: "On track", tone: "green", margin: "19.6% est." },
  { id: "RD-10658", bookingId: "MD-22658", owner: "EM", office: "UK Distribution", stage: "close", customer: "Jenkar", reference: "JK-PO-48094", collection: "Derby, GB", delivery: "Cardiff, GB", timing: "Delivered yesterday · POD received", service: "Pallet network", carrier: "PalletLine", status: "Cost check due", tone: "neutral", margin: "16.8% est." },
]

export function DomesticJobStageRail({
  stages = roadJobStages,
  activeStage,
  onStageChange,
}: {
  stages?: readonly RoadJobStage[]
  activeStage: RoadJobStageId
  onStageChange: (stage: RoadJobStageId) => void
}) {
  const { t } = useLanguage()

  return (
    <nav aria-label={t("Road job stages")} className="grid w-full min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-5">
      {stages.map((stage) => {
        const active = stage.id === activeStage

        return (
          <button
            key={stage.id}
            type="button"
            aria-current={active ? "step" : undefined}
            onClick={() => onStageChange(stage.id)}
            className={cn(
              "group min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 text-start shadow-[var(--md-shadow-line)] transition-[transform,box-shadow,background] duration-200 hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]",
              active && "bg-[color-mix(in_srgb,var(--md-accent)_8%,var(--md-surface))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-accent)_28%,transparent),var(--md-shadow-soft)]",
            )}
          >
            <span className="block text-[13px] font-medium text-[var(--md-text)]">{t(stage.label)}</span>
            <strong
              className={cn("mt-2 block text-[30px] font-medium leading-none tabular-nums", stage.tone === "neutral" && "text-[var(--md-ink)]")}
              style={{ color: stage.tone === "neutral" ? undefined : toneToVar(stage.tone) }}
            >
              {stage.count}
            </strong>
          </button>
        )
      })}
    </nav>
  )
}

export function DomesticRoadKanbanBoard({
  jobs,
  favouriteIds,
  onOpenBooking,
  onToggleFavourite,
  onMoveJob,
}: {
  jobs: readonly DomesticRoadJob[]
  favouriteIds: Set<string>
  onOpenBooking?: (job: DomesticRoadJob) => void
  onToggleFavourite?: (job: DomesticRoadJob) => void
  onMoveJob?: (jobId: string, stage: RoadJobStageId, orderedJobs: DomesticRoadJob[]) => void
}) {
  const { t } = useLanguage()
  const [orderedJobs, setOrderedJobs] = useState(() => [...jobs])
  const columns = roadJobStages.map((stage) => ({
    id: stage.id,
    tasks: orderedJobs.filter((job) => job.stage === stage.id),
  }))
  const kanban = useKanbanPointerDrag({
    columns,
    getId: (job) => job.id,
    onCommit: ({ cardId, columnId, columns: committedColumns }) => {
      const destinationStage = columnId as RoadJobStageId
      const nextJobs = committedColumns.flatMap((column) => column.tasks.map((job) => (
        column.id === job.stage ? job : { ...job, stage: column.id as RoadJobStageId, ...roadJobStageStatus[column.id as RoadJobStageId] }
      )))
      setOrderedJobs(nextJobs)
      onMoveJob?.(cardId, destinationStage, nextJobs)
    },
    formatKeyboardAnnouncement: (job, columnId) => `${job.bookingId} ${t("moved to")} ${t(roadJobStages.find((stage) => stage.id === columnId)?.label ?? columnId)}`,
  })

  useEffect(() => setOrderedJobs([...jobs]), [jobs])

  return (
    <div ref={kanban.boardRef}>
      <div className="overflow-x-auto pb-2">
        <div className="grid w-full min-w-[1120px] grid-cols-[repeat(5,minmax(0,1fr))] gap-3" aria-label={t("Road job Kanban board")}>
          {kanban.previewColumns.map((column) => {
            const stage = roadJobStages.find((candidate) => candidate.id === column.id)
            if (!stage) return null
            return (
              <DomesticRoadKanbanLane
                key={stage.id}
                stage={stage}
                jobs={column.tasks}
                activeCardId={kanban.activeCardId}
                activeColumnId={kanban.activeColumnId}
                favouriteIds={favouriteIds}
                isClickSuppressed={kanban.isClickSuppressed}
                onOpenBooking={onOpenBooking}
                onToggleFavourite={onToggleFavourite}
                onPointerDown={kanban.handlePointerDown}
                onKeyDown={kanban.handleKeyDown}
              />
            )
          })}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{kanban.keyboardAnnouncement}</p>
      {kanban.activeTask && kanban.overlayStyle ? createPortal(
        <div className="md-kanban-drag-preview" style={kanban.overlayStyle}>
          <div className="md-kanban-drag-preview-card group">
            <DomesticRoadKanbanCardBody job={kanban.activeTask} favourite={favouriteIds.has(kanban.activeTask.bookingId)} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function DomesticRoadKanbanLane({
  stage,
  jobs,
  activeCardId,
  activeColumnId,
  favouriteIds,
  isClickSuppressed,
  onOpenBooking,
  onToggleFavourite,
  onPointerDown,
  onKeyDown,
}: {
  stage: RoadJobStage
  jobs: DomesticRoadJob[]
  activeCardId: string | null
  activeColumnId: string | null
  favouriteIds: Set<string>
  isClickSuppressed: () => boolean
  onOpenBooking?: (job: DomesticRoadJob) => void
  onToggleFavourite?: (job: DomesticRoadJob) => void
  onPointerDown: (event: PointerEvent<HTMLElement>, cardId: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, cardId: string) => boolean
}) {
  const { t } = useLanguage()
  return (
    <section
      className="md-kanban-column min-h-[330px]"
      data-column-id={stage.id}
      data-drop-target={activeCardId && activeColumnId === stage.id ? "true" : undefined}
      style={{ "--md-kanban-status-color": toneToVar(stage.tone) } as CSSProperties}
    >
      <header>
        <div className="min-w-0">
          <h2 className="truncate">{t(stage.label)}</h2>
          <p className="mt-0.5 truncate text-[11px] text-[var(--md-text)]">{t(stage.helper)}</p>
        </div>
        <strong className="tabular-nums" style={{ color: stage.tone === "neutral" ? undefined : toneToVar(stage.tone) }}>{jobs.length}</strong>
      </header>
      <div data-kanban-list>
        {jobs.map((job) => (
          <DomesticRoadKanbanCard
            key={job.id}
            job={job}
            favourite={favouriteIds.has(job.bookingId)}
            isDragging={activeCardId === job.id}
            isClickSuppressed={isClickSuppressed}
            onOpenBooking={onOpenBooking}
            onToggleFavourite={onToggleFavourite}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
          />
        ))}
        {jobs.length === 0 ? <p className="md-kanban-empty text-center">{t("Drop a job here")}</p> : null}
      </div>
    </section>
  )
}

function DomesticRoadKanbanCard({
  job,
  favourite,
  isDragging,
  isClickSuppressed,
  onOpenBooking,
  onToggleFavourite,
  onPointerDown,
  onKeyDown,
}: {
  job: DomesticRoadJob
  favourite: boolean
  isDragging: boolean
  isClickSuppressed: () => boolean
  onOpenBooking?: (job: DomesticRoadJob) => void
  onToggleFavourite?: (job: DomesticRoadJob) => void
  onPointerDown: (event: PointerEvent<HTMLElement>, cardId: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, cardId: string) => boolean
}) {
  const { t } = useLanguage()

  return (
    <article
      className="md-kanban-card group"
      data-kanban-card={job.id}
      data-task-id={job.id}
      data-kanban-dragging={isDragging ? "true" : undefined}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-kanban-action]")) return
        onPointerDown(event, job.id)
      }}
    >
      <button
        type="button"
        className="md-kanban-card__primary ps-8"
        aria-grabbed={isDragging}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        title={t("Drag job to another stage")}
        onClick={() => {
          if (!isClickSuppressed()) onOpenBooking?.(job)
        }}
        onKeyDown={(event) => onKeyDown(event, job.id)}
      >
        <DomesticRoadKanbanCardBody job={job} favourite={favourite} showFavouriteMark={false} />
      </button>
      <button
        type="button"
        data-kanban-action
        aria-label={t(favourite ? "Remove job from favourites" : "Add job to favourites")}
        aria-pressed={favourite}
        title={t(favourite ? "Remove from favourites" : "Add to favourites")}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onToggleFavourite?.(job)}
        className={cn("absolute start-3 top-3 grid size-6 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,box-shadow] duration-200 hover:bg-[var(--md-surface)] hover:text-[var(--md-amber)] hover:shadow-[var(--md-shadow-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(221,138,43,0.2)]", favourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[var(--md-shadow-line)]")}
      >
        <Star className={cn("size-3.5", favourite && "fill-current")} strokeWidth={1.35} />
      </button>
    </article>
  )
}

function DomesticRoadKanbanCardBody({
  job,
  favourite,
  showFavouriteMark = true,
}: {
  job: DomesticRoadJob
  favourite: boolean
  showFavouriteMark?: boolean
}) {
  const { t } = useLanguage()
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span dir="ltr" className="shrink-0 font-mono text-[11px] font-medium text-[var(--md-accent)]">{job.bookingId}</span>
        <StatusPill tone={job.tone} className="min-w-0 truncate">{t(job.status)}</StatusPill>
      </span>
      <span className="mt-2 block truncate text-[13px] font-medium text-[var(--md-ink)]">{job.customer}</span>
      <span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{job.collection} <span aria-hidden="true">→</span> {job.delivery}</span>
      <span className="mt-3 block truncate text-[11px] font-medium text-[var(--md-ink)]">{t(job.service)}</span>
      <span className="mt-0.5 block truncate text-[11px] text-[var(--md-text)]">{t(job.carrier)} · {t(job.timing)}</span>
      {showFavouriteMark ? (
        <span className={cn("absolute start-3 top-3 grid size-6 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)]", favourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]")}>
          <Star className={cn("size-3.5", favourite && "fill-current")} strokeWidth={1.35} />
        </span>
      ) : null}
    </>
  )
}

export function DomesticRoadJobCard({
  job,
  favourite = false,
  onOpenBooking,
  onToggleFavourite,
}: {
  job: DomesticRoadJob
  favourite?: boolean
  onOpenBooking?: (job: DomesticRoadJob) => void
  onToggleFavourite?: (job: DomesticRoadJob) => void
}) {
  const { t } = useLanguage()
  const isPlanning = job.stage === "intake" || job.stage === "ready"
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenBooking?.(job)}
        className="group grid w-full gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] py-3 pe-4 ps-12 text-start shadow-[var(--md-shadow-line)] transition-[transform,box-shadow,background] duration-200 hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] md:grid-cols-[minmax(178px,1.1fr)_minmax(230px,1.5fr)_minmax(160px,1fr)_auto] md:items-center"
      >
        <span className="min-w-0"><span className="flex items-center gap-2"><span dir="ltr" className="font-mono text-[12px] font-medium text-[var(--md-accent)]">{job.bookingId}</span><StatusPill tone={job.tone}>{t(job.status)}</StatusPill></span><span className="mt-1 block truncate text-[13px] font-medium text-[var(--md-ink)]">{job.customer}</span><span dir="ltr" className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{job.id} · {job.reference}</span></span><span className="min-w-0"><span className="flex items-center gap-2 text-[12px] text-[var(--md-ink)]" dir="auto"><MapPin className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.35} /><span className="truncate">{job.collection}</span><span className="text-[var(--md-subtle)]" aria-hidden="true">→</span><span className="truncate">{job.delivery}</span></span><span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{t(job.timing)}</span></span><span className="min-w-0"><span className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{t(job.service)}</span><span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{t(job.carrier)}</span></span><span className="flex items-center justify-between gap-3 md:justify-end"><span className="text-[11px] text-[var(--md-text)]"><span>{t("Margin")}</span> <bdi dir="ltr" className="font-medium text-[var(--md-ink)]">{job.margin}</bdi></span><span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] transition-transform duration-200 group-hover:scale-[1.04]" aria-label={t(isPlanning ? "Plan job" : "View job")}>{isPlanning ? <Truck className="size-3.5" strokeWidth={1.4} /> : <ArrowUpRight className="size-3.5" strokeWidth={1.4} />}</span></span>
      </button>
      <button
        type="button"
        aria-label={t(favourite ? "Remove job from favourites" : "Add job to favourites")}
        aria-pressed={favourite}
        title={t(favourite ? "Remove from favourites" : "Add to favourites")}
        onClick={() => onToggleFavourite?.(job)}
        className={cn("absolute start-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-[var(--md-radius-md)] text-[var(--md-subtle)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-white hover:text-[var(--md-amber)] hover:shadow-[var(--md-shadow-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(221,138,43,0.2)]", favourite && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)] shadow-[var(--md-shadow-line)]")}
      >
        <Star className={cn("size-4", favourite && "fill-current")} strokeWidth={1.35} />
      </button>
    </div>
  )
}
