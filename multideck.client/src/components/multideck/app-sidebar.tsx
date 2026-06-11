import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Plus, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { sidebarPrimary, sidebarSecondary, type NavItem } from "@/data/multideck-data"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"

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
        "h-10 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-all duration-200",
        "hover:bg-[rgba(213,228,225,0.7)] hover:text-[var(--md-ink)]",
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
  const isActiveRoute = (item: NavItem) => {
    if (!item.route) return false
    if (item.route === "/") return route === "/"
    return route === item.route || route.startsWith(`${item.route}/`)
  }

  return (
    <aside className={cn("flex h-full min-h-0 w-[var(--md-sidebar-width)] shrink-0 flex-col border-r border-[rgba(11,20,19,0.06)] bg-[var(--md-sidebar-bg)] px-4 py-5", className)}>
      <div className="flex h-10 items-center px-1">
        <img
          src={multideckFullLogo}
          alt="Multideck"
          className="h-[34px] w-auto max-w-[172px] object-contain"
        />
      </div>

      <nav className="mt-8 flex flex-col gap-2">
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
            "h-10 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-all duration-200 hover:bg-[rgba(213,228,225,0.7)] hover:text-[var(--md-ink)]",
            route === "/settings" && "bg-[var(--md-bg-strong)] text-[var(--md-accent)]",
          )}
          onClick={() => navigate("/settings?tab=agent-artie")}
        >
          <Sparkles data-icon="inline-start" strokeWidth={1.2} />
          <span className="flex-1 text-left">Agent Artie</span>
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

      <Separator className="my-5 bg-[rgba(11,20,19,0.06)]" />

      <nav className="flex flex-col gap-2">
        {sidebarSecondary.map((item) => (
          <SidebarNavItem
            key={item.label}
            item={item}
            isActive={isActiveRoute(item)}
            onClick={() => (item.route ? navigate(item.route) : undefined)}
          />
        ))}
      </nav>

      <div className="mt-8">
        <p className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">Boards</p>
        <div className="mt-3 flex flex-col gap-3 px-2">
          {[
            ["Today - Ops", "var(--md-accent)"],
            ["Customs queue", "var(--md-blue)"],
            ["Risk & delay", "var(--md-amber)"],
          ].map(([label, color]) => (
            <button key={label} type="button" className="flex items-center gap-3 text-left text-[14px] font-medium text-[var(--md-text)]">
              <span className="size-3 rounded-[var(--md-radius-sm)]" style={{ background: color }} />
              {label}
            </button>
          ))}
          <button type="button" className="mt-1 flex items-center gap-3 text-left text-[14px] font-medium text-[var(--md-subtle)]">
            <Plus className="size-3" strokeWidth={1.6} />
            New board
          </button>
        </div>
      </div>

      <div className="mt-auto">
        <Separator className="mb-5 bg-[rgba(11,20,19,0.08)]" />
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition-all duration-200 hover:bg-[rgba(213,228,225,0.56)]"
          onClick={() => navigate("/settings")}
        >
          <Avatar className="size-10 rounded-full">
            <AvatarFallback className="rounded-full bg-[#dfd1ad] text-[13px] font-medium text-[var(--md-ink)]">EM</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">Elena Moreno</p>
            <p className="truncate text-[12px] text-[var(--md-text)]">Northwind Forwarding</p>
          </div>
        </button>
      </div>
    </aside>
  )
}
