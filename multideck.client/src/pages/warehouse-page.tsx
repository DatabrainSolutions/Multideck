import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import {
  WarehouseDashboard,
  WarehouseCalendarView,
  WarehousePageHeader,
} from "@/components/multideck/warehouse-components"
import { WarehouseFacilitiesView, WarehouseItemsView, WarehouseLocationsView } from "@/components/multideck/warehouse-management-components"
import { WarehouseInventoryView, WarehouseOrdersManagementView } from "@/components/multideck/warehouse-operations-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { customerWarehouseNavigation, warehouseNavigation } from "@/data/navigation-data"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { getWarehouseWorkspaceData, type WarehouseWorkspaceData } from "@/lib/warehouse"
import { CustomerWarehouseAccess } from "@/pages/customer-detail-page"

type WarehouseSection = "Dashboard" | "Facilities" | "Locations" | "Items" | "Inventory" | "Goods in" | "Goods out" | "Orders" | "Calendar" | "Users"

const warehouseRouteItems = [...warehouseNavigation, ...customerWarehouseNavigation].flatMap((item) => item.children ?? [item])

export function WarehousePage({ route, currentUser }: { route: string; currentUser?: AuthUserSummary | null }) {
  const activeSection = (warehouseRouteItems.find((item) => item.route === route)?.label ?? "Dashboard") as WarehouseSection
  const [warehouseData, setWarehouseData] = useState<WarehouseWorkspaceData | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [reloadToken, setReloadToken] = useState(0)
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const headerActions = warehouseData?.dashboard.headerActions ?? []
  const isCustomer = currentUser?.actorType === "customer"
  const canManageItems = !isCustomer || hasPermission(currentUser, "Warehouse.Items.ManageOwn")
  const canCreateInbound = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CreateInboundOwn")
  const canCreateOutbound = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CreateOutboundOwn")
  const canCancel = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CancelOwn")
  const canUpload = !isCustomer || hasPermission(currentUser, "Warehouse.Documents.UploadOwn")
  const canManageUsers = isCustomer && hasPermission(currentUser, "Warehouse.Users.ManageOwn")

  useEffect(() => {
    if (activeSection !== "Dashboard" && activeSection !== "Calendar") return

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
  }, [activeSection, language, reloadToken])

  const dashboardOrCalendarState = !warehouseData ? (
    <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" aria-live="polite">
      {loadState === "error" ? (
        <div className="max-w-md">
          <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Warehouse data is unavailable")}</p>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("Unable to load the live dashboard and calendar. Check your connection and try again.")}</p>
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
      <WarehousePageHeader customer={isCustomer} />

      {!isCustomer && headerActions.length ? (
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
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={activeSection}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.smooth}
        >
          {activeSection === "Dashboard" ? dashboardOrCalendarState ?? <WarehouseDashboard metrics={warehouseData!.dashboard.metrics} orders={warehouseData!.dashboard.orders} movements={warehouseData!.dashboard.movements} /> : null}
          {activeSection === "Facilities" ? <WarehouseFacilitiesView /> : null}
          {activeSection === "Locations" ? <WarehouseLocationsView /> : null}
          {activeSection === "Items" ? <WarehouseItemsView canManage={canManageItems} /> : null}
          {activeSection === "Inventory" ? <WarehouseInventoryView /> : null}
          {activeSection === "Goods in" ? <WarehouseOrdersManagementView typeFilter="inbound" /> : null}
          {activeSection === "Goods out" ? <WarehouseOrdersManagementView typeFilter="outbound" /> : null}
          {activeSection === "Orders" ? <WarehouseOrdersManagementView isCustomer={isCustomer} canCreateInbound={canCreateInbound} canCreateOutbound={canCreateOutbound} canCancel={canCancel} canUpload={canUpload} /> : null}
          {activeSection === "Users" && canManageUsers ? <WarehouseOrganisationUsersView currentUser={currentUser} /> : null}
          {activeSection === "Calendar" ? dashboardOrCalendarState ?? <WarehouseCalendarView customers={warehouseData!.calendar.customers} events={warehouseData!.calendar.events} /> : null}
        </motion.div>
      </AnimatePresence>
    </main>
  )
}

function WarehouseOrganisationUsersView({ currentUser }: { currentUser: AuthUserSummary }) {
  const { t } = useLanguage()
  const organisations = currentUser.organisations.filter((organisation) => organisation.canManageWarehouseUsers !== false)
  const organisationKey = organisations.map((organisation) => organisation.id).join("|")
  const [organisationId, setOrganisationId] = useState(organisations[0]?.id ?? "")

  useEffect(() => {
    if (!organisations.some((organisation) => organisation.id === organisationId)) {
      setOrganisationId(organisations[0]?.id ?? "")
    }
  }, [organisationId, organisationKey]) // organisationKey tracks session scope changes without depending on a newly filtered array.

  if (!organisationId) {
    return <Surface padding="lg" className="rounded-[var(--md-radius-xl)] text-[13px] text-[var(--md-text)]">{t("No organisation is available for user management.")}</Surface>
  }

  return (
    <div className="grid gap-[var(--md-page-stack-gap)]">
      {organisations.length > 1 ? (
        <Surface padding="md" className="flex flex-col gap-3 rounded-[var(--md-radius-xl)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Organisation")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Choose which organisation’s users you want to manage.")}</p>
          </div>
          <Select value={organisationId} onValueChange={setOrganisationId}>
            <SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)] sm:w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organisations.map((organisation) => <SelectItem key={organisation.id} value={organisation.id}>{organisation.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Surface>
      ) : null}
      <CustomerWarehouseAccess customerId={organisationId} selfService currentUserEmail={currentUser.email} />
    </div>
  )
}
