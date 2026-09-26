# App smoothness verification — 26 September 2026

Implemented locally in the shared checkout. No deployment, migrations or backend API changes.

## Verified behaviour

- Quotes: a successful refresh and a deliberately blocked RPC both retained all 30 visible rows across observed DOM updates. The failed refresh showed the last-results notice and retry; unblocking the RPC and retrying restored normal operation.
- Fresh Quotes return through Home and browser Back: the first table render contained 30 rows, with no loading text and **zero register RPC requests**. Observed time from the browser observation marker to that render: **92.9 ms**. This is one local sample, not a production percentile.
- Expired cache: a return correctly fetched again rather than extending the existing 15-second freshness window.
- Initial load failure: failed rows are identified as unavailable, not an empty search result. Retry recovered.
- Rapid Mine → All switching with 700 ms network latency retained the final All selection and expected 30 rows after late responses.
- Shader visibility simulation: hidden document had zero shader canvases and `painted` state; after visibility was restored the canvas returned to `ready`. The visibility override was removed after the test.
- Route import failure: blocking the Rates page module showed recovery inside the existing shell; Home remained available. Unblocking and Reload page recovered Rate management.
- Mobile Bookings at 390 × 844: refresh preserved 30 rows; page width remained 390 px; filters and refresh were available in Table controls; Table/Board switching worked. Quotes at 820 px retained 30 rows without page overflow. Temporary viewport and reduced-motion emulation were reset.
- Reduced-motion mode retained usable controls. Existing springs/timings remain unchanged.

## Exploratory page-load measurements

Authenticated Chrome, localhost:3000, Vite development build, same account and existing records. One before pass, two after passes. Each full document navigation was followed by a two-second frame sample after the notification control appeared. Browser module/HTTP caches were not cleared. These are repeat document loads, not a controlled cold-cache benchmark.

**Shell time** measures navigation to the visible notification control, including browser-tool overhead; it is not a claim that every page's data is ready. **Long-task time** covers buffered main-thread tasks over 50 ms from navigation to the end of the sample. **Slow frames** are rAF gaps over 34 ms within the two-second sample. API request counts come from CDP Fetch/XHR events; the initial Resource Timing counter was unavailable, so the first four baseline request counts are omitted.

| Page | Shell ms: before → after 1 / 2 | Long-task ms: before → after 1 / 2 | Slow frames: before → after 1 / 2 | API requests: before → after 1 / 2 |
|---|---:|---:|---:|---:|
| Home | 1503 → 1421 / 748 | 222 → 167 / 91 | 4 → 1 / 1 | — → 20 / 20 |
| Quotes | 910 → 950 / 981 | 213 → 302 / 188 | 1 → 2 / 1 | — → 16 / 16 |
| Bookings | 802 → 1105 / 703 | 258 → 208 / 363 | 2 → 1 / 1 | — → 16 / 16 |
| CRM accounts | 708 → 1246 / 1024 | 195 → 239 / 270 | 1 → 2 / 2 | — → 15 / 15 |
| Inbox | 1119 → 869 / 696 | 317 → 159 / 158 | 2 → 1 / 1 | 23 → 23 / 20 |
| Dexter | 958 → 793 / 887 | 229 → 108 / 120 | 4 → 2 / 3 | 25 → 25 / 25 |
| Events | 1063 → 1000 / 966 | 112 → 90 / 88 | 0 → 1 / 2 | 18 → 18 / 18 |

Recorded layout-shift scores were unchanged in both after passes for Quotes (0.0340), Bookings (0.0491), CRM (0.0417), Inbox (0.0007), Dexter (0.00004) and Events (0.0017). Home varied from 0.0092 before to 0.0581 / 0.0092 afterwards. All visible shader surfaces were ready at the end of these samples.

The samples are noisy and do **not** establish a uniform cold-start improvement. The repeat-navigation and refresh checks above directly establish the intended loading behaviour.

Additional two-second interaction samples: sidebar collapse produced one 90 ms long task and 2 frame gaps over 34 ms across 211 frames; opening the column panel produced one 85 ms long task and 1 such gap across 224 frames. Both measured zero unexpected layout-shift score. These retain some main-thread cost and are not a claim of flawless frame delivery.

## Automated checks

- Client production build passed; Vite still warns about large bundles (including the approximately 2.33 MB uncompressed app entry). No blanket bundle-size improvement is claimed.
- 37 cache, notification, loading, transport, route-loader and visibility tests passed.
- 18 existing Inbox/navigation/sidebar tests passed.
- Required data-access regression runner passed: 134 tests plus 9 administration/reference contracts, including real PostgreSQL fixtures.
- Existing shader contract suite: 7 passed, 1 failed. The failing test expects `CrmDetailOverviewShader` in the CRM account page, but that import is absent in unchanged HEAD as well. This unrelated expectation was not weakened or removed.

No hosted validation or production performance measurements were performed. Provider delivery, writes, and notification mutation workflows were not exercised in the browser; the changes preserve their existing backend boundaries and the notification mutation regression tests passed.
