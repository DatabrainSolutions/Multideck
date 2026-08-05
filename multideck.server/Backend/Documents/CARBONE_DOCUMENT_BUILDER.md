
# MultiDeck Carbone document builder

Status: implementation skeleton complete; deployment and the first Carbone template are still required.

Primary first release: `JOB_CONFIRMATION` selected by the operator-facing `Job_Header.Job_Number`, rendered as PDF or DOCX through `https://docserver.multideck.app`. The secure database API resolves that number to the internal job UUID after company, office, and permission checks.

Multideck owns template choice, data access, permissions, information selection, audit and delivery. Carbone is deliberately limited to one role: receive an approved snapshot, render the selected template, and return the generated file. Carbone must not query Supabase or receive Supabase credentials.

## 1. Purpose and non-negotiable boundary

Carbone is a rendering service. It must never connect to Supabase, receive a Supabase key, run SQL, or choose which records to read.

The production flow is:

```text
Authenticated MultiDeck UI
  -> Supabase Edge Function
  -> verified user + company/office/permission checks
  -> fixed, authorised database query
  -> immutable JSON snapshot + render job
  -> Carbone HTTPS render request
  -> private Supabase Storage object
  -> generated-document and stored-object catalogues
  -> five-minute signed download URL
```

Outside the Studio flow, the browser receives only workspace summaries and short-lived download URLs. When an operator deliberately opens Studio for an authorised job, the browser receives only that job's selected, server-built snapshot and the published DOCX template needed for editing. It never receives the Carbone credential, Supabase secret key, storage path, SQL capability, or data from another job.

## 2. What is already in the skeleton

| Area | Implementation |
|---|---|
| UI | `multideck.client/src/pages/documents-page.tsx` provides the document centre, published-template cards, a guided create workspace with embedded Carbone Studio, recent documents, error states, and fresh secure downloads. |
| Browser API | `multideck.client/src/lib/document-builder-api.ts` is the typed client for the four Edge Functions. |
| Localisation | Document-centre text is translated into English, German, French, and Arabic; the Arabic view is covered by an RTL test. |
| Edge gateway | `document-builder-workspace`, `document-studio`, `render-document`, and `document-download` authenticate the Supabase user before using the service client. |
| Shared security | `_shared/document-functions.ts` centralises JWT validation, service-key handling, UUID validation, safe errors, CORS, file-size limits, and signed-link lifetime. |
| Database API | The `document_api` schema contains service-role-only, security-definer functions for authorisation, dataset assembly, completion, failure, workspace listing, and download authorisation. |
| Audit | `DOCB_RenderJobs.DOCBRJ_InputSnapshotJSON` stores the exact JSON sent for rendering, together with the template version, actor, reason, timestamps, and correlation ID. |
| Persistence | Files are stored in the private `multideck-generated` bucket and catalogued transactionally in `DOCB_GeneratedDocuments` and `DOC_StoredObjects`. |
| Permissions | `Documents.Read`, `Documents.Generate`, and `Documents.Manage` are in the server permission catalogue and standard role definitions. |

The page is a reusable operational page, but it has deliberately not replaced or been exposed through the customer Live portal entry point. It must be registered in the authenticated MultiDeck operational shell when that shell is connected to this client package.

## 3. Security model

### Authentication and authorisation

Every function requires a valid Supabase access token. The function verifies that token with Supabase Auth and passes only the verified auth user UUID to the database API.

The database then fails closed unless all applicable checks pass:

- the auth identity maps to exactly one active MultiDeck application user;
- the user has the required `Documents.*` permission;
- the job is active;
- the job office belongs to the user's company;
- the user belongs to that office;
- the job has a resolvable customer;
- exactly one published Carbone template wins the scope-resolution rules;
- the requested output is `pdf` or `docx` and is enabled on the template;
- the current published template version is explicitly a Carbone version;
- the stored file being downloaded belongs to a job still visible to that user.

No browser storage policy is created. Storage access is granted only to the Edge Functions after the database authorises the exact record.

### Embedded Studio boundary

The Create Document dialog uses the self-hosted Carbone Studio `5.9.0` web component in `embedded` mode. The authenticated `document-studio` Edge Function retrieves the pinned component from the protected Carbone host, so Carbone credentials remain server-side. Template and preview requests use the same gateway.

- `document_api.prepare_studio_job_session` repeats company, office, job, template-scope and permission checks without creating a render job.
- The Edge Function downloads only the resolved published template from Carbone and returns it with the selected authorised job snapshot.
- Studio preview requests cannot send their edited JSON to Carbone. The Edge Function discards browser-provided data and rebuilds the authorised snapshot.
- Preview rendering uses `POST /render/template?download=true`; the PDF is returned directly and kept only in browser memory. There is no reusable Carbone render ID.
- Template save, deployment, deletion and version-management endpoints are not proxied from Document Builder.
- Final creation uses the current Studio DOCX but rebuilds the data again through `prepare_job_render`; the template SHA-256 and byte size are added to the render audit before generation.
- Carbone and Supabase secrets remain server-side.

The Studio version can be changed with the server-side `CARBONE_STUDIO_VERSION` secret. It must be a pinned semantic version compatible with the installed Carbone backend.

### Template resolution

Templates may be global or scoped to an office, legal entity, brand, and/or customer. The most specific matching template wins, using this priority:

| Scope | Weight |
|---|---:|
| Office | 8 |
| Legal entity | 4 |
| Brand | 2 |
| Customer | 1 |

If two published templates with the same code have the same winning specificity, rendering stops with an ambiguity error. Do not publish overlapping scope combinations.

### File controls

- Bucket: `multideck-generated`, private.
- Maximum object size: 50 MiB.
- Allowed MIME types: PDF and DOCX only.
- PDF and DOCX signatures are checked before upload.
- A SHA-256 hash is recorded in both document catalogues.
- Paths are partitioned by environment, authenticated MultiDeck company, aggregate type, exact job, year, and month.
- Downloads use a newly issued five-minute signed URL.
- A signed-link failure after catalogue completion does not remove the completed object; the user can retry from Recent documents.

## 4. Runtime sequence

1. The UI calls `document-builder-workspace` with the caller's normal Supabase session.
2. The workspace function returns only published templates visible to the user's offices, the latest 50 authorised documents, and permission flags.
3. The user chooses a template, enters the operator-facing job number (including tenant prefixes such as `JE`, `JI`, or `JQ`), chooses the allowed information and opens the job in Studio.
4. `document-studio` authorises the job and resolved published template, then loads the DOCX and selected job snapshot into the embedded component. Live previews are rendered through the same authenticated gateway.
5. The user arranges fields and chooses PDF or DOCX.
6. `render-document` validates the request shape. The browser cannot submit a table name, storage path, template ID, SQL or replacement job data. It may submit only the edited DOCX template.
7. `document_api.prepare_job_render` checks identity, permission, company, office, job, customer, template scope, version, and output format.
8. The same transaction assembles the fixed dataset and inserts a `rendering` row in `DOCB_RenderJobs`, including the immutable `DOCBRJ_InputSnapshotJSON`.
9. The function calls `POST {CARBONE_URL}/render/template?download=true` for a Studio-customised DOCX, or the published version endpoint for the unchanged fallback.
10. After validating the returned bytes, the function uploads to private Storage.
11. `document_api.complete_job_render` inserts `DOCB_GeneratedDocuments` and `DOC_StoredObjects` and changes the job to `completed` in one database transaction.
12. The function returns a five-minute download link. Future downloads go through `document-download` and repeat authorisation before creating a fresh link.

If steps 6-8 fail, the render job is marked `failed` with a sanitised operational message and any partially uploaded object is removed. Carbone response bodies and credentials are never returned to the browser.

## 5. Job Confirmation data contract

Lee should treat this structure as the version 1 public contract for the first template. Properties with no source value are omitted; `cargo` and `routing` are always arrays.

```json
{
  "meta": {
    "schemaVersion": 1,
    "generatedAt": "2026-07-31T12:00:00Z",
    "correlationId": "uuid",
    "templateCode": "JOB_CONFIRMATION",
    "templateVersion": 1,
    "languageCode": "en"
  },
  "job": {
    "id": "uuid",
    "number": 12345,
    "period": "2026",
    "createdAt": "2026-07-31T09:00:00",
    "status": "open",
    "direction": "export",
    "transportMode": "air",
    "origin": { "unlocode": "GBLHR", "name": "London Heathrow" },
    "destination": { "unlocode": "USJFK", "name": "New York JFK" },
    "readyDate": "2026-08-01",
    "requiredDeliveryDate": "2026-08-04",
    "officeId": "uuid",
    "legalEntityName": "Example Logistics Ltd",
    "brandName": "MultiDeck"
  },
  "customer": {
    "id": "uuid",
    "name": "Customer Ltd",
    "address": {
      "id": "uuid",
      "name": "Head office",
      "line1": "1 Example Street",
      "line2": "Business Park",
      "city": "London",
      "countyOrState": "Greater London",
      "postalCode": "SW1A 1AA",
      "countryCode": "GB",
      "unlocode": "GBLON",
      "email": "operations@example.com",
      "phone": "+44 ..."
    }
  },
  "shipper": { "id": "uuid", "name": "Shipper Ltd", "address": {} },
  "consignee": { "id": "uuid", "name": "Consignee Inc", "address": {} },
  "cargo": [
    {
      "id": "uuid",
      "lineNumber": 1,
      "commodity": "Garments",
      "description": "Cartons of garments",
      "packageType": "CTN",
      "packageQuantity": 20,
      "grossWeight": 320.5,
      "netWeight": 300,
      "weightUnit": "KGM",
      "volume": 2.4,
      "volumeUnit": "MTQ",
      "marksAndNumbers": "MD-001",
      "hsCode": "6203",
      "countryOfOrigin": "GB",
      "isHazardous": false
    }
  ],
  "routing": [
    {
      "id": "uuid",
      "sequence": 1,
      "status": "planned",
      "mode": "AIR",
      "origin": { "unlocode": "GBLHR", "name": "London Heathrow", "terminal": "T4" },
      "destination": { "unlocode": "USJFK", "name": "New York JFK", "terminal": "T1" },
      "plannedDepartureAt": "2026-08-02T08:00:00Z",
      "estimatedDepartureAt": "2026-08-02T08:20:00Z",
      "actualDepartureAt": null,
      "plannedArrivalAt": "2026-08-02T16:00:00Z",
      "estimatedArrivalAt": "2026-08-02T16:20:00Z",
      "actualArrivalAt": null,
      "vessel": null,
      "voyageNumber": null,
      "flightNumber": "XX123",
      "carrierBookingReference": "BOOK-123",
      "masterTransportReference": "123-12345675",
      "houseTransportReference": "HAWB-123",
      "isMainCarriage": true
    }
  ]
}
```

The canonical implementation is `document_api.prepare_job_render` in the migration. If this document and the function ever differ, the function is authoritative and the schema version must be advanced for a breaking change.

## 6. Lee's setup checklist

### A. Confirm the Carbone service

Lee must provide or confirm:

- production base URL, expected to be `https://docserver.multideck.app`;
- authentication method: full `Authorization` header, Basic username/password, or Bearer API token;
- Carbone API version, currently expected to be `5`;
- a successful health/render check from the Supabase Edge Function region;
- the intended template retention and backup procedure.

Do not place any Carbone or Supabase secret in a browser `.env` variable. In particular, never use a `VITE_` prefix for these values.

### B. Create the first Carbone template

1. Start with an editable DOCX or ODT source document.
2. Use the data contract above. Examples include `d.job.number`, `d.customer.name`, `d.customer.address.line1`, and arrays under `d.cargo` and `d.routing`.
3. Ensure optional values and empty arrays produce a clean layout rather than `null`, empty table rows, or broken punctuation.
4. Test long customer names, a multi-line address, no shipper address, no routing, multiple cargo lines, multiple route legs, large weights, and RTL text.
5. Upload the template to Carbone once. Retain the returned template ID.
6. After every production template change, retain the new immutable Carbone version ID. Published MultiDeck versions should use `versionId`; use the mutable template ID only during controlled development.
7. Keep the editable source in the agreed version-controlled or backed-up document library. Carbone IDs are references, not the source-of-truth design files.

Carbone's HTTP flow and tag syntax are documented at <https://carbone.io/documentation/developer/http-api/introduction.html>.

### Selectable document information

The first release exposes six server-controlled information sections: `job`, `customer`, `shipper`, `consignee`, `cargo`, and `routing`. `job` is always required. The client sends only these stable section codes; it never sends column names, SQL, JSON paths, or arbitrary data instructions.

Before rendering, `document_api.apply_job_render_content_selection` validates the selection, removes unselected sections from the audited snapshot, and adds explicit booleans under `d.selection`. Carbone templates can use those booleans to remove optional layout blocks. For example:

```text
{d.selection.customer:ifEQ(false):drop(table)}
{d.selection.cargo:ifEQ(false):drop(table)}
{d.selection.routing:ifEQ(false):drop(table)}
```

Place each `:drop(table)`, `:drop(row)`, or `:drop(p)` tag inside the corresponding optional Carbone layout element. The exact drop target depends on how the Word template is structured. This keeps layout decisions in the approved template while Multideck remains authoritative for which data is sent.

### C. Register the data source and template

Use data scope `job`. The data-source row documents the contract for authors; it does not grant dynamic table access. Runtime queries remain fixed in `document_api.prepare_job_render`.

The recommended records are:

```text
DOCB_DataSources
  code: JOB_CONFIRMATION_V1
  name: Job Confirmation v1
  data scope: job
  source table: Job_Header
  JSON schema: the formal schema for section 5
  sample JSON: representative, sanitised sample data

DOCB_DocumentTemplates
  code: JOB_CONFIRMATION
  name: Job Confirmation
  data scope: job
  default data source: JOB_CONFIRMATION_V1
  status: draft, then published after acceptance
  current version: 1
  default render engine: carbone
  default output: pdf
  language: en
  settings JSON:
    {"outputFormats":["pdf","docx"],"carbone":{"templateId":"CARBONE_TEMPLATE_ID"}}

DOCB_TemplateVersions
  template: JOB_CONFIRMATION
  version: 1
  status: draft, then published after acceptance
  render engine: carbone
  output format: pdf
  snapshot JSON:
    {"schemaVersion":1,"carbone":{"templateId":"CARBONE_TEMPLATE_ID","versionId":"CARBONE_VERSION_ID"}}
  change reason: Initial Job Confirmation release
```

Publish the version and parent template in one reviewed database transaction only after the Carbone template has passed staging acceptance. Set `DOCBTV_PublishedAt`, `DOCBTV_PublishedBy`, `DOCBT_CurrentVersionNo`, `DOCBT_UpdatedAt`, and `DOCBT_UpdatedBy` as part of that operation.

For a global template, leave office, legal entity, brand, and customer scope columns null. For a scoped override, populate only the intended scope columns and verify that no equally specific published row uses the same code.

### D. Provide the Edge Function secrets

Create a local, ignored secrets file for deployment. Do not commit it.

```dotenv
CARBONE_URL=https://docserver.multideck.app
CARBONE_API_VERSION=5
CARBONE_STUDIO_VERSION=5.9.0
CARBONE_TIMEOUT_MS=90000
MULTIDECK_ENVIRONMENT=production
DOCUMENT_ALLOWED_ORIGINS=https://YOUR-MULTIDECK-ORIGIN

# Choose exactly one authentication approach:
CARBONE_AUTH_HEADER=Basic REPLACE_WITH_ENCODED_CREDENTIAL
# or CARBONE_USERNAME and CARBONE_PASSWORD
# or CARBONE_API_TOKEN
```

Supabase automatically provides the project URL and server keys used by the shared function helper. The helper supports the current `SB_PUBLISHABLE_KEY`/`SB_SECRET_KEY` names and the legacy project key names during migration.

#### AWS Carbone prerequisite

The AWS Marketplace AMI must have Studio enabled before Multideck can use the embedded component. For the Parameter Store model documented by Carbone's AWS guide, verify these case-sensitive parameters and restart the EC2 instance after any change:

```text
CARBONE_EE_studio=true
CARBONE_EE_studioUser=USERNAME:PASSWORD
```

On current Carbone v5 installations the equivalent names are `CARBONE_STUDIO=true` and `CARBONE_STUDIO_USER=USERNAME:PASSWORD`; the `CARBONE_EE_*` names remain the legacy AWS AMI form. Do not add either value to the frontend. The Supabase `CARBONE_USERNAME` and `CARBONE_PASSWORD` secrets must contain the credentials accepted by `https://docserver.multideck.app`, which may be enforced by Carbone itself or the Nginx reverse proxy.

Ask the AWS owner to verify, without sending the password in chat:

- the running Carbone version is v5 and is compatible with the pinned Studio component;
- `GET /template/{published-version-id}` and `POST /render/template?download=true` work through the HTTPS hostname;
- the EC2 security group does not expose port 4000 broadly when Nginx or a load balancer is the public entry point;
- CloudWatch contains the `carbone-ee` logs and no request body or credential logging is enabled;
- template and render storage is shared through S3 before adding more than one Carbone instance.

The local implementation does not change AWS configuration. It consumes the existing HTTPS service only after the Supabase secrets and migrations are deployed.

### E. Deploy in order

Run from `multideck.server/Backend`. The production project reference is `aqtwypsuijxlnvtxpuxe`; verify the selected Supabase organisation and project before every write command.

```powershell
npx.cmd supabase@2.82.0 link --project-ref aqtwypsuijxlnvtxpuxe
npx.cmd supabase@2.82.0 db push --dry-run
npx.cmd supabase@2.82.0 db push
npx.cmd supabase@2.82.0 secrets set --env-file .env.document-production --project-ref aqtwypsuijxlnvtxpuxe
npx.cmd supabase@2.82.0 functions deploy document-builder-workspace --project-ref aqtwypsuijxlnvtxpuxe --use-api
npx.cmd supabase@2.82.0 functions deploy document-studio --project-ref aqtwypsuijxlnvtxpuxe --use-api
npx.cmd supabase@2.82.0 functions deploy render-document --project-ref aqtwypsuijxlnvtxpuxe --use-api
npx.cmd supabase@2.82.0 functions deploy document-download --project-ref aqtwypsuijxlnvtxpuxe --use-api
```

The migration creates the service-only `document_api` schema, registers the Carbone engine, and creates/locks down the private bucket. It does not insert Lee's template IDs.

In Supabase **Integrations → Data API → Settings**, include `document_api` in **Exposed schemas**. This lets the authenticated Edge Functions reach the RPCs through PostgREST. Keep schema usage and function execution revoked from `anon` and `authenticated`; only `service_role` receives execute permission.

The Supabase migration registers `Documents.Read`, `Documents.Generate`, and `Documents.Manage` and assigns them to the standard App roles. The matching .NET definitions remain for transitional tooling and parity checks; production authorisation does not depend on restarting the .NET server. Confirm custom roles explicitly because they do not inherit new permissions.

Finally, register `DocumentsPage` at `/documents` in the authenticated operational shell and make the navigation item visible only to users with `Documents.Read`. The page already hides generation and management actions according to the returned server permission flags.

### F. Record the advisor baseline

The live-project advisor baseline on 31 July 2026 already contained a large number of findings unrelated to this change. The document-builder subset included:

- `RLS Enabled No Policy` information notices on existing `DOCB_*` tables and `DOC_StoredObjects`. That is consistent with this release's deliberate service-only gateway, but direct grants and policies must be reassessed before any future browser template editor is enabled. See the [Supabase RLS/no-policy remediation note](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- errors on pre-existing `DOCB_*Summary` security-definer views. This pipeline does not call those views. They remain a separate database-hardening item and must not be used as a shortcut for the operational UI. See the [Supabase security-definer-view remediation note](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

The document migrations and four Edge Functions were deployed to the MultiDeck project on 4 August 2026. Security and performance advisors must still be compared with the inherited baseline; do not claim the Carbone release created or resolved unrelated project-wide findings without a before/after comparison.

## 7. API reference

All four functions require `Authorization: Bearer <the user's Supabase access token>` and use `POST`.

### `document-studio`

`action: "open"` accepts the template code, operator-facing job number and selected content sections. It returns the authorised DOCX and render options required by the embedded Studio. `action: "preview"` accepts the current DOCX template but replaces all browser-provided data with a newly authorised snapshot before returning a PDF preview. Neither action exposes the Carbone credentials or permits template management.

### `document-builder-workspace`

Request:

```json
{}
```

Returns published template summaries, the latest 50 authorised generated documents, and:

```json
{
  "permissions": {
    "canGenerate": true,
    "canManageTemplates": false
  }
}
```

### `render-document`

Request:

```json
{
  "templateCode": "JOB_CONFIRMATION",
  "targetType": "Job_Header",
  "jobNumber": "JE12345",
  "outputFormat": "pdf",
  "reason": "Generated from the MultiDeck document workspace"
}
```

Successful response:

```json
{
  "renderJobId": "uuid",
  "generatedDocumentId": "uuid",
  "fileName": "JOB_CONFIRMATION-2026-12345.pdf",
  "mimeType": "application/pdf",
  "fileSizeBytes": 48231,
  "signedUrl": "short-lived signed URL",
  "expiresAt": "2026-07-31T12:05:00Z"
}
```

### `document-download`

Request:

```json
{ "generatedDocumentId": "uuid" }
```

The function rechecks `Documents.Read`, company, office, job, current-version, and storage metadata before returning a new five-minute URL.

## 8. Acceptance plan for Lee and the product owner

Use staging first. Record the render job ID and correlation ID for each test.

### Functional acceptance

- A permitted user can see the published Job Confirmation template.
- A valid authorised job produces a readable PDF with the correct customer, addresses, cargo, and routing.
- DOCX output works only when enabled in `outputFormats`.
- Empty optional data produces a polished document.
- A long/multi-line dataset does not overlap, clip, or create unexpected blank pages.
- The page remains usable at desktop and narrow widths.
- Arabic UI renders right-to-left; an RTL document sample is reviewed separately if RTL output is required.
- Recent documents lists the output and a fresh download works after the original link expires.

### Negative security acceptance

- No token returns 401.
- A user without `Documents.Read` cannot open the workspace or download.
- A user without `Documents.Generate` cannot render.
- A valid user cannot render or download a job from another company or unauthorised office.
- A random job UUID, generated-document UUID, table name, storage path, and template ID reveal no record existence.
- A draft, retired, wrong-engine, malformed-reference, or ambiguous template cannot render.
- HTML, ODT, executable content, an invalid PDF signature, and a file above 50 MiB are rejected.
- The storage bucket is private and direct browser listing/download is denied.
- Browser source maps, network payloads, and logs contain no service-role or Carbone credential.

### Audit acceptance

- `DOCB_RenderJobs` records the actor, target, template/version, state, timestamps, reason, and exact input snapshot.
- The snapshot matches the visible output even if source job data changes later.
- `DOCB_GeneratedDocuments` and `DOC_StoredObjects` agree on bucket, path, MIME type, size, and SHA-256.
- A failed Carbone call leaves a failed render job and no orphaned storage object.
- A signed-link outage after completion leaves the catalogued private object intact for retry.

## 9. Publishing and rollback procedure

For every template change:

1. Create a new immutable Carbone template version; do not edit the published MultiDeck version in place.
2. Insert the next `DOCB_TemplateVersions` row as `draft` with the new Carbone version ID and a meaningful change reason.
3. Test with the version in staging using representative and edge-case snapshots.
4. In one reviewed transaction, publish the new version and update `DOCBT_CurrentVersionNo`.
5. Generate a production smoke-test document from a non-sensitive approved job.
6. Retain the prior Carbone and MultiDeck versions.

Rollback means setting `DOCBT_CurrentVersionNo` back to the last accepted published version in one reviewed transaction. Do not delete historical version rows, render jobs, snapshots, or generated-document catalogue rows.

## 10. Operations and support

Monitor:

- render counts and failure rate by template/version;
- Carbone latency, timeouts, and non-2xx responses;
- Edge Function errors without logging payloads or secrets;
- generated bucket size and retention;
- render jobs stuck in `rendering` beyond the two-minute function limit;
- failed catalogue/storage reconciliation checks;
- expiring Carbone credentials and successful rotation tests.

The current default Carbone timeout is 90 seconds, bounded to 5-120 seconds. Treat AI-created or user-created templates as untrusted until reviewed against the acceptance plan. Avoid placing secrets, internal notes, or unrelated financial data into future datasets.

For support, begin with the `renderJobId`. Inspect the render status, sanitised error, correlation ID, template/version, and Edge Function log for the same time. Never paste the input snapshot into an external ticket unless its data classification explicitly allows it.

## 11. Deliberate version 1 limits and next work

- Only `Job_Header`/Job Confirmation is implemented.
- The dataset includes job, customer, shipper, consignee, cargo, and routing. Charges are deliberately excluded from the first release.
- There is no browser template editor or template publishing workflow yet. Lee manages source templates in Carbone and the reviewed DOCB catalogue records.
- The `Documents.Manage` permission and UI navigation hook are foundations for that later workflow; they do not expose database writes from the browser.
- Invoices, quotations, bills of lading, airway bills, customs forms, and document packs need separate fixed dataset builders and permission/acceptance reviews. Do not generalise this function into arbitrary table or SQL input.
- Retention/deletion rules for generated files and immutable snapshots need product-owner and compliance approval before an automated purge is added.

## 12. Definition of done for the first release

The Job Confirmation release is complete only when:

- the migrations, server permission sync, four functions, secrets, and operational route are deployed to staging and production through the normal reviewed process;
- Lee has supplied the backed-up source template and pinned Carbone version ID;
- the data-source, template, and version records are present and unambiguous;
- all functional, negative-security, audit, layout, and RTL checks above pass;
- the Supabase security and performance advisors show no new document-builder issue;
- credential rotation, rollback, support ownership, and retention owners are recorded;
- the product owner signs off the rendered PDF against an approved Job Confirmation sample.
