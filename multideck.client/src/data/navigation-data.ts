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
  FolderOpen,
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
  ShieldCheck,
  Ship,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Truck,
  Upload,
  Users,
  Wallet,
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
  /**
   * Routes this destination owns without listing them as children, so the
   * sidebar keeps it selected on the pages it links to.
   */
  owns?: string[]
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
  { id: "warehouse-orders", label: "Warehouse orders", icon: ClipboardCheck, route: "/warehouse/orders" },
  { id: "warehouse-purchase-orders", label: "Expected receipts", icon: ReceiptText, route: "/warehouse/purchase-orders" },
]

export const warehouseSetupNavigation: SidebarDestination = {
  id: "warehouse-setup",
  label: "Warehouse",
  icon: Forklift,
  children: [
    { label: "Default pricing", icon: ReceiptText, route: "/warehouse/pricing" },
    { label: "Facilities", icon: Building2, route: "/warehouse/facilities" },
    { label: "Locations", icon: MapPin, route: "/warehouse/locations" },
    { label: "Items", icon: Package, route: "/warehouse/items" },
  ],
}

export const customerWarehouseNavigation: SidebarDestination[] = [
  { id: "warehouse-inventory", label: "Inventory", icon: Boxes, route: "/warehouse/inventory" },
  { id: "warehouse-orders", label: "Warehouse orders", icon: ClipboardCheck, route: "/warehouse/orders" },
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
export const todoNavItem: NavItem = { label: "Tasks", icon: ClipboardCheck, route: "/to-do" }
export const calendarNavItem: NavItem = { label: "Calendar", icon: CalendarDays, route: "/calendar" }


/** One settings link inside an Admin hub block. */
export type AdminHubLink = {
  label: string
  route: string
  /** What the setting decides, shown while it is pointed at or focused. */
  description?: string
  /** Extra words people search for that are not in the label. */
  keywords?: string
  /** Sidebar icon when the area is shown as a menu. */
  icon?: LucideIcon
}

export type AdminHubBlock = {
  id: string
  title: string
  icon: LucideIcon
  /** One line on what the block decides, so it can be read without opening a link. */
  description: string
  links: AdminHubLink[]
  /** Settings not built yet, named once at the foot of the block and never clickable. */
  comingSoon?: string[]
}

export type AdminHubGroup = {
  id: string
  title: string
  description: string
  blockIds: string[]
}

export type AdminHub = {
  id: string
  label: string
  icon: LucideIcon
  route: string
  description: string
  /**
   * `hub` opens the block map. `page` goes straight to the one screen that owns
   * the area. `menu` is a short list of pages shown as sidebar children.
   */
  display: "hub" | "page" | "menu"
  blocks: AdminHubBlock[]
  /** Bands that give a large hub its reading order, each naming the blocks it holds. */
  groups?: AdminHubGroup[]
  /** Leaf routes that keep this area selected in the sidebar. */
  owns?: string[]
}

/** The one person who may open signatures without being a tenant administrator sees only this. */
export const adminEmailSignaturesDestination: SidebarDestination = { id: "admin-email-signatures", label: "Email signatures", icon: Palette, route: "/admin/email-signatures" }

export const adminHubs: AdminHub[] = [
  {
    id: "settings",
    label: "Settings",
    icon: SlidersHorizontal,
    route: "/admin/settings",
    display: "hub",
    description: "Company-wide identity, people, preferences and the audit trail.",
    owns: ["/admin/users", "/admin/branding", "/admin/broadcast", "/admin/system-preferences", "/admin/activity", "/admin/detailed-log", "/admin/email-signatures"],
    groups: [
      { id: "company", title: "Company", description: "How the workspace looks and the defaults it runs on.", blockIds: ["general", "preferences"] },
      { id: "people", title: "People", description: "Who is in, what they can do, and what they did.", blockIds: ["user-management", "audit"] },
    ],
    blocks: [
      {
        id: "general",
        title: "General",
        icon: Palette,
        description: "How the company looks and what everyone is told.",
        links: [
          { label: "Branding", route: "/admin/branding", description: "Company name, logo and colours used on customer-facing outputs.", keywords: "logo colours company name website", icon: Palette },
          { label: "System preferences", route: "/admin/system-preferences", description: "Every company-wide default on one page.", icon: Settings2 },
          { label: "Broadcast", route: "/admin/broadcast", description: "Show one announcement to everyone in the workspace.", keywords: "announcement banner message everyone", icon: Megaphone },
        ],
      },
      {
        id: "user-management",
        title: "User management",
        icon: Users,
        description: "Who can sign in, what they can do, and how they sign off.",
        links: [
          { label: "Users", route: "/admin/users", description: "Invite colleagues, set roles and remove access.", keywords: "invite roles permissions seats people", icon: Users },
          { label: "Email signatures", route: "/admin/email-signatures", description: "Design signatures and assign them to the team.", keywords: "signature team sign off", icon: Mail },
        ],
      },
      {
        id: "preferences",
        title: "Preferences",
        icon: SlidersHorizontal,
        description: "Defaults every team works to.",
        links: [
          { label: "Reference rules", route: "/admin/system-preferences#reference-rules", description: "How quote, customer and booking numbers are built.", keywords: "numbering sequence prefix quote customer booking", icon: ListOrdered },
          { label: "Company events", route: "/admin/system-preferences#events", description: "Turn company events and RSVPs on or off.", keywords: "rsvp events on off", icon: CalendarDays },
          { label: "Customs preferences", route: "/admin/system-preferences#customs", description: "Defaults applied to new customs declarations.", icon: BadgeCheck },
        ],
      },
      {
        id: "audit",
        title: "Activity & audit",
        icon: Clock3,
        description: "Who is working now, and every change made.",
        links: [
          { label: "Active log", route: "/admin/activity", description: "Who is signed in now and what they opened.", keywords: "who is online presence activity", icon: Clock3 },
          { label: "Detailed log", route: "/admin/detailed-log", description: "Every recorded change, with before and after values.", keywords: "audit trail changes history", icon: ScanText },
        ],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: ChartNoAxesCombined,
    route: "/admin/finance",
    display: "hub",
    description: "How the ledgers, tax and banking behave before anything is posted.",
    owns: ["/finance/administration", "/finance/systems", "/finance/currencies", "/finance/ledger", "/finance/tax", "/finance/documents", "/finance/mappings", "/finance/compliance", "/finance/controls"],
    groups: [
      { id: "money", title: "Money in & out", description: "Invoices to customers, bills from suppliers, and the bank between them.", blockIds: ["sales-ledger", "purchase-ledger", "cashbook"] },
      { id: "books", title: "The books", description: "Where every posting lands, and the tax it carries.", blockIds: ["nominal-ledger", "tax"] },
      { id: "oversight", title: "Oversight", description: "Who can post, what is locked, and what management sees.", blockIds: ["controls", "finance-reporting"] },
    ],
    blocks: [
      {
        id: "tax",
        title: "Tax",
        icon: Calculator,
        description: "How tax is calculated, shown and filed.",
        links: [
          { label: "Tax registration & rules", route: "/finance/tax", description: "Registration, jurisdiction and how tax is calculated.", keywords: "vat number jurisdiction calculation prices include tax", icon: Calculator },
          { label: "Tax treatments", route: "/finance/tax", description: "Standard, zero-rated, exempt, export and reverse charge.", keywords: "zero rated exempt reverse charge export", icon: Layers3 },
          { label: "Compliance obligations", route: "/finance/compliance", description: "The filings your jurisdiction pack expects, and when.", keywords: "jurisdiction pack filing", icon: BadgeCheck },
          { label: "UK VAT review", route: "/finance/vat", description: "Check the VAT figures before a return is made.", keywords: "mtd return", icon: ClipboardCheck },
        ],
        comingSoon: ["Invoice tax messages"],
      },
      {
        id: "sales-ledger",
        title: "Sales ledger",
        icon: ReceiptText,
        description: "How customer invoices are numbered, dated and paid.",
        links: [
          { label: "Document numbering", route: "/finance/documents", description: "Prefixes and sequences for invoices and credit notes.", keywords: "sales invoice credit note prefix sequence", icon: ListOrdered },
          { label: "Payment terms", route: "/finance/documents", description: "The due dates customers are given by default.", keywords: "due days credit terms", icon: CalendarDays },
          { label: "Document defaults", route: "/finance/documents", description: "What every new finance document starts with.", icon: FileText },
        ],
        comingSoon: ["Customer & supplier groups", "Invoice & credit batches"],
      },
      {
        id: "purchase-ledger",
        title: "Purchase ledger",
        icon: Upload,
        description: "How supplier costs arrive, match and get paid.",
        links: [
          { label: "Supplier document intake", route: "/finance/payables/intake", description: "Where supplier invoices arrive to be read and checked.", keywords: "upload supplier invoices inbox", icon: Upload },
          { label: "Invoice matching", route: "/finance/payables/matching", description: "Match supplier invoices to the costs you expected.", keywords: "accruals costs match", icon: ScanText },
          { label: "Payment runs & remittances", route: "/finance/payables/payment-runs", description: "Batch supplier payments and send remittances.", icon: CreditCard },
        ],
        comingSoon: ["CASS cost file import", "Recurring supplier items"],
      },
      {
        id: "cashbook",
        title: "Cashbook",
        icon: Building2,
        description: "Bank accounts, statements and reconciliation.",
        links: [
          { label: "Bank accounts", route: "/finance/banks", description: "The accounts money is received into and paid from.", icon: Building2 },
          { label: "Bank statement imports", route: "/finance/systems", description: "Bring statements in to reconcile against.", keywords: "feeds csv statements", icon: Upload },
          { label: "Bank reconciliation", route: "/finance/bank-reconciliation", description: "Agree the cashbook with the bank statement.", icon: BadgeCheck },
        ],
        comingSoon: ["Cheque books", "Collection batches"],
      },
      {
        id: "nominal-ledger",
        title: "Nominal ledger",
        icon: Layers3,
        description: "The accounts, codes and currencies behind every posting.",
        links: [
          { label: "Chart of accounts", route: "/finance/ledger", description: "The nominal codes every posting lands on.", keywords: "nominal codes gl", icon: Grid3X3 },
          { label: "Nominal code mappings", route: "/finance/mappings", description: "Which code each charge, tax and bank posts to.", keywords: "charges map posting", icon: Layers3 },
          { label: "Currencies & FX", route: "/finance/currencies", description: "Operating currencies and how exchange rates apply.", keywords: "exchange rates foreign currency", icon: Globe2 },
          { label: "Journals", route: "/finance/general-ledger/journals", description: "Manual adjustments between nominal codes.", icon: FileText },
          { label: "Accounts system reconciliation", route: "/finance/provider-reconciliation", description: "Compare Multideck with your external accounts system.", keywords: "xero sage quickbooks mirror", icon: Cloud },
        ],
      },
      {
        id: "controls",
        title: "Controls & integrations",
        icon: ShieldCheck,
        description: "Approvals, locked periods and connected accounting.",
        links: [
          { label: "Finance setup overview", route: "/finance/administration", description: "Everything finance still needs before posting starts.", icon: LayoutDashboard },
          { label: "Accounting integrations", route: "/finance/systems", description: "Connect and mirror to an external accounts system.", keywords: "xero sage quickbooks external mirror", icon: Cloud },
          { label: "Posting & approval controls", route: "/finance/controls", description: "Who approves what, and which periods are locked.", keywords: "locked period approval policies settings history audit", icon: ShieldCheck },
          { label: "Mileage payments", route: "/finance/mileage", description: "Pay approved mileage claims and record the reference.", icon: MapPin },
        ],
      },
      {
        id: "finance-reporting",
        title: "Reporting",
        icon: ChartAnalysis,
        description: "Statements and margins for management.",
        links: [
          { label: "Financial reports", route: "/finance/reports", description: "Profit and loss, balance sheet and trial balance.", keywords: "profit loss balance sheet trial balance", icon: ChartAnalysis },
          { label: "Accruals & WIP", route: "/finance/management/accruals-wip", description: "Costs and revenue earned but not yet invoiced.", icon: Calculator },
          { label: "Job profitability", route: "/finance/management/profitability", description: "Margin on every job, from quote to invoice.", icon: ChartLine },
        ],
      },
    ],
  },
  {
    id: "sales-crm",
    label: "Sales & CRM",
    icon: BriefcaseBusiness,
    route: "/admin/sales-crm",
    display: "hub",
    description: "The pipeline, quotes and rates your commercial team works from.",
    owns: ["/crm/settings", "/crm/trips/settings"],
    groups: [
      { id: "selling", title: "Selling", description: "From first enquiry to a priced, followed-up quote.", blockIds: ["quotes", "rates"] },
      { id: "presence", title: "On the road & in the inbox", description: "How the team shows up to customers.", blockIds: ["outreach", "trips"] },
    ],
    blocks: [
      {
        id: "quotes",
        title: "Pipeline & quotes",
        icon: Funnel,
        description: "How a lead becomes a customer, and what they are quoted.",
        links: [
          { label: "Sales stages", route: "/crm/settings", description: "The stages a lead moves through, and their order.", keywords: "lead stages deal pipeline crm settings", icon: Funnel },
          { label: "Quote documents", route: "/admin/system-preferences#quote-documents", description: "The logo printed on customer quote PDFs.", keywords: "pdf logo", icon: FileText },
          { label: "Quote follow-up", route: "/admin/system-preferences#quote-follow-up", description: "When unanswered quotes are chased automatically.", keywords: "reminder chase unanswered", icon: MessageCircle },
          { label: "Quote references", route: "/admin/system-preferences#reference-rules", description: "How quote numbers are built.", keywords: "numbering prefix", icon: ListOrdered },
        ],
      },
      {
        id: "rates",
        title: "Rates & tariffs",
        icon: ReceiptText,
        description: "The buy and sell rates behind every quote.",
        links: [
          { label: "Rate management", route: "/rates", description: "The buy and sell rates quotes are priced from.", icon: ReceiptText },
          { label: "Rate contracts", route: "/rates/contracts", description: "Agreed rates with carriers and customers.", icon: FileText },
          { label: "Tariffs & charges", route: "/rates/tariffs", description: "Standard charges added to quotes and jobs.", icon: SlidersHorizontal },
          { label: "Imports & review", route: "/rates/imports", description: "Upload rate sheets and check them before use.", keywords: "upload rate sheet", icon: Upload },
        ],
      },
      {
        id: "outreach",
        title: "Outreach",
        icon: Mail,
        description: "How the team presents itself to customers.",
        links: [
          { label: "Email signatures", route: "/admin/email-signatures", description: "Design signatures and assign them to the team.", icon: Mail },
          { label: "Digital business cards", route: "/crm/contact-cards", description: "Shareable cards for everyone on the team.", keywords: "contact cards vcard", icon: IdCard },
          { label: "Booking links", route: "/calendar/booking-links", description: "Links customers use to book time with the team.", keywords: "meetings calendar scheduling", icon: CalendarDays },
        ],
      },
      {
        id: "trips",
        title: "Trips & mileage",
        icon: MapPin,
        description: "Mileage rates and claim rules.",
        links: [{ label: "Mileage settings", route: "/crm/trips/settings", description: "Mileage rates and the rules claims follow.", keywords: "rate per mile vehicles", icon: MapPin }],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Ship,
    route: "/admin/system-preferences#reference-rules",
    display: "menu",
    description: "The rules that shape every booking.",
    blocks: [
      {
        id: "bookings",
        title: "Bookings",
        icon: Ship,
        description: "How new bookings and customers are referenced.",
        links: [
          { label: "Booking references", route: "/admin/system-preferences#reference-rules", keywords: "job number prefix", icon: ListOrdered },
          { label: "Customer references", route: "/admin/system-preferences#reference-rules", keywords: "account code", icon: Users },
        ],
        comingSoon: ["Transport planning", "Tracking & milestones", "Exceptions & service recovery", "Claims"],
      },
    ],
  },
  {
    id: "warehouse",
    label: "Warehouse",
    icon: Forklift,
    route: "/warehouse/facilities",
    display: "menu",
    description: "Sites, locations, stocked items and default charges.",
    owns: ["/warehouse/pricing", "/warehouse/facilities", "/warehouse/locations", "/warehouse/items"],
    blocks: [
      {
        id: "warehouse-setup",
        title: "Warehouse",
        icon: Forklift,
        description: "Sites, locations, stocked items and default charges.",
        links: [
          { label: "Facilities", route: "/warehouse/facilities", keywords: "sites depots", icon: Building2 },
          { label: "Locations", route: "/warehouse/locations", keywords: "bays racks bins", icon: MapPin },
          { label: "Items", route: "/warehouse/items", keywords: "sku products", icon: Package },
          { label: "Default pricing", route: "/warehouse/pricing", keywords: "storage handling charges", icon: ReceiptText },
        ],
      },
    ],
  },
  {
    id: "general-reporting",
    label: "General reporting",
    icon: ChartAnalysis,
    route: "/reports",
    display: "menu",
    description: "Report templates, schedules and what has already been sent.",
    blocks: [
      {
        id: "reports",
        title: "Reports",
        icon: ChartAnalysis,
        description: "Templates, schedules and delivery.",
        links: [
          { label: "Report library", route: "/reports", keywords: "new report template builder", icon: ChartAnalysis },
          { label: "Scheduled reports", route: "/reports/scheduled", keywords: "recurring email schedule", icon: CalendarDays },
          { label: "Run history", route: "/reports/history", keywords: "sent delivered", icon: Clock3 },
        ],
      },
      {
        id: "finance-reports",
        title: "Finance reporting",
        icon: ChartLine,
        description: "Statements and job margins.",
        links: [
          { label: "Financial reports", route: "/finance/reports", description: "Profit and loss, balance sheet and trial balance.", icon: ChartAnalysis },
          { label: "Job profitability", route: "/finance/management/profitability", description: "Margin on every job, from quote to invoice.", icon: ChartLine },
        ],
      },
    ],
  },
  {
    id: "ai-usage",
    label: "AI & Usage",
    icon: Sparkles,
    route: "/admin/usage",
    display: "page",
    description: "What Dexter has done for the company and how much of the allowance it has used.",
    owns: ["/admin/usage", "/admin/ai-usage"],
    blocks: [
      {
        id: "dexter",
        title: "Dexter",
        icon: Sparkles,
        description: "Allowance, tokens and requests.",
        links: [
          { label: "AI usage", route: "/admin/usage", keywords: "dexter tokens allowance", icon: Sparkles },
          { label: "Dexter request history", route: "/admin/usage?view=history", keywords: "tokens conversations", icon: Clock3 },
        ],
      },
    ],
  },
  {
    id: "documents-storage",
    label: "Documents & Storage",
    icon: FolderOpen,
    route: "/documents/templates",
    display: "menu",
    description: "Templates, document identity and where company files live.",
    blocks: [
      {
        id: "templates",
        title: "Templates",
        icon: FileText,
        description: "The layouts documents are generated from.",
        links: [
          { label: "Document templates", route: "/documents/templates", keywords: "carbone layouts", icon: FileText },
          { label: "Documents", route: "/documents", icon: FileText },
          { label: "Quote documents", route: "/admin/system-preferences#quote-documents", description: "The logo printed on customer quote PDFs.", keywords: "logo pdf", icon: FileText },
        ],
      },
      {
        id: "numbering",
        title: "Numbering",
        icon: ListOrdered,
        description: "How documents and records are referenced.",
        links: [
          { label: "Finance document numbering", route: "/finance/documents", keywords: "invoice prefix", icon: ListOrdered },
          { label: "Reference rules", route: "/admin/system-preferences#reference-rules", description: "How quote, customer and booking numbers are built.", icon: ListOrdered },
        ],
      },
      {
        id: "storage",
        title: "Storage",
        icon: FolderOpen,
        description: "Where company files live.",
        links: [{ label: "Drive", route: "/crm/drive", keywords: "files folders", icon: HardDrive }],
        comingSoon: ["Signatures & security"],
      },
    ],
  },
  {
    id: "plan",
    label: "Plan & Subscription",
    icon: Wallet,
    route: "/admin/billing",
    display: "page",
    description: "Your plan, seats, monthly price and billing.",
    owns: ["/admin/billing"],
    blocks: [
      {
        id: "subscription",
        title: "Subscription",
        icon: Wallet,
        description: "Plan, seats and billing.",
        links: [{ label: "Plan & billing", route: "/admin/billing", keywords: "subscription price invoice contract seats", icon: Wallet }],
      },
    ],
  },
  {
    id: "customs-compliance",
    label: "Customs & compliance",
    icon: ShieldCheck,
    route: "/admin/system-preferences#customs",
    display: "menu",
    description: "Customs defaults and the screening that protects every shipment.",
    blocks: [
      {
        id: "customs",
        title: "Customs",
        icon: BadgeCheck,
        description: "Defaults applied to every declaration.",
        links: [
          { label: "Customs preferences", route: "/admin/system-preferences#customs", description: "Defaults applied to new customs declarations.", icon: BadgeCheck },
          { label: "Stand alone declarations", route: "/customs/standalone/export", icon: ClipboardCheck },
          { label: "Job related declarations", route: "/customs/job-related/export", icon: Ship },
        ],
        comingSoon: ["Classification & licences"],
      },
      {
        id: "compliance",
        title: "Compliance",
        icon: ShieldCheck,
        description: "The screening that protects each shipment.",
        links: [
          { label: "Compliance controls", route: "/compliance/screening", keywords: "sanctions screening denied parties", icon: ShieldCheck },
          { label: "Tax compliance obligations", route: "/finance/compliance", icon: BadgeCheck },
        ],
      },
    ],
  },
]

/** The hub with a block map that owns a leaf route, for the way back from that page. */
export function adminHubForRoute(route: string) {
  return adminHubs.find((hub) => hub.display === "hub" && hub.owns?.some((owned) => route === owned || route.startsWith(`${owned}/`)))
}

function adminDestination(hub: AdminHub): SidebarDestination {
  if (hub.display === "menu") {
    const seen = new Set<string>()
    const children: NavItem[] = hub.blocks.flatMap((block) => [
      ...block.links.map((link) => ({ label: link.label, icon: link.icon ?? block.icon, route: link.route })),
      ...(block.comingSoon ?? []).map((label) => ({ label, icon: block.icon, value: "Planned" })),
    ]).filter((item) => !seen.has(item.label) && Boolean(seen.add(item.label)))
    return { id: `admin-${hub.id}`, label: hub.label, icon: hub.icon, children, owns: hub.owns }
  }
  return { id: `admin-${hub.id}`, label: hub.label, icon: hub.icon, route: hub.route, owns: hub.owns }
}

export const sidebarAreas: SidebarArea[] = [
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
      {
        id: "crm-marketing",
        label: "Marketing",
        icon: Megaphone,
        children: [
          { label: "Digital business cards", icon: IdCard, route: "/crm/contact-cards" },
          { label: "Meetings", icon: CalendarDays, route: "/calendar/meetings" },
        ],
      },
      { id: "quotes", label: "Quotes", icon: ReceiptText, route: "/quotes" },
      { id: "crm-drive", label: "Drive", icon: HardDrive, route: "/crm/drive" },
      { id: "crm-trips", label: "Trips & mileage", icon: MapPin, route: "/crm/trips" },
    ],
  },
  {
    id: "rates-contracts",
    label: "Rates & contracts",
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
    id: "customs-compliance",
    label: "Customs & compliance",
    icon: BadgeCheck,
    destinations: [
      { id: "standalone-declarations", label: "Stand Alone Declarations", icon: ClipboardCheck, route: "/customs/standalone/export" },
      { id: "job-related-declarations", label: "Job Related Declarations", icon: Ship, route: "/customs/job-related/export" },
      { id: "classification-licences", label: "Classification & licences", icon: ScanText },
      { id: "compliance-controls", label: "Compliance controls", icon: BadgeCheck, route: "/compliance/screening" },
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
          { label: "Collections worklist", icon: CreditCard, route: "/finance/receivables/collections" },
          { label: "Statements", icon: FileText, route: "/finance/receivables/statements" },
          { label: "Customer claims & queries", value: "Planned", icon: MessageCircle },
          { label: "Print & resend documents", value: "Planned", icon: ReceiptText },
        ],
      },
      {
        id: "finance-payables",
        label: "Suppliers & payables",
        icon: SlidersHorizontal,
        children: [
          { label: "Supplier accounts", icon: Users, route: "/suppliers" },
          { label: "Supplier invoices & credits", icon: SlidersHorizontal, route: "/finance/payables" },
          { label: "Supplier document intake", icon: Upload, route: "/finance/payables/intake" },
          { label: "Payables approvals", icon: BadgeCheck, route: "/finance/payables/approvals" },
          { label: "Supplier payments & allocation", icon: Layers3, route: "/finance/payables/cash" },
          { label: "Supplier purchase orders", icon: ReceiptText, route: "/finance/payables/purchase-orders" },
          { label: "Incomplete supplier invoices", value: "Planned", icon: TriangleAlert },
          { label: "Payables enquiries", value: "Planned", icon: MessageCircle },
          { label: "Invoice matching", icon: BadgeCheck, route: "/finance/payables/matching" },
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
          { label: "Bank accounts", icon: Building2, route: "/finance/banks" },
          { label: "Cashbook & allocations", icon: Layers3, route: "/finance/cash" },
          { label: "Allocation & reconciliation", icon: BadgeCheck, route: "/finance/cash/reconciliation" },
          { label: "Bank reconciliation", icon: BadgeCheck, route: "/finance/bank-reconciliation" },
          { label: "Payment runs & remittances", icon: CreditCard, route: "/finance/payables/payment-runs" },
          { label: "Collection batches", value: "Planned", icon: Layers3 },
          { label: "Cheque books", value: "Planned", icon: FileText },
          { label: "Cheque controls", value: "Planned", icon: BadgeCheck },
        ],
      },
      {
        id: "finance-general-ledger",
        label: "General ledger",
        icon: Calculator,
        children: [
          { label: "Transactions", icon: Layers3, route: "/finance/general-ledger" },
          { label: "Account enquiries", icon: FileText, route: "/finance/general-ledger/accounts" },
          { label: "Journals", icon: FileText, route: "/finance/general-ledger/journals" },
          { label: "Accounts system reconciliation", icon: BadgeCheck, route: "/finance/provider-reconciliation" },
          { label: "Chart of accounts", icon: Calculator, route: "/finance/ledger" },
        ],
      },
      {
        id: "finance-accounting-planned",
        label: "More accounting settings",
        icon: Globe2,
        children: [
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
          { label: "Job profitability", icon: ChartLine, route: "/finance/management/profitability" },
          { label: "Financial reports", icon: ChartAnalysis, route: "/finance/reports" },
          { label: "Compliance obligations", icon: BadgeCheck, route: "/finance/compliance" },
          { label: "UK VAT review", icon: Calculator, route: "/finance/vat" },
          { label: "Fixed assets", value: "Planned", icon: Building2 },
          { label: "Departments & projects", value: "Planned", icon: BriefcaseBusiness },
          { label: "Products & services", value: "Planned", icon: Package },
          { label: "Finance diary", value: "Planned", icon: CalendarDays },
          { label: "Import chart of accounts", value: "Planned", icon: Upload },
          { label: "Import finance data", value: "Planned", icon: FileText },
        ],
      },
      { id: "finance-mileage", label: "Mileage payments", icon: ReceiptText, route: "/finance/mileage" },
    ],
  },
  {
    id: "documents-service",
    label: "Documents",
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
      { id: "admin-dashboard", label: "Dashboard", icon: LayoutDashboard, route: "/admin" },
      ...adminHubs.map(adminDestination),
    ],
  },
]

export const sidebarPrimary: NavItem[] = [
  { label: "Overview", value: "G O", icon: LayoutDashboard, route: "/" },
  { label: "Tasks", icon: ClipboardCheck, route: "/to-do" },
  { label: "Warehouse", icon: Forklift, route: "/warehouse" },
  { label: "Customers", icon: Users, route: "/customers" },
  { label: "CRM", icon: BriefcaseBusiness, route: "/crm" },
  { label: "Exceptions", icon: TriangleAlert },
]

export const sidebarSecondary: NavItem[] = [
  { label: "Quotes", icon: ReceiptText, route: "/quotes" },
  { label: "New booking", icon: PackageCheck, route: "/bookings/new" },
  { label: "Customs", icon: ClipboardCheck },
  { label: "Reports", icon: ChartAnalysis, route: "/reports" },
  { label: "Components", icon: Component, route: "/components" },
  { label: "Navigation lab", icon: Grid3X3, route: "/playground/navigation" },
]

export const crmSidebarItems: NavItem[] = [
  { label: "CRM overview", value: "Live", icon: LayoutDashboard, route: "/crm" },
  { label: "Phone calls", icon: Phone, route: "/crm/phone-calls" },
  { label: "Leads", icon: Users, route: "/crm/leads" },
  { label: "Digital business cards", icon: IdCard, route: "/crm/contact-cards" },
  { label: "Contacts", icon: Mail, route: "/crm/contacts" },
  { label: "Deals", icon: BriefcaseBusiness, route: "/crm/deals" },
  { label: "Drive", icon: HardDrive, route: "/crm/drive" },
]
