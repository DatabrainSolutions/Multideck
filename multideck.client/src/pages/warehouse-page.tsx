import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { RefreshCw } from "@/components/icons/hugeicons"
import {
  WarehouseDashboard,
  WarehouseCalendarView,
  WarehousePageHeader,
} from "@/components/multideck/warehouse-components"
import { WarehouseFacilitiesView, WarehouseItemsView, WarehouseLocationsView } from "@/components/multideck/warehouse-management-components"
import { WarehouseOrdersManagementView } from "@/components/multideck/warehouse-operations-components"
import { WarehouseOrderDetailView, orderDetailPath, warehouseOrderDetailNumber } from "@/components/multideck/warehouse-order-detail"
import { WarehouseItemDetailView, warehouseItemDetailSku } from "@/components/multideck/warehouse-item-detail"
import { WarehouseInventoryWorkspace } from "@/components/multideck/warehouse-inventory-workspace"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { WarehousePurchaseOrderCreateView, WarehousePurchaseOrderDetailView, WarehousePurchaseOrdersWorkspace, warehousePurchaseOrderDetailId } from "@/components/multideck/warehouse-purchase-orders-workspace"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { customerWarehouseNavigation, warehouseNavigation } from "@/data/navigation-data"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { getWarehouseWorkspaceData, rescheduleOperationalWarehouseOrder, type WarehouseWorkspaceData } from "@/lib/warehouse"
import { toast } from "sonner"
import { CustomerWarehouseAccess } from "@/pages/customer-detail-page"

type WarehouseSection = "Dashboard" | "Facilities" | "Locations" | "Items" | "Inventory" | "Goods in" | "Goods out" | "Orders" | "Purchase orders" | "Calendar" | "Users"

/**
 * The grid works in local wall-clock minutes; the order stores an instant. The slot
 * an operator sees at 07:30 is 07:30 where the warehouse is, so it is built as a
 * local time and sent as the instant that represents.
 */
function localSlotToIso(dateKey: string, timeKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const [hour, minute] = timeKey.split(":").map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

const warehouseRouteItems = [...warehouseNavigation, ...customerWarehouseNavigation].flatMap((item) => item.children ?? [item])

const warehouseSectionDescriptions: Record<WarehouseSection, string | null> = {
  Dashboard: null,
  Calendar: null,
  Inventory: null,
  "Goods in": null,
  "Goods out": null,
  Orders: null,
  Facilities: null,
  Locations: null,
  Items: null,
  "Purchase orders": null,
  Users: null,
}

export function WarehousePage({ route, currentUser, navigate }: { route: string; currentUser?: AuthUserSummary | null; navigate?: (path: string) => void }) {
  // An order has its own address. Reading the register to return to from the URL
  // rather than from component state means the back button still points at Goods
  // out after a reload or when the link arrives from someone else.
  const detailOrderNumber = warehouseOrderDetailNumber(route)
  const detailPurchaseOrderId = warehousePurchaseOrderDetailId(route)
  const detailItemSku = warehouseItemDetailSku(route)
  const activeSection = (warehouseRouteItems.find((item) => item.route === route)?.label ?? (detailPurchaseOrderId || route === "/warehouse/purchase-orders/new" ? "Purchase orders" : detailOrderNumber ? "Orders" : detailItemSku ? "Items" : "Dashboard")) as WarehouseSection
  const [warehouseData, setWarehouseData] = useState<WarehouseWorkspaceData | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [reloadToken, setReloadToken] = useState(0)
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isCustomer = currentUser?.actorType === "customer"
  // The dashboard carries all seven figures in its own band, and the calendar
  // needs its date controls in this space. Neither screen repeats the three
  // operational chips in the page header.
  const headerActions = activeSection === "Dashboard" || activeSection === "Calendar" || isCustomer ? [] : warehouseData?.dashboard.headerActions ?? []
  const canManageItems = !isCustomer || hasPermission(currentUser, "Warehouse.Items.ManageOwn")
  const canCreateInbound = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CreateInboundOwn")
  const canCreateOutbound = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CreateOutboundOwn")
  const canCancel = !isCustomer || hasPermission(currentUser, "Warehouse.Orders.CancelOwn")
  const canUpload = !isCustomer || hasPermission(currentUser, "Warehouse.Documents.UploadOwn")
  const canManageUsers = isCustomer && hasPermission(currentUser, "Warehouse.Users.ManageOwn")

  // The dashboard snapshot is one request that answers the metric band, the
  // calendar and the header chips. Moving between the register screens reuses the
  // payload already in hand; opening the dashboard or the calendar revalidates it,
  // because those two screens *are* the payload. A customer never sees the
  // operator figures, so their session never asks for them.
  const snapshotScope = isCustomer ? null : activeSection === "Dashboard" || activeSection === "Calendar" ? activeSection : "chips"

  useEffect(() => {
    if (!snapshotScope) return

    let isMounted = true
    // Existing figures stay on screen while the next payload is in flight, so a
    // revalidation never blanks a band the operator is reading.
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
  }, [snapshotScope, language, reloadToken])

  // Optimistic slot changes, keyed by event id and dropped as soon as the payload
  // comes back agreeing with them.
  const [slotOverrides, setSlotOverrides] = useState<Record<string, { date: string; time: string; endTime: string }>>({})

  const calendarEvents = useMemo(() => {
    const events = warehouseData?.calendar.events ?? []
    if (!Object.keys(slotOverrides).length) return events
    return events.map((event) => slotOverrides[event.id] ? { ...event, ...slotOverrides[event.id] } : event)
  }, [warehouseData, slotOverrides])

  async function rescheduleEvent(change: { eventId: string; dateKey: string; startTime: string; endTime: string }) {
    const original = warehouseData?.calendar.events.find((event) => event.id === change.eventId)
    if (!original) return

    setSlotOverrides((current) => ({ ...current, [change.eventId]: { date: change.dateKey, time: change.startTime, endTime: change.endTime } }))
    try {
      await rescheduleOperationalWarehouseOrder(change.eventId, {
        appointmentStartAt: localSlotToIso(change.dateKey, change.startTime),
        appointmentEndAt: localSlotToIso(change.dateKey, change.endTime),
      })
      toast.success(t("Booking moved"), { description: `${change.startTime}–${change.endTime}` })
      setReloadToken((value) => value + 1)
    } catch (error) {
      setSlotOverrides((current) => {
        const next = { ...current }
        delete next[change.eventId]
        return next
      })
      toast.error(t("The booking could not be moved"), { description: error instanceof Error ? error.message : String(error) })
    }
  }

  const dashboardOrCalendarState = !warehouseData ? (
    <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center">
      {loadState === "error" ? (
        <div className="max-w-md" role="alert">
          <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Warehouse data is unavailable")}</p>
          <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("Check your connection and try again.")}</p>
          <Button type="button" variant="outline" className="mt-4 rounded-[var(--md-radius-lg)]" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw data-icon="inline-start" className="size-4" strokeWidth={1.25} />
            {t("Try again")}
          </Button>
        </div>
      ) : (
        <DotGridLoaderPanel label="Loading warehouse data" minHeight={0} />
      )}
    </Surface>
  ) : null

  // A detail route is its own screen: it carries its own title, its own back
  // navigation and its own actions, so the register header above it would only
  // repeat the area name and push the record further down.
  if (detailItemSku) {
    return (
      <main className="md-page md-page-stack">
        <WarehouseItemDetailView
          key={detailItemSku}
          sku={detailItemSku}
          backTo="/warehouse/items"
          backLabel="Back to items"
          navigate={navigate}
          canManage={canManageItems}
        />
      </main>
    )
  }

  if (detailOrderNumber) {
    const fromParam = new URLSearchParams(window.location.search).get("from")
    const backTo = fromParam && fromParam.startsWith("/warehouse/") ? fromParam : "/warehouse/orders"
    const backLabel = backTo === "/warehouse/goods-in" ? "Back to goods in"
      : backTo === "/warehouse/goods-out" ? "Back to goods out"
      : backTo === "/warehouse/calendar" ? "Back to the calendar"
      : "Back to orders"

    return (
      <main className="md-page md-page-stack">
        <WarehouseOrderDetailView
          key={detailOrderNumber}
          orderNumber={detailOrderNumber}
          backTo={backTo}
          backLabel={backLabel}
          navigate={navigate}
          canOperate={!isCustomer}
          canCancel={canCancel}
          canUpload={canUpload}
        />
      </main>
    )
  }

  if (detailPurchaseOrderId && !isCustomer) {
    return (
      <main className="md-page md-page-stack">
        <WarehousePurchaseOrderDetailView
          key={detailPurchaseOrderId}
          purchaseOrderId={detailPurchaseOrderId}
          navigate={navigate}
        />
      </main>
    )
  }

  if (route === "/warehouse/purchase-orders/new" && !isCustomer) {
    return <main className="md-page md-page-stack"><WarehousePurchaseOrderCreateView navigate={navigate} /></main>
  }

  return (
    <main className="md-page md-page-stack">
      {activeSection !== "Calendar" || !warehouseData ? (
        <WarehousePageHeader
          customer={isCustomer}
          actions={headerActions}
          onNavigate={navigate}
          title={activeSection === "Dashboard" ? "Warehouse" : activeSection}
          description={warehouseSectionDescriptions[activeSection]}
        />
      ) : null}

      {/* The old section leaves quickly on an accelerating curve and the new one
          arrives on a longer decelerating one, so a sidebar click feels answered
          immediately and the screen still settles rather than snapping. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={activeSection}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4, transition: mdMotion.exit }}
          transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
        >
          {activeSection === "Dashboard" ? dashboardOrCalendarState ?? <WarehouseDashboard metrics={warehouseData!.dashboard.metrics} orders={warehouseData!.dashboard.orders} movements={warehouseData!.dashboard.movements} /> : null}
          {activeSection === "Facilities" ? <WarehouseFacilitiesView /> : null}
          {activeSection === "Locations" ? <WarehouseLocationsView /> : null}
          {activeSection === "Items" ? <WarehouseItemsView canManage={canManageItems} navigate={navigate} /> : null}
          {activeSection === "Inventory" ? <WarehouseInventoryWorkspace /> : null}
          {activeSection === "Goods in" ? <WarehouseOrdersManagementView typeFilter="inbound" registerRoute="/warehouse/goods-in" navigate={navigate} /> : null}
          {activeSection === "Goods out" ? <WarehouseOrdersManagementView typeFilter="outbound" registerRoute="/warehouse/goods-out" navigate={navigate} /> : null}
          {activeSection === "Orders" ? <WarehouseOrdersManagementView isCustomer={isCustomer} canCreateInbound={canCreateInbound} canCreateOutbound={canCreateOutbound} registerRoute="/warehouse/orders" navigate={navigate} /> : null}
          {activeSection === "Purchase orders" && !isCustomer ? <WarehousePurchaseOrdersWorkspace navigate={navigate} /> : null}
          {activeSection === "Users" && canManageUsers ? <WarehouseOrganisationUsersView currentUser={currentUser} /> : null}
          {activeSection === "Calendar" ? dashboardOrCalendarState ?? (
            <WarehouseCalendarView
              customers={warehouseData!.calendar.customers}
              events={calendarEvents}
              // Straight to the order's own page, with the calendar as the place
              // its back button returns to.
              // The block stays where it was dropped while the write is in flight,
              // and goes back to where it came from if the write is refused — the
              // grid never argues with the pointer mid-drag.
              onReschedule={isCustomer ? undefined : rescheduleEvent}
              onOpenOrder={navigate && ((event) => {
                if (!event.reference) return
                navigate(`${orderDetailPath({ orderNumber: event.reference })}?from=${encodeURIComponent("/warehouse/calendar")}`)
              })}
            />
          ) : null}
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
