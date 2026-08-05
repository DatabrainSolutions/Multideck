import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Activity,
  BadgeCheck,
  Bell,
  BookOpen,
  Braces,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  Cpu,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  History,
  ImagePlus,
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
  Plug,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TicketCheck,
  Trash2,
  Upload,
  UserRound,
  Users,
  WandSparkles,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import gmailLogo from "@/assets/integrations/gmail.svg"
import outlookLogo from "@/assets/integrations/outlook.svg"
import sageLogo from "@/assets/integrations/sage.svg"
import xeroLogo from "@/assets/integrations/xero.svg"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AccentPicker } from "@/components/multideck/accent-picker"
import { AuthIdentityManager } from "@/components/multideck/auth-provider-selector"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { KeyboardShortcutsPanel } from "@/components/multideck/keyboard-shortcuts-panel"
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
import { languageOptions, getLanguageOption } from "@/i18n/languages"
import { useLanguage } from "@/i18n/language-provider"
import {
  changeApiTeamUserOffice,
  createApiAuthorizationRole,
  createApiTeamUser,
  deleteApiAuthorizationRole,
  getApiCurrentUser,
  getApiAuthorizationState,
  getApiTeamUsers,
  updateApiCurrentUserProfile,
  updateApiRolePermissions,
  updateApiUserRoles,
  type ApiAuthorizationRole,
  type ApiAuthorizationState,
  type ApiPermission,
  type ApiTeamRole,
  type ApiTeamUser,
  type ApiTeamUsersResponse,
} from "@/lib/api"
import {
  createSupportTicket,
  SupportTicketError,
  type CreateSupportTicketResponse,
} from "@/lib/support-ticket"
import { getDexterUsage, type DexterUsage, type DexterUsageEntry } from "@/lib/dexter-api"
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
  syncMailbox,
  type InboxConnection,
  type InboxProviderAvailability,
  type MailProvider,
  type Mailbox,
} from "@/lib/inbox-api"
import { useShortcutBinding } from "@/lib/keyboard-shortcuts"
import { DEXTER_CONVERSATIONS_CHANGED_EVENT } from "@/lib/dexter-navigation"
import { clockDisplayLabelFromMode, clockDisplayLabels, clockDisplayModeFromLabel, readClockDisplayMode, useAiAgentName, writeClockDisplayMode } from "@/lib/user-preferences"
import type { AuthUserSummary } from "@/lib/auth-user"
import { getSupabaseSession, supabase } from "@/lib/supabase"
import {
  ProfilePhotoValidationError,
  createProfilePhotoSignedUrl,
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
                {group.items.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
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
            {coverPhotoUrl ? (
              <img src={coverPhotoUrl} alt="" className="size-full object-cover" loading="eager" fetchPriority="high" decoding="async" />
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
            <SettingsFieldRow label="Phone" description="For two-factor and emergency alerts only.">
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

function CustomisationTab() {
  const [density, setDensity] = useState(() => window.localStorage.getItem("multideck.settings.density") ?? "Comfortable")
  const [startPage, setStartPage] = useState(() => window.localStorage.getItem("multideck.settings.start-page") ?? "Overview")
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
      {/* Full width rather than inside the two-column grid below: the accent grid
          wants ten cards across two rows, and squeezing it into a field row would
          make each preview too small to judge. */}
      <SettingsPanel
        className="mt-[var(--md-page-stack-gap)]"
        title="Accent colour"
        description="Recolours every highlight, chart and Dexter surface across the app. Each accent carries its own light and dark shade, so both themes stay readable."
      >
        <div className="px-5 py-4">
          <AccentPicker />
        </div>
      </SettingsPanel>
      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,430px)]">
        <div className="space-y-[var(--md-page-stack-gap)]">
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
              <SettingsChoiceGroup
                options={["Overview", "Bookings", "Customers", "Agent Dexter"]}
                value={startPage}
                onChange={setStartPage}
              />
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

        <aside className="xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <section
            data-density={density.toLowerCase()}
            className="md-settings-preview relative isolate overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)] sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-[var(--md-ink)]">Live workspace preview</p>
                <p className="mt-1 text-[11px] text-[var(--md-subtle)]">Updates as you make changes</p>
              </div>
              <StatusPill tone="teal">Live</StatusPill>
            </div>
            <div className="mt-4 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-bg)] p-2 shadow-[inset_0_0_0_1px_rgba(11,20,19,0.05)]">
              <div className="grid min-h-[330px] grid-cols-[76px_minmax(0,1fr)] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]">
                <div className="bg-[var(--md-sidebar-bg)] p-2 shadow-[var(--md-stroke-right)]">
                  <span className="block h-3 w-10 rounded-full bg-[var(--md-ink)] opacity-80" />
                  <div className="mt-6 space-y-2">
                    {[1, 2, 3, 4].map((item) => (
                      <span
                        key={item}
                        className={cn(
                          "block h-7 rounded-[var(--md-radius-sm)]",
                          item === 1 ? "bg-[var(--md-bg-strong)] shadow-[var(--md-shadow-line)]" : "bg-[var(--md-surface-tint)] opacity-65",
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div className="min-w-0 p-3">
                  <div className="flex items-center justify-between">
                    <span className="h-3 w-24 rounded-full bg-[var(--md-ink)] opacity-75" />
                    <span className="size-6 rounded-[var(--md-radius-sm)] bg-[var(--md-accent)]" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[62, 44, 78].map((width, index) => (
                      <div key={width} className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
                        <span className="block h-2 rounded-full bg-[var(--md-subtle)] opacity-30" style={{ width: `${width}%` }} />
                        <span className="mt-3 block h-4 w-10 rounded-full bg-[var(--md-ink)] opacity-80" />
                        <span className={cn("mt-2 block h-1.5 rounded-full", index === 2 ? "bg-[var(--md-amber)]" : "bg-[var(--md-accent)]")} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] shadow-[var(--md-shadow-line)]">
                    {[1, 2, 3, 4].map((row) => (
                      <div key={row} className="md-settings-preview__row grid grid-cols-[20px_minmax(0,1fr)_36px] items-center gap-2 px-2.5 shadow-[var(--md-stroke-bottom)] last:shadow-none">
                        <span className="size-4 rounded-full bg-[var(--md-avatar-bg)]" />
                        <span className="h-2 rounded-full bg-[var(--md-text)] opacity-25" style={{ width: `${74 - row * 7}%` }} />
                        <span className="h-4 rounded-full bg-[var(--md-accent-a10)]" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[var(--md-text)]">
              <span className="rounded-full bg-[var(--md-surface-soft)] px-2.5 py-1 shadow-[var(--md-shadow-line)]">{density}</span>
              <span className="rounded-full bg-[var(--md-surface-soft)] px-2.5 py-1 shadow-[var(--md-shadow-line)]">{startPage} start</span>
            </div>
          </section>
        </aside>
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
        description="Every shortcut in Multideck, and the keys they are on. Record a new one by clicking its keys and pressing what you would rather use — two plain keys in a row make a sequence."
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

function AgentDexterTab() {
  const { language, t } = useLanguage()
  const [profile, setProfile] = useState<DexterWritingProfile | null>(null)
  const [profileText, setProfileText] = useState("")
  const [loading, setLoading] = useState(true)
  const [operation, setOperation] = useState<"consent" | "save" | "refresh" | "reset" | "toggle" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [featureUnavailable, setFeatureUnavailable] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await getDexterWritingProfile()
      setProfile(next)
      setProfileText(next.profileText)
      setFeatureUnavailable(false)
    } catch (loadError) {
      const unavailable = loadError instanceof DexterWritingProfileError && loadError.code === "feature_disabled"
      setFeatureUnavailable(unavailable)
      setError(writingProfileErrorCopy(loadError, "Unable to load your email writing profile.", t))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  function acceptProfile(next: DexterWritingProfile) {
    setProfile(next)
    setProfileText(next.profileText)
    setError(null)
  }

  async function learnStyle() {
    if (operation) return
    setOperation("consent")
    setError(null)
    try {
      acceptProfile(await consentToDexterWritingProfile())
      toast.success(t("Dexter has learned your email writing style."))
    } catch (learnError) {
      setError(writingProfileErrorCopy(learnError, "Dexter could not create your writing profile. Try again.", t))
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
    setError(null)
    try {
      acceptProfile(await updateDexterWritingProfile(enabled, profileText))
    } catch (toggleError) {
      setError(writingProfileErrorCopy(toggleError, "Dexter could not update this setting. Try again.", t))
    } finally {
      setOperation(null)
    }
  }

  async function saveProfile() {
    if (!profile || operation) return
    setOperation("save")
    setError(null)
    try {
      acceptProfile(await updateDexterWritingProfile(profile.enabled, profileText))
      toast.success(t("Email writing profile saved"))
    } catch (saveError) {
      setError(writingProfileErrorCopy(saveError, "Dexter could not save your writing profile. Try again.", t))
    } finally {
      setOperation(null)
    }
  }

  async function refreshProfile() {
    if (operation) return
    setOperation("refresh")
    setError(null)
    try {
      acceptProfile(await refreshDexterWritingProfile())
      toast.success(t("Email writing profile refreshed"))
    } catch (refreshError) {
      setError(writingProfileErrorCopy(refreshError, "Dexter could not refresh your writing profile. Your saved profile is unchanged.", t))
    } finally {
      setOperation(null)
    }
  }

  async function resetProfile() {
    if (operation) return
    setOperation("reset")
    setError(null)
    try {
      acceptProfile(await resetDexterWritingProfile())
      setResetOpen(false)
      toast.success(t("Email writing profile reset"))
    } catch (resetError) {
      setError(writingProfileErrorCopy(resetError, "Dexter could not reset your writing profile. Nothing was deleted.", t))
    } finally {
      setOperation(null)
    }
  }

  const busy = operation !== null
  const dirty = Boolean(profile && profileText !== profile.profileText)
  const formattedRefresh = profile?.lastGeneratedAt
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(profile.lastGeneratedAt))
    : t("Not yet")
  const statusMessage = loading
    ? t("Loading your private writing profile...")
    : profile?.status === "processing" || operation === "consent" || operation === "refresh"
      ? t("Dexter is learning the patterns in your eligible sent emails. You can leave this page.")
      : profile?.status === "insufficient"
        ? t("Dexter needs at least 10 eligible sent emails before it can learn your style.")
        : profile?.status === "error"
          ? t("Dexter could not create the profile. Your previous profile is unchanged.")
          : profile?.status === "ready"
            ? t("Ready. Dexter uses this only when you ask it to write an email.")
            : t("Nothing has been analysed. Turn this on when you want Dexter to learn how you write.")

  return (
    <>
      <SettingsPageHeader
        title={t("Dexter")}
        description={t("Let Dexter learn the tone and structure of your sent emails. It never uses this profile for ordinary answers or as a source of facts.")}
        actions={
          profile?.exists ? (
            <Button type="button" variant="ghost" disabled={busy} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]" onClick={() => void refreshProfile()}>
              {operation === "refresh" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <History className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
              {t(operation === "refresh" ? "Refreshing" : "Refresh now")}
            </Button>
          ) : undefined
        }
      />
      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel
          title={t("Personal email style")}
          description={t("Built from up to 40 eligible emails you sent in the last 12 months. Dexter stores only the compact style profile, not copied email bodies.")}
        >
          {featureUnavailable ? (
            <div className="px-5 py-4">
              <p role="status" className="text-[13px] leading-5 text-[var(--md-text)]">{error}</p>
            </div>
          ) : (
            <>
              <SettingsToggleRow
                title={t("Write emails like me")}
                description={t("When on, Dexter applies your private style profile only to email drafts, replies and rewrites.")}
                checked={profile?.enabled === true}
                disabled={loading || busy}
                onCheckedChange={(checked) => void toggleStyle(checked)}
                meta={<span>{t(profile?.enabled ? "On" : "Off")}</span>}
              />
              <SettingsFieldRow label={t("Profile status")} description={t("Learning never sends mail and never changes operational records.")} align="start">
                <div>
                  <p role={error ? "alert" : "status"} aria-live="polite" className={cn("text-[13px] leading-5", error ? "text-[var(--md-red)]" : "text-[var(--md-text)]")}>
                    {error ?? statusMessage}
                  </p>
                  {!profile?.exists && !loading ? (
                    <Button type="button" disabled={busy} className="mt-3 h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:active:scale-100" onClick={() => void learnStyle()}>
                      {operation === "consent" ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <WandSparkles className="size-3.5" strokeWidth={1.5} aria-hidden="true" />}
                      {t(operation === "consent" ? "Learning your style" : "Learn my email style")}
                    </Button>
                  ) : null}
                </div>
              </SettingsFieldRow>
              <SettingsFieldRow label={t("Eligible history")} description={t("Automated mail, trivial replies, quoted threads, footers and unproven shared-mailbox messages are excluded.")} align="start">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                    <dt className="text-[11.5px] text-[var(--md-subtle)]">{t("Eligible messages")}</dt>
                    <dd className="mt-1 text-[16px] font-medium tabular-nums text-[var(--md-ink)]">{profile?.eligibleMessageCount ?? 0}</dd>
                  </div>
                  <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                    <dt className="text-[11.5px] text-[var(--md-subtle)]">{t("Last refreshed")}</dt>
                    <dd className="mt-1 text-[13px] font-medium text-[var(--md-ink)]">{formattedRefresh}</dd>
                  </div>
                </dl>
              </SettingsFieldRow>
              <SettingsFieldRow label={t("Writing profile")} description={t("Edit the guidance Dexter applies. Keep facts, names, prices and commitments out of this profile.")} align="start" labelFor="dexter-writing-profile">
                <div>
                  <SettingsTextarea
                    id="dexter-writing-profile"
                    value={profileText}
                    maxLength={2400}
                    disabled={loading || busy || !profile?.exists}
                    aria-describedby="dexter-writing-profile-count"
                    className="min-h-[260px] resize-y text-[16px] leading-[1.6] sm:text-[14px]"
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
              </SettingsFieldRow>
            </>
          )}
        </SettingsPanel>

        <SettingsPanel title={t("Privacy and control")} description={t("This is your personal preference. It is never shared across the company and does not create Watching for you activity.")}>
          <SettingsFieldRow label={t("Reset writing profile")} description={t("Delete the derived profile and stop future refreshes. Your original sent emails remain in their provider and Inbox history.")}>
            <Button type="button" variant="ghost" disabled={!profile?.exists || busy} className="h-10 rounded-[var(--md-radius-lg)] bg-[rgba(209,78,78,0.08)] px-4 text-[13px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.12)]" onClick={() => setResetOpen(true)}>
              <Trash2 className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              {t("Reset profile")}
            </Button>
          </SettingsFieldRow>
          <SettingsFieldRow label={t("Sending approval")} description={t("Dexter never sends automatically. Only selecting the paper plane on an editable draft sends the email.")}>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
              <ShieldCheck className="size-3.5 text-[var(--md-green)]" strokeWidth={1.5} aria-hidden="true" />
              {t("Operator click required")}
            </span>
          </SettingsFieldRow>
        </SettingsPanel>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[440px]">
          <DialogHeader className="text-start">
            <DialogTitle>{t("Reset email writing profile?")}</DialogTitle>
            <DialogDescription>{t("This deletes Dexter’s derived style profile and stops monthly refreshes. It does not delete any email from Gmail, Outlook or Inbox.")}</DialogDescription>
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
                    className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
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
                    className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
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
                  className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]"
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
                        className="h-8 w-full min-w-[170px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-opacity hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-[210px]"
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
                        className="h-8 w-full min-w-[190px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2.5 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-opacity hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] disabled:cursor-not-allowed disabled:opacity-55 sm:w-[230px]"
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
        eyebrow="Workspace / Permissions"
        title="Permissions"
        description="See who can reach sensitive freight data, then shape access by role without losing the operational context behind each permission."
        actions={compactAction("Refresh", () => void loadAuthorizationState())}
      />
      {authorizationState ? (
        <div className="mt-[var(--md-page-stack-gap)] grid gap-3 sm:grid-cols-3">
          {[
            [Users, "Workspace roles", String(authorizationState.roles.length), "System and custom roles"],
            [ShieldCheck, "Permission rules", String(authorizationState.permissions.length), "Across the live workspace"],
            [BadgeCheck, "Selected role", selectedRole?.name ?? "None", selectedRole ? `${selectedRole.permissionValues.length} permissions active` : "Choose a role below"],
          ].map(([Icon, label, value, detail]) => (
            <section key={label as string} className="group flex items-center gap-4 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
              <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-accent-a09)] text-[var(--md-accent)] transition-transform duration-200 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-[var(--md-subtle)]">{label as string}</span>
                <span className="mt-0.5 block truncate text-[15px] font-medium tabular-nums text-[var(--md-ink)]">{value as string}</span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--md-text)]">{detail as string}</span>
              </span>
            </section>
          ))}
        </div>
      ) : null}
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
                  className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none hover:bg-[var(--md-field-bg-hover)] focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:max-w-[360px]"
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
                    className="h-9 shrink-0 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] disabled:opacity-55"
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
                          <Checkbox
                            className="mt-0.5 md:mt-0"
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={() => void handleToggleRolePermission(selectedRole, permission.value)}
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

const mailProviderCopy: Record<MailProvider, { label: string; description: string }> = {
  gmail: {
    label: "Gmail",
    description: "Read and reply to operational mail from a Google Workspace account, including Spam and Trash. Google Group messages appear when they are delivered to this account.",
  },
  outlook: {
    label: "Outlook",
    description: "Read and reply to operational mail from Microsoft 365, including shared and group mailboxes.",
  },
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
  const [groupMailboxAddress, setGroupMailboxAddress] = useState("")
  const [groupMailboxError, setGroupMailboxError] = useState<string | null>(null)
  const [sharedMailboxAddress, setSharedMailboxAddress] = useState("")
  const [sharedMailboxError, setSharedMailboxError] = useState<string | null>(null)
  const [writingProfilePrompt, setWritingProfilePrompt] = useState<DexterWritingProfile | null>(null)
  const [writingProfilePromptBusy, setWritingProfilePromptBusy] = useState(false)
  const [writingProfilePromptKey, setWritingProfilePromptKey] = useState<string | null>(null)
  const [writingProfilePromptDismissed, setWritingProfilePromptDismissed] = useState(true)

  const loadConnections = useCallback(async () => {
    setLoadError(null)
    setMailboxLoadError(null)
    setProviderAvailabilityError(null)
    const [connectionsResult, availabilityResult, mailboxesResult] = await Promise.allSettled([
      listInboxConnections(),
      listInboxProviders(),
      listMailboxes(),
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
      toast.success(`${mailProviderCopy[connection.provider].label} disconnected`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disconnect this provider.")
    } finally {
      setBusyProvider(null)
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
        <SettingsPanel
          title="Mail"
          description={t("Mail powers the Inbox workspace. Multideck securely syncs the last 12 months of useful mail, 30 days of Spam and Trash, and current drafts so operators can search, reply and use Dexter; Gmail or Microsoft remains the source mailbox.")}
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
            (["gmail", "outlook"] as MailProvider[]).map((provider) => {
              const connection = connections.find((candidate) => candidate.provider === provider) ?? null
              const copy = mailProviderCopy[provider]
              const configured = providerAvailability?.find((candidate) => candidate.provider === provider)?.configured === true
              const needsConnection = !connection || connection.status === "disconnected" || connection.status === "reauthorization_required"
              const statusKey =
                !configured ? "Unavailable" :
                !connection ? "Not connected" :
                connection.status === "reauthorization_required" ? "Reconnect needed" :
                connection.status === "syncing" ? "Syncing" :
                connection.status === "error" ? "Sync problem" :
                connection.status === "disconnected" ? "Not connected" :
                "Connected"
              const description = !configured
                ? providerAvailabilityError ?? t(`${copy.label} has not been configured for this workspace yet. Ask a Multideck administrator to add the provider credentials.`)
                : connection?.error?.trim() || t(copy.description)
              const actionLabel =
                busyProvider === provider ? t("Working") :
                needsConnection ? (configured
                  ? t(connection?.status === "reauthorization_required" ? "Reconnect" : "Connect")
                  : t("Unavailable")) :
                t("Disconnect")

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
                    description={description}
                    status={t(statusKey)}
                    statusTone={
                      statusKey === "Connected" ? "connected" :
                      statusKey === "Reconnect needed" || statusKey === "Sync problem" ? "review" :
                      statusKey === "Syncing" ? "workspace" :
                      "ready"
                    }
                    actionLabel={actionLabel}
                    disabled={busyProvider !== null || (needsConnection && !configured)}
                    onAction={() => {
                      if (busyProvider) return
                      if (needsConnection) {
                        void connect(provider)
                        return
                      }
                      void disconnect(connection)
                    }}
                  />
                  {provider === "gmail" && connection && !needsConnection ? (
                    <SettingsFieldRow
                      label={t("Google Group inboxes")}
                      description={t("Add a Google Group address whose messages are delivered to this Gmail account. Multideck creates a filtered group view across Inbox, Spam and Trash without pretending the group is a separate Google mailbox.")}
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
                      description={t("Connect only the shared addresses you are authorised to use. Microsoft may also require Exchange Send As or Send on Behalf permission before Multideck can send from them.")}
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
            })
          )}
        </SettingsPanel>

        <SettingsPanel
          title={t("Accounting")}
          description={t("Xero and Sage connections are being prepared for this workspace.")}
        >
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
        description="Keep the plan, seats, payment method, and invoice history understandable without mixing them into operational AI usage."
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

const aiUsageCategories = [
  { id: "dexter", label: "Agent Dexter", share: 100, color: "var(--md-ai-cyan)" },
]

function AiUsageOverview({
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
  const { language, t } = useLanguage()
  const totalUsage = usage?.includedActionsLimit ?? 10_000
  const usedUsage = usage?.actionsUsed ?? 0
  const remainingUsage = Math.max(0, totalUsage - usedUsage)
  const usedPercent = Math.min(100, Math.round((usedUsage / Math.max(1, totalUsage)) * 100))
  const taskTrend = usage?.trend.map((point) => ({
    label: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(`${point.weekStart}T00:00:00`)),
    value: point.actions,
    tokens: point.tokens,
  })) ?? Array.from({ length: 6 }, (_, index) => ({ label: `W${index + 1}`, value: 0, tokens: 0 }))
  const maxTaskValue = Math.max(1, ...taskTrend.map((point) => point.value))
  const latestWeek = taskTrend.at(-1)?.value ?? 0
  const daysRemaining = Math.max(0, Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() - Date.now()) / 86_400_000))
  const trackedPercent = Math.min(100, Math.round(((usage?.trackedActions ?? 0) / Math.max(1, usedUsage)) * 100))
  const totalTokens = usage?.totalTokens ?? 0
  const inputPercent = totalTokens > 0 ? Math.round(((usage?.inputTokens ?? 0) / totalTokens) * 100) : 0
  const outputPercent = totalTokens > 0 ? Math.max(0, 100 - inputPercent) : 0
  const metrics: Array<[LucideIcon, string, string, string]> = [
    [Activity, "Dexter actions", usedUsage.toLocaleString(), "Completed this month"],
    [MessageCircle, "Conversations", (usage?.conversationCount ?? 0).toLocaleString(), "Used this month"],
    [Cpu, "Input tokens", (usage?.inputTokens ?? 0).toLocaleString(), "Workspace context Dexter reviewed"],
    [WandSparkles, "Output tokens", (usage?.outputTokens ?? 0).toLocaleString(), "Responses Dexter generated"],
  ]
  const modelUsage = (["fast", "smart", "worker"] as const).map((model) => {
    const recorded = usage?.modelBreakdown?.find((entry) => entry.model === model)
    const price = dexterModelPrices[model]
    const providerModel = recorded?.providerModel ?? price.providerModel
    const reasoningEffort = recorded?.reasoningEffort ?? (model === "smart" ? "high" : "medium")
    const inputTokens = recorded?.inputTokens ?? 0
    const outputTokens = recorded?.outputTokens ?? 0
    const cost = estimateDexterModelCost({ model, providerModel, reasoningEffort, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens })
    return { model, providerModel, reasoningEffort, inputTokens, outputTokens, cost }
  })
  const hasModelBreakdown = Array.isArray(usage?.modelBreakdown)
  const estimatedCostUsd = modelUsage.reduce((total, entry) => total + entry.cost.totalUsd, 0)
  const formatUsd = (value: number) => new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value)

  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / AI usage"
        title="AI usage"
        description="See Dexter's current workspace usage, token volume, and recent activity."
        actions={compactAction("Export usage", () => toast.success("AI usage export prepared"))}
      />

      {error ? (
        <div role="alert" className="mt-[var(--md-page-stack-gap)] flex flex-col gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Dexter usage is temporarily unavailable")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(error)}</p>
          </div>
          <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium" onClick={onRetry}>
            {t("Try again")}
          </Button>
        </div>
      ) : null}

      <section
        aria-busy={isLoading}
        className="md-settings-ai-stage relative isolate mt-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)] sm:p-6"
      >
        <span className="md-settings-ai-stage__grid" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
          <div>
            <SettingsProgressRing
              value={usedPercent}
              label={t("Monthly Dexter usage")}
              detail={`${usedUsage.toLocaleString()} / ${totalUsage.toLocaleString()} ${t("actions")}`}
              tone="accent"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <StatusPill tone={error ? "amber" : isLoading ? "neutral" : "teal"}>
                {t(error ? "Unavailable" : isLoading ? "Refreshing" : "Live usage")}
              </StatusPill>
              <span className="rounded-full bg-[var(--md-surface-soft)] px-2.5 py-1 text-[11px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                <span className="tabular-nums" data-i18n-skip>{daysRemaining}</span> {t("days left")}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[12px] text-[var(--md-text)]">{t("Dexter actions this month")}</p>
                <p className="mt-1 text-[28px] font-medium tracking-[-0.03em] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{usedUsage.toLocaleString()}</p>
              </div>
              <p className="text-end text-[12px] font-medium text-[var(--md-green)]">
                <span className="tabular-nums" data-i18n-skip>{(usage?.totalTokens ?? 0).toLocaleString()}</span> {t("tokens processed")}
              </p>
            </div>
            <div className="mt-4 flex h-[128px] items-end gap-2" role="img" aria-label={t("Dexter action volume over the last six weeks")}>
              {taskTrend.map((point, index) => (
                <div key={`${point.label}-${index}`} className="flex h-full min-w-0 flex-1 items-end">
                  <motion.span
                    className="block w-full min-h-1 rounded-t-[var(--md-radius-md)] bg-[linear-gradient(180deg,var(--md-accent),color-mix(in_srgb,var(--md-accent)_65%,var(--md-blue)))]"
                    title={`${point.label}: ${point.value.toLocaleString()} ${t("actions")}, ${point.tokens.toLocaleString()} ${t("tokens")}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: `${Math.max(4, (point.value / maxTaskValue) * 100)}%`, opacity: 1 }}
                    transition={{ ...mdMotion.morph, delay: index * 0.04 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="workspace-usage-title"
        className="mt-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)] sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="workspace-usage-title" className="text-[16px] font-medium text-[var(--md-ink)]">{t("Usage")}</h2>
            <p className="mt-1 text-[13px] text-[var(--md-text)]">{t("Included AI actions used this month")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="sm:text-end">
              <p className="text-[28px] font-medium tracking-[-0.03em] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
                {usedUsage.toLocaleString()}<span className="text-[var(--md-subtle)]">/{totalUsage.toLocaleString()}</span>
              </p>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Metered Dexter activity for this month")}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-fit rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
              onClick={onViewHistory}
            >
              {t("View usage history")}
              <ChevronRight className="size-3.5 rtl:rotate-180" strokeWidth={1.4} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div
          role="img"
          aria-label={`${t("Usage")}: ${usedUsage.toLocaleString()} / ${totalUsage.toLocaleString()}`}
          className="relative mt-6 h-[42px] overflow-hidden rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-1.5 shadow-[inset_0_0_0_1px_rgba(11,20,19,0.05)] sm:h-[46px]"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-45"
            style={{ backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--md-text) 24%, transparent) 1px, transparent 1.2px)", backgroundSize: "12px 12px" }}
          />
          <div className="relative flex h-full items-stretch gap-1">
            {aiUsageCategories.map((category, index) => (
              <motion.span
                key={category.id}
                aria-hidden="true"
                className="block min-w-[5px] rounded-[calc(var(--md-radius-lg)-6px)] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                style={{ backgroundColor: category.color }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: `${(usedPercent * category.share) / 100}%`, opacity: 1 }}
                transition={{ ...mdMotion.morph, delay: index * 0.04 }}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3">
          {aiUsageCategories.map((category) => (
            <div key={category.id} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
              <span className="text-[13px] font-medium text-[var(--md-ink)]">{t(category.label)}</span>
              <span className="text-[13px] tabular-nums text-[var(--md-text)]" data-i18n-skip>{category.share}%</span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 text-[13px] text-[var(--md-text)] sm:flex-row sm:items-center sm:justify-between">
          <p><span className="tabular-nums" data-i18n-skip>{remainingUsage.toLocaleString()}</span> {t("included actions remaining")}</p>
          <p><span className="tabular-nums" data-i18n-skip>{usedPercent}%</span> {t("of monthly usage used")}</p>
        </div>
      </section>

      <div className="mt-[var(--md-page-stack-gap)] grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([Icon, label, value, detail]) => (
          <section key={label} className="group rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)] transition-transform duration-200 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <Icon className="size-4" strokeWidth={1.35} aria-hidden="true" />
              </span>
              <span className="text-end text-[11px] text-[var(--md-subtle)]">{t(label)}</span>
            </div>
            <p className="mt-5 text-[21px] font-medium tracking-[-0.025em] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{value}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t(detail)}</p>
          </section>
        ))}
      </div>

      <div className="mt-[var(--md-page-stack-gap)] grid gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <SettingsPanel title="Dexter actions over time" description="Completed Dexter responses across the last six weeks.">
          <div className="px-5 pb-5 pt-2">
            <div className="flex h-[164px] items-end gap-3 border-b border-[var(--md-line-strong)]">
              {taskTrend.map((point, index) => (
                <div key={point.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                  <motion.span
                    className="block min-h-2 rounded-t-[var(--md-radius-md)] bg-[linear-gradient(180deg,var(--md-accent),color-mix(in_srgb,var(--md-accent)_64%,var(--md-blue)))]"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: `${Math.max(12, (point.value / maxTaskValue) * 100)}%`, opacity: 1 }}
                    transition={{ ...mdMotion.morph, delay: index * 0.04 }}
                  />
                  <span className="pb-2 text-center text-[11px] text-[var(--md-subtle)]">{point.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[12px] text-[var(--md-text)]">Latest week</p>
                <p className="mt-1 text-[18px] font-medium text-[var(--md-ink)]">
                  <span className="tabular-nums" data-i18n-skip>{latestWeek.toLocaleString()}</span> {t("actions")}
                </p>
              </div>
              <StatusPill tone="teal">Live</StatusPill>
            </div>
          </div>
        </SettingsPanel>

        <SettingsPanel title="Token usage" description="How Dexter's metered context and responses make up this month's usage.">
          {[
            ["Input tokens", `${inputPercent}%`, inputPercent],
            ["Output tokens", `${outputPercent}%`, outputPercent],
            ["Actions with token data", `${trackedPercent}%`, trackedPercent],
          ].map(([label, value, percentage]) => (
            <div key={label as string} className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(label as string)}</p>
                <p className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>{value as string}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--md-surface-tint)]">
                <motion.span
                  className="block h-full rounded-full bg-[var(--md-accent)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={mdMotion.morph}
                />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 bg-[var(--md-surface-soft)] px-5 py-4">
            {[
              ["Total tokens", (usage?.totalTokens ?? 0).toLocaleString()],
              ["Average per action", Math.round((usage?.totalTokens ?? 0) / Math.max(1, usedUsage)).toLocaleString()],
              ["Conversations", (usage?.conversationCount ?? 0).toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p className="text-[15px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>{value}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--md-text)]">{t(label)}</p>
              </div>
            ))}
          </div>
        </SettingsPanel>
      </div>

      <SettingsPanel title="Development cost estimate" description="Internal estimate from this month's recorded API tokens. It is not an invoice.">
        <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Estimated API cost")}</p>
            <p className="mt-1 text-[28px] font-medium tracking-[-0.03em] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{hasModelBreakdown ? formatUsd(estimatedCostUsd) : "—"}</p>
          </div>
          <p className="max-w-[480px] text-[12px] leading-5 text-[var(--md-text)]">
            {hasModelBreakdown
              ? t("Uses each recorded model and thinking mode. Thinking mode changes token use, while the model's token rate remains the same. Prompt caching, tool calls, batch or priority processing, taxes, and other provider fees are excluded.")
              : t("Model-level token data will appear after the usage reporting migration is applied.")}
          </p>
        </div>
        <div className="overflow-x-auto border-t border-[var(--md-line)]">
          <table className="w-full min-w-[680px] text-start">
            <thead className="bg-[var(--md-surface-soft)] text-[11px] text-[var(--md-text)]">
              <tr>
                {["Engine", "Model", "Thinking mode", "Input tokens", "Output tokens", "Rates per 1M", "Estimated cost"].map((label) => (
                  <th key={label} scope="col" className="px-5 py-3 text-start font-medium">{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-line)]">
              {modelUsage.map(({ model, providerModel, reasoningEffort, inputTokens, outputTokens, cost }) => {
                const price = dexterModelPrices[model]
                const engine = model === "smart" ? "Balanced" : model === "fast" ? "Fast" : "Worker"
                return (
                  <tr key={model}>
                    <th scope="row" className="px-5 py-4 text-[13px] font-medium text-[var(--md-ink)]">{t(engine)}</th>
                    <td className="px-5 py-4 text-[12px] text-[var(--md-text)]" data-i18n-skip>{providerModel}</td>
                    <td className="px-5 py-4 text-[12px] capitalize text-[var(--md-text)]">{t(reasoningEffort)}</td>
                    <td className="px-5 py-4 text-[13px] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{hasModelBreakdown ? inputTokens.toLocaleString() : "—"}</td>
                    <td className="px-5 py-4 text-[13px] tabular-nums text-[var(--md-ink)]" data-i18n-skip>{hasModelBreakdown ? outputTokens.toLocaleString() : "—"}</td>
                    <td className="px-5 py-4 text-[12px] tabular-nums text-[var(--md-text)]" data-i18n-skip>${price.inputPerMillionUsd.toFixed(2)} in · ${price.outputPerMillionUsd.toFixed(2)} out</td>
                    <td className="px-5 py-4 text-[13px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip>{hasModelBreakdown ? formatUsd(cost.totalUsd) : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </SettingsPanel>
    </>
  )
}

function AiUsageHistoryScreen({
  usage,
  isLoading,
  error,
  onRetry,
  onBack,
}: {
  usage: DexterUsage | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  const [featureFilter, setFeatureFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(6)
  const aiUsageHistory = (usage?.recentEntries ?? []).map((entry: DexterUsageEntry) => ({
    id: entry.id,
    units: entry.totalTokens,
    feature: "Agent Dexter",
    detail: entry.title,
    featureId: "dexter",
    action: "Spent",
    cost: "Included",
    date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt)),
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
  }))
  const featureOptions = ["all", ...aiUsageCategories.map((category) => category.id)]
  const featureLabels = Object.fromEntries([
    ["all", t("All features")],
    ...aiUsageCategories.map((category) => [category.id, t(category.label)]),
  ])
  const actionOptions = ["all", "spent"]
  const actionLabels = {
    all: t("All actions"),
    spent: t("Spent"),
  }
  const filteredUsage = aiUsageHistory.filter((entry) => (
    (featureFilter === "all" || entry.featureId === featureFilter)
    && (actionFilter === "all" || entry.action.toLowerCase() === actionFilter)
  ))
  const pageCount = Math.max(1, Math.ceil(filteredUsage.length / pageSize))
  const visibleUsage = filteredUsage.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [featureFilter, actionFilter, pageSize])

  return (
    <>
      <SettingsPageHeader
        eyebrow="Workspace / AI usage / History"
        title="Usage history"
        description="Review the latest metered Dexter responses for this workspace."
        actions={compactAction("Back to AI overview", onBack)}
      />
      <section className="mt-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
              <History className="size-4" strokeWidth={1.35} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{t("Recent Dexter usage")}</h2>
              <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Filter this month's metered activity by feature or action")}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <SettingsSelect
              value={featureFilter}
              options={featureOptions}
              optionLabels={featureLabels}
              ariaLabel={t("Filter by feature")}
              className="min-w-0 sm:min-w-[180px]"
              onChange={setFeatureFilter}
            />
            <SettingsSelect
              value={actionFilter}
              options={actionOptions}
              optionLabels={actionLabels}
              ariaLabel={t("Filter by action")}
              className="min-w-0 sm:min-w-[156px]"
              onChange={setActionFilter}
            />
          </div>
        </div>

        {error ? (
          <div role="alert" className="px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Dexter usage is temporarily unavailable")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t(error)}</p>
            <Button type="button" variant="ghost" className="mt-4 h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] px-4 text-[13px] font-medium" onClick={onRetry}>
              {t("Try again")}
            </Button>
          </div>
        ) : visibleUsage.length > 0 ? (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-[var(--md-surface-soft)]">
                  <TableRow className="border-[rgba(11,20,19,0.05)] hover:bg-transparent">
                    <TableHead className="h-11 px-6 text-[12px] font-medium text-[var(--md-text)]">{t("Usage")}</TableHead>
                    <TableHead className="h-11 px-6 text-[12px] font-medium text-[var(--md-text)]">{t("Feature")}</TableHead>
                    <TableHead className="h-11 px-6 text-[12px] font-medium text-[var(--md-text)]">{t("Action")}</TableHead>
                    <TableHead className="h-11 px-6 text-[12px] font-medium text-[var(--md-text)]">{t("Spend")}</TableHead>
                    <TableHead className="h-11 px-6 text-[12px] font-medium text-[var(--md-text)]">{t("Date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsage.map((entry) => (
                    <TableRow key={entry.id} className="h-[72px] border-[rgba(11,20,19,0.055)] hover:bg-[var(--md-hover)]">
                      <TableCell className="px-6 text-[14px] font-medium text-[var(--md-ink)]">
                        <span className="tabular-nums" data-i18n-skip>{entry.units.toLocaleString()}</span> {t("tokens")}
                      </TableCell>
                      <TableCell className="max-w-[360px] px-6">
                        <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t(entry.feature)}</p>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--md-text)]" data-i18n-skip>{entry.detail}</p>
                      </TableCell>
                      <TableCell className="px-6">
                        <StatusPill tone="neutral">{t(entry.action)}</StatusPill>
                      </TableCell>
                      <TableCell className="px-6 text-[13px] font-medium text-[var(--md-ink)]">{t(entry.cost)}</TableCell>
                      <TableCell className="px-6 text-[13px] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{entry.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y divide-[rgba(11,20,19,0.055)] md:hidden">
              {visibleUsage.map((entry) => (
                <article key={entry.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{t(entry.feature)}</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-[var(--md-text)]" data-i18n-skip>{entry.detail}</p>
                    </div>
                    <StatusPill tone="neutral">{t(entry.action)}</StatusPill>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                    <p className="font-medium text-[var(--md-ink)]"><span className="tabular-nums" data-i18n-skip>{entry.units.toLocaleString()}</span> {t("tokens")}</p>
                    <p className="text-end font-medium text-[var(--md-ink)]">{t(entry.cost)}</p>
                    <p className="col-span-2 text-[var(--md-text)]" dir="ltr" data-i18n-skip>{entry.date}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t(isLoading ? "Loading Dexter usage" : "No Dexter usage this month")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">
              {t(isLoading ? "The latest metered activity will appear here shortly." : "Dexter responses will appear here after the first completed request.")}
            </p>
          </div>
        )}

        <div className="p-4">
          <Pagination
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            totalItems={filteredUsage.length}
            pageSize={pageSize}
            pageSizeOptions={[6, 10, 14]}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="usage entries"
            className="bg-[var(--md-surface-soft)]"
          />
        </div>
      </section>
    </>
  )
}

function AiUsageTab() {
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
    document.title = `${view === "history" ? "Usage history" : "AI usage"} · Settings · Multideck`
  }, [view])

  function changeView(nextView: "overview" | "history") {
    const nextPath = nextView === "history" ? "/settings?tab=ai-usage&view=history" : "/settings?tab=ai-usage"
    window.history.pushState({}, "", nextPath)
    setView(nextView)
    window.dispatchEvent(new PopStateEvent("popstate"))
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "auto" })
  }

  return view === "history"
    ? (
        <AiUsageHistoryScreen
          usage={usage}
          isLoading={isLoading}
          error={error}
          onRetry={() => void loadUsage()}
          onBack={() => changeView("overview")}
        />
      )
    : (
        <AiUsageOverview
          usage={usage}
          isLoading={isLoading}
          error={error}
          onRetry={() => void loadUsage()}
          onViewHistory={() => changeView("history")}
        />
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
      icon: Sparkles,
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
      title: "Read billing and AI usage",
      detail: "Understand plan cost, invoices, and value created by AI.",
      category: "Billing",
      icon: CreditCard,
      steps: ["Use Billing for plan, seats, payment, and invoices.", "Use AI usage for volume, spend, and accepted output.", "Compare saved time and acceptance before changing the budget."],
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

function SupportTab() {
  const { t } = useLanguage()
  const [topic, setTopic] = useState("Workflow question")
  const [priority, setPriority] = useState("Normal")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ticketResult, setTicketResult] = useState<CreateSupportTicketResponse | null>(null)
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

      const result = await createSupportTicket({
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
      toast.success(
        result.duplicate
          ? t("Ticket already received")
          : t("Support ticket created"),
        { description: `${result.ticket.ticketNumber} · ${t("Databrain OS confirmed the ticket.")}` },
      )
    } catch (error) {
      console.error("Support ticket submission failed.", error instanceof SupportTicketError ? error.code : "unknown")
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
                onChange={setPriority}
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
        <aside className="space-y-[var(--md-page-stack-gap)] xl:sticky xl:top-[var(--md-page-pad)] xl:self-start">
          <SettingsSummaryCard
            title={t("Support cover")}
            rows={[
              [t("Plan"), t("Operations")],
              [t("Response target"), t("4 working hours")],
              [t("Coverage"), t("Mon–Fri, 08:00–18:00")],
              [t("Open tickets"), "1"],
            ]}
          />
          <section className="rounded-[var(--md-radius-2xl)] bg-[var(--md-ink)] p-5 text-white shadow-[var(--md-shadow-soft)]">
            <LifeBuoy className="size-5 text-white/70" strokeWidth={1.3} aria-hidden="true" />
            <p className="mt-5 text-[15px] font-medium">{t("Security incident?")}</p>
            <p className="mt-2 text-pretty text-[12px] leading-5 text-white/65">{t("Mark the ticket as urgent. The subject will be routed with security context included.")}</p>
            <a href="mailto:security@multideck.app" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[var(--md-radius-lg)] bg-white/10 px-3 text-[12px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-[background-color,scale] hover:bg-white/15 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/30 motion-reduce:active:scale-100">
              {t("Contact security")}
              <ExternalLink className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
            </a>
          </section>
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
    case "permissions":
      return <PermissionsTab />
    case "integrations":
      return <IntegrationsTab navigate={navigate} />
    case "billing":
      return <BillingTab />
    case "ai-usage":
      return <AiUsageTab />
    case "whats-new":
      return <WhatsNewTab />
    case "docs":
      return <DocsTab />
    case "support":
      return <SupportTab />
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
  const [activeTab, setActiveTab] = useState<SettingsSectionId>(readSettingsSectionFromUrl)
  const activeItem = getSettingsSection(activeTab)

  useEffect(() => {
    const onPopState = () => setActiveTab(readSettingsSectionFromUrl())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  useEffect(() => {
    document.title = `${activeItem.label} · Settings · Multideck`
  }, [activeItem.label])

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
