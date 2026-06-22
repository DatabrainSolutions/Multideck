import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Download,
  FileText,
  Folder,
  Image,
  LayoutTemplate,
  PenLine,
  Plus,
  Settings2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ContactProfileModule,
  CustomerFilterBar,
  CustomerListTable,
} from "@/components/multideck/customer-components"
import {
  CrmActivityTimeline,
  CrmAssetFolderCard,
  CrmAssetRow,
  CrmContactTable,
  CrmDealDetailPanel,
  CrmForecastPanel,
  CrmLeadSignalList,
  CrmMetricsGrid,
  CrmPipelineBoard,
  CrmPriorityActionsPanel,
  CrmRevenueMixPanel,
  CrmSalesCommandCenter,
  CrmSalesFunnelPanel,
  CrmSettingsBuilder,
  type CrmAssetFile,
  type CrmAssetFolder,
} from "@/components/multideck/crm-components"
import { Pagination } from "@/components/multideck/pagination"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { TabsRail } from "@/components/multideck/workflow-components"
import {
  crmActivities,
  crmContacts,
  crmPipelineBoards,
  crmPipelineStages,
  currentOperator,
  customerFilters,
  customers,
  type StatusTone,
} from "@/data/multideck-data"

const rowsPerPageOptions = [10, 20, 30, 50]
type CrmDeal = (typeof crmPipelineStages)[number]["deals"][number]
type CrmPipeline = (typeof crmPipelineBoards)[number]
type CrmContact = (typeof crmContacts)[number]
type Lead = (typeof customers)[number]

const crmEmailLists = [
  {
    id: "eu-importers-apparel",
    name: "EU importers · apparel",
    type: "Smart",
    count: 142,
    delta: "+9 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "June rates · QBR invites",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Apparel importers with recent EU lanes, seasonal quotes, or open capacity conversations.",
    rules: ["Industry includes apparel", "Region is EU or UK", "Engaged in the last 120 days"],
    members: [
      ["Marlow Apparel Ltd", "Sandra Aldridge", "sandra@marlowapparel.co.uk", "Premium", "Opened June rates"],
      ["Bauhaus Importe GmbH", "Lukas Meyer", "lukas@bauhaus-importe.de", "Active lead", "Clicked QBR invite"],
      ["Nordic Thread Co", "Maja Lund", "maja@nordicthread.dk", "Customer", "Quote requested"],
      ["Maison Port Supply", "Camille Roche", "camille@maisonport.fr", "Prospect", "No reply yet"],
    ],
  },
  {
    id: "all-active-customers",
    name: "All active customers",
    type: "Smart",
    count: 268,
    delta: "+3 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "Peak season advisory",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Customers with bookings, quotes, or account activity in the current commercial cycle.",
    rules: ["Customer status is active", "No suppression flag", "Primary contact has a valid work email"],
    members: [
      ["Northwind GmbH", "Elena Moreno", "elena@northwind.de", "Customer", "Opened last advisory"],
      ["Pacific Goods Co", "Wei Chen", "wei@pacificgoods.com", "Customer", "Clicked service update"],
      ["Black Forest Foods", "Jonas Keller", "jonas@blackforestfoods.de", "Customer", "Replied yesterday"],
      ["Atlas Office Supply", "Mina Okafor", "mina@atlasoffice.co", "Customer", "Viewed report"],
    ],
  },
  {
    id: "dormant-90d",
    name: "Dormant 90d+",
    type: "Smart",
    count: 57,
    delta: "-4 this week",
    deltaTone: "red" as StatusTone,
    usedIn: "Win-back campaign",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "WC",
    updated: "Live from CRM",
    description: "Accounts with no booking activity in the last 90 days and no active deal in pipeline.",
    rules: ["Last booking older than 90 days", "No open quote", "Contact is not suppressed"],
    members: [
      ["Harbour Homeware", "Amelia Stone", "amelia@harbourhome.co.uk", "Dormant", "Last opened May rates"],
      ["Forma Retail Group", "Oscar Bennett", "oscar@formaretail.co", "Dormant", "No booking 112d"],
      ["Ridgeway Textiles", "Priya Shah", "priya@ridgewaytextiles.co.uk", "Dormant", "Clicked win-back"],
    ],
  },
  {
    id: "qbr-attendees-h1",
    name: "QBR attendees · H1",
    type: "Static",
    count: 34,
    delta: "manual",
    deltaTone: "neutral" as StatusTone,
    usedIn: "QBR follow-up",
    statusLabel: "May 28",
    statusTone: "neutral" as StatusTone,
    owner: "JL",
    updated: "Imported May 28",
    description: "Manually curated contacts from first-half QBR sessions and follow-up meetings.",
    rules: ["Static import", "QBR attendance confirmed", "Manual owner review"],
    members: [
      ["Marlow Apparel Ltd", "Sandra Aldridge", "sandra@marlowapparel.co.uk", "Attendee", "Asked for June lanes"],
      ["Pacific Goods Co", "Wei Chen", "wei@pacificgoods.com", "Attendee", "Requested deck"],
      ["Black Forest Foods", "Jonas Keller", "jonas@blackforestfoods.de", "Attendee", "Follow-up booked"],
    ],
  },
  {
    id: "peak-season-air-prospects",
    name: "Peak-season air prospects",
    type: "Smart",
    count: 81,
    delta: "+12 this week",
    deltaTone: "green" as StatusTone,
    usedIn: "not used yet",
    statusLabel: "live",
    statusTone: "green" as StatusTone,
    owner: "EM",
    updated: "Live from CRM",
    description: "Prospects likely to need air options when ocean schedules tighten.",
    rules: ["Recent delay on ocean lane", "High value or urgent goods", "Air quote interest signal"],
    members: [
      ["Copenhagen Components", "Freja Nielsen", "freja@cphcomponents.dk", "Prospect", "Air quote viewed"],
      ["Milano Market Group", "Rosa Conti", "rosa@milanomarket.it", "Lead", "Peak season note"],
      ["Bristol Bike Parts", "Theo Carter", "theo@bristolbikeparts.co.uk", "Lead", "Clicked air advisory"],
    ],
  },
]

const crmMarketingFolders: CrmAssetFolder[] = [
  {
    id: "brand-logos",
    name: "Brand logos",
    description: "Primary marks, partner lockups, favicon exports, and approved logo variations.",
    itemCount: 9,
    size: "48 MB",
    updated: "Updated today",
    owner: "Elena",
    tone: "teal" as StatusTone,
    icon: Folder,
  },
  {
    id: "graphics",
    name: "Graphics",
    description: "Lane visuals, customer education graphics, hero images, and social-ready artwork.",
    itemCount: 14,
    size: "312 MB",
    updated: "Updated Tue",
    owner: "Will",
    tone: "green" as StatusTone,
    icon: Image,
  },
  {
    id: "email-templates",
    name: "Email templates",
    description: "Reusable HTML blocks, header images, advisory layouts, and footer snippets.",
    itemCount: 6,
    size: "22 MB",
    updated: "Updated Jun 10",
    tone: "amber" as StatusTone,
    owner: "Jamie",
    icon: LayoutTemplate,
  },
  {
    id: "sales-collateral",
    name: "Sales collateral",
    description: "One-pagers, trade-lane explainers, customer report inserts, and proposal assets.",
    itemCount: 11,
    size: "186 MB",
    updated: "Updated Jun 7",
    tone: "blue" as StatusTone,
    owner: "Mina",
    icon: FileText,
  },
]

const crmMarketingAssetCount = crmMarketingFolders.reduce((total, folder) => total + folder.itemCount, 0)

const crmMarketingAssets: CrmAssetFile[] = [
  {
    id: "md-primary-logo-svg",
    folderId: "brand-logos",
    name: "multideck-primary-logo.svg",
    type: "SVG",
    size: "124 KB",
    updated: "Today",
    owner: "Elena",
    usage: "Approved primary logo for light surfaces",
    tone: "green" as StatusTone,
    icon: FileText,
  },
  {
    id: "md-full-lockup-png",
    folderId: "brand-logos",
    name: "multideck-full-lockup-dark.png",
    type: "PNG",
    size: "1.8 MB",
    updated: "Today",
    owner: "Elena",
    usage: "Dark-background lockup for decks and webinars",
    tone: "green" as StatusTone,
    icon: Image,
  },
  {
    id: "partner-badge-set",
    folderId: "brand-logos",
    name: "partner-badge-set.zip",
    type: "ZIP",
    size: "9.4 MB",
    updated: "Jun 11",
    owner: "Will",
    usage: "Approved partner badges for customer announcements",
    tone: "blue" as StatusTone,
    icon: Folder,
  },
  {
    id: "peak-season-hero",
    folderId: "graphics",
    name: "peak-season-capacity-hero.png",
    type: "PNG",
    size: "18.6 MB",
    updated: "Tue",
    owner: "Will",
    usage: "Hero graphic for peak-season advisory",
    tone: "green" as StatusTone,
    icon: Image,
  },
  {
    id: "customs-checklist-graphic",
    folderId: "graphics",
    name: "customs-checklist-carousel.fig",
    type: "FIG",
    size: "42 MB",
    updated: "Mon",
    owner: "Mina",
    usage: "Editable carousel graphics for customs education",
    tone: "amber" as StatusTone,
    icon: Image,
  },
  {
    id: "air-freight-map",
    folderId: "graphics",
    name: "air-freight-response-map.jpg",
    type: "JPG",
    size: "7.2 MB",
    updated: "Jun 6",
    owner: "Jamie",
    usage: "Map visual for delayed ocean quote follow-up",
    tone: "blue" as StatusTone,
    icon: Image,
  },
  {
    id: "monthly-rates-html",
    folderId: "email-templates",
    name: "monthly-rates-newsletter.html",
    type: "HTML",
    size: "86 KB",
    updated: "Jun 10",
    owner: "Jamie",
    usage: "Reusable rates newsletter shell",
    tone: "green" as StatusTone,
    icon: LayoutTemplate,
  },
  {
    id: "service-advisory-template",
    folderId: "email-templates",
    name: "service-advisory-single-cta.html",
    type: "HTML",
    size: "64 KB",
    updated: "Jun 8",
    owner: "Elena",
    usage: "Urgent service update with one clear action",
    tone: "amber" as StatusTone,
    icon: LayoutTemplate,
  },
  {
    id: "customer-reactivation-copy",
    folderId: "email-templates",
    name: "customer-reactivation-copy.docx",
    type: "DOCX",
    size: "210 KB",
    updated: "Jun 5",
    owner: "Will",
    usage: "Copy blocks for dormant account follow-up",
    tone: "green" as StatusTone,
    icon: FileText,
  },
  {
    id: "eu-apparel-one-pager",
    folderId: "sales-collateral",
    name: "eu-apparel-lane-one-pager.pdf",
    type: "PDF",
    size: "4.8 MB",
    updated: "Jun 7",
    owner: "Mina",
    usage: "One-pager for apparel importers",
    tone: "blue" as StatusTone,
    icon: FileText,
  },
  {
    id: "customs-readiness-pack",
    folderId: "sales-collateral",
    name: "customs-readiness-pack.pdf",
    type: "PDF",
    size: "6.1 MB",
    updated: "Jun 6",
    owner: "Elena",
    usage: "Document checklist pack for onboarding",
    tone: "amber" as StatusTone,
    icon: FileText,
  },
  {
    id: "qbr-insert",
    folderId: "sales-collateral",
    name: "qbr-report-insert.key",
    type: "KEY",
    size: "26 MB",
    updated: "Jun 4",
    owner: "Jamie",
    usage: "Reusable QBR insert for customer reports",
    tone: "green" as StatusTone,
    icon: LayoutTemplate,
  },
]

const crmMarketingStorageStats = [
  ["Storage used", "568 MB"],
  ["Shared folders", "4"],
  ["Recently updated", "7 assets"],
  ["Owners", "4 people"],
]

const crmMarketingActivity = [
  ["Today 10:18", "Elena added the dark logo lockup"],
  ["Tue 15:42", "Will refreshed peak-season graphics"],
  ["Jun 10", "Jamie updated the newsletter template"],
]

const crmEmailTemplates = [
  {
    name: "Monthly rates newsletter",
    detail: "Lane tables + Dexter market note",
    accent: "wide",
  },
  {
    name: "Service advisory",
    detail: "Single urgent update, one CTA",
    accent: "simple",
  },
  {
    name: "Branded announcement",
    detail: "New lane, new service, hires",
    accent: "wide",
  },
  {
    name: "Win-back",
    detail: "Personal note + tailored rates",
    accent: "simple",
  },
]

const crmEmailCampaigns = [
  {
    id: "june-ocean-rates-update",
    name: "June ocean rates update",
    subject: "June ocean rates: Felixstowe, Rotterdam and Hamburg",
    preheader: "Updated lane tables with Dexter's market note.",
    type: "Newsletter",
    audience: "June rates audience · 412",
    status: "Sent",
    tone: "green" as StatusTone,
    when: "Jun 9, 08:00",
    open: "52%",
    click: "18%",
    uploads: "rate-table-june.csv",
    edited: "Sent by Elena",
    stats: { delivered: "408", openRate: "52%", clickRate: "18%", unsubscribed: "3" },
    engaged: [
      ["Sandra Aldridge", "Marlow Apparel Ltd", "Opened + clicked lane table"],
      ["Lukas Meyer", "Bauhaus Importe GmbH", "Clicked Felixstowe rates"],
      ["Wei Chen", "Pacific Goods Co", "Forwarded internally"],
    ],
    unsubscribed: [
      ["Oscar Bennett", "Forma Retail Group", "Unsubscribed after send"],
      ["Amelia Stone", "Harbour Homeware", "Marketing opt-out"],
      ["Mina Okafor", "Atlas Office Supply", "Changed email preference"],
    ],
  },
  {
    id: "peak-season-advisory",
    name: "Peak season advisory — book by Jul 15",
    subject: "Peak season advisory: book capacity by Jul 15",
    preheader: "Recommended booking windows for active customers.",
    type: "Advisory",
    audience: "All active customers · 268",
    status: "Scheduled",
    tone: "blue" as StatusTone,
    when: "Jun 13, 08:00",
    open: "—",
    click: "—",
    uploads: "advisory-hero.html",
    edited: "Final copy ready",
    stats: { delivered: "scheduled", openRate: "—", clickRate: "—", unsubscribed: "—" },
    engaged: [
      ["Elena Moreno", "Northwind Forwarding", "Internal approval ready"],
      ["Wei Chen", "Pacific Goods Co", "Preview recipient"],
    ],
    unsubscribed: [],
  },
  {
    id: "win-back-dormant-90d",
    name: "Win-back: dormant 90d+",
    subject: "Still planning summer freight?",
    preheader: "A short personal note with tailored rate lines.",
    type: "Win-back",
    audience: "Dormant 90d+ · 57",
    status: "Draft",
    tone: "neutral" as StatusTone,
    when: "edited 2h ago",
    open: "—",
    click: "—",
    uploads: "personal-rate-lines.csv",
    edited: "Needs subject line",
    stats: { delivered: "draft", openRate: "—", clickRate: "—", unsubscribed: "—" },
    engaged: [
      ["Priya Shah", "Ridgeway Textiles", "Likely to re-engage"],
      ["Amelia Stone", "Harbour Homeware", "Opened May rates"],
    ],
    unsubscribed: [
      ["Oscar Bennett", "Forma Retail Group", "Suppressed from win-back"],
    ],
  },
  {
    id: "may-ocean-rates-update",
    name: "May ocean rates update",
    subject: "May ocean rates update",
    preheader: "Lane tables and schedule notes for May.",
    type: "Newsletter",
    audience: "May rates audience · 396",
    status: "Sent",
    tone: "green" as StatusTone,
    when: "May 12, 08:00",
    open: "49%",
    click: "15%",
    uploads: "rate-table-may.csv",
    edited: "Archived",
    stats: { delivered: "392", openRate: "49%", clickRate: "15%", unsubscribed: "4" },
    engaged: [
      ["Sandra Aldridge", "Marlow Apparel Ltd", "Opened twice"],
      ["Jonas Keller", "Black Forest Foods", "Clicked customs note"],
      ["Maja Lund", "Nordic Thread Co", "Replied for quote"],
    ],
    unsubscribed: [
      ["Camille Roche", "Maison Port Supply", "Unsubscribed"],
      ["Theo Carter", "Bristol Bike Parts", "Paused marketing"],
    ],
  },
]

function firstDeal(pipeline: CrmPipeline = crmPipelineBoards[0]) {
  return pipeline.stages.flatMap((stage) => stage.deals)[0] ?? crmPipelineStages.flatMap((stage) => stage.deals)[0]
}

function getLeadCrmPath(lead: Lead) {
  return `/crm/leads/${lead.id}`
}

function getCrmListPath(list: (typeof crmEmailLists)[number]) {
  return `/crm/lists/${list.id}`
}

function getCrmEmailCampaignPath(campaign: (typeof crmEmailCampaigns)[number], mode: "stats" | "edit") {
  return `/crm/emails/${campaign.id}/${mode}`
}

function CrmPageHeader({
  eyebrow = "CRM",
  title,
  summary,
  meta,
  action,
  onSpeakToDexter,
}: {
  eyebrow?: string
  title: string
  summary?: ReactNode
  meta?: string
  action?: ReactNode
  onSpeakToDexter?: () => void
}) {
  return (
    <div className="flex flex-col gap-[var(--md-gap-lg)] xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">{eyebrow}</p>
        <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{title}</h1>
        {summary ? <p className="mt-2 max-w-[860px] text-[15px] leading-6 text-[var(--md-text)]">{summary}</p> : null}
        {meta ? <p className="mt-2 text-[12px] font-medium text-[var(--md-subtle)]">{meta}</p> : null}
      </div>
      {action || onSpeakToDexter ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onSpeakToDexter ? <DexterActionPill onClick={onSpeakToDexter} /> : null}
          {action}
        </div>
      ) : null}
    </div>
  )
}

function PrimaryActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button
      className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
      onClick={onClick}
    >
      <Plus data-icon="inline-start" strokeWidth={1.2} />
      {children}
    </Button>
  )
}

function DealDetailDrawer({
  deal,
  open,
  onClose,
}: {
  deal: CrmDeal
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,20,19,0.14)] p-3 backdrop-blur-[6px] sm:p-[var(--md-page-stack-gap)]" role="dialog" aria-modal="true" aria-label="Deal details">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close deal details" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] p-3 shadow-[var(--md-shadow-lift)]">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">Deal details</p>
            <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]">{deal.account}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close deal details"
            className="size-9 shrink-0 rounded-[var(--md-radius-md)] bg-white/55 shadow-[var(--md-shadow-line)] hover:bg-white/80"
            onClick={onClose}
          >
            <X data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        </div>
        <div className="md-scrollbar min-h-0 flex-1 overflow-y-auto">
          <CrmDealDetailPanel deal={deal} />
        </div>
      </aside>
    </div>
  )
}

export function CrmOverviewPage() {
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal>(() => firstDeal())
  const [detailOpen, setDetailOpen] = useState(false)
  const [dexterOpen, setDexterOpen] = useState(false)

  function openDealDetail(deal: CrmDeal) {
    setSelectedDeal(deal)
    setDetailOpen(true)
  }

  function switchPipeline(pipeline: CrmPipeline) {
    setSelectedDeal(firstDeal(pipeline))
    setDetailOpen(false)
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="CRM overview" className="md-page md-page-stack">
      <CrmPageHeader
        title="CRM overview"
        summary={
          <>
            A sales dashboard for live pipeline health, lead conversion, forecast confidence, and the actions that move revenue forward.
          </>
        }
        meta="Live CRM · sales pipeline · lead follow-up"
        onSpeakToDexter={() => setDexterOpen(true)}
        action={<PrimaryActionButton onClick={() => toast.success("Deal draft created")}>New deal</PrimaryActionButton>}
      />

      <CrmSalesCommandCenter />
      <CrmMetricsGrid />

      <div className="grid items-start gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <CrmSalesFunnelPanel />
        <div className="grid gap-[var(--md-page-stack-gap-compact)] lg:grid-cols-2 xl:grid-cols-1">
          <CrmRevenueMixPanel />
          <CrmForecastPanel />
        </div>
      </div>

      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="px-5 py-4">
          <SectionHeader title="Pipeline board" meta="drag cards between stages as deals move" />
        </div>
        <div className="px-4 pb-5 sm:px-5">
          <CrmPipelineBoard selectedDealId={detailOpen ? selectedDeal.id : undefined} onSelectDeal={openDealDetail} onPipelineChange={switchPipeline} />
        </div>
      </Surface>

      <div className="grid gap-[var(--md-page-stack-gap-compact)] xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.72fr)]">
        <CrmLeadSignalList onOpenLead={(signal) => toast.success(`${signal.account} opened`)} />
        <CrmPriorityActionsPanel />
      </div>

      <CrmActivityTimeline compact />
      <DealDetailDrawer deal={selectedDeal} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </DexterDockedPage>
  )
}

function PipelineSettingsDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,20,19,0.14)] p-3 backdrop-blur-[6px] sm:p-[var(--md-page-stack-gap)]" role="dialog" aria-modal="true" aria-label="Pipeline settings">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close pipeline settings" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[980px] flex-col overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-bg)] p-3 shadow-[var(--md-shadow-lift)]">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/60 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              <Settings2 className="size-4" strokeWidth={1.2} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-normal text-[var(--md-subtle)]">Deals</p>
              <p className="mt-1 truncate text-[14px] font-medium text-[var(--md-ink)]">Pipeline settings</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close pipeline settings"
            className="size-9 shrink-0 rounded-[var(--md-radius-md)] bg-white/55 shadow-[var(--md-shadow-line)] hover:bg-white/80"
            onClick={onClose}
          >
            <X data-icon="inline-start" strokeWidth={1.2} />
          </Button>
        </div>
        <div className="md-scrollbar min-h-0 flex-1 overflow-y-auto rounded-[var(--md-radius-xl)]">
          <CrmSettingsBuilder />
        </div>
      </aside>
    </div>
  )
}

export function CrmLeadsPage({ navigate }: { navigate: (path: string) => void }) {
  const [activeFilter, setActiveFilter] = useState(customerFilters[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [dexterOpen, setDexterOpen] = useState(false)

  const visibleLeads = useMemo(() => {
    const filter = activeFilter.split(" · ")[0]
    if (filter === "All") return customers
    return customers.filter((customer) => customer.status === filter)
  }, [activeFilter])

  const pageCount = Math.max(Math.ceil(visibleLeads.length / rowsPerPage), 1)
  const paginatedLeads = visibleLeads.slice((page - 1) * rowsPerPage, page * rowsPerPage)

  useEffect(() => {
    setPage(1)
  }, [activeFilter])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function toggleLead(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openLeadDetail(lead: Lead) {
    navigate(getLeadCrmPath(lead))
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Leads" className="md-page md-page-stack">
      <CrmPageHeader
        title="Leads"
        summary={
          <>
            CRM leads reuse the customer system, with commercial context close to live bookings and service health.
          </>
        }
        meta={`${customers.length} leads · ${customers.filter((customer) => customer.owner === currentOperator.initials).length} owned by ${currentOperator.name}`}
        onSpeakToDexter={() => setDexterOpen(true)}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
              onClick={() => toast.success("Lead export prepared")}
            >
              <Download data-icon="inline-start" strokeWidth={1.2} />
              Export
            </Button>
            <PrimaryActionButton onClick={() => toast.success("Lead draft created")}>New lead</PrimaryActionButton>
          </>
        }
      />

      <CustomerFilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

      <CustomerListTable
        customers={paginatedLeads}
        selectedIds={selectedIds}
        onToggleCustomer={toggleLead}
        onOpenCustomer={openLeadDetail}
      />

      <Pagination
        page={page}
        pageCount={pageCount}
        totalItems={visibleLeads.length}
        pageSize={rowsPerPage}
        pageSizeOptions={rowsPerPageOptions}
        itemLabel="leads"
        onPageChange={setPage}
        onPageSizeChange={(nextRowsPerPage) => {
          setRowsPerPage(nextRowsPerPage)
          setPage(1)
        }}
      />
    </DexterDockedPage>
  )
}

export function CrmLeadDetailPage({
  navigate,
  leadId,
}: {
  navigate: (path: string) => void
  leadId: string
}) {
  const lead = customers.find((customer) => customer.id === leadId) ?? customers[0]
  const [activeLeadTab, setActiveLeadTab] = useState("Overview")
  const leadContacts = [
    {
      initials: lead.initials,
      name: lead.name.includes("Hartmann") ? "Petra Hartmann" : `${lead.name.split(" ")[0]} lead`,
      role: "Head of Supply Chain · prefers Email",
      email: `p.${lead.id.replaceAll("-", "")}@example.com`,
      badge: "Primary",
      activity: "opened email 2h ago",
    },
    {
      initials: "JK",
      name: "Jens Krüger",
      role: "Procurement manager · prefers Phone",
      email: "j.krueger@example.com",
      badge: "",
      activity: "on intro call Mon",
    },
  ]
  const laneRows = [
    ["Shanghai → Hamburg · FCL", 0.9, "9 TEU/mo"],
    ["Ningbo → Hamburg · FCL", 0.42, "4 TEU/mo"],
    ["Hong Kong → HAM · Air", 0.12, "ad hoc"],
  ] as const
  const activityRows = [
    ["Today 09:12", "Petra opened “June ocean rates” twice · clicked Asia–EU table", "Email · June rates campaign", "teal"],
    ["Tue 16:40", "Rates newsletter delivered", "Email · June rates campaign", "neutral"],
    ["Mon 11:05", "Intro call · 22 min — moving from spot to contract, decision in July", "Call · Elena Moreno", "blue"],
    ["Jun 4", "Dexter qualified the lead — lane & volume fit ICP, score 86/100", "AI · lead scoring", "green"],
  ] as const
  const leadTabs = [
    { label: "Overview" },
    { label: "Contacts", value: "2" },
    { label: "Emails", value: "5" },
    { label: "Quotes", value: "1 draft" },
    { label: "Activity" },
    { label: "Notes" },
  ] as const
  const metricCards = [
    ["Dexter score", "86", "strong ICP fit", "green"],
    ["Est. annual value", "€168k", "14 TEU/mo · FCL", "ink"],
    ["Engagement", "4 of 5", "emails opened · 2 clicks", "teal"],
    ["Days to decision", "19", "targets Jul 1 contract", "amber"],
    ["Current setup", "Spot", "via DSV · no contract", "ink"],
  ] as const

  return (
    <div className="md-page md-page-stack">
      <section className="flex flex-col gap-[var(--md-page-stack-gap)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
          <div className="grid size-[100px] shrink-0 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] text-[32px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
            {lead.initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)] sm:text-[34px]">{lead.name}</h1>
              <StatusPill tone="green">Qualified</StatusPill>
              <StatusPill tone="amber">Hot</StatusPill>
              <StatusPill tone="neutral">Lead</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-[var(--md-text)]">
              <span>{lead.industry}</span>
              <span>HQ {lead.location}</span>
              <span>Lead since Jun 3, 2026</span>
              <span>Source Trade show · transport logistic</span>
              <span>Owner Elena Moreno</span>
            </div>
          </div>
        </div>

        <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map(([label, value, detail, tone]) => (
            <Surface key={label} padding="lg" className="rounded-[var(--md-radius-xl)]">
              <p className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</p>
              <p className={tone === "green" ? "mt-3 text-[30px] font-medium leading-none text-[var(--md-green)]" : tone === "teal" ? "mt-3 text-[30px] font-medium leading-none text-[var(--md-accent)]" : tone === "amber" ? "mt-3 text-[30px] font-medium leading-none text-[var(--md-amber)]" : "mt-3 text-[30px] font-medium leading-none text-[var(--md-ink)]"}>{value}</p>
              <p className="mt-3 text-[13px] text-[var(--md-text)]">{detail}</p>
            </Surface>
          ))}
        </div>

        <TabsRail tabs={leadTabs} activeTab={activeLeadTab} onChange={setActiveLeadTab} />
      </section>

      {activeLeadTab === "Overview" ? (
        <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1fr)_560px]">
          <div className="md-panel-column">
            <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
              <div className="flex items-center justify-between gap-4 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Lane interest</h2>
                  <span className="text-[13px] text-[var(--md-text)]">from intro call · Jun 9</span>
                </div>
                <Button
                  variant="ghost"
                  className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
                  onClick={() => toast.success("Quote draft opened")}
                >
                  Draft a quote →
                </Button>
              </div>
              <div className="grid gap-0 px-5 py-5">
                {laneRows.map(([lane, progress, volume]) => (
                  <div key={lane} className="grid gap-3 py-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:pt-0 first:shadow-none sm:grid-cols-[240px_minmax(0,1fr)_96px] sm:items-center">
                    <p className="text-[14px] font-medium text-[var(--md-ink)]">{lane}</p>
                    <div className="h-2 overflow-hidden rounded-full bg-[rgba(91,113,108,0.16)]">
                      <div className="h-full rounded-full bg-[var(--md-accent)]" style={{ width: `${progress * 100}%` }} />
                    </div>
                    <p className="text-[13px] text-[var(--md-text)] sm:text-right">{volume}</p>
                  </div>
                ))}
                <div className="mt-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
                  <p className="text-[14px] leading-6 text-[var(--md-text)]">
                    Pricing context: similar apparel accounts on Shanghai → Hamburg average <span className="font-medium text-[var(--md-ink)]">€1,180/TEU</span> with 18% margin. Hamburg consolidation has space from week 27.
                  </p>
                </div>
              </div>
            </Surface>

            <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
              <div className="flex items-baseline gap-3 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
                <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Activity</h2>
                <span className="text-[13px] text-[var(--md-text)]">since Jun 3</span>
              </div>
              <div className="px-5 py-4">
                {activityRows.map(([time, title, source, tone]) => (
                  <div key={title} className="grid gap-3 py-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:pt-0 first:shadow-none sm:grid-cols-[110px_18px_minmax(0,1fr)]">
                    <p className="text-[13px] text-[var(--md-text)]">{time}</p>
                    <span className={tone === "teal" ? "mt-1.5 size-2 rounded-full bg-[var(--md-accent)]" : tone === "blue" ? "mt-1.5 size-2 rounded-full bg-[var(--md-blue)]" : tone === "green" ? "mt-1.5 size-2 rounded-full bg-[var(--md-green)]" : "mt-1.5 size-2 rounded-full bg-[var(--md-text)]"} />
                    <div>
                      <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
                      <p className="mt-1 text-[12px] text-[var(--md-text)]">{source}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          <div className="md-panel-column">
            <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
              <div className="flex items-center justify-between gap-4 px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Contacts</h2>
                  <span className="text-[13px] text-[var(--md-text)]">2</span>
                </div>
                <Button
                  variant="ghost"
                  className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
                  onClick={() => setActiveLeadTab("Contacts")}
                >
                  View all →
                </Button>
              </div>
              <div>
                {leadContacts.map((contact) => (
                  <div key={contact.email} className="grid gap-4 px-5 py-5 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
                    <span className="grid size-12 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[13px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">{contact.initials}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium text-[var(--md-ink)]">{contact.name}</p>
                        {contact.badge ? <StatusPill tone="teal">{contact.badge}</StatusPill> : null}
                      </div>
                      <p className="mt-1 text-[13px] text-[var(--md-text)]">{contact.role}</p>
                      <p className="mt-1 truncate text-[12px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{contact.email}</p>
                    </div>
                    <p className="text-[13px] text-[var(--md-text)] sm:text-right">{contact.activity}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <Button
                  variant="ghost"
                  className="h-11 w-full rounded-[var(--md-radius-lg)] border-0 bg-white/20 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/45"
                  onClick={() => toast.success("Contact draft created")}
                >
                  <Plus data-icon="inline-start" strokeWidth={1.2} />
                  Add contact
                </Button>
              </div>
            </Surface>

            <Surface padding="lg" className="rounded-[var(--md-radius-xl)] bg-[rgba(191,222,217,0.72)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.26)]">
              <SectionHeader title="Dexter · lead pulse" meta="" />
              <p className="mt-4 text-[15px] leading-7 text-[var(--md-ink)]">
                Ready to quote. Petra opened the rates email twice and lingered on Asia–EU. Their July decision window means a quote this week lands while they're comparing — I've pre-filled one from the intro-call notes.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/25 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/45" onClick={() => toast.success("Draft quote opened")}>Review drafted quote</Button>
                <Button variant="ghost" className="h-10 rounded-[var(--md-radius-lg)] bg-white/25 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/45" onClick={() => toast.success("Rates one-pager queued")}>Send rates one-pager</Button>
              </div>
            </Surface>

            <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
              <div className="px-5 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.06)]">
                <h2 className="text-[16px] font-medium text-[var(--md-ink)]">Qualification</h2>
              </div>
              <div className="px-5 py-3">
                {[
                  ["ICP fit", "Strong · 86/100"],
                  ["Decision owner", "Petra Hartmann"],
                  ["Need", "Spot to contract by July"],
                  ["Next step", "Quote this week"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[1fr_auto] gap-4 py-3 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] first:shadow-none">
                    <p className="text-[13px] text-[var(--md-text)]">{label}</p>
                    <p className="text-right text-[13px] font-medium text-[var(--md-accent)]">{value}</p>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </div>
      ) : (
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title={activeLeadTab} meta={`Focused ${activeLeadTab.toLowerCase()} view for this lead`} />
          <p className="mt-4 text-[14px] leading-6 text-[var(--md-text)]">
            The lead workspace keeps this tab available from the same detail view so reps do not need to jump back to the CRM list.
          </p>
        </Surface>
      )}
    </div>
  )
}
export function CrmContactsPage() {
  const [selectedEmail, setSelectedEmail] = useState(crmContacts[0].email)
  const [dexterOpen, setDexterOpen] = useState(false)
  const selectedContact = crmContacts.find((contact) => contact.email === selectedEmail) ?? crmContacts[0]

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Contacts" className="md-page md-page-stack">
      <CrmPageHeader
        title="Contacts"
        summary={
          <>
            A contact book for the people who actually move freight decisions: decision makers, customs leads, finance owners, and daily operators.
          </>
        }
        meta={`${crmContacts.length} contacts · 5 leads · customer preferences visible inline`}
        onSpeakToDexter={() => setDexterOpen(true)}
        action={<PrimaryActionButton onClick={() => toast.success("Contact draft created")}>New contact</PrimaryActionButton>}
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Relationship contacts" meta="selected contact opens full context beside the list" />
          </div>
          <div className="px-5 pb-5">
            <CrmContactTable
              contacts={crmContacts}
              selectedEmail={selectedEmail}
              onSelectContact={(contact: CrmContact) => setSelectedEmail(contact.email)}
            />
          </div>
        </Surface>
        <ContactProfileModule contact={selectedContact} />
      </div>
    </DexterDockedPage>
  )
}

function EmailTemplatePreview({ variant }: { variant: string }) {
  return (
    <div className="rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
      <div className="h-1.5 w-12 rounded-full bg-[var(--md-accent)]" />
      <div className="mt-3 grid gap-2">
        {variant === "wide" ? <div className="h-7 rounded-[var(--md-radius-sm)] bg-[rgba(14,125,116,0.14)]" /> : null}
        <div className="h-1.5 w-4/5 rounded-full bg-[rgba(91,113,108,0.18)]" />
        <div className="h-1.5 w-2/3 rounded-full bg-[rgba(91,113,108,0.14)]" />
        <div className="h-1.5 w-1/2 rounded-full bg-[rgba(91,113,108,0.12)]" />
      </div>
      <div className="mt-4 h-4 w-16 rounded-[var(--md-radius-sm)] bg-[var(--md-accent)]" />
    </div>
  )
}

export function CrmListsPage({ navigate }: { navigate: (path: string) => void }) {
  const [dexterOpen, setDexterOpen] = useState(false)

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Lists" className="md-page md-page-stack">
      <CrmPageHeader
        title="Lists"
        summary={
          <>
            Smart lists update themselves from CRM data — build a rule once and every campaign that uses the list stays current.
          </>
        }
        onSpeakToDexter={() => setDexterOpen(true)}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => toast.success("CSV import opened")}
            >
              <Upload data-icon="inline-start" strokeWidth={1.2} />
              Import CSV
            </Button>
            <PrimaryActionButton onClick={() => toast.success("Email list draft created")}>New list</PrimaryActionButton>
          </>
        }
      />

      <div className="grid gap-[var(--md-gap-lg)] lg:grid-cols-2 2xl:grid-cols-3">
        {crmEmailLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className="group min-h-[184px] rounded-[var(--md-radius-xl)] bg-white/72 p-5 text-left shadow-[var(--md-shadow-line)] transition-[background,transform,box-shadow] duration-200 hover:scale-[1.01] hover:bg-white/88 hover:shadow-[var(--md-shadow-lift)]"
            onClick={() => navigate(getCrmListPath(list))}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[16px] font-medium leading-6 text-[var(--md-ink)]">{list.name}</h2>
              <StatusPill tone={list.type === "Smart" ? "teal" : "neutral"}>{list.type}</StatusPill>
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-[34px] font-medium leading-none tracking-normal text-[var(--md-ink)]">{list.count}</span>
              <span className={list.deltaTone === "red" ? "text-[13px] font-medium text-[var(--md-red)]" : list.deltaTone === "green" ? "text-[13px] font-medium text-[var(--md-green)]" : "text-[13px] font-medium text-[var(--md-subtle)]"}>
                {list.delta}
              </span>
            </div>
            <div className="mt-5 h-px bg-[rgba(11,20,19,0.08)]" />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-[13px] text-[var(--md-text)]">Used in: {list.usedIn}</p>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--md-green)]">
                <span className="size-2 rounded-full bg-[var(--md-green)]" />
                {list.statusLabel}
              </span>
            </div>
          </button>
        ))}

        <button
          type="button"
          className="grid min-h-[184px] place-items-center rounded-[var(--md-radius-xl)] bg-white/20 p-5 text-center shadow-[var(--md-shadow-line)] transition-[background,transform] duration-200 hover:scale-[1.01] hover:bg-white/35"
          onClick={() => toast.success("New list draft created")}
        >
          <span>
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-[rgba(14,125,116,0.12)] text-[22px] font-medium text-[var(--md-accent)]">+</span>
            <span className="mt-4 block text-[14px] font-medium text-[var(--md-ink)]">New list</span>
            <span className="mt-2 block text-[13px] text-[var(--md-text)]">or describe one to Dexter</span>
          </span>
        </button>
      </div>
    </DexterDockedPage>
  )
}

export function CrmListDetailPage({ navigate, listId }: { navigate: (path: string) => void; listId: string }) {
  const list = crmEmailLists.find((item) => item.id === listId) ?? crmEmailLists[0]

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Lists"
        title={list.name}
        summary={list.description}
        meta={`${list.count} contacts · ${list.updated}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/lists")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to lists
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => toast.success(`${list.name} exported`)}
            >
              <Download data-icon="inline-start" strokeWidth={1.2} />
              Export
            </Button>
            <PrimaryActionButton onClick={() => toast.success("List rules opened")}>Edit rules</PrimaryActionButton>
          </>
        }
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Members" meta="people currently included in this audience" />
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Company</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Contact</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Email</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Status</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Last engagement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.members.map(([company, contact, email, status, lastEngagement]) => (
                  <TableRow key={`${company}-${email}`} className="h-[64px] border-[rgba(11,20,19,0.04)] hover:bg-white/35">
                    <TableCell className="text-[13px] font-medium text-[var(--md-ink)]">{company}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{contact}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]" data-i18n-skip dir="ltr">{email}</TableCell>
                    <TableCell><StatusPill tone={status === "Dormant" ? "amber" : status === "Lead" || status === "Prospect" ? "blue" : "green"}>{status}</StatusPill></TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{lastEngagement}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>

        <div className="md-panel-column">
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="Audience health" meta={list.type === "Smart" ? "updated from CRM rules" : "manual import"} />
            <div className="mt-[var(--md-page-stack-gap)] grid grid-cols-2 gap-3">
              {[
                ["Contacts", String(list.count)],
                ["Owner", list.owner],
                ["Used in", list.usedIn],
                ["Status", list.statusLabel],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[var(--md-radius-lg)] bg-white/45 p-3 shadow-[var(--md-shadow-line)]">
                  <p className="text-[11px] font-medium text-[var(--md-subtle)]">{label}</p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{value}</p>
                </div>
              ))}
            </div>
          </Surface>

          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="List rules" meta="who is included" />
            <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
              {list.rules.map((rule) => (
                <div key={rule} className="shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{rule}</p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

export function CrmEmailsPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title="Emails"
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => toast.success("Brand kit opened")}
            >
              Brand kit
            </Button>
            <PrimaryActionButton onClick={() => toast.success("Email draft created")}>New email</PrimaryActionButton>
          </>
        }
      />

      <section className="grid gap-[var(--md-gap-md)]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-4">
            <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Start from a template</h2>
            <p className="text-[13px] text-[var(--md-text)]">All templates carry your logo, colors and footer automatically</p>
          </div>
          <Button
            variant="ghost"
            className="h-10 w-fit rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
            onClick={() => toast.success("HTML upload opened")}
          >
            <Upload data-icon="inline-start" strokeWidth={1.2} />
            Upload email
          </Button>
        </div>
        <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 2xl:grid-cols-4">
          {crmEmailTemplates.map((template) => (
            <button
              key={template.name}
              type="button"
              className="rounded-[var(--md-radius-xl)] bg-white/72 p-4 text-left shadow-[var(--md-shadow-line)] transition-[background,transform,box-shadow] duration-200 hover:scale-[1.01] hover:bg-white/88 hover:shadow-[var(--md-shadow-lift)]"
              onClick={() => toast.success(`${template.name} selected`)}
            >
              <EmailTemplatePreview variant={template.accent} />
              <h3 className="mt-4 text-[15px] font-medium text-[var(--md-ink)]">{template.name}</h3>
              <p className="mt-1 text-[13px] text-[var(--md-text)]">{template.detail}</p>
            </button>
          ))}
        </div>
      </section>

      <div>
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader title="Campaigns" />
            <p className="text-[13px] font-medium text-[var(--md-text)]">Avg open 51% · industry 28%</p>
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Email</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Type</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Audience list</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Status</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">When</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Open</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Click</TableHead>
                  <TableHead className="w-[92px] text-right text-[12px] font-medium text-[var(--md-text)]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crmEmailCampaigns.map((campaign) => (
                  <TableRow
                    key={campaign.name}
                    className="h-[68px] cursor-pointer border-[rgba(11,20,19,0.04)] hover:bg-white/35"
                    onClick={() => navigate(getCrmEmailCampaignPath(campaign, "stats"))}
                  >
                    <TableCell className="text-[14px] font-medium text-[var(--md-ink)]">{campaign.name}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{campaign.type}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{campaign.audience}</TableCell>
                    <TableCell><StatusPill tone={campaign.tone}>{campaign.status}</StatusPill></TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{campaign.when}</TableCell>
                    <TableCell className="text-[14px] font-medium text-[var(--md-ink)]">{campaign.open}</TableCell>
                    <TableCell className="text-[14px] font-medium text-[var(--md-ink)]">{campaign.click}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`See statistics for ${campaign.name}`}
                          className="size-8 rounded-[var(--md-radius-sm)] bg-white/45 shadow-[var(--md-shadow-line)] hover:bg-white/75"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(getCrmEmailCampaignPath(campaign, "stats"))
                          }}
                        >
                          <ChartNoAxesCombined data-icon="inline-start" strokeWidth={1.2} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${campaign.name}`}
                          className="size-8 rounded-[var(--md-radius-sm)] bg-white/45 shadow-[var(--md-shadow-line)] hover:bg-white/75"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(getCrmEmailCampaignPath(campaign, "edit"))
                          }}
                        >
                          <PenLine data-icon="inline-start" strokeWidth={1.2} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmEmailStatsPage({ navigate, campaignId }: { navigate: (path: string) => void; campaignId: string }) {
  const campaign = crmEmailCampaigns.find((item) => item.id === campaignId) ?? crmEmailCampaigns[0]

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Emails"
        title={`${campaign.name} statistics`}
        summary="Campaign performance, engaged contacts, and unsubscribes in one full workspace."
        meta={`${campaign.audience} · ${campaign.when}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/emails")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to emails
            </Button>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate(getCrmEmailCampaignPath(campaign, "edit"))}
            >
              <PenLine data-icon="inline-start" strokeWidth={1.2} />
              Edit email
            </Button>
          </>
        }
      />

      <div className="grid gap-[var(--md-gap-md)] md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Delivered", campaign.stats.delivered],
          ["Open", campaign.stats.openRate],
          ["Click-through", campaign.stats.clickRate],
          ["Unsubscribed", campaign.stats.unsubscribed],
        ].map(([label, value]) => (
          <Surface key={label} padding="lg" className="rounded-[var(--md-radius-xl)]">
            <p className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</p>
            <p className="mt-3 text-[30px] font-medium leading-none text-[var(--md-ink)]">{value}</p>
          </Surface>
        ))}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Who's up" meta="contacts showing buying or engagement signals" />
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <Table className="min-w-[620px]">
              <TableHeader>
                <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Contact</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Company</TableHead>
                  <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.engaged.map(([name, company, signal]) => (
                  <TableRow key={`${name}-${signal}`} className="h-[64px] border-[rgba(11,20,19,0.04)] hover:bg-white/35">
                    <TableCell className="text-[13px] font-medium text-[var(--md-ink)]">{name}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{company}</TableCell>
                    <TableCell className="text-[13px] text-[var(--md-text)]">{signal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>

        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          <div className="px-5 py-4">
            <SectionHeader title="Unsubscribed" meta="contacts removed from future marketing sends" />
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            {campaign.unsubscribed.length ? (
              <Table className="min-w-[620px]">
                <TableHeader>
                  <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
                    <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Contact</TableHead>
                    <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Company</TableHead>
                    <TableHead className="text-[12px] font-medium text-[var(--md-text)]">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaign.unsubscribed.map(([name, company, reason]) => (
                    <TableRow key={`${name}-${reason}`} className="h-[64px] border-[rgba(11,20,19,0.04)] hover:bg-white/35">
                      <TableCell className="text-[13px] font-medium text-[var(--md-ink)]">{name}</TableCell>
                      <TableCell className="text-[13px] text-[var(--md-text)]">{company}</TableCell>
                      <TableCell className="text-[13px] text-[var(--md-text)]">{reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="rounded-[var(--md-radius-lg)] bg-white/38 p-4 text-[13px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">No unsubscribes recorded yet.</p>
            )}
          </div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmEmailEditPage({ navigate, campaignId }: { navigate: (path: string) => void; campaignId: string }) {
  const campaign = crmEmailCampaigns.find((item) => item.id === campaignId) ?? crmEmailCampaigns[0]

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        eyebrow="Emails"
        title={`Edit ${campaign.name}`}
        summary="Update the subject, audience, uploaded assets, and send settings before the next review."
        meta={`${campaign.status} · ${campaign.edited}`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/35 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/65"
              onClick={() => navigate("/crm/emails")}
            >
              <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
              Back to emails
            </Button>
            <Button
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              onClick={() => toast.success("Email changes saved")}
            >
              Save changes
            </Button>
          </>
        }
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title="Email setup" meta="content and delivery" />
          <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
            {[
              ["Subject line", campaign.subject],
              ["Preview text", campaign.preheader],
              ["Audience list", campaign.audience],
              ["Send time", campaign.when],
              ["Uploaded asset", campaign.uploads],
            ].map(([label, value]) => (
              <label key={label} className="grid gap-2">
                <span className="text-[12px] font-medium text-[var(--md-subtle)]">{label}</span>
                <input
                  className="h-11 rounded-[var(--md-radius-lg)] bg-white/55 px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--md-accent)]"
                  defaultValue={value}
                  data-i18n-skip={label.includes("Subject") || label.includes("Preview") ? undefined : true}
                  dir={label.includes("Subject") || label.includes("Preview") ? undefined : "ltr"}
                />
              </label>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
                onClick={() => toast.success("Replacement upload opened")}
              >
                <Upload data-icon="inline-start" strokeWidth={1.2} />
                Upload assets
              </Button>
              <Button
                variant="ghost"
                className="h-10 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
                onClick={() => navigate(getCrmEmailCampaignPath(campaign, "stats"))}
              >
                <ChartNoAxesCombined data-icon="inline-start" strokeWidth={1.2} />
                See statistics
              </Button>
            </div>
          </div>
        </Surface>

        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title="Review" meta="current campaign state" />
          <div className="mt-[var(--md-page-stack-gap)] grid gap-3">
            {[
              ["Type", campaign.type],
              ["Status", campaign.status],
              ["Open", campaign.open],
              ["Click", campaign.click],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                <span className="text-[13px] font-medium text-[var(--md-text)]">{label}</span>
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{value}</span>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmMarketingPage() {
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null)
  const openedFolder = openedFolderId ? crmMarketingFolders.find((folder) => folder.id === openedFolderId) ?? null : null
  const openedFolderAssets = openedFolder ? crmMarketingAssets.filter((asset) => asset.folderId === openedFolder.id) : []

  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title="Marketing"
        summary={
          <>
            A shared drive for brand logos, graphics, templates, and collateral used across emails, reports, and customer follow-up.
          </>
        }
        meta={`${crmMarketingFolders.length} folders · ${crmMarketingAssetCount} assets · connected to email templates and CRM`}
        action={
          <>
            <Button
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-white/55 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78"
              onClick={() => toast.success("Asset upload opened")}
            >
              <UploadCloud data-icon="inline-start" strokeWidth={1.2} />
              Upload asset
            </Button>
            <PrimaryActionButton onClick={() => toast.success("Folder draft created")}>New folder</PrimaryActionButton>
          </>
        }
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
          {!openedFolder ? (
            <>
              <div className="px-5 py-4">
                <SectionHeader title="Folders" meta="logos, graphics, templates, and collateral" />
              </div>
              <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-4">
                {crmMarketingFolders.map((folder) => (
                  <CrmAssetFolderCard
                    key={folder.id}
                    folder={folder}
                    selected={false}
                    onSelect={(nextFolder) => setOpenedFolderId(nextFolder.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/80"
                      onClick={() => setOpenedFolderId(null)}
                    >
                      <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
                      Marketing drive
                    </Button>
                    <span className="text-[12px] font-medium text-[var(--md-subtle)]">/</span>
                    <span className="text-[13px] font-medium text-[var(--md-ink)]">{openedFolder.name}</span>
                  </div>
                  <SectionHeader
                    title={openedFolder.name}
                    meta={`${openedFolder.itemCount} stored assets · ${openedFolder.owner} owns this folder · ${openedFolder.updated}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  className="h-10 rounded-[var(--md-radius-lg)] bg-white/55 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/78"
                  onClick={() => toast.success(`Upload opened for ${openedFolder.name}`)}
                >
                  <UploadCloud data-icon="inline-start" strokeWidth={1.2} />
                  Upload asset
                </Button>
              </div>

              <div className="mt-5 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 shadow-[var(--md-shadow-line)]">
                <div className="hidden grid-cols-[minmax(0,1fr)_96px_108px_120px] gap-3 px-3 pb-2 text-[11px] font-medium uppercase tracking-normal text-[var(--md-subtle)] sm:grid">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Size</span>
                  <span className="text-right">Updated</span>
                </div>
                <div className="grid gap-1 rounded-[var(--md-radius-lg)] bg-white/62 p-1 shadow-[var(--md-shadow-line)]">
                  {openedFolderAssets.map((asset) => (
                    <CrmAssetRow
                      key={asset.id}
                      asset={asset}
                      onOpen={(selectedAsset) => toast.success(`${selectedAsset.name} opened`)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </Surface>

        <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
          <SectionHeader title="Drive summary" meta="library health" />
          <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
            {crmMarketingStorageStats.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{label}</span>
                <span className="max-w-[170px] text-right text-[12px] leading-5 text-[var(--md-text)]" data-i18n-skip={label === "Storage used" ? true : undefined} dir={label === "Storage used" ? "ltr" : undefined}>{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[var(--md-ink)]">Recent activity</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">Latest asset changes</p>
              </div>
              <StatusPill tone="green">Synced</StatusPill>
            </div>
            <div className="mt-4 grid gap-3">
              {crmMarketingActivity.map(([time, activity]) => (
                <div key={activity} className="grid grid-cols-[72px_1fr] gap-3 text-[12px]">
                  <span className="text-[var(--md-subtle)]">{time}</span>
                  <span className="leading-5 text-[var(--md-text)]">{activity}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[var(--md-radius-lg)] bg-white/50 p-4 shadow-[var(--md-shadow-line)]">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Connected surfaces</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Emails", "Reports", "CRM lists", "Customer decks"].map((surface) => (
                <StatusPill key={surface} tone="neutral">{surface}</StatusPill>
              ))}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}

export function CrmDealsPage() {
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal>(() => firstDeal())
  const [detailOpen, setDetailOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dexterOpen, setDexterOpen] = useState(false)

  function openDealDetail(deal: CrmDeal) {
    setSelectedDeal(deal)
    setDetailOpen(true)
  }

  function switchPipeline(pipeline: CrmPipeline) {
    setSelectedDeal(firstDeal(pipeline))
    setDetailOpen(false)
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel="Deals" className="md-page md-page-stack">
      <CrmPageHeader
        title="Deals"
        meta="Drag cards between stages"
        onSpeakToDexter={() => setDexterOpen(true)}
        action={<PrimaryActionButton onClick={() => toast.success("Deal draft created")}>New deal</PrimaryActionButton>}
      />

      <CrmPipelineBoard
        selectedDealId={detailOpen ? selectedDeal.id : undefined}
        onSelectDeal={openDealDetail}
        onPipelineChange={switchPipeline}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <DealDetailDrawer deal={selectedDeal} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <PipelineSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </DexterDockedPage>
  )
}

export function CrmActivityPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title="Activity"
        summary={
          <>
            A relationship timeline that blends lead notes, quote events, email replies, AI signals, and booking exceptions.
          </>
        }
        meta="Updated from the last 24 hours of customer-facing work"
      />

      <div className="md-panel-grid 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <CrmActivityTimeline />
        <div className="md-panel-column">
          <CrmLeadSignalList onOpenLead={() => navigate("/crm/leads")} />
          <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
            <SectionHeader title="Activity mix" meta="where this week's customer work came from" />
            <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-gap-md)]">
              {[
                ["Email replies", "12", "teal"],
                ["Quote updates", "7", "green"],
                ["Booking exceptions", "3", "red"],
                ["Renewal notes", "2", "amber"],
              ].map(([label, value, tone]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] items-center gap-4 shadow-[inset_0_1px_0_rgba(11,20,19,0.06)] py-3 first:shadow-none">
                  <span className="text-[13px] font-medium text-[var(--md-text)]">{label}</span>
                  <StatusPill tone={tone as StatusTone}>{value}</StatusPill>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  )
}

export function CrmSettingsPage() {
  return (
    <div className="md-page md-page-stack">
      <CrmPageHeader
        title="CRM settings"
        summary={
          <>
            Configure the commercial workflow: lead pipelines, dropdown fields, multi-select dropdowns, and the point where a lead becomes a customer.
          </>
        }
        meta="UI only for now · designed for pipeline, field, and conversion settings"
        action={<PrimaryActionButton onClick={() => toast.success("CRM setting draft created")}>New pipeline</PrimaryActionButton>}
      />

      <CrmSettingsBuilder />
    </div>
  )
}
