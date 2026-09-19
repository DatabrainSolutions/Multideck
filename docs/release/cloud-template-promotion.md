# Main template and customer release acceptance

The Main template is a dedicated Supabase project containing complete product
infrastructure and essential reference settings, with no company-specific data.
Dev and Test share their existing test database. Training is optional and off;
Live deployment is excluded. iCustoms is the only agreed purchasable extra.
The phone system is reserved for verified Jenkar and never enters the sales catalogue.

## Reproducible source inventory

Run `node supabase/release/audit-source.mjs <exact-commit>` from the App repository.
It reads only tracked Supabase source at that commit and produces checksums,
function authentication settings, missing relative imports and environment variable
names. It never reads `.env.local` or outputs environment values. This report is
not an installable release and always reports `releaseReady: false`.

The current public-only baseline is not a complete Supabase template. Its README
requires additional private-schema migrations and predecessors. Do not infer an
installation boundary from file dates or replay the entire migration directory
over the snapshot. Do not resurrect Cloud's retired old-snapshot assembler.

## Promotion checklist

1. Record the candidate code SHA and database migration state. Agree a freeze of
   the shared dev/test database while Test accepts the candidate. Any database
   change invalidates the prior acceptance and requires another test run.
2. Resolve a complete installation recipe, extension dependencies, reference seeds,
   Storage configuration, function authentication and scheduled-job definitions.
   Keep external delivery jobs inactive until the customer connection is approved.
3. Run the fresh installation and PostgreSQL access suite in isolated local databases.
   Confirm required standard settings remain and company data is absent. Never use
   `supabase/seed.sql` as an unreviewed production seed.
4. Test upgrade from a populated prior release and a skipped iCustoms-only release.
   Preserve users, files, secrets, permissions and bespoke changes. Verify both an
   interrupted update and its retry. Record only an actually verified installed version.
5. Promote accepted work through dev, test and main using the team's approved Git
   workflow. Record the resulting exact main commit and regenerate/check the package
   from that commit. Keep immutable migration IDs, bytes and checksums.
6. Request permission for the specific hosted Main template and separate rehearsal
   projects, with organisation, region, owner, cost and recovery details verified.
   Never erase or repurpose the existing dev/test project to make it a clean template.
7. Prove customer creation, App company/office/user bootstrap, provider integration,
   feature enforcement, domain/auth isolation and data-preserving updates from Cloud.
   A customer Git push must not deploy; an explicitly approved exact-commit Cloud
   deployment must. Keep actual customer execution disabled until acceptance.

## Product receiver preparation

`multideck-cloud-product` accepts contract 1 and server credentials only. Its
customer identity must match both `MULTIDECK_CLOUD_TENANT_ID` and the private
database binding established by trusted deployment tooling. Neither browser users
nor feature requests may create the binding or grant Jenkar phone access.

The new migration and receiver are a foundation, not completed feature enforcement.
`MULTIDECK_PRODUCT_ENFORCEMENT_READY` must stay unset until UI, RPCs, workers,
webhooks, direct storage access and Dexter are all verified. Health deliberately
returns unavailable until real installation evidence/checks are implemented.

Feature grants and Jenkar exclusivity are control-plane administration: Dexter
chat and Watching for you must not grant either. Operational adapters must inherit
the same access checks, including revocation of existing watches. This work remains
partially implemented. The shared access helper now guards iCustoms API, webhook/recovery,
and phone API/webhook/scheduled-sync entrypoints. Direct database and Storage
paths, frontend affordances and Dexter lifecycle still require verification;
these entrypoint gates are not evidence of complete enforcement. Deploying these
gates without an approved customer binding will deliberately disable those
integrations, including on an existing Jenkar installation. Do not deploy them
until the verified Jenkar binding and acceptance checks are ready.

The phone permission migration adds the product restriction to the existing CRM
permission resolver used by phone RPCs and Dexter, and pauses active phone watches
on revocation without automatically resuming them. Its focused PostgreSQL test
passes. This does not replace the complete Dexter read/write/watch lifecycle proof.

No hosted template, package publication, branch promotion or provider setting change
is authorised merely by a passing local foundation test.
