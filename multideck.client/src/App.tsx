import { useEffect, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell } from "@/components/multideck/app-shell"
import { CustomerDetailPage } from "@/pages/customer-detail-page"
import { CustomersPage } from "@/pages/customers-page"
import { ComponentsGalleryPage } from "@/pages/components-gallery-page"
import { OverviewPage } from "@/pages/overview-page"
import { AuthFlowPage } from "@/pages/auth-flow-page"
import { ReportsPage } from "@/pages/reports-page"
import { ShipmentDetailPage } from "@/pages/shipment-detail-page"
import { ShipmentsPage } from "@/pages/shipments-page"
import { SettingsPage } from "@/pages/settings-page"

const validRoutes = new Set(["/", "/auth", "/components", "/customers", "/customers/marlow-apparel", "/reports", "/settings", "/shipments", "/shipments/md-22455"])

function getRoute() {
  return validRoutes.has(window.location.pathname) ? window.location.pathname : "/"
}

export default function App() {
  const [route, setRoute] = useState(getRoute)

  useEffect(() => {
    const onPopState = () => setRoute(getRoute())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function navigate(path: string) {
    if (path === route) return
    window.history.pushState({}, "", path)
    setRoute(getRoute())
  }

  return (
    <TooltipProvider>
      {route === "/auth" ? (
        <AuthFlowPage />
      ) : route === "/shipments/md-22455" ? (
        <ShipmentDetailPage navigate={navigate} />
      ) : (
        <AppShell route={route} navigate={navigate}>
          {route === "/components" ? <ComponentsGalleryPage /> : null}
          {route === "/customers" ? <CustomersPage navigate={navigate} /> : null}
          {route === "/customers/marlow-apparel" ? <CustomerDetailPage /> : null}
          {route === "/reports" ? <ReportsPage /> : null}
          {route === "/settings" ? <SettingsPage navigate={navigate} /> : null}
          {route === "/shipments" ? <ShipmentsPage navigate={navigate} /> : null}
          {route === "/" ? <OverviewPage /> : null}
        </AppShell>
      )}
      <Toaster />
    </TooltipProvider>
  )
}
