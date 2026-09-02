import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Activity,
  ArrowLeft,
  Ban,
  BadgeCheck,
  Bell,
  BookOpen,
  Braces,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  ChartAnalysis,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  Cpu,
  CreditCard,
  Database,
  EditUser02,
  ExternalLink,
  FileText,
  Globe2,
  History,
  ImagePlus,
  Info,
  KeyRound,
  Laptop,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Megaphone,
  MessageCircle,
  MonitorSmartphone,
  Palette,
  Plus,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  TicketCheck,
  Trash2,
  Upload,
  UserRound,
  UserRoundCheck,
  Users,
  WandSparkles,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.png"
import sageLogo from "@/assets/integrations/sage.svg"
import xeroLogo from "@/assets/integrations/xero.svg"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { AccentPicker } from "@/components/multideck/accent-picker"
import { AiUsageOverview } from "@/components/multideck/ai-usage-overview"
import { AvailabilitySettingsPanel } from "@/components/multideck/availability-settings"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { AuthIdentityManager } from "@/components/multideck/auth-provider-selector"
import { CopyFeedbackTransition, CopyStatusIcon } from "@/components/multideck/copyable-field"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { KeyboardShortcutsPanel } from "@/components/multideck/keyboard-shortcuts-panel"
import { Pagination } from "@/components/multideck/pagination"
import { StatusPill } from "@/components/multideck/status-pill"
import { normalizeTagTerms, TagEntryField } from "@/components/multideck/tag-entry-field"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import { openSupportTicket } from "@/components/multideck/support-ticket-dialog"
import { CalendarConnectionSettings } from "@/components/multideck/calendar-connection-settings"
import { supportTicketFeatureEnabled } from "@/lib/support-ticket-feature"
import {
  createLegacySupportTicket,
  SupportTicketError,
  type LegacySupportTicketResponse,
} from "@/lib/support-ticket"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsIntegrationRow,
  SettingsOptionCard,
  SettingsPageHeader,
  SettingsPanel,
  SettingsProgressRing,
  SettingsSelect,
  SettingsSummaryCard,
  SettingsTextarea,
  SettingsToggleRow,
} from "@/components/multideck/settings-components"
import {
  getSettingsSection,
  readSettingsSectionFromUrl,
  settingsNavigationGroups,
  type SettingsSectionId,
} from "@/data/settings-navigation"
import { homeNavItem, inboxNavItem, sidebarAreas } from "@/data/navigation-data"
import { getLanguageOption, languageOptions } from "@/i18n/languages"
import { useLanguage } from "@/i18n/language-provider"
import {
  createApiAuthorizationRole,
  createApiDepartment,
  createApiTeamUser,
  deleteApiAuthorizationRole,
  deleteApiTeamUser,
  deleteApiTeamUserInvitation,
  getApiCurrentUser,
  getApiAuthorizationCatalogue,
  getApiTeamUsersPage,
  getApiTeamUserDeletionImpact,
  getApiTeamUserReplacementOptions,
  resendApiTeamUserInvitation,
  resetApiTeamUserPassword,
  updateApiTeamUser,
  updateApiTeamUserStatus,
  updateApiCurrentUserProfile,
  type ApiAuthorizationRole,
  type ApiAuthorizationState,
  type ApiInvitationExpiry,
  type ApiPermission,
  type ApiTeamUser,
  type ApiTeamUserDeletionImpact,
  type ApiTeamUsersPageResponse,
} from "@/lib/api"
import { getDexterUsage, getDexterUsageHistory, type DexterUsage, type DexterUsageEntry, type DexterUsageHistoryPage } from "@/lib/dexter-api"
import {
  consentToDexterWritingProfile,
  DexterWritingProfileError,
  getDexterWritingProfile,
  refreshDexterWritingProfile,
  resetDexterWritingProfile,
  updateDexterWritingProfile,
  type DexterWritingProfile,
} from "@/lib/dexter-writing-profile-api"
import { dexterModelPrices, estimateDexterModelCost } from "@/lib/dexter-costs"
import {
  addGmailGroupMailbox,
  addOutlookSharedMailbox,
  authorizeInboxProvider,
  disconnectInboxConnection,
  listInboxConnections,
  listInboxProviders,
  listMailboxes,
  readEmailConnectionResult,
  resolveDefaultInboxProvider,
  syncMailbox,
  type InboxConnection,
  type InboxProviderAvailability,
  type MailProvider,
  type Mailbox,
} from "@/lib/inbox-api"
import {
  loadDefaultInboxProvider,
  saveDefaultInboxProvider,
} from "@/lib/inbox-provider-preference"
import { useShortcutBinding } from "@/lib/keyboard-shortcuts"
import {
  readPreferredMicrophone,
  savePreferredMicrophone,
  systemDefaultMicrophone,
} from "@/lib/dictation-preferences"
import {
  getTranscriptionPreferences,
  saveTranscriptionPreferences,
  TranscriptionError,
} from "@/lib/transcription-api"
import { DEXTER_CONVERSATIONS_CHANGED_EVENT } from "@/lib/dexter-navigation"
import { clockDisplayLabelFromMode, clockDisplayLabels, clockDisplayModeFromLabel, readClockDisplayMode, useAiAgentName, writeAiAgentName, writeClockDisplayMode } from "@/lib/user-preferences"
import type { AuthUserSummary } from "@/lib/auth-user"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_DESCRIPTION, getPasswordPolicyError, passwordMeetsPolicy } from "@/lib/password-policy"
import { getSupabaseSession, supabase } from "@/lib/supabase"
import {
  ProfilePhotoValidationError,
  createProfilePhotoSignedUrl,
  createProfilePhotoSignedUrls,
  loadCurrentUserCoverPhoto,
  loadCurrentUserProfilePhoto,
  profilePhotoAcceptedTypes,
  removeCurrentUserCoverPhoto,
  removeCurrentUserProfilePhoto,
  uploadCurrentUserCoverPhoto,
  uploadCurrentUserProfilePhoto,
  type UserProfilePhoto,
} from "@/lib/profile-photo"
import {
  defaultNotificationEmailPreferences,
  loadNotificationEmailPreferences,
  saveNotificationEmailPreferences,
  sendNotificationTestEmail,
  type NotificationEmailPreferences,
  type NotificationEventType,
} from "@/lib/notification-preferences"
import { mdMotion, reduceMotion, staggerRamp } from "@/lib/motion"
import { defaultCoverPhotoUrl } from "@/lib/default-cover-photo"
import { cn } from "@/lib/utils"

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
      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
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
  activeTab: SettingsSectionId
  onChange: (tab: SettingsSectionId) => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const active = getSettingsSection(activeTab)
  const ActiveIcon = active.icon

  return (
    <div className="sticky top-0 z-30 bg-[color-mix(in_srgb,var(--md-bg)_86%,transparent)] px-4 py-3 shadow-[var(--md-stroke-bottom)] backdrop-blur-xl lg:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background-color,color,scale] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:active:scale-100"
          aria-label={t("Back to all areas")}
          onClick={onBack}
        >
          <ChevronRight className="size-4 rotate-180 rtl:rotate-0" strokeWidth={1.4} aria-hidden="true" />
        </button>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("Settings section")}</span>
          <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center">
            <ActiveIcon className="size-4 text-[var(--md-accent)]" strokeWidth={1.3} aria-hidden="true" />
          </span>
          <select
            value={activeTab}
            aria-label={t("Settings section")}
            className="h-10 w-full appearance-none rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] ps-10 pe-10 text-[16px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
            onChange={(event) => onChange(event.target.value as SettingsSectionId)}
          >
            {settingsNavigationGroups.map((group) => (
              <optgroup key={group.label} label={t(group.label)}>
                {group.items.map((item) => <option key={item.id} value={item.id}>{item.id === "dexter" ? aiAgentName : t(item.label)}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronRight className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
        </label>
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
  description = "Choose the language and regional format Multideck uses across the app.",
}: {
  label?: string
  description?: string
}) {
  const { language, setLanguage } = useLanguage()
  const selectedLanguage = getLanguageOption(language)
  const languageLabels = languageOptions.map((option) => `${option.label} - ${option.nativeLabel}`)
  const selectedLabel = `${selectedLanguage.label} - ${selectedLanguage.nativeLabel}`

  return (
    <SettingsFieldRow label={label} description={description}>
      <SettingsSelect
        value={selectedLabel}
        options={languageLabels}
        ariaLabel="App language"
        onChange={(nextLabel) => {
          const nextLanguage = languageOptions.find((option) => nextLabel.startsWith(option.label))
          if (nextLanguage) setLanguage(nextLanguage.code)
        }}
      />
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
  website: string
  roleTitle: string
}

const emptyProfileForm: ProfileFormState = {
  firstName: "",
  lastName: "",
  preferredName: "",
  email: "",
  phone: "",
  website: "",
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
    website: readProfileMetadataValue(metadata, ["website", "website_url"]),
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

type ProfileMediaUrls = {
  profilePhotoPath: string | null
  profilePhotoUrl: string | null
  coverPhotoPath: string | null
  coverPhotoUrl: string | null
}

function ProfileTab({
  currentUser,
  profileMediaUrls,
  onProfilePhotoChange,
  onCoverPhotoChange,
}: {
  currentUser?: AuthUserSummary | null
  profileMediaUrls: ProfileMediaUrls
  onProfilePhotoChange: (photo: UserProfilePhoto | null, photoUrl: string | null) => void
  onCoverPhotoChange: (photo: UserProfilePhoto | null) => void
}) {
  const { t } = useLanguage()
  const [profile, setProfile] = useState<ProfileFormState>(emptyProfileForm)
  const [savedProfile, setSavedProfile] = useState<ProfileFormState>(emptyProfileForm)
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const initialProfilePhoto = currentUser?.profilePhoto ?? null
  const initialCoverPhoto = currentUser?.coverPhoto ?? null
  const initialProfilePhotoUrl = profileMediaUrls.profilePhotoPath === initialProfilePhoto?.path
    ? profileMediaUrls.profilePhotoUrl
    : null
  const initialCoverPhotoUrl = profileMediaUrls.coverPhotoPath === initialCoverPhoto?.path
    ? profileMediaUrls.coverPhotoUrl
    : null
  const [profilePhoto, setProfilePhoto] = useState<UserProfilePhoto | null>(initialProfilePhoto)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(initialProfilePhotoUrl)
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(null)
  const [profilePhotoOperation, setProfilePhotoOperation] = useState<"loading" | "idle" | "uploading" | "removing">(
    initialProfilePhotoUrl ? "idle" : "loading",
  )
  const [profilePhotoDialogOpen, setProfilePhotoDialogOpen] = useState(false)
  const [coverPhoto, setCoverPhoto] = useState<UserProfilePhoto | null>(initialCoverPhoto)
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(initialCoverPhotoUrl)
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null)
  const [coverPhotoOperation, setCoverPhotoOperation] = useState<"loading" | "idle" | "uploading" | "removing">(
    initialCoverPhotoUrl ? "idle" : "loading",
  )
  const profilePhotoInputRef = useRef<HTMLInputElement>(null)
  const coverPhotoInputRef = useRef<HTMLInputElement>(null)
  const profileDirty = JSON.stringify(profile) !== JSON.stringify(savedProfile)
  const profileInitials = getProfileInitials(profile)
  const fullName = getProfileFullName(profile)
  const profilePhotoBusy = profilePhotoOperation !== "idle"
  const coverPhotoBusy = coverPhotoOperation !== "idle"

  useEffect(() => {
    if (initialProfilePhoto) setProfilePhoto(initialProfilePhoto)
    if (initialProfilePhotoUrl) {
      setProfilePhotoUrl(initialProfilePhotoUrl)
      setProfilePhotoOperation("idle")
    }
  }, [initialProfilePhoto, initialProfilePhotoUrl])

  useEffect(() => {
    if (initialCoverPhoto) setCoverPhoto(initialCoverPhoto)
    if (initialCoverPhotoUrl) {
      setCoverPhotoUrl(initialCoverPhotoUrl)
      setCoverPhotoOperation("idle")
    }
  }, [initialCoverPhoto, initialCoverPhotoUrl])

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

  useEffect(() => {
    if (!supabase) {
      setProfilePhotoOperation("idle")
      return
    }

    let cancelled = false

    async function loadProfilePhoto() {
      try {
        const nextPhoto = await loadCurrentUserProfilePhoto()
        if (cancelled) return

        setProfilePhoto(nextPhoto)
        setProfilePhotoError(null)

        if (nextPhoto) {
          try {
            const nextUrl = await createProfilePhotoSignedUrl(nextPhoto)
            if (!cancelled) {
              setProfilePhotoUrl(nextUrl)
              onProfilePhotoChange(nextPhoto, nextUrl)
            }
          } catch (error) {
            console.error(error)
            if (!cancelled) {
              onProfilePhotoChange(nextPhoto, null)
              setProfilePhotoError(t("Photo saved, but its preview could not load."))
            }
          }
        } else {
          setProfilePhotoUrl(null)
          onProfilePhotoChange(null, null)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setProfilePhotoError(t("Could not load profile photo."))
      } finally {
        if (!cancelled) setProfilePhotoOperation("idle")
      }
    }

    void loadProfilePhoto()
    return () => {
      cancelled = true
    }
  }, [onProfilePhotoChange, t])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    async function loadDatabaseProfile() {
      try {
        const session = await getSupabaseSession()
        if (!session) throw new Error("Sign in again to load your profile.")

        const currentUser = await getApiCurrentUser(session.access_token)
        if (cancelled) return

        const savedJobTitle = currentUser.jobTitle ?? ""
        setProfile((current) => ({ ...current, roleTitle: savedJobTitle }))
        setSavedProfile((current) => ({ ...current, roleTitle: savedJobTitle }))
      } catch (error) {
        console.error(error)
      }
    }

    void loadDatabaseProfile()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setCoverPhotoOperation("idle")
      return
    }

    let cancelled = false

    async function loadCoverPhoto() {
      try {
        const nextPhoto = await loadCurrentUserCoverPhoto()
        if (cancelled) return

        setCoverPhoto(nextPhoto)
        onCoverPhotoChange(nextPhoto)
        setCoverPhotoError(null)

        if (nextPhoto) {
          try {
            const nextUrl = await createProfilePhotoSignedUrl(nextPhoto)
            if (!cancelled) setCoverPhotoUrl(nextUrl)
          } catch (error) {
            console.error(error)
            if (!cancelled) setCoverPhotoError(t("Cover photo saved, but its preview could not load."))
          }
        } else {
          setCoverPhotoUrl(null)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) setCoverPhotoError(t("Could not load cover photo."))
      } finally {
        if (!cancelled) setCoverPhotoOperation("idle")
      }
    }

    void loadCoverPhoto()
    return () => {
      cancelled = true
    }
  }, [onCoverPhotoChange, t])

  function updateProfileField(field: keyof ProfileFormState, value: string) {
    setProfile((current) => ({ ...current, [field]: value }))
  }

  function discardProfileChanges() {
    setProfile(savedProfile)
    toast.info("Changes discarded")
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
          website: profile.website.trim(),
          role_title: profile.roleTitle.trim(),
        },
      })

      if (error) throw error

      const session = await getSupabaseSession()
      if (!session) throw new Error("Sign in again before saving your profile.")
      const savedUser = await updateApiCurrentUserProfile(session.access_token, {
        jobTitle: profile.roleTitle.trim() || null,
      })

      const nextProfile = data.user ? createProfileFormFromUser(data.user) : profile
      nextProfile.roleTitle = savedUser.jobTitle ?? ""
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

  async function changeProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || profilePhotoBusy) return

    setProfilePhotoOperation("uploading")
    setProfilePhotoError(null)

    try {
      const nextPhoto = await uploadCurrentUserProfilePhoto(file, profilePhoto)
      setProfilePhoto(nextPhoto)

      try {
        const nextUrl = await createProfilePhotoSignedUrl(nextPhoto)
        setProfilePhotoUrl(nextUrl)
        onProfilePhotoChange(nextPhoto, nextUrl)
        toast.success(t("Profile photo updated"))
      } catch (error) {
        console.error(error)
        setProfilePhotoUrl(null)
        onProfilePhotoChange(nextPhoto, null)
        const message = t("Photo saved, but its preview could not load.")
        setProfilePhotoError(message)
        toast.warning(message)
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof ProfilePhotoValidationError
        ? t(error.message)
        : t("Could not update profile photo.")
      setProfilePhotoError(message)
      toast.error(message)
    } finally {
      setProfilePhotoOperation("idle")
    }
  }

  async function removeProfilePhoto() {
    if (!profilePhoto || profilePhotoBusy) return

    setProfilePhotoOperation("removing")
    setProfilePhotoError(null)

    try {
      const { storageCleanupPending } = await removeCurrentUserProfilePhoto(profilePhoto)
      setProfilePhoto(null)
      setProfilePhotoUrl(null)
      onProfilePhotoChange(null, null)

      if (storageCleanupPending) {
        const message = t("Photo removed, but storage cleanup needs retry.")
        setProfilePhotoError(message)
        toast.warning(message)
      } else {
        toast.success(t("Profile photo removed"))
      }
    } catch (error) {
      console.error(error)
      const message = t("Could not remove profile photo.")
      setProfilePhotoError(message)
      toast.error(message)
    } finally {
      setProfilePhotoOperation("idle")
    }
  }

  async function changeCoverPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || coverPhotoBusy) return

    setCoverPhotoOperation("uploading")
    setCoverPhotoError(null)

    try {
      const nextPhoto = await uploadCurrentUserCoverPhoto(file, coverPhoto)
      setCoverPhoto(nextPhoto)
      onCoverPhotoChange(nextPhoto)

      try {
        setCoverPhotoUrl(await createProfilePhotoSignedUrl(nextPhoto))
        toast.success(t("Cover photo updated"))
      } catch (error) {
        console.error(error)
        setCoverPhotoUrl(null)
        const message = t("Cover photo saved, but its preview could not load.")
        setCoverPhotoError(message)
        toast.warning(message)
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof ProfilePhotoValidationError
        ? t(error.message)
        : t("Could not update cover photo.")
      setCoverPhotoError(message)
      toast.error(message)
    } finally {
      setCoverPhotoOperation("idle")
    }
  }

  async function removeCoverPhoto() {
    if (!coverPhoto || coverPhotoBusy) return

    setCoverPhotoOperation("removing")
    setCoverPhotoError(null)

    try {
      const { storageCleanupPending } = await removeCurrentUserCoverPhoto(coverPhoto)
      setCoverPhoto(null)
      setCoverPhotoUrl(null)
      onCoverPhotoChange(null)

      if (storageCleanupPending) {
        const message = t("Cover photo removed, but storage cleanup needs retry.")
        setCoverPhotoError(message)
        toast.warning(message)
      } else {
        toast.success(t("Cover photo removed"))
      }
    } catch (error) {
      console.error(error)
      const message = t("Could not remove cover photo.")
      setCoverPhotoError(message)
      toast.error(message)
    } finally {
      setCoverPhotoOperation("idle")
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[960px] space-y-[var(--md-page-stack-gap)]">
        <section className="overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
          <input
            ref={coverPhotoInputRef}
            type="file"
            className="sr-only"
            accept={profilePhotoAcceptedTypes.join(",")}
            aria-label={t("Choose a cover photo")}
            aria-describedby="cover-photo-status"
            disabled={coverPhotoBusy}
            onChange={(event) => void changeCoverPhoto(event)}
          />
          <input
            ref={profilePhotoInputRef}
            type="file"
            className="sr-only"
            accept={profilePhotoAcceptedTypes.join(",")}
            aria-label={t("Choose a profile photo")}
            aria-describedby="profile-photo-status"
            disabled={profilePhotoBusy}
            onChange={(event) => void changeProfilePhoto(event)}
          />

          <div className="group/cover relative h-[190px] overflow-hidden bg-[color-mix(in_srgb,var(--md-accent)_10%,var(--md-surface-soft))] sm:h-[230px]">
            {coverPhotoUrl || !coverPhoto ? (
              <img src={coverPhotoUrl ?? defaultCoverPhotoUrl} alt="" className="size-full object-cover" loading="eager" fetchPriority="high" decoding="async" />
            ) : (
              <div
                className="absolute inset-0 opacity-55"
                aria-hidden="true"
                style={{
                  backgroundImage: "radial-gradient(circle at 22% 20%, color-mix(in srgb, var(--md-accent) 24%, transparent), transparent 30%), radial-gradient(circle at 78% 80%, color-mix(in srgb, var(--md-accent) 14%, transparent), transparent 34%)",
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" aria-hidden="true" />
            <div className="absolute end-4 top-4 flex items-center gap-2">
              {coverPhoto ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-[var(--md-radius-lg)] bg-black/45 text-white opacity-0 shadow-[var(--md-shadow-line)] backdrop-blur-md transition-opacity hover:bg-black/60 focus-visible:opacity-100 group-hover/cover:opacity-100"
                  aria-label={t("Remove cover photo")}
                  disabled={coverPhotoBusy}
                  onClick={() => void removeCoverPhoto()}
                >
                  {coverPhotoOperation === "removing" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Trash2 className="size-4" strokeWidth={1.4} />}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 rounded-[var(--md-radius-lg)] bg-black/45 px-3 text-[13px] font-medium text-white shadow-[var(--md-shadow-line)] backdrop-blur-md transition-opacity hover:bg-black/60 focus-visible:opacity-100",
                  coverPhoto ? "opacity-0 group-hover/cover:opacity-100" : "opacity-100",
                )}
                disabled={coverPhotoBusy}
                onClick={() => coverPhotoInputRef.current?.click()}
              >
                {coverPhotoOperation === "uploading" ? (
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-4" strokeWidth={1.4} aria-hidden="true" />
                )}
                {t(coverPhotoOperation === "uploading" ? "Uploading..." : coverPhoto ? "Change cover" : "Add cover")}
              </Button>
            </div>
          </div>

          <div className="relative -mt-[54px] flex flex-col items-center px-5 pb-7 text-center sm:px-7">
            <button
              type="button"
              className="group/avatar relative rounded-full focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[var(--md-accent-a14)]"
              aria-label={t("Edit profile photo")}
              aria-haspopup="dialog"
              aria-busy={profilePhotoBusy}
              onClick={() => setProfilePhotoDialogOpen(true)}
            >
              <Avatar className="size-[108px] rounded-full bg-[var(--md-surface)] p-[4px] shadow-[0_10px_32px_rgba(11,20,19,0.18)]">
                {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt="" className="rounded-full object-cover" loading="eager" fetchPriority="high" /> : null}
                <AvatarFallback
                  className="rounded-full bg-[var(--md-accent)] text-[28px] font-medium text-[var(--md-accent-ink)]"
                  data-i18n-skip
                >
                  {profilePhotoOperation === "loading" ? (
                    <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : profileInitials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-[4px] grid place-items-center rounded-full bg-black/42 text-white opacity-0 backdrop-blur-[2px] transition-opacity group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100">
                <Camera className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </span>
            </button>

            <h1 className="mt-3 text-[22px] font-medium tracking-[-0.025em] text-[var(--md-ink)]" dir="auto" data-i18n-skip>
              {fullName || profile.email || t("Your profile")}
            </h1>
            <p className="mt-1 min-h-5 text-[13px] text-[var(--md-text)]" dir="auto" data-i18n-skip={profile.roleTitle ? true : undefined}>
              {profile.roleTitle || t("Add your job title below")}
            </p>
            <p
              id="profile-photo-status"
              role={profilePhotoError ? "alert" : "status"}
              aria-live="polite"
              className={cn("mt-2 min-h-5 text-[12px] leading-5", profilePhotoError ? "text-[var(--md-red)]" : "sr-only")}
            >
              {profilePhotoError ?? t("Profile photo ready")}
            </p>
            <p
              id="cover-photo-status"
              role={coverPhotoError ? "alert" : "status"}
              aria-live="polite"
              className={cn("min-h-5 text-[12px] leading-5", coverPhotoError ? "text-[var(--md-red)]" : "sr-only")}
            >
              {coverPhotoError ?? t("Cover photo ready")}
            </p>
          </div>
        </section>

        <SettingsPanel title={t("Account details")} description={t("Your contact details and the job title shown with your account.")}>
            <SettingsFieldRow label="Name">
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsInput
                value={profile.firstName}
                aria-label="First name"
                autoComplete="given-name"
                placeholder="First name"
                disabled={isProfileLoading || isProfileSaving}
                onChange={(event) => updateProfileField("firstName", event.target.value)}
              />
              <SettingsInput
                value={profile.lastName}
                aria-label="Last name"
                autoComplete="family-name"
                placeholder="Last name"
                disabled={isProfileLoading || isProfileSaving}
                onChange={(event) => updateProfileField("lastName", event.target.value)}
              />
            </div>
            </SettingsFieldRow>
            <SettingsFieldRow label="Preferred name" description="What Dexter and your team call you.">
            <SettingsInput
              value={profile.preferredName}
              aria-label="Preferred name"
              autoComplete="nickname"
              placeholder="Preferred name"
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("preferredName", event.target.value)}
            />
            </SettingsFieldRow>
            <SettingsFieldRow label="Work email">
            <div className="relative">
              <SettingsInput value={profile.email} aria-label="Work email" autoComplete="email" className="pe-24" dir="ltr" data-i18n-skip disabled />
              <span className="absolute end-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[11px] font-medium text-[var(--md-green)]">
                <BadgeCheck className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                verified
              </span>
            </div>
            </SettingsFieldRow>
            <SettingsFieldRow label={t("Phone")} description={t("Used where you choose to share your contact details.")}>
            <SettingsInput
              value={profile.phone}
              aria-label="Phone"
              autoComplete="tel"
              type="tel"
              placeholder="+44 20 7123 4567"
              dir="ltr"
              data-i18n-skip
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("phone", event.target.value)}
            />
            </SettingsFieldRow>
            <SettingsFieldRow label={t("Website")} description={t("Shown on contact cards when you choose to share it.")}>
            <SettingsInput
              value={profile.website}
              aria-label={t("Website")}
              autoComplete="url"
              type="url"
              placeholder="https://example.com"
              dir="ltr"
              data-i18n-skip
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("website", event.target.value)}
            />
            </SettingsFieldRow>
            <SettingsFieldRow label={t("Job title")} description={t("Shown beneath your name across Multideck.")}>
            <SettingsInput
              value={profile.roleTitle}
              aria-label={t("Job title")}
              autoComplete="organization-title"
              placeholder={t("Operations Manager")}
              maxLength={120}
              disabled={isProfileLoading || isProfileSaving}
              onChange={(event) => updateProfileField("roleTitle", event.target.value)}
            />
            </SettingsFieldRow>
            <div className="flex flex-col-reverse gap-2 border-t border-[color-mix(in_srgb,var(--md-ink)_7%,transparent)] px-5 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                disabled={!profileDirty || isProfileSaving}
                className="h-10 rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
                onClick={discardProfileChanges}
              >
                {t("Discard")}
              </Button>
              <Button
                type="button"
                disabled={isProfileLoading || isProfileSaving || !profileDirty}
                className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-55"
                onClick={() => void saveProfileChanges()}
              >
                {isProfileSaving ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {t(isProfileSaving ? "Saving changes" : "Save changes")}
              </Button>
            </div>
        </SettingsPanel>

        <SettingsPanel title="Account control" description="Export your account history or start a reviewed deletion request.">
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

      <Dialog open={profilePhotoDialogOpen} onOpenChange={setProfilePhotoDialogOpen}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[420px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("Profile photo")}</DialogTitle>
            <DialogDescription>{t("Edit or remove the photo shown with your account.")}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Avatar className="size-[152px] rounded-full bg-[var(--md-surface-soft)] p-[4px] shadow-[var(--md-shadow-line)]">
              {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt="" className="rounded-full object-cover" /> : null}
              <AvatarFallback className="rounded-full bg-[var(--md-accent)] text-[38px] font-medium text-[var(--md-accent-ink)]" data-i18n-skip>
                {profileInitials}
              </AvatarFallback>
            </Avatar>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
              disabled={profilePhotoBusy}
              onClick={() => {
                setProfilePhotoDialogOpen(false)
                profilePhotoInputRef.current?.click()
              }}
            >
              {profilePhotoOperation === "uploading" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Upload className="size-4" strokeWidth={1.4} />}
              {t("Edit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)]"
              disabled={!profilePhoto || profilePhotoBusy}
              onClick={() => {
                setProfilePhotoDialogOpen(false)
                void removeProfilePhoto()
              }}
            >
              {profilePhotoOperation === "removing" ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Trash2 className="size-4" strokeWidth={1.4} />}
              {t("Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AvailabilityTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Personal / Availability"
        title="Availability"
        description="Set when people can book time with you, including your normal week, date exceptions, and booking rules."
      />
      <AvailabilitySettingsPanel
        id="availability-settings"
        title="Working hours and booking rules"
        className="mt-[var(--md-page-stack-gap)]"
      />
    </>
  )
}

type TotpEnrollment = {
  id: string
  qrCode: string
  secret: string
}

function TwoFactorControl({
  onFactorStatusChange,
}: {
  onFactorStatusChange?: (enabled: boolean | null) => void
}) {
  const { t } = useLanguage()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [verificationCode, setVerificationCode] = useState("")
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "enrolling" | "verifying" | "removing">("loading")

  async function refreshFactors() {
    if (!supabase) {
      onFactorStatusChange?.(null)
      setStatus("ready")
      return
    }

    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const verifiedFactor = data.totp.find((factor) => factor.status === "verified")
      setFactorId(verifiedFactor?.id ?? null)
      onFactorStatusChange?.(Boolean(verifiedFactor))
    } catch (error) {
      console.error("Two-factor status could not be loaded.", error)
      onFactorStatusChange?.(null)
    } finally {
      setStatus("ready")
    }
  }

  useEffect(() => {
    void refreshFactors()
  }, [])

  async function beginEnrollment() {
    if (!supabase || status !== "ready") return
    setStatus("enrolling")
    setVerificationError(null)

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Multideck authenticator",
      })
      if (error) throw error
      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
    } catch (error) {
      console.error("Two-factor setup could not start.", error)
      toast.error(t("Two-factor setup could not start"), {
        description: error instanceof Error ? error.message : t("Check your workspace authentication settings and try again."),
      })
    } finally {
      setStatus("ready")
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !enrollment || status !== "ready") return
    const code = verificationCode.replace(/\s/g, "")

    if (!/^\d{6}$/.test(code)) {
      setVerificationError(t("Enter the 6-digit code from your authenticator app."))
      return
    }

    setStatus("verifying")
    setVerificationError(null)

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.id,
        challengeId: challenge.id,
        code,
      })
      if (verifyError) throw verifyError
      setFactorId(enrollment.id)
      onFactorStatusChange?.(true)
      setEnrollment(null)
      setVerificationCode("")
      toast.success(t("Two-factor authentication is on"))
    } catch (error) {
      console.error("Two-factor setup could not be verified.", error)
      setVerificationError(t("That code could not be verified. Check the authenticator and try again."))
    } finally {
      setStatus("ready")
    }
  }

  async function removeFactor() {
    if (!supabase || !factorId || status !== "ready") return
    if (!window.confirm(t("Turn off two-factor authentication for this account?"))) return
    setStatus("removing")

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      setFactorId(null)
      onFactorStatusChange?.(false)
      toast.success(t("Two-factor authentication is off"))
    } catch (error) {
      console.error("Two-factor authentication could not be removed.", error)
      toast.error(t("Two-factor authentication could not be removed"), {
        description: error instanceof Error ? error.message : t("Try again in a moment."),
      })
    } finally {
      setStatus("ready")
    }
  }

  async function cancelEnrollment() {
    if (!supabase || !enrollment || status !== "ready") return
    setStatus("removing")

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: enrollment.id })
      if (error) throw error
      setEnrollment(null)
      setVerificationCode("")
      setVerificationError(null)
    } catch (error) {
      console.error("Two-factor setup could not be cancelled.", error)
      toast.error(t("Two-factor setup could not be cancelled"), {
        description: error instanceof Error ? error.message : t("Try again in a moment."),
      })
    } finally {
      setStatus("ready")
    }
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-24 items-center gap-3 px-5 py-4" aria-busy="true">
        <LoaderCircle className="size-4 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" />
        <p className="text-[13px] text-[var(--md-text)]">{t("Checking two-factor authentication")}</p>
      </div>
    )
  }

  if (enrollment) {
    return (
      <div className="grid gap-5 px-5 py-5 md:grid-cols-[164px_minmax(0,1fr)]">
        <div className="rounded-[var(--md-radius-xl)] bg-white p-3 shadow-[var(--md-shadow-line)]">
          <img
            src={enrollment.qrCode}
            alt={t("QR code for two-factor authentication")}
            className="aspect-square w-full rounded-[var(--md-radius-md)] outline outline-1 -outline-offset-1 outline-black/10"
          />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Connect an authenticator app")}</h3>
          <p className="mt-1 max-w-[58ch] text-pretty text-[13px] leading-5 text-[var(--md-text)]">
            {t("Scan the QR code, then enter the current 6-digit code to finish setup.")}
          </p>
          <p className="mt-3 text-[11px] font-medium text-[var(--md-subtle)]">{t("Manual setup key")}</p>
          <code className="mt-1 block overflow-x-auto rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2 text-[12px] text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
            {enrollment.secret}
          </code>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={verifyEnrollment}>
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="settings-totp-code">{t("Authenticator code")}</label>
              <SettingsInput
                id="settings-totp-code"
                value={verificationCode}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                aria-invalid={verificationError ? true : undefined}
                aria-describedby={verificationError ? "settings-totp-error" : undefined}
                data-i18n-skip
                onChange={(event) => setVerificationCode(event.target.value)}
              />
              {verificationError ? <p id="settings-totp-error" className="mt-1 text-[12px] leading-5 text-[var(--md-red)]">{verificationError}</p> : null}
            </div>
            <Button type="submit" disabled={status === "verifying"} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)]">
              {status === "verifying" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {status === "verifying" ? t("Verifying code") : t("Verify and enable")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={status !== "ready"}
              className="h-10 rounded-[var(--md-radius-lg)] px-3"
              onClick={() => void cancelEnrollment()}
            >
              {t("Cancel")}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center">
      <div className={cn(
        "grid size-10 place-items-center rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]",
        factorId ? "bg-[var(--md-accent-a10)] text-[var(--md-green)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]",
      )}>
        <LockKeyhole className="size-4" strokeWidth={1.4} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-medium text-[var(--md-ink)]">{t("Authenticator app")}</h3>
          <StatusPill tone={factorId ? "teal" : "neutral"}>{factorId ? t("Protected") : t("Not configured")}</StatusPill>
        </div>
        <p className="mt-1 max-w-[62ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]">
          {factorId
            ? t("A time-based code is required when Multideck asks for an extra identity check.")
            : t("Add a second step for new devices and sensitive account changes.")}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={status !== "ready"}
        className={cn(
          "h-9 w-fit rounded-[var(--md-radius-lg)] px-4 text-[13px] font-medium shadow-[var(--md-shadow-line)]",
          factorId
            ? "bg-[rgba(209,78,78,0.07)] text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)]"
            : "bg-[var(--md-surface-soft)] text-[var(--md-ink)] hover:bg-[var(--md-hover)]",
        )}
        onClick={() => factorId ? void removeFactor() : void beginEnrollment()}
      >
        {status === "enrolling" || status === "removing" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {factorId ? t("Turn off 2FA") : t("Set up 2FA")}
      </Button>
    </div>
  )
}

function SecurityTab() {
  const { t } = useLanguage()
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null)
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null)
  const securityPosture = (emailVerified ? 50 : 0) + (mfaEnabled ? 50 : 0)

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error("Email verification status could not be loaded.", error)
        return
      }
      setEmailVerified(Boolean(data.user?.email_confirmed_at))
    })
  }, [])

  async function sendPasswordReset() {
    if (!supabase || passwordResetBusy) return
    setPasswordResetBusy(true)

    try {
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!data.user?.email) throw new Error(t("No email address is attached to this account."))
      const { error } = await supabase.auth.resetPasswordForEmail(data.user.email, {
        redirectTo: `${window.location.origin}/auth?mode=reset-password`,
      })
      if (error) throw error
      toast.success(t("Password reset email sent"), {
        description: t("Use the secure link in your inbox to choose a new password."),
      })
    } catch (error) {
      console.error("The password reset email could not be sent.", error)
      toast.error(t("Password reset email could not be sent"), {
        description: error instanceof Error ? error.message : t("Try again in a moment."),
      })
    } finally {
      setPasswordResetBusy(false)
    }
  }

  async function signOutOtherSessions() {
    if (!supabase || signOutBusy) return
    setSignOutBusy(true)

    try {
      const { error } = await supabase.auth.signOut({ scope: "others" })
      if (error) throw error
      toast.success(t("Other sessions signed out"))
    } catch (error) {
      console.error("Other sessions could not be signed out.", error)
      toast.error(t("Other sessions could not be signed out"), {
        description: error instanceof Error ? error.message : t("Try again in a moment."),
      })
    } finally {
      setSignOutBusy(false)
    }
  }

  return (
    <>
      <SettingsPageHeader
        eyebrow="Personal / Security"
        title="Security"
        description="Protect live freight data with strong sign-in methods, two-factor authentication, and clear session control."
        actions={
          <Button
            type="button"
            variant="ghost"
            disabled={passwordResetBusy}
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
            onClick={() => void sendPasswordReset()}
          >
            {passwordResetBusy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <KeyRound className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}
            {passwordResetBusy ? "Sending reset email" : "Reset password"}
          </Button>
        }
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-[var(--md-page-stack-gap)]">
          <SettingsPanel title="Two-factor authentication" description="Use a time-based authenticator code for a stronger second step.">
            <TwoFactorControl onFactorStatusChange={setMfaEnabled} />
          </SettingsPanel>
        <SettingsPanel title="Sign-in methods" description="Your account is created by a Multideck administrator. Connect optional identities here for future sign-ins.">
          <AuthIdentityManager embedded />
        </SettingsPanel>
          <SettingsPanel title="Session control" description="The current browser remains signed in; every other active session can be revoked together.">
            <IconRow
              icon={Laptop}
              title="This browser"
              description={`${navigator.platform || "Current device"} · active now`}
              right={<StatusPill tone="teal">Current</StatusPill>}
            />
            <SettingsFieldRow label="Other sessions" description="Sign out phones, tablets, and browsers without closing this session.">
              <Button
                type="button"
                variant="ghost"
                disabled={signOutBusy}
                className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
                onClick={() => void signOutOtherSessions()}
              >
                {signOutBusy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {signOutBusy ? "Signing out sessions" : "Sign out other sessions"}
              </Button>
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
        <aside className="space-y-[var(--md-page-stack-gap)] xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <section className="rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
            <SettingsProgressRing
              value={securityPosture}
              label="Security posture"
              detail={securityPosture === 100 ? "Email verification and two-factor protection are active." : "Complete the checks below to strengthen this account."}
              tone={securityPosture === 100 ? "green" : "amber"}
            />
            <div className="mt-5 space-y-2">
              {[
                [ShieldCheck, "Email verified", emailVerified === null ? "Checking" : emailVerified ? "Protected" : "Needs review"],
                [LockKeyhole, "Two-factor", mfaEnabled === null ? "Checking" : mfaEnabled ? "Protected" : "Not configured"],
                [MonitorSmartphone, "Session control", "Available"],
              ].map(([Icon, label, value]) => (
                <div key={label as string} className="flex items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5">
                  <Icon className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-text)]">{label as string}</span>
                  <span className="text-end text-[11px] font-medium text-[var(--md-ink)]">{value as string}</span>
                </div>
              ))}
            </div>
          </section>
          <SettingsPanel title="Recovery" description="Password recovery links are single-use and expire.">
            <IconRow icon={Mail} title="Recovery email" description="Sent to your verified workspace email." right={compactAction("Send", () => void sendPasswordReset())} />
          </SettingsPanel>
        </aside>
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

type StartPageOption = { route: string; label: string }
type StartPageGroup = { label: string; options: StartPageOption[] }

const startPageExtras: Record<string, StartPageOption[]> = {
  "sales-crm": [
    { route: "/customers", label: "Customers" },
    { route: "/crm/settings", label: "CRM settings" },
  ],
  "documents-service": [
    { route: "/documents/templates", label: "Templates" },
  ],
}

const nonStartPageRoutes = new Set(["/bookings/new"])

function buildStartPageGroups(): StartPageGroup[] {
  const seenRoutes = new Set<string>()
  const keepUniquePage = (option: StartPageOption) => {
    if (seenRoutes.has(option.route) || nonStartPageRoutes.has(option.route)) return false
    seenRoutes.add(option.route)
    return true
  }

  return [
    {
      label: "Workspace",
      options: [
        { route: homeNavItem.route ?? "/", label: homeNavItem.label },
        { route: inboxNavItem.route ?? "/inbox", label: inboxNavItem.label },
        { route: "/agent-dexter", label: "Agent Dexter" },
      ].filter(keepUniquePage),
    },
    ...sidebarAreas.map((area) => ({
      label: area.label,
      options: [
        ...area.destinations.flatMap((destination): StartPageOption[] => [
          ...(destination.route ? [{ route: destination.route, label: destination.label }] : []),
          ...(destination.children ?? []).flatMap((child): StartPageOption[] => (
            child.route ? [{ route: child.route, label: child.label }] : []
          )),
        ]),
        ...(startPageExtras[area.id] ?? []),
      ].filter(keepUniquePage),
    })),
  ].filter((group) => group.options.length > 0)
}

const startPageGroups = buildStartPageGroups()

const startPageByRoute = new Map(startPageGroups.flatMap((group) => group.options.map((option) => [option.route, option] as const)))
const legacyStartPageRoutes: Record<string, string> = {
  Overview: "/",
  Bookings: "/bookings",
  Customers: "/customers",
  "Agent Dexter": "/agent-dexter",
}

function readStartPageRoute() {
  const saved = window.localStorage.getItem("multideck.settings.start-page")
  if (saved && startPageByRoute.has(saved)) return saved
  return saved ? legacyStartPageRoutes[saved] ?? "/" : "/"
}

function StartPageSelect({ value, onChange }: { value: string; onChange: (route: string) => void }) {
  const { t } = useLanguage()
  const selectedGroup = startPageGroups.find((group) => group.options.some((option) => option.route === value))
  const selectedOption = startPageByRoute.get(value)

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={t("Start page")}
        className="h-10 w-full min-w-0 max-w-[420px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-field-bg-hover)] sm:text-[13px]"
      >
        <SelectValue>
          <span className="min-w-0 truncate">
            {selectedGroup ? <>{t(selectedGroup.label)} <span aria-hidden="true" className="text-[var(--md-subtle)]">·</span> </> : null}
            {t(selectedOption?.label ?? "Home")}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[420px] min-w-[min(360px,calc(100vw-2rem))] border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
        {startPageGroups.map((group, index) => (
          <Fragment key={group.label}>
            {index ? <SelectSeparator /> : null}
            <SelectGroup>
              <SelectLabel>{t(group.label)}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.route} value={option.route} className="text-[13px]">
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectGroup>
          </Fragment>
        ))}
      </SelectContent>
    </Select>
  )
}

function CustomisationTab() {
  const [density, setDensity] = useState(() => window.localStorage.getItem("multideck.settings.density") ?? "Comfortable")
  const [startPage, setStartPage] = useState(readStartPageRoute)
  const [keepFilters, setKeepFilters] = useState(() => window.localStorage.getItem("multideck.settings.keep-filters") !== "false")

  useEffect(() => {
    window.localStorage.setItem("multideck.settings.density", density)
  }, [density])

  useEffect(() => {
    window.localStorage.setItem("multideck.settings.start-page", startPage)
  }, [startPage])

  useEffect(() => {
    window.localStorage.setItem("multideck.settings.keep-filters", String(keepFilters))
  }, [keepFilters])

  return (
    <>
      <SettingsPageHeader
        eyebrow="Personal / Customisation"
        title="Customisation"
        description="Tune how Multideck reads, feels, and opens without changing the shared workspace for anyone else."
      />
      {/* Full width rather than inside the two-column grid below: the horizontal
          rail keeps every preview large enough to judge without making the page
          taller as the palette grows. */}
      <SettingsPanel
        className="mt-[var(--md-page-stack-gap)]"
        title="Accent colour"
        description="Choose a Multideck accent or, when Admin Branding is complete, your company identity. Company colours and the co-branded sidebar apply only to your profile."
      >
        <div className="px-5 py-4">
          <AccentPicker />
        </div>
      </SettingsPanel>
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title="Interface" description="Personal display choices update immediately on this browser.">
          <SettingsFieldRow label="Appearance" description="Choose light, dark, or the mode used by this device.">
            <div className="max-w-[320px]">
              <ThemeToggle className="bg-[var(--md-glass)]" />
            </div>
          </SettingsFieldRow>
          <LanguageSettingField label="App language" />
          <SettingsFieldRow label="Information density" description="Changes row height and breathing room without hiding data.">
            <SettingsChoiceGroup
              options={["Compact", "Comfortable", "Roomy"]}
              value={density}
              onChange={setDensity}
              className="max-w-[420px]"
            />
          </SettingsFieldRow>
          <SettingsFieldRow label="World clocks" description="Choose clear digital times or compact analogue faces.">
            <ClockDisplaySetting />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel title="Starting point" description="Open the workspace where your day usually begins.">
          <SettingsFieldRow label="Start page">
            <StartPageSelect value={startPage} onChange={setStartPage} />
          </SettingsFieldRow>
          <SettingsToggleRow
            title="Keep filters between visits"
            description="Return to the same owner, customer, and ETA filters after reload."
            checked={keepFilters}
            onCheckedChange={setKeepFilters}
          />
        </SettingsPanel>

        <SettingsPanel title="Freight formats" description="Used in quotes, generated summaries, and operational documents.">
          <SettingsFieldRow label="Measurement system">
            <SettingsSelect value="Metric · kg, cbm, km" options={["Metric · kg, cbm, km", "Imperial · lb, cu ft, mi"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Currency">
            <SettingsSelect value="EUR · Euro" options={["EUR · Euro", "GBP · British pound", "USD · US dollar"]} />
          </SettingsFieldRow>
          <SettingsFieldRow label="Dates">
            <SettingsSelect value="DD MMM YYYY" options={["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"]} />
          </SettingsFieldRow>
        </SettingsPanel>
      </div>
    </>
  )
}

function NotificationsTab() {
  const { language, t } = useLanguage()
  const [preferences, setPreferences] = useState<NotificationEmailPreferences>(defaultNotificationEmailPreferences)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    loadNotificationEmailPreferences()
      .then((savedPreferences) => {
        if (cancelled) return
        setPreferences(savedPreferences)
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("Notification preferences could not be loaded.", error)
        setLoadError("Your saved email preferences could not be loaded. Try refreshing this page.")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function setEmailPreference(eventType: NotificationEventType, isEnabled: boolean) {
    setPreferences((current) => ({ ...current, [eventType]: isEnabled }))
  }

  async function savePreferences() {
    setIsSaving(true)
    try {
      await saveNotificationEmailPreferences(preferences)
      setLoadError(null)
      toast.success("Notification settings saved", {
        description: "Future operational emails will follow these preferences.",
      })
    } catch (error) {
      console.error("Notification preferences could not be saved.", error)
      toast.error("Notification settings were not saved", {
        description: "Your previous preferences are still in place. Please try again.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function sendTestEmail() {
    setIsTesting(true)
    try {
      await sendNotificationTestEmail(language)
      toast.success("Test email sent", {
        description: "Check the inbox connected to your Multideck account.",
      })
    } catch (error) {
      console.error("The test email could not be sent.", error)
      toast.error("Test email could not be sent", {
        description: "Your preferences are unchanged. Try again in a moment.",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const enabledEmailCount = [
    preferences.customs_hold,
    preferences.eta_delay,
    preferences.customer_message,
    preferences.document_parse,
    preferences.daily_digest,
    preferences.quote_reminder,
    preferences.product_updates,
    preferences.dexter_watch,
    preferences.lifecycle_note_mention,
  ].filter(Boolean).length

  return (
    <>
      <SettingsPageHeader
        eyebrow="Personal / Notifications"
        title="Notifications"
        description="Route urgent freight signals immediately and fold routine activity into a calmer scheduled digest."
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading || isTesting}
              className="h-9 rounded-[var(--md-radius-lg)] bg-white/45 px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/70"
              onClick={() => void sendTestEmail()}
            >
              <Mail className="me-2 size-3.5" strokeWidth={1.5} />
              {isTesting ? "Sending test" : "Send test email"}
            </Button>
            <Button
              type="button"
              disabled={isLoading || isSaving}
              className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
              onClick={() => void savePreferences()}
            >
              {isSaving ? "Saving" : "Save notifications"}
            </Button>
          </>
        }
      />
      {loadError ? (
        <div role="alert" className="mt-[var(--md-page-stack-gap)] flex items-start gap-3 rounded-[var(--md-radius-lg)] bg-[rgba(194,91,65,0.08)] px-4 py-3 text-[13px] leading-5 text-[var(--md-danger)] shadow-[var(--md-shadow-line)]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span>{loadError}</span>
        </div>
      ) : null}
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-[var(--md-page-stack-gap)]">
          <SettingsPanel title="Operational alerts" description="Email the updates that need attention away from the Multideck workspace.">
            <SettingsToggleRow
              title={t("Note mentions")}
              description={t("Send a branded Multideck email when a person or department tags you in an operational note. In-app alerts remain on.")}
              checked={preferences.lifecycle_note_mention}
              onCheckedChange={(checked) => setEmailPreference("lifecycle_note_mention", checked)}
            />
            <SettingsToggleRow
              title={t("Dexter watch alerts")}
              description={t("Email when one of your personal Dexter watch conditions becomes true. In-app alerts remain on.")}
              checked={preferences.dexter_watch}
              onCheckedChange={(checked) => setEmailPreference("dexter_watch", checked)}
            />
            <SettingsToggleRow
              title="Customs holds"
              description="Email when a hold is raised or a required licence is missing."
              checked={preferences.customs_hold}
              onCheckedChange={(checked) => setEmailPreference("customs_hold", checked)}
            />
            <SettingsToggleRow
              title="ETA slips over 6 hours"
              description="Email the booking owner before a customer update is prepared."
              checked={preferences.eta_delay}
              onCheckedChange={(checked) => setEmailPreference("eta_delay", checked)}
            />
            <SettingsToggleRow
              title="Customer message unanswered"
              description="Escalate when a customer has waited more than two working hours."
              checked={preferences.customer_message}
              onCheckedChange={(checked) => setEmailPreference("customer_message", checked)}
            />
            <SettingsToggleRow
              title="Document parse below 80%"
              description="Email when a document needs a person to check the extracted data."
              checked={preferences.document_parse}
              onCheckedChange={(checked) => setEmailPreference("document_parse", checked)}
            />
          </SettingsPanel>
          <SettingsPanel title="Digest and reminders" description="Keep routine updates useful without turning them into interruptions.">
            <SettingsToggleRow
              title="Daily digest"
              description="A calm summary of open exceptions, due work, and customer risk."
              checked={preferences.daily_digest}
              onCheckedChange={(checked) => setEmailPreference("daily_digest", checked)}
            />
            <SettingsFieldRow label="Digest delivery time" description="Uses the timezone saved below.">
              <SettingsSelect
                value={preferences.digestTime}
                options={["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"]}
                onChange={(digestTime) => setPreferences((current) => ({ ...current, digestTime }))}
                ariaLabel="Digest delivery time"
              />
            </SettingsFieldRow>
            <SettingsFieldRow label="Digest timezone">
              <SettingsSelect
                value={preferences.timezone}
                options={["Europe/London", "Europe/Berlin", "America/New_York", "Asia/Singapore"]}
                onChange={(timezone) => setPreferences((current) => ({ ...current, timezone }))}
                ariaLabel="Digest timezone"
              />
            </SettingsFieldRow>
            <SettingsToggleRow
              title="Quote reminders"
              description="Email when an open quote needs a follow-up."
              checked={preferences.quote_reminder}
              onCheckedChange={(checked) => setEmailPreference("quote_reminder", checked)}
            />
            <SettingsToggleRow
              title="Product updates"
              description="Occasional release notes for changes that affect your work."
              checked={preferences.product_updates}
              onCheckedChange={(checked) => setEmailPreference("product_updates", checked)}
            />
          </SettingsPanel>
          <SettingsPanel title="Account security" description="Critical account notices protect your workspace and cannot be switched off.">
            <SettingsFieldRow label="Security emails" description="Password, email, identity, and multi-factor authentication changes.">
              <div className="flex items-center justify-end gap-2 text-[13px] text-[var(--md-text)]">
                <ShieldCheck className="size-4 text-[var(--md-accent)]" strokeWidth={1.5} />
                Always on
              </div>
            </SettingsFieldRow>
          </SettingsPanel>
        </div>
        <aside className="space-y-[var(--md-page-stack-gap)] xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <section className="md-settings-notification-map relative isolate overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[var(--md-ink)]">Signal routing</p>
                <p className="mt-1 text-[12px] text-[var(--md-text)]">What reaches you, and when</p>
              </div>
              <span className="relative flex size-8 items-center justify-center rounded-full bg-[var(--md-accent-a10)] text-[var(--md-accent)]">
                <Bell className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                <span className="md-settings-signal-ping absolute inset-0 rounded-full" aria-hidden="true" />
              </span>
            </div>
            <div className="relative mt-5 grid gap-2">
              {[
                [CircleAlert, "Urgent alerts", "Immediate", "amber"],
                [Mail, "Operational email", `${enabledEmailCount} of 7 on`, "accent"],
                [CalendarClock, "Daily digest", preferences.daily_digest ? preferences.digestTime : "Off", "blue"],
                [ShieldCheck, "Security notices", "Always on", "green"],
              ].map(([Icon, label, value, tone], index) => (
                <div key={label as string} className="relative flex items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-3 shadow-[var(--md-shadow-line)]">
                  {index < 3 ? <span className="absolute start-[27px] top-[38px] h-[18px] w-px bg-[var(--md-line-strong)]" aria-hidden="true" /> : null}
                  <span className={cn(
                    "relative z-10 grid size-7 place-items-center rounded-[var(--md-radius-md)]",
                    tone === "amber" && "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]",
                    tone === "accent" && "bg-[var(--md-accent-a10)] text-[var(--md-accent)]",
                    tone === "blue" && "bg-[rgba(74,125,156,0.1)] text-[var(--md-blue)]",
                    tone === "green" && "bg-[var(--md-accent-a10)] text-[var(--md-green)]",
                  )}>
                    <Icon className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--md-text)]">{label as string}</span>
                  <span className="text-end text-[12px] font-medium tabular-nums text-[var(--md-ink)]">{value as string}</span>
                </div>
              ))}
            </div>
          </section>
          <SettingsSummaryCard
            title="Delivery health"
            rows={[
              ["Provider", "Resend"],
              ["Last test", "Not sent yet"],
              ["Muted by schedule", "14 today"],
              ["Failed deliveries", "0"],
            ]}
            actionLabel="Send test"
            onAction={() => void sendTestEmail()}
          />
        </aside>
      </div>
    </>
  )
}

/**
 * The summon explainer. The gesture is the one shortcut nobody would discover on
 * their own, so it gets a surface of its own above the list rather than a row in
 * it — and a Try it button, because reading about a gesture teaches less than
 * doing it once.
 */
function SummonSpotlight() {
  const aiAgentName = useAiAgentName()
  const pointerBinding = useShortcutBinding("dexter.summon")
  const keyboardBinding = useShortcutBinding("dexter.summonKeyboard")

  return (
    <section className="md-settings-panel relative isolate overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-accent-abyss)] text-white shadow-[var(--md-shadow-soft)]">
      <span aria-hidden="true" className="absolute inset-0 opacity-[0.55]">
        <SpectralBloomShader shape="composer" />
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(105deg,rgba(6,36,32,0.92),rgba(6,36,32,0.62)_54%,rgba(6,36,32,0.34))]"
      />
      <div className="relative grid gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="max-w-[62ch]">
          <p className="flex items-center gap-2 text-[12px] font-medium text-white/70">
            <WandSparkles className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
            The gesture worth learning first
          </p>
          <h2 className="mt-2.5 text-balance text-[19px] font-medium leading-[1.2] tracking-[-0.01em]">
            Summon {aiAgentName} onto anything on the screen
          </h2>
          <p className="mt-2 text-pretty text-[13px] leading-6 text-white/72">
            Hold the modifier and double-click a field, a chart, a table or a whole panel. {aiAgentName} traces what you
            pointed at, opens a small prompt against it, and answers with that context already attached. With nothing
            under the pointer the screen dims and you pick the area yourself.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <span className="flex items-center gap-2 text-[12px] text-white/70">
              Pointer
              <ShortcutKeys
                binding={pointerBinding}
                keyClassName="bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                emptyLabel="Off"
              />
            </span>
            <span className="flex items-center gap-2 text-[12px] text-white/70">
              Keyboard
              <ShortcutKeys
                binding={keyboardBinding}
                keyClassName="bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                emptyLabel="Off"
              />
            </span>
          </div>
        </div>
        <div className="shrink-0 lg:justify-self-end">
          <p className="text-[11.5px] leading-5 text-white/55">
            Answers always run on the Fast engine,
            <br className="hidden sm:inline" /> so they land while you are still looking.
          </p>
        </div>
      </div>
    </section>
  )
}

function ShortcutsTab() {
  return (
    <>
      <SettingsPageHeader
        eyebrow="Personal / Keyboard shortcuts"
        title="Keyboard shortcuts"
        description="Every shortcut in Multideck, and the keys they are on. Hold two keys together for a chord such as H + J, or press two plain keys in a row for a sequence."
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SummonSpotlight />
        <section className="md-settings-panel overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
          <KeyboardShortcutsPanel />
        </section>
      </div>
    </>
  )
}

function writingProfileErrorCopy(
  error: unknown,
  fallback: string,
  t: (value: string) => string,
) {
  if (!(error instanceof DexterWritingProfileError)) return t(fallback)
  if (error.code === "feature_disabled") return t("Personal email style is not enabled for this workspace yet.")
  if (error.code === "authentication_required") return t("Sign in again to manage your writing profile.")
  if (error.code === "operator_unavailable") return t("Your Multideck operator profile is unavailable.")
  if (error.code === "consent_required") return t("Turn on personal email style before refreshing it.")
  if (error.code === "profile_too_long") return t("Keep the writing profile within 2,400 characters.")
  return t(fallback)
}

type MicrophoneOption = { id: string; label: string }

const maximumTranscriptionTerms = 100

function DexterFieldGroup({
  label,
  description,
  children,
  labelFor,
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  labelFor?: string
  className?: string
}) {
  const descriptionId = labelFor && description ? `${labelFor}-description` : undefined

  return (
    <div className={cn("min-w-0", className)}>
      <div className="min-w-0">
        {labelFor ? (
          <label htmlFor={labelFor} className="text-[13px] font-medium text-[var(--md-ink)]">{label}</label>
        ) : (
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        )}
        {description ? <p id={descriptionId} className="mt-1 max-w-[58ch] text-[12px] leading-5 text-[var(--md-text)]">{description}</p> : null}
      </div>
      <div className="mt-3 min-w-0">{children}</div>
    </div>
  )
}

function AgentDexterTab() {
  const { language, t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const shortcut = useShortcutBinding("dictation.toggle")
  const [agentNameDraft, setAgentNameDraft] = useState(aiAgentName)
  const [profile, setProfile] = useState<DexterWritingProfile | null>(null)
  const [profileText, setProfileText] = useState("")
  const [profileLoading, setProfileLoading] = useState(true)
  const [operation, setOperation] = useState<"consent" | "save" | "refresh" | "reset" | "toggle" | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [featureUnavailable, setFeatureUnavailable] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [microphones, setMicrophones] = useState<MicrophoneOption[]>([])
  const [selectedMicrophone, setSelectedMicrophone] = useState(readPreferredMicrophone)
  const [dictionary, setDictionary] = useState<string[]>([])
  const [transcriptionLoading, setTranscriptionLoading] = useState(true)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const confirmedDictionaryRef = useRef<string[]>([])
  const pendingDictionarySaveRef = useRef<{ revision: number; terms: string[] } | null>(null)
  const dictionarySaveInFlightRef = useRef(false)
  const dictionaryRevisionRef = useRef(0)
  const dictionaryMountedRef = useRef(true)

  const terms = normalizeTagTerms(dictionary, maximumTranscriptionTerms)
  const agentNameDirty = agentNameDraft.trim().length > 0 && agentNameDraft.trim() !== aiAgentName
  const personalised = useCallback((copy: string) => t(copy).replaceAll("Dexter", aiAgentName), [aiAgentName, t])

  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    setProfileError(null)
    try {
      const next = await getDexterWritingProfile()
      setProfile(next)
      setProfileText(next.profileText)
      setFeatureUnavailable(false)
    } catch (loadError) {
      const unavailable = loadError instanceof DexterWritingProfileError && loadError.code === "feature_disabled"
      setFeatureUnavailable(unavailable)
      setProfileError(writingProfileErrorCopy(loadError, "Unable to load your email writing profile.", t))
    } finally {
      setProfileLoading(false)
    }
  }, [t])

  const loadMicrophones = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMicrophones([])
      return
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    let microphoneIndex = 0
    setMicrophones(devices.filter((device) => device.kind === "audioinput").map((device) => {
      microphoneIndex += 1
      return { id: device.deviceId, label: device.label || `${t("Microphone")} ${microphoneIndex}` }
    }))
  }, [t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    setAgentNameDraft(aiAgentName)
  }, [aiAgentName])

  useEffect(() => {
    dictionaryMountedRef.current = true
    return () => {
      dictionaryMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getTranscriptionPreferences()
      .then((preferences) => {
        if (cancelled) return
        const value = normalizeTagTerms(preferences.customVocabulary, maximumTranscriptionTerms)
        setDictionary(value)
        confirmedDictionaryRef.current = value
      })
      .catch((loadError) => {
        if (!cancelled) setTranscriptionError(loadError instanceof Error ? loadError.message : t("Transcription settings could not be loaded."))
      })
      .finally(() => {
        if (!cancelled) setTranscriptionLoading(false)
      })
    void loadMicrophones().catch(() => undefined)
    const refresh = () => void loadMicrophones().catch(() => undefined)
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh)
    }
  }, [loadMicrophones, t])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("view") && !url.hash) return
    url.searchParams.delete("view")
    url.hash = ""
    window.history.replaceState({}, "", `${url.pathname}${url.search}`)
  }, [])

  function acceptProfile(next: DexterWritingProfile) {
    setProfile(next)
    setProfileText(next.profileText)
    setProfileError(null)
  }

  async function learnStyle() {
    if (operation) return
    setOperation("consent")
    setProfileError(null)
    try {
      acceptProfile(await consentToDexterWritingProfile())
      toast.success(personalised("Dexter has learned your email writing style."))
    } catch (learnError) {
      setProfileError(writingProfileErrorCopy(learnError, "Dexter could not create your writing profile. Try again.", t).replaceAll("Dexter", aiAgentName))
    } finally {
      setOperation(null)
    }
  }

  async function toggleStyle(enabled: boolean) {
    if (operation) return
    if (enabled && (!profile?.exists || !profile.profileText)) {
      await learnStyle()
      return
    }
    setOperation("toggle")
    setProfileError(null)
    try {
      acceptProfile(await updateDexterWritingProfile(enabled, profileText))
    } catch (toggleError) {
      setProfileError(writingProfileErrorCopy(toggleError, "Dexter could not update this setting. Try again.", t).replaceAll("Dexter", aiAgentName))
    } finally {
      setOperation(null)
    }
  }

  async function saveProfile() {
    if (!profile || operation) return
    setOperation("save")
    setProfileError(null)
    try {
      acceptProfile(await updateDexterWritingProfile(profile.enabled, profileText))
      toast.success(t("Email writing profile saved"))
    } catch (saveError) {
      setProfileError(writingProfileErrorCopy(saveError, "Dexter could not save your writing profile. Try again.", t).replaceAll("Dexter", aiAgentName))
    } finally {
      setOperation(null)
    }
  }

  async function refreshProfile() {
    if (operation) return
    setOperation("refresh")
    setProfileError(null)
    try {
      acceptProfile(await refreshDexterWritingProfile())
      toast.success(t("Email writing profile refreshed"))
    } catch (refreshError) {
      setProfileError(writingProfileErrorCopy(refreshError, "Dexter could not refresh your writing profile. Your saved profile is unchanged.", t).replaceAll("Dexter", aiAgentName))
    } finally {
      setOperation(null)
    }
  }

  async function resetProfile() {
    if (operation) return
    setOperation("reset")
    setProfileError(null)
    try {
      acceptProfile(await resetDexterWritingProfile())
      setResetOpen(false)
      toast.success(t("Email writing profile reset"))
    } catch (resetError) {
      setProfileError(writingProfileErrorCopy(resetError, "Dexter could not reset your writing profile. Nothing was deleted.", t).replaceAll("Dexter", aiAgentName))
    } finally {
      setOperation(null)
    }
  }

  function saveAgentName() {
    const nextName = agentNameDraft.trim()
    if (!nextName) return
    writeAiAgentName(nextName)
    toast.success(t("Assistant name updated"), { description: t("The new name now appears across Multideck on this device.") })
  }

  async function flushDictionarySaves() {
    if (dictionarySaveInFlightRef.current) return
    dictionarySaveInFlightRef.current = true
    try {
      while (pendingDictionarySaveRef.current) {
        const pending = pendingDictionarySaveRef.current
        pendingDictionarySaveRef.current = null
        try {
          const preferences = await saveTranscriptionPreferences(pending.terms)
          const confirmed = normalizeTagTerms(preferences.customVocabulary, maximumTranscriptionTerms)
          confirmedDictionaryRef.current = confirmed
          if (dictionaryMountedRef.current && pending.revision === dictionaryRevisionRef.current) {
            setDictionary(confirmed)
          }
        } catch (saveError) {
          if (dictionaryMountedRef.current && pending.revision === dictionaryRevisionRef.current) {
            setDictionary(confirmedDictionaryRef.current)
            const message = saveError instanceof TranscriptionError ? saveError.message : t("Transcription settings were not saved. Try again.")
            setTranscriptionError(message)
          }
        }
      }
    } finally {
      dictionarySaveInFlightRef.current = false
    }
  }

  function updateDictionary(nextTerms: string[]) {
    const value = normalizeTagTerms(nextTerms, maximumTranscriptionTerms)
    if (value.join("\n") === terms.join("\n")) return
    const revision = dictionaryRevisionRef.current + 1
    dictionaryRevisionRef.current = revision
    setDictionary(value)
    setTranscriptionError(null)
    pendingDictionarySaveRef.current = { revision, terms: value }
    void flushDictionarySaves()
  }

  const busy = operation !== null
  const dirty = Boolean(profile && profileText !== profile.profileText)
  const profileNotice = profileError
    ?? (profile?.status === "processing" || operation === "consent" || operation === "refresh"
      ? personalised("Dexter is updating your writing profile. You can leave this page.")
      : profile?.status === "insufficient"
        ? personalised("Dexter needs at least 10 eligible sent emails before it can learn your style.")
        : profile?.status === "error"
          ? personalised("Dexter could not update your writing profile. Your previous profile is unchanged.")
          : null)
  const profileUpdatedLabel = profile?.lastGeneratedAt
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(profile.lastGeneratedAt))
    : t("Not yet updated")

  const microphoneOptions = [
    { id: systemDefaultMicrophone, label: t("System default") },
    ...microphones.filter((microphone) => microphone.id && microphone.id !== "default"),
  ]
  if (selectedMicrophone !== systemDefaultMicrophone && !microphoneOptions.some((option) => option.id === selectedMicrophone)) {
    microphoneOptions.push({ id: selectedMicrophone, label: t("Previously selected microphone") })
  }

  const writingPreferences = featureUnavailable ? (
    <p role="status" className="text-[13px] leading-5 text-[var(--md-text)] md:col-span-2">{profileError}</p>
  ) : (
    <>
      <DexterFieldGroup
        label={t("Write emails like me")}
        description={personalised("When on, Dexter applies your private style profile only to email drafts, replies and rewrites.")}
        labelFor="dexter-writing-style"
      >
        <div className="flex min-h-10 items-center justify-between gap-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 shadow-[var(--md-shadow-line)]">
          <span className="text-[12px] font-medium text-[var(--md-text)]">{t(profile?.enabled ? "On" : "Off")}</span>
          <Switch
            id="dexter-writing-style"
            aria-describedby="dexter-writing-style-description"
            checked={profile?.enabled === true}
            disabled={profileLoading || busy}
            onCheckedChange={(checked) => void toggleStyle(checked)}
          />
        </div>
      </DexterFieldGroup>
      <DexterFieldGroup label={t("Writing profile updates")} description={t("Relearn from recent eligible sent emails whenever your writing style changes.")}>
        <div>
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 shadow-[var(--md-shadow-line)]">
            <span className="text-[12px] text-[var(--md-text)]">{profileUpdatedLabel}</span>
            {profile?.exists ? (
              <Button type="button" variant="ghost" disabled={busy} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] hover:bg-[var(--md-hover)]" onClick={() => void refreshProfile()}>
                {operation === "refresh" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <History className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {t(operation === "refresh" ? "Updating" : "Update from sent emails")}
              </Button>
            ) : !profileLoading ? (
              <Button type="button" variant="ghost" disabled={busy} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] hover:bg-[var(--md-hover)]" onClick={() => void learnStyle()}>
                {operation === "consent" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <WandSparkles className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {t(operation === "consent" ? "Learning your style" : "Learn my email style")}
              </Button>
            ) : null}
          </div>
          {profileNotice ? (
            <p role={profileError || profile?.status === "error" ? "alert" : "status"} aria-live="polite" className={cn("mt-2 text-[12px] leading-5", profileError || profile?.status === "error" ? "text-[var(--md-red)]" : "text-[var(--md-text)]")}>
              {profileNotice}
            </p>
          ) : null}
        </div>
      </DexterFieldGroup>
      <DexterFieldGroup label={t("Writing profile")} description={personalised("Edit the guidance Dexter applies. Keep facts, names, prices and commitments out of this profile.")} labelFor="dexter-writing-profile" className="md:col-span-2">
        <div>
          <SettingsTextarea
            id="dexter-writing-profile"
            value={profileText}
            maxLength={2400}
            disabled={profileLoading || busy || !profile?.exists}
            aria-describedby="dexter-writing-profile-description dexter-writing-profile-count"
            className="min-h-[220px] resize-y text-[16px] leading-[1.6] sm:text-[14px]"
            placeholder={t("Your tone, structure, greetings, sign-offs and preferred terminology will appear here.")}
            onChange={(event) => setProfileText(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span id="dexter-writing-profile-count" className="text-[11.5px] tabular-nums text-[var(--md-subtle)]">{profileText.length.toLocaleString(language)} / 2,400</span>
            <Button type="button" disabled={!dirty || busy} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100" onClick={() => void saveProfile()}>
              {operation === "save" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {t(operation === "save" ? "Saving profile" : "Save profile")}
            </Button>
          </div>
        </div>
      </DexterFieldGroup>
    </>
  )

  const content = (
    <>
      <SettingsPageHeader
        title={aiAgentName}
        description={personalised("Set how Dexter is named, how it writes and how voice input works for you.")}
        descriptionPlacement="under-title"
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title={t("Personal assistant")} description={t("Your personal name for the assistant appears throughout Multideck on this device.")}>
          <div className="px-5 py-5">
            <DexterFieldGroup label={t("Assistant name")} description={t("Use a short name you will recognise in navigation, prompts and conversation.")} labelFor="dexter-assistant-name" className="max-w-[640px]">
              <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={(event) => { event.preventDefault(); saveAgentName() }}>
                <SettingsInput id="dexter-assistant-name" aria-describedby="dexter-assistant-name-description" value={agentNameDraft} maxLength={32} onChange={(event) => setAgentNameDraft(event.target.value)} />
                <Button type="submit" disabled={!agentNameDirty} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] active:scale-[0.96] disabled:opacity-50 motion-reduce:active:scale-100">
                  {t("Save name")}
                </Button>
              </form>
            </DexterFieldGroup>
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("Writing preferences")} description={t("Built from up to 40 eligible emails sent in the last 12 months. Only the compact style profile is kept.")}>
          <div className="grid gap-x-6 gap-y-7 px-5 py-5 md:grid-cols-2">
            {writingPreferences}
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("Voice and transcription")} description={t("Choose your microphone, shortcut and the uncommon terms dictation should recognise.")}>
          <div className="grid gap-x-6 gap-y-7 px-5 py-5 md:grid-cols-2">
            {transcriptionError ? (
              <div role="alert" className="flex items-start gap-2 text-[12.5px] leading-5 text-[var(--md-red)] md:col-span-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{t(transcriptionError)}</span>
              </div>
            ) : null}
            <DexterFieldGroup label={t("Microphone")} description={t("System default follows the input selected in your browser or operating system.")} labelFor="transcription-microphone">
              <Select value={selectedMicrophone} onValueChange={(value) => { setSelectedMicrophone(value); savePreferredMicrophone(value) }}>
                <SelectTrigger id="transcription-microphone" aria-describedby="transcription-microphone-description" className="h-10 min-w-0 rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-field-bg)] px-3 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                  {microphoneOptions.map((option) => <SelectItem key={option.id} value={option.id} data-i18n-skip={option.id !== systemDefaultMicrophone ? true : undefined}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </DexterFieldGroup>
            <DexterFieldGroup label={t("Dictation shortcut")} description={t("Focus a text field and hold the shortcut while speaking. Release it to transcribe.")}>
              <div className="flex min-h-10 flex-wrap items-center gap-3">
                <ShortcutKeys binding={shortcut} />
                <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 text-[12px] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]" onClick={() => {
                  window.history.pushState({}, "", "/settings?tab=shortcuts")
                  window.dispatchEvent(new PopStateEvent("popstate"))
                  document.querySelector("main")?.scrollTo({ top: 0, behavior: "auto" })
                }}>
                  {t("Change shortcut")}
                </Button>
              </div>
            </DexterFieldGroup>
            <DexterFieldGroup label={t("Custom dictionary")} description={t("Saved privately to your profile. Add terms the speech model may mishear.")} labelFor="transcription-dictionary" className="md:col-span-2">
              <div>
                <TagEntryField
                  id="transcription-dictionary"
                  terms={terms}
                  onTermsChange={updateDictionary}
                  maxTerms={maximumTranscriptionTerms}
                  disabled={transcriptionLoading}
                  placeholder={t("Add a word or phrase")}
                  inputLabel={t("Add dictionary terms")}
                  addLabel={t("Add term")}
                  removeLabel={(term) => `${t("Remove")} ${term}`}
                  duplicateMessage={t("That term is already in the dictionary.")}
                  limitMessage={t("The dictionary can contain up to 100 terms.")}
                />
                <div className="mt-2 flex items-center">
                  <span className="text-[11.5px] tabular-nums text-[var(--md-subtle)]">{terms.length} / {maximumTranscriptionTerms} {t("terms")}</span>
                </div>
              </div>
            </DexterFieldGroup>
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("Privacy and control")} description={t("See what is retained, what always needs your approval and what you can remove.")}>
          <div className="grid gap-x-6 gap-y-7 px-5 py-5 md:grid-cols-2 lg:grid-cols-3">
            <DexterFieldGroup label={t("Recording handling")} description={t("Audio is sent securely for transcription and is not kept in Multideck. Transcript history is not stored by this feature.")}>
              <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                <ShieldCheck className="size-3.5 text-[var(--md-green)]" strokeWidth={1.5} aria-hidden="true" />
                {t("No recording history")}
              </span>
            </DexterFieldGroup>
            <DexterFieldGroup label={t("Sending approval")} description={personalised("Dexter never sends automatically. Only selecting the paper plane on an editable draft sends the email.")}>
              <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                <ShieldCheck className="size-3.5 text-[var(--md-green)]" strokeWidth={1.5} aria-hidden="true" />
                {t("Operator click required")}
              </span>
            </DexterFieldGroup>
            <DexterFieldGroup label={t("Reset writing profile")} description={t("Delete the derived profile and stop future refreshes. Your original sent emails remain in their provider and Inbox history.")}>
              <Button type="button" variant="ghost" disabled={!profile?.exists || busy} className="h-10 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)]" onClick={() => setResetOpen(true)}>
                <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                {t("Reset profile")}
              </Button>
            </DexterFieldGroup>
          </div>
        </SettingsPanel>
      </div>
    </>
  )

  return (
    <>
      {content}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[440px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("Reset email writing profile?")}</DialogTitle>
            <DialogDescription>{personalised("This deletes Dexter’s derived style profile and stops monthly refreshes. It does not delete any email from Gmail, Outlook or Inbox.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={operation === "reset"} onClick={() => setResetOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" disabled={operation === "reset"} className="bg-[var(--md-red)] text-[var(--md-accent-ink)] hover:opacity-90" onClick={() => void resetProfile()}>
              {operation === "reset" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {t(operation === "reset" ? "Resetting profile" : "Reset profile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  departmentIds: [] as string[],
  invitationExpiry: "7d" as ApiInvitationExpiry,
}

const makeRoleSelectValue = "__make_workspace_role__"
const accessDialogShellClassName = "h-[min(760px,calc(100dvh-32px))] max-h-none grid-rows-[minmax(0,1fr)] overflow-hidden border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[760px]"
const accessDialogPanelClassName = "absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain pe-1 [backface-visibility:hidden] [scrollbar-gutter:stable] will-change-[transform,opacity] motion-reduce:will-change-auto"
const accessDialogPanelVariants = {
  enter: (distance: number) => ({ opacity: 0, x: distance, zIndex: 1 }),
  visible: { opacity: 1, x: 0, zIndex: 1 },
  exit: (distance: number) => ({ opacity: 0, x: -distance, zIndex: 0 }),
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

type PermissionArea = {
  group: string
  permissions: ApiPermission[]
  readValues: string[]
  allValues: string[]
}

function getPermissionAreas(permissions: ApiPermission[]): PermissionArea[] {
  const groups = permissions.reduce<Array<{ group: string; permissions: ApiPermission[] }>>((groups, permission) => {
    const existingGroup = groups.find((item) => item.group === permission.group)
    if (existingGroup) {
      existingGroup.permissions.push(permission)
    } else {
      groups.push({ group: permission.group, permissions: [permission] })
    }

    return groups
  }, [])

  return groups.map((group) => {
    const explicitReadValues = group.permissions
      .filter((permission) => /(?:^|\.)Read$/i.test(permission.value) || /AIRead$/i.test(permission.value))
      .map((permission) => permission.value)

    return {
      ...group,
      readValues: explicitReadValues,
      allValues: group.permissions.map((permission) => permission.value),
    }
  })
}

function getPrimaryRole(user: ApiTeamUser, roles: ApiAuthorizationRole[]) {
  const roleId = user.roles[0]?.id
  return roles.find((role) => role.id === roleId) ?? null
}

function getRoleDisplayName(role: ApiAuthorizationRole | null) {
  return role ? (role.isLegacyCustom ? "Custom" : role.name) : "No role assigned"
}

function getAssignableRoles(roles: ApiAuthorizationRole[]) {
  return roles.filter((role) => !role.isLegacyCustom)
}

function RolePermissionMatrix({
  areas,
  permissionValues,
  onChange,
}: {
  areas: PermissionArea[]
  permissionValues: string[]
  onChange: (permissionValues: string[]) => void
}) {
  const { t } = useLanguage()

  function setAreaEnabled(area: PermissionArea, enabled: boolean) {
    onChange(enabled
      ? [...new Set([...permissionValues, ...(area.readValues.length ? area.readValues : area.allValues)])]
      : permissionValues.filter((value) => !area.allValues.includes(value)))
  }

  function setAreaAccess(area: PermissionArea, access: "read" | "read-write") {
    const withoutArea = permissionValues.filter((value) => !area.allValues.includes(value))
    onChange([...new Set([...withoutArea, ...(access === "read-write" ? area.allValues : area.readValues)])])
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Role access")}</p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Choose the areas this role can use, then set read or read and write access.")}</p>
        </div>
        <StatusPill className="shrink-0" tone="teal">{permissionValues.length} {t("permissions")}</StatusPill>
      </div>
      <div className="divide-y divide-[var(--md-line)] bg-[var(--md-surface)]">
        {areas.map((area) => {
          const enabled = area.allValues.some((value) => permissionValues.includes(value))
          const hasWrite = !area.readValues.length || area.allValues.some((value) => !area.readValues.includes(value) && permissionValues.includes(value))
          return (
            <div key={area.group} className="grid min-w-0 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,180px)] sm:items-center">
              <label className="flex min-w-0 cursor-pointer items-start gap-3">
                <Checkbox className="mt-0.5" checked={enabled} onCheckedChange={(checked) => setAreaEnabled(area, checked === true)} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--md-ink)]">{t(area.group)}</span>
                  <span className="mt-0.5 block break-words text-[11.5px] leading-5 text-[var(--md-text)]">{area.permissions.map((permission) => t(permission.name)).join(" · ")}</span>
                </span>
              </label>
              <Select disabled={!enabled} value={hasWrite ? "read-write" : "read"} onValueChange={(value) => setAreaAccess(area, value as "read" | "read-write")}>
                <SelectTrigger className="h-9 min-w-0 w-full rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read" disabled={!area.readValues.length}>{t("Read")}</SelectItem>
                  <SelectItem value="read-write">{t("Read & write")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamUserIdentity({ user, photoUrl: providedPhotoUrl }: { user: ApiTeamUser; photoUrl?: string | null }) {
  const [fallbackPhotoUrl, setFallbackPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setFallbackPhotoUrl(null)
    if (providedPhotoUrl !== undefined) return () => { cancelled = true }
    if (!user.profilePhoto) return () => { cancelled = true }
    void createProfilePhotoSignedUrl(user.profilePhoto).then((url) => {
      if (!cancelled) setFallbackPhotoUrl(url)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [providedPhotoUrl, user.profilePhoto])

  const photoUrl = providedPhotoUrl === undefined ? fallbackPhotoUrl : providedPhotoUrl

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 shrink-0 rounded-full">
        {photoUrl ? <AvatarImage src={photoUrl} alt="" className="rounded-full object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[12px] font-medium text-[var(--md-ink)]">
          {getTeamUserInitials(user)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{user.displayName}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--md-subtle)]" dir="ltr" data-i18n-skip>{user.email}</p>
      </div>
    </div>
  )
}

function UserActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={7}
        className="rounded-[var(--md-radius-md)] border border-[color-mix(in_srgb,var(--md-accent)_28%,transparent)] bg-[var(--md-ink)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--md-surface)] shadow-[var(--md-shadow-lift)] data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none [&_[data-radix-tooltip-arrow]]:bg-[var(--md-ink)] [&_[data-radix-tooltip-arrow]]:fill-[var(--md-ink)]"
      >
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--md-accent)]" />
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AdminUsersContent() {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const accessPanelDistance = shouldReduceMotion ? 0 : direction === "rtl" ? -8 : 8
  const accessPanelTransition = reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)
  const [team, setTeam] = useState<ApiTeamUsersPageResponse | null>(null)
  const [authorizationState, setAuthorizationState] = useState<ApiAuthorizationState | null>(null)
  const [authorizationError, setAuthorizationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [userOffset, setUserOffset] = useState(0)
  const [userSort, setUserSort] = useState<{ id: string; direction: "asc" | "desc" } | null>({ id: "user", direction: "asc" })
  const [teamPhotoUrls, setTeamPhotoUrls] = useState<Map<string, string>>(new Map())
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState(emptyInviteForm)
  const [inviting, setInviting] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [roleComposerTarget, setRoleComposerTarget] = useState<"invite" | "edit" | null>(null)
  const [roleNameDraft, setRoleNameDraft] = useState("")
  const [newRolePermissionDraft, setNewRolePermissionDraft] = useState<string[]>([])
  const [creatingRole, setCreatingRole] = useState(false)
  const [resendingUserId, setResendingUserId] = useState<string | null>(null)
  const [deleteInviteCandidate, setDeleteInviteCandidate] = useState<ApiTeamUser | null>(null)
  const [deletingInvite, setDeletingInvite] = useState(false)
  const [passwordCandidate, setPasswordCandidate] = useState<ApiTeamUser | null>(null)
  const [newUserPassword, setNewUserPassword] = useState("")
  const [confirmUserPassword, setConfirmUserPassword] = useState("")
  const [resettingPassword, setResettingPassword] = useState(false)
  const [editingUser, setEditingUser] = useState<ApiTeamUser | null>(null)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", jobTitle: "", officeId: "", roleId: "", departmentIds: [] as string[] })
  const [savingUser, setSavingUser] = useState(false)
  const [newDepartmentName, setNewDepartmentName] = useState("")
  const [creatingDepartment, setCreatingDepartment] = useState(false)
  const [statusCandidate, setStatusCandidate] = useState<ApiTeamUser | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [deleteCandidate, setDeleteCandidate] = useState<ApiTeamUser | null>(null)
  const [deletionImpact, setDeletionImpact] = useState<ApiTeamUserDeletionImpact | null>(null)
  const [loadingDeletionImpact, setLoadingDeletionImpact] = useState(false)
  const [replacementUserId, setReplacementUserId] = useState("")
  const [replacementSearch, setReplacementSearch] = useState("")
  const [replacementUsers, setReplacementUsers] = useState<ApiTeamUser[]>([])
  const [replacementUserTotal, setReplacementUserTotal] = useState(0)
  const [loadingReplacementUsers, setLoadingReplacementUsers] = useState(false)
  const [replacementPhotoUrls, setReplacementPhotoUrls] = useState<Map<string, string>>(new Map())
  const [deletionConfirmation, setDeletionConfirmation] = useState("")
  const [deletionNameCopied, setDeletionNameCopied] = useState(false)
  const deletionNameCopyTimerRef = useRef<number | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setLoadError(null)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))
      const nextTeam = await getApiTeamUsersPage(session.access_token, {
        search: debouncedSearchQuery,
        sort: userSort,
        limit: 20,
        offset: userOffset,
      }, signal)
      setCurrentAuthUserId(session.user.id)
      setTeam(nextTeam)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoadError(error instanceof Error ? error.message : t("Users could not be loaded."))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [debouncedSearchQuery, t, userOffset, userSort])

  const loadAuthorization = useCallback(async (signal?: AbortSignal) => {
    setAuthorizationError(null)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))
      setAuthorizationState(await getApiAuthorizationCatalogue(session.access_token, signal))
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setAuthorizationError(error instanceof Error ? error.message : t("Roles could not be loaded."))
    }
  }, [t])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUserOffset(0)
      setDebouncedSearchQuery(searchQuery.trim())
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    const controller = new AbortController()
    void loadUsers(controller.signal)
    return () => controller.abort()
  }, [loadUsers])

  useEffect(() => {
    const controller = new AbortController()
    void loadAuthorization(controller.signal)
    return () => controller.abort()
  }, [loadAuthorization])

  useEffect(() => {
    const defaultRole = getDefaultInviteRole((authorizationState?.roles ?? []).filter((role) => role.isSystem))
    setInviteForm((current) => ({
      ...current,
      officeId: current.officeId || team?.offices[0]?.id || "",
      roleId: current.roleId || defaultRole?.id || "",
      roleTitle: defaultRole?.name ?? current.roleTitle,
    }))
  }, [authorizationState?.roles, team?.offices])

  useEffect(() => {
    let cancelled = false
    const photos = (team?.users ?? []).flatMap((user) => user.profilePhoto ? [user.profilePhoto] : [])
    setTeamPhotoUrls(new Map())
    if (!photos.length) return () => { cancelled = true }
    void createProfilePhotoSignedUrls(photos).then((urls) => {
      if (!cancelled) setTeamPhotoUrls(urls)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [team?.users])

  useEffect(() => {
    let cancelled = false
    const photos = replacementUsers.flatMap((user) => user.profilePhoto ? [user.profilePhoto] : [])
    setReplacementPhotoUrls(new Map())
    if (!photos.length) return () => { cancelled = true }
    void createProfilePhotoSignedUrls(photos).then((urls) => {
      if (!cancelled) setReplacementPhotoUrls(urls)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [replacementUsers])

  useEffect(() => {
    if (!deleteCandidate || !deletionImpact?.requiresReassignment) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoadingReplacementUsers(true)
      void (async () => {
        try {
          const session = await getSupabaseSession()
          if (!session?.access_token) throw new Error(t("Sign in again before removing users."))
          const page = await getApiTeamUserReplacementOptions(session.access_token, deleteCandidate.id, replacementSearch, controller.signal)
          if (controller.signal.aborted) return
          setReplacementUsers((current) => {
            const selected = current.find((user) => user.id === replacementUserId)
            return selected && !page.users.some((user) => user.id === selected.id) ? [selected, ...page.users] : page.users
          })
          setReplacementUserTotal(page.total)
          if (!replacementSearch && page.total === 1 && page.users[0]) setReplacementUserId(page.users[0].id)
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            toast.error(t("Users could not be loaded."), { description: error instanceof Error ? error.message : t("Refresh the users list and try again.") })
          }
        } finally {
          if (!controller.signal.aborted) setLoadingReplacementUsers(false)
        }
      })()
    }, replacementSearch ? 250 : 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [deleteCandidate, deletionImpact?.requiresReassignment, replacementSearch, replacementUserId, t])

  useEffect(() => () => {
    if (deletionNameCopyTimerRef.current !== null) window.clearTimeout(deletionNameCopyTimerRef.current)
  }, [])

  function beginRoleCreation(target: "invite" | "edit" | "standalone") {
    setRoleNameDraft("")
    setNewRolePermissionDraft([])
    if (target === "standalone") {
      setCreateRoleOpen(true)
      return
    }
    setRoleComposerTarget(target)
  }

  function closeRoleComposer(target: "invite" | "edit") {
    if (!creatingRole && roleComposerTarget === target) setRoleComposerTarget(null)
  }

  async function createWorkspaceRole(target: "invite" | "edit" | "standalone") {
    const name = roleNameDraft.trim().replace(/\s+/g, " ")
    if (!name) {
      toast.error(t("Role name is required"))
      return
    }
    if (!newRolePermissionDraft.length) {
      toast.error(t("Enable at least one permission before creating the role."))
      return
    }

    setCreatingRole(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before creating a role."))
      const role = await createApiAuthorizationRole(session.access_token, {
        name,
        permissionValues: newRolePermissionDraft,
      })
      setAuthorizationState((current) => current ? {
        ...current,
        roles: [...current.roles, role].sort((left, right) => left.name.localeCompare(right.name)),
      } : current)
      if (target === "invite") {
        setInviteForm((current) => ({ ...current, roleId: role.id, roleTitle: role.name }))
        setRoleComposerTarget(null)
      } else if (target === "edit") {
        setEditForm((current) => ({ ...current, roleId: role.id }))
        setRoleComposerTarget(null)
      } else {
        setCreateRoleOpen(false)
      }
      toast.success(t("Role created"), { description: role.name })
    } catch (error) {
      toast.error(t("Role could not be created"), {
        description: error instanceof Error ? error.message : t("Check the role name and permissions, then try again."),
      })
    } finally {
      setCreatingRole(false)
    }
  }

  async function sendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteForm.email.trim()) {
      toast.error(t("Email is required"))
      return
    }
    if (!inviteForm.officeId || !inviteForm.roleId) {
      toast.error(t("Choose an office and role before sending the invitation."))
      return
    }

    setInviting(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before inviting users."))
      const response = await createApiTeamUser(session.access_token, {
        email: inviteForm.email.trim(),
        appOrigin: window.location.origin,
        firstName: inviteForm.firstName.trim() || null,
        lastName: inviteForm.lastName.trim() || null,
        companyId: team?.company?.id ?? null,
        officeId: inviteForm.officeId,
        roleId: inviteForm.roleId,
        departmentIds: inviteForm.departmentIds,
        roleTitle: authorizationState?.roles.find((role) => role.id === inviteForm.roleId)?.name ?? null,
        invitationExpiry: inviteForm.invitationExpiry,
      })
      setTeam((current) => current ? { ...current, users: upsertTeamUser(current.users, response.user) } : current)
      const defaultRole = getDefaultInviteRole((authorizationState?.roles ?? []).filter((role) => role.isSystem))
      setInviteForm({ ...emptyInviteForm, officeId: inviteForm.officeId, roleId: defaultRole?.id ?? "", roleTitle: defaultRole?.name ?? "Operator" })
      setInviteOpen(false)
      toast.success(t(response.invited ? "Invitation sent" : "User already active"), { description: response.user.email })
      void loadUsers()
    } catch (error) {
      toast.error(t("Invitation could not be sent"), {
        description: error instanceof Error ? error.message : t("Check the email, office and role, then try again."),
      })
    } finally {
      setInviting(false)
    }
  }

  async function resendInvitation(user: ApiTeamUser) {
    setResendingUserId(user.id)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before inviting users."))
      const updatedUser = await resendApiTeamUserInvitation(session.access_token, user.id, window.location.origin)
      setTeam((current) => current ? { ...current, users: upsertTeamUser(current.users, updatedUser) } : current)
      toast.success(t("Invitation resent"), { description: user.email })
      void loadUsers()
    } catch (error) {
      toast.error(t("Invitation could not be resent"), {
        description: error instanceof Error ? error.message : t("Check the email address, then try again."),
      })
    } finally {
      setResendingUserId(null)
    }
  }

  async function deleteInvitation() {
    if (!deleteInviteCandidate) return
    setDeletingInvite(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before removing users."))
      await deleteApiTeamUserInvitation(session.access_token, deleteInviteCandidate.id)
      setTeam((current) => current ? { ...current, users: current.users.filter((user) => user.id !== deleteInviteCandidate.id) } : current)
      toast.success(t("Invitation deleted"), { description: deleteInviteCandidate.email })
      setDeleteInviteCandidate(null)
      void loadUsers()
    } catch (error) {
      toast.error(t("Invitation could not be deleted"), {
        description: error instanceof Error ? error.message : t("Check your access and try again."),
      })
    } finally {
      setDeletingInvite(false)
    }
  }

  function openPasswordReset(user: ApiTeamUser) {
    setNewUserPassword("")
    setConfirmUserPassword("")
    setPasswordCandidate(user)
  }

  function closePasswordReset() {
    setPasswordCandidate(null)
    setNewUserPassword("")
    setConfirmUserPassword("")
  }

  async function resetUserPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!passwordCandidate) return
    const passwordPolicyError = getPasswordPolicyError(newUserPassword)
    if (passwordPolicyError) {
      toast.error(t(passwordPolicyError))
      return
    }
    if (newUserPassword !== confirmUserPassword) {
      toast.error(t("Passwords do not match."))
      return
    }

    setResettingPassword(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before resetting user passwords."))
      await resetApiTeamUserPassword(session.access_token, passwordCandidate.id, newUserPassword)
      toast.success(t("Password reset"), {
        description: t("{name} can sign in with the new password now.").replace("{name}", passwordCandidate.displayName),
      })
      closePasswordReset()
    } catch (error) {
      toast.error(t("Password could not be reset"), {
        description: error instanceof Error ? error.message : t("Check your access and try again."),
      })
    } finally {
      setResettingPassword(false)
    }
  }

  function openUserEditor(user: ApiTeamUser) {
    const role = getPrimaryRole(user, authorizationState?.roles ?? [])
    setEditingUser(user)
    setNewDepartmentName("")
    setEditForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      jobTitle: user.jobTitle ?? "",
      officeId: user.offices[0]?.id ?? team?.offices[0]?.id ?? "",
      roleId: role && !role.isLegacyCustom ? role.id : "",
      departmentIds: user.departments.map((department) => department.id),
    })
  }

  async function createAndAssignDepartment() {
    const name = newDepartmentName.trim()
    if (!name || creatingDepartment) return
    setCreatingDepartment(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))
      const department = await createApiDepartment(session.access_token, name)
      setTeam((current) => current ? {
        ...current,
        departments: [...current.departments.filter((item) => item.id !== department.id), department]
          .sort((left, right) => left.name.localeCompare(right.name)),
      } : current)
      setEditForm((current) => ({ ...current, departmentIds: [...new Set([...current.departmentIds, department.id])] }))
      setNewDepartmentName("")
      toast.success(t("Department created"), { description: department.name })
    } catch (error) {
      toast.error(t("Department could not be created"), { description: error instanceof Error ? error.message : t("Check the name and try again.") })
    } finally {
      setCreatingDepartment(false)
    }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    setSavingUser(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))
      const previousRole = getPrimaryRole(editingUser, authorizationState?.roles ?? [])
      const updated = await updateApiTeamUser(session.access_token, editingUser.id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        jobTitle: editForm.jobTitle || null,
        officeId: editForm.officeId,
        roleIds: [editForm.roleId],
        departmentIds: editForm.departmentIds,
      })
      let legacyRoleCleanupError: string | null = null
      if (previousRole?.isLegacyCustom && previousRole.id !== editForm.roleId) {
        try {
          await deleteApiAuthorizationRole(session.access_token, previousRole.id)
          setAuthorizationState((current) => current ? { ...current, roles: current.roles.filter((role) => role.id !== previousRole.id) } : current)
        } catch (error) {
          legacyRoleCleanupError = error instanceof Error ? error.message : t("The old one-user role could not be removed.")
        }
      }
      setTeam((current) => current ? { ...current, users: upsertTeamUser(current.users, updated) } : current)
      toast.success(t("User details saved"), { description: updated.email })
      if (legacyRoleCleanupError) toast.warning(t("New role assigned, but cleanup needs attention"), { description: legacyRoleCleanupError })
      setEditingUser(null)
      void loadUsers()
    } catch (error) {
      toast.error(t("User details could not be saved"), { description: error instanceof Error ? error.message : t("Check the details and try again.") })
    } finally {
      setSavingUser(false)
    }
  }

  async function changeUserStatus() {
    if (!statusCandidate) return
    setChangingStatus(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before managing team users."))
      const nextStatus = statusCandidate.status === "Deactivated" ? "active" : "deactivated"
      const updated = await updateApiTeamUserStatus(session.access_token, statusCandidate.id, nextStatus)
      setTeam((current) => current ? { ...current, users: upsertTeamUser(current.users, updated) } : current)
      toast.success(t(nextStatus === "active" ? "User reactivated" : "User deactivated"), { description: updated.email })
      setStatusCandidate(null)
      void loadUsers()
    } catch (error) {
      toast.error(t("User status could not be changed"), { description: error instanceof Error ? error.message : t("Check your access and try again.") })
    } finally {
      setChangingStatus(false)
    }
  }

  async function openDeleteUser(user: ApiTeamUser) {
    setDeleteCandidate(user)
    setDeletionImpact(null)
    setReplacementUserId("")
    setReplacementSearch("")
    setReplacementUsers([])
    setReplacementUserTotal(0)
    setDeletionConfirmation("")
    setDeletionNameCopied(false)
    setLoadingDeletionImpact(true)
    try {
      const qaMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("usersQa") : null
      if (qaMode === "zero" || qaMode === "has-work") {
        const groups = qaMode === "has-work" ? [
          { key: "App_Live_Bookings.Booking_OwnerUserID", table: "Jobs", field: "Booking_OwnerUserID", count: 4 },
          { key: "Workflow_Tasks.Task_AssignedUserID", table: "Tasks", field: "Task_AssignedUserID", count: 7 },
          { key: "CRM_Accounts.Account_OwnerUserID", table: "Customer records", field: "Account_OwnerUserID", count: 2 },
        ] : []
        const qaEligibleUsers = (team?.users ?? []).filter((candidate) => candidate.id !== user.id && candidate.status === "Active" && candidate.authUserId !== currentAuthUserId).slice(0, 5)
        setReplacementUsers(qaEligibleUsers)
        setReplacementUserTotal(qaEligibleUsers.length)
        setDeletionImpact({
          alreadyDeleted: false,
          requiresReassignment: groups.length > 0,
          totalTransferable: groups.reduce((total, group) => total + group.count, 0),
          groups,
          cleanup: [],
          retainedAttribution: [],
          impactToken: `local-rendered-qa-${qaMode}`,
          eligibleUsers: [],
        })
        return
      }
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before removing users."))
      const impact = await getApiTeamUserDeletionImpact(session.access_token, user.id)
      setDeletionImpact(impact)
    } catch (error) {
      const unavailable = error instanceof Error && error.message === "USER_DELETION_IMPACT_UNAVAILABLE"
      toast.error(t(unavailable ? "Deletion tools are unavailable" : "Deletion impact could not be loaded"), {
        description: t(unavailable ? "The workspace backend needs the latest user lifecycle update before deletion can be checked safely." : "Refresh the users list and try again."),
      })
      setDeleteCandidate(null)
    } finally {
      setLoadingDeletionImpact(false)
    }
  }

  async function copyDeletionConfirmationName() {
    if (!deleteCandidate) return
    try {
      const value = deleteCandidate.displayName
      let copied = false
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value)
          copied = true
        } catch {
          copied = false
        }
      }
      if (!copied) {
        const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const fallback = document.createElement("textarea")
        fallback.value = value
        fallback.setAttribute("readonly", "")
        fallback.style.position = "fixed"
        fallback.style.inset = "0 auto auto -9999px"
        document.body.appendChild(fallback)
        fallback.select()
        copied = document.execCommand("copy")
        fallback.remove()
        activeElement?.focus()
      }
      if (!copied) throw new Error("Clipboard unavailable")
      if (deletionNameCopyTimerRef.current !== null) window.clearTimeout(deletionNameCopyTimerRef.current)
      setDeletionNameCopied(true)
      deletionNameCopyTimerRef.current = window.setTimeout(() => {
        setDeletionNameCopied(false)
        deletionNameCopyTimerRef.current = null
      }, 1600)
    } catch {
      setDeletionNameCopied(false)
      toast.error(t("Name could not be copied"), { description: t("Select the name and copy it manually.") })
    }
  }

  async function permanentlyDeleteUser() {
    if (!deleteCandidate || !deletionImpact) return
    setDeletingUser(true)
    try {
      const session = await getSupabaseSession()
      if (!session?.access_token) throw new Error(t("Sign in again before removing users."))
      const deletion = await deleteApiTeamUser(session.access_token, deleteCandidate.id, {
        impactToken: deletionImpact.impactToken,
        replacementUserId: deletionImpact.requiresReassignment ? replacementUserId : null,
        confirmation: deletionConfirmation,
      })
      setTeam((current) => current ? { ...current, users: current.users.filter((user) => user.id !== deleteCandidate.id) } : current)
      if (deletion.notificationEmail.status === "failed") {
        toast.warning(t("User deleted, but their email could not be sent"), { description: t("Their access is removed. Contact them separately to confirm the account deletion.") })
      } else {
        toast.success(t("User permanently deleted"), { description: t("A deletion confirmation email was sent to {email}.").replace("{email}", deleteCandidate.email) })
      }
      setDeleteCandidate(null)
      void loadUsers()
    } catch (error) {
      toast.error(t("User could not be deleted"), { description: error instanceof Error ? error.message : t("Review the reassignment summary and try again.") })
    } finally {
      setDeletingUser(false)
    }
  }

  const roles = authorizationState?.roles ?? []
  const assignableRoles = getAssignableRoles(roles)
  const predefinedRoles = assignableRoles.filter((role) => role.isSystem)
  const savedRoles = assignableRoles.filter((role) => !role.isSystem)
  const permissionAreas = getPermissionAreas(authorizationState?.permissions ?? [])
  const users = team?.users ?? []
  const totalUsers = team?.total ?? 0
  const editingUserRole = editingUser ? getPrimaryRole(editingUser, roles) : null
  const selectedInviteRole = assignableRoles.find((role) => role.id === inviteForm.roleId) ?? null
  const selectedEditRole = assignableRoles.find((role) => role.id === editForm.roleId) ?? null
  const visibleUsers = users
  const teamPhotoUrl = useCallback((user: ApiTeamUser) => (
    user.profilePhoto ? teamPhotoUrls.get(user.profilePhoto.path) ?? null : null
  ), [teamPhotoUrls])
  const passwordCandidateName = passwordCandidate?.firstName?.trim() || passwordCandidate?.displayName.trim().split(/\s+/)[0] || ""
  const resetPasswordTitle = t("Reset {name}’s password").replace("{name}", passwordCandidateName)
  const resetPasswordDescription = t("Choose a new password for {name}. It will be used at the next sign-in. Existing sessions will stay active.").replace("{name}", passwordCandidateName)
  const resetPasswordHint = t(`${PASSWORD_POLICY_DESCRIPTION} Share the new password with {name} securely.`).replace("{name}", passwordCandidateName)
  const newUserPasswordError = newUserPassword ? getPasswordPolicyError(newUserPassword) : null
  const resetPasswordAction = t(resettingPassword ? "Resetting {name}’s password" : "Reset {name}’s password").replace("{name}", passwordCandidateName)

  function renderRoleComposer(target: "invite" | "edit" | "standalone") {
    const backLabel = target === "invite" ? t("Back to user details") : target === "edit" ? t("Back to edit user") : t("Back to users")
    const onBack = () => {
      if (target === "standalone") setCreateRoleOpen(false)
      else closeRoleComposer(target)
    }

    return (
      <div className="grid gap-5">
        <button
          type="button"
          disabled={creatingRole}
          className="inline-flex min-h-9 w-fit items-center gap-2 rounded-[var(--md-radius-lg)] px-2 text-[12px] font-medium text-[var(--md-text)] transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" strokeWidth={1.5} aria-hidden="true" />
          {backLabel}
        </button>
        <DialogHeader className="text-start">
          <DialogTitle className="text-balance">{t("Make a role")}</DialogTitle>
          <DialogDescription className="text-pretty">{t("Choose permissions for a reusable workspace role. You can assign it to more people later.")}</DialogDescription>
        </DialogHeader>
        <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">
          {t("Role name")}
          <SettingsInput
            value={roleNameDraft}
            onChange={(event) => setRoleNameDraft(event.target.value)}
            maxLength={50}
            autoComplete="off"
            placeholder={t("For example, Finance approver")}
            autoFocus
          />
          <span className="text-[11.5px] font-normal leading-5 text-[var(--md-text)]">{t("Use a name people will recognise when assigning access.")}</span>
        </label>
        <RolePermissionMatrix areas={permissionAreas} permissionValues={newRolePermissionDraft} onChange={setNewRolePermissionDraft} />
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={creatingRole} onClick={onBack}>{t("Cancel")}</Button>
          <Button type="button" disabled={creatingRole || !roleNameDraft.trim() || !newRolePermissionDraft.length} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]" onClick={() => void createWorkspaceRole(target)}>
            {creatingRole ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
            {t(creatingRole ? "Creating role" : "Create role")}
          </Button>
        </DialogFooter>
      </div>
    )
  }

  const columns = useMemo<DataTableColumn<ApiTeamUser>[]>(() => [
    {
      id: "user",
      label: t("User"),
      kind: "identity",
      width: 220,
      minWidth: 190,
      canHide: false,
      canPin: true,
      sortValue: (user) => user.displayName,
      cell: (user) => <TeamUserIdentity user={user} photoUrl={teamPhotoUrl(user)} />,
    },
    {
      id: "office",
      label: t("Office"),
      kind: "text",
      width: 176,
      minWidth: 138,
      sortValue: (user) => user.offices[0]?.name ?? "",
      cellTitle: (user) => user.offices.map(getOfficeLabel).join(" · ") || t("No office assigned"),
      cell: (user) => <div className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate text-[12.5px] text-[var(--md-text)]">{user.offices[0] ? getOfficeLabel(user.offices[0]) : t("No office assigned")}</span>{user.offices.length > 1 ? <span className="shrink-0 text-[11px] font-medium text-[var(--md-subtle)]">+{user.offices.length - 1}</span> : null}</div>,
    },
    {
      id: "role",
      label: t("Role"),
      kind: "status",
      width: 144,
      minWidth: 112,
      sortValue: (user) => getRoleDisplayName(getPrimaryRole(user, roles)),
      cell: (user) => {
        const role = getPrimaryRole(user, roles)
        return <div className="min-w-0 overflow-hidden"><StatusPill className="max-w-full truncate" tone={role?.isLegacyCustom ? "amber" : role?.isSystem ? "blue" : "teal"}>{t(getRoleDisplayName(role))}</StatusPill></div>
      },
    },
    {
      id: "status",
      label: t("Status"),
      kind: "status",
      width: 104,
      minWidth: 96,
      sortValue: (user) => user.status,
      cell: (user) => <div className="min-w-0 overflow-hidden"><StatusPill className="max-w-full truncate" tone={user.status === "Active" ? "green" : user.status === "Deactivated" ? "neutral" : "amber"}>{t(user.status)}</StatusPill></div>,
    },
    {
      id: "actions",
      label: t("Actions"),
      kind: "actions",
      align: "end",
      width: 160,
      minWidth: 148,
      canHide: false,
      canPin: false,
      resizable: false,
      cell: (user) => user.status === "Invited" ? (
        <div className="flex items-center justify-end gap-1">
          <UserActionTooltip label={t(resendingUserId === user.id ? "Resending" : "Resend invite")}><Button type="button" variant="ghost" size="icon" disabled={resendingUserId === user.id || deletingInvite} className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]" aria-label={`${t("Resend invite")} ${user.displayName}`} onClick={() => void resendInvitation(user)}>{resendingUserId === user.id ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mail className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}</Button></UserActionTooltip>
          <UserActionTooltip label={t("Delete invite")}><Button type="button" variant="ghost" size="icon" disabled={resendingUserId === user.id || deletingInvite} className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[rgba(209,78,78,0.08)] hover:text-[var(--md-red)]" aria-label={`${t("Delete invite")} ${user.displayName}`} onClick={() => setDeleteInviteCandidate(user)}><Trash2 className="size-3.5" strokeWidth={1.45} aria-hidden="true" /></Button></UserActionTooltip>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1">
          <UserActionTooltip label={user.authUserId === currentAuthUserId ? t("Use Security settings to change your own password") : user.status !== "Active" || !user.authUserId ? t("Reactivate this user before resetting their password") : t("Reset password")}><Button type="button" variant="ghost" size="icon" disabled={user.authUserId === currentAuthUserId || user.status !== "Active" || !user.authUserId} className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]" aria-label={`${t("Reset password")} ${user.displayName}`} onClick={() => openPasswordReset(user)}><KeyRound className="size-3.5" strokeWidth={1.5} aria-hidden="true" /></Button></UserActionTooltip>
          <UserActionTooltip label={t("Edit")}><Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]" aria-label={`${t("Edit")} ${user.displayName}`} onClick={() => openUserEditor(user)}><EditUser02 className="size-3.5" strokeWidth={1.5} aria-hidden="true" /></Button></UserActionTooltip>
          <UserActionTooltip label={t(user.status === "Deactivated" ? "Reactivate" : "Deactivate")}><Button type="button" variant="ghost" size="icon" disabled={user.authUserId === currentAuthUserId} className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]" aria-label={`${t(user.status === "Deactivated" ? "Reactivate" : "Deactivate")} ${user.displayName}`} onClick={() => setStatusCandidate(user)}>{user.status === "Deactivated" ? <UserRoundCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" /> : <Ban className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}</Button></UserActionTooltip>
          <UserActionTooltip label={user.authUserId === currentAuthUserId ? t("You cannot remove your own access") : t("Delete user")}><Button type="button" variant="ghost" size="icon" disabled={user.authUserId === currentAuthUserId} className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[rgba(209,78,78,0.08)] hover:text-[var(--md-red)]" aria-label={`${t("Delete user")} ${user.displayName}`} onClick={() => void openDeleteUser(user)}><Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" /></Button></UserActionTooltip>
        </div>
      ),
    },
  ], [currentAuthUserId, deletingInvite, resendingUserId, roles, t, teamPhotoUrl])

  return (
    <>
      <SettingsPageHeader
        eyebrow={t("Admin / Users")}
        title={t("Users")}
        description={t("Invite people, assign reusable roles and manage workspace access in one place.")}
        descriptionPlacement="under-title"
        actions={(
          <div className="flex items-center gap-2">
            {compactAction(t("Create role"), () => beginRoleCreation("standalone"))}
            {primaryAction(t("Invite user"), () => {
              setRoleComposerTarget(null)
              setInviteOpen(true)
            })}
          </div>
        )}
      />
      <div className="mt-[var(--md-page-stack-gap)]">
        {loadError ? (
          <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]" role="alert">
            <p className="text-[13px] font-medium text-[var(--md-red)]">{t("Users could not be loaded.")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{loadError}</p>
            <div className="mt-3">{compactAction(t("Retry"), () => void loadUsers())}</div>
          </div>
        ) : (
          <>
            {authorizationError ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 py-3 shadow-[var(--md-shadow-line)]" role="alert">
                <div>
                  <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Users loaded, but roles could not be loaded.")}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--md-text)]" dir="auto">{authorizationError}</p>
                </div>
                {compactAction(t("Retry roles"), () => void loadAuthorization())}
              </div>
            ) : null}
            <div className="hidden xl:block">
              <DataTable
                ariaLabel={t("Workspace users")}
                columns={columns}
                rows={visibleUsers}
                getRowKey={(user) => user.id}
                storageKey="settings-users-v4"
                serverSorting={{ value: userSort, onChange: (next) => { setUserSort(next ?? { id: "user", direction: "asc" }); setUserOffset(0) } }}
                pagination={{ offset: userOffset, limit: 20, total: totalUsers, loading, onOffsetChange: setUserOffset }}
                minimumWidth={804}
                tableClassName="table-fixed"
                toolbarSearch={(
                  <label className="relative block w-[min(280px,70vw)]">
                    <span className="sr-only">{t("Search users")}</span>
                    <Search className="pointer-events-none absolute start-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} />
                    <SettingsInput value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("Search users")} className="ps-9" />
                  </label>
                )}
                emptyState={(
                  <div className="grid min-h-40 place-items-center px-6 text-center">
                    <div>
                      <p className="text-[13px] font-medium text-[var(--md-ink)]">{loading ? t("Loading users…") : t("No users found")}</p>
                      <p className="mt-1 text-[12px] text-[var(--md-text)]">{loading ? t("Checking the live workspace roster.") : t("Invite a user or clear the search to continue.")}</p>
                    </div>
                  </div>
                )}
              />
            </div>
            <div className="grid gap-3 xl:hidden">
              <label className="relative block">
                <span className="sr-only">{t("Search users")}</span>
                <Search className="pointer-events-none absolute start-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} />
                <SettingsInput value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("Search users")} className="ps-9" />
              </label>
              {visibleUsers.map((user) => {
                const role = getPrimaryRole(user, roles)
                return (
                  <article key={user.id} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
                    <div className="flex items-start justify-between gap-3">
                      <TeamUserIdentity user={user} photoUrl={teamPhotoUrl(user)} />
                      <StatusPill tone={user.status === "Active" ? "green" : user.status === "Deactivated" ? "neutral" : "amber"}>{t(user.status)}</StatusPill>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--md-line)] pt-3 text-[12px]">
                      <div className="min-w-0"><dt className="text-[11px] text-[var(--md-subtle)]">{t("Role")}</dt><dd className="mt-1 truncate font-medium text-[var(--md-ink)]">{t(getRoleDisplayName(role))}</dd></div>
                      <div className="min-w-0"><dt className="text-[11px] text-[var(--md-subtle)]">{t("Office")}</dt><dd className="mt-1 truncate font-medium text-[var(--md-ink)]">{user.offices[0] ? getOfficeLabel(user.offices[0]) : t("No office assigned")}</dd></div>
                    </dl>
                    <div className="mt-3 flex items-center justify-end gap-1">
                      {user.status === "Invited" ? (
                        <>
                          <Button type="button" variant="ghost" size="sm" disabled={resendingUserId === user.id || deletingInvite} onClick={() => void resendInvitation(user)}>{resendingUserId === user.id ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mail className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}{t(resendingUserId === user.id ? "Resending" : "Resend invite")}</Button>
                          <Button type="button" variant="ghost" size="icon" disabled={resendingUserId === user.id || deletingInvite} className="text-[var(--md-red)]" aria-label={`${t("Delete invite")} ${user.displayName}`} onClick={() => setDeleteInviteCandidate(user)}><Trash2 className="size-3.5" strokeWidth={1.45} aria-hidden="true" /></Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="ghost" size="sm" disabled={user.authUserId === currentAuthUserId || user.status !== "Active" || !user.authUserId} onClick={() => openPasswordReset(user)}><KeyRound className="size-3.5" strokeWidth={1.5} aria-hidden="true" />{t("Reset password")}</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => openUserEditor(user)}><EditUser02 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />{t("Edit")}</Button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
              {!visibleUsers.length ? <div className="grid min-h-40 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-6 text-center shadow-[var(--md-shadow-soft)]"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{loading ? t("Loading users…") : t("No users found")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{loading ? t("Checking the live workspace roster.") : t("Invite a user or clear the search to continue.")}</p></div></div> : null}
              {totalUsers > 0 ? (
                <Pagination
                  page={Math.floor(userOffset / 20) + 1}
                  pageCount={Math.max(1, Math.ceil(totalUsers / 20))}
                  totalItems={totalUsers}
                  pageSize={20}
                  onPageChange={(page) => setUserOffset((page - 1) * 20)}
                  itemLabel="users"
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={(open) => {
        if (inviting || creatingRole) return
        setInviteOpen(open)
        if (!open && roleComposerTarget === "invite") setRoleComposerTarget(null)
      }}>
        <DialogContent className={accessDialogShellClassName}>
          <div className="relative isolate min-h-0 overflow-hidden">
            <AnimatePresence mode="sync" initial={false} custom={roleComposerTarget === "invite" ? accessPanelDistance : -accessPanelDistance}>
            {roleComposerTarget === "invite" ? (
              <motion.div key="invite-role" className={accessDialogPanelClassName} custom={accessPanelDistance} variants={accessDialogPanelVariants} initial={shouldReduceMotion ? false : "enter"} animate="visible" exit={shouldReduceMotion ? undefined : "exit"} transition={accessPanelTransition}>
                {renderRoleComposer("invite")}
              </motion.div>
            ) : (
              <motion.div key="invite-details" className={accessDialogPanelClassName} custom={-accessPanelDistance} variants={accessDialogPanelVariants} initial={shouldReduceMotion ? false : "enter"} animate="visible" exit={shouldReduceMotion ? undefined : "exit"} transition={accessPanelTransition}>
                <DialogHeader className="text-start">
                  <DialogTitle>{t("Invite a user")}</DialogTitle>
                  <DialogDescription>{t("They’ll receive a branded Multideck invitation and create their password before entering this workspace.")}</DialogDescription>
                </DialogHeader>
                <form className="mt-5 grid gap-5" onSubmit={sendInvitation}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("First name")}<SettingsInput value={inviteForm.firstName} onChange={(event) => setInviteForm((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" /></label>
                    <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Last name")}<SettingsInput value={inviteForm.lastName} onChange={(event) => setInviteForm((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" /></label>
                  </div>
                  {(team?.departments ?? []).some((department) => department.isActive) ? (
                    <fieldset className="grid gap-2">
                      <legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Departments")}</legend>
                      <p className="text-[11.5px] leading-5 text-[var(--md-text)]">{t("Choose every department this person belongs to.")}</p>
                      <div className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 sm:grid-cols-2">
                        {(team?.departments ?? []).filter((department) => department.isActive).map((department) => (
                          <label key={department.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[12px] text-[var(--md-ink)]"><Checkbox checked={inviteForm.departmentIds.includes(department.id)} onCheckedChange={(checked) => setInviteForm((current) => ({ ...current, departmentIds: checked ? [...current.departmentIds, department.id] : current.departmentIds.filter((id) => id !== department.id) }))} /><span>{department.name}</span></label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Work email")}<SettingsInput value={inviteForm.email} onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))} type="email" inputMode="email" autoComplete="email" dir="ltr" required placeholder="name@company.com" data-i18n-skip /></label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Office")}<Select value={inviteForm.officeId} onValueChange={(officeId) => setInviteForm((current) => ({ ...current, officeId }))}><SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)]"><SelectValue placeholder={t("Choose an office")} /></SelectTrigger><SelectContent>{(team?.offices ?? []).map((office) => <SelectItem key={office.id} value={office.id}>{getOfficeLabel(office)}</SelectItem>)}</SelectContent></Select></label>
                    <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">
                      {t("Role")}
                      <Select value={inviteForm.roleId} onValueChange={(roleId) => {
                        if (roleId === makeRoleSelectValue) beginRoleCreation("invite")
                        else setInviteForm((current) => ({ ...current, roleId, roleTitle: assignableRoles.find((role) => role.id === roleId)?.name ?? current.roleTitle }))
                      }}>
                        <SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)]"><SelectValue placeholder={t("Choose a role")} /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup><SelectLabel>{t("Predefined roles")}</SelectLabel>{predefinedRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectGroup>
                          {savedRoles.length ? <><SelectSeparator /><SelectGroup><SelectLabel>{t("Saved roles")}</SelectLabel>{savedRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectGroup></> : null}
                          <SelectSeparator />
                          <SelectItem value={makeRoleSelectValue}><span className="flex items-center gap-2 font-medium text-[var(--md-accent)]"><Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />{t("Make a role")}</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  {selectedInviteRole ? <div className="flex items-start justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3.5 py-3 shadow-[var(--md-shadow-line)]"><div className="min-w-0"><p className="text-[13px] font-medium text-[var(--md-ink)]">{selectedInviteRole.name}</p><p className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">{t(selectedInviteRole.description || "Reusable workspace role.")}</p></div><StatusPill tone={selectedInviteRole.isSystem ? "blue" : "teal"}>{t(selectedInviteRole.isSystem ? "Predefined" : "Saved role")}</StatusPill></div> : null}
                  <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Invite expires")}<Select value={inviteForm.invitationExpiry} onValueChange={(invitationExpiry) => setInviteForm((current) => ({ ...current, invitationExpiry: invitationExpiry as ApiInvitationExpiry }))}><SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="3d">{t("3 days")}</SelectItem><SelectItem value="7d">{t("7 days")}</SelectItem><SelectItem value="30d">{t("30 days")}</SelectItem><SelectItem value="never">{t("Never (until accepted)")}</SelectItem></SelectContent></Select></label>
                  <DialogFooter className="mt-2"><Button type="button" variant="ghost" disabled={inviting} onClick={() => setInviteOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={inviting || !team?.offices.length || !assignableRoles.length} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">{inviting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Mail className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}{t(inviting ? "Sending invitation" : "Send invitation")}</Button></DialogFooter>
                </form>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createRoleOpen} onOpenChange={(open) => !creatingRole && setCreateRoleOpen(open)}>
        <DialogContent className="max-h-[min(860px,calc(100dvh-32px))] overflow-y-auto border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[760px]">
          {renderRoleComposer("standalone")}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteInviteCandidate)} onOpenChange={(open) => !open && !deletingInvite && setDeleteInviteCandidate(null)}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[460px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("Delete this invitation?")}</DialogTitle>
            <DialogDescription>{t("This removes the pending invitation and workspace access. The person will need a new invitation before they can sign in.")}</DialogDescription>
          </DialogHeader>
          {deleteInviteCandidate ? <div className="mt-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3"><TeamUserIdentity user={deleteInviteCandidate} /></div> : null}
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" disabled={deletingInvite} onClick={() => setDeleteInviteCandidate(null)}>{t("Cancel")}</Button>
            <Button type="button" disabled={deletingInvite} className="bg-[var(--md-red)] text-white hover:opacity-90" onClick={() => void deleteInvitation()}>
              {deletingInvite ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="size-3.5" strokeWidth={1.45} aria-hidden="true" />}
              {t(deletingInvite ? "Deleting invite" : "Delete invite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordCandidate)} onOpenChange={(open) => {
        if (open || resettingPassword) return
        closePasswordReset()
      }}>
        <DialogContent className="gap-0 rounded-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-5 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[500px] sm:p-6">
          <DialogHeader className="gap-2.5 pe-8 text-start">
            <DialogTitle className="text-[18px] leading-[1.2] text-balance">{resetPasswordTitle}</DialogTitle>
            <DialogDescription className="max-w-[52ch] text-[13px] leading-5 text-pretty">{resetPasswordDescription}</DialogDescription>
          </DialogHeader>
          <form className="mt-6 grid gap-6" onSubmit={resetUserPassword}>
            <div className="grid gap-5">
              <label className="grid gap-2.5 text-[13px] font-medium leading-5 text-[var(--md-ink)]">
                {t("New password")}
                <SettingsInput className="h-11 rounded-[var(--md-radius-xl)] px-3.5 text-base sm:text-sm" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required aria-invalid={Boolean(newUserPasswordError)} aria-describedby={newUserPasswordError ? "admin-reset-password-hint admin-reset-password-policy-error" : "admin-reset-password-hint"} autoFocus />
              </label>
              <label className="grid gap-2.5 text-[13px] font-medium leading-5 text-[var(--md-ink)]">
                {t("Confirm new password")}
                <SettingsInput className="h-11 rounded-[var(--md-radius-xl)] px-3.5 text-base sm:text-sm" value={confirmUserPassword} onChange={(event) => setConfirmUserPassword(event.target.value)} type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required aria-invalid={Boolean(confirmUserPassword && newUserPassword !== confirmUserPassword)} aria-describedby={confirmUserPassword && newUserPassword !== confirmUserPassword ? "admin-reset-password-mismatch" : "admin-reset-password-hint"} />
              </label>
              <p id="admin-reset-password-hint" className="text-[12px] leading-5 text-[var(--md-text)]">{resetPasswordHint}</p>
              {newUserPasswordError ? <p id="admin-reset-password-policy-error" className="text-[12px] font-medium leading-5 text-[var(--md-red)]" role="alert">{t(newUserPasswordError)}</p> : null}
              {confirmUserPassword && newUserPassword !== confirmUserPassword ? <p id="admin-reset-password-mismatch" className="text-[12px] font-medium leading-5 text-[var(--md-red)]" role="alert">{t("Passwords do not match.")}</p> : null}
            </div>
            <DialogFooter className="mx-0 mb-0 gap-3 rounded-none bg-transparent p-0 shadow-none">
              <Button type="button" variant="ghost" disabled={resettingPassword} className="h-9 w-full rounded-[var(--md-radius-lg)] px-4 sm:w-auto" onClick={closePasswordReset}>{t("Cancel")}</Button>
              <Button type="submit" disabled={resettingPassword || !passwordMeetsPolicy(newUserPassword) || newUserPassword !== confirmUserPassword} className="h-9 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)] sm:w-auto">
                {resettingPassword ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <KeyRound className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                {resetPasswordAction}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => {
        if (open || savingUser || creatingDepartment || creatingRole) return
        setEditingUser(null)
        if (roleComposerTarget === "edit") setRoleComposerTarget(null)
      }}>
        <DialogContent className={accessDialogShellClassName}>
          <div className="relative isolate min-h-0 overflow-hidden">
            <AnimatePresence mode="sync" initial={false} custom={roleComposerTarget === "edit" ? accessPanelDistance : -accessPanelDistance}>
            {roleComposerTarget === "edit" ? (
              <motion.div key="edit-role" className={accessDialogPanelClassName} custom={accessPanelDistance} variants={accessDialogPanelVariants} initial={shouldReduceMotion ? false : "enter"} animate="visible" exit={shouldReduceMotion ? undefined : "exit"} transition={accessPanelTransition}>
                {renderRoleComposer("edit")}
              </motion.div>
            ) : (
              <motion.div key="edit-details" className={accessDialogPanelClassName} custom={-accessPanelDistance} variants={accessDialogPanelVariants} initial={shouldReduceMotion ? false : "enter"} animate="visible" exit={shouldReduceMotion ? undefined : "exit"} transition={accessPanelTransition}>
          <DialogHeader className="text-start"><DialogTitle className="text-balance">{t("Edit user")}</DialogTitle><DialogDescription className="text-pretty">{t("Update their profile, office, departments and workspace role. Their email address stays tied to their sign-in account.")}</DialogDescription></DialogHeader>
          <form className="mt-5 grid gap-5" onSubmit={saveUser}>
            {editingUserRole?.isLegacyCustom ? <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-amber)_10%,var(--md-surface))] px-3.5 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("This user has an older one-user Custom role. Choose a saved role to replace it.")}</div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("First name")}<SettingsInput className="text-base sm:text-sm" value={editForm.firstName} onChange={(event) => setEditForm((current) => ({ ...current, firstName: event.target.value }))} maxLength={50} required /></label>
              <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Last name")}<SettingsInput className="text-base sm:text-sm" value={editForm.lastName} onChange={(event) => setEditForm((current) => ({ ...current, lastName: event.target.value }))} maxLength={50} required /></label>
            </div>
            <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Job title")}<SettingsInput className="text-base sm:text-sm" value={editForm.jobTitle} onChange={(event) => setEditForm((current) => ({ ...current, jobTitle: event.target.value }))} maxLength={120} placeholder={t("For example, Operations manager")} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Office")}<Select value={editForm.officeId} onValueChange={(officeId) => setEditForm((current) => ({ ...current, officeId }))}><SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger><SelectContent>{(team?.offices ?? []).map((office) => <SelectItem key={office.id} value={office.id}>{getOfficeLabel(office)}</SelectItem>)}</SelectContent></Select></label>
              <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">
                {t("Role")}
                <Select value={editForm.roleId} onValueChange={(roleId) => roleId === makeRoleSelectValue ? beginRoleCreation("edit") : setEditForm((current) => ({ ...current, roleId }))}>
                  <SelectTrigger className="h-10 w-full rounded-[var(--md-radius-lg)]"><SelectValue placeholder={t("Choose a role")} /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup><SelectLabel>{t("Predefined roles")}</SelectLabel>{predefinedRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectGroup>
                    {savedRoles.length ? <><SelectSeparator /><SelectGroup><SelectLabel>{t("Saved roles")}</SelectLabel>{savedRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectGroup></> : null}
                    <SelectSeparator />
                    <SelectItem value={makeRoleSelectValue}><span className="flex items-center gap-2 font-medium text-[var(--md-accent)]"><Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />{t("Make a role")}</span></SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            {selectedEditRole ? <div className="flex items-start justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3.5 py-3 shadow-[var(--md-shadow-line)]"><div className="min-w-0"><p className="text-[13px] font-medium text-[var(--md-ink)]">{selectedEditRole.name}</p><p className="mt-1 text-[11.5px] leading-5 text-[var(--md-text)]">{t(selectedEditRole.description || "Reusable workspace role.")}</p></div><StatusPill tone={selectedEditRole.isSystem ? "blue" : "teal"}>{t(selectedEditRole.isSystem ? "Predefined" : "Saved role")}</StatusPill></div> : null}
            <fieldset className="grid gap-3">
              <legend className="text-[12px] font-medium text-[var(--md-ink)]">{t("Departments")}</legend>
              <p className="text-pretty text-[11.5px] leading-5 text-[var(--md-text)]">{t("Assign one or more departments. Create a new department here if it is missing.")}</p>
              {(team?.departments ?? []).length ? (
                <div className="grid gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-3 sm:grid-cols-2">
                  {(team?.departments ?? []).map((department) => {
                    const checked = editForm.departmentIds.includes(department.id)
                    return (
                      <label key={department.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[12px] text-[var(--md-ink)] transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] motion-reduce:transition-none">
                        <Checkbox disabled={!department.isActive && !checked} checked={checked} onCheckedChange={(nextChecked) => setEditForm((current) => ({ ...current, departmentIds: nextChecked ? [...new Set([...current.departmentIds, department.id])] : current.departmentIds.filter((id) => id !== department.id) }))} />
                        <span className="min-w-0 break-words" data-i18n-skip dir="auto">{department.name}{department.isActive ? "" : ` · ${t("Inactive")}`}</span>
                      </label>
                    )
                  })}
                </div>
              ) : <p className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-3 text-[12px] leading-5 text-[var(--md-text)]">{t("No departments yet. Create the first one below.")}</p>}
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Department name")}<SettingsInput className="text-base sm:text-sm" value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} maxLength={80} placeholder={t("For example, Customs")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createAndAssignDepartment() } }} /></label>
                <Button type="button" variant="secondary" disabled={creatingDepartment || !newDepartmentName.trim()} className="h-10 rounded-[var(--md-radius-lg)] transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100" onClick={() => void createAndAssignDepartment()}>{creatingDepartment ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}{t(creatingDepartment ? "Creating department" : "Create department")}</Button>
              </div>
            </fieldset>
            <DialogFooter className="mt-2"><Button type="button" variant="ghost" disabled={savingUser || creatingDepartment} onClick={() => setEditingUser(null)}>{t("Cancel")}</Button><Button type="submit" disabled={savingUser || creatingDepartment || !editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.officeId || !editForm.roleId} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]">{savingUser ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}{t(savingUser ? "Saving user" : "Save user")}</Button></DialogFooter>
          </form>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusCandidate)} onOpenChange={(open) => !open && !changingStatus && setStatusCandidate(null)}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[480px]">
          <DialogHeader className="text-start"><DialogTitle className="text-balance">{t(statusCandidate?.status === "Deactivated" ? "Reactivate this user?" : "Deactivate this user?")}</DialogTitle><DialogDescription className="text-pretty">{t(statusCandidate?.status === "Deactivated" ? "They will regain access with their existing sign-in and assigned role." : "They will lose access immediately. Their profile, assignments and history stay in the workspace, and you can reactivate them later.")}</DialogDescription></DialogHeader>
          {statusCandidate ? <div className="mt-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3"><TeamUserIdentity user={statusCandidate} /></div> : null}
          <DialogFooter className="mt-4"><Button type="button" variant="ghost" disabled={changingStatus} onClick={() => setStatusCandidate(null)}>{t("Cancel")}</Button><Button type="button" disabled={changingStatus} className={statusCandidate?.status === "Deactivated" ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" : "bg-[var(--md-amber)] text-white"} onClick={() => void changeUserStatus()}>{changingStatus ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}{t(statusCandidate?.status === "Deactivated" ? "Reactivate user" : "Deactivate user")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && !deletingUser && setDeleteCandidate(null)}>
        <DialogContent className="max-h-[min(820px,calc(100dvh-16px))] max-w-[calc(100%-1rem)] overflow-y-auto border-0 bg-[var(--md-surface)] p-3 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-h-[min(820px,calc(100dvh-32px))] sm:max-w-[640px] sm:p-4">
          <DialogHeader className="text-start"><DialogTitle className="text-balance">{t("Permanently delete this user?")}</DialogTitle><DialogDescription className="text-pretty">{t("Their sign-in, memberships and personal settings will be removed. Audit-required history keeps a non-personal deleted-user reference.")}</DialogDescription></DialogHeader>
          {deleteCandidate ? <div className="mt-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3"><TeamUserIdentity user={deleteCandidate} /></div> : null}
          {loadingDeletionImpact ? <div className="grid min-h-28 place-items-center" role="status"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)] motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">{t("Checking assigned work")}</span></div> : deletionImpact ? (
            <div className="mt-4 grid gap-5">
              {deletionImpact.requiresReassignment ? <section className="grid gap-3"><div><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Reassign active work before deletion")}</p><p className="mt-1 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("The transfer and deletion run in one transaction. If anything changes, deletion stops so you can review the updated scope.")}</p></div><div className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">{deletionImpact.groups.map((group) => <div key={group.key} className="flex items-center justify-between gap-4 text-[12px]"><span className="min-w-0 break-words text-[var(--md-text)]">{group.table}</span><span className="tabular-nums font-medium text-[var(--md-ink)]">{group.count}</span></div>)}<div className="mt-1 flex items-center justify-between gap-4 pt-2 text-[13px] font-medium"><span>{t("Total records to transfer")}</span><span className="tabular-nums">{deletionImpact.totalTransferable}</span></div></div><label className="grid gap-2 text-[12px] font-medium text-[var(--md-ink)]">{t("Transfer to")}<span className="relative block"><Search className="pointer-events-none absolute start-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} /><SettingsInput value={replacementSearch} onChange={(event) => setReplacementSearch(event.target.value)} placeholder={t("Search users")} className="ps-9" /></span><Select value={replacementUserId} onValueChange={setReplacementUserId}><SelectTrigger disabled={loadingReplacementUsers || !replacementUsers.length} className="h-12 w-full rounded-[var(--md-radius-lg)]"><SelectValue placeholder={t(loadingReplacementUsers ? "Loading users…" : "Choose an active user")} /></SelectTrigger><SelectContent>{replacementUsers.map((user) => <SelectItem key={user.id} value={user.id}><TeamUserIdentity user={user} photoUrl={user.profilePhoto ? replacementPhotoUrls.get(user.profilePhoto.path) ?? null : null} /></SelectItem>)}</SelectContent></Select>{!loadingReplacementUsers && replacementUserTotal > replacementUsers.length ? <span className="text-[11.5px] font-normal text-[var(--md-subtle)]">{t("Search users")} · <span data-i18n-skip dir="ltr">{replacementUserTotal}</span></span> : null}</label></section> : <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-green)_9%,var(--md-surface))] p-3.5"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("No active work needs reassignment")}</p><p className="mt-1 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t("Deletion can continue without transferring jobs, tasks or ownership.")}</p></div>}
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">
                  <span>{t("Type {name} to confirm").split("{name}")[0]}</span>
                  <button
                    type="button"
                    aria-label={deletionNameCopied ? t("Name copied") : `${t("Copy name")}: ${deleteCandidate?.displayName ?? ""}`}
                    title={deletionNameCopied ? t("Copied") : t("Copy name")}
                    className="group inline-flex min-h-7 items-center gap-1.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-2 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,color,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-a10)] hover:text-[var(--md-accent)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                    onClick={() => void copyDeletionConfirmationName()}
                  >
                    <CopyFeedbackTransition value={deleteCandidate?.displayName ?? ""} copiedValue={t("Copied")} active={deletionNameCopied} effect="slot" inline ariaHidden animateIntrinsicWidth className="h-[1em] leading-none" originalDirection="auto" copiedDirection="auto" />
                    <CopyStatusIcon copied={deletionNameCopied} iconClassName="size-3.5" className="shrink-0" />
                  </button>
                  <span>{t("Type {name} to confirm").split("{name}")[1]}</span>
                </div>
                <SettingsInput aria-label={deleteCandidate ? t("Type {name} to confirm").replace("{name}", deleteCandidate.displayName) : t("Confirmation name")} className="text-base sm:text-sm" value={deletionConfirmation} onChange={(event) => setDeletionConfirmation(event.target.value)} placeholder={deleteCandidate?.displayName ?? ""} dir="auto" data-i18n-skip />
                <span className="sr-only" role="status" aria-live="polite">{deletionNameCopied ? t("Name copied") : ""}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter className="-mx-3 -mb-3 mt-5 sm:-mx-4 sm:-mb-4"><Button type="button" variant="ghost" disabled={deletingUser} onClick={() => setDeleteCandidate(null)}>{t("Cancel")}</Button><Button type="button" disabled={deletingUser || !deletionImpact || (deletionImpact.requiresReassignment && !replacementUserId) || deletionConfirmation.trim() !== deleteCandidate?.displayName.trim()} className="bg-[var(--md-red)] text-white hover:opacity-90" onClick={() => void permanentlyDeleteUser()}>{deletingUser ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}{t(deletingUser ? "Deleting user" : "Permanently delete user")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const mailProviderCopy: Record<MailProvider, { label: string }> = {
  gmail: { label: "Gmail" },
  outlook: { label: "Outlook" },
}

const mailProviderLogos: Record<MailProvider, string> = {
  gmail: gmailLogo,
  outlook: outlookLogo,
}

/**
 * The live state of the mail connections behind the Inbox workspace.
 *
 * This replaced a prototype that hard-coded "Gmail — Connected" for every
 * workspace, which is the worst thing an integrations screen can do: it told
 * operators mail was flowing when nothing was connected at all. Everything here
 * comes from the authenticated tenant `inbox-api` Edge Function, and a provider
 * with no connection says so.
 */
function IntegrationsTab({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [connections, setConnections] = useState<InboxConnection[] | null>(null)
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null)
  const [providerAvailability, setProviderAvailability] = useState<InboxProviderAvailability[] | null>(null)
  const [providerAvailabilityError, setProviderAvailabilityError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mailboxLoadError, setMailboxLoadError] = useState<string | null>(null)
  const [busyProvider, setBusyProvider] = useState<MailProvider | null>(null)
  const [disconnectCandidate, setDisconnectCandidate] = useState<InboxConnection | null>(null)
  const [defaultInboxProvider, setDefaultInboxProvider] = useState<MailProvider | null>(null)
  const [defaultInboxProviderLoaded, setDefaultInboxProviderLoaded] = useState(false)
  const [defaultInboxProviderError, setDefaultInboxProviderError] = useState<string | null>(null)
  const [savingDefaultInboxProvider, setSavingDefaultInboxProvider] = useState<MailProvider | null>(null)
  const [groupMailboxAddress, setGroupMailboxAddress] = useState("")
  const [groupMailboxError, setGroupMailboxError] = useState<string | null>(null)
  const [sharedMailboxAddress, setSharedMailboxAddress] = useState("")
  const [sharedMailboxError, setSharedMailboxError] = useState<string | null>(null)
  const [writingProfilePrompt, setWritingProfilePrompt] = useState<DexterWritingProfile | null>(null)
  const [writingProfilePromptBusy, setWritingProfilePromptBusy] = useState(false)
  const [writingProfilePromptKey, setWritingProfilePromptKey] = useState<string | null>(null)
  const [writingProfilePromptDismissed, setWritingProfilePromptDismissed] = useState(true)
  const connectedMailProviders = useMemo(() => (["gmail", "outlook"] as MailProvider[]).filter((provider) => {
    const connection = connections?.find((candidate) => candidate.provider === provider)
    return Boolean(
      connection
      && (connection.status === "connected" || connection.status === "syncing")
      && mailboxes?.some((mailbox) => mailbox.provider === provider),
    )
  }), [connections, mailboxes])
  const effectiveDefaultInboxProvider = resolveDefaultInboxProvider(
    mailboxes ?? [],
    defaultInboxProvider,
  ) ?? connectedMailProviders[0] ?? null

  const loadConnections = useCallback(async () => {
    setLoadError(null)
    setMailboxLoadError(null)
    setProviderAvailabilityError(null)
    setDefaultInboxProviderError(null)
    setDefaultInboxProviderLoaded(false)
    const [connectionsResult, availabilityResult, mailboxesResult, preferenceResult] = await Promise.allSettled([
      listInboxConnections(),
      listInboxProviders(),
      listMailboxes(),
      loadDefaultInboxProvider(),
    ])

    if (connectionsResult.status === "fulfilled") {
      setConnections(connectionsResult.value)
    } else {
      setConnections([])
      setLoadError(connectionsResult.reason instanceof Error ? connectionsResult.reason.message : t("Unable to load your mail connections."))
    }

    if (availabilityResult.status === "fulfilled") {
      setProviderAvailability(availabilityResult.value)
    } else {
      setProviderAvailability([])
      setProviderAvailabilityError(t("Provider availability could not be checked. Try again."))
    }

    if (mailboxesResult.status === "fulfilled") {
      setMailboxes(mailboxesResult.value)
    } else {
      setMailboxes([])
      setMailboxLoadError(t("Existing shared mailboxes could not be loaded. Try again."))
    }

    if (preferenceResult.status === "fulfilled") {
      setDefaultInboxProvider(preferenceResult.value)
    } else {
      setDefaultInboxProvider(null)
      setDefaultInboxProviderError(t("Your saved default mail provider could not be loaded. You can choose it again below."))
    }
    setDefaultInboxProviderLoaded(true)
  }, [t])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  useEffect(() => {
    let active = true
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return
      const key = `multideck.dexter-writing-profile-prompt-dismissed:${window.location.host}:${data.user.id}`
      setWritingProfilePromptKey(key)
      setWritingProfilePromptDismissed(window.localStorage.getItem(key) === "true")
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (writingProfilePromptDismissed || !mailboxes?.some((mailbox) => mailbox.indexStatus === "ready")) return
    let active = true
    void getDexterWritingProfile().then((profile) => {
      if (active && !profile.exists && profile.status === "not_started" && profile.eligibleMessageCount >= 10) {
        setWritingProfilePrompt(profile)
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [mailboxes, writingProfilePromptDismissed])

  async function acceptWritingProfilePrompt() {
    if (writingProfilePromptBusy) return
    setWritingProfilePromptBusy(true)
    try {
      const profile = await consentToDexterWritingProfile()
      setWritingProfilePrompt(profile)
      toast.success(t("Dexter has learned your email writing style."), {
        description: t("You can edit or turn it off in Dexter settings."),
      })
      setWritingProfilePrompt(null)
    } catch (profileError) {
      toast.error(writingProfileErrorCopy(profileError, "Dexter could not create your writing profile. Try again.", t))
    } finally {
      setWritingProfilePromptBusy(false)
    }
  }

  function dismissWritingProfilePrompt() {
    if (writingProfilePromptKey) window.localStorage.setItem(writingProfilePromptKey, "true")
    setWritingProfilePromptDismissed(true)
    setWritingProfilePrompt(null)
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("shared") !== "outlook") return
    const result = readEmailConnectionResult(window.location.search)
    if (!result || result.provider !== "outlook") return

    const cleanUrl = new URL(window.location.href)
    for (const key of ["shared", "email_connection", "status", "code"]) cleanUrl.searchParams.delete(key)
    window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)

    if (result.status === "connected") {
      toast.success(t("Shared Outlook mailbox access enabled"))
      return
    }
    toast.error(result.code === "provider_admin_consent_required"
      ? t("Your Microsoft 365 administrator needs to approve shared mailbox access.")
      : t("Shared Outlook mailbox access could not be enabled."))
  }, [t])

  async function connect(provider: MailProvider) {
    if (!providerAvailability?.find((candidate) => candidate.provider === provider)?.configured) return
    setBusyProvider(provider)
    try {
      window.location.assign(await authorizeInboxProvider(provider))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start the provider sign-in.")
      setBusyProvider(null)
    }
  }

  async function enableOutlookSharedAccess() {
    setBusyProvider("outlook")
    setSharedMailboxError(null)
    try {
      window.location.assign(await authorizeInboxProvider(
        "outlook",
        "shared",
        "/settings?tab=integrations&shared=outlook",
      ))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Unable to request shared Outlook mailbox access."))
      setBusyProvider(null)
    }
  }

  async function addSharedMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const connection = connections?.find((candidate) => candidate.provider === "outlook")
    if (!connection || !connection.sharedMailboxAccess || !sharedMailboxAddress.trim()) return

    setBusyProvider("outlook")
    setSharedMailboxError(null)
    try {
      const mailbox = await addOutlookSharedMailbox(connection.id, sharedMailboxAddress)
      setMailboxes((current) => [
        ...(current ?? []).filter((candidate) => candidate.id !== mailbox.id),
        mailbox,
      ])
      setSharedMailboxAddress("")
      // A first mailbox import can span several provider pages. The mailbox is
      // already connected at this point, so keep Settings usable while that
      // import continues and surface only a genuine background failure.
      void syncMailbox(mailbox.id).catch(() => {
        toast.error(t("The shared mailbox was added, but its first sync could not finish. Open it and try Refresh."))
      })
      toast.success(t("Shared Outlook mailbox added"))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unable to add this shared Outlook mailbox.")
      setSharedMailboxError(message)
      toast.error(message)
    } finally {
      setBusyProvider(null)
    }
  }

  async function addGroupMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const connection = connections?.find((candidate) => candidate.provider === "gmail")
    if (!connection || !groupMailboxAddress.trim()) return

    setBusyProvider("gmail")
    setGroupMailboxError(null)
    try {
      const mailbox = await addGmailGroupMailbox(connection.id, groupMailboxAddress)
      setMailboxes((current) => [
        ...(current ?? []).filter((candidate) => candidate.id !== mailbox.id),
        mailbox,
      ])
      setGroupMailboxAddress("")
      void syncMailbox(mailbox.id).catch(() => {
        toast.error(t("The Google Group inbox was added, but its first sync could not finish. Open it and try Refresh."))
      })
      toast.success(t("Google Group inbox added"))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("Unable to add this Google Group inbox.")
      setGroupMailboxError(message)
      toast.error(message)
    } finally {
      setBusyProvider(null)
    }
  }

  async function disconnect(connection: InboxConnection) {
    setBusyProvider(connection.provider)
    try {
      await disconnectInboxConnection(connection.id)
      await loadConnections()
      setDisconnectCandidate(null)
      toast.success(`${mailProviderCopy[connection.provider].label} disconnected`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disconnect this provider.")
    } finally {
      setBusyProvider(null)
    }
  }

  async function chooseDefaultInboxProvider(provider: MailProvider) {
    if (!connectedMailProviders.includes(provider) || savingDefaultInboxProvider) return
    const previous = defaultInboxProvider
    setDefaultInboxProvider(provider)
    setDefaultInboxProviderError(null)
    setSavingDefaultInboxProvider(provider)
    try {
      await saveDefaultInboxProvider(provider)
      toast.success(t("Default mail provider updated"), {
        description: t(provider === "gmail"
          ? "Inbox and new email composers will now start with Gmail."
          : "Inbox and new email composers will now start with Outlook."),
      })
    } catch (error) {
      setDefaultInboxProvider(previous)
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : t("Your default mail provider could not be saved. Try again.")
      setDefaultInboxProviderError(message)
      toast.error(message)
    } finally {
      setSavingDefaultInboxProvider(null)
    }
  }

  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / Integrations"
        title="Integrations"
        description="Connect the systems operators already use so Multideck can pull context and push approved updates."
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <CalendarConnectionSettings navigate={navigate} />
        <SettingsPanel
          title={(
            <span className="inline-flex items-center gap-1.5">
              <span>{t("Mail")}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("About mail sync")}
                    className="grid size-7 place-items-center rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] transition-[background-color,color,scale] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:active:scale-100"
                  >
                    <Info className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" sideOffset={6} className="max-w-[360px] text-pretty leading-5">
                  {t("Mail powers the Inbox workspace. Multideck securely syncs the last 12 months of useful mail, 30 days of Spam and Trash, and current drafts so operators can search, reply and use Dexter; Gmail or Microsoft remains the source mailbox.")}
                </TooltipContent>
              </Tooltip>
            </span>
          )}
          action={
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
              onClick={() => navigate("/inbox")}
            >
              Open Inbox
            </Button>
          }
        >
          {writingProfilePrompt ? (
            <div className="grid gap-4 bg-[var(--md-accent-a10)] px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Let Dexter learn how you write")}</p>
                <p className="mt-1 max-w-[68ch] text-pretty text-[12px] leading-5 text-[var(--md-text)]">
                  {t("Dexter can learn tone and structure from your eligible sent emails. Nothing is analysed until you accept, and copied email bodies are never stored in the profile.")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button type="button" variant="ghost" disabled={writingProfilePromptBusy} className="h-10 rounded-[var(--md-radius-lg)] px-3 text-[13px] font-medium text-[var(--md-text)]" onClick={dismissWritingProfilePrompt}>
                  {t("Not now")}
                </Button>
                <Button type="button" disabled={writingProfilePromptBusy} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => void acceptWritingProfilePrompt()}>
                  {writingProfilePromptBusy ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <WandSparkles className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                  {t(writingProfilePromptBusy ? "Learning your style" : "Learn my email style")}
                </Button>
              </div>
            </div>
          ) : null}
          {loadError ? (
            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-[var(--md-ink)]" role="alert">Unable to load your mail connections</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{loadError}</p>
              <Button
                type="button"
                variant="ghost"
                className="mt-3 h-8 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-white/75"
                onClick={() => void loadConnections()}
              >
                Try again
              </Button>
            </div>
          ) : connections === null ? (
            <div className="px-5 py-4">
              <p className="text-[12px] text-[var(--md-text)]">Checking your mail connections...</p>
            </div>
          ) : (
            <>
              <SettingsFieldRow
                label={t("Default mail provider")}
                description={t("Choose which connected provider opens first in Inbox and is preselected for new email composers. You can still switch provider at any time.")}
                align="start"
              >
                <div>
                  <div
                    role="radiogroup"
                    aria-label={t("Default mail provider")}
                    aria-busy={savingDefaultInboxProvider !== null}
                    className="inline-flex max-w-full rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]"
                  >
                    {(["gmail", "outlook"] as MailProvider[]).map((provider) => {
                      const selected = effectiveDefaultInboxProvider === provider
                      const connected = connectedMailProviders.includes(provider)
                      return (
                        <button
                          key={provider}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!connected || !defaultInboxProviderLoaded || savingDefaultInboxProvider !== null}
                          className={cn(
                            "inline-flex min-h-10 min-w-[112px] items-center justify-center gap-2 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium outline-none transition-[background-color,box-shadow,color,opacity,scale] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
                            selected
                              ? "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)] shadow-[inset_0_0_0_1px_var(--md-accent-a14),0_2px_5px_rgba(11,20,19,0.06)]"
                              : "text-[var(--md-text)] hover:text-[var(--md-ink)]",
                            !connected && "opacity-45",
                          )}
                          onClick={() => void chooseDefaultInboxProvider(provider)}
                        >
                          <img src={mailProviderLogos[provider]} alt="" aria-hidden="true" className="size-4 object-contain" />
                          <span>{mailProviderCopy[provider].label}</span>
                          {savingDefaultInboxProvider === provider ? (
                            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : selected ? (
                            <Check className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                  {connectedMailProviders.length < 2 ? (
                    <p className="mt-2 text-[11.5px] leading-5 text-[var(--md-subtle)]">
                      {t("Connect a provider before choosing it as the default.")}
                    </p>
                  ) : null}
                  {defaultInboxProviderError || savingDefaultInboxProvider ? (
                    <p
                      role={defaultInboxProviderError ? "alert" : "status"}
                      aria-live="polite"
                      className={cn(
                        "mt-2 text-[11.5px] leading-5",
                        defaultInboxProviderError ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]",
                      )}
                    >
                      {defaultInboxProviderError ?? t("Saving preference")}
                    </p>
                  ) : null}
                </div>
              </SettingsFieldRow>
              {(["gmail", "outlook"] as MailProvider[]).map((provider) => {
                const connection = connections.find((candidate) => candidate.provider === provider) ?? null
                const copy = mailProviderCopy[provider]
                const configured = providerAvailability?.find((candidate) => candidate.provider === provider)?.configured === true
                const isConnected = connection?.status === "connected" || connection?.status === "syncing"
                const needsConnection = !connection || !isConnected
                const statusKey =
                  !configured ? "Unavailable" :
                  !connection ? "Not connected" :
                  connection.status === "reauthorization_required" ? "Reconnect needed" :
                  connection.status === "syncing" ? "Syncing" :
                  connection.status === "error" ? "Sync problem" :
                  connection.status === "disconnected" ? "Not connected" :
                  "Connected"
                const problemDescription = !configured
                  ? providerAvailabilityError ?? t(`${copy.label} has not been configured for this workspace yet. Ask a Multideck administrator to add the provider credentials.`)
                  : connection?.error?.trim() || undefined
                const needsReconnect = connection?.status === "reauthorization_required" || connection?.status === "error"
                const actionLabel = isConnected ? `Disconnect ${copy.label}` : `${needsReconnect ? "Reconnect" : "Connect"} ${copy.label}`
                const busyLabel = isConnected ? "Disconnecting" : needsReconnect ? "Reconnecting" : "Connecting"

                const sharedMailboxes = provider === "outlook"
                  ? (mailboxes ?? []).filter((mailbox) => mailbox.provider === "outlook" && mailbox.kind !== "personal")
                  : []
                const groupMailboxes = provider === "gmail"
                  ? (mailboxes ?? []).filter((mailbox) => mailbox.provider === "gmail" && mailbox.kind === "group")
                  : []

                return (
                  <Fragment key={provider}>
                    <SettingsIntegrationRow
                    logoSrc={mailProviderLogos[provider]}
                    title={copy.label}
                    description={problemDescription}
                    status={t(statusKey)}
                    statusTone={
                      statusKey === "Connected" ? "connected" :
                      statusKey === "Reconnect needed" || statusKey === "Sync problem" ? "review" :
                      statusKey === "Syncing" ? "workspace" :
                      "ready"
                    }
                    action={(
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={t(actionLabel)}
                        disabled={busyProvider !== null || (needsConnection && !configured)}
                        className={cn(
                          "h-8 w-fit rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,opacity,scale] duration-200 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a18)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100",
                          isConnected
                            ? "bg-white/48 text-[var(--md-red)] hover:bg-[rgba(194,63,63,0.08)] hover:text-[var(--md-red)]"
                            : needsReconnect
                              ? "bg-[rgba(221,138,43,0.1)] text-[var(--md-amber)] hover:bg-[rgba(221,138,43,0.16)] hover:text-[var(--md-amber)]"
                              : "bg-[var(--md-accent)] text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-deep)] hover:text-[var(--md-accent-ink)]",
                        )}
                        onClick={() => {
                          if (busyProvider) return
                          if (isConnected && connection) {
                            setDisconnectCandidate(connection)
                            return
                          }
                          void connect(provider)
                        }}
                      >
                        {busyProvider === provider ? (
                          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : isConnected ? (
                          <X className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        ) : needsReconnect ? (
                          <RefreshCw className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                        ) : (
                          <Plug className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
                        )}
                        {t(busyProvider === provider ? busyLabel : actionLabel)}
                      </Button>
                    )}
                    />
                    {provider === "gmail" && connection && !needsConnection ? (
                    <SettingsFieldRow
                      label={t("Google Group inboxes")}
                      description={t("Add a Google Group delivered to this Gmail account. Multideck creates a separate view across Inbox, Spam and Trash; replies still send from your connected Gmail account.")}
                      align="start"
                      labelFor="gmail-group-mailbox-address"
                    >
                      <div>
                        {mailboxLoadError ? (
                          <p className="mb-3 text-[12px] leading-5 text-[var(--md-red)]" role="alert">{mailboxLoadError}</p>
                        ) : groupMailboxes.length > 0 ? (
                          <ul className="mb-3 grid gap-1.5" aria-label={t("Connected Google Group inboxes")}>
                            {groupMailboxes.map((mailbox) => (
                              <li
                                key={mailbox.id}
                                className="flex min-h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2 shadow-[var(--md-shadow-line)]"
                              >
                                <Users className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                                <bdi data-i18n-skip dir="ltr" className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-ink)]">
                                  {mailbox.address}
                                </bdi>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-[var(--md-radius-sm)] px-2 py-1 text-[11px] font-medium text-[var(--md-accent)] transition-[background-color,color] hover:bg-[var(--md-accent-a10)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                                  onClick={() => navigate(`/inbox?provider=gmail&view=shared&mailbox=${encodeURIComponent(mailbox.id)}`)}
                                >
                                  {t("Open")}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void addGroupMailbox(event)}>
                          <SettingsInput
                            id="gmail-group-mailbox-address"
                            type="email"
                            inputMode="email"
                            autoComplete="off"
                            spellCheck={false}
                            required
                            data-i18n-skip
                            dir="ltr"
                            value={groupMailboxAddress}
                            placeholder="operations@company.com"
                            aria-describedby={groupMailboxError ? "gmail-group-mailbox-error" : "gmail-group-mailbox-help"}
                            onChange={(event) => {
                              setGroupMailboxAddress(event.target.value)
                              if (groupMailboxError) setGroupMailboxError(null)
                            }}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            disabled={busyProvider !== null || !groupMailboxAddress.trim()}
                            className="h-10 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] hover:bg-[var(--md-accent-deep)] active:scale-[0.96] motion-reduce:active:scale-100"
                          >
                            {busyProvider === "gmail" ? t("Adding inbox") : t("Add group inbox")}
                          </Button>
                        </form>
                        {groupMailboxError ? (
                          <p id="gmail-group-mailbox-error" className="mt-2 text-[12px] leading-5 text-[var(--md-red)]" role="alert">{groupMailboxError}</p>
                        ) : (
                          <p id="gmail-group-mailbox-help" className="mt-2 text-[11.5px] leading-5 text-[var(--md-subtle)]">
                            {t("This view is read-only as the group address. Reply from the connected personal Gmail mailbox unless Google separately configures the address as a send-as identity.")}
                          </p>
                        )}
                      </div>
                    </SettingsFieldRow>
                  ) : null}
                  {provider === "outlook" && connection && !needsConnection ? (
                    <SettingsFieldRow
                      label={t("Shared Outlook mailboxes")}
                      description={t("Add shared Outlook addresses you are authorised to use. Sending also requires Microsoft Send As or Send on Behalf permission.")}
                      align="start"
                      labelFor={connection.sharedMailboxAccess ? "outlook-shared-mailbox-address" : undefined}
                    >
                      {!connection.sharedMailboxAccess ? (
                        <div>
                          <p className="max-w-[58ch] text-[12px] leading-5 text-[var(--md-text)]">
                            {t("Your personal Outlook connection does not include shared mailbox permissions.")}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busyProvider !== null}
                            className="mt-3 h-9 rounded-[var(--md-radius-md)] bg-white/48 px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] hover:bg-white/75 active:scale-[0.96] motion-reduce:active:scale-100"
                            onClick={() => void enableOutlookSharedAccess()}
                          >
                            {busyProvider === "outlook" ? t("Opening Microsoft") : t("Enable shared mailbox access")}
                          </Button>
                        </div>
                      ) : (
                        <div>
                          {mailboxLoadError ? (
                            <p className="mb-3 text-[12px] leading-5 text-[var(--md-red)]" role="alert">{mailboxLoadError}</p>
                          ) : sharedMailboxes.length > 0 ? (
                            <ul className="mb-3 grid gap-1.5" aria-label={t("Connected shared Outlook mailboxes")}>
                              {sharedMailboxes.map((mailbox) => (
                                <li
                                  key={mailbox.id}
                                  className="flex min-h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2 shadow-[var(--md-shadow-line)]"
                                >
                                  <Users className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                                  <bdi data-i18n-skip dir="ltr" className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-ink)]">
                                    {mailbox.address}
                                  </bdi>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-[var(--md-radius-sm)] px-2 py-1 text-[11px] font-medium text-[var(--md-accent)] transition-[background-color,color] hover:bg-[var(--md-accent-a10)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                                    onClick={() => navigate(`/inbox?provider=outlook&view=shared&mailbox=${encodeURIComponent(mailbox.id)}`)}
                                  >
                                    {t("Open")}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void addSharedMailbox(event)}>
                            <SettingsInput
                              id="outlook-shared-mailbox-address"
                              type="email"
                              inputMode="email"
                              autoComplete="off"
                              spellCheck={false}
                              required
                              data-i18n-skip
                              dir="ltr"
                              value={sharedMailboxAddress}
                              placeholder="operations@company.com"
                              aria-describedby={sharedMailboxError ? "outlook-shared-mailbox-error" : "outlook-shared-mailbox-help"}
                              onChange={(event) => {
                                setSharedMailboxAddress(event.target.value)
                                if (sharedMailboxError) setSharedMailboxError(null)
                              }}
                            />
                            <Button
                              type="submit"
                              variant="ghost"
                              disabled={busyProvider !== null || !sharedMailboxAddress.trim()}
                              className="h-10 shrink-0 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,scale] hover:bg-[var(--md-accent-deep)] active:scale-[0.96] motion-reduce:active:scale-100"
                            >
                              {busyProvider === "outlook" ? t("Adding mailbox") : t("Add mailbox")}
                            </Button>
                          </form>
                          {sharedMailboxError ? (
                            <p id="outlook-shared-mailbox-error" className="mt-2 text-[12px] leading-5 text-[var(--md-red)]" role="alert">{sharedMailboxError}</p>
                          ) : (
                            <p id="outlook-shared-mailbox-help" className="mt-2 text-[11.5px] leading-5 text-[var(--md-subtle)]">
                              {t("Multideck checks your delegated Microsoft access before saving the mailbox.")}
                            </p>
                          )}
                        </div>
                      )}
                    </SettingsFieldRow>
                  ) : null}
                </Fragment>
              )
              })}
            </>
          )}
        </SettingsPanel>

        <SettingsPanel title={t("Accounting")}>
          <SettingsIntegrationRow
            logoSrc={xeroLogo}
            title="Xero"
            description={t("Sync invoices and credit-limit snapshots.")}
            status={t("Coming soon")}
            statusTone="workspace"
          />
          <SettingsIntegrationRow
            logoSrc={sageLogo}
            title="Sage"
            description={t("Sync invoices, customer balances, and ledger context.")}
            status={t("Coming soon")}
            statusTone="workspace"
          />
        </SettingsPanel>
      </div>

      <Dialog
        open={disconnectCandidate !== null}
        onOpenChange={(open) => {
          if (!open && !busyProvider) setDisconnectCandidate(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden border-0 bg-[var(--md-surface)] p-0 sm:max-w-[440px]">
          <DialogHeader className="px-6 pb-4 pt-6 pe-14">
            <DialogTitle className="text-[16px] font-medium text-[var(--md-ink)]">
              {disconnectCandidate ? t(`Disconnect ${mailProviderCopy[disconnectCandidate.provider].label}?`) : ""}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {disconnectCandidate ? t(disconnectCandidate.provider === "gmail"
                ? "Multideck will stop syncing this account and remove it from Inbox and new messages. Your mail stays in Gmail."
                : "Multideck will stop syncing this account and remove it from Inbox and new messages. Your mail stays in Microsoft 365.") : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-[rgba(11,20,19,0.07)] bg-[var(--md-surface-soft)] px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busyProvider !== null}
              className="h-9 rounded-[var(--md-radius-md)] px-3 text-[13px] font-medium text-[var(--md-text)]"
              onClick={() => setDisconnectCandidate(null)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              disabled={!disconnectCandidate || busyProvider !== null}
              className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-red)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-red),black_10%)]"
              onClick={() => {
                if (disconnectCandidate) void disconnect(disconnectCandidate)
              }}
            >
              {busyProvider ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {disconnectCandidate ? t(`Disconnect ${mailProviderCopy[disconnectCandidate.provider].label}`) : t("Disconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

export function AdminBillingContent() {
  const invoices = [
    ["INV-2026-0618", "18 Jun 2026", "EUR 1,284", "Paid"],
    ["INV-2026-0518", "18 May 2026", "EUR 1,196", "Paid"],
    ["INV-2026-0418", "18 Apr 2026", "EUR 1,142", "Paid"],
  ]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / Billing"
        title="Billing"
        description="Keep the plan, seats, payment method, and invoice history understandable without mixing them into operational usage."
        actions={compactAction("Download invoices", () => toast.success("Invoices prepared"))}
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-3 sm:grid-cols-3">
        {[
          [CreditCard, "Current plan", "Operations", "Annual billing"],
          [Users, "Seats", "14 / 18", "4 seats available"],
          [CalendarClock, "Renews", "14 Jan 2027", "EUR 18,400 annual"],
        ].map(([Icon, label, value, detail]) => (
          <section key={label as string} className="group rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-transform duration-200 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
              </span>
              <span className="text-[11px] text-[var(--md-subtle)]">{label as string}</span>
            </div>
            <p className="mt-5 text-[20px] font-medium tracking-[-0.02em] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{value as string}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{detail as string}</p>
          </section>
        ))}
      </div>
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-[var(--md-page-stack-gap)]">
          <SettingsPanel title="Plan and seats" description="Northwind Forwarding is on the annual Operations plan.">
            <SettingsFieldRow label="Seats">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
                    <span className="block h-full w-[77.8%] rounded-full bg-[var(--md-accent)]" />
                  </div>
                  <p className="mt-2 text-[12px] tabular-nums text-[var(--md-text)]">14 active · 18 included</p>
                </div>
                {compactAction("Manage seats")}
              </div>
            </SettingsFieldRow>
            <SettingsFieldRow label="Billing cadence">
              <ChoiceSetting options={["Monthly", "Annual"]} initialValue="Annual" />
            </SettingsFieldRow>
            <SettingsFieldRow label="Renewal">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                <span className="text-[13px] text-[var(--md-text)]">14 Jan 2027</span>
                <span className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]">EUR 18,400</span>
              </div>
            </SettingsFieldRow>
          </SettingsPanel>
          <SettingsPanel title="Invoices" description="Paid invoices remain available for finance review and export.">
            {invoices.map(([number, date, amount, status]) => (
              <div key={number} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{number}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{date}</p>
                </div>
                <p className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>{amount}</p>
                <StatusPill tone="teal">{status}</StatusPill>
                <Button type="button" variant="ghost" size="icon" aria-label={`Download ${number}`} className="size-9 rounded-[var(--md-radius-lg)] hover:bg-[var(--md-hover)]">
                  <FileText className="size-4" strokeWidth={1.3} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </SettingsPanel>
        </div>
        <aside className="space-y-[var(--md-page-stack-gap)] xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <section className="rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">Payment method</p>
            <div className="mt-4 rounded-[var(--md-radius-xl)] bg-[var(--md-ink)] p-4 text-white shadow-[var(--md-shadow-soft)]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/60">Company card</span>
                <CreditCard className="size-4 text-white/70" strokeWidth={1.3} aria-hidden="true" />
              </div>
              <p className="mt-8 text-[14px] font-medium tracking-[0.12em]" dir="ltr" data-i18n-skip>•••• 4242</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-white/60">
                <span>Northwind Forwarding</span>
                <span>01/29</span>
              </div>
            </div>
            <div className="mt-3">{compactAction("Update payment method")}</div>
          </section>
          <SettingsSummaryCard
            title="Next invoice"
            rows={[
              ["Forecast", "EUR 1,284"],
              ["Billing date", "18 Jul 2026"],
              ["Tax", "Calculated at checkout"],
              ["Payment status", "Healthy"],
            ]}
          />
        </aside>
      </div>
    </>
  )
}

function AiUsageOverviewScreen({
  usage,
  isLoading,
  error,
  onRetry,
  onViewHistory,
}: {
  usage: DexterUsage | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onViewHistory: () => void
}) {
  return (
    <>
      <SettingsPageHeader
        icon={ChartAnalysis}
        eyebrow="Workspace / Usage"
        title="Usage"
        description="See what this workspace has used, what is included, and any extra usage for the current month."
        actions={compactAction("Export usage", () => toast.success("Usage export prepared"))}
      />
      <AiUsageOverview
        usage={usage}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onViewHistory={onViewHistory}
      />
    </>
  )
}

function AiUsageHistoryScreen({
  onBack,
}: {
  onBack: () => void
}) {
  const { t, language } = useLanguage()
  const [order, setOrder] = useState<"newest" | "heaviest">("newest")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [history, setHistory] = useState<DexterUsageHistoryPage | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const offset = (page - 1) * pageSize

  useEffect(() => {
    const controller = new AbortController()
    setHistoryLoading(true)
    setHistoryError(null)
    void getDexterUsageHistory({ sort: order, limit: pageSize, offset }, controller.signal)
      .then(setHistory)
      .catch((requestError) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return
        setHistoryError(requestError instanceof Error ? requestError.message : t("Dexter usage could not be loaded."))
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [offset, order, pageSize, refreshVersion, t])

  useEffect(() => {
    const refresh = () => setRefreshVersion((current) => current + 1)
    window.addEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refresh)
  }, [])

  const entries = useMemo(() => {
    return (history?.rows ?? []).map((entry: DexterUsageEntry) => ({
      id: entry.id,
      title: entry.title,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      createdAt: entry.createdAt,
      date: new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt)),
    }))
  }, [history?.rows, language])

  const listedTokens = entries.reduce((total, entry) => total + entry.totalTokens, 0)
  const heaviest = Math.max(1, ...entries.map((entry) => entry.totalTokens))
  const pageCount = Math.max(1, Math.ceil((history?.total ?? 0) / pageSize))
  const visibleUsage = entries
  const formatTokens = (value: number) => value.toLocaleString("en-GB")
  type UsageEntry = (typeof entries)[number]
  const usageColumns = useMemo<DataTableColumn<UsageEntry>[]>(() => [
    { id: "request", label: "Request", kind: "long-text", width: 420, minWidth: 240, resizable: true, cellTitle: (entry) => entry.title, cellClassName: "whitespace-normal", cell: (entry) => <div className="min-w-0"><p className="line-clamp-2 text-[13px] leading-[1.4] text-[var(--md-ink)]" data-i18n-skip>{entry.title}</p><span className="mt-2 block h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--md-ai-track)]"><span aria-hidden="true" className="block h-full rounded-full bg-[color-mix(in_srgb,var(--md-accent)_78%,var(--md-blue))]" style={{ width: `${Math.max(2, (entry.totalTokens / heaviest) * 100)}%` }} /></span></div> },
    { id: "input", label: "Input", kind: "number", width: 120, cell: (entry) => <span dir="ltr" data-i18n-skip>{formatTokens(entry.inputTokens)}</span> },
    { id: "output", label: "Output", kind: "number", width: 120, cell: (entry) => <span dir="ltr" data-i18n-skip>{formatTokens(entry.outputTokens)}</span> },
    { id: "total", label: "Total tokens", kind: "number", width: 132, cell: (entry) => <span className="font-medium text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{formatTokens(entry.totalTokens)}</span> },
    { id: "when", label: "When", kind: "date", width: 180, cell: (entry) => <span className="tabular-nums text-[var(--md-text)]" dir="ltr" data-i18n-skip>{entry.date}</span> },
  ], [heaviest])

  useEffect(() => {
    setPage(1)
  }, [order, pageSize])

  return (
    <>
      <SettingsPageHeader
        icon={History}
        eyebrow="Workspace / Usage / AI history"
        title="AI usage history"
        description="Every Dexter response recorded this month, with the tokens each one used."
        actions={compactAction("Back to Usage", onBack)}
      />
      <section className="md-ai-usage md-ai-panel mt-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              <History className="size-4" strokeWidth={1.35} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Recent Dexter usage")}</h2>
              <p className="mt-0.5 text-[12px] text-[var(--md-text)]">
                <span className="tabular-nums" data-i18n-skip>{entries.length}</span> {t("requests")} ·{" "}
                <span className="tabular-nums" data-i18n-skip>{formatTokens(listedTokens)}</span> {t("tokens listed")}
              </p>
            </div>
          </div>
        </div>

        {historyError ? (
          <div role="alert" className="px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Dexter usage is temporarily unavailable")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(historyError)}</p>
            <Button type="button" variant="ghost" className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium" onClick={() => setRefreshVersion((current) => current + 1)}>
              {t("Try again")}
            </Button>
          </div>
        ) : visibleUsage.length > 0 ? (
          <>
            <DataTable ariaLabel="Recent Dexter usage" columnsButtonLabel="Manage usage columns" columns={usageColumns} rows={visibleUsage} getRowKey={(entry) => entry.id} storageKey="dexter-usage-history" toolbarOptions={<SegmentedControl options={["newest", "heaviest"] as const} value={order} onChange={setOrder} ariaLabel={t("Order usage history")} renderOption={(option) => t(option === "newest" ? "Newest first" : "Heaviest first")} />} className="hidden rounded-none shadow-none md:block" />
            <div className="divide-y divide-[var(--md-line)] md:hidden">
              {visibleUsage.map((entry) => (
                <article key={entry.id} className="md-ai-row px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="line-clamp-2 text-[13px] leading-[1.4] text-[var(--md-ink)]" data-i18n-skip>{entry.title}</p>
                    <p className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{formatTokens(entry.totalTokens)}</p>
                  </div>
                  <span className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-[var(--md-ai-track)]">
                    <span
                      aria-hidden="true"
                      className="block h-full rounded-full bg-[color-mix(in_srgb,var(--md-accent)_78%,var(--md-blue))]"
                      style={{ width: `${Math.max(2, (entry.totalTokens / heaviest) * 100)}%` }}
                    />
                  </span>
                  <p className="mt-2 text-[11.5px] text-[var(--md-text)]" dir="ltr" data-i18n-skip>
                    {formatTokens(entry.inputTokens)} in · {formatTokens(entry.outputTokens)} out · {entry.date}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(historyLoading ? "Loading Dexter usage" : "No Dexter usage this month")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">
              {t(historyLoading ? "The latest metered activity will appear here shortly." : "Dexter responses will appear here after the first completed request.")}
            </p>
          </div>
        )}

        <div className="p-4">
          <Pagination
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            totalItems={history?.total ?? 0}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="requests"
            className="bg-[var(--md-surface-soft)]"
          />
        </div>
      </section>
    </>
  )
}

export function AdminAiUsageContent() {
  const { t } = useLanguage()
  const readView = () => new URLSearchParams(window.location.search).get("view") === "history" ? "history" : "overview"
  const [view, setView] = useState<"overview" | "history">(readView)
  const [usage, setUsage] = useState<DexterUsage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadUsage() {
    setIsLoading(true)
    setError(null)
    try {
      setUsage(await getDexterUsage())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("Dexter usage could not be loaded."))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const syncView = () => setView(readView())
    window.addEventListener("popstate", syncView)
    return () => window.removeEventListener("popstate", syncView)
  }, [])

  useEffect(() => {
    const refreshUsage = () => void loadUsage()
    const refreshVisibleUsage = () => {
      if (document.visibilityState === "visible") refreshUsage()
    }

    void loadUsage()
    window.addEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refreshUsage)
    window.addEventListener("focus", refreshUsage)
    document.addEventListener("visibilitychange", refreshVisibleUsage)
    return () => {
      window.removeEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refreshUsage)
      window.removeEventListener("focus", refreshUsage)
      document.removeEventListener("visibilitychange", refreshVisibleUsage)
    }
  }, [])

  useEffect(() => {
    document.title = `${view === "history" ? "AI usage history" : "Usage"} · Admin · Multideck`
  }, [view])

  function changeView(nextView: "overview" | "history") {
    const nextPath = nextView === "history" ? "/admin/usage?view=history" : "/admin/usage"
    window.history.pushState({}, "", nextPath)
    setView(nextView)
    window.dispatchEvent(new PopStateEvent("popstate"))
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "auto" })
  }

  return view === "history"
    ? (
        <AiUsageHistoryScreen
          onBack={() => changeView("overview")}
        />
      )
    : (
        <AiUsageOverviewScreen
          usage={usage}
          isLoading={isLoading}
          error={error}
          onRetry={() => void loadUsage()}
          onViewHistory={() => changeView("history")}
        />
      )
}

function WhatsNewTab() {
  const releases = [
    {
      id: "navigation",
      date: "29 Jul",
      title: "A sidebar that follows your work",
      summary: "Drill into an area without losing the wider product map, with smoother active-state motion and personal ordering.",
      tag: "Navigation",
      icon: Palette,
    },
    {
      id: "crm",
      date: "24 Jul",
      title: "Faster lead-to-customer handover",
      summary: "Carry qualified CRM context into the customer record with clearer conversion review and ownership.",
      tag: "CRM",
      icon: Users,
    },
    {
      id: "identity",
      date: "18 Jul",
      title: "Profile photos across the workspace",
      summary: "Operator identity now stays visible in assignments, account menus, and customer-facing ownership.",
      tag: "Profile",
      icon: UserRound,
    },
  ]
  const [selectedReleaseId, setSelectedReleaseId] = useState(releases[0].id)
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? releases[0]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Resources / What's new"
        title="What's new"
        description="A concise release trail focused on changes operators will notice in everyday work."
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
        <section className="rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-3 shadow-[var(--md-shadow-soft)]">
          <div className="px-2 pb-3 pt-1">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">July 2026</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">Three improvements worth knowing</p>
          </div>
          <div className="relative">
            <span className="absolute bottom-6 start-[27px] top-6 w-px bg-[var(--md-line-strong)]" aria-hidden="true" />
            {releases.map((release) => {
              const Icon = release.icon
              const selected = release.id === selectedRelease.id
              return (
                <button
                  key={release.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    "group relative grid w-full grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-[var(--md-radius-xl)] px-2 py-3 text-start transition-[background-color,color,scale] hover:bg-[var(--md-hover)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:active:scale-100",
                    selected && "bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)]",
                  )}
                  onClick={() => setSelectedReleaseId(release.id)}
                >
                  <span className={cn(
                    "relative z-10 grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[color,scale] group-hover:scale-[1.04] motion-reduce:group-hover:scale-100",
                    selected && "text-[var(--md-accent)]",
                  )}>
                    <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium tabular-nums text-[var(--md-subtle)]">{release.date}</span>
                    <span className="mt-1 block text-[13px] font-medium text-[var(--md-ink)]">{release.title}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.article
            key={selectedRelease.id}
            className="md-settings-release-detail relative isolate min-h-[360px] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)] sm:p-7"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={mdMotion.smooth}
          >
            <span className="md-settings-release-detail__number" aria-hidden="true">{selectedRelease.date.split(" ")[0]}</span>
            <div className="relative">
              <StatusPill tone="teal">{selectedRelease.tag}</StatusPill>
              <h2 className="mt-6 max-w-[18ch] text-balance text-[24px] font-medium leading-[1.12] tracking-[-0.025em] text-[var(--md-ink)]">{selectedRelease.title}</h2>
              <p className="mt-4 max-w-[58ch] text-pretty text-[14px] leading-6 text-[var(--md-text)]">{selectedRelease.summary}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
                  <p className="text-[11px] text-[var(--md-subtle)]">Why it matters</p>
                  <p className="mt-2 text-[13px] leading-5 text-[var(--md-ink)]">Less navigation hunting and clearer continuity between records and workspace areas.</p>
                </div>
                <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
                  <p className="text-[11px] text-[var(--md-subtle)]">Available to</p>
                  <p className="mt-2 text-[13px] leading-5 text-[var(--md-ink)]">All Operations workspaces on the current release.</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-6 h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
                onClick={() => {
                  window.history.pushState({}, "", "/settings?tab=docs")
                  window.dispatchEvent(new PopStateEvent("popstate"))
                }}
              >
                Read release notes
                <ExternalLink className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
              </Button>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
    </>
  )
}

function DocsTab() {
  const [query, setQuery] = useState("")
  const [selectedGuideTitle, setSelectedGuideTitle] = useState("Build a customs hold workflow")
  const guides = [
    {
      title: "Build a customs hold workflow",
      detail: "Watchers, approvals, broker sync, and owner notifications.",
      category: "Operations",
      icon: ShieldCheck,
      steps: ["Create the hold watcher from the booking.", "Add the broker and booking owner as recipients.", "Require approval before any customer update is sent."],
    },
    {
      title: "Share customer tracking pages",
      detail: "Expose live progress without revealing internal comments.",
      category: "Customers",
      icon: Globe2,
      steps: ["Open the customer-facing tracking view.", "Review the fields and documents marked public.", "Copy the expiring link and share it with the customer."],
    },
    {
      title: "Import bookings by CSV",
      detail: "Prepare fields, map columns, and recover failed rows.",
      category: "Bookings",
      icon: Upload,
      steps: ["Start a CSV import from Bookings.", "Map required references, parties, and route fields.", "Review failed rows before committing the valid records."],
    },
    {
      title: "Set AI approval guardrails",
      detail: "Control Dexter actions, spend limits, and review points.",
      category: "AI",
      icon: ShieldCheck,
      steps: ["Set a spend warning below the monthly budget.", "Keep chargeable actions behind explicit approval.", "Leave customs and live exception alerts running at the limit."],
    },
    {
      title: "Manage roles and permissions",
      detail: "Shape access by role and review sensitive permissions.",
      category: "Admin",
      icon: Users,
      steps: ["Choose the closest existing role.", "Review sensitive finance, user, and document permissions.", "Save the role and verify it against an assigned user."],
    },
    {
      title: "Read billing and usage",
      detail: "Understand plan cost, invoices, and value created by AI.",
      category: "Billing",
      icon: CreditCard,
      steps: ["Use Billing for plan, seats, payment, and invoices.", "Use Usage for the workspace's included services and extra usage.", "Open AI history when you need Dexter request and token detail."],
    },
  ]
  const normalizedQuery = query.trim().toLowerCase()
  const filteredGuides = guides.filter((guide) => `${guide.title} ${guide.detail} ${guide.category}`.toLowerCase().includes(normalizedQuery))
  const selectedGuide = filteredGuides.find((guide) => guide.title === selectedGuideTitle) ?? filteredGuides[0] ?? guides[0]

  return (
    <>
      <SettingsPageHeader
        eyebrow="Resources / Docs"
        title="Docs"
        description="Find the shortest useful guide for the workflow in front of you, with shortcuts kept close for expert operators."
      />
      <section className="mt-[var(--md-page-stack-gap)] rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)] sm:p-5">
        <label className="relative block">
          <span className="sr-only">Search documentation</span>
          <Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
          <SettingsInput
            value={query}
            type="search"
            className="h-12 ps-11 text-[16px]"
            placeholder="Search guides, workflows, or features"
            aria-label="Search documentation"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p role="status" className="mt-3 text-[12px] text-[var(--md-text)]">{filteredGuides.length} guides available</p>
      </section>
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="grid content-start gap-3 sm:grid-cols-2">
          {filteredGuides.map((guide, index) => {
            const Icon = guide.icon
            return (
              <motion.button
                key={guide.title}
                type="button"
                aria-pressed={selectedGuide.title === guide.title}
                className={cn(
                  "group min-h-[156px] rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 text-start shadow-[var(--md-shadow-soft)] transition-[background-color,box-shadow,scale] hover:bg-[var(--md-surface-soft)] hover:shadow-[var(--md-shadow-lift)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:active:scale-100",
                  selectedGuide.title === guide.title && "bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-lift)]",
                )}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...mdMotion.fast, delay: staggerRamp(index, 0.03) }}
                onClick={() => setSelectedGuideTitle(guide.title)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a09)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-transform duration-200 group-hover:scale-[1.04] motion-reduce:group-hover:scale-100">
                    <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-[var(--md-surface-soft)] px-2.5 py-1 text-[11px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{guide.category}</span>
                </span>
                <span className="mt-5 block text-[14px] font-medium text-[var(--md-ink)]">{guide.title}</span>
                <span className="mt-2 block text-pretty text-[12px] leading-5 text-[var(--md-text)]">{guide.detail}</span>
              </motion.button>
            )
          })}
          {filteredGuides.length === 0 ? (
            <div className="col-span-full rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] px-5 py-10 text-center shadow-[var(--md-shadow-soft)]">
              <CircleHelp className="mx-auto size-6 text-[var(--md-subtle)]" strokeWidth={1.3} aria-hidden="true" />
              <p className="mt-3 text-[14px] font-medium text-[var(--md-ink)]">No guide matches “{query}”</p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">Try a feature name, or clear the search.</p>
              <Button type="button" variant="ghost" className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 shadow-[var(--md-shadow-line)]" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : null}
        </section>
        <aside className="space-y-[var(--md-page-stack-gap)] xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          {filteredGuides.length > 0 ? (
            <SettingsPanel title={selectedGuide.title} description={selectedGuide.detail}>
              {selectedGuide.steps.map((step, index) => (
                <div key={step} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-5 py-3.5">
                  <span className="grid size-7 place-items-center rounded-full bg-[var(--md-accent-a09)] text-[11px] font-medium tabular-nums text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                    {index + 1}
                  </span>
                  <p className="pt-1 text-[12px] leading-5 text-[var(--md-text)]">{step}</p>
                </div>
              ))}
            </SettingsPanel>
          ) : null}
          <SettingsPanel title="Keyboard shortcuts" description="Fast routes for frequent operator actions.">
            {[
              ["Command menu", "⌘ K"],
              ["New booking", "N then B"],
              ["Open Dexter", "A"],
              ["Copy tracking link", "⇧ C"],
            ].map(([label, keys]) => (
              <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-[13px] text-[var(--md-text)]">{label}</span>
                <kbd className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 py-1 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" dir="ltr" data-i18n-skip>{keys}</kbd>
              </div>
            ))}
          </SettingsPanel>
        </aside>
      </div>
    </>
  )
}

function LegacySupportTab() {
  const { t } = useLanguage()
  const [topic, setTopic] = useState("Workflow question")
  const [priority, setPriority] = useState<"Normal" | "High" | "Urgent">("Normal")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ticketResult, setTicketResult] = useState<LegacySupportTicketResponse | null>(null)
  const [canStartNewTicket, setCanStartNewTicket] = useState(false)
  const idempotencyKeyRef = useRef<string | null>(null)

  function getIdempotencyKey() {
    idempotencyKeyRef.current ??= `support-form-${crypto.randomUUID()}`
    return idempotencyKeyRef.current
  }

  async function submitSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()
    if (!trimmedSubject) {
      setFormError(t("Add a short subject so support can route the request."))
      document.getElementById("support-subject")?.focus()
      return
    }
    if (trimmedMessage.length < 20) {
      setFormError(t("Add at least 20 characters explaining what happened and what you expected."))
      document.getElementById("support-message")?.focus()
      return
    }

    setFormError(null)
    setCanStartNewTicket(false)
    setTicketResult(null)
    setIsSubmitting(true)
    try {
      const session = await getSupabaseSession()
      if (!session) throw new Error(t("Sign in again before creating a support ticket."))

      const result = await createLegacySupportTicket({
        idempotencyKey: getIdempotencyKey(),
        topic,
        priority,
        title: trimmedSubject,
        description: trimmedMessage,
        applicationUrl: window.location.href,
      })
      setTicketResult(result)
      setSubject("")
      setMessage("")
      idempotencyKeyRef.current = null
      toast.success(result.duplicate ? t("Ticket already received") : t("Support ticket created"), {
        description: `${result.ticket.ticketNumber} · ${t("Databrain OS confirmed the ticket.")}`,
      })
    } catch (error) {
      if (error instanceof SupportTicketError) {
        setFormError(t(error.message))
        setCanStartNewTicket(error.code === "idempotency_conflict")
      } else {
        setFormError(error instanceof Error ? error.message : t("Support is temporarily unavailable. Your ticket details are still here; try again."))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function startNewTicket() {
    idempotencyKeyRef.current = null
    setCanStartNewTicket(false)
    setFormError(null)
    setTicketResult(null)
  }

  return (
    <>
      <SettingsPageHeader
        eyebrow={t("Resources / Support")}
        title={t("Support")}
        description={t("Get an answer quickly, or create a support ticket with enough context for the team to act on the first reply.")}
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <form onSubmit={submitSupportTicket}>
          <SettingsPanel title={t("Create a support ticket")} description={t("Include a booking ID, customer, or visible error when the issue is workflow-specific.")}>
            <SettingsFieldRow label={t("Topic")}>
              <SettingsSelect
                value={topic}
                options={["Workflow question", "Booking sync issue", "Billing question", "Security concern", "Product feedback"]}
                ariaLabel={t("Support topic")}
                onChange={setTopic}
              />
            </SettingsFieldRow>
            <SettingsFieldRow label={t("Priority")}>
              <SettingsChoiceGroup
                options={["Normal", "High", "Urgent"]}
                value={priority}
                ariaLabel={t("Support priority")}
                onChange={(value) => setPriority(value as "Normal" | "High" | "Urgent")}
              />
            </SettingsFieldRow>
            <SettingsFieldRow label={t("Subject")} labelFor="support-subject">
              <SettingsInput
                id="support-subject"
                value={subject}
                disabled={isSubmitting}
                aria-invalid={Boolean(formError && !subject.trim()) || undefined}
                aria-describedby={formError ? "support-form-error" : undefined}
                placeholder={t("What needs help?")}
                onChange={(event) => setSubject(event.target.value)}
              />
            </SettingsFieldRow>
            <SettingsFieldRow
              label={t("What happened?")}
              description={t("Describe what you did, what you expected, and what you saw.")}
              align="start"
              labelFor="support-message"
            >
              <SettingsTextarea
                id="support-message"
                value={message}
                disabled={isSubmitting}
                aria-invalid={Boolean(formError && message.trim().length < 20) || undefined}
                aria-describedby={formError ? "support-form-error" : undefined}
                placeholder={t("Include the booking ID, customer, or error message if you have one.")}
                onChange={(event) => setMessage(event.target.value)}
              />
            </SettingsFieldRow>
            {ticketResult ? (
              <div className="mx-5 mt-4 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-green)_10%,var(--md-surface))] p-4 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-green)_14%,var(--md-surface))] text-[var(--md-green)]">
                    <TicketCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {ticketResult.duplicate ? t("Ticket already received") : t("Support ticket created")} · <span className="tabular-nums" data-i18n-skip>{ticketResult.ticket.ticketNumber}</span>
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">
                      {ticketResult.duplicate
                        ? t("No duplicate was created. Your original ticket is still active.")
                        : t("Databrain OS confirmed the ticket and the support team can now act on it.")}
                    </p>
                    {ticketResult.ticket.statusUrl ? (
                      <a
                        href={ticketResult.ticket.statusUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-[12px] font-medium text-[var(--md-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                      >
                        {t("View ticket status")}
                        <ExternalLink className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p id="support-form-error" role={formError ? "alert" : "status"} className={cn("text-[12px] leading-5", formError ? "text-[var(--md-red)]" : "text-[var(--md-text)]")}>
                  {formError ?? t("Your ticket is sent securely to Databrain support. Nothing is marked successful until a ticket number is confirmed.")}
                </p>
                {canStartNewTicket ? (
                  <button
                    type="button"
                    className="mt-2 min-h-8 text-[12px] font-medium text-[var(--md-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                    onClick={startNewTicket}
                  >
                    {t("Use these details for a new ticket")}
                  </button>
                ) : null}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)]"
              >
                {isSubmitting
                  ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={1.4} aria-hidden="true" />
                  : <TicketCheck className="size-3.5" strokeWidth={1.4} aria-hidden="true" />}
                {isSubmitting ? t("Submitting ticket…") : t("Submit ticket")}
              </Button>
            </div>
          </SettingsPanel>
        </form>
        <aside className="xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <SettingsPanel title={t("What to include")} description={t("The clearest tickets are usually resolved fastest.")}>
            <ul className="grid gap-3 px-5 py-5 text-[12px] leading-5 text-[var(--md-text)]">
              <li><span className="font-medium text-[var(--md-ink)]">{t("Reference")}</span><br />{t("Booking, quote, shipment, customer, or invoice ID.")}</li>
              <li><span className="font-medium text-[var(--md-ink)]">{t("Expected result")}</span><br />{t("What you expected Multideck to do.")}</li>
              <li><span className="font-medium text-[var(--md-ink)]">{t("Visible result")}</span><br />{t("What happened instead, including the exact error message.")}</li>
            </ul>
          </SettingsPanel>
        </aside>
      </div>
    </>
  )
}

function SupportHubTab() {
  const { t } = useLanguage()
  return (
    <>
      <SettingsPageHeader
        eyebrow={t("Resources / Support")}
        title={t("Support")}
        description={t("Tell the support team what you need without losing the page or workflow you are working in.")}
      />
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_310px]">
        <SettingsPanel title={t("Create a support ticket")} description={t("The same focused ticket experience is available here and from the bottom of the sidebar.")}>
          <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Give support the full context in one go")}</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Choose the request type, explain the impact, and capture or attach a screenshot for bugs. Your company and reporter details are added securely.")}</p>
            </div>
            {supportTicketFeatureEnabled ? <Button type="button" className="min-h-11 shrink-0 rounded-[var(--md-radius-lg)] sm:min-h-10" onClick={openSupportTicket}>
              <TicketCheck className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
              {t("Submit a ticket")}
            </Button> : <p className="max-w-xs text-[12px] leading-5 text-[var(--md-subtle)]">{t("Ticket submission is being enabled for this workspace in a controlled rollout.")}</p>}
          </div>
        </SettingsPanel>
        <aside className="xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <SettingsPanel title={t("What happens next")} description={t("Your ticket is stored in Multideck Cloud and linked to this workspace automatically.")}>
            <ol className="grid gap-3 px-5 py-5 text-[12px] leading-5 text-[var(--md-text)]">
              <li><span className="font-medium text-[var(--md-ink)]">{t("1. Confirmation")}</span><br />{t("You receive a ticket reference and secure status link only after Cloud confirms it is saved.")}</li>
              <li><span className="font-medium text-[var(--md-ink)]">{t("2. Review")}</span><br />{t("The support team sees your impact, diagnostics, and any screenshots together.")}</li>
              <li><span className="font-medium text-[var(--md-ink)]">{t("3. Reply")}</span><br />{t("Public replies and meaningful status changes arrive in a Multideck-branded email.")}</li>
            </ol>
          </SettingsPanel>
        </aside>
      </div>
    </>
  )
}

function TabContent({
  activeTab,
  navigate,
  currentUser,
  profileMediaUrls,
  onProfilePhotoChange,
  onCoverPhotoChange,
}: {
  activeTab: SettingsSectionId
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
  profileMediaUrls: ProfileMediaUrls
  onProfilePhotoChange: (photo: UserProfilePhoto | null, photoUrl: string | null) => void
  onCoverPhotoChange: (photo: UserProfilePhoto | null) => void
}) {
  switch (activeTab) {
    case "profile":
      return (
        <ProfileTab
          currentUser={currentUser}
          profileMediaUrls={profileMediaUrls}
          onProfilePhotoChange={onProfilePhotoChange}
          onCoverPhotoChange={onCoverPhotoChange}
        />
      )
    case "availability":
      return <AvailabilityTab />
    case "security":
      return <SecurityTab />
    case "customisation":
      return <CustomisationTab />
    case "shortcuts":
      return <ShortcutsTab />
    case "dexter":
      return <AgentDexterTab />
    case "notifications":
      return <NotificationsTab />
    case "integrations":
      return <IntegrationsTab navigate={navigate} />
    case "whats-new":
      return <WhatsNewTab />
    case "docs":
      return <DocsTab />
    case "support":
      return supportTicketFeatureEnabled ? <SupportHubTab /> : <LegacySupportTab />
    default:
      return (
        <ProfileTab
          currentUser={currentUser}
          profileMediaUrls={profileMediaUrls}
          onProfilePhotoChange={onProfilePhotoChange}
          onCoverPhotoChange={onCoverPhotoChange}
        />
      )
  }
}

export function SettingsPage({
  navigate,
  currentUser,
  profileMediaUrls,
  onProfilePhotoChange,
  onCoverPhotoChange,
}: {
  navigate: (path: string) => void
  currentUser?: AuthUserSummary | null
  profileMediaUrls: ProfileMediaUrls
  onProfilePhotoChange: (photo: UserProfilePhoto | null, photoUrl: string | null) => void
  onCoverPhotoChange: (photo: UserProfilePhoto | null) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const aiAgentName = useAiAgentName()
  const [activeTab, setActiveTab] = useState<SettingsSectionId>(readSettingsSectionFromUrl)
  const activeItem = getSettingsSection(activeTab)

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("tab")
    const adminRoutes: Record<string, string> = {
      branding: "/admin/branding",
      permissions: "/admin/users",
      users: "/admin/users",
      "ai-usage": "/admin/usage",
      broadcast: "/admin/broadcast",
      billing: "/admin/billing",
    }
    if (section && adminRoutes[section]) {
      if (!currentUser) return
      navigate(adminRoutes[section])
      return
    }
    const onPopState = () => setActiveTab(readSettingsSectionFromUrl())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [currentUser, navigate])

  useEffect(() => {
    document.title = `${activeItem.id === "dexter" ? aiAgentName : activeItem.label} · Settings · Multideck`
  }, [activeItem.id, activeItem.label, aiAgentName])

  function changeTab(tab: SettingsSectionId) {
    setActiveTab(tab)
    window.history.pushState({}, "", tab === "profile" ? "/settings" : `/settings?tab=${tab}`)
    window.dispatchEvent(new PopStateEvent("popstate"))
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "auto" })
  }

  return (
    <div data-settings-page="" className="md-settings-page relative min-h-full bg-[var(--md-bg)]">
      <MobileSettingsTabs activeTab={activeItem.id} onChange={changeTab} onBack={() => navigate("/")} />
      <div className="relative min-w-0 px-[var(--md-page-pad)] py-[var(--md-page-pad)]">
        <div className="mx-auto max-w-[1180px] pb-[var(--md-page-bottom-pad)]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={activeItem.id}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -5, filter: "blur(2px)" }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
            >
              <TabContent
                activeTab={activeItem.id}
                navigate={navigate}
                currentUser={currentUser}
                profileMediaUrls={profileMediaUrls}
                onProfilePhotoChange={onProfilePhotoChange}
                onCoverPhotoChange={onCoverPhotoChange}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
