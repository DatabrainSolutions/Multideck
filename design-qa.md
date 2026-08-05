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

Feature: Quote Overview compact five-stage progress rail

Source visual truth:
- `/var/folders/lb/stflsq1d6llcfy2t4f_q0ny40000gn/T/codex-clipboard-33af50b4-a9d4-46e3-acd2-9e29cec2b311.png`
- Selected source region: progress-bar style 1, labels above state dots and segmented rails.

Implementation evidence:
- Local URL: `http://localhost:3000/quotes/q-19157`, authenticated Overview tab.
- First implementation screenshot: `/tmp/multideck-quote-progress-option-1.png`.
- Revised implementation screenshot: `/tmp/multideck-quote-progress-option-1-v2.png`.
- Normalized focused comparison: `/tmp/multideck-quote-progress-comparison.png`.
- Browser viewport: `1512 x 771` CSS px at device pixel ratio `2`.
- Source pixels: `735 x 841`; selected reference crop `577 x 79`, normalized to `848 x 116`.
- Implementation pixels: `1512 x 771`; selected implementation crop `848 x 100`.
- State: light theme, desktop quote Overview, Review is the current stage.

Full-view comparison evidence:
- The revised screenshot confirms the progress panel remains aligned with the adjacent AI temperature panel and the quote overview grid.
- The progress card measures `840 x 99` CSS px; its five-stage grid uses `816 x 42` CSS px, leaving 12px inline padding and a compact centred vertical rhythm.

Focused region comparison evidence:
- The normalized comparison places reference style 1 above the implementation in one image.
- Both use the same information order: label, state dot, then segmented rail.
- Multideck intentionally keeps five freight stages and semantic stage colours instead of copying the reference's four generic monochrome steps.

Required fidelity surfaces:
- Fonts and typography: existing Multideck system font and medium-weight compact labels retained; labels increased to 11px for clearer scanning.
- Spacing and layout rhythm: rails now use the full available width with 12px panel padding, 12px segment gaps, and a 99px card height.
- Colors and visual tokens: existing semantic stage colours, surface tokens, and focus treatments retained; pending stages remain visually quiet.
- Image quality and asset fidelity: no image assets are required inside this interface component; the supplied image is used only as the layout reference.
- Copy and content: the five freight-specific labels remain Intake, Costing, Review, Sent, and Outcome, with localized tooltip descriptions.

Comparison history:
- Pass 1 finding: the five-stage structure matched the reference, but the 620px maximum width left excessive inline whitespace and the adjacent gauge kept the row taller than necessary.
- Fix: removed the internal width cap, increased label/dot/rail sizing, used a partial rail for the current stage, reduced the gauge height from 58px to 50px, and tightened panel padding.
- Pass 2 evidence: `/tmp/multideck-quote-progress-option-1-v2.png` and `/tmp/multideck-quote-progress-comparison.png` show the rail filling the card with the same label-dot-bar rhythm as reference style 1.

Checks:
- Exactly five stages render in the expected order.
- Review exposes `aria-current="step"`.
- The current marker measures `7 x 7` CSS px and the rail measures `9px` high.
- RTL animation origin remains direction-aware; the symmetric grid and logical padding require no physical left/right overrides.
- Production Vite build passes.
- No browser console errors were observed during the authenticated render check.

Findings:
- No actionable P0/P1/P2 findings remain.
- P3 follow-up: a future data-backed version should derive the current stage and partial completion from the quote record instead of the current static overview fixture.

final result: passed

---

# Design QA

Feature: Dexter inline email composer refinement

Source visual truth:
- `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.29.32.png`
- `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.29.36.png`
- `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.29.42.png`
- `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.29.53.png`
- `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.30.00.png`
- Scroll defect evidence: `/Users/harryphillips/Desktop/Screenshot 2026-08-04 at 00.41.07.png`

Implementation evidence:
- Local URL: `http://127.0.0.1:3000/agent-dexter?conversation=ec34654e-a6f2-4eb7-9c83-ca06f1218602`
- Component preview: `/Users/harryphillips/.codex/visualizations/2026/08/03/019fc9f7-9079-7080-a06e-e52386cad3ef/dexter-email-composer-preview.png`
- Inline bottom-clearance proof: `/Users/harryphillips/.codex/visualizations/2026/08/03/019fc9f7-9079-7080-a06e-e52386cad3ef/dexter-email-composer-inline-bottom.png`
- Half-width desktop proof: `/Users/harryphillips/.codex/visualizations/2026/08/03/019fc9f7-9079-7080-a06e-e52386cad3ef/dexter-email-composer-half-width.png`
- Half-width bottom-clearance proof: `/Users/harryphillips/.codex/visualizations/2026/08/03/019fc9f7-9079-7080-a06e-e52386cad3ef/dexter-email-composer-half-width-bottom.png`
- Reference/implementation comparison: `/Users/harryphillips/.codex/visualizations/2026/08/03/019fc9f7-9079-7080-a06e-e52386cad3ef/dexter-email-composer-comparison.png`
- Browser viewport: `1280x720`, dark theme.

Checks:
- The composer is one calm surface with a compact draft marker and a labelled primary Send action.
- From, To, Cc, Bcc, and Subject use direct-edit rows rather than stacked boxed fields.
- The body reads as a continuous writing surface while retaining a visible keyboard focus treatment.
- Mailbox selection and Cc expansion work in the component preview.
- Existing mailbox permissions, autosave, validation, idempotent send, provider status, open tracking, localisation, RTL-safe motion, and reduced-motion handling remain intact.
- The floating prompt now reserves at least 202px of measured stream clearance even if the first ResizeObserver tick reports zero.
- Browser measurement confirms 226px bottom padding, and the live conversation reaches its exact scroll maximum with the full email footer visible above the prompt.
- Row separators use the quieter `--md-line` token and remain stronger only while a field has focus.
- The inline card is 50% width at desktop breakpoints and returns to full width below desktop so fields remain usable.
- Draft fields edit directly in place; the component preview accepted a live subject change without a modal or secondary edit state.
- Draft autosave now communicates Saving, Saved, and failure states with an interruptible reduced-motion-safe status transition.
- Sent provider records remain immutable. Clicking any composer field now creates a tenant-scoped editable copy in place, with clear copy-state wording.
- Chrome QA on the authenticated conversation confirmed the first click changed the sent card to an editable draft, a subject edit autosaved, and `test — editable copy` remained after refresh.
- Response history retained both versions: version 1 remained visibly Sent with its original subject, while version 2 remained an unsent editable draft. The Send action was not selected during QA.
- The focused duplicate-draft migration was applied to the linked development Supabase project without pushing unrelated pending migrations.
- The focused contract suite passes all 11 checks; the Agent Dexter page also bundles successfully.

Intentional differences from the references:
- Multideck keeps its own accent colour, type scale, mail provider marks, and status language.
- Reference-only AI selection tools, undo/copy controls, and open-in-email actions were not invented because the current inline composer does not provide those capabilities.

Findings:
- No actionable P0/P1/P2 findings remain.
- Existing Dexter watch-loading and keyboard-shortcut warnings were observed in the browser and are unrelated to this composer change.

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
