import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Bell, CheckCircle2, Clock3, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { crmSidebarItems, sidebarPrimary, sidebarSecondary, type NavItem } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

const sidebarItemTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

const sidebarActiveTransition = {
  type: "tween" as const,
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

type SidebarActiveTarget = {
  top: number
  left: number
  width: number
  height: number
  borderRadius: string
}

const navReveal = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      staggerChildren: 0.035,
      delayChildren: 0.03,
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
          className="group relative grid size-10 place-items-center overflow-hidden rounded-full bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] data-[state=open]:bg-[var(--md-bg-strong)] data-[state=open]:text-[var(--md-accent)]"
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
}: {
  item: NavItem
  isActive?: boolean
  onClick?: () => void
  accent?: "default" | "dexter"
}) {
  const Icon = item.icon
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isDisabled = !onClick
  const valueTone =
    accent === "dexter" ? "bg-[var(--md-accent)] text-white" :
    item.label === "Documents" ? "bg-[var(--md-accent)] text-white" :
    item.label === "Exceptions" || item.value === "2" ? "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]" :
    item.label === "Bookings" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" :
    item.label === "Customers" ? "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]" :
    "bg-transparent text-[var(--md-text)]"

  return (
    <motion.button
      type="button"
      data-sidebar-active-target={isActive ? "true" : undefined}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "group relative h-10 w-full justify-start gap-2 overflow-hidden rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-[color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "bg-transparent hover:bg-transparent hover:text-[var(--md-ink)] aria-expanded:bg-transparent dark:hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        isActive && "text-[var(--md-ink)]",
        accent === "dexter" && isActive && "text-[var(--md-accent)]",
        isDisabled && "cursor-default opacity-55 hover:text-[var(--md-text)]",
      )}
      disabled={isDisabled}
      onClick={onClick}
      whileHover={isDisabled || shouldReduceMotion ? undefined : { x: 3, scale: 1.01 }}
      whileTap={isDisabled || shouldReduceMotion ? undefined : { scale: 0.985 }}
      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
    >
      {isActive ? null : <span className="absolute inset-0 rounded-[var(--md-radius-md)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />}
      <motion.span
        className={cn(
          "relative grid size-5 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] transition-[background,color] duration-200 group-hover:bg-[var(--md-icon-well)] group-hover:text-[var(--md-ink)]",
          isActive && "bg-[var(--md-icon-well)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          accent === "dexter" && isActive && "text-[var(--md-accent)]",
        )}
        animate={isActive && !shouldReduceMotion ? { scale: 1 } : undefined}
        initial={false}
      >
        <Icon data-icon="inline-start" strokeWidth={1.2} />
      </motion.span>
      <span className="relative min-w-0 flex-1 truncate text-left">{t(item.label)}</span>
      {item.value ? (
        <motion.span
          layout
          className={cn("relative rounded-full px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)]", valueTone)}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.layout)}
        >
          {t(item.value)}
        </motion.span>
      ) : null}
    </motion.button>
  )
}

function SidebarSection({
  children,
  className,
  onRevealComplete,
}: {
  children: ReactNode
  className?: string
  onRevealComplete?: () => void
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.nav
      className={cn("flex flex-col gap-[var(--md-gap-sm)]", className)}
      variants={shouldReduceMotion ? undefined : navReveal}
      initial={shouldReduceMotion ? undefined : "hidden"}
      animate={shouldReduceMotion ? undefined : "show"}
      onAnimationComplete={onRevealComplete}
    >
      {children}
    </motion.nav>
  )
}

function SidebarSectionItem({ children }: { children: ReactNode }) {
  return <motion.div variants={navItemReveal}>{children}</motion.div>
}

export function AppSidebar({
  route,
  navigate,
  className,
}: {
  route: string
  navigate: (path: string) => void
  className?: string
}) {
  const isCrmMode = route.startsWith("/crm")
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const sidebarRef = useRef<HTMLElement>(null)
  const sidebarModeRef = useRef<"crm" | "main">(isCrmMode ? "crm" : "main")
  const [activeTarget, setActiveTarget] = useState<SidebarActiveTarget | null>(null)

  const updateActiveTarget = useCallback(() => {
    const sidebar = sidebarRef.current
    const activeNode = sidebar?.querySelector<HTMLElement>('[data-sidebar-active-target="true"]')

    if (!sidebar || !activeNode) {
      setActiveTarget(null)
      return
    }

    const sidebarRect = sidebar.getBoundingClientRect()
    const activeRect = activeNode.getBoundingClientRect()
    const borderRadius = window.getComputedStyle(activeNode).borderRadius

    setActiveTarget({
      top: activeRect.top - sidebarRect.top,
      left: activeRect.left - sidebarRect.left,
      width: activeRect.width,
      height: activeRect.height,
      borderRadius,
    })
  }, [])

  useLayoutEffect(() => {
    const nextMode = isCrmMode ? "crm" : "main"
    const sidebarModeChanged = sidebarModeRef.current !== nextMode
    sidebarModeRef.current = nextMode

    if (sidebarModeChanged) {
      setActiveTarget(null)
    }

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(updateActiveTarget)
    })
    const settledMeasure = window.setTimeout(updateActiveTarget, sidebarModeChanged ? 300 : 80)

    window.addEventListener("resize", updateActiveTarget)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settledMeasure)
      window.removeEventListener("resize", updateActiveTarget)
    }
  }, [isCrmMode, route, updateActiveTarget])

  const isActiveRoute = (item: NavItem) => {
    if (!item.route) return false
    if (item.route === "/") return route === "/"
    return route === item.route || route.startsWith(`${item.route}/`)
  }

  const isActiveCrmRoute = (item: NavItem) => {
    if (!item.route) return false
    if (item.route === "/crm/leads" && route === "/crm/accounts") return true
    if (item.route === "/crm") return route === "/crm"
    return route === item.route || route.startsWith(`${item.route}/`)
  }

  return (
    <aside ref={sidebarRef} className={cn("relative isolate flex h-full min-h-0 w-[var(--md-sidebar-width)] shrink-0 flex-col bg-[var(--md-sidebar-bg)] px-[var(--md-gap-lg)] py-[var(--md-page-stack-gap)] shadow-[inset_-1px_0_0_rgba(11,20,19,0.06),0_0_0_1px_rgba(255,255,255,0.44)] dark:shadow-[inset_-1px_0_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(0,0,0,0.2)]", className)}>
      {activeTarget ? (
        <motion.span
          data-sidebar-active-surface
          aria-hidden="true"
          className="pointer-events-none absolute z-0 bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]"
          style={{ top: 0, left: 0 }}
          initial={false}
          animate={{
            x: activeTarget.left,
            y: activeTarget.top,
            width: activeTarget.width,
            height: activeTarget.height,
            borderRadius: activeTarget.borderRadius,
          }}
          transition={shouldReduceMotion ? { duration: 0 } : sidebarActiveTransition}
        />
      ) : null}
      <div className="relative z-10 flex h-10 items-center justify-between gap-3 px-1">
        <img
          src={multideckFullLogo}
          alt="Multideck"
          className="h-[34px] min-w-0 max-w-[132px] object-contain transition-[filter,opacity] duration-200 dark:brightness-0 dark:invert"
        />
        <NotificationBell />
      </div>

      {isCrmMode ? (
        <>
          <div className="relative z-10 mt-[var(--md-page-stack-gap)]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2 text-[13px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
              onClick={() => navigate("/")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back
            </Button>
          </div>

          <SidebarSection className="relative z-10 mt-[var(--md-page-stack-gap)]" onRevealComplete={updateActiveTarget}>
            {crmSidebarItems.map((item) => (
              <SidebarSectionItem key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActiveCrmRoute(item)}
                  onClick={item.route ? () => navigate(item.route!) : undefined}
                />
              </SidebarSectionItem>
            ))}
          </SidebarSection>
        </>
      ) : (
        <>
          <SidebarSection className="relative z-10 mt-[var(--md-page-section-gap)]" onRevealComplete={updateActiveTarget}>
            {sidebarPrimary.slice(0, 1).map((item) => (
              <SidebarSectionItem key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActiveRoute(item)}
                  onClick={item.route ? () => navigate(item.route!) : undefined}
                />
              </SidebarSectionItem>
            ))}
            <SidebarSectionItem>
              <SidebarNavItem
                item={{ label: "Agent Dexter", value: "NEW", icon: Sparkles, route: "/agent-dexter" }}
                isActive={route === "/agent-dexter"}
                onClick={() => navigate("/agent-dexter")}
                accent="dexter"
              />
            </SidebarSectionItem>
            {sidebarPrimary.slice(1).map((item) => (
              <SidebarSectionItem key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActiveRoute(item)}
                  onClick={item.route ? () => navigate(item.route!) : undefined}
                />
              </SidebarSectionItem>
            ))}
          </SidebarSection>

          <Separator className="relative z-10 my-[var(--md-page-stack-gap)] bg-[rgba(11,20,19,0.06)]" />

          <SidebarSection className="relative z-10" onRevealComplete={updateActiveTarget}>
            {sidebarSecondary.map((item) => (
              <SidebarSectionItem key={item.label}>
                <SidebarNavItem
                  item={item}
                  isActive={isActiveRoute(item)}
                  onClick={item.route ? () => navigate(item.route!) : undefined}
                />
              </SidebarSectionItem>
            ))}
          </SidebarSection>
        </>
      )}

      <div className="relative z-10 mt-auto">
        <Separator className="mb-[var(--md-page-stack-gap)] bg-[var(--md-line-strong)]" />
        <motion.button
          data-sidebar-active-target={route === "/settings" ? "true" : undefined}
          type="button"
          aria-current={route === "/settings" ? "page" : undefined}
          className={cn(
            "group relative flex min-w-0 w-full items-center gap-3 overflow-hidden rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition-[color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
            route === "/settings" && "text-[var(--md-ink)]",
          )}
          onClick={() => navigate("/settings")}
          whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.micro)}
        >
          {route === "/settings" ? null : <span className="absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />}
          <Avatar className="relative size-10 rounded-full">
            <AvatarFallback className="rounded-full bg-[var(--md-avatar-bg)] text-[13px] font-medium text-[var(--md-ink)]">EM</AvatarFallback>
          </Avatar>
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">Elena Moreno</p>
            <p className="truncate text-[12px] text-[var(--md-text)]">{t("Northwind Forwarding")}</p>
          </div>
        </motion.button>
      </div>
    </aside>
  )
}
