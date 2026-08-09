import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { Check, LayoutDashboard, Ship, Sparkles } from "@/components/icons/hugeicons"
import { useTheme } from "next-themes"
import { StaticBloomShader } from "@/components/multideck/dexter-action-pill"
import { useLanguage } from "@/i18n/language-provider"
import {
  accentPresets,
  buildAccentRamp,
  useAccentPresetId,
  writeAccentPresetId,
  type AccentPreset,
} from "@/lib/accent-theme"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

const alpha = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

type AccentCardProps = {
  preset: AccentPreset
  index: number
  selected: boolean
  focusable: boolean
  isDark: boolean
  reduceMotionEnabled: boolean
  /** Gates the WebGL context, not just the paint. See the grid's comment. */
  showBloom: boolean
  onSelect: (index: number) => void
  onFocus: (index: number) => void
  registerRef: (index: number, element: HTMLButtonElement | null) => void
}

/**
 * One card per accent, each rendered in its own colours rather than the live ones.
 * The card shows the two places the accent actually lands in the shell — the
 * selected nav item's ink and the Dexter button's shader — because those are what
 * an operator is really choosing between. A row of swatches cannot show either.
 *
 * Memoised, with the handlers taking an index so the parent can hold stable
 * callbacks: picking an accent then re-renders the two cards whose selected state
 * changed instead of the full grid, leaving the other shader trees untouched.
 */
const AccentCard = memo(function AccentCard({
  preset,
  index,
  selected,
  focusable,
  isDark,
  reduceMotionEnabled,
  showBloom,
  onSelect,
  onFocus,
  registerRef,
}: AccentCardProps) {
  const { t } = useLanguage()
  const agentName = useAiAgentName()

  // Every colour and every composed shadow for this card, rebuilt only when the
  // preset or the theme changes rather than on each selection.
  const paint = useMemo(() => {
    const ramp = buildAccentRamp(preset.id)
    const mode = isDark ? ramp.dark : ramp.light

    return {
      accent: mode.accent,
      accentInk: mode.accentInk,
      selectedText: mode.selectedText,
      shaderStops: ramp.brand.shader,
      ring: `0 0 0 1.5px ${mode.accent}, 0 8px 22px ${alpha(mode.accent, 22)}`,
      focusRing: `0 0 0 3px ${alpha(mode.accent, 40)}`,
      pillStroke: `inset 0 1px 0 ${alpha("#ffffff", 22)}, inset 0 0 0 1px ${alpha("#ffffff", 12)}, 0 0 0 1px ${alpha(ramp.brand.deep, 12)}, 0 4px 10px ${alpha(ramp.brand.deep, 16)}`,
      // Stands in for the bloom before its canvas mounts and after it unmounts, so
      // the pill is never a flat block and nothing pops as the grid scrolls in.
      pillBase: `linear-gradient(118deg, ${ramp.brand.shader[0]}, ${mode.accent} 52%, ${ramp.brand.shader[1]})`,
      pillVeil: `linear-gradient(110deg, ${alpha(ramp.brand.deep, 34)}, ${alpha(ramp.brand.deep, 10)} 56%, ${alpha(ramp.brand.deep, 30)})`,
    }
  }, [preset.id, isDark])

  return (
    <button
      ref={(element) => registerRef(index, element)}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${t(preset.label)} · ${t(preset.hint)}`}
      tabIndex={focusable ? 0 : -1}
      data-selected={selected || undefined}
      className={cn(
        "md-accent-card group/card relative block w-full min-w-0 rounded-[var(--md-radius-xl)] p-2 text-start",
        "bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]",
        // Hover changes the shadow only. Nothing moves and nothing rescales, so
        // sweeping the pointer across the grid cannot make ten shader canvases
        // repaint or take compositor layers of their own.
        "transition-[box-shadow] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:shadow-[var(--md-shadow-soft)]",
        "focus-visible:outline-none",
        "motion-reduce:transition-none",
      )}
      onClick={() => onSelect(index)}
      onFocus={() => onFocus(index)}
    >
      {selected ? (
        <motion.span
          aria-hidden="true"
          layoutId="md-accent-card-ring"
          // Shared across the ten cards, so choosing another accent slides the
          // ring over instead of blinking it out here and in again there.
          className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-xl)]"
          style={{ boxShadow: paint.ring }}
          transition={reduceMotion(reduceMotionEnabled, mdMotion.spring)}
        />
      ) : null}

      {/* Inset to the card's own box with the ring drawn by shadow spread: an
          outset element would widen the grid's scroll width by its overhang. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-xl)] opacity-0 transition-opacity duration-150 group-focus-visible/card:opacity-100"
        style={{ boxShadow: paint.focusRing }}
      />

      {/* A cut-down sidebar. Same order and proportions as the real one so the
          preview reads as the shell rather than as decoration. */}
      <span className="relative block overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-sidebar-bg)] p-1 shadow-[var(--md-shadow-line)]">
        <span
          className="mb-0.5 flex h-[22px] items-center gap-1.5 rounded-[var(--md-radius-sm)] bg-[var(--md-bg-strong)] px-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]"
          style={{ color: paint.selectedText }}
        >
          {/* The icon carries the full accent while the label keeps the sidebar's
              softer selected ink. At 10px the label alone is too small to show a
              colour, and the icon is the part being previewed. */}
          <LayoutDashboard className="size-[11px] shrink-0" strokeWidth={1.9} style={{ color: paint.accent }} />
          <span className="truncate text-[10px] font-medium leading-none">{t("Overview")}</span>
        </span>

        <span className="mb-1 flex h-[22px] items-center gap-1.5 rounded-[var(--md-radius-sm)] px-1.5 text-[var(--md-subtle)]">
          <Ship className="size-[11px] shrink-0" strokeWidth={1.5} />
          <span className="truncate text-[10px] font-medium leading-none">{t("Bookings")}</span>
        </span>

        <span
          className="md-accent-card__dexter relative flex h-[22px] items-center gap-1.5 overflow-hidden rounded-[var(--md-radius-sm)] px-1.5"
          style={{ background: paint.pillBase, boxShadow: paint.pillStroke }}
        >
          {showBloom ? (
            <span className="md-accent-card__shader absolute inset-0">
              <StaticBloomShader stops={paint.shaderStops} />
            </span>
          ) : null}
          {/* Lighter than the real pill's veil. That one has to carry a 13px label
              at full width; here the veil's only job is the 10px caption, and
              holding it back lets more of the accent through. */}
          <span className="absolute inset-0" style={{ background: paint.pillVeil }} />
          <Sparkles className="relative z-10 size-[11px] shrink-0 text-white" strokeWidth={1.5} />
          <span className="relative z-10 truncate text-[10px] font-medium leading-none text-white">
            {t(`Ask ${agentName}`)}
          </span>
        </span>
      </span>

      <span className="mt-2 flex min-w-0 items-center gap-1 px-0.5 pb-0.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--md-ink)]">{t(preset.label)}</span>
        <AnimatePresence initial={false}>
          {selected ? (
            <motion.span
              key="tick"
              aria-hidden="true"
              className="grid size-[14px] shrink-0 place-items-center rounded-full"
              style={{ background: paint.accent, color: paint.accentInk }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={reduceMotion(reduceMotionEnabled, { type: "spring", stiffness: 640, damping: 30, mass: 0.5 })}
            >
              <Check className="size-2.5" strokeWidth={3} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </button>
  )
})

export function AccentPicker({ className }: { className?: string }) {
  const activeId = useAccentPresetId()
  const { resolvedTheme } = useTheme()
  const { t } = useLanguage()
  const reduceMotionEnabled = Boolean(useReducedMotion())
  const [mounted, setMounted] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Fifteen WebGL contexts is a real cost to leave standing on a settings page the
  // operator has scrolled past, so they are mounted only while the grid is near
  // the viewport. The margin gets them up before the grid is actually seen, and
  // each pill keeps a CSS gradient underneath so there is nothing to pop.
  const gridNearby = useInView(gridRef, { margin: "300px" })

  // `resolvedTheme` is undefined until next-themes has read storage. Rendering the
  // light ramp meanwhile would make all ten cards flip once on hydration.
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"

  const activeIndex = accentPresets.findIndex((preset) => preset.id === activeId)
  const [focusIndex, setFocusIndex] = useState(() => Math.max(0, activeIndex))

  useEffect(() => {
    if (activeIndex >= 0) setFocusIndex(activeIndex)
  }, [activeIndex])

  // Stable identities, so `AccentCard`'s memo actually holds.
  const registerRef = useCallback((index: number, element: HTMLButtonElement | null) => {
    buttonRefs.current[index] = element
  }, [])

  const handleSelect = useCallback((index: number) => {
    writeAccentPresetId(accentPresets[index].id)
  }, [])

  const handleFocus = useCallback((index: number) => {
    setFocusIndex(index)
  }, [])

  const commit = useCallback((index: number) => {
    setFocusIndex(index)
    buttonRefs.current[index]?.focus()
    // Radio groups commit on arrow, which also lets the accent be scrubbed from
    // the keyboard as one continuous change rather than ten separate ones.
    writeAccentPresetId(accentPresets[index].id)
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const columns = 5
    const total = accentPresets.length
    const step = (offset: number) => (focusIndex + offset + total) % total

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        commit(step(1))
        break
      case "ArrowLeft":
        event.preventDefault()
        commit(step(-1))
        break
      // The full-width grid is five columns, so vertical arrows jump a row.
      case "ArrowDown":
        event.preventDefault()
        commit(step(columns))
        break
      case "ArrowUp":
        event.preventDefault()
        commit(step(-columns))
        break
      case "Home":
        event.preventDefault()
        commit(0)
        break
      case "End":
        event.preventDefault()
        commit(total - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={gridRef}
      role="radiogroup"
      aria-label={t("Accent colour")}
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", className)}
      onKeyDown={handleKeyDown}
    >
      {accentPresets.map((preset, index) => (
        <AccentCard
          key={preset.id}
          preset={preset}
          index={index}
          selected={preset.id === activeId}
          focusable={index === focusIndex}
          isDark={isDark}
          reduceMotionEnabled={reduceMotionEnabled}
          showBloom={gridNearby}
          registerRef={registerRef}
          onSelect={handleSelect}
          onFocus={handleFocus}
        />
      ))}
    </div>
  )
}
