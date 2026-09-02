import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Menu } from "@/components/icons/hugeicons"
import type { AuthUserSummary } from "@/lib/auth-user"
import { useSidebarCollapsed } from "@/lib/sidebar-preferences"
import { useLanguage } from "@/i18n/language-provider"
import { Button } from "@/components/ui/button"
import { moveTabToAdjacentField } from "@/components/ui/field-tab-navigation"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { AppSidebar } from "./app-sidebar"
import { SupportTicketDialog } from "./support-ticket-dialog"
import { TopBar } from "./top-bar"
import { MeetingDialogHost } from "./meeting-dialog"
import { cn } from "@/lib/utils"
import { InboxWorkspaceProvider } from "@/lib/inbox-workspace"
import { supportTicketFeatureEnabled } from "@/lib/support-ticket-feature"

const warehouseItemsScrollKey = "multideck:warehouse:items:scroll-top"

function readWarehouseItemsScrollTop() {
  try {
    const value = Number(window.sessionStorage.getItem(warehouseItemsScrollKey))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function writeWarehouseItemsScrollTop(value: number) {
  try {
    window.sessionStorage.setItem(warehouseItemsScrollKey, String(Math.max(0, value)))
  } catch {
    // Navigation still works when browser storage is unavailable; only the
    // convenience of restoring this register position is skipped.
  }
}

export function AppShell({
  route,
  navigate,
  children,
  currentUser,
}: {
  route: string
  navigate: (path: string) => void
  children: ReactNode
  currentUser?: AuthUserSummary | null
}) {
  const isSettingsRoute = route === "/settings"
  const isHomeRoute = route === "/"
  const isAgentRoute = route === "/agent-dexter"
  const isInboxRoute = route === "/inbox"
  const isDocumentsRoute = route === "/documents"
  const isBookingDetailRoute = route.startsWith("/bookings/")
    && route !== "/bookings/new"
    && route !== "/bookings/provisional"
  // Routes that own the whole viewport: they scroll their own panes, so the shell
  // must not add page padding, a top bar, or a second scroll axis around them.
  // Home is one of them because its prompt has to sit at exactly the height the
  // Dexter conversation's does — any page padding between them would show up as
  // a jump the moment a conversation starts.
  const isFullHeightRoute = isHomeRoute || isAgentRoute || isInboxRoute || isDocumentsRoute
  const isChromeTightRoute = route.startsWith("/quotes/") || isBookingDetailRoute || route === "/bookings/provisional"
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const pageScrollRef = useRef<HTMLElement>(null)
  const { direction, t } = useLanguage()

  useLayoutEffect(() => {
    const scrollRegion = pageScrollRef.current
    if (!scrollRegion || route !== "/warehouse/items") return

    const target = readWarehouseItemsScrollTop()
    let frame = 0
    let attempts = 0

    // The register rows arrive asynchronously. Restore as soon as its full
    // height can contain the saved position instead of letting an early,
    // clamped scroll-to-zero win the race.
    const restore = () => {
      const maxScrollTop = Math.max(0, scrollRegion.scrollHeight - scrollRegion.clientHeight)
      scrollRegion.scrollTop = Math.min(target, maxScrollTop)
      if (maxScrollTop >= target || attempts >= 120) return
      attempts += 1
      frame = window.requestAnimationFrame(restore)
    }

    restore()

    return () => {
      window.cancelAnimationFrame(frame)
      writeWarehouseItemsScrollTop(scrollRegion.scrollTop)
    }
  }, [route])

  const shell = (
    <div className="h-screen w-full max-w-full overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="flex h-screen w-full min-h-0 min-w-0 overflow-hidden">
        <AppSidebar
          route={route}
          navigate={navigate}
          currentUser={currentUser}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          className="hidden h-screen min-h-0 lg:flex"
        />
        {isFullHeightRoute ? (
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Open navigation")}
                title={t("Open navigation")}
                className="fixed start-4 top-4 z-40 size-10 rounded-full bg-[var(--md-glass-strong)] text-[var(--md-ink)] shadow-[var(--md-shadow-soft)] backdrop-blur-xl hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] lg:hidden"
              >
                <Menu className="size-[18px]" strokeWidth={1.3} />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={direction === "rtl" ? "right" : "left"}
              showCloseButton={false}
              className="gap-0 border-0 bg-[var(--md-sidebar-bg)] p-0 shadow-[var(--md-shadow-lift)] data-[side=left]:w-[min(var(--md-sidebar-width),calc(100vw-20px))] data-[side=left]:max-w-[var(--md-sidebar-width)] data-[side=right]:w-[min(var(--md-sidebar-width),calc(100vw-20px))] data-[side=right]:max-w-[var(--md-sidebar-width)]"
            >
              <SheetTitle className="sr-only">{t("Multideck navigation")}</SheetTitle>
              <SheetDescription className="sr-only">{t("Mobile navigation for Multideck")}</SheetDescription>
              <AppSidebar
                route={route}
                navigate={(path) => {
                  setMobileSidebarOpen(false)
                  navigate(path)
                }}
                currentUser={currentUser}
                onRequestClose={() => setMobileSidebarOpen(false)}
              />
            </SheetContent>
          </Sheet>
        ) : null}
        <main
          ref={pageScrollRef}
          onKeyDownCapture={moveTabToAdjacentField}
          onScroll={route === "/warehouse/items" ? (event) => writeWarehouseItemsScrollTop(event.currentTarget.scrollTop) : undefined}
          className={cn(
            "min-h-0 min-w-0 max-w-full flex-1 overscroll-x-none",
            isFullHeightRoute ? "overflow-hidden" : "overflow-x-clip overflow-y-auto md-scrollbar",
            !isSettingsRoute && !isFullHeightRoute && !isChromeTightRoute && "px-[var(--md-page-pad)] pb-[var(--md-page-pad)]",
          )}
        >
          {isSettingsRoute || isFullHeightRoute || isChromeTightRoute ? null : <TopBar route={route} navigate={navigate} currentUser={currentUser} />}
          {children}
        </main>
      </div>
      {currentUser?.actorType === "internal" ? <MeetingDialogHost navigate={navigate} /> : null}
      {supportTicketFeatureEnabled ? <SupportTicketDialog currentUser={currentUser} /> : null}
    </div>
  )

  // Keep the authenticated Inbox cache alive across route changes without
  // making every Multideck page pay for mailbox and thread reads. Sidebar
  // intent can prepare account metadata; thread rows load only on Inbox.
  return (
    <InboxWorkspaceProvider cacheScope={currentUser?.id ?? null} active={isInboxRoute}>
      {shell}
    </InboxWorkspaceProvider>
  )
}
