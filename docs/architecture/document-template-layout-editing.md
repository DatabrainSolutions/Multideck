# Document template layout editing

Documents → Templates is the manager's layout library. Published and draft tiles
open the same job-free Word authoring flow: download source, edit in Word, upload
a draft revision, preview with fictional data, review, then explicitly publish.
Reading a published source does not copy, replace or publish it. Uploading a
revision leaves the approved version in use until review and publication.
Operators without Documents.Manage retain the published-only creation flow.

## Library ordering and removal

Each operator's order is saved on their own profile, through the authenticated
Studio library action. New templates append to the visible ordered library.
Native desktop tile dragging and menu actions use the same save. The top-right
menu is the sole visible control for ordering/removal, including on touch devices
and through keyboard navigation; there is no separate six-dot drag handle.
Failed saves restore the previous order and show a retryable error.

Remove is manager-only and applies to the shared library. It sets IsActive false
and LibraryRemovedAt; it never deletes the source, versions or generated files.
Removed templates can be restored to their previous draft/published state.
Both changes are recorded in the private template_library_changes audit table.
The backend checks active identity, Documents.Read/Manage and office/company
scope. Existing rendering rejects inactive templates. Restoration does not
publish a draft or alter the approved version pointer.

The authenticated `document-studio` template-source action uses a service-role-only
reader that checks Documents.Manage and active membership of the current tenant.
Office-specific layouts also require matching company and office membership.
It returns the latest pending revision, otherwise the current approved source.
Only a matching active object in private template storage can be read. Older
published sources are not substituted when the selected source is unavailable.

## Dexter exception

Word layout editing and binary template-source downloads are manual authoring
operations, not supported Dexter chat or Watching for you capabilities. Dexter
must not claim to download, edit, approve or publish a template. Requests should
be directed to Documents → Templates for authorised template managers; the
existing unsupported-capability response remains applicable. A source read
does not change operational records or produce a watch event. Existing generated
document handoff and document-generation access boundaries are unchanged.

Personal template ordering and shared template removal/restoration are also
explicit manual-only exceptions for both chat and Watching for you. They are
library-maintenance actions rather than changes to a booking or generated file;
do not approximate them using operational updatedAt watches. Managers use the
template menu and Removed templates recovery controls.

## Shared-development verification — 1 October 2026

With Lee's explicit approval, the job-free source reader and library-control
migrations were applied to development `aqtwypsuijxlnvtxpuxe`. `document-studio`
version 65 was deployed with JWT verification retained; both deployed files were
read back and matched the local source. Production and GitHub were not changed.

The old `FIATA_BOL` entry contained the operations-requirements document. It was
removed through the authenticated library UI, restored to verify recovery, then
removed again. Its six versions remain intact. `FIATA_BOL_REFERENCE` remains an
active, unpublished version 2 draft; no layout was uploaded or published.

Chrome verification confirmed desktop drag and reload persistence, keyboard
movement, mobile menu ordering at 390px without horizontal overflow, removal and
restoration. Test movements were returned to the original visible order.
Booking confirmation, MAWB and MNG AWB opened their Word sources without the
legacy error. Booking confirmation rendered a fictional-data PDF preview.
Invalid preview JSON showed a recoverable error; the original sample was restored.
No browser errors or warnings were recorded during these checks.

Live probes confirmed colleague visibility, independent personal ordering,
private source storage and denied direct anonymous/authenticated RPC execution.
An unauthenticated Edge Function call returned 401. Twelve focused document and
real PostgreSQL checks passed. The mandatory access suite returned 139/140 passes;
its existing Finance Director September cash/date fixture still fails and remains
a merge/release limitation, not a document-flow failure.

The security advisor's only new finding is informational: the private audit table
has RLS enabled with no browser policy, deliberately denying browser access.
See [Supabase's RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
No new security warning or error was introduced.
