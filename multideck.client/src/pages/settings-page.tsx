import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Braces,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CircleAlert,
  Cloud,
  Copy,
  CreditCard,
  FileKey2,
  Globe2,
  History,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  Palette,
  Plug,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { StatusPill } from "@/components/multideck/status-pill"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsOptionCard,
  SettingsPageHeader,
  SettingsPanel,
  SettingsRail,
  SettingsSelect,
  SettingsSummaryCard,
  SettingsTabGroup,
  SettingsTextarea,
  SettingsToggleRow,
} from "@/components/multideck/settings-components"
import { cn } from "@/lib/utils"

const settingsGroups: SettingsTabGroup[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", icon: UserRound },
      { id: "security", label: "Login & security", icon: KeyRound },
      { id: "sessions", label: "Active sessions", icon: MonitorSmartphone },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "preferences", label: "Preferences", icon: BriefcaseBusiness },
      { id: "notifications", label: "Notifications", badge: "3", icon: Bell },
      { id: "agent-artie", label: "Agent Artie", icon: Sparkles },
    ],
  },
  {
    label: "Organisation",
    items: [
      { id: "team", label: "Team & permissions", icon: Users },
      { id: "integrations", label: "Integrations", badge: "14", icon: Plug },
      { id: "api", label: "API & webhooks", icon: Webhook },
      { id: "billing", label: "Billing & usage", icon: CreditCard },
      { id: "branding", label: "Branding", icon: Palette },
    ],
  },
  {
    label: "Support",
    items: [
      { id: "whats-new", label: "What's new", icon: Megaphone },
      { id: "docs", label: "Docs & shortcuts", icon: BookOpen },
      { id: "support", label: "Contact support", icon: LifeBuoy },
    ],
  },
]

const allTabIds = settingsGroups.flatMap((group) => group.items.map((item) => item.id))

function readTabFromUrl() {
  const tab = new URLSearchParams(window.location.search).get("tab") ?? "profile"
  return allTabIds.includes(tab) ? tab : "profile"
}

function compactAction(label: string, onClick?: () => void) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-9 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function primaryAction(label: string, onClick?: () => void) {
  return (
    <Button
      type="button"
      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function MobileSettingsTabs({
  activeTab,
  onChange,
  onBack,
}: {
  activeTab: string
  onChange: (tab: string) => void
  onBack: () => void
}) {
  const active = settingsGroups.flatMap((group) => group.items).find((item) => item.id === activeTab)

  return (
    <div className="bg-[rgba(213,228,225,0.72)] px-4 py-4 shadow-[inset_0_-1px_0_rgba(11,20,19,0.05)] lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="text-[13px] font-medium text-[var(--md-text)]" onClick={onBack}>
          Back
        </button>
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{active?.label ?? "Settings"}</p>
      </div>
      <div className="md-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {settingsGroups.flatMap((group) => group.items).map((item) => {
          const Icon = item.icon
          const selected = item.id === activeTab

          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]",
                selected ? "bg-[rgba(14,125,116,0.1)] text-[var(--md-accent)]" : "bg-white/38",
              )}
              onClick={() => onChange(item.id)}
            >
              {Icon ? <Icon className="size-3.5" strokeWidth={1.2} /> : null}
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ToggleSetting({
  title,
  description,
  initialChecked,
  meta,
}: {
  title: string
  description: string
  initialChecked: boolean
  meta?: ReactNode
}) {
  const [checked, setChecked] = useState(initialChecked)
  return <SettingsToggleRow title={title} description={description} checked={checked} onCheckedChange={setChecked} meta={meta} />
}

function ChoiceSetting({
  options,
  initialValue,
}: {
  options: string[]
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)
  return <SettingsChoiceGroup options={options} value={value} onChange={setValue} />
}

function OptionCards({
  options,
  initialValue,
}: {
  options: Array<{ label: string; description: string }>
  initialValue: string
}) {
  const [value, setValue] = useState(initialValue)

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {options.map((option) => (
        <SettingsOptionCard
          key={option.label}
          label={option.label}
          description={option.description}
          selected={value === option.label}
          onClick={() => setValue(option.label)}
        />
      ))}
    </div>
  )
}

function IconRow({
  icon: Icon,
  title,
  description,
  right,
}: {
  icon: LucideIcon
  title: string
  description: string
  right?: ReactNode
}) {
  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[34px_minmax(0,1fr)_auto] sm:items-center">
      <div className="grid size-[34px] place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
        <Icon className="size-4 text-[var(--md-accent)]" strokeWidth={1.2} />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{title}</p>
        <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{description}</p>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

function ProfileTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Account / Profile"
        title="Profile"
        description="How you appear to your team, customers, and Artie. Some of this is used in audit logs and customer-facing comms."
        actions={
          <>
            {compactAction("Discard", () => toast.message("Changes discarded"))}
            {primaryAction("Save changes", () => toast.success("Profile settings saved"))}
          </>
        }
      />

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <SettingsPanel title="Photo" description="JPG, PNG, or SVG. Recommended 256x256.">
          <SettingsFieldRow label="Avatar" description="Used in comments, assignment logs, and customer replies.">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="size-[76px] rounded-full">
                <AvatarFallback className="rounded-full bg-[var(--md-accent)] text-[24px] font-medium text-white">EM</AvatarFallback>
              </Avatar>
              <div className="flex flex-wrap items-center gap-2">
                {compactAction("Upload photo", () => toast.success("Photo picker opened"))}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)] hover:bg-[rgba(209,78,78,0.08)] hover:text-[var(--md-red)]"
                >
                  Remove
                </Button>
              </div>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Full name">
            <SettingsInput defaultValue="Elena Moreno" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Preferred name" description="What Artie and your team call you.">
            <SettingsInput defaultValue="Elena" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Work email">
            <div className="relative">
              <SettingsInput defaultValue="elena@northwind.de" className="pr-20" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--md-text)]">verified</span>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Phone" description="For two-factor and emergency alerts only.">
            <SettingsInput defaultValue="+49 40 8821 4408" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Role / title">
            <SettingsInput defaultValue="Operations Manager" />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsSummaryCard
          title="At a glance"
          rows={[
            ["Member since", "Jan 2024"],
            ["Shipments handled", "1,847"],
            ["Active boards", "3"],
            ["Last sign-in", "Today - 06:14"],
            ["Role", "Admin - Ops"],
            ["Workspace", "Northwind Forwarding"],
          ]}
        />
      </div>

      <div className="mt-5 space-y-5">
        <SettingsPanel title="Working schedule" description="Used to schedule notifications, AI digest delivery, and out-of-hours escalation.">
          <SettingsFieldRow label="Time zone">
            <SettingsSelect value="Europe/Berlin - UTC+1" options={["Europe/Berlin - UTC+1", "Europe/London - UTC+0", "America/New York - UTC-5", "Asia/Singapore - UTC+8"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Working hours" description="Artie will not send non-critical pings outside these hours.">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_70px] sm:items-center">
              <SettingsInput defaultValue="08:00" />
              <span className="text-center text-[13px] text-[var(--md-text)]">to</span>
              <SettingsInput defaultValue="18:30" />
              <span className="text-[12px] leading-4 text-[var(--md-text)]">Mon-Fri</span>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Date & number format">
            <SettingsSelect value="DD MMM YYYY - metric - EUR" options={["DD MMM YYYY - metric - EUR", "MMM DD, YYYY - imperial - USD", "YYYY-MM-DD - metric - GBP"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Language">
            <SettingsSelect value="English (UK)" options={["English (UK)", "English (US)", "German", "French"]} />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel title="Public profile" description="Shown to customers on shared tracking pages and quotes.">
          <SettingsFieldRow label="Display name">
            <SettingsInput defaultValue="Elena Moreno - Northwind Forwarding" />
          </SettingsFieldRow>
          <SettingsFieldRow label="About" align="start">
            <SettingsTextarea defaultValue="Operations manager at Northwind. Twelve years moving cargo across Asia-Europe lanes. I read every PoD and personally chase every customs hold." />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel title="Danger zone" className="shadow-[inset_0_0_0_1px_rgba(209,78,78,0.16),0_0_0_1px_rgba(209,78,78,0.08)]">
          <SettingsFieldRow label="Export my data" description="A zip of every shipment, document note, profile event, and audit log linked to your account.">
            {compactAction("Request export", () => toast.success("Data export requested"))}
          </SettingsFieldRow>
          <SettingsFieldRow label="Delete account" description="Only available after workspace ownership is transferred.">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)]"
            >
              Start deletion
            </Button>
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function SecurityTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Account / Login & security"
        title="Login & security"
        description="Protect your account and choose how sensitive freight actions are verified."
        actions={primaryAction("Save security", () => toast.success("Security settings saved"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="Sign-in methods" description="Keep at least two recovery routes active for operational continuity.">
          <IconRow icon={LockKeyhole} title="Password" description="Last changed 32 days ago. Strong enough for admin access." right={compactAction("Change")} />
          <ToggleSetting title="Two-factor authentication" description="Require a code for new devices, billing changes, and API key creation." initialChecked />
          <IconRow icon={FileKey2} title="Passkeys" description="MacBook Pro and iPhone 15 are approved for passwordless sign-in." right={compactAction("Manage")} />
          <ToggleSetting title="Require SSO for admins" description="Admins must sign in with the Northwind Google Workspace account." initialChecked={false} />
        </SettingsPanel>
        <SettingsPanel title="Recovery" description="Backup access if your phone or identity provider is unavailable.">
          <SettingsFieldRow label="Recovery email">
            <SettingsInput defaultValue="ops-admin@northwind.de" />
          </SettingsFieldRow>
          <IconRow icon={ShieldCheck} title="Backup codes" description="6 unused codes remain. Generate a fresh set after sharing ownership changes." right={compactAction("View codes")} />
          <SettingsFieldRow label="Sensitive action timeout" description="Ask for re-authentication before irreversible workspace changes.">
            <SettingsSelect value="Every 30 minutes" options={["Every 15 minutes", "Every 30 minutes", "Every 2 hours", "Every sign-in"]} />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function SessionsTab() {
  const sessions = [
    ["MacBook Pro", "Hamburg, DE - Atlas - active now", "Current"],
    ["iPhone 15", "Berlin, DE - Mobile app - 22m ago", "Trusted"],
    ["Windows workstation", "Rotterdam, NL - Edge - yesterday", "Review"],
    ["API console", "Frankfurt, DE - token preview - May 24", "Expired"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Account / Active sessions"
        title="Active sessions"
        description="Review signed-in devices and remove anything that should not have access to live shipment data."
        actions={compactAction("Sign out all others", () => toast.success("Other sessions signed out"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="Devices" description="Active user sessions across web and mobile.">
          {sessions.map(([device, detail, status]) => (
            <IconRow
              key={device}
              icon={MonitorSmartphone}
              title={device}
              description={detail}
              right={
                <div className="flex items-center gap-2">
                  <StatusPill tone={status === "Review" ? "amber" : status === "Expired" ? "neutral" : "teal"}>{status}</StatusPill>
                  {status !== "Current" ? compactAction("Sign out") : null}
                </div>
              }
            />
          ))}
        </SettingsPanel>
        <SettingsPanel title="Recent security events" description="A compact audit trail for account access.">
          <IconRow icon={Check} title="Successful sign-in" description="Today 06:14 from Hamburg using Atlas." />
          <IconRow icon={CircleAlert} title="New device challenge" description="Yesterday 19:42 from Rotterdam. Two-factor challenge passed." />
          <IconRow icon={KeyRound} title="API key viewed" description="May 24 by Elena Moreno. No secret was copied." />
        </SettingsPanel>
      </div>
    </>
  )
}

function PreferencesTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / Preferences"
        title="Preferences"
        description="Set the defaults that make the workspace faster for operators handling live freight."
        actions={primaryAction("Save preferences", () => toast.success("Preferences saved"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="Workspace defaults" description="These affect new boards, lists, and shipment views for your account.">
          <SettingsFieldRow label="Start page">
            <SettingsSelect value="Overview - Today Ops" options={["Overview - Today Ops", "Shipments - Open", "Customers", "Agent Artie"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Default shipment view">
            <ChoiceSetting options={["Table", "Board", "Map", "Timeline"]} initialValue="Table" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Table density">
            <ChoiceSetting options={["Compact", "Comfortable", "Roomy"]} initialValue="Comfortable" />
          </SettingsFieldRow>
          <ToggleSetting title="Keep filters between visits" description="Return to the same customer, owner, and ETA filters after reload." initialChecked />
        </SettingsPanel>
        <SettingsPanel title="Freight formats" description="Operational defaults used in documents, quotes, and generated summaries.">
          <SettingsFieldRow label="Measurement system">
            <SettingsSelect value="Metric - kg, cbm, km" options={["Metric - kg, cbm, km", "Imperial - lb, cu ft, mi"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Currency">
            <SettingsSelect value="EUR - Euro" options={["EUR - Euro", "GBP - British pound", "USD - US dollar"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Lane naming">
            <SettingsSelect value="Port pair - Yantian to Felixstowe" options={["Port pair - Yantian to Felixstowe", "Country pair - CN to GB", "Customer lane code"]} />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function NotificationsTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / Notifications"
        title="Notifications"
        description="Choose when Multideck should interrupt you, and which updates should roll into a calmer digest."
        actions={primaryAction("Save notifications", () => toast.success("Notification settings saved"))}
      />
      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-5">
          <SettingsPanel title="Urgent alerts" description="These can break quiet hours when customer risk is high.">
            <ToggleSetting title="Customs holds" description="Ping immediately when a hold is raised or a licence is missing." initialChecked meta={<StatusPill tone="amber">3 pending</StatusPill>} />
            <ToggleSetting title="ETA slips over 6 hours" description="Notify the owner before Artie drafts the customer update." initialChecked />
            <ToggleSetting title="Customer message unanswered" description="Escalate when a premium account waits more than 2 working hours." initialChecked />
            <ToggleSetting title="Document parse below 80%" description="Keep this in digest unless the shipment is due within 24 hours." initialChecked={false} />
          </SettingsPanel>
          <SettingsPanel title="Delivery channels" description="Where updates should land by default.">
            <SettingsFieldRow label="Daily digest">
              <SettingsSelect value="Email at 07:30" options={["Email at 07:30", "Slack at 08:00", "In-app only", "Off"]} />
            </SettingsFieldRow>
            <SettingsFieldRow label="Exception alerts">
              <ChoiceSetting options={["In-app", "Email", "Slack", "All"]} initialValue="All" />
            </SettingsFieldRow>
            <SettingsFieldRow label="Quote reminders">
              <ChoiceSetting options={["Digest", "Email", "Off"]} initialValue="Digest" />
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
        <SettingsSummaryCard
          title="Notification load"
          rows={[
            ["Today", "9 alerts"],
            ["Muted by schedule", "14"],
            ["Digest items", "27"],
            ["Escalations", "3"],
          ]}
          actionLabel="Review"
        />
      </div>
    </>
  )
}

function AgentArtieTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / Agent Artie"
        title="Agent Artie"
        description="Tune how proactive Artie is, what it watches by default, and when it should escalate to a human. Changes apply to everything Artie does in your workspace."
        actions={
          <>
            {compactAction("Reset to defaults", () => toast.message("Artie defaults restored"))}
            {primaryAction("Save", () => toast.success("Agent Artie settings saved"))}
          </>
        }
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel
          title="Autonomy level"
          description="Pick how much Artie does on its own. You can always override per-task by setting an approval rule below."
          action={<span className="text-[12px] font-medium text-[var(--md-accent)]">Current - Suggest</span>}
        >
          <div className="px-5 py-5">
            <OptionCards
              initialValue="Suggest"
              options={[
                { label: "Off", description: "No background agents. Manual chats only." },
                { label: "Manual", description: "Artie answers when asked. Never acts." },
                { label: "Suggest", description: "Drafts and proposes. Always asks before sending or changing data." },
                { label: "Autopilot", description: "Acts within your rules. Asks only for irreversible or high-value actions." },
              ]}
            />
          </div>
        </SettingsPanel>

        <SettingsPanel title="Default watchers" description="Background agents Artie runs for you. Toggle any off, or add more from the Artie workspace.">
          <ToggleSetting title="Doc parse confidence < 80%" description="Flags documents Artie is unsure about for your review." initialChecked />
          <ToggleSetting title="Customs hold raised" description="Pings within 60 seconds of any new hold." initialChecked />
          <ToggleSetting title="ETA slip > 6 hours" description="Notifies you and the customer after approval." initialChecked />
          <ToggleSetting title="Carrier on-time degradation" description="Watches for any carrier dropping 5%+ vs trailing 90d." initialChecked />
          <ToggleSetting title="Demurrage / detention risk" description="Flags containers nearing free-time expiry." initialChecked />
          <ToggleSetting title="Quote silence > 48h" description="Drafts a follow-up after two days of silence on open quotes." initialChecked={false} />
        </SettingsPanel>

        <SettingsPanel title="Approval rules" description="Artie will always pause for explicit approval when any rule below is true, regardless of autonomy level.">
          <SettingsFieldRow label="Outbound emails to customers">
            <ChoiceSetting options={["Always ask", "Ask if > EUR 1k impact", "Never ask"]} initialValue="Always ask" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Booking confirmations & bookings">
            <ChoiceSetting options={["Always ask", "Ask if > EUR 5k", "Never ask"]} initialValue="Always ask" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Changes to shipment data">
            <ChoiceSetting options={["Always ask", "Ask non-reversible", "Never ask"]} initialValue="Ask non-reversible" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Watcher creation & modification">
            <ChoiceSetting options={["Always ask", "Within defaults", "Never ask"]} initialValue="Within defaults" />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function TeamTab() {
  const members = [
    ["Elena Moreno", "Admin - Ops", "Owner of customs and exception boards", "EM"],
    ["Jonas Lehmann", "Operator", "Air freight and premium customer owner", "JL"],
    ["Wei Chen", "Customs lead", "CDS entries, licences, and broker review", "WC"],
    ["Maya Singh", "Finance", "Quotes, billing, and credit limits", "MS"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Team & permissions"
        title="Team & permissions"
        description="Control who can see shipment data, approve Artie actions, and manage customer-facing changes."
        actions={primaryAction("Invite teammate", () => toast.success("Invite link copied"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="Team members" description="Active people in Northwind Forwarding.">
          {members.map(([name, role, detail, initials]) => (
            <div key={name} className="grid gap-3 px-5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
              <Avatar className="size-10 rounded-full">
                <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[13px] font-medium text-[var(--md-ink)]">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{name}</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail}</p>
              </div>
              <StatusPill tone={role.includes("Admin") ? "teal" : "neutral"}>{role}</StatusPill>
            </div>
          ))}
        </SettingsPanel>
        <SettingsPanel title="Permission defaults" description="New users inherit these access rules unless an admin changes them.">
          <SettingsFieldRow label="New teammate role">
            <SettingsSelect value="Operator" options={["Viewer", "Operator", "Customs lead", "Admin - Ops"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Customer visibility">
            <ChoiceSetting options={["All customers", "Assigned only", "No financials"]} initialValue="Assigned only" />
          </SettingsFieldRow>
          <ToggleSetting title="Require admin approval for exports" description="Prevents accidental export of customer documents and commercial records." initialChecked />
        </SettingsPanel>
      </div>
    </>
  )
}

function IntegrationsTab() {
  const integrations: Array<[LucideIcon, string, string, string]> = [
    [Mail, "Gmail", "Connected for customer replies, quote follow-ups, and digest delivery.", "Connected"],
    [Mail, "Outlook", "Available for shared mailboxes and finance inbox routing.", "Ready"],
    [MessageCircle, "Slack", "Exception alerts go to #ops-customs and #premium-customers.", "Connected"],
    [Cloud, "CargoWise", "Shipment sync every 15 minutes. 1 warning needs mapping review.", "Review"],
    [ReceiptText, "Xero", "Invoices and credit-limit snapshots sync nightly.", "Connected"],
    [Globe2, "Customs broker portal", "Broker updates imported into shipment timelines.", "Connected"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Integrations"
        title="Integrations"
        description="Connect the systems operators already use so Multideck can pull context and push approved updates."
        actions={primaryAction("Add integration", () => toast.success("Integration picker opened"))}
      />
      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        {integrations.map(([icon, title, description, status]) => (
          <SettingsPanel
            key={title}
            title={title}
            description={description}
            action={<StatusPill tone={status === "Review" ? "amber" : status === "Ready" ? "blue" : "teal"}>{status}</StatusPill>}
          >
            <IconRow icon={icon} title={`${title} settings`} description="Configure sync fields, owners, and approval behaviour." right={compactAction("Manage")} />
          </SettingsPanel>
        ))}
      </div>
    </>
  )
}

function ApiTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / API & webhooks"
        title="API & webhooks"
        description="Manage technical access without making operators leave the product or guess what is connected."
        actions={primaryAction("Create API key", () => toast.success("API key draft created"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="API keys" description="Keys are shown once. Use scoped keys for customer portals and broker automations.">
          <IconRow icon={KeyRound} title="Production sync key" description="Read shipments, write milestones. Last used 8 minutes ago." right={<StatusPill tone="teal">Active</StatusPill>} />
          <IconRow icon={Braces} title="Customer portal key" description="Read tracking pages and quotes only. Last used today 05:41." right={<StatusPill tone="teal">Active</StatusPill>} />
          <IconRow icon={History} title="Legacy import key" description="No calls in 44 days. Rotate or remove before launch." right={<StatusPill tone="amber">Review</StatusPill>} />
        </SettingsPanel>
        <SettingsPanel title="Webhooks" description="Event delivery for downstream systems.">
          <SettingsFieldRow label="Shipment updated">
            <SettingsInput defaultValue="https://ops.northwind.de/hooks/shipments" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Document parsed">
            <SettingsInput defaultValue="https://ops.northwind.de/hooks/documents" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Secret rotation">
            <ChoiceSetting options={["30 days", "60 days", "90 days"]} initialValue="60 days" />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function BillingTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Billing & usage"
        title="Billing & usage"
        description="Understand plan limits, Artie usage, and the workspace costs that affect operating margin."
        actions={compactAction("Download invoices", () => toast.success("Invoices prepared"))}
      />
      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-5">
          <SettingsPanel title="Plan" description="Northwind Forwarding is on the Operations plan.">
            <SettingsFieldRow label="Seats">
              <div className="grid gap-3 sm:grid-cols-3">
                <SettingsInput defaultValue="18 included" />
                <SettingsInput defaultValue="14 active" />
                <SettingsInput defaultValue="4 available" />
              </div>
            </SettingsFieldRow>
            <SettingsFieldRow label="Billing cadence">
              <ChoiceSetting options={["Monthly", "Annual"]} initialValue="Annual" />
            </SettingsFieldRow>
            <SettingsFieldRow label="Renewal">
              <SettingsInput defaultValue="14 Jan 2027 - EUR 18,400" />
            </SettingsFieldRow>
          </SettingsPanel>
          <SettingsPanel title="Usage controls" description="Keep AI and data volume predictable without slowing operators down.">
            <SettingsFieldRow label="Artie spend guardrail">
              <SettingsSelect value="Warn at EUR 1,500/month" options={["Warn at EUR 750/month", "Warn at EUR 1,500/month", "Warn at EUR 3,000/month"]} />
            </SettingsFieldRow>
            <ToggleSetting title="Pause non-critical watchers at limit" description="High-risk shipment and customs alerts still run." initialChecked />
          </SettingsPanel>
        </div>
        <SettingsSummaryCard
          title="This month"
          rows={[
            ["Artie actions", "12,480"],
            ["Documents parsed", "4,812"],
            ["Customer emails drafted", "286"],
            ["Projected bill", "EUR 1,284"],
          ]}
        />
      </div>
    </>
  )
}

function BrandingTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Branding"
        title="Branding"
        description="Set the customer-facing identity for shared tracking pages, quote links, and automated updates."
        actions={primaryAction("Save branding", () => toast.success("Brand settings saved"))}
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="Identity" description="Used on customer-facing surfaces.">
          <SettingsFieldRow label="Workspace name">
            <SettingsInput defaultValue="Northwind Forwarding" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Public URL">
            <SettingsInput defaultValue="tracking.multideck.com/northwind" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Logo">
            <div className="flex flex-wrap gap-2">
              {compactAction("Upload logo", () => toast.success("Logo upload opened"))}
              {compactAction("Preview tracking page")}
            </div>
          </SettingsFieldRow>
        </SettingsPanel>
        <SettingsPanel title="Customer page style" description="Keep the customer experience branded without compromising tracking clarity.">
          <SettingsFieldRow label="Accent colour">
            <div className="flex items-center gap-3">
              <span className="size-8 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] shadow-[var(--md-shadow-line)]" />
              <SettingsInput defaultValue="#0E7D74" className="max-w-[180px]" />
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Email sign-off">
            <SettingsTextarea defaultValue="Northwind Forwarding Ops - live cargo visibility, customs support, and exception handling." />
          </SettingsFieldRow>
          <ToggleSetting title="Show operator profile on tracking pages" description="Displays the assigned owner and workspace contact details to customers." initialChecked />
        </SettingsPanel>
      </div>
    </>
  )
}

function WhatsNewTab() {
  const notes = [
    ["Artie approval rules", "Set approval thresholds by customer emails, bookings, data edits, and watcher changes.", "New"],
    ["Customer tracking preview", "Branding changes now show in a live preview before publishing.", "Improved"],
    ["Customs hold digest", "Daily digest groups holds by broker, missing field, and customer impact.", "New"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Support / What's new"
        title="What's new"
        description="Recent product changes that matter to freight operators and workspace admins."
      />
      <div className="mt-7 space-y-5">
        <SettingsPanel title="June release" description="Focused on safer AI action, clearer customer pages, and faster exception review.">
          {notes.map(([title, description, tag]) => (
            <IconRow key={title} icon={Zap} title={title} description={description} right={<StatusPill tone={tag === "New" ? "teal" : "blue"}>{tag}</StatusPill>} />
          ))}
        </SettingsPanel>
      </div>
    </>
  )
}

function DocsTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Support / Docs & shortcuts"
        title="Docs & shortcuts"
        description="Fast access to the operational references and keyboard shortcuts your team uses most."
      />
      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <SettingsPanel title="Guides" description="Short docs for common operational setup.">
          <IconRow icon={BookOpen} title="Build a customs hold workflow" description="Set watchers, approvals, broker sync, and owner notifications." right={compactAction("Open")} />
          <IconRow icon={BookOpen} title="Customer tracking pages" description="Share shipment status safely without exposing internal comments." right={compactAction("Open")} />
          <IconRow icon={BookOpen} title="Import shipments by CSV" description="Prepare fields, map columns, and fix failed imports." right={compactAction("Open")} />
        </SettingsPanel>
        <SettingsPanel title="Keyboard shortcuts" description="Keep operators moving without menu hunting.">
          <SettingsFieldRow label="Command menu">
            <SettingsInput value="Cmd K" readOnly />
          </SettingsFieldRow>
          <SettingsFieldRow label="New shipment">
            <SettingsInput value="N then S" readOnly />
          </SettingsFieldRow>
          <SettingsFieldRow label="Open Artie">
            <SettingsInput value="A" readOnly />
          </SettingsFieldRow>
          <SettingsFieldRow label="Copy tracking link">
            <SettingsInput value="Shift C" readOnly />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function SupportTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Support / Contact support"
        title="Contact support"
        description="Send the Multideck team enough operational context to help without slowing your day down."
        actions={primaryAction("Send request", () => toast.success("Support request sent"))}
      />
      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <SettingsPanel title="Request details" description="Include a shipment ID or customer name when the issue is workflow-specific.">
          <SettingsFieldRow label="Topic">
            <SettingsSelect value="Artie action review" options={["Artie action review", "Shipment sync issue", "Billing question", "Security concern", "Product feedback"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Priority">
            <ChoiceSetting options={["Normal", "High", "Urgent"]} initialValue="High" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Message" align="start">
            <SettingsTextarea defaultValue="Artie drafted a customer ETA note correctly, but the approval rule did not mention the value threshold. Please review our configuration." />
          </SettingsFieldRow>
          <SettingsFieldRow label="Attachment">
            <div className="flex flex-wrap gap-2">
              {compactAction("Attach screenshot")}
              {compactAction("Attach shipment log")}
            </div>
          </SettingsFieldRow>
        </SettingsPanel>
        <SettingsSummaryCard
          title="Support cover"
          rows={[
            ["Plan", "Operations"],
            ["Response target", "4 working hours"],
            ["Success manager", "Marta Klein"],
            ["Open tickets", "1"],
          ]}
        />
      </div>
    </>
  )
}

function TabContent({ activeTab }: { activeTab: string }) {
  switch (activeTab) {
    case "profile":
      return <ProfileTab />
    case "security":
      return <SecurityTab />
    case "sessions":
      return <SessionsTab />
    case "preferences":
      return <PreferencesTab />
    case "notifications":
      return <NotificationsTab />
    case "agent-artie":
      return <AgentArtieTab />
    case "team":
      return <TeamTab />
    case "integrations":
      return <IntegrationsTab />
    case "api":
      return <ApiTab />
    case "billing":
      return <BillingTab />
    case "branding":
      return <BrandingTab />
    case "whats-new":
      return <WhatsNewTab />
    case "docs":
      return <DocsTab />
    case "support":
      return <SupportTab />
    default:
      return <ProfileTab />
  }
}

export function SettingsPage({ navigate }: { navigate: (path: string) => void }) {
  const [activeTab, setActiveTab] = useState(readTabFromUrl)
  const flatItems = useMemo(() => settingsGroups.flatMap((group) => group.items), [])
  const activeItem = flatItems.find((item) => item.id === activeTab) ?? flatItems[0]

  useEffect(() => {
    const onPopState = () => setActiveTab(readTabFromUrl())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  function changeTab(tab: string) {
    setActiveTab(tab)
    window.history.pushState({}, "", tab === "profile" ? "/settings" : `/settings?tab=${tab}`)
  }

  return (
    <div className="min-h-screen bg-[var(--md-bg)]">
      <MobileSettingsTabs activeTab={activeItem.id} onChange={changeTab} onBack={() => navigate("/")} />
      <div className="grid min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
        <SettingsRail
          groups={settingsGroups}
          activeTab={activeItem.id}
          onChange={changeTab}
          onBack={() => navigate("/")}
          className="hidden lg:flex"
        />
        <main className="min-w-0 px-[var(--md-page-pad)] py-8 lg:py-9">
          <div className="mx-auto max-w-[1120px] pb-12">
            <TabContent activeTab={activeItem.id} />
          </div>
        </main>
      </div>
    </div>
  )
}
