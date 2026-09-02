import type { CSSProperties } from "react"
import { Check } from "@/components/icons/hugeicons"
import { useLanguage } from "@/i18n/language-provider"
import type { MeetingColour } from "@/lib/calendar-api"
import { cn } from "@/lib/utils"

export const meetingColourOptions: Array<{ value: MeetingColour; label: string }> = [
  { value: "teal", label: "Teal" },
  { value: "amber", label: "Amber" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
  { value: "red", label: "Red" },
  { value: "cyan", label: "Cyan" },
  { value: "neutral", label: "Neutral" },
]

const meetingColourTokens: Record<MeetingColour, { background: string; foreground: string; icon: string }> = {
  teal: { background: "var(--md-calendar-teal)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-teal-icon)" },
  amber: { background: "var(--md-calendar-amber)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-amber-icon)" },
  blue: { background: "var(--md-calendar-blue)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-blue-icon)" },
  violet: { background: "var(--md-calendar-violet)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-violet-icon)" },
  rose: { background: "var(--md-calendar-rose)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-rose-icon)" },
  red: { background: "var(--md-calendar-red)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-red-icon)" },
  cyan: { background: "var(--md-calendar-cyan)", foreground: "var(--md-calendar-on-colour)", icon: "var(--md-calendar-cyan-icon)" },
  neutral: { background: "var(--md-calendar-neutral)", foreground: "var(--md-calendar-neutral-ink)", icon: "var(--md-calendar-neutral-icon)" },
}

type MeetingColourStyle = CSSProperties & {
  "--md-event-colour": string
  "--md-event-foreground": string
  "--md-event-icon": string
}

export function meetingColourStyle(value: MeetingColour | null | undefined): MeetingColourStyle {
  const tokens = meetingColourTokens[value ?? "teal"]
  return {
    "--md-event-colour": tokens.background,
    "--md-event-foreground": tokens.foreground,
    "--md-event-icon": tokens.icon,
  }
}

/** A bounded, contrast-checked colour choice shared by meeting creation and event details. */
export function MeetingColourPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
  label,
  className,
}: {
  value: MeetingColour
  onChange: (value: MeetingColour) => void
  disabled?: boolean
  compact?: boolean
  label?: string
  className?: string
}) {
  const { language } = useLanguage()
  const legend = label ?? (language === "en-US" ? "Event color" : "Event colour")

  return (
    <fieldset className={cn("min-w-0", className)} disabled={disabled}>
      <legend className={cn("mb-2 text-[11px] font-medium text-[var(--md-subtle)]", compact && "sr-only")}>{legend}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={legend}>
        {meetingColourOptions.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              title={option.label}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              style={meetingColourStyle(option.value)}
              className={cn(
                "grid shrink-0 place-items-center rounded-full bg-[var(--md-event-colour)] text-[var(--md-event-foreground)] shadow-[var(--md-shadow-line)] outline-none transition-[transform,box-shadow,filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[var(--md-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--md-surface)] disabled:cursor-not-allowed disabled:opacity-50",
                compact ? "size-6" : "size-7",
                selected && "ring-2 ring-[var(--md-ink)] ring-offset-2 ring-offset-[var(--md-surface)]",
              )}
            >
              {selected ? <Check className={compact ? "size-3" : "size-3.5"} strokeWidth={2.2} aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
