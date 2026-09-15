# Cloud dependency preparation — local evidence

## Source state

Working branch: `Cloud-Tenent-Auto`; starting commit:
`2ebffd4e8746cd85088095bf0b2d6e7db6c8e568`.
Changes are local and uncommitted. No migration or function was deployed.
No clean Main project or disposable hosted customer was created.

After fetching origin, `origin/dev` still matches this starting commit.
`origin/main` is `337b553` (10 September). No promotion was performed.

## Release-blocking source mismatch

Read-only migration history from App project `aqtwypsuijxlnvtxpuxe` contains,
among other later changes:

- `20260915030438_customs_override_latest_calculation`
- `20260915000256_customs_assessment_dexter_action`
- `20260915000204_customs_assessment_dexter_parity`
- `20260915000203_customs_assessment_comparison_audit`
- `20260914213000_customs_provider_response_history`
- `20260914212941_customs_calculation_audit`

No matching assessment, latest-calculation override, provider-response-history or
calculation-audit migration files were found in any fetched origin branch.
This is more than a timestamp mismatch: the migration names are absent too.
The deployed changes' source and matching App/Edge changes must be reconciled
before choosing the accepted dev/test/main state. Do not invent replacement IDs,
drop the live changes or declare this checkout an equivalent clean template.

## Checks passed

- `PG_TEST_BIN=/opt/homebrew/opt/postgresql@17/bin node supabase/tests/run-data-access-regression.mjs`:
  28 primary tests plus 10 focused contract cases; zero failures or skips.
- `node --test supabase/tests/cloud-product-contract.test.mjs supabase/tests/cloud-product-database.test.mjs`:
  request/authentication and real PostgreSQL revision/audit/access tests pass.
- `node --test supabase/tests/cloud-phone-boundary-postgres.test.mjs`:
  Jenkar gate, retained ordinary CRM permissions, role denial and watch
  revocation/no automatic resume pass.
- `npx --yes deno test --allow-env supabase/tests/cloud-product-edge.test.ts`:
  real phone and product handlers tested with an offline Supabase transport;
  no network permission or provider delivery. Denial, unavailable permissions,
  retained user authentication, invalid requests, oversized input and refusal
  to acknowledge unverified enforcement/health pass.
- Deno type checks pass for product receiver, iCustoms API/webhook and phone API.
- `git diff --check` passes.
- Pinned source audit: 764 Supabase files, 58 functions at the starting commit;
  no missing literal relative imports. `shared/email-signatures.ts` lies outside
  the Supabase tree and must be packaged. Two previously implicit JWT settings
  are now explicit in the local config. Audit is not a release manifest.

## Incomplete acceptance

Complete installation recipe and clean restore; matching immutable package and
publication; installation evidence and actual health probes; complete iCustoms
UI/direct-access/Dexter enforcement; full phone Dexter lifecycle; populated and
skipped-version upgrades; full provider-runtime credential inventory; Chrome
Cloud-to-App journeys; hosted creation/update rehearsal and launch approval.

`MULTIDECK_PRODUCT_ENFORCEMENT_READY` remains unset. Do not enable it or deploy
these gates without the remaining verification and verified customer binding.
No Harry dependency is claimed complete by this evidence.
