import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Bookmark, Plus, SlidersHorizontal, Trash2, X } from "@/components/icons/hugeicons"

import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import {
  countActiveFilterConditions,
  createEmptyFilterQuery,
  createFilterCondition,
  createFilterGroup,
  defaultFilterOperator,
  filterOperatorNeedsRange,
  filterOperatorNeedsValue,
  filterOperatorsForKind,
  useSavedFilterViews,
  type FilterCondition,
  type FilterFieldOption,
  type FilterGroup,
  type FilterMatch,
  type FilterOperator,
  type FilterQuery,
} from "@/lib/advanced-filters"
import { cn, isInsideFloatingLayer } from "@/lib/utils"

const fieldSelectClass = "h-7 w-full min-w-0 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-ink)]"
const connectorSelectClass = "h-7 w-full min-w-0 rounded-[var(--md-radius-md)] px-1.5 text-[11px] font-medium text-[var(--md-text)]"

function MatchSelect({
  value,
  onChange,
  ariaLabel,
  allLabel,
  anyLabel,
  className,
}: {
  value: FilterMatch
  onChange: (value: FilterMatch) => void
  ariaLabel: string
  allLabel: string
  anyLabel: string
  className?: string
}) {
  const { t } = useLanguage()

  return (
    <Select value={value} onValueChange={(next) => onChange(next as FilterMatch)}>
      <SelectTrigger size="sm" aria-label={t(ariaLabel)} className={cn(connectorSelectClass, className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-[12px]">{t(allLabel)}</SelectItem>
        <SelectItem value="any" className="text-[12px]">{t(anyLabel)}</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function AdvancedFilterPopover({
  fields,
  value,
  onChange,
  storageKey,
  label = "Advanced filters",
  title = "Advanced filters",
  itemLabel = "results",
  countMatches,
  totalCount,
  align = "end",
}: {
  fields: readonly FilterFieldOption[]
  value: FilterQuery
  onChange: (value: FilterQuery) => void
  /** Namespaces saved filters so each register keeps its own list. */
  storageKey: string
  label?: string
  title?: string
  itemLabel?: string
  countMatches?: (query: FilterQuery) => number | Promise<number>
  totalCount?: number
  align?: "start" | "center" | "end"
}) {
  const { language, t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const { views, saveView, deleteView } = useSavedFilterViews(storageKey)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [selectedViewId, setSelectedViewId] = useState("")
  const [naming, setNaming] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [matchedCount, setMatchedCount] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const firstField = fields[0]?.value ?? "any"
  const appliedCount = countActiveFilterConditions(value)
  const draftCount = countActiveFilterConditions(draft)
  const numberFormat = useMemo(() => new Intl.NumberFormat(language), [language])

  useEffect(() => {
    if (!open || !countMatches) {
      setMatchedCount(null)
      return
    }

    let current = true
    setMatchedCount(null)
    const timer = globalThis.setTimeout(() => {
      void Promise.resolve(countMatches(draft))
        .then((count) => { if (current) setMatchedCount(count) })
        .catch(() => { if (current) setMatchedCount(null) })
    }, 180)
    return () => {
      current = false
      globalThis.clearTimeout(timer)
    }
  }, [countMatches, draft, open])

  useEffect(() => {
    if (naming) nameInputRef.current?.focus()
  }, [naming])

  function fieldMeta(field: string) {
    return fields.find((option) => option.value === field) ?? fields[0]
  }

  function openPanel(next: boolean) {
    if (next) {
      setDraft(value)
      setNaming(false)
      setDraftName("")
    }
    setOpen(next)
  }

  function updateGroup(groupId: string, updater: (group: FilterGroup) => FilterGroup) {
    setDraft((current) => ({ ...current, groups: current.groups.map((group) => group.id === groupId ? updater(group) : group) }))
  }

  function updateCondition(groupId: string, conditionId: string, patch: Partial<FilterCondition>) {
    updateGroup(groupId, (group) => ({
      ...group,
      conditions: group.conditions.map((condition) => condition.id === conditionId ? { ...condition, ...patch } : condition),
    }))
  }

  function changeField(groupId: string, condition: FilterCondition, field: string) {
    const kind = fieldMeta(field)?.kind ?? "text"
    const keepsOperator = filterOperatorsForKind(kind).some((operator) => operator.value === condition.operator)
    updateCondition(groupId, condition.id, {
      field,
      operator: keepsOperator ? condition.operator : defaultFilterOperator(kind),
      value: "",
      valueTo: "",
    })
  }

  function addCondition(groupId: string) {
    updateGroup(groupId, (group) => ({ ...group, conditions: [...group.conditions, createFilterCondition(firstField)] }))
  }

  function removeCondition(groupId: string, conditionId: string) {
    setDraft((current) => {
      const groups = current.groups
        .map((group) => group.id === groupId ? { ...group, conditions: group.conditions.filter((condition) => condition.id !== conditionId) } : group)
        .filter((group) => group.conditions.length > 0)
      return groups.length ? { ...current, groups } : createEmptyFilterQuery(firstField)
    })
  }

  function addGroup() {
    setDraft((current) => ({ ...current, groups: [...current.groups, createFilterGroup(firstField)] }))
  }

  function removeGroup(groupId: string) {
    setDraft((current) => {
      const groups = current.groups.filter((group) => group.id !== groupId)
      return groups.length ? { ...current, groups } : createEmptyFilterQuery(firstField)
    })
  }

  /** Clearing takes effect on the table straight away: a cleared panel that still filters reads as broken. */
  function clearDraft() {
    const empty = createEmptyFilterQuery(firstField)
    setDraft(empty)
    setSelectedViewId("")
    onChange(empty)
  }

  function applyDraft() {
    onChange(draft)
    setOpen(false)
  }

  function loadView(viewId: string) {
    const view = views.find((candidate) => candidate.id === viewId)
    if (!view) return
    setSelectedViewId(viewId)
    setDraft(view.query)
  }

  function confirmSave() {
    const saved = saveView(draftName, draft)
    if (!saved) return
    setSelectedViewId(saved.id)
    setNaming(false)
    setDraftName("")
  }

  // A new row opens out of nothing so the eye follows it to where it landed.
  // Removal is immediate on purpose: under StrictMode an AnimatePresence exit
  // can fail to unmount, leaving invisible rows in the panel and the tab order.
  const rowMotion = reduceMotion
    ? {}
    : {
      initial: { opacity: 0, height: 0 },
      animate: { opacity: 1, height: "auto" as const },
      transition: { type: "spring" as const, duration: 0.24, bounce: 0 },
      style: { overflow: "hidden" },
    }

  return (
    <Popover open={open} onOpenChange={openPanel}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t(label)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2.5 text-[12px] font-medium text-[var(--md-text)] transition-[background,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-surface)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-line)] active:scale-[0.96] motion-reduce:transform-none",
            (open || appliedCount > 0) && "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]",
          )}
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
          <span className="hidden lg:inline group-data-[mobile=true]/table-controls:inline">{t(label)}</span>
          {appliedCount ? (
            <motion.span
              key={appliedCount}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="grid min-w-4 place-items-center rounded-full bg-[var(--md-accent-a11)] px-1 text-[10px] font-medium tabular-nums text-[var(--md-accent)]"
              data-i18n-skip
            >
              {appliedCount}
            </motion.span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={align}
        sideOffset={6}
        aria-label={t(title)}
        onInteractOutside={(event) => { if (isInsideFloatingLayer(event.target)) event.preventDefault() }}
        onFocusOutside={(event) => { if (isInsideFloatingLayer(event.target)) event.preventDefault() }}
        className="w-[min(640px,calc(100vw-20px))] gap-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-popover)]"
      >
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-5 text-[var(--md-ink)]">{t(title)}</p>
            <p className="text-[11px] leading-4 text-[var(--md-subtle)]">{t("Build conditions, then apply them to the table.")}</p>
          </div>
          {views.length ? (
            <div className="flex items-center gap-1">
              <Select value={selectedViewId} onValueChange={loadView}>
                <SelectTrigger size="sm" aria-label={t("Saved filters")} className="h-7 w-[148px] rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-ink)]">
                  <Bookmark className="size-3.5 text-[var(--md-subtle)]" strokeWidth={1.4} aria-hidden="true" />
                  <SelectValue placeholder={t("Saved filters")} />
                </SelectTrigger>
                <SelectContent>
                  {views.map((view) => (
                    <SelectItem key={view.id} value={view.id} className="text-[12px]">
                      <span dir="auto">{view.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedViewId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("Delete saved filter")}
                  className="size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-red)]"
                  onClick={() => { deleteView(selectedViewId); setSelectedViewId("") }}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.4} />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="max-h-[min(56dvh,420px)] overflow-y-auto px-1 pb-1 md-scrollbar">
          {draft.groups.map((group, groupIndex) => (
            <div key={group.id} className="grid gap-1.5">
              {groupIndex > 0 ? (
                <div className="flex items-center gap-2 py-1">
                  <MatchSelect
                    value={draft.match}
                    onChange={(match) => setDraft((current) => ({ ...current, match }))}
                    ariaLabel="Match between groups"
                    allLabel="and"
                    anyLabel="or"
                    className="w-[68px]"
                  />
                  <span className="text-[11px] text-[var(--md-subtle)]">{t("between groups")}</span>
                </div>
              ) : null}

              <div className="grid gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-1">
                {group.conditions.map((condition, conditionIndex) => {
                  const meta = fieldMeta(condition.field)
                  const kind = meta?.kind ?? "text"
                  const operators = filterOperatorsForKind(kind)
                  const needsValue = filterOperatorNeedsValue(condition.operator)
                  const needsRange = filterOperatorNeedsRange(condition.operator)

                  return (
                    <motion.div
                      key={condition.id}
                      {...rowMotion}
                      className="grid grid-cols-[68px_minmax(0,1fr)_28px] items-center gap-1.5 rounded-[var(--md-radius-md)] px-0.5 py-0.5 sm:grid-cols-[68px_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.25fr)_28px]"
                    >
                      <div className="col-start-1 row-start-1 min-w-0">
                        {conditionIndex === 0 ? (
                          <span className="ps-1.5 text-[11px] font-medium text-[var(--md-subtle)]">{t("Where")}</span>
                        ) : conditionIndex === 1 ? (
                          <MatchSelect
                            value={group.match}
                            onChange={(match) => updateGroup(group.id, (current) => ({ ...current, match }))}
                            ariaLabel="Match within group"
                            allLabel="and"
                            anyLabel="or"
                          />
                        ) : (
                          <span className="ps-1.5 text-[11px] text-[var(--md-subtle)]">{t(group.match === "all" ? "and" : "or")}</span>
                        )}
                      </div>

                      <Select value={condition.field} onValueChange={(field) => changeField(group.id, condition, field)}>
                        <SelectTrigger size="sm" aria-label={t("Filter field")} className={cn(fieldSelectClass, "col-start-2 row-start-1")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[320px]">
                          {fields.map((field) => (
                            <SelectItem key={field.value} value={field.value} className="text-[12px]">{t(field.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={condition.operator} onValueChange={(operator) => updateCondition(group.id, condition.id, { operator: operator as FilterOperator, valueTo: "" })}>
                        <SelectTrigger size="sm" aria-label={t("Filter operator")} className={cn(fieldSelectClass, "col-start-2 row-start-2 font-normal text-[var(--md-text)] sm:col-start-3 sm:row-start-1")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((operator) => (
                            <SelectItem key={operator.value} value={operator.value} className="text-[12px]">{t(operator.label)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="col-start-2 row-start-3 min-w-0 sm:col-start-4 sm:row-start-1">
                        {!needsValue ? null : kind === "date" ? (
                          <MultideckDateRangePicker
                            value={needsRange
                              ? { start: condition.value, end: condition.valueTo ?? "" }
                              : { start: condition.value, end: condition.value }}
                            onChange={(range) => updateCondition(group.id, condition.id, needsRange
                              ? { value: range.start ?? "", valueTo: range.end ?? "" }
                              : { value: range.start ?? "", valueTo: "" })}
                            placeholder={t(needsRange ? "Select dates" : "Select date")}
                            title={t(meta?.label ?? "Date")}
                            description={t(needsRange ? "Pick a start date, then an end date." : "Pick a date.")}
                            startLabel={t(needsRange ? "Start date" : "Date")}
                            endLabel={t(needsRange ? "End date" : "Date")}
                            footerLabel={t(needsRange ? "Selected date range" : "Selected date")}
                            allowClear
                            triggerClassName="h-7 w-full gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12px] [&_svg]:size-3.5"
                          />
                        ) : kind === "select" ? (
                          <Select value={condition.value} onValueChange={(value) => updateCondition(group.id, condition.id, { value })}>
                            <SelectTrigger size="sm" aria-label={t("Filter value")} className="h-7 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2 text-[12px] font-normal text-[var(--md-ink)] shadow-[var(--md-shadow-line)]">
                              <SelectValue placeholder={t(meta?.placeholder ?? "Choose a value")} />
                            </SelectTrigger>
                            <SelectContent className="max-h-[320px]">
                              {(meta?.options ?? []).map((option) => (
                                <SelectItem key={option.value} value={option.value} className="text-[12px]">{t(option.label)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={condition.value}
                            dir="auto"
                            aria-label={t("Filter value")}
                            placeholder={t(meta?.placeholder ?? "Enter a value")}
                            className="h-7 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2 text-base shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] sm:text-[12px]"
                            onChange={(event) => updateCondition(group.id, condition.id, { value: event.target.value })}
                            onKeyDown={(event) => { if (event.key === "Enter") applyDraft() }}
                          />
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("Remove condition")}
                        className="col-start-3 row-start-1 size-7 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] opacity-70 hover:bg-[var(--md-hover)] hover:text-[var(--md-red)] hover:opacity-100 sm:col-start-5"
                        onClick={() => removeCondition(group.id, condition.id)}
                      >
                        <X className="size-3.5" strokeWidth={1.4} />
                      </Button>
                    </motion.div>
                  )
                })}

                <div className="flex items-center justify-between gap-2 ps-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-accent)] hover:bg-[var(--md-accent-a08)]"
                    onClick={() => addCondition(group.id)}
                  >
                    <Plus className="size-3.5" strokeWidth={1.5} />
                    {t("Add condition")}
                  </Button>
                  {draft.groups.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 rounded-[var(--md-radius-md)] px-2 text-[11px] font-medium text-[var(--md-subtle)] hover:bg-[var(--md-hover)] hover:text-[var(--md-red)]"
                      onClick={() => removeGroup(group.id)}
                    >
                      {t("Remove group")}
                    </Button>
                  ) : null}
                </div>
                </div>
              </div>
            ))}

          <Button
            type="button"
            variant="ghost"
            className="mt-1 h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
            onClick={addGroup}
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
            {t("Add condition group")}
          </Button>
        </div>

        {naming ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="mx-1 mb-1 grid gap-1.5 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-2"
          >
            <label htmlFor={`${storageKey}-filter-name`} className="text-[11px] font-medium text-[var(--md-text)]">{t("Filter name")}</label>
            <div className="flex items-center gap-1.5">
              <Input
                id={`${storageKey}-filter-name`}
                ref={nameInputRef}
                value={draftName}
                dir="auto"
                placeholder={t("Open high-value work")}
                className="h-7 flex-1 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-field-bg)] px-2 text-base shadow-[var(--md-shadow-line)] sm:text-[12px]"
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); confirmSave() }
                  if (event.key === "Escape") { event.preventDefault(); setNaming(false) }
                }}
              />
              <Button type="button" variant="ghost" className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] text-[var(--md-text)] hover:bg-[var(--md-hover)]" onClick={() => setNaming(false)}>
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                disabled={!draftName.trim()}
                className="h-7 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-2.5 text-[12px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)] disabled:opacity-45"
                onClick={confirmSave}
              >
                {t("Save filter")}
              </Button>
            </div>
          </motion.div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 shadow-[var(--md-stroke-top)]">
          <Button
            type="button"
            variant="ghost"
            disabled={!draftCount}
            className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] disabled:opacity-40"
            onClick={clearDraft}
          >
            {t("Clear filters")}
          </Button>

          <div className="ms-auto flex items-center gap-1.5">
            {matchedCount === null ? null : (
              <p className="me-1 text-[11px] font-medium text-[var(--md-subtle)]">
                <span data-i18n-skip dir="ltr" className="tabular-nums">
                  {numberFormat.format(matchedCount)}{totalCount === undefined ? "" : `/${numberFormat.format(totalCount)}`}
                </span>
                <span className="ms-1">{t(itemLabel)}</span>
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={!draftCount}
              className="h-7 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] disabled:opacity-40"
              onClick={() => { setDraftName(views.find((view) => view.id === selectedViewId)?.name ?? ""); setNaming(true) }}
            >
              <Bookmark className="size-3.5" strokeWidth={1.4} />
              {t("Save")}
            </Button>
            <Button
              type="button"
              className="h-7 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] font-medium text-[var(--md-accent-ink)] shadow-[var(--md-shadow-line)] transition-[background,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-hover)] active:scale-[0.96] motion-reduce:transform-none"
              onClick={applyDraft}
            >
              {t("Apply filters")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
