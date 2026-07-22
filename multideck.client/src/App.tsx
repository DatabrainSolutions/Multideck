import { lazy, startTransition, Suspense, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/multideck/app-shell"
import { LanguageProvider } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { rememberAuthReturnPath, takeAuthReturnPath } from "@/lib/auth-routing"
import { summarizeAuthUser, type AuthUserSummary } from "@/lib/auth-user"
import { getApiAuthSession } from "@/lib/api"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { OverviewPage } from "@/pages/overview-page"

const AgentDexterPage = lazy(() => import("@/pages/agent-dexter-page").then((module) => ({ default: module.AgentDexterPage })))
const AuthFlowPage = lazy(() => import("@/pages/auth-flow-page").then((module) => ({ default: module.AuthFlowPage })))
const ComponentsGalleryPage = lazy(() => import("@/pages/components-gallery-page").then((module) => ({ default: module.ComponentsGalleryPage })))
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })))
const CustomersPage = lazy(() => import("@/pages/customers-page").then((module) => ({ default: module.CustomersPage })))
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })))
const PaperTrayPage = lazy(() => import("@/pages/paper-tray-page").then((module) => ({ default: module.PaperTrayPage })))
const NavigationLabPage = lazy(() => import("@/pages/navigation-lab-page").then((module) => ({ default: module.NavigationLabPage })))
const QuoteDetailPage = lazy(() => import("@/pages/quotes-page").then((module) => ({ default: module.QuoteDetailPage })))
const QuotesRegisterPage = lazy(() => import("@/pages/quotes-register-page").then((module) => ({ default: module.QuotesRegisterPage })))
const ReportTemplateBuilderPage = lazy(() => import("@/pages/report-template-builder-page").then((module) => ({ default: module.ReportTemplateBuilderPage })))
const ReportViewerPage = lazy(() => import("@/pages/report-viewer-page").then((module) => ({ default: module.ReportViewerPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const WarehousePage = lazy(() => import("@/pages/warehouse-page").then((module) => ({ default: module.WarehousePage })))
const BookingDetailPage = lazy(() => import("@/pages/booking-detail-page").then((module) => ({ default: module.BookingDetailPage })))
const BookingWizardPage = lazy(() => import("@/pages/booking-wizard-page").then((module) => ({ default: module.BookingWizardPage })))
const ProvisionalBookingPage = lazy(() => import("@/pages/provisional-booking-page").then((module) => ({ default: module.ProvisionalBookingPage })))
const BookingsPage = lazy(() => import("@/pages/bookings-page").then((module) => ({ default: module.BookingsPage })))
const CrmOverviewPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmOverviewPage })))
const CrmLeadsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadsPage })))
const CrmLeadDetailPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmLeadDetailPage })))
const CrmActivityPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmActivityPage })))
const CrmContactsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmContactsPage })))
const CrmDealsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmDealsPage })))
const CrmEmailsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailsPage })))
const CrmEmailStatsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailStatsPage })))
const CrmEmailEditPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmEmailEditPage })))
const CrmListsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmListsPage })))
const CrmListDetailPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmListDetailPage })))
const CrmMarketingPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmMarketingPage })))
const CrmSettingsPage = lazy(() => import("@/pages/crm-page").then((module) => ({ default: module.CrmSettingsPage })))

type AuthStatus = "checking" | "authenticated" | "unauthenticated"

const validRoutes = new Set([
  "/",
  "/agent-dexter",
  "/auth",
  "/components",
  "/crm",
  "/crm/accounts",
  "/crm/activity",
  "/crm/contacts",
  "/crm/deals",
  "/crm/emails",
  "/crm/leads",
  "/crm/lists",
  "/crm/marketing",
  "/crm/settings",
  "/customers",
  "/paper-tray",
  "/playground/navigation",
  "/quotes",
  "/quotes/3",
  "/reports",
  "/reports/templates/monthly-client-review",
  "/settings",
  "/warehouse",
  "/warehouse/calendar",
  "/warehouse/facilities",
  "/warehouse/goods-in",
  "/warehouse/goods-out",
  "/warehouse/inventory",
  "/warehouse/items",
  "/warehouse/locations",
  "/warehouse/orders",
  "/warehouse/users",
  "/bookings",
  "/bookings/new",
  "/bookings/provisional",
])

function isBookingDetailRoute(path: string) {
  return /^\/bookings\/[^/]+$/.test(path) && path !== "/bookings/new" && path !== "/bookings/provisional"
}

function isQuoteDetailRoute(path: string) {
  return /^\/quotes\/[^/]+$/.test(path)
}

function getLegacyBookingRoute(path: string) {
  if (path === "/shipments") return "/bookings"
  const detailMatch = path.match(/^\/shipments\/([^/]+)$/)
  return detailMatch ? `/bookings/${detailMatch[1]}` : null
}

function isCrmLeadDetailRoute(path: string) {
  return /^\/crm\/leads\/[^/]+$/.test(path)
}

function isCustomerDetailRoute(path: string) {
  return /^\/customers\/[^/]+$/.test(path)
}

function isCrmListDetailRoute(path: string) {
  return /^\/crm\/lists\/[^/]+$/.test(path)
}

function isCrmEmailStatsRoute(path: string) {
  return /^\/crm\/emails\/[^/]+\/stats$/.test(path)
}

function isCrmEmailEditRoute(path: string) {
  return /^\/crm\/emails\/[^/]+\/edit$/.test(path)
}

function getRoute() {
  const legacyBookingRoute = getLegacyBookingRoute(window.location.pathname)
  if (legacyBookingRoute) return legacyBookingRoute
  if (window.location.pathname.startsWith("/reports/rpt-")) return window.location.pathname
  if (isBookingDetailRoute(window.location.pathname)) return window.location.pathname
  if (isQuoteDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCustomerDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmListDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailStatsRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailEditRoute(window.location.pathname)) return window.location.pathname
  return validRoutes.has(window.location.pathname) ? window.location.pathname : "/"
}

function canCustomerOpenRoute(user: AuthUserSummary, path: string) {
  if (["/warehouse/inventory", "/warehouse/orders", "/warehouse/items"].includes(path)) return true
  return path === "/warehouse/users" && user.permissions.includes("Warehouse.Users.ManageOwn")
}

function RouteFallback() {
  return (
    <div aria-hidden="true" className="min-h-[320px] bg-transparent">
      <div className="h-1 w-full overflow-hidden bg-[rgba(14,125,116,0.06)]">
        <div className="h-full w-1/3 animate-pulse rounded-r-full bg-[rgba(14,125,116,0.22)]" />
      </div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(getRoute)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isSupabaseConfigured ? "checking" : "unauthenticated")
  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null)
  const isLocalNavigationLab = import.meta.env.DEV && route === "/playground/navigation"

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => setRoute(getRoute()))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setCurrentUser(null)
      setAuthStatus("unauthenticated")
      return
    }

    let cancelled = false

    let sessionRequest = 0
    const applySession = (session: Session | null) => {
      if (cancelled) return
      const requestId = ++sessionRequest

      if (!session?.user) {
        setCurrentUser(null)
        setAuthStatus("unauthenticated")
        return
      }

      setAuthStatus("checking")
      getApiAuthSession(session.access_token).then((apiSession) => {
        if (cancelled || requestId !== sessionRequest) return
        setCurrentUser(summarizeAuthUser(session.user, apiSession.profile))
        setAuthStatus("authenticated")
      }).catch((error) => {
        if (cancelled || requestId !== sessionRequest) return
        console.error("The application profile could not be loaded.", error)
        setCurrentUser(summarizeAuthUser(session.user))
        setAuthStatus("authenticated")
      })
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error(error)
        void clearStaleSession()
        applySession(null)
        return
      }

      applySession(data.session)
    }).catch((error) => {
      console.error(error)
      void clearStaleSession()
      applySession(null)
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // When token refresh fails (stale session), clear storage and redirect to sign-in
      if ((event as string) === "TOKEN_REFRESH_FAILED") {
        console.warn("Token refresh failed — clearing stale session.")
        void clearStaleSession()
        applySession(null)
        return
      }

      applySession(session)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  /** Clear stale Supabase session from storage when tokens can no longer be refreshed. */
  function clearStaleSession() {
    try {
      const storageKey = `sb-${import.meta.env.VITE_SUPABASE_URL?.match(/https?:\/\/([^.]+)/)?.[1] ?? ""}-auth-token`
      localStorage.removeItem(storageKey)
      sessionStorage.removeItem(storageKey)
    } catch {
      // Storage may not be available
    }
  }

  useEffect(() => {
    if (authStatus === "checking") return

    if (authStatus === "unauthenticated" && route !== "/auth") {
      rememberAuthReturnPath()
      window.history.replaceState({}, "", "/auth")
      startTransition(() => setRoute(getRoute()))
      return
    }

    if (authStatus === "authenticated" && route === "/auth") {
      window.history.replaceState({}, "", takeAuthReturnPath())
      startTransition(() => setRoute(getRoute()))
    }
  }, [authStatus, route])

  useEffect(() => {
    if (authStatus !== "authenticated" || currentUser?.actorType !== "customer") return
    if (canCustomerOpenRoute(currentUser, route)) return
    window.history.replaceState({}, "", currentUser.landingPath)
    startTransition(() => setRoute(getRoute()))
  }, [authStatus, currentUser, route])

  function navigate(path: string) {
    if (currentUser?.actorType === "customer" && !canCustomerOpenRoute(currentUser, path)) {
      path = currentUser.landingPath
    }
    if (path === route) return
    window.history.pushState({}, "", path)
    startTransition(() => setRoute(getRoute()))
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="multideck.theme">
      <LanguageProvider>
        <TooltipProvider>
          <MotionConfig reducedMotion="user" transition={mdMotion.fast}>
            {(!isLocalNavigationLab && ((authStatus === "checking" && route !== "/auth") || (authStatus === "authenticated" && route === "/auth"))) ? (
              <RouteFallback />
            ) : !isLocalNavigationLab && (authStatus === "unauthenticated" || route === "/auth") ? (
              <Suspense fallback={<RouteFallback />}>
                <AuthFlowPage navigate={navigate} />
              </Suspense>
            ) : isBookingDetailRoute(route) ? (
              <Suspense fallback={<RouteFallback />}>
                <BookingDetailPage navigate={navigate} bookingId={route.split("/").at(-1) ?? "md-22455"} />
              </Suspense>
            ) : route.startsWith("/reports/rpt-") ? (
              <Suspense fallback={<RouteFallback />}>
                <ReportViewerPage navigate={navigate} reportId={route.split("/").at(-1) ?? "rpt-marlow-may-review"} />
              </Suspense>
            ) : route === "/reports/templates/monthly-client-review" ? (
              <Suspense fallback={<RouteFallback />}>
                <ReportTemplateBuilderPage navigate={navigate} />
              </Suspense>
            ) : (
              <AppShell route={route} navigate={navigate} currentUser={currentUser}>
                <Suspense fallback={<RouteFallback />}>
                  {route === "/components" ? <ComponentsGalleryPage /> : null}
                  {route === "/agent-dexter" ? <AgentDexterPage /> : null}
                  {route === "/crm" ? <CrmOverviewPage /> : null}
                  {route === "/crm/accounts" || route === "/crm/leads" ? <CrmLeadsPage navigate={navigate} /> : null}
                  {isCrmLeadDetailRoute(route) ? <CrmLeadDetailPage navigate={navigate} leadId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/crm/activity" ? <CrmActivityPage navigate={navigate} /> : null}
                  {route === "/crm/contacts" ? <CrmContactsPage /> : null}
                  {route === "/crm/deals" ? <CrmDealsPage /> : null}
                  {route === "/crm/emails" ? <CrmEmailsPage navigate={navigate} /> : null}
                  {isCrmEmailStatsRoute(route) ? <CrmEmailStatsPage navigate={navigate} campaignId={route.split("/").at(-2) ?? ""} /> : null}
                  {isCrmEmailEditRoute(route) ? <CrmEmailEditPage navigate={navigate} campaignId={route.split("/").at(-2) ?? ""} /> : null}
                  {route === "/crm/lists" ? <CrmListsPage navigate={navigate} /> : null}
                  {isCrmListDetailRoute(route) ? <CrmListDetailPage navigate={navigate} listId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/crm/marketing" ? <CrmMarketingPage /> : null}
                  {route === "/crm/settings" ? <CrmSettingsPage /> : null}
                  {route === "/customers" ? <CustomersPage navigate={navigate} /> : null}
                  {isCustomerDetailRoute(route) ? <CustomerDetailPage customerId={route.split("/").at(-1) ?? ""} /> : null}
                  {route === "/paper-tray" ? <PaperTrayPage /> : null}
                  {route === "/playground/navigation" ? <NavigationLabPage /> : null}
                  {route === "/quotes" ? <QuotesRegisterPage navigate={navigate} /> : null}
                  {isQuoteDetailRoute(route) ? <QuoteDetailPage key={route} variant="cargowise" quoteId={route.split("/").at(-1)} /> : null}
                  {route === "/reports" ? <ReportsPage navigate={navigate} /> : null}
                  {route === "/settings" ? <SettingsPage navigate={navigate} /> : null}
                  {route.startsWith("/warehouse") ? <WarehousePage route={route} currentUser={currentUser} /> : null}
                  {route === "/bookings" ? <BookingsPage navigate={navigate} /> : null}
                  {route === "/bookings/new" ? <BookingWizardPage navigate={navigate} /> : null}
                  {route === "/bookings/provisional" ? <ProvisionalBookingPage navigate={navigate} /> : null}
                  {route === "/" ? <OverviewPage navigate={navigate} /> : null}
                </Suspense>
              </AppShell>
            )}
          </MotionConfig>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
