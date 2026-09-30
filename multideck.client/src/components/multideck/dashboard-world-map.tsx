import { useMemo, useState } from "react"
import { completeCountryOptions } from "@/lib/country-address-format"
import countries from "@/assets/maps/world-countries.json"
import { useLanguage } from "@/i18n/language-provider"

const validCountryCodes = new Set(
  completeCountryOptions([]).map((country) => country.code),
)

/** Offline Natural Earth 1:110m country outlines. Public domain; no remote map requests. */
export function DashboardWorldMap({
  values,
}: {
  values: { code: string | null; count: number }[]
}) {
  const { language, t } = useLanguage()
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const value of values) {
      const code = value.code?.toUpperCase()
      if (code && validCountryCodes.has(code))
        result.set(code, (result.get(code) ?? 0) + value.count)
    }
    return result
  }, [values])
  const names = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: "region" })
    return (code: string) => {
      try {
        return names.of(code) ?? code
      } catch {
        return code
      }
    }
  }, [language])
  const total = values.reduce((n, v) => n + v.count, 0)
  const max = Math.max(1, ...counts.values())
  const focus = hovered ?? selected
  const ordered = [...counts].sort(
    (a, b) => b[1] - a[1] || names(a[0]).localeCompare(names(b[0])),
  )
  const unknown = values
    .filter((v) => !v.code || !validCountryCodes.has(v.code.toUpperCase()))
    .reduce((n, v) => n + v.count, 0)
  return (
    <div className="md-world-map">
      <div
        className="md-world-map-readout"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{focus ? names(focus) : t("Destination countries")}</span>
        <strong>
          {focus
            ? (counts.get(focus) ?? 0).toLocaleString(language)
            : total.toLocaleString(language)}{" "}
          <small>
            {t("bookings")}
            {focus && total > 0
              ? ` · ${Math.round(((counts.get(focus) ?? 0) / total) * 100)}%`
              : ""}
          </small>
        </strong>
      </div>
      <svg
        viewBox="0 30 720 310"
        role="img"
        aria-label={t(
          "World map of booking destinations. Select a country in the list to inspect its volume.",
        )}
        onPointerLeave={() => setHovered(null)}
      >
        {countries.map((country) => {
          const count = counts.get(country.code) ?? 0
          return (
            <path
              key={country.code}
              d={country.path}
              fill={
                count
                  ? `color-mix(in srgb, var(--md-accent) ${Math.round(25 + Math.sqrt(count / max) * 65)}%, var(--md-surface))`
                  : "var(--md-surface-tint)"
              }
              data-selected={country.code === focus}
              onPointerEnter={() => setHovered(country.code)}
              onClick={() =>
                setSelected(selected === country.code ? null : country.code)
              }
            >
              <title>
                {names(country.code)}: {count} {t("bookings")}
              </title>
            </path>
          )
        })}
      </svg>
      <div className="md-world-map-legend">
        <span>{t("Fewer")}</span>
        <i aria-hidden="true" />
        <span>{t("More bookings")}</span>
      </div>
      <div
        className="md-world-map-countries"
        aria-label={t("Booking destinations")}
      >
        {ordered.map(([code, count]) => (
          <button
            type="button"
            key={code}
            aria-pressed={selected === code}
            onClick={() => setSelected(selected === code ? null : code)}
            onFocus={() => setHovered(code)}
            onBlur={() => setHovered(null)}
          >
            <span>{names(code)}</span>
            <strong>{count.toLocaleString(language)}</strong>
          </button>
        ))}
        {!ordered.length ? (
          <p>{t("No mapped bookings in this period.")}</p>
        ) : null}
      </div>
      {unknown > 0 ? (
        <p className="md-admin-caption">
          {unknown.toLocaleString(language)}{" "}
          {t("bookings have no recognised destination country.")}
        </p>
      ) : null}
    </div>
  )
}
