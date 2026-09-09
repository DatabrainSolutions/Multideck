# Multideck performance results — 3 September 2026

Implemented in the existing local checkout and validated against the development Supabase project. The candidate production build is available at `http://localhost:3000`. No production rollout or Git push was performed.

Customer autofill is **50.4% faster**, supplier autofill **43.2% faster**, and the CRM company directory loads **50.0% faster** in the primary browser sample. A settled quote edit now makes **two API calls instead of four**, with **72–85% fewer API bytes**, depending on the action. The 650 ms autosave delay, autofill animation, shaders and styling are preserved. Saved confirmation for an ordinary text edit is effectively unchanged: **1,087.8 → 1,077.8 ms**.

These are measured results, not a claim that every workflow is twice as fast. Inbox and public booking timings are essentially unchanged. The primary sample includes slower Admin and quote-detail cold loads; their investigation is below.

[Download the complete CSV](2026-09-03-benchmarks.csv) · [Detailed metric JSON](2026-09-03-benchmark-summary.json) · [Sanitised browser evidence](/Users/harryphillips/.codex/visualizations/2026/09/02/01a06409-638d-7ff0-9ec4-430d786c251a/performance/browser-evidence.jsonl.gz)

## Browser timings

Two warmups followed by 20 measured repetitions per scenario and build: **800 primary measured runs**, plus 80 diagnostic runs. Median is the average of the middle two observations; p95 is the nearest-rank 19th observation out of 20. Lower is better. Cold loads include all content in the readiness condition; warm actions begin at the actual input/click event.

| Page / feature | Scenario | Before median / p95 | After median / p95 | Median change |
|---|---|---:|---:|---:|
| Quotes | Customer autofill | 44.9 / 48.4 ms | 22.2 / 23.0 ms | 50.4% faster |
| Quotes | Supplier autofill | 36.2 / 39.6 ms | 20.6 / 24.6 ms | 43.2% faster |
| Quotes | Edit through Saved confirmation | 1087.8 / 1349.3 ms | 1077.8 / 1279.7 ms | 0.9% faster |
| Home / shell | Cold load | 911.5 / 1034.6 ms | 838.5 / 1041.8 ms | 8.0% faster |
| Bookings | Register cold load | 1074.2 / 1186.5 ms | 1013.0 / 1363.0 ms | 5.7% faster |
| CRM | Company directory cold load | 3302.9 / 3603.2 ms | 1651.7 / 2567.8 ms | 50.0% faster |
| Inbox | Mailbox list cold load | 2029.0 / 2778.7 ms | 2009.3 / 2557.1 ms | 1.0% faster |
| Calendar | Week view cold load | 1835.2 / 3091.7 ms | 1619.3 / 2285.4 ms | 11.8% faster |
| Calendar | Open meeting composer | 784.0 / 893.6 ms | 571.0 / 914.2 ms | 27.2% faster |
| Warehouse | Inventory cold load | 2058.7 / 2309.8 ms | 1970.7 / 3175.9 ms | 4.3% faster |
| Documents | Cold load including previews | 2935.5 / 5093.0 ms | 2465.2 / 3882.3 ms | 16.0% faster |
| Customs | Export register cold load | 1140.1 / 1501.3 ms | 976.1 / 1224.5 ms | 14.4% faster |
| Rates | Empty library cold load | 1519.3 / 1731.8 ms | 1260.0 / 1596.5 ms | 17.1% faster |
| Finance | Currencies and FX cold load | 2428.6 / 2840.1 ms | 2123.2 / 3230.9 ms | 12.6% faster |
| Dexter | Home and watch summary cold load | 2310.1 / 3187.1 ms | 2173.8 / 3286.8 ms | 5.9% faster |
| Admin | Activity cold load | 1486.2 / 2219.8 ms | 1553.8 / 2637.0 ms | 4.6% slower |
| Settings | Profile including images cold load | 1047.0 / 1436.6 ms | 935.2 / 1049.2 ms | 10.7% faster |
| Public booking | Brand and availability cold load | 1480.2 / 2462.0 ms | 1425.6 / 1980.0 ms | 3.7% faster |
| Quotes | Register cold load | 1086.2 / 2267.0 ms | 873.6 / 1204.3 ms | 19.6% faster |
| Quotes | Details and directory cold load | 1591.0 / 1784.4 ms | 1730.8 / 2779.7 ms | 8.8% slower |

Customer selection reached **Saved** in 1,129.3 → 1,121.4 ms (p95 1,278.6 → 1,186.7 ms). Supplier selection reached **Saved** in 1,161.9 → 1,058.8 ms (p95 1,416.1 → 1,292.7 ms). The table separates the instant field population from persisted confirmation; it does not count the unchanged 650 ms debounce as a rendering delay. The text edit itself populated in 20.6 → 16.3 ms.

## Network traffic

Values below are medians, before → after. API counts include necessary shell reads; identical method + full URL + request body within a sample count as duplicates. Bytes are observed CDP `encodedDataLength`, not JSON string-size estimates. Asset bytes include HTML, JavaScript, CSS, images and document previews. The CSV contains p95 values as well.

| Page / feature | Scenario | API calls | Duplicates | API bytes | Asset bytes |
|---|---|---:|---:|---:|---:|
| Quotes | Customer autofill | 4 → 2 | 0 → 0 | 12,836 → 3,605 | 0 → 0 |
| Quotes | Supplier autofill | 4 → 2 | 0 → 0 | 18,474 → 3,606 | 0 → 0 |
| Quotes | Edit through Saved confirmation | 4 → 2 | 0 → 0 | 24,240 → 3,605 | 0 → 0 |
| Home / shell | Cold load | 10 → 9 | 1 → 0 | 30,472 → 29,106 | 1,791,569 → 1,686,352 |
| Bookings | Register cold load | 7 → 6 | 1 → 0 | 11,996 → 10,552 | 1,775,773 → 1,670,551 |
| CRM | Company directory cold load | 12 → 11 | 1 → 0 | 20,838 → 19,392 | 1,731,982 → 1,626,800 |
| Inbox | Mailbox list cold load | 11 → 10 | 2 → 1 | 33,834 → 32,404 | 1,640,891 → 1,638,380 |
| Calendar | Week view cold load | 8 → 6 | 1 → 0 | 24,755 → 13,760 | 1,556,021 → 1,550,524 |
| Calendar | Open meeting composer | 1 → 1 | 0 → 0 | 5,077 → 1,280 | 0 → 0 |
| Warehouse | Inventory cold load | 9 → 8 | 1 → 0 | 18,678 → 17,234 | 1,804,432 → 1,699,256 |
| Documents | Cold load including previews | 11 → 10 | 1 → 0 | 82,701 → 81,259 | 4,099,956 → 4,094,277 |
| Customs | Export register cold load | 8 → 7 | 1 → 0 | 12,876 → 11,428 | 2,121,640 → 2,016,468 |
| Rates | Empty library cold load | 7 → 6 | 1 → 0 | 11,518 → 10,068 | 1,574,554 → 1,568,980 |
| Finance | Currencies and FX cold load | 8 → 7 | 1 → 0 | 35,658 → 34,209 | 1,761,648 → 1,657,355 |
| Dexter | Home and watch summary cold load | 16 → 15 | 1 → 0 | 32,552 → 31,103 | 2,229,568 → 2,124,402 |
| Admin | Activity cold load | 7 → 6 | 1 → 0 | 13,309 → 11,867 | 1,574,054 → 1,569,720 |
| Settings | Profile including images cold load | 9 → 8 | 1 → 0 | 13,072 → 11,626 | 2,284,725 → 1,958,738 |
| Public booking | Brand and availability cold load | 7 → 5 | 1 → 0 | 12,448 → 10,170 | 1,236,281 → 1,230,721 |
| Quotes | Register cold load | 7 → 6 | 1 → 0 | 12,374 → 10,935 | 1,570,034 → 1,567,956 |
| Quotes | Details and directory cold load | 12 → 11 | 2 → 0 | 68,908 → 62,412 | 3,015,165 → 2,916,260 |

The quote action sequence changed from save → full workspace → intelligence → readiness to **save → intelligence**. The save response supplies committed readiness, version and audit summaries. Valid realtime intelligence rows are consumed directly. The remaining Inbox duplicate is a repeated `/auth/v1/user` read, not a second mailbox download; authentication validation was retained.

### Separate background and browser work

Background here means notification reads and presence heartbeats. Foreground API counts/bytes, background API counts/bytes, preflight bytes, total observed bytes, long-task counts and durations are separate columns in the CSV. Long tasks are browser main-thread tasks over 50 ms. Frame intervals are supporting observations, not a visual-quality score.

| Page / feature | Scenario | Preflight calls | Background API calls | Long-task ms, median | Frame interval p95, median |
|---|---|---:|---:|---:|---:|
| Quotes | Customer autofill | 1.0 → 0.5 | 0.0 → 0.0 | 0.0 → 0.0 | 17.6 → 18.2 |
| Quotes | Supplier autofill | 1.0 → 1.0 | 0.0 → 0.0 | 0.0 → 0.0 | 17.6 → 18.1 |
| Quotes | Edit through Saved confirmation | 0.5 → 0.5 | 0.0 → 0.0 | 0.0 → 0.0 | 18.1 → 18.2 |
| Home / shell | Cold load | 11.0 → 1.5 | 2.0 → 2.0 | 0.0 → 0.0 | 18.5 → 17.7 |
| Bookings | Register cold load | 8.0 → 1.5 | 2.0 → 2.0 | 0.0 → 0.0 | 18.5 → 18.2 |
| CRM | Company directory cold load | 13.0 → 2.5 | 2.0 → 2.0 | 0.0 → 0.0 | 18.2 → 18.2 |
| Inbox | Mailbox list cold load | 12.0 → 4.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.6 → 18.1 |
| Calendar | Week view cold load | 9.0 → 2.0 | 2.0 → 2.0 | 63.0 → 0.0 | 18.2 → 18.2 |
| Calendar | Open meeting composer | 1.0 → 1.0 | 0.0 → 0.0 | 0.0 → 0.0 | 18.6 → 18.4 |
| Warehouse | Inventory cold load | 10.0 → 5.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.2 → 18.6 |
| Documents | Cold load including previews | 12.0 → 6.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.1 → 18.3 |
| Customs | Export register cold load | 10.0 → 1.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.6 → 18.3 |
| Rates | Empty library cold load | 8.0 → 2.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.4 → 18.4 |
| Finance | Currencies and FX cold load | 9.0 → 3.0 | 2.0 → 2.0 | 75.0 → 73.0 | 18.1 → 18.4 |
| Dexter | Home and watch summary cold load | 17.0 → 5.0 | 2.0 → 2.0 | 0.0 → 0.0 | 18.6 → 18.0 |
| Admin | Activity cold load | 8.0 → 4.0 | 2.0 → 2.0 | 0.0 → 35.0 | 18.2 → 18.4 |
| Settings | Profile including images cold load | 13.0 → 1.5 | 2.0 → 2.0 | 0.0 → 0.0 | 18.2 → 18.3 |
| Public booking | Brand and availability cold load | 7.0 → 3.0 | 1.0 → 0.0 | 85.0 → 51.0 | 18.6 → 18.4 |
| Quotes | Register cold load | 8.0 → 1.5 | 2.0 → 2.0 | 0.0 → 0.0 | 18.3 → 18.2 |
| Quotes | Details and directory cold load | 2.5 → 3.5 | 2.0 → 2.0 | 314.0 → 343.0 | 18.5 → 18.3 |

Preflight requests vary with the browser's CORS cache; that cache could not be explicitly disabled through the available browser bridge. They are reported separately and are not presented as an application optimisation. No sampled primary request reported an HTTP error or network failure.

The observation window ends 2.2 seconds after readiness/saved confirmation. A completion event was not observed for 65 baseline requests and 64 candidate requests. **60 on each side are PDF-worker requests whose completion is outside the parent page's captured target**; their transferred bytes are unverified and excluded from the observed-byte totals. The other few are late background/intelligence requests. This is a limit of the evidence, not zero-byte proof. No missing transfer size has been estimated.

## What changed

- **Quotes:** customer/supplier/contact/location changes apply atomically. Saves remain serial across editor remounts, keep later edits, and retain a real retry path after failure. Reopening a quote waits for its in-flight commit. A slow request no longer unlocks a second overlapping save after an artificial timeout. Save results update readiness, history and versions without replacing the workspace. Initial intelligence refresh and subscriptions use stable quote identity; subscriptions reconnect after token renewal and reject stale callbacks.
- **Intelligence backend:** refresh authorises a lightweight quote header lookup. Publication checks the quote revision, retains AI data and does not publish unchanged deterministic results. The existing worker and event-driven watches remain in use.
- **Shared reads:** the existing CRM cache now bounds completed entries, deduplicates pending reads, uses a 60-second freshness limit and scopes results to Supabase project plus signed-in user. Access changes invalidate caches and stale responses are rejected. Quote sources, currencies/rates and branding use those boundaries. Each organisation is transferred once in the compact quote-source response and role lists are derived locally; the legacy response remains compatible.
- **Location controls:** immutable directory indexes are shared by country, mode and identifier. Organisation options and official locations are memoised; small recommendation changes do not rebuild the 116,232-location directory. Search order, keyboard selection and manual values are retained.
- **Shell and calendar:** desktop/mobile notification consumers share one state store and subscription. Meeting creation uses a small authorised connections endpoint. Calendar avoids its redundant initial range request. Calendar and Admin polling prevent overlap, pause when hidden and refresh on return. Admin keeps rows mounted during background refresh. Public customer surfaces skip private workspace bootstrap and presence work.
- **Gallery:** operational data is separated from gallery metadata and source examples. The operational data chunk is **85.05 kB raw / 23.89 kB gzip**, versus the former mixed chunk's **435.46 kB / 123.49 kB**. The gallery's source examples remain available on its route. Shader and autofill source files and all captured CSS files are byte-for-byte unchanged.
- **CRM database:** an execution plan exposed a correlated thread scan across 84,427 threads for 20 accounts. Bounded joins replaced 1,688,540 repeated subplan executions. The measured SQL execution was **2,099.425 → 11.082 ms**, with equivalent scores for the 20 accessible accounts. Existing indexes were sufficient; no speculative index was added. Mailbox ownership, active read grants, expiry/revocation and Email.Read boundaries are retained in the scoped query.

The SQL timing and bundle sizes are supporting evidence; they are not substituted for the browser results above.

## Regression investigation and limitations

The primary Admin median was 4.6% slower and quote-detail cold load 8.8% slower. Both stayed in the table. A second controlled comparison used the preserved frontend and candidate frontend against the **same current backend and JQ20019 version 93**, with two warmups and 20 measurements each:

| Diagnostic | Preserved frontend median / p95 | Candidate median / p95 | Finding |
|---|---:|---:|---|
| Admin cold load | 1,453.4 / 1,842.7 ms | 1,380.9 / 1,679.4 ms | Original small slowdown did not repeat consistently |
| Quote-detail cold load | 1,712.5 / 1,952.9 ms | 1,749.2 / 2,536.4 ms | Median difference narrowed to 2.1%; slower p95 remains |

The later quote sample needed the existing age-triggered intelligence refresh; the original fresh baseline did not. The controlled older-frontend run also made this request. The cold quote screen is therefore **not claimed as a speed improvement**. It trades initial index construction for faster repeated interaction, and its tail latency remains a follow-up measurement concern.

Bookings, Warehouse, Finance and Dexter also have slower primary p95 observations despite improved medians. Traces show slow account/workspace/provider responses on the outlier runs; Warehouse has zero median long-task time and Finance's median long-task time decreased slightly. Those outliers were not discarded. Localhost measurements cannot promise the same gains on every device or network.

Three long-running browser tabs crashed during hundreds of repeated reloads: one during the preserved baseline, one in the main candidate run and one during diagnostics. Recovery used fresh tabs with the same authenticated browser context and restored viewport; completed slow samples were retained. The underlying browser/GPU/tooling cause is **unconfirmed**. Closing the crashed error tab through automation was blocked by the browser URL policy; the working app remains open in a fresh tab, and the viewport override has been reset. Ordinary reviewed journeys completed, but this reload-stress behaviour is not claimed as fixed.

An initial candidate customer sample used an unmatched shipper/supplier fixture. It was excluded, the fields were corrected through the UI and the full sample was rerun. Audit history was preserved, so the matched candidate starts with **20 additional prior versions**: baseline v7 versus candidate v27; after all quote actions, baseline v73 versus candidate v93. Core quote fields and shipment facts matched apart from quote reference and generated supplier-row identifiers. This conservative history-volume difference is disclosed rather than rewritten away.

Other measurement recovery: the baseline document worker initially had an incorrect local MIME type; the server was corrected and the complete document baseline repeated. A slow-save probe used an outdated DOM predicate and timed out; persistence was verified separately and that probe is not a benchmark result.

## Verification

**Passed on the final code/build:** production build; Edge Function type checks; focused cache, save ordering, realtime, location and notification tests; real quote save/audit/readiness SQL checks; changed-versus-unchanged intelligence publication; stale revision rejection; anonymous/unknown caller denial; company publication denial; CRM join equivalence and mailbox-boundary fixtures; Dexter quote read, real save, match once, non-match, pause/resume, notification ownership and cross-user denial. Database lifecycle tests use transactions that roll back.

**Browser checks:** rapid customer selections; editing during a slow save; offline failure and explicit retry; navigation during saving; reload persistence; keyboard search/ArrowDown/Escape/Enter; linked country/London/GBLON selection; manual PO preservation; customer/supplier/shipper values; £100 cost / £250 revenue / £150 profit / 60% margin after reload; readiness highlighting actual missing fields; committed audit history; desktop notifications; mobile fields and totals without page-level overflow; gallery preview/code/usage; Home's four shader surfaces ready with zero retries; no runtime exceptions in the final review. Admin retained 25 rows with zero missing frames across 3,775 observed frames and a background refresh.

**Full test suite:** 1,395 tests; **1,352 passed, 42 failed, 1 skipped**. All 42 failing test names also reproduce in the preserved baseline validation checkout. No new failure names were introduced. Existing failures include stale source/layout contracts and other pre-existing product assertions; they have not been silently removed or reported as green. See the evidence's `test-comparison.json` for the complete list.

**Not proven by this run:** live second-tenant authentication (only the development project was available), another human user's end-to-end session, live cache invalidation after a CRM edit by a different user, actual hidden-tab polling through the browser bridge (its visibility control left `document.visibilityState` visible), lower-powered devices, provider OAuth/reconnection, sending a quote/email, scheduling an external meeting, document generation, customs submission or finance posting. These external write workflows were not needed to exercise the performance changes. Tests and retained boundaries cover the changed underlying contracts; a passing build is not presented as live-provider proof.

## Audit coverage

| Area | Browser evidence | Additional audit / boundary |
|---|---|---|
| Shell / dashboard | Home and notification popover | Shared notifications, branding cache, account/access lifecycle, minute clock |
| Quotes | Autofill, saves, register, details, totals, readiness, history, mobile | Queue/retry, realtime renewal, source invalidation, worker and Dexter lifecycle |
| Bookings | Register | Shared operational imports and reference reads; creation/provider writes unverified |
| CRM | Company directory | Bounded engagement query, mailbox scope, existing visible refresh/paging |
| Inbox | Mailbox list | Existing visible/backoff polling retained; duplicate auth read remains; no messages sent |
| Calendar | Week view and composer | Range request, provider read permissions, polling/cancellation; external scheduling unverified |
| Warehouse | Inventory | Existing visible refresh and pending-request sharing retained; stale-cache rejection |
| Documents | Recent documents and all three previews | Gallery isolation; worker-byte capture limitation; generation unverified |
| Customs | Export register | Existing visibility/cancellation paths retained; submission unverified |
| Rates / Finance | Empty rate library and currency setup | Shared reference caching and mutation invalidation; no approved finance settings changed |
| Dexter | Home and watch summary | Real rollback-only read/write/watch lifecycle; no extra idle LLM polling |
| Admin / Settings | Activity, profile images, refresh stability | Access invalidation, quiet refresh, notification sharing |
| App-owned public routes | Branded booking availability | Shared external-route bootstrap exclusion; quote-response/contact/attendee variants reviewed in code, not individually benchmarked |

Optimised backend reads reuse existing quote, CRM and calendar capabilities. They introduce no new operator write action or domain, so Dexter continues using its existing tenant-safe adapters, allowlisted approvals and deterministic event watches. The calendar connection endpoint exposes the same provider connection contract already present in the calendar workspace, with the same user/company permissions and no credentials.

## Reproduction and deployment record

- Baseline source captured **2 September 2026, 22:00:34 UTC**, before performance edits; baseline measurement completed at 23:11:03 UTC. Git base: `bddb57a6af7dc01072c108c766e7acd655a1a3e0`, branch `dev`, with the user's pre-existing uncommitted changes preserved in the source snapshot.
- Same Mac, browser context, localhost origin and production build mode; in-app **Chromium 152**, explicitly selected by the user after sign-in. This is not a separate desktop Chrome run. Reported hardware concurrency 14, device memory 16 GB. Viewport override 1440×1000 at the existing 90% zoom produces **1600×1111 CSS pixels**, DPR ≈0.9. Desktop measurements used that exact viewport on both sides. Mobile verification used a 390×844 override (433 CSS pixels wide).
- Local SPA server uses gzip and `Cache-Control: no-store`. This makes cold HTTP assets repeatable but does not flush DNS, TLS, browser code caches or remote database caches. No artificial network/CPU throttle was used for benchmarks. Throttling/offline mode was used only in separate failure tests and removed afterward.
- Data: 116,232 official locations; 25 quote register records; 20 displayed CRM accounts from a dataset with 84,427 email threads; 34 warehouse stock rows; 34 recent documents (20 on the first page) and three template previews; three active Dexter watches; three operating currencies at approved revision 2; empty rate library. Mailbox/calendar contents were read live, and their clock-driven values may vary over time.
- Quote choices alternate Demo Organisations 002/003 and suppliers 045/049, retaining shipper 035; PO alternates `PERF-20260902-EDIT-A/B`. Matched candidate record JQ20019 is preserved. JQ20018 is the separate QA record and was edited after measurement to test failure, location and totals behaviour. No quote was issued or converted.
- Development Supabase project: `aqtwypsuijxlnvtxpuxe`, PostgreSQL 17.6. Deployed versions: **quotes-workflow 54 → 55**, **quote-intelligence-worker 33 → 34**, **calendar-api 16 → 17**. JWT verification settings are unchanged. Applied incremental migrations: `20260903001500_quote_save_committed_summary.sql`, `20260903002500_quote_intelligence_publish_changed.sql`, `20260903004000_crm_engagement_bounded_joins.sql`.
- Baseline build 13.33 s; final candidate build 12.45 s. Build time is supporting evidence only. No client source file is newer than the measured final build. No production deployment or database migration was performed outside development.

Evidence directory: `/Users/harryphillips/.codex/visualizations/2026/09/02/01a06409-638d-7ff0-9ec4-430d786c251a/performance`. It contains immutable baseline sources/build, final build, manifests/hashes, raw sanitised measurements and excluded pilots, diagnostic runs, build logs, execution plans, verification outcomes and the measurement-issue ledger. Request headers, tokens, query strings, email bodies and response payloads are not in the exported browser evidence.

Regenerate the numeric summaries with:

```sh
python3 docs/performance/summarise-benchmarks.py /absolute/path/to/performance
```

The tables report every measured scenario, including unchanged and slower results. Unverified workflows and transfer sizes remain explicitly unverified.
