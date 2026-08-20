import {
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
  CreditCard,
  FileText,
  Forklift,
  Funnel,
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
  Megaphone,
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
  TriangleAlert,
  Truck,
  Upload,
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
          { label: "Leads", icon: Users, route: "/crm/leads" },
          { label: "Contact cards", icon: IdCard, route: "/crm/contact-cards" },
          { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
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
      { id: "crm-drive", label: "Drive", icon: HardDrive, route: "/crm/drive" },
      { id: "quotes", label: "Quotes", icon: ReceiptText, route: "/quotes" },
    ],
  },
  {
    id: "rates-contracts",
    label: "Rates & Contracts",
    icon: ReceiptText,
    destinations: [
      { id: "rate-management", label: "Rate management", icon: ReceiptText, route: "/rates" },
      { id: "tariffs-charges", label: "Tariffs & charges", icon: SlidersHorizontal, route: "/rates/tariffs" },
      { id: "rate-imports", label: "Imports & review", icon: Upload, route: "/rates/imports" },
      { id: "rate-results", label: "Quote matching", icon: ChartLine, route: "/rates/results" },
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
      { id: "compliance-controls", label: "Compliance controls", icon: BadgeCheck, route: "/compliance/screening" },
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
    id: "reporting",
    label: "Reporting",
    icon: ChartAnalysis,
    destinations: [
      { id: "reports", label: "Reports", icon: ChartAnalysis, route: "/reports" },
      { id: "scheduled-reports", label: "Scheduled reports", icon: CalendarDays, route: "/reports/scheduled" },
    ],
  },
  {
    id: "administration",
    label: "Admin",
    icon: Settings2,
    destinations: [
      { id: "admin-users", label: "Users", icon: Users, route: "/admin/users" },
      { id: "admin-ai-usage", label: "AI usage", icon: ChartAnalysis, route: "/admin/ai-usage" },
      { id: "admin-broadcast", label: "Broadcast", icon: Megaphone, route: "/admin/broadcast" },
      { id: "admin-billing", label: "Billing", icon: CreditCard, route: "/admin/billing" },
      { id: "admin-system-preferences", label: "System Preferences", icon: Settings2, route: "/admin/system-preferences" },
      { id: "admin-activity-log", label: "Active log", icon: Clock3, route: "/admin/activity" },
      { id: "admin-detailed-log", label: "Detailed log", icon: ListOrdered, route: "/admin/detailed-log" },
    ],
  },
]

export const sidebarPrimary: NavItem[] = [
  { label: "Overview", value: "G O", icon: LayoutDashboard, route: "/" },
  { label: "Warehouse", value: "12", icon: Forklift, route: "/warehouse" },
  { label: "Customers", value: "39", icon: Users, route: "/customers" },
  { label: "CRM", value: "9", icon: BriefcaseBusiness, route: "/crm" },
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
  { label: "Leads", icon: Users, route: "/crm/leads" },
  { label: "Contact cards", icon: IdCard, route: "/crm/contact-cards" },
  { label: "Contacts", icon: Mail, route: "/crm/contacts" },
  { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
  { label: "Drive", icon: HardDrive, route: "/crm/drive" },
]
