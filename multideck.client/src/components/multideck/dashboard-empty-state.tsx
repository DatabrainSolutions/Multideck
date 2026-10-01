import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/i18n/language-provider"
import "./dashboard-empty-state.css"

export type DashboardEmptyKind = "leads" | "followup" | "quotes" | "pipeline" | "losses" | "customers" | "continuity" | "activity" | "workflow" | "money" | "coverage" | "map" | "shipping" | "system" | "ai" | "modules"

/** A quiet illustration of the missing records. It never plots invented data. */
export function DashboardEmptyState({ kind = "activity", title, detail, compact = false }: {
  kind?: DashboardEmptyKind
  title: string
  detail?: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const root = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={root} className="md-dashboard-empty" data-kind={kind} data-compact={compact || undefined} data-paused={paused || !visible || undefined}>
      <div className="md-empty-illustration">
        <svg viewBox="0 0 200 120" fill="none" aria-hidden="true" focusable="false">
          <path className="md-empty-ground" d="M46 104h108" />
          {kind === "leads" ? <>
            <rect className="md-empty-paper" x="47" y="27" width="82" height="64" rx="9" />
            <g className="md-empty-contact">
              <circle className="md-empty-accent" cx="70" cy="48" r="8" /><path d="M57 69c0-8 5-12 13-12s13 4 13 12" />
              <path className="md-empty-base" d="M94 46h21M94 57h15M58 80h50" />
            </g>
            <g className="md-empty-search"><circle className="md-empty-paper" cx="131" cy="74" r="17" /><circle className="md-empty-blue" cx="131" cy="74" r="11" /><path d="m143 86 12 12" /></g>
          </> : kind === "customers" ? <>
            <path className="md-empty-base" d="M57 76h86M100 47v28" />
            <g className="md-empty-person-main"><circle className="md-empty-accent" cx="100" cy="35" r="12" /><path d="M80 64c0-12 8-19 20-19s20 7 20 19" /></g>
            <g className="md-empty-person-side"><circle className="md-empty-blue" cx="49" cy="69" r="9" /><path d="M33 94c0-10 6-16 16-16s16 6 16 16" /></g>
            <g className="md-empty-person-side md-empty-later"><circle className="md-empty-amber" cx="151" cy="69" r="9" /><path d="M135 94c0-10 6-16 16-16s16 6 16 16" /></g>
          </> : kind === "quotes" ? <>
            <path className="md-empty-blue" d="M75 20h54a7 7 0 0 1 7 7v61a7 7 0 0 1-7 7H75" />
            <g className="md-empty-document">
              <path className="md-empty-paper" d="M64 27h39l19 19v49a7 7 0 0 1-7 7H64a7 7 0 0 1-7-7V34a7 7 0 0 1 7-7Z" />
              <path className="md-empty-accent" d="M103 27v14a5 5 0 0 0 5 5h14L103 27Z" />
              <g className="md-empty-ink"><path d="M70 58h38M70 70h30M70 82h19" /></g>
            </g>
            <g className="md-empty-pencil"><path className="md-empty-amber" d="m126 69 8-8 20 20-8 8-20-20Z" /><path d="m146 89 10 2-2-10M131 66l20 20" /></g>
          </> : kind === "money" ? <>
            <rect className="md-empty-paper" x="48" y="26" width="69" height="69" rx="8" />
            <path className="md-empty-base" d="M62 41h37M62 54h23M62 68h17M62 81h21" />
            <g className="md-empty-coin-back"><circle className="md-empty-blue" cx="131" cy="55" r="18" /><path d="M131 46v18M126 49h7a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8h7" /></g>
            <g className="md-empty-coin"><circle className="md-empty-amber" cx="119" cy="79" r="23" /><circle className="md-empty-base" cx="119" cy="79" r="17" /><path d="M124 69h-5a5 5 0 0 0-5 5v14h12M110 80h12" /></g>
          </> : kind === "map" ? <>
            <path className="md-empty-map-paper" d="m32 43 43-13 48 14 43-13v61l-43 13-48-14-43 13V43ZM75 30v61M123 44v61" />
            <path className="md-empty-route" d="M48 81c12-20 31 7 47-9s21-15 39-8" strokeDasharray="2 7" />
            <ellipse className="md-empty-pin-shadow" cx="105" cy="67" rx="12" ry="3" />
            <g className="md-empty-pin"><path className="md-empty-accent" d="M123 32c0 14-18 32-18 32S87 46 87 32a18 18 0 1 1 36 0Z" /><circle className="md-empty-solid" cx="105" cy="32" r="5" /></g>
          </> : kind === "workflow" ? <>
            <path className="md-empty-base" d="M49 59h32M119 59h32" strokeDasharray="3 5" />
            <g className="md-empty-workflow-node"><rect className="md-empty-blue" x="21" y="44" width="30" height="30" rx="8" /><path d="M31 54h10M31 63h6" /></g>
            <g className="md-empty-workflow-node md-empty-middle"><rect className="md-empty-accent" x="85" y="44" width="30" height="30" rx="8" /><path d="m96 53 6 6-6 6" /></g>
            <g className="md-empty-workflow-node md-empty-last"><rect className="md-empty-amber" x="149" y="44" width="30" height="30" rx="8" /><path d="M159 54h10M159 63h6" /></g>
            <path className="md-empty-base" d="M100 32v-8M36 85v8M164 85v8" />
          </> : kind === "system" ? <>
            <path className="md-empty-shield-echo" d="m100 12 38 15v29c0 24-38 43-38 43S62 80 62 56V27l38-15Z" />
            <path className="md-empty-accent" d="m100 22 29 12v22c0 18-29 33-29 33S71 74 71 56V34l29-12Z" />
            <g className="md-empty-system-core"><circle cx="100" cy="53" r="12" /><path d="M94 53h12M100 47v12" /></g>
          </> : kind === "followup" ? <>
            <rect className="md-empty-paper" x="39" y="27" width="90" height="68" rx="9" />
            <path className="md-empty-blue" d="M48 27h72a9 9 0 0 1 9 9v10H39V36a9 9 0 0 1 9-9Z" />
            <path d="M58 20v14M109 20v14" />
            <g className="md-empty-contact"><circle className="md-empty-accent" cx="63" cy="64" r="7" /><path d="M52 82c0-8 5-11 11-11s11 3 11 11M86 63h26M86 75h17" /></g>
            <g className="md-empty-reminder"><path className="md-empty-amber" d="M129 56a13 13 0 0 1 26 0v12l6 9h-38l6-9V56Z" /><path d="M137 83a5 5 0 0 0 10 0M142 39v-4" /></g>
          </> : kind === "pipeline" ? <>
            {/* Keep connectors in the gaps so they never show through fading nodes. */}
            <path className="md-empty-base" d="M69 63h8M123 63h15" strokeDasharray="3 5" />
            <g className="md-empty-workflow-node"><rect className="md-empty-blue" x="26" y="36" width="40" height="49" rx="7" /><path d="M36 49h20M36 59h16M36 69h10" /></g>
            <g className="md-empty-workflow-node md-empty-middle"><path className="md-empty-accent" d="M88 41h24a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8h-9l-11 9v-9h-4a8 8 0 0 1-8-8V49a8 8 0 0 1 8-8Z" /><circle className="md-empty-solid" cx="91" cy="57" r="1.5" /><circle className="md-empty-solid" cx="100" cy="57" r="1.5" /><circle className="md-empty-solid" cx="109" cy="57" r="1.5" /></g>
            <g className="md-empty-workflow-node md-empty-last"><path className="md-empty-amber" d="m141 47 15-8 17 8v25l-17 9-15-9V47Z" /><path d="m141 47 15 9 17-9M156 56v25" /></g>
          </> : kind === "losses" ? <>
            <rect className="md-empty-paper" x="47" y="27" width="66" height="72" rx="8" />
            <path className="md-empty-base" d="M60 42h37M60 54h29M60 66h17" />
            <g className="md-empty-search"><path className="md-empty-blue" d="M112 41h36a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8h-13l-13 10V83h-10a8 8 0 0 1-8-8V49a8 8 0 0 1 8-8Z" /><path d="M117 57h26M117 68h17" /></g>
            <path className="md-empty-amber md-empty-ink" d="M60 81h22v7H60Z" />
          </> : kind === "continuity" ? <>
            <path className="md-empty-loop-arrow" d="M47 45c9-18 31-27 50-22M47 45l-1-13M47 45l13-3M153 75c-9 18-31 27-50 22M153 75l1 13M153 75l-13 3" />
            <g className="md-empty-person-main"><rect className="md-empty-blue" x="48" y="49" width="43" height="43" rx="11" /><circle cx="70" cy="62" r="6" /><path d="M59 80c0-7 4-11 11-11s11 4 11 11" /></g>
            <g className="md-empty-person-side"><rect className="md-empty-accent" x="109" y="28" width="43" height="43" rx="11" /><circle cx="131" cy="41" r="6" /><path d="M120 59c0-7 4-11 11-11s11 4 11 11" /></g>
            <path className="md-empty-base" d="m89 67 20-14" strokeDasharray="3 5" />
          </> : kind === "coverage" ? <>
            <rect className="md-empty-paper" x="49" y="20" width="70" height="78" rx="8" />
            <rect className="md-empty-blue" x="68" y="15" width="32" height="12" rx="5" />
            <path className="md-empty-base" d="M78 43h26M78 59h20M78 75h14" />
            <g className="md-empty-ink"><rect className="md-empty-accent" x="61" y="38" width="9" height="9" rx="2" /><rect className="md-empty-accent" x="61" y="54" width="9" height="9" rx="2" /><rect className="md-empty-accent" x="61" y="70" width="9" height="9" rx="2" /></g>
            <g className="md-empty-search"><circle className="md-empty-amber" cx="131" cy="79" r="16" /><path d="m143 91 10 10M125 79h12M131 73v12" /></g>
          </> : kind === "shipping" ? <>
            <path className="md-empty-base" d="M32 97h31M73 101h33M117 97h48" />
            <g className="md-empty-vessel">
              <path className="md-empty-paper" d="M33 75h131l-16 21H51L33 75Z" />
              <rect className="md-empty-blue" x="49" y="54" width="41" height="21" rx="2" /><path d="M58 59v11M67 59v11M76 59v11M83 59v11" />
              <rect className="md-empty-accent" x="93" y="54" width="40" height="21" rx="2" /><path d="M101 59v11M110 59v11M119 59v11M126 59v11" />
              <rect className="md-empty-amber" x="72" y="31" width="39" height="20" rx="2" /><path d="M80 36v10M89 36v10M98 36v10M104 36v10" />
              <path className="md-empty-paper" d="M136 59h14v16h-14V59Z" /><path d="M143 59V43h-10" />
            </g>
          </> : kind === "ai" ? <>
            <path className="md-empty-base" d="M67 38 100 61l37-25M100 61l36 29M100 61 58 87" />
            <g className="md-empty-person-side"><rect className="md-empty-blue" x="49" y="23" width="29" height="28" rx="8" /><path d="M57 33h13M57 41h8" /></g>
            <g className="md-empty-person-side md-empty-later"><rect className="md-empty-amber" x="126" y="22" width="29" height="28" rx="8" /><path d="M134 36h13M140 30v12" /></g>
            <circle className="md-empty-blue" cx="138" cy="89" r="9" /><circle className="md-empty-accent" cx="56" cy="89" r="9" />
            <g className="md-empty-spark"><rect className="md-empty-paper" x="77" y="40" width="46" height="43" rx="13" /><path className="md-empty-accent" d="m100 48 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" /></g>
          </> : kind === "modules" ? <>
            <rect className="md-empty-paper" x="41" y="22" width="118" height="76" rx="9" /><path className="md-empty-base" d="M41 39h118" /><circle className="md-empty-solid" cx="52" cy="30" r="2" /><path className="md-empty-base" d="M61 30h12" />
            <g className="md-empty-workflow-node"><rect className="md-empty-accent" x="55" y="52" width="23" height="29" rx="5" /><path d="M62 60h9M62 67h6" /></g>
            <g className="md-empty-workflow-node md-empty-middle"><rect className="md-empty-blue" x="88" y="52" width="23" height="29" rx="5" /><path d="M95 60h9M95 67h6" /></g>
            <g className="md-empty-workflow-node md-empty-last"><rect className="md-empty-amber" x="121" y="52" width="23" height="29" rx="5" /><path d="M128 60h9M128 67h6" /></g>
          </> : <>
            <rect className="md-empty-paper" x="45" y="29" width="102" height="67" rx="9" />
            <path className="md-empty-accent" d="M54 29h84a9 9 0 0 1 9 9v8H45v-8a9 9 0 0 1 9-9Z" /><path d="M64 23v13M128 23v13" />
            <g className="md-empty-calendar-dots"><path d="M62 61h9M83 61h9M104 61h9M62 77h9M83 77h9M104 77h9" /></g>
            <g className="md-empty-clock-face"><circle className="md-empty-blue" cx="144" cy="81" r="20" /><circle className="md-empty-base" cx="144" cy="81" r="15" /><path className="md-empty-clock-hand" d="M144 81V70" /><path d="m144 81 8 5" /></g>
          </>}
        </svg>
        <button className="md-empty-motion-control" type="button" onClick={() => setPaused(value => !value)} aria-label={t(paused ? "Play empty-state animation" : "Pause empty-state animation")} title={t(paused ? "Play animation" : "Pause animation")}>
          <svg viewBox="0 0 16 16" aria-hidden="true">{paused ? <path d="m6 4 6 4-6 4V4Z" /> : <path d="M6 4v8M10 4v8" />}</svg>
        </button>
      </div>
      <div className="md-empty-copy"><p>{t(title)}</p>{detail ? <small>{t(detail)}</small> : null}</div>
    </div>
  )
}
