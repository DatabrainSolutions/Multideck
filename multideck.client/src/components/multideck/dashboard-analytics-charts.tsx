import { DashboardEmptyState } from "./dashboard-empty-state"
import { useState, type KeyboardEvent } from "react"
import { useLanguage } from "@/i18n/language-provider"
import "./dashboard-analytics-charts.css"

function moveSelection(
  event: KeyboardEvent<HTMLButtonElement>,
  index: number,
  length: number,
  select: (index: number) => void,
  horizontal = 1,
) {
  const next =
    event.key === "ArrowRight"
      ? index + horizontal
      : event.key === "ArrowLeft"
        ? index - horizontal
        : event.key === "ArrowDown"
          ? index + 1
          : event.key === "ArrowUp"
            ? index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? length - 1
                : null
  if (next === null) return
  event.preventDefault()
  const target = Math.max(0, Math.min(length - 1, next))
  select(target)
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>("button")
    [target]?.focus()
}

/** Workflow stages share the starting cohort's scale; counts remain inspectable at zero. */
export function CohortJourney({ stages, note }: {
  stages: { label: string; value: number }[]
  note: string
}) {
  const { t, language } = useLanguage()
  const [selection, select] = useState(Math.max(0, stages.length - 1))
  const index = Math.min(selection, stages.length - 1)
  const stage = stages[index]
  const base = stages[0]?.value ?? 0
  const last = stages[stages.length - 1]
  const valid = stages.every((item, i) => item.value >= 0 && (!i || item.value <= stages[i - 1].value))
  const format = (value: number) => value.toLocaleString(language)
  const share = (value: number) => `${Math.round(value / base * 100)}%`
  if (!stage || (base === 0 && valid)) return <DashboardEmptyState kind={stages[0]?.label.includes("Lead") ? "leads" : "quotes"} title="No activity in this cohort" detail="Try a wider date range to see earlier activity." />
  return (
    <div className="md-cohort-journey">
      <div className="md-cohort-summary">
        <strong>{base > 0 && valid ? share(last.value) : "—"}</strong>
        <div><span>{t(last.label)}</span><small>{t("of the starting cohort")}</small></div>
      </div>
      {!valid ? <p className="md-analytics-note" role="status">{t("These stages do not form an ordered cohort. Review the source counts below.")}</p> : null}
      <div className="md-cohort-stages" role="group" aria-label={t("Conversion stages")}>
        {stages.map((item, i) => (
          <button key={item.label} type="button" aria-pressed={i === index}
            tabIndex={i === index ? 0 : -1} onClick={() => select(i)} onFocus={() => select(i)}
            onKeyDown={(e) => moveSelection(e, i, stages.length, select)}>
            <span className="md-cohort-stage-label">{t(item.label)}</span>
            <strong>{format(item.value)}</strong>
            <span className="md-cohort-stage-track" aria-hidden="true"><i style={{ width: `${valid && base > 0 ? item.value / base * 100 : 0}%` }} /></span>
            <span className="md-cohort-stage-share">{valid && base > 0 ? share(item.value) : "—"}</span>
          </button>
        ))}
      </div>
      <p className="md-analytics-readout" aria-live="polite">
        {base === 0 && valid ? t("No activity in this cohort. Try a wider date range.") : (
          <><strong>{t(stage.label)}: {format(stage.value)}</strong>{index > 0 && valid ? ` · ${format(base - stage.value)} ${t("have not reached this stage")}` : null}</>
        )}
      </p>
      <p className="md-analytics-note">{note}</p>
    </div>
  )
}

type Reason = { label: string; count: number }
type Tile = Reason & {
  x: number
  y: number
  width: number
  height: number
  index: number
}
// Balanced recursive slices preserve area exactly; labels and selection live outside tiny tiles.
function reasonTiles(
  items: (Reason & { index: number })[],
  x = 0,
  y = 0,
  width = 560,
  height = 200,
  vertical = true,
): Tile[] {
  if (!items.length) return []
  if (items.length === 1) return [{ ...items[0], x, y, width, height }]
  const total = items.reduce((sum, item) => sum + item.count, 0)
  let split = 1,
    first = items[0].count
  while (
    split < items.length - 1 &&
    Math.abs(first + items[split].count - total / 2) <
      Math.abs(first - total / 2)
  )
    first += items[split++].count
  const ratio = first / total
  return vertical
    ? [
        ...reasonTiles(
          items.slice(0, split),
          x,
          y,
          width * ratio,
          height,
          false,
        ),
        ...reasonTiles(
          items.slice(split),
          x + width * ratio,
          y,
          width * (1 - ratio),
          height,
          false,
        ),
      ]
    : [
        ...reasonTiles(
          items.slice(0, split),
          x,
          y,
          width,
          height * ratio,
          true,
        ),
        ...reasonTiles(
          items.slice(split),
          x,
          y + height * ratio,
          width,
          height * (1 - ratio),
          true,
        ),
      ]
}

/** Category area encodes the share of recorded losses; no targets or progress are implied. */
export function LossReasonMap({ reasons }: { reasons: Reason[] }) {
  const { t, language } = useLanguage()
  const [selection, select] = useState(0)
  const rows = reasons
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
  const index = Math.min(selection, rows.length - 1)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const tiles = reasonTiles(rows.map((row, index) => ({ ...row, index })))
  if (!total)
    return (
      <p className="md-analytics-empty">
        {t("No recorded quote losses in this period.")}
      </p>
    )
  return (
    <div className="md-loss-map">
      <svg viewBox="0 0 560 200" aria-hidden="true">
        {tiles.map((tile) => (
          <g
            key={tile.label}
            onPointerEnter={() => select(tile.index)}
            data-selected={index === tile.index}
          >
            <rect
              x={tile.x + 2}
              y={tile.y + 2}
              width={Math.max(0, tile.width - 4)}
              height={Math.max(0, tile.height - 4)}
              rx="5"
              style={{
                fill: `color-mix(in srgb, var(--md-accent) ${18 + (tile.index % 5) * 8}%, var(--md-surface))`,
              }}
            />
            {tile.width > 100 && tile.height > 62 ? (
              <text x={tile.x + 13} y={tile.y + 26}>
                <tspan x={tile.x + 13}>
                  {Math.round((tile.count / total) * 100)}%
                </tspan>
                <tspan x={tile.x + 13} dy="21">
                  {t(tile.label).slice(0, Math.floor((tile.width - 24) / 7))}
                  {t(tile.label).length > Math.floor((tile.width - 24) / 7)
                    ? "…"
                    : ""}
                </tspan>
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div
        className="md-loss-legend"
        role="group"
        aria-label={t("Quote loss reasons")}
      >
        {rows.map((row, i) => (
          <button
            key={row.label}
            type="button"
            tabIndex={i === index ? 0 : -1}
            aria-pressed={i === index}
            onClick={() => select(i)}
            onFocus={() => select(i)}
            onKeyDown={(e) => moveSelection(e, i, rows.length, select)}
          >
            <span>{t(row.label)}</span>
            <strong>{row.count.toLocaleString(language)}</strong>
          </button>
        ))}
      </div>
      <p className="md-analytics-readout" aria-live="polite">
        <strong>{t(rows[index].label)}</strong> ·{" "}
        {Math.round((rows[index].count / total) * 100)}%{" "}
        {t("of recorded losses")}
      </p>
    </div>
  )
}

/** Complete UTC daily activity arranged as weeks. Colour is time, never productivity. */
export function UsageCalendar({
  days,
  measuredFrom,
  retainedFrom,
}: {
  days: { day: string; activeSeconds: number; idleSeconds: number }[]
  measuredFrom?: string | null
  retainedFrom?: string
}) {
  const { t, language } = useLanguage()
  const [selection, select] = useState(0)
  const rows = [...days].sort((a, b) => a.day.localeCompare(b.day))
  if (!rows.length)
    return (
      <p className="md-analytics-empty">
        {t("No daily activity is available.")}
      </p>
    )
  const index = Math.min(selection, rows.length - 1)
  const offset = (new Date(`${rows[0].day}T00:00:00Z`).getUTCDay() + 6) % 7
  const peak = Math.max(1, ...rows.map((day) => day.activeSeconds))
  const formatDate = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
  const hours = (value: number) =>
    `${(value / 3600).toLocaleString(language, { maximumFractionDigits: 1 })}h`
  const isMeasured = (day: string) =>
    Boolean(
      measuredFrom &&
        day >= measuredFrom.slice(0, 10) &&
        (!retainedFrom || day >= retainedFrom),
    )
  const selected = rows[index]
  return (
    <div className="md-usage-calendar">
      <div className="md-usage-calendar-scroll">
        <div className="md-usage-calendar-labels" aria-hidden="true">
          {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
        <div
          className="md-usage-calendar-days"
          role="group"
          aria-label={t("Daily workspace activity")}
          style={{
            gridTemplateColumns: `repeat(${Math.ceil((rows.length + offset) / 7)}, 22px)`,
          }}
        >
          {rows.map((day, i) => (
            <button
              key={day.day}
              type="button"
              tabIndex={i === index ? 0 : -1}
              aria-pressed={i === index}
              aria-label={`${formatDate(day.day)} · ${isMeasured(day.day) ? `${hours(day.activeSeconds)} ${t("active")}, ${hours(day.idleSeconds)} ${t("idle")}` : t("No activity tracking")}`}
              onPointerEnter={() => select(i)}
              onFocus={() => select(i)}
              onClick={() => select(i)}
              onKeyDown={(e) => moveSelection(e, i, rows.length, select, 7)}
              style={{
                gridColumn: Math.floor((i + offset) / 7) + 1,
                gridRow: ((i + offset) % 7) + 1,
                background: isMeasured(day.day)
                  ? `color-mix(in srgb, var(--md-accent) ${day.activeSeconds ? 12 + (day.activeSeconds / peak) * 65 : 0}%, var(--md-surface-tint))`
                  : undefined,
              }}
              data-measured={isMeasured(day.day)}
            />
          ))}
        </div>
      </div>
      <div className="md-usage-calendar-detail" aria-live="polite">
        <span>{formatDate(selected.day)}</span>
        <strong>
          {isMeasured(selected.day) ? hours(selected.activeSeconds) : "—"}
        </strong>
        <small>
          {isMeasured(selected.day)
            ? `${t("active")} · ${hours(selected.idleSeconds)} ${t("idle")}`
            : t("No activity tracking")}
        </small>
      </div>
      <p className="md-analytics-note">
        {t(
          "Each square is a UTC day. Darker squares show more active time; outlined days have no tracking.",
        )}
      </p>
    </div>
  )
}
