import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function CommandInput({
  placeholder = "Ask Multideck or jump to anything...",
  className,
}: {
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.2} />
      <Input
        aria-label="Search Multideck"
        className="h-9 rounded-[var(--md-radius-lg)] border-0 bg-white/70 pl-9 pr-16 text-[13px] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
        placeholder={placeholder}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        ⌘ K
      </span>
    </div>
  )
}
