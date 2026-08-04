import { ChevronDown } from "lucide-react"
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
}

export function MultiSelectMenu({
  value,
  options,
  onValueChange,
  placeholder = "Select options",
  label,
  compact = false,
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
  invalid?: boolean
  required?: boolean
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const normalisedOptions = options.map((option) => typeof option === "string"
    ? { value: option, label: option, translate: true }
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
          className={cn(
            "w-full min-w-0 justify-between rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
            compact ? "h-7 text-[10.5px]" : "h-8 text-[11px]",
            (required || invalid) && "ring-1 ring-[var(--md-red)]",
            className,
          )}
        >
          <span data-i18n-skip={selectedLabels.length ? true : undefined} dir="auto" className={cn("truncate", !selectedLabels.length && "text-[var(--md-subtle)]")}>
            {selectedLabels.length ? selectedLabels.join(" + ") : t(placeholder)}
          </span>
          <ChevronDown data-icon="inline-end" className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.3} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
        {label ? (
          <>
            <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-[var(--md-subtle)]">{t(label)}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {normalisedOptions.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggleOption(option.value)}
            className="rounded-[var(--md-radius-md)] text-[12px]"
          >
            <span data-i18n-skip={option.translate ? undefined : true} dir="auto" className="min-w-0 truncate">
              {option.translate ? t(option.label) : option.label}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
