import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
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
import { Pagination } from "@/components/multideck/pagination"
import { StatusPill } from "@/components/multideck/status-pill"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsIntegrationRow,
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
import { languageOptions, getLanguageOption } from "@/i18n/languages"
import { useLanguage } from "@/i18n/language-provider"
import {
  changeApiTeamUserOffice,
  createApiAuthorizationRole,
  createApiTeamUser,
  deleteApiAuthorizationRole,
  getApiAuthorizationState,
  getApiTeamUsers,
  updateApiRolePermissions,
  updateApiUserRoles,
  type ApiAuthorizationRole,
  type ApiAuthorizationState,
  type ApiPermission,
  type ApiTeamRole,
  type ApiTeamUser,
  type ApiTeamUsersResponse,
} from "@/lib/api"
import { clockDisplayLabelFromMode, clockDisplayLabels, clockDisplayModeFromLabel, readClockDisplayMode, resetAiAgentName, useAiAgentName, writeAiAgentName, writeClockDisplayMode } from "@/lib/user-preferences"
import { getSupabaseSession, supabase } from "@/lib/supabase"
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
      { id: "agent-dexter", label: "Agent Dexter", icon: Sparkles },
    ],
  },
  {
    label: "Organisation",
    items: [
      { id: "team", label: "Team", icon: Users },
      { id: "permissions", label: "Permissions", icon: ShieldCheck },
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

function ClockDisplaySetting() {
  const [value, setValue] = useState(clockDisplayLabelFromMode(readClockDisplayMode()))

  function changeValue(nextValue: string) {
    setValue(nextValue)
    writeClockDisplayMode(clockDisplayModeFromLabel(nextValue))
  }

  return <SettingsChoiceGroup options={[...clockDisplayLabels]} value={value} onChange={changeValue} />
}

function LanguageSettingField({
  label = "Language",
  description = "This changes every Multideck screen and flips layout direction for right-to-left languages.",
}: {
  label?: string
  description?: string
}) {
  const { language, setLanguage, direction } = useLanguage()
  const selectedLanguage = getLanguageOption(language)
  const languageLabels = languageOptions.map((option) => `${option.label} - ${option.nativeLabel}`)
  const selectedLabel = `${selectedLanguage.label} - ${selectedLanguage.nativeLabel}`

  return (
    <SettingsFieldRow label={label} description={description}>
      <div className="grid gap-2">
        <SettingsSelect
          value={selectedLabel}
          options={languageLabels}
          ariaLabel="App language"
          onChange={(nextLabel) => {
            const nextLanguage = languageOptions.find((option) => nextLabel.startsWith(option.label))
            if (nextLanguage) setLanguage(nextLanguage.code)
          }}
        />
        <p className="text-[12px] leading-5 text-[var(--md-text)]">
          {direction === "rtl" ? "Right-to-left layout is active." : "Left-to-right layout is active."}
        </p>
      </div>
    </SettingsFieldRow>
  )
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

type ProfileFormState = {
  firstName: string
  lastName: string
  preferredName: string
  email: string
  phone: string
  roleTitle: string
}

const emptyProfileForm: ProfileFormState = {
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  phone: "",
  roleTitle: "",
}

function readProfileMetadataValue(metadata: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }

  return ""
}

function splitProfileName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }

  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" }
}

function createProfileFormFromUser(user: User): ProfileFormState {
  const metadata = user.user_metadata
  const fallbackName = readProfileMetadataValue(metadata, ["full_name", "name", "display_name"])
  const splitName = splitProfileName(fallbackName)
  const firstName = readProfileMetadataValue(metadata, ["first_name", "firstName"]) || splitName.firstName
  const lastName = readProfileMetadataValue(metadata, ["last_name", "lastName"]) || splitName.lastName

  return {
    firstName,
    lastName,
    preferredName: readProfileMetadataValue(metadata, ["preferred_name", "preferredName"]) || firstName,
    email: user.email ?? "",
    phone: readProfileMetadataValue(metadata, ["phone", "phone_number", "mobile"]) || (user.phone ?? ""),
    roleTitle: readProfileMetadataValue(metadata, ["role_title", "roleTitle", "title"]),
  }
}

function getProfileInitials(profile: ProfileFormState) {
  const source = `${profile.firstName} ${profile.lastName}`.trim() || profile.email || "MD"
  const parts = source.includes("@") ? source.split("@")[0].replace(/[._-]+/g, " ").split(/\s+/) : source.split(/\s+/)
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : source.slice(0, 2)

  return initials.toUpperCase()
}

function getProfileFullName(profile: ProfileFormState) {
  return `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim()
}

function ProfileTab() {
  const [profile, setProfile] = useState<ProfileFormState>(emptyProfileForm)
  const [savedProfile, setSavedProfile] = useState<ProfileFormState>(emptyProfileForm)
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile)
  const profileInitials = getProfileInitials(profile)
  const fullName = getProfileFullName(profile)

  useEffect(() => {
    if (!supabase) {
      setIsProfileLoading(false)
      return
    }

    let cancelled = false

    function applyProfile(nextProfile: ProfileFormState) {
      if (cancelled) return
      setProfile(nextProfile)
      setSavedProfile(nextProfile)
      setIsProfileLoading(false)
    }

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        if (error) console.error(error)
        setIsProfileLoading(false)
        return
      }

      applyProfile(createProfileFormFromUser(data.user))
    }).catch((error) => {
      console.error(error)
      setIsProfileLoading(false)
      toast.error("Could not load profile")
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "USER_UPDATED" || event === "SIGNED_IN") && session?.user) {
        applyProfile(createProfileFormFromUser(session.user))
      }
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  function updateProfileField(field: keyof ProfileFormState, value: string) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  function discardProfileChanges() {
    setProfile(savedProfile)
    toast.message("Changes discarded")
  }

  async function saveProfileChanges() {
    if (!supabase || isProfileSaving) return

    const nextFullName = getProfileFullName(profile)
    setIsProfileSaving(true)

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          preferred_name: profile.preferredName.trim(),
          full_name: nextFullName,
          name: nextFullName,
          phone: profile.phone.trim(),
          role_title: profile.roleTitle.trim(),
        },
      })

      if (error) throw error

      const nextProfile = data.user ? createProfileFormFromUser(data.user) : profile
      setProfile(nextProfile)
      setSavedProfile(nextProfile)
      toast.success("Profile settings saved")
    } catch (error) {
      console.error(error)
      toast.error("Could not save profile")
    } finally {
      setIsProfileSaving(false)
    }
  }

  const personalConnectors: Array<{
    icon: LucideIcon
    title: string
    description: string
    status: string
    statusTone: "connected" | "ready" | "review" | "workspace"
    actionLabel: string
  }> = [
    {
      icon: Mail,
      title: "Gmail",
      description: "Connect your Google inbox for customer replies, quote follow-ups, and approved Dexter drafts.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: Mail,
      title: "Outlook Mail",
      description: "Connect Outlook for shared inboxes, finance threads, and Microsoft 365 customer comms.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: CalendarClock,
      title: "Google Calendar",
      description: "Let Multideck schedule customer check-ins, handover reminders, and daily operations digests.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: CalendarClock,
      title: "Outlook Calendar",
      description: "Use Microsoft calendar availability for account reviews, escalation windows, and internal follow-ups.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: Cloud,
      title: "Google Drive",
      description: "Attach folders for invoices, packing lists, customer reports, and onboarding documents.",
      status: "Connected",
      statusTone: "connected",
      actionLabel: "Manage",
    },
    {
      icon: Cloud,
      title: "OneDrive / SharePoint",
      description: "Bring Microsoft files into booking records without asking operators to download and reupload.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: MessageCircle,
      title: "Slack",
      description: "Send approved exception alerts and handover notes to the right ops channels.",
      status: "Connected",
      statusTone: "connected",
      actionLabel: "Manage",
    },
    {
      icon: MessageCircle,
      title: "Microsoft Teams",
      description: "Route approval requests and customer-risk updates to teams already working in Microsoft 365.",
      status: "Ready",
      statusTone: "ready",
      actionLabel: "Connect",
    },
    {
      icon: BriefcaseBusiness,
      title: "Project tools",
      description: "Connect ClickUp, Linear, or Asana so customer follow-ups and launch tasks stay visible.",
      status: "Optional",
      statusTone: "workspace",
      actionLabel: "Choose",
    },
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Account / Profile"
        title="Profile"
        description="How you appear to your team, customers, and Dexter. Some of this is used in audit logs and customer-facing comms."
        actions={
          <>
            {compactAction("Discard", discardProfileChanges)}
            <Button
              type="button"
              disabled={isProfileLoading || isProfileSaving || !profileDirty}
              className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-55"
              onClick={() => void saveProfileChanges()}
            >
              {isProfileSaving ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      />

      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <SettingsPanel title="Photo" description="JPG, PNG, or SVG. Recommended 256x256.">
          <SettingsFieldRow label="Avatar" description="Used in comments, assignment logs, and customer replies.">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="size-[76px] rounded-full">
                <AvatarFallback className="rounded-full bg-[var(--md-accent)] text-[24px] font-medium text-white" data-i18n-skip>{profileInitials}</AvatarFallback>
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
          <SettingsFieldRow label="Name">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsInput
                value={profile.firstName}
                placeholder="First name"
                disabled={isProfileLoading || isProfileSaving}
                onChange={(event) => updateProfileField("firstName", event.target.value)}
              />
              <SettingsInput
                value={profile.lastName}
                placeholder="Last name"
                disabled={isProfileLoading || isProfileSaving}
                onChange={(event) => updateProfileField("lastName", event.target.value)}
              />
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Preferred name" description="What Dexter and your team call you.">
            <SettingsInput
              value={profile.preferredName}
              placeholder="Preferred name"
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("preferredName", event.target.value)}
            />
          </SettingsFieldRow>
          <SettingsFieldRow label="Work email">
            <div className="relative">
              <SettingsInput value={profile.email} className="pr-20" dir="ltr" data-i18n-skip disabled />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-[var(--md-text)]">verified</span>
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Phone" description="For two-factor and emergency alerts only.">
            <SettingsInput
              value={profile.phone}
              placeholder="+44 20 7123 4567"
              dir="ltr"
              data-i18n-skip
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("phone", event.target.value)}
            />
          </SettingsFieldRow>
          <SettingsFieldRow label="Role / title">
            <SettingsInput
              value={profile.roleTitle}
              placeholder="Operations Manager"
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("roleTitle", event.target.value)}
            />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsSummaryCard
          title="At a glance"
          rows={[
            ["Member since", "Jan 2024"],
            ["Bookings handled", "1,847"],
            ["Active boards", "3"],
            ["Profile name", fullName || "Not set"],
            ["Last sign-in", "Current session"],
            ["Role", profile.roleTitle || "Not set"],
            ["Workspace", "Northwind Forwarding"],
          ]}
        />
      </div>

      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="Working schedule" description="Used to schedule notifications, AI digest delivery, and out-of-hours escalation.">
          <SettingsFieldRow label="Time zone">
            <SettingsSelect value="Europe/Berlin - UTC+1" options={["Europe/Berlin - UTC+1", "Europe/London - UTC+0", "America/New York - UTC-5", "Asia/Singapore - UTC+8"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Working hours" description="Dexter will not send non-critical pings outside these hours.">
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
          <LanguageSettingField />
        </SettingsPanel>

        <SettingsPanel title="Public profile" description="Shown to customers on shared tracking pages and quotes.">
          <SettingsFieldRow label="Display name">
            <SettingsInput defaultValue="Elena Moreno - Northwind Forwarding" />
          </SettingsFieldRow>
          <SettingsFieldRow label="About" align="start">
            <SettingsTextarea defaultValue="Operations manager at Northwind. Twelve years moving cargo across Asia-Europe lanes. I read every PoD and personally chase every customs hold." />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel
          title="Connected tools"
          description="Personal accounts Multideck can use for drafts, reminders, files, and approved updates. Workspace systems still live under Organisation / Integrations."
        >
          {personalConnectors.map((connector) => (
            <SettingsIntegrationRow
              key={connector.title}
              icon={connector.icon}
              title={connector.title}
              description={connector.description}
              status={connector.status}
              statusTone={connector.statusTone}
              actionLabel={connector.actionLabel}
              onAction={() => toast.success(`${connector.title} ${connector.actionLabel.toLowerCase()} flow opened`)}
            />
          ))}
        </SettingsPanel>

        <SettingsPanel title="Danger zone" className="shadow-[inset_0_0_0_1px_rgba(209,78,78,0.16),0_0_0_1px_rgba(209,78,78,0.08)]">
          <SettingsFieldRow label="Export my data" description="A zip of every booking, document note, profile event, and audit log linked to your account.">
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
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
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
        description="Review signed-in devices and remove anything that should not have access to live booking data."
        actions={compactAction("Sign out all others", () => toast.success("Other sessions signed out"))}
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
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
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="Workspace defaults" description="These affect new boards, lists, and booking views for your account.">
          <LanguageSettingField label="App language" />
          <SettingsFieldRow label="Appearance" description="Choose the workspace colour mode for this browser.">
            <div className="max-w-[300px]">
              <ThemeToggle className="bg-[var(--md-glass)]" />
            </div>
          </SettingsFieldRow>
          <SettingsFieldRow label="Start page">
            <SettingsSelect value="Overview - Today Ops" options={["Overview - Today Ops", "Bookings - Open", "Customers", "Agent Dexter"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Default booking view">
            <ChoiceSetting options={["Table", "Board"]} initialValue="Table" />
          </SettingsFieldRow>
          <SettingsFieldRow label="World clock display" description="Digital is the default. Analogue switches dashboard city times to clock faces.">
            <ClockDisplaySetting />
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
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-[var(--md-page-stack-gap)]">
          <SettingsPanel title="Urgent alerts" description="These can break quiet hours when customer risk is high.">
            <ToggleSetting title="Customs holds" description="Ping immediately when a hold is raised or a licence is missing." initialChecked meta={<StatusPill tone="amber">3 pending</StatusPill>} />
            <ToggleSetting title="ETA slips over 6 hours" description="Notify the owner before Dexter drafts the customer update." initialChecked />
            <ToggleSetting title="Customer message unanswered" description="Escalate when a premium account waits more than 2 working hours." initialChecked />
            <ToggleSetting title="Document parse below 80%" description="Keep this in digest unless the booking is due within 24 hours." initialChecked={false} />
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

function AgentDexterTab() {
  const aiAgentName = useAiAgentName()

  return (
    <>
      <SettingsPageHeader
        eyebrow={`Workspace / Agent ${aiAgentName}`}
        title={`Agent ${aiAgentName}`}
        description={`Tune how proactive ${aiAgentName} is, what it watches by default, and when it should escalate to a human. Changes apply to everything ${aiAgentName} does in your workspace.`}
        actions={
          <>
            {compactAction("Reset to defaults", () => {
              resetAiAgentName()
              toast.message("AI agent defaults restored")
            })}
            {primaryAction("Save", () => toast.success(`Agent ${aiAgentName} settings saved`))}
          </>
        }
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="Agent identity" description="System administrators can choose the workspace AI agent name shown across Multideck.">
          <SettingsFieldRow label="AI agent name" description="Used in navigation, action buttons, chat panels, and operator-facing copy.">
            <SettingsInput aria-label="AI agent name" value={aiAgentName} onChange={(event) => writeAiAgentName(event.target.value)} placeholder="Dexter" />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel
          title="Autonomy level"
          description={`Pick how much ${aiAgentName} does on its own. You can always override per-task by setting an approval rule below.`}
          action={<span className="text-[12px] font-medium text-[var(--md-accent)]">Current - Suggest</span>}
        >
          <div className="px-5 py-5">
            <OptionCards
              initialValue="Suggest"
              options={[
                { label: "Off", description: "No background agents. Manual chats only." },
                { label: "Manual", description: `${aiAgentName} answers when asked. Never acts.` },
                { label: "Suggest", description: "Drafts and proposes. Always asks before sending or changing data." },
                { label: "Autopilot", description: "Acts within your rules. Asks only for irreversible or high-value actions." },
              ]}
            />
          </div>
        </SettingsPanel>

        <SettingsPanel title="Default watchers" description={`Background agents ${aiAgentName} runs for you. Toggle any off, or add more from the ${aiAgentName} workspace.`}>
          <ToggleSetting title="Doc parse confidence < 80%" description={`Flags documents ${aiAgentName} is unsure about for your review.`} initialChecked />
          <ToggleSetting title="Customs hold raised" description="Pings within 60 seconds of any new hold." initialChecked />
          <ToggleSetting title="ETA slip > 6 hours" description="Notifies you and the customer after approval." initialChecked />
          <ToggleSetting title="Carrier on-time degradation" description="Watches for any carrier dropping 5%+ vs trailing 90d." initialChecked />
          <ToggleSetting title="Demurrage / detention risk" description="Flags containers nearing free-time expiry." initialChecked />
          <ToggleSetting title="Quote silence > 48h" description="Drafts a follow-up after two days of silence on open quotes." initialChecked={false} />
        </SettingsPanel>

        <SettingsPanel title="Approval rules" description={`${aiAgentName} will always pause for explicit approval when any rule below is true, regardless of autonomy level.`}>
          <SettingsFieldRow label="Outbound emails to customers">
            <ChoiceSetting options={["Always ask", "Ask if > EUR 1k impact", "Never ask"]} initialValue="Always ask" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Booking confirmations & bookings">
            <ChoiceSetting options={["Always ask", "Ask if > EUR 5k", "Never ask"]} initialValue="Always ask" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Changes to booking data">
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

const emptyInviteForm = {
  firstName: "",
  lastName: "",
  email: "",
  roleTitle: "Operator",
  roleId: "",
  officeId: "",
}

function getTeamUserInitials(user: ApiTeamUser) {
  const source = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.displayName || user.email
  const parts = source.split(/\s+/).filter(Boolean)
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : source.slice(0, 2)
  return initials.toUpperCase()
}

function getOfficeLabel(office: { name: string; address: string | null }) {
  return office.address ? `${office.name} - ${office.address}` : office.name
}

function upsertTeamUser(users: ApiTeamUser[], nextUser: ApiTeamUser) {
  const existing = users.some((user) => user.id === nextUser.id)
  const next = existing ? users.map((user) => (user.id === nextUser.id ? nextUser : user)) : [...users, nextUser]
  return next.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function getDefaultInviteRole(roles: ApiAuthorizationRole[]) {
  return roles.find((role) => role.name.toLowerCase() === "operator") ?? roles[0] ?? null
}

function getPermissionGroups(permissions: ApiPermission[]) {
  return permissions.reduce<Array<{ group: string; permissions: ApiPermission[] }>>((groups, permission) => {
    const existingGroup = groups.find((item) => item.group === permission.group)
    if (existingGroup) {
      existingGroup.permissions.push(permission)
    } else {
      groups.push({ group: permission.group, permissions: [permission] })
    }

    return groups
  }, [])
}

function getRolesFromIds(roles: ApiAuthorizationRole[], roleIds: string[]): ApiTeamRole[] {
  return roleIds
    .map((roleId) => roles.find((role) => role.id === roleId))
    .filter((role): role is ApiAuthorizationRole => Boolean(role))
    .map((role) => ({ id: role.id, name: role.name }))
}

function upsertUserRoleAssignment(assignments: ApiAuthorizationState["userRoles"], userId: string, roleIds: string[]) {
  const nextAssignment = { userId, roleIds }
  return assignments.some((assignment) => assignment.userId === userId)
    ? assignments.map((assignment) => (assignment.userId === userId ? nextAssignment : assignment))
    : [...assignments, nextAssignment]
}

function TeamTab() {
  const { t } = useLanguage()
  const [team, setTeam] = useState<ApiTeamUsersResponse | null>(null)
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteForm, setInviteForm] = useState(emptyInviteForm)
  const [creatingUser, setCreatingUser] = useState(false)
  const [changingOfficeUserId, setChangingOfficeUserId] = useState<string | null>(null)
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null)
  const [authorizationState, setAuthorizationState] = useState<ApiAuthorizationState | null>(null)
  const [teamPage, setTeamPage] = useState(1)
  const [teamPageSize, setTeamPageSize] = useState(8)

  async function loadTeam() {
    setLoadingTeam(true)
    setTeamError(null)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))

      const response = await getApiTeamUsers(session.access_token)
      setTeam(response)

      let nextAuthorizationState: ApiAuthorizationState | null = null
      try {
        nextAuthorizationState = await getApiAuthorizationState(session.access_token)
        setAuthorizationState(nextAuthorizationState)
      } catch (error) {
        console.error(error)
      }

      const defaultRole = nextAuthorizationState ? getDefaultInviteRole(nextAuthorizationState.roles) : null
      setInviteForm((current) => ({
        ...current,
        officeId: current.officeId || response.offices[0]?.id || "",
        roleId: current.roleId || defaultRole?.id || "",
        roleTitle: defaultRole?.name ?? current.roleTitle,
      }))
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : t("Team users could not be loaded."))
    } finally {
      setLoadingTeam(false)
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [])

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!inviteForm.email.trim()) {
      toast.error(t("Email is required"))
      return
    }

    setCreatingUser(true)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before creating users."))

      const selectedInviteRole = authorizationState?.roles.find((role) => role.id === inviteForm.roleId)
      const response = await createApiTeamUser(session.access_token, {
        email: inviteForm.email.trim(),
        firstName: inviteForm.firstName.trim() || null,
        lastName: inviteForm.lastName.trim() || null,
        companyId: team?.company?.id ?? null,
        officeId: inviteForm.officeId || null,
        roleTitle: (selectedInviteRole?.name ?? inviteForm.roleTitle.trim()) || null,
        roleId: inviteForm.roleId || null,
      })

      setTeam((current) => {
        const offices = current?.offices ?? []

        return {
          company: current?.company ?? response.company,
          offices: offices.some((office) => office.id === response.office.id) ? offices : [...offices, response.office],
          users: upsertTeamUser(current?.users ?? [], response.user),
        }
      })
      setAuthorizationState((current) => current ? {
        ...current,
        userRoles: upsertUserRoleAssignment(current.userRoles, response.user.id, response.user.roles.map((role) => role.id)),
      } : current)
      const defaultRole = authorizationState ? getDefaultInviteRole(authorizationState.roles) : null
      setInviteForm({ ...emptyInviteForm, officeId: inviteForm.officeId, roleId: defaultRole?.id ?? "", roleTitle: defaultRole?.name ?? "Operator" })
      setShowInviteForm(false)
      toast.success(t(response.invited ? "User invitation sent" : "User created"), { description: response.user.email })
    } catch (error) {
      toast.error(t("User could not be created"), {
        description: error instanceof Error ? error.message : t("Check the Supabase admin configuration and try again."),
      })
    } finally {
      setCreatingUser(false)
    }
  }

  async function handleChangeUserOffice(member: ApiTeamUser, officeId: string) {
    const currentOfficeId = member.offices[0]?.id ?? ""
    if (!officeId || officeId === currentOfficeId) return

    setChangingOfficeUserId(member.id)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before changing user offices."))

      const updatedUser = await changeApiTeamUserOffice(session.access_token, member.id, { officeId })
      setTeam((current) => current ? { ...current, users: upsertTeamUser(current.users, updatedUser) } : current)
      toast.success(t("Office updated"), { description: updatedUser.email })
    } catch (error) {
      toast.error(t("Office could not be updated"), {
        description: error instanceof Error ? error.message : t("Check the user and office, then try again."),
      })
    } finally {
      setChangingOfficeUserId(null)
    }
  }

  async function handleChangeUserRole(member: ApiTeamUser, roleId: string) {
    const currentRoleId = member.roles[0]?.id ?? ""
    if (!authorizationState || !roleId || roleId === currentRoleId) return

    setChangingRoleUserId(member.id)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before changing user roles."))

      const assignment = await updateApiUserRoles(session.access_token, member.id, { roleIds: [roleId] })
      const nextRoles = getRolesFromIds(authorizationState.roles, assignment.roleIds)

      setAuthorizationState((current) => current ? {
        ...current,
        userRoles: upsertUserRoleAssignment(current.userRoles, assignment.userId, assignment.roleIds),
      } : current)
      setTeam((current) => current ? {
        ...current,
        users: current.users.map((user) => user.id === member.id ? { ...user, roles: nextRoles } : user),
      } : current)
      toast.success(t("Role updated"), { description: member.email })
    } catch (error) {
      toast.error(t("Role could not be updated"), {
        description: error instanceof Error ? error.message : t("Check the role and try again."),
      })
    } finally {
      setChangingRoleUserId(null)
    }
  }

  const members = team?.users ?? []
  const teamPageCount = Math.max(Math.ceil(members.length / teamPageSize), 1)
  const visibleMembers = members.slice((Math.min(teamPage, teamPageCount) - 1) * teamPageSize, Math.min(teamPage, teamPageCount) * teamPageSize)
  const inviteOffice = team?.offices.find((office) => office.id === inviteForm.officeId)
  const inviteRole = authorizationState?.roles.find((role) => role.id === inviteForm.roleId)
  const roleOptions = authorizationState?.roles ?? []

  useEffect(() => {
    if (teamPage > teamPageCount) setTeamPage(teamPageCount)
  }, [teamPage, teamPageCount])

  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Team"
        title="Team"
        description="Create Supabase-authenticated users, link them to your company, and assign precise permission roles."
        actions={primaryAction(showInviteForm ? "Close invite" : "Invite teammate", () => setShowInviteForm((value) => !value))}
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        {showInviteForm ? (
          <SettingsPanel title="Create user" description="Sends a Supabase invitation, creates the Multideck profile, and assigns an office plus role.">
            <form className="divide-y divide-[rgba(11,20,19,0.07)]" onSubmit={handleCreateUser}>
              <SettingsFieldRow label="Name" description="Shown in Multideck and saved to the Supabase user metadata.">
                <div className="grid gap-2 sm:grid-cols-2">
                  <SettingsInput
                    value={inviteForm.firstName}
                    placeholder="First name"
                    aria-label="First name"
                    onChange={(event) => setInviteForm((current) => ({ ...current, firstName: event.target.value }))}
                  />
                  <SettingsInput
                    value={inviteForm.lastName}
                    placeholder="Last name"
                    aria-label="Last name"
                    onChange={(event) => setInviteForm((current) => ({ ...current, lastName: event.target.value }))}
                  />
                </div>
              </SettingsFieldRow>
              <SettingsFieldRow label="Email" description="The invitation is sent by Supabase Auth.">
                <SettingsInput
                  value={inviteForm.email}
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  placeholder="name@company.com"
                  aria-label="Email"
                  onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                />
              </SettingsFieldRow>
              <SettingsFieldRow label="Office" description="The user will be linked through the office membership table.">
                {team?.offices.length ? (
                  <select
                    data-i18n-skip
                    dir="auto"
                    aria-label={t("Office")}
                    className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
                    value={inviteForm.officeId}
                    onChange={(event) => setInviteForm((current) => ({ ...current, officeId: event.target.value }))}
                  >
                    {team.offices.map((office) => (
                      <option key={office.id} value={office.id}>{getOfficeLabel(office)}</option>
                    ))}
                  </select>
                ) : (
                  <SettingsInput value="Default Jenkar office" readOnly />
                )}
                {inviteOffice ? (
                  <p className="mt-2 text-[12px] text-[var(--md-text)]">
                    <span>Assigned to</span> <span data-i18n-skip dir="auto">{getOfficeLabel(inviteOffice)}</span><span>.</span>
                  </p>
                ) : null}
              </SettingsFieldRow>
              <SettingsFieldRow label="Role" description="Sets the user's permission bundle. You can edit each bundle below.">
                {roleOptions.length ? (
                  <select
                    dir="auto"
                    aria-label={t("Role")}
                    className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
                    value={inviteForm.roleId}
                    onChange={(event) => {
                      const nextRole = roleOptions.find((role) => role.id === event.target.value)
                      setInviteForm((current) => ({ ...current, roleId: event.target.value, roleTitle: nextRole?.name ?? current.roleTitle }))
                    }}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                  </select>
                ) : (
                  <SettingsInput value={inviteForm.roleTitle} readOnly />
                )}
                {inviteRole ? (
                  <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]">
                    <span>{inviteRole.description}</span>
                  </p>
                ) : null}
              </SettingsFieldRow>
              <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
                  onClick={() => setShowInviteForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
                  disabled={creatingUser}
                >
                  {creatingUser ? "Creating..." : "Create user"}
                </Button>
              </div>
            </form>
          </SettingsPanel>
        ) : null}

        <SettingsPanel title="Team members" description={loadingTeam ? "Loading team users..." : "Active people in your company."}>
          {teamError ? (
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--md-red)]">Team users could not be loaded.</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{teamError}</p>
              <div className="mt-3">{compactAction("Retry", () => void loadTeam())}</div>
            </div>
          ) : loadingTeam ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="grid gap-3 px-5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
                <div className="size-10 rounded-full bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]" />
                <div className="space-y-2">
                  <div className="h-3 w-40 rounded-full bg-[var(--md-surface-tint)]" />
                  <div className="h-3 w-64 max-w-full rounded-full bg-[var(--md-surface-tint)]" />
                </div>
                <div className="h-7 w-16 rounded-full bg-[var(--md-surface-tint)]" />
              </div>
            ))
          ) : members.length ? (
            visibleMembers.map((member) => {
              const officeSummary = member.offices.map(getOfficeLabel).join(" · ")
              const roleSummary = member.roles.map((role) => role.name).join(" · ")
              const selectedOfficeId = member.offices[0]?.id ?? ""
              const selectedMemberRoleId = member.roles[0]?.id ?? ""
              const isChangingOffice = changingOfficeUserId === member.id
              const isChangingRole = changingRoleUserId === member.id

              return (
                <div key={member.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
                  <Avatar className="size-10 rounded-full">
                    <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[13px] font-medium text-[var(--md-ink)]">{getTeamUserInitials(member)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--md-ink)]">{member.displayName}</p>
                    <p className="mt-1 truncate text-[12px] text-[var(--md-text)]">
                      <span data-i18n-skip dir="ltr">{member.email}</span>
                      <span> · </span>
                      {officeSummary ? <span data-i18n-skip dir="auto">{officeSummary}</span> : <span>No office assigned</span>}
                      <span> · </span>
                      {roleSummary ? <span>{roleSummary}</span> : <span>No role assigned</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {roleOptions.length ? (
                      <select
                        dir="auto"
                        aria-label={t("Change role")}
                        className="h-8 w-full min-w-[170px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-[210px]"
                        value={selectedMemberRoleId}
                        disabled={isChangingRole}
                        onChange={(event) => void handleChangeUserRole(member, event.target.value)}
                      >
                        <option value="" disabled>{t("No role assigned")}</option>
                        {roleOptions.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    ) : null}
                    {team?.offices.length ? (
                      <select
                        data-i18n-skip
                        dir="auto"
                        aria-label={t("Change office")}
                        className="h-8 w-full min-w-[190px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-[230px]"
                        value={selectedOfficeId}
                        disabled={isChangingOffice}
                        onChange={(event) => void handleChangeUserOffice(member, event.target.value)}
                      >
                        <option value="" disabled>{t("No office assigned")}</option>
                        {team.offices.map((office) => (
                          <option key={office.id} value={office.id}>{getOfficeLabel(office)}</option>
                        ))}
                      </select>
                    ) : null}
                    <StatusPill tone={member.status === "Active" ? "teal" : "neutral"}>{isChangingOffice ? t("Updating office...") : isChangingRole ? t("Updating role...") : member.status}</StatusPill>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">No team users yet.</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">Invite the first teammate to create their Supabase Auth account and Multideck profile.</p>
            </div>
          )}
          {!teamError && !loadingTeam && members.length ? (
            <div className="px-5 py-4">
              <Pagination
                page={teamPage}
                pageCount={teamPageCount}
                totalItems={members.length}
                pageSize={teamPageSize}
                itemLabel="team members"
                pageSizeOptions={[8, 16, 32]}
                onPageChange={setTeamPage}
                onPageSizeChange={(nextPageSize) => {
                  setTeamPageSize(nextPageSize)
                  setTeamPage(1)
                }}
                className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]"
              />
            </div>
          ) : null}
        </SettingsPanel>
      </div>
    </>
  )
}

function PermissionsTab() {
  const { t } = useLanguage()
  const [authorizationState, setAuthorizationState] = useState<ApiAuthorizationState | null>(null)
  const [authorizationError, setAuthorizationError] = useState<string | null>(null)
  const [loadingAuthorization, setLoadingAuthorization] = useState(true)
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [customRoleName, setCustomRoleName] = useState("")
  const [creatingRole, setCreatingRole] = useState(false)

  async function loadAuthorizationState() {
    setLoadingAuthorization(true)
    setAuthorizationError(null)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing roles and permissions."))

      const response = await getApiAuthorizationState(session.access_token)
      setAuthorizationState(response)
      setSelectedRoleId((current) => current || response.roles[0]?.id || "")
    } catch (error) {
      setAuthorizationError(error instanceof Error ? error.message : t("Authorization settings could not be loaded."))
    } finally {
      setLoadingAuthorization(false)
    }
  }

  useEffect(() => {
    void loadAuthorizationState()
  }, [])

  async function handleCreateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const roleName = customRoleName.trim()
    if (!roleName) {
      toast.error(t("Role name is required"))
      return
    }

    setCreatingRole(true)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before creating roles."))

      const createdRole = await createApiAuthorizationRole(session.access_token, {
        name: roleName,
        permissionValues: selectedRole?.permissionValues ?? [],
      })

      setAuthorizationState((current) => current ? {
        ...current,
        roles: [...current.roles, createdRole].sort((a, b) => a.name.localeCompare(b.name)),
      } : current)
      setSelectedRoleId(createdRole.id)
      setCustomRoleName("")
      toast.success(t("Custom role created"), { description: createdRole.name })
    } catch (error) {
      toast.error(t("Custom role could not be created"), {
        description: error instanceof Error ? error.message : t("Check the role name and try again."),
      })
    } finally {
      setCreatingRole(false)
    }
  }

  async function handleDeleteRole(role: ApiAuthorizationRole) {
    if (role.isSystem || deletingRoleId) return

    const confirmed = window.confirm(t("Delete this custom role? Users must be moved off the role before it can be deleted."))
    if (!confirmed) return

    setDeletingRoleId(role.id)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before deleting roles."))

      await deleteApiAuthorizationRole(session.access_token, role.id)
      setAuthorizationState((current) => current ? {
        ...current,
        roles: current.roles.filter((item) => item.id !== role.id),
        userRoles: current.userRoles.map((assignment) => ({
          ...assignment,
          roleIds: assignment.roleIds.filter((roleId) => roleId !== role.id),
        })),
      } : current)
      setSelectedRoleId((current) => current === role.id ? "" : current)
      toast.success(t("Custom role deleted"), { description: role.name })
    } catch (error) {
      toast.error(t("Custom role could not be deleted"), {
        description: error instanceof Error ? error.message : t("Only administrators can delete roles."),
      })
    } finally {
      setDeletingRoleId(null)
    }
  }

  async function handleToggleRolePermission(role: ApiAuthorizationRole, permissionValue: string) {
    if (!role.canEditPermissions || savingRoleId) return

    const hasPermission = role.permissionValues.includes(permissionValue)
    const permissionValues = hasPermission
      ? role.permissionValues.filter((value) => value !== permissionValue)
      : [...role.permissionValues, permissionValue]

    setSavingRoleId(role.id)

    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before changing role permissions."))

      const updatedRole = await updateApiRolePermissions(session.access_token, role.id, { permissionValues })
      setAuthorizationState((current) => current ? {
        ...current,
        roles: current.roles.map((item) => item.id === updatedRole.id ? updatedRole : item),
      } : current)
      toast.success(t("Role permissions saved"), { description: updatedRole.name })
    } catch (error) {
      toast.error(t("Role permissions could not be saved"), {
        description: error instanceof Error ? error.message : t("Check the permission selection and try again."),
      })
    } finally {
      setSavingRoleId(null)
    }
  }

  const roleOptions = authorizationState?.roles ?? []
  const selectedRole = roleOptions.find((role) => role.id === selectedRoleId) ?? roleOptions[0]
  const permissionGroups = authorizationState ? getPermissionGroups(authorizationState.permissions) : []

  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Roles & permissions"
        title="Roles & permissions"
        description="Review each role and the access it gives across shipments, customers, reports, users, and workspace settings."
        actions={compactAction("Refresh", () => void loadAuthorizationState())}
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="Role access" description="Choose a role, then turn individual permission lines on or off.">
          {authorizationError ? (
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--md-red)]">Authorization settings could not be loaded.</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{authorizationError}</p>
              <div className="mt-3">{compactAction("Retry", () => void loadAuthorizationState())}</div>
            </div>
          ) : loadingAuthorization ? (
            <div className="px-5 py-4">
              <div className="h-8 w-72 max-w-full rounded-full bg-[var(--md-surface-tint)]" />
              <div className="mt-4 divide-y divide-[rgba(11,20,19,0.07)]">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="grid gap-3 py-3 md:grid-cols-[20px_220px_minmax(0,1fr)_80px]">
                    <div className="size-4 rounded bg-[var(--md-surface-tint)]" />
                    <div className="h-3 rounded-full bg-[var(--md-surface-tint)]" />
                    <div className="h-3 rounded-full bg-[var(--md-surface-tint)]" />
                    <div className="h-5 rounded-full bg-[var(--md-surface-tint)]" />
                  </div>
                ))}
              </div>
            </div>
          ) : authorizationState && selectedRole ? (
            <>
              <SettingsFieldRow label="Role" description="Role changes affect every user assigned to that role.">
                <select
                  dir="auto"
                  aria-label={t("Role")}
                  className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)] sm:max-w-[360px]"
                  value={selectedRole.id}
                  onChange={(event) => setSelectedRoleId(event.target.value)}
                >
                  {roleOptions.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </SettingsFieldRow>
              <SettingsFieldRow label="Custom role" description="Creates a new editable role using the selected role as a starting point.">
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleCreateRole}>
                  <SettingsInput
                    value={customRoleName}
                    placeholder="Role name"
                    aria-label="Role name"
                    disabled={creatingRole}
                    onChange={(event) => setCustomRoleName(event.target.value)}
                  />
                  <Button
                    type="submit"
                    className="h-9 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-55"
                    disabled={creatingRole}
                  >
                    {creatingRole ? "Creating..." : "Create role"}
                  </Button>
                </form>
              </SettingsFieldRow>
              <div className="grid gap-3 px-5 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <p className="text-[13px] font-medium text-[var(--md-ink)]">{selectedRole.name}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{selectedRole.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <StatusPill tone={selectedRole.canEditPermissions ? "blue" : "neutral"}>{selectedRole.canEditPermissions ? "Editable" : "Protected"}</StatusPill>
                  <StatusPill tone="teal"><span data-i18n-skip dir="ltr">{selectedRole.permissionValues.length}</span> permissions</StatusPill>
                  {!selectedRole.isSystem ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 rounded-[var(--md-radius-md)] bg-[rgba(209,78,78,0.08)] px-3 text-[12px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)] disabled:opacity-55"
                      disabled={deletingRoleId === selectedRole.id}
                      onClick={() => void handleDeleteRole(selectedRole)}
                    >
                      {deletingRoleId === selectedRole.id ? "Deleting..." : "Delete role"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {permissionGroups.map((group) => (
                <div key={group.group}>
                  <div className="flex items-center justify-between gap-3 bg-[var(--md-surface-tint)] px-5 py-2">
                    <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--md-subtle)]">{group.group}</p>
                    <span className="text-[12px] font-medium text-[var(--md-text)]">
                      <span data-i18n-skip dir="ltr">{group.permissions.length}</span> permissions
                    </span>
                  </div>
                  <div className="divide-y divide-[rgba(11,20,19,0.07)]">
                    {group.permissions.map((permission) => {
                      const checked = selectedRole.permissionValues.includes(permission.value)
                      const disabled = !selectedRole.canEditPermissions || savingRoleId === selectedRole.id

                      return (
                        <label
                          key={permission.value}
                          className={cn(
                            "grid cursor-pointer gap-2 px-5 py-3 transition-colors hover:bg-[rgba(233,242,240,0.45)] md:grid-cols-[20px_minmax(190px,250px)_minmax(0,1fr)_auto] md:items-center",
                            disabled && "cursor-not-allowed opacity-65",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-[var(--md-accent)] md:mt-0"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => void handleToggleRolePermission(selectedRole, permission.value)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{permission.name}</span>
                            <span className="mt-0.5 block truncate text-[12px] font-medium text-[var(--md-accent)]" data-i18n-skip dir="ltr">{permission.value}</span>
                          </span>
                          <span className="text-[12px] leading-5 text-[var(--md-text)]">{permission.description}</span>
                          {permission.isDangerous ? <StatusPill tone="amber">Sensitive</StatusPill> : <span className="hidden md:block" />}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">No roles have been configured yet.</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">Run the latest API migration to create the authorization tables and default roles.</p>
            </div>
          )}
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
    [Cloud, "CargoWise", "Booking sync every 15 minutes. 1 warning needs mapping review.", "Review"],
    [ReceiptText, "Xero", "Invoices and credit-limit snapshots sync nightly.", "Connected"],
    [Globe2, "Customs broker portal", "Broker updates imported into booking timelines.", "Connected"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Organisation / Integrations"
        title="Integrations"
        description="Connect the systems operators already use so Multideck can pull context and push approved updates."
        actions={primaryAction("Add integration", () => toast.success("Integration picker opened"))}
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
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
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="API keys" description="Keys are shown once. Use scoped keys for customer portals and broker automations.">
          <IconRow icon={KeyRound} title="Production sync key" description="Read bookings, write milestones. Last used 8 minutes ago." right={<StatusPill tone="teal">Active</StatusPill>} />
          <IconRow icon={Braces} title="Customer portal key" description="Read tracking pages and quotes only. Last used today 05:41." right={<StatusPill tone="teal">Active</StatusPill>} />
          <IconRow icon={History} title="Legacy import key" description="No calls in 44 days. Rotate or remove before launch." right={<StatusPill tone="amber">Review</StatusPill>} />
        </SettingsPanel>
        <SettingsPanel title="Webhooks" description="Event delivery for downstream systems.">
          <SettingsFieldRow label="Booking updated">
            <SettingsInput defaultValue="https://ops.northwind.de/hooks/bookings" />
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
        description="Understand plan limits, Dexter usage, and the workspace costs that affect operating margin."
        actions={compactAction("Download invoices", () => toast.success("Invoices prepared"))}
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-[var(--md-page-stack-gap)]">
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
            <SettingsFieldRow label="Dexter spend guardrail">
              <SettingsSelect value="Warn at EUR 1,500/month" options={["Warn at EUR 750/month", "Warn at EUR 1,500/month", "Warn at EUR 3,000/month"]} />
            </SettingsFieldRow>
            <ToggleSetting title="Pause non-critical watchers at limit" description="High-risk booking and customs alerts still run." initialChecked />
          </SettingsPanel>
        </div>
        <SettingsSummaryCard
          title="This month"
          rows={[
            ["Dexter actions", "12,480"],
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
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
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
    ["Dexter approval rules", "Set approval thresholds by customer emails, bookings, data edits, and watcher changes.", "New"],
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
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
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
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-2">
        <SettingsPanel title="Guides" description="Short docs for common operational setup.">
          <IconRow icon={BookOpen} title="Build a customs hold workflow" description="Set watchers, approvals, broker sync, and owner notifications." right={compactAction("Open")} />
          <IconRow icon={BookOpen} title="Customer tracking pages" description="Share booking status safely without exposing internal comments." right={compactAction("Open")} />
          <IconRow icon={BookOpen} title="Import bookings by CSV" description="Prepare fields, map columns, and fix failed imports." right={compactAction("Open")} />
        </SettingsPanel>
        <SettingsPanel title="Keyboard shortcuts" description="Keep operators moving without menu hunting.">
          <SettingsFieldRow label="Command menu">
            <SettingsInput value="Cmd K" readOnly />
          </SettingsFieldRow>
          <SettingsFieldRow label="New booking">
            <SettingsInput value="N then S" readOnly />
          </SettingsFieldRow>
          <SettingsFieldRow label="Open Dexter">
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
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <SettingsPanel title="Request details" description="Include a booking ID or customer name when the issue is workflow-specific.">
          <SettingsFieldRow label="Topic">
            <SettingsSelect value="Dexter action review" options={["Dexter action review", "Booking sync issue", "Billing question", "Security concern", "Product feedback"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Priority">
            <ChoiceSetting options={["Normal", "High", "Urgent"]} initialValue="High" />
          </SettingsFieldRow>
          <SettingsFieldRow label="Message" align="start">
            <SettingsTextarea defaultValue="Dexter drafted a customer ETA note correctly, but the approval rule did not mention the value threshold. Please review our configuration." />
          </SettingsFieldRow>
          <SettingsFieldRow label="Attachment">
            <div className="flex flex-wrap gap-2">
              {compactAction("Attach screenshot")}
              {compactAction("Attach booking log")}
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
    case "agent-dexter":
      return <AgentDexterTab />
    case "team":
      return <TeamTab />
    case "permissions":
      return <PermissionsTab />
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
        <main className="min-w-0 px-[var(--md-page-pad)] py-[var(--md-page-pad)]">
          <div className="mx-auto max-w-[1120px] pb-[var(--md-page-bottom-pad)]">
            <TabContent activeTab={activeItem.id} />
          </div>
        </main>
      </div>
    </div>
  )
}
