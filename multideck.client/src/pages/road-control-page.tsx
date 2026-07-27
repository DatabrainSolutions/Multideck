import { useEffect, useMemo, useState } from "react"
import { KanbanSquare, List, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { DomesticJobStageRail, DomesticRoadJobCard, DomesticRoadKanbanBoard, domesticRoadJobs, roadJobStageStatus, roadJobStages, type RoadJobStageId } from "@/components/multideck/domestic-road-components"
import { PageSettingsMenu, type PageSettingsViewOption } from "@/components/multideck/page-settings-menu"
import { Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import { getSavedView, saveView } from "@/lib/view-preferences"

const roadScopeOptions = ["My Jobs", "All Jobs", "Starred Jobs"] as const
type RoadScope = (typeof roadScopeOptions)[number]
const roadViewModes = ["List", "Kanban"] as const
type RoadViewMode = (typeof roadViewModes)[number]
const roadViewStorageKey = "multideck.view.road-control"
const roadViewOptions = [
  { value: "List", label: "List", icon: List },
  { value: "Kanban", label: "Kanban", icon: KanbanSquare },
] satisfies readonly PageSettingsViewOption<RoadViewMode>[]

export function RoadControlPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [activeStage, setActiveStage] = useState<RoadJobStageId>("ready")
  const [scope, setScope] = useState<RoadScope>("All Jobs")
  const [viewMode, setViewMode] = useState<RoadViewMode>(() => getSavedView(roadViewStorageKey, roadViewModes, roadViewModes[0]))
  const [roadJobs, setRoadJobs] = useState(() => [...domesticRoadJobs])
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set())
  const [dexterOpen, setDexterOpen] = useState(false)

  const stages = useMemo(() => roadJobStages.map((item) => ({
    ...item,
    count: roadJobs.filter((job) => job.stage === item.id).length,
  })), [roadJobs])
  const stage = stages.find((item) => item.id === activeStage) ?? stages[0]
  const scopedJobs = useMemo(() => {
    return roadJobs.filter((job) => {
      if (scope === "My Jobs") return job.owner === "EM"
      if (scope === "Starred Jobs") return favouriteIds.has(job.bookingId)
      return true
    })
  }, [favouriteIds, roadJobs, scope])
  const jobs = scopedJobs.filter((job) => job.stage === activeStage)

  useEffect(() => {
    saveView(roadViewStorageKey, viewMode)
  }, [viewMode])

  function toggleFavourite(bookingId: string) {
    setFavouriteIds((current) => {
      const next = new Set(current)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }

  function moveRoadJob(jobId: string, stage: RoadJobStageId, orderedJobs?: typeof domesticRoadJobs) {
    setRoadJobs((current) => {
      if (!orderedJobs) {
        return current.map((job) => job.id === jobId && job.stage !== stage ? { ...job, stage, ...roadJobStageStatus[stage] } : job)
      }

      const orderedIds = new Set(orderedJobs.map((job) => job.id))
      const orderedIterator = orderedJobs[Symbol.iterator]()
      return current.map((job) => orderedIds.has(job.id) ? orderedIterator.next().value ?? job : job)
    })
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Road control")} className="md-page md-page-stack">
      <header className="flex flex-wrap justify-end gap-2">
        <h1 className="sr-only">{t("Road control")}</h1>
        <SegmentedControl options={roadScopeOptions} value={scope} onChange={setScope} ariaLabel={t("Job scope")} renderOption={(option) => t(option)} />
        <DexterActionPill onClick={() => setDexterOpen(true)} />
        <PageSettingsMenu title={t("Road control settings")} viewLabel={t("View")} viewOptions={roadViewOptions} value={viewMode} onViewChange={setViewMode} />
      </header>

      {viewMode === "List" ? <DomesticJobStageRail stages={stages} activeStage={activeStage} onStageChange={setActiveStage} /> : null}

      {viewMode === "List" && activeStage === "intake" ? (
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

      {viewMode === "List" ? <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t(stage.label)}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(stage.helper)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] text-[var(--md-text)]" onClick={() => toast.success(t("Filters opened"))}><SlidersHorizontal className="size-3.5" strokeWidth={1.4} />{t("Filters")}</Button>
        </div>
        <div className="grid gap-2.5">
          {jobs.map((job) => <DomesticRoadJobCard key={job.id} job={job} favourite={favouriteIds.has(job.bookingId)} onToggleFavourite={() => toggleFavourite(job.bookingId)} onOpenBooking={() => navigate(`/road-control/${job.id.toLowerCase()}`)} />)}
          {jobs.length === 0 ? (
            <Surface className="rounded-[var(--md-radius-xl)] py-8 text-center">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(scope === "Starred Jobs" ? "No starred jobs in this stage" : "No jobs in this stage")}</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(scope === "Starred Jobs" ? "Star a job to keep it close across Road control." : "Try another stage or job scope.")}</p>
            </Surface>
          ) : null}
        </div>
      </section> : <DomesticRoadKanbanBoard jobs={scopedJobs} favouriteIds={favouriteIds} onMoveJob={moveRoadJob} onToggleFavourite={(job) => toggleFavourite(job.bookingId)} onOpenBooking={(job) => navigate(`/road-control/${job.id.toLowerCase()}`)} />}
    </DexterDockedPage>
  )
}
