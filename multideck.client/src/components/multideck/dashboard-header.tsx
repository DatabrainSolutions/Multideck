import { useEffect, useMemo, useState } from "react"
import { ChevronDown, Loader2, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { useMinuteTick } from "@/lib/clock"
import {
  checkDashboardConnection,
  createDashboardConnectionState,
  type DashboardConnectionState,
} from "@/lib/dashboard-connection"
import {
  currentOperator,
  dashboardRangeOptions,
  dashboardSnapshots,
  savedDashboardViews,
  type DashboardCustomRange,
  type DashboardRange,
} from "@/data/multideck-data"
import { MultideckDateRangePicker, getDefaultDateRange } from "./date-picker"
import { SegmentedControl } from "./workflow-components"

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function CustomRangeTrigger({
  active,
  customRange,
  onRangeChange,
  onCustomRangeChange,
}: {
  active: boolean
  customRange?: DashboardCustomRange
  onRangeChange: (range: DashboardRange) => void
  onCustomRangeChange?: (range: DashboardCustomRange) => void
}) {
  const { t } = useLanguage()
  const resolved = customRange ?? getDefaultDateRange()

  return (
    <MultideckDateRangePicker
      value={resolved}
      onChange={(range) => {
        onRangeChange("custom")
        onCustomRangeChange?.(range)
      }}
      triggerLabel={active ? undefined : t("Custom")}
      placeholder="Custom"
      title="Custom range"
      description="Pick a start date, then an end date."
      startLabel="Start"
      endLabel="End"
      footerLabel="Selected custom range"
      active={active}
      align="end"
      triggerClassName={cn("md-dashboard-header-control w-auto", active && "md-dashboard-header-control-active")}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onRangeChange("custom")
      }}
    />
  )
}

/**
 * The connection state used to occupy a 270px card in the header. It is now a
 * single status dot: the detail matters when something is wrong, so it lives
 * behind a click and the header stays about the operator's day.
 */
function ConnectionStatus() {
  const { t } = useLanguage()
  const [state, setState] = useState<DashboardConnectionState>(() => createDashboardConnectionState("checking"))
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true

    setRefreshing(true)
    checkDashboardConnection()
      .then((next) => {
        if (active) setState(next)
      })
      .finally(() => {
        if (active) setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function refresh() {
    setRefreshing(true)
    setState(createDashboardConnectionState("checking"))
    setState(await checkDashboardConnection())
    setRefreshing(false)
  }

  const healthy = state.status === "connected"
  const checking = state.status === "checking"
  const Icon = healthy ? ShieldCheck : checking ? Loader2 : TriangleAlert
  const title = healthy
    ? t("System connected")
    : checking
      ? t("Checking API")
      : state.status === "signed-out"
        ? t("No Supabase session")
        : t("Connection issue")

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn("md-dashboard-status", healthy && "md-dashboard-status-ok", checking && "md-dashboard-status-checking")}
          aria-label={title}
        >
          <Icon className={cn("size-3.5", checking && "animate-spin")} strokeWidth={1.5} />
          <span className="md-dashboard-status-text">{healthy ? t("Live") : title}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[264px] gap-2">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{title}</p>
        <p className="text-[11.5px] leading-4 text-[var(--md-text)]">
          {healthy ? (
            state.email ? (
              <>
                <span>{t("Signed in as")}</span> <span data-i18n-skip dir="ltr">{state.email}</span>
              </>
            ) : (
              t("API accepted your Supabase session.")
            )
          ) : checking ? (
            t("Calling protected API...")
          ) : state.status === "signed-out" ? (
            t("Sign in again to test the API.")
          ) : (
            t("Protected API check failed.")
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-full justify-center rounded-[var(--md-radius-md)] bg-white/50 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} strokeWidth={1.4} />
          {t("Re-check connection")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export function DashboardHeader({
  range,
  onRangeChange,
  customRange,
  onCustomRangeChange,
  dashboardViews = savedDashboardViews,
  selectedDashboard,
  onSelectDashboard,
  onCreateDashboard,
  onSaveDashboard,
  onOpenCustomise,
  compact = false,
}: {
  range: DashboardRange
  onRangeChange: (range: DashboardRange) => void
  customRange?: DashboardCustomRange
  onCustomRangeChange?: (range: DashboardCustomRange) => void
  dashboardViews?: string[]
  selectedDashboard?: string
  onSelectDashboard?: (dashboard: string) => void
  onCreateDashboard?: (dashboard: string) => void
  onSaveDashboard?: () => void
  onOpenCustomise?: () => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  const now = useMinuteTick()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const activeDashboard = selectedDashboard ?? dashboardViews[0] ?? "Dashboard"
  const snapshot = dashboardSnapshots[range] ?? dashboardSnapshots.today

  const greeting = useMemo(() => getGreeting(now.getHours()), [now])
  const firstName = currentOperator.name.split(" ")[0]

  function createDashboard() {
    const name = newName.trim()
    if (!name) return
    onCreateDashboard?.(name)
    setNewName("")
    setCreateOpen(false)
  }

  return (
    <header className={cn("md-dashboard-header", compact && "md-dashboard-header-compact")}>
      <div className="md-dashboard-header-lead">
        <div className="md-dashboard-header-copy">
          <h1 className="md-dashboard-greeting">
            {t(greeting)}, {firstName}.
          </h1>
        </div>
      </div>

      <div className="md-dashboard-header-actions">
        <SegmentedControl
          options={dashboardRangeOptions}
          value={range}
          onChange={onRangeChange}
          ariaLabel={t("Dashboard date range")}
          renderOption={(value) => t(dashboardSnapshots[value].label)}
        />
        <CustomRangeTrigger
          active={range === "custom"}
          customRange={customRange}
          onRangeChange={onRangeChange}
          onCustomRangeChange={onCustomRangeChange}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="md-dashboard-header-control md-dashboard-views">
              <span className="truncate">{activeDashboard}</span>
              <ChevronDown data-icon="inline-end" className="size-4 text-[var(--md-subtle)]" strokeWidth={1.2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[240px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
            <DropdownMenuLabel className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Dashboards")}</DropdownMenuLabel>
            {dashboardViews.map((dashboard) => (
              <DropdownMenuItem key={dashboard} className="text-[13px]" onSelect={() => onSelectDashboard?.(dashboard)}>
                {dashboard}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]" onSelect={() => onSaveDashboard?.()}>
              <Save data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              {t("Save current view")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]" onSelect={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" className="size-3.5" strokeWidth={1.2} />
              {t("Create new dashboard")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          className="md-dashboard-header-control"
          onClick={onOpenCustomise}
          aria-label={t("Customise")}
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.3} />
          <span className="md-dashboard-customise-text">{t("Customise")}</span>
        </Button>

        <ConnectionStatus />
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[360px] rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
          <DialogHeader className="px-5 pb-1 pt-5">
            <DialogTitle className="text-[16px] font-medium">{t("New dashboard")}</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {t("Name this layout so you can switch back to it later.")}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-3">
            <Input
              aria-label={t("Dashboard name")}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Customs morning view"
              className="h-10 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] text-[13px] shadow-[var(--md-shadow-line)]"
              onKeyDown={(event) => {
                if (event.key === "Enter") createDashboard()
              }}
            />
          </div>
          <DialogFooter className="gap-2 px-5 pb-5">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
              >
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent)]/90"
              onClick={createDashboard}
            >
              {t("Create dashboard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
