import type { ReactNode } from "react"
import { AppSidebar } from "./app-sidebar"
import { TopBar } from "./top-bar"
import { cn } from "@/lib/utils"

export function AppShell({
  route,
  navigate,
  children,
}: {
  route: string
  navigate: (path: string) => void
  children: ReactNode
}) {
  const isSettingsRoute = route === "/settings"

  return (
    <div className="min-h-screen bg-[var(--md-bg)] text-[var(--md-ink)]">
      <div className="flex min-h-screen">
        <AppSidebar route={route} navigate={navigate} className="sticky top-0 hidden h-screen lg:flex" />
        <main className={cn("min-w-0 flex-1", !isSettingsRoute && "px-[var(--md-page-pad)] pb-[var(--md-page-pad)]")}>
          {isSettingsRoute ? null : <TopBar route={route} navigate={navigate} />}
          {children}
        </main>
      </div>
    </div>
  )
}
