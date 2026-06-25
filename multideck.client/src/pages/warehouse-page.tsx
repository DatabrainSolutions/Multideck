import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { CheckCircle2, Clock3, PackageCheck } from "lucide-react"
import {
  WarehouseDashboard,
  WarehouseGoodsInFlow,
  WarehouseGoodsOutFlow,
  WarehouseGoodsView,
  WarehouseCalendarView,
  WarehouseOrdersView,
  WarehousePageHeader,
  WarehouseProductsView,
  WarehouseStockView,
} from "@/components/multideck/warehouse-components"
import { TabsRail } from "@/components/multideck/workflow-components"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { warehouseProductFilters, warehouseStockFilters, warehouseTabs } from "@/data/multideck-data"
import { mdMotion } from "@/lib/motion"

type WarehouseTab = (typeof warehouseTabs)[number]["label"]

function getInitialWarehouseTab(): WarehouseTab {
  if (typeof window === "undefined") return "Dashboard"
  const params = new URLSearchParams(window.location.search)
  return params.get("tab") === "goods-in" || params.get("new-pick") === "goods-in" || params.get("new-pick") === "goods-out" ? "Goods in/out" : "Dashboard"
}

function getInitialGoodsInWizard() {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  return params.get("new-pick") === "goods-in"
}

function getInitialGoodsOutWizard() {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  return params.get("new-pick") === "goods-out"
}

const warehouseHeaderActions = [
  { label: "Ready to receive", value: "7", icon: Clock3, tone: "amber" as const },
  { label: "Pick complete", value: "86%", icon: CheckCircle2, tone: "green" as const },
  { label: "Stock checks", value: "14", icon: PackageCheck, tone: "teal" as const },
]

export function WarehousePage() {
  const [activeTab, setActiveTab] = useState<WarehouseTab>(getInitialWarehouseTab)
  const [showGoodsInWizard, setShowGoodsInWizard] = useState(getInitialGoodsInWizard)
  const [showGoodsOutWizard, setShowGoodsOutWizard] = useState(getInitialGoodsOutWizard)
  const [activeGoodsInPickId, setActiveGoodsInPickId] = useState<string | undefined>(undefined)
  const [activeGoodsOutPickId, setActiveGoodsOutPickId] = useState<string | undefined>(undefined)
  const [activeProductFilter, setActiveProductFilter] = useState<string>(warehouseProductFilters[0])
  const [activeStockFilter, setActiveStockFilter] = useState<string>(warehouseStockFilters[0])
  const shouldReduceMotion = useReducedMotion()

  if (showGoodsInWizard) {
    return (
      <main className="md-page md-page-stack">
        <WarehouseGoodsInFlow initialReceiptId={activeGoodsInPickId} onBack={() => setShowGoodsInWizard(false)} />
      </main>
    )
  }

  if (showGoodsOutWizard) {
    return (
      <main className="md-page md-page-stack">
        <WarehouseGoodsOutFlow initialPickId={activeGoodsOutPickId} onBack={() => setShowGoodsOutWizard(false)} />
      </main>
    )
  }

  return (
    <main className="md-page md-page-stack">
      <WarehousePageHeader onNewPick={() => {
        setActiveGoodsInPickId(undefined)
        setShowGoodsInWizard(true)
      }} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <TabsRail tabs={warehouseTabs} activeTab={activeTab} onChange={(tab) => setActiveTab(tab as WarehouseTab)} />
        <div className="flex flex-wrap items-center gap-2">
          {warehouseHeaderActions.map((item) => {
            const Icon = item.icon

            return (
              <div key={item.label} className="flex h-10 items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/48 px-3 shadow-[var(--md-shadow-line)]">
                <Icon className="size-4" strokeWidth={1.25} style={{ color: toneToVar(item.tone) }} />
                <span className="text-[12px] font-medium text-[var(--md-text)]">{item.label}</span>
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
        {activeTab === "Dashboard" ? <WarehouseDashboard /> : null}
        {activeTab === "Products" ? <WarehouseProductsView activeFilter={activeProductFilter} onFilterChange={setActiveProductFilter} /> : null}
        {activeTab === "Goods in/out" ? (
          <WarehouseGoodsView
            onNewPick={() => {
              setActiveGoodsInPickId(undefined)
              setShowGoodsInWizard(true)
            }}
            onResumeGoodsInPick={(pickId) => {
              setActiveGoodsInPickId(pickId)
              setShowGoodsInWizard(true)
            }}
            onResumeGoodsOutPick={(pickId) => {
              setActiveGoodsOutPickId(pickId)
              setShowGoodsOutWizard(true)
            }}
          />
        ) : null}
        {activeTab === "Orders" ? <WarehouseOrdersView /> : null}
        {activeTab === "Calendar" ? <WarehouseCalendarView /> : null}
        {activeTab === "Stock view" ? <WarehouseStockView activeFilter={activeStockFilter} onFilterChange={setActiveStockFilter} /> : null}
      </motion.div>
    </main>
  )
}
