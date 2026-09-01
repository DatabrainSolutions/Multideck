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

- `--md-bg`: subtle neutral-grey shell background with enough depth for white panels to read clearly.
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

Use layered premium strokes instead of flat borders. The app-wide stroke recipe is intentionally simple: a soft inner light edge plus an outer shadow edge, with the dark-mode outer edge strengthened for charcoal surfaces. Elevation can be added after the stroke, but the stroke itself should stay consistent:

```css
--md-premium-stroke: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 0 1px rgba(0,0,0,0.04);
--md-premium-stroke-soft: var(--md-premium-stroke);
--md-shadow-line: var(--md-premium-stroke);
--md-shadow-soft: var(--md-premium-stroke), 0 12px 28px rgba(42,52,50,0.08);
--md-shadow-lift: var(--md-premium-stroke), 0 18px 38px rgba(42,52,50,0.14);
```

Use `premium-stroke` for panels, popovers, modals, cards, and sheet-like surfaces. Use `premium-stroke-soft` for smaller controls such as buttons, inputs, selects, toggles, badges, and slider handles. Use `--md-stroke-top`, `--md-stroke-right`, `--md-stroke-bottom`, and `--md-stroke-left` when a header, footer, or docked panel needs one directional edge instead of a full outline.

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
- `DocumentExtractionProgress`: the waiting state for staged document work. The operator's own page sits under a reading sweep, the bar keeps moving through a slow stage without claiming to be finished, and the stage list ticks off what is already done.
- `DocumentEvidenceViewer`: a document beside the data taken from it, with a page-fraction box over the place each value was read. Interpolated boxes, such as one row of a transcribed table, are drawn with a dashed edge.
- `KpiStrip`: the shared metric row for every dashboard. Label, figure, and supporting line are required; `change`, `series`, `icon` and `delta` are optional, so a surface with no comparable previous period leaves the movement off rather than inventing one. `columns` switches between the four-up operations row and the six-up CRM row. `spark={false}` drops the per-cell sparkline for a surface that already draws the same series full size, and `markerId` turns the selection rule into one element that travels between cards.
- `DashboardPriorityQueue`: the operations dashboard's lead panel. Work from every register in one list, ranked by real deadline and grouped by time remaining. Each row carries the reference, the ask, the customer and lane, and says which kind of deadline it is measured against, so a departure date is never mistaken for an appointment.
- `DashboardPerformancePanel`: one large trend plot with a head that names the metric drawn. Pair with a `KpiStrip` that supplies the selection.
- `DashboardCoveragePanel`: team coverage as a shape. One shared 24-hour track, a band per region in the viewer's local time, one "now" line. A row carries a count only when work is waiting on a human, and selecting a row opens that region's queue.
- Report-builder chart cards are for wide report surfaces, not dashboard side columns. `VisualizationShell` collapses its header to one word per line once the column narrows. A dashboard chart should be built from the shared projection helpers in `lib/area-chart` so it is a sibling of the trend plot — same grid, same axis type, same theming.
- Mode is shown over time, not as a single split. One series per transport mode on a shared axis answers *when* each mode is booked, which is the capacity question; a ring of today's totals only answers which is biggest.
- `DashboardModeChart`: several series on one time axis in the dashboard's chart idiom. One shared scale across every series, so two modes of different volume cannot both fill the panel and look identical.
- `DashboardBreakdownPanel`: a split of a total as bars. `segmented` puts the whole quantity on one bar for parts of a single total; `ranked` gives each category its own bar, scaled against the largest rather than the total so a long tail still has visible length.
- `MiniBarChart`: a period as discrete ticks rather than a curve. Use it on cards that sit above a full-size plot — a second smooth line reads as the same drawing twice, where a tick strip reads as the shape and leaves the detail to the chart.
- `CrmOpportunityValue`, `CrmFollowUpQueue`, `CrmQuietLeads`, `CrmAreaHeatmap`, `CrmActivityFeed`: the CRM dashboard panels. One panel shell, one row shape, and one arrival cadence shared with the operations overview.
- `LineChartCard`, `AreaChartCard`, `BarChartCard`, `StackedBarChartCard`, `DonutChartCard`, `FunnelChartCard`, `HeatmapChartCard`, `RadialGoalChartCard`, `ScatterChartCard`, and `MixedChartCard`: reusable report-ready visualization components.
- `ReportVisualizationBlock`: report-builder adapter for chart variants such as single bars, comparison bars, pie charts with or without keys, and variable-step funnels.
- `CommandInput`: search and jump entry point. Shows the live `search.focus` binding and claims it while it is on screen.
- `ShortcutKeys` / `ShortcutHint`: a saved keyboard binding drawn as keycaps in the operator's own platform glyphs. Sequences read as two groups joined by "then".
- `KeyboardShortcutsPanel`: the editable shortcut list — grouped rows, inline recorder, conflict warnings, per-row reset. Used by the Keyboard shortcuts settings section and by the ⌘/ overlay.
- `AppShortcuts`: the one place every shell-level shortcut is bound, so the settings list and the real behaviour cannot drift apart. Also draws the sequence hint while a two-key run is half typed.
- `DexterSummon` / `DexterSummonPrompt`: the summon gesture. Hold the platform modifier and double-click anything, or press ⌘D / Ctrl+D, and Dexter traces that element with a shader ring and opens a stripped prompt box against it, carrying that element's context. With nothing named, the screen dims lightly and the same ring becomes an area picker.
- `DriveFolderTile` / `DriveFileTile`: the two tiles Drive is built from. A folder carries the operator's colour and icon, with two thin sheets behind its top edge so it reads as something that holds files. A file is its own picture: the ~1 KB preview seed on the row paints on the first frame and the stored thumbnail cross-fades over it, so a folder never opens as a grid of empty boxes.
- `ContextMenu`: the right-click menu. Shares the dropdown's surface, rows, and motion, so a menu opened by pointer reads the same as one opened from a trigger.
- `ImageLightbox`: the one attachment-image viewer used by Dexter, Inbox, email composition, support and later image surfaces. A square thumbnail is the transition anchor; the full image opens over a dimmed stage, related images move with Left and Right Arrow keys, and close returns to the image currently in view. Reduced motion keeps the overlay and navigation but removes spatial travel.
- `Iphone`: the proportional device frame used for live mobile previews. Its exported content-safe line keeps real interface content below the notch while backgrounds and decorative headers can continue beneath the hardware.
- `DotGridLoader`: the product's one waiting state — twenty-five cells lit as a travelling square spiral. Every wait uses it, from a route still downloading to a register still fetching rows, so a wait always looks like the same object rather than a different feature loading. It animates only opacity and transform and reserves its own box, so it can sit inside the space the loaded content will occupy without moving anything around it.
- `RegisterToolbar` (`RegisterViewSwitch`, `RegisterFacetSelect`, `RegisterSearchField`, `RegisterRefreshButton`, `RegisterToolbarActions`): the controls that live inside a `DataTable` toolbar. The view switch and the create action lead; the filters and the search trail. Two levels, deliberately — the switch changes what is fetched, the filters narrow what came back — so they cannot contradict each other.
- `SegmentedControl`: spring-animated mutually-exclusive mode switch for two to four short choices.
- `ChoiceControl`: adaptive exclusive-choice control. Use a switch for a boolean, the segmented pill for two to four choices, and a dropdown for five or more.
- `Checkbox`: independent multi-select control for rows, permissions, overrides, and checklist choices.
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

## English Product Copy

Multideck product-authored copy is English only.

- Use British English by default, with the supported American English variant where regional spelling or formatting differs.
- Do not add non-English interface translations or language choices.
- Keep layouts calm and readable when English copy changes length.
- Preserve user-entered names, addresses, messages, documents, and identifiers in their original form.
- Any component added to the gallery should be checked in both supported English variants when regional formatting or spelling is relevant.

## Page Rules

Overview:

- The sidebar is the primary anchor.
- The top bar is for search and fast action.
- The hero should be short and useful.
- The screen opens on the work, not on decoration. `DashboardPriorityQueue` leads: booking exceptions and quote actions in one list ranked by the deadline that actually applies to each, grouped into overdue, the next two hours, later today, and this week. The screen must not run three lists over the same records — an earlier build showed every booking as "your jobs", the exception subset as "today's actions", and every booking again as "live bookings", so one delay was read three times before it was worked once.
- One urgency device per row. The leading rule on a queue row carries priority; rows do not also get countdown rings, and panels do not get gauges to restate a count that is already printed.
- Metrics are four comparable cards with room to read: the figure leads, the movement sits beside it as a tinted directional chip drawn from the metric's own series, and the supporting line says what the figure is made of and what the movement is measured against. A card with no earlier reading shows no arrow.
- One chart, large. `DashboardPerformancePanel` draws whichever metric is selected above, and the KPI strip is its control — pass `spark={false}` and a `markerId` so a single rule travels to the selected card. Never draw one series twice, once as a sparkline in a tile and again full size below it.
- Live bookings should use the real interactive map component, not a decorative route illustration.
- Operational lists should scan vertically.
- Every band is a row of two. No single object owns the full width on its own. The queue pairs with coverage; below the metric row the page splits into a reading column (the trend chart with the live board directly under it, because the table is what the chart is about) and a reference column (mode over time, tracking status, quote pipeline stacked). Below 1000px the columns stack in the same reading order.
- Deadline, status and ETA are columns, not content. Sizing them to their text makes every row a different shape and leaves the right-hand side of a panel ragged, so nothing can be scanned down. Give them fixed widths and drop the least important one at narrow breakpoints instead.
- Panels take their own height. Only the working row stretches, because the queue and coverage are both lists and matching them reads as one shelf. Stretching a short panel to match a tall neighbour is what put a band of empty surface under the side cards; where a column genuinely needs to fill, stack two panels in it rather than growing one.
- No rings or funnels in a side column. Both hold a fixed aspect ratio, so beside a tall table they stretch and leave dead space under the drawing. Use `DashboardBreakdownPanel` — bars have no aspect to hold, and comparing lengths on a shared baseline beats comparing arc angles.
- Coverage is `DashboardCoveragePanel`: every region's 08:00–17:00 window drawn on one shared 24-hour track in the viewer's own time, with a single "now" line across all of them. It answers overlap — how long until Shanghai closes, who is awake to pick this up — which is the question a freight desk actually has. It must not become a row of clock faces again, and it must not animate per city.
- The page keeps one live indicator, on live bookings. Continuous ambient motion anywhere else is decoration.
- AI content should feel assistive and specific.

CRM dashboard:

- Lead with the graph. Open opportunity value is a segmented arc, and leads by area is a treemap heat map — not two more tables.
- The arc is a value breakdown, not progress towards a target. The CRM snapshot carries no quota, so nothing on this screen may imply one.
- Panels on this screen use a hairline stroke and no elevation shadow. It is one dense plane of numbers; eight floating cards read as clutter rather than depth.
- Every panel is the same shell and every list uses the same row, so a queue entry, a quiet lead and a logged activity scan at one rhythm.
- Filtering the follow-up queue must not resize the panel around it. Reserve the unfiltered height.

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

Drive:

- Drive is the company's own file workspace, not a summary screen. The panel is the folders and files and nothing else — no storage dashboard, no activity sidebar, no owner column.
- Folders come before files, each in its own auto-filling grid, so the two tile heights never fight over a shared row.
- Folder colour is one of the ten accent presets rather than a free colour picker, so a folder can only land on a tone already checked for contrast in both themes. Both members of the pair go onto the element and CSS picks one, so switching theme cannot flash the wrong colour.
- Every thumbnail paints in two passes over one box, and the low-resolution pass is never removed. There is no state in which a tile has nothing in it, so there is nothing that can flicker.
- A file still uploading holds the exact box its finished tile will occupy, keyed the same, so the grid does not move when the upload lands.
- Renaming happens in place, in the tile, with the field inheriting the label's own box.
- Folder navigation is real history: opening a folder pushes a URL, and browser back walks out of it.

Warehouse:

- The header band is the shared `KpiStrip` at compact density and seven across: half the height of a dashboard tile, label and figure on one line, and the supporting sentence carried for assistive technology rather than printed. Every figure answers a different question — the row must never spend two tiles restating one number.
- Screens that give their header row to the work show the first three figures as chips beside the page actions instead, and a chip with a route is a shortcut to the screen that answers it.
- A warehouse order is a record with its own address (`/warehouse/orders/<number>`), not a dialog. An operator receiving a delivery is reading a docket, counting pallets and typing quantities at once; that needs the whole window, a link a supervisor can be sent, and a back button to the register it came from. The register to return to is carried in `?from=`, so it survives a reload.
- Its layout leads with the progress rail: the fill is the quantity actually posted and the nodes are the milestones that quantity has crossed, so a part-received order reads as part-received rather than as a status word. Every order line is on screen at once — paging through them hides how much of the delivery is still untouched.
- Stock, objects and exceptions are short records, so they open a right-hand `SideDrawer` rather than a page or a centred dialog. The register stays visible behind the panel, and the commit button sticks to the bottom of the scroll area so a long form never hides it.
- The action a panel is posting is chosen with a segmented control, not chips: one indicator travelling between segments reads as one control changing its mind.

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

Canonical register behaviour:

- Primary registers use `DataTable` for search, sorting, column visibility, resizing, pinning, ordering, and saved layouts.
- Search, filters and the warehouse or scope dropdown belong in the table's own toolbar, not in a filter bar stacked above it. A register should not spend a third of the screen before its first row.
- The toolbar wraps by group, never by control: the leading group keeps the view switch and the create action, and the trailing group drops to its own line as one block once the row runs out of room.
- Facet options come from the rows in hand, so a menu can never offer a value that returns nothing. A trigger takes the accent colour while its filter is on.
- Typing narrows what is already loaded on the same frame; the server is asked once the operator stops. Only the newest response is allowed to write, so a slow earlier request cannot replace newer rows.
- Revalidation never blanks a table. Rows stay on screen and the toolbar shows the small dot-grid mark; the full loader only appears when there is nothing to show yet.
- Quotes, Warehouse inventory and Warehouse orders are the reference implementations for this shared register behaviour.

Dropdowns should feel anchored, compact, and unambiguous:

- Field menus anchor to the trigger edge rather than aligning the selected option with the trigger. They open below the field by default and may flip above when viewport space requires it.
- Keep 4px menu padding, 32px minimum option rows, and a small gap between rows so dense forms remain easy to scan.
- Hover uses the neutral interaction surface; selected options keep the selected surface, stronger text, and a check indicator.
- Menus enter in 220ms with a subtle fade, blur, and scale. Options follow top-to-bottom with a short stagger. Reduced-motion mode removes these transitions.
- Use logical inline spacing and start alignment so components remain structurally consistent.

## Build Rule

Keep all client UI work inside `multideck.client`. Do not place client components, design docs, or frontend config in the server folder.
