import { Fragment, type MouseEvent } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type AppBreadcrumb = {
  label: string
  route?: string
  preserveDirection?: boolean
  localize?: boolean
}

const staticLeafLabels: Record<string, string> = {
  "/agent-dexter": "Agent Dexter",
  "/admin/users": "Users",
  "/admin/usage": "Usage",
  "/admin/ai-usage": "Usage",
  "/admin/broadcast": "Broadcast",
  "/admin/billing": "Billing",
  "/admin/system-preferences": "System Preferences",
  "/admin/activity": "Active log",
  "/admin/detailed-log": "Detailed log",
  "/bookings": "Bookings",
  "/bookings/new": "New booking",
  "/bookings/provisional": "Provisional booking",
  "/calendar": "Calendar",
  "/calendar/booking-links": "Booking links",
  "/components": "Components",
  "/crm": "CRM",
  "/crm/phone-calls": "Phone calls",
  "/crm/accounts": "Companies",
  "/crm/contacts": "Contacts",
  "/crm/deals": "Deals",
  "/crm/leads": "Leads",
  "/crm/drive": "Drive",
  "/crm/settings": "CRM settings",
  "/customers": "Customers",
  "/playground/navigation": "Navigation lab",
  "/to-do": "To Do list",
  "/quotes": "Quotes",
  "/reports": "Reports",
  "/reports/scheduled": "Scheduled reports",
  "/road-control": "Road control",
  "/road-control/new": "New road job",
  "/settings": "Settings",
  "/warehouse": "Warehouse",
  "/warehouse/calendar": "Calendar",
  "/warehouse/facilities": "Facilities",
  "/warehouse/goods-in": "Goods in",
  "/warehouse/goods-out": "Goods out",
  "/warehouse/inventory": "Inventory",
  "/warehouse/items": "Items",
  "/warehouse/locations": "Locations",
  "/warehouse/orders": "Orders",
  "/warehouse/purchase-orders": "Purchase orders",
  "/warehouse/users": "Users",
}

const crmChildLabels: Record<string, string> = {
  accounts: "Companies",
  contacts: "Contacts",
  deals: "Deals",
  leads: "Leads",
  "phone-calls": "Phone calls",
  settings: "CRM settings",
}

const warehouseChildLabels: Record<string, string> = {
  calendar: "Calendar",
  facilities: "Facilities",
  "goods-in": "Goods in",
  "goods-out": "Goods out",
  inventory: "Inventory",
  items: "Items",
  locations: "Locations",
  orders: "Orders",
  "purchase-orders": "Purchase orders",
  users: "Users",
}

function referenceLabel(value: string) {
  return decodeURIComponent(value).replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

const opaqueReferencePattern = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24,})$/i

function friendlyReferenceLabel(value: string, fallback: string) {
  const decoded = decodeURIComponent(value).trim()
  return opaqueReferencePattern.test(decoded) ? fallback : referenceLabel(decoded)
}

function friendlyIdentifierLabel(value: string, fallback: string) {
  const decoded = decodeURIComponent(value).trim()
  return opaqueReferencePattern.test(decoded) ? fallback : decoded.toLocaleUpperCase()
}

function recordBreadcrumb(leafLabel: string | null | undefined, reference: string, fallback: string): AppBreadcrumb {
  const name = leafLabel?.trim()
  return name
    ? { label: name, localize: false }
    : { label: friendlyReferenceLabel(reference, fallback) }
}

function baseTrail(label: string): AppBreadcrumb[] {
  return [{ label: "Home", route: "/" }, { label }]
}

export function getAppBreadcrumbTrail(route: string, leafLabel?: string | null): AppBreadcrumb[] {
  if (route === "/") return [{ label: "Home" }]

  if (route === "/bookings/new" || route === "/bookings/provisional") {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      { label: staticLeafLabels[route] },
    ]
  }

  if (route === "/calendar/booking-links") {
    return [
      { label: "Home", route: "/" },
      { label: "Calendar", route: "/calendar" },
      { label: "Booking links" },
    ]
  }

  if (route === "/road-control" || route === "/road-control/new") {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      ...(route === "/road-control/new" ? [{ label: "Road control", route: "/road-control" }] : []),
      { label: staticLeafLabels[route] },
    ]
  }

  if (route === "/reports/templates/monthly-client-review") {
    return [
      { label: "Home", route: "/" },
      { label: "Reports", route: "/reports" },
      { label: "Report templates", route: "/reports" },
      { label: "Monthly client review" },
    ]
  }

  if (route === "/reports/scheduled") {
    return [
      { label: "Home", route: "/" },
      { label: "Reports", route: "/reports" },
      { label: staticLeafLabels[route] },
    ]
  }

  const crmLeadConversionMatch = route.match(/^\/crm\/leads\/([^/]+)\/convert$/)
  if (crmLeadConversionMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Leads", route: "/crm/leads" },
      {
        ...recordBreadcrumb(leafLabel, crmLeadConversionMatch[1], "Lead"),
        route: route.replace(/\/convert$/, ""),
      },
      { label: "Convert to deal" },
    ]
  }

  const crmLeadMatch = route.match(/^\/crm\/leads\/([^/]+)$/)
  if (crmLeadMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Leads", route: "/crm/leads" },
      recordBreadcrumb(leafLabel, crmLeadMatch[1], "Lead"),
    ]
  }

  const crmPhoneCallMatch = route.match(/^\/crm\/phone-calls\/([^/]+)$/)
  if (crmPhoneCallMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Phone calls", route: "/crm/phone-calls" },
      recordBreadcrumb(leafLabel, crmPhoneCallMatch[1], "Call"),
    ]
  }

  const crmAccountMatch = route.match(/^\/crm\/accounts\/([^/]+)$/)
  if (crmAccountMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Companies", route: "/crm/accounts" },
      recordBreadcrumb(leafLabel, crmAccountMatch[1], "Company"),
    ]
  }

  const crmContactMatch = route.match(/^\/crm\/contacts\/([^/]+)$/)
  if (crmContactMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Contacts", route: "/crm/contacts" },
      recordBreadcrumb(leafLabel, crmContactMatch[1], "Contact"),
    ]
  }

  const customerMatch = route.match(/^\/customers\/([^/]+)$/)
  if (customerMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Customers", route: "/customers" },
      recordBreadcrumb(leafLabel, customerMatch[1], "Customer"),
    ]
  }

  const bookingMatch = route.match(/^\/bookings\/([^/]+)$/)
  if (bookingMatch && !staticLeafLabels[route]) {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      leafLabel?.trim()
        ? { label: leafLabel.trim(), localize: false }
        : { label: friendlyIdentifierLabel(bookingMatch[1], "Booking"), preserveDirection: !opaqueReferencePattern.test(bookingMatch[1]) },
    ]
  }

  const quoteMatch = route.match(/^\/quotes\/([^/]+)$/)
  if (quoteMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Quotes", route: "/quotes" },
      leafLabel?.trim()
        ? { label: leafLabel.trim(), localize: false }
        : { label: friendlyIdentifierLabel(quoteMatch[1], "Quote"), preserveDirection: !opaqueReferencePattern.test(quoteMatch[1]) },
    ]
  }

  const roadJobMatch = route.match(/^\/road-control\/([^/]+)$/)
  if (roadJobMatch && route !== "/road-control/new") {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      { label: "Road control", route: "/road-control" },
      leafLabel?.trim()
        ? { label: leafLabel.trim(), localize: false }
        : { label: friendlyIdentifierLabel(roadJobMatch[1], "Road job"), preserveDirection: !opaqueReferencePattern.test(roadJobMatch[1]) },
    ]
  }

  const reportMatch = route.match(/^\/reports\/([^/]+)$/)
  if (reportMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Reports", route: "/reports" },
      recordBreadcrumb(leafLabel, reportMatch[1], "Report"),
    ]
  }

  const purchaseOrderMatch = route.match(/^\/warehouse\/purchase-orders\/([^/]+)$/)
  if (purchaseOrderMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Warehouse", route: "/warehouse" },
      { label: "Purchase orders", route: "/warehouse/purchase-orders" },
      { label: purchaseOrderMatch[1] === "new" ? "New purchase order" : friendlyIdentifierLabel(purchaseOrderMatch[1], "Purchase order"), preserveDirection: purchaseOrderMatch[1] !== "new" },
    ]
  }

  if (route.startsWith("/crm/")) {
    const child = route.split("/")[2]
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: crmChildLabels[child] ?? referenceLabel(child) },
    ]
  }

  if (route.startsWith("/warehouse/")) {
    const child = route.split("/")[2]
    return [
      { label: "Home", route: "/" },
      { label: "Warehouse", route: "/warehouse" },
      { label: warehouseChildLabels[child] ?? referenceLabel(child) },
    ]
  }

  const staticLabel = staticLeafLabels[route]
  if (staticLabel) return baseTrail(staticLabel)

  const reference = route.split("/").filter(Boolean).at(-1) ?? "Home"
  const name = leafLabel?.trim()
  return name
    ? [{ label: "Home", route: "/" }, { label: name, localize: false }]
    : baseTrail(friendlyReferenceLabel(reference, "Details"))
}

export function AppBreadcrumbs({
  route,
  navigate,
  leafLabel,
  className,
}: {
  route: string
  navigate?: (path: string) => void
  leafLabel?: string | null
  className?: string
}) {
  const { direction, t } = useLanguage()
  const trail = getAppBreadcrumbTrail(route, leafLabel)

  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (!navigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(path)
  }

  return (
    <Breadcrumb dir={direction} className={cn("min-w-0", className)}>
      <BreadcrumbList className="flex-nowrap gap-1.5 text-[14px] font-medium text-[var(--md-text)]">
        {trail.map((item, index) => {
          const isCurrent = index === trail.length - 1
          const label = item.localize === false || item.preserveDirection ? item.label : t(item.label)

          return (
            <Fragment key={`${item.route ?? "current"}-${item.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator className="hidden shrink-0 text-[var(--md-subtle)] sm:inline-flex" /> : null}
              <BreadcrumbItem className={cn("min-w-0", !isCurrent && "hidden sm:inline-flex")}>
                {isCurrent ? (
                  <BreadcrumbPage
                    dir={item.preserveDirection ? "ltr" : undefined}
                    className="max-w-[220px] truncate font-medium text-[var(--md-ink)]"
                  >
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="truncate text-[var(--md-text)] hover:text-[var(--md-accent)]">
                    <a href={item.route} onClick={(event) => handleNavigate(event, item.route!)}>
                      {label}
                    </a>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
