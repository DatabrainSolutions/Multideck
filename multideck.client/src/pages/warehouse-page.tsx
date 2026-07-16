import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import {
  WarehouseDashboard,
  WarehouseCalendarView,
  WarehousePageHeader,
} from "@/components/multideck/warehouse-components"
import { WarehouseFacilitiesView, WarehouseItemsView, WarehouseLocationsView } from "@/components/multideck/warehouse-management-components"
import { WarehouseInventoryView, WarehouseOrdersManagementView } from "@/components/multideck/warehouse-operations-components"
import { Surface } from "@/components/multideck/surface"
import { TabsRail } from "@/components/multideck/workflow-components"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { warehouseTabs } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { getWarehouseWorkspaceData, type WarehouseWorkspaceData } from "@/lib/warehouse-api"

type WarehouseTab = (typeof warehouseTabs)[number]["label"]

export function WarehousePage() {
  const [activeTab, setActiveTab] = useState<WarehouseTab>("Dashboard")
  const [warehouseData, setWarehouseData] = useState<WarehouseWorkspaceData | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [reloadToken, setReloadToken] = useState(0)
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const headerActions = warehouseData?.dashboard.headerActions ?? []

  useEffect(() => {
    if (activeTab !== "Dashboard" && activeTab !== "Calendar") return

    let isMounted = true
    setLoadState((current) => warehouseData ? current : "loading")

    getWarehouseWorkspaceData(language)
      .then((data) => {
        if (!isMounted) return
        setWarehouseData(data)
        setLoadState("idle")
      })
      .catch((error) => {
        console.error("Warehouse dashboard data could not be loaded.", error)
        if (isMounted) setLoadState("error")
      })

    return () => {
      isMounted = false
    }
  }, [activeTab, language, reloadToken])

  const dashboardOrCalendarState = !warehouseData ? (
    <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" aria-live="polite">
      {loadState === "error" ? (
        <div className="max-w-md">
          <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Warehouse data is unavailable")}</p>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("We could not load the live dashboard and calendar. Check the connection and try again.")}</p>
          <Button type="button" variant="outline" className="mt-4 rounded-[var(--md-radius-lg)]" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.25} />
            {t("Try again")}
          </Button>
        </div>
      ) : (
        <div>
          <LoaderCircle className="mx-auto size-5 animate-spin text-[var(--md-accent)]" strokeWidth={1.25} />
          <p className="mt-3 text-[13px] font-medium text-[var(--md-text)]">{t("Loading live warehouse data")}</p>
        </div>
      )}
    </Surface>
  ) : null

  return (
    <main className="md-page md-page-stack">
      <WarehousePageHeader />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <TabsRail tabs={warehouseTabs} activeTab={activeTab} onChange={(tab) => setActiveTab(tab as WarehouseTab)} />
        <div className="flex flex-wrap items-center gap-2">
          {headerActions.map((item) => {
            const Icon = item.icon

            return (
              <div key={item.label} className="flex h-10 items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/48 px-3 shadow-[var(--md-shadow-line)]">
                <Icon className="size-4" strokeWidth={1.25} style={{ color: toneToVar(item.tone) }} />
                <span className="text-[12px] font-medium text-[var(--md-text)]">{t(item.label)}</span>
                <StatusPill tone={item.tone}>{item.value}</StatusPill>
              </div>
            )
          })}
        </div>
      </div>

      <motion.div
        key={activeTab}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
      >
        {activeTab === "Dashboard" ? dashboardOrCalendarState ?? <WarehouseDashboard metrics={warehouseData!.dashboard.metrics} orders={warehouseData!.dashboard.orders} movements={warehouseData!.dashboard.movements} /> : null}
        {activeTab === "Facilities" ? <WarehouseFacilitiesView /> : null}
        {activeTab === "Locations" ? <WarehouseLocationsView /> : null}
        {activeTab === "Items" ? <WarehouseItemsView /> : null}
        {activeTab === "Inventory" ? <WarehouseInventoryView /> : null}
        {activeTab === "Goods in" ? <WarehouseOrdersManagementView typeFilter="inbound" /> : null}
        {activeTab === "Goods out" ? <WarehouseOrdersManagementView typeFilter="outbound" /> : null}
        {activeTab === "Orders" ? <WarehouseOrdersManagementView /> : null}
        {activeTab === "Calendar" ? dashboardOrCalendarState ?? <WarehouseCalendarView customers={warehouseData!.calendar.customers} events={warehouseData!.calendar.events} /> : null}
      </motion.div>
    </main>
  )
}
