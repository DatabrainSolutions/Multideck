# Multideck Client Design System

This file documents the UI direction for the Multideck client. The current source of truth is the overview mockup at `/Users/harryphillips/Downloads/Overview.html`, translated into reusable React components inside `multideck.client`.

## Product Feeling

Multideck should feel like a calm operating cockpit for freight teams. The interface should be fast to scan, compact without feeling cramped, and quietly premium. It is operational software, not a marketing surface.

The first screen should answer:

- What needs attention now?
- Which bookings are moving?
- Which documents or customs entries need review?
- Where is the freight team working across time zones?
- What can the AI already prepare for the operator?

## Visual Language

The design uses a soft freight operations palette:

- `--md-bg`: soft green shell background with enough depth for white panels to read clearly.
- `--md-bg-strong`: deeper green for selected states and nested operational surfaces.
- `--md-surface`: white product panels with layered shadow separation.
- `--md-ink`: primary readable text.
- `--md-text`: secondary labels and metadata.
- `--md-subtle`: quiet supporting information.
- `--md-accent`: Multideck teal for primary AI/workflow actions.
- `--md-green`, `--md-amber`, `--md-red`, `--md-blue`: status colors.

All of these live in `src/styles.css` as variables. Components should use the variables, not hardcoded one-off colors.

## Type

Default interface font is SF Pro via system font stack:

```css
--font-sans: "SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Use these sizes by default:

- 11px and 12px for metadata, pills, hints, and dense labels.
- 13px for standard UI text.
- 14px for section headings.
- 18px for page subheads.
- 24px maximum for main page headings.

Keep font weights mostly regular and medium. Avoid heavy typography.

## Spacing Rhythm

Use the shared spacing variables in `src/styles.css` before adding one-off margins or padding.

- `--md-page-pad`: outer page gutters and full-screen workspace headers.
- `--md-page-bottom-pad`: bottom breathing room for normal product pages.
- `--md-page-stack-gap`: standard spacing between page-level modules.
- `--md-page-stack-gap-compact`: dense dashboard spacing where operators need fast scanning.
- `--md-page-section-gap`: larger separation between major sections such as reports, gallery documentation, and document canvases.
- `--md-workspace-pad-y`: vertical padding for document/editor workspaces.
- `--md-gap-xs` through `--md-gap-xl`: internal component spacing.

Use the shared utility classes when composing pages:

- `md-page md-page-stack` for normal list/detail/product pages.
- `md-page md-page-sections` for larger documentation or report surfaces.
- `md-panel-grid` and `md-panel-column` for repeated panel layouts.

Small internal label spacing can stay local when it improves readability, but page-level spacing should come from the shared rhythm.

## Radius And Depth

Radius tokens are defined in `src/styles.css`:

- `--md-radius-sm`: 4px
- `--md-radius-md`: 6px
- `--md-radius-lg`: 10px
- `--md-radius-xl`: 14px
- `--md-radius-2xl`: 18px

Use nested radius intentionally. If a parent has 10px radius and 4px internal padding, inner elements should usually be 6px.

Use layered premium strokes instead of flat borders. Panel shadows should be visible enough to separate white elements from the green shell without making the UI feel heavy:

```css
--md-premium-stroke: inset 0 1px 0 rgba(255,255,255,0.72), inset 0 0 0 1px rgba(255,255,255,0.58), inset 0 -14px 26px rgba(15,23,42,0.035), 0 0 0 1px rgba(15,23,42,0.055), 0 18px 46px rgba(15,23,42,0.08);
--md-premium-stroke-soft: inset 0 1px 0 rgba(255,255,255,0.64), inset 0 0 0 1px rgba(255,255,255,0.48), 0 0 0 1px rgba(15,23,42,0.045), 0 12px 30px rgba(15,23,42,0.065);
--md-shadow-line: var(--md-premium-stroke-soft);
--md-shadow-soft: var(--md-premium-stroke);
--md-shadow-lift: var(--md-premium-stroke);
```

Use `premium-stroke` for panels, popovers, modals, cards, and sheet-like surfaces. Use `premium-stroke-soft` for smaller controls such as buttons, inputs, selects, toggles, badges, and slider handles.

## Component Architecture

Everything product-specific should be built from components.

- `src/components/ui`: local shadcn primitives.
- `src/components/multideck`: Multideck product components.
- `src/pages`: page-level composition only.
- `src/data`: realistic UI data and component-gallery metadata.
- `src/lib`: shared utilities.

Current Multideck components:

- `AppShell`: app layout wrapper.
- `AppSidebar`: left navigation and workspace area.
- `TopBar`: user, search, invite, and booking action.
- `Surface`: base product panel.
- `SectionHeader`: consistent panel heading.
- `StatusPill`: compact status treatment.
- `AIEdgeGlow`: animated Dexter working-state edge treatment for AI-active screens or workflow areas.
- `MetricCard`: overview KPI component.
- `LineChartCard`, `AreaChartCard`, `BarChartCard`, `StackedBarChartCard`, `DonutChartCard`, `FunnelChartCard`, `HeatmapChartCard`, `RadialGoalChartCard`, `ScatterChartCard`, and `MixedChartCard`: reusable report-ready visualization components.
- `ReportVisualizationBlock`: report-builder adapter for chart variants such as single bars, comparison bars, pie charts with or without keys, and variable-step funnels.
- `CommandInput`: search and jump entry point.
- `SegmentedControl`: generic mutually-exclusive mode switch.
- `FilterChips`: generic filter chip row with clear selected state.
- `TabsRail`: generic tab rail for switching in-record sections.
- `BookingRow`: live booking row.
- `InteractiveBookingMap`: real map layer for live route tracking, markers, and booking-card selection.
- `WorldClockCell`: city queue and timezone unit.
- `QueueRow`: customs/document queue row.
- `CustomerAvatar`: customer identity marker for list/detail screens.
- `CustomerSparkline`: compact customer booking trend.
- `CustomerRow`: dense customer table row.
- `CustomerCard`: customer summary card for alternate view modes.
- `CustomerMetricCard`: account-level customer KPI tile.
- `ActiveBookingRow`: customer-detail booking row.
- `ContactRow`: customer contact row with quick actions.
- `LaneMixPanel`: customer lane distribution panel.
- `ComponentsGalleryPage`: interactive gallery for inspecting components.

Component naming rule:

- Gallery entries should describe reusable primitives or patterns, not one-off screen labels. Use `Tabs`, `Filter Chips`, `Segmented Control`, `Data Table`, `Record Header`, and `Side Panels` instead of names like `Customer Tabs`.
- Screen-specific components are allowed only when the content is genuinely domain-specific, such as `CustomerDetailHero`, `ActiveBookingsPanel`, or `PrimaryContactsPanel`.
- Customer screens should pass customer data into generic primitives rather than creating parallel customer-only controls.

## Language And Direction

Multideck must treat language support as a product-system requirement, not a later pass.

- New screens and reusable components should work with the app-wide language system from the start.
- User-facing copy should be localisable rather than trapped inside one-off hardcoded strings.
- Layouts should remain calm and readable when text length changes between languages.
- Arabic and other right-to-left languages must flip reading direction cleanly for navigation, sidebars, tables, forms, rows, and directional controls.
- Inputs that contain emails, URLs, booking IDs, codes, tracking numbers, or phone numbers should stay readable with direction-safe handling.
- Any component added to the gallery should be checked in a non-English language, and in right-to-left mode when it has direction-sensitive layout.

## Page Rules

Overview:

- The sidebar is the primary anchor.
- The top bar is for search and fast action.
- The hero should be short and useful.
- Metrics should be compact, comparable, and not oversized.
- Live bookings should use the real interactive map component, not a decorative route illustration.
- Operational lists should scan vertically.
- AI content should feel assistive and specific.

Customers:

- The customer list is a dense operator table, not a marketing CRM grid.
- Default to list view because operators need comparison across volume, status, and owner.
- Customer rows should navigate to detail, while check controls should only select the row.
- Customer detail should feel like an account cockpit: current work first, then contacts, pulse, account facts, and activity.
- Tabs should change visible content, but the overview tab remains the primary account operating surface.

Component gallery:

- Left column: section links, search, and component list.
- Middle: component title, live preview, code, and usage detail.
- Right: on-page anchors and compact component contract notes.
- Every component should show why it exists, how to use it, and a code snippet.
- Visualization components should show meaningful variants in the preview, not only the default state. Bar charts should show single-series and comparison variants, pie charts should show legend and no-legend states, and funnels should show different step counts.

Report builder:

- Chart widgets should use the shared visualization components rather than custom report-only drawings.
- Report chart blocks should carry their variant choices with the block, so templates can support single bars, comparison bars, pie/donut charts, and custom funnel step counts without duplicating components.

## Interaction Rules

Motion should use:

```css
--md-motion: 220ms cubic-bezier(0.22, 1, 0.36, 1);
```

Use motion for feedback and continuity only. Avoid playful movement.

Controls should be real:

- Tabs switch content.
- Map cards select and highlight the matching live route.
- Map controls pan and zoom the real route layer.
- Copy action writes code snippets to clipboard.
- Sidebar switches between Overview and Components.

## Build Rule

Keep all client UI work inside `multideck.client`. Do not place client components, design docs, or frontend config in the server folder.
