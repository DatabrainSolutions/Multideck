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

The source reader retains its filename and MIME type. Draft thumbnail and editor
preview requests forward that filename, so an imported PDF or Excel source is
not validated as Word. Source downloads retain the original format; previewing
does not save, replace or publish a version. Word remains the edited-layout
upload format in this authoring screen.

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

## Demo-safe template previews — 1 October 2026

The Templates gallery and Manage templates preview are separate from operational
document generation. They never reuse an issued Job PDF or open a Job session.
Only exact SHA-256 fingerprints of privacy-reviewed sources can be previewed.
The server supplies a fixed fictional fixture and ignores caller-supplied JSON.
An unknown or modified source is blocked before Carbone is called. Uploaded
sources need a fresh privacy review, including fixed text, images, headers,
footers, signatures and referenced assets; file type and tags alone are not proof.

The reviewed source catalogue is `functions/_shared/template-preview-catalogue.json`.
Each entry identifies the retained source and fictional fixture. To add a source,
inspect all content and artwork, confirm it contains no customer details or
unreviewed external references, render the fictional fixture, then register the
exact source hash. Do not add a prefix/name-based bypass or self-certification.
The imported FIATA completed PDF is deliberately not in this catalogue. MAWB
and MNG sources retain fixed real carrier information and await clean layouts.
No operational records, issued PDFs, retained sources or version history are deleted.

This is an additional guard on the existing manual Word authoring exception for
Dexter, not a new read/write/watch capability. Preview privacy review cannot be
claimed or bypassed by Dexter. Existing document generation permissions and
tenant isolation remain unchanged. Non-managers are not given private source
access for gallery thumbnails.

Shared development `aqtwypsuijxlnvtxpuxe` runs document-studio v66 with JWT
verification retained. All four deployed files were read back and matched the
local sources. Production and GitHub were not changed. The current catalogue
covers 38 active template entries (37 distinct sources); the three unchecked
sources above display a privacy notice rather than customer content.

Seventeen focused contract/privacy checks, TypeScript and the client production
build passed. Chrome confirmed the completed FIATA v3 is blocked, the reviewed
FIATA reference renders fictional parties and the Multideck logo, source switching
clears the previous PDF, the sample JSON is read-only, and the controls fit at
390px without page overflow. Reload does not restore an old PDF. No templates
were published and no issued documents or operational records were changed.

## Clean waybill restoration — 1 October 2026

Shared development document-studio v70 recognises 40 exact reviewed source
fingerprints. Its four files were read back unchanged after deployment except
for the approved fictional source catalogue additions. Old completed FIATA and
fixed-carrier sources remain blocked; no filename-based bypass was added.

New sources and rebuild instructions are in `supabase/templates/demo-safe-waybills`.
The clean Master Air Waybill v7 and MNG Air Waybill v7 are drafts above retained published v6. FIATA
-Waybill v6 is an editable one-page draft with the replaceable Multideck logo;
its completed PDF v3 and the intermediate drafts remain in history. Real
Carbone previews were created in Chrome and downloaded for text/layout checks.
The MAWB retains all twelve pages, with fictional values on all six form faces.
FIATA no longer copies customer names, references, container numbers or a signature.

The older registration function unexpectedly auto-promoted the first MAWB
upload. A guarded correction restored the exact retained published v6 pointer
and marked only the newly uploaded source v7 as draft, with an explanatory
change reason. No generated documents used that source. Following explicit user
approval, migration `20261001132349_template_source_uploads_require_review.sql`
was applied to shared development (hosted migration version `20261001134924`,
name `template_source_uploads_require_review`). Readback confirmed draft-only new
sources, no published-pointer overwrite, an active-user check and server-only
execution. MNG's source was then uploaded through Lee's authenticated Chrome
session and saved as draft v7. Database readback confirmed both original published
v6 hashes and pointers were unchanged and neither new v7 had generated documents.

The actual MNG preview PDF was downloaded and both pages inspected: fictional
parties, carrier, addresses and references on the form; generic conditions on the
reverse; no unresolved tags or retained customer/carrier values. All three restored
previews were visible in the template library after a full reload. Source uploads
remain drafts until a separate review/publication; no publish action was taken.

Nineteen focused privacy, document and actual PostgreSQL checks passed, including
the real registration definition rather than a mocked draft save, plus anonymous,
inactive, unlinked and unpermitted save denials. The full access regression suite
was rerun before the approved out-of-band development migration and remains at 139/140: the existing unrelated
Finance Director September cash/date fixture fails. Production and GitHub are
unchanged. These clean draft previews are not operational generation sign-off;
review the new carrier-address and FIATA mappings before publication.
