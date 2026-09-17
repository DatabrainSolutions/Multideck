import { useId } from "react";
import type { SignatureBlockKind } from "@/lib/email-signatures";

/** Small content miniatures: the palette shows what will land in the email. */
export function SignatureBlockGlyph(
  { kind, active = false }: { kind: SignatureBlockKind | "banner" | "disclaimer" | "company"; active?: boolean },
) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 72 48"
      fill="none"
      aria-hidden="true"
      className={`signature-block-glyph h-12 w-[72px] ${
        active ? "is-lifted" : ""
      }`}
    >
      <defs>
        <linearGradient
          id={id}
          x1="8"
          y1="4"
          x2="62"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--md-accent)" stopOpacity=".2" />
          <stop offset="1" stopColor="var(--md-accent)" stopOpacity=".04" />
        </linearGradient>
      </defs>
      <g className="signature-glyph-paper">
        <rect
          x="5.5"
          y="5.5"
          width="61"
          height="37"
          rx="5"
          fill={`url(#${id})`}
          stroke="currentColor"
          strokeOpacity=".12"
        />
        {kind === "identity"
          ? (
            <>
              <circle cx="20" cy="21" r="6" fill="currentColor" opacity=".16" />
              <path
                d="M12 34c1-9 15-9 16 0"
                fill="currentColor"
                opacity=".12"
              />
              <rect
                x="33"
                y="17"
                width="25"
                height="3"
                rx="1.5"
                fill="currentColor"
                opacity=".7"
              />
              <rect
                x="33"
                y="25"
                width="19"
                height="2"
                rx="1"
                fill="currentColor"
                opacity=".3"
              />
              <rect
                x="33"
                y="31"
                width="13"
                height="2"
                rx="1"
                fill="currentColor"
                opacity=".2"
              />
            </>
          )
          : null}
        {kind === "contact"
          ? (
            <>
              <rect
                x="13"
                y="17"
                width="15"
                height="11"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.3"
                opacity=".7"
              />
              <path
                d="m14 18 6.5 5L27 18"
                stroke="currentColor"
                strokeWidth="1.3"
                opacity=".7"
              />
              <path
                d="M35 19h22M35 25h15M13 34h44"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".3"
              />
            </>
          )
          : null}
        {kind === "image" || kind === "banner"
          ? (
            <>
              <rect
                x="13"
                y="12"
                width="46"
                height={kind === "banner" ? 16 : 24}
                rx="3"
                fill="currentColor"
                opacity=".08"
              />
              <circle cx="47" cy="19" r="3" fill="currentColor" opacity=".5" />
              <path
                className="signature-glyph-detail"
                d="m14 34 12-13 12 10 7-6 13 10H14Z"
                fill="var(--md-accent)"
                opacity=".6"
              />
            </>
          )
          : null}
        {kind === "text" || kind === "import" || kind === "disclaimer" || kind === "company"
          ? (
            <>
              <path
                d="M14 15h21"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity=".7"
              />
              <path
                d="M14 23h44M14 29h39M14 35h27"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".28"
              />
              {kind === "import"
                ? (
                  <path
                    d="m53 9 5 5-5 5m-5-10-5 5 5 5"
                    stroke="var(--md-accent)"
                    strokeWidth="1.5"
                  />
                )
                : null}
            </>
          )
          : null}
        {kind === "badges"
          ? (
            <g className="signature-glyph-detail">
              {[21, 36, 51].map((x) => (
                <g key={x}>
                  <path
                    d={`M${x} 14l6 3v8c0 5-6 9-6 9s-6-4-6-9v-8Z`}
                    fill="var(--md-accent)"
                    opacity=".22"
                  />
                  <path
                    d={`m${x - 3} 23 2 2 4-5`}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </g>
          )
          : null}
        {kind === "social"
          ? (
            <g className="signature-glyph-detail">
              {[21, 36, 51].map((x, i) => (
                <g key={x}>
                  <circle
                    cx={x}
                    cy="24"
                    r="6"
                    fill="var(--md-accent)"
                    opacity={.14 + i * .12}
                  />
                  <circle
                    cx={x}
                    cy="24"
                    r="2"
                    fill="currentColor"
                    opacity=".55"
                  />
                </g>
              ))}
            </g>
          )
          : null}
        {kind === "divider"
          ? (
            <>
              <path
                d="M15 15h25M15 34h35"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".15"
              />
              <path
                className="signature-glyph-detail"
                d="M13 24h46"
                stroke="var(--md-accent)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )
          : null}
        {kind === "spacer"
          ? (
            <>
              <path
                d="M14 13h44M14 35h44"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".2"
              />
              <path
                d="M36 18v12m-3-9 3-3 3 3m-6 6 3 3 3-3"
                stroke="var(--md-accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )
          : null}
      </g>
    </svg>
  );
}
