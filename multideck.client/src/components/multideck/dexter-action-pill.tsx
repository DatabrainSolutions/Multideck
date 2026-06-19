import type { ComponentProps } from "react"
import { Sparkles, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAiAgentName } from "@/lib/user-preferences"
import { cn } from "@/lib/utils"

type DexterActionPillProps = Omit<ComponentProps<typeof Button>, "children"> & {
  icon?: LucideIcon
  label?: string
}

const particleClasses = [
  "md-dexter-pill__particle--one",
  "md-dexter-pill__particle--two",
  "md-dexter-pill__particle--three",
]

export function DexterActionPill({
  icon: Icon = Sparkles,
  label,
  className,
  type = "button",
  variant = "ghost",
  ...props
}: DexterActionPillProps) {
  const aiAgentName = useAiAgentName()
  const resolvedLabel = label ?? `Speak to ${aiAgentName}`

  return (
    <Button
      {...props}
      type={type}
      variant={variant}
      aria-label={props["aria-label"] ?? resolvedLabel}
      className={cn(
        "md-dexter-pill relative h-10 min-w-[148px] overflow-hidden rounded-full px-3.5 text-[13px] font-medium text-[var(--md-ink)] hover:text-[var(--md-ink)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]",
        className,
      )}
    >
      <span className="md-dexter-pill__wash" aria-hidden />
      {particleClasses.map((particleClass) => (
        <span key={particleClass} className={cn("md-dexter-pill__particle", particleClass)} aria-hidden />
      ))}
      <Icon className="relative z-10 size-3.5 shrink-0" strokeWidth={1.25} />
      <span className="relative z-10 truncate">{resolvedLabel}</span>
    </Button>
  )
}
