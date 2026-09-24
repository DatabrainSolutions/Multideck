# Insights: real backend and horizontal containment

## Target and diagnosis

- Local application: `http://localhost:3000/crm/insights`.
- Configured development backend: MultiDeck, `aqtwypsuijxlnvtxpuxe` (verified against local environment and project inventory).
- The reported screenshot was the isolated PostgreSQL fixture on port 3001. Its QA bar and example operator were never part of the normal application.
- Its scrollable wrapper was 30px wider than its client area because TopBar's negative page gutters were outside the padded content. Moving the horizontal padding to the wrapper containing TopBar removes the overflow. The fixture retains its explicit test-data label.
- The real app on port 3000 was stopped. Restarted the normal Vite application; both localhost and 127.0.0.1 return HTTP 200. Opened the real Insights route for review, without the QA toolbar.

## Backend connection

The configured project initially had neither Insights nor saved-briefing RPCs. It contained seven visible existing opportunities. After the complete data-access regression passed, applied these existing feature migrations in dependency order:

1. `20260922140000_crm_deal_sales_workflow.sql`
2. `20260922150000_crm_sales_analysis_cache.sql`
3. `20260922160000_crm_sales_briefings.sql`
4. `20260922161000_crm_sales_insight_series.sql`
5. `20260922170000_crm_sales_narrative_evidence.sql`

Deployed `crm-sales-insights` and its corresponding `agent-dexter` changes to the same project. Configured the private worker endpoint and generated its authentication secret inside Supabase Vault. The existing provider key is configured; no secret was added to the client. The once-a-minute dispatcher reports ready and retains the six-hour company claim limit.

## Checks

- Full `node supabase/tests/run-data-access-regression.mjs`: passed, including real PostgreSQL CRM actions, colleague visibility, foreign/revoked/anonymous denial, saved-result source revocation, bounded worker retries, and Dexter approval/watch lifecycle.
- Insights and deal-workflow client checks: 12 passed.
- Production client build: passed (existing large-chunk advisory).
- Read-only live role probe: authenticated Insights returns seven visible deals and weekly series; saved briefing reads succeed; a foreign pipeline and anonymous Insights/briefing reads are denied. Transaction rolled back.
- Chrome, actual signed-in app: seven existing open deals, six slipping dates, seven missing named actions. Account renewal filter returns two deals; Customer onboarding returns the genuine empty state. Evidence opens and Escape closes it. A next-action row opens its saved deal and Back to insights returns to the page.
- Real app document and main-scroll widths match at 320, 390, 768 and 1280px; desktop 1512px also has no horizontal scroller. At 320px, additionally fixed select min-content sizing and the action-arrow track width so page content matches its 288px available width.
- Corrected fixture wrapper also reports no horizontally scrollable element.

## Data limitations

These are the configured development project's existing records, some already named as demo organisations; no fixture records were copied into it. There are no recorded wins/losses in the selected period. New measured history begins at installation, and the page explicitly avoids inventing earlier stage/date movement. Frontend changes remain local; this is not a claim that a hosted frontend was released.

## Provider and empty-state verification

- The native cron dispatcher ran successfully at 15:42 UTC. Its first provider result was rejected as `invalid_evidence` and not saved.
- Tightened the output schema to constrain chart evidence IDs by section and narrative source IDs to the actual supplied corpus. With fewer than two source deals, the schema permits zero themes only. Existing validation remains in force. Incomplete or malformed provider output is now distinguished from invalid evidence.
- After deploying this change, performed one explicitly scoped initial-deployment retry for the failed, result-less company row, preserving its attempt count. Normal cooldown/retry rules were not changed. The worker completed at 15:47:05 UTC with four validated findings, zero themes, `ready`, and no error. No source feedback exists for themes; an empty result is explained rather than fabricated.
- Provider/core handler checks: 20 passed, including the new constrained-schema regression.
- Insights uses the existing decorative SVG component for chart, activity, calendar, task, search and source-feedback empty states. The gallery links to Insights. Error and loading states remain separate.
- Browser inspection confirmed infinite `md-empty-*` loops in normal motion and zero active illustration animation names with `prefers-reduced-motion: reduce`. Mobile empty-state content and main region both fit their available widths.
