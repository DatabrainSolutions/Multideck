# Duty and VAT calculation implementation

Status: **active implementation, not production-certified**. No automatic
declaration tax population is enabled. This document is a delivery checklist,
not an assertion that the approved plan is complete.

## Connected-environment verification

### Deployed frontend and live calculation — 15 September, 08:42 BST

Frontend deployment `dpl_3AcT7KJM7MgQK6akunvxmoWtefhd` is READY and serves
`https://dev.multideck.app`. Both Vercel inspection and a fresh HTTP request to
the customs route confirm the new `app-DqbVHiuM.js` build. The existing branch
alias was assigned automatically. A redundant manual alias command was denied;
it did not prevent the verified automatic assignment. This deploy contains the
current shared checkout, including uncommitted changes, not just the base commit.
Root production and Jenkar were not promoted.

One live end-to-end QA calculation passed through Chrome on localhost using the
deployed `.70` backend and persisted audit: GB 4400, commodity 1512191000/CN,
preference 140, official measure 20284505, synthetic N990 review, £1,000 goods,
£500 freight and £400 VAT-only costs returned £0.00 duty and £380.00 VAT.
After reloading and reopening Invoice items, the UI restored "1 of 1 items
estimated" and the same totals. No captured browser errors were returned.
The synthetic review dates were committed through browser accessibility controls;
ordinary automated date fill alone had not committed them to React state.

The hosted customs route returns the new build, but a new hosted Chrome tab
timed out before authenticated UI inspection. The successful calculation test
therefore proves localhost UI against the real backend, not an authenticated
hosted-browser journey. No customs declaration was submitted. Estimates remain
separate from declared taxes; broader specialist certification and CDS rounding
are still incomplete and the full original goal is not claimed complete.

### Authorised-use adapter — `.70` backend deployed

GB 4400 with an evidenced full N990 authorisation now has a dedicated tariff
selection path and expanded-item review. The review binds commodity, origin,
measure, validity, prescribed use and supervision evidence. VAT remains separate;
the calculation does not confirm completion of use or add declaration documents.
Missing, expired, conflicting or additional conditions prevent a result. A
condition-only type 464 control is explicitly retained as a blocker.

The retained official 1512191000/CN fixture exercises preference 140 and returns
£0 duty and £200 VAT on a synthetic £1,000 invoice. Four focused tests, 90 existing
calculation tests, all 27 service tests, frontend TypeScript and diff checks pass.
The service test verifies audit persistence, unchanged declared tax and permission
denial. This is simulated persistence, not a live database or browser proof.
Fixture provenance is recorded alongside the complete tariff response.

Preference 115 has a selection path but still needs its own representative official
fixture. NI end-use, other procedure variants, completion/discharge lifecycle,
broader specialist treatments and exact CDS precision remain unfinished. This
change is not certified for automatic population. API v147 (59 files) and Dexter
v278 (56 files) now run `.70`, with JWT verification and exact complete file
readback. Dexter forwards the existing approved action to the same API; only its
rule-version file needed updating. No schema, access or filing changes were
deployed. Browser save/reload and hosted frontend deployment remain outstanding.

Final handoff at the user's request: the live API returned authorised-use measure
20284505 to the synthetic QA draft, rejected incomplete date evidence and produced
no invented totals. Anonymous API access returned 401. The review text and N990
document fields were entered through Chrome. Automated native date entry and
direct browser attachment were unreliable; a positive browser calculation and
date save/reload are not verified. The synthetic QA draft remains GB/4400,
1512191000/CN, preference 140 with clearly labelled synthetic evidence and an
incomplete authorisation review. No customs submission occurred. The full plan
is not complete and no rule family has been certified for automatic population.

### Processing filing evidence — API v146 deployed

The shared import validator now checks declared 4051 Article 86(3) claims:
F44 is paired with GEN86 / `Article 86(3)`, and document 9WKS must carry a
commercial-records reference ending in `see attached worksheet` and status AC.
Primary and repeatable document fields are supported; GEN86 may be at header
or item level. These requirements follow the [4051 completion instructions](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4051).
The UI and provider boundary use the same validator. It does not apply these
rules to exports, other procedures or 4051 without an Article 86(3) claim.

This is filing validation only: no OVR01, declared-tax amount, worksheet upload
or relief eligibility is manufactured by a calculation. Dexter calculation
and watch operations remain unchanged; customs filing is not an allowlisted
Dexter calculation action. There is therefore no new watch event or write
capability to expose. The current calculation version remains `.69` because
no arithmetic, input snapshot or reference selection changed.

Three focused completion tests and all 41 iCustoms tests pass, including XML
preservation, malformed/missing evidence, no automatic OVR01 and export
isolation. Frontend TypeScript passes. The approved Multideck API v146 contains
58 files, verified by exact full-file readback with JWT verification enabled.
Only the new validation module and two insertions into the existing live
iCustoms module were deployed. Hosted frontend deployment remains outstanding.

### Combined regression and saved NI failure path — 15 September

All 124 focused Node tests pass across calculation arithmetic, save-before-run,
draft matching, history requests, submission linkage, tariff FX, processing
allocation, quantity shares, read state and NI comparisons. Frontend TypeScript
and `git diff --check` also pass.

Chrome native controls recovered access to the existing synthetic QA draft
`e3bef8ee-b618-4379-a0d0-f2128e97f237`; extension debugger attachment remains
unavailable. Reloading the page, returning to Invoice items and expanding the
line confirmed that EUPRF statement code and `100` statement text persisted.
The earlier timed-out edit did save; it must not be reported as lost data.

Recalculating this deliberately incomplete NI/manual-rate preference example
against the connected backend returned **0 of 1 items estimated · 1 need
information**. Both the declaration and expanded item explain missing NIIMP,
the requirement for official tariff measures and the incomplete UK/EU risk
comparison. No new numerical estimate was invented. The previous override is
retained in history. The synthetic draft remains intentionally incomplete;
no submission or cleanup of its evidence was performed. This verifies one
save/reload and failure journey, not complete browser QA, rule certification
or a hosted frontend deployment.

### Mixed NI preference tariff conversion — `.69` backend deployed

Specific-duty FX discovery now uses each paired snapshot's UK/EU preference
code and corresponding reviewed measure. It no longer applies the UK DE 4/17
code to both datasets when EUPRF differs. This closes a gap where the correct
EU euro-denominated duty was selected but its conversion was not requested.

The service regression exercises UK 100/EU 300 and UK 300/EU 100 with a
synthetic EUR-specific duty, GBP alternative and retained 0.8572 GBP/EUR
publication. Both produce £102.86 EU duty for the reviewed at-risk case;
unavailable FX raises 503 without appending another result. Original draft,
publication and audit evidence are retained. All 26 service and two Dexter
action tests pass. These are arithmetic/service fixtures, not tariff
eligibility certification. GB original-input rate-date rules remain unresolved.

API v145 (57 files) and Dexter v277 (56 files) are deployed to Multideck
`aqtwypsuijxlnvtxpuxe`, with exact full-file readback and JWT checks. The API
overlay changes FX discovery and version only; Dexter changes version only.
No frontend deployment or automatic declaration tax population was enabled.

### Original-entry F44 evidence — `.68` backend deployed

The NI original-input 4051 adapter now requires F44 evidence on every consumed
original lot, not merely F44 on the release. This follows the
[4051 completion notes](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4051).
Evidence remains in the original-lot snapshot and per-measure workings. A
missing or blank reference on either lot prevents a declaration total and
identifies that lot. The local NI worksheet has a labelled multiline evidence
field; it does not assume an earlier declaration was checked.

Verified 90 calculation and 26 service tests, including the second-lot failure
and retained evidence, plus frontend TypeScript. API v144 (57 files) and Dexter
v276 (56 files) are deployed to Multideck `aqtwypsuijxlnvtxpuxe`; every file and
JWT setting matches the intended payload on readback. Only the allocation type,
NI release guard and version changed in the API; Dexter changed version only.
No frontend deployment, rule certification or automatic filing population.
Browser entry of EUPRF/100 timed out, so its save outcome on the synthetic QA
draft is unconfirmed and must be inspected before further edits or cleanup.

### NI preference mismatch — `.67` backend deployed

API v143 (57 files) and Dexter v275 (56 files) are deployed to the approved
Multideck project `aqtwypsuijxlnvtxpuxe`. Every file was verified by fresh
readback; JWT verification remains enabled. The scoped deployment preserves
unrelated live code. The frontend remains local.

The UK preference stays in DE 4/17. NIIMP plus item-level EUPRF statement text
can carry a different EU preference, following HMRC's
[Northern Ireland preference mismatch instructions](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes).
UK and EU origin reviews are independent; full-duty (100) needs no preference
proof. Duplicate, malformed, non-NI and quota overrides fail explicitly.
Import XML now preserves statement text (including XML escaping), using the
[published StatementDescription schema](https://github.com/hmrc/customs-declarations/blob/main/public/api/conf/2.0/schemas/wco/declaration/WCO_DEC_2_DMS.xsd).
This is schema/test proof, not a provider submission or CDS acceptance.

Verification: 90 calculation tests, 26 service tests, 40 iCustoms tests and two
Dexter action tests pass; frontend TypeScript and diff checks pass. Complete
captured UK/XI graphs exercise mixed full-duty/preference claims in both
directions, retaining evidence and correct risk selection. NI full-rate
alternative exclusions are limited to the paired comparison path; ordinary
NI selection remains fail-closed. No rule certification or automatic declared
tax population has been enabled. Connected browser checks remain incomplete;
the synthetic QA draft retains its earlier NI review and out-of-date result.

### NI paired preference comparison — deployed backend, local operator controls

Version `.66` backend is now deployed to approved Multideck
`aqtwypsuijxlnvtxpuxe`: API v142 and Dexter v274, 56 files each. Fresh readback
matches every scoped payload file and JWT verification remains enabled. Only
NI tariff comparison, draft routing and rule version changed in the API;
Dexter's rule version changed. The frontend remains local, not hosted.

The item screen now includes an unchecked non-distance-sale confirmation,
review date, consignment reference and multiline supporting evidence. Removing
the confirmation removes the draft exclusion; historical results are retained.
Frontend TypeScript passes. The paired controls and this review still require
browser save/reload, responsive/keyboard and connected success/failure QA after
the interrupted browser session is recovered. No automatic population or rule
family certification was enabled.

The comparison layer now accepts separate UK and XI origin reviews for an
unrestricted 200/300 claim. Each review is validated against its dataset,
origin, proof dates and selected official measure; UK proof cannot be reused
as XI proof. Prepared equivalent-duty measures retain the respective agreement
and transport evidence. Additional duties continue to block an incomplete
comparison. Stale reviews after changing to preference 100 are rejected.

Eighty-nine calculation tests pass, including a synthetic 0% UK / 4% EU
preference comparison that correctly remains at risk, missing/reused/expired
proof failures, source immutability and additional-duty protection. This is
now deployed in `.66`, with local operator controls. Saved-draft
routing now accepts `niPreferences` with both proofs for a reviewed 4000 NI
risk comparison; rates are compared after exact shared-cost allocation. The
two-invoice regression yields £4/£6 duty and £52 total VAT, retaining both
proofs without mutating inputs. Missing proofs prevent a declaration total.
Both datasets' preference options are returned separately. Twenty-seven
service/Dexter regression tests also pass. The local operator panel now uses
separate UK/EU disclosures, each with its own saved proof and dataset-filtered
measure choices. Adding or removing one review preserves the other; earlier
single-tariff evidence is retained but not reused for both agreements. The
frontend TypeScript build passes. Full official-fixture/service tests and
backend deployment are verified below; connected QA remains outstanding.
Mixed UK/EU preference-code claims remain unfinished.

Full captured UK/XI CO tariff service verification now passes. The complete
graphs initially block on the EU low-value-consignment measure; supplying the
existing dated non-distance-sale review (item `niLowValueExclusion`) yields
£0 duty and £200 VAT on the £1,000 synthetic item, with not-at-risk derived
from both preferential duties. The review and exclusion reason remain in the
prepared comparison evidence. Missing review does not drop the measure or
invent a result. Both source lookups, original draft/audit retention, unchanged
filing fields and denied audit permissions are covered; 26 service tests pass.
The low-value review control is now present locally; connected browser
verification remains outstanding. Automatic population remains disabled.

Current synthetic QA handoff (15 September): Chrome tab `642571144`, draft
`e3bef8ee-b618-4379-a0d0-f2128e97f237`, was recovered in Chrome browser `1`
(browser `2` is the in-app browser, not Chrome). Confirmed saved state is NI,
procedure 4000, preference 300, preferential/non-preferential origin CO,
commodity 7323930010 and manual rate source. A UK origin review was added;
the last confirmed proof value was `Q` after interrupted typing. A subsequent
paste attempt timed out, so its outcome is unconfirmed. No EU review was
confirmed. Remove disposable origin reviews and restore GB/5300/preference
100 after recovering browser control; preserve the draft and all audit history.
No real declaration or filing was touched. Do not infer save/reload success
or calculation success from these interrupted interactions.

Local review polish now gives each UK/EU evidence fieldset an accessible name,
distinct add/remove actions, and multiline agreement/transport evidence.
Chrome's accessibility tree confirms the named groups and multiline controls.
Frontend TypeScript and `git diff --check` pass. Full save/reload, narrow-screen,
keyboard and dark-theme verification of this paired editor remain outstanding;
the hosted frontend has not been deployed. The copy cleanup follows the
better-writing skill and retains the eligibility/estimate boundaries.

Source checked 15 September 2026: [HMRC not-at-risk guidance](https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu)
requires all applicable duties, including eligible preferences, in the UK/EU
comparison. This change does not certify preference eligibility or CDS precision.

### Release evidence precision — deployed version .60

- Entered release-assessment and payment amounts must reconcile in whole pennies. Fractional-penny inputs now return an explicit validation message rather than silently displaying a rounded subtraction. Numerically exact values with trailing zeroes remain accepted and their original text is preserved in the snapshot.
- This is an input-evidence invariant, not a resolution of CDS intermediate rounding or certification. Seven temporary-admission and 22 service/Dexter tests pass. Deployed API v136 (53 files) and Dexter v268 (56 files) to Multideck `aqtwypsuijxlnvtxpuxe`, retaining JWT verification. Fresh readback exactly matched every staged file. Only the temporary-admission helper and calculation version changed in the API; only the version changed in Dexter. Connected fractional-penny input verification remains outstanding.

### Inward-processing release: verified implementation boundary

Version `.65` connects the GB 4051 processed-products estimate to the complete
GB basis review, discharge evidence and official UK measures. It requires a
current H1/A, preference 100, no additional relief, no original-goods trigger,
and explicit confirmation that no prior tax payments or equivalence apply.
The processed-product value remains the source for valuation; the original
invoice and declared tax are not overwritten. A complete source-backed fixture
produces £32 duty and £206.40 VAT on £1,000 goods. This is an estimate test,
not a certified customs assessment.

Full-rate selection now leaves an explicitly mapped, unclaimed preferential
quota out of duty selection while retaining its source and conditions in the
audit. Unknown mappings and applicable safeguards/remedies still block rather
than disappear. The focused Node suite passes 91 tests; service, GB basis and
Dexter pass 31 tests; frontend TypeScript passes.

Deployed to approved Multideck `aqtwypsuijxlnvtxpuxe`: API v141 and Dexter v273,
56 files each, with JWT verification retained. Fresh readback matches every
scoped payload file. No hosted frontend was deployed. Chrome at 390×844 shows
the new fields stacked without clipping, multiline evidence with persistent
labels, and visible keyboard focus. Temporary review data was removed, the
synthetic draft restored to GB/5300, and All changes saved confirmed; the
viewport override was reset. Dark-theme verification remains outstanding. No
automatic population or rule certification has been enabled.

Connected `.65` success check: the synthetic GB H1/A/4051 declaration used
commodity 7323930010, origin CO, preference 100 and a complete explicitly
synthetic basis/discharge review. The retained official 3.2% measure produced
£48 duty on £1,000 goods plus £500 AP freight. £400 AV costs then produced a
£1,948 VAT base and £389.60 VAT. The UI displayed all allocations, the official
source URL, rule version and unused preferential-quota evidence. Declared tax
remained unchanged; the earlier override remained in history. Reloading retained
the same one-item estimate and totals. Initially uncommitted native browser-test
date inputs correctly produced Needs information rather than an estimate;
committing the dates through keyboard input resolved it. Test review removed,
manual rate mode and GB/5300 restored. The attempted commodity clear did not
survive the subsequent reload: 7323930010 remains in the synthetic draft. Origin
CO also remains because that required combobox has no empty selection; no real
declaration was edited or submitted.

The original-input GB rate-date question remains unresolved: fresh regulation
23 and TCTA sections 4/7/8 review establishes the basis and liability event but
does not provide sufficient explicit evidence here to copy the NI rate-date
algorithm. This is not a reason to enable original-input GB calculations with
assumed dates. The connected GB success above covers processed products only.

Local `.64` adds separate original-input duty bases to the deterministic engine.
Each selected measure retains its input lot, original GBP value, exact consumed
share, applicable rate date and evidence. Percentage duty uses the allocated
original value; specific components and structured bounds use the exact quantity
share. Discharge VAT continues from the processed-product value plus applicable
duty, without rewriting invoice values. Absolute bounds and product-level excise
rounding cannot be silently apportioned. The targeted suite passes 90 tests.

The NI 4051/F44 original-input adapter is now connected to saved worksheets and
deployed as API v140 and Dexter v272 on the approved Multideck project. Both
56-file deployment readbacks matched the scoped payload. Original classification
and origin drive deduplicated XI/UK lookups at the release date; original GBP
values remain retained entry values. Distinct original lots can share the same
tariff reference without losing either allocation. Evidence and consumption are
audited through the existing authorised calculation operation; no direct
arithmetic action is exposed. The service and Dexter suite passes 29 tests.

The operator selects the basis in the NI release review; original-entry date,
commodity and origin are available on each lot. Confirmations start unchecked.
This path requires reviewed EU at-risk treatment, F44, preference 100, complete
inputs, no prior taxes, and no equivalence or combined relief. Missing/deleted
output links, overconsumption, source mismatch and unconfirmed evidence block
the estimate. GB original-input rate-date rules, additional specialist fiscal
measures, cross-declaration consumption and prior-tax credits remain work in
scope. No rule family is certified by this change, and the hosted frontend is
not deployed.

Chrome QA for `.64`: the NI review was created by keyboard, switched to original
inputs, and retained its basis plus multiline authorisation evidence through
save/reload. All four applicable confirmations remained unchecked. The connected
API returned Needs information with no tax total for the deliberately incomplete
review. Temporary review data was removed and the synthetic draft restored to GB
5300. This proves the live failure path and persistence, not a completed official
original-input declaration. Responsive/dark-theme QA and a fully populated live
original-input estimate remain unverified.

- Additional HMRC technical-handbook evidence checked 15 September 2026: [duty calculation](https://www.gov.uk/guidance/special-procedure-inward-processing/how-duty-is-calculated-for-free-circulation-goods) ties liability to original goods contained in discharged outputs using the agreed yield; it distinguishes regulation 23 original-goods treatment from the ordinary liability basis. [Import VAT calculation](https://www.gov.uk/guidance/special-procedure-inward-processing/how-import-vat-is-calculated-for-free-circulation-goods) uses discharged-goods value including duty. Consequently the original-input adapter must retain **two valuation bases**: allocated original-input duty bases and an evidenced discharged-product VAT base. The common engine currently evaluates measures and VAT from one customs-value path, so substituting original allocation for `goodsValue` would be incorrect. Extend the calculation model explicitly; do not overwrite the linked invoice/product value. Specific/compound original-input quantities must also retain exact allocation precision rather than forcing fractional quantities into rounded strings. The precise GB tariff-rate date remains to be confirmed; EU Article 86(3) rate-date guidance is not by itself GB authority.

- `.63` deployed to approved Multideck `aqtwypsuijxlnvtxpuxe`: `icustoms-api` v139 (56 files), `agent-dexter` v271 (56 files). Both ACTIVE with JWT verification; every deployed file matches the scoped payload on readback. No unrelated checkout changes were published. Hosted frontend deployment and a connected saved GB review-result test are not yet proven. This release adds an audited basis review, not original-input tax computation or certification.

- GB editor Chrome QA on the synthetic declaration: keyboard Enter opens/closes the disclosure, Tab/Enter adds a review, all 14 policy answers begin `Not reviewed`, and changing `Yes` back to `Not reviewed` visibly clears the answer. The multiline evidence control has its persistent accessible label. Removed the disposable review, restored GB/5300 and confirmed `All changes saved`. This does not yet prove a full connected `.63` result or responsive layout; the backend remains `.62`.

- Local GB item review controls now capture separate entry/authorisation policy answers, the annual classification total and multi-line evidence, and display retained decision reasons separately from tax figures. Every boolean starts `Not reviewed`; clearing an answer removes it and server validation rejects the incomplete review. Frontend TypeScript and the three updated basis tests pass. Chrome responsive/persistence verification and `.63` backend deployment are outstanding. No tax-family certification changed.

- Local `.63` connects per-item GB basis reviews to the existing permission-controlled saved-calculation operation and immutable evidence payload. It rejects changed dates, NI reviews, changed procedures and deleted item links. The basis decision remains outside tax liabilities and cannot approve a processed-product or original-input calculation. Twenty-eight service/basis/Dexter tests pass, including audit retention, non-mutation and permission denial. UI entry/display and deployment are still outstanding; live backend remains `.62`.

- Local GB basis foundation: `customs-gb-processing-basis.mts` implements the reviewed regulation 23 trigger structure effective from 1 July 2026, including excepted goods, election/breach, reimport conditions and paragraph 5/6 exceptions. Annual classification thresholds use exact decimal comparison. A negative trigger result is expressly **not** processed-products approval. Three tests cover compulsory triggers despite paragraph 4 exceptions, threshold boundaries and invalid/NI/historic input. This helper is not yet wired to UI/service/Dexter or deployed; original-input duty and VAT remain incomplete and gated. It does not add a separate callable operation or bypass existing permissions.

- GB original-goods source review (15 September 2026): the current [regulation 23](https://www.legislation.gov.uk/uksi/2018/1249/regulation/23) XML has validity from 1 July 2026 and modification date 18 August 2026. Original-goods treatment can be elected/reserved, but can also be compulsory under paragraphs (3)/(4) or a regulation 22(3)(c) breach. The July amendment adds **excepted goods** to the policy conditions. Do not copy the NI processed-products review as a GB eligibility decision. The next GB adapter needs structured evidence of election, economic-condition examination, original policy/excepted-goods status and the applicable exceptions; yearly per-classification thresholds are not a per-invoice test. The current allocation worksheet provides quantities and values only and cannot establish these conditions. Regulation 18 concerns warehouse handling, not the inward-processing basis. The current sources do not yet resolve all rate-date/VAT rules needed for a complete original-input tax adapter, so that path remains unenabled.

- Regression verification after the `.62` editor persistence check: 128 Node tests pass across calculation arithmetic/draft handling, runner save sequencing, history races, NI comparisons, preference, returned goods, temporary admission and processing allocation. Three NI processing adapter tests pass, including malformed persisted JSON, invalid dates, non-string evidence and truthy non-boolean confirmations; rejected inputs remain unchanged and do not produce an item calculation. These checks do not certify missing rule families or resolve the CDS precision gate.

- Connected Chrome persistence check for `.62`: on the synthetic `QA-DUTY-VAT-AUDIT` declaration, selected NI/4051, added a blank processed-products review and entered a clearly synthetic entry reference. Autosave completed. A full reload retained NI/4051, the exact reference and all three unchecked eligibility confirmations. Removed the synthetic review and restored GB/5300; the UI confirmed all changes saved. This proves editor persistence, not an eligible live tax assessment. Responsive/keyboard review and a complete connected NI calculation remain outstanding.

- `.62` deployment: approved Multideck backend `aqtwypsuijxlnvtxpuxe`, `icustoms-api` v138 (55 files) and `agent-dexter` v270 (56 files), both ACTIVE with JWT verification. Full deployed file readback matches the scoped payload. The local item editor now exposes the NI 4051 processed-products evidence review, with no preselected eligibility confirmations. Frontend TypeScript and 26 focused service/adapter/Dexter tests pass. This editor still needs connected browser and save/reload verification; the hosted frontend is not deployed. No calculation family is certified by this release.

- Local `.62` wires the NI processed-products review into the saved draft and retained tariff selection. The unmodified XI/UK commodity fixtures plus explicitly synthetic eligibility/non-distance-sale evidence yield £80 duty and £516 VAT on £2,500 processed-product value, including £16 B05. Missing original-basis exclusion evidence, F44 and GB do not calculate through this adapter. Twenty-six service/adapter/Dexter tests pass. This has not been deployed or exposed in the review editor; no family is certified and filing amounts remain unchanged.

- Local NI processed-products adapter added for reviewed H1/A/4051 EU at-risk releases. It preserves the product value and official measure formulas and requires evidence excluding elected/compulsory original-input treatment, compliant discharge, release valuation and current risk. Prior payments, equivalence, combined relief and other routes remain gated. Source: [European Commission importation, inward processing](https://taxation-customs.ec.europa.eu/customs/customs-procedures-import-and-export/importation_en), checked 15 September 2026. This adapter is not yet connected to the draft/reference selector or editor, is not deployed and is not certified; synthetic tests verify guards, not actual tariff eligibility.

- Connected Chrome/localhost `.61` verification: the synthetic QA draft accepted one original lot (300 MTR, £1,000, 60 previously discharged) linked to 100 MTR consumption on a 4051 item. Confirmed save before calculation. Deployed service returned 140 MTR remaining and `≈ 333.33` allocated original value, with exact fraction retained. The item remained Needs information for its unimplemented tax treatment. Removed the synthetic worksheet and restored procedure 5300; historical calculation evidence was retained. Reload persistence and mobile/dark/keyboard checks remain outstanding.

- `.61` backend deployed to Multideck `aqtwypsuijxlnvtxpuxe`: API v137 (54 files) and Dexter v269 (56 files), JWT verification retained. Every file matched the staged payload on fresh readback. The API overlay contains the new allocation module, draft adapter, result type and version; Dexter changes only its rule version. Frontend remains local.

- The local saved-result view now presents prior discharge, consumption, remaining quantity and per-output allocated original value using the retained lot snapshot. Non-exact displays carry an approximation marker; the formula and consumption evidence remain visible. It does not read edited original values into past workings or label allocations as tax. Browser layout/save-reload checks and deployment remain outstanding.

- The local item calculation panel now exposes a declaration-shared original-lot/consumption editor for 4051/4054 or retained worksheets. Inputs use persistent labels and an adaptive grid, output choices come from actual release items, and linked lots cannot be removed before their consumption is reassigned. Backend calculations still own arithmetic. Browser save/reload, responsive/keyboard checks, result-detail presentation and deployment remain outstanding; this is not completion of the inward-processing tax adapter.

- Local `.61` connects the reviewed consumption worksheet to the shared saved-calculation operation. Results retain exact allocations alongside the original draft; they do not replace processed-product prices or tax liabilities. Matching import jurisdiction, existing 4051/4054 output links and bounded worksheet size are required. Twenty-three service/Dexter tests pass, including audit retention, overuse, deleted-item/procedure changes and permission denial. The editor, actual procedure-specific duty/VAT basis and deployment remain unfinished.

- Local allocation foundation: `customs-processing-allocation.mts` retains original entry/item quantities and GBP values separately from processed-product invoice values. Reviewed consumption produces exact rational value shares; prior discharges reduce availability. Tests reject overuse across outputs, duplicate original items under different lot IDs, missing evidence and incompatible units, and verify immutable snapshots. No automatic yield or unit conversion is inferred. This foundation is not yet wired to the draft/UI or a tax-basis adapter and is not deployed.

- Source checked 15 September 2026: [HMRC moving processed or repaired goods into free circulation](https://www.gov.uk/guidance/moving-processed-or-repaired-goods-into-free-circulation-or-re-exporting-them), updated 6 August 2026. The authorised duty basis may use goods entering inward processing or goods released to free circulation; changing the agreed method requires supervising-office approval. Records include original/discharge references, quantities, yield and equivalence.
- Current implementation has no inward-processing release adapter. Do not reuse the ordinary or temporary-admission calculation merely because the requested procedure starts with 40. The remaining implementation needs the authorised basis, linked original inputs and processed outputs, yield/allocation evidence, relevant dates and separate VAT treatment. GB and NI need independently sourced rules. This source review is not implementation or certification.

### Version .59 connected history and safety verification

- Recalculated the existing synthetic QA import in Chrome on localhost against the deployed API. Its GB/5300 item correctly returned `0 of 1 items estimated · 1 need information`, with a specific specialist-treatment message and no invented declaration totals.
- Expanded item history loaded the new saved result without a manual refresh. Source evidence displayed rule version `2026-09-15.59` and calculation date `2026-09-15`. The previous £181 duty / £416.20 VAT override remained visible but required reconfirmation; its review action stayed disabled while the item had no valid estimate. No filing fields, override or customs submission were changed.
- Nineteen targeted save/recalculate, draft-match, history-request, read-state and submission-link tests passed. These cover save failure and uncertain responses, stale rules/dates, wrong declaration links and export rejection. They are not proof of complete tax-family certification. The duplicate-payment scenario itself still needs connected browser coverage.

### Duplicate release-payment protection — deployed version .59

- The release-balance path now checks all item worksheets before returning any balance. Reusing the same original entry, original item and tax type blocks both affected worksheets; case/spacing differences in entry references and numeric item forms such as `01`/`1` do not evade the check. Separate original items remain valid. Source inputs are retained unchanged.
- This implements the declaration-local part of the no-double-deduction requirement. Cross-declaration payment ownership and evidenced allocations for partial releases still need a retained payment ledger; the worksheet must not be represented as solving those cases. It remains separate from customs/VAT valuation and does not change declared tax.
- Official basis checked 15 September: [4053 completion rules, DE 4/4 and 4/6](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4053) require previously paid revenue and the remaining amount by tax type, supported by the original entry reference. A deferment balance, guarantee or unpaid assessment is not substituted for a payment.
- Verification: 92 calculation/TA tests and 22 service/Dexter tests passed, including duplicates, distinct original items, immutable saved data and permission denials. Deployed the scoped overlay to Multideck `aqtwypsuijxlnvtxpuxe`: API v135 (53 files) and Dexter v267 (56 files), both ACTIVE with JWT verification. Every deployed file exactly matched the reviewed payload on fresh readback. API changes were limited to the draft adapter, temporary-admission helper and version; Dexter changed only the version. The new duplicate scenario has not yet been exercised through the connected browser. No hosted frontend deployment or customs submission was performed.

### Successful connected NI release estimate — 15 September 2026

- Chrome/localhost against deployed `.58` calculated the existing synthetic QA item using the live official XI and UK responses for commodity `7323930010`, origin CO, with reviewed NI at-risk normal 4053 release after total TA relief. Eligibility evidence was explicitly synthetic; this is application/integration verification, not Customs-team acceptance of an actual consignment.
- Workings matched: £1,000 goods + £500 AP freight = £1,500 customs value; A50 at 3.2% = £48; + £400 AV VAT-only adjustment gives £1,948 VAT base; 20% VAT = £389.60. Separate B00 £380 and B05 £9.60 were shown. The overview and item both showed one item estimated and matching totals.
- The retained-source panel showed calculation version `2026-09-15.58`, XI duty measure `2771475`, UK VAT measure `-1012545436`, retrieval timestamps, the dated non-distance-sale review and original-entry evidence. Previous override remained separate and required reconfirmation; it did not replace the new estimate. Declared tax stayed unchanged.
- Mobile at 390×844: release fields stacked into one column with readable persistent labels, wrapping checkbox copy and the evidence input within the viewport. Reset the viewport afterwards. Dark-mode verification remains outstanding.
- Removed synthetic release-review and movement/risk evidence, restored GB/5300 and manual arithmetic source, cleared temporary commodity/origin, and confirmed All changes saved. Saved calculation history was retained. No new override or customs submission was made.

### Version .58 deployment and connected review checks — 15 September 2026

- Deployed the reviewed calculation-only overlay to Multideck `aqtwypsuijxlnvtxpuxe`: `icustoms-api` v134 (53 files) and `agent-dexter` v266 (56 files). Full file-content readback exactly matched both payloads; both functions are ACTIVE with JWT verification enabled. Unrelated checkout changes were not included. This supersedes the earlier local-only notes below for these backend modules; the frontend is still localhost, not hosted deployment proof.
- Chrome on the synthetic QA declaration: selected NI/4053, added the optional non-distance-sale evidence review, saved dated consignment/evidence values, reloaded and confirmed all three values and the checked state persisted. Desktop field labels, alignment and keyboard focus were visually readable.
- Invoked the connected calculation with deliberately incomplete release inputs. The server saved Needs information with specific release-evidence messages, zero estimated items, no totals and no populated tax amounts. This proves the deployed rejection path, not the complete successful live-reference path.
- Removed the temporary release review and restored GB/5300; All changes saved was confirmed. Calculation history is retained. No override or customs submission was made.
- Local checks for this release: 86 core calculation tests, 20 service tests, 2 Dexter action tests and client TypeScript passed. Remaining: successful connected official-reference release, mobile/dark-mode review, full specialist-rule coverage and CDS precision certification. Automatic population remains disabled.

### NI normal temporary-admission release — local work, not released

- Local version `2026-09-15.58` adds an evidence-gated Article 85 normal-release adapter for NI 4053/H1/A after total relief, with EU at-risk treatment, release-date valuation and no prior tax payments or processing. Synthetic calculation tests cover separate B00/B05 amounts and rejected eligibility cases. This is not a complete NI release implementation or a certified calculation.
- The unmodified 15 September XI commodity publication exposes unresolved low-value duty (type 107), supplementary-unit and alternative fiscal measures. The real service test must produce Needs information, no tax figure and no total, retaining the input and audit. Its previous success expectation was incorrect; synthetic arithmetic is not proof that this real tariff can be selected safely.
- The operator warning now names the missing intrinsic-value and distance-sale review. [European Commission guidance](https://taxation-customs.ec.europa.eu/news/guidance-and-legal-text-temporary-flat-fee-low-value-imports-which-will-apply-until-1-july-2028-2026-06-08_en) describes the temporary low-value duty introduced on 1 July 2026. No exclusion is inferred from the invoice amount or procedure alone.
- Still required: a source-validated measure-selection path, connected UI verification and reviewed deployment. Backend remains version `.57`; `.58` is not deployed. Full-plan precision certification and specialist-rule coverage remain open.
- Subsequent local selector work separates EU customs duties from the paired UK VAT graph. It preserves excise and unknown fiscal blockers from the UK graph, and all additional EU fiscal measures. Explicit XI preference-100 selection now retains but does not claim correlated 142/200-or-300, 119/119 and 117/140 alternatives; missing correlations still block. Import supplementary measure 110 is recognised only with non-monetary expression 99. Source basis: [HMRC NI applicable-duty guidance](https://www.gov.uk/guidance/how-to-make-sure-the-correct-duty-is-applied-to-goods-you-bring-into-northern-ireland-from-countries-outside-of-the-eu-and-uk), [preference correlations](https://uktrade.github.io/tariff-data-manual/documentation/data-structures/preference-codes.html), and [supplementary-unit definitions](https://uktrade.github.io/tariff-data-manual/documentation/trade-policies/supplementary-units.html), checked 15 September 2026 against the retained XI response.
- Verification: 85 core calculation tests and 22 service/Dexter tests passed. The real XI fixture now identifies only the unresolved low-value duty among alternative fiscal measures, rather than incorrectly reporting the UK VAT graph's customs alternatives. This is narrower evidence of correct selection, not proof of a successful real NI release calculation. No deployment or automatic population was enabled.
- The next local increment adds an optional dated non-distance-sale review to the NI release editor and audit input. It excludes only the exact temporary type-107 EUR 3 measure during its stated period, with no measure conditions, qualifiers or unresolved references. It does not derive eligibility from invoice amount, business status or procedure; distance sales, missing/stale evidence and changed measure shapes remain blocked. The dated consignment reference, evidence and official source are retained in calculation workings.
- Service verification now exercises the **unmodified** XI/UK publications twice: missing review blocks; synthetic reviewed non-distance-sale evidence yields £32 duty on £1,000 at the published 3.2%, with separate B00/B05 output. This proves service wiring against retained references, not the authenticity of the synthetic eligibility evidence or CDS precision. 86 core tests and 20 service tests pass; frontend browser QA and deployment remain outstanding.

### Northern Ireland partial-relief discharge ledger — 15 September 2026

- Version `2026-09-15.57` adds a separate NI discharge path using retained entry-assessment duty in GBP and reviewed chargeable periods. It requires explicit original tariff/risk/currency evidence, does not infer EU liability from destination, and does not reuse the GB first-month collection rule. VAT, eligibility determination and calendar-period counting remain separate deliverables.
- GB/NI worksheet mismatches fail closed. Monthly balances cannot stand in for free-circulation release liabilities under 4053, 4253 or 4453. The worksheet remains outside declaration totals and does not populate tax fields.
- Official basis: [HMRC jurisdiction guidance](https://www.gov.uk/guidance/temporary-admission-customs-technical-handbook) points NI to UCC rules. The [European Commission customs-debt guidance](https://taxation-customs.ec.europa.eu/document/download/b5844d5a-0c43-4940-be4b-462dec0a10a3_en), May 2024 revision 2, section III.1.1.2, specifies entry-basis duty, monthly/part-month charges and discharge collection. Its EUR example is not treated as a GBP assessment fixture. The test's £720 × 3% × 3 = £64.80 is explicitly synthetic GBP arithmetic.
- Source review also confirms that planned release, auction sale and non-compliance/diversion must not share an assumed valuation event: [4053 instructions](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4053) and [HMRC customs-debt guidance](https://www.gov.uk/guidance/temporary-admission-customs-technical-handbook/customs-debt). The complete release-liability adapter is still outstanding; no inferred date/value rule was enabled.
- Verification: 88 calculation tests, 21 service/Dexter tests and TypeScript passed. Tests cover jurisdiction mismatch, missing evidence, entry/discharge distinction, release-procedure rejection, immutable audit input and permission denial. API v133 / Dexter v265 deployed to the approved Multideck project with JWT verification; all 52/56 deployed files exactly matched their reviewed payloads on readback. Frontend changes are local.
- Connected Chrome QA on the synthetic declaration showed the NI-specific evidence field, discharge default and £64.80 cumulative/additional duty for the synthetic £720/three-period case. The ordinary item remained Needs information with no declaration total. Restored GB, procedure 5300 and the original blank entry worksheet; saved history is retained. No customs submission or override was saved.

### Preserve override drafts across recalculation — 15 September 2026

- An open override is now bound to the calculation it was opened against. Overview or item recalculation, and a manual history refresh, cannot silently move its replacement values onto a newer calculation. The amount and reason remain visible; saving is disabled until the operator explicitly reviews the latest workings. A line without a valid estimate cannot accept the retained override.
- Connected Chrome QA: ordinary synthetic item showed £180 duty / £416 VAT. Entered an unsaved £181.25 replacement and a reason, then recalculated from the overview. Both inputs survived, Save override was disabled, and the review action re-enabled it. Cancelled without saving the override; restored procedure 5300 and saved the QA draft. No customs submission.
- 91 targeted calculation/history tests, TypeScript compilation and the production client build passed. Vite retains large-chunk warnings. This is local frontend verification; it is not a hosted deployment or calculation certification.

### Mixed-item browser flow and history refresh — 15 September 2026

- Verified through the connected localhost UI with the synthetic QA declaration: one existing 5300 item plus a temporary ordinary 4000 item, each £1,000. Shared £500 freight and £400 VAT-only adjustment kept equal shares. The ordinary item showed £150 duty and £320 VAT; the specialist item showed Needs information. The overview correctly showed 1 of 2 estimated, without declaration totals.
- Browser testing found an open item panel kept old history after an overview calculation. It now refreshes on the saved-calculation event while retaining its displayed figures and editable inputs; generation/revision checks reject stale responses. The initiating panel retains its own awaited refresh rather than duplicating requests. Open overrides retain their original calculation binding and require review when that calculation changes.
- Item warnings exclude other lines' scoped eligibility messages. A valid partial result explains that other items need information and declaration totals are incomplete. Declaration-wide problems remain visible.
- The overview-to-open-panel recalculation was verified without pressing Reload: the current £150/£320 figures and breakdown control remained available, without the stale-history warning. Client TypeScript and diff checks passed. The temporary item was removed and the single-item draft saved; calculation history was retained. This frontend fix is local, not hosted deployment proof.

### Mixed-item eligibility — 15 September 2026

- Version `2026-09-15.56` scopes item eligibility failures to the affected line instead of erasing all line estimates. Every item remains in shared-cost allocation: a blocked specialist treatment does not redistribute its freight or insurance to valid items. Declaration totals and automatic population remain unavailable while any line is incomplete.
- Missing allocation denominators, ambiguous shared adjustments and quota-ledger failures retain their declaration-wide safeguards. Mixed warehouse-entry procedures also remain declaration-wide because the existing 7100 adapter requires all items to share that entry treatment.
- Tests: the £600/£400 split with £500 freight and £400 VAT-only adjustment retains £108 duty / £249.60 VAT on the valid line, while the incomplete specialist line keeps its allocation share but no tax result. Missing goods value and ambiguous shared-cost evidence block the valid line too. Warehouse preference evidence fails only its affected line; invalid shared warehouse conditions still block all lines. 106 calculation tests and 20 service/Dexter tests passed, including immutable saved input and complete audit of a mixed result.
- Approved Multideck deployment: API v132 (52 files), Dexter v264 (56 files), ACTIVE with JWT verification. Exact full source readback matched both reviewed bundles. The subsequent mixed-item browser journey is documented above. No permissions, schema or customs submission routes changed.

### Returned-goods relief — 15 September 2026

- Version `2026-09-15.55` adds the GB 6110/6123 F01/F05 calculation adapter. F01 retains ordinary VAT as payable; F05 retains VAT as relieved only with identical exporter/importer EORI and VAT eligibility evidence. Ordinary duty formulas (including specific/compound components) are retained as relieved liabilities, not replaced with a guessed zero tariff rate. Relieved duty does not inflate payable VAT.
- Required evidence covers the original export/item/date, GB free-circulation status, goods identity/quantities, unchanged condition, reimport valuation, outstanding-refund repayment and the three-year limit or HMRC waiver. Agricultural, excise, processing, authorised-use, combined-relief and NI routes still need their own adapters; this is not completion of those deliverables. Official ordinary UK measures are required. Eligibility remains operator-reviewed and automatic population remains disabled.
- Expanded calculation inputs provide the review using existing saved draft, calculation, audit, override and Dexter operations; there is no separate AI engine or permission change. The UI-copy pass keeps relief choices explicit and evidence labels concise.
- Verification: 105 calculation/preference/TA/returned-goods tests and 19 service/Dexter tests passed; client TypeScript passed. Tests cover F01/F05, exact specific/compound formula preservation, evidence failures, dates, matching EORI, incompatible treatments, retained real tariff data, immutable input and denied audit writes.
- Approved Multideck backend: API v131 (52 files), Dexter v263 (56 files), ACTIVE and JWT-protected. Every deployed file matched the reviewed payload on readback. Connected localhost QA using the retained-origin scenario showed £1,500 customs value, £48 relieved A00, £0 payable duty, £1,900 VAT base and £380 payable VAT. Save/reload retained evidence and the result. Removing the ordinary-goods confirmation returned Needs information with no estimate. The original 5300/000/manual-rate test setup was restored, the temporary review removed, and the draft saved; audit history remains. No customs submission. Hosted frontend and full F05 browser verification remain separate from this proof.
- Rules: [HMRC F01/F05 completion instructions](https://www.gov.uk/government/publications/appendix-2-de-111-additional-procedure-codes-of-the-customs-declaration-service-cds/additional-procedure-code-f-series-appendix-2a) (updated 19 August 2026), [returned-goods eligibility](https://www.gov.uk/guidance/pay-less-import-duty-and-vat-when-re-importing-goods-to-the-uk-and-eu), reviewed 15 September 2026. This adapter estimates liability disposition; it does not certify a relief claim or replace declaration-completion checks.

### Temporary-admission release reconciliation — 15 September 2026

- Calculation version `2026-09-15.54` separates GB procedure 4053 release assessment balances from the 3%-per-month partial-relief ledger. A monthly ledger cannot stand in for the release liability. Each release tax records the assessed liability, revenue already paid and supporting references; overpayments, duplicate taxes and missing evidence fail closed.
- This worksheet reconciles operator-supplied assessment evidence; it does not calculate the full release liability, certify HMRC precision, populate declared tax or complete all temporary-admission treatments.
- The release worksheet is available in expanded item calculation inputs, with saved per-tax workings. The connected synthetic QA declaration returned `A00: £1000.00 − £120.00 = £880.00 remaining`; the ordinary line remained `Needs information`, with the release balance explicitly excluded from declaration totals. The test worksheet was removed and the original 5300 procedure restored and saved; audit history was retained. No customs submission was made.
- Verification: 86 calculation/temporary-admission tests, 18 service/Dexter tests and client TypeScript build passed. Approved Multideck project `aqtwypsuijxlnvtxpuxe`: API v130 (51 files), Dexter v262 (56 files), both ACTIVE with JWT verification. Full deployed source readback exactly matched the reviewed payloads. This is backend deployment plus localhost UI proof, not hosted frontend deployment.
- Source: [HMRC procedure 4053 instructions](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-40-release-to-free-circulation#4053), particularly DE 4/4 and 4/6; [partial-relief handbook](https://www.gov.uk/guidance/temporary-admission-customs-technical-handbook/partial-relief). Reviewed 15 September 2026.

### Frontend build and mobile navigation — 15 September 2026

The current client passes `tsc -b` and `npm run build`. Vite reports large-chunk warnings; no build errors. Chrome checks at the normal desktop size and 390×844 confirm the overview wraps, the calculation action remains reachable, and Review item results opens the expanded item. Saved history loads and the procedure-5300 QA line explains the missing authorisation/liability event. The viewport was restored; no draft values changed. This is local browser proof, not hosted frontend deployment or all-state mobile coverage.

API v129 changes only the override-conflict recovery message: reload history and review the latest workings rather than blindly recalculate. All 17 service/Dexter tests pass, including HTTP 409 and the recovery wording. The deployed 51-file bundle was read back exactly with JWT validation retained. Calculation version remains .53 because arithmetic and reference selection did not change.

### Override supersession guard — 15 September 2026

Closed an audit race where an older calculation could accept a fresh override when the saved draft was unchanged. `customs_append_calculation` now requires the latest calculation ID under the existing declaration row lock and timestamps new audit entries after acquiring that lock. A reference refresh therefore invalidates old override targets even when inputs are identical. Existing audit records are unchanged; UI and Dexter share this operation.

Migration `20260915030221_customs_override_latest_calculation.sql` applied to Multideck only. The current-definition PostgreSQL fixture verifies old-target rejection, latest-target acceptance, chronology and immutable history alongside existing colleague/foreign-user tests. Full access regression passed 26 tests plus 10 access contracts, with no skips. Live before/after probes confirmed anonymous/unlinked denial and service-only execution. A rolled-back live QA transaction separately verified both override cases; no probe audit rows persisted. Inactive-user denial was covered locally; the live tenant had no inactive actor to probe.

### Litre quota allocation — calculation version 2026-09-15.53

Retained official US ethanol response (commodity 2207100090, quota 059750, definition 32014) proves the provider label `Litre (l)`. The candidate now recognises that exact unqualified unit. Rate selection and the declaration allocation ledger share one quantity resolver: kilograms use net mass; other units require exactly one evidenced, unqualified matching tariff quantity. Volume is never inferred from mass. Missing quantities return needs-information rather than an uncaught error.

The official fixture verifies candidate selection, not complete ethanol tax eligibility. Separate synthetic draft wiring tests verify litre consumption, zero double-use and missing-volume rejection without claiming the real Colombian quota is volumetric. Partial allocations, value-based units and qualified units remain gated. All 95 calculation/preference tests and 17 service/Dexter tests passed. API v128 and Dexter v261 were deployed with JWT checks retained and exact full source readback. Browser proof for this litre workflow remains outstanding.

The existing synthetic QA import was also recalculated through Chrome after deployment: the request completed and returned `0 of 1 items estimated · 1 need information` for its unchanged procedure-5300 setup. No record inputs were changed. This is service-connectivity/fail-closed proof, not a complete litre-quota browser test.

### Exact tariff units — calculation version 2026-09-15.52

Added official same-dimension equivalents for tonnes, grams, thousand litres and millilitres. Qualifier mismatches and mass/volume conversions remain rejected. An engine regression verifies 0.125 tonnes at GBP 2/kg gives GBP 250 duty and GBP 250 VAT on GBP 1,000 goods, with conversion workings. This does not enable non-kilogram quota allocations or certify declared-tax population.

Verification: 99 calculation/preference/NI tests and 17 service/Dexter tests passed. The final engine assertion also passed in the 81-test calculation suite. Reviewed modules deployed to Multideck API v127 and Dexter v260 with JWT validation retained; all 51/56 source files read back exactly. Hosted frontend deployment and specialist-family certification remain outstanding.

### Operator workflow check — 15 September 2026

The local import item screen now has a declaration-wide duty/VAT overview,
payable totals, missing-information feedback and links to expanded item workings.
Calculate saves the current Multideck draft first, verifies that the latest edits
were persisted and shares one in-flight calculation request. It does not call
the provider draft-save or submission actions. A duplicate queued autosave now
settles the visible save status instead of leaving it stuck on “Saving automatically”.

Chrome testing used the existing isolated `QA-DUTY-VAT-AUDIT` record, not an
operational declaration. The connected service saved today's £180.00 / £416.00
example; editing goods value to £1,001 immediately before Calculate produced
£180.12 / £416.22. Restoring £1,000 produced the original figures and “All changes
saved”. The previous override remained available for reconfirmation, not silently
reapplied. A separate blank draft returned missing territory/invoice-link errors.
Desktop, 390px and dark-theme views were inspected. The writing cleanup shortened
actions/errors and bounded the workings width for readable amount alignment.

The existing 87 calculation/history tests and three save-before-calculation runner
tests passed. These are usable **estimate** workflows, not certification of all
NI/specialist treatments or exact CDS precision. No tax submission occurred and
no hosted frontend deployment is claimed. UI changes reuse the existing audited
calculation operation; no separate Dexter calculation path or new capability was added.

### Approved installation — 14 September 2026

After explicit approval for shared **MultiDeck** (`aqtwypsuijxlnvtxpuxe`, not
the separate Jenkar project), the five calculation/audit/Dexter/watch/provider
response migrations were installed. Post-install verification found inherited
anonymous SELECT on the calculation table; the new incremental
`20260914213038_customs_calculation_audit_explicit_grants.sql` removed all implicit
table grants and restored only authenticated/service SELECT. Both audit tables
now have RLS enabled, no anonymous SELECT, no authenticated direct writes and no
service-role direct INSERT. Calculation writes remain through the audited RPC.

The matching services were deployed and fetched back: `icustoms-api` version
104 and `agent-dexter` version 243 are ACTIVE with JWT verification enabled and
calculation version `2026-09-14.36`. The deployed certification list is empty.
No declarations were submitted. The pre-deployment PostgreSQL access suite
passed (26 database/contract tests plus 10 additional contracts); service and
iCustoms tests passed 49/49. Full Dexter lifecycle and remaining live role cases
remain outstanding. Deployment is not proof of those journeys or tax-rule
certification.

### Authenticated QA and operator polish — 14 September 2026

A separate synthetic `QA-DUTY-VAT-AUDIT` draft
(`e3bef8ee-b618-4379-a0d0-f2128e97f237`) was seeded in the approved shared backend,
then exercised through signed-in Chrome at localhost. This is calculation-only
QA, not a real invoice or tariff certification fixture. Existing imported QA
and operational declarations were left unchanged.

- The deployed service saved the £1,000 goods / £500 AP / £400 AV example:
  duty £180.00, VAT £416.00, automatic population false.
- An estimate override saved £181.00 / £416.20 with a required reason, actor,
  timestamp and parent calculation. Database evidence retained the original
  £180.00 / £416.00. Reloading the page restored the override and history.
- Changing the duty input to 13% marked the displayed result out of date and
  removed override access. Restoring 12% restored the current state. An empty
  override reason disabled Save; Cancel left the saved override unchanged.
- The earlier missing-territory test returned a specific validation message
  and created no audit row.
- The UI freshness comparison now applies the same invoice projection as Save
  draft. Otherwise derived invoice totals could incorrectly mark a fresh result
  stale. Six focused projection/history tests passed, as did the client typecheck.
- UI Copy Cleanup informed a result-first layout: visible amounts and action,
  expandable inputs/workings/evidence, shorter non-certified-estimate guidance,
  and an explicit override Cancel action. Desktop and 390px-wide Chrome checks
  verified readable workings, keyboard disclosure and retained input labels.
  Dark-theme visual verification remains outstanding.

The general Save draft flow logged provider validation errors for this deliberately
incomplete fixture; local draft persistence succeeded but provider mirroring was
rejected. This is not a clean end-to-end provider save test. The record remains
`draft`, has no iCustoms external ID, and its declared-tax row is blank. No customs
submission occurred. Directly seeded rows required normal child-item and local
reference data; fixture setup is not evidence of the UI's creation flow.

### Live audit access probes — 14 September 2026

Rollback-only SQL probes in the approved MultiDeck project exercised the real
installed RLS and functions against the four QA audit rows:

- The creator, under `authenticated` with its own auth subject, read all four
  rows. Direct INSERT, UPDATE and the service-only append RPC were unavailable.
- An existing active same-company colleague without an administrator/manager
  role also read all four rows; declaration write authority was false. Calling
  the append service with that read-only actor raised insufficient privilege.
- An unlinked auth subject saw zero rows and had no declaration read authority.
- Even a privileged no-op UPDATE of the QA override was rejected with SQLSTATE
  `55000` by the immutable-evidence trigger. The entire probe rolled back.
- The deployed Dexter evidence query returned the same four records for the
  permitted colleague and none for the unlinked subject, with the latest override
  explicitly reporting unchanged submission fields.

These are database-boundary probes, not second-user browser sign-ins or a complete
Dexter chat/watch lifecycle. Foreign-company and inactive/revoked cases remain
covered by the local PostgreSQL fixtures, not yet separately proved on this live
tenant. No accounts, roles or permissions were changed. The final client
typecheck after the layout edits also passed.

### Earlier diagnostic evidence (superseded by the installation above)

Both complete local Edge Function entry points (`icustoms-api/index.ts` and
`agent-dexter/index.ts`) passed `deno check --no-lock` after the read-time
freshness and conditional watch-guidance changes. This is compilation evidence,
not a deployed integration test.

A read-only check on 14 September 2026 of the project configured in the local
client (`aqtwypsuijxlnvtxpuxe`) confirmed that
`public."Customs_CalculationAudit"` does not exist and the
`public.customs_append_calculation` operation is absent. The deployed
`icustoms-api` is version 103; this check did not inspect its source bundle.
Consequently the local implementation cannot yet save calculation history to
that backend. This is a confirmed missing deployment dependency, not evidence
that repeated browser reloads will resolve the issue. Apply the reviewed audit
and related migrations and deploy the matching service only after the target
and access checks; then verify authorised save/read/override and denied access.
No database or deployment was changed by this diagnostic check.

A subsequent local-runtime check found the Supabase CLI and repository config,
but no `docker`, `podman` or `colima` executable, no Docker/OrbStack/Podman Desktop
application in `/Applications`, and no listener on the configured local API port
54321. An isolated full-stack Supabase test environment is therefore not currently
available through these standard runtimes. PostgreSQL contract tests and mocked
service tests do not replace this missing authenticated browser-to-service proof.
No container runtime was installed and no shared backend configuration was changed.

## Implemented locally

- A read-only provider tax-evidence extractor now follows the **observed**
  iCustoms `notification[].hmrc_response.Response` shape. A retained accepted
  response contained FunctionCode `13` / Status.NameCode `67`, labelled
  `Indicative Customs Debt`, with item sequence, tax type, ad-valorem base,
  `Payment.TaxAssessedAmount` and separate `Payment.PaymentAmount` values.
  The extractor links sequences only against the submitted item snapshot,
  preserves original decimal strings and never substitutes payment for assessed
  liability. Five tests cover that separation, acknowledgements, missing values,
  submitted identity and duplicate sequence handling. This is not yet connected
  to the service/UI or comparison persistence. Currency attributes are present in
  retained XML but absent from this JSON representation; currency, liability
  disposition and finality must be verified before producing AssessmentLine.
  Its `reconciliationReady` therefore remains false. No new provider call or
  submission was made while inspecting these stored responses. Source:
  [HMRC notification types](https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/notifications.html).
- `.28` / `ni-risk-2026-09-14.2` require the UKIMS-linked importer EORI to
  start with GB or XI; matching a non-UK identifier to an entered authorisation
  is no longer sufficient. This supplements, not replaces, identifier validity
  and actual authorisation verification. The regression for a matching FR
  identifier fails closed. Prior results retain their versions and become stale.
  The separate applicable-duty route still does not require UKIMS. Source:
  [HMRC UKIMS declaration instructions](https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu#how-to-move-your-goods-not-at-risk).
- Declaration-level assessment comparison now checks assessed GBP totals against
  both assessed item sums and calculated totals, retaining each item's detailed
  base/tax comparison. Missing items never produce a complete assessment total;
  absent currency or total evidence remains incomplete, duplicate/unknown items
  are rejected, and a one-penny discrepancy remains visible. Worked single/split
  fixtures cover this pure comparison layer. Provider payload mapping, immutable
  comparison persistence and the operator reconciliation view remain outstanding.
- Dexter guidance now directs calculation-change watch requests to the dedicated
  Watchers flow, conditional on its installed `calculationEvent` capability.
  It no longer incorrectly says all calculation watches are unavailable, nor
  claims chat created one. Saved calculation/override events are explicitly
  distinct from tariff-rate feeds or automatic recalculation. The local
  PostgreSQL customs fixture passed its matching/repeated event, pause/resume,
  notification and denied-access assertions. Hosted watch installation and the
  full conversational journey remain unverified.
- Dexter's calculation-history read adapter now checks the current UK date and
  shared rule/precision version in addition to the database's draft comparison.
  Overrides inherit their parent's stale state; a parent missing from the
  bounded history page or belonging to another declaration is not assumed
  current. Three local regression tests cover these cases and immutable input
  preservation. This changes read-time labels only, not saved evidence or
  submission fields; the adapter is not yet deployed.
- `2026-09-14.27` verifies the live HMRC incidental-expense section before
  saving a national-method estimate. The reviewed section includes eligibility
  conditions as well as prices; changed content fails closed for review. The
  bounded, fixed-origin reader rejects redirects, source failures and oversized
  responses. Each successful estimate retains the original HTML, content/section
  hashes and retrieval time. A live read on 14 September 2026 matched section hash
  `df8404f2c91b9418d9feea4497f25f1371df85666d1b9eb9724883134686408b`.
  Source matching is not rule certification or approval of an individual agreement.
  The local expense editor supports actual, national and individual methods,
  retains inactive agreement evidence when switching methods, and copies a
  reviewed worksheet amount into the GBP adjustment only on an explicit click.
  Returning to actual expenses does not apply the inactive agreement or fetch
  its publication. The focused switching regression and all ten service tests
  passed. Client type-checking passed; browser interaction and save/reload remain
  unverified for the complete worksheet journey. Blank header AV/AW rows now
  expose their worksheet without a placeholder amount; the server's populated
  cost inventory is unchanged. Chrome QA confirmed a blank AV row displays
  “No amount entered — not included in calculations” and the expense-method
  selector. Calculation history was unavailable on that QA page, so persistence
  and a saved server calculation were not proven by this check.
- `2026-09-14.26` adds evidence-led VAT incidental-expense worksheets for
  national air/groupage/full-load methods and individually agreed amounts.
  National minima apply once per identified consignment, not once per invoice;
  the adapter requires international/UK-termination and separately distinguished
  border freight evidence. Individual agreements require dates, importer/scope
  evidence and retained workings. A separate GBP AV/AW adjustment must match the
  worksheet's two-decimal estimate amount; mismatches fail rather than overwrite
  the operator's cost. Exact worksheet amounts remain in evidence. A dedicated
  `vat-expenses` family remains uncertified. Worksheet formula checks passed
  after correcting the predefined-row fixture ID. UI entry and refreshed
  publication snapshots were subsequently added in `.27`; historical schedules,
  courier agreements, NI and specialist workflows remain outstanding.
  Source: [HMRC simplified incidental expenses](https://www.gov.uk/guidance/working-out-the-vat-value-using-the-customs-value-of-the-imported-goods#incidental-expenses--simplified-arrangements).
- `2026-09-14.25` corrects GB Method 1 royalty adjustments AI/AM: additional
  royalties increase customs value but not import VAT value; evidenced royalties
  already in the price are excluded from VAT without a second customs addition.
  The duty arising on the customs value remains in the VAT base. Monetary and
  full-item-price percentage cases, inclusion states and incorrect `both` mappings
  are tested. The earlier generic AI/AM VAT expectations were corrected against
  [HMRC import VAT exclusions](https://www.gov.uk/guidance/working-out-the-vat-value-using-the-customs-value-of-the-imported-goods#items-you-may-leave-out-of-the-value-for-import-vat).
  Sixty-nine calculation tests pass. NI and alternative-valuation royalty paths
  remain separately gated. Agreed incidental-expense adapters and UI were
  subsequently added in `.26`–`.27`, with the limitations noted above.
- `2026-09-14.24` adds declaration liability totals grouped by tax type and
  payable/suspended/relieved/secured disposition, with VAT grouped separately.
  The immutable calculation result retains these summaries for UI and Dexter.
  Invalid calculations have no liability summary. A separate signed rounding
  difference compares rounded measure totals with payable item totals; a non-zero
  difference prevents automatic population and is never distributed silently.
  Sixty-eight local calculation tests cover all dispositions, item-order stability,
  incomplete evidence and a sub-penny measure example. The expanded import
  calculation panel now renders a collapsible declaration summary, tax/VAT
  dispositions, payable item totals and a signed rounding warning. It labels
  historical results and explicitly excludes operator overrides and CDS assessment
  claims. Client TypeScript passes. Browser attachment failed (debugger unattached),
  so rendered, keyboard, responsive and end-to-end persistence verification remain
  outstanding.
- `2026-09-14.23` records tax-reference provenance separately from its website
  link. The server draft adapter marks manually entered rates as `operator` and
  selected retained tariff measures as `official-snapshot`. Automatic population
  additionally requires official provenance for every duty measure and VAT
  reference, as well as rule-family certification. Missing provenance on historical
  records does not qualify. Client-provided provenance is not copied into selected
  references. Sixty-six calculation tests and eight service tests pass locally.
  This is an additional release guard, not certification or automatic enablement.
- `2026-09-14.22` rejects total BH/BI deductions exceeding an item's goods
  price, even if freight leaves the overall customs value positive. This applies
  to monetary, percentage and combined discounts, using exact allocated values.
  Sixty-five local calculation tests pass. The import-only API route, calculation
  preflight, override service and conditional UI mount were checked in source;
  no export or general accounting calculation surface was added.
- `2026-09-14.21` extends evidenced discounts to BI percentages for customs
  import estimates. The discount uses the linked items' full goods prices, not
  freight or other adjustments. Entitlement and explicit percentage-basis
  confirmation remain required; already-reduced prices are not discounted again.
  Sixty-four calculation tests and eight service tests pass locally. The import
  cost-evidence panel now includes discount type, agreed date, entitlement and
  commercial references, payment status and conditional payment/offer evidence.
  Choices begin unconfirmed. Price treatment explicitly distinguishes a gross
  price from an already-discounted price. Hidden conditional evidence is preserved
  while changing selections. Client TypeScript passes; browser opening timed out,
  so rendered interaction, keyboard, themes and save/reload remain unverified.
  Certification remains outstanding; automatic population remains disabled.
- `2026-09-14.20` adds BH monetary discounts to GB Method 1 free-circulation
  estimates with a dated entitlement worksheet. It requires a contract, goods and
  commercial-basis evidence, and payment status. Unpaid early-payment discounts
  require a still-valid offer and trade-practice evidence; full-price payments,
  later agreements and unsupported prior-purchase allocations are rejected.
  Already-discounted item prices are not reduced again. The discount evidence
  editor and BI route were added in .21. Sixty-three local
  calculation tests pass, including expired, already-paid and double-count cases.
  Source: [HMRC Method 1 discounts](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value#discounts).
- `2026-09-14.19` supports AC/AX/AZ/AM percentage additions for evidenced GB
  Method 1 estimates. The explicit percentage basis is the selected goods prices,
  excluding other adjustments; FX conversion and multiplication remain exact.
  An unchecked operator confirmation records that the full item-price basis is
  appropriate. Other bases require a monetary adjustment and retained worksheet,
  not a guessed percentage base. Stale currency values on percentage rows are
  retained in the source draft but are not treated as money or sent for FX lookup.
  Audits identify the percentage separately from allocation shares. Percentage
  deductions other than the BI route added in .21 and valuation-simplification decisions remain gated. Sixty-two
  calculation tests and client TypeScript pass; latest controls need browser QA.
  Source: [DE 4/9 percentage adjustments](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes).
- `2026-09-14.18` corrects the freight allocation compatibility check: the
  prohibition on mixing value/mass freight codes does not prohibit a separate
  packing or assist addition allocated by value. Named freight codes also reject
  a mismatched basis (for example AP with gross mass). A two-item fixture verifies
  mass-based freight plus value-based packing, whilst AV/AQ remains rejected.
  Source: [DE 4/9 freight apportionment](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes).
- `2026-09-14.17` adds operator-evidenced monetary additions AB, AD, AE, AF, AG,
  AH, AI, AJ and AL for GB Method 1 estimates. Cost evidence and a separate
  valuation-basis explanation are both required. Enter only the dutiable portion
  attributable to the covered importation; the calculator does not infer royalty
  eligibility, lifetime tooling allocation or assist value. Existing exact FX,
  scoped allocation, included-price checks and duplicate detection are reused.
  Code-specific review prompts appear alongside cost evidence. Percentage codes,
  open-ended AT and decision-based AN/AO remain gated; NI and alternative valuation
  need their own mappings. Sixty local calculation tests pass, including all nine
  additions with currency conversion, invoice/direct scope, duplicate rejection
  and included-price protection. Latest fields are not browser verified.
  Sources: [HMRC Appendix 10](https://www.gov.uk/government/publications/additions-and-deductions-for-data-element-49-of-the-customs-declaration-service)
  (24 July 2026 additions ODS, read 14 September 2026),
  [Method 1](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value).
- `2026-09-14.16` connects the first warehouse-entry adapter to saved import
  calculations: GB H2/A, all items 7100/000, private/public type 1, standard
  preference and transaction valuation, with percentage A00 estimates. A separate
  worksheet records the warehouse country/identity, authorisation decision number
  (not the holder EORI), dated active status, goods coverage, entry/security
  conditions and agent approval/copy arrangements. The holder must match the
  declaration's CWP/CW1 entry. Missing or conflicting evidence blocks amounts.
  The result retains suspended duty and VAT alongside zero payable entry totals;
  it explicitly requires a fresh liability calculation on release. This is an
  uncertified operator-evidenced estimate, not proof of HMRC authorisation or a
  final release assessment. NI warehousing, other 71-series codes, simplified
  entries, additional treatments and non-percentage taxes still need adapters.
  The shared worksheet editor is now exposed in expanded import-item calculations
  for procedure 7100 (and retained worksheets). It records evidence separately
  from the declaration fields, starts with representation unconfirmed and warns
  about changed warehouse identity. Browser QA confirmed the section appears and
  expands in the existing QA draft; form activation then hit Chrome automation
  timeouts. Field editing, save/reload, keyboard completion, mobile/dark mode and
  live calculation remain unverified. UI and Dexter calculation operations
  share this adapter and existing immutable audit/result/watch operations; no
  additional direct write or automatic filing capability is introduced.
  Service regression coverage now checks suspended amounts and the complete
  worksheet passed to the immutable audit, missing-authorisation results and
  preservation of existing filing amounts. Calculation and override operations
  both reject export drafts before audit writes; overrides reject them before
  history lookup. These are local service tests, not deployed persistence proof.
  Source: [HMRC procedure 7100](https://www.gov.uk/government/publications/appendix-1-de-110-requested-and-previous-procedure-codes-of-the-customs-declaration-service-cds/requested-procedure-71-entry-to-a-customs-warehouse-cw#7100).
- The calculation core now distinguishes non-payable VAT liability from payable
  VAT (`2026-09-14.15`). A suspended/relieved/secured treatment requires a dated
  treatment source, procedure/event evidence, and explicit tax references forming
  its VAT base. Postponed VAT is not accepted as a suspension treatment. Full VAT
  amounts and disposition are retained beside payable totals, and reconciliation
  requires corresponding assessment evidence rather than matching two zero totals.
  This was core support only in version .15; the first entry adapter is described
  above. Full eligibility, liability-event dates, release
  calculations, certification and operator workflow remain required. Source:
  [HMRC customs warehousing introduction](https://www.gov.uk/guidance/special-procedure-customs-warehousing/introduction).
- Added the server-side Appendix 15B publication reader, using the existing ODS
  dependency and bounded, fixed-origin fetches. It discovers the current attachment,
  retains the publication HTML, original ODS bytes and SHA-256, and reads formatted
  percentages without converting spreadsheet fractions to inferred rates. Duplicate
  or invalid airport entries are quarantined with their original row evidence.
  Live read on 14 September 2026 returned 1,140 valid airports, including JFK at
  70%, plus one quarantined row: 1042 uses `MCl` for Kansas City International.
  Source hash: `f717afb649487d0d8f86cd107357bd55533d08a4ee56657f7e1d923064bc5610`.
  The saved calculation service now captures this publication once for populated
  airfreight adjustments, alongside the selected airport, raw-source hash and any
  lookup failure. Unknown airports save a needs-information result; source outages
  preserve previous history without appending guessed figures. The result's source
  notice is exposed by the existing Dexter result read and the item panel, while
  the full file stays in the permission-controlled audit. The entered percentage
  remains explicitly separate: movement/date eligibility must be verified before
  automatic application. Retrieval time is not a legal effective date;
  historical applicability and nearest-airport substitutions are never inferred.
- Included surface-freight deductions BA/BU now map to customs-only deductions
  (`2026-09-14.13`), retaining the original freight in the VAT base as required
  by DE 4/9. Saved-draft regression fixtures cover both codes, invoice scope,
  zero-value mass deductions, and all four airfreight codes. The full local suite
  passes 57 calculation tests and 5 service tests. Fixtures use normalised row
  identities, as used by the actual form; serialisation testing is not browser
  save/reload proof. Existing UI/Dexter calculation routes share the mapping.
- Airfreight arithmetic (`2026-09-14.12`) separates customs inclusion from
  VAT-only remainder for AR/AS; BR/BS deduct only the excluded share from customs
  value and retain it for VAT. Workings and immutable allocation evidence retain
  both portions and the entered customs-inclusion percentage. Only one airfreight
  code is allowed, with matching included-price treatment and allocation basis.
  Sources reviewed 14 September 2026: [HMRC delivery costs](https://www.gov.uk/guidance/delivery-costs-to-include-in-the-customs-value),
  [DE 4/9 instructions](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes),
  and [Appendix 10](https://www.gov.uk/government/publications/additions-and-deductions-for-data-element-49-of-the-customs-declaration-service).
  The saved-draft UI and Dexter share the corrected core; no submission values are
  changed. Route/airport percentage lookup, dated GB/NI eligibility, loading-airport
  validation and browser verification remain outstanding. The current entered
  percentage is evidence-led estimate input, not an automatically verified rate.
- Tariff validity parsing rejects malformed provider expiry dates instead of
  interpreting them as open-ended. Valid dates and ISO timestamps retain inclusive
  effective boundaries. Calculation version `2026-09-14.11` requires older
  estimates to be recalculated without rewriting their history. Local verification:
  53 calculation tests and 5 service tests pass; no deployment or browser proof
  is implied. Both UI and Dexter use this same server-side reference validation.
- Exact rational decimal arithmetic; explicit half-up estimate display rounding;
  deterministic largest-remainder displayed allocations with exact working shares.
- Pure calculation core for percentage and explicit specific/compound components,
  cost scopes, value/mass allocation, valuation evidence and tax dispositions.
- Saved-draft adapter uses the linked invoice currency and server-fetched HMRC
  exchange-rate publication. Operator-entered duty/VAT rates are labelled estimates.
- Authorised calculation/history/estimate-override routes in `icustoms-api`.
- Append-only audit migration with declaration access checks and a row lock to
  reject calculations for a concurrently changed draft. Overrides retain their
  original figures, reason, actor, parent calculation and server timestamp.
- Expanded item estimate editor, breakdown, cost evidence, history and stale state.
- Keyset-paged audit history with separate latest-calculation/item-override reads;
  page limits cannot hide the active calculation. Older overrides remain visible
  for reconfirmation after recalculation. Expand history to inspect saved workings,
  original/replacement figures, actor identifiers, source links and effective dates.
- Dexter exact-declaration read domain exposes recorded results and overrides with
  audit IDs, stale state and declaration links, using the existing domain permission
  boundary plus declaration-level access checks. It does not perform AI tax maths.
- Dexter calculation and estimate-override actions use the prepared-action claim
  and completion audit, require explicit approval in the database, and call the
  same actor-authorised endpoints as the UI. Arguments cannot choose a filing URL
  or replace declaration fields. Interrupted responses report an uncertain result
  and do not silently retry.
- Import PaymentAmount serialisation uses GBP rather than the item currency.
- Append-only provider-response history captures changed submission responses with
  the request and declaration snapshot, independently of mutable submission status.
  It preserves acknowledgements as acknowledgements, not invented assessments.
  Existing responses are labelled migration-time snapshots; unavailable earlier
  responses are not reconstructed. Transport headers are not duplicated. This
  migration is local and unapplied; no historical recovery or live capture is claimed.
- Saved calculation and override audit inserts emit deterministic, exact-declaration
  watch events. The evaluator rechecks the recipient's current declaration access,
  repeats distinct changes and sends readable notifications without exposing raw
  evidence or override reasons. No recurring AI calculation or polling is used.
- Managed OAuth tariff client, UK/XI/date/origin lookup, source graph snapshots,
  unambiguous standard percentage selection and explicit operator-estimate mode.
  The client renews once on 401 and never puts credentials in calculation evidence.
- NI estimate setup records movement, risk decision, reviewed duty tariff and
  evidence. EU-duty estimates fetch and retain separate XI duty and UK VAT
  snapshots; UK-duty estimates cannot relabel XI evidence as UK evidence.
  Missing/mismatched sources, conflicting selections, and GB/EU movements without
  their dedicated route treatment produce missing-information results.

## Quota allocation foundation — local, not enabled

Added a deterministic quota-candidate validator for evidenced full-item
allocations. It binds commodity/origin/dataset, measure, order number,
preference, validity period and units; rejects requested/rejected/partial
allocations and missing evidence; and decodes the retained structured rate.
It does not remove other fiscal measures or enable quota calculation by itself.
Three tests cover valid selection, immutability, 13 candidate rejection cases,
and declaration-wide allocation reuse. The exact-decimal ledger rejects even
sub-penny-equivalent quantity overruns, duplicate item IDs and conflicting
amount/unit/origin/order/period evidence for the same allocation reference.
It preserves allocated, used and remaining quantities as exact fractions.

Next integration requirements: retained allocation evidence, invoking the ledger
across all items/invoices, quota/full-rate splits,
critical/provisional security treatment, source-backed order/unit validation,
operator controls, and UI/Dexter service integration. This local module is not
deployed or presented as completed quota support.
Source: https://www.gov.uk/guidance/claiming-tariff-quotas-to-reduce-import-duties

The rounding document was re-inspected including embedded Visio text. Its
change log says converted amounts are not rounded at intermediate stages, but
the embedded apportionment note still says GBP goods values and percentage
shares are truncated to two decimals. The separate six-decimal connector is
for measurement quantities, not evidence for a six-decimal allocation share.
Do not resolve the discrepancy by tuning the engine to Mark's single example.

## Signed-invoice and official-source live verification — version 2026-09-15.45

Deployed to the approved Multideck project `aqtwypsuijxlnvtxpuxe`: API v120 and
Dexter v254. Read-back matched all 49/56 deployment files; JWT verification
remains enabled. An anonymous API call returned 401. No hosted frontend
deployment or customs submission was performed.

The browser test exposed missing managed tariff credentials. With both OAuth
fields absent, the server now uses the official public UK/XI JSON:API endpoint
and retains its actual source URL and complete response. Partial configuration
and configured authentication failures still fail closed, without fallback.
Three dedicated client tests cover provenance, absence of credential forwarding,
authentication failure, unavailable references and mismatched commodity data.

Chrome QA on the explicitly synthetic QA-DUTY-VAT-AUDIT draft verified official
lookup, A782 selection, D008 review fields, and a matching declared document.
The existing £1,000 goods / £500 freight / £400 VAT-only test costs produced
£571.50 duty and £494.30 VAT. These figures survived page reload. Removing the
matching D008 reference then blocked calculation and removed totals. The test
does not establish real exporter eligibility or CDS precision certification.
The original blank commodity/origin/documents/TARIC code, manual 12%/20% rate
setup and procedure 5300 were restored; audit history retains the labelled tests.

## Signed-invoice remedy adapter — local version 2026-09-15.44

The saved-draft selector and operator editor now support the narrow D008
signed-invoice condition shape evidenced by the retained official fixture:
exactly one D008 branch plus one fallback, both action 01, with a single
percentage component belonging to the chosen condition. The selected invoice
reference must match exactly one D008 document on that item. Missing, changed
or duplicate documents, other condition actions and unsupported expressions
remain blocked. The operator records the signed-declaration review; entering a
reference alone does not provide that review or certify the calculation.

The official fixture's A782 branch produces 34.9%, while A999 remains 42.3%.
The full-response saved-draft regression also exposed an unclaimed ship/end-use
measure. Explicit preference 100 now excludes only the correlated 117/140
alternative, retaining it in the snapshot, rather than blocking ordinary duty
or applying that relief. Additional fiscal measures remain checked.

UI fields appear only for a D008-conditioned selection (or existing evidence),
and changing the measure clears the previous signed-invoice review. Calculation
history receives the evidence through the existing permission-controlled service.
Dexter calculation actions use that same selector and existing audited result
reads/watch events; no separate AI arithmetic or new unapproved evidence-writing
action was added. Editing signed-invoice evidence remains an operator workflow.

Local verification: five remedy tests, 14 service tests, eight preference/draft
tests and client TypeScript pass. Live deployment and browser verification of
this increment remain outstanding. The deployed version is still .43; no
certified rule families or automatic declared-tax population were enabled.

## Official remedy regression evidence — 15 September 2026

The full public UK tariff response for commodity 7323930010, origin CN, dated
15 September 2026 is retained under `supabase/tests/fixtures/`. It contains seven
definitive anti-dumping exporter variants. The regression verifies the actual
structured 42.3% general-exporter rate and rejects the D008-conditioned exporter
variant; no displayed percentage is parsed and no cheaper alternative is chosen.
The test uses synthetic operator evidence, not a real declaration or approval.

Verification: 19 remedy/service tests and seven saved-draft preference/remedy
tests pass. This change is local regression evidence only; the deployed service
remains v118, calculation version 2026-09-15.43. Conditional remedy selection,
other outstanding specialist adapters and precision certification remain open.

## Source-linked rule register and release gates

| Rule family | Authoritative source | Current gate |
|---|---|---|
| Currency conversion | [HMRC foreign currency conversion](https://www.gov.uk/guidance/converting-foreign-currency-amounts-to-include-in-the-customs-value) | Dated invoice and separate tariff conversion snapshots implemented; rate direction, missing periods and amendment handling tested. GB contract worksheets exist. NI contract treatment and certification remain outstanding. |
| Transaction value | [HMRC Method 1](https://www.gov.uk/guidance/customs-valuation/method-1-transaction-value) | Linked invoice values, included/additional costs, selected discounts and percentage/monetary adjustments implemented. NI and specialist adjustment combinations remain gated where separate rules are missing. |
| Freight and insurance | [HMRC delivery costs](https://www.gov.uk/guidance/delivery-costs-to-include-in-the-customs-value) | Exact value/mass allocation and retained airport/airfreight references implemented and tested. Complete specialist combinations and CDS precision certification remain outstanding. |
| Import VAT | [HMRC VAT valuation](https://www.gov.uk/guidance/working-out-the-vat-value-using-the-customs-value-of-the-imported-goods) | Actual VAT-only expenses, selected GB agreed-expense worksheets and official national-code selection implemented. Special-procedure VAT breadth and certification remain outstanding. |
| CDS precision and submission | [CDS Group 4](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes) | Submission separation, retained assessment comparisons and audited overrides implemented. Exact CDS stage precision/Mark discrepancy remains unresolved; no family is certified. |
| Northern Ireland | [Not-at-risk rules](https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu) | Paired UK/EU measures, risk comparison, B00/B05 and selected NI release adapters implemented. Claimed preferences, remedies and broader special-procedure combinations remain incomplete. |
| Preferences, quotas, remedies, excise | [Official tariff API documentation](https://github.com/trade-tariff/trade-tariff-api-docs) | Selected GB preference/quota/remedy paths and specific/compound arithmetic implemented with evidence. Cross-declaration quota accounting, broader excise/product rules and certification remain outstanding. |
| Valuation methods 2–6 and special procedures | [HMRC valuation collection](https://www.gov.uk/government/collections/working-out-the-customs-value-of-your-imported-goods) | Evidence-led alternative valuation worksheets and selected warehouse/returned-goods/TA paths exist. Processing allocation and basis reviews do not constitute original-input duty/VAT calculations. GB original-input processing, end-use, repairs and further combinations remain incomplete. |

Register reconciled against the `.63` draft adapter and current tests on 15 September 2026. Historical delivery notes below describe earlier boundaries, not the current completion state. The next processing milestone must implement and connect the original-input tax calculation, including its separate rate-date and VAT bases; adding further review fields alone does not meet it.

No entry in `certifiedRuleFamilies` may be enabled just because generic arithmetic
tests pass. Each needs current source rules, applicability conditions, precision
rules and representative CDS assessment fixtures reviewed by the Customs team.

### Manual submission and PVA evidence check

The official Group 4 page, updated 7 September 2026 and rechecked on
14 September, states that OVR01 requires explicit HMRC authorisation. For an
authorised manual calculation using postponed VAT, DE 4/6 for B00 must contain
the actual VAT amount: the former zero-GBP workaround and PVA01 are no longer
valid. Retain this distinction in the outstanding submission adapter; an
operator's estimate override is not HMRC authorisation. The reviewed page does
not resolve the per-stage rounding discrepancy in Mark's photographed example.
Source: [Group 4, manual duty calculations](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-4-valuation-information-and-taxes#de-43-tax-type).

The shared import-only validation now rejects obsolete PVA01 in header and item
additional information, identifying the affected field in the client and
blocking the server's validated XML path. It preserves entered amounts and
does not infer OVR01 authorisation or change export validation. The targeted
server regression and client type-check passed. The complete manual-tax
authorisation and PVA submission workflow remains outstanding; this narrow
safeguard is not its replacement.

## Mark's reference sheets

The supplied photographs are operator evidence, not a current tariff database.
The CHIEF teaching example gives goods £1,000, freight £500, VAT-only adjustment
£400, duty 12% and VAT 20%: duty £180 and VAT £416. The £600/£400 split gives
£108/£72 duty and £249.60/£166.40 VAT. Tests reproduce these exactly.

The revised CDS example uses 1.341200 foreign-currency units per GBP, invoice
167,520, freight £14,912.01, VAT adjustment £2,200 and two goods lines 101,400 and
66,120. The estimate policy produces first-line customs base £84,630.19; the
photograph displays £84,630.18. This is an intentional unresolved acceptance
case, not a passing exact-CDS fixture. Full per-stage precision must be established.

## Official tariff integration investigation

Read-only checks on 14 September 2026 confirmed the public UK commodity endpoint
returns JSON:API measures, components and geographical restrictions. The
documented `filter[geographical_area_id]` removes unrelated measures; use the
UK or XI dataset explicitly. A measure's historical `origin` attribute does not
identify which tariff jurisdiction applies to a movement.

Current official documentation describes a managed OAuth client-credentials API
host. Confirm the configured integration and token boundary before committing
to that production endpoint. Preserve whole dated response snapshots and resolve
relationships by both type and ID; never parse a displayed percentage and assume
all other measures or conditions are irrelevant.

## Official quota-rate estimate selection — 15 September 2026

### Warehouse specific/compound estimate extension (`2026-09-15.50`)

Post-`.51` reconciliation verification: all 13 assessment-service/provider tests pass, including NI B00/B05 differences with equal aggregate totals, missing historical splits, provisional/duplicate notices, ownership and missing-link denials, and audit-write failure. This does not resolve Mark's precision discrepancy. The original assessment/export and unrounded inputs have been requested from the operator as non-blocking evidence for that release gate.

Live EU-proof journey verified in Chrome against API v126: labelled QA draft, commodity 7323930010, FR non-preferential origin, EU preferential origin, preference 300, procedure 4000, official rates and clearly synthetic proof worksheet. The service estimated 1/1 item with £0 duty and £380 VAT (goods £1,000 + freight £500 + VAT-only £400). The original blank commodity/origins, preference 100, procedure 5300 and manually entered rates were restored; the temporary worksheet was removed. Recalculation confirmed the original specialist-information gate. Synthetic audit history remains retained; no customs submission was made.

Chrome control verification: on labelled `QA-DUTY-VAT-AUDIT`, expanded DE 5/16 offers `EU — European Union`, selects and saves EU, and clears back to the original blank value with confirmed saved state. No other QA inputs were changed in this check. This closes selection/clearing verification only; a complete live EU-proof calculation journey remains to be exercised.

EU-proof deployment completed: calculation `.51`, API v126 and Dexter v259, on Multideck `aqtwypsuijxlnvtxpuxe`. All 51/56 files read back exactly and JWT verification retained. The service contract confirms one FR-origin lookup, EU proof retained in the unmodified draft audit, £0 duty/£200 VAT for the dated fixture, and unchanged filing fields. All 17 service/Dexter tests pass. The test fails closed once the retained fixture date no longer matches the service's current UK date; fixed-date arithmetic coverage remains in the preference tests. Live browser EU-flow verification remains outstanding.

EU-proof integration follow-up: expanded/table/review preferential-origin controls now offer the HMRC EU group without adding it to ordinary origin/destination controls. The proof worksheet receives EU-labelled matching measure options. A saved-draft integration fixture now produces £0 duty/£200 VAT on £1,000 goods using the retained FR response and EU proof, with automatic population disabled; all 13 preference tests and client TypeScript pass. Calculation changes remain local at `.51`, awaiting service/live verification and reviewed deployment.

Local follow-up (`2026-09-15.51`, not deployed): GB preference 300 can now match EU proof to the explicit 1013 European Union measure retained in the individual-origin tariff response. Selection retains all other fiscal measures, requires the existing proof worksheet, rejects missing group metadata, mismatched group/worksheet and excluded origins, and leaves additional fiscal treatment gates intact. The retained FR commodity fixture passes alongside negative safeguard/exclusion tests. Dropdown group options, draft/service integration verification and deployment remain to do; NI, quota groups and other differing-origin paths are not enabled by this change.

Import form validation now flags missing preferential origin for valid 2xx/3xx/4xx claims and includes it in item issue counts. It does not add this requirement to exports, 1xx claims or malformed preference codes. Eighteen invoice/form tests pass, including country-group presence without implying tariff eligibility. Separate origin/group tariff resolution remains gated in the calculation service.

Operator follow-up: preferential origin is now available beside non-preferential origin in expanded import items, with DE 5/16 help and review-field metadata, rather than requiring a hidden table column. Chrome confirmed the blank, labelled control renders. HMRC Group 5 distinguishes preferential origin from non-preferential origin and allows country groups; broader group-reference/eligibility support remains a separate gap rather than being inferred from destination or dispatch.

Service integration verification additionally passes a synthetic official-provider compound measure (5% plus £2/KGM on 30 KGM) through tariff selection, warehouse adaptation and audit persistence: £110 suspended duty, £222 suspended VAT, zero payable totals, unchanged saved declaration and filing fields. All 16 service/Dexter contract tests pass, including historical-version override rejection and audit-failure handling. This is controlled integration evidence, not a live provider tariff fixture or browser proof.

GB H2/A/7100/000 warehouse entry now retains and evaluates the selected A00 specific or compound formula, including its bounds and conversion/quantity evidence, instead of rejecting every non-percentage formula. The existing calculation engine validates these inputs; the warehouse adapter only changes the liability disposition to suspended. Excise, remedies, preferences, other procedures and NI still require their respective treatment paths. This is an estimate, not a release assessment or certification. Source: the linked HMRC requested-procedure 71 guidance, checked 15 September 2026 (updated 13 August 2026), describing suspension of duties and charges for eligible authorised warehouse entry.

Acceptance coverage includes a £1,000 goods fixture with 5% plus £2 per 10 KGM on 30 KGM, a £60 minimum, suspended £60 duty and £212 VAT, zero payable totals, immutable input, missing-quantity denial and remedy-family denial. All 97 calculation/preference/NI tests passed. Deployed API v125 and Dexter v258 on Multideck `aqtwypsuijxlnvtxpuxe`; all 51/56 deployed source files read back exactly and JWT verification retained. Dexter continues to use the shared API, audit and watch-result workflow; no separate calculation implementation or permission change. Live warehouse-form verification remains outstanding.

Live operator verification completed against the deployed calculation service (`2026-09-15.49`) using the labelled `QA-DUTY-VAT-AUDIT` declaration. Synthetic Colombian origin/allocation evidence, commodity `7323930010`, preference `320`, order `057162`, and 10 KGM produced £0 duty and £380 VAT: £1,000 goods plus £500 freight, then £400 VAT-only costs. The UI confirmed the estimate was saved and declared tax was unchanged. This verifies the full-allocation estimate workflow, not a real customs allocation or filing certification.

All temporary item values and the allocation worksheet were restored/removed afterwards, and the original table layout restored. Recalculation of the restored `5300` test case again reported that specialist treatment information was required. The immutable synthetic calculation history remains intentionally retained. During restoration, optional country columns were found to lack a clear action; they now reuse the existing “Clear selection” control, verified in Chrome.

Calculation `.49` connects an evidenced full allocation to a retained official
GB quota measure. It matches order/preference, commodity, origin, date, source
definition and kilogram unit; requires preferential-origin evidence where
applicable; and checks the declaration-wide allocation ledger before preserving
results. Multiple matching measures require an explicit selection. Source-backed
measure choices are returned to the worksheet. Original source measures and
unclaimed alternatives remain in the audit; safeguards, additional duties,
conditions and other unresolved fiscal requirements are not silently omitted.

The complete official Colombian response for commodity 7323930010 is retained
as `supabase/tests/fixtures/customs-ironing-board-co-20260915.json`, with provenance
in the adjacent Markdown file. Tests use synthetic allocation evidence for its
057162 quota: £1,000 goods yields £0 estimated duty and £200 VAT. Requested or
partial allocations, missing origin evidence, wrong official units and additional
fiscal measures fail closed. The full allocation does not rely on the displayed
public balance. These tests do not establish an actual tenant allocation.

Deployed API v124 and Dexter v257, ACTIVE with JWT enabled; all 51 / 56 files
exactly read back. Only the five reviewed calculation modules were overlaid on
the live API; the unverified submission XML remains local. Frontend compilation,
97 calculation/preference/NI tests and 22 quota/service/remedy tests passed after
fixing a detected paired-NI-source regression. Live browser positive quota-rate
verification is still pending (the earlier ledger-only browser check is separate).

Automatic declared-tax population remains disabled. Partial allocation splits,
critical/provisional security, non-kilogram quotas, NI paired-capacity treatment,
cross-declaration allocation ownership and certification remain deliverables,
not claims covered by this full-allocation estimate path.

## Live quota worksheet QA — 15 September 2026

Chrome verified the new controls against the real calculation API on the
synthetic `QA-DUTY-VAT-AUDIT` record. A clearly labelled synthetic allocation
for 10 KGM against saved net mass 10 returned used 10 / remaining 0. Reducing
the allocation to 9 returned an explicit overuse error and no tax totals.
The worksheet reference, status, dates, unit and evidence were entered through
the UI; the API saved the calculation history. The record was then restored:
blank commodity, origin, net mass and quota number; preference 100; allocation
worksheet removed; original procedure 5300 retained. Recalculation confirmed
All changes saved and the original incomplete-procedure explanation. No customs
submission was made. Retained synthetic audit entries are intentional.

A misleading missing-allocation message was changed to distinguish quantity
reconciliation from incomplete tariff eligibility. This copy-only fix is live
in API v123, with all 51 source files exactly verified and JWT enabled; the
calculation version remains `.48`. Dexter remains v256 and uses this API.
Ninety-one calculation/preference tests pass. Responsive/dark-mode visual QA and
actual quota-rate eligibility are not proved by these interaction checks.

## Quota evidence controls and ledger deployment — 15 September 2026

The local item calculation panel now provides a quota allocation evidence
worksheet: requested/confirmed/rejected status, allocation reference, total
quantity, unit, dates and document evidence. Preferential quotas also retain
origin evidence. Changed item identities are called out; users can remove stale
draft evidence. The shared allocation summary reports quantities across the
declaration and explicitly distinguishes this from a cross-declaration balance
or customs approval. It uses the existing form controls, responsive two-column
layout, semantic theme tokens and progressive disclosure. Frontend TypeScript
compilation passed; this new worksheet still needs browser interaction QA.

The reviewed calculation path `.48` is now deployed to `icustoms-api` v122 and
`agent-dexter` v256 on the approved Multideck project. Both are ACTIVE, JWT is
enabled, and all 51 API / 56 Dexter source files matched an exact readback.
Only the calculation adapter, result type/version and quota validation/ledger
modules were overlaid on the prior live bundle. **The unverified iCustoms XML
mapping was not deployed.** No hosted frontend deployment or customs submission
was performed. This supersedes the local-only status of the ledger below, but
does not prove a live quota allocation calculation or reduced duty result.

## Declaration quota quantity reconciliation — local, 15 September 2026

Local calculation version `.48` accepts item-keyed `quotaAllocations` reviews
and retains a declaration-wide `quotaAllocationLedger` in the audited result.
The ledger uses saved net mass for KGM and requires one explicit evidenced
tariff quantity for another unit. Reviews must match current item commodity,
origin, preference and quota order; cover the calculation date; and include
every quota item once reconciliation is requested. Reviews left against deleted
items, conflicting allocations and exact fractional overuse fail with an
explanation. GB reviews cannot use XI allocations.

This is quantity reconciliation, not quota eligibility or allocation creation.
The engine still requires the retained official quota measure and applicable
conditions before any reduced-rate result. The ledger is retained on incomplete
results; it does not insert declared tax, spend a cross-declaration allocation,
or make a request to customs. Operator controls, complete measure selection,
cross-declaration allocation ownership and provider verification remain pending.
The same draft adapter remains the UI/API/Dexter calculation path.

The new saved-draft test exercises 60kg + 40kg against a 100kg allocation,
exact fractional overuse, changed order, requested rather than allocated status,
invalid date, deleted item, incomplete review coverage and input immutability.
All 11 preference/draft tests pass. This change is local, not deployed.

## Quota declaration field — local integration, 15 September 2026

The import item now retains `quotaOrderNumber`, exposes it in the expanded
item and configurable columns, and supplies DE 8/1 / Box 39 help. Existing
drafts without the field remain readable. Client validation, calculation input
validation and the provider adapter reuse `quotaClaimIssues`: a claimed quota
needs its order number, full-rate treatment must not carry a stale quota number,
and GB-to-NI must leave DE 8/1 empty. These are structural checks, not evidence
that allocation, origin, NI capacity or supporting-document requirements passed.

The local XML builder now groups `DutyRegimeCode` and `QuotaOrderID` under
`Commodity/DutyTaxFee`, matching the partial-quota declaration example in HMRC
**CDS 03 DSSD v2.32**, in the
[20 August 2026 technical documentation package](https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/resources/CDS_Technical_Documentation.zip).
The old `Preferences` wrapper is removed for imports; export output is unchanged.
This is HMRC schema/example evidence, not confirmed iCustoms ingestion evidence.
The iHub documentation endpoint returned HTTP 401 during this check. Provider
acceptance must be confirmed before claiming this mapping is operational.

Current [HMRC Group 8 guidance](https://www.gov.uk/government/publications/cds-uk-trade-tariff-volume-3-import-declaration-completion-guide/group-8-other-data-elements-statistical-data-guarantees-and-tariff-related-data),
updated 7 September 2026, specifies an6 and the different GB-to-NI NIQUO route.
The new field does not claim that completing NIQUO alone establishes eligibility.

Local checks: frontend TypeScript compilation, 41 quota/provider tests and 89
calculation/preference tests passed. The treatment-only duty group is tested
separately from the two manually entered tax groups. Calculator version is
`2026-09-15.47` locally; the hosted backend remains `.46` / API v121 / Dexter
v255. No deployment, provider submission, save/reload UI check or allocation
integration is claimed for this change. Quota allocation candidate/ledger wiring
and final provider contract verification remain next steps.

Follow-up: Chrome save/reload now verified on `QA-DUTY-VAT-AUDIT` only.
The synthetic order `051867` survived persistence with its leading zero; it was
then cleared and saved to restore the record. No provider submission was made.
The shared draft adapter now records quota claims under the quota rule family;
non-preferential 1-series quotas do not incorrectly request preferential-origin
proof. Preferential quotas retain both families. Manual rates still cannot
manufacture an allocated reduced-duty result, and changing the quota order makes
an existing calculation stale. Thirteen targeted preference/draft-state tests
passed. Backend deployment and actual allocation wiring remain unverified.

## Full-rate quota alternative correction — 15 September 2026

Calculation version `2026-09-15.46` is deployed to the approved Multideck
backend: `icustoms-api` v121 and `agent-dexter` v255, both ACTIVE with JWT
verification enabled. All 49 API files and 56 Dexter files were read back and
matched against the deployment payload. Only the reviewed selector/version
changes were overlaid on the live bundles; unrelated checkout changes were not
deployed. No frontend deployment or customs submission was performed.

For GB preference 100, an available type-122/preference-120 quota is retained
as an unclaimed alternative rather than blocking the standard type-103 duty.
The result explicitly records that full-rate duty was retained. This does not
claim a quota, consume an allocation, remove a safeguard or enable quota-rate
calculations. Type 696 safeguards, 651/652 additional charges, remedies,
unresolved source relationships and other quota treatments still require their
own checks. NI is deliberately unchanged.

Basis: the official [preference correlation table](https://uktrade.github.io/tariff-data-manual/documentation/data-structures/preference-codes.html)
distinguishes the 100/103 selection from 120/122 while retaining additional
charges applicable to preference 100.

Verification: 9 preference/selection tests, 27 quota/remedy/source/service/Dexter
tests, and 107 calculation, NI, conversion, temporary-admission, save-state and
submission-link tests passed. The new exclusion test includes safeguard and
additional-charge regressions, invalid correlation, unresolved evidence,
unchanged input and NI denial. This is test and backend readback evidence, not
a confirmed live quota allocation or CDS assessment.

The full plan remains incomplete: allocation-to-declaration integration,
remaining specialist treatment paths, authoritative precision certification and
representative CDS reconciliation are still required. The calculation goal must
not be marked complete on the strength of these passing tests.

## Remaining implementation

EUR-specific tariff conversion is implemented locally through a separate,
dated reference path, not reuse of the invoice/freight HMRC exchange rate.
The service retains the original publication and SHA-256 fingerprint; current
and historical client evidence views expose the selected rate, direction,
effective start, retrieval time and publication record. Client compilation
passes, but these views have not been verified against saved live audit rows.
Other foreign tariff currencies remain rejected. On 14 September 2026, HMRC's published industrial-euro page explicitly
distinguished duty conversion from ordinary invoice/freight conversion, but
covered only 2013–2020. It therefore does not provide a valid 2026 rate source.
The current API, date selection and direction are documented below. Certification,
authoritative precision and representative assessment verification remain release
gates; local implementation does not enable automatic population. Do not extend
the old publication's last rate into the present.
Source: [HMRC euro duty conversion](https://www.gov.uk/government/publications/rates-and-allowances-monthly-euro-conversion-rates-for-calculating-duty).

Follow-up source inspection on 14 September 2026 found a distinct live
[XI monetary exchange-rate endpoint](https://www.trade-tariff.service.gov.uk/xi/api/v2/monetary_exchange_rates).
It returned 69 records. The latest observed record was ID `2299`, child currency
`GBP`, exchange rate `0.8572`, operation date `2026-06-21`, and validity start
`2026-09-01T00:00:00.000Z`. These are observed reference fields, not an approved
conversion or a value to hardcode. The response does not expose the parent
currency or validity end, so the adapter must resolve direction and period
semantics before applying it, including amendment handling and rounding.

The official backend at commit
`7dfc02419adb23a65d516577f51530f3904a1dbe` confirms that this controller selects
GBP child-currency records, joins monetary exchange periods, returns the last
five calendar years and orders by validity start. Its serializer includes rate,
operation date and validity start. This is separate from the ordinary monthly
invoice-currency API. Retain response snapshots because this rolling endpoint
cannot supply indefinite historical replay. Do not use the backend model's
`latest` helper (which sorts by operation date) as the calculation-date selector.
Sources: [controller](https://github.com/trade-tariff/trade-tariff-backend/blob/7dfc02419adb23a65d516577f51530f3904a1dbe/app/controllers/api/v2/monetary_exchange_rates_controller.rb),
[serializer](https://github.com/trade-tariff/trade-tariff-backend/blob/7dfc02419adb23a65d516577f51530f3904a1dbe/app/serializers/api/v2/monetary_exchange_rate_serializer.rb),
[model](https://github.com/trade-tariff/trade-tariff-backend/blob/7dfc02419adb23a65d516577f51530f3904a1dbe/app/models/monetary_exchange_rate.rb).

The official frontend at commit `c134904e688e0a63ea6e03a92711aad87cd21f7c`
provides implementation evidence for direction: its specific-duty evaluator
multiplies quantity × euro duty amount × the GBP monetary exchange rate. Its
rate selector matches the import year/month against validity start. Therefore
the observed rate represents GBP per EUR for this evaluator, not EUR per GBP.
This establishes the conversion direction, but is not CDS precision certification.
The official example falls back to the latest rate when the requested month is
absent; Multideck must **not** copy that fallback because it would silently price
a historical or future declaration with a different period. Missing periods and
ambiguous same-period amendments must require information, with exact decimal
arithmetic rather than copying the reference implementation's floating point.
Sources: [specific-duty evaluator](https://github.com/trade-tariff/trade-tariff-frontend/blob/c134904e688e0a63ea6e03a92711aad87cd21f7c/app/services/duty_calculator/expression_evaluators/measure_unit.rb),
[rate accessor](https://github.com/trade-tariff/trade-tariff-frontend/blob/c134904e688e0a63ea6e03a92711aad87cd21f7c/app/services/duty_calculator/expression_evaluators/base.rb),
[dated selector](https://github.com/trade-tariff/trade-tariff-frontend/blob/c134904e688e0a63ea6e03a92711aad87cd21f7c/app/models/duty_calculator/api/monetary_exchange_rate.rb).

Local implementation now includes `customs-tariff-exchange-rate.mts` (strict
month selection, decimal string validation and ambiguous-amendment rejection)
and `customs-tariff-exchange-reference.ts` (fixed source, 15-second timeout,
1 MB response cap, retained JSON and SHA-256). Three selector tests and two
fetcher tests passed. A live read through the new fetcher at
`2026-09-14T20:50:12.034Z` returned September record `2299`, rate `0.8572`,
with content hash
`0f5769ab9245f3f967267ec7656a593e9e869b3c4caa9f3fd209dc277219eb0d`.
This verifies retrieval, not a deployed integration or CDS calculation match.
Version `2026-09-14.29` connects the separately retained conversion through
standard measure selection, draft adaptation and exact specific/compound
arithmetic. Original EUR rates, record identifiers, dates and GBP-per-EUR rates
remain in input evidence and workings, including minimum/maximum comparison
groups. The service stores the complete publication beside, not inside, ordinary
invoice FX evidence. One fetch is shared across a calculation run; missing or
ambiguous periods fail before audit append and do not change the saved draft.
The 73 calculation tests include mixed GBP/EUR bounds. All 11 service tests
passed, including an injected official-tariff fixture testing the conversion,
retained audit payload, unmodified filing fields and missing-period failure.
These are synthetic integration fixtures, not customs certification or live
database persistence proof. NI standard specific/compound comparison was
subsequently connected in version `2026-09-14.35`, as described below.
No rule family is certified or automatically enabled.

### NI equivalent-duty comparison: reviewed boundary

On 14 September 2026 the current HMRC guidance states that an EU-minus-UK
difference **equal to or greater than three percentage points** makes an
outside-UK/EU movement automatically at risk; UK duty at least equal to EU duty
has its own not-at-risk path, subject to processing requirements. Compare the
complete applicable duties, including eligible preferences and reliefs, rather
than headline rates. Source: [HMRC applicable-duty guidance](https://www.gov.uk/guidance/how-to-make-sure-the-correct-duty-is-applied-to-goods-you-bring-into-northern-ireland-from-countries-outside-of-the-eu-and-uk).

The official frontend's `DutyOptions::Chooser` at commit
`c134904e688e0a63ea6e03a92711aad87cd21f7c` instead selects UK when the absolute
difference between option amounts is less than or equal to a penny-rounded
3% customs-value threshold. Do not copy that chooser as the legal risk decision:
it is an option chooser with different boundary behaviour, not proof that the
existing signed `>= 3` risk test should change. Retain exact comparison amounts
and explicitly test equality, just-below, UK-greater-than-EU and zero customs
value. Source: [official option chooser](https://github.com/trade-tariff/trade-tariff-frontend/blob/c134904e688e0a63ea6e03a92711aad87cd21f7c/app/services/duty_calculator/duty_options/chooser.rb).

The current draft adapter selects the NI tariff before the valuation engine
allocates costs. Specific/compound comparison therefore needs a staged
valuation result shared by both UK and EU evaluations; invoice price alone is
not the customs-value denominator. Do not introduce a second allocation engine
or use rounded displayed duty amounts to infer an equivalent percentage.
This is the next integration requirement, not a certified formula or an
implemented NI-specific comparison.

Progress through calculation version `2026-09-14.33`: the pure risk model now
accepts exact equivalent-duty GBP fractions as well as percentage-only
evidence. It rejects zero/invalid denominators, mismatched UK/EU valuation
references and different customs values. The calculation engine evaluates
the risk decision after allocation/valuation, checks its exact customs value
against the comparison basis, and checks the selected non-excise duty against
the amount used in that comparison. Tests cover equality at three points,
just below it, UK duty exceeding EU duty, invoice-value substitution, stale
comparison amounts and a matching UKIMS case. These checks remain uncertified.
Version `2026-09-14.35` connects the draft's paired standard specific/compound
selector to that stage. It carries complete, unconditional A00 UK/EU measures
and UK VAT evidence into the engine, evaluates both with the extracted shared
`customs-tariff-evaluator.mts`, and then chooses the applicable measure locally
without mutating saved input or allocating twice. Missing references,
unresolved conditions, additional fiscal measures, preferences other than 100,
and non-4000 procedures remain explicit blockers needing their own adapters.
This does not certify all NI movements or specialist cases.

The saved-draft test verifies freight changes the customs-value denominator
and may change the decision; a separate server fixture verifies XI EUR/UK GBP
measures, retained tariff-conversion JSON and audit payload, and unchanged
filing fields. Current focused results: 74 calculation tests, three paired
comparison tests, five conversion tests and 11 service tests passed. The item
UI now offers a collapsible UK/EU comparison with stale-state wording, and both
tariff references appear in current and historical source lists. Rendering,
keyboard/mobile/theme behaviour and real save/reload still require browser
verification against an installed calculation backend.

1. Configure/verify managed tariff credentials and extend the initial standard
   selection into the complete applicability resolver (conditional/alternate rates).
2. NI and specialist adapters with explicit treatment evidence and complete UI.
   The official API's Northern Ireland documentation requires combining XI duty
   evidence with UK VAT/excise evidence where applicable; XI does not include EU
   quotas. Separate source snapshots are implemented for simple estimates, not
   the complete NI eligibility/route resolver. Source: https://raw.githubusercontent.com/trade-tariff/trade-tariff-api-docs/main/source/the-trade-tariff-api.html.md.erb
3. Full adjustment-code semantics and agreed VAT costs. The invoice/item scope
   editor and saved-data adapter are implemented; end-to-end persistence remains
   to be verified.
4. Automatic validated result population/recalculation with no accidental manual
   CDS override, plus permitted manual-override submission rules.
5. Map verified provider assessment payloads into item/base/tax records and connect
   detailed reconciliation to the preserved response history. Immutable response
   capture is implemented locally; assessment extraction and UI remain outstanding.
   The declaration comparator reports evidence completeness independently of
   differences: a known mismatch with missing bases cannot imply a complete
   assessment. The targeted declaration-assessment regression test passes.
   The inspected iCustoms Swagger snapshot describes notification/declaration payloads
   as generic strings rather than typed item-tax assessments. Do not invent a field
   mapping from that contract; obtain a documented or representative response fixture.
   The integration PDF has also been inspected: pages 26 (notifications) and 32
   (declaration details) contain no response body or assessment schema. The exact
   fixture requirements and mapping acceptance criteria are recorded in the
   [assessment evidence contract](customs-assessment-evidence-contract.md).
6. Dexter reads, allowlisted calculation/override actions and deterministic saved
   calculation watch adapters are implemented locally, not deployed. Their complete
   chat-to-service journey, watch creation and history access still need verification.
   Calculation-specific watches require the deployed `calculationEvent` capability;
   the prompt directs requests to the dedicated Watchers flow conditionally.
   generic declaration writes must not fabricate calculation results or overrides.
7. Responsive, keyboard, save/reload, failure and live-service browser QA.
8. Reviewed audit migration/function deployment after certification/security gates.

## Verification so far

- Structured tariff component decoding now covers base expression `01` and
  additive expression `04`, including GBP-specific duties. The decoder requires
  one evidenced quantity for each required unit/qualifier, preserves exact
  KGM/DTN and LTR/HLT conversions, and rejects ambiguous quantities, foreign
  tariff currencies and other expressions. Its source is the official Trade
  Tariff API's units/measure-component examples. The corn-cob formula fixture
  verifies arithmetic, not a current rate or eligibility decision. This decoder
  is now connected to the official standard-measure selector and saved per-item
  `tariffQuantities` setup. A save/restore fixture proves litre-to-hectolitre duty
  and VAT calculations, item isolation and continued blocking of conditional
  measures. The expanded item panel now has an optional quantity editor with
  amount, unit, qualifier and evidence fields, item-local add/remove controls
  and a 20-row limit enforced by the decoder. It uses the existing save/stale
  calculation workflow. Browser editing/persistence and a live provider journey
  remain unverified; compound auto-population remains disabled pending certification.
- Calculation rule version `2026-09-14.6` includes the structured specific-duty
  selector. UI staleness and server override validation both reject older rule
  or precision versions, even when the date and draft are unchanged. Historical
  results remain immutable and visible; a fresh calculation is required before
  reviewing an override. This is not automatic retrospective recalculation.
- Explicitly identified Alcohol Duty measures now round the product duty down
  to a whole penny before its payable amount enters VAT valuation, following
  [HMRC Alcohol Duty calculation guidance](https://www.gov.uk/guidance/work-out-how-much-alcohol-duty-you-need-to-pay).
  This path requires an excise measure expressed in LPA, retains unrounded
  component workings and shows the rounding step. HMRC's 360.99 LPA example
  at £22.58 reproduces £8,151.15. This is not a universal excise/customs/VAT
  rounding rule. Product grouping, strength determination, relief eligibility,
  dated excise selection and end-to-end CDS verification remain outstanding;
  no excise family is certified or auto-enabled by this arithmetic test.
- The quantity decoder can derive LPA from LTR/HLT only with explicit ABV
  (0–100%) and separate strength evidence. Original volume, ABV and evidence
  remain in the input snapshot and the conversion appears in workings; ordinary
  litres never implicitly become LPA. Volume rows expose these optional fields.
  The 4,297.5-litre / 8.4% HMRC fixture yields exactly 360.99 LPA. This does not
  certify strength measurement, choose a product tax band or enable excise selection.
- New audit records use `tariffReferenceEvidence` format
  `tariff-reference-evidence-v1`: unique fetched snapshots plus explicit duty/VAT
  links per item. The service retains the full raw response once when its fetched
  object is shared across repeated lookups, rather than serialising the same graph
  for every item. Distinct responses are never merged by commodity/date, so an
  amendment remains separate. Lookup errors stay attached to their item. Earlier
  immutable records keep their original envelope; result/input history rendering
  is unchanged. A 1,000-item fixture retains every link and uses less than one tenth
  of the previous repeated-snapshot payload size (fixture evidence, not live scale QA).
- The server performs structural preflight before currency discovery or provider
  calls: import direction, territory, 1–1,000 items, unique item/header identities,
  valid invoice links and the existing 99 populated-adjustment limit. Rejected
  drafts receive a specific 422 explanation without fetching tariff/FX evidence.
  Fiscal validation remains in the calculation engine rather than being replaced
  by these structural checks. Empty optional adjustment rows do not count as costs.
- Explicit GB preference 100 now treats type-142 tariff preferences and type-119
  airworthiness suspensions as unclaimed
  alternatives, recording their identities/reason without applying their rates.
  This follows the [UK tariff preference-code model](https://uktrade.github.io/tariff-data-manual/documentation/data-structures/preference-codes.html).
  Additional taxes, quotas, unknown fiscal measures, incomplete references and
  conditions on the chosen duty still block the ordinary selection. No exclusion
  is inferred for a missing preference code, preference claims or NI treatment.
  This is not a complete preference/measure correlation implementation.
- Rule version `2026-09-14.7` adds the airworthiness exclusion. A read-only public
  tariff check for commodity 8536909500, CN origin, UK dataset, 14 September 2026
  returned HTTP 200: selected third-country duty 0%, VAT 20%, with the conditional
  airworthiness measure retained and explicitly not claimed. This proves the real
  response parser and this ordinary selection, not managed OAuth credentials,
  live application integration, relief eligibility or certified auto-population.
  The five service tests also pass after this change.
- Rule version `2026-09-14.8` decodes structured MIN/MAX groups (15, 17, 35),
  with additive components kept inside their respective group (01, 04, 19, 20).
  Bounds compare exact values, never the rounded display amounts; workings show
  each comparison and whether it applied. The documented illustrative formula
  `9.1% + GBP45.1/DTN MAX 18.9% + GBP16.5/DTN` is tested both below and above
  its cap, including saved item quantity mapping and VAT on the resulting duty.
  Source: [UK Tariff Data Standard measure components](https://uktrade.github.io/tariff-data-manual/documentation/data-structures/measure-components.html).
  Duplicate expressions, unsupported operators, missing quantity evidence,
  foreign-currency specific rates and mixed manual/structured bounds fail closed.
  This extends formula arithmetic, not relief eligibility or CDS certification.
- Rule version `2026-09-14.9` introduces invoice-scoped fixed-contract worksheets.
  Foreign invoices settled in GBP use the evidenced fixed rate; GBP invoices
  created from a fixed foreign rate are reconverted through that currency using
  the dated HMRC rate. Intermediate amounts remain exact. Worksheets require
  matching invoice identity, currency/direction, contract-period coverage,
  fixed-rate clause and GBP-payment evidence. A letter-of-credit rate alone
  still cannot activate the treatment; a conflicting recorded rate blocks it.
  Other costs continue using ordinary HMRC conversion, and different invoices
  may use distinct contract rates without overwriting the currency reference.
  This adapter currently applies only to GB Method 1 estimates. Its separate
  `contract-conversion` certification gate remains closed. The expanded-item
  editor now writes the linked invoice's worksheet, explicitly warns that its
  other items are affected, and leaves GBP settlement unconfirmed by default.
  Shared client/server evidence validation explains missing information. The
  editor uses the existing draft save/stale workflow, not a separate persistence
  path. Browser save/reload, NI/alternative-valuation treatment and contract review
  remain to be implemented/verified. The original worksheet and intermediate
  foreign amount are retained in calculation snapshots and conversion workings.
- The separate `ni-risk-2026-09-14.1` decision module now evaluates complete
  percentage-duty comparisons, the inclusive three-percentage-point threshold,
  processing turnover and approved purposes, and UKIMS importer/date/end-use
  conditions. Missing evidence produces `needs-information`, not an assumed
  not-at-risk decision. One failed processing basis does not rule out another
  permitted basis. Pending meat-quota requests are not treated as allocations.
  The invoice-item facts editor is now connected through the existing draft
  save workflow. It does not calculate GB-to-NI VAT, free-circulation duty
  relief, specific/compound equivalents or historical risk rules. Its outcomes
  explicitly remain uncertified. Source: [HMRC not-at-risk guidance](https://www.gov.uk/guidance/check-if-you-can-declare-goods-you-bring-into-northern-ireland-not-at-risk-of-moving-to-the-eu).
- Rule version `2026-09-14.10` connects item NI facts to the backend's paired
  UK/XI requests and saved-draft adapter. The importer EORI comes from the
  declaration, while compared rates come from matching structured tariff
  snapshots, not the facts worksheet. The initial resolver requires preference
  100 and complete, unconditional single-percentage duties; additional taxes,
  conditions, compound comparisons and missing evidence block selection.
  Risk and tariff are derived per item, permitting mixed UK/EU duty treatments
  with unchanged cost scopes and separately sourced UK VAT. The risk inputs,
  decision reasons and both source snapshots are retained. Operator-rate mode
  cannot stand in for these official paired references. Local fixture coverage
  proves two mixed-risk items reconcile; live managed credentials, rendered
  editor verification, full specialist comparisons and NI certification remain outstanding.
- The NI editor collects item processing, quota, UKIMS and end-use evidence.
  Processing starts unconfirmed, eligibility checkboxes are unticked, and
  switching processing basis preserves previously entered evidence. Only the
  active basis is evaluated. Its saved server decision is shown with reasons
  and an out-of-date label after changes. It never calculates risk from invented
  browser rates. Enabling item evidence hides the legacy global risk/tariff
  choices for that item. Browser verification remains blocked: the Chrome
  extension was available, but acquisition of QA tab 642571068 timed out after
  20 seconds and reset the control kernel. No interaction, screenshot or
  save/reload success is claimed from this attempt.
- 52 focused calculation tests pass, including Mark's examples, missing inputs,
  cost scope, exchange-rate direction/date changes and non-hidden differences.
  NI core source validation now treats excise separately: UK excise can accompany
  EU duty, while an EU-sourced excise measure is rejected. A synthetic fixture
  verifies mixed-source arithmetic and VAT-base inclusion without relaxing duty
  jurisdiction checks. This does not implement the live excise eligibility/rate
  resolver or certify NI treatment. Source:
  https://raw.githubusercontent.com/trade-tariff/trade-tariff-api-docs/main/source/the-trade-tariff-api.html.md.erb
  Calculation version 2026-09-14.2 records signed adjustment workings in calculation
  order: customs additions before customs value, VAT-only additions/exclusions
  before VAT base. Direct item attribution is distinguished from proportional
  allocation. The recorded workings carry into history; existing snapshots remain
  unchanged. Mark's fixture verifies the placement and amounts of AP and AV.
  Each new allocation also retains the original cost/currency, effective GBP cost,
  exact allocation fraction and eligible item identities. Workings show the
  displayed percentage and total (for example, 60.00% of £500.00); calculations use
  the retained fraction, not that rounded percentage. Mark's split fixture verifies
  the 3/5 share and its source cost. Airfreight totals are the effective amount after
  the applicable route percentage; the original amount remains separately recorded.
  Quantity-based components require an explicit evidenced GBP tariff rate; missing
  or foreign currencies fail closed rather than being treated as GBP. Foreign
  specific-rate resolution remains part of the tariff adapter work and must not
  silently reuse invoice FX rules. Workings now show each percentage/quantity
  formula, applied minimum/maximum and VAT rate. Tests check the compound formula,
  currency ambiguity, minimum application and a zero rate denominator.
  Alternative valuation worksheets can calculate without an invoice purchase
  price. Missing goods value is retained as missing, not displayed as zero.
  Explicit single-item cost attribution does not invent a value-based denominator;
  shared value-based allocation still requires values for all eligible items.
  Tests cover no-sale valuation, direct freight, missing shared-allocation bases
  and Method 1 continuing to require a transaction value.
  Method 6 no longer accepts a bare alternative customs value. Its supplier UK
  export-price lane requires reasons Methods 1–5 failed, supplier/current-price-list
  evidence, applicability and an included-cost review. Exact unit price × quantity
  conversion uses the worksheet currency; explicit customs adjustments follow.
  The saved-data adapter and item editor are connected; tests cover independent
  currency, missing evidence, prohibited arbitrary basis selection, legacy-total
  rejection and inactive worksheets. Source:
  https://www.gov.uk/guidance/valuing-imported-goods-using-method-6-fall-back-method
  Flexible comparable and deductive lanes now reuse the existing evidence-led
  worksheets. The comparable lane permits a documented production-country
  difference only through Method 6; ordinary Methods 2/3 remain strict. The
  deductive lane requires an extended-period justification and actual sales.
  Both reject separate customs additions already accounted for in their value;
  VAT-only costs remain separate. Inactive export-price currencies are excluded
  from rate retrieval. Tests verify strict-method isolation, missing flexibility
  evidence, double-count rejection and saved-data round trips. The editor exposes
  the three bases without deleting inactive worksheets when switching.
  Other flexible Method 6 bases, detailed eligibility/NI validation, real browser
  persistence and certification remain outstanding. No Method 6 auto-population is
  enabled by this work.
  Method 4's actual-sales worksheet is connected to the item editor and saved-draft
  adapter. Exact-price grouping reproduces HMRC's greatest-aggregate-quantity
  example; evidenced per-unit deductions feed the customs value. Missing sales,
  unrelated-buyer confirmation, deductions and processing evidence fail closed;
  tied highest quantities at different prices require resolution rather than an
  invented price choice. Source: https://www.gov.uk/guidance/valuing-imported-goods-using-method-4-deductive-method
  Deposit estimates, account-sales schemes, detailed timing/processing eligibility,
  NI applicability and certification remain outstanding. JSON round-trip tests do
  not substitute for real browser persistence verification.
  Methods 2/3 now require structured comparable-import evidence in the core. The
  comparison preserves accepted GBP values, documented commercial/delivery
  differences, producer priority, commercial-level/quantity priority and the lowest
  adjusted eligible value. Missing evidence and duplicate entries fail closed.
  Sources: https://www.gov.uk/guidance/valuing-imported-goods-using-method-2-transaction-value-of-identical-goods
  and https://www.gov.uk/guidance/valuing-imported-goods-using-method-3-transaction-value-of-similar-goods
  Their item-specific saved-data adapter and multi-comparable editor are connected.
  JSON round-trip tests preserve the evidence, reject a method/worksheet mismatch
  and exclude inactive worksheets when returning to Method 1. Real browser
  persistence, NI applicability and eligibility certification remain outstanding.
  Method 5 core arithmetic now builds an evidenced producer-cost worksheet rather
  than accepting an unexplained alternative total. It requires accounts, accounting
  principles, usual profit evidence and method-order reasons; explicit zero/included
  components prevent omitted or repeated costs. Shared customs additions cannot be
  added again. Source: https://www.gov.uk/guidance/valuing-imported-goods-using-method-5-computed-value
  The saved-draft adapter and item worksheet editor are now connected. Component
  currencies enter the server's HMRC lookup inventory independently of the invoice
  currency; inactive worksheets do not affect Method 1. JSON save/reload mapping,
  missing rates and GBP conversion tests pass. Actual browser persistence, NI
  applicability and certification remain outstanding; this is not a completed or
  certified Method 5 workflow.
  New server-side draft estimates use today's Europe/London calendar date, recorded
  in their effective input/result rather than rewriting the saved invoice date.
  The editor detects old calculation dates on focus and while open; the service
  rejects new overrides against a previous day's estimate. UK summer-midnight and
  year-boundary tests pass. Existing historical calculations are not recalculated.
  Tariff tests cover graph integrity, additional/conditional measure safeguards,
  date/origin URL scoping, bounded token renewal and credential exclusion.
  Missing type/geographical references and unresolved additional measures block
  estimates. Fiscal/excise measures cannot disappear merely because their component
  list is empty; they require their dedicated treatment resolver.
  Measure families independently trigger preference/quota/procedure evidence
  requirements. Duplicate source measure identities and unspecified import-tax
  VAT-base treatment are rejected rather than double-counted or silently omitted.
  Saved-data scope tests cover invoice/selected-item allocation, stale references,
  namespaced item costs and header/item duplicate rejection.
  Assessment comparisons now include customs value and VAT base, require complete
  base evidence before reporting a match, reject foreign currencies and sub-penny
  input precision, and preserve exact penny differences. Non-VAT tax breakdowns are
  compared by tax type and payable/suspended/relieved/secured disposition, combining
  multiple measures of the same type. Equal aggregate totals cannot conceal missing
  or different taxes. Absent breakdowns are incomplete evidence, not a match;
  inconsistent assessed totals are explicit differences. Provider assessment mapping
  and reconciliation persistence remain outstanding; these tests verify comparison
  logic, not an end-to-end CDS assessment integration.
  NI fixtures verify separate duty/VAT provenance, missing UK VAT, wrong source
  identity, risk/tariff conflicts and blocked unimplemented movement treatments.
  History tests verify microsecond-preserving keysets, UUID tie-breaks, terminal
  pages and rejection of malformed/filter-injection cursors. Full browser paging
  and override reconfirmation against the deployed service remain unverified.
- Expanded items now expose the latest snapshot's FX rate values and direction,
  effective/retrieval dates, tariff/VAT references and quantity/strength evidence.
  The disclosure distinguishes retained evidence from source websites that may
  have since changed. Rule-change staleness copy now names calculation rules as
  well as inputs/date. Rendered interaction remains subject to the browser
  verification limitation below.
- Client TypeScript build check passes.
- Calculation/override confirmation is separate from the following history read.
  If a confirmed write is followed by a failed read, copy says the record was saved
  and offers a read-only history retry. Displayed figures become stale and cannot
  be overridden until fresh history arrives. This avoids reporting a saved write
  as failed or encouraging duplicate writes; browser fault-injection verification
  remains outstanding.
- Deno type checking passes for the calculation service, including its reference
  and history-query code; this does not prove a deployed integration.
- Five Deno service tests run the actual calculation/override functions with
  network permission disabled and an audit-client test double. They verify
  preflight rejection before external/persistence work, dated snapshots without
  draft mutation, no success after audit failure, HMRC lookup failure without
  an invented result, and rejection of old-date/rule/precision overrides before
  append. A successful override retains both original and replacement amounts
  and targets the parent calculation. These supplement, not replace, the real
  PostgreSQL access tests and still do not prove a deployed API journey.
- Full data-access regression runner passes: 26 database/access cases and 10
  additional access contracts. The extended Customs case checks history access,
  cross-company denial, append-only records, browser write denial and stale drafts.
  It also exercises the real Dexter read function for exact targets, bounded reads,
  source identity, stale results, caller-supplied company mismatch and foreign-record
  denial. Dexter runtime Deno type checking passes; deployed chat/action/watch
  journeys are not yet proven.
  The approval fixture installs the real calculation action registry migration and
  current mandatory-approval trigger, verifies both actions cannot enter execution
  without approval, then exercises approved transitions. Action adapter tests cover
  strict endpoints, argument isolation, caller credentials, denial and unknown outcomes.
- The Customs PostgreSQL fixture applies the calculation watch migration against
  real watch tables, matcher and evaluator. It verifies repeated calculation and
  override notifications, pause/resume, inactive and foreign-owner denial, exact
  targets, readable copy and direct internal-signal access rechecks. This proves
  the local event path, not deployed watch creation or browser delivery.
- The same fixture applies provider-response capture and verifies queued requests
  are not assessments, timestamp-only updates are ignored, earlier response bodies
  survive replacement, response history is immutable and declaration-scoped,
  browser writes are denied and submissions cannot be reassigned to another target.
- Chrome confirms the expanded estimate panel renders and the undeployed endpoint
  fails without changing declaration tax fields. This is not live-service proof.
- Full browser journey, deployed endpoints, comprehensive specialist coverage and CDS
  matching remain unverified. No calculation migration/function deployed and no
  declaration submitted by this task.
  Latest browser attempt: the existing synthetic QA declaration returned HTTP 200
  from the active port-3000 server, but Chrome navigation and the subsequent state
  read both timed out. This isolates the current verification obstacle to browser
  control, not proof of an application outage. Other-session QA tabs were left
  untouched. No browser happy-path or persistence claim follows from HTTP 200.
  Subsequent native-Chrome check selected this task's existing Duty calculation
  QA tab and verified its synthetic declaration URL. The content had no accessible
  page tree, the screenshot was blank, and raising/refreshing the window did not
  change that state. The edited calculation-panel module returned HTTP 200 from
  the existing port-3000 process. Browser interaction, console health, responsive
  presentation and save/reload therefore remain unproven; neither a passing UI
  check nor an application failure is inferred from these observations.

## Current delivery update — 15 September 2026

Earlier verification notes above are historical. The deployed assessment workflow
and its proof boundaries are recorded in `customs-assessment-evidence-contract.md`.

Temporary admission now has an item-level partial-duty worksheet in Calculation
inputs for entry/previous procedure 53. The saved calculation service retains its
original-assessment references, operator-entered evidence, exact arithmetic and
displayed balance in `result.temporaryAdmissionLedgers`. It remains separate from
complete line tax assessments and declaration totals; VAT is not inferred.
The operator can edit/remove the draft worksheet without deleting audit history.
Changing procedures, jurisdiction or event is validated again by the server.

Source checked: HMRC temporary-admission handbook, Partial relief, updated
22 May 2026. Full authorisation and eligibility remain evidence-led. Source
references entered in the worksheet are not automatically verified assessments.

The existing approved calculation action, tenant-scoped calculation read domain
and deterministic calculationEvent watch carry the same saved result. Dexter's
prompt explicitly excludes independent arithmetic and adding worksheet duty to
totals. Dedicated chat worksheet editing and expiry monitoring are unsupported;
the item editor is the supported evidence-entry surface.

Deployment: approved MultiDeck project `aqtwypsuijxlnvtxpuxe`, icustoms-api v112
and agent-dexter v246 ACTIVE with JWT verification. Runtime readback matched every
deployed file; unrelated deployed files were preserved. Anonymous API access
returned 401. No schema changes or customs submissions in this update.

Verification: 82 calculation/TA tests, 10 historical-state/submission-link tests,
frontend TypeScript and API Deno type checks passed. Service tests cover retained
worksheet evidence, unchanged tax fields and denied audit writes. Chrome verified
the procedure selector and worksheet entry point; it then timed out opening the
form. Full live worksheet save/reload, responsive and dark-mode QA remain unproven.
The QA procedure change was not saved. No hosted frontend deployment is claimed.

This is not completion of the full plan. Comprehensive specialist VAT/procedure,
preference/quota/remedy integration, CDS precision certification and positive live
assessment reconciliation remain release gates. Ordinary calculations remain
estimates; no rule family is silently promoted to certified automatic population.

### Preference and national VAT update — 15 September 2026

Unrestricted GB preference codes 200/300 now select retained official preference-code
relationships rather than applying an entered percentage. Saved item evidence records
proof, validity, origin rules, transport review and the selected legal measure. Ambiguous
measures require an explicit choice. Additional fiscal measures remain blockers rather
than disappearing when a preference is claimed. NI preferences, different preferential
and non-preferential origins, quotas and conditional measures remain gated.

National VAT codes select the corresponding official VAT measure. VATZ/VATR require
recorded eligibility evidence; neither a zero rate nor eligibility is inferred from
the commodity alone. Non-monetary supplementary-unit measures are not treated as
additional taxes; unexpected monetary components still block calculation.

API v113 and Dexter v247 are ACTIVE on the approved MultiDeck backend with JWT
verification. Readback matched all 48 API and 56 Dexter files. The same approved
calculation action and deterministic event watch carry the saved result. Dedicated
chat evidence editing is explicitly unsupported; use the item editor.

Verification: 84 calculation/preference tests and 14 service tests passed, with frontend
and API type checks. A read-only public tariff response for commodity 6203423100,
origin MA, dated 15 September 2026 selected official preference measure 20097695,
standard VAT 20%, and the separately evidenced VATZ alternative. Synthetic proof in
that diagnostic does not certify a real preference claim.

Native Chrome verified the expanded item inputs, missing-origin disabled state and
stale-result explanation. The synthetic QA preference was temporarily changed from
100 to 300, then restored to 100; this form autosaves. No declaration was submitted.
Full preference evidence save/reload, responsive/theme verification and positive live
CDS reconciliation remain unproven. No hosted frontend deployment is claimed.

### NI VAT selection correction — 15 September 2026

Both paired NI paths (percentage and specific/compound duty) now receive the item's
national VAT codes and matching saved eligibility evidence. They select the UK VAT
measure independently of the UK/EU duty decision. Changing VATZ to VATR invalidates
the previous review; conflicting codes or missing proof block the result. The
specific-duty comparison retains the VAT review in both candidate evidence records.
This fixes a disconnected input path, not NI preference or special-procedure coverage.

Calculation version `2026-09-15.39` preserves older results and marks them stale.
API v114 and Dexter v248 are ACTIVE with JWT verification; readback matched all
reviewed files and anonymous API access returned 401. The existing audit operation,
approved Dexter action and deterministic calculationEvent watch are unchanged.
Dedicated evidence editing remains in the item UI. No migration or submission.

Verification: 85 calculation/preference tests, 16 service/action tests and API type
checking passed. NI fixtures cover both duty paths, separate UK VAT references,
standard/zero/reduced rates, changed proof, conflicting codes, unchanged inputs
and disabled certification. These are synthetic fixtures, not CDS assessments.

Source review for the remaining remedy adapter confirmed that safeguard and
anti-dumping interaction cannot be implemented as unconditional addition of every
measure. Keep that adapter gated until its measure selection and interaction rules
are implemented and verified against applicable legal measures:
https://www.gov.uk/guidance/check-when-you-need-to-pay-anti-dumping-countervailing-and-safeguard-duties

### NI reporting and B05 breakdown — 15 September 2026

NI at-risk results now report the EU duty codes A50/A70/A80/A85/A90/A95 instead
of their UK equivalents. The original input measures remain unchanged. This
reporting conversion does not enable currently gated additional-duty adapters.
The VAT result contains separate B00 goods/costs and B05 EU-duty bases and amounts,
including full-precision amount evidence. Their sum is not added again to total VAT.
Mixed declarations aggregate these rows by tax code and liability disposition.
Any difference between rounded rows and aggregate VAT remains visible and blocks
automatic population; no penny is silently distributed. NI special-procedure VAT
requires its own evidenced B00/B05 allocation and remains gated.

The expanded workings and declaration liability totals display this split using
existing UI patterns. Dexter reads the same saved result and explicitly avoids
double-counting it; the existing approved calculation action and deterministic
calculationEvent watch retain their permission boundaries. Historical versions
are not rewritten or given an inferred split. NI CDS assessment comparison is not
yet supported by the ordinary assessment adapter.

Source: HMRC NI declaration-completion requirements, Part 2, DE 4/3 / Appendix 8,
updated 21 May 2025, inspected 15 September 2026:
https://www.gov.uk/government/publications/customs-declaration-completion-requirements-for-the-northern-ireland-protocol/part-2-cds-declaration-completion-requirements-for-the-northern-ireland-protocol

Version `2026-09-15.40`; API v115 and Dexter v249 ACTIVE with JWT verification.
Deployed-file readback matches the reviewed uploads. No schema change or customs
submission. Verification: 90 calculation/NI/preference tests, 16 service/action tests,
frontend and API type checks. The service fixture verifies retained A50/B00/B05
and unchanged submission fields. Real NI UI save/reload, responsive review and
positive CDS assessment matching remain unverified; no hosted frontend release.

### NI final-assessment adapter — 15 September 2026

Adapter `final-gbp-ni-v2` adds final, outright-paid, GBP percentage assessments
with exactly A50/B00/B05 and regime 100. It requires the original submission-linked
calculation to contain the NI split; historical aggregates never receive an invented
split. B00/B05 bases and amounts are compared separately, so offsetting differences
cannot disappear inside an unchanged total. Missing splits are incomplete evidence.
Different rates, extra taxes, provisional/security/relief/payment-timing cases retain
their separate gates. B05 cannot be entered as a non-VAT duty in the common engine.

### Retained NI response integration verification

The assessment-service tests now exercise synthetic final A50/B00/B05 JSON plus
retained XML, with XML tax rows in a different order. The service verifies GBP
attributes and percentage units, resolves the original submission-linked
calculation and writes separate VAT comparisons through the audit RPC. Source
and calculation evidence remain unchanged. A conflicting XML currency produces
no comparison rather than a false match. All six assessment-service tests pass.
This verifies the local service boundary using a simulated database, not a live
CDS response, database persistence or browser reload. No declaration was submitted.

### Provisional remedy liability correction

Calculation version `2026-09-15.42` rejects provisional anti-dumping/countervailing
tax codes A35/A45 (and NI A85/A95) as payable duty. They require trade-remedy
treatment; suspension or relief also requires procedure evidence. Secured amounts
remain visible separately and do not enter ordinary payable duty or its VAT base.
This follows HMRC's provisional-duty security requirement:
https://www.gov.uk/guidance/check-when-you-need-to-pay-anti-dumping-countervailing-and-safeguard-duties

Local verification: 85 calculation/NI tests pass, including UK and NI security,
payable rejection, source immutability and separate VAT. This corrects common
engine semantics; it does not yet supply the missing official remedy-selection
adapter, safeguard interaction or a live deployment of version .42.

Version .42 deployment subsequently verified: `icustoms-api` v117 and
`agent-dexter` v251 are ACTIVE with JWT verification enabled. Readback matched
all 48 API and 56 Dexter bundle files. Only the reviewed engine and rule-version
files changed; Dexter delegates calculation to the same API and receives the
matching stale-result version. Anonymous API access returned 401. No database
migration or customs submission was performed. This deployment does not certify
the remaining rule families or prove a live positive provisional-duty assessment.

### Official remedy selector foundation

`customs-trade-remedies.mts` selects reviewed 551/552/553/554 tariff measures
using the retained commodity/origin/dataset/date, exporter additional code and
legal evidence. It requires one selection per active type, preserves ADD and CVD
separately and derives provisional security rather than accepting a payable flag.
Exporter alternatives must share the same legal acts; different liabilities cannot
silently disappear. Conditional, unresolved and concurrent provisional/definitive
measures remain blocked pending their dedicated decision paths.

Three synthetic selector tests cover evidence changes, omitted CVD, exporter
mismatch, different legal acts and provisional security. This module is not yet
connected to saved drafts or deployed. Next: compose it with the complete fiscal
measure selector, preserve all remaining blockers, and add the operator evidence
flow plus service/audit tests. Safeguard interaction is still required, not waived.
Measure-type structure source (not policy certification):
https://uktrade.github.io/tariff-data-manual/documentation/trade-policies/trade-remedies.html

The next local step, version `.43`, connects `remedyReview` on saved item
calculation evidence to GB tariff selection. Reviewed remedy measures enter the
common item calculation; every other fiscal measure remains a blocker. Four
selector tests and 91 calculation/NI/preference regressions pass, as does draft
adapter type checking. Operator editing, dedicated saved-draft/service fixtures,
NI paired remedy selection, safeguard interactions and deployment are outstanding.
Automatic population remains uncertified. The deployed version is still `.42`.

Saved-draft integration now has a synthetic £1,000 invoice fixture: 12% ordinary
duty plus 10% definitive ADD produces £220 payable duty and £244 VAT. Changing
the official remedy to provisional retains £100 security separately, £120 payable
duty and £224 VAT. Source draft values remain unchanged and certification stays
off. The review must match the item's active TARIC additional code; changing either
the item code or reviewed exporter code invalidates the result. Seven focused
preference/remedy tests and draft type checking pass. Service persistence and the
operator editor remain to be verified/implemented before deployment.

Service integration now fetches the dedicated tariff FX publication for selected
EUR remedies as well as base duty. A synthetic GBP invoice with 12% base duty
and EUR 2/kg ADD on 30 kg at 0.8572 GBP/EUR produces £171.43 duty and £234.29
VAT under the estimate precision policy. The audit RPC receives the same result
and retained tariff publication; invoice FX remains unused. Missing tariff FX
raises 503 without appending an audit or changing the draft. All 14 service tests
pass. This is simulated provider/database proof, not a live assessment or certified
precision result. The remedy editor and deployment are still outstanding.

The local expanded-item remedy editor is now implemented. Server results expose
dated remedy options even when calculation needs information; the editor selects
those IDs/codes and records origin/exporter/legal evidence and dates. It uses
Multideck-owned semantic tokens and the existing item setup save operation. It
does not edit declaration TARIC codes automatically. Browser accessibility,
responsive/save-reload QA and deployment remain outstanding; compilation alone
does not prove those journeys.

Before deployment, server guards now enforce the editor's GB/4000 boundary and
reject a declared exporter code matching an unselected remedy. Tests cover both
the conflict and recovery after removing it. This prevents an old review from
overriding changed declaration codes or leaking ordinary treatment into a special
procedure. NI and special-procedure remedy adapters remain required deliverables.

Version `.43` is now deployed: API v118 and Dexter v252, both ACTIVE with JWT
verification. All 49 API and 56 Dexter files matched readback. Deployment preserved
the existing live bundle and replaced only reviewed calculation sources (plus the
new remedy selector); no schema migration or submission. API type checking passed
and anonymous access returned 401. Positive live remedy calculation and browser
save/reload verification remain separate outstanding checks.

Live Chrome verification on the existing `QA-DUTY-VAT-AUDIT` synthetic draft:
recalculation with its unchanged procedure 5300 returned “0 of 1 items estimated ·
1 need information” and the specialist-procedure explanation. Old £180/£416
totals were no longer shown as the current result. Reloading and reopening Invoice
items restored the same blocked result; procedure 5300 remained unchanged. This
proves the live negative calculation/save-reload path, not a positive remedy
calculation. No item inputs were edited and no customs declaration was submitted.

The saved comparison UI displays each VAT-code difference. The existing approved
comparison action, customs_assessments read domain and deterministic assessmentEvent
watch carry the same result and source identities. Adapter versioning preserves old
comparisons. No RLS, schema or submission changes.

Calculation version `2026-09-15.41`; API v116 and Dexter v250 ACTIVE with JWT checks,
and deployed-file readback matched. Verification: 90 calculation/NI/preference tests,
11 provider-adapter/service tests, frontend and API type checks. NI adapter tests use
synthetic confirmed notice facts; a positive retained XML-to-live-audit NI comparison
and its browser reload remain unproven. Matching an estimate does not certify CDS
precision or enable automatic declaration tax population.
