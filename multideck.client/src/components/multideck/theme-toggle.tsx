import { motion, useReducedMotion } from "motion/react"
import { Moon02, Sun } from "@/components/icons/hugeicons"
import { useTheme } from "@/lib/theme-provider"
import { useLanguage } from "@/i18n/language-provider"
import { setThemeWithProfileIntent } from "@/lib/theme-preferences"
import { cn } from "@/lib/utils"

type ThemeToggleProps = {
  className?: string
  compact?: boolean
  showAppearanceLabel?: boolean
}

export function ThemeToggle({ className, compact = false, showAppearanceLabel = true }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const isDark = resolvedTheme === "dark"
  const nextTheme = isDark ? "light" : "dark"
  const label = t(isDark ? "Switch to light mode" : "Switch to dark mode")
  const modeLabel = t(isDark ? "Dark mode" : "Light mode")

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      data-theme-toggle-state={isDark ? "dark" : "light"}
      className={cn(
        "group/theme-toggle flex h-10 w-full items-center justify-between gap-3 rounded-[var(--md-radius-lg)] px-2.5 text-left text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow,color,opacity,scale,transform] duration-200 active:scale-[0.96] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
        compact && "size-10 justify-center rounded-[var(--md-radius-md)] p-0",
        className,
      )}
      onClick={() => setThemeWithProfileIntent(setTheme, nextTheme)}
    >
      {compact ? null : (
        <span className="min-w-0">
          {showAppearanceLabel ? <span className="block text-[12px] font-medium leading-[1.35] text-[var(--md-subtle)]">{t("Appearance")}</span> : null}
          <span className="block truncate text-[13px] font-medium leading-[1.4] text-[var(--md-ink)]">{modeLabel}</span>
        </span>
      )}

      <span className={cn(
        "relative h-[30px] shrink-0 overflow-hidden rounded-full bg-[var(--md-icon-well)] text-[var(--md-accent)] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.06)] transition-[background-color,box-shadow] duration-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
        compact ? "w-[30px]" : "w-12",
      )}>
        <motion.span
          aria-hidden="true"
          className="absolute start-[3px] top-[3px] grid size-6 place-items-center rounded-full bg-[var(--md-surface)] shadow-[0_2px_8px_rgba(11,20,19,0.16),inset_0_0_0_1px_rgba(255,255,255,0.7)]"
          animate={{ x: compact ? 0 : isDark ? (direction === "rtl" ? -18 : 18) : 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
        >
          <motion.span
            className="absolute grid place-items-center"
            initial={false}
            animate={{ opacity: isDark ? 0 : 1, scale: isDark ? 0.25 : 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <Sun className="size-4" strokeWidth={1.25} />
          </motion.span>
          <motion.span
            className="absolute grid place-items-center"
            initial={false}
            animate={{ opacity: isDark ? 1 : 0, scale: isDark ? 1 : 0.25 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <Moon02 className="size-4" strokeWidth={1.25} />
          </motion.span>
        </motion.span>
      </span>
    </button>
  )
}
