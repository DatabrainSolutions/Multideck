import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { KeyboardShortcutsPanel } from "@/components/multideck/keyboard-shortcuts-panel"
import { useLanguage } from "@/i18n/language-provider"
import { setThemeWithProfileIntent } from "@/lib/theme-preferences"
import { focusAppSearch } from "@/lib/app-commands"
import { DEXTER_NEW_CONVERSATION_EVENT } from "@/lib/dexter-navigation"
import { getShortcutDefinition, shortcutDefinitions } from "@/data/keyboard-shortcuts-data"
import {
  usePendingSequence,
  useShortcutActions,
  useShortcutBindings,
  type PendingSequence,
  type ShortcutBindingMap,
} from "@/lib/keyboard-shortcuts"
import { mdEaseIn, mdEaseOut, mdMotion, reduceMotion } from "@/lib/motion"
import { useSidebarCollapsed } from "@/lib/sidebar-preferences"

/** Where each "go to" shortcut lands. */
const destinations: Record<string, string> = {
  "goto.overview": "/",
  "goto.bookings": "/bookings",
  "goto.quotes": "/quotes",
  "goto.roadControl": "/road-control",
  "goto.customers": "/customers",
  "goto.leads": "/crm/leads",
  "goto.deals": "/crm/deals",
  "goto.contactCards": "/crm/contact-cards",
  "goto.warehouse": "/warehouse",
  "goto.reports": "/reports",
  "goto.paperTray": "/paper-tray",
  "goto.settings": "/settings",
  "create.booking": "/bookings/new",
  "create.quote": "/quotes",
  "create.lead": "/crm/leads",
}

/**
 * The leader hint. When a sequence is half typed this pill names what the second
 * key can still reach, so an operator learns the set by using it rather than by
 * memorising the settings page.
 */
type SequenceOption = { id: string; key: string; label: string }

/** Catalogue order, so the hint always reads in the same order as Settings. */
const sequenceOrder = new Map(shortcutDefinitions.map((definition, index) => [definition.id, index]))

function readSequenceOptions(pending: PendingSequence, bindings: ShortcutBindingMap): SequenceOption[] {
  return pending.candidates
    .map((id) => {
      const definition = getShortcutDefinition(id)
      const binding = bindings[id]
      const second = binding?.kind === "chord" ? binding.steps[1] : null
      if (!definition || !second) return null

      return { id, key: second.key, label: definition.label.replace(/^Go to\s+/i, "") }
    })
    .filter((option): option is SequenceOption => Boolean(option))
    .sort((a, b) => (sequenceOrder.get(a.id) ?? 0) - (sequenceOrder.get(b.id) ?? 0))
}

function SequenceHud() {
  const pending = usePendingSequence()
  const bindings = useShortcutBindings()
  const shouldReduceMotion = useReducedMotion()
  const { t } = useLanguage()
  // The hint keeps its last contents while it fades out, so leaving never blanks
  // the pill first. Kept mounted for the same reason: a transient element that
  // mounts and unmounts on every keystroke is where flicker comes from.
  const [shown, setShown] = useState<{ tokens: string[]; options: SequenceOption[] } | null>(null)

  useEffect(() => {
    if (!pending) return
    setShown({ tokens: pending.tokens, options: readSequenceOptions(pending, bindings) })
  }, [bindings, pending])

  if (typeof document === "undefined" || !shown) return null

  const visible = Boolean(pending)

  return createPortal(
    <motion.div
      aria-hidden={!visible}
      className="md-summon-hud"
      initial={false}
      animate={
        shouldReduceMotion
          ? { opacity: visible ? 1 : 0 }
          : { opacity: visible ? 1 : 0, y: visible ? 0 : 10, filter: visible ? "blur(0px)" : "blur(5px)" }
      }
      transition={{
        default: reduceMotion(Boolean(shouldReduceMotion), mdMotion.spring),
        // Leaving is quicker than arriving, so the hint never lingers over the
        // page it was describing.
        opacity: { duration: shouldReduceMotion ? 0 : visible ? 0.18 : 0.13, ease: visible ? mdEaseOut : mdEaseIn },
        filter: { duration: shouldReduceMotion ? 0 : 0.24, ease: mdEaseOut },
      }}
    >
      <span className="flex items-center gap-1.5">
        <KbdGroup dir="ltr" data-i18n-skip>
          {shown.tokens.map((token) => (
            <Kbd key={token} className="h-5 min-w-5 bg-[var(--md-accent-a10)] text-[11px] text-[var(--md-accent)]">
              {token}
            </Kbd>
          ))}
        </KbdGroup>
        <span className="text-[12.5px] font-medium text-[var(--md-ink)]">{t("then")}</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        {shown.options.map((option) => (
          <span key={option.id} className="flex items-center gap-1.5">
            <Kbd className="h-[18px] min-w-[18px] bg-[var(--md-field-bg)] px-1 text-[10.5px] text-[var(--md-ink)]" data-i18n-skip>
              {option.key}
            </Kbd>
            <span className="text-[11.5px] text-[var(--md-text)]">{t(option.label)}</span>
          </span>
        ))}
      </span>
    </motion.div>,
    document.body,
  )
}

/**
 * Binds every app-level shortcut in one place, so the settings list and the real
 * behaviour cannot drift apart.
 *
 * Mounted once by the app shell. Route-local shortcuts belong to their own screens
 * — this is the shell's set: moving around, opening things, and reshaping the
 * chrome.
 */
export function AppShortcuts({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const { resolvedTheme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed()
  const [overviewOpen, setOverviewOpen] = useState(false)

  const goTo = useCallback(
    (id: string) => {
      const path = destinations[id]
      if (path) navigate(path)
    },
    [navigate],
  )

  const search = useCallback(() => {
    // The command bar only exists on routes that render the top bar, so an
    // operator pressing it elsewhere is taken somewhere it does.
    if (focusAppSearch()) return

    navigate("/")
    window.setTimeout(() => focusAppSearch(), 220)
  }, [navigate])

  const actions = useMemo(() => {
    const map: Record<string, () => void> = {
      "dexter.workspace": () => navigate("/agent-dexter"),
      "dexter.newConversation": () => {
        navigate("/agent-dexter")
        window.dispatchEvent(new CustomEvent(DEXTER_NEW_CONVERSATION_EVENT))
      },
      "search.focus": search,
      "search.quickFocus": search,
      "shortcuts.overview": () => setOverviewOpen((open) => !open),
      "interface.sidebar": () => setSidebarCollapsed(!sidebarCollapsed),
      "interface.theme": () => setThemeWithProfileIntent(setTheme, resolvedTheme === "dark" ? "light" : "dark"),
      "interface.back": () => window.history.back(),
      "interface.forward": () => window.history.forward(),
    }

    for (const id of Object.keys(destinations)) map[id] = () => goTo(id)
    return map
  }, [goTo, navigate, resolvedTheme, search, setSidebarCollapsed, setTheme, sidebarCollapsed])

  useShortcutActions(actions)

  return (
    <>
      <SequenceHud />
      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent
          showCloseButton
          className="max-h-[min(720px,calc(100vh-64px))] w-[calc(100%-2rem)] max-w-[720px] gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-0 sm:max-w-[720px]"
        >
          <DialogHeader className="px-5 pb-3 pt-5 text-start">
            <DialogTitle className="text-[15px] font-medium text-[var(--md-ink)]">{t("Keyboard shortcuts")}</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-5 text-[var(--md-text)]">
              {t("Change any of these here, or from Settings. Changes save as soon as you record them.")}
            </DialogDescription>
          </DialogHeader>
          <div className="md-scrollbar max-h-[min(560px,calc(100vh-220px))] overflow-y-auto">
            <KeyboardShortcutsPanel compact />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
