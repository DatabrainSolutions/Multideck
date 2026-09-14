# Import declaration reference mapping

Local implementation, 14 September 2026. This is not a deployment or provider acceptance record.

The import Declaration section exposes MRN, Status, Declaration category, Type of declaration, Badge code, Job reference, Trader reference, Declarant’s reference, Agent’s reference, DUCR, customs LRN and MUCR/UCN, in that order. Export field composition is unchanged.

Sources inspected: authenticated [iCustoms Swagger](https://ihub-tdr.customscloud.co/api/documentation), its Import All Tags XML example, [API integration guide](https://icustoms.s3.eu-west-2.amazonaws.com/System-Documents/External/CDS/iCustoms_CDS_API_Integration_Guide.pdf), and [completion matrix](https://icustoms.s3.eu-west-2.amazonaws.com/System-Documents/External/CDS/CDS_Completion_Matrix_Import_Export.xlsx).

| Field | Connection |
| --- | --- |
| MRN, status, customs LRN | Read-only existing provider lifecycle state; not invented or editable |
| Category, type, trader reference | Existing XML mappings preserved |
| Job reference | Declaration/InternalJobReference, maximum 35 characters |
| DUCR | GoodsShipment/PreviousDocument, category Z, type DCR |
| MUCR/UCN | GoodsShipment/PreviousDocument, category Z, type MCR; matrix identifies MCR as including inventory references |
| Badge, declarant reference, agent reference | No confirmed CDS XML mapping in the inspected documentation. Stored with the draft; non-empty values produce explicit provider-validation errors rather than being silently discarded. Provider confirmation is required. |

MRN completion also handles a later document notification without a status transition. The webhook fills a missing submission MRN and persists declaration references; the editor keeps its bounded automatic checks active while an accepted declaration lacks an MRN. Reopening reloads the provider state. This repairs the existing read path used by the operator and preserves existing status-watch semantics; a separate MRN-arrival watch remains unsupported under the exception below.

## Required references and Customs preferences

Import review and the authoritative iCustoms submit/validate endpoints require both Badge code and a structurally valid DUCR. Incomplete Multideck drafts can still be saved. The shared pure DUCR rules use the single allocation-year digit, full registered EORI and hyphenated job reference, with a 35-character total limit. GB/XI identifiers require 12 numeric digits after the country prefix. Generation uses uppercase alphanumeric/hyphen job references, never truncates or manufactures an EORI, and retains its allocation year. It follows edits to its source job/office before submission; manual and submitted DUCRs are not replaced. Structural validity does not verify EORI registration or guarantee acceptance. Source: [HMRC DUCR guidance](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-2-references-of-messages-document-certificates-and-authorisations#recommended-format-of-ducr-declaration-unique-consignment-reference).

Admin → System Preferences → Customs preferences manages the full company registered EORI, active-office EORI overrides, and active/inactive provider/port/badge combinations. The protected company-scoped RPC allows Customs readers to consume settings; only active company administrators can save. It validates office ownership, detects stale saves and audits confirmed changes atomically. Badge selection persists the configured ID and provider/port snapshot alongside the badge code; legacy saved badge values are retained. No actual EORI or badge has been seeded. Job reference generation and configurable JC/JE/JI prefixes remain separate unfinished work.

Migration `20260914113000_customs_reference_preferences.sql` has only been exercised in isolated PostgreSQL fixtures, not applied to the connected tenant. Until applied, the UI reports setup unavailable. Deployment plus real tenant-admin save/reload and operator selection testing are required before calling this live.

## Dexter exception

Parties now includes DAN 1/2 and independent Representative, Seller and Buyer company/address/EORI fields. The iCustoms documentation's Create Draft / Import All Tags sample confirms Declaration/Agent, GoodsShipment/Buyer, GoodsShipment/Seller and AdditionalDocument TypeCode DAN with CategoryCode 1/2. Agent no longer inherits the declarant's name/address. These fields use existing draft persistence, shared validation and approved provider actions. Field-specific Dexter watches remain unsupported under this exception; no new watch is advertised. No provider-generated printed PDF has been verified, and provider deployment/round-trip remains required before claiming hard-copy delivery.

Exporter company/address selection now persists `exporterOrganisationId`, `exporterAddressId` and a separate `exporterEori`. The existing draft JSON path preserves these values and the common XML mapper consumes the separate EORI, retaining legacy identifier fallback only when the new field is absent. Dedicated exporter-field watches remain unsupported under the exception below; existing status watches are unchanged. The UI's DE/Box metadata is maintained locally against HMRC definitions, not fetched live from iCustoms: exporter name/address is DE 3/1, identification is DE 3/2, both Box 2.

The existing approved Customs draft actions pass the draft JSON to the same persistence functions; provider actions use the shared iCustoms validator and mapper. The new confirmed XML mappings therefore apply to both operator and Dexter provider saves. Unconfirmed fields return explicit unsupported mapping issues from that common validator.

Dedicated Dexter reads and field-level watches for these new reference values are not supported in this change. Do not claim reference-field watch support; existing declaration status watches remain unchanged. Extending the watch registry and event adapter is required before offering watches on these references.

Customs preference reads/writes/watches are explicitly unsupported in Dexter: no generic settings access is granted, and the Customs specialist prompt directs administrators to the protected settings screen instead of claiming access. This is a deliberate operator-only exception while the provider badge mapping is unconfirmed. The same authoritative submit gate validates operator and approved Dexter submissions. No new watch event is advertised.

No provider function deployment or sandbox round-trip verification has been performed. The three unconfirmed mappings are a release blocker for the full requested workflow. Do not mark the reference-field integration complete on the strength of local persistence or XML tests.

## Local verification for required references

New standalone import creation now defaults an untouched Declarant to the authenticated workspace company's name. It uses the configured default-office/company EORI when available and stores `declarantEori` separately from the display name. Missing configuration leaves that identifier empty and Review requires it; no address or registered identifier is invented. Changing the declarant via the existing company selector replaces its details/EORI, and manual changes clear the previous identifier. Existing records and partial manual entries are not overwritten. The shared XML mapper uses `declarantEori` when present, with the legacy `declarant` identifier retained only for older drafts. Three default/preservation tests and the provider mapping test pass; the browser check confirmed the existing selected declarant is preserved and its dropdown remains keyboard-accessible. No new real declaration was created solely for QA; provider changes remain undeployed.

- Production client build and iCustoms API Deno typecheck passed.
- 36 DUCR/provider tests, 2 import-reference review tests, 6 submission-gate contracts and 4 combobox contracts passed.
- Full access-regression runner passed 36 checks without skips; the new PostgreSQL fixture also verifies malformed settings rollback, admin/colleague boundaries, foreign offices, concurrent versions and audit persistence.
- Signed-in in-app browser on localhost: required markers and ARIA state, Review missing-field messages, keyboard dropdown opening/escape, settings-unavailable retry and responsive layout checked. No horizontal overflow or framework overlay at measured 869px and 355px CSS widths. No declaration values edited or filings made. Live preference save/autofill/selection remains unverified because the migration is not applied.
- The broader Dexter contract suite has four pre-existing failures (old submission-approval wording, old watch placeholder, email-draft approval expectation and old full-access email branch). The failing expectations were checked against HEAD; this change does not weaken them. Dexter settings read/write/watch remains explicitly unsupported.
# Transport controls (14 September 2026)

Verified against the iCustoms test application's transport section and iHub `Create a draft` / `Import All Tags Payload` example. Arrival type retains its code dropdown; Arrival transport ID remains editable and keeps the existing job-handoff `arrivalIdentificationNumber` value. Standalone drafts have no booking default.

The common XML mapper now sends inland mode through `Consignment/ArrivalTransportMeans/ModeCode`, loading location through `Consignment/LoadingLocation/ID`, address type and country through `GoodsLocation/Address`, and the separate additional identifier through `GoodsLocation/ID`. The existing goods-location identifier remains the location-name fallback, preserving old drafts. Address types observed in iCustoms: U (UN/LOCODE), Y (Authorisation Number).

Container IDs retain the original `containerId` plus optional `additionalContainerIds`, emitted as ordered `TransportEquipment` groups. Removed rows are absent from the next payload. GVMS uses its own `AdditionalInformation` group with RRS01 and the haulier value. Existing general additional information is retained independently.

These fields use existing saved-draft JSON and the common approved create/update mapping; no new permissions or watch capability is introduced. Dedicated field-level watches remain unsupported. Local contract tests verify payloads; provider round-trip and deployment remain unverified.
