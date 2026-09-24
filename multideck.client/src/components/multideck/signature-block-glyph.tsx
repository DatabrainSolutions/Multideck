import type { ReactNode } from "react";
import type { SignatureBlockKind } from "@/lib/email-signatures";
import { cn } from "@/lib/utils";

export type SignatureGlyphKind =
  | SignatureBlockKind
  | "logo"
  | "photo"
  | "banner"
  | "company"
  | "disclaimer"
  | "tagline"
  | "hours";

const soft = { fill: "var(--sg-accent)", fillOpacity: 0.16 } as const;
const accentStroke = { stroke: "var(--sg-accent)" } as const;

/** Each mark is drawn on the same 24px grid: one soft accent shape, one crisp outline, and a detail that moves on hover. */
const glyphs: Record<SignatureGlyphKind, ReactNode> = {
  identity: (
    <>
      <circle cx="8.5" cy="9" r="2.75" {...soft} fillOpacity={0.28} />
      <path d="M4 17.75c.7-2.45 2.4-3.9 4.5-3.9s3.8 1.45 4.5 3.9" />
      <g className="sg-move">
        <path d="M15.75 8.5h4.5" />
        <path d="M15.75 12h3" opacity=".55" />
        <path d="M15.75 15.5h3.75" opacity=".35" />
      </g>
    </>
  ),
  details: (
    <>
      <circle cx="5.5" cy="7" r="1.35" fill="var(--sg-accent)" stroke="none" />
      <circle cx="5.5" cy="12" r="1.35" fill="var(--sg-accent)" stroke="none" opacity=".7" />
      <circle cx="5.5" cy="17" r="1.35" fill="var(--sg-accent)" stroke="none" opacity=".45" />
      <g className="sg-move">
        <path d="M9.25 7h9.75" />
        <path d="M9.25 12h7" opacity=".6" />
        <path d="M9.25 17h8.5" opacity=".4" />
      </g>
    </>
  ),
  contact: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.75" {...soft} />
      <path className="sg-move" d="m4.75 7.75 7.25 5.25 7.25-5.25" />
    </>
  ),
  company: (
    <>
      <path d="M5.25 20V6.25A1.25 1.25 0 0 1 6.5 5h6.25A1.25 1.25 0 0 1 14 6.25V20" {...soft} />
      <path d="M14 10h3.5a1.25 1.25 0 0 1 1.25 1.25V20" />
      <g className="sg-move" {...accentStroke}>
        <path d="M8.25 8.75h2.75M8.25 12.25h2.75M8.25 15.75h2.75" />
      </g>
      <path d="M3.5 20h17" />
    </>
  ),
  text: (
    <>
      <path d="M5.5 6.25h13M12 6.25V18" />
      <path className="sg-move" d="M9.5 18.25h5" {...accentStroke} strokeWidth="2" />
    </>
  ),
  tagline: (
    <>
      <g className="sg-move" {...accentStroke} strokeWidth="1.75">
        <path d="M6 13.25a2.25 2.25 0 1 1 2.25-2.25c0 2.1-1 3.75-3 4.75" />
        <path d="M13 13.25A2.25 2.25 0 1 1 15.25 11c0 2.1-1 3.75-3 4.75" />
      </g>
      <path d="M5 19.25h14" opacity=".35" />
    </>
  ),
  hours: (
    <>
      <circle cx="12" cy="12" r="8" {...soft} />
      <path className="sg-move sg-spin" d="M12 7.75V12l2.75 1.75" {...accentStroke} strokeWidth="1.75" />
    </>
  ),
  disclaimer: (
    <>
      <path d="M6.75 3.75h7l4.5 4.5v11.5a.75.75 0 0 1-.75.75H6.75a.75.75 0 0 1-.75-.75V4.5a.75.75 0 0 1 .75-.75Z" {...soft} />
      <path d="M13.75 3.75v4.5h4.5" />
      <g className="sg-move" opacity=".6">
        <path d="M9 12.25h6M9 15.25h6M9 18.25h3.5" />
      </g>
    </>
  ),
  logo: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" {...soft} />
      <path className="sg-move" d="m8.25 15.5 3.75-7 3.75 7" {...accentStroke} strokeWidth="1.75" />
    </>
  ),
  photo: (
    <>
      <circle cx="12" cy="12" r="8.5" {...soft} />
      <g className="sg-move">
        <circle cx="12" cy="10" r="2.75" />
        <path d="M7.25 18.1c1-2.1 2.7-3.15 4.75-3.15s3.75 1.05 4.75 3.15" />
      </g>
    </>
  ),
  banner: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.75" {...soft} />
      <circle cx="16.75" cy="9.75" r="1.4" fill="var(--sg-accent)" stroke="none" />
      <path className="sg-move" d="m3.25 17 5.25-5 4 3.25 2.75-2.25 5.5 4" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" {...soft} />
      <circle cx="15" cy="9" r="1.4" fill="var(--sg-accent)" stroke="none" />
      <path className="sg-move" d="m4.75 18 5-5.25 3.75 3.25 2.5-2 3.25 3" />
    </>
  ),
  badges: (
    <>
      <circle cx="12" cy="9.75" r="5.75" {...soft} />
      <path d="M9 14.75 8 20.5l4-2 4 2-1-5.75" />
      <path className="sg-move" d="m9.75 9.75 1.5 1.5 3-3" {...accentStroke} strokeWidth="1.75" />
    </>
  ),
  socials: (
    <>
      <g {...soft} fillOpacity={0.24}>
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="17.75" cy="6.25" r="2.4" />
        <circle cx="17.75" cy="17.75" r="2.4" />
      </g>
      <path className="sg-move" d="m8.2 10.9 7.3-3.55M8.2 13.1l7.3 3.55" {...accentStroke} />
    </>
  ),
  social: (
    <>
      <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.75-2.75a3.5 3.5 0 0 0-5-5l-.9.9" />
      <path className="sg-move" d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-2.75 2.75a3.5 3.5 0 0 0 5 5l.9-.9" {...accentStroke} />
    </>
  ),
  button: (
    <>
      <rect x="2.75" y="6.75" width="18.5" height="8.5" rx="4.25" {...soft} fillOpacity={0.3} />
      <path d="M7.75 11h6" />
      <path className="sg-move" d="m15.25 13.25 5.25 1.9-2.2.9-.9 2.2-2.15-5Z" fill="currentColor" strokeLinejoin="round" />
    </>
  ),
  divider: (
    <>
      <path d="M5 6.5h14M5 17.5h9" opacity=".35" />
      <path className="sg-move" d="M3.5 12h17" {...accentStroke} strokeWidth="1.75" />
    </>
  ),
  spacer: (
    <>
      <path d="M4 4.75h16M4 19.25h16" opacity=".45" />
      <g className="sg-move" {...accentStroke}>
        <path d="M12 8.25v7.5M10 10.25l2-2 2 2M10 13.75l2 2 2-2" />
      </g>
    </>
  ),
  import: (
    <>
      <path d="M4 14.25v4.25A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4.25" {...soft} fillOpacity={0.1} />
      <g className="sg-move" {...accentStroke}>
        <path d="M12 4v10M8.5 10.5 12 14l3.5-3.5" />
      </g>
    </>
  ),
};

export function SignatureBlockGlyph(
  { kind, active = false, tile = true, className }: {
    kind: SignatureGlyphKind;
    active?: boolean;
    /** Draw the rounded tile behind the mark, as the palette does. */
    tile?: boolean;
    className?: string;
  },
) {
  const mark = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("signature-glyph-mark", !tile && className)}
    >
      {glyphs[kind]}
    </svg>
  );
  if (!tile) return mark;
  return (
    <span aria-hidden="true" className={cn("signature-block-glyph", active && "is-lifted", className)}>
      {mark}
    </span>
  );
}
