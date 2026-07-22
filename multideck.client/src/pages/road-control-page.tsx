import { useMemo, useState } from "react"
import { Plus, Search, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DomesticJobStageRail, DomesticRoadJobCard, domesticRoadJobs, roadJobStages, type RoadJobStageId } from "@/components/multideck/domestic-road-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { useLanguage } from "@/i18n/language-provider"

const roadScopeOptions = ["My jobs", "Office jobs", "All offices"] as const
type RoadScope = (typeof roadScopeOptions)[number]

export function RoadControlPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [activeStage, setActiveStage] = useState<RoadJobStageId>("ready")
  const [scope, setScope] = useState<RoadScope>("Office jobs")

  const stage = roadJobStages.find((item) => item.id === activeStage) ?? roadJobStages[0]
  const jobs = useMemo(() => {
    return domesticRoadJobs.filter((job) => {
      if (job.stage !== activeStage) return false
      if (scope === "My jobs") return job.owner === "EM"
      if (scope === "Office jobs") return job.office === "UK Distribution"
      return true
    })
  }, [activeStage, scope])

  function createRoadJob() {
    toast.success(t("Road job opened for planning"))
    navigate("/bookings/new?preset=domestic-road")
  }

  return (
    <div className="md-page md-page-stack">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => navigate("/bookings")} className="text-[12px] font-medium text-[var(--md-accent)] hover:opacity-70">{t("Bookings & jobs")}</button>
            <span className="text-[12px] text-[var(--md-subtle)]" aria-hidden="true">/</span>
            <StatusPill tone="amber">{t("Domestic road")}</StatusPill>
          </div>
          <h1 className="mt-3 text-[26px] font-medium tracking-[-0.035em] text-[var(--md-ink)]">{t("Road control")}</h1>
          <p className="mt-2 max-w-[680px] text-[13px] leading-6 text-[var(--md-text)]">{t("Road control is one operating view across the booking lifecycle: plan, monitor and close domestic road work without losing incomplete orders.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Job scope")}>
            {roadScopeOptions.map((option) => (
              <button key={option} type="button" aria-pressed={scope === option} onClick={() => setScope(option)} className={`h-8 rounded-[calc(var(--md-radius-md)-4px)] px-3 text-[12px] font-medium transition-colors ${scope === option ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" : "text-[var(--md-text)]"}`}>{t(option)}</button>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => navigate("/bookings")} className="h-10 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium"><Search className="size-4" strokeWidth={1.4} />{t("Search bookings")}</Button>
          <Button type="button" onClick={createRoadJob} className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--md-accent)]/88"><Plus className="size-4" strokeWidth={1.5} />{t("New road job")}</Button>
        </div>
      </header>

      <DomesticJobStageRail activeStage={activeStage} onStageChange={setActiveStage} />

      {activeStage === "intake" ? (
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Not ready to plan")}</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Keep incomplete orders visible here until the customer confirms the date, access, goods or service requirement.")}</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-[var(--md-radius-md)] text-[12px]" onClick={() => toast.success(t("Customer update draft prepared"))}>{t("Prepare customer update")}</Button>
          </div>
        </Surface>
      ) : null}

      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t(stage.label)}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(stage.helper)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] text-[var(--md-text)]" onClick={() => toast.success(t("Filters opened"))}><SlidersHorizontal className="size-3.5" strokeWidth={1.4} />{t("Filters")}</Button>
        </div>
        <div className="grid gap-2.5">
          {jobs.map((job) => <DomesticRoadJobCard key={job.id} job={job} onOpenBooking={() => navigate(`/bookings/${job.bookingId.toLowerCase()}`)} />)}
        </div>
      </section>
    </div>
  )
}
