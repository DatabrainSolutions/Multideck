# Document template layout editing

Documents → Templates is the manager's layout library. Published and draft tiles
open the same job-free Word authoring flow: download source, edit in Word, upload
a draft revision, preview with fictional data, review, then explicitly publish.
Reading a published source does not copy, replace or publish it. Uploading a
revision leaves the approved version in use until review and publication.
Operators without Documents.Manage retain the published-only creation flow.

The authenticated `document-studio` template-source action uses a service-role-only
reader that checks Documents.Manage and active membership of the current tenant.
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
