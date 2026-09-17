# Cloud provider readiness — 15 September 2026

Read-only observations, not deployment approval. No provider configuration was
changed and no customer or Main project was created.

## Confirmed access and deployment controls

- GitHub CLI can read `DatabrainSolutions/Multideck`; the current authenticated
  identity reports admin, maintain, push and pull repository permissions. This
  does **not** prove the deployed Cloud service credential has the same scope.
- The connected Supabase identity can list the Databrain organisation's projects
  and query the `MultiDeck` App project (`aqtwypsuijxlnvtxpuxe`) read-only.
  It is in `eu-west-2`, Postgres 17.6. This is an existing source environment,
  **not** a clean Main template and must not be repurposed.
- The accessible project list includes separate Multideck Cloud and
  Multideck-jenkar projects. No dedicated clean Main template was identified.
- Cloud source already supplies `gitProviderOptions.createDeployments = disabled`
  when creating a customer Vercel project and uses an explicit release commit for
  customer creation and update deployments. Do not replace this with a global
  App `vercel.json` switch that also disables the team's dev/test workflow.
- The App repository still contains a legacy Azure workflow that deploys on a
  push to `main`. Its target is `multideck`, not a Cloud-named customer Vercel
  project. Its current usage and retirement authority need confirmation before
  changing that separate production path.

## Infrastructure that the complete template must account for

The live source has product objects outside `public`, including `booking_api`,
`quote_api`, `report_api` and `private_live_gateway`. Live is excluded from this
work: review App gateway dependencies before selecting schemas; do not silently
copy or delete an entire schema because of its name. Private helper functions
also need inclusion even when a schema contains no tables.

Observed extensions: `btree_gist`, `pg_cron`, `pg_net`, `pg_stat_statements`,
`pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.

Observed private buckets: `crm-drive`, `email-signatures`,
`icustoms-webhook-captures`, `multideck-documents`, `multideck-generated`,
`multideck-template-sources`, `multideck-warehouse`, `profile-photos`,
`rate-source-files`, `warehouse-documents`. `tenant-brand-assets` is currently
public; resolve its approved branding purpose explicitly rather than weakening
private operational Storage checks or changing it blindly.

The source has active Calendar, Dexter, email sync, phone sync/retry/retention,
quote intelligence, reports, screening and customs preview cleanup jobs. A clean
template must include the reviewed definitions but must not carry source URLs,
credentials or active external delivery into a new customer. Phone jobs are
Jenkar-only. Customer-specific job activation belongs after verified setup.

## Still required before hosted approval

1. Verify capabilities of **Cloud's actual runtime credentials** for GitHub,
   Supabase, Vercel, DNS, email and AI—not merely this desktop connection.
2. Record each credential's owner, intended scope and rotation owner/date without
   copying its value into source, logs or this document.
3. Obtain Vercel project-level readback of disabled automatic deployment for an
   approved disposable customer. Prove push denial and exact-SHA deployment.
4. Verify DNS zone authority, email sending domain and AI project budget/limits
   read-only. No test emails, AI calls or paid resources have been used here.
5. Propose the exact Main project organisation, owner, region, current cost and
   recovery procedure once the complete local package has passed its checks.

This inventory identifies remaining work; it is not acceptance evidence for
provider creation, secret installation or a successful hosted rehearsal.
