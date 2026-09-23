# CRM sales themes — local verification, 22 September 2026

The standalone briefing has been removed. Source-backed thematic grouping now feeds distinct-deal outcome bars and a current-stage matrix, with exact excerpts and native deal links in an inline evidence view. Existing measured charts accept short, dated AI annotations relevant to that chart. The automatic worker saves classification; browser reads and current cohort reprojection never invoke it.

## Evidence

- Client production build passed after final layout and annotation changes.
- Standard data-access runner passed 88 checks (78 main and 10 supplemental), including five real PostgreSQL narrative lifecycle/access/watch cases; none skipped.
- Final worker/parser checks passed 19/19 after tightening fingerprint stability and bounding structured output. Deno checked the Edge entrypoint.
- Frontend metric/filter/theme projection checks passed 6/6.
- Chrome journey used production React/API code and a disposable native PostgreSQL database on localhost port 3001. The explicit “Illustrative groups · no model” mode uses the production parser to resolve source IDs and exact excerpts from seeded records. It is test-only and does not demonstrate model quality or provider delivery.
- Verified four theme cohorts, won/lost/open segment counts, current-stage zero cells, exact wording, deal navigation and return with owner filters preserved. Changing owner changed the cohort; the empty partner pipeline showed an empty theme view and an unknown win rate.
- Verified 1440px desktop, 768px tablet and 390px phone. Document width remained equal to the viewport. Phone stage cells reflow into labelled rows.
- Evidence focus moves into the inline region; Tab reaches Close, Escape closes it and restores focus to the chart mark.
- A simulated connection failure retained the last successful charts and recovered through retry. A simulated 42501 response removed measured and generated data, then recovered after access was restored.
- UK/US date formatting checked. Native unavailable mode showed measured charts and a quiet status, with no briefing placeholder or invented themes.
- Browser scenario observed 23 read requests, zero model-generation requests and no JavaScript runtime errors. The two failed-network console entries were the deliberately injected connection failures.

## Review media

Labelled desktop/phone screenshots and short walkthroughs are under `output/playwright/crm-themes-*`. Harry's self-DM review thread is https://databrainworld.slack.com/archives/D06STA7MJTY/p1790084700223119. They show disposable sample data and illustrative semantic assignments, never a live generated result.

## Release boundary

Changes are local. No production migration, Edge deployment, Vault dispatch setup, live customer-data write or provider call was performed. Automatic source-backed classification still needs the intended-tenant deployment and hosted worker/provider verification described in `docs/features/crm-sales-briefings.md`. Private CRM notes, email, calls and personal tasks remain excluded from this capability.
