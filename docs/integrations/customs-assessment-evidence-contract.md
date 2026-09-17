# CDS assessment evidence needed for reconciliation

Status: integration contract pending, not a provider payload specification.

## Submission-to-calculation binding — 15 September 2026

The submission preparation path now records a calculation link inside its
immutable declaration snapshot. Only the latest calculation for that declaration
can be linked, and only when its complete draft JSON, UK preparation date, rule
version and creation time match. Object-key order does not matter; input array
order does. An older, changed, missing or foreign calculation produces an explicit
unavailable link. No later calculation is silently substituted when a response
arrives. This identifies evidence, not approved manual tax or reconciled liability.

The retained-evidence reader projects only the validated link metadata; legacy
snapshots show no link. The local item evidence UI explains this distinction.
This remains within the documented Dexter assessment exception: automatic
assessment interpretation, reconciliation actions and assessment watches are not
claimed. Existing calculation/override operations and watches are unchanged.

Six linkage tests, 16 calculation-service/reader tests, the 26+10 access regression
checks, Deno entrypoint checking and client TypeScript passed. MultiDeck
`aqtwypsuijxlnvtxpuxe` now runs `icustoms-api` v110 with JWT required; all 45 runtime
files matched deployed readback. Anonymous access returned 401. No submission
was sent, so creation of a new link through a real provider submission is not
browser-proven. No hosted frontend release is claimed. Final assessment mapping,
persisted reconciliation and rule certification are still outstanding.

## Verified gap

### Multi-measure and partial-quota evidence — local, 15 September 2026

The reader now preserves the reported duty regime and rate. XML/JSON currency
confirmation matches the submitted response sequence, tax type, regime and rate;
it checks exact monetary values afterwards. It no longer treats every repeated
tax type as the same measure, and mismatched or one-sided rates cannot confirm
currency. Identical unresolved rows remain ambiguous, not position-matched.
The local evidence UI shows regime and reported rate without assuming the rate's
unit or labelling every numeric rate as a percentage.

HMRC's `CDS 03 DSSD v2.32`, “Processing of Partial Quota Allocations”, explicitly
describes three submitted goods items becoming five DMSTAX items and states that
the extra items cannot be associated by trader software. A test reproduces its
published tax rows: all ten duty/VAT facts survive, while response items 4 and 5
remain unlinked. Verified source currency is retained even on an unlinked row;
this does not make the row eligible for reconciliation. Never infer the original
item from amounts, commodity, ordering or an apparent allocation percentage.

Thirteen tax-reader tests and eleven XML/history tests passed, alongside the
client typecheck and Deno entrypoint check. These changes are local; v110 remains
the last deployed release. Full assessment comparison and persistence remain due.

The iCustoms CDS API Integration Guide inspected on 14 September 2026 documents
`GET /api/cds/v1/notification/{co_relation_id}` on page 26 and
`GET /api/cds/v1/GetDeclaration/{co_relation_id}` on page 32. Neither section
includes a response body or an item-tax assessment schema. The inspected OpenAPI
contract likewise exposes generic notification/declaration strings. Request XML
examples and successful submission acknowledgements do not establish assessed tax
fields. Do not use their amounts as if they were returned HMRC assessments.

Source: [iCustoms integration guide](https://icustoms.s3.eu-west-2.amazonaws.com/System-Documents/External/CDS/iCustoms_CDS_API_Integration_Guide.pdf).

## Required provider evidence

Obtain a redacted, structurally unchanged response and corresponding assessment
document from an existing test declaration. No new declaration submission is
authorised or necessary for this evidence request. Keep credentials, transport
headers, personal addresses and unrelated customer information out of fixtures.
Preserve number representations, arrays, item numbers, tax codes and timestamps.

The fixture set needs:

- An acknowledgement without assessed amounts, and a notification containing an
  actual assessment. Identify the event/message discriminator for each.
- Multiple goods items, with the provider's stable declaration and item identities
  and their relationship to the submitted item sequence.
- Customs value, VAT base, duty and VAT; currency and any precision indicators.
- More than one non-VAT tax type on an item, including how multiple measures of
  the same type are represented.
- Suspended, relieved or secured amounts alongside payable liability, and how
  payment methods such as postponed VAT are represented separately.
- An amendment/reassessment of the same item: assessment identity, sequence,
  supersession relationship, assessed date and notification receipt date.
- An incomplete or rejected declaration without a final assessment, and any
  declaration-level-only amounts that cannot be attributed to a goods item.

Ask iCustoms to identify the authoritative endpoint, message types and field paths
for these values, including missing/null semantics, numeric encoding, item-number
stability after amendments and whether an event is provisional or final.

## Implementation acceptance contract

1. Map only documented and fixture-verified response variants. Unknown variants
   retain their raw history and show that assessment interpretation is pending.
2. Link an assessment to its original submission snapshot and item mapping, never
   the current editable item order. Reject unknown, duplicate or ambiguous item
   identities instead of matching by amount, commodity or description.
3. Preserve the original source response and exact numeric text. A missing amount
   is not zero; a payment status is not an assessed liability.
4. Record a new assessment version on amendment. Never overwrite an earlier
   assessment or its comparison with the corresponding calculation version.
5. Compare bases and every tax type/disposition, as well as item and declaration
   totals. Do not report reconciliation from equal headline totals alone.
6. Keep rounding discrepancies visible. Mark's revised-rate example remains an
   unresolved precision gate, not a tolerance to suppress.
7. Verify tenant/declaration permissions for reads and reconciliation writes, then
   test the same operation through the operator UI and approved Dexter actions.

This evidence contract does not replace implementation. Raw provider-response
history and the deterministic comparison function exist locally; verified payload
mapping, persisted comparisons and the complete operator journey are still due.

## Retained-evidence review (local implementation)

The import calculation endpoint now offers a read-only `provider-evidence` page,
behind the existing declaration read permission and import-only check. It returns
five retained records at a time, with stable timestamp/UUID pagination. Only tax
facts and source metadata leave this projection; raw XML, bank identifiers,
request envelopes and declaration snapshots are not returned by this endpoint.
The expanded calculation panel loads it on demand and labels unknown currency,
indicative status, missing links and preview limits. It is not reconciliation.

Snapshot mapping follows the submission writer's schemaVersion 1:
`items[].itemNumber` maps to `items[].payload.id`; editable draft order is never
used. Duplicate sequences, unknown schemas and oversized responses fail closed.

Temporary Dexter exception: chat and Watching for you cannot interpret or watch
provider assessments yet. Currency, finality and liability disposition are not
verified, so exposing assessment-derived actions or notifications would be
misleading. Dexter explicitly states the limitation and points to the manual
retained-evidence review. Calculation-history reads, approved calculation/override
actions and calculation-change watches are unchanged. Full assessment parity
remains a delivery requirement, not completed by this exception.

Reader unit checks cover scoped queries, bounded pagination, private-envelope
projection, malformed cursors and database failures. This new endpoint and UI
are not yet deployed or verified through the browser/standard-user journey.

Release check: the PostgreSQL access regression runner passed 26 operational
and 10 supporting checks after adding the reader. Desktop and 390px mobile
inspection confirmed the calculation input widths and stacking on the synthetic
QA draft. Provider-evidence endpoint browser proof remains outstanding: the
deployment process is still pending, and remote inspection still reports
icustoms-api version 104 without the new reader. Do not treat the local view as
proof of the new remote read path.

Subsequent release: the unresponsive CLI attempt was terminated before retrying.
The authenticated Supabase connector deployed icustoms-api version 105 to the
approved MultiDeck project `aqtwypsuijxlnvtxpuxe`; source readback matched all 43
files and JWT verification remained enabled. Jenkar was not changed.
Browser verification on synthetic declaration `e3bef8ee-b618-4379-a0d0-f2128e97f237`
confirmed the on-demand loading state followed by the successful empty response
("No retained provider responses for this declaration"). No save, provider call
or submission was made. Populated-notice rendering, pagination and a second-user
browser journey remain unverified; the empty response alone does not prove them.

Populated browser check: existing accepted declaration
`015306f5-7a6b-4cc4-adf9-8c00000c3490` was opened read-only. Eight retained
responses paginated as five then three, with Refresh latest evidence returning
to the first page. Record `1599cc89-5e5f-4a0b-9908-b7ecec50e9d9` rendered as
Indicative customs debt with distinct Assessed amount and Payment amount rows,
currency Unconfirmed, and the snapshot-retention date disclaimer. Other
responses explicitly said no supported item-tax notice, not no tax due.
No save, recalculation, override, provider refresh or submission was performed.
This proves the populated reader journey, not final assessment reconciliation
or a second user's browser access. Customer amounts are not copied into fixtures.

## Precision investigation — 14 September 2026

Rechecked [HMRC CDS import Group 4](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes).
DE 4/4 accepts quantities with up to six decimal places; DE 4/6 and 4/7 accept
amounts with up to two. These are declaration field formats, not a specification
of CDS's internal rounding stages or the provider's returned monetary bases.
Do not infer that a displayed base was rounded before calculating its tax, or
apply quantity precision indiscriminately to returned assessed values.

Still required to close Mark's discrepancy: the calculation-stage precision for
currency conversion, shared-cost allocation, customs/VAT bases and each tax;
whether the displayed base differs from the computational base; and item versus
measure versus declaration rounding order. Obtain a source-backed response and
the corresponding assessment fixture. Until then retain exact source strings,
reject unsupported comparison precision explicitly, and keep auto-population
uncertified. The six-decimal DE 4/4 format alone does not resolve this gate.

### Calculation validity before comparison

Local reconciliation now refuses a complete match when the saved calculation
has unresolved declaration or item issues, or the item still needs information,
even if retained numerical amounts happen to agree. Known numerical differences
remain visible alongside the incomplete-evidence flag. Duplicate calculated item
IDs are rejected rather than allowing an ambiguous assessment link. The focused
calculation suite passes 75 tests, including these cases. This comparison change
is not yet deployed and does not certify any calculation family.

### Temporary admission partial-duty ledger

The local `customs-temporary-admission.mts` foundation calculates an entry charge
and a cumulative discharge balance from retained entry duty, reviewed chargeable
periods and earlier assessed TA duty. It preserves exact fractions, caps cumulative
duty at full entry duty, and rejects over-assessment rather than inventing a refund.
VAT is deliberately absent, not zero or suspended. Source:
https://www.gov.uk/guidance/temporary-admission-customs-technical-handbook/partial-relief
(reviewed 14 September 2026).

Three focused tests pass. This is not wired into draft preparation, the UI or
Dexter and is not deployed. Remaining integration: permission-checked entry
assessment/item linkage; dated authorisation and eligibility checks; validated
calendar-period counting; separate import VAT treatment; event-specific procedure
mapping; immutable history and workings; official precision fixtures. NI requires
its own rules, not reuse of the GB branch. Both NI and total-relief TA remain
included deliverables. No TA family is certified or enabled for auto-population.

## Authoritative precision source located — 14 September 2026

This supersedes the earlier statement that no dedicated precision specification
had been located. It does not yet resolve Mark's assessment discrepancy.

- Publisher: HMRC Software Developer Support Team.
- Pack: https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/resources/CDS_Technical_Documentation.zip
- Listed pack update: 20 August 2026.
- Member: `CDS_Technical_Documentation_20260820/CDS Supporting Documentation/Tax Calculation Processing - Rounding in CDS v1.5.docx`.
- Document issued: 11 May 2023; control table still says Draft.
- Pack SHA-256: `752810ed6e904e694bf14c1371df5dc81600fa7b179c8ae08c86066c568e63ce`.
- Document SHA-256: `6ab821b62841d7a8c7fd72c329cfcce1741867d2712d6870132e0fd1760b580f`.

Read the document text, both embedded Visio diagrams and the specific-duty image.
Recorded findings:

1. DMS value-building/apportionment and tariff amounts use truncation to two
   decimal places. Lost allocation pennies are not redistributed.
2. The ad-valorem diagram describes a two-decimal percentage split before cost
   allocation. The current exact-share/largest-remainder estimate is different.
3. VAT uses the rounded customs/additional/excise duty amounts; its final amount
   is truncated. This differs from feeding unrounded taxes into the VAT base.
4. The specific-duty diagram truncates the EU tariff exchange rate to four
   decimals before conversion; national UK specific duties avoid that conversion.
5. Currency inversion is unrounded except recurring reciprocals use ten decimals.

Next implementation must be stage-specific, not a global replacement of display
rounding. Resolve the document's older diagram note about converted item-value
truncation against its v1.4 change-log instruction against intermediate conversion
rounding; also establish the recurring-reciprocal rounding mode. Reproduce Mark's
retained fixture before certification. No rules or historical results were changed
by this source investigation.

## MultiDeck release verification — 15 September 2026

Approved project `aqtwypsuijxlnvtxpuxe` remained ACTIVE_HEALTHY. Released
`icustoms-api` v106 (43 files) and `agent-dexter` v244 (56 files), both with
JWT verification enabled. Exact deployed readback matched every staged file.
Only two API dependencies changed: calculation comparison validation and the
provider snapshot/declaration identity guard. Dexter's only change was its
explicit provider-assessment capability limitation; no unrelated edits shipped.

Pre-release: 87 calculation/parser/read-state tests plus 15 service/history
tests passed; both Edge Function entrypoints passed Deno checking. An anonymous
request to the deployed provider-evidence endpoint returned HTTP 401.

Authenticated Chrome verification against localhost:3000 loaded the synthetic
QA declaration's four retained calculation/override records and the correct
provider-evidence empty response through the deployed service. Original override
reason remained visible. No draft edit, recalculation or customs submission was
performed. This proves the local frontend connection, not a hosted frontend
deployment or complete second-user/Dexter lifecycle verification.

Temporary-admission integration and the newly sourced precision changes are
still unfinished and were not included. Automatic population remains gated.

## Mark fixture precision diagnostic

Exact-decimal local diagnostics now reproduce the first photographed base
£84,630.18 by truncating the converted goods value and the exact-share freight
allocation independently to pennies. However, first truncating the allocation
percentage to two decimal places, as described in the developer diagram, gives
£84,630.16. The second line yields £55,184.88 with exact-share stage truncation
versus £55,183.40 using the truncated percentage. These second-line values are
diagnostic outputs, not verified photographed assessment values.

The regression fixture preserves this disagreement; it does not select a
production policy. Customs-team/SDST confirmation must establish whether the
two-decimal percentage is display-only, or an actual computational intermediate;
whether converted item amounts are truncated before allocation; and the current
reciprocal precision/mode. Validate both item bases and all duty/VAT amounts,
not only the matching first base. No historical or live estimate math changed.

### Developer query / known-error cross-check

Reviewed the precision-related shared-string entries and their worksheet rows in
the same August 2026 HMRC developer pack:

- `CDS Trade Test Query Log V5.38.xlsm`: no rounding clarification found in the
  rounding/truncation/apportionment matches. Its apportionment response concerns
  quantity-based duty bases, not percentage-share precision.
- `CDS_Trade_Test_KEL_20260806.xlsm`, worksheet `sheet5.xml`, row 192: issue 211
  describes intermediate rounding during currency inversion, but its status is
  `Closed - Not a Defect - 07/04/2022`. It is not evidence of an unresolved current
  defect and predates precision document v1.5.
- The same worksheet rows 11 and 52 (issues 010 and 053) describe historic excise
  and exchange-rate rounding differences, both marked resolved 3 July 2019.
  Do not recreate those historic defects in the current engine.

These findings do not settle the percentage-share or recurring-reciprocal mode
questions. Use the versioned precision document and reviewed assessment evidence;
do not treat an old query/error description as the current calculation contract.

## Retained currency mapping confirmed

Read-only inspection of the previously reviewed indicative response confirms
that `notification[].hmrc_xml_response` retains `currencyID="GBP"` separately on
`AdValoremTaxBaseAmount`, `TaxAssessedAmount`, `PaymentAmount` and `DeductAmount`.
Only tag names/attributes were projected; no customer amounts or identifiers were
copied into fixtures. These attributes are absent from the corresponding JSON.

The currency adapter must parse the retained XML with attributes and decimal
strings preserved, reject DTD/entity expansion and oversized/deep input, and
match notification/item/tax identity and amounts against the retained JSON facts
before enriching them. Validate currency per monetary field; one GBP attribute
cannot establish the currency of every amount. Conflicts or ambiguous tax rows
must stay unconfirmed. XML currency does not prove liability disposition or
final assessment status. No regex-based whole-document currency inference is
permitted. The current deployed reader remains unchanged pending this adapter.

### Currency reader release

`icustoms-api` v107 now includes the bounded XML currency adapter, with
`fast-xml-parser@5.11.1` and its dependency integrity records in `deno.lock`.
Only matching item/tax identities and monetary strings receive a shared currency;
mixed, missing, duplicate or invalid evidence remains unconfirmed. It rejects
entities/DTD, oversized/deep XML and unsupported prefixed elements. Metadata
wrapping and default namespaces are covered. The UI displays confirmed currency
without implying finality. Seven reader tests and the service type check passed
with the frozen local lockfile. All 44 runtime files matched deployed readback;
the deployment readback omits `deno.lock`, so remote lockfile enforcement is not
proven. The direct parser import is version-pinned. JWT remains required.
Authenticated live populated-currency browser verification remains outstanding.

Authenticated Chrome verification subsequently passed against v107 through
localhost:3000. The previously reviewed indicative notice displayed GBP on both
tax rows, while retaining its indicative/not-final warning. Other retained rows
with missing or mismatched declaration snapshots displayed the attribution
warning and no tax facts. This verifies the populated reader path and local UI,
not final reconciliation, a hosted frontend release or new customs submissions.
No amounts, drafts or provider records were changed during this check.

### Official finality and liability evidence — next integration gate

The HMRC technical pack dated 20 August 2026, `CDS 03 DSSD v2.32.docx`,
DMSTAX response definition, explicitly maps Status/NameCode 67 to indicative,
115 to provisional and 4 to final customs debt. This supplies the source for
a future status adapter; the deployed reader has not yet adopted that adapter.
Source: https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/resources/CDS_Technical_Documentation.zip

The same definition distinguishes assessed liability from payment: PaymentAmount
is assessed tax less suspended/transferred amounts. Security rows omit
PaymentAmount rather than setting it to zero. STA subsidy rows can also omit it,
so absence alone must not classify every row as a security. Preserve zero versus
absence and classify TypeCode using the relevant dated code list. Final status
alone does not establish a complete comparable assessment: declaration/version
identity, item attribution, currency and liability disposition still require
validation before reconciliation can be marked complete. No production status
mapping or comparison persistence was enabled by this documentation update.

The subsequent local implementation now recognises HMRC codes 67, 115 and 4
as indicative, provisional and final respectively, independent of the provider's
display label. Unknown or multiple statuses remain unclassified. The UI labels
final notices as not yet reconciled; all classifications retain the existing
reconciliation gate. Eleven evidence-reader tests pass, including security and
subsidy payment absence, zero payments and finality classification. This change
has not yet been deployed; v107 remains the last confirmed backend release.

### Resumed release: status and declaration identity checks

Status classification was deployed to MultiDeck as `icustoms-api` v108, then
v109 added XML/JSON declaration identity checks. When either representation
supplies a response/declaration ID, functional reference or declaration version,
both must supply the same scalar value before confirming currencies. Repeated,
missing-on-one-side or conflicting identifiers leave currencies unconfirmed.
This prevents coincidentally identical amounts from confirming another revision.
Eleven notice-reader tests and eight XML/history service tests passed. The v108
authenticated Chrome journey displayed indicative debt and confirmed GBP; its
anonymous endpoint returned 401. Version 109 is ACTIVE with JWT required, and
all 44 deployed runtime files match readback. The final-notice classification
has synthetic test coverage; the observed live notice remains indicative.
Final assessment comparison/persistence and calculation certification remain
unfinished. The hosted frontend has not been deployed in this release.

### Final ordinary assessment comparison — local, 15 September

The provider-evidence reader now compares a final ordinary A00/B00 assessment
against the immutable calculation explicitly linked at submission preparation.
The audit lookup is declaration-scoped and bounded to the five response records
on the page. It never selects a newer calculation. Historical ownership, exact
draft content and creation time are checked without requiring today's rule
version to match a historical version.

The first adapter requires confirmed XML GBP amounts, percentage units, regime
100, zero explicit deductions, complete unique item links and assessed amounts
equal to payment amounts. Other payment/treatment cases remain unclassified;
this is not an inference that they owe zero tax. Comparisons retain exact penny
differences and identify declaration totals as derived from assessed items, not
as independently supplied HMRC duty/VAT header totals. Matching an estimate
does not certify its calculation rules.

Verification: 20 Node tests and 16 Deno tests passed, plus the API entrypoint
type check. New comparison results are read-time projections, not yet persisted
assessment records. UI presentation, persisted comparison history, Dexter
chat/watch assessment parity and hosted deployment remain pending. Dexter's
existing explicit unsupported-assessment exception remains in force; it must
not claim access to these new comparison projections until parity is wired.
No declaration was submitted by this work.

### Persistent comparison audit — local, 15 September

Added an incremental, not-yet-applied `Customs_AssessmentComparisons` migration
and the `/declarations/:id/assessment-comparisons` GET/POST service. POST accepts
only a retained source ID; the server loads the original calculation, derives
the comparison and records its adapter version. It does not accept client tax
figures. Accepted import declarations can receive audit annotations without
becoming editable drafts. The database rechecks write permission and source,
calculation and declaration ownership. A repeated source/calculation/version
returns the existing record without rewriting evidence or duplicating history.

The PostgreSQL fixture verifies shared colleague reads, foreign/read-only write
denials, anonymous/browser RPC denials, immutability, linkage and retry behaviour.
The full data-access runner passed (26 tests plus 10 scoped contracts); eight
assessment service/adapter tests and the API entrypoint type check also passed.
This storage/API change remains local until operator UI, Dexter chat/write/watch
parity and release verification are complete. No live migration or deployment
was performed in this step. Rule certification and specialist adapters remain
separate unfinished deliverables.

### Operator and Dexter wiring — local, 15 September

Added the `customs_assessments` exact-declaration evidence domain, approved
`record_customs_assessment_comparison` action and deterministic `assessmentEvent`
watch field. The database lifecycle fixture covers colleague reads, foreign
company denials, approval guard, notification deduplication, pause/resume and
revoked-owner silence. Action requests use the shared assessment endpoint and
cannot supply tax amounts or a filing path. Dexter prompts distinguish a saved
comparison from a certified calculation and an assessment event from every
provider response.

The item evidence panel now records comparisons and reads paginated history,
with submitted line numbers, exact GBP base/tax differences and missing-evidence
messages. Chrome verified the isolated QA declaration's existing £180/£416
figures stayed unchanged, source empty state and the recoverable comparison
history error while the new backend is not yet deployed. Light-mode layout was
visually reviewed. Saved-result, dark/mobile and live record/reload verification
remain outstanding; this is not full browser acceptance. No submission was made.

### Deployed assessment workflow — 15 September

Applied the comparison audit, Dexter parity and approved-action migrations to
the approved MultiDeck project `aqtwypsuijxlnvtxpuxe` only. `icustoms-api` v111
(47 runtime files) and `agent-dexter` v245 (56 files) are ACTIVE with JWT required;
every deployed file matched readback. Unrelated deployed runtime files were
preserved. No hosted frontend build was published; localhost uses this backend.

Live checks confirmed RLS, authenticated read-only table access, no anonymous
table access or browser RPC execution, mandatory action approval and the
assessment watch field. The preflight found nine permitted colleagues and zero
foreign/inactive allowed readers. The anonymous HTTP endpoint returned 401.
Security advisors reported no assessment-related finding.

Chrome on the isolated QA declaration loaded the deployed empty comparison
history successfully. Existing £180 duty and £416 VAT remained unchanged.
The mobile-width (390px) empty review wrapped without clipping; the viewport was
restored. Browser error logs were empty. There are currently 52 retained source
responses, none with the new submission calculation link, and no saved live
comparisons. Therefore live positive record/reload and final-assessment matching
are NOT proven. Do not retrofit a link or submit a declaration to manufacture
that proof. Positive recording, retries, permission boundaries and watches are
covered by disposable PostgreSQL/service fixtures; a genuine linked submission
is still required for provider end-to-end evidence. Dark-mode saved-result review
also remains outstanding.
