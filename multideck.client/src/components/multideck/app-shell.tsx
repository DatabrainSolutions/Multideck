import { useEffect, useState, type ReactNode } from "react"
import type { AuthUserSummary } from "@/lib/auth-user"
import { AppSidebar } from "./app-sidebar"
import { TopBar } from "./top-bar"
import { cn } from "@/lib/utils"

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
  const isAgentRoute = route === "/agent-dexter"
  const isChromeTightRoute = route.startsWith("/quotes/") || route === "/bookings/provisional"
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("multideck.sidebarCollapsed") === "true"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem("multideck.sidebarCollapsed", sidebarCollapsed ? "true" : "false")
    } catch {
      // Local storage is a convenience only; the shell still works without it.
    }
  }, [sidebarCollapsed])

  return (
    <div className="h-screen overflow-hidden bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="flex h-screen min-h-0">
        <AppSidebar
          route={route}
          navigate={navigate}
          currentUser={currentUser}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          className="hidden h-screen min-h-0 lg:flex"
        />
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1",
            isAgentRoute ? "overflow-hidden" : "overflow-y-auto md-scrollbar",
            !isSettingsRoute && !isAgentRoute && !isChromeTightRoute && "px-[var(--md-page-pad)] pb-[var(--md-page-pad)]",
          )}
        >
          {isSettingsRoute || isAgentRoute || isChromeTightRoute ? null : <TopBar route={route} navigate={navigate} />}
          {children}
        </main>
      </div>
    </div>
  )
}
