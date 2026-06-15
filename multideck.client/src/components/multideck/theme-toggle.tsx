import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type ThemeToggleProps = {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useLanguage()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"
  const nextTheme = isDark ? "light" : "dark"
  const label = t(isDark ? "Switch to light mode" : "Switch to dark mode")
  const modeLabel = t(isDark ? "Dark mode" : "Light mode")

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-theme-toggle-state={isDark ? "dark" : "light"}
      className={cn(
        "group/theme-toggle flex h-10 w-full items-center justify-between gap-3 rounded-[var(--md-radius-lg)] px-2.5 text-left text-[13px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        compact && "size-10 justify-center rounded-[var(--md-radius-md)] p-0",
        className,
      )}
      onClick={() => setTheme(nextTheme)}
    >
      {compact ? null : (
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-[var(--md-subtle)]">{t("Appearance")}</span>
          <span className="block truncate text-[13px] text-[var(--md-ink)]">{modeLabel}</span>
        </span>
      )}

      <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-icon-well)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        <motion.span
          key={isDark ? "moon" : "sun"}
          aria-hidden="true"
          className="absolute grid size-5 place-items-center"
          initial={{ opacity: 0, rotate: isDark ? -70 : 70, scale: 0.72, filter: "blur(4px)" }}
          animate={{ opacity: 1, rotate: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {isDark ? <Moon className="size-4" strokeWidth={1.25} /> : <Sun className="size-4" strokeWidth={1.25} />}
        </motion.span>
      </span>
    </button>
  )
}
