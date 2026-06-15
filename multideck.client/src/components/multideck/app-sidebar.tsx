import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Bell, CheckCircle2, Clock3, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { crmSidebarItems, sidebarPrimary, sidebarSecondary, type NavItem } from "@/data/multideck-data"
import { useLanguage } from "@/i18n/language-provider"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

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
    description: "Artie sent the Marlow Apparel draft.",
    time: "1 hr",
    tone: "teal",
  },
]

function NotificationBell() {
  const { direction, t } = useLanguage()

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
          className="relative grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] data-[state=open]:bg-[var(--md-bg-strong)] data-[state=open]:text-[var(--md-accent)]"
        >
          <Bell className="size-4" strokeWidth={1.3} />
          <span className="absolute end-2.5 top-2.5 size-1.5 rounded-full bg-[var(--md-amber)] shadow-[0_0_0_2px_var(--md-glass)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={direction === "rtl" ? "left" : "right"}
        align="end"
        sideOffset={10}
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
        <div className="divide-y divide-[rgba(11,20,19,0.07)] shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]">
          {sidebarNotifications.map((notification) => {
            const Icon = notification.icon
            const iconTone =
              notification.tone === "amber"
                ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]"
                : notification.tone === "teal"
                  ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]"
                  : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"

            return (
              <button
                key={notification.title}
                type="button"
                className="grid w-full grid-cols-[30px_minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-[var(--md-hover)]"
              >
                <span className={cn("grid size-[30px] place-items-center rounded-[var(--md-radius-md)] shadow-[var(--md-shadow-line)]", iconTone)}>
                  <Icon className="size-3.5" strokeWidth={1.3} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{notification.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-5 text-[var(--md-text)]">{notification.description}</span>
                </span>
                <span className="pt-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{notification.time}</span>
              </button>
            )
          })}
        </div>
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
}: {
  item: NavItem
  isActive?: boolean
  onClick?: () => void
}) {
  const Icon = item.icon
  const valueTone =
    item.label === "Documents" ? "bg-[var(--md-accent)] text-white" :
    item.label === "Exceptions" || item.value === "2" ? "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]" :
    item.label === "Shipments" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" :
    item.label === "Customers" ? "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]" :
    "bg-transparent text-[var(--md-text)]"

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-10 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200",
        "hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
        isActive && "bg-[var(--md-bg-strong)] text-[var(--md-ink)]",
      )}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" strokeWidth={1.2} />
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      {item.value ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", valueTone)}>{item.value}</span> : null}
    </Button>
  )
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
    <aside className={cn("flex h-full min-h-0 w-[var(--md-sidebar-width)] shrink-0 flex-col border-r border-[var(--md-line)] bg-[var(--md-sidebar-bg)] px-[var(--md-gap-lg)] py-[var(--md-page-stack-gap)]", className)}>
      <div className="flex h-10 items-center px-1">
        <img
          src={multideckFullLogo}
          alt="Multideck"
          className="h-[34px] w-auto max-w-[172px] object-contain transition-[filter,opacity] duration-200 dark:brightness-0 dark:invert"
        />
      </div>

      {isCrmMode ? (
        <>
          <div className="mt-[var(--md-page-stack-gap)]">
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

          <nav className="mt-[var(--md-page-stack-gap)] flex flex-col gap-[var(--md-gap-sm)]">
            {crmSidebarItems.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                isActive={isActiveCrmRoute(item)}
                onClick={() => (item.route ? navigate(item.route) : undefined)}
              />
            ))}
          </nav>
        </>
      ) : (
        <>
          <nav className="mt-[var(--md-page-section-gap)] flex flex-col gap-[var(--md-gap-sm)]">
            {sidebarPrimary.slice(0, 1).map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                isActive={isActiveRoute(item)}
                onClick={() => (item.route ? navigate(item.route) : undefined)}
              />
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-10 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
                route === "/agent-artie" && "bg-[var(--md-bg-strong)] text-[var(--md-accent)]",
              )}
              onClick={() => navigate("/agent-artie")}
            >
              <Sparkles data-icon="inline-start" strokeWidth={1.2} />
              <span className="flex-1 text-left">Agent Artie</span>
              <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">NEW</span>
            </Button>
            {sidebarPrimary.slice(1).map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                isActive={isActiveRoute(item)}
                onClick={() => (item.route ? navigate(item.route) : undefined)}
              />
            ))}
          </nav>

          <Separator className="my-[var(--md-page-stack-gap)] bg-[rgba(11,20,19,0.06)]" />

          <nav className="flex flex-col gap-[var(--md-gap-sm)]">
            {sidebarSecondary.map((item) => (
              <SidebarNavItem
                key={item.label}
                item={item}
                isActive={isActiveRoute(item)}
                onClick={() => (item.route ? navigate(item.route) : undefined)}
              />
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto">
        <Separator className="mb-[var(--md-page-stack-gap)] bg-[var(--md-line-strong)]" />
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)]"
            onClick={() => navigate("/settings")}
          >
            <Avatar className="size-10 rounded-full">
              <AvatarFallback className="rounded-full bg-[var(--md-avatar-bg)] text-[13px] font-medium text-[var(--md-ink)]">EM</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">Elena Moreno</p>
              <p className="truncate text-[12px] text-[var(--md-text)]">Northwind Forwarding</p>
            </div>
          </button>
        </div>
      </div>
    </aside>
  )
}
