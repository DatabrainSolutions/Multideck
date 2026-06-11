import { ArrowLeft, Menu, MoreHorizontal, Plus, Upload, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CommandInput } from "./command-input"
import { AppSidebar } from "./app-sidebar"

export function TopBar({
  route,
  navigate,
}: {
  route: string
  navigate: (path: string) => void
}) {
  const isCustomerList = route === "/customers"
  const isCustomerDetail = route.startsWith("/customers/")
  const isShipmentList = route === "/shipments"
  const isReports = route === "/reports"

  return (
    <header className="sticky top-0 z-10 -mx-[var(--md-page-pad)] mb-8 flex min-h-[56px] items-center gap-4 border-b border-[rgba(11,20,19,0.06)] bg-[rgba(223,234,231,0.9)] px-[var(--md-page-pad)] py-2 backdrop-blur-xl">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-md)] bg-white/50 shadow-[var(--md-shadow-line)] lg:hidden">
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
          <button type="button" className="flex min-w-0 items-center gap-3 text-[14px] font-medium text-[var(--md-text)]" onClick={() => navigate("/customers")}>
            <ArrowLeft className="size-4" strokeWidth={1.2} />
            <span>Customers</span>
          </button>
          <span className="hidden text-[var(--md-subtle)] md:inline">/</span>
          <p className="hidden text-[14px] font-medium text-[var(--md-ink)] md:block">Marlow Apparel Ltd</p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() =>
                toast.success("Share link copied", {
                  description: "Marlow Apparel's account link is ready to send.",
                })
              }
            >
              Share
            </Button>
            <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-md)] bg-white/35 shadow-[var(--md-shadow-line)]">
              <MoreHorizontal data-icon="inline-start" strokeWidth={1.2} />
            </Button>
            <Button
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              onClick={() =>
                toast.success("Shipment draft created", {
                  description: "A new Marlow Apparel shipment is ready to complete.",
                })
              }
            >
              <span className="hidden sm:inline">New shipment for Marlow</span>
              <span className="sm:hidden">New shipment</span>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="hidden min-w-[210px] text-[15px] font-medium text-[var(--md-text)] md:block">{isShipmentList ? "Shipments" : isCustomerList ? "Customers" : isReports ? "Reports" : "Today - Tue 26 May"}</p>
          <div className="ml-auto min-w-0 flex-1 md:max-w-[560px]">
            <CommandInput placeholder={isShipmentList ? "ID, container, customer, BoL, HS code..." : isCustomerList ? "Search customers, contacts, or shipments..." : isReports ? "Report name, template, customer..." : "Ask Multideck or jump to anything..."} />
          </div>
          {isShipmentList ? (
            <>
              <Button variant="ghost" className="hidden h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65 sm:inline-flex">
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import CSV
              </Button>
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() =>
                  toast.success("Shipment draft created", {
                    description: "Add the customer, route, and documents next.",
                  })
                }
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New shipment</span>
              </Button>
            </>
          ) : isCustomerList ? (
            <>
              <Button variant="ghost" className="hidden h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65 sm:inline-flex">
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Import
              </Button>
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
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
          ) : isReports ? (
            <>
              <Button
                variant="ghost"
                className="hidden h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65 sm:inline-flex"
                onClick={() =>
                  toast.success("Report schedules opened", {
                    description: "Review cadence, recipients, and upcoming runs.",
                  })
                }
              >
                Schedules
              </Button>
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
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
                  <Button variant="ghost" size="icon" className="hidden rounded-[var(--md-radius-md)] bg-white/50 shadow-[var(--md-shadow-line)] sm:inline-flex md:hidden">
                    <UserRoundPlus data-icon="inline-start" strokeWidth={1.2} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Invite teammate</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                className="hidden h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70 sm:inline-flex"
                onClick={() =>
                  toast.success("Invite link copied", {
                    description: "The Northwind workspace invite is ready to send.",
                  })
                }
              >
                Invite
              </Button>
              <Button
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                onClick={() =>
                  toast.success("Shipment draft created", {
                    description: "Add the customer, route, and documents next.",
                  })
                }
              >
                <Plus data-icon="inline-start" strokeWidth={1.2} />
                <span className="hidden sm:inline">New shipment</span>
              </Button>
            </>
          )}
        </>
      )}
    </header>
  )
}
