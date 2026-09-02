import {
  AiBrain,
  Bell,
  BookOpen,
  Cloud,
  Clock3,
  Command,
  LifeBuoy,
  Megaphone,
  Palette,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "@/components/icons/hugeicons"

export type SettingsSectionId =
  | "profile"
  | "availability"
  | "security"
  | "notifications"
  | "customisation"
  | "shortcuts"
  | "dexter"
  | "integrations"
  | "whats-new"
  | "docs"
  | "support"

export type SettingsNavigationItem = {
  id: SettingsSectionId
  label: string
  description: string
  icon: LucideIcon
  badge?: string
}

export type SettingsNavigationGroup = {
  label: string
  items: SettingsNavigationItem[]
}

export const settingsNavigationGroups: SettingsNavigationGroup[] = [
  {
    label: "Personal",
    items: [
      { id: "profile", label: "Profile", description: "Identity and contact details", icon: UserRound },
      { id: "availability", label: "Availability", description: "Working hours and booking rules", icon: Clock3 },
      { id: "security", label: "Security", description: "Password, 2FA and sessions", icon: ShieldCheck },
      { id: "notifications", label: "Notifications", description: "Alerts, digests and delivery", icon: Bell },
      { id: "customisation", label: "Customisation", description: "Language, theme and density", icon: Palette },
      { id: "shortcuts", label: "Keyboard shortcuts", description: "Summon Dexter and jump anywhere", icon: Command },
      { id: "dexter", label: "Dexter", description: "Name, writing, voice and privacy", icon: AiBrain },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "integrations", label: "Integrations", description: "Connected mail and systems", icon: Cloud },
    ],
  },
  {
    label: "Resources",
    items: [
      { id: "whats-new", label: "What's new", description: "Recent product improvements", icon: Megaphone, badge: "3" },
      { id: "docs", label: "Docs", description: "Guides and keyboard shortcuts", icon: BookOpen },
      { id: "support", label: "Support", description: "Help and support tickets", icon: LifeBuoy },
    ],
  },
]

export const settingsSectionIds = settingsNavigationGroups.flatMap((group) => group.items.map((item) => item.id))

export function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return Boolean(value && settingsSectionIds.includes(value as SettingsSectionId))
}

export function readSettingsSectionFromUrl(): SettingsSectionId {
  if (typeof window === "undefined") return "profile"
  const section = new URLSearchParams(window.location.search).get("tab")
  if (isSettingsSectionId(section)) return section
  const legacyHashSection = window.location.hash.replace(/^#/, "")
  return isSettingsSectionId(legacyHashSection) ? legacyHashSection : "profile"
}

export function getSettingsSection(sectionId: SettingsSectionId) {
  return settingsNavigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === sectionId) ?? settingsNavigationGroups[0].items[0]
}
