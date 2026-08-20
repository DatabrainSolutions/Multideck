import { useEffect, useState } from "react"
import { ChevronDown, MapPinOff, Menu, MoreHorizontal, PackagePlus, Plus, Upload, UserRoundPlus } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { dispatchTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { AppBreadcrumbs } from "./app-breadcrumbs"
import { CommandInput } from "./command-input"
import { AppSidebar } from "./app-sidebar"

const topBarGhostActionClass =
  "h-9 rounded-[var(--md-radius-lg)] bg-white/42 px-3 text-[12.5px] font-medium leading-none text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"

const topBarPrimaryActionClass =
  "h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[12.5px] font-medium leading-none text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] hover:shadow-[0_14px_26px_var(--md-accent-a18)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a16)]"

const topBarIconActionClass =
  "rounded-[var(--md-radius-md)] bg-white/42 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"

const warehouseCreateActions: Partial<Record<string, { label: string; eventName: (typeof topBarActionEvents)[keyof typeof topBarActionEvents] }>> = {
  "/warehouse/goods-in": { label: "Goods in", eventName: topBarActionEvents.createWarehouseOrder },
  "/warehouse/goods-out": { label: "Goods out", eventName: topBarActionEvents.createWarehouseOrder },
  "/warehouse/orders": { label: "New order", eventName: topBarActionEvents.createWarehouseOrder },
  "/warehouse/facilities": { label: "New facility", eventName: topBarActionEvents.createWarehouseFacility },
  "/warehouse/items": { label: "New item", eventName: topBarActionEvents.createWarehouseItem },
  "/warehouse/locations": { label: "New location", eventName: topBarActionEvents.createWarehouseLocation },
}

type CrmCreateAction = {
  label: string
  eventName?: (typeof topBarActionEvents)[keyof typeof topBarActionEvents]
  path?: string
}

const crmCreateActions: Partial<Record<string, CrmCreateAction>> = {
  "/crm/leads": { label: "New lead", eventName: topBarActionEvents.createCrmLead },
  "/crm/accounts": { label: "New account", eventName: topBarActionEvents.createCrmAccount },
  "/crm/contacts": { label: "New contact", eventName: topBarActionEvents.createCrmContact },
  "/crm/contact-cards": { label: "New card", eventName: topBarActionEvents.createCrmContactCard },
  "/crm/deals": { label: "New deal", eventName: topBarActionEvents.createCrmDeal },
}

const ratesTopBarActions: Partial<Record<string, { importLabel?: string; createLabel: string }>> = {
  "/rates": { importLabel: "Import rates", createLabel: "New cost tariff" },
  "/rates/tariffs": { createLabel: "New customer tariff" },
}

function WarehouseTopBarAction({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()

  if (route === "/warehouse/purchase-orders") {
    return <Button aria-label={t("New purchase order")} title={t("New purchase order")} className={topBarPrimaryActionClass} onClick={() => navigate("/warehouse/purchase-orders/new")}><Plus data-icon="inline-start" strokeWidth={1.2} /><span className="hidden sm:inline">{t("New purchase order")}</span></Button>
  }

  if (route === "/warehouse/inventory") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={t("New")} title={t("New")} className={topBarPrimaryActionClass}>
            <Plus data-icon="inline-start" strokeWidth={1.2} />
            <span className="hidden sm:inline">{t("New")}</span>
            <ChevronDown className="size-3 opacity-70" strokeWidth={1.4} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[248px]">
          <DropdownMenuItem onSelect={() => dispatchTopBarAction(topBarActionEvents.createWarehouseObject)}>
            <PackagePlus className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
            {t("New warehouse object")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => dispatchTopBarAction(topBarActionEvents.reportWarehouseLocationEmpty)}>
            <MapPinOff className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
            {t("Report a location empty")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const action = warehouseCreateActions[route]
  if (action) {
    return (
      <Button aria-label={t(action.label)} title={t(action.label)} className={topBarPrimaryActionClass} onClick={() => dispatchTopBarAction(action.eventName)}>
        <Plus data-icon="inline-start" strokeWidth={1.2} />
        <span className="hidden sm:inline">{t(action.label)}</span>
      </Button>
    )
  }

  if (route === "/warehouse" || route === "/warehouse/calendar") {
    return (
      <Button aria-label={t("New order")} title={t("New order")} className={topBarPrimaryActionClass} onClick={() => navigate("/warehouse/orders?create=1")}>
        <Plus data-icon="inline-start" strokeWidth={1.2} />
        <span className="hidden sm:inline">{t("New order")}</span>
      </Button>
    )
  }

  return null
}

export function TopBar({
  route,
  navigate,
  currentUser,
}: {
  route: string
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
}) {
  const isCustomerList = route === "/customers"
  const isCustomerDetail = route.startsWith("/customers/")
  const isCrmRoute = route.startsWith("/crm")
  const isCrmLeadDetail = /^\/crm\/leads\/[^/]+$/.test(route)
  const isCrmLeadConversion = /^\/crm\/leads\/[^/]+\/convert$/.test(route)
  const isBookingList = route === "/bookings"
  const isRoadControl = route === "/road-control"
  const isRoadBooking = route === "/road-control/new"
  const isRoadJob = /^\/road-control\/[^/]+$/.test(route) && !isRoadBooking
  const isRoadRoute = isRoadControl || isRoadBooking || isRoadJob
  const isQuotes = route === "/quotes"
  const isWarehouse = route.startsWith("/warehouse")
  const isStandaloneExportRegister = route === "/customs/standalone/export"
  const isStandaloneImportRegister = route === "/customs/standalone/import"
  const isReports = route === "/reports"
  const isScheduledReports = route === "/reports/scheduled"
  const isReportingRoute = isReports || isScheduledReports
  const isOperationalJobScreen = route === "/" || route.startsWith("/bookings") || route.startsWith("/quotes") || isRoadRoute || isWarehouse
  const crmCreateAction = crmCreateActions[route]
  const canWriteCrm = hasPermission(currentUser, "CRM.Write")
  const ratesTopBarAction = ratesTopBarActions[route]
  const { direction, t } = useLanguage()
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    let active = true
    setCurrentRecordName(null)

    async function loadRecordName() {
      const leadMatch = route.match(/^\/crm\/leads\/([^/]+)(?:\/convert)?$/)
      if (leadMatch) {
        const { getLead } = await import("@/lib/lead-api")
        return (await getLead(leadMatch[1])).companyName
      }

      const accountMatch = route.match(/^\/crm\/accounts\/([^/]+)$/)
      const customerMatch = route.match(/^\/customers\/([^/]+)$/)
      if (accountMatch || customerMatch) {
        const { getCustomer } = await import("@/lib/customer-api")
        return (await getCustomer((accountMatch ?? customerMatch)![1])).name
      }

      const contactMatch = route.match(/^\/crm\/contacts\/([^/]+)$/)
      if (contactMatch) {
        const { getContact } = await import("@/lib/customer-api")
        return (await getContact(contactMatch[1])).name
      }

      return null
    }

    void loadRecordName()
      .then((name) => {
        if (active) setCurrentRecordName(name)
      })
      .catch(() => {
        // The breadcrumb keeps its user-friendly record-type fallback when the
        // detail request fails; an opaque route identifier is never exposed.
      })

    return () => {
      active = false
    }
  }, [route])

  return (
    <header className="sticky top-0 z-10 -mx-[var(--md-page-pad)] mb-[var(--md-page-stack-gap)] flex min-h-[56px] items-center gap-[var(--md-gap-lg)] bg-[var(--md-topbar-bg)] px-[var(--md-page-pad)] py-[var(--md-gap-sm)] shadow-[var(--md-stroke-bottom)] backdrop-blur-xl">
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Open navigation")}
            title={t("Open navigation")}
            className={cn(topBarIconActionClass, "bg-[var(--md-glass-strong)] lg:hidden")}
          >
            <Menu data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side={direction === "rtl" ? "right" : "left"}
          showCloseButton={false}
          className="gap-0 border-0 bg-[var(--md-sidebar-bg)] p-0 shadow-[var(--md-shadow-lift)] data-[side=left]:w-[min(var(--md-sidebar-width),calc(100vw-24px))] data-[side=left]:max-w-[var(--md-sidebar-width)] data-[side=right]:w-[min(var(--md-sidebar-width),calc(100vw-24px))] data-[side=right]:max-w-[var(--md-sidebar-width)]"
        >
          <SheetTitle className="sr-only">{t("Multideck navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{t("Mobile navigation for Multideck")}</SheetDescription>
          <AppSidebar
            route={route}
            navigate={(path) => {
              setMobileSidebarOpen(false)
              navigate(path)
            }}
            onRequestClose={() => setMobileSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {isCustomerDetail ? (
        <>
          <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentRecordName} className="min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-none md:min-w-[210px]" />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              className={topBarGhostActionClass}
              onClick={() =>
                toast.success("Share link copied", {
                  description: `${currentRecordName ?? "Customer"}'s account link is ready to send.`,
                })
              }
            >
              Share
            </Button>
            <Button variant="ghost" size="icon" className={topBarIconActionClass}>
              <MoreHorizontal data-icon="inline-start" strokeWidth={1.2} />
            </Button>
            <Button
              className={topBarPrimaryActionClass}
              onClick={() => navigate("/bookings/new")}
            >
              <span className="hidden sm:inline">{currentRecordName ? `New booking for ${currentRecordName}` : "New booking"}</span>
              <span className="sm:hidden">New booking</span>
            </Button>
          </div>
        </>
      ) : isCrmLeadConversion ? (
        <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentRecordName} className="min-w-0 md:min-w-[210px]" />
      ) : isCrmLeadDetail ? (
        <>
          <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentRecordName} className="min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-none md:min-w-[210px]" />
          {currentRecordName ? <div className="ml-auto flex items-center gap-2">
            <Button
              className={topBarPrimaryActionClass}
              onClick={() => navigate(`${route}/convert`)}
            >
              {t("Convert to deal")}
            </Button>
          </div> : null}
        </>
      ) : (
        <>
          <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentRecordName} className="hidden min-w-[210px] md:block" />
          <div className="ml-auto min-w-0 flex-1 md:max-w-[560px]">
            <CommandInput placeholder={isBookingList || isRoadRoute ? "Job, reference, customer, route..." : isQuotes ? "Quote, customer, route, reference..." : isWarehouse ? "SKU, bin, order, customer, goods movement..." : isCustomerList ? "Search customers, contacts, or bookings..." : isCrmRoute ? "Search leads, accounts, contacts, or deals..." : isReportingRoute ? "Report name, template, customer..." : "Ask Multideck or jump to anything..."} onNavigate={navigate} />
          </div>
          {ratesTopBarAction ? (
            <>
              {ratesTopBarAction.importLabel ? (
              <Button
                variant="ghost"
                className={cn("hidden sm:inline-flex", topBarGhostActionClass)}
                onClick={() => dispatchTopBarAction(topBarActionEvents.importRates)}
              >
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                {t(ratesTopBarAction.importLabel)}
              </Button>
              ) : null}
              <Button
                aria-label={t(ratesTopBarAction.createLabel)}
                title={t(ratesTopBarAction.createLabel)}
                className={topBarPrimaryActionClass}
                onClick={() => dispatchTopBarAction(topBarActionEvents.createRate)}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">{t(ratesTopBarAction.createLabel)}</span>
              </Button>
            </>
          ) : isBookingList ? (
            <>
              <Button variant="ghost" className={cn("hidden sm:inline-flex", topBarGhostActionClass)}>
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import CSV
              </Button>
              <Button
                aria-label="New booking"
                title="New booking"
                className={topBarPrimaryActionClass}
                onClick={() => navigate("/bookings/new")}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New booking</span>
              </Button>
            </>
          ) : isCustomerList ? (
            <>
              <Button variant="ghost" className={cn("hidden sm:inline-flex", topBarGhostActionClass)}>
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() => window.dispatchEvent(new CustomEvent("multideck:create-customer"))}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New customer</span>
              </Button>
            </>
          ) : isCrmRoute && crmCreateAction && canWriteCrm ? (
            <>
              <Button
                aria-label={t(crmCreateAction.label)}
                title={t(crmCreateAction.label)}
                className={topBarPrimaryActionClass}
                onClick={() => {
                  if (crmCreateAction.eventName) {
                    dispatchTopBarAction(crmCreateAction.eventName)
                  } else if (crmCreateAction.path) {
                    navigate(crmCreateAction.path)
                  }
                }}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">{t(crmCreateAction.label)}</span>
              </Button>
            </>
          ) : isQuotes ? (
            <Button aria-label={t("New quote")} title={t("New quote")} className={topBarPrimaryActionClass} onClick={() => navigate("/quotes/new")}>
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("New quote")}</span>
            </Button>
          ) : isWarehouse ? (
            <WarehouseTopBarAction route={route} navigate={navigate} />
          ) : isStandaloneExportRegister ? (
            <Button aria-label={t("New export declaration")} title={t("New export declaration")} className={topBarPrimaryActionClass} onClick={() => navigate("/customs/standalone/export/new")}>
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("New export declaration")}</span>
            </Button>
          ) : isStandaloneImportRegister ? (
            <Button aria-label={t("New import declaration")} title={t("New import declaration")} className={topBarPrimaryActionClass} onClick={() => navigate("/customs/standalone/import/new")}>
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("New import declaration")}</span>
            </Button>
          ) : isReports ? (
            <Button
              aria-label={t("Create report")}
              title={t("Create report")}
              className={topBarPrimaryActionClass}
              onClick={() => dispatchTopBarAction(topBarActionEvents.startReportDraft)}
            >
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("Create report")}</span>
            </Button>
          ) : isScheduledReports ? (
            <Button
              aria-label={t("Set up scheduled report")}
              title={t("Set up scheduled report")}
              className={topBarPrimaryActionClass}
              onClick={() => dispatchTopBarAction(topBarActionEvents.startReportSchedule)}
            >
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("Set up scheduled report")}</span>
            </Button>
          ) : isRoadControl ? (
            <Button aria-label={t("New road job")} title={t("New road job")} className={topBarPrimaryActionClass} onClick={() => navigate("/road-control/new")}>
              <Plus data-icon="inline-start" strokeWidth={1.2} />
              <span className="hidden sm:inline">{t("New road job")}</span>
            </Button>
          ) : (
            <>
              {!isOperationalJobScreen && !isReportingRoute && !isCrmRoute ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={cn("hidden sm:inline-flex md:hidden", topBarIconActionClass)} onClick={() => navigate("/settings?tab=team")}>
                        <UserRoundPlus data-icon="inline-start" strokeWidth={1.2} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Invite teammate</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    className={cn("hidden sm:inline-flex", topBarGhostActionClass)}
                    onClick={() => navigate("/settings?tab=team")}
                  >
                    Invite
                  </Button>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </header>
  )
}
