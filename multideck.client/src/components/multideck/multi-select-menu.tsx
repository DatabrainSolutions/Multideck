import type { ReactNode } from "react"
import { ChevronDown, ListFilter } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

export type MultiSelectMenuOption = string | {
  value: string
  label: string
  /** Optional decorative marker; the label remains the accessible name. */
  leading?: ReactNode
}

export function MultiSelectMenu({
  value,
  options,
  onValueChange,
  placeholder = "Select options",
  label,
  compact = false,
  variant = "field",
  invalid = false,
  required = false,
  disabled = false,
  className,
}: {
  value: string[]
  options: MultiSelectMenuOption[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  label?: string
  compact?: boolean
  variant?: "field" | "toolbar"
  invalid?: boolean
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const toolbar = variant === "toolbar"
  const normalisedOptions = options.map((option) => typeof option === "string"
    ? { value: option, label: option, translate: true, leading: undefined }
    : { ...option, translate: false })
  const selectedLabels = normalisedOptions
    .filter((option) => value.includes(option.value))
    .map((option) => option.translate ? t(option.label) : option.label)

  function toggleOption(optionValue: string) {
    onValueChange(value.includes(optionValue) ? value.filter((item) => item !== optionValue) : [...value, optionValue])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          aria-invalid={invalid}
          aria-label={toolbar ? `${t(label || placeholder)}, ${selectedLabels.length} of ${options.length} selected` : undefined}
          className={cn(
            "w-full min-w-0 justify-between rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            compact ? "h-7 text-[10.5px]" : "h-8 text-[11px]",
            toolbar && "group h-8 w-auto gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-[12px] text-[var(--md-text)] hover:bg-[var(--md-hover)] data-[state=open]:bg-[var(--md-hover)]",
            (required || invalid) && "ring-1 ring-[var(--md-red)]",
            className,
          )}
        >
          {toolbar ? <ListFilter className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} /> : null}
          <span data-i18n-skip={!toolbar && selectedLabels.length ? true : undefined} dir="auto" className={cn("truncate", !toolbar && !selectedLabels.length && "text-[var(--md-subtle)]")}>
            {toolbar ? t(label || placeholder) : selectedLabels.length ? selectedLabels.join(" + ") : t(placeholder)}
          </span>
          {toolbar ? <span aria-hidden="true" className={cn("grid h-5 min-w-5 shrink-0 place-items-center rounded-[calc(var(--md-radius-lg)-6px)] px-1 text-[10px] tabular-nums", selectedLabels.length ? "bg-[var(--md-accent-a10)] text-[var(--md-selected-text)]" : "bg-[var(--md-surface-soft)] text-[var(--md-subtle)]")}>{selectedLabels.length}</span> : null}
          <ChevronDown data-icon="inline-end" className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.3} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={toolbar ? "end" : "start"} className={cn("min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]", toolbar && "w-60 max-w-[calc(100vw-32px)]")}>
        {label ? (
          <>
            <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-[var(--md-subtle)]">{t(label)}</DropdownMenuLabel>
            {toolbar ? null : <DropdownMenuSeparator />}
          </>
        ) : null}
        {normalisedOptions.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleOption(option.value)}
            className={cn("rounded-[var(--md-radius-md)] text-[12px]", toolbar && "min-h-10 rounded-[calc(var(--md-radius-lg)-4px)] ps-2.5 pe-9 data-[state=checked]:bg-transparent! data-[state=checked]:shadow-none! data-[state=checked]:text-[var(--md-ink)] data-highlighted:bg-[var(--md-hover)]! focus:bg-[var(--md-hover)]!")}
          >
            {option.leading ? <span aria-hidden="true" className="flex shrink-0 items-center">{option.leading}</span> : null}
            <span data-i18n-skip={option.translate ? undefined : true} dir="auto" className="min-w-0 truncate">
              {option.translate ? t(option.label) : option.label}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
