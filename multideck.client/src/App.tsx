import { lazy, startTransition, Suspense, useEffect, useState } from "react"
import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/multideck/app-shell"
import { LanguageProvider } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { OverviewPage } from "@/pages/overview-page"

const AgentDexterPage = lazy(() => import("@/pages/agent-dexter-page").then((module) => ({ default: module.AgentDexterPage })))
const AuthFlowPage = lazy(() => import("@/pages/auth-flow-page").then((module) => ({ default: module.AuthFlowPage })))
const ComponentsGalleryPage = lazy(() => import("@/pages/components-gallery-page").then((module) => ({ default: module.ComponentsGalleryPage })))
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })))
const CustomersPage = lazy(() => import("@/pages/customers-page").then((module) => ({ default: module.CustomersPage })))
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })))
const ReportTemplateBuilderPage = lazy(() => import("@/pages/report-template-builder-page").then((module) => ({ default: module.ReportTemplateBuilderPage })))
const ReportViewerPage = lazy(() => import("@/pages/report-viewer-page").then((module) => ({ default: module.ReportViewerPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const ShipmentDetailPage = lazy(() => import("@/pages/shipment-detail-page").then((module) => ({ default: module.ShipmentDetailPage })))
const ShipmentsPage = lazy(() => import("@/pages/shipments-page").then((module) => ({ default: module.ShipmentsPage })))
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
  "/customers/marlow-apparel",
  "/reports",
  "/reports/templates/monthly-client-review",
  "/settings",
  "/shipments",
])

function isShipmentDetailRoute(path: string) {
  return /^\/shipments\/[^/]+$/.test(path)
}

function isCrmLeadDetailRoute(path: string) {
  return /^\/crm\/leads\/[^/]+$/.test(path)
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
  if (window.location.pathname.startsWith("/reports/rpt-")) return window.location.pathname
  if (isShipmentDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmLeadDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmListDetailRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailStatsRoute(window.location.pathname)) return window.location.pathname
  if (isCrmEmailEditRoute(window.location.pathname)) return window.location.pathname
  return validRoutes.has(window.location.pathname) ? window.location.pathname : "/"
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

  useEffect(() => {
    const onPopState = () => {
      startTransition(() => setRoute(getRoute()))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function navigate(path: string) {
    if (path === route) return
    window.history.pushState({}, "", path)
    startTransition(() => setRoute(getRoute()))
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="multideck.theme">
      <LanguageProvider>
        <TooltipProvider>
          <MotionConfig reducedMotion="user" transition={mdMotion.fast}>
            {route === "/auth" ? (
              <Suspense fallback={<RouteFallback />}>
                <AuthFlowPage />
              </Suspense>
            ) : isShipmentDetailRoute(route) ? (
              <Suspense fallback={<RouteFallback />}>
                <ShipmentDetailPage navigate={navigate} shipmentId={route.split("/").at(-1) ?? "md-22455"} />
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
              <AppShell route={route} navigate={navigate}>
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
                  {route === "/customers/marlow-apparel" ? <CustomerDetailPage /> : null}
                  {route === "/reports" ? <ReportsPage navigate={navigate} /> : null}
                  {route === "/settings" ? <SettingsPage navigate={navigate} /> : null}
                  {route === "/shipments" ? <ShipmentsPage navigate={navigate} /> : null}
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
