import { useState, type ReactNode } from "react"
import { Menu } from "lucide-react"
import type { AuthUserSummary } from "@/lib/auth-user"
import { useSidebarCollapsed } from "@/lib/sidebar-preferences"
import { useLanguage } from "@/i18n/language-provider"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
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
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { direction, t } = useLanguage()

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
        {isAgentRoute ? (
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
