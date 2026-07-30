import { useMemo, useState } from "react"
import { Archive, BarChart3, BellRing, Boxes, BriefcaseBusiness, Building2, ChartLine, ChevronDown, ClipboardCheck, Database, FileSpreadsheet, FileText, Landmark, MapPinned, PackageCheck, ReceiptText, Route, Search, Settings2, Ship, Star, Users, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type MenuRole = "Operations" | "Commercial" | "Finance" | "Admin"
type MenuItem = { label: string; detail: string; icon: typeof Ship; roles: MenuRole[]; favourite?: boolean }
type MenuGroup = { label: string; detail: string; icon: typeof Ship; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  { label: "Workspace", detail: "Personal starting points and shared views", icon: ChartLine, items: [
    { label: "Overview", detail: "Your operating brief and watched work", icon: ChartLine, roles: ["Operations", "Commercial", "Finance", "Admin"], favourite: true },
    { label: "My tasks", detail: "Assigned work, reminders and due dates", icon: PackageCheck, roles: ["Operations", "Commercial", "Finance", "Admin"], favourite: true },
    { label: "Saved views", detail: "Reusable filters and team worklists", icon: Star, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Global search", detail: "Find a booking, customer, invoice or document", icon: Search, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Notifications", detail: "Operational alerts and approval requests", icon: BellRing, roles: ["Operations", "Commercial", "Finance", "Admin"] },
  ] },
  { label: "Operations", detail: "Daily freight execution", icon: Ship, items: [
    { label: "Bookings", detail: "Active jobs and milestones", icon: Ship, roles: ["Operations", "Admin"], favourite: true },
    { label: "Exceptions", detail: "Holds, delays and action queues", icon: BellRing, roles: ["Operations", "Admin"], favourite: true },
    { label: "Documents", detail: "Documents, releases and approvals", icon: FileText, roles: ["Operations", "Admin"] },
    { label: "Customs", detail: "Declarations, clearance and holds", icon: ClipboardCheck, roles: ["Operations", "Admin"] },
    { label: "Tasks", detail: "Personal and shared operating work", icon: PackageCheck, roles: ["Operations", "Admin"] },
    { label: "Routing", detail: "Planned legs, carriers and service options", icon: Route, roles: ["Operations", "Admin"] },
    { label: "Milestones", detail: "Arrival, departure and completion events", icon: MapPinned, roles: ["Operations", "Admin"] },
    { label: "Carrier schedules", detail: "Sailing, flight and road service schedules", icon: Ship, roles: ["Operations", "Admin"] },
    { label: "Allocations", detail: "Capacity, equipment and collection planning", icon: Boxes, roles: ["Operations", "Admin"] },
    { label: "Workflow rules", detail: "Automation triggers and exception routing", icon: Workflow, roles: ["Operations", "Admin"] },
  ] },
  { label: "Commercial", detail: "Customers and revenue work", icon: BriefcaseBusiness, items: [
    { label: "Accounts", detail: "Customers, contacts and service health", icon: Building2, roles: ["Commercial", "Admin"], favourite: true },
    { label: "Contacts", detail: "Customer people, preferences and communication", icon: Users, roles: ["Commercial", "Admin"] },
    { label: "Leads", detail: "New commercial opportunities", icon: Users, roles: ["Commercial", "Admin"] },
    { label: "Deals", detail: "Pipeline stages, values and next actions", icon: BriefcaseBusiness, roles: ["Commercial", "Admin"] },
    { label: "Quotes", detail: "Rates, margins and approval", icon: BarChart3, roles: ["Commercial", "Admin"], favourite: true },
    { label: "Rate cards", detail: "Customer agreements and reusable pricing", icon: ReceiptText, roles: ["Commercial", "Admin"] },
    { label: "Tariffs", detail: "Buy rates, sell rates and validity windows", icon: FileSpreadsheet, roles: ["Commercial", "Admin"] },
    { label: "Campaigns", detail: "Marketing audiences and activity", icon: BarChart3, roles: ["Commercial", "Admin"] },
    { label: "Customer portal", detail: "External visibility, branding and access", icon: Building2, roles: ["Commercial", "Admin"] },
  ] },
  { label: "Finance", detail: "Billing and operational controls", icon: Landmark, items: [
    { label: "Receivables", detail: "Customer billing and collections", icon: Landmark, roles: ["Finance", "Admin"], favourite: true },
    { label: "Payables", detail: "Supplier costs and payment status", icon: Archive, roles: ["Finance", "Admin"] },
    { label: "Approvals", detail: "Margin, spend and credit decisions", icon: ClipboardCheck, roles: ["Finance", "Admin"] },
    { label: "Reconciliation", detail: "Exceptions between operational and financial data", icon: PackageCheck, roles: ["Finance", "Admin"] },
    { label: "Invoices", detail: "Draft, issued and overdue customer invoices", icon: ReceiptText, roles: ["Finance", "Admin"] },
    { label: "Credit control", detail: "Limits, terms and collection queues", icon: Landmark, roles: ["Finance", "Admin"] },
    { label: "Cash receipts", detail: "Received payments and matching work", icon: Archive, roles: ["Finance", "Admin"] },
    { label: "Currency rates", detail: "Rate sources, periods and overrides", icon: ChartLine, roles: ["Finance", "Admin"] },
    { label: "Financial exports", detail: "Accounting batches and connected ledgers", icon: FileSpreadsheet, roles: ["Finance", "Admin"] },
  ] },
  { label: "Warehouse", detail: "Inventory and fulfilment execution", icon: Boxes, items: [
    { label: "Inventory", detail: "Available, reserved and held stock", icon: Boxes, roles: ["Operations", "Admin"], favourite: true },
    { label: "Orders", detail: "Inbound, outbound and transfer orders", icon: PackageCheck, roles: ["Operations", "Admin"] },
    { label: "Warehouse tasks", detail: "Putaway, picking and count work", icon: ClipboardCheck, roles: ["Operations", "Admin"] },
    { label: "Facilities", detail: "Warehouse sites, areas and working hours", icon: Building2, roles: ["Operations", "Admin"] },
    { label: "Locations", detail: "Bins, zones and capacity controls", icon: MapPinned, roles: ["Operations", "Admin"] },
    { label: "Stock movements", detail: "Receipts, adjustments and transfers", icon: Route, roles: ["Operations", "Admin"] },
    { label: "Stock counts", detail: "Cycle counts, variances and approvals", icon: FileSpreadsheet, roles: ["Operations", "Admin"] },
  ] },
  { label: "Insights", detail: "Reporting, data and continuous improvement", icon: Database, items: [
    { label: "Reports", detail: "Recurring operational and commercial reports", icon: BarChart3, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Report builder", detail: "Create reusable views with governed data", icon: FileSpreadsheet, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Dashboards", detail: "Team scorecards and executive views", icon: ChartLine, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Data quality", detail: "Completeness, validation and correction queues", icon: Database, roles: ["Operations", "Commercial", "Finance", "Admin"] },
    { label: "Audit log", detail: "Security and operational change history", icon: FileText, roles: ["Admin"] },
  ] },
  { label: "Administration", detail: "Workspace and system controls", icon: Settings2, items: [
    { label: "Team", detail: "People, offices and invitations", icon: Users, roles: ["Admin"] },
    { label: "Roles & permissions", detail: "Access by product area and action", icon: Settings2, roles: ["Admin"] },
    { label: "Integrations", detail: "Connected systems and data flows", icon: Building2, roles: ["Admin"] },
    { label: "Offices", detail: "Operating locations and local defaults", icon: Building2, roles: ["Admin"] },
    { label: "Custom fields", detail: "Workspace-specific operational data", icon: FileText, roles: ["Admin"] },
    { label: "Templates", detail: "Document, workflow and message standards", icon: FileSpreadsheet, roles: ["Admin"] },
    { label: "API access", detail: "Keys, webhooks and connected applications", icon: Database, roles: ["Admin"] },
    { label: "Security", detail: "Sign-in, session and device controls", icon: Settings2, roles: ["Admin"] },
  ] },
]

const critiquePoints = [
  ["Keep the main menu shallow", "A person first chooses a business area; the group then reveals only the next useful layer."],
  ["Use search for the long tail", "Direct navigation handles frequent work. Search handles the hundredth option without making the sidebar taller."],
  ["Make access visible only when useful", "Role and office rules remove irrelevant choices, while admins can still discover the full structure."],
] as const

export function NavigationLabPage() {
  const { direction, t } = useLanguage()
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<MenuRole>("Operations")
  const [showAll, setShowAll] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["Workspace", "Operations"]))
  const [selectedLabel, setSelectedLabel] = useState("Bookings")

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return menuGroups.map((group) => ({ ...group, items: group.items.filter((item) => {
      const roleMatch = showAll || item.roles.includes(role)
      const searchMatch = !needle || `${group.label} ${group.detail} ${item.label} ${item.detail}`.toLocaleLowerCase().includes(needle)
      return roleMatch && searchMatch
    }) })).filter((group) => group.items.length > 0)
  }, [query, role, showAll])

  const favourites = groups.flatMap((group) => group.items.filter((item) => item.favourite))
  const optionCount = groups.reduce((count, group) => count + group.items.length, 0)
  const selectItem = (label: string) => setSelectedLabel(label)
  const toggleGroup = (label: string) => setOpenGroups((current) => {
    const next = new Set(current)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    return next
  })

  return (
    <div className="mx-auto w-full max-w-[1480px] py-[var(--md-page-section-gap)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--md-gap-lg)]">
        <div className="max-w-2xl"><p className="md-page-eyebrow">{t("Playground")}</p><h1 className="mt-2 text-[clamp(28px,3vw,40px)] font-medium tracking-[-0.035em] text-[var(--md-ink)]">{t("Navigation lab")}</h1><p className="mt-3 text-[15px] leading-6 text-[var(--md-text)]">{t("An expansive menu pattern to review before it enters the product navigation.")}</p></div>
        <Badge variant="outline" className="h-7 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-accent-a10)] px-2.5 text-[12px] text-[var(--md-accent)]">{t("Prototype - not connected")}</Badge>
      </div>

      <Surface tone="soft" padding="sm" className="mt-[var(--md-page-section-gap)] rounded-[var(--md-radius-xl)]"><div className="flex flex-wrap items-center gap-[var(--md-gap-sm)]">
        <label className="relative min-w-[min(100%,300px)] flex-1"><Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.5} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search navigation")} className="h-10 rounded-[var(--md-radius-md)] border-0 bg-white/72 ps-10 text-[13px] shadow-[var(--md-shadow-line)]" /></label>
        <div className="flex items-center rounded-[var(--md-radius-md)] bg-white/62 p-1 shadow-[var(--md-shadow-line)]"><Button type="button" size="sm" variant={showAll ? "ghost" : "secondary"} onClick={() => setShowAll(false)} className="rounded-[calc(var(--md-radius-md)-4px)] text-[12px]">{t("My work")}</Button><Button type="button" size="sm" variant={showAll ? "secondary" : "ghost"} onClick={() => setShowAll(true)} className="rounded-[calc(var(--md-radius-md)-4px)] text-[12px]">{t("All available")}</Button></div>
        <label className="flex h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-white/72 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]"><span>{t("Role")}</span><select value={role} onChange={(event) => setRole(event.target.value as MenuRole)} className="bg-transparent text-[12px] font-medium text-[var(--md-ink)] outline-none" dir={direction}>{(["Operations", "Commercial", "Finance", "Admin"] as MenuRole[]).map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label>
      </div></Surface>

      <div className="mt-[var(--md-page-section-gap)] grid gap-[var(--md-gap-lg)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <Surface padding="md" className="rounded-[var(--md-radius-xl)]"><SectionHeader title={t("Menu structure")} meta={t(`${optionCount} options visible for this review`)} action={<span className="text-[12px] text-[var(--md-subtle)]">{t("Current role")}: {t(role)}</span>} />
          {favourites.length ? <div className="mt-[var(--md-gap-xl)]"><p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]"><Star className="size-3" strokeWidth={1.6} />{t("Favourites")}</p><div className="flex flex-wrap gap-2">{favourites.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" onClick={() => selectItem(item.label)} className={cn("flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition hover:bg-[var(--md-accent-a10)] hover:text-[var(--md-accent)]", selectedLabel === item.label && "bg-[var(--md-accent-a12)] text-[var(--md-accent)]")}><Icon className="size-3.5" strokeWidth={1.4} />{t(item.label)}</button> })}</div></div> : null}
          <div className="mt-[var(--md-gap-xl)] divide-y divide-[var(--md-line)] border-y border-[var(--md-line)]">{groups.map((group) => { const GroupIcon = group.icon; const isOpen = openGroups.has(group.label) || Boolean(query.trim()); return <div key={group.label} className="py-1.5"><button type="button" className="flex w-full items-center gap-3 rounded-[var(--md-radius-md)] px-2 py-2.5 text-start transition hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" aria-expanded={isOpen} onClick={() => toggleGroup(group.label)}><span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-text)]"><GroupIcon className="size-4" strokeWidth={1.35} /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-[var(--md-ink)]">{t(group.label)}</span><span className="mt-0.5 block text-[12px] text-[var(--md-text)]">{t(group.detail)}</span></span><span className="rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{group.items.length}</span><ChevronDown className={cn("size-4 text-[var(--md-subtle)] transition-transform", isOpen && "rotate-180")} strokeWidth={1.4} /></button>{isOpen ? <div className="ms-5 mt-1 border-s border-[var(--md-line-strong)] ps-4">{group.items.map((item) => { const ItemIcon = item.icon; return <button key={item.label} type="button" onClick={() => selectItem(item.label)} className={cn("flex w-full items-center gap-3 rounded-[var(--md-radius-md)] px-2 py-2 text-start transition hover:bg-[var(--md-hover)]", selectedLabel === item.label && "bg-[var(--md-accent-a10)]")}><ItemIcon className={cn("size-4 shrink-0 text-[var(--md-subtle)]", selectedLabel === item.label && "text-[var(--md-accent)]")} strokeWidth={1.35} /><span className="min-w-0 flex-1"><span className={cn("block text-[12px] font-medium text-[var(--md-ink)]", selectedLabel === item.label && "text-[var(--md-accent)]")}>{t(item.label)}</span><span className="mt-0.5 block text-[11px] text-[var(--md-text)]">{t(item.detail)}</span></span></button> })}</div> : null}</div> })}</div>
        </Surface>
        <div className="space-y-[var(--md-gap-lg)]"><Surface tone="tint" padding="md" className="rounded-[var(--md-radius-xl)]"><p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{t("Selected destination")}</p><p className="mt-2 text-[20px] font-medium tracking-[-0.02em] text-[var(--md-ink)]">{t(selectedLabel)}</p><p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("In the product, this would open the relevant workspace. The menu simply gets you to the right business area quickly.")}</p></Surface><Surface padding="md" className="rounded-[var(--md-radius-xl)]"><SectionHeader title={t("Critique together")} meta={t("The decisions worth testing before the menu grows")} /><div className="mt-[var(--md-gap-lg)] space-y-4">{critiquePoints.map(([title, detail], index) => <div key={title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3"><span className="grid size-6 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[11px] font-medium text-[var(--md-accent)]">{index + 1}</span><div><p className="text-[12px] font-medium text-[var(--md-ink)]">{t(title)}</p><p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(detail)}</p></div></div>)}</div></Surface></div>
      </div>
    </div>
  )
}
