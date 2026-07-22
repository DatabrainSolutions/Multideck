import { ArrowUpRight, Check, Clock3, MapPin, Truck, type LucideIcon } from "lucide-react"
import { StatusPill } from "@/components/multideck/status-pill"
import type { StatusTone } from "@/data/multideck-data"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

export type RoadJobStageId = "intake" | "ready" | "carrier" | "live" | "close"

export type RoadJobStage = {
  id: RoadJobStageId
  label: string
  helper: string
  count: number
  tone: StatusTone
  icon: LucideIcon
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
  { id: "intake", label: "Intake", helper: "Capture and validate", count: 4, tone: "amber", icon: Clock3 },
  { id: "ready", label: "Ready to plan", helper: "Confirm service and carrier", count: 6, tone: "teal", icon: Check },
  { id: "carrier", label: "Carrier confirmation", helper: "Get a vehicle commitment", count: 3, tone: "blue", icon: Truck },
  { id: "live", label: "Live movement", helper: "Monitor pickup and delivery", count: 8, tone: "green", icon: MapPin },
  { id: "close", label: "Financial close", helper: "Check cost and raise invoice", count: 5, tone: "neutral", icon: ArrowUpRight },
]

export const domesticRoadJobs: DomesticRoadJob[] = [
  { id: "RD-10682", bookingId: "MD-22682", owner: "JL", office: "UK Distribution", stage: "intake", customer: "Jenkar", reference: "JK-PO-48216", collection: "Leicester, GB", delivery: "Bristol, GB", timing: "Collection date missing", service: "Pallet network", carrier: "Not assigned", status: "Needs planning date", tone: "amber", margin: "—", blocker: "Waiting for customer confirmation" },
  { id: "RD-10683", bookingId: "MD-22683", owner: "EM", office: "UK Distribution", stage: "intake", customer: "Jenkar", reference: "JK-PO-48228", collection: "Dartford, GB", delivery: "Manchester, GB", timing: "Tomorrow · 10:00–12:00", service: "LTL", carrier: "Not assigned", status: "Check dimensions", tone: "amber", margin: "—", blocker: "Pallet height not supplied" },
  { id: "RD-10676", bookingId: "MD-22676", owner: "EM", office: "UK Distribution", stage: "ready", customer: "Jenkar", reference: "JK-PO-48191", collection: "Birmingham, GB", delivery: "Glasgow, GB", timing: "Today · collection by 14:00", service: "Dedicated 7.5t", carrier: "Carrier shortlist ready", status: "Plan now", tone: "teal", margin: "18.4% est." },
  { id: "RD-10679", bookingId: "MD-22679", owner: "JL", office: "UK Distribution", stage: "ready", customer: "Jenkar", reference: "JK-PO-48203", collection: "Coventry, GB", delivery: "Leeds, GB", timing: "Tomorrow · delivery by 09:00", service: "Next-day pallet", carrier: "Carrier shortlist ready", status: "Plan now", tone: "teal", margin: "22.1% est." },
  { id: "RD-10671", bookingId: "MD-22671", owner: "WC", office: "UK Distribution", stage: "carrier", customer: "Jenkar", reference: "JK-PO-48172", collection: "Rugby, GB", delivery: "Exeter, GB", timing: "Today · collection 15:00–17:00", service: "Dedicated van", carrier: "Redline Transport", status: "Confirmation due 11:30", tone: "blue", margin: "20.7% est." },
  { id: "RD-10664", bookingId: "MD-22664", owner: "EM", office: "UK Distribution", stage: "live", customer: "Jenkar", reference: "JK-PO-48126", collection: "Milton Keynes, GB", delivery: "Newcastle, GB", timing: "Out for delivery · ETA 15:20", service: "Dedicated 18t", carrier: "Grove Haulage", status: "On track", tone: "green", margin: "19.6% est." },
  { id: "RD-10658", bookingId: "MD-22658", owner: "EM", office: "UK Distribution", stage: "close", customer: "Jenkar", reference: "JK-PO-48094", collection: "Derby, GB", delivery: "Cardiff, GB", timing: "Delivered yesterday · POD received", service: "Pallet network", carrier: "PalletLine", status: "Cost check due", tone: "neutral", margin: "16.8% est." },
]

export function DomesticJobStageRail({ stages = roadJobStages, activeStage, onStageChange }: { stages?: readonly RoadJobStage[]; activeStage: RoadJobStageId; onStageChange: (stage: RoadJobStageId) => void }) {
  const { t } = useLanguage()
  return <nav aria-label={t("Road job stages")} className="grid w-full min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-5">{stages.map((stage) => {
    const Icon = stage.icon
    const active = stage.id === activeStage
    return <button key={stage.id} type="button" aria-current={active ? "step" : undefined} onClick={() => onStageChange(stage.id)} className={cn("group min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-3 text-start shadow-[var(--md-shadow-line)] transition-[transform,box-shadow,background] duration-200 hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.24)]", active && "bg-[color-mix(in_srgb,var(--md-accent)_8%,var(--md-surface))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--md-accent)_28%,transparent),var(--md-shadow-soft)]")}><span className="flex items-start justify-between gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]"><Icon className="size-4" strokeWidth={1.35} /></span><StatusPill tone={stage.tone}>{stage.count}</StatusPill></span><span className="mt-3 block text-[13px] font-medium text-[var(--md-ink)]">{t(stage.label)}</span><span className="mt-0.5 block truncate text-[11px] text-[var(--md-text)]">{t(stage.helper)}</span></button>
  })}</nav>
}

export function DomesticRoadJobCard({ job, onOpenBooking }: { job: DomesticRoadJob; onOpenBooking?: (job: DomesticRoadJob) => void }) {
  const { t } = useLanguage()
  const isPlanning = job.stage === "intake" || job.stage === "ready"
  return <button type="button" onClick={() => onOpenBooking?.(job)} className={cn("group grid w-full gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 text-start shadow-[var(--md-shadow-line)] transition-[transform,box-shadow,background] duration-200 hover:-translate-y-px hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.24)] md:grid-cols-[minmax(178px,1.1fr)_minmax(230px,1.5fr)_minmax(160px,1fr)_auto] md:items-center")}><span className="min-w-0"><span className="flex items-center gap-2"><span dir="ltr" className="font-mono text-[12px] font-medium text-[var(--md-accent)]">{job.bookingId}</span><StatusPill tone={job.tone}>{t(job.status)}</StatusPill></span><span className="mt-1 block truncate text-[13px] font-medium text-[var(--md-ink)]">{job.customer}</span><span dir="ltr" className="mt-0.5 block text-[11px] text-[var(--md-subtle)]">{job.id} · {job.reference}</span></span><span className="min-w-0"><span className="flex items-center gap-2 text-[12px] text-[var(--md-ink)]" dir="auto"><MapPin className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.35} /><span className="truncate">{job.collection}</span><span className="text-[var(--md-subtle)]" aria-hidden="true">→</span><span className="truncate">{job.delivery}</span></span><span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{t(job.timing)}</span></span><span className="min-w-0"><span className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{t(job.service)}</span><span className="mt-1 block truncate text-[11px] text-[var(--md-text)]">{t(job.carrier)}</span></span><span className="flex items-center justify-between gap-3 md:justify-end"><span className="text-[11px] text-[var(--md-text)]"><span>{t("Margin")}</span> <bdi dir="ltr" className="font-medium text-[var(--md-ink)]">{job.margin}</bdi></span><span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)] transition-transform duration-200 group-hover:scale-[1.04]" aria-label={t(isPlanning ? "Plan job" : "View job")}>{isPlanning ? <Truck className="size-3.5" strokeWidth={1.4} /> : <ArrowUpRight className="size-3.5" strokeWidth={1.4} />}</span></span></button>
}
