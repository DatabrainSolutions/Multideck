import { ArrowLeft, Menu, MoreHorizontal, Plus, Upload, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/i18n/language-provider"
import type { LanguageCode } from "@/i18n/languages"
import { cn } from "@/lib/utils"
import { CommandInput } from "./command-input"
import { AppSidebar } from "./app-sidebar"
import { customers } from "@/data/multideck-data"

function getTopBarDateLabel(language: LanguageCode, todayLabel: string) {
  const locale: Record<LanguageCode, string> = {
    "en-GB": "en-GB",
    "en-US": "en-US",
    de: "de-DE",
    fr: "fr-FR",
    ar: "ar-GB-u-ca-gregory",
  }
  const date = new Intl.DateTimeFormat(locale[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date())

  return `${todayLabel} - ${date}`
}

const topBarBackButtonClass =
  "-mx-2 flex min-w-0 items-center gap-3 rounded-[var(--md-radius-md)] px-2 py-1.5 text-[14px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/42 hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.16)]"

const topBarGhostActionClass =
  "h-10 rounded-[var(--md-radius-lg)] bg-white/42 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"

const topBarPrimaryActionClass =
  "h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white shadow-[0_10px_22px_rgba(14,125,116,0.14)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] hover:shadow-[0_14px_26px_rgba(14,125,116,0.18)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.16)]"

const topBarIconActionClass =
  "rounded-[var(--md-radius-md)] bg-white/42 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-white/70 hover:shadow-[var(--md-shadow-soft)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"

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
  const isBookingList = route === "/bookings"
  const isBookingWizard = route === "/bookings/new"
  const isReports = route === "/reports"
  const { language, t } = useLanguage()
  const todayLabel = getTopBarDateLabel(language, t("Today"))
  const crmRouteLabel: Record<string, string> = {
    "/crm": "CRM",
    "/crm/accounts": "Leads",
    "/crm/leads": "Leads",
    "/crm/contacts": "Contacts",
    "/crm/deals": "Deals",
    "/crm/emails": "Emails",
    "/crm/lists": "Lists",
    "/crm/marketing": "Marketing",
    "/crm/activity": "Activity",
    "/crm/settings": "CRM settings",
  }
  const currentLead = isCrmLeadDetail ? customers.find((customer) => customer.id === route.split("/").at(-1)) : undefined

  return (
    <header className="sticky top-0 z-10 -mx-[var(--md-page-pad)] mb-[var(--md-page-stack-gap)] flex min-h-[56px] items-center gap-[var(--md-gap-lg)] border-b border-[var(--md-line)] bg-[var(--md-topbar-bg)] px-[var(--md-page-pad)] py-[var(--md-gap-sm)] backdrop-blur-xl">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className={cn(topBarIconActionClass, "bg-[var(--md-glass-strong)] lg:hidden")}>
            <Menu data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="data-[side=left]:w-[min(var(--md-sidebar-width),calc(100vw-24px))] data-[side=left]:max-w-[var(--md-sidebar-width)] gap-0 border-0 bg-[var(--md-sidebar-bg)] p-0 shadow-[var(--md-shadow-lift)]"
        >
          <SheetTitle className="sr-only">Multideck navigation</SheetTitle>
          <SheetDescription className="sr-only">Mobile navigation for Multideck modules and boards.</SheetDescription>
          <AppSidebar route={route} navigate={navigate} />
        </SheetContent>
      </Sheet>

      {isCustomerDetail ? (
        <>
          <button type="button" className={topBarBackButtonClass} onClick={() => navigate("/customers")}>
            <ArrowLeft className="size-4" strokeWidth={1.2} />
            <span>Customers</span>
          </button>
          <span className="hidden text-[var(--md-subtle)] md:inline">/</span>
          <p className="hidden text-[14px] font-medium text-[var(--md-ink)] md:block">Marlow Apparel Ltd</p>
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
              onClick={() =>
                toast.success("Booking draft created", {
                  description: "A new Marlow Apparel booking is ready to complete.",
                })
              }
            >
              <span className="hidden sm:inline">New booking for Marlow</span>
              <span className="sm:hidden">New booking</span>
            </Button>
          </div>
        </>
      ) : isCrmLeadDetail ? (
        <>
          <button type="button" className={topBarBackButtonClass} onClick={() => navigate("/crm/leads")}>
            <ArrowLeft className="size-4" strokeWidth={1.2} />
            <span>Leads</span>
          </button>
          <span className="hidden text-[var(--md-subtle)] md:inline">/</span>
          <p className="hidden truncate text-[14px] font-medium text-[var(--md-ink)] md:block">{currentLead?.name ?? "Lead detail"}</p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              className={topBarGhostActionClass}
              onClick={() => toast.success("Activity logged", { description: `${currentLead?.name ?? "Lead"} has a new CRM note.` })}
            >
              Log activity
            </Button>
            <Button variant="ghost" size="icon" aria-label="More lead actions" className={topBarIconActionClass}>
              <MoreHorizontal data-icon="inline-start" strokeWidth={1.2} />
            </Button>
            <Button
              className={topBarPrimaryActionClass}
              onClick={() => toast.success("Deal draft created", { description: `${currentLead?.name ?? "Lead"} is ready for quote and pricing setup.` })}
            >
              Convert to deal
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="hidden min-w-[210px] text-[15px] font-medium text-[var(--md-text)] md:block">{isBookingList ? "Bookings" : isBookingWizard ? "New booking" : isCustomerList ? "Customers" : isCrmRoute ? crmRouteLabel[route] ?? (route.startsWith("/crm/leads/") ? "Lead detail" : route.startsWith("/crm/lists/") ? "List detail" : route.includes("/stats") ? "Email statistics" : route.includes("/edit") ? "Email editor" : "CRM") : isReports ? "Reports" : todayLabel}</p>
          <div className="ml-auto min-w-0 flex-1 md:max-w-[560px]">
            <CommandInput placeholder={isBookingList ? "ID, container, customer, BoL, HS code..." : isCustomerList ? "Search customers, contacts, or bookings..." : isCrmRoute ? "Search leads, contacts, deals, emails, lists, or marketing..." : isReports ? "Report name, template, customer..." : "Ask Multideck or jump to anything..."} />
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
          ) : isCustomerList ? (
            <>
              <Button variant="ghost" className={cn("hidden sm:inline-flex", topBarGhostActionClass)}>
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() =>
                  toast.success("Customer draft created", {
                    description: "Add account details and contacts next.",
                  })
                }
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className={cn("hidden sm:inline-flex md:hidden", topBarIconActionClass)}>
                    <UserRoundPlus data-icon="inline-start" strokeWidth={1.2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Invite teammate</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                className={cn("hidden sm:inline-flex", topBarGhostActionClass)}
                onClick={() =>
                  toast.success("Invite link copied", {
                    description: "The Northwind workspace invite is ready to send.",
                  })
                }
              >
                Invite
              </Button>
              <Button
                className={topBarPrimaryActionClass}
                onClick={() =>
                  toast.success("Booking draft created", {
                    description: "Add the customer, route, and documents next.",
                  })
                }
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
