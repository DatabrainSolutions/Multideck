import {
  AiBrain,
  BadgeCheck,
  Building2,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChartAnalysis,
  ChartLine,
  ChartNoAxesCombined,
  ClipboardCheck,
  Clock3,
  Cloud,
  Component,
  FileText,
  Forklift,
  Funnel,
  Gauge,
  Globe2,
  Grid3X3,
  HardDrive,
  Home03,
  IdCard,
  Inbox,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListOrdered,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Palette,
  Plane,
  ReceiptText,
  ScanText,
  Settings2,
  Ship,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "@/components/icons/hugeicons"

export type NavItem = {
  label: string
  value?: string
  icon: LucideIcon
  route?: string
}

export type SidebarDestination = NavItem & {
  id: string
  children?: NavItem[]
}

export type SidebarArea = {
  id: string
  label: string
  icon: LucideIcon
  destinations: SidebarDestination[]
}

export const warehouseNavigation: SidebarDestination[] = [
  { id: "warehouse-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/warehouse" },
  { id: "warehouse-calendar", label: "Calendar", icon: CalendarDays, route: "/warehouse/calendar" },
  { id: "warehouse-inventory", label: "Inventory", icon: Boxes, route: "/warehouse/inventory" },
  { id: "warehouse-goods-in", label: "Goods in", icon: PackagePlus, route: "/warehouse/goods-in" },
  { id: "warehouse-goods-out", label: "Goods out", icon: PackageMinus, route: "/warehouse/goods-out" },
  { id: "warehouse-orders", label: "Orders", icon: ClipboardCheck, route: "/warehouse/orders" },
  { id: "warehouse-purchase-orders", label: "Purchase orders", icon: ReceiptText, route: "/warehouse/purchase-orders" },
  {
    id: "warehouse-setup",
    label: "Setup",
    icon: Settings2,
    children: [
      { label: "Facilities", icon: Building2, route: "/warehouse/facilities" },
      { label: "Locations", icon: MapPin, route: "/warehouse/locations" },
      { label: "Items", icon: Package, route: "/warehouse/items" },
    ],
  },
]

export const customerWarehouseNavigation: SidebarDestination[] = [
  { id: "warehouse-inventory", label: "Inventory", icon: Boxes, route: "/warehouse/inventory" },
  { id: "warehouse-orders", label: "Orders", icon: ClipboardCheck, route: "/warehouse/orders" },
  { id: "warehouse-items", label: "Items", icon: Package, route: "/warehouse/items" },
  { id: "warehouse-users", label: "Users", icon: Users, route: "/warehouse/users" },
]

export const homeNavItem: NavItem = { label: "Home", icon: Home03, route: "/" }

/**
 * The operational mail workspace. It sits at the top of the sidebar next to Home
 * because an operator lives in it all day, and it is deliberately separate from
 * Sales & CRM / Marketing / Email marketing, which is outbound campaign work.
 */
export const inboxNavItem: NavItem = { label: "Inbox", icon: Inbox, route: "/inbox" }

export const sidebarAreas: SidebarArea[] = [
  {
    id: "operations",
    label: "Operations",
    icon: Ship,
    destinations: [
      {
        id: "bookings-jobs",
        label: "Bookings & jobs",
        icon: Ship,
        children: [
          { label: "Bookings overview", icon: LayoutDashboard, route: "/bookings" },
          { label: "Road control", icon: Truck, route: "/road-control" },
          { label: "New booking", icon: PackageCheck, route: "/bookings/new" },
          { label: "Provisional booking", icon: Clock3, route: "/bookings/provisional" },
        ],
      },
      { id: "transport-planning", label: "Transport planning", icon: Plane },
      { id: "tracking-milestones", label: "Tracking & milestones", icon: Globe2 },
      { id: "operational-documents", label: "Operational documents", icon: FileText },
      { id: "exceptions-service-recovery", label: "Exceptions & service recovery", icon: TriangleAlert },
      { id: "claims", label: "Claims", icon: ClipboardCheck },
    ],
  },
  {
    id: "sales-crm",
    label: "Sales & CRM",
    icon: BriefcaseBusiness,
    destinations: [
      { id: "crm-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/crm" },
      {
        id: "crm-leads-opportunities",
        label: "Leads & opportunities",
        icon: Funnel,
        children: [
          { label: "Leads", value: "39", icon: Users, route: "/crm/leads" },
          { label: "Contact cards", icon: IdCard, route: "/crm/contact-cards" },
          { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
        ],
      },
      {
        id: "crm-marketing",
        label: "Marketing",
        icon: Palette,
        children: [
          { label: "Email marketing", icon: Mail, route: "/crm/emails" },
          { label: "Drive", icon: HardDrive, route: "/crm/drive" },
        ],
      },
      {
        id: "crm-customer-management",
        label: "Customer management",
        icon: Building2,
        children: [
          { label: "Accounts", icon: Building2, route: "/crm/accounts" },
          { label: "Contacts", icon: Users, route: "/crm/contacts" },
        ],
      },
      { id: "crm-activity", label: "CRM activity", icon: Clock3, route: "/crm/activity" },
      { id: "crm-forms", label: "Forms", icon: FileText, route: "/crm/forms" },
      { id: "quotes", label: "Quotes", icon: ReceiptText, route: "/quotes" },
      { id: "sales-activities", label: "Activities", icon: Clock3 },
      { id: "sales-follow-ups", label: "Follow-ups", icon: BadgeCheck },
      { id: "sales-overview", label: "Sales overview", icon: LayoutDashboard },
    ],
  },
  {
    id: "rates-contracts",
    label: "Rates & Contracts",
    icon: ReceiptText,
    destinations: [
      { id: "rate-contracts", label: "Rate contracts", icon: FileText },
      { id: "tariffs-charges", label: "Tariffs & charges", icon: SlidersHorizontal },
      { id: "rate-results", label: "Rate results", icon: ChartLine },
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse",
    icon: Forklift,
    destinations: [...warehouseNavigation],
  },
  {
    id: "finance",
    label: "Finance",
    icon: ChartNoAxesCombined,
    destinations: [
      { id: "invoicing-receivables", label: "Invoicing & receivables", icon: ReceiptText },
      { id: "supplier-costs-payables", label: "Supplier costs & payables", icon: SlidersHorizontal },
      { id: "credit-control-approvals", label: "Credit control & approvals", icon: BadgeCheck },
      { id: "cash-reconciliation", label: "Cash & reconciliation", icon: Layers3 },
      { id: "profitability", label: "Profitability", icon: ChartLine },
      { id: "tax-fx", label: "Tax & FX", icon: Globe2 },
    ],
  },
  {
    id: "customs-compliance",
    label: "Customs & Compliance",
    icon: BadgeCheck,
    destinations: [
      { id: "standalone-declarations", label: "Stand Alone Declarations", icon: ClipboardCheck, route: "/customs/standalone/export" },
      { id: "job-related-declarations", label: "Job Related Declarations", icon: Ship, route: "/customs/job-related/export" },
      { id: "classification-licences", label: "Classification & licences", icon: ScanText },
      { id: "compliance-controls", label: "Compliance controls", icon: BadgeCheck },
    ],
  },
  {
    id: "documents-service",
    label: "Documents & Service",
    icon: FileText,
    destinations: [
      { id: "document-builder", label: "Documents", icon: FileText, route: "/documents" },
      { id: "signatures-security", label: "Signatures & security", icon: KeyRound },
      { id: "customer-portal", label: "Customer portal", icon: Globe2 },
      { id: "communications", label: "Communications", icon: MessageCircle },
    ],
  },
  {
    id: "insights-ai",
    label: "Insights & AI",
    icon: Sparkles,
    destinations: [
      { id: "reports-exports", label: "Reports & exports", icon: ChartAnalysis, route: "/reports" },
      { id: "ai-workspace", label: "AI workspace", icon: AiBrain, route: "/agent-dexter" },
      { id: "data-quality-observability", label: "Data quality & observability", icon: Gauge },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Settings2,
    destinations: [
      { id: "organisation-offices", label: "Organisation & offices", icon: Globe2, route: "/settings" },
      { id: "users-roles-permissions", label: "Users, roles & permissions", icon: Users },
      { id: "integrations", label: "Integrations", icon: Cloud },
      { id: "subscription-feature-flags", label: "Subscription & feature flags", icon: SlidersHorizontal },
      { id: "security-audit-retention", label: "Security, audit & retention", icon: KeyRound },
    ],
  },
]

export const sidebarPrimary: NavItem[] = [
  { label: "Overview", value: "G O", icon: LayoutDashboard, route: "/" },
  { label: "Warehouse", value: "12", icon: Forklift, route: "/warehouse" },
  { label: "Customers", value: "39", icon: Users, route: "/customers" },
  { label: "CRM", value: "9", icon: BriefcaseBusiness, route: "/crm" },
  { label: "Paper Tray", value: "184", icon: FileText, route: "/paper-tray" },
  { label: "Exceptions", value: "2", icon: TriangleAlert },
]

export const sidebarSecondary: NavItem[] = [
  { label: "Quotes", icon: ReceiptText, route: "/quotes" },
  { label: "Pre-booking", icon: PackageCheck, route: "/bookings/provisional" },
  { label: "Customs", icon: ClipboardCheck },
  { label: "Reports", icon: ChartAnalysis, route: "/reports" },
  { label: "Components", icon: Component, route: "/components" },
  { label: "Navigation lab", icon: Grid3X3, route: "/playground/navigation" },
]

export const crmSidebarItems: NavItem[] = [
  { label: "CRM overview", value: "Live", icon: LayoutDashboard, route: "/crm" },
  { label: "Leads", value: "39", icon: Users, route: "/crm/leads" },
  { label: "Contact cards", icon: IdCard, route: "/crm/contact-cards" },
  { label: "Contacts", icon: Mail, route: "/crm/contacts" },
  { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
  { label: "Forms", icon: FileText, route: "/crm/forms" },
  { label: "Emails", icon: Mail, route: "/crm/emails" },
  { label: "Lists", icon: ListOrdered, route: "/crm/lists" },
  { label: "Drive", icon: HardDrive, route: "/crm/drive" },
  { label: "Activity", value: "24h", icon: Clock3, route: "/crm/activity" },
]
