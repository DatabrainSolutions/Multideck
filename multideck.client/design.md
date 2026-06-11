# Multideck Client Design System

This file documents the UI direction for the Multideck client. The current source of truth is the overview mockup at `/Users/harryphillips/Downloads/Overview.html`, translated into reusable React components inside this client folder.

## Product Feeling

Multideck should feel like a calm operating cockpit for freight teams. The interface should be fast to scan, compact without feeling cramped, and quietly premium. It is operational software, not a marketing surface.

The first screen should answer:

- What needs attention now?
- Which shipments are moving?
- Which documents or customs entries need review?
- Where is the freight team working across time zones?
- What can the AI already prepare for the operator?

## Visual Language

The design uses a soft freight operations palette:

- `--md-bg`: soft green shell background.
- `--md-surface`: near-white product panels.
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

## Radius And Depth

Radius tokens are defined in `src/styles.css`:

- `--md-radius-sm`: 4px
- `--md-radius-md`: 6px
- `--md-radius-lg`: 10px
- `--md-radius-xl`: 14px
- `--md-radius-2xl`: 18px

Use nested radius intentionally. If a parent has 10px radius and 4px internal padding, inner elements should usually be 6px.

Use layered shadows instead of flat borders:

```css
--md-shadow-line: inset 0 0 0 1px rgba(255,255,255,0.7), 0 0 0 1px rgba(11,20,19,0.04);
--md-shadow-soft: inset 0 0 0 1px rgba(255,255,255,0.85), 0 1px 2px rgba(11,20,19,0.04);
--md-shadow-lift: inset 0 0 0 1px rgba(255,255,255,0.9), 0 12px 30px rgba(42,52,50,0.08);
```

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
- `TopBar`: user, search, invite, and shipment action.
- `Surface`: base product panel.
- `SectionHeader`: consistent panel heading.
- `StatusPill`: compact status treatment.
- `AIEdgeGlow`: animated Artie working-state edge treatment for AI-active screens or workflow areas.
- `MetricCard`: overview KPI component.
- `CommandInput`: search and jump entry point.
- `SegmentedControl`: generic mutually-exclusive mode switch.
- `FilterChips`: generic filter chip row with clear selected state.
- `TabsRail`: generic tab rail for switching in-record sections.
- `ShipmentRow`: live shipment row.
- `InteractiveShipmentMap`: real map layer for live route tracking, markers, and shipment-card selection.
- `WorldClockCell`: city queue and timezone unit.
- `QueueRow`: customs/document queue row.
- `CustomerAvatar`: customer identity marker for list/detail screens.
- `CustomerSparkline`: compact customer shipment trend.
- `CustomerRow`: dense customer table row.
- `CustomerCard`: customer summary card for alternate view modes.
- `CustomerMetricCard`: account-level customer KPI tile.
- `ActiveShipmentRow`: customer-detail shipment row.
- `ContactRow`: customer contact row with quick actions.
- `LaneMixPanel`: customer lane distribution panel.
- `ComponentsGalleryPage`: interactive gallery for inspecting components.

Component naming rule:

- Gallery entries should describe reusable primitives or patterns, not one-off screen labels. Use `Tabs`, `Filter Chips`, `Segmented Control`, `Data Table`, `Record Header`, and `Side Panels` instead of names like `Customer Tabs`.
- Screen-specific components are allowed only when the content is genuinely domain-specific, such as `CustomerDetailHero`, `ActiveShipmentsPanel`, or `PrimaryContactsPanel`.
- Customer screens should pass customer data into generic primitives rather than creating parallel customer-only controls.

## Page Rules

Overview:

- The sidebar is the primary anchor.
- The top bar is for search and fast action.
- The hero should be short and useful.
- Metrics should be compact, comparable, and not oversized.
- Live shipments should use the real interactive map component, not a decorative route illustration.
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
