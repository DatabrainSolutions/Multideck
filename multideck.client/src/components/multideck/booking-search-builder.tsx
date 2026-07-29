import { Plus, Search, X } from "lucide-react"

import { MultideckDateRangePicker } from "@/components/multideck/date-picker"
import {
  bookingSearchFieldOptions,
  type BookingSearchCriterion,
  type BookingSearchField,
} from "@/components/multideck/booking-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"

const dateSearchFields = new Set<BookingSearchField>(["date", "departure", "arrival"])

function emptyCriterion(id = `booking-search-${Date.now()}`): BookingSearchCriterion {
  return { id, field: "any", value: "", valueTo: "" }
}

function groupCriteria(criteria: BookingSearchCriterion[]) {
  return criteria.reduce<Array<{ id: string; connector: "and" | "or"; criteria: BookingSearchCriterion[] }>>((groups, criterion, index) => {
    const groupId = criterion.groupId ?? "booking-search-main"
    const current = groups.find((group) => group.id === groupId)
    if (current) {
      current.criteria.push(criterion)
      return groups
    }
    groups.push({
      id: groupId,
      connector: criterion.groupConnector ?? (index === 0 ? "and" : "or"),
      criteria: [criterion],
    })
    return groups
  }, [])
}

export function BookingSearchBuilder({
  value,
  onChange,
  resultCount,
  totalCount,
}: {
  value: BookingSearchCriterion[]
  onChange: (value: BookingSearchCriterion[]) => void
  resultCount: number
  totalCount: number
}) {
  const { t } = useLanguage()
  const groups = groupCriteria(value.length ? value : [emptyCriterion("booking-search-any")])

  function updateCriterion(id: string, patch: Partial<BookingSearchCriterion>) {
    onChange(value.map((criterion) => {
      if (criterion.id !== id) return criterion
      const nextField = patch.field ?? criterion.field
      const next = { ...criterion, ...patch, field: nextField }
      return dateSearchFields.has(nextField) ? next : { ...next, valueTo: "" }
    }))
  }

  function updateGroupConnector(groupId: string, connector: "and" | "or") {
    onChange(value.map((criterion) => (
      (criterion.groupId ?? "booking-search-main") === groupId
        ? { ...criterion, groupConnector: connector }
        : criterion
    )))
  }

  function addCriterion(groupId: string) {
    onChange([
      ...value,
      { ...emptyCriterion(), field: "invoice", connector: "and", groupId },
    ])
  }

  function addGroup() {
    const groupId = `booking-search-group-${Date.now()}`
    onChange([
      ...value,
      { ...emptyCriterion(`${groupId}-criterion`), field: "invoice", groupId, groupConnector: "or" },
    ])
  }

  function removeCriterion(id: string) {
    const next = value.filter((criterion) => criterion.id !== id)
    onChange(next.length ? next : [emptyCriterion("booking-search-any")])
  }

  function removeGroup(groupId: string) {
    const next = value.filter((criterion) => (criterion.groupId ?? "booking-search-main") !== groupId)
    onChange(next.length ? next : [emptyCriterion("booking-search-any")])
  }

  return (
    <section
      aria-label={t("Advanced booking search")}
      className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Filter bookings")}</h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Results update as you change each condition.")}</p>
        </div>
        <p className="text-[12px] font-medium text-[var(--md-subtle)]">
          <span data-i18n-skip dir="ltr">{resultCount}/{totalCount}</span>
          <span className="ms-1">{t("shown")}</span>
        </p>
      </header>

      <div className="grid gap-3 px-5 pb-5 shadow-[var(--md-stroke-top)]">
        {groups.map((group, groupIndex) => (
          <div key={group.id} className="grid gap-2 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {groupIndex === 0 ? (
                  <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Where")}</span>
                ) : (
                  <Select value={group.connector} onValueChange={(connector) => updateGroupConnector(group.id, connector as "and" | "or")}>
                    <SelectTrigger className="h-8 w-[112px] rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-tint)] text-[12px] shadow-[var(--md-shadow-line)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">{t("And group")}</SelectItem>
                      <SelectItem value="or">{t("Or group")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <span className="text-[12px] font-medium text-[var(--md-subtle)]">{t("Group")} {groupIndex + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-md)] text-[12px] text-[var(--md-accent)]" onClick={() => addCriterion(group.id)}>
                  <Plus className="size-3.5" strokeWidth={1.4} />
                  {t("Add filter")}
                </Button>
                {groups.length > 1 ? (
                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Remove group")} onClick={() => removeGroup(group.id)}>
                    <X className="size-3.5" strokeWidth={1.4} />
                  </Button>
                ) : null}
              </div>
            </div>

            {group.criteria.map((criterion, criterionIndex) => {
              const meta = bookingSearchFieldOptions.find((option) => option.value === criterion.field) ?? bookingSearchFieldOptions[0]
              const dateSearch = dateSearchFields.has(criterion.field)

              return (
                <div key={criterion.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-1.5 shadow-[var(--md-shadow-line)] md:grid-cols-[104px_190px_minmax(0,1fr)_auto] md:items-center">
                  {criterionIndex === 0 ? (
                    <span className="px-2 text-[12px] font-medium text-[var(--md-subtle)]">{groupIndex === 0 ? t("Where") : t("Match")}</span>
                  ) : (
                    <Select value={criterion.connector ?? "and"} onValueChange={(connector) => updateCriterion(criterion.id, { connector: connector as "and" | "or" })}>
                      <SelectTrigger className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] text-[12px] shadow-[var(--md-shadow-line)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">{t("And")}</SelectItem>
                        <SelectItem value="or">{t("Or")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <Select value={criterion.field} onValueChange={(field) => updateCriterion(criterion.id, { field: field as BookingSearchField, value: "", valueTo: "" })}>
                    <SelectTrigger aria-label={t("Criterion field")} className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] text-[13px] shadow-[var(--md-shadow-line)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {bookingSearchFieldOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{t(option.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {dateSearch ? (
                    <MultideckDateRangePicker
                      value={{ start: criterion.value, end: criterion.valueTo ?? "" }}
                      onChange={(range) => updateCriterion(criterion.id, { value: range.start ?? "", valueTo: range.end ?? "" })}
                      placeholder={t(meta.placeholder)}
                      title={t(`${meta.label} range`)}
                      description={t("Pick a start date, then an end date.")}
                      startLabel={t("Start date")}
                      endLabel={t("End date")}
                      footerLabel={t("Selected date range")}
                      allowClear
                      triggerClassName="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[13px] shadow-[var(--md-shadow-line)]"
                    />
                  ) : (
                    <div className="relative">
                      <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} />
                      <Input
                        value={criterion.value}
                        onChange={(event) => updateCriterion(criterion.id, { value: event.target.value })}
                        placeholder={t(meta.placeholder)}
                        aria-label={t(meta.label)}
                        dir="auto"
                        className="h-9 rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] ps-9 text-base shadow-[var(--md-shadow-line)] md:text-[13px]"
                      />
                    </div>
                  )}

                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" aria-label={t("Remove criterion")} onClick={() => removeCriterion(criterion.id)}>
                    <X className="size-3.5" strokeWidth={1.4} />
                  </Button>
                </div>
              )
            })}
          </div>
        ))}

        <Button type="button" variant="ghost" size="sm" className="h-8 w-fit rounded-[var(--md-radius-md)] text-[12px] text-[var(--md-accent)]" onClick={addGroup}>
          <Plus className="size-3.5" strokeWidth={1.4} />
          {t("Add group")}
        </Button>
      </div>
    </section>
  )
}
