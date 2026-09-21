import { cn } from "@/lib/utils"
import "./empty-state-illustration.css"

export type EmptyStateIllustrationVariant = "search" | "tasks" | "documents" | "contacts" | "cargo" | "chart" | "calendar" | "mail" | "phone" | "route" | "activity"

/** Decorative only: keep the real state, recovery action and explanation in the surrounding UI. */
export function EmptyStateIllustration({ variant, compact = false, className }: {
  variant: EmptyStateIllustrationVariant
  compact?: boolean
  className?: string
}) {
  return (
    <svg viewBox="0 0 176 120" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-empty-illustration={variant} className={cn("md-empty-art", compact && "md-empty-art--compact", className)}>
      {scene(variant)}
    </svg>
  )
}

function scene(variant: EmptyStateIllustrationVariant) {
  switch (variant) {
    case "search": return <>
      <rect x="39" y="21" width="79" height="77" rx="9" className="md-empty-art__back" transform="rotate(-6 78 60)" />
      <rect x="44" y="18" width="79" height="77" rx="9" className="md-empty-art__paper" />
      <path d="M57 34H88M57 47H108M57 60H93M57 73H80" className="md-empty-art__lines" />
      <g className="md-empty-art__search">
        <circle cx="111" cy="70" r="21" className="md-empty-art__glass" />
        <path d="M127 86L142 101" className="md-empty-art__accent" strokeWidth="5" />
        <path d="M101 70H112" className="md-empty-art__accent" />
      </g>
    </>
    case "tasks": return <>
      <rect x="48" y="22" width="80" height="83" rx="10" className="md-empty-art__paper" />
      <rect x="72" y="15" width="32" height="13" rx="5" className="md-empty-art__back" />
      <rect x="61" y="41" width="12" height="12" rx="3" className="md-empty-art__wash" />
      <path d="M63 47L66 50L72 43" pathLength="1" className="md-empty-art__accent md-empty-art__draw" />
      <path d="M84 47H114M84 69H108M84 90H114" className="md-empty-art__lines" />
      <rect x="61" y="63" width="12" height="12" rx="3" className="md-empty-art__outline" />
      <rect x="61" y="84" width="12" height="12" rx="3" className="md-empty-art__outline" />
    </>
    case "documents": return <>
      <rect x="43" y="24" width="66" height="78" rx="8" className="md-empty-art__back" transform="rotate(-9 76 63)" />
      <g className="md-empty-art__float">
        <path d="M65 16H108L126 34V96A8 8 0 0 1 118 104H65A8 8 0 0 1 57 96V24A8 8 0 0 1 65 16Z" className="md-empty-art__paper" />
        <path d="M108 16V28A6 6 0 0 0 114 34H126" className="md-empty-art__outline" />
        <path d="M71 43H91M71 57H112M71 69H112M71 81H98" className="md-empty-art__lines" />
        <rect x="70" y="40" width="24" height="6" rx="3" className="md-empty-art__solid md-empty-art__breathe" stroke="none" />
      </g>
    </>
    case "contacts": return <>
      <rect x="33" y="27" width="96" height="64" rx="10" className="md-empty-art__back" transform="rotate(-7 81 59)" />
      <g className="md-empty-art__float">
        <rect x="43" y="30" width="99" height="66" rx="10" className="md-empty-art__paper" />
        <circle cx="68" cy="54" r="9" className="md-empty-art__wash" />
        <path d="M54 78C54 63 82 63 82 78" className="md-empty-art__accent" />
        <path d="M94 51H128M94 63H119M94 75H125" className="md-empty-art__lines" />
      </g>
    </>
    case "cargo": return <>
      <path d="M35 61L67 45L99 61V94L67 109L35 94Z" className="md-empty-art__paper" />
      <path d="M35 61L67 77L99 61M67 77V109M51 53L83 69" className="md-empty-art__outline" />
      <g className="md-empty-art__float">
        <path d="M87 28L115 15L143 28V60L115 74L87 60Z" className="md-empty-art__paper" />
        <path d="M87 28L115 42L143 28M115 42V74" className="md-empty-art__outline" />
        <path d="M101 22L128 35V47L121 51V38L94 25" className="md-empty-art__wash md-empty-art__accent" />
      </g>
    </>
    case "chart": return <>
      <rect x="40" y="18" width="97" height="86" rx="10" className="md-empty-art__paper" />
      <path d="M54 33H86M54 92H123" className="md-empty-art__lines" />
      <rect x="55" y="68" width="14" height="17" rx="3" className="md-empty-art__back" />
      <rect x="81" y="54" width="14" height="31" rx="3" className="md-empty-art__back" />
      <rect x="107" y="44" width="14" height="41" rx="3" className="md-empty-art__wash md-empty-art__accent md-empty-art__bar" />
    </>
    case "calendar": return <>
      <rect x="40" y="24" width="96" height="78" rx="10" className="md-empty-art__paper" />
      <path d="M40 45H136M62 17V31M114 17V31" className="md-empty-art__outline" />
      <path d="M55 59H64M83 59H92M111 59H120M55 77H64M111 77H120M55 91H64M83 91H92" className="md-empty-art__lines" />
      <rect x="78" y="69" width="20" height="17" rx="5" className="md-empty-art__wash md-empty-art__accent md-empty-art__breathe" />
    </>
    case "mail": return <>
      <path d="M38 53L88 22L138 53V93A9 9 0 0 1 129 102H47A9 9 0 0 1 38 93Z" className="md-empty-art__back" />
      <g className="md-empty-art__float">
        <rect x="54" y="26" width="68" height="59" rx="7" className="md-empty-art__paper" />
        <path d="M67 41H97M67 54H109M67 67H97" className="md-empty-art__lines" />
      </g>
      <path d="M38 54L88 83L138 54V93A9 9 0 0 1 129 102H47A9 9 0 0 1 38 93Z" className="md-empty-art__paper" />
      <path d="M40 98L73 74M136 98L103 74" className="md-empty-art__outline" />
      <path d="M80 90H96" className="md-empty-art__accent" />
    </>
    case "phone": return <>
      <rect x="53" y="15" width="69" height="92" rx="12" className="md-empty-art__paper" />
      <path d="M77 25H98M82 96H93" className="md-empty-art__lines" />
      <path d="M74 43L81 41L87 51L82 56C85 63 90 68 97 71L102 66L112 72L110 79C109 83 102 82 96 79C84 73 73 62 69 51C68 47 70 44 74 43Z" className="md-empty-art__wash md-empty-art__accent" />
      <g className="md-empty-art__breathe md-empty-art__accent"><path d="M100 43C106 44 110 48 111 54M103 35C113 37 119 43 121 53" /></g>
    </>
    case "route": return <>
      <path d="M35 33L69 21L108 32L141 21V90L108 102L69 91L35 102Z" className="md-empty-art__paper" />
      <path d="M69 21V91M108 32V102" className="md-empty-art__outline" />
      <path d="M53 79C55 59 77 81 87 65S117 68 124 49" pathLength="1" strokeDasharray="3 5" className="md-empty-art__accent" />
      <circle cx="53" cy="79" r="4" className="md-empty-art__wash md-empty-art__accent" />
      <g className="md-empty-art__float"><path d="M124 25A12 12 0 0 1 136 37C136 46 124 55 124 55S112 46 112 37A12 12 0 0 1 124 25Z" className="md-empty-art__paper md-empty-art__accent" /><circle cx="124" cy="37" r="4" className="md-empty-art__solid" stroke="none" /></g>
    </>
    case "activity": return <>
      <rect x="43" y="18" width="90" height="87" rx="10" className="md-empty-art__paper" />
      <path d="M63 40V86M78 38H116M78 49H101M78 63H110M78 85H116" className="md-empty-art__lines" />
      <circle cx="63" cy="38" r="5" className="md-empty-art__wash md-empty-art__accent md-empty-art__breathe" />
      <circle cx="63" cy="63" r="4" className="md-empty-art__back" />
      <circle cx="63" cy="85" r="4" className="md-empty-art__back" />
    </>
  }
}
