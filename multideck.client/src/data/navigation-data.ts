import {
  BadgeCheck,
  Building2,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Calculator,
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
  Phone,
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
  /** Numeric values are reserved for live unread/actionable notification state, never record totals. */
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
  { id: "warehouse-purchase-orders", label: "Customer purchase orders", icon: ReceiptText, route: "/warehouse/purchase-orders" },
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
export const todoNavItem: NavItem = { label: "To Do list", icon: ClipboardCheck, route: "/to-do" }
export const calendarNavItem: NavItem = { label: "Calendar", icon: CalendarDays, route: "/calendar" }

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
      { id: "crm-phone-calls", label: "Phone calls", icon: Phone, route: "/crm/phone-calls" },
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
        label: "Organisations",
        icon: Building2,
        children: [
          { label: "Companies", icon: Building2, route: "/crm/accounts" },
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
      { id: "rate-contracts", label: "Rate contracts", icon: FileText, route: "/rates/contracts" },
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
      {
        id: "finance-receivables",
        label: "Customers & receivables",
        icon: ReceiptText,
        children: [
          { label: "Customer accounts", icon: Users, route: "/customers" },
          { label: "Sales invoices & credits", icon: ReceiptText, route: "/finance/receivables" },
          { label: "Receivables approvals", icon: BadgeCheck, route: "/finance/receivables/approvals" },
          { label: "Customer receipts & allocation", icon: Layers3, route: "/finance/receivables/cash" },
          { label: "Credit control & collections", icon: CreditCard, route: "/finance/receivables/credit-control" },
          { label: "Invoice & credit batches", value: "Planned", icon: FileText },
          { label: "Receivables enquiries", value: "Planned", icon: MessageCircle },
          { label: "Collection calls & orders", value: "Planned", icon: Phone },
          { label: "Statements", value: "Planned", icon: FileText },
          { label: "Customer claims & queries", value: "Planned", icon: MessageCircle },
          { label: "Print & resend documents", value: "Planned", icon: ReceiptText },
        ],
      },
      {
        id: "finance-payables",
        label: "Suppliers & payables",
        icon: SlidersHorizontal,
        children: [
          { label: "Supplier invoices & credits", icon: SlidersHorizontal, route: "/finance/payables" },
          { label: "Supplier document intake", icon: Upload, route: "/finance/payables/intake" },
          { label: "Payables approvals", icon: BadgeCheck, route: "/finance/payables/approvals" },
          { label: "Supplier payments & allocation", icon: Layers3, route: "/finance/payables/cash" },
          { label: "Supplier purchase orders", value: "Planned", icon: ReceiptText },
          { label: "Incomplete supplier invoices", value: "Planned", icon: TriangleAlert },
          { label: "Payables enquiries", value: "Planned", icon: MessageCircle },
          { label: "Invoice matching", value: "Planned", icon: BadgeCheck },
          { label: "Pending allocation approval", value: "Planned", icon: ClipboardCheck },
          { label: "Supplier claims & queries", value: "Planned", icon: MessageCircle },
          { label: "CASS cost file import", value: "Planned", icon: Upload },
          { label: "Recurring supplier items", value: "Planned", icon: CalendarDays },
        ],
      },
      {
        id: "finance-cash-banking",
        label: "Cash & banking",
        icon: Layers3,
        children: [
          { label: "Cashbook & allocations", icon: Layers3, route: "/finance/cash" },
          { label: "Allocation & reconciliation", icon: BadgeCheck, route: "/finance/cash/reconciliation" },
          { label: "Bank accounts", icon: CreditCard, route: "/finance/banks" },
          { label: "Payment processing", value: "Planned", icon: CreditCard },
          { label: "Collection batches", value: "Planned", icon: Layers3 },
          { label: "Cheque books", value: "Planned", icon: FileText },
          { label: "Cheque controls", value: "Planned", icon: BadgeCheck },
        ],
      },
      {
        id: "finance-accounting",
        label: "Accounts & controls",
        icon: Globe2,
        children: [
          { label: "Finance administration", icon: ChartNoAxesCombined, route: "/finance/administration" },
          { label: "Accounting systems", icon: Cloud, route: "/finance/systems" },
          { label: "Currencies & FX", icon: Globe2, route: "/finance/currencies" },
          { label: "Nominal accounts", icon: ListOrdered, route: "/finance/ledger" },
          { label: "Tax & VAT", icon: BadgeCheck, route: "/finance/tax" },
          { label: "Document numbering & terms", icon: FileText, route: "/finance/documents" },
          { label: "Charge & provider mappings", icon: SlidersHorizontal, route: "/finance/mappings" },
          { label: "Compliance obligations", icon: BadgeCheck, route: "/finance/compliance" },
          { label: "Posting controls & audit", icon: ClipboardCheck, route: "/finance/controls" },
          { label: "Customer & supplier groups", value: "Planned", icon: Users },
          { label: "Sales & expense groups", value: "Planned", icon: Layers3 },
          { label: "Invoice tax messages", value: "Planned", icon: MessageCircle },
          { label: "Job billing exchange rates", value: "Planned", icon: Globe2 },
          { label: "Intercompany mappings", value: "Planned", icon: Layers3 },
          { label: "Multi-language account labels", value: "Planned", icon: Globe2 },
        ],
      },
      {
        id: "finance-management",
        label: "Management accounting",
        icon: ChartLine,
        children: [
          { label: "Accruals & WIP", icon: Calculator, route: "/finance/management/accruals-wip" },
          { label: "Job profitability", value: "Planned", icon: ChartLine },
          { label: "Financial reports", icon: ChartAnalysis, route: "/finance/reports" },
          { label: "Fixed assets", value: "Planned", icon: Building2 },
          { label: "Departments & projects", value: "Planned", icon: BriefcaseBusiness },
          { label: "Products & services", value: "Planned", icon: Package },
          { label: "Finance diary", value: "Planned", icon: CalendarDays },
          { label: "Import chart of accounts", value: "Planned", icon: Upload },
          { label: "Import finance data", value: "Planned", icon: FileText },
        ],
      },
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
      { id: "admin-finance", label: "Finance setup", icon: SlidersHorizontal, route: "/admin/finance" },
      { id: "admin-users", label: "Users", icon: Users, route: "/admin/users" },
      { id: "admin-usage", label: "Usage", icon: ChartAnalysis, route: "/admin/usage" },
      { id: "admin-broadcast", label: "Broadcast", icon: Megaphone, route: "/admin/broadcast" },
      { id: "admin-billing", label: "Billing", icon: CreditCard, route: "/admin/billing" },
      { id: "admin-branding", label: "Branding", icon: Palette, route: "/admin/branding" },
      { id: "admin-system-preferences", label: "System Preferences", icon: Settings2, route: "/admin/system-preferences" },
      { id: "admin-activity-log", label: "Active log", icon: Clock3, route: "/admin/activity" },
      { id: "admin-detailed-log", label: "Detailed log", icon: ListOrdered, route: "/admin/detailed-log" },
    ],
  },
]

export const sidebarPrimary: NavItem[] = [
  { label: "Overview", value: "G O", icon: LayoutDashboard, route: "/" },
  { label: "To Do list", icon: ClipboardCheck, route: "/to-do" },
  { label: "Warehouse", icon: Forklift, route: "/warehouse" },
  { label: "Customers", icon: Users, route: "/customers" },
  { label: "CRM", icon: BriefcaseBusiness, route: "/crm" },
  { label: "Exceptions", icon: TriangleAlert },
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
  { label: "Phone calls", icon: Phone, route: "/crm/phone-calls" },
  { label: "Leads", icon: Users, route: "/crm/leads" },
  { label: "Contact cards", icon: IdCard, route: "/crm/contact-cards" },
  { label: "Contacts", icon: Mail, route: "/crm/contacts" },
  { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
  { label: "Drive", icon: HardDrive, route: "/crm/drive" },
]
