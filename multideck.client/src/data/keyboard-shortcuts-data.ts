/**
 * Every keyboard shortcut Multideck ships, and its default binding.
 *
 * The rule for this file: a shortcut only appears here when something in the app
 * actually listens for it. A settings screen that advertises a key which does
 * nothing is worse than no settings screen, so the catalogue and the wiring in
 * `AppShortcuts` are kept in step.
 *
 * Two-key sequences carry the navigation set ("G" then "B" for bookings). That
 * keeps every destination reachable without spending a modifier chord the browser
 * or the operating system might already own.
 */

import {
  AiBrain,
  AudioWaveform,
  ArrowLeftRight,
  Compass,
  MousePointerClick,
  Search,
  SquareDashed,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { chord, pointerGesture, sequence, type ShortcutBinding } from "@/lib/keyboard-shortcut-binding"

export type ShortcutGroupId = "dictation" | "dexter" | "navigation" | "search" | "interface" | "create"

export type ShortcutDefinition = {
  id: string
  group: ShortcutGroupId
  label: string
  description: string
  defaultBinding: ShortcutBinding
  /** Marks the gesture that ought to survive a "reset everything" mistake. */
  signature?: boolean
}

export type ShortcutGroup = {
  id: ShortcutGroupId
  label: string
  description: string
  icon: LucideIcon
}

export const shortcutGroups: ShortcutGroup[] = [
  {
    id: "dictation",
    label: "Dictation",
    description: "Speak into the field you are editing.",
    icon: AudioWaveform,
  },
  {
    id: "dexter",
    label: "Dexter",
    description: "Summon Dexter here or open its workspace.",
    icon: AiBrain,
  },
  {
    id: "search",
    label: "Search and command",
    description: "Find a record or shortcut.",
    icon: Search,
  },
  {
    id: "navigation",
    label: "Go to",
    description: "Press G, then a destination key.",
    icon: Compass,
  },
  {
    id: "create",
    label: "Create",
    description: "Start common operator work.",
    icon: SquareDashed,
  },
  {
    id: "interface",
    label: "Interface",
    description: "Control the workspace shell.",
    icon: ArrowLeftRight,
  },
]

export const shortcutDefinitions: ShortcutDefinition[] = [
  // ── Dictation ─────────────────────────────────────────────────────────────
  {
    id: "dictation.toggle",
    group: "dictation",
    label: "Hold to dictate",
    description: "Hold to speak; release to insert the transcript.",
    defaultBinding: chord("Fn"),
    signature: true,
  },

  // ── Dexter ────────────────────────────────────────────────────────────────
  {
    id: "dexter.summon",
    group: "dexter",
    label: "Summon Dexter on anything",
    description: "Modifier-double-click to open Dexter with context.",
    defaultBinding: pointerGesture({ mod: true }),
    signature: true,
  },
  {
    id: "dexter.summonKeyboard",
    group: "dexter",
    label: "Summon Dexter from the keyboard",
    description: "Summons Dexter for the focused item.",
    defaultBinding: chord("D", { mod: true }),
    signature: true,
  },
  {
    id: "dexter.workspace",
    group: "dexter",
    label: "Open the Dexter workspace",
    description: "Opens the full Dexter conversation.",
    defaultBinding: chord("J", { mod: true }),
  },
  {
    id: "dexter.newConversation",
    group: "dexter",
    label: "Start a new Dexter conversation",
    description: "Starts a fresh Dexter thread.",
    defaultBinding: chord("O", { mod: true, shift: true }),
  },

  // ── Search and command ────────────────────────────────────────────────────
  {
    id: "search.focus",
    group: "search",
    label: "Search bookings and quotes",
    description: "Focuses the workspace command bar.",
    defaultBinding: chord("K", { mod: true }),
  },
  {
    id: "search.quickFocus",
    group: "search",
    label: "Quick search",
    description: "Opens the command bar with one key.",
    defaultBinding: chord("/"),
  },
  {
    id: "shortcuts.overview",
    group: "search",
    label: "Show keyboard shortcuts",
    description: "Opens the shortcut list.",
    defaultBinding: chord("/", { mod: true }),
  },

  // ── Go to ─────────────────────────────────────────────────────────────────
  {
    id: "goto.overview",
    group: "navigation",
    label: "Go to Overview",
    description: "Open the operations cockpit.",
    defaultBinding: sequence("G", "H"),
  },
  {
    id: "goto.bookings",
    group: "navigation",
    label: "Go to Bookings",
    description: "Open the booking register.",
    defaultBinding: sequence("G", "B"),
  },
  {
    id: "goto.quotes",
    group: "navigation",
    label: "Go to Quotes",
    description: "Open the quote register.",
    defaultBinding: sequence("G", "Q"),
  },
  {
    id: "goto.roadControl",
    group: "navigation",
    label: "Go to Road control",
    description: "Open domestic road control.",
    defaultBinding: sequence("G", "R"),
  },
  {
    id: "goto.customers",
    group: "navigation",
    label: "Go to Customers",
    description: "Open customer accounts.",
    defaultBinding: sequence("G", "C"),
  },
  {
    id: "goto.leads",
    group: "navigation",
    label: "Go to Leads",
    description: "Open the CRM lead register.",
    defaultBinding: sequence("G", "L"),
  },
  {
    id: "goto.deals",
    group: "navigation",
    label: "Go to Deals",
    description: "Open the pipeline board.",
    defaultBinding: sequence("G", "D"),
  },
  {
    id: "goto.contactCards",
    group: "navigation",
    label: "Go to Contact cards",
    description: "Open shareable contact cards.",
    defaultBinding: sequence("G", "V"),
  },
  {
    id: "goto.warehouse",
    group: "navigation",
    label: "Go to Warehouse",
    description: "Open inventory and warehouse flows.",
    defaultBinding: sequence("G", "W"),
  },
  {
    id: "goto.reports",
    group: "navigation",
    label: "Go to Reports",
    description: "Open reports and templates.",
    defaultBinding: sequence("G", "E"),
  },
  {
    id: "goto.settings",
    group: "navigation",
    label: "Go to Settings",
    description: "Open your workspace settings.",
    defaultBinding: chord(",", { mod: true }),
  },

  // ── Create ────────────────────────────────────────────────────────────────
  {
    id: "create.booking",
    group: "create",
    label: "New booking",
    description: "Open the booking wizard.",
    defaultBinding: chord("B", { mod: true, shift: true }),
  },
  {
    id: "create.quote",
    group: "create",
    label: "New quote",
    description: "Open Quotes ready to draft.",
    defaultBinding: chord("Q", { mod: true, shift: true }),
  },
  {
    id: "create.lead",
    group: "create",
    label: "New lead",
    description: "Open Leads ready to capture.",
    defaultBinding: chord("L", { mod: true, shift: true }),
  },

  // ── Interface ─────────────────────────────────────────────────────────────
  {
    id: "interface.sidebar",
    group: "interface",
    label: "Collapse or expand the sidebar",
    description: "Toggle the sidebar width.",
    defaultBinding: chord("\\", { mod: true }),
  },
  {
    id: "interface.theme",
    group: "interface",
    label: "Switch light and dark",
    description: "Switch this browser's theme.",
    defaultBinding: chord("M", { mod: true, shift: true }),
  },
  {
    id: "interface.back",
    group: "interface",
    label: "Back",
    description: "Return to the previous page.",
    defaultBinding: chord("[", { mod: true }),
  },
  {
    id: "interface.forward",
    group: "interface",
    label: "Forward",
    description: "Move to the next page.",
    defaultBinding: chord("]", { mod: true }),
  },
]

export const shortcutDefinitionMap = new Map(shortcutDefinitions.map((definition) => [definition.id, definition]))

export function getShortcutDefinition(id: string) {
  return shortcutDefinitionMap.get(id)
}

export function shortcutsInGroup(groupId: ShortcutGroupId) {
  return shortcutDefinitions.filter((definition) => definition.group === groupId)
}

/** The icon shown beside the summon gesture wherever it is explained. */
export const summonGestureIcon: LucideIcon = MousePointerClick
