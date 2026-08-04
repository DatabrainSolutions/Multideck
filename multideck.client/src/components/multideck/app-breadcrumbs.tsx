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
}

const staticLeafLabels: Record<string, string> = {
  "/agent-dexter": "Agent Dexter",
  "/bookings": "Bookings",
  "/bookings/new": "New booking",
  "/bookings/provisional": "Provisional booking",
  "/components": "Components",
  "/crm": "CRM",
  "/crm/accounts": "Accounts",
  "/crm/activity": "Activity",
  "/crm/contacts": "Contacts",
  "/crm/deals": "Deals",
  "/crm/emails": "Email marketing",
  "/crm/leads": "Leads",
  "/crm/lists": "Lists",
  "/crm/marketing": "Marketing",
  "/crm/settings": "CRM settings",
  "/customers": "Customers",
  "/paper-tray": "Paper Tray",
  "/playground/navigation": "Navigation lab",
  "/quotes": "Quotes",
  "/reports": "Reports",
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
  "/warehouse/users": "Users",
}

const crmChildLabels: Record<string, string> = {
  accounts: "Accounts",
  activity: "Activity",
  contacts: "Contacts",
  deals: "Deals",
  emails: "Email marketing",
  leads: "Leads",
  lists: "Lists",
  marketing: "Marketing",
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
  users: "Users",
}

function referenceLabel(value: string) {
  return decodeURIComponent(value).replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase())
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

  const crmLeadConversionMatch = route.match(/^\/crm\/leads\/([^/]+)\/convert$/)
  if (crmLeadConversionMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Leads", route: "/crm/leads" },
      {
        label: leafLabel ?? referenceLabel(crmLeadConversionMatch[1]),
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
      { label: leafLabel ?? referenceLabel(crmLeadMatch[1]) },
    ]
  }

  const crmAccountMatch = route.match(/^\/crm\/accounts\/([^/]+)$/)
  if (crmAccountMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Accounts", route: "/crm/accounts" },
      { label: leafLabel ?? referenceLabel(crmAccountMatch[1]) },
    ]
  }

  const crmContactMatch = route.match(/^\/crm\/contacts\/([^/]+)$/)
  if (crmContactMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Contacts", route: "/crm/contacts" },
      { label: leafLabel ?? referenceLabel(crmContactMatch[1]) },
    ]
  }

  const crmListMatch = route.match(/^\/crm\/lists\/([^/]+)$/)
  if (crmListMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Lists", route: "/crm/lists" },
      { label: leafLabel ?? referenceLabel(crmListMatch[1]) },
    ]
  }

  const crmEmailMatch = route.match(/^\/crm\/emails\/([^/]+)\/(stats|edit)$/)
  if (crmEmailMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "CRM", route: "/crm" },
      { label: "Email marketing", route: "/crm/emails" },
      { label: leafLabel ?? referenceLabel(crmEmailMatch[1]), route: "/crm/emails" },
      { label: crmEmailMatch[2] === "stats" ? "Broadcast statistics" : "Broadcast editor" },
    ]
  }

  const customerMatch = route.match(/^\/customers\/([^/]+)$/)
  if (customerMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Customers", route: "/customers" },
      { label: leafLabel ?? referenceLabel(customerMatch[1]) },
    ]
  }

  const bookingMatch = route.match(/^\/bookings\/([^/]+)$/)
  if (bookingMatch && !staticLeafLabels[route]) {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      { label: leafLabel ?? bookingMatch[1].toLocaleUpperCase(), preserveDirection: true },
    ]
  }

  const quoteMatch = route.match(/^\/quotes\/([^/]+)$/)
  if (quoteMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Quotes", route: "/quotes" },
      { label: leafLabel ?? quoteMatch[1].toLocaleUpperCase(), preserveDirection: true },
    ]
  }

  const roadJobMatch = route.match(/^\/road-control\/([^/]+)$/)
  if (roadJobMatch && route !== "/road-control/new") {
    return [
      { label: "Home", route: "/" },
      { label: "Bookings", route: "/bookings" },
      { label: "Road control", route: "/road-control" },
      { label: leafLabel ?? roadJobMatch[1].toLocaleUpperCase(), preserveDirection: true },
    ]
  }

  const reportMatch = route.match(/^\/reports\/([^/]+)$/)
  if (reportMatch) {
    return [
      { label: "Home", route: "/" },
      { label: "Reports", route: "/reports" },
      { label: leafLabel ?? referenceLabel(reportMatch[1]) },
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

  return baseTrail(leafLabel ?? referenceLabel(route.split("/").filter(Boolean).at(-1) ?? "Home"))
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

          return (
            <Fragment key={`${item.route ?? "current"}-${item.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator className="hidden shrink-0 text-[var(--md-subtle)] sm:inline-flex" /> : null}
              <BreadcrumbItem className={cn("min-w-0", !isCurrent && "hidden sm:inline-flex")}>
                {isCurrent ? (
                  <BreadcrumbPage
                    dir={item.preserveDirection ? "ltr" : undefined}
                    className="max-w-[220px] truncate font-medium text-[var(--md-ink)]"
                  >
                    {item.preserveDirection ? item.label : t(item.label)}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="truncate text-[var(--md-text)] hover:text-[var(--md-accent)]">
                    <a href={item.route} onClick={(event) => handleNavigate(event, item.route!)}>
                      {t(item.label)}
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
