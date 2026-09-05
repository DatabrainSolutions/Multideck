import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, CheckCircle2, Menu, PencilEdit01, TriangleAlert, X, XCircle } from "@/components/icons/hugeicons"
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
import { dismissWorkspaceNotification, markWorkspaceNotificationRead, workspaceNotificationFromRow, type WorkspaceNotification } from "@/lib/notification-api"
import { supabase } from "@/lib/supabase"

const warehouseItemsScrollKey = "multideck:warehouse:items:scroll-top"

async function retryNotificationAction(action: () => Promise<void>) {
  let lastError: unknown
  for (const delay of [0, 500, 1_500]) {
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay))
    try {
      await action()
      return
    } catch (reason) {
      lastError = reason
    }
  }
  throw lastError
}

function quoteResponsePresentation(notification: WorkspaceNotification) {
  const decision = typeof notification.metadata.decision === "string" ? notification.metadata.decision : ""
  if (decision === "accepted") return { label: "Accepted", toneClass: "bg-[var(--md-status-green-bg)] text-[var(--md-status-green-ink)]", icon: CheckCircle2 }
  if (decision === "declined") return { label: "Declined", toneClass: "bg-[var(--md-status-red-bg)] text-[var(--md-status-red-ink)]", icon: XCircle }
  if (decision === "challenged") return { label: "Changes requested", toneClass: "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]", icon: PencilEdit01 }
  return { label: "Customer response", toneClass: "bg-[var(--md-status-amber-bg)] text-[var(--md-status-amber-ink)]", icon: TriangleAlert }
}

function CustomerResponseNotificationQueue({
  currentUser,
  navigate,
  route,
}: {
  currentUser?: AuthUserSummary | null
  navigate: (path: string) => void
  route: string
}) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [queue, setQueue] = useState<WorkspaceNotification[]>([])
  const [waitingForRoute, setWaitingForRoute] = useState<string | null>(null)
  const seenIds = useRef(new Set<string>())
  const active = queue[0] ?? null

  const enqueue = useCallback((row: Record<string, unknown>) => {
    if (!currentUser?.internalUserId || row.CommNotif_UserID !== currentUser.internalUserId) return
    const notification = workspaceNotificationFromRow(row)
    if (notification.status !== "unread"
      || notification.metadata.event_type !== "quote_response"
      || seenIds.current.has(notification.id)) return
    seenIds.current.add(notification.id)
    setQueue((current) => [...current, notification].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)))
  }, [currentUser?.internalUserId])

  useEffect(() => {
    const client = supabase
    const internalUserId = currentUser?.internalUserId
    if (!client || !internalUserId) return
    let disposed = false
    let retryTimer = 0
    let channel: ReturnType<typeof client.channel> | null = null

    const connect = () => {
      if (disposed) return
      const nextChannel = client
        .channel(`quote-response-popups-${crypto.randomUUID()}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "Comm_Notifications",
          filter: `CommNotif_UserID=eq.${internalUserId}`,
        }, (payload) => enqueue(payload.new as Record<string, unknown>))
      channel = nextChannel
      nextChannel.subscribe((status) => {
        if (disposed || channel !== nextChannel || status === "SUBSCRIBED") return
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          channel = null
          if (status !== "CLOSED") void client.removeChannel(nextChannel)
          window.clearTimeout(retryTimer)
          retryTimer = window.setTimeout(connect, 2_500)
        }
      })
    }

    connect()
    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      const activeChannel = channel
      channel = null
      if (activeChannel) void client.removeChannel(activeChannel)
    }
  }, [currentUser?.internalUserId, enqueue])

  const advance = useCallback(() => {
    setQueue((current) => current.slice(1))
    setWaitingForRoute(null)
  }, [])

  useEffect(() => {
    if (!active || waitingForRoute) return
    const timer = window.setTimeout(advance, 5_500)
    return () => window.clearTimeout(timer)
  }, [active, waitingForRoute, advance])

  useLayoutEffect(() => {
    if (!waitingForRoute || route !== waitingForRoute) return
    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(advance)
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
    }
  }, [route, waitingForRoute, advance])

  if (!active) return null
  const presentation = quoteResponsePresentation(active)
  const ResponseIcon = presentation.icon
  const actionUrl = typeof active.metadata.action_url === "string" && active.metadata.action_url.startsWith("/")
    ? active.metadata.action_url
    : null

  function closeNotification() {
    advance()
    void retryNotificationAction(() => dismissWorkspaceNotification(active.id)).catch(() => {
      // The bell retains the notification when persistence cannot be confirmed.
    })
  }

  function openNotification() {
    void retryNotificationAction(() => markWorkspaceNotificationRead(active.id)).catch(() => {
      // Navigation remains useful; the bell can still be updated manually.
    })
    if (!actionUrl) {
      advance()
      return
    }
    setWaitingForRoute(actionUrl)
    navigate(actionUrl)
  }

  return (
    <div className="pointer-events-none fixed end-4 top-4 z-[90] w-[min(390px,calc(100vw-2rem))] sm:end-5 sm:top-5" aria-live="polite" aria-atomic="true">
      <AnimatePresence initial={false} mode="wait">
        <motion.section
          key={active.id}
          role="region"
          aria-label={t("Customer quote response")}
          initial={shouldReduceMotion ? false : { opacity: 0, y: -10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.99 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-glass-strong)] p-1.5 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl"
        >
          <div className="flex items-start gap-2.5 rounded-[calc(var(--md-radius-xl)-6px)] bg-[var(--md-surface)] px-3 py-3 shadow-[var(--md-shadow-line)]">
            <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-md)]", presentation.toneClass)}>
              <ResponseIcon className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <button type="button" className="min-w-0 flex-1 text-start outline-none focus-visible:rounded-[var(--md-radius-md)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={openNotification}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-medium uppercase tracking-[0.065em] text-[var(--md-subtle)]">{t(presentation.label)}</span>
                <span className="text-[10.5px] text-[var(--md-subtle)]">{t("Customer quote response")}</span>
              </span>
              <span className="mt-1 block text-[13px] font-medium leading-5 text-[var(--md-ink)]">{t(active.title)}</span>
              <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--md-text)]">{t(active.body)}</span>
              {actionUrl ? <span className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--md-accent)]">{t(waitingForRoute ? "Opening quote..." : "Open quote")}<ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" /></span> : null}
            </button>
            <Button type="button" variant="ghost" size="icon" aria-label={t("Dismiss notification")} className="size-9 shrink-0 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]" onClick={closeNotification}>
              <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Button>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  )
}

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
      <CustomerResponseNotificationQueue currentUser={currentUser} navigate={navigate} route={route} />
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
