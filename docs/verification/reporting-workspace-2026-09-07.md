# Reports workspace verification, 7 September 2026

## Delivered behaviour

The operator Reports section uses one saved library for tables, charts and documents.
Users can choose a starting report, build visually or hand a plain-English description
to Dexter. Saved definitions support selectable fields, date basis, rolling or explicit
periods, all/any filters, sorting, totals/averages/minima/maxima, grouping and previous-period
comparisons. Bar, line and donut displays share the same analysis settings.

Documents combine copied saved analyses, new tables/charts and commentary. Their period
and customer apply to each analysis by default, with explicit per-section overrides.
Changes to a copied analysis stay within the document. Desktop shows settings alongside
the preview; smaller screens have separate settings and preview tabs.

Saving is version-checked and audited. Reports are private by default; workspace sharing
still requires the viewer's source permissions. Shared reports can be copied, while only
the owner can edit/archive/restore the original. Unsaved drafts stay in the current browser
tab, scoped to backend, user and report. Storage failures do not prevent server saves.
Recovered drafts based on an older version remain available for saving as a copy.

Snapshots retain their definition, version, data and timestamp. Exports use that immutable
snapshot, with current source-access checks. CSV is a single analysis; XLSX has a metadata
sheet and a sheet per section; PDF uses the existing Carbone service with Multideck branding.
Text enters Carbone as data, rather than executable template instructions. CSV guards formula
injection; XLSX stores text and numbers with their correct types. PDF includes accessible data
tables after charts and repeats column headers across pages. Wide tables use column bands.

Schedules produce personal snapshots in Run history, with daily/weekly/monthly local times
and timezone handling. They do not send email. Runs recheck account and source permissions.
Archived reports retain snapshots and pause schedules; restoring never resumes a schedule.

Sources currently enabled are jobs, invoiced sales, quotes and CRM opportunities. They use
explicit joins and field allowlists, rather than arbitrary SQL. Invoiced sales are approved,
submitted or posted sales invoices less credit notes, excluding VAT but including duty and
disbursements, in original currency. Monetary totals require one currency. The last two months
means two complete calendar months. The editor states the definition and comparison dates.

## Deployment boundary

The frontend is implemented in the local App checkout and served at `http://localhost:3000`.
No frontend deployment or Git push was performed as part of this work.

All five reporting migrations were applied to the backend selected by that local app:
`aqtwypsuijxlnvtxpuxe` (MultiDeck). The `report-export` function and narrowly scoped reporting
additions to `agent-dexter` were deployed there. The live Dexter deployment retained the
previously deployed supporting files, avoiding unrelated concurrent local changes.

Other customer projects and the separate Cloud and Live products were not changed. This
backend contains existing demonstration organisations and operational test records; these
were read through the real authorised queries, and no mock business rows were added.

## Verification evidence

- Full client TypeScript and Vite production build passed. Existing bundle-size warnings remain.
- The final focused suite passed 23 tests; the Dexter-specific checks passed again after the
  final approval-summary and editor-link changes.
- Disposable PostgreSQL contracts execute the reporting migrations and actual query/save/run/
  schedule/permission functions. They cover tenant and owner denial, missing permissions,
  inactive accounts, historical access revocation, version conflicts, idempotent snapshots,
  currency separation, signed credits, period comparisons, dense preview bounds, document
  filters, schedules, archive/restore and retained snapshots.
- Dexter contracts cover report source/list reads, mandatory approval for `save_report`,
  service-only write execution, owned-report watch creation, matching/non-matching signals,
  pause/resume and cross-user/cross-company denial. Watches are deterministic and do not call an LLM.
- The report action's strict tool schema and readable approval summary have regression checks.
  Reports require approval in both Approve and Full access modes.
- Export contracts cover formula-like CSV text, negative numeric values, reopened XLSX archives,
  typed cells, ordered document sections, chart data, donut totals, zero values, negative-value
  fallback and literal Carbone-like commentary.
- UI contracts check real RPC flows, reporting routes, navigation and contextual primary actions.
- Authenticated Chrome: created and saved `Jobs by customer and status`, selected seven columns,
  loaded 79 workspace jobs, generated a ready snapshot, reopened the library and history.
- Downloaded CSV, XLSX and PDF through the actual app. CSV was parsed: 79 records and the seven
  selected headers. XLSX was reopened as a valid archive. The five-page jobs PDF was rendered
  and visually inspected locally after download.
- Opened `Monthly business review`, generated and downloaded its seven-page PDF. Visual inspection
  confirmed the graph, explanatory text, table headers and job rows rendered correctly.
- Copied the saved sales analysis into a document, overrode its date period, and saved a copy.
  Its monthly sections retained August while the added section showed July–August.
- Entered an invalid two-letter currency: preview showed the specific validation message and
  snapshot generation was disabled. Correcting the currency recovered the preview and save.
- Edited a report name, navigated away, reopened it and confirmed the unsaved draft was restored.
  Restored and saved the original name afterwards.
- Used the actual Describe handoff to Dexter. Read the source catalogue, denied an initial
  proposal without changing report data, reviewed the revised rolling-period proposal and
  approved creation of a private report. Then approved edits to its name and sort order.
  The same record reached version 3, with `last12months` and reference ascending retained.
  Dexter's completion link opened its visual editor, showing the approved settings and 79
  authorised workspace jobs. Generated a snapshot and downloaded its PDF through the final
  deployed export function. The PDF reopened with the report title and all five selected headers.
- Archived that report through its row action, found it in Archived reports, restored it and
  confirmed it reappeared in the active library. Left the library open with the report restored.
- Created a weekly schedule in the UI. For the delivery check only, advanced that schedule's
  next due time; the actual cron worker generated a ready snapshot at 22:19 UTC. Paused the
  schedule in the UI afterwards. No active test schedule was left running.
- Inspected Library, Scheduled, the editor and preview at iPhone 12 Pro dimensions (390 × 844).
  Verified the settings/preview switch and restored the normal desktop viewport afterwards.
- Browser console inspection identified the deliberately invalid preview request, a development
  hot-reload warning after editing an effect's dependencies, and unrelated extension connection
  errors. A full page reload removed the hot-reload warning; the remaining displayed errors
  came from the browser extension, not the report application.

## Explicit limits

Preview returns up to 200 rows/groups. Saved snapshots allow up to 10,000 rows/groups per
analysis and reject larger results with a useful error; they do not silently export a partial
report. Documents allow 24 sections, queries 20 filters and 30 columns, and periods up to ten
years. Run history shows the latest 100 personal runs. PDF bars/lines show up to 40 groups,
with the full data following; large donuts combine the remaining categories as Other groups.

Dexter can read the catalogue and saved definitions, and prepare an approved save. It can watch
owned report version/run changes. Visual layout preview, export, scheduling, archiving and
restoring remain in Reports; metric-threshold watches, email delivery and automatic report
changes are explicitly unsupported. Report sources are extensible, but arbitrary joins,
custom formulas and extra operational datasets are not exposed in this release.
