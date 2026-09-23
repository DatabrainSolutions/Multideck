import { cn } from "@/lib/utils"
import "./suggested-update-illustration.css"

type SuggestedUpdateIllustrationProps = {
  variant: "clear" | "compare" | "history"
  className?: string
}

/** Decorative workflow illustration; the surrounding empty-state copy carries its meaning. */
export function SuggestedUpdateIllustration({ variant, className }: SuggestedUpdateIllustrationProps) {
  const comparison = variant === "compare"

  return (
    <div className={cn("md-suggestion-art", comparison && "md-suggestion-art--compare", className)}>
      <svg viewBox={comparison ? "0 0 264 156" : "0 0 160 112"} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" aria-hidden="true" focusable="false">
        {comparison ? (
          <>
            <rect x="33" y="25" width="67" height="99" rx="9" className="md-suggestion-art__back" transform="rotate(-7 66 74)" />
            <path d="M43 18H80L99 37V113A8 8 0 0 1 91 121H43A8 8 0 0 1 35 113V26A8 8 0 0 1 43 18Z" className="md-suggestion-art__paper" />
            <path d="M80 18V31A6 6 0 0 0 86 37H99" className="md-suggestion-art__outline" />
            <path d="M48 47H68M48 61H85M48 75H77M48 89H85M48 103H68" className="md-suggestion-art__lines" />
            <g className="md-suggestion-art__scan">
              <rect x="41" y="50" width="52" height="16" rx="4" className="md-suggestion-art__tint" />
              <path d="M43 66H91" className="md-suggestion-art__accent" />
            </g>
            <path d="M107 77H147M142 72L147 77L142 82" className="md-suggestion-art__outline" strokeDasharray="2 5" />
            <circle cx="110" cy="77" r="3" className="md-suggestion-art__transfer md-suggestion-art__solid" stroke="none" />
            <rect x="157" y="30" width="78" height="99" rx="10" className="md-suggestion-art__paper" />
            <path d="M157 53H235" className="md-suggestion-art__outline" />
            <rect x="168" y="40" width="7" height="4" rx="2" className="md-suggestion-art__solid" stroke="none" />
            <path d="M181 42H204" className="md-suggestion-art__lines" />
            <path d="M170 65H183M203 65H222M170 84H183M203 84H218M170 107H183M203 107H222" className="md-suggestion-art__lines" />
            <g className="md-suggestion-art__difference">
              <rect x="164" y="75" width="64" height="18" rx="5" className="md-suggestion-art__tint md-suggestion-art__accent" />
              <path d="M171 84H183M202 84H213" className="md-suggestion-art__accent" />
              <circle cx="220" cy="84" r="2" className="md-suggestion-art__solid" stroke="none" />
            </g>
          </>
        ) : (
          <>
            <path d="M40 66L47 51H111L119 66" className="md-suggestion-art__back" />
            <g className="md-suggestion-art__arrival">
              <rect x="53" y="19" width="49" height="60" rx="7" className="md-suggestion-art__back" transform="rotate(-8 78 49)" />
              <rect x="57" y="15" width="49" height="63" rx="7" className="md-suggestion-art__paper" />
              <path d="M68 29H86M68 40H94M68 51H88" className="md-suggestion-art__lines" />
            </g>
            <path d="M40 65H61L67 74H92L98 65H119V84A8 8 0 0 1 111 92H48A8 8 0 0 1 40 84Z" className="md-suggestion-art__paper" />
            <path d="M52 83H67" className="md-suggestion-art__outline" />
            <g className="md-suggestion-art__badge">
              <circle cx="116" cy="36" r="14" className="md-suggestion-art__paper md-suggestion-art__accent" />
              {variant === "history" ? (
                <path d="M116 28V36L121 39" className="md-suggestion-art__accent md-suggestion-art__clock" />
              ) : (
                <path d="M110 36L114 40L122 32" pathLength="1" className="md-suggestion-art__accent md-suggestion-art__check" />
              )}
            </g>
          </>
        )}
      </svg>
    </div>
  )
}
