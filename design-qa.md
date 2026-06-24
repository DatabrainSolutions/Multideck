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
