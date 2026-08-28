import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  Calculator,
  Check,
  ChevronDown,
  CircleGauge,
  Plus,
  Search,
  Trash2,
} from "@/components/icons/hugeicons"

import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export type QuoteChargePartyRole = "customer" | "supplier"

export interface QuoteChargeParty {
  id: string
  code: string
  name: string
  roles?: readonly QuoteChargePartyRole[]
}

export interface QuoteChargeCurrency {
  code: string
  name?: string
  symbol: string
  decimalPlaces: number
  subUnitRatio?: number
  symbolPosition?: "prefix" | "suffix"
}

export type QuoteChargeExchangeRateSource = "live" | "job" | "manual" | "reference"
export type QuoteChargeExchangeRateStatus = "current" | "stale" | "unavailable"

export interface QuoteChargeExchangeRate {
  currency: string
  baseCurrency: string
  costRoe: number
  sellRoe: number
  provider?: string
  updatedAt?: string
  source?: QuoteChargeExchangeRateSource
  status?: QuoteChargeExchangeRateStatus
}

export type QuoteChargeRoeSource = "rate" | "manual"

export interface UnifiedQuoteChargeRow {
  id: string
  code: string
  description: string
  supplierId?: string | null
  customerId?: string | null
  cost: number
  costCurrency: string
  sell: number
  sellCurrency: string
  costRoe?: number
  sellRoe?: number
  costRoeSource?: QuoteChargeRoeSource
  sellRoeSource?: QuoteChargeRoeSource
  baseCost?: number
  baseSell?: number
  profit?: number
}

export interface CreateQuoteChargeRowContext {
  baseCurrency: string
  currencies: readonly QuoteChargeCurrency[]
  parties: readonly QuoteChargeParty[]
}

export interface UnifiedQuoteChargesWorkspaceProps {
  rows: readonly UnifiedQuoteChargeRow[]
  onRowsChange: (rows: UnifiedQuoteChargeRow[]) => void
  parties?: readonly QuoteChargeParty[]
  currencies?: readonly QuoteChargeCurrency[]
  exchangeRates?: readonly QuoteChargeExchangeRate[]
  baseCurrency?: string
  selectedRowId?: string | null
  onSelectedRowIdChange?: (rowId: string | null) => void
  createRow?: (context: CreateQuoteChargeRowContext) => UnifiedQuoteChargeRow
  readOnly?: boolean
  storageKey?: string
  className?: string
}

type ResolvedQuoteChargeRow = Omit<UnifiedQuoteChargeRow, "costRoe" | "sellRoe" | "baseCost" | "baseSell" | "profit"> & {
  costRoe: number
  sellRoe: number
  baseCost: number
  baseSell: number
  profit: number
  costRateAvailable: boolean
  sellRateAvailable: boolean
}

type CalculatorMode = "chargeable" | "volumetric" | "measure" | "percentage"
type MeasureDimension = "weight" | "length" | "volume"
type MeasureUnit = "kg" | "lb" | "cm" | "m" | "in" | "ft" | "cbm" | "cuft"

const DEFAULT_CURRENCIES: readonly QuoteChargeCurrency[] = [
  { code: "GBP", name: "British pound", symbol: "£", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "USD", name: "US dollar", symbol: "$", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "JPY", name: "Japanese yen", symbol: "¥", decimalPlaces: 0, subUnitRatio: 1 },
  { code: "AUD", name: "Australian dollar", symbol: "A$", decimalPlaces: 2, subUnitRatio: 100 },
  { code: "CAD", name: "Canadian dollar", symbol: "C$", decimalPlaces: 2, subUnitRatio: 100 },
]

const DEFAULT_EXCHANGE_RATES: readonly QuoteChargeExchangeRate[] = [
  { currency: "GBP", baseCurrency: "GBP", costRoe: 1, sellRoe: 1, provider: "Demo reference set", source: "reference", status: "stale" },
  { currency: "USD", baseCurrency: "GBP", costRoe: 1.25, sellRoe: 1.25, provider: "Demo reference set", source: "reference", status: "stale" },
  { currency: "EUR", baseCurrency: "GBP", costRoe: 1.16, sellRoe: 1.16, provider: "Demo reference set", source: "reference", status: "stale" },
  { currency: "JPY", baseCurrency: "GBP", costRoe: 193.5, sellRoe: 193.5, provider: "Demo reference set", source: "reference", status: "stale" },
  { currency: "AUD", baseCurrency: "GBP", costRoe: 1.92, sellRoe: 1.92, provider: "Demo reference set", source: "reference", status: "stale" },
  { currency: "CAD", baseCurrency: "GBP", costRoe: 1.72, sellRoe: 1.72, provider: "Demo reference set", source: "reference", status: "stale" },
]

const DEFAULT_PARTIES: readonly QuoteChargeParty[] = [
  { id: "supplier-bluewave", code: "BLUOCE", name: "Bluewave Ocean", roles: ["supplier"] },
  { id: "supplier-severn", code: "SEVLOG", name: "Severn Road Logistics", roles: ["supplier"] },
  { id: "supplier-kobe", code: "KOBGAT", name: "Kobe Gateway Agency", roles: ["supplier"] },
  { id: "customer-harbourworks", code: "HWSBRI", name: "HarbourWorks Safety", roles: ["customer"] },
  { id: "customer-northstar", code: "NORTRA", name: "Northstar Trading", roles: ["customer"] },
]

const MEASURE_UNITS: Readonly<Record<MeasureUnit, { dimension: MeasureDimension; factor: number; label: string }>> = {
  kg: { dimension: "weight", factor: 1, label: "Kilograms" },
  lb: { dimension: "weight", factor: 0.45359237, label: "Pounds" },
  cm: { dimension: "length", factor: 0.01, label: "Centimetres" },
  m: { dimension: "length", factor: 1, label: "Metres" },
  in: { dimension: "length", factor: 0.0254, label: "Inches" },
  ft: { dimension: "length", factor: 0.3048, label: "Feet" },
  cbm: { dimension: "volume", factor: 1, label: "Cubic metres" },
  cuft: { dimension: "volume", factor: 0.028316846592, label: "Cubic feet" },
}

const textInputClass = "h-8 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"

function positiveNumber(value: number | undefined, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function numberFromInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function partyCanBe(party: QuoteChargeParty, role: QuoteChargePartyRole) {
  return !party.roles?.length || party.roles.includes(role)
}

function moneyText(amount: number, currency: QuoteChargeCurrency, locale: string) {
  const decimals = Math.max(0, Math.min(6, currency.decimalPlaces))
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(finiteNumber(amount))
  return currency.symbolPosition === "suffix"
    ? `${number} ${currency.symbol}`
    : `${currency.symbol}${number}`
}

function decimalText(amount: number, locale: string, maximumFractionDigits = 3) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(finiteNumber(amount))
}

function defaultRowId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `charge-${Date.now()}`
}

function SearchablePartySelect({
  value,
  parties,
  role,
  onValueChange,
  disabled,
}: {
  value?: string | null
  parties: readonly QuoteChargeParty[]
  role: QuoteChargePartyRole
  onValueChange: (partyId: string) => void
  disabled?: boolean
}) {
  const { direction, t } = useLanguage()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const options = useMemo(() => parties.filter((party) => partyCanBe(party, role)), [parties, role])
  const selected = options.find((party) => party.id === value)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = options.filter((party) => !normalizedQuery || `${party.code} ${party.name}`.toLocaleLowerCase().includes(normalizedQuery))
  const roleLabel = role === "supplier" ? "supplier" : "customer"

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) setQuery("")
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={t(role === "supplier" ? "Select supplier" : "Select customer")}
          title={selected ? `${selected.code} · ${selected.name}` : t(role === "supplier" ? "Select supplier" : "Select customer")}
          disabled={disabled}
          className="flex h-8 w-full min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-start text-[11px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,box-shadow,opacity,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-field-bg-hover)] focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {selected ? (
            <span data-i18n-skip dir="auto" className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              <span dir="ltr" className="font-medium text-[var(--md-ink)]">{selected.code}</span>
              <span className="text-[var(--md-subtle)]"> · </span>
              <span>{selected.name}</span>
            </span>
          ) : <span className="truncate text-[var(--md-subtle)]">{t(role === "supplier" ? "Select supplier" : "Select customer")}</span>}
          <ChevronDown data-icon="inline-end" className="size-3.5 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.35} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={5}
        dir={direction}
        className="w-[min(360px,calc(100vw-24px))] gap-1 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]"
      >
        <div className="relative m-1">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(role === "supplier" ? "Search suppliers by code or name" : "Search customers by code or name")}
            aria-label={t(role === "supplier" ? "Search suppliers" : "Search customers")}
            aria-controls={listId}
            aria-autocomplete="list"
            className="h-8 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] pe-2 ps-8 text-[11px] shadow-[var(--md-shadow-line)]"
          />
        </div>
        <div id={listId} role="listbox" aria-label={t(`${roleLabel} options`)} className="max-h-64 overflow-y-auto p-1 md-scrollbar">
          {filtered.length ? filtered.map((party) => (
            <button
              key={party.id}
              type="button"
              role="option"
              aria-selected={party.id === value}
              onClick={() => {
                onValueChange(party.id)
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2 py-2 text-start transition-[background-color,color] hover:bg-[var(--md-hover)] focus-visible:bg-[var(--md-hover)] focus-visible:outline-none",
                party.id === value && "bg-[var(--md-selected-bg)] text-[var(--md-selected-text)]",
              )}
            >
              <span data-i18n-skip dir="ltr" className="w-16 shrink-0 truncate text-[11px] font-medium tabular-nums">{party.code}</span>
              <span data-i18n-skip dir="auto" className="min-w-0 flex-1 truncate text-[12px]">{party.name}</span>
              {party.id === value ? <Check className="size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} aria-hidden="true" /> : null}
            </button>
          )) : (
            <p className="px-3 py-5 text-center text-[11px] text-[var(--md-subtle)]">
              {t(role === "supplier" ? "No matching suppliers" : "No matching customers")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CurrencySelect({
  value,
  currencies,
  label,
  onValueChange,
  isCurrencyAvailable,
  disabled,
}: {
  value: string
  currencies: readonly QuoteChargeCurrency[]
  label: string
  onValueChange: (currency: string) => void
  isCurrencyAvailable?: (currency: string) => boolean
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const selected = currencies.find((currency) => currency.code === value)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={t(label)} size="sm" className="h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2 text-[11px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
        <SelectValue>
          <span data-i18n-skip dir="ltr">{selected?.code ?? value}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[210px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
        {currencies.map((currency) => (
          <SelectItem key={currency.code} value={currency.code} disabled={isCurrencyAvailable ? !isCurrencyAvailable(currency.code) : false}>
            <span className="grid w-full min-w-0 grid-cols-[38px_42px_minmax(0,1fr)] items-center gap-2">
              <span data-i18n-skip dir="ltr" className="text-center font-medium text-[var(--md-accent)]">{currency.symbol}</span>
              <span data-i18n-skip dir="ltr" className="font-medium text-[var(--md-ink)]">{currency.code}</span>
              <span className="truncate text-[11px] text-[var(--md-text)]">{currency.name ? t(currency.name) : ""}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CurrencyAmountInput({
  value,
  currency,
  label,
  locale,
  onValueChange,
  disabled,
}: {
  value: number
  currency: QuoteChargeCurrency
  label: string
  locale: string
  onValueChange: (value: number) => void
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(() => finiteNumber(value).toFixed(currency.decimalPlaces))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(finiteNumber(value).toFixed(currency.decimalPlaces))
  }, [currency.decimalPlaces, focused, value])

  const prefix = currency.symbolPosition !== "suffix"
  return (
    <label className="relative isolate block min-w-0" title={moneyText(value, currency, locale)}>
      <span className={cn("pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-[10px] font-medium text-[var(--md-subtle)]", prefix ? "start-2" : "end-2")} data-i18n-skip dir="ltr">
        {currency.symbol}
      </span>
      <Input
        value={draft}
        onFocus={(event) => {
          setFocused(true)
          event.currentTarget.select()
        }}
        onBlur={() => {
          setFocused(false)
          const next = numberFromInput(draft)
          setDraft(next.toFixed(currency.decimalPlaces))
          onValueChange(next)
        }}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          if (nextDraft.trim() && Number.isFinite(Number(nextDraft))) onValueChange(Number(nextDraft))
        }}
        disabled={disabled}
        inputMode="decimal"
        aria-label={t(label)}
        dir="ltr"
        data-i18n-skip
        className={cn(textInputClass, "text-end tabular-nums", prefix ? "ps-7" : "pe-9")}
      />
    </label>
  )
}

function RoeInput({
  value,
  label,
  onValueChange,
  unavailable,
  disabled,
}: {
  value: number
  label: string
  onValueChange: (value: number) => void
  unavailable?: boolean
  disabled?: boolean
}) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState(() => value > 0 ? String(value) : "")
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value > 0 ? String(value) : "")
  }, [focused, value])

  return (
    <Input
      value={draft}
      onFocus={(event) => {
        setFocused(true)
        event.currentTarget.select()
      }}
      onBlur={() => {
        setFocused(false)
        const next = positiveNumber(Number(draft), value)
        setDraft(String(next))
        onValueChange(next)
      }}
      onChange={(event) => {
        const nextDraft = event.target.value
        setDraft(nextDraft)
        const next = Number(nextDraft)
        if (Number.isFinite(next) && next > 0) onValueChange(next)
      }}
      disabled={disabled}
      placeholder={unavailable ? t("Rates unavailable") : undefined}
      inputMode="decimal"
      aria-label={t(label)}
      dir="ltr"
      data-i18n-skip
      className={cn(textInputClass, "text-end tabular-nums")}
    />
  )
}

function DetailField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const { t } = useLanguage()
  return (
    <div className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</span>
      {children}
    </div>
  )
}

function CalculatorNumberField({
  label,
  value,
  onValueChange,
  suffix,
  readOnly,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  suffix?: string
  readOnly?: boolean
}) {
  const { t } = useLanguage()
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</span>
      <span className="relative block">
        <Input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          readOnly={readOnly}
          inputMode="decimal"
          aria-label={t(label)}
          dir="ltr"
          data-i18n-skip
          className={cn(textInputClass, "text-end tabular-nums", suffix && "pe-10", readOnly && "cursor-default bg-[var(--md-surface-soft)]")}
        />
        {suffix ? <span data-i18n-skip dir="ltr" className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--md-subtle)]">{suffix}</span> : null}
      </span>
    </label>
  )
}

function CalculatorResult({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { t } = useLanguage()
  return (
    <div className="rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] px-3 py-2 shadow-[var(--md-shadow-line)]">
      <span className="block text-[10px] font-medium text-[var(--md-subtle)]">{t(label)}</span>
      <strong data-i18n-skip dir="ltr" className="mt-0.5 block text-[16px] font-medium tabular-nums text-[var(--md-ink)]">{value}</strong>
      {detail ? <span className="mt-0.5 block text-[10px] text-[var(--md-text)]">{t(detail)}</span> : null}
    </div>
  )
}

function ChargeCalculator() {
  const { t, language } = useLanguage()
  const [mode, setMode] = useState<CalculatorMode>("chargeable")
  const [actualWeight, setActualWeight] = useState("820")
  const [length, setLength] = useState("120")
  const [width, setWidth] = useState("80")
  const [height, setHeight] = useState("75")
  const [pieces, setPieces] = useState("2")
  const [divisor, setDivisor] = useState("6000")
  const [measureValue, setMeasureValue] = useState("100")
  const [measureFrom, setMeasureFrom] = useState<MeasureUnit>("kg")
  const [measureTo, setMeasureTo] = useState<MeasureUnit>("lb")
  const [percentageValue, setPercentageValue] = useState("1000")
  const [percentageRate, setPercentageRate] = useState("12.5")

  const volumeCm = numberFromInput(length) * numberFromInput(width) * numberFromInput(height) * Math.max(0, numberFromInput(pieces))
  const volumetricWeight = volumeCm / positiveNumber(numberFromInput(divisor), 6000)
  const chargeableWeight = Math.max(numberFromInput(actualWeight), volumetricWeight)
  const fromUnit = MEASURE_UNITS[measureFrom]
  const toUnit = MEASURE_UNITS[measureTo]
  const convertedMeasure = fromUnit.dimension === toUnit.dimension
    ? numberFromInput(measureValue) * fromUnit.factor / toUnit.factor
    : 0
  const percentageAmount = numberFromInput(percentageValue) * numberFromInput(percentageRate) / 100
  const afterPercentage = numberFromInput(percentageValue) + percentageAmount
  const compatibleUnits = (Object.keys(MEASURE_UNITS) as MeasureUnit[]).filter((unit) => MEASURE_UNITS[unit].dimension === fromUnit.dimension)

  const updateMeasureFrom = (unit: MeasureUnit) => {
    setMeasureFrom(unit)
    const nextDimension = MEASURE_UNITS[unit].dimension
    if (MEASURE_UNITS[measureTo].dimension !== nextDimension) {
      const replacement = (Object.keys(MEASURE_UNITS) as MeasureUnit[]).find((candidate) => candidate !== unit && MEASURE_UNITS[candidate].dimension === nextDimension)
      setMeasureTo(replacement ?? unit)
    }
  }

  return (
    <Surface padding="none" className="rounded-[var(--md-radius-2xl)] p-3">
      <SectionHeader
        title={t("Charge calculator")}
        meta={t("Freight calculations stay beside the selected line.")}
        action={(
          <Select value={mode} onValueChange={(value) => setMode(value as CalculatorMode)}>
            <SelectTrigger aria-label={t("Calculator type")} size="sm" className="h-8 w-[190px] max-w-[42vw] rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[11px] shadow-[var(--md-shadow-line)]">
              <Calculator className="size-3.5 text-[var(--md-accent)]" strokeWidth={1.4} aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
              <SelectItem value="chargeable">{t("Chargeable weight")}</SelectItem>
              <SelectItem value="volumetric">{t("Volumetric weight")}</SelectItem>
              <SelectItem value="measure">{t("Measure conversion")}</SelectItem>
              <SelectItem value="percentage">{t("Percentage")}</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      <div className="mt-3">
        {mode === "chargeable" ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <CalculatorNumberField label="Actual weight" value={actualWeight} onValueChange={setActualWeight} suffix="kg" />
            <CalculatorNumberField label="Volumetric weight" value={decimalText(volumetricWeight, language, 2)} onValueChange={() => undefined} suffix="kg" readOnly />
            <CalculatorResult label="Chargeable weight" value={`${decimalText(chargeableWeight, language, 2)} kg`} detail="The greater of actual and volumetric weight" />
          </div>
        ) : null}

        {mode === "volumetric" ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <CalculatorNumberField label="Length" value={length} onValueChange={setLength} suffix="cm" />
            <CalculatorNumberField label="Width" value={width} onValueChange={setWidth} suffix="cm" />
            <CalculatorNumberField label="Height" value={height} onValueChange={setHeight} suffix="cm" />
            <CalculatorNumberField label="Pieces" value={pieces} onValueChange={setPieces} />
            <CalculatorNumberField label="Volumetric divisor" value={divisor} onValueChange={setDivisor} />
            <CalculatorResult label="Volumetric weight" value={`${decimalText(volumetricWeight, language, 2)} kg`} detail="Dimensions use centimetres" />
          </div>
        ) : null}

        {mode === "measure" ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px_minmax(0,1fr)]">
            <CalculatorNumberField label="Value" value={measureValue} onValueChange={setMeasureValue} />
            <DetailField label="From">
              <Select value={measureFrom} onValueChange={(value) => updateMeasureFrom(value as MeasureUnit)}>
                <SelectTrigger aria-label={t("From unit")} size="sm" className="h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[11px] shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MEASURE_UNITS) as MeasureUnit[]).map((unit) => <SelectItem key={unit} value={unit}><span data-i18n-skip dir="ltr">{unit}</span> · {t(MEASURE_UNITS[unit].label)}</SelectItem>)}</SelectContent>
              </Select>
            </DetailField>
            <DetailField label="To">
              <Select value={measureTo} onValueChange={(value) => setMeasureTo(value as MeasureUnit)}>
                <SelectTrigger aria-label={t("To unit")} size="sm" className="h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-[11px] shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger>
                <SelectContent>{compatibleUnits.map((unit) => <SelectItem key={unit} value={unit}><span data-i18n-skip dir="ltr">{unit}</span> · {t(MEASURE_UNITS[unit].label)}</SelectItem>)}</SelectContent>
              </Select>
            </DetailField>
            <CalculatorResult label="Converted value" value={`${decimalText(convertedMeasure, language, 4)} ${measureTo}`} />
          </div>
        ) : null}

        {mode === "percentage" ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <CalculatorNumberField label="Base value" value={percentageValue} onValueChange={setPercentageValue} />
            <CalculatorNumberField label="Percentage" value={percentageRate} onValueChange={setPercentageRate} suffix="%" />
            <CalculatorResult label="Percentage amount" value={decimalText(percentageAmount, language, 2)} />
            <CalculatorResult label="Value after addition" value={decimalText(afterPercentage, language, 2)} />
          </div>
        ) : null}
      </div>
    </Surface>
  )
}

export function UnifiedQuoteChargesWorkspace({
  rows,
  onRowsChange,
  parties: suppliedParties,
  currencies: suppliedCurrencies,
  exchangeRates: suppliedExchangeRates,
  baseCurrency: suppliedBaseCurrency = "GBP",
  selectedRowId,
  onSelectedRowIdChange,
  createRow,
  readOnly = false,
  storageKey = "unified-quote-charges",
  className,
}: UnifiedQuoteChargesWorkspaceProps) {
  const { direction, language, t } = useLanguage()
  const parties = suppliedParties ?? DEFAULT_PARTIES
  const currencies = suppliedCurrencies?.length ? suppliedCurrencies : DEFAULT_CURRENCIES
  const baseCurrency = currencies.some((currency) => currency.code === suppliedBaseCurrency)
    ? suppliedBaseCurrency
    : currencies[0]?.code ?? suppliedBaseCurrency
  const exchangeRates = suppliedExchangeRates ?? (suppliedCurrencies ? [] : DEFAULT_EXCHANGE_RATES)
  const [internalSelectedRowId, setInternalSelectedRowId] = useState<string | null>(rows[0]?.id ?? null)
  const activeSelectedRowId = selectedRowId === undefined ? internalSelectedRowId : selectedRowId

  useEffect(() => {
    if (selectedRowId !== undefined) return
    setInternalSelectedRowId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null)
  }, [rows, selectedRowId])

  const currencyFor = useCallback((code: string) => {
    return currencies.find((currency) => currency.code === code) ?? {
      code,
      symbol: code,
      decimalPlaces: 2,
      subUnitRatio: 100,
      symbolPosition: "prefix" as const,
    }
  }, [currencies])

  const rateRecordFor = useCallback((currency: string) => {
    return exchangeRates.find((rate) => rate.currency === currency && rate.baseCurrency === baseCurrency)
  }, [baseCurrency, exchangeRates])

  const rateFor = useCallback((currency: string, side: "cost" | "sell") => {
    if (currency === baseCurrency) return 1
    const record = rateRecordFor(currency)
    if (!record || record.status === "unavailable") return null
    const rate = side === "cost" ? record.costRoe : record.sellRoe
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null
  }, [baseCurrency, rateRecordFor])

  const resolveRow = useCallback((row: UnifiedQuoteChargeRow): ResolvedQuoteChargeRow => {
    const costRate = rateFor(row.costCurrency, "cost")
    const sellRate = rateFor(row.sellCurrency, "sell")
    const manualCostRoe = row.costRoeSource === "manual" && typeof row.costRoe === "number" && Number.isFinite(row.costRoe) && row.costRoe > 0
      ? row.costRoe
      : null
    const manualSellRoe = row.sellRoeSource === "manual" && typeof row.sellRoe === "number" && Number.isFinite(row.sellRoe) && row.sellRoe > 0
      ? row.sellRoe
      : null
    const costRoe = manualCostRoe ?? costRate ?? 0
    const sellRoe = manualSellRoe ?? sellRate ?? 0
    const costRateAvailable = costRoe > 0
    const sellRateAvailable = sellRoe > 0
    const baseCost = costRateAvailable ? finiteNumber(row.cost) / costRoe : 0
    const baseSell = sellRateAvailable ? finiteNumber(row.sell) / sellRoe : 0
    return {
      ...row,
      costRoe,
      sellRoe,
      baseCost,
      baseSell,
      profit: costRateAvailable && sellRateAvailable ? baseSell - baseCost : 0,
      costRateAvailable,
      sellRateAvailable,
    }
  }, [rateFor])

  const resolvedRows = useMemo(() => rows.map(resolveRow), [resolveRow, rows])
  const selectedRow = resolvedRows.find((row) => row.id === activeSelectedRowId) ?? null
  const baseCurrencyDefinition = currencyFor(baseCurrency)

  const selectRow = useCallback((rowId: string | null) => {
    if (selectedRowId === undefined) setInternalSelectedRowId(rowId)
    onSelectedRowIdChange?.(rowId)
  }, [onSelectedRowIdChange, selectedRowId])

  const updateRow = useCallback((rowId: string, patch: Partial<UnifiedQuoteChargeRow>) => {
    onRowsChange(rows.map((row) => {
      if (row.id !== rowId) return row
      const next = resolveRow({ ...resolveRow(row), ...patch })
      return {
        ...next,
        baseCost: next.baseCost,
        baseSell: next.baseSell,
        profit: next.profit,
      }
    }))
  }, [onRowsChange, resolveRow, rows])

  const addRow = useCallback(() => {
    const supplier = parties.find((party) => partyCanBe(party, "supplier"))
    const customer = parties.find((party) => partyCanBe(party, "customer"))
    const candidate = createRow?.({ baseCurrency, currencies, parties }) ?? {
      id: defaultRowId(),
      code: "CHG",
      description: "New charge",
      supplierId: supplier?.id,
      customerId: customer?.id,
      cost: 0,
      costCurrency: baseCurrency,
      sell: 0,
      sellCurrency: baseCurrency,
      costRoe: 1,
      sellRoe: 1,
      costRoeSource: "rate" as const,
      sellRoeSource: "rate" as const,
      baseCost: 0,
      baseSell: 0,
      profit: 0,
    }
    const next = resolveRow(candidate)
    onRowsChange([...rows, next])
    selectRow(next.id)
  }, [baseCurrency, createRow, currencies, onRowsChange, parties, resolveRow, rows, selectRow])

  const removeSelectedRow = useCallback(() => {
    if (!activeSelectedRowId) return
    const selectedIndex = rows.findIndex((row) => row.id === activeSelectedRowId)
    const nextRows = rows.filter((row) => row.id !== activeSelectedRowId)
    onRowsChange([...nextRows])
    const nextSelection = nextRows[Math.min(Math.max(selectedIndex, 0), nextRows.length - 1)]?.id ?? null
    selectRow(nextSelection)
  }, [activeSelectedRowId, onRowsChange, rows, selectRow])

  const columns = useMemo<DataTableColumn<ResolvedQuoteChargeRow>[]>(() => [
    {
      id: "code",
      label: "Code",
      width: 104,
      minWidth: 88,
      maxWidth: 160,
      canHide: false,
      resizable: true,
      sortValue: (row) => row.code,
      cell: (row) => (
        <Input
          value={row.code}
          onChange={(event) => updateRow(row.id, { code: event.target.value })}
          disabled={readOnly}
          aria-label={t("Charge code")}
          dir="ltr"
          data-i18n-skip
          className={cn(textInputClass, "font-medium uppercase tabular-nums")}
        />
      ),
    },
    {
      id: "description",
      label: "Description",
      width: 230,
      minWidth: 170,
      maxWidth: 420,
      resizable: true,
      sortValue: (row) => row.description,
      cell: (row) => (
        <Input
          value={row.description}
          onChange={(event) => updateRow(row.id, { description: event.target.value })}
          disabled={readOnly}
          aria-label={t("Charge description")}
          dir="auto"
          data-i18n-skip
          className={textInputClass}
        />
      ),
    },
    {
      id: "supplier",
      label: "Supplier",
      width: 220,
      minWidth: 170,
      maxWidth: 340,
      resizable: true,
      sortValue: (row) => parties.find((party) => party.id === row.supplierId)?.name ?? "",
      cell: (row) => <SearchablePartySelect value={row.supplierId} parties={parties} role="supplier" disabled={readOnly} onValueChange={(supplierId) => updateRow(row.id, { supplierId })} />,
    },
    {
      id: "cost",
      label: "Cost",
      kind: "number",
      width: 132,
      minWidth: 112,
      maxWidth: 180,
      resizable: true,
      sortValue: (row) => row.cost,
      cellClassName: "text-end",
      cell: (row) => <CurrencyAmountInput value={row.cost} currency={currencyFor(row.costCurrency)} label="Cost amount" locale={language} disabled={readOnly} onValueChange={(cost) => updateRow(row.id, { cost })} />,
    },
    {
      id: "costCurrency",
      label: "Cost currency",
      width: 120,
      minWidth: 105,
      maxWidth: 170,
      resizable: true,
      sortValue: (row) => row.costCurrency,
      cell: (row) => <CurrencySelect value={row.costCurrency} currencies={currencies} label="Cost currency" disabled={readOnly} isCurrencyAvailable={(currency) => rateFor(currency, "cost") !== null} onValueChange={(costCurrency) => {
        const costRoe = rateFor(costCurrency, "cost")
        if (costRoe === null) return
        updateRow(row.id, { costCurrency, costRoe, costRoeSource: "rate" })
      }} />,
    },
    {
      id: "baseCost",
      label: "Base cost",
      kind: "number",
      width: 126,
      minWidth: 110,
      resizable: true,
      sortValue: (row) => row.baseCost,
      cellClassName: "text-end",
      cell: (row) => row.costRateAvailable
        ? <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{moneyText(row.baseCost, baseCurrencyDefinition, language)}</span>
        : <span className="text-[10px] font-medium text-[var(--md-red)]">{t("Rates unavailable")}</span>,
    },
    {
      id: "sell",
      label: "Sell",
      kind: "number",
      width: 132,
      minWidth: 112,
      maxWidth: 180,
      resizable: true,
      sortValue: (row) => row.sell,
      cellClassName: "text-end",
      cell: (row) => <CurrencyAmountInput value={row.sell} currency={currencyFor(row.sellCurrency)} label="Sell amount" locale={language} disabled={readOnly} onValueChange={(sell) => updateRow(row.id, { sell })} />,
    },
    {
      id: "sellCurrency",
      label: "Sell currency",
      width: 120,
      minWidth: 105,
      maxWidth: 170,
      resizable: true,
      sortValue: (row) => row.sellCurrency,
      cell: (row) => <CurrencySelect value={row.sellCurrency} currencies={currencies} label="Sell currency" disabled={readOnly} isCurrencyAvailable={(currency) => rateFor(currency, "sell") !== null} onValueChange={(sellCurrency) => {
        const sellRoe = rateFor(sellCurrency, "sell")
        if (sellRoe === null) return
        updateRow(row.id, { sellCurrency, sellRoe, sellRoeSource: "rate" })
      }} />,
    },
    {
      id: "baseSell",
      label: "Base sell",
      kind: "number",
      width: 126,
      minWidth: 110,
      resizable: true,
      sortValue: (row) => row.baseSell,
      cellClassName: "text-end",
      cell: (row) => row.sellRateAvailable
        ? <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{moneyText(row.baseSell, baseCurrencyDefinition, language)}</span>
        : <span className="text-[10px] font-medium text-[var(--md-red)]">{t("Rates unavailable")}</span>,
    },
    {
      id: "profit",
      label: "Profit",
      kind: "number",
      width: 126,
      minWidth: 110,
      resizable: true,
      sortValue: (row) => row.profit,
      cellClassName: "text-end",
      cell: (row) => row.costRateAvailable && row.sellRateAvailable
        ? <span data-i18n-skip dir="ltr" className={cn("font-medium tabular-nums", row.profit < 0 ? "text-[var(--md-red)]" : "text-[var(--md-green)]")}>{moneyText(row.profit, baseCurrencyDefinition, language)}</span>
        : <span className="text-[10px] font-medium text-[var(--md-red)]">{t("Rates unavailable")}</span>,
    },
    {
      id: "customer",
      label: "Customer",
      width: 180,
      minWidth: 150,
      maxWidth: 280,
      resizable: true,
      sortValue: (row) => parties.find((party) => party.id === row.customerId)?.name ?? "",
      cellClassName: "overflow-hidden",
      cellTitle: (row) => {
        const customer = parties.find((party) => party.id === row.customerId)
        return customer ? `${customer.code} · ${customer.name}` : t("Select customer")
      },
      cell: (row) => <SearchablePartySelect value={row.customerId} parties={parties} role="customer" disabled={readOnly} onValueChange={(customerId) => updateRow(row.id, { customerId })} />,
    },
    {
      id: "costRoe",
      label: "Cost ROE",
      width: 112,
      minWidth: 100,
      resizable: true,
      sortValue: (row) => row.costRoe,
      cellClassName: "text-end",
      cell: (row) => <RoeInput value={row.costRoe} label="Cost rate of exchange" unavailable={!row.costRateAvailable} disabled={readOnly} onValueChange={(costRoe) => updateRow(row.id, { costRoe, costRoeSource: "manual" })} />,
    },
    {
      id: "sellRoe",
      label: "Sell ROE",
      width: 112,
      minWidth: 100,
      resizable: true,
      sortValue: (row) => row.sellRoe,
      cellClassName: "text-end",
      cell: (row) => <RoeInput value={row.sellRoe} label="Sell rate of exchange" unavailable={!row.sellRateAvailable} disabled={readOnly} onValueChange={(sellRoe) => updateRow(row.id, { sellRoe, sellRoeSource: "manual" })} />,
    },
  ], [baseCurrencyDefinition, currencies, currencyFor, language, parties, rateFor, readOnly, t, updateRow])

  const rateSummary = useMemo(() => {
    const relevant = exchangeRates.filter((rate) => rate.baseCurrency === baseCurrency)
    const status: QuoteChargeExchangeRateStatus = relevant.some((rate) => rate.status === "unavailable")
      ? "unavailable"
      : relevant.some((rate) => rate.status === "stale") ? "stale" : "current"
    const source = relevant.find((rate) => rate.source)?.source ?? "reference"
    const providers = [...new Set(relevant.map((rate) => rate.provider).filter((provider): provider is string => Boolean(provider)))]
    const latestTimestamp = relevant
      .map((rate) => rate.updatedAt)
      .filter((updatedAt): updatedAt is string => Boolean(updatedAt))
      .map((updatedAt) => new Date(updatedAt))
      .filter((date) => !Number.isNaN(date.valueOf()))
      .sort((left, right) => right.valueOf() - left.valueOf())[0]
    return { status, source, provider: providers.join(" + "), latestTimestamp }
  }, [baseCurrency, exchangeRates])

  const rateLabel = rateSummary.status === "unavailable"
    ? "Rates unavailable"
    : rateSummary.status === "stale"
      ? "Rates need refreshing"
      : rateSummary.source === "live"
        ? "Live rates current"
        : rateSummary.source === "job"
          ? "Job rates current"
          : rateSummary.source === "manual"
            ? "Manual rates"
            : "Reference rates"
  const rateDetail = [
    rateSummary.provider,
    rateSummary.latestTimestamp ? new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(rateSummary.latestTimestamp) : "",
  ].filter(Boolean).join(" · ")

  const selectedSupplier = selectedRow ? parties.find((party) => party.id === selectedRow.supplierId) : undefined
  const selectedCustomer = selectedRow ? parties.find((party) => party.id === selectedRow.customerId) : undefined
  const selectedMargin = selectedRow && selectedRow.baseSell !== 0 ? selectedRow.profit / selectedRow.baseSell * 100 : 0

  return (
    <div dir={direction} className={cn("grid min-w-0 gap-3", className)}>
      <DataTable
        ariaLabel="Unified quote charges"
        columnsButtonLabel="Manage quote charge columns"
        columns={columns}
        rows={resolvedRows}
        getRowKey={(row) => row.id}
        storageKey={storageKey}
        selectedRowKey={activeSelectedRowId}
        onRowClick={(row) => selectRow(row.id)}
        toolbarOptions={(
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <div
              title={t("Exchange-rate source and freshness")}
              aria-label={`${t(rateLabel)}${rateDetail ? `, ${rateDetail}` : ""}`}
              className="hidden h-8 min-w-0 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-2 shadow-[var(--md-shadow-line)] md:flex"
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", rateSummary.status === "unavailable" ? "bg-[var(--md-red)]" : rateSummary.status === "stale" ? "bg-[var(--md-amber)]" : "bg-[var(--md-green)]")} aria-hidden="true" />
              <span className="shrink-0 text-[10px] font-medium text-[var(--md-ink)]">{t(rateLabel)}</span>
              {rateDetail ? <span data-i18n-skip dir="auto" className="max-w-40 truncate text-[10px] text-[var(--md-subtle)]">{rateDetail}</span> : null}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addRow} disabled={readOnly} className="h-8 rounded-[var(--md-radius-md)] text-[10.5px] shadow-[var(--md-shadow-line)]">
              <Plus data-icon="inline-start" className="size-3.5" strokeWidth={1.5} />
              {t("Add")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={removeSelectedRow} disabled={readOnly || !selectedRow} className="h-8 rounded-[var(--md-radius-md)] text-[10.5px] shadow-[var(--md-shadow-line)]">
              <Trash2 data-icon="inline-start" className="size-3.5" strokeWidth={1.5} />
              {t("Remove")}
            </Button>
          </div>
        )}
        emptyState={(
          <div className="mx-auto grid max-w-sm justify-items-center gap-2 px-4">
            <CircleGauge className="size-5 text-[var(--md-subtle)]" strokeWidth={1.25} aria-hidden="true" />
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("No charge lines yet")}</p>
            <p className="text-[10.5px] leading-4 text-[var(--md-text)]">{t("Add the first cost and sell line for this quote.")}</p>
            {!readOnly ? <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus data-icon="inline-start" />{t("Add charge")}</Button> : null}
          </div>
        )}
        className="md-unified-quote-charges-table rounded-[var(--md-radius-xl)] !bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)] [&_th]:!bg-[var(--md-surface)] [&_td]:!bg-[var(--md-surface)] [&_tr[data-state=selected]_td]:!bg-[var(--md-selected-bg)]"
        tableClassName="text-[11px] [&_th]:h-9 [&_td]:h-11 [&_td]:px-2 [&_td]:py-1.5"
      />

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Surface padding="none" className="rounded-[var(--md-radius-2xl)] p-3">
          <SectionHeader
            title={t("Selected line details")}
            meta={selectedRow ? t("Edit the line and review its base-currency result.") : t("Select a charge line to inspect it.")}
          />
          {selectedRow ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <DetailField label="Charge code">
                <Input value={selectedRow.code} onChange={(event) => updateRow(selectedRow.id, { code: event.target.value })} disabled={readOnly} aria-label={t("Charge code")} dir="ltr" data-i18n-skip className={cn(textInputClass, "uppercase")} />
              </DetailField>
              <DetailField label="Description" className="sm:col-span-2">
                <Input value={selectedRow.description} onChange={(event) => updateRow(selectedRow.id, { description: event.target.value })} disabled={readOnly} aria-label={t("Charge description")} dir="auto" data-i18n-skip className={textInputClass} />
              </DetailField>
              <DetailField label="Margin">
                <div className="flex h-8 items-center justify-end px-2 text-[12px] font-medium tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">{decimalText(selectedMargin, language, 1)}%</div>
              </DetailField>
              <DetailField label="Supplier">
                <div data-i18n-skip dir="auto" className="flex h-8 min-w-0 items-center truncate text-[11px] text-[var(--md-ink)]">{selectedSupplier ? `${selectedSupplier.code} · ${selectedSupplier.name}` : "—"}</div>
              </DetailField>
              <DetailField label="Customer">
                <div data-i18n-skip dir="auto" className="flex h-8 min-w-0 items-center truncate text-[11px] text-[var(--md-ink)]">{selectedCustomer ? `${selectedCustomer.code} · ${selectedCustomer.name}` : "—"}</div>
              </DetailField>
              <DetailField label="Base cost">
                <div dir="ltr" className={cn("flex h-8 items-center justify-end font-medium", selectedRow.costRateAvailable ? "text-[12px] tabular-nums text-[var(--md-ink)]" : "text-[10px] text-[var(--md-red)]")}>
                  {selectedRow.costRateAvailable ? <span data-i18n-skip>{moneyText(selectedRow.baseCost, baseCurrencyDefinition, language)}</span> : t("Rates unavailable")}
                </div>
              </DetailField>
              <DetailField label="Base sell">
                <div dir="ltr" className={cn("flex h-8 items-center justify-end font-medium", selectedRow.sellRateAvailable ? "text-[12px] tabular-nums text-[var(--md-ink)]" : "text-[10px] text-[var(--md-red)]")}>
                  {selectedRow.sellRateAvailable ? <span data-i18n-skip>{moneyText(selectedRow.baseSell, baseCurrencyDefinition, language)}</span> : t("Rates unavailable")}
                </div>
              </DetailField>
              <DetailField label="Profit" className="sm:col-start-2 lg:col-start-4">
                <div dir="ltr" className={cn("flex h-8 items-center justify-end font-medium", selectedRow.costRateAvailable && selectedRow.sellRateAvailable ? cn("text-[13px] tabular-nums", selectedRow.profit < 0 ? "text-[var(--md-red)]" : "text-[var(--md-green)]") : "text-[10px] text-[var(--md-red)]")}>
                  {selectedRow.costRateAvailable && selectedRow.sellRateAvailable ? <span data-i18n-skip>{moneyText(selectedRow.profit, baseCurrencyDefinition, language)}</span> : t("Rates unavailable")}
                </div>
              </DetailField>
            </div>
          ) : (
            <div className="mt-3 grid min-h-28 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-4 text-center shadow-[var(--md-shadow-line)]">
              <p className="text-[11px] text-[var(--md-text)]">{t("Choose a row above to see supplier, customer, margin and base values.")}</p>
            </div>
          )}
        </Surface>

        <ChargeCalculator />
      </div>
    </div>
  )
}
