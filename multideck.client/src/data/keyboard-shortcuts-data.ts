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
  ArrowLeftRight,
  Compass,
  MousePointerClick,
  Search,
  Sparkles,
  SquareDashed,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { chord, pointerGesture, sequence, type ShortcutBinding } from "@/lib/keyboard-shortcut-binding"

export type ShortcutGroupId = "dexter" | "navigation" | "search" | "interface" | "create"

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
    id: "dexter",
    label: "Dexter",
    description: "Summon the agent where you already are, or open its workspace.",
    icon: Sparkles,
  },
  {
    id: "search",
    label: "Search and command",
    description: "Jump to a record, or find a shortcut you have forgotten.",
    icon: Search,
  },
  {
    id: "navigation",
    label: "Go to",
    description: "Mostly two-key runs: press G, release it, then press the second key.",
    icon: Compass,
  },
  {
    id: "create",
    label: "Create",
    description: "Start the work an operator starts most often.",
    icon: SquareDashed,
  },
  {
    id: "interface",
    label: "Interface",
    description: "Reshape the shell without leaving the keyboard.",
    icon: ArrowLeftRight,
  },
]

export const shortcutDefinitions: ShortcutDefinition[] = [
  // ── Dexter ────────────────────────────────────────────────────────────────
  {
    id: "dexter.summon",
    group: "dexter",
    label: "Summon Dexter on anything",
    description:
      "Hold the modifier and double-click a field, chart, table or panel. Dexter opens against that thing with its context already attached.",
    defaultBinding: pointerGesture({ mod: true }),
    signature: true,
  },
  {
    id: "dexter.summonKeyboard",
    group: "dexter",
    label: "Summon Dexter from the keyboard",
    description: "The same summon without a mouse. Uses whatever is focused, or opens the area picker.",
    defaultBinding: chord("D", { mod: true }),
    signature: true,
  },
  {
    id: "dexter.workspace",
    group: "dexter",
    label: "Open the Dexter workspace",
    description: "Leave the summon behind and move to the full conversation surface.",
    defaultBinding: chord("J", { mod: true }),
  },
  {
    id: "dexter.newConversation",
    group: "dexter",
    label: "Start a new Dexter conversation",
    description: "Clears the composer and begins a fresh thread.",
    defaultBinding: chord("O", { mod: true, shift: true }),
  },

  // ── Search and command ────────────────────────────────────────────────────
  {
    id: "search.focus",
    group: "search",
    label: "Search bookings and quotes",
    description: "Focuses the command bar at the top of the workspace.",
    defaultBinding: chord("K", { mod: true }),
  },
  {
    id: "search.quickFocus",
    group: "search",
    label: "Quick search",
    description: "The bare-key route to the same command bar, for when your hands are already on the letters.",
    defaultBinding: chord("/"),
  },
  {
    id: "shortcuts.overview",
    group: "search",
    label: "Show keyboard shortcuts",
    description: "Opens this list over whatever you are working on.",
    defaultBinding: chord("/", { mod: true }),
  },

  // ── Go to ─────────────────────────────────────────────────────────────────
  {
    id: "goto.overview",
    group: "navigation",
    label: "Go to Overview",
    description: "The operations cockpit.",
    defaultBinding: sequence("G", "H"),
  },
  {
    id: "goto.bookings",
    group: "navigation",
    label: "Go to Bookings",
    description: "The live booking register.",
    defaultBinding: sequence("G", "B"),
  },
  {
    id: "goto.quotes",
    group: "navigation",
    label: "Go to Quotes",
    description: "The quote register.",
    defaultBinding: sequence("G", "Q"),
  },
  {
    id: "goto.roadControl",
    group: "navigation",
    label: "Go to Road control",
    description: "Domestic road jobs and the control board.",
    defaultBinding: sequence("G", "R"),
  },
  {
    id: "goto.customers",
    group: "navigation",
    label: "Go to Customers",
    description: "Customer accounts.",
    defaultBinding: sequence("G", "C"),
  },
  {
    id: "goto.leads",
    group: "navigation",
    label: "Go to Leads",
    description: "The CRM lead register.",
    defaultBinding: sequence("G", "L"),
  },
  {
    id: "goto.deals",
    group: "navigation",
    label: "Go to Deals",
    description: "The pipeline board.",
    defaultBinding: sequence("G", "D"),
  },
  {
    id: "goto.contactCards",
    group: "navigation",
    label: "Go to Contact cards",
    description: "Shareable QR contact cards.",
    defaultBinding: sequence("G", "V"),
  },
  {
    id: "goto.warehouse",
    group: "navigation",
    label: "Go to Warehouse",
    description: "Inventory, goods in and goods out.",
    defaultBinding: sequence("G", "W"),
  },
  {
    id: "goto.reports",
    group: "navigation",
    label: "Go to Reports",
    description: "Report library and templates.",
    defaultBinding: sequence("G", "E"),
  },
  {
    id: "goto.paperTray",
    group: "navigation",
    label: "Go to Paper tray",
    description: "Documents waiting on a person.",
    defaultBinding: sequence("G", "T"),
  },
  {
    id: "goto.settings",
    group: "navigation",
    label: "Go to Settings",
    description: "Your profile, workspace and this shortcut list.",
    defaultBinding: chord(",", { mod: true }),
  },

  // ── Create ────────────────────────────────────────────────────────────────
  {
    id: "create.booking",
    group: "create",
    label: "New booking",
    description: "Opens the booking wizard.",
    defaultBinding: chord("B", { mod: true, shift: true }),
  },
  {
    id: "create.quote",
    group: "create",
    label: "New quote",
    description: "Opens the quote register ready to draft.",
    defaultBinding: chord("Q", { mod: true, shift: true }),
  },
  {
    id: "create.lead",
    group: "create",
    label: "New lead",
    description: "Opens the lead register ready to capture.",
    defaultBinding: chord("L", { mod: true, shift: true }),
  },

  // ── Interface ─────────────────────────────────────────────────────────────
  {
    id: "interface.sidebar",
    group: "interface",
    label: "Collapse or expand the sidebar",
    description: "Widens the working area without losing your place.",
    defaultBinding: chord("\\", { mod: true }),
  },
  {
    id: "interface.theme",
    group: "interface",
    label: "Switch light and dark",
    description: "Flips the theme for this browser.",
    defaultBinding: chord("M", { mod: true, shift: true }),
  },
  {
    id: "interface.back",
    group: "interface",
    label: "Back",
    description: "Steps back through the pages you opened.",
    defaultBinding: chord("[", { mod: true }),
  },
  {
    id: "interface.forward",
    group: "interface",
    label: "Forward",
    description: "Steps forward again.",
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
