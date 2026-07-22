# Design QA

Feature: Warehouse Calendar weekly hourly planner

Source visual truth:
- `/var/folders/lb/stflsq1d6llcfy2t4f_q0ny40000gn/T/TemporaryItems/NSIRD_screencaptureui_bjJQeZ/Screenshot 2026-06-24 at 10.39.07 AM.png`

Implementation evidence:
- Local URL: `http://localhost:3100/warehouse`
- Week screenshot: `/tmp/multideck-warehouse-calendar-week-hourly.png`
- Month screenshot: `/tmp/multideck-warehouse-calendar-month.png`
- Event detail popover screenshot: `/tmp/multideck-warehouse-calendar-popover.png`
- Full-view comparison: `/tmp/multideck-calendar-reference-vs-week.png`
- Viewport: `1440x1100`
- State: Warehouse page, Calendar tab, Week default; Month toggle also checked.

Checks:
- Week is the default selected view.
- Week view now uses a day-by-day hourly grid with a left time rail and day headers.
- The grid exposes hour labels from 8 AM through 9 PM, matching the evening planning coverage in the reference.
- Timed events are positioned by start and end time rather than displayed as generic day cards.
- Wednesday overlap support is working: Aisle B cycle count, Marlow urgent relabel, and Bauhaus lamp QA overlap vertically and split into separate columns.
- Customer colour coding is visible on event blocks and the customer key.
- Calendar events are clickable and open a focused detail popover with customer, date, time, type, and reference.
- Month view remains available from the same segmented toggle and keeps a compact overview of the month.
- Typography, spacing, corners, and shadows stay inside the existing Multideck light design system instead of copying the screenshot's dark theme.
- New visible labels are covered by the app language dictionary.
- No new reusable gallery component was added because this is a product surface composition using existing controls.

Patches made after QA:
- Extended the week grid from 6 PM to 9 PM.
- Tightened customer colours so Marlow and Mediterranean are easier to distinguish.
- Reduced overlap-card chrome for cramped event columns.
- Added click-to-inspect event detail popovers for narrow or overlapping calendar blocks.
- Strengthened the event detail popover surface so it reads as an inspection panel over the calendar grid.
- Polished German and French translations for the new calendar labels.

Focused region comparison:
- Focused comparison was not needed beyond the full-view reference/implementation pair because the key fidelity requirement is structural: hourly grid, day columns, timed cards, overlap behaviour, and customer colour key. The browser test directly verifies those interaction and layout states.

Findings:
- No actionable P0/P1/P2 findings remain.
- P3 follow-up: if operators regularly handle dense multi-way overlaps, the next upgrade would be keyboard shortcuts for moving between events inside the week grid.

final result: passed

---

# Design QA

Feature: Quote Details compact field layout and sidebar preference persistence

Source visual truth:
- `/var/folders/lb/stflsq1d6llcfy2t4f_q0ny40000gn/T/codex-clipboard-b15ffb98-619b-4ab9-9853-182458c1d253.png`

Implementation evidence:
- Local URL: `http://127.0.0.1:3000/quotes`, Details tab.
- Implementation screenshot: `/tmp/multideck-quotes-details-fixed.png`.
- Normalized side-by-side comparison: `/tmp/multideck-quotes-reference-vs-fixed.png`.
- Browser viewport: `1800x1165` at device pixel ratio `1.1`; the reference browser chrome was cropped before comparison.

Checks:
- Fonts and typography retain the existing Multideck system treatment, compact 11px field labels, and restrained medium weights from the reference.
- Spacing and layout now match the reference structure: labels sit beside their controls, party cards use dense horizontal rows, and Service and Goods fit cleanly above the fold.
- All 18 rendered lookup controls were measured in the browser; every input and lookup button shares the same top position and height. No lookup button falls below its field.
- Non-compact field grids now have a stable 76px label track fallback, so their three-column label/input/action structure cannot collapse when a page-level custom property is absent.
- The newer neutral field contrast tokens remain intact and are applied consistently across text, select, and lookup controls.
- No image assets were introduced or changed. Existing Nucleo/Lucide-style interface icons remain aligned and legible.
- Copy and visible labels are unchanged, so the existing localisation coverage is preserved. Logical text alignment keeps the layout direction-safe for RTL.
- Expanded sidebar state remained open at 220px after navigating Home -> Sales & CRM -> Quotes.
- User-selected collapsed state remained at 56px after navigating Quotes -> Home. The sidebar was returned to its expanded state for handoff.
- The production build passes. The only browser error observed was the existing Dashboard API connection check on Overview, unrelated to these UI changes.

Patches made after QA:
- Removed the party-card stacked field mode that caused labels and controls to split vertically.
- Added a resilient label-column fallback to the shared CargoWise field primitives.
- Removed route-driven sidebar collapsing from the app shell, leaving collapse state controlled by the user and persisted locally.

Focused region comparison:
- The side-by-side comparison focuses on Job data, party cards, Service & carrier, and Goods. This is the relevant fidelity region because the request concerns dense form alignment rather than the surrounding browser or page chrome.

Findings:
- No actionable P0/P1/P2 findings remain.
- P3 follow-up: long live customer or carrier names will continue to truncate inside the compact fields, consistent with the source layout.

final result: passed
