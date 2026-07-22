import { Plus, RotateCcw, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"
import type { QuoteRegisterRecord } from "@/data/quote-register-data"

export const quoteSearchFieldOptions = [
  { value: "any", label: "Any field" },
  { value: "reference", label: "Quote reference" },
  { value: "status", label: "Status" },
  { value: "customer", label: "Customer" },
  { value: "origin", label: "Origin port / airport" },
  { value: "destination", label: "Destination port / airport" },
  { value: "estimatedDeparture", label: "Estimated departure (ETD)" },
  { value: "estimatedArrival", label: "Estimated arrival (ETA)" },
  { value: "transportTime", label: "Transport time" },
  { value: "transportMode", label: "Transport mode" },
  { value: "equipmentLoad", label: "Equipment / load" },
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
  { value: "routingVia", label: "Routing via" },
  { value: "incoterms", label: "Incoterms" },
  { value: "incotermsPlace", label: "Incoterms place" },
  { value: "serviceLevel", label: "Service level" },
  { value: "shipmentType", label: "Shipment type" },
  { value: "carrier", label: "Carrier" },
  { value: "supplier", label: "Supplier" },
  { value: "salesOwner", label: "Sales owner" },
  { value: "operationsOwner", label: "Operations owner" },
  { value: "quoteType", label: "Quote type" },
  { value: "direction", label: "Direction" },
  { value: "customerPurchaseOrder", label: "Customer purchase order" },
  { value: "shipperReference", label: "Shipper reference" },
  { value: "validity", label: "Validity" },
  { value: "estimatedQuote", label: "Estimated quote" },
  { value: "sellValue", label: "Sell value" },
  { value: "estimatedProfit", label: "Estimated profit" },
  { value: "estimatedCost", label: "Estimated cost" },
  { value: "estimatedMargin", label: "Estimated margin" },
  { value: "documentStatus", label: "Document status" },
  { value: "workflowStage", label: "Workflow stage" },
  { value: "priority", label: "Priority" },
  { value: "quoteSource", label: "Quote source" },
] as const

export type QuoteSearchField = (typeof quoteSearchFieldOptions)[number]["value"]
export type QuoteSearchOperator = "contains" | "is" | "is-not" | "starts-with" | "is-empty" | "is-not-empty"
export type QuoteSearchMatch = "all" | "any"

export type QuoteSearchCondition = {
  id: string
  field: QuoteSearchField
  operator: QuoteSearchOperator
  value: string
}

export type QuoteSearchGroup = {
  id: string
  match: QuoteSearchMatch
  conditions: QuoteSearchCondition[]
}

export type QuoteSearchQuery = {
  match: QuoteSearchMatch
  groups: QuoteSearchGroup[]
}

const operatorOptions: Array<{ value: QuoteSearchOperator; label: string }> = [
  { value: "contains", label: "Contains" },
  { value: "is", label: "Is" },
  { value: "is-not", label: "Is not" },
  { value: "starts-with", label: "Starts with" },
  { value: "is-empty", label: "Is empty" },
  { value: "is-not-empty", label: "Is not empty" },
]

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createCondition(field: QuoteSearchField = "any"): QuoteSearchCondition {
  return { id: createId("quote-condition"), field, operator: "contains", value: "" }
}

export function createEmptyQuoteSearch(): QuoteSearchQuery {
  return {
    match: "all",
    groups: [{ id: createId("quote-group"), match: "all", conditions: [createCondition()] }],
  }
}

function conditionIsActive(condition: QuoteSearchCondition) {
  return condition.operator === "is-empty" || condition.operator === "is-not-empty" || Boolean(condition.value.trim())
}

export function countActiveQuoteConditions(query: QuoteSearchQuery) {
  return query.groups.reduce((total, group) => total + group.conditions.filter(conditionIsActive).length, 0)
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase()
}

function quoteFieldValue(quote: QuoteRegisterRecord, field: QuoteSearchField) {
  if (field !== "any") return normalize(quote[field])

  return Object.entries(quote)
    .filter(([key]) => key !== "statusTone" && key !== "priorityTone")
    .map(([, value]) => normalize(value))
    .join(" ")
}

function quoteMatchesCondition(quote: QuoteRegisterRecord, condition: QuoteSearchCondition) {
  const source = quoteFieldValue(quote, condition.field)
  const query = normalize(condition.value)

  if (condition.operator === "is-empty") return source.length === 0 || source === "—"
  if (condition.operator === "is-not-empty") return source.length > 0 && source !== "—"
  if (!query) return true
  if (condition.operator === "is") return source === query
  if (condition.operator === "is-not") return source !== query
  if (condition.operator === "starts-with") return source.startsWith(query)
  return source.includes(query)
}

export function quoteMatchesSearch(quote: QuoteRegisterRecord, search: QuoteSearchQuery) {
  const activeGroups = search.groups
    .map((group) => ({ ...group, conditions: group.conditions.filter(conditionIsActive) }))
    .filter((group) => group.conditions.length > 0)

  if (!activeGroups.length) return true

  const groupResults = activeGroups.map((group) => {
    const results = group.conditions.map((condition) => quoteMatchesCondition(quote, condition))
    return group.match === "all" ? results.every(Boolean) : results.some(Boolean)
  })

  return search.match === "all" ? groupResults.every(Boolean) : groupResults.some(Boolean)
}

function MatchControl({ value, onChange, allLabel, anyLabel }: { value: QuoteSearchMatch; onChange: (value: QuoteSearchMatch) => void; allLabel: string; anyLabel: string }) {
  const { t } = useLanguage()

  return (
    <div className="inline-flex rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]" role="group" aria-label={t("Search matching rule")}>
      {([
        { value: "all", label: allLabel },
        { value: "any", label: anyLabel },
      ] as const).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "h-8 rounded-[var(--md-radius-md)] px-3 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[var(--md-ink)] active:scale-[0.98]",
            value === option.value && "bg-white text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          )}
          onClick={() => onChange(option.value)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  )
}

export function QuoteSearchBuilder({
  value,
  onChange,
}: {
  value: QuoteSearchQuery
  onChange: (value: QuoteSearchQuery) => void
}) {
  const { t } = useLanguage()

  function updateGroup(groupId: string, updater: (group: QuoteSearchGroup) => QuoteSearchGroup) {
    onChange({ ...value, groups: value.groups.map((group) => group.id === groupId ? updater(group) : group) })
  }

  function addCondition(groupId: string) {
    updateGroup(groupId, (group) => ({ ...group, conditions: [...group.conditions, createCondition("status")] }))
  }

  function updateCondition(groupId: string, conditionId: string, patch: Partial<QuoteSearchCondition>) {
    updateGroup(groupId, (group) => ({
      ...group,
      conditions: group.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
    }))
  }

  function removeCondition(groupId: string, conditionId: string) {
    updateGroup(groupId, (group) => {
      const conditions = group.conditions.filter((condition) => condition.id !== conditionId)
      return { ...group, conditions: conditions.length ? conditions : [createCondition()] }
    })
  }

  function addGroup() {
    onChange({
      ...value,
      groups: [...value.groups, { id: createId("quote-group"), match: "all", conditions: [createCondition("status")] }],
    })
  }

  function removeGroup(groupId: string) {
    const groups = value.groups.filter((group) => group.id !== groupId)
    onChange(groups.length ? { ...value, groups } : createEmptyQuoteSearch())
  }

  return (
    <section className="overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Advanced quote search")}>
        <div className="grid gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] font-medium text-[var(--md-text)]">{t("Match condition groups")}</p>
            <MatchControl
              value={value.match}
              onChange={(match) => onChange({ ...value, match })}
              allLabel="All groups"
              anyLabel="Any group"
            />
          </div>

          <div className="grid gap-3">
            {value.groups.map((group, groupIndex) => (
              <div key={group.id} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-1 shadow-[var(--md-shadow-line)]">
                <div className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-surface)_86%,transparent)] px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-medium text-[var(--md-ink)]">{t("Condition group")} {groupIndex + 1}</span>
                      <MatchControl
                        value={group.match}
                        onChange={(match) => updateGroup(group.id, (current) => ({ ...current, match }))}
                        allLabel="All conditions"
                        anyLabel="Any condition"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[rgba(14,125,116,0.08)]"
                        onClick={() => addCondition(group.id)}
                      >
                        <Plus className="size-3.5" strokeWidth={1.4} />
                        {t("Add condition")}
                      </Button>
                      {value.groups.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-white hover:text-[var(--md-red)]"
                          aria-label={t(`Remove condition group ${groupIndex + 1}`)}
                          onClick={() => removeGroup(group.id)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.35} />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {group.conditions.map((condition, conditionIndex) => {
                      const valueDisabled = condition.operator === "is-empty" || condition.operator === "is-not-empty"
                      return (
                        <div key={condition.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-white p-1.5 shadow-[var(--md-shadow-line)] md:grid-cols-[32px_minmax(180px,1.15fr)_minmax(150px,0.8fr)_minmax(180px,1.4fr)_32px] md:items-center">
                          <span className="hidden text-center text-[11px] font-medium tabular-nums text-[var(--md-subtle)] md:block" aria-hidden="true">{conditionIndex + 1}</span>

                          <label className="sr-only" htmlFor={`${condition.id}-field`}>{t("Condition field")}</label>
                          <Select value={condition.field} onValueChange={(field) => updateCondition(group.id, condition.id, { field: field as QuoteSearchField })}>
                            <SelectTrigger id={`${condition.id}-field`} className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[340px] rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-popover)]">
                              {quoteSearchFieldOptions.map((field) => <SelectItem key={field.value} value={field.value} className="text-[12px]">{t(field.label)}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          <label className="sr-only" htmlFor={`${condition.id}-operator`}>{t("Condition operator")}</label>
                          <Select value={condition.operator} onValueChange={(operator) => updateCondition(group.id, condition.id, { operator: operator as QuoteSearchOperator })}>
                            <SelectTrigger id={`${condition.id}-operator`} className="h-9 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-3 text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-[var(--md-radius-lg)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-popover)]">
                              {operatorOptions.map((operator) => <SelectItem key={operator.value} value={operator.value} className="text-[12px]">{t(operator.label)}</SelectItem>)}
                            </SelectContent>
                          </Select>

                          <label className="sr-only" htmlFor={`${condition.id}-value`}>{t("Condition value")}</label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.3} />
                            <Input
                              id={`${condition.id}-value`}
                              value={valueDisabled ? "" : condition.value}
                              disabled={valueDisabled}
                              dir="auto"
                              placeholder={valueDisabled ? t("No value needed") : t("Enter a value")}
                              className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] ps-9 text-[12px] shadow-[var(--md-shadow-line)] disabled:cursor-default disabled:opacity-60"
                              onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 justify-self-end rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-red)] md:justify-self-auto"
                            aria-label={t(`Remove condition ${conditionIndex + 1}`)}
                            onClick={() => removeCondition(group.id, condition.id)}
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.35} />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-surface-tint)] hover:text-[var(--md-ink)]" onClick={() => onChange(createEmptyQuoteSearch())}>
              <RotateCcw className="size-3.5" strokeWidth={1.4} />
              {t("Clear search")}
            </Button>
            <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-lg)] border-0 bg-white px-3 text-[12px] font-medium text-[var(--md-accent)] shadow-[var(--md-shadow-line)]" onClick={addGroup}>
              <Plus className="size-3.5" strokeWidth={1.4} />
              {t("Add condition group")}
            </Button>
          </div>
        </div>
    </section>
  )
}
