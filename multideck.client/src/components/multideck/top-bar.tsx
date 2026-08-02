import { useEffect, useState } from "react"
import { Menu, MoreHorizontal, Plus, Upload, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import { AppBreadcrumbs } from "./app-breadcrumbs"
import { CommandInput } from "./command-input"
import { AppSidebar } from "./app-sidebar"

const topBarGhostActionClass =
  "h-9 rounded-[var(--md-radius-lg)] bg-white/42 px-3 text-[12.5px] font-medium leading-none text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"

const topBarPrimaryActionClass =
  "h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[12.5px] font-medium leading-none text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] hover:shadow-[0_14px_26px_var(--md-accent-a18)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a16)]"

const topBarIconActionClass =
  "rounded-[var(--md-radius-md)] bg-white/42 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"

export function TopBar({
  route,
  navigate,
}: {
  route: string
  navigate: (path: string) => void
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
  const isReports = route === "/reports"
  const isOperationalJobScreen = route === "/" || route.startsWith("/bookings") || route.startsWith("/quotes") || isRoadRoute || isWarehouse
  const { direction, t } = useLanguage()
  const [currentLeadName, setCurrentLeadName] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isCrmLeadDetail && !isCrmLeadConversion) {
      setCurrentLeadName(null)
      return
    }

    let active = true
    const leadId = route.split("/")[3]
    void import("@/data/multideck-data").then(({ customers }) => {
      if (active) setCurrentLeadName(customers.find((customer) => customer.id === leadId)?.name ?? null)
    })

    return () => {
      active = false
    }
  }, [isCrmLeadConversion, isCrmLeadDetail, route])

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
          <AppBreadcrumbs route={route} navigate={navigate} leafLabel="Marlow Apparel Ltd" className="min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-none md:min-w-[210px]" />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              className={topBarGhostActionClass}
              onClick={() =>
                toast.success("Share link copied", {
                  description: "Marlow Apparel's account link is ready to send.",
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
              <span className="hidden sm:inline">New booking for Marlow</span>
              <span className="sm:hidden">New booking</span>
            </Button>
          </div>
        </>
      ) : isCrmLeadConversion ? (
        <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentLeadName} className="min-w-0 md:min-w-[210px]" />
      ) : isCrmLeadDetail ? (
        <>
          <AppBreadcrumbs route={route} navigate={navigate} leafLabel={currentLeadName} className="min-w-0 max-w-[120px] sm:max-w-[180px] md:max-w-none md:min-w-[210px]" />
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              className={topBarGhostActionClass}
              onClick={() => toast.success("Activity logged", { description: `${currentLeadName ?? "Lead"} has a new CRM note.` })}
            >
              Log activity
            </Button>
            <Button variant="ghost" size="icon" aria-label="More lead actions" className={topBarIconActionClass}>
              <MoreHorizontal data-icon="inline-start" strokeWidth={1.2} />
            </Button>
            <Button
              className={topBarPrimaryActionClass}
              onClick={() => navigate(`${route}/convert`)}
            >
              {t("Convert to deal")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <AppBreadcrumbs route={route} navigate={navigate} className="hidden min-w-[210px] md:block" />
          <div className="ml-auto min-w-0 flex-1 md:max-w-[560px]">
            <CommandInput placeholder={isBookingList || isRoadRoute ? "Job, reference, customer, route..." : isQuotes ? "Quote, customer, route, reference..." : isWarehouse ? "SKU, bin, order, customer, goods movement..." : isCustomerList ? "Search customers, contacts, or bookings..." : isCrmRoute ? "Search leads, contacts, deals, emails, lists, or marketing..." : isReports ? "Report name, template, customer..." : "Ask Multideck or jump to anything..."} onNavigate={navigate} />
          </div>
          {isBookingList ? (
            <>
              <Button variant="ghost" className={cn("hidden sm:inline-flex", topBarGhostActionClass)}>
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import CSV
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() => navigate("/bookings/new")}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New booking</span>
              </Button>
            </>
          ) : isWarehouse ? (
            <>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() =>
                  toast.success("Warehouse movement drafted", {
                    description: "Choose goods in, goods out, adjustment, or transfer next.",
                  })
                }
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">{t("New pick")}</span>
                <span className="sm:hidden">New</span>
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
          ) : isCrmRoute ? (
            <>
              <Button
                variant="ghost"
                className={cn("hidden sm:inline-flex", topBarGhostActionClass)}
                onClick={() =>
                  toast.success("CRM import opened", {
                    description: "Add leads, contacts, deals, or relationship notes.",
                  })
                }
              >
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() =>
                  toast.success("CRM record draft created", {
                    description: "Choose lead, contact, deal, or note next.",
                  })
                }
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New CRM record</span>
                <span className="sm:hidden">New</span>
              </Button>
            </>
          ) : isReports ? (
            <>
              <Button
                variant="ghost"
                className={cn("hidden sm:inline-flex", topBarGhostActionClass)}
                onClick={() =>
                  toast.success("Report schedules opened", {
                    description: "Review cadence, recipients, and upcoming runs.",
                  })
                }
              >
                Schedules
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() =>
                  toast.success("New report draft created", {
                    description: "Choose a template, customer scope, and output format next.",
                  })
                }
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New report</span>
              </Button>
            </>
          ) : (
            <>
              {!isOperationalJobScreen ? (
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
              <Button
                className={topBarPrimaryActionClass}
                onClick={() => navigate(isRoadRoute ? "/road-control/new" : "/bookings/new")}
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New booking</span>
              </Button>
            </>
          )}
        </>
      )}
    </header>
  )
}
