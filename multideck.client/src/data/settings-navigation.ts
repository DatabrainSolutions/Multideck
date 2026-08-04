import {
  Bell,
  BookOpen,
  Cloud,
  Command,
  CreditCard,
  LifeBuoy,
  Megaphone,
  Palette,
  PenLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

export type SettingsSectionId =
  | "profile"
  | "security"
  | "notifications"
  | "customisation"
  | "shortcuts"
  | "dexter"
  | "permissions"
  | "integrations"
  | "billing"
  | "ai-usage"
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
      { id: "security", label: "Security", description: "Password, 2FA and sessions", icon: ShieldCheck },
      { id: "notifications", label: "Notifications", description: "Alerts, digests and delivery", icon: Bell },
      { id: "customisation", label: "Customisation", description: "Language, theme and density", icon: Palette },
      { id: "shortcuts", label: "Keyboard shortcuts", description: "Summon Dexter and jump anywhere", icon: Command },
      { id: "dexter", label: "Dexter", description: "Personal email writing style", icon: PenLine },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "permissions", label: "Permissions", description: "Roles and sensitive access", icon: UsersRound },
      { id: "integrations", label: "Integrations", description: "Connected mail and systems", icon: Cloud },
      { id: "billing", label: "Billing", description: "Plan, payment and invoices", icon: CreditCard },
      { id: "ai-usage", label: "AI usage", description: "Spend, actions and guardrails", icon: Sparkles },
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
  return isSettingsSectionId(section) ? section : "profile"
}

export function getSettingsSection(sectionId: SettingsSectionId) {
  return settingsNavigationGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === sectionId) ?? settingsNavigationGroups[0].items[0]
}
