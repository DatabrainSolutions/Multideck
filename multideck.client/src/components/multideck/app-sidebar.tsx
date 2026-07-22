import { useEffect, useState, type ReactNode } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Bell, Boxes, CheckCircle2, ChevronDown, Clock3, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button, buttonVariants } from "@/components/ui/button"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { supabase } from "@/lib/supabase"
import { useAiAgentName } from "@/lib/user-preferences"
import { customerWarehouseNavigation, sidebarAreas, type NavItem, type SidebarArea, type SidebarDestination } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

const sidebarItemTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

const sidebarActiveTransition = {
  type: "spring" as const,
  stiffness: 430,
  damping: 42,
  mass: 0.7,
}

type SidebarActiveTarget = {
  top: number
  left: number
  width: number
  height: number
  borderRadius: string
}
const sidebarPaneTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

const navReveal = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      staggerChildren: 0.018,
      delayChildren: 0.01,
    },
  },
}

const navItemReveal = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: sidebarItemTransition },
}

const notificationsReveal = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.05,
    },
  },
}

const notificationItemReveal = {
  hidden: { opacity: 0, y: -6 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
}

const sidebarNotifications: Array<{
  icon: LucideIcon
  title: string
  description: string
  time: string
  tone: "amber" | "teal" | "neutral"
}> = [
  {
    icon: TriangleAlert,
    title: "Customs hold needs review",
    description: "MD-22455 is waiting on licence confirmation.",
    time: "8 min",
    tone: "amber",
  },
  {
    icon: Clock3,
    title: "ETA slipped over threshold",
    description: "Felixstowe arrival moved by 7 hours.",
    time: "24 min",
    tone: "neutral",
  },
  {
    icon: CheckCircle2,
    title: "Customer update approved",
    description: "Dexter sent the Marlow Apparel draft.",
    time: "1 hr",
    tone: "teal",
  },
]

function NotificationBell() {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  function openNotificationSettings() {
    window.history.pushState({}, "", "/settings?tab=notifications")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("Open notifications")}
          title={t("Open notifications")}
          className="group relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] data-[state=open]:bg-[var(--md-bg-strong)] data-[state=open]:text-[var(--md-accent)]"
        >
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(14,125,116,0.14),transparent_58%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <motion.span
            animate={shouldReduceMotion ? undefined : { rotate: [0, -7, 6, 0] }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <Bell className="size-4" strokeWidth={1.3} />
          </motion.span>
          <motion.span
            className="absolute end-2.5 top-2.5 size-1.5 rounded-full bg-[var(--md-amber)] shadow-[0_0_0_2px_var(--md-glass)]"
            animate={shouldReduceMotion ? undefined : { scale: [1, 1.35, 1] }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], repeat: Infinity, repeatDelay: 1.4 }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={direction === "rtl" ? "left" : "right"}
        align="start"
        alignOffset={10}
        sideOffset={18}
        collisionPadding={18}
        className="w-[312px] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]"
      >
        <div className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Notifications</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">3 updates need attention</p>
          </div>
          <span className="rounded-[var(--md-radius-sm)] bg-[rgba(221,138,43,0.12)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--md-amber)]">
            New
          </span>
        </div>
        <motion.div
          className="divide-y divide-[rgba(11,20,19,0.07)] shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]"
          variants={shouldReduceMotion ? undefined : notificationsReveal}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "show"}
        >
          {sidebarNotifications.map((notification) => {
            const Icon = notification.icon
            const iconTone =
              notification.tone === "amber"
                ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]"
                : notification.tone === "teal"
                  ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]"
                  : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"

            return (
              <motion.button
                key={notification.title}
                type="button"
                variants={shouldReduceMotion ? undefined : notificationItemReveal}
                className="group grid w-full grid-cols-[30px_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-[background,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)]"
              >
                <span className={cn("grid size-[30px] place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)] transition-transform duration-200 group-hover:scale-[1.04]", iconTone)}>
                  <Icon className="size-3.5" strokeWidth={1.3} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{notification.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-5 text-[var(--md-text)]">{notification.description}</span>
                </span>
                <span className="pt-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{notification.time}</span>
              </motion.button>
            )
          })}
        </motion.div>
        <div className="px-3 py-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
            onClick={openNotificationSettings}
          >
            Review notification settings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SidebarNavItem({
  item,
  isActive,
  onClick,
  accent = "default",
  collapsed = false,
  expanded,
  trailing,
  nested = false,
}: {
  item: NavItem
  isActive?: boolean
  onClick?: () => void
  accent?: "default" | "dexter"
  collapsed?: boolean
  expanded?: boolean
  trailing?: ReactNode
  nested?: boolean
}) {
  const Icon = item.icon
  const { t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const isDisabled = !onClick
  const isDexterItem = accent === "dexter"
  const valueTone =
    accent === "dexter" ? "bg-[var(--md-accent)] text-white" :
    item.label === "Documents" ? "bg-[var(--md-accent)] text-white" :
    item.label === "Exceptions" || item.value === "2" ? "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]" :
    item.label === "Bookings" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" :
    item.label === "Customers" ? "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]" :
    "bg-transparent text-[var(--md-text)]"

  return (
    <button
      type="button"
      aria-current={isActive ? "page" : undefined}
      aria-disabled={isDisabled || undefined}
      aria-expanded={expanded}
      aria-label={collapsed ? t(item.label) : undefined}
      title={t(item.label)}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "group relative h-10 w-full justify-start gap-2 overflow-hidden rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-[color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        nested && "h-9 text-[13px]",
        "bg-transparent hover:bg-transparent hover:text-[var(--md-ink)] aria-expanded:bg-transparent dark:hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        isDexterItem && "md-sidebar-dexter-item !text-white hover:!text-white focus-visible:!text-white",
        collapsed && "justify-center px-0",
        isActive && "text-[var(--md-ink)]",
        accent === "dexter" && isActive && "!text-white",
        isDisabled && "cursor-default opacity-55 hover:text-[var(--md-text)]",
        !isDisabled && !collapsed && !isDexterItem && "hover:scale-[1.004] active:scale-[0.986] motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
      )}
      style={{
        transitionDuration: "150ms",
        transitionProperty: "color, opacity, scale, box-shadow",
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      disabled={isDisabled}
      onClick={onClick}
    >
      {isDexterItem ? (
        <>
          <span className="md-dexter-pill__shader" aria-hidden="true">
            <SpectralBloomShader />
          </span>
          <span className="md-dexter-pill__contrast" aria-hidden="true" />
          {isActive ? (
            <span
              data-sidebar-active-surface
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-[1] rounded-[var(--md-radius-md)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.48),0_7px_16px_rgba(42,52,50,0.12)]"
            />
          ) : null}
        </>
      ) : isActive ? (
        <span
          data-sidebar-active-surface
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-md)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]"
        />
      ) : !isDisabled ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-[0.985] rounded-[var(--md-radius-md)] bg-[var(--md-hover)] opacity-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(11,20,19,0.035)] transition-[opacity,transform] duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          style={{
            transitionDuration: "100ms",
            transitionProperty: "opacity, scale",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      ) : null}
      <span
        className={cn(
          "relative grid size-5 place-items-center text-[var(--md-subtle)] transition-[background,color] duration-200",
          !isActive && "rounded-[var(--md-radius-sm)] group-hover:bg-[var(--md-icon-well)] group-hover:text-[var(--md-ink)]",
          isActive && "text-[var(--md-accent)]",
          isDexterItem && "z-10 !text-white group-hover:bg-white/10 group-hover:!text-white",
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-full place-items-center transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-px group-hover:scale-[1.06] group-active:translate-y-0 group-active:scale-[0.94] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:scale-100 motion-reduce:group-active:scale-100"
          style={{
            transitionDuration: "150ms",
            transitionProperty: "translate, scale",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <Icon data-icon={collapsed ? undefined : "inline-start"} strokeWidth={1.2} />
        </span>
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-start", isDexterItem && "z-10", collapsed ? "sr-only !absolute" : "relative")}>{t(item.label)}</span>
      {item.value ? (
        <span
          className={cn(
            "relative rounded-full px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)]",
            valueTone,
            collapsed && "absolute end-1 top-1 min-w-2 px-0 text-[0px] leading-none",
          )}
        >
          {t(item.value)}
        </span>
      ) : null}
      {trailing && !collapsed ? <span className="relative ms-auto grid size-5 shrink-0 place-items-center text-[var(--md-subtle)]">{trailing}</span> : null}
    </button>
  )
}

function SidebarSection({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.nav
      className={cn("flex flex-col gap-1", className)}
      variants={shouldReduceMotion ? undefined : navReveal}
      initial={shouldReduceMotion ? undefined : "hidden"}
      animate={shouldReduceMotion ? undefined : "show"}
    >
      {children}
    </motion.nav>
  )
}

function SidebarSectionItem({ children }: { children: ReactNode }) {
  return <motion.div variants={navItemReveal}>{children}</motion.div>
}

function routeMatches(item: NavItem, route: string) {
  if (!item.route) return false
  if (item.route === "/") return route === "/"
  if (item.route === "/bookings") {
    return route === "/bookings" || (/^\/bookings\/[^/]+$/.test(route) && route !== "/bookings/new" && route !== "/bookings/provisional")
  }
  if (item.route === "/crm") return route === "/crm"
  if (item.route === "/warehouse") return route === "/warehouse"
  return route === item.route || route.startsWith(`${item.route}/`)
}

function destinationMatches(destination: SidebarDestination, route: string) {
  return routeMatches(destination, route) || destination.children?.some((child) => routeMatches(child, route)) === true
}

function findAreaForRoute(route: string, areas: SidebarArea[] = sidebarAreas) {
  return areas.find((area) => area.destinations.some((destination) => destinationMatches(destination, route)))
}

function activeDestinationIds(area: SidebarArea | undefined, route: string) {
  if (!area) return []
  return area.destinations.filter((destination) => destination.children && destinationMatches(destination, route)).map((destination) => destination.id)
}

export function AppSidebar({
  route,
  navigate,
  className,
  currentUser,
  collapsed = false,
  onCollapsedChange,
}: {
  route: string
  navigate: (path: string) => void
  className?: string
  currentUser?: AuthUserSummary | null
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const { direction, t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const shouldReduceMotion = useReducedMotion()
  const isCustomer = currentUser?.actorType === "customer"
  const canManageWarehouseUsers = hasPermission(currentUser, "Warehouse.Users.ManageOwn")
  const customerDestinations = customerWarehouseNavigation.filter((item) =>
    item.route !== "/warehouse/users" || canManageWarehouseUsers)
  const availableAreas = isCustomer
    ? [{ id: "warehouse", label: "Warehouse", icon: Boxes, destinations: customerDestinations } satisfies SidebarArea]
    : sidebarAreas
  const initialArea = isCustomer ? availableAreas[0] : route === "/" || route === "/agent-dexter" ? undefined : findAreaForRoute(route, availableAreas)
  const [activeAreaId, setActiveAreaId] = useState<string | null>(initialArea?.id ?? null)
  const [expandedDestinationIds, setExpandedDestinationIds] = useState<Set<string>>(
    () => new Set(activeDestinationIds(initialArea, route)),
  )
  const activeArea = availableAreas.find((area) => area.id === activeAreaId)
  const ActiveAreaIcon = activeArea?.icon
  const accountName = currentUser?.name ?? currentUser?.email ?? t("Signed in")
  const accountDetail = currentUser?.name && currentUser.email ? currentUser.email : t("Signed in")
  const accountInitials = currentUser?.initials ?? "MD"
  const profileIsActive = route === "/settings" && activeArea?.id !== "administration"

  useEffect(() => {
    const routeArea = isCustomer ? availableAreas[0] : route === "/" || route === "/agent-dexter" ? undefined : findAreaForRoute(route, availableAreas)
    setActiveAreaId(routeArea?.id ?? null)
    setExpandedDestinationIds((current) => {
      const requiredIds = activeDestinationIds(routeArea, route)
      if (requiredIds.every((id) => current.has(id))) return current

      const next = new Set(current)
      requiredIds.forEach((id) => next.add(id))
      return next
    })
  }, [route, isCustomer, canManageWarehouseUsers]) // availableAreas is intentionally derived from the account type and permissions.

  function openArea(area: SidebarArea) {
    setActiveAreaId(area.id)
    setExpandedDestinationIds(new Set(activeDestinationIds(area, route)))
  }

  function toggleDestination(destinationId: string) {
    setExpandedDestinationIds((current) => {
      const next = new Set(current)
      if (next.has(destinationId)) next.delete(destinationId)
      else next.add(destinationId)
      return next
    })
  }

  const dexterSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={{ label: `Agent ${aiAgentName}`, icon: Sparkles, route: "/agent-dexter" }}
        isActive={route === "/agent-dexter"}
        onClick={() => navigate("/agent-dexter")}
        accent="dexter"
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  return (
    <aside
      data-sidebar-collapsed={collapsed ? "true" : undefined}
      data-sidebar-mode={activeArea?.id ?? "areas"}
      className={cn(
        "relative isolate flex h-full min-h-0 shrink-0 flex-col bg-[var(--md-sidebar-bg)] py-3 shadow-[var(--md-stroke-right)] transition-[width,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[var(--md-sidebar-collapsed-width)] px-2" : "w-[var(--md-sidebar-width)] px-[var(--md-gap-lg)]",
        className,
      )}
    >
      <div className={cn("relative z-10 flex h-10 items-center gap-2", collapsed ? "justify-center px-0" : "justify-between px-1")}>
        {collapsed ? null : (
          <img
            src={multideckFullLogo}
            alt="Multideck"
            className="h-[34px] min-w-0 max-w-[132px] object-contain transition-[filter,opacity] duration-200 dark:brightness-0 dark:invert"
          />
        )}
        {collapsed ? null : <NotificationBell />}
        {onCollapsedChange ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            title={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            className={cn(
              "size-10 rounded-[var(--md-radius-md)] bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
              !collapsed && "ms-1 size-9",
            )}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="size-4" strokeWidth={1.3} /> : <PanelLeftClose className="size-4" strokeWidth={1.3} />}
          </Button>
        ) : null}
      </div>

      <div
        className="relative z-10 mt-[var(--md-page-stack-gap)] min-h-0 flex-1 overflow-y-auto overflow-x-hidden md-scrollbar"
        style={{ contain: "layout paint" }}
      >
        {isCustomer ? null : <SidebarSection>{dexterSidebarItem}</SidebarSection>}

        <AnimatePresence mode="popLayout" initial={false}>
          {activeArea ? (
            <motion.div
              key={activeArea.id}
              className="mt-2 origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              {isCustomer ? null : <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={collapsed ? t("Back to all areas") : undefined}
                title={collapsed ? t("Back to all areas") : undefined}
                className={cn(
                  "h-9 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2 text-[13px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
                  collapsed && "justify-center px-0",
                )}
                onClick={() => {
                  setActiveAreaId(null)
                }}
              >
                <ArrowLeft data-icon="inline-start" className="size-4" strokeWidth={1.2} />
                <span className={cn(collapsed && "sr-only")}>{t("All areas")}</span>
              </Button>}

    <div className={cn("mt-3 flex items-center gap-2 px-2", collapsed && "justify-center px-0")}>
      {ActiveAreaIcon ? <ActiveAreaIcon className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} /> : null}
      <p className={cn("truncate text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]", collapsed && "sr-only")}>
        {t(activeArea.label)}
      </p>
    </div>

    <SidebarSection className="mt-3">
      {activeArea.destinations.map((destination) => {
        const hasChildren = Boolean(destination.children?.length)
        const isExpanded = expandedDestinationIds.has(destination.id)
        const destinationActive = destinationMatches(destination, route)

        return (
          <SidebarSectionItem key={destination.id}>
            <SidebarNavItem
              item={destination}
              isActive={!hasChildren && destinationActive}
              onClick={hasChildren ? () => toggleDestination(destination.id) : destination.route ? () => navigate(destination.route!) : undefined}
              collapsed={collapsed}
              expanded={hasChildren ? isExpanded : undefined}
              trailing={
                hasChildren ? (
                  <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}>
                    <ChevronDown className="size-3.5" strokeWidth={1.2} />
                  </motion.span>
                ) : undefined
              }
            />

            <AnimatePresence initial={false}>
              {hasChildren && isExpanded ? (
                <motion.div
                  className={cn("overflow-hidden", collapsed ? "mt-1" : "mt-1 ps-4")}
                  initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                  transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                >
                  <div className="flex flex-col gap-1 rounded-[var(--md-radius-lg)] bg-[rgba(255,255,255,0.3)] p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.48),0_1px_0_rgba(11,20,19,0.03)] dark:bg-[rgba(255,255,255,0.03)]">
                    {destination.children?.map((child) => (
                      <SidebarNavItem
                        key={`${destination.id}-${child.label}`}
                        item={child}
                        isActive={routeMatches(child, route)}
                        onClick={child.route ? () => navigate(child.route!) : undefined}
                        collapsed={collapsed}
                        nested
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </SidebarSectionItem>
        )
      })}
    </SidebarSection>
            </motion.div>
          ) : (
            <motion.div
              key="areas"
              className="origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              <SidebarSection className="mt-[var(--md-gap-sm)]">
                {availableAreas.map((area) => (
                  <SidebarSectionItem key={area.id}>
                    <SidebarNavItem item={{ label: area.label, icon: area.icon }} onClick={() => openArea(area)} collapsed={collapsed} />
                  </SidebarSectionItem>
                ))}
              </SidebarSection>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-10 mt-[var(--md-page-stack-gap)]">
        <Separator className="mb-[var(--md-page-stack-gap)] bg-[var(--md-line-strong)]" />
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-current={profileIsActive ? "page" : undefined}
              aria-label={collapsed ? t("Account menu") : undefined}
              title={collapsed ? accountName : undefined}
              className={cn(
                "group relative flex min-w-0 w-full items-center gap-3 overflow-hidden rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition-[color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.004] hover:text-[var(--md-ink)] active:scale-[0.986] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                collapsed && "justify-center px-0",
                profileIsActive && "text-[var(--md-ink)]",
              )}
              style={{
                transitionDuration: "150ms",
                transitionProperty: "color, opacity, scale, box-shadow",
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {profileIsActive ? (
                <span
                  data-sidebar-active-surface
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]"
                />
              ) : (
                <span
                  className="pointer-events-none absolute inset-0 scale-[0.985] rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-[opacity,transform] duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  style={{
                    transitionDuration: "100ms",
                    transitionProperty: "opacity, scale",
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              )}
              <Avatar className="relative size-10 rounded-full">
                <AvatarFallback className="rounded-full bg-[var(--md-avatar-bg)] text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip>{accountInitials}</AvatarFallback>
              </Avatar>
              <div className={cn("relative min-w-0 flex-1", collapsed && "sr-only")}>
                <p className="truncate text-[14px] font-medium text-[var(--md-ink)]" dir="auto" data-i18n-skip>{accountName}</p>
                <p className="truncate text-[12px] text-[var(--md-text)]" dir={currentUser?.email ? "ltr" : "auto"} data-i18n-skip={currentUser?.email ? true : undefined}>{accountDetail}</p>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side={direction === "rtl" ? "left" : "right"}
            align="end"
            alignOffset={-4}
            sideOffset={12}
            collisionPadding={18}
            className="w-[248px] overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-2 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]"
          >
            <div className="px-2 pb-2 pt-1">
              <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto" data-i18n-skip>{accountName}</p>
              <p className="mt-0.5 truncate text-[12px] text-[var(--md-text)]" dir={currentUser?.email ? "ltr" : "auto"} data-i18n-skip={currentUser?.email ? true : undefined}>{accountDetail}</p>
            </div>
            <Separator className="my-1 bg-[var(--md-line-strong)]" />
            {!isCustomer ? <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-text)] transition-[background,color,opacity,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
              onClick={() => navigate("/settings")}
            >
              <Settings data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              <span className="min-w-0 flex-1 truncate">{t("Account settings")}</span>
            </button> : null}
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-red)] transition-[background,color,opacity,transform] hover:bg-[rgba(209,78,78,0.08)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(209,78,78,0.14)]"
              onClick={() => void supabase?.auth.signOut()}
            >
              <LogOut data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              <span className="min-w-0 flex-1 truncate">{t("Sign out")}</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  )
}
