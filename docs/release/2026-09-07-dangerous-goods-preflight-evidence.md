# Dangerous-goods migration and browser preflight

## Result

The exact pending migration pair passes a populated rehearsal against a fresh
schema-only export of development project `aqtwypsuijxlnvtxpuxe`. No hosted
migration, function, deployment setting or business record was changed.
Implementation remains local at `4aa895e`; this checkpoint adds verification.

Schema SHA-256:
`d3e4487e01f50f857a7a694f6bc3eef4f428f3a4dd20889a98e8158774ca0098`.
The export contains application schemas only, not live rows, Auth identities,
Storage objects or credentials. Managed-service boundaries are empty fixtures.

The [exact release plan](2026-09-07-dangerous-goods-development-plan.json) pins
both migration hashes. The rehearsal rejects mismatched hashes and restores the
schema into disposable PostgreSQL 17 before applying only that pair. It does
not reconcile or replay the unrelated development migration ledger.

## Preservation and security checks

- Four populated legacy DG records cover all existing boolean combinations,
  supplied whitespace/Unicode, source fields and timestamp precision. Every old
  column is compared exactly. New metadata does not invent actor attribution;
  retained evidence remains legacy and read-only.
- All existing Quote headers/versions, Booking headers/cargo/equipment/routes,
  cargo memberships and already-live milestone fields remain exactly unchanged.
  Existing registry rows, watch signals and the separate finance function/ACL
  are retained.
- A real post-upgrade insert proves both omitted flags remain null rather than
  becoming false. That insert is rolled back inside the disposable database.
- DG RLS remains enabled; direct table access and private mutation execution
  are denied to browser and service roles. Public save/domain/action adapters
  remain service-only. Mandatory Dexter approval and its enabled deterministic
  watch trigger are present.
- Existing typed-cargo RLS and finalisation/allocation/selective-revision service
  boundaries also pass the retained rehearsal checks.

Command:

```sh
node supabase/tests/tools/freight-schema-rehearsal.mjs /absolute/fresh-schema.sql --populated --release-plan=/Users/leewright/repo/Multideck/docs/release/2026-09-07-dangerous-goods-development-plan.json
```

## Browser checks

Connected Chrome verified keyboard opening, every field in natural tab order,
both ends of the focus loop and Escape dismissal in the existing component
gallery. The earlier owned preview tab had closed; a new isolated tab was used.
No user tab or global browser setting was modified.

A repeatable headless Chrome check bundles the actual DG editor and extracts
the existing gallery preview, using the built application CSS. It passes all
four combinations of en-GB/en-US and reduced/normal motion:

- 320, 768 and 1280 pixel reflow without page/dialog horizontal overflow;
- 200% CSS zoom, accessible form actions and reachable Save;
- keyboard focus wrapping and restoration after synthetic save;
- retained synthetic record and read-only mode;
- zero console/page errors and zero external requests.

The 320-pixel screenshot was visually inspected. The app's existing global
reduced-motion policy uses one 1ms animation cycle and 1ms transitions; the
test initially expected no animation name, then was corrected to verify that
policy. No application styling or validation was changed to satisfy the test.

Command (use the available bundled Playwright package directory):

```sh
node supabase/tests/tools/verify-booking-dangerous-goods-browser.mjs /absolute/playwright /absolute/mobile-evidence.png
```

Language context and API boundaries are declared isolated fixtures: this checks
the production component's rendering in both regional contexts, not the full
regional preference persistence flow. Browser save is the gallery's in-memory
save, not hosted persistence. The existing local lifecycle/build evidence is
reused because no application code or migration changed in this checkpoint.
`git diff --check` passes.

## Remaining gates

Before the combined development release, refresh remote Git/function drift and
security-advisor evidence. Then verify hosted Booking save/reload/clear/void,
Dexter approved-write/watch behaviour and relevant denials. No hosted DG or
95% completion claim is made. Full all-mode/revision acceptance and every
recorded approval requirement and exclusion remain intact.
