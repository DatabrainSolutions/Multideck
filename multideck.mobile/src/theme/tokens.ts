// Native equivalents of the canonical --md-* tokens in multideck.client/src/styles.css.
export const colors = {
  ink: "#0b1413",
  inkSoft: "#2a3432",
  text: "#4f5b58",
  subtle: "#687570",
  hairline: "#ccd4d1",
  background: "#f3f4f4",
  backgroundStrong: "#eef1f0",
  surface: "#ffffff",
  surfaceSoft: "#f7f9f8",
  field: "#e5e9e7",
  accent: "#0a7068",
  accentPressed: "#086f67",
  accentAbyss: "#062420",
  accentLift: "#8dd3ca",
  danger: "#b3261e",
  dangerSurface: "#fbeceb",
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  page: 24,
  section: 32,
} as const

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  xl: 14,
  xxl: 18,
} as const

export const type = {
  family: undefined,
  title: 24,
  heading: 18,
  body: 14,
  label: 13,
  meta: 12,
} as const

export const shadow = {
  surface: {
    elevation: 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
} as const
