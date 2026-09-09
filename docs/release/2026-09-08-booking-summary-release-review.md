# Booking summary release review

Proposed source: `codex/freight-workspace-foundation`.
Latest incorporated dev commit: `1fde362` (warehouse quantity conversion).
Integration commit: `7f48f9d`; merge completed without conflicts. The three
incoming warehouse migrations and architecture note are identical to origin/dev.

## Intended change

Booking Overview and Details display first/last saved route locations, including
free-text places with empty location codes. Overview labels planned departure
and arrival explicitly. Readiness, required delivery and predicted delivery
are not substituted for route plans; planned arrival is not copied into ETA.
Milestone estimates remain on their recorded milestones.

## Evidence

- Eleven focused tests pass, including real projection and component rendering
  in en-GB and en-US. Missing and mixed-route endpoint cases are covered.
- Client build passed for `f9c62fe`; TypeScript and focused tests also passed
  after the residual ETA alias correction in `a6507a5`.
- Local Chrome with the existing synthetic JD0991136 confirms saved locations
  and planned dates on Overview and Details; Details layout was inspected.
- Local mixed Rail/Road draft flow confirms connected endpoints, mode-change
  confirmation, mode-specific controls and successful Discard restoration.
- The dev merge changes only warehouse SQL/documentation, with no overlap in
  the verified frontend files. Those incoming changes are not newly certified
  by this freight verification.

## Release limitations and authority

Feature preview failed the existing build guard because branch-scoped
MULTIDECK_SURFACE, VITE_MULTIDECK_TENANT_SLUG and VITE_SUPABASE_PROJECT_REF were
missing. Preview configuration repair remains unapproved; CLI read-only
inspection needed authentication and was cancelled. No configuration changed.
Hosted verification of this frontend revision, responsive checks and the wider
mixed-leg persistence/equipment journey remain open.

The branch also includes the route free-text migration already applied to the
development database on 7 September (ledger entry 20260907153932); it must not
be reapplied. This review requests no database deployment, migration repair,
Edge Function release, or Vercel configuration change.

User approval is required before merging/pushing this feature branch to dev.
This is a reviewable summary-correction checkpoint, not freight completion or
evidence supporting 95%. All existing held Quote actions, Road semantics,
Customs exclusion and tracking/PDF-logo deferrals remain in force.
