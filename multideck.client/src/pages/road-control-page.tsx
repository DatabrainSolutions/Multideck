import { useEffect, useMemo, useState } from "react"
import { KanbanSquare, List, SlidersHorizontal } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { DomesticJobStageRail, DomesticRoadJobCard, DomesticRoadKanbanBoard, roadJobStageStatus, roadJobStages, type DomesticRoadJob, type RoadJobStageId } from "@/components/multideck/domestic-road-components"
import { Pagination } from "@/components/multideck/pagination"
import { PageSettingsMenu, type PageSettingsViewOption } from "@/components/multideck/page-settings-menu"
import { Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { useLanguage } from "@/i18n/language-provider"
import type { AuthUserSummary } from "@/lib/auth-user"
import { getSavedView, saveView } from "@/lib/view-preferences"
import { listRoadControlPage, type RoadControlCounts } from "@/lib/application-data-api"
import { useStarredJobs } from "@/lib/starred-jobs"

const roadScopeOptions = ["My Jobs", "All Jobs", "Starred Jobs"] as const
type RoadScope = (typeof roadScopeOptions)[number]
const roadViewModes = ["List", "Kanban"] as const
type RoadViewMode = (typeof roadViewModes)[number]
const roadViewStorageKey = "multideck.view.road-control"
const roadPageSize = 20
const roadViewOptions = [
  { value: "List", label: "List", icon: List },
  { value: "Kanban", label: "Kanban", icon: KanbanSquare },
] satisfies readonly PageSettingsViewOption<RoadViewMode>[]

const emptyRoadCounts: RoadControlCounts = { intake: 0, ready: 0, carrier: 0, live: 0, close: 0 }

export function RoadControlPage({ navigate, currentUser }: { navigate: (path: string) => void; currentUser: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const [activeStage, setActiveStage] = useState<RoadJobStageId>("ready")
  const [scope, setScope] = useState<RoadScope>("All Jobs")
  const [viewMode, setViewMode] = useState<RoadViewMode>(() => getSavedView(roadViewStorageKey, roadViewModes, roadViewModes[0]))
  const [roadJobs, setRoadJobs] = useState<DomesticRoadJob[]>([])
  const [stageCounts, setStageCounts] = useState<RoadControlCounts>(emptyRoadCounts)
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [roadJobsLoading, setRoadJobsLoading] = useState(true)
  const [roadJobsError, setRoadJobsError] = useState<string | null>(null)
  const [favouriteIds, setFavouriteIds] = useState<Set<string>>(() => new Set())
  const [dexterOpen, setDexterOpen] = useState(false)
  const { toggleStar } = useStarredJobs(currentUser?.id)

  useEffect(() => {
    const controller = new AbortController()
    setRoadJobsLoading(true)
    setRoadJobsError(null)
    void listRoadControlPage({
      scope,
      operatorCode: currentUser?.initials,
      stage: viewMode === "List" ? activeStage : undefined,
      limit: roadPageSize,
      offset: viewMode === "List" ? (page - 1) * roadPageSize : 0,
    }, controller.signal).then((result) => {
      setRoadJobs(result.rows)
      setStageCounts(result.counts)
      setFilteredTotal(result.filteredTotal)
      setFavouriteIds((current) => new Set([...current, ...result.favouriteBookingIds]))
    }).catch((error) => {
      if ((error as { name?: string })?.name !== "AbortError") setRoadJobsError(error instanceof Error ? error.message : "Road jobs could not be loaded.")
    }).finally(() => {
      if (!controller.signal.aborted) setRoadJobsLoading(false)
    })
    return () => controller.abort()
  }, [activeStage, currentUser?.initials, page, scope, viewMode])

  const stages = useMemo(() => roadJobStages.map((item) => ({
    ...item,
    count: stageCounts[item.id],
  })), [stageCounts])
  const stage = stages.find((item) => item.id === activeStage) ?? stages[0]
  const jobs = roadJobs
  const pageCount = Math.max(1, Math.ceil(filteredTotal / roadPageSize))
  const kanbanIsCapped = viewMode === "Kanban" && roadJobStages.some((item) => stageCounts[item.id] > roadJobs.filter((job) => job.stage === item.id).length)

  useEffect(() => setPage(1), [activeStage, scope, viewMode])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    saveView(roadViewStorageKey, viewMode)
  }, [viewMode])

  function toggleFavourite(bookingId: string) {
    const saved = favouriteIds.has(bookingId)
    setFavouriteIds((current) => {
      const next = new Set(current)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
    void toggleStar(bookingId, saved).catch(() => {
      setFavouriteIds((current) => {
        const rollback = new Set(current)
        if (saved) rollback.add(bookingId)
        else rollback.delete(bookingId)
        return rollback
      })
      toast.error(t("The job star could not be saved. Try again."))
    })
  }

  function moveRoadJob(jobId: string, stage: RoadJobStageId, orderedJobs?: DomesticRoadJob[]) {
    const previousStage = roadJobs.find((job) => job.id === jobId)?.stage
    if (previousStage && previousStage !== stage) {
      setStageCounts((counts) => ({ ...counts, [previousStage]: Math.max(0, counts[previousStage] - 1), [stage]: counts[stage] + 1 }))
    }
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

      {roadJobsLoading ? <Surface className="rounded-[var(--md-radius-xl)] py-8 text-center"><p className="text-[13px] text-[var(--md-text)]">{t("Loading road jobs...")}</p></Surface> : null}
      {roadJobsError ? <Surface role="alert" className="rounded-[var(--md-radius-xl)] py-6 text-center"><p className="text-[13px] text-[var(--md-red)]">{t("Road jobs could not be loaded.")} {roadJobsError}</p></Surface> : null}

      {!roadJobsLoading && !roadJobsError && viewMode === "List" ? <DomesticJobStageRail stages={stages} activeStage={activeStage} onStageChange={setActiveStage} /> : null}

      {!roadJobsLoading && !roadJobsError && viewMode === "List" && activeStage === "intake" ? (
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

      {!roadJobsLoading && !roadJobsError ? (viewMode === "List" ? <section className="min-w-0">
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
      </section> : <>
        <DomesticRoadKanbanBoard jobs={roadJobs} favouriteIds={favouriteIds} onMoveJob={moveRoadJob} onToggleFavourite={(job) => toggleFavourite(job.bookingId)} onOpenBooking={(job) => navigate(`/road-control/${job.id.toLowerCase()}`)} />
        {kanbanIsCapped ? <p className="text-center text-[12px] text-[var(--md-subtle)]">{t("Showing the 20 most recently updated jobs in each stage.")}</p> : null}
      </>) : null}

      {!roadJobsLoading && !roadJobsError && viewMode === "List" ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          totalItems={filteredTotal}
          pageSize={roadPageSize}
          itemLabel="road jobs"
          onPageChange={setPage}
        />
      ) : null}
    </DexterDockedPage>
  )
}
