import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { Check, ChevronDown, Info, Search, StickyNote, TriangleAlert } from "@/components/icons/hugeicons"
import { AutoPopulatedInput, AutoPopulationIndicator, useAutoPopulationMorph } from "@/components/multideck/auto-populated-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import {
  EMPTY_HAZARDOUS_DETAILS,
  INCOTERMS_2020,
  getIncotermDefinition,
  resolveLinkedLocation,
  type AmountCurrencyValue,
  type CargoCharacteristicKey,
  type CargoCharacteristics,
  type CountryReferenceOption,
  type HazardousDetails,
  type IncotermCode,
  type LocationOption,
  type LocationValue,
  type NumberUnitValue,
  type RecurrenceUnit,
  type RecurrenceValue,
} from "./quote-detail-model"

export type CompactFieldWidth = "code" | "short" | "medium" | "long" | "grow" | "full"

const compactFieldWidthClass: Record<CompactFieldWidth, string> = {
  code: "w-full sm:w-[9rem] sm:max-w-[11rem] sm:flex-none",
  short: "w-full sm:w-[12rem] sm:max-w-[15rem] sm:flex-none",
  medium: "w-full sm:w-[17rem] sm:max-w-[22rem] sm:flex-none",
  long: "w-full sm:w-[24rem] sm:max-w-[32rem] sm:flex-none",
  grow: "w-full sm:min-w-[17rem] sm:flex-[1_1_22rem]",
  full: "w-full flex-[1_0_100%]",
}

export function CompactSectionShell({
  title,
  meta,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string
  meta?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  const { t } = useLanguage()

  return (
    <section className={cn("min-w-0 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]", className)}>
      <header className="flex min-h-8 items-center justify-between gap-2.5 px-2.5 py-1.5 shadow-[var(--md-stroke-bottom)]">
        <div className="min-w-0 sm:flex sm:items-baseline sm:gap-2">
          <h3 className="truncate text-[12px] font-medium text-[var(--md-ink)]">{t(title)}</h3>
          {meta ? <p className="truncate text-[11px] text-[var(--md-subtle)]">{t(meta)}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("p-2.5", contentClassName)}>{children}</div>
    </section>
  )
}

export function CompactFieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-1.5", className)}>{children}</div>
}

export function CompactFieldShell({
  label,
  hint,
  required,
  invalid,
  width = "medium",
  children,
  className,
  htmlFor,
}: {
  label: string
  hint?: string
  required?: boolean
  invalid?: boolean
  width?: CompactFieldWidth
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  const { t } = useLanguage()

  return (
    <div className={cn("grid min-w-0 content-start gap-1", compactFieldWidthClass[width], className)}>
      <div className="flex min-h-4 items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="min-w-0 truncate text-[10.5px] font-medium leading-4 text-[var(--md-text)]">
          {t(label)}{required ? <span className="ms-0.5 text-[var(--md-red)]" aria-hidden="true">*</span> : null}
        </label>
        {hint ? <span className="truncate text-[10px] leading-4 text-[var(--md-subtle)]">{t(hint)}</span> : null}
      </div>
      {children}
      {invalid ? <p className="text-[10.5px] leading-4 text-[var(--md-red)]">{t(`${label} is required`)}</p> : null}
    </div>
  )
}

/** Editable value derived from other operator inputs, with unobtrusive provenance. */
export function AutoFilledField({
  label,
  value,
  emptyLabel = "Select a location",
  width = "medium",
  valueDirection = "auto",
  autoPopulated = false,
  autoPopulationDescription = "Filled from the selected country and location. You can edit this value manually.",
  onChange,
  disabled,
  className,
}: {
  label: string
  value: string
  emptyLabel?: string
  width?: CompactFieldWidth
  valueDirection?: "auto" | "ltr" | "rtl"
  autoPopulated?: boolean
  autoPopulationDescription?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const inputId = useId()

  return (
    <CompactFieldShell label={label} htmlFor={inputId} width={width} className={className}>
      <AutoPopulatedInput
        id={inputId}
        data-i18n-skip
        dir={valueDirection}
        value={value}
        placeholder={t(emptyLabel)}
        disabled={disabled}
        readOnly={!onChange}
        aria-live="polite"
        autoPopulated={autoPopulated}
        autoPopulationDescription={autoPopulationDescription}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-8 rounded-[var(--md-radius-lg)] px-2.5 text-[12px]"
      />
    </CompactFieldShell>
  )
}

export interface CompactComboboxOption {
  id?: string
  value: string
  label: string
  description?: string
  keywords?: readonly string[]
  iconText?: string
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s,./_-]+/g, " ")
}

function matchesComboboxOption(option: CompactComboboxOption, query: string) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true
  return [option.value, option.label, option.description ?? "", ...(option.keywords ?? [])]
    .some((candidate) => normalizeSearch(candidate).includes(normalizedQuery))
}

function deduplicateComboboxOptions(options: readonly CompactComboboxOption[]) {
  const unique = new Map<string, CompactComboboxOption>()
  options.forEach((option) => unique.set(option.id || `${option.value}:${option.label}`, option))
  return [...unique.values()]
}

const MAX_RECENT_COMBOBOX_OPTIONS = 3
const VISIBLE_DIRECTORY_COMBOBOX_OPTIONS = 4
const MAX_RENDERED_COMBOBOX_OPTIONS = 100

/**
 * Editable combobox with prioritised suggestions above a hairline and the full
 * directory below it. Typing always remains a valid manual value.
 */
export function CompactCombobox({
  label,
  value,
  options,
  recommendedOptions = [],
  recommendedOptionLimit = MAX_RECENT_COMBOBOX_OPTIONS,
  onValueChange,
  onOptionSelect,
  placeholder = "Type or select",
  recommendedLabel = "Recent",
  allLabel = "All options",
  emptyLabel = "No matching options",
  allowCustom = true,
  resultLimit = MAX_RENDERED_COMBOBOX_OPTIONS,
  disabled,
  required,
  invalid,
  width = "medium",
  valueDirection = "auto",
  className,
  autoPopulated = false,
  autoPopulationDescription,
}: {
  label: string
  value: string
  options: readonly CompactComboboxOption[]
  recommendedOptions?: readonly CompactComboboxOption[]
  recommendedOptionLimit?: number
  onValueChange: (value: string) => void
  onOptionSelect?: (option: CompactComboboxOption) => void
  placeholder?: string
  recommendedLabel?: string
  allLabel?: string
  emptyLabel?: string
  allowCustom?: boolean
  resultLimit?: number
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  width?: CompactFieldWidth
  valueDirection?: "auto" | "ltr" | "rtl"
  className?: string
  autoPopulated?: boolean
  autoPopulationDescription?: string
}) {
  const { t } = useLanguage()
  const inputId = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const keyboardNavigationRef = useRef(false)
  const pointerFocusRef = useRef(false)
  const inputMorphRef = useAutoPopulationMorph<HTMLInputElement>(autoPopulated, value)
  const query = open ? search.trim() : ""
  const recommended = useMemo(
    () => deduplicateComboboxOptions(recommendedOptions.filter((option) => matchesComboboxOption(option, query)))
      .slice(0, Math.max(0, recommendedOptionLimit)),
    [query, recommendedOptionLimit, recommendedOptions],
  )
  const recommendedIds = useMemo(() => new Set(recommended.map((option) => option.id || `${option.value}:${option.label}`)), [recommended])
  const remaining = useMemo(
    () => deduplicateComboboxOptions(options.filter((option) => matchesComboboxOption(option, query)))
      .filter((option) => !recommendedIds.has(option.id || `${option.value}:${option.label}`)),
    [options, query, recommendedIds],
  )
  const displayedRemaining = useMemo(
    () => remaining.slice(0, Math.max(1, resultLimit)),
    [remaining, resultLimit],
  )
  const visibleOptions = useMemo(() => [...recommended, ...displayedRemaining], [displayedRemaining, recommended])
  const visibleOptionKey = visibleOptions.map((option) => option.id || `${option.value}:${option.label}`).join("|")
  const selectedOption = useMemo(
    () => deduplicateComboboxOptions([...recommendedOptions, ...options])
      .find((option) => normalizeSearch(option.value) === normalizeSearch(value)),
    [options, recommendedOptions, value],
  )
  const hasExactMatch = useMemo(
    () => [...recommendedOptions, ...options].some((option) => normalizeSearch(option.value) === normalizeSearch(value)),
    [options, recommendedOptions, value],
  )

  useEffect(() => setActiveIndex(0), [query, visibleOptionKey])
  useEffect(() => {
    if (!open || !keyboardNavigationRef.current) return
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, listId, open])

  function selectOption(option: CompactComboboxOption) {
    onValueChange(option.value)
    onOptionSelect?.(option)
    setSearch("")
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      keyboardNavigationRef.current = true
      if (!open) setOpen(true)
      const movement = event.key === "ArrowDown" ? 1 : -1
      setActiveIndex((current) => {
        if (!visibleOptions.length) return 0
        return (current + movement + visibleOptions.length) % visibleOptions.length
      })
      return
    }
    if (event.key === "Enter" && open) {
      event.preventDefault()
      const active = visibleOptions[activeIndex]
      if (active) selectOption(active)
      else if (allowCustom && value.trim()) setOpen(false)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <CompactFieldShell label={label} htmlFor={inputId} required={required} invalid={invalid} width={width} className={className}>
      <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch("") }}>
        <PopoverAnchor asChild>
          <div data-auto-populated={autoPopulated || undefined} className="md-auto-populated-control premium-stroke-soft relative flex min-w-0 items-center rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] transition-colors hover:bg-[var(--md-field-bg-hover)] focus-within:bg-[var(--md-field-bg-hover)] focus-within:ring-3 focus-within:ring-[var(--md-accent-a14)]">
            {selectedOption?.iconText ? (
              <span data-i18n-skip aria-hidden="true" className="grid size-8 shrink-0 place-items-center overflow-visible text-[15px] leading-5">
                {selectedOption.iconText}
              </span>
            ) : null}
            <Input
              ref={inputMorphRef}
              id={inputId}
              data-i18n-skip
              dir={valueDirection}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && visibleOptions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
              aria-required={required || undefined}
              aria-invalid={invalid || undefined}
              autoComplete="off"
              disabled={disabled}
              value={value}
              placeholder={t(placeholder)}
              onPointerDown={() => { pointerFocusRef.current = true }}
              onPointerCancel={() => { pointerFocusRef.current = false }}
              onFocus={() => {
                setSearch("")
                if (!pointerFocusRef.current) setOpen(true)
              }}
              onClick={() => {
                pointerFocusRef.current = false
                setSearch("")
                setOpen(true)
              }}
              onChange={(event) => {
                if (!allowCustom) return
                onValueChange(event.target.value)
                setSearch(event.target.value)
                setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              className="h-8 flex-1 rounded-[var(--md-radius-lg)] bg-transparent px-2.5 text-[12px] shadow-none ring-0 hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
            />
            <AutoPopulationIndicator active={autoPopulated} description={autoPopulationDescription} inline />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={t(`Show ${label} options`)}
              aria-expanded={open}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOpen((current) => !current)}
              className="m-0.5 size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)]"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          id={listId}
          role="listbox"
          align="start"
          sideOffset={5}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[220px] gap-0 overflow-y-auto overscroll-contain rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)] [scrollbar-width:thin]"
        >
          {recommended.length ? (
            <OptionGroupLabel label={recommendedLabel}>
              {recommended.map((option, index) => (
                <ComboboxOptionRow
                  key={option.id || `${option.value}:${option.label}`}
                  id={`${listId}-option-${index}`}
                  option={option}
                  active={index === activeIndex}
                  selected={normalizeSearch(option.value) === normalizeSearch(value)}
                  onSelect={() => selectOption(option)}
                  onPointerMove={() => { keyboardNavigationRef.current = false; setActiveIndex(index) }}
                />
              ))}
            </OptionGroupLabel>
          ) : null}
          {recommended.length && displayedRemaining.length ? <div className="mx-1 my-1 h-px bg-[var(--md-line)]" aria-hidden="true" /> : null}
          {displayedRemaining.length ? (
            <div className="relative">
              <div
                className="max-h-[10rem] overflow-y-auto overscroll-contain pb-2 [scrollbar-width:thin]"
                style={{ scrollbarGutter: "stable" }}
              >
                <OptionGroupLabel label={recommended.length ? allLabel : ""}>
                  {displayedRemaining.map((option, optionIndex) => {
                    const index = recommended.length + optionIndex
                    return (
                      <ComboboxOptionRow
                        key={option.id || `${option.value}:${option.label}`}
                        id={`${listId}-option-${index}`}
                        option={option}
                        active={index === activeIndex}
                        selected={normalizeSearch(option.value) === normalizeSearch(value)}
                        onSelect={() => selectOption(option)}
                        onPointerMove={() => { keyboardNavigationRef.current = false; setActiveIndex(index) }}
                      />
                    )
                  })}
                </OptionGroupLabel>
              </div>
              {displayedRemaining.length > VISIBLE_DIRECTORY_COMBOBOX_OPTIONS ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[var(--md-surface)] via-[var(--md-surface)]/75 to-transparent backdrop-blur-[1px] [mask-image:linear-gradient(to_top,black,transparent)]"
                />
              ) : null}
            </div>
          ) : null}
          {remaining.length > displayedRemaining.length ? (
            <p className="px-2 py-1.5 text-[10.5px] leading-4 text-[var(--md-subtle)]">
              {t("Showing first")} <span data-i18n-skip>{displayedRemaining.length.toLocaleString()}</span> {t("of")} <span data-i18n-skip>{remaining.length.toLocaleString()}</span>. {t("Type to narrow results.")}
            </p>
          ) : null}
          {!visibleOptions.length ? (
            <p className="px-2 py-2 text-[11.5px] text-[var(--md-subtle)]">{t(emptyLabel)}</p>
          ) : null}
          {allowCustom && value.trim() && !hasExactMatch ? (
            <button
              type="button"
              className="md-dropdown-option mt-1 flex min-h-8 w-full items-center gap-2 rounded-[var(--md-radius-lg)] px-2 text-start text-[12px] text-[var(--md-text)] shadow-[var(--md-stroke-top)]"
              onClick={() => setOpen(false)}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] text-[var(--md-accent)]">+</span>
              <span className="truncate">{t("Use manual value")} <span data-i18n-skip dir="auto" className="font-medium text-[var(--md-ink)]">“{value}”</span></span>
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </CompactFieldShell>
  )
}

function OptionGroupLabel({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <div>
      {label ? <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</p> : null}
      {children}
    </div>
  )
}

function ComboboxOptionRow({
  id,
  option,
  active,
  selected,
  onSelect,
  onPointerMove,
}: {
  id: string
  option: CompactComboboxOption
  active: boolean
  selected: boolean
  onSelect: () => void
  onPointerMove: () => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-i18n-skip
      dir="auto"
      className={cn(
        "md-dropdown-option flex min-h-8 w-full items-center gap-2 rounded-[var(--md-radius-lg)] px-2 py-1 text-start text-[12px] text-[var(--md-text)]",
        active && "bg-[var(--md-hover)] text-[var(--md-ink)]",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      onPointerMove={onPointerMove}
    >
      {option.iconText ? <span aria-hidden="true" className="inline-grid size-5 shrink-0 place-items-center overflow-visible text-[15px] leading-5">{option.iconText}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[var(--md-ink)]">{option.label}</span>
        {option.description ? <span className="block truncate text-[10.5px] text-[var(--md-subtle)]">{option.description}</span> : null}
      </span>
      {selected ? <Check className="size-3.5 shrink-0 text-[var(--md-accent)]" aria-hidden="true" /> : null}
    </button>
  )
}

export function IncotermField({
  value,
  onValueChange,
  namedLocation,
  onNamedLocationChange,
  required,
  invalid,
  disabled,
  className,
}: {
  value: IncotermCode | ""
  onValueChange: (value: IncotermCode) => void
  namedLocation?: string
  onNamedLocationChange?: (value: string) => void
  required?: boolean
  invalid?: boolean
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const selectId = useId()
  const locationId = useId()
  const term = getIncotermDefinition(value)

  return (
    <div className={cn("grid min-w-0 gap-2 sm:grid-cols-[minmax(220px,0.72fr)_minmax(220px,1fr)]", className)}>
      <CompactFieldShell label="Incoterm" hint="Rules 2020" htmlFor={selectId} required={required} invalid={invalid} width="full">
        <Select value={value || undefined} onValueChange={(next) => onValueChange(next as IncotermCode)} disabled={disabled} required={required}>
          <SelectTrigger id={selectId} aria-invalid={invalid || undefined} className="h-8 w-full rounded-[var(--md-radius-lg)] px-2.5 text-[12px]">
            <SelectValue placeholder={t("Select Incoterm")} />
          </SelectTrigger>
          <SelectContent className="min-w-[280px]">
            {INCOTERMS_2020.map((option) => (
              <SelectItem key={option.code} value={option.code} textValue={`${option.code} ${option.name} ${option.edition}`}>
                <span data-i18n-skip dir="ltr" className="tabular-nums">{option.code}</span>
                <span>· {t(option.name)}</span>
                <span data-i18n-skip dir="ltr" className="text-[var(--md-subtle)]">· {option.edition}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {term ? (
          <p className="flex gap-1.5 text-[10.5px] leading-4 text-[var(--md-subtle)]">
            <Info className="mt-0.5 size-3 shrink-0 text-[var(--md-accent)]" aria-hidden="true" />
            <span>{t(term.description)}</span>
          </p>
        ) : null}
      </CompactFieldShell>
      {term && namedLocation !== undefined && onNamedLocationChange ? (
        <CompactFieldShell label={term.namedLocationLabel} htmlFor={locationId} required width="full">
          <Input
            id={locationId}
            data-i18n-skip
            dir="auto"
            value={namedLocation}
            disabled={disabled}
            onChange={(event) => onNamedLocationChange(event.target.value)}
            placeholder={t(term.namedLocationLabel)}
            className="h-8 rounded-[var(--md-radius-lg)] text-[12px]"
          />
        </CompactFieldShell>
      ) : null}
    </div>
  )
}

export function AmountCurrencyField({
  label,
  value,
  currencies,
  onChange,
  disabled,
  required,
  invalid,
  width = "medium",
}: {
  label: string
  value: AmountCurrencyValue
  currencies: readonly string[]
  onChange: (value: AmountCurrencyValue) => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  width?: CompactFieldWidth
}) {
  const { t } = useLanguage()
  const inputId = useId()

  return (
    <CompactFieldShell label={label} htmlFor={inputId} required={required} invalid={invalid} width={width}>
      <div className="grid grid-cols-[minmax(5.5rem,1fr)_5.25rem] gap-1">
        <Input
          id={inputId}
          data-i18n-skip
          dir="ltr"
          inputMode="decimal"
          value={value.amount}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          placeholder="0.00"
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          className="h-8 rounded-[var(--md-radius-lg)] text-end text-[12px] tabular-nums"
        />
        <Select value={value.currency} onValueChange={(currency) => onChange({ ...value, currency })} disabled={disabled}>
          <SelectTrigger aria-label={t(`${label} currency`)} className="h-8 w-full rounded-[var(--md-radius-lg)] px-2 text-[11px]">
            <SelectValue placeholder={t("Currency")} />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((currency) => <SelectItem key={currency} value={currency} data-i18n-skip dir="ltr">{currency}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </CompactFieldShell>
  )
}

export function NumberUnitField<Unit extends string>({
  label,
  value,
  units,
  onChange,
  disabled,
  required,
  invalid,
  min = 0,
  step = 1,
  width = "short",
}: {
  label: string
  value: NumberUnitValue<Unit>
  units: readonly { value: Unit; label: string }[]
  onChange: (value: NumberUnitValue<Unit>) => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  min?: number
  step?: number
  width?: CompactFieldWidth
}) {
  const { t } = useLanguage()
  const inputId = useId()

  return (
    <CompactFieldShell label={label} htmlFor={inputId} required={required} invalid={invalid} width={width}>
      <div className="grid grid-cols-[minmax(4.5rem,0.72fr)_minmax(5.5rem,1fr)] gap-1">
        <Input
          id={inputId}
          data-i18n-skip
          dir="ltr"
          type="number"
          inputMode="numeric"
          value={value.value}
          min={min}
          step={step}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange({ ...value, value: event.target.value })}
          className="h-8 rounded-[var(--md-radius-lg)] text-end text-[12px] tabular-nums"
        />
        <Select value={value.unit} onValueChange={(unit) => onChange({ ...value, unit: unit as Unit })} disabled={disabled}>
          <SelectTrigger aria-label={t(`${label} unit`)} className="h-8 w-full rounded-[var(--md-radius-lg)] px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => <SelectItem key={unit.value} value={unit.value}>{t(unit.label)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </CompactFieldShell>
  )
}

export function RecurrenceBuilder({
  value,
  onChange,
  disabled,
  className,
}: {
  value: RecurrenceValue
  onChange: (value: RecurrenceValue) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const notesId = useId()
  const numberClass = "h-8 w-[4.5rem] rounded-[var(--md-radius-lg)] text-end text-[12px] tabular-nums"
  const hasNotes = Boolean(value.notes.trim())
  const notesPopover = value.mode !== "once" ? (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={t(hasNotes ? "View frequency notes" : "Add frequency notes")}
          className={cn(
            "size-8 rounded-[var(--md-radius-lg)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]",
            hasNotes && "bg-[var(--md-accent-a10)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]",
          )}
        >
          <StickyNote className="size-3.5" aria-hidden="true" />
          {hasNotes ? <span className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-[var(--md-accent)] ring-1 ring-[var(--md-surface)]" aria-hidden="true" /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={7} className="w-[min(22rem,calc(100vw-2rem))] gap-2 rounded-[var(--md-radius-xl)] p-2 duration-[220ms]">
        <PopoverHeader>
          <PopoverTitle className="text-[12.5px] text-[var(--md-ink)]">{t("Frequency notes")}</PopoverTitle>
          <PopoverDescription className="text-[11px] leading-4 text-[var(--md-text)]">{t("Add timing, cut-off or seasonal instructions for this repeat pattern.")}</PopoverDescription>
        </PopoverHeader>
        <Textarea
          id={notesId}
          value={value.notes}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
          placeholder={t("Optional timing, cut-off or seasonal notes")}
          className="min-h-20 resize-none rounded-[var(--md-radius-md)] text-[12px] leading-4"
        />
        <div className="flex justify-end">
          <PopoverClose asChild>
            <Button type="button" size="sm" className="h-7 rounded-[var(--md-radius-md)] px-3 text-[11px]">{t("Done")}</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  ) : null

  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <div className="flex min-w-0 flex-wrap items-end gap-1.5">
        <div className="grid w-full min-w-0 content-start gap-1 sm:w-[10rem] sm:max-w-[12rem] sm:flex-none">
          <div className="flex min-h-4 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[10.5px] font-medium leading-4 text-[var(--md-text)]">{t("Frequency")}</span>
          </div>
          <Select value={value.mode} onValueChange={(mode) => onChange({ ...value, mode: mode as RecurrenceValue["mode"] })} disabled={disabled}>
            <SelectTrigger className="h-8 w-full rounded-[var(--md-radius-lg)] px-2.5 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">{t("Ad hoc / once")}</SelectItem>
              <SelectItem value="interval">{t("Repeat every")}</SelectItem>
              <SelectItem value="times-per-month">{t("Times per month")}</SelectItem>
              <SelectItem value="custom">{t("Custom pattern")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {value.mode === "interval" ? (
          <div className="flex items-center gap-1.5 pb-0">
            <span className="pb-2 text-[11px] text-[var(--md-text)]">{t("Every")}</span>
            <Input data-i18n-skip dir="ltr" type="number" min={1} inputMode="numeric" value={value.interval} disabled={disabled} aria-label={t("Repeat interval")} onChange={(event) => onChange({ ...value, interval: event.target.value })} className={numberClass} />
            <Select value={value.unit} onValueChange={(unit) => onChange({ ...value, unit: unit as RecurrenceUnit })} disabled={disabled}>
              <SelectTrigger aria-label={t("Repeat unit")} className="h-8 w-[7rem] rounded-[var(--md-radius-lg)] px-2 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t(value.interval === "1" ? "day" : "days")}</SelectItem>
                <SelectItem value="week">{t(value.interval === "1" ? "week" : "weeks")}</SelectItem>
                <SelectItem value="month">{t(value.interval === "1" ? "month" : "months")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {value.mode === "times-per-month" ? (
          <div className="flex items-center gap-1.5">
            <Input data-i18n-skip dir="ltr" type="number" min={1} max={31} inputMode="numeric" value={value.timesPerMonth} disabled={disabled} aria-label={t("Times per month")} onChange={(event) => onChange({ ...value, timesPerMonth: event.target.value })} className={numberClass} />
            <span className="text-[11px] text-[var(--md-text)]">{t("times per month")}</span>
          </div>
        ) : null}

        {value.mode !== "once" ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--md-text)]">{t("For")}</span>
            <Input data-i18n-skip dir="ltr" type="number" min={1} inputMode="numeric" value={value.totalOccurrences} disabled={disabled} aria-label={t("Total occurrences")} placeholder="∞" onChange={(event) => onChange({ ...value, totalOccurrences: event.target.value })} className={numberClass} />
            <span className="text-[11px] text-[var(--md-text)]">{t("occurrences")}</span>
          </div>
        ) : null}

        {notesPopover}

      </div>
    </div>
  )
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()]
}

export function LocationFields({
  label,
  value,
  options,
  countries,
  directoryStatus,
  directoryCount,
  onChange,
  disabled,
  required,
  invalid,
  className,
}: {
  label: string
  value: LocationValue
  options: readonly LocationOption[]
  countries: readonly CountryReferenceOption[]
  directoryStatus?: "loading" | "ready" | "error"
  directoryCount?: number
  onChange: (value: LocationValue) => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const selectedCountry = value.countryName || value.countryCode
  const selectedCountryReference = countries.find((country) => (
    normalizeSearch(country.code) === normalizeSearch(selectedCountry)
    || normalizeSearch(country.name) === normalizeSearch(selectedCountry)
  ))
  // Country and location are the operator inputs. UN/LOCODE is derived from
  // the exact location they select, so an existing code must never trap the
  // place directory on the previous choice.
  const placePool = selectedCountryReference
    ? options.filter((option) => normalizeSearch(option.countryCode) === normalizeSearch(selectedCountryReference.code))
    : []
  const countryOptions = uniqueBy(countries, (country) => country.code).map((country) => ({
    id: `country:${country.code}`,
    value: country.name,
    label: country.name,
    description: country.code,
    keywords: [country.code],
    iconText: countryFlag(country.code),
  }))
  const placeOptions = uniqueBy(placePool, (option) => option.id || option.unlocode || `${option.countryCode}:${option.place}`).map((option) => ({
    id: option.id || option.unlocode || `${option.countryCode}:${option.place}`,
    value: option.place,
    label: `${option.place}, ${option.countryName}`,
    description: [option.unlocode, option.kind ? t(option.kind.replaceAll("-", " ")) : ""].filter(Boolean).join(" · "),
    keywords: [option.countryCode, option.countryName, option.unlocode, ...(option.aliases ?? [])],
  }))
  const recommendedCountryCodes = new Set(options.filter((location) => location.recommended).map((location) => location.countryCode))
  const recommendedPlaceIds = new Set(placePool.filter((location) => location.recommended).map((location) => location.id || location.unlocode || `${location.countryCode}:${location.place}`))
  const recommendedCountries = countryOptions.filter((option) => recommendedCountryCodes.has(option.id.replace("country:", "")))
  const recommendedPlaces = placeOptions.filter((option) => recommendedPlaceIds.has(option.id ?? ""))
  const resolvedLocation = value.place.trim()
    ? placePool.find((option) => normalizeSearch(option.place) === normalizeSearch(value.place))
    : undefined
  const unlocodeAutoPopulated = Boolean(
    value.unlocode.trim()
    && resolvedLocation?.unlocode
    && normalizeSearch(resolvedLocation.unlocode) === normalizeSearch(value.unlocode),
  )

  function applySelectedOption(option: CompactComboboxOption) {
    const location = options.find((candidate) => (candidate.id || candidate.unlocode || `${candidate.countryCode}:${candidate.place}`) === option.id)
    if (location) onChange({ countryCode: location.countryCode, countryName: location.countryName, place: location.place, unlocode: location.unlocode })
  }

  function applyCountryInput(input: string) {
    const exact = countries.find((country) => normalizeSearch(country.code) === normalizeSearch(input) || normalizeSearch(country.name) === normalizeSearch(input))
    const resolved = resolveLinkedLocation(options, value, "country", exact?.name ?? input)
    onChange(exact ? { ...resolved, countryCode: exact.code, countryName: exact.name } : resolved)
  }

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-medium text-[var(--md-ink)]">
        {t(label)}
        {directoryStatus ? (
          <span className="font-normal text-[10px] text-[var(--md-subtle)]">
            {directoryStatus === "loading" ? t("Loading official UN/LOCODE directory…") : null}
            {directoryStatus === "ready" && directoryCount ? <><span data-i18n-skip>{directoryCount.toLocaleString()}</span> {t("official locations")}</> : null}
            {directoryStatus === "error" ? t("Official directory unavailable — manual entry still works") : null}
          </span>
        ) : null}
      </legend>
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(8rem,0.85fr)_minmax(12rem,1.35fr)_minmax(7rem,0.55fr)]">
        <CompactCombobox label="Country" value={value.countryName} options={countryOptions} recommendedOptions={recommendedCountries} onValueChange={applyCountryInput} placeholder="Country name or code" disabled={disabled} required={required} invalid={invalid && !value.countryName} width="full" />
        <CompactCombobox label="Town, city or port" value={value.place} options={placeOptions} recommendedOptions={recommendedPlaces} onValueChange={(input) => onChange(resolveLinkedLocation(options, value, "place", input))} onOptionSelect={applySelectedOption} placeholder={selectedCountryReference ? "Type a place" : "Select country first"} disabled={disabled || !selectedCountryReference} required={required} invalid={invalid && !value.place} width="full" />
        <AutoFilledField label="UN/LOCODE" value={value.unlocode} emptyLabel="Select country and location" width="full" valueDirection="ltr" autoPopulated={unlocodeAutoPopulated} disabled={disabled} onChange={(input) => onChange({ ...value, unlocode: input.toLocaleUpperCase().replace(/\s+/g, "") })} />
      </div>
    </fieldset>
  )
}

function countryFlag(countryCode: string) {
  const code = countryCode.trim().toLocaleUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}

const characteristicLabels: Record<CargoCharacteristicKey, string> = {
  hazardous: "Hazardous",
  oversized: "Oversized",
  temperatureControlled: "Temperature controlled",
  fragile: "Fragile",
  foodGrade: "Food grade",
}

export function CargoCharacteristicsField({
  value,
  onChange,
  hazardousDetails,
  onHazardousDetailsChange,
  available = ["hazardous", "oversized", "temperatureControlled", "fragile", "foodGrade"],
  disabled,
}: {
  value: CargoCharacteristics
  onChange: (value: CargoCharacteristics) => void
  hazardousDetails: HazardousDetails
  onHazardousDetailsChange: (value: HazardousDetails) => void
  available?: readonly CargoCharacteristicKey[]
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const [hazardousOpen, setHazardousOpen] = useState(false)

  function toggle(key: CargoCharacteristicKey) {
    const checked = !value[key]
    onChange({ ...value, [key]: checked })
    if (key === "hazardous" && checked) setHazardousOpen(true)
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5" aria-label={t("Cargo characteristics")}>
        {available.map((key) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={value[key]}
            onClick={() => toggle(key)}
            className={cn(
              "h-7 rounded-[var(--md-radius-lg)] px-2 text-[11px] font-normal transition-[background-color,color,box-shadow]",
              value[key] && "border-transparent bg-[var(--md-accent)] text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-accent-hover)] dark:bg-[var(--md-accent)] dark:text-[var(--md-accent-ink)] dark:hover:bg-[var(--md-accent-hover)]",
            )}
          >
            {key === "hazardous" ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : null}
            {t(characteristicLabels[key])}
          </Button>
        ))}
        {value.hazardous ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setHazardousOpen(true)} className="h-7 rounded-[var(--md-radius-lg)] px-2 text-[11px] text-[var(--md-accent)]">
            {t("Edit hazardous details")}
          </Button>
        ) : null}
      </div>
      <HazardousDetailsDialog open={hazardousOpen} onOpenChange={setHazardousOpen} value={hazardousDetails} onChange={onHazardousDetailsChange} />
    </div>
  )
}

export function HazardousDetailsDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: HazardousDetails
  onChange: (value: HazardousDetails) => void
}) {
  const { t, direction } = useLanguage()
  const [draft, setDraft] = useState<HazardousDetails>(value)
  const fieldId = useId()

  useEffect(() => {
    if (open) setDraft(value ?? EMPTY_HAZARDOUS_DETAILS)
  }, [open, value])

  function patch<Key extends keyof HazardousDetails>(key: Key, next: HazardousDetails[Key]) {
    setDraft((current) => ({ ...current, [key]: next }))
  }

  const field = (key: "unNumber" | "properShippingName" | "packageCount" | "packageType" | "netWeightKg" | "grossWeightKg", label: string, width: CompactFieldWidth, inputProps?: { inputMode?: "text" | "numeric" | "decimal"; dir?: "ltr" | "auto"; placeholder?: string }) => {
    const id = `${fieldId}-${key}`
    return (
      <CompactFieldShell label={label} htmlFor={id} width={width}>
        <Input id={id} data-i18n-skip dir={inputProps?.dir ?? "auto"} inputMode={inputProps?.inputMode} value={draft[key]} placeholder={inputProps?.placeholder} onChange={(event) => patch(key, event.target.value)} className="h-8 rounded-[var(--md-radius-lg)] text-[12px]" />
      </CompactFieldShell>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={direction} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-lift)] sm:max-w-[640px]">
        <DialogHeader className="pe-8 text-start">
          <DialogTitle className="text-[15px] font-medium">{t("Hazardous cargo details")}</DialogTitle>
          <DialogDescription className="text-[12px] leading-5 text-[var(--md-text)]">{t("These details will be included in supplier and carrier quote requests.")}</DialogDescription>
        </DialogHeader>
        <CompactFieldRow>
          {field("unNumber", "UN number", "code", { dir: "ltr", placeholder: "UN 1234" })}
          {field("properShippingName", "Proper shipping name", "grow")}
          <CompactFieldShell label="Hazard class" width="code">
            <Select value={draft.hazardClass || undefined} onValueChange={(hazardClass) => patch("hazardClass", hazardClass)}>
              <SelectTrigger aria-label={t("Hazard class")} className="h-8 w-full rounded-[var(--md-radius-lg)] text-[12px]"><SelectValue placeholder={t("Select class")} /></SelectTrigger>
              <SelectContent>{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((hazardClass) => <SelectItem key={hazardClass} value={hazardClass} data-i18n-skip dir="ltr">{hazardClass}</SelectItem>)}</SelectContent>
            </Select>
          </CompactFieldShell>
          <CompactFieldShell label="Packing group" width="short">
            <Select value={draft.packingGroup || undefined} onValueChange={(packingGroup) => patch("packingGroup", packingGroup as HazardousDetails["packingGroup"])}>
              <SelectTrigger aria-label={t("Packing group")} className="h-8 w-full rounded-[var(--md-radius-lg)] text-[12px]"><SelectValue placeholder={t("Select group")} /></SelectTrigger>
              <SelectContent>{["I", "II", "III", "N/A"].map((group) => <SelectItem key={group} value={group} data-i18n-skip dir="ltr">{group}</SelectItem>)}</SelectContent>
            </Select>
          </CompactFieldShell>
          {field("packageCount", "Packages / pieces", "short", { inputMode: "numeric", dir: "ltr" })}
          {field("packageType", "Package type", "medium")}
          {field("netWeightKg", "Net weight", "short", { inputMode: "decimal", dir: "ltr", placeholder: "kg" })}
          {field("grossWeightKg", "Gross weight", "short", { inputMode: "decimal", dir: "ltr", placeholder: "kg" })}
        </CompactFieldRow>
        <div className="flex flex-wrap gap-x-5 gap-y-2 py-1">
          <SwitchLabel label="Marine pollutant" checked={draft.marinePollutant} onCheckedChange={(checked) => patch("marinePollutant", checked)} />
          <SwitchLabel label="Limited quantity" checked={draft.limitedQuantity} onCheckedChange={(checked) => patch("limitedQuantity", checked)} />
        </div>
        <CompactFieldShell label="Handling and declaration notes" width="full">
          <Textarea value={draft.notes} onChange={(event) => patch("notes", event.target.value)} placeholder={t("Add packaging, flash point, segregation or document notes")} className="min-h-20 rounded-[var(--md-radius-lg)] text-[12px]" />
        </CompactFieldShell>
        <DialogFooter className="rounded-b-[var(--md-radius-xl)]">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button type="button" onClick={() => { onChange(draft); onOpenChange(false) }}>{t("Save hazardous details")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SwitchLabel({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const { t } = useLanguage()
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-h-8 cursor-pointer items-center gap-2 text-[11.5px] text-[var(--md-text)]">
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onCheckedChange} />
      <span>{t(label)}</span>
    </label>
  )
}

export function CompactSearchIcon() {
  return <Search className="size-3.5 text-[var(--md-subtle)]" aria-hidden="true" />
}
