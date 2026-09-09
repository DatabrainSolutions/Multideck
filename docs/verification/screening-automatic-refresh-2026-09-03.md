# Compliance controls: automatic list refresh

Implemented in the shared local checkout. Nothing was committed, pushed or deployed.

## Behaviour

- The list name and report controls sit directly on the page background. Recents, Download report and Run report share one wrapping row. Controls reuse `registerControlClass`, including the table-control radius. The component gallery shows ready, checking and unavailable states and links to Compliance controls.
- Page load, returning to the tab, screening requests, the existing worker and approved Dexter screening actions use the same refresh mechanism. There is no browser polling or recurring model call.
- A database lease permits one downloader per physical tenant project. Concurrent callers return a pending state, failed requests share a one-minute cooldown, and abandoned leases expire after five minutes. Publication rejects an expired owner's token.
- The source's refresh interval is honoured within a 1–12 hour bound. Freshness uses the actual successful source check, not the original download date. An unchanged verified download renews `checkedAt` without rewriting `downloadedAt`.
- A new snapshot becomes current atomically, after complete parsing, persisted entry-count validation and hash validation. Import, network, parser and publication failures preserve the previous snapshot and fail closed. An obsolete feed cannot be revalidated.
- The SQL screening gate applies to both current and legacy entry points. Unverified, expired, unloaded, disabled or failed sources return unavailable rather than a no-match result. Historical screening records retain their original evidence.
- Report generation and its CSV download workflow are preserved.

## Source correction

GOV.UK confirms that the OFSI Consolidated List stopped being updated on 28 January 2026. The current source is the [UK Sanctions List](https://www.gov.uk/government/publications/the-uk-sanctions-list), using its linked FCDO CSV. The local migration updates the existing source record while preserving its stable source code and historical snapshots.

The public CSV downloaded on 3 September 2026 contained 58,424 rows across 6,334 designations. The parser read 58,350 romanised name rows and represented all 6,334 designations. The existing matching scope remains romanised names: 74 rows containing only a non-Latin alias are not indexed as additional names. This change does not introduce transliteration or claim comprehensive identity matching or legal clearance.

## Dexter and Watching for you

The existing screening read domain exposes real snapshot identifiers, source-check evidence and errors. Approved screening actions verify freshness before using the existing permission-checked, audited SQL action; approval and user/company boundaries are preserved. Registry descriptions and runtime guidance describe the new behaviour.

The existing database watch adapter is retained. Atomic snapshot publication produces one list-change signal; unchanged source checks do not produce another event. Screening outcomes and decisions remain real database events with deterministic watch evaluation. Tests exercise active, paused, resumed, unrelated-target and other-company signal boundaries.

Explicit watch exception: failed maintenance downloads do not create a new snapshot or a success event. Their persisted source error is available to chat and shown inline in Compliance controls. A dedicated background-refresh-failure notification is not added here, because the existing snapshot watch refers to a published list, not to maintenance attempts. Do not claim that a list-change watch monitors provider outages.

## Local verification

- Client production build passed; a subsequent TypeScript check passed after the final page state changes. Existing large-bundle warnings remain.
- 25 focused parser, ingest, concurrency and report-contract tests passed.
- A separate PostgreSQL integration test passed against an isolated disposable cluster. It applies the actual new migration to the relevant existing table/function definitions and tests simultaneous claims from two connections, first publication, unchanged verification, expired-token rejection, incomplete imports, failed/obsolete-source denial, legacy screening, service-only RPC grants and watch signal behaviour.
- The current public FCDO CSV was downloaded and parsed successfully. This verifies provider reachability from this machine and parser compatibility, not deployment in Supabase.
- No `design-tokens.md` was present in the checkout or the searched skill directories. Styling follows the current root `design.md`, `styles.css` tokens and existing table controls.

Run the focused suite from the repository root:

```sh
node --import ./supabase/tests/register-typescript.mjs --test supabase/tests/screening-ofsi.test.mjs supabase/tests/screening-refresh.test.mjs supabase/tests/screening-freshness-database.test.mjs multideck.client/tests/screening-control-contract.test.mjs
```

The database test uses installed PostgreSQL binaries when available; otherwise it explicitly skips. It creates its own Unix-socket-only cluster and removes it afterwards.

## Unverified / release dependencies

Chrome's local screening tab was at the sign-in screen. Authenticated desktop/mobile visuals, keyboard interaction and report clicks could not be completed; sign-in was requested. No live Supabase migration, import, worker schedule or function deployment was performed. Full cross-project auth tests and a live Dexter approval/watch-delivery lifecycle remain unverified.

Before a release can claim automatic freshness is live, apply the new migration to the intended tenant, deploy `screening`, `screening-list-worker` and `agent-dexter` with their updated shared code, and verify first refresh, unchanged refresh, provider failure and screening through that tenant's real UI. Deploy the frontend and check the live hostname separately. Provider/source configuration was changed only in the local migration file.
