import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Bell, Check, Clipboard, KeyRound, Search, Ship, Sparkles, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { activityItems, cityQueues, customerFilters, customers, customsQueue, galleryComponents, galleryIcons, generatedReports, liveShipments, marlowContacts, metricCards, reportTemplates, shipmentFilters, shipmentMetrics } from "@/data/multideck-data"
import { AnimatedList } from "@/components/multideck/animated-list"
import { CommandInput } from "@/components/multideck/command-input"
import { SidebarNavItem } from "@/components/multideck/app-sidebar"
import { MetricCard } from "@/components/multideck/metric-card"
import { Pagination } from "@/components/multideck/pagination"
import { QueueRow, ShipmentRow, WorldClockCell, useLiveNow } from "@/components/multideck/overview-panels"
import {
  AccountPanel,
  ActiveShipmentsPanel,
  ArtiePulsePanel,
  ContactProfileModule,
  CustomerActivityPanel,
  CustomerDetailHero,
  CustomerFootprintMap,
  CustomerListTable,
  CustomerMetricsGrid,
} from "@/components/multideck/customer-components"
import { FilterChips, SegmentedControl, TabsRail } from "@/components/multideck/workflow-components"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { StatusPill, toneToVar } from "@/components/multideck/status-pill"
import { CodeInput, FreightNarrative, SignInPanel, SignedOutPanel, VerifyPanel } from "@/components/multideck/auth-flow"
import { ShipmentArrivalCard, ShipmentAskPanel, ShipmentExceptionPanel, ShipmentMetricCard, ShipmentResolutionChecklist } from "@/components/multideck/shipment-components"
import { GeneratedReportsTable, NewReportTemplateCard, ReportTemplateCard } from "@/components/multideck/report-components"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsOptionCard,
  SettingsPanel,
  SettingsRail,
  SettingsSummaryCard,
  type SettingsTabGroup,
} from "@/components/multideck/settings-components"
import { Table, TableBody } from "@/components/ui/table"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"
import { AIEdgeGlow } from "@/components/multideck/ai-edge-glow"

type GalleryIconKey = keyof typeof galleryIcons

const sectionLinks = ["Introduction", "Components", "Usage", "Theming", "Tokens"]
const rightRail = ["Purpose", "Preview", "Code", "Usage", "Token dependency"]
const galleryTabTriggerClass =
  "relative h-10 rounded-none border-0 bg-transparent px-0 pr-8 text-[14px] font-medium text-[var(--md-text)] shadow-none after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-[calc(100%-2rem)] after:rounded-full after:bg-[var(--md-ink)] after:opacity-0 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none data-active:border-transparent data-active:bg-transparent data-active:shadow-none data-active:after:opacity-100 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-[var(--md-ink)] data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
const introNotes = [
  {
    title: "What they are",
    body: "Reusable Multideck building blocks: panels, rows, map modules, status labels, navigation, typography, and data treatments that make the product feel consistent.",
  },
  {
    title: "What they do",
    body: "They turn freight work into clear, scannable UI. Each component helps a rep show what needs attention, where a shipment is, what state a customer is in, or what action should happen next.",
  },
  {
    title: "How to use them",
    body: "Start with the live preview, read the purpose, then use the code and usage tabs when a screen needs the same pattern. Compose these pieces before inventing a new one.",
  },
]
const colourTokens = [
  ["Ink", "--md-ink", "#0b1413"],
  ["Text", "--md-text", "#5a6764"],
  ["Subtle", "--md-subtle", "#94a09c"],
  ["Background", "--md-bg", "#dfeae7"],
  ["Strong bg", "--md-bg-strong", "#d5e4e1"],
  ["Surface", "--md-surface", "#fbfdfd"],
  ["Tint", "--md-surface-tint", "#e9f2f0"],
  ["Accent", "--md-accent", "#0e7d74"],
  ["Green", "--md-green", "#2e8e60"],
  ["Amber", "--md-amber", "#dd8a2b"],
  ["Red", "--md-red", "#d14e4e"],
  ["Blue", "--md-blue", "#4a7d9c"],
]
const typographyRows = [
  ["24px / Medium", "Main page headings", "Northwind operations"],
  ["18px / Medium", "Subheads and important summaries", "Two shipments need attention"],
  ["14px / Medium", "Section headings", "Live shipments"],
  ["13px / Regular", "Standard product copy", "Customs documents are ready for review."],
  ["12px / Regular", "Metadata and hints", "Updated 41s ago"],
  ["11px / Medium", "Pills and dense labels", "AI note"],
]
const settingsPreviewGroups: SettingsTabGroup[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: UserRound },
      { id: "security", label: "Login & security", icon: KeyRound },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "notifications", label: "Notifications", badge: "3", icon: Bell },
      { id: "agent-artie", label: "Agent Artie", icon: Sparkles },
    ],
  },
]
const InteractiveShipmentMapPreview = lazy(() =>
  import("@/components/multideck/interactive-shipment-map").then((module) => ({
    default: module.InteractiveShipmentMap,
  })),
)

function getInitialComponentId() {
  const componentId = new URLSearchParams(window.location.search).get("component")
  if (componentId && galleryComponents.some((component) => component.id === componentId)) {
    return componentId
  }

  return galleryComponents[0].id
}

function getInitialSection() {
  return new URLSearchParams(window.location.search).has("component") ? "Components" : sectionLinks[0]
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 rounded-[var(--md-radius-lg)] bg-white/60 px-3 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        toast.success("Code copied")
        window.setTimeout(() => setCopied(false), 1300)
      }}
    >
      {copied ? <Check data-icon="inline-start" strokeWidth={1.2} /> : <Clipboard data-icon="inline-start" strokeWidth={1.2} />}
      {copied ? "Copied" : "Copy code"}
    </Button>
  )
}

const syntaxTokenClass: Record<string, string> = {
  attribute: "text-[#9ad7c8]",
  comment: "text-[#6f8984]",
  keyword: "text-[#f0b86f]",
  number: "text-[#d4c77d]",
  punctuation: "text-[#91a7a1]",
  string: "text-[#b8db8f]",
  tag: "text-[#7fc7ff]",
  text: "text-[#d8e2df]",
}

function getSyntaxToken(value: string) {
  if (/^\/\//.test(value) || /^\/\*/.test(value)) return "comment"
  if (/^["'`]/.test(value)) return "string"
  if (/^<\/?[A-Za-z]/.test(value)) return "tag"
  if (/^(export|function|return|const|let|var|type|interface|import|from|as|default|if|else|true|false|null|undefined)$/.test(value)) return "keyword"
  if (/^\d/.test(value)) return "number"
  if (/^[A-Za-z_$][\w$-]*(?==)/.test(value)) return "attribute"
  if (/^[{}()[\].,;:?]$/.test(value)) return "punctuation"
  return "text"
}

function highlightCode(code: string) {
  const tokenPattern =
    /(\/\/.*|\/\*[\s\S]*?\*\/|(["'`])(?:\\.|(?!\2)[\s\S])*?\2|<\/?[A-Za-z][A-Za-z0-9.-]*|[A-Za-z_$][\w$-]*(?==)|\b(?:export|function|return|const|let|var|type|interface|import|from|as|default|if|else|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b|[{}()[\].,;:?])/g
  const parts: ReactNode[] = []
  let cursor = 0

  for (const match of code.matchAll(tokenPattern)) {
    const value = match[0]
    const index = match.index ?? 0

    if (index > cursor) {
      parts.push(code.slice(cursor, index))
    }

    parts.push(
      <span key={`${index}-${value}`} className={syntaxTokenClass[getSyntaxToken(value)]}>
        {value}
      </span>,
    )

    cursor = index + value.length
  }

  if (cursor < code.length) {
    parts.push(code.slice(cursor))
  }

  return parts
}

function CodeBlock({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = code.split("\n").length > 8

  useEffect(() => {
    setExpanded(false)
  }, [code])

  return (
    <div className="relative overflow-hidden rounded-[var(--md-radius-lg)] bg-[#07100f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <pre
        className={cn(
          "overflow-auto p-5 font-mono text-[12px] leading-6 text-[#d8e2df] md-scrollbar transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          canExpand && "pb-16",
          canExpand ? (expanded ? "max-h-[1100px]" : "max-h-[320px]") : "max-h-none",
        )}
      >
        <code>{highlightCode(code)}</code>
      </pre>

      {canExpand ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[#07100f] via-[#07100f]/82 to-transparent px-5 pb-4 pt-16">
          <Button
            type="button"
            variant="ghost"
            className="pointer-events-auto h-9 rounded-[var(--md-radius-md)] bg-white/8 px-4 text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_0_1px_rgba(0,0,0,0.18)] backdrop-blur-md hover:bg-white/12"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "View all code"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FoundOnLinks({ links }: { links: (typeof galleryComponents)[number]["foundOn"] }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-medium text-[var(--md-subtle)]">Found on</span>
      {links.map((link) => (
        <a
          key={`${link.label}-${link.route}`}
          href={link.route}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-white/55 px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-all duration-200 hover:bg-white/80 hover:text-[var(--md-ink)]"
        >
          {link.label}
          <ArrowRight className="size-3 text-[var(--md-subtle)]" strokeWidth={1.2} />
        </a>
      ))}
    </div>
  )
}

function ComponentPreview({ id }: { id: string }) {
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [previewShipmentFilter, setPreviewShipmentFilter] = useState<string>(shipmentFilters[0])
  const [previewShipmentView, setPreviewShipmentView] = useState<"Table" | "Board" | "Map" | "Timeline">("Table")
  const [previewSelectedIds, setPreviewSelectedIds] = useState<Set<string>>(new Set(["marlow-apparel"]))
  const [previewCustomerTab, setPreviewCustomerTab] = useState("Overview")
  const [previewAuthEmail, setPreviewAuthEmail] = useState("emma@northwind-fwd.com")
  const [previewAuthCode, setPreviewAuthCode] = useState("742")
  const [previewSettingsTab, setPreviewSettingsTab] = useState("profile")
  const [previewSettingsChoice, setPreviewSettingsChoice] = useState("Always ask")
  const [previewSettingsOption, setPreviewSettingsOption] = useState("Suggest")
  const [previewScreenGlow, setPreviewScreenGlow] = useState(false)
  const previewNow = useLiveNow()

  useEffect(() => {
    if (!previewScreenGlow) return undefined

    const timeoutId = window.setTimeout(() => setPreviewScreenGlow(false), 4200)
    return () => window.clearTimeout(timeoutId)
  }, [previewScreenGlow])

  function togglePreviewCustomer(id: string) {
    setPreviewSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="grid min-h-[430px] place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] p-7">
      {previewScreenGlow ? (
        <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden>
          <AIEdgeGlow active variant="screen" className="h-screen w-screen rounded-none" />
        </div>
      ) : null}

      {id === "colours" ? (
        <div className="w-full max-w-[720px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colourTokens.map(([label, token, hex]) => (
              <div key={token} className="rounded-[var(--md-radius-lg)] bg-white/60 p-2 shadow-[var(--md-shadow-line)]">
                <div className="h-20 rounded-[var(--md-radius-md)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.42)]" style={{ background: `var(${token})` }} />
                <div className="mt-3 px-1 pb-1">
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--md-text)]">{token}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--md-subtle)]">{hex}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {id === "typography" ? (
        <div className="w-full max-w-[720px] rounded-[var(--md-radius-xl)] bg-white/60 p-6 shadow-[var(--md-shadow-line)]">
          <div className="flex flex-col gap-5">
            {typographyRows.map(([spec, use, sample], index) => (
              <div key={spec} className="grid gap-3 border-b border-[rgba(11,20,19,0.06)] pb-5 last:border-b-0 last:pb-0 md:grid-cols-[150px_1fr]">
                <div>
                  <p className="font-mono text-[11px] text-[var(--md-subtle)]">{spec}</p>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{use}</p>
                </div>
                <p
                  className={cn(
                    "text-[var(--md-ink)]",
                    index === 0 && "text-[24px] font-medium leading-tight",
                    index === 1 && "text-[18px] font-medium leading-6",
                    index === 2 && "text-[14px] font-medium",
                    index === 3 && "text-[13px] leading-6 text-[var(--md-text)]",
                    index === 4 && "text-[12px] text-[var(--md-subtle)]",
                    index === 5 && "text-[11px] font-medium uppercase tracking-normal text-[var(--md-accent)]",
                  )}
                >
                  {sample}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {id === "surface" ? (
        <Surface className="w-full max-w-[620px]" padding="lg">
          <SectionHeader title="Live shipments" meta="A production panel built from shared tokens." />
          <div className="mt-5 divide-y divide-[rgba(11,20,19,0.05)]">
            {liveShipments.slice(0, 3).map((shipment) => (
              <ShipmentRow key={shipment.id} shipment={shipment} />
            ))}
          </div>
        </Surface>
      ) : null}

      {id === "status-pill" ? (
        <div className="flex w-full max-w-[560px] flex-wrap gap-3 rounded-[var(--md-radius-xl)] bg-white/60 p-6 shadow-[var(--md-shadow-line)]">
          <StatusPill tone="green">Cleared</StatusPill>
          <StatusPill tone="amber">Under review</StatusPill>
          <StatusPill tone="red">Action req.</StatusPill>
          <StatusPill tone="blue">AI note</StatusPill>
          <StatusPill tone="teal">Submitted</StatusPill>
          <StatusPill tone="neutral">After hours</StatusPill>
        </div>
      ) : null}

      {id === "ai-edge-glow" ? (
        <div className="flex w-full max-w-[820px] flex-col gap-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-[var(--md-radius-md)] bg-white/64 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/82"
              onClick={() => setPreviewScreenGlow(true)}
            >
              {previewScreenGlow ? "Effect running" : "Trigger screen effect"}
            </Button>
          </div>

          <AIEdgeGlow className="min-h-[430px] w-full" contentClassName="p-4 sm:p-6">
            <div className="flex h-full flex-col justify-between rounded-[var(--md-radius-lg)] bg-white/28 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)] backdrop-blur-[2px] sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-8 rounded-[var(--md-radius-md)] bg-white/40 shadow-[var(--md-shadow-line)]" />
                  <span className="h-3 w-28 rounded-full bg-[var(--md-ink)]/16" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/70" />
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/50" />
                  <span className="size-1.5 rounded-full bg-[var(--md-accent)]/35" />
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-[560px] gap-2.5">
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="grid grid-cols-[22px_120px_1fr] items-center gap-4 rounded-[var(--md-radius-md)] bg-white/48 px-4 py-3 shadow-[var(--md-shadow-line)]">
                    <span className="size-3 rounded-full bg-[var(--md-accent)]/62" />
                    <span className="h-2 rounded-full bg-[var(--md-text)]/18" />
                    <span className="h-2 rounded-full bg-[var(--md-ink)]/12" />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="h-10 w-40 rounded-[var(--md-radius-md)] bg-[var(--md-accent)]/92 shadow-[var(--md-shadow-line)]" />
                <span className="h-10 w-24 rounded-[var(--md-radius-md)] bg-white/36 shadow-[var(--md-shadow-line)]" />
              </div>
            </div>
          </AIEdgeGlow>
        </div>
      ) : null}

      {id === "toast" ? (
        <div className="relative flex min-h-[340px] w-full max-w-[760px] items-center justify-center overflow-hidden rounded-[var(--md-radius-xl)] bg-[linear-gradient(135deg,rgba(251,253,253,0.72),rgba(233,242,240,0.72))] p-6 shadow-[var(--md-shadow-line)]">
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-[var(--md-radius-lg)] bg-white/70 px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)]"
            onClick={() =>
              toast.success("Customer CSV prepared", {
                description: "The export is ready for Northwind Forwarding.",
              })
            }
          >
            Trigger toast
          </Button>

          <div className="pointer-events-none absolute bottom-6 left-1/2 w-[min(520px,calc(100%-32px))] -translate-x-1/2">
            <div data-type="success" className="md-toast flex items-start">
              <div className="md-toast-icon shrink-0">
                <Check className="size-4.5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="md-toast-title">Customer CSV prepared</p>
                <p className="md-toast-description">The export is ready for Northwind Forwarding.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {id === "metric-card" ? <MetricCard {...metricCards[0]} className="w-full max-w-[420px]" /> : null}

      {id === "shipment-row" ? (
        <Surface className="w-full max-w-[680px]">
          {liveShipments.slice(0, 4).map((shipment) => (
            <ShipmentRow key={shipment.id} shipment={shipment} />
          ))}
        </Surface>
      ) : null}

      {id === "interactive-map" ? (
        <div className="w-full max-w-[780px] overflow-hidden rounded-[var(--md-radius-xl)] bg-white shadow-[var(--md-shadow-line)]">
          <Suspense fallback={<div className="h-[430px] bg-[var(--md-bg-strong)]" />}>
            <InteractiveShipmentMapPreview />
          </Suspense>
        </div>
      ) : null}

      {id === "command" ? (
        <div className="w-full max-w-[680px]">
          <CommandInput />
          <Textarea
            className="mt-3 min-h-[110px] rounded-[var(--md-radius-lg)] border-0 bg-white/70 text-[13px] shadow-[var(--md-shadow-line)]"
            defaultValue="Ask: show shipments with customs risk today"
          />
        </div>
      ) : null}

      {id === "sidebar" ? (
        <div className="w-full max-w-[300px] rounded-[var(--md-radius-xl)] bg-[var(--md-sidebar-bg)] p-4 shadow-[var(--md-shadow-line)]">
          <div className="mb-6 flex h-10 items-center px-1">
            <img
              src={multideckFullLogo}
              alt="Multideck"
              className="h-[34px] w-auto max-w-[172px] object-contain"
            />
          </div>
          <SidebarNavItem item={{ label: "Shipments", value: "7", icon: Ship }} isActive />
          <SidebarNavItem item={{ label: "Components", icon: galleryIcons.sidebar }} />
        </div>
      ) : null}

      {id === "animated-list" ? (
        <div className="w-full max-w-[680px]">
          <AnimatedList
            items={[...activityItems, ...activityItems, ...activityItems]}
            getItemKey={(item, index) => `${item.title}-${index}`}
            ariaLabel="Activity preview"
            initialSelectedIndex={0}
            maxHeight={300}
            itemClassName="px-3 py-3"
            renderItem={(item) => {
              const Icon = item.icon

              return (
                <div className="grid grid-cols-[30px_1fr_auto] gap-3">
                  <div className="grid size-[30px] place-items-center rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
                    <Icon className="size-3.5" strokeWidth={1.2} style={{ color: toneToVar(item.tone) }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-[var(--md-ink)]">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--md-subtle)]">{item.source}</p>
                  </div>
                  <span className="pt-1 text-[11px] text-[var(--md-subtle)]">{item.time}</span>
                </div>
              )
            }}
          />
        </div>
      ) : null}

      {id === "pagination" ? (
        <div className="w-full max-w-[720px]">
          <div className="mb-3 grid gap-2">
            {["Marlow Apparel Ltd", "Bauhaus Importe GmbH", "Black Forest Foods", "Pacific Goods Co", "Mediterranean Spice Trading"].map((customer) => (
              <div key={customer} className="flex h-12 items-center justify-between rounded-[var(--md-radius-lg)] bg-white/55 px-4 shadow-[var(--md-shadow-line)]">
                <span className="text-[13px] font-medium text-[var(--md-ink)]">{customer}</span>
                <span className="text-[12px] text-[var(--md-text)]">Active customer</span>
              </div>
            ))}
          </div>
          <Pagination
            page={previewPage}
            pageCount={Math.max(Math.ceil(customers.length / previewPageSize), 1)}
            totalItems={customers.length}
            pageSize={previewPageSize}
            pageSizeOptions={[10, 20, 30, 50]}
            itemLabel="customers"
            onPageChange={setPreviewPage}
            onPageSizeChange={(nextPageSize) => {
              setPreviewPageSize(nextPageSize)
              setPreviewPage(1)
            }}
          />
        </div>
      ) : null}

      {id === "world-clock" ? (
        <div className="grid w-full max-w-[720px] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-white/60 shadow-[var(--md-shadow-line)] sm:grid-cols-4">
          {cityQueues.slice(0, 4).map((city, index) => (
            <WorldClockCell key={city.code} city={city} selected={index === 0} onSelect={() => undefined} now={previewNow} />
          ))}
        </div>
      ) : null}

      {id === "queue-row" ? (
        <Surface className="w-full max-w-[680px]">
          <Table>
            <TableBody>
              {customsQueue.map((item) => (
                <QueueRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        </Surface>
      ) : null}

      {id === "contact-profile" ? (
        <div className="w-full max-w-[820px]">
          <ContactProfileModule contact={marlowContacts[0]} />
        </div>
      ) : null}

      {id === "segmented-control" ? (
        <div className="w-full max-w-[520px] rounded-[var(--md-radius-xl)] bg-white/50 p-6 shadow-[var(--md-shadow-line)]">
          <SegmentedControl options={["Table", "Board", "Map", "Timeline"] as const} value={previewShipmentView} onChange={setPreviewShipmentView} />
        </div>
      ) : null}

      {id === "filter-chips" ? (
        <div className="w-full max-w-[980px]">
          <FilterChips
            options={shipmentFilters}
            activeOption={previewShipmentFilter}
            onChange={setPreviewShipmentFilter}
            auxiliaryOptions={["+ Mode", "+ Carrier", "+ Customer", "+ Owner", "+ ETA range"]}
          />
        </div>
      ) : null}

      {id === "data-table" ? (
        <div className="w-full max-w-[1120px] overflow-x-auto md-scrollbar">
          <CustomerListTable
            customers={customers.slice(0, 4)}
            selectedIds={previewSelectedIds}
            onToggleCustomer={togglePreviewCustomer}
            onOpenCustomer={() => undefined}
          />
        </div>
      ) : null}

      {id === "geo-panel" ? (
        <div className="w-full max-w-[980px]">
          <CustomerFootprintMap customers={customers.slice(0, 3)} onOpenCustomer={() => undefined} />
        </div>
      ) : null}

      {id === "record-header" ? (
        <div className="w-full max-w-[980px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-6 shadow-[var(--md-shadow-line)]">
          <CustomerDetailHero />
          <CustomerMetricsGrid />
        </div>
      ) : null}

      {id === "tabs" ? (
        <div className="w-full max-w-[920px] rounded-[var(--md-radius-xl)] bg-white/55 p-6 shadow-[var(--md-shadow-line)]">
          <TabsRail
            tabs={[
              { label: "Overview" },
              { label: "Contacts", value: "4" },
              { label: "Shipments", value: "6 active" },
              { label: "Documents", value: "94" },
              { label: "Activity" },
            ]}
            activeTab={previewCustomerTab}
            onChange={setPreviewCustomerTab}
          />
        </div>
      ) : null}

      {id === "active-shipments-panel" ? (
        <div className="w-full max-w-[980px]">
          <ActiveShipmentsPanel />
        </div>
      ) : null}

      {id === "shipment-metric-card" ? (
        <div className="grid w-full max-w-[760px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shipmentMetrics.slice(0, 3).map((metric) => (
            <ShipmentMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}

      {id === "report-template-card" ? (
        <div className="grid w-full max-w-[860px] gap-4 md:grid-cols-2">
          <ReportTemplateCard
            template={reportTemplates[0]}
            onRun={(template) => toast.success(`${template.title} started`)}
            onEdit={(template) => toast.success(`${template.title} opened`)}
          />
          <NewReportTemplateCard onCreate={() => toast.success("Blank template created")} />
        </div>
      ) : null}

      {id === "generated-report-table" ? (
        <div className="w-full max-w-[1120px]">
          <GeneratedReportsTable
            reports={generatedReports.slice(0, 4)}
            onView={(report) => toast.success(`${report.title} opened`)}
            onDownload={(report) => toast.success(`${report.title} prepared`)}
          />
        </div>
      ) : null}

      {id === "shipment-arrival-card" ? (
        <div className="w-full max-w-[860px]">
          <ShipmentArrivalCard />
        </div>
      ) : null}

      {id === "shipment-exception-panel" ? (
        <div className="w-full max-w-[860px]">
          <ShipmentExceptionPanel />
        </div>
      ) : null}

      {id === "shipment-checklist" ? (
        <div className="w-full max-w-[680px]">
          <ShipmentResolutionChecklist />
        </div>
      ) : null}

      {id === "shipment-ask-panel" ? (
        <div className="h-[620px] w-full max-w-[380px]">
          <ShipmentAskPanel />
        </div>
      ) : null}

      {id === "side-panels" ? (
        <div className="grid w-full max-w-[980px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-5">
            <CustomerActivityPanel />
          </div>
          <div className="flex flex-col gap-5">
            <ArtiePulsePanel />
            <AccountPanel />
          </div>
        </div>
      ) : null}

      {id === "settings-rail" ? (
        <div className="w-full max-w-[340px] overflow-hidden rounded-[var(--md-radius-xl)] shadow-[var(--md-shadow-line)]">
          <SettingsRail
            groups={settingsPreviewGroups}
            activeTab={previewSettingsTab}
            onChange={setPreviewSettingsTab}
            onBack={() => undefined}
            className="min-h-0"
          />
        </div>
      ) : null}

      {id === "settings-panel-row" ? (
        <div className="w-full max-w-[820px]">
          <SettingsPanel title="Working schedule" description="Used to schedule notifications, AI digest delivery, and out-of-hours escalation.">
            <SettingsFieldRow label="Time zone">
              <SettingsInput value="Europe/Berlin - UTC+1" readOnly />
            </SettingsFieldRow>
            <SettingsFieldRow label="Working hours" description="Artie will not send non-critical pings outside these hours.">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <SettingsInput value="08:00" readOnly />
                <span className="text-center text-[13px] text-[var(--md-text)]">to</span>
                <SettingsInput value="18:30" readOnly />
              </div>
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
      ) : null}

      {id === "settings-controls" ? (
        <div className="w-full max-w-[820px]">
          <SettingsPanel title="Approval rule" description="Compact controls for repeated settings rows.">
            <SettingsFieldRow label="Outbound emails to customers">
              <SettingsChoiceGroup
                options={["Always ask", "Ask if > EUR 1k impact", "Never ask"]}
                value={previewSettingsChoice}
                onChange={setPreviewSettingsChoice}
              />
            </SettingsFieldRow>
            <SettingsFieldRow label="Display name">
              <SettingsInput defaultValue="Elena Moreno - Northwind Forwarding" />
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
      ) : null}

      {id === "settings-option-card" ? (
        <div className="grid w-full max-w-[920px] gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Off", "No background agents. Manual chats only."],
            ["Manual", "Artie answers when asked. Never acts."],
            ["Suggest", "Drafts and proposes. Always asks before sending or changing data."],
            ["Autopilot", "Acts within your rules for low-risk changes."],
          ].map(([label, description]) => (
            <SettingsOptionCard
              key={label}
              label={label}
              description={description}
              selected={previewSettingsOption === label}
              onClick={() => setPreviewSettingsOption(label)}
            />
          ))}
        </div>
      ) : null}

      {id === "settings-summary-card" ? (
        <div className="w-full max-w-[380px]">
          <SettingsSummaryCard
            title="At a glance"
            rows={[
              ["Member since", "Jan 2024"],
              ["Shipments handled", "1,847"],
              ["Active boards", "3"],
              ["Role", "Admin - Ops"],
            ]}
            actionLabel="Review"
          />
        </div>
      ) : null}

      {id === "auth-narrative-panel" ? (
        <div className="relative h-[520px] w-full max-w-[620px] overflow-hidden rounded-[var(--md-radius-xl)] bg-[#062420] shadow-[var(--md-shadow-line)]">
          <div className="absolute left-1/2 top-0 h-[900px] w-[860px] origin-top -translate-x-1/2 scale-[0.56]">
            <FreightNarrative step="signin" componentPreview className="min-h-[900px] w-[860px]" />
          </div>
        </div>
      ) : null}

      {id === "auth-sign-in-panel" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-10 shadow-[var(--md-shadow-line)]">
          <SignInPanel
            email={previewAuthEmail}
            onEmailChange={setPreviewAuthEmail}
            onContinue={() => undefined}
          />
        </div>
      ) : null}

      {id === "auth-verification-panel" ? (
        <div className="w-full max-w-[680px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-10 shadow-[var(--md-shadow-line)]">
          <VerifyPanel
            email={previewAuthEmail}
            code={previewAuthCode}
            onCodeChange={setPreviewAuthCode}
            onBack={() => undefined}
            onComplete={() => undefined}
          />
        </div>
      ) : null}

      {id === "auth-code-input" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-10 shadow-[var(--md-shadow-line)]">
          <CodeInput code={previewAuthCode} onCodeChange={setPreviewAuthCode} onComplete={() => undefined} />
        </div>
      ) : null}

      {id === "auth-signed-out-panel" ? (
        <div className="w-full max-w-[620px] rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-10 shadow-[var(--md-shadow-line)]">
          <SignedOutPanel onSignBackIn={() => undefined} onSwitchAccount={() => setPreviewAuthEmail("")} />
        </div>
      ) : null}
    </div>
  )
}

function GallerySidebar({
  query,
  setQuery,
  activeSection,
  setActiveSection,
  selectedId,
  setSelectedId,
  filtered,
}: {
  query: string
  setQuery: (value: string) => void
  activeSection: string
  setActiveSection: (value: string) => void
  selectedId: string
  setSelectedId: (value: string) => void
  filtered: typeof galleryComponents
}) {
  return (
    <aside className="sticky top-[84px] hidden h-[calc(100vh-108px)] min-h-0 lg:block">
      <ScrollArea className="h-full pr-4">
        <div className="flex flex-col gap-8">
          <div>
            <p className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">Sections</p>
            <nav className="mt-3 flex flex-col gap-1">
              {sectionLinks.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "h-8 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-text)] transition-all hover:bg-white/45 hover:text-[var(--md-ink)]",
                    activeSection === item && "bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                  )}
                  onClick={() => setActiveSection(item)}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>

          <div>
            <p className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">Components</p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.2} />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter components..."
                className="h-9 rounded-[var(--md-radius-md)] border-0 bg-white/60 pl-9 text-[13px] shadow-[var(--md-shadow-line)]"
              />
            </div>
            <nav className="mt-3 flex flex-col gap-1">
              {filtered.map((component) => {
                const Icon = galleryIcons[component.id as GalleryIconKey]
                return (
                  <button
                    key={component.id}
                    type="button"
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-left text-[13px] font-medium text-[var(--md-text)] transition-all hover:bg-white/45 hover:text-[var(--md-ink)]",
                      selectedId === component.id && "bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
                    )}
                    onClick={() => {
                      setActiveSection("Components")
                      setSelectedId(component.id)
                    }}
                  >
                    <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} />
                    <span className="truncate">{component.name}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}

function RightRail({ selected }: { selected: (typeof galleryComponents)[number] }) {
  return (
    <aside className="sticky top-[84px] hidden h-[calc(100vh-108px)] min-h-0 xl:block">
      <ScrollArea className="h-full pl-4">
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-[12px] font-medium text-[var(--md-text)]">On This Page</p>
            <nav className="mt-4 flex flex-col gap-3">
              {rightRail.map((item) => (
                <a key={item} href={`#${item.toLowerCase().replaceAll(" ", "-")}`} className="text-[13px] font-medium text-[var(--md-subtle)] hover:text-[var(--md-ink)]">
                  {item}
                </a>
              ))}
            </nav>
          </div>

          <Surface tone="soft" padding="md" className="rounded-[var(--md-radius-xl)]">
            <p className="text-[15px] font-medium leading-5 text-[var(--md-ink)]">Component contract</p>
            <p className="mt-3 text-[13px] leading-6 text-[var(--md-text)]">
              {selected.name} should stay token-led, composable, and usable inside dense operational screens.
            </p>
            <Button variant="ghost" className="mt-5 h-9 rounded-[var(--md-radius-md)] bg-white/50 px-3 text-[13px] shadow-[var(--md-shadow-line)]">
              View source
            </Button>
          </Surface>
        </div>
      </ScrollArea>
    </aside>
  )
}

export function ComponentsGalleryPage() {
  const [activeSection, setActiveSection] = useState(getInitialSection)
  const [selectedId, setSelectedId] = useState(getInitialComponentId)
  const [query, setQuery] = useState("")
  const selected = galleryComponents.find((component) => component.id === selectedId) ?? galleryComponents[0]
  const SelectedIcon = galleryIcons[selected.id as GalleryIconKey]
  const selectedIndex = galleryComponents.findIndex((component) => component.id === selected.id)

  const filtered = useMemo(() => {
    return galleryComponents.filter((component) => `${component.name} ${component.description} ${component.category}`.toLowerCase().includes(query.toLowerCase()))
  }, [query])

  function moveSelection(direction: -1 | 1) {
    const nextIndex = (selectedIndex + direction + galleryComponents.length) % galleryComponents.length
    setSelectedId(galleryComponents[nextIndex].id)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,880px)_260px]">
      <GallerySidebar
        query={query}
        setQuery={setQuery}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        filtered={filtered}
      />

      <main className="min-w-0 pb-10">
        {activeSection === "Introduction" ? (
          <section id="introduction">
            <div className="max-w-[760px]">
              <p className="text-[12px] font-medium text-[var(--md-subtle)]">Introduction</p>
              <h1 className="mt-3 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">Multideck component system</h1>
              <p className="mt-3 text-[15px] leading-7 text-[var(--md-text)]">
                This page is the working library for the Multideck interface. It shows the reusable product pieces reps should use when building, explaining, or reviewing freight workflows, so every screen feels calm, consistent, and ready for real operators.
              </p>
            </div>

            <Surface padding="lg" className="mt-6 rounded-[var(--md-radius-xl)]">
              <div className="grid gap-6 md:grid-cols-3">
                {introNotes.map((item) => (
                  <div key={item.title}>
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">{item.title}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--md-text)]">{item.body}</p>
                  </div>
                ))}
              </div>
            </Surface>
          </section>
        ) : null}

        {activeSection === "Components" ? (
          <>
            <div id="components" className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-[720px]">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)]">
                  <SelectedIcon className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
                  <span>{selected.category}</span>
                </div>
                <h1 className="mt-4 text-[24px] font-medium leading-tight tracking-normal text-[var(--md-ink)]">{selected.name}</h1>
                <p className="mt-3 text-[16px] leading-7 text-[var(--md-text)]">{selected.description}</p>
                <FoundOnLinks links={selected.foundOn} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <CopyButton value={selected.componentCode} />
                <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-lg)] bg-white/50 shadow-[var(--md-shadow-line)]" onClick={() => moveSelection(-1)}>
                  <ArrowLeft data-icon="inline-start" strokeWidth={1.2} />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-[var(--md-radius-lg)] bg-white/50 shadow-[var(--md-shadow-line)]" onClick={() => moveSelection(1)}>
                  <ArrowRight data-icon="inline-start" strokeWidth={1.2} />
                </Button>
              </div>
            </div>

            <Tabs defaultValue="preview" className="mt-9">
              <TabsList variant="line" className="h-10 rounded-none bg-transparent p-0">
                <TabsTrigger value="preview" className={galleryTabTriggerClass}>
                  Preview
                </TabsTrigger>
                <TabsTrigger value="code" className={galleryTabTriggerClass}>
                  Code
                </TabsTrigger>
                <TabsTrigger value="usage" className={galleryTabTriggerClass}>
                  Usage
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" id="preview" className="mt-6">
                <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
                  <ComponentPreview id={selected.id} />
                </Surface>
              </TabsContent>

              <TabsContent value="code" id="code" className="mt-6">
                <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
                  <CodeBlock code={selected.componentCode} />
                </Surface>
              </TabsContent>

              <TabsContent value="usage" id="usage" className="mt-6">
                <Surface padding="lg" className="rounded-[var(--md-radius-xl)]">
                  <CodeBlock code={selected.usageCode} />
                </Surface>
              </TabsContent>
            </Tabs>

            <section id="purpose" className="mt-10">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Purpose</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">{selected.description}</p>
            </section>

            <section id="usage" className="mt-8">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Usage</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">{selected.details}</p>
            </section>

            <section id="token-dependency" className="mt-8">
              <h2 className="text-[18px] font-medium text-[var(--md-ink)]">Token dependency</h2>
              <p className="mt-3 text-[14px] leading-7 text-[var(--md-text)]">
                Uses shared Multideck color, radius, motion, spacing, and depth variables from `src/styles.css`.
              </p>
            </section>
          </>
        ) : null}
      </main>

      {activeSection === "Components" ? <RightRail selected={selected} /> : null}
    </div>
  )
}
