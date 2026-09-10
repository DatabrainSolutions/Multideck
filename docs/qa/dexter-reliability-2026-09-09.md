# Dexter reliability goal

Status: requested development journeys verified, including direct PDF upload/reading/action and saved previews. Scope and evidence limits are recorded below.

## Confirmed environment

Shared local checkout; app at http://localhost:3000. Public frontend configuration and Supabase project listing both identify `aqtwypsuijxlnvtxpuxe` as the connected Multideck development backend. The agent-dexter function was deployed there during this work. No frontend release or production tenant deployment was made.

## Implemented and checked

- Fixed labelled email subjects swallowing same-line Body and additional instructions.
- Resolved explicitly self-addressed email drafts using the caller's connected mailbox, through the authenticated Inbox API.
- Unified streamed and non-streamed orchestration. Each independent proposed action is retained, instead of returning immediately after the first. Repeated identical preparations are deduplicated within a turn. Limits remain bounded at 24 calls and 10 rounds.
- Retained prepared actions and record tables when a later provider step fails. They remain pending, never reported as executed.
- Added native Multideck record tables. The model selects IDs already returned by authorised domain queries; all displayed values and links are built from those server results. Snapshots are labelled and limited results are not treated as complete totals.
- Added the component preview, usage, source and product links to /components?component=dexter-record-table.
- Loaded individual action statuses from the owner/company/conversation-scoped action ledger. Completed or denied proposals remain visible without active approval controls.
- Updated confirmed email delivery in the original composer and suppressed duplicated result composers. Widened the email composer to make recipients and content readable.

Browser evidence:

1. Initial data/navigation request returned records and links, but could not establish an exact active-job count from capped queries. Conversation: 9675d13d-e714-4d59-92a3-7d9f189f5097.
2. Mixed request after deployment produced the corrected subject, a self-addressed draft, and a native Leads table containing three actual returned records in one response. Conversation: 86f8a0e5-d06e-4f57-8858-fb66ca4f0686.
3. Create draft was approved through the inline composer; the connected provider confirmed creation. The saved metadata independently confirmed the intended self-recipient. This draft was subsequently sent in the draft-to-send test below.
4. After the delivery-display fix, the browser showed exactly one composer with Draft created and the provider confirmation.
5. A lead rename proposal was denied. The UI shows Denied and the database still contains the original name and unrated rating. The target is the pre-existing development verification lead 7b84d019-bc38-45fb-97cf-06539d7950cc; no lead data has been changed in this pass.
6. Native table keyboard sorting changed the order correctly. No browser console errors were captured in that check.
7. An attempted viewport override did not change the observed 1053px browser viewport. It was reset. Phone layout is not yet verified.

Checks:

- Frontend TypeScript build check passed.
- Deno type check for agent-dexter passed, including new helper modules.
- 22 focused tests passed: multi-action runtime/partial-failure handling, trusted table construction, email intent and subject parsing, inbox composer contract, and security hardening.
- Initial Agent Dexter contract suite: 44 of 45 passed. The stale notification-preference assertion was subsequently corrected and verified behaviourally in the follow-up below.
- Full client build passed (Vite completed in 14.89 seconds). Existing large-chunk warnings remain.

## Provider draft-to-send follow-up

- Added a fresh, deterministic `send_email` preparation from the confirmed provider draft. The model does not rewrite the email. The existing inline Send email button is the explicit final approval; sending still uses the prepared-action ledger and current permission checks.
- Inbox sends the existing Gmail/Outlook provider draft and retains the same local message ID. It does not create a second email or leave the original draft behind.
- The message row is a compare-and-set send claim, shared across request keys. Unknown provider outcomes remain claimed; retrying cannot resubmit. Saved wording, mailbox and recipients must match the reviewed snapshot.
- Changed or unknown provider attachments are not silently sent. Attachment-bearing provider drafts remain an explicit unsupported inline-send case and must be reviewed in Inbox.
- Current Send preparation and confirmed delivery no longer get overwritten by the older Create draft receipt when reopening a conversation.
- Deployed `agent-dexter` and `inbox-api` to the same development project, aqtwypsuijxlnvtxpuxe. No production tenant or frontend release.

Live browser proof, 9 September 2026 at 19:55 UTC:

- Sent the previously created, self-addressed QA draft with the exact original subject/body from its inline composer.
- Provider acceptance is recorded at 19:55:47.551 UTC. Message 05f46632-df63-4e42-b534-7a0691ec6bd0 remains the same local message, status sent, isDraft false, not deleted. Its send ledger contains one attempt. Both create_email_draft and send_email prepared actions succeeded independently.
- One composer shows Sent; a fresh browser load preserves Sent and the disabled Send button. The native Leads table and denied lead action also survive the reload. No browser console errors were captured.
- Recipient receipt was subsequently verified through the Inbox source link: the Gmail thread contains the received self-addressed message, matching the subject/body and timestamp (20:55 BST / 19:55 UTC). This proves receipt, not that anyone else read it.
- The localhost listener stopped during QA. Confirmed port 3000 had no listener, then restored the existing Vite development command on strict port 3000.

Checks: 74 focused tests pass, including ten new behavioural draft-send tests covering concurrent claims, different retry keys, changed snapshot denial, another user/company denial, fresh approval, unknown outcomes, definite rejection, native Gmail draft IDs and Outlook draft updates. Deno checks for both functions and the full client build pass (Vite 10.78 seconds). The previously recorded stale Dexter notification assertion was subsequently repaired as described below.

Watching boundary: the existing deterministic email watcher intentionally handles incoming messages. This send reuses existing send audit/delivery records; it does not create new watch rules or recurring model calls. Outgoing delivery-status watches remain explicitly unsupported, and are not claimed as part of this change. Incoming receipt/reply watches continue through the existing mailbox-checked adapter.

## Direct inbox requests

The first plain-language inbox lookup in Approve mode failed because it required an explicit provider mention. Direct operator requests such as “find this email in my connected inbox” now select only providers returned as available by the authenticated Inbox source-discovery endpoint. Explicitly named providers stay scoped. Quoted content, draft bodies, negative requests and navigation questions do not select sources. Existing Email.Read, Email.AIRead and mailbox grants remain authoritative. The selected source is saved with the message so follow-ups retain the authorised context.

After development deployment, the same browser query found both the sent Outlook copy and the received Gmail copy, correctly distinguished their directions, and returned the sender, recipient, date and source link. Following the Gmail citation opened the exact thread and displayed the expected QA email. Conversation: 86f8a0e5-d06e-4f57-8858-fb66ca4f0686. The received source is /inbox?provider=gmail&mailbox=68089ed3-17b3-4f08-aa12-4abecbd71c05&thread=84cee9b4-8845-44fe-91e4-774db0b27aa2.

Email result copy now distinguishes sent, draft saved, failed and awaiting provider confirmation instead of describing every returned receipt as complete. Three additional behavioural tests pass for source-selection intent and truthful confirmation copy; the combined focused set is 77/77. Deno type checking passes. A screenshot verifies the saved composer visibly retains its full recipient; the browser's read-only DOM snapshot omits this email input value, so that omission is not treated as a product defect.

## Final checks for this follow-up

The Dexter notification contract had an outdated source assertion after document suggestions were made opt-in alongside watches. Updated that assertion without changing production notification behaviour, and extended the existing dispatch harness to exercise missing, disabled and enabled preferences for both event types. These tests assert actual provider send counts and the opt-out response.

The combined relevant set now passes 128/128, including all 45 Agent Dexter contracts, notification dispatch, email intent/composer, multi-action, inline tables, security hardening, Inbox and open tracking. Deno checks for both changed functions, frontend TypeScript, full client build and git diff --check pass. The complete product goal remains active; this follow-up does not establish the outstanding workflows or Responses API features.

## Inline tables and independent record decisions

Browser conversation: 44675215-9ac1-49df-b259-934d3ec94fd6.

- Fixed deals to use the actual `expectedValue` field. The table now displays 180,000 GBP, 72,000 EUR and 48,000 GBP for the three returned valued examples instead of missing values.
- Added explicit field selection to the strict table tool. Requested empty deadline/last-interaction columns stay visible as Not set. The live request displayed separate Deals and My leads tables with the requested columns. Date-only values retain their calendar date; timestamps include time and zone; snapshot timestamps are available on the label.
- Prepared two separate `update_lead` actions for the existing development verification lead. Approved the deadline (10 September 2026, 09:00 UTC) and denied the rename independently. The original name remains; the deadline is saved; EditVersion advanced from 1 to 2. The approved action is 3baf96d8-cd0a-4261-bdf5-fd804dd4a30d; rename d3ec947d-a94b-46db-ae89-28890d54951a is declined. Audit contains one attempted and one succeeded entry for the deadline action.
- Fresh browser reload retains both terminal cards with no approval buttons. Corrected terminal cards' accessibility busy state to false. Pending/processing controls remain disabled appropriately.
- Approval cards now identify their authorised source record with an internal link. Deadline proposals show a readable UTC timestamp, preserving the exact instant. The gallery preview demonstrates this.
- A follow-up query by the exact lead UUID failed. Added migration 20260909202648_dexter_exact_lead_lookup: UUIDs use exact identity matching and never fuzzy-match a neighbouring ID. Owner/company, non-demo and non-deleted constraints remain intact. Applied only to the connected development backend; the local filename matches its recorded migration version.
- Retried that request in the browser: it returned the correct record and the newly saved deadline (10 Sept 2026, 10:00 BST = 09:00 UTC), plus a separate service-interest approval with the correct record link. Denied that review-only service-interest proposal.

Verification: 130 relevant runtime/contract tests pass. One additional disposable PostgreSQL integration test passes for exact ID/name lookup, another owner/company denial, missing identity, deleted/demo exclusion, no UUID typo recovery and internal-function grants. Deno check and full client build pass (Vite 11.03 seconds; existing chunk warnings). The table and approval layout was visually reviewed in the in-app browser. Mobile layout remains unverified.

Watch parity: exact lead search is used by both chat and existing watch-target resolution. This lookup fix adds no new writable fields or event source; existing owner-scoped deterministic lead watches and their demo guards remain unchanged. A fresh full watch lifecycle is not claimed by this follow-up.

PDF check: created and visually inspected the synthetic test file at tmp/pdfs/dexter-qa-freight-enquiry.pdf. The browser filechooser API returns without attaching the file, including when triggered through the visible accessibility control. No upload row or attachment chip was created. PDF upload/extraction/actions remain unverified; this is an automation limitation, not yet a confirmed application defect.

## New inline-email recovery

The new-email browser scenario exposed an empty final model response after an email had already been prepared. That error path discarded the composer approval link. Empty final explanations now return the saved prepared work, including the email's matching approval, instead of losing it; the tool-call ceiling also preserves existing work. The retry reproduced the empty final response and now showed a usable Send email composer with an honest explanation.

Recognised the explicit “review and send” phrasing as Send mode; a separate do-not-send clause still vetoes it. Final approval remains mandatory. Also extended self-recipient matching to “my own connected sending mailbox” and “default outbound mailbox”, using only the authenticated default/sole outbound mailbox.

The initial new-email composer had an empty recipient. Clicking Send correctly blocked the action with “Add at least one complete email address.” Entered the known connected self-address in the editable composer for the send test. The browser was visually reviewed at an approximately 835px-wide layout with collapsed navigation; this is tablet/narrow-desktop evidence, not phone QA.

The fresh inline email was sent after the recipient edit. Conversation d0b19d89-c2c9-40ad-8b1c-10e5b0dc3bfe; send action a8632635-9577-4e84-aa2c-8a48ee824860 succeeded. Provider acceptance at 20:34:42.917 UTC; message 27c9e997-e4ed-4cb7-a607-3d7841087190, send request f43b70e6-7d79-4af6-b020-d7116e1dfcc8. The saved result contains the exact subject/body and self-recipient. The browser shows Sent and no console errors. Recipient receipt for this second test is not yet independently verified.

The final combined test set passes 135/135, including the disposable PostgreSQL test. The final source-contract adjustment follows the intentional change to remember citation-enriched records, preserving approval before-values and record links. Deno and the full client build passed as above. Result messages no longer point to a duplicate composer “below”; the original composer owns its sent/saved state.

## Remaining work

- Stale/conflicting-record behaviour and broader multi-record writes. Two supported proposals, independent approval/denial, execution, audit and reload are now browser-verified on the development lead; lead rating remains unsupported.
- Review and browser-test the existing company/address foundation actions before adding capabilities: the foundation migration already contains update_company_foundation and upsert_company_address. Structured account-profile exceptions may still apply. Deal stage movement is implemented and verified below; conversion stages deliberately use the existing deal-won review flow.
- Both fresh inline sending and saved-provider-draft sending are now browser-verified. Attachment-bearing saved drafts and safe recovery after expired/failed send decisions still need follow-up.
- Broader inbox empty, permission, attachment and follow-up cases; PDF upload, OCR, evidence review and resulting approved changes. The exact-subject inbox lookup and source click-through are now browser-verified.
- Accurate count/aggregate questions, product navigation guidance grounded in actual routes, mixed-content ordering, mobile and keyboard states, empty/error cases, persistence and cross-user denial tests.
- Responses API async calls, steering and cache-preserving effort updates are researched but NOT implemented yet. Current routes still use GPT-5.6 Luna/Terra.

## Responses API research

Official pages fetched during this run:

- https://developers.openai.com/api/docs/guides/async-tool-calling
- https://developers.openai.com/api/docs/guides/steering
- https://developers.openai.com/api/docs/guides/reasoning#change-reasoning-mid-conversation
- https://developers.openai.com/api/docs/guides/latest-model

These new features require GPT-6 Astra. Async function definitions use async:true; dispatch on complete call items and return results on their original call_id. Steering uses response.steer over the same upstream WebSocket with previous_response_id after response.created. Accepted means queued, not applied; handle automatic continuations, steered incomplete responses, pending tool results, failures and disconnects. Do not duplicate accepted steering. configuration_update changes effort in input while request-level effort stays stable; preserve updates at their original positions during manual history replay. It cannot be combined with automatic compaction/truncation.

Important implementation constraints: preserve the existing governed model egress reservation, redaction, allowance and settlement; update model pricing/usage mappings rather than charging Astra as Luna. The current frontend transport is authenticated POST/SSE; agent-dexter has verify_jwt=true. Do not weaken gateway authentication to add browser WebSockets. A server-owned upstream WebSocket with a separately authenticated steering channel is a possible direction. No recurring LLM calls may be added to Watching for you.

## Watching parity

Tables reuse permission-checked reads; prepared actions reuse existing approval and audit paths. The deal-stage capability and watch evaluator changes below add explicit canonical writes and deterministic watch coverage. Company/address changes still need their own lifecycle verification.


## Deal stage movement and deterministic watches

Applied development migrations 20260909204719_dexter_deal_stage_changes and 20260909205603_dexter_deal_watch_evaluation. Deployed agent-dexter to development project aqtwypsuijxlnvtxpuxe only.

- Added exact deal-state and active stage-option reads, carrying the saved version and stage/pipeline timestamps. The move action requires explicit approval even in Full mode, uses authorised source names for its before/after card, and reuses the canonical deal writer and history. The canonical public move wrapper now checks CRM.Write. Stale records/options, foreign scope, missing permission, no-op and conversion-stage moves are rejected. Conversion stages require the existing deal-won review workflow.
- The deal event adapter includes pipeline/stage identifiers so same-label moves remain observable and emits one signal per distinct saved snapshot. The evaluator now rechecks active watch-owner company/CRM.Read and visible deal access. Every distinct changed rule can fire, including consecutive moves; threshold rules retain their existing edge-triggered behaviour.
- Browser conversation b95bfe04-4c29-40ca-ad13-a0db155d7ed8: first review-only request returned prose; a follow-up explicitly requesting an approval card produced the real before/after control. No write occurred until Approve.
- Created watcher ca300115-c57b-49df-bbd1-1bf81f6cab53 in the dedicated Watchers flow for exact sample deal de1000dd-5eed-4ead-8000-000000000001, stage changed, notification only.
- Approved move 0c671028-bb55-40c7-8e23-89b8b24a6bb5 from Quote sent to Rates secured. Saved probability 50%, weighted value 90,000 GBP, version 6; one attempted and one succeeded audit record and one watch event.
- Prepared and approved restoration f74128d3-9395-473c-95aa-6f90e18920a6 using fresh state. Saved original Quote sent, 75%, 135,000 GBP, version 7. The watcher now has exactly two events, one for each direction, with no health error. Canonical edit/history metadata intentionally records both QA moves.

Four new targeted tests pass, including two disposable PostgreSQL tests. The stage adapter test invokes the real canonical writer and verifies validation, permissions, stale rejection, history, actor-claim restoration, signal counts, pause/resume and non-matching targets. The evaluator test runs the actual rule matcher/evaluator plus the existing cargo patch and new deal patch: repeated changes, no-op, foreign company/target/owner, revoked permission, inactive user, hidden deal, pause/resume, threshold semantics and notification counts. These isolated fixtures do not by themselves prove browser watch ownership/RLS; the live browser confirms creation and the two real matching events. Earlier Deno and selected agent/security/multi-action regression checks passed for the stage implementation. Full phone QA and live cross-user watch reads remain outstanding.

Final browser readback: both move cards remain Completed after reload, without approval controls. The watch detail shows 2 alerts and the correct restoration event. Paused the QA watch through its own control; the UI now shows Paused and Resume this watch. Browser error log is empty. No production deployment is claimed.

## Company and address approval recovery

Browser conversation d8e3bcad-a5d2-4f97-9618-78481f64aaf8. Existing update_company_foundation and upsert_company_address were active, but the customers domain omitted editVersion and several full-replacement address fields. The browser correctly refused to invent the missing versions or historical opening exceptions.

Applied development migrations 20260909210402_dexter_company_edit_snapshots and 20260909210736_dexter_company_foundation_preserve_offices. The read now includes the company version, complete contact/address fields, weekly-hour sort order and all opening exceptions, including historical entries. The company adapter retains unchanged office assignments instead of deleting/recreating them and calls the canonical writer with only an office replacement when needed. It rechecks actor, access, version and service role. Both actions now require explicit approval in Full as well as Approve, in the server registry and orchestrator.

Added authorised snapshot-based approval reviews: exact account code or postcode before/after, plus every other replaced value if changed. Missing fields, unknown addresses, stale snapshots and no-op edits cannot become proposals. New office assignments remain form-only until an authorised office lookup is included; the card explicitly explains this instead of accepting invented office IDs. Address creation can be reviewed, but has not yet been browser-tested.

Live browser results:

- Two separate cards were prepared after the repaired read. Approved postcode B4 6QE → B4 6QF, action 314c714b-50cc-4b58-bb4c-96d46d669799. Version advanced 1 → 2; account code stayed CUS0005; saved email and phone were retained.
- Approving the older company card 7560abc0-93e0-490c-8cc1-c7e658014158 correctly failed its version check. Audit shows one attempted and one failed entry. No code overwrite occurred.
- A fresh read/proposal changed CUS0005 → QA005, action 74720a03-83a8-410e-b94f-2b9fded345fc, version 3.
- Restored code through fresh approval 06d72e5c-015c-4d5c-a1c5-2c74f9510603 (version 4), then postcode through b17ca94c-647f-420d-bdee-9b93bca2f2ea (version 5). All four successful actions have one attempted and one succeeded audit entry each.
- Final database readback matches the original code, all address fields, default main address use and empty hours/exception collections. Version/audit metadata correctly retains the QA history.

The conflict exposed an internal CRM_CONFLICT prefix and left stale approval buttons visible until a later conversation refresh. Added plain recovery guidance asking for a fresh read/approval, and the client now reads authoritative conversation status after a rejected decision. The new copy is unit-tested and deployed; this exact post-fix failure path still needs a fresh browser reproduction. Same-company multi-actions currently require a fresh proposal after one advances the shared version; smoother dependency handling remains work, without bypassing stale-write protection.

Checks: 60 selected tests pass (company review, canonical-writer PostgreSQL fixture, action errors, multi-action recovery and agent contracts). Deno check and full client build pass (Vite 10.99s, existing chunk-size warning). The PostgreSQL fixture tests unchanged office retention, actual canonical code/office writes, stale rejection and scope/permission/service-role boundaries; the code normaliser and permission context are fixtures, not full production auth tests. Agent deployment confirmed on development only. The npm-fetched CLI stalled during startup with no network descriptor; terminated that exact process and successfully deployed with the existing Homebrew CLI 2.109.1.

Watch parity remains incomplete for company/address changes: existing foundation triggers emit raw table-field names while their registry advertises semantic aggregate fields such as addresses/responsibleOffices. Those adapters and runtime access/consecutive-change handling require repair and a real lifecycle test. Do not claim the company/address portion of the overall goal complete until this is resolved. Responses API features, PDF transfer/extraction, broader navigation/data questions and phone/keyboard coverage remain open as previously recorded.

### Responses protocol and governed usage — 9 September, continuation

Implemented an isolated server-side Astra WebSocket session, governed egress wrapper and append-only reasoning configuration helper. These are not yet connected to the chat orchestrator or browser. Existing model routes remain unchanged.

Real provider probes used synthetic records only. An asynchronous lookup started before the original response ended; a mid-turn instruction was queued and incorporated into the automatic successor; the final answer used the lookup output and requested word `violet`. Tool results returned through `response.create` with their original call IDs, not through steering. A separate low-to-medium reasoning change retained the request-level low setting and reused 4,040 cached input tokens. Sanitised event and usage evidence: [dexter-responses-live-2026-09-09.json](dexter-responses-live-2026-09-09.json).

Applied development migration `20260909212608_dexter_astra_usage_metering.sql`; all five actual responses settled successfully in the development ledger, including cache reads/writes. This does not change existing chat routes or prove browser integration. No production deployment was performed.

Protocol verification covers async deduplication, rejected/unconfirmed steering, successor commit semantics, required synchronous tool handoff, reservation races, and immutable effort-update positioning. Follow-up failure review fixed a pending-request hang when ledger settlement fails during disconnect: every reservation receives a settlement attempt and the waiting request still rejects; the retained reservation is not silently retried or released. Eleven protocol tests pass; the PostgreSQL metering test passed separately. Upstream transport and reasoning-history type-checks passed again after the cleanup patch.

Remaining integration: authenticated owner/company-bound steering delivery; authorised early read execution without duplicate actions; persisted provider history and configuration positions; accurate Astra UI usage; real browser journeys and recovery. Async writes must not bypass approval, existing record validation or audit. Watching for you remains deterministic; this transport work introduces no recurring model evaluation.

### Chat orchestrator async-read integration — continuation

Connected the governed socket path inside the real `runStreamedAgent` orchestrator when its server-selected provider model is Astra. The existing Luna/Terra routes remain selected, so this path is not yet enabled for operators or deployed. Extracted the existing permission-checked domain-read execution intact; async calls and terminal processing share one call-ID promise, including safe failure results. Only `query_data_domain` receives `async: true`; write tools retain their existing preparation/approval/validation/audit path. Same-connection follow-up requests send only newly generated tool outputs, avoiding duplicate provider output history. Socket cleanup runs on all orchestrator returns.

24 tests pass across protocol, async reads and real extracted orchestrator behaviour. The Astra-path test demonstrates early read execution, one RPC for the early and terminal event, original call-ID output, incremental continuation input and socket closure. Existing multiple proposals, duplicate proposals, later provider failure and preserved email composer tests also pass. Deno checks the integrated entry point successfully. These are local tests; live browser Astra execution, steering delivery, persisted effort history and route/usage activation remain outstanding.

### Authenticated steering channel — continuation

Applied development-only migration `20260909214416_dexter_active_response_steering.sql`. Active runs bind company, authenticated user, client session and optional owned chat conversation; private worker tokens gate claim/transition/finish operations. Steering inputs use immutable IDs, allow one unresolved correction and four total per run, and expire with the two-minute run. Claimed/submitted/queued work becomes unconfirmed after expiry; incorporated work never downgrades. Pending unsent input becomes failed. Neither table nor RPC is granted to browser roles; the authenticated edge exposes only enqueue/status operations and takes actor identity exclusively from validated authentication.

Implemented edge `steer` and `active-run-status` handlers locally; these handlers and worker/composer integration are not deployed/enabled yet. No browser-facing steering control is claimed complete. This is conversation transport state, not an operational record capability: Watching for you deliberately does not subscribe to transient transport events or poll a model.

27 relevant tests pass, including PostgreSQL ownership/session/worker checks, invalid conversation, immutable retries, one-time claim, legal transitions, expiry, revoked actor and direct browser grant denial. Request tests reject injected identity/worker values and malformed input. Integrated edge type-check passes. A real development transaction exercised begin/enqueue/claim/finish and rolled back its synthetic rows; direct table read and RPC execute permissions for `authenticated` both returned false. No tenant business data or messages were changed by that verification.

### Active worker steering integration — continuation

The Astra chat path now starts a private active-run worker, announces its public run ID, and polls only the deterministic input queue while a response can be steered. Provider status transitions are serialised to storage; accepting the HTTP correction is not treated as incorporation. A claimed correction whose response finishes before submission is failed without replay. Worker cleanup stops polling and closes the run.

Incorporated corrections refresh the server-owned intent plan and access mode before continuing action processing, update explicit recipient context, and are included in saved response metadata. Earlier response segments contribute their actual usage and outstanding tool calls. Synchronous actions from a superseded response are returned as cancelled, requiring fresh preparation under the revised request; early authorised reads retain their existing result. The initial email tool requirement no longer forces an email draft after a correction.

29 protocol/worker/orchestrator/read tests pass, including status ordering, single claim under concurrent polls, private-token exclusion, finished-response race and cancellation of a superseded synchronous action. The entry point type-check passed. The Astra route remains disabled and this entry-point change is not deployed. Remaining activation work includes UI/reload rendering of steering, persisted provider/effort history, usage display, and review of already-prepared approval cards when a later correction supersedes them. No browser steering journey is claimed complete.

### Superseded approvals and client steering API — continuation

Incorporating a correction now expires only unclaimed approval IDs from the active run, scoped by company, user, conversation and client session. Existing execution claims remain untouched. The existing expiry/claim boundary prevents later execution; the ledger reason `dexter_request_revised` renders as “Replaced by your correction” both in the stream and after reload. Supersession records a security audit event, and old preparation results are removed from the duplicate cache so a fresh proposal can be created. The helper test covers excluded foreign scopes, already executing/completed actions, unrequested IDs, and repeat cancellation.

Added client methods for authenticated steering submission/status and handlers for active-run/provider steering events. Saved incorporated input metadata is hydrated from owner-checked messages. Composer wiring and real browser verification remain outstanding. 27 targeted supersession/worker/orchestrator/protocol tests passed; the backend type-check passed before the final metadata hydration adjustment. No edge deployment or Astra activation occurred in this phase.

Client validation for this phase: full TypeScript/Vite production build passed (11.94 seconds for Vite; existing large-chunk warning). The first repeated backend check found a missing callback type in metadata hydration; corrected it and rechecked. These checks do not establish browser steering behaviour.

### Composer steering controls — continuation

Connected active-run and steering events to both normal and retried chat streams. The existing composer changes its accessible send label to “Update request” only for a server-announced active run; keyboard and button submission share the pending guard. It retains correction text until incorporation, keeps changed text intact, reuses correction IDs after an uncertain HTTP result, and queries final server status when the stream ends. A status reducer prevents late HTTP acknowledgements from downgrading streamed progress or incorporation. Saved corrections render alongside their response. File attachment is disabled during an active steerable run because this implementation submits text corrections only; existing queued attachment support must be verified separately.

Updated existing composer gallery usage guidance. Sixteen selected client-status/worker/orchestrator tests pass. Full client TypeScript/Vite build passed after fixing TypeScript control-flow narrowing in final-status reconciliation (11.33 seconds Vite; existing chunk warning). The final attachment-button disabled state and gallery copy were added after that build. Browser check at localhost verified typed input enables Send prompt, and clearing it by keyboard disables Send prompt again; the test text was not submitted. Astra is still not enabled, so this does not verify browser steering. Reload recovery for an in-flight run and persisted provider reasoning history remain outstanding.


### Development Astra activation and real browser steering — continuation

Deployed the integrated agent to development project aqtwypsuijxlnvtxpuxe and enabled DEXTER_RESPONSES_ASTRA_ENABLED there only. Smart uses Astra medium; Worker uses Astra high; Fast retains its previous route. Private provider-history migration 20260909220517 and corrected message-cost estimate migration 20260909220804 are applied to development. Exact settled provider response costs replace the conservative message estimate after saving; cached reads and cache writes remain accounted for separately. Fifteen selected history, usage and orchestrator tests pass; private-history PostgreSQL ownership/immutability/grant tests passed in the preceding phase.

Restarted the stopped localhost server on strict port 3000 using the verified development public configuration. In-app browser conversation cfb0cd56-73f8-4d2a-9116-e68af3700141 requested three leads and three deals, then submitted a correction during the running request to show two of each. Active run 97f96409-8d59-40a8-8913-3ad07e72f0f7 recorded incorporation at provider response resp_06cdb3cc62ae1d47016aa1daae365887d2a10e940b8857e899. The final answer displayed two verified native table rows per domain, current statuses/stages and record links; it acknowledged the correction. The correction and both tables survived browser reload. No operational records were changed.

Saved assistant message fe322e80-74c0-4264-b3c0-cba95a1883a7 has private Astra history (23 items, medium base/current effort), and GBP 0.373836 settled total message cost. After reload, selecting Worker and asking for Northstar's previously shown stage returned Quote sent with its record link without requesting fresh data. Message 347a067f-a68e-4eb9-90c2-1aa6f51c8f5b retains medium request-level base effort, appends one configuration update to high, and has 26 history items. Its actual successful provider response reused 26,994 cached input tokens, wrote 119 cache tokens, and cost GBP 0.024729. This verifies reasoning-effort cache reuse through the real browser across a new connection and page reload, beyond the earlier synthetic same-connection probe.

Observed remaining UX issues: the model selector resets to Fast on reload; in-flight reload recovery is still absent. Interim model wording said reads were pending while tables appeared, although the final saved answer correctly reconciled them. Added an answer-reset stream boundary before processing tool outputs and at each new Astra response so interim text does not accumulate with the next explanation. Client normal/retry handlers clear only the active answer text, retaining tables, drafts and approval cards. A real-orchestrator regression checks that the final visible text excludes the prior waiting sentence. This last stream-boundary patch is locally implemented and awaiting checks/deployment/browser verification.

Stream-boundary validation: all 15 selected tests pass; integrated Deno check passes; full client TypeScript/Vite build passes (11.02s, existing chunk warning). Deployed the patch successfully to development only. A new post-patch browser request is still required to verify the transient presentation.


### Saved model recovery — continuation

Hydrated the allowlisted product model from owner-checked saved message JSON and restored the latest assistant model when opening a conversation. This avoids an unintended switch from Worker/Smart to Fast after reload and keeps follow-up effort selection consistent. Backend type-check and full client build pass (10.35s Vite). Deployed development function successfully. Reopened conversation cfb0cd56-73f8-4d2a-9116-e68af3700141 in a fresh in-app browser tab: both tables and correction remained, and the model menu confirmed Worker selected, Fast/Smart unselected. No new model request or business write was needed for this check. Tab marked for handoff.

Further current-source confirmation of the company watcher gap: the foundation adapter emits raw per-table JSON, while capability fields advertise semantic aggregates; the Org_Addresses trigger update list omits postcode, line2, state and deletion. The adapter resolves a deleted address via its now-absent row. These require a scoped semantic event/ownership repair and lifecycle tests before company/address watch parity can be considered complete.


### Core address watch events — continuation

Applied development migration 20260909222531_dexter_address_watch_events. Core Org_Addresses changes now emit the advertised addresses field, cover all allowlisted address fields including postcode/line2/state/email/phone and deletion, and ignore audit timestamps. Company routing uses accessible account IDs rather than selecting the first profile; runtime evaluation rechecks active owner, company, CRM.Read and accessible account. Consecutive changed events fire independently; notifications use plain address-change copy while retaining detailed evidence. The trigger resolves deletion ownership from OLD instead of the removed address row.

Two real PostgreSQL suites pass: new adapter/evaluator lifecycle plus existing deal-watch regression. New checks cover consecutive postcode updates, timestamp-only/no-op updates, pause/resume, revoked permission, inactive/foreign owner, inaccessible company, deletion and readable notification text. The first development migration attempt rolled back on the guarded live formatter marker; inspecting its current source showed changed indentation from another existing formatter. Adjusted the unique marker, reran both tests, and applied successfully. Local filename now matches the recorded migration version.

This closes core address-row event handling only. Opening-hours/address-type/override aggregation and office/contact/related-party semantic adapters still require repair; company accountCode/scopeCode events remain incomplete. A real browser-created address watch and approved address update/readback lifecycle is still required. No operational record changed in this phase; only the development schema was updated.


### Address watch browser setup — continuation

The first browser creation attempt returned three unhelpful “Watched record” choices despite an explicit company UUID. Added company name/account-code labels and, for customer watches only, selected exact explicitly supplied IDs from the authorised returned candidates; absent IDs are not guessed. Exact name matches are preferred when no UUID is supplied. Deployed development function after its type-check passed. Retrying the same company watch through the browser succeeded: d19a56e0-cc35-4c6a-90e0-13ef972c5e6c, target de1000c1-5eed-4ead-8000-000000000001, rule addresses/changed, active, zero triggers before the update test.

Checking the canonical address writer found its county field is OrgAdd_CountyState, whereas the new event allowlist used OrgAdd_State. Corrected with a separate applied migration 20260909222710_dexter_address_county_watch; did not modify the applied earlier migration. Extended the PostgreSQL fixture with the actual column and a county-only update; it passes. Browser postcode update/restore lifecycle is in progress.


### Address watch browser lifecycle and presentation — continuation

Browser conversation a5eddd5a-9238-4aaf-9005-e6e2cf23ceee prepared and approved postcode B4 6QE → B4 6QF for the sample address. Action a85d84bc-ed02-4f63-b382-9e0acb708cbe succeeded. Watch d19a56e0-cc35-4c6a-90e0-13ef972c5e6c fired once; event f9a014c6-2721-4d67-bf9d-d43ad64cc940 retains the exact postcode before/after and plain database event body.

Worker restoration attempt timed out after a fresh async read. Run 5dd730f9-ed5b-420f-b602-c6a1cb025168 expired at 22:30:53 UTC; authoritative ledger showed no new prepared action. The client retained the prompt and displayed retry recovery. Its first Astra response settled successfully; its continuation failed with no provider response ID. This is an unresolved Astra continuation reliability defect, not a successful end-to-end restoration on Worker. After checking terminal state/no proposal, resubmitted the retained prompt with Fast. Fresh restoration action 065dfd32-d85b-4c60-95f6-01fd98861575 succeeded after browser approval. Readback confirms original B4 6QE and exactly two watch events. Paused the temporary watch through its browser controls.

The browser reconstructed a giant JSON address description despite the readable database body. Fixed readableWatchEvent to produce allowlisted changed-field copy, added/removed address summaries and safe malformed-evidence fallback. It omits unchanged contacts and internal IDs. Four watch-copy tests pass; full client TypeScript/Vite build passes (11.06s, existing chunk warning). Browser after HMR/reload shows the paused watch as “Demo Organisation 051: Postcode changed from B4 6QF to B4 6QE.” No raw JSON remains in that summary. Frontend change is local; backend changes are development only.


### Astra timeout recovery bounds — continuation

Inspected the failed Worker run: governed WebSocket lifetime was 120 seconds, matching the browser's 120-second deadline, with no separate wait bound for response.created after a continuation. Added a 20-second acknowledgement deadline for each response.create and a 95-second total connection deadline, leaving time to return a server error or persist existing partial artifacts before client abort. Acknowledgement timers clear on response.created; closure clears all timers, settles reservations once and never reconnects/replays. Diagnostic logs now allowlist internal responses_* error codes instead of retaining only the generic Error name; arbitrary provider messages remain excluded.

24 tests pass across injected governed-socket timeouts, protocol and real orchestrator behaviour. New tests simulate an unacknowledged second request and an acknowledged stalled response with deterministic timers, verify settlement reasons, one connection, no replay and cleanup. Backend type-check passes. Deployed to development. This improves bounded failure recovery; it does not establish the original provider stall's root cause or prove Worker reliability. A post-deployment read-only Worker request is in progress in the same saved address conversation.

Post-deployment browser Worker read completed successfully: fresh saved-address query returned B4 6QE with the correct company link, and the composer returned to normal Send. No approval or write was requested. This verifies a normal live continuation after the change; injected timeout recovery remains covered by deterministic transport tests, not a deliberately stalled live provider.


### Exact booking counts — continuation

Added development-only migration 20260909224007_dexter_booking_count_summary: booking_summary is a governed Bookings.Read domain returning exact non-deleted company totals and groups by saved job status and closed-date flag. It uses the existing booking-domain office/company scope and avoids row limits. Non-empty search is explicitly rejected rather than silently interpreted or ignored. The underlying function is service-only; the existing query-domain RPC enforces authenticated context and registry permissions. Instructions select this domain for exact totals and state the included statuses. Individual examples remain native booking tables.

Deterministic Watching for you continues to cover individual booking status changes. Aggregate count-threshold watches are explicitly unsupported in the domain description and prompt; no recurring model polling or unsupported watch capability is introduced. There is no aggregate write action because counts are derived evidence.

Disposable PostgreSQL test passes: more than 25 records, office precedence, foreign/unassigned/deleted exclusion, closed/status distinctions, empty scope, rejected search and direct browser grant denial. Backend type-check passes and agent deployment succeeded on development. Live service readback at 22:40:22 UTC: 79 total; booked 34, open 32, draft 6, complete 5, cancelled 2; none has a closed date. Open+booked therefore totals 66. Browser exact-count/examples request is in progress in conversation 9675d13d-e714-4d59-92a3-7d9f189f5097.

Browser verification completed: Dexter answered exactly 66 active jobs (32 open + 34 booked), explicitly excluded 6 draft/5 complete/2 cancelled, and stated the 79 non-deleted total. A native three-row table showed JI0991132, JE0991134 and JE0991133 with status/customer/origin/destination. Clicking JI0991132 opened /bookings/ji0991132; the booking overview confirmed that reference, Demo Organisation 031 and NLAAM → GDGND, matching the table. Returned to the saved chat afterwards. No operational writes were made. Broader product-navigation guidance remains to be rechecked separately.


### Verified product navigation — continuation

Navigation QA asked for company address editing, deal-stage movement and mailbox connection. The first Fast request returned a provider-unavailable error and retained its text; no writes were requested. Current source confirms company detail uses Setup → Operational addresses → Edit/Add address, rather than a separate Addresses tab. Deals use /crm/deals Board view; the standalone deal-detail stage rail is intentionally read-only. Settings Integrations uses /settings?tab=integrations and Connect Gmail/Connect Outlook (or Reconnect/Disconnect depending on state); Shared Outlook mailboxes uses Add mailbox, and empty Inbox exposes provider connection buttons.

Added these verified page links and controls to the shared Dexter instructions, including conversion-review and mailbox-authorisation boundaries and an instruction not to guess uncovered controls. Backend type-check passes; deployed development function successfully. Retried the retained navigation-only question for browser validation. No settings or provider connections have been changed.


The navigation retry gave the verified paths/controls, but also produced an unsolicited inline composer using old email context. Root cause: email-intent detection combined “edit” (a company address) with “email” (connect a mailbox) anywhere in the navigation question. Fixed the shared emailInstructionText normaliser so where/how-do-I navigation clauses do not enable writing or sending. Explicit separate clauses such as “also draft an email” remain eligible. Nineteen email-intent/multi-action tests pass, including selected-history and both permission/route checks; deployed development function. A repeat of the same navigation question is being checked for absence of a new composer. The unsolicited draft was not sent or saved to a provider.

Post-intent-fix browser response contains the correct navigation instructions and no new composer. It still copied an unrelated sentence about the old draft from conversation history. Added an explicit current-question-only rule for navigation answers to suppress stale draft/completion commentary. That final prompt refinement is local and not yet deployed or browser-verified.


### Navigation browser correction — current continuation

The final current-question prompt refinement was deployed successfully, but the identical three-part question still repeated the old draft-status sentence (without a new composer). A new address-directions-only follow-up returned clean directions with no email commentary. Do not treat stale-history repetition as fully resolved by the prompt refinement alone.

Actual click-through exposed a source-inspection mistake: /customers opens CustomerDetailPage, whose overview has no Setup controls. /crm/accounts opens the company workspace. Browser verified Demo Organisation 051 → Setup → Operational addresses → Edit opens the actual Line 1, Town or city, County or state and Postcode fields (B4 6QE). Cancelled without changes. The separate Addresses tab exists and contains appointment/collection/delivery/booking rules, not the postal address editor. Corrected the shared navigation guidance to Companies /crm/accounts and explained this distinction; deployed agent-dexter to development successfully (dexter-navigation-route-deploy.log).

Browser also verified /settings?tab=integrations: connected Gmail/Outlook display Disconnect controls, and Shared Outlook mailboxes has Add mailbox, disabled until an address is entered. No provider setting was changed. /crm/deals opens Board with the Freight opportunity pipeline selector and stage columns. Deal movement itself was covered by the earlier approval lifecycle; no movement repeated during this navigation check. A fresh postcode-guidance question is checking the corrected route in Dexter.

Reload recovery investigation: active-run status currently returns no saved conversation/message association, finishes before persistExchange, and the client replaces its session UUID on history selection. A reliable recovery change must bind the saved exchange to the private run, persist only owner-scoped recovery references, wait/read status rather than replay the original prompt, and distinguish a completed model run from a successfully saved reply. No recovery implementation or completion claim in this continuation.

Post-deployment browser postcode answer verified: Companies /crm/accounts → company → Setup → Operational addresses → Edit → Postcode, with the correct distinction from the separate Addresses rules tab. No old email commentary or new composer appeared in this reply. Kept the conversation available for the next recovery checks.


### Durable request/result association — recovery foundation

Applied development migration 20260909225755_dexter_active_run_results and deployed agent-dexter. The server saves its generated activeRunId with the reply, finds that exact saved assistant message, then binds its conversation/message to the private run. The binding RPC is service-only, validates active actor, original session, original conversation (when present), owned active chat and assistant metadata, and cannot be rebound to a different result. Status exposes savedResult only while the saved conversation remains owned and active. A completed/failed/expired provider run without a saved reply returns no savedResult; recovery must not equate provider completion with persistence.

Disposable PostgreSQL lifecycle test passed with existing steering checks plus foreign-session denial, direct-client denial, foreign conversation denial, user-message denial, idempotent binding, different-result denial, ended-conversation exclusion and grants. Deno backend type-check passed. No watch adapter is appropriate for private ephemeral request recovery; business read/write/watch capabilities and approval policies are unchanged.

Real browser Smart request in conversation 9675d13d-e714-4d59-92a3-7d9f189f5097 completed. Live database confirms run 0421326e-2b31-469b-8cb1-95b68d8b4847 bound to assistant message 59d59813-3341-4cdf-9cf2-fe5df1e7523f in that conversation, with matching message metadata. No operational changes requested. Client recovery UI is not yet implemented. Active tracking currently starts only on the Astra route; complete reload coverage must also address Fast/legacy transport, early failures, unsent corrections and saved partial artifacts without replaying actions.


### Reload recovery UI and disconnected stream persistence

Local UI now saves owner-keyed, tab-local request/session references, original prompt, model, correction identity and unsent composer text; status reads are server-authorised. Reload checks the original run and loads only its bound saved reply, including native artifacts. It never resends the prompt. Unknown status retains a Check request control and blocks another submission; terminal unsaved requests retain original request text in the error and any unsent correction in the composer. New-chat recovery works before a conversation ID exists. Fast now also creates a tracked run but announces canSteer=false, so it does not offer unsupported mid-turn updates. Submitted-correction recovery, pre-registration reload, attachment re-selection, multiple concurrent conversations and account-change recovery still need further checks. Session storage unavailability currently falls back without persistence.

First browser reload (run 4bc1d41e-81f2-4f53-9074-7477876af076) preserved unsent text and blocked duplicate sending, but server execution failed on stream closure before saving. Fixed the transport with durable-event-stream.ts: cancellation stops event delivery, not the original authorised work/save. EdgeRuntime.waitUntil retains the one task after disconnection, following https://supabase.com/docs/guides/functions/background-tasks. Existing tool/transport bounds remain; total legacy multi-round duration versus run expiry still needs review. No reconnect or replay is introduced. Deterministic tests cover cancel-while-working, exactly one save, normal completion/closure; Deno passes. Deployed to development.

Second actual browser test started a new Smart conversation, typed an unsent note and reloaded while Update request showed the active request. Recovery displayed the pending original prompt, kept the note, and then loaded both native tables (Two current leads and Two current deals, two rows each) into new conversation f8da8fa7-3830-43a5-b180-d23204f6144c. Run c852e0f2-c945-4f37-b999-47332fd580d6 completed with exactly one saved assistant reply 555d5368-fa81-4ded-aec0-98bffd326a4c. No data changes requested.

Fast test in that conversation: run 31775743-623d-450f-9512-c5d20473c33b was confirmed active, then browser reloaded. The reply and booking table recovered with Fast selected and the normal composer restored. Database confirms completed status and exactly one saved reply da7cc09d-9ec5-48a8-8f0b-7e91b5940342. This validates Fast recovery independently of steering. It exposed a separate answer-quality defect: the prompt excluded drafts, but the example table included newly created draft JD0991136 alongside open JI0991132. Do not treat aggregate/example filtering as fully verified until that mismatch is fixed and retested.

Tests: recovery storage preserves immutable correction IDs, owner isolation, newer-request protection, invalid/expired storage and disabled-storage fallback; PostgreSQL owner/session/result lifecycle passes; 11 real orchestrator tests pass; both durable-stream tests pass. Full client TypeScript/Vite build passed (10.84s), followed by small disabled-retry/composer guard refinements. No production deployment.


### Filtered examples, committed-correction recovery and responsive checks

Added explicit in/not_in filters to show_record_table. The server validates filter fields against the record domain and rejects selected rows that fail a declared filter; missing values cannot prove inclusion or exclusion. Booking filtering distinguishes saved jobStatus from display/tracking status, so an open job with Exception is retained while a closed or draft job is excluded. Shared instructions request sufficient candidates, matching IDs and declared filters, and fewer rows rather than relaxing the operator's criteria. This validates declared filters; it does not infer every natural-language constraint independently of the model. Twelve filter/orchestrator tests pass and Deno passes; deployed development function. Browser repeat now shows JI0991132 Open and B-990002 Booked, excluding draft JD0991136. No new operational capability or watch semantics were added.

Immediate reload after clicking Update request occurred before the correction reached the server: run a2984622-4840-43b0-9688-70d57838300f completed its original request with no steering input, retained correction text in the composer and saved reply 9921d692-f8a6-4685-aa18-17e359026fb0. Added a recovery status branch to label that absent correction failed once the run is terminal; this new absent-input message still needs a fresh race reproduction.

Second correction test waited until browser displayed Correction applied, then reloaded. Recovered One lead and One deal native tables with one row each and Correction applied; composer correctly empty. Run 8b28d0c0-c319-4524-acf2-24b109968f96 completed, reply b44b855f-a17b-487d-8812-e1f7d6bd6344, exactly one steering input 68c714f0-a582-484d-967e-e8bca63dcc76 incorporated.

PDF retry in a new Chrome tab 642570227 using the documented filechooser flow again returned without an attachment. Read browser-specific troubleshooting; it requires ChatGPT extension Allow access to file URLs. Delivered the exact enablement instruction to the user. Did not grant the extension broader local-file access or bypass upload through hidden fetch/eval. Chrome tab kept for continuation; synthetic PDF remains tmp/pdfs/dexter-qa-freight-enquiry.pdf. Extraction and resulting actions remain unverified.

Responsive testing used temporary 390×844 and 768×1024 overrides. At mobile size, found custom Jump to latest handler failing to reach the final table (scrollTop about 3209 vs maximum 3519). Replaced its separate DOM smooth-scroll/timer bookkeeping with MessageScroller.Button using the existing provider's scroll controller. Retained styling and reduced-motion behaviour. Browser keyboard Page Up then click Jump to latest reaches scrollTop 3350.45 vs maximum 3351, with both final rows visible above the composer. Mobile document scrollWidth equals viewport width; wide tables stay within their own scroll areas. Tablet screenshot confirms final tables and composer fit, and captured console error list is empty. Reset viewport override afterwards. This is focused responsive coverage, not all email/approval/keyboard states.


### Request deadline and address-watch investigation

Added a 95-second request budget shared across all model rounds. Legacy streaming calls use the lesser of their 55-second timeout and the remaining request time. Before each new model round and each new tool call, expiry returns saved partial artifacts or an explicit timeout error. This prevents a new action starting after the request budget; an already-running external/database action is not forcibly cancelled and must retain its audit/idempotency handling. Two new actual-orchestrator tests confirm expiry before generation performs no provider/action work, and expiry between two requested actions preserves the first approval while starting neither the second action nor another model round. All 13 orchestrator tests pass, Deno passes, and development agent deployment succeeded. No new business capability/watch adapter is involved in transport timing.

Live schema confirms address type, opening-hours and dated-override watches still use the old raw per-row foundation adapter. The canonical address writer deletes and reinserts each of those collections on save. Replacing raw row payloads with semantic fields alone would produce notifications for unchanged saves and potentially several events for one edit. Next fix should compare the semantic aggregate before first mutation and after transaction completion, emit one event per changed address, ignore audit/generated row IDs, retain actual source/evidence and apply the same runtime owner/company/CRM.Read checks as the core address watch. Nothing has been changed in these child-table watch triggers yet.


### Address watches across complete transactions

Applied development migration 20260909232519_dexter_address_watch_transactions. Core addresses, purposes, weekly hours and dated overrides now capture a semantic snapshot before the first mutation and compare it with the final transaction state through deferred constraint triggers. A private transaction/address queue is deleted during evaluation and rolls back with the transaction. Generated child IDs and audit-only fields do not count as changes. One signal per changed address uses the existing addresses rule, repeat-change handling, current account visibility and active owner/CRM.Read guard. Organisation reassignment produces separately scoped removal/addition evidence. No recurring model calls.

Disposable PostgreSQL lifecycle fixture retains prior core postcode/county/deletion/access tests and adds real replacement of unchanged child rows in different insertion order, multi-field/core+hours+override coalescing, purpose changes, pause/resume, revoked owner, deletion and queue/grant checks. Passed. Five watch-copy tests passed, including plain-language collection updates. Full client build passed in 10.85s.

Actual browser lifecycle on Demo Organisation 051 and watch d19a56e0-cc35-4c6a-90e0-13ef972c5e6c: resumed through UI and verified Pause this watch before leaving. Baseline two events. Saved address unchanged: still two. Added Monday 09:00–17:00 through Setup → Operational addresses → Edit: three events. Saved unchanged with those hours present: still three. Removed Monday hours to restore original empty schedule: four events. Database confirmed zero remaining opening-hours rows for the company and zero queued watch changes. Core address remained Foundry House, Birmingham, B4 6QE, GB; Main address/default remained selected. Watch UI shows “Demo Organisation 051: Opening hours updated.” Paused through UI and verified Resume this watch.

Purpose/dated-override semantics are covered by the transaction test; their individual browser editing paths were not repeated here. Office assignments, related-party defaults, contact association/email and company-code/scope watch parity still need review.


### Company setup watches and code-only edits

Applied development migration 20260909233312_dexter_company_setup_watch. Changes to Org_Master company code and CRM_AccountProfiles scope now emit semantic accountCode/scopeCode signals for company watches, with current owner permissions/account access and repeat-change handling. Unchanged values do not emit events. Both notification and inline watch copy use Company code and Scope, with readable before/after values. Disposable PostgreSQL lifecycle tests cover repeated code changes, scope changes, unchanged values, revoked owner and inaccessible account; six watch-copy tests pass. Client build passed in 11.07s.

Created company-code watch 19ea0798-66c6-4a89-9648-69d0bfca44fb through Dexter's dedicated /watch flow for Demo Organisation 051. The normal chat gave directions to that flow and did not falsely claim a watch had been created. Browser code-only edit initially failed because the Setup form sent unchanged empty office assignments as an explicit replacement. Fixed the form to omit assignments when their office IDs/primary flags are unchanged, using the canonical writer's existing partial-edit support. Actual office changes still send the complete collection and remain subject to existing office validation; lifecycle transitions retain server validation. No server validation was relaxed.

Retried through the real Setup form: CUS0005 → QA005 saved without changing scope, lifecycle or offices. Exactly one event said Company code changed from CUS0005 to QA005. Restored CUS0005 through the same form: exactly two total events, with the second saying Company code changed from QA005 to CUS0005. Verified the restored code in the development database, viewed the readable restoration notification in Watching for you, then paused the QA watch through its UI. Database confirms paused and exactly those two events. Client build after the form fix passed. Scope mutation is covered by PostgreSQL tests, not a separate browser edit; office/related-party/contact watch parity remains outstanding. Production was not changed.


### Responsible-office watches

Applied development migration 20260909234424_dexter_office_watch_transactions. Replaced raw assignment-row signals with a private per-transaction/profile snapshot and deferred comparison of the final office ID/primary-flag collection. Generated row IDs and insertion order do not count as changes. A company receives one responsibleOffices signal for a real assignment change; unchanged replacement saves produce none. Runtime evaluation retains company/account visibility, active owner and CRM.Read checks, and permits successive changed events. Backend notification and inline watch copy say Responsible offices updated rather than displaying database JSON. Existing tenant-safe customer reads expose responsibleOffices and the approved canonical foundation writer remains unchanged.

Extended disposable PostgreSQL lifecycle coverage: adding two offices produces one event; deleting/reinserting equivalent assignments in reverse order produces none; switching primary flags produces one; pause/resume works; revoked permission and inaccessible account suppress events; queue drains and authenticated clients cannot read it. PostgreSQL tests passed, seven watch-copy tests passed, and client build passed in 11.27s.

Actual browser flow created watch cc41873d-b898-4fc6-92e0-a583c114f9e5 on responsibleOffices for Demo Organisation 003 (de1000c1-5eed-4ead-8000-000000000008). Baseline potential company, CUS0001, standard scope, no assigned offices. Through Companies → Setup → Edit setup, selected Wakefield 41 and saved: one event. Saved unchanged: still one event. Removed that assignment to restore the baseline: two events. Database confirmed potential=true, CUS0001, standard scope, zero offices, exactly two watch events and an empty pending queue. Viewed the plain-language event in Watching for you and paused the QA watch. Only development was changed; no production deployment.

Contact employment/email and related-party default watch adapters still need review. Office-name lookup/selection in Dexter's own write preparation and full multi-action version sequencing remain separate outstanding checks.


### Dependent company changes: verified sequencing, missing continuation

Browser conversation b0dbdc83-9613-4a4b-a414-e6d11b0ba709 requested company code QA005 and main-address postcode B4 6QF for Demo Organisation 051, preserving everything else. Dexter correctly prepared only the company action at version 13, explaining the shared version dependency. Approval d1b0f6a7-f010-482a-990f-657b4119a313 succeeded. However, its prose promised to re-read and prepare the postcode after approval, while the actual approval endpoint only returned the completed-action response: no automatic continuation occurred. This is an unresolved multi-action UX gap.

An explicit user continuation then re-read the company and prepared only the postcode at version 14. Approval 74fdaa17-3e83-4c2d-a6bc-a335b4bfc4d1 succeeded. Database confirmed QA005/B4 6QF at version 15. Restored company code and postcode through Companies → Setup forms; database confirms CUS0005/B4 6QE at version 17. Both QA approvals remain succeeded in the ledger; the record is restored.

Updated the system instruction to state the actual current approval behaviour and prohibit promising automatic follow-on generation. Deno check passed and agent-dexter deployed to development. This copy correction has not had a fresh browser generation check. It does not complete the requested smooth dependent-action UX: next work should persist explicit remaining work and dependencies, expose a clear continuation action after its approvals resolve (or safely resume generation), re-read before preparing dependent edits, preserve approval/audit boundaries, and prevent duplicate continuation on replay/reload. Do not treat the manual continuation test as proof of automatic execution.


### Saved continuation for dependent approvals

Implemented defer_work_until_approval in Approve mode. It stores one bounded remaining-work description with up to eight dependency IDs, accepted only from this turn's actual pending proposals. The plan is saved with the assistant message and survives partial provider failure and conversation reload; an incorporated correction clears the in-flight plan. The inline step says Waiting for the approvals above, becomes Continue request only when all ledger statuses succeed, and blocks declined/failed/expired/missing dependencies. It preserves an unsent composer draft by disabling continuation with a specific explanation. A submitted continuation hides that step on subsequent reads; unrelated clarifying questions do not discard it. This is an explicit operator continuation, not background execution.

The user sees only Continue request: [remaining-work label]. The request carries the source assistant-message ID. The backend requires Approve mode, that source on the requested history branch, an owned conversation, an assistant message in that conversation and every referenced action belonging to the same company/user/conversation with succeeded status. It resolves the saved detailed instructions server-side, re-reads current records through the normal model tools and prepares new approvals. It does not update old proposal versions or replay completed writes. The source ID is retained in response metadata for retry; retrying still rechecks dependencies. This is internal orchestration, not a new business write/watch capability; eventual company/address writes retain their canonical validation, approval, audit and existing deterministic watches.

Seventeen server/orchestrator/artifact tests passed, including partial-result retention, foreign/superseded dependency rejection, owner filters, pending/declined/failed/expired rejection, and source metadata hydration. Two client state tests cover all-dependency readiness, blocked/missing dependencies, selected branch, reload, clarifying questions and consumed continuation. Deno passed; full client build passed; latest agent deployed only to development.

Browser first run 40538d37-16a9-4557-b5f0-b4c2cec07b0b: company approval ec132c6b-68eb-476c-8885-93352492369d succeeded; saved postcode work unlocked, survived reload, disabled while an unsent QA note existed, and resumed through Enter after clearing the note. It prepared the address only; that proposal was denied. This first version exposed a long technical follow-up message; replaced with the concise server-resolved flow above.

Final browser run 13978d3d-6720-4587-9f97-cbb7dfb30443: company restoration approval 841f10de-96d8-435b-8122-2bb3b500b911 used version 18 and succeeded. Reload retained Continue request. Clicking it displayed the concise label, re-read the company, and prepared only postcode approval 63715ef0-4b8c-4edd-bff8-bea22e92ba89 at version 19. Denied that QA postcode proposal. Reload confirmed Completed/Denied statuses, the concise continuation message, and no duplicate Continue request button. No browser console errors in the focused check. Database confirms CUS0005/B4 6QE, version 19. No additional company-code proposal was made by continuation.

Remaining verification: narrow-screen layout for this new inline step, actual cross-user denial of the continuation endpoint (current tests exercise the guarded resolver), retry after the latest source-ID persistence refinement, multiple prerequisite approvals in a real browser, and cancellation/dismissal of saved remaining work. Full-access deferred work is deliberately unavailable; the UI asks the operator to switch to Approve. A duplicate request from a separate tab can still generate another review proposal; no continuation grants execution or bypasses approval. PDF attachment access and other broader goal items remain outstanding.


### Dismissal and denied dependencies

Added Dismiss remaining step to saved continuation panels while waiting, ready or blocked. Dismissal is separate from approval decisions: it stops future continuation of that saved step and keeps the original work description and approval history. The UI shows Remaining step dismissed and removes its controls after confirmation. It does not cancel another tab's already-started generation or undo an executed action; new writes still require approval.

Development migration 20260910000924_dexter_dismiss_deferred_work adds a service-only, owner/company/conversation/message-scoped RPC that locks the assistant row and sets metadata.deferredWorkDismissedAt without replacing unrelated metadata. Repeat dismissal is idempotent. The continuation resolver refuses dismissed steps. The frontend preserves the current composer and displays a specific inline failure if dismissal cannot be confirmed.

Disposable PostgreSQL tests passed for correct owner, wrong user/company/conversation denial, browser-role denial, preserving all other content and repeat timestamp stability. Resolver/artifact tests passed including refusing dismissed plans; three client state tests pass including a dismissed dependency remaining unavailable after later success and exclusion from other branches. Deno passed, client build passed in 11.05s, and the edge function deployed only to development.

Actual browser conversation f4127b51-c10b-4dba-bed2-e656a863349a prepared code approval 907e41c9-95ae-41df-b89f-1bb3dacd1778 plus the saved postcode continuation. A development refresh during the request recovered the saved approval/plan without re-submission. Denied the prerequisite: the panel displayed A required change was not completed and offered no Continue request. Clicked Dismiss remaining step. Database records dismissal at 2026-09-10T00:11:03.096132+00:00 on assistant e688ab41-3545-4678-8293-24ec43427bd2. Reload showed Denied and Remaining step dismissed, with neither dismissal nor continuation controls. Focused browser console had no errors. Company remains CUS0005/B4 6QE at version 19: this test made no company/address write.

Actual authenticated cross-user HTTP denial and narrow-screen continuation layout remain unverified. SQL ownership/role denial is verified in the disposable database; it is not a claim that the whole HTTP journey was exercised as another user.


### Phone/tablet inline email and continuation review

Used browser viewport overrides of 390×844 and 768×1024 (rendered document widths 354 and 698 at the current browser scale), then reset to normal. Phone screenshots confirmed stacked approval diffs, readable blocked/dismissed continuation state and keyboard access to Deny/Dismiss. Mixed Fast request daebd7bf-97b8-45c8-9b35-8ca366eb5263 produced a native email composer, company approval and dependent postcode step. During streaming, the email composer attempted autosave before its message ID had been persisted and displayed Draft could not be saved.

Fixed the composer to recognise transient message IDs: display Preparing draft…, disable editing/provider actions and skip autosave until a persisted message ID is available. Follow a new saved message ID when not editing a separate copy, resetting save state. This prevents a transient draft being edited and then replaced at message-save handoff. Existing editable-copy behaviour stays separate. Full client build passed in 11.02s. This is a local client change; no new provider/backend capability was added.

The mobile mixed test approved Create draft through the inline composer: action 4a11fe62-d570-438b-8c0d-641c2df52eab succeeded, provider message 54b88e32-77cf-40d5-9fb8-65454bbbb23d is draft_created. It was not sent. A recipient-free provider draft is valid; creation was not an empty-recipient validation failure. Denied company action 02eb07ea-a821-49b0-87c9-b64c8bf3144d and dismissed its dependent postcode step through the keyboard. No company/address change was made. The labelled QA provider draft remains unsent.

Post-fix Fast conversation b520facc-3b97-4a0b-8fba-3ded54ca520c produced an inline email plus two native lead rows and two deal rows. The saved composer is editable and shows Saved. Explicit recipient harry.phillips@jenkar.com is confirmed both visually and in persisted metadata; the browser's DOM representation did not expose input values, so blank snapshot values must not be treated as empty UI fields. Edited the body to This is a draft preparation test. Verified on mobile. Autosave persisted that exact text, recipient and delivery=draft on assistant 5c939a7c-e1a0-45c9-ae52-37eaf3c07667. Reload at tablet size visibly retained the text and recipient. This second draft was not created in the provider or sent.

No document-level horizontal overflow at phone or tablet widths; native tables retain their own horizontal scrolling. Tablet screenshot shows sender, recipient, subject, editable body and saved status clearly. Focused console error check returned none. The brief post-fix pre-persistence state was not captured before completion, so browser proof here is final readiness/edit/autosave/reload, while the transient-save prevention is established by the explicit lifecycle guard in code. Ready continuation with all approvals succeeded has desktop/reload proof; phone verification in this pass covered waiting/blocked/dismissed steps. Existing composer height can occupy a substantial part of a phone screen; physical soft-keyboard behaviour remains unverified.


### Related-party default watch lifecycle

Development migration 20260910003058_dexter_related_party_watch replaces raw related-party row signals with semantic relatedPartyDefaults values, adds deletion, scopes reassignment to each old/new company and organisation, ignores audit-only changes and reuses the current watch-owner/company/CRM access guards. Repeated genuine changes generate separate events. Both database notification text and frontend copy say Related-party defaults updated without exposing internal rule JSON or identifiers. No new business writer was introduced.

Disposable PostgreSQL lifecycle tests passed for insert, priority edit, unchanged/audit-only save, active-state changes, pause/resume, revoked owner, moved owner company, inaccessible account and deletion. Eight client watch-copy tests pass. Client build passed in 11.20s. Migration applied only to development aqtwypsuijxlnvtxpuxe; no production deployment.

Browser created watch e211a279-befe-4e92-950e-453bfec77ac6 through Watchers > Watch something else for Demo Organisation 050 (51f00000-0000-4000-8000-000000000001). Ordinary chat correctly directed the user to that existing creation flow. Edited the existing shipper default 56f00000-0000-4000-8000-000000000001 through Companies > Setup. Unchanged save produced zero events; priority 10 to 11 produced one; restoring 10 produced two total. Confirmed original effective-from 2026-08-25, address and contact remain. Browser showed Demo Organisation 050: Related-party defaults updated. Paused the QA watch through its control. Conversation cd987a76-a665-477c-be4b-7af415f8ca6d contains the original chat guidance; the watch workflow maintains its own messages. SQL lifecycle checks are not a claim of authenticated cross-user HTTP coverage.


### Chronological inbox lookup and working table links

Browser conversation 0d86b4b2-f0d6-4e80-9cde-7442b8dfee77 exposed an incorrect approximation: the request for the three most recent received emails used keyword searches and presented older Outlook results, with a Gmail failure. Existing search requires identifying terms and ranks relevance, so it cannot establish recency across inboxes.

Added list_recent_email backed by development migration 20260910003943_dexter_recent_email. This is a bounded read of individual messages ordered by message date across the selected, currently authorised provider mailboxes. It distinguishes received/sent/all, excludes deleted/draft/spam/trash, applies the 12-month retained window, validates date ranges, returns participant metadata and trusted thread citations, and reports mailbox sync/index coverage even on empty results. It uses the existing authenticated Dexter context, Email.Read plus Email.AIRead and authoritative mailbox-access function; it does not query providers directly or bypass grants. Calls are audited and returned thread IDs can be read through the existing bounded thread reader. Watching for you continues to use existing deterministic email-arrival signals; chronological retrieval adds no data mutation or new event type. No new write action is appropriate.

Disposable PostgreSQL tests passed for chronological limit/hasMore, provider scope, received versus sent, hidden mailbox exclusion, draft/spam/trash exclusion, retention, future empty result with coverage, Email.Read/Email.AIRead denial, revoked mailbox availability and anonymous execute denial. Permission/mailbox helper fixtures establish the adapter boundary; they do not prove a second authenticated user HTTP journey. Deno check passed. Edge function and migration applied only to development. Client build passed in 10.45s.

Post-fix browser conversation 0e2e1d33-94bf-467a-a427-ba7416f5b77f returned three newer Gmail messages across the authorised sources. The markdown table renderer was flattening all cells to text, destroying source links. Tables containing links now retain ReactMarkdown's rendered, sanitised children inside the existing table wrapper. Keyboard activation of the first source opened the matching Gmail thread da43c781-f878-4b34-be50-bb3e382df314 and its matching subject and body. Phone layout has document width/scrollWidth 354/354 with links retained.

A follow-up requested the precise newest timestamp plus a separate 1–2 January 2030 range. Dexter displayed 9 September 2026 23:55:11 UTC (+00:00), confirmed against the stored inbound message date, and separately reported no matching received emails with a caveat that some Gmail sources were still indexing. Added explicit timezone wording after the initial answer omitted UTC and differed from Inbox's local 00:55 display. This was a read-only QA journey except the normal Inbox read state upon opening the email; no reply or send was performed.


### Email PDF extraction and viewer repair

Conversation d58db69b-ff44-4b69-a793-1bfdec260579 found and read Invoice-S3NTXYN6-0011.pdf from an authorised Gmail thread. Dexter surfaced the attachment card and extracted invoice S3NTXYN6-0011, Replicate LLC, 2 April 2026, USD and total 10.16. It correctly attributed paid wording to the PDF. The search result was relevance-ranked and dated April; this does not prove the newest matching invoice. Narrowed routing instructions so invoice/sender/attachment searches retain keyword search while an unfiltered newest-email list uses the chronological reader. That prompt change deployed to development.

The attachment card's iframe preview opened as a blank white region in the in-app browser. Replaced that PDF path with the existing lazy-loaded PdfDocumentViewerDialog: the attachment remains inline, View opens the established full-screen page/zoom viewer, and the same authenticated attachment loader provides the blob. The temporary download URL is revoked after reading. Failed fetches close the preview and show the existing error toast. Updated the viewer gallery quick link for Dexter. No new PDF dependency, provider capability or watch event.

Reloaded the saved conversation and opened View by keyboard. Actual rendered invoice page visibly confirms number, supplier, issue date, currency and total, including its apparently contradictory amount-due heading and explicit paid/no-further-action footer. Zoom in changed to 125%; phone fit returned to 100%, all controls remained visible, and keyboard Close returned to the card. The first attempted Escape did not dismiss during automation; Close activation did. Reset viewport. Client build passed in 10.90s. This proves an existing email PDF can be read and viewed; local PDF upload remains separately unverified because of browser file-access configuration. Malformed/encrypted/multi-page viewer failure cases remain unverified in this pass.

Follow-up in the same conversation re-read the PDF and prepared an editable email to the QA self address with subject Dexter PDF extraction QA. The saved body includes the correct figures and explicitly distinguishes the amount-due heading from the paid/no-further-action footer. No provider draft was created and no email sent. The overall response hit its deadline before final explanation and displayed the preserved-work fallback; this is partial completion, not a clean end-to-end pass. Attachment and editable email artifacts remained available. Timing/final-explanation reliability remains an open issue.

Correction to the preceding timing diagnosis: the egress audit for the PDF-to-email follow-up shows three succeeded calls between 00:46:31 and 00:46:56 UTC, with output units 136, 547 and 4. The fallback came from the no-final-answer branch, not the deadline branch. The email instruction said Finish by calling prepare_email_draft; the final provider turn returned no explanation. Changed the instruction/tool result to explicitly finish the other requested tasks and provide a brief final response, without repeating the draft or claiming it was sent. The previous timeout attribution was an inference and is superseded by this audit.

Retest after the final-response instruction fix, same conversation: prepared Dexter PDF extraction QA final and returned a normal final explanation confirming the editable draft and its payment-status distinction. The previous empty-answer fallback did not recur. No provider draft/send was approved. This focused browser retest verifies the changed prompt path, not that every model response will always contain text.


### Contact employment watch targeting

The old foundation adapter used CRMContactOrg_ContactID as the customers watch source ID, so a watch targeting the employer company could not match. Development migration 20260910005253_dexter_contact_employment_watch now emits contactEmployment semantic values against CRMContactOrg_OrgID, separately scoped to old/new company and organisation if reassigned. It ignores audit fields, preserves repeated business changes and deletion, and extends the existing current-owner/company/account-access guards. Notifications say Contact employment updated rather than printing raw identifiers or row JSON. Existing contact write paths remain unchanged.

Disposable PostgreSQL tests cover initial employment, audit-only no-op, changed title, old employment ending and new employer insertion with correct separate watch counts, revoked owner permission, pause, inaccessible account and deletion. Nine frontend watch-copy checks passed after correcting a copied label caught by the new assertion. Also fixed the related-party test's stale pre-application migration basename; the full aggregate address/company/office/related-party/employment PostgreSQL test now runs against actual applied filenames. The employment migration is on development only. Actual browser transfer lifecycle and the separate OrgContact_Emails history adapter remain open.


### Contact email-history watch lifecycle

Development migration 20260910005629_dexter_contact_email_watch replaces the raw contact-ID signal with a transaction-coalesced contactEmails snapshot against the employer organisation. It captures before the first email-row mutation and compares after the transaction's history changes finish; the normal deactivate/insert/superseded-pointer sequence therefore emits once. Values retain semantic type/active/primary/validity data, normalise email case/whitespace and use an email fingerprint rather than copying raw addresses into watch payloads. The private RLS-enabled queue is unavailable to browser roles and drains after evaluation. Old/new organisation scopes are separated if a contact is reassigned during a transaction. Existing current-owner/company/account-access guards and repeated-change handling apply.

Disposable PostgreSQL checks pass for one notification per complete history replacement, unchanged save, case/whitespace no-op, repeated address change, revoked permission, pause/resume, deletion, inaccessible account, queue cleanup and queue denial. Ten client notification-copy tests pass; build passed in 11.27s. Migration applied only to development.

Actual browser created watch cd86ce38-db45-44ce-a659-a382e6acf32a for Demo Organisation 050 contact email changes. In the normal Maya Collins contact form (54f00000-0000-4000-8000-000000000001), unchanged work-email blur produced zero events. Changing quotes@northstar-apparel.example.test to dexter-qa@northstar-apparel.example.test produced one event; restoring the original address produced two total and zero queued changes. The original address is current primary again. Canonical history retains the temporary QA address and both original/current history rows; it was not erased. The browser notification reads Demo Organisation 050: Contact email details updated. Paused the watch through its keyboard control. No emails were sent. Actual cross-user HTTP denial and employment-transfer browser lifecycle remain separate outstanding checks.


### Direct database actor and mailbox boundaries

Live inspection found _multideck_dexter_context validated only Auth_User_ID and non-null Company_ID, unlike the Edge actor check which rejects inactive access. Development migration 20260910010200_dexter_active_actor_context now requires one unambiguous profile and active access (preserving the existing legacy-null-as-active convention). Missing/disabled/suspended/invited/revoked users, missing companies and ambiguous auth links are denied with 42501. The internal helper is not executable directly by browser roles; supported security-definer RPCs continue to call it. Existing watch-owner active-access guards remain in force. No user, role or mailbox grants changed.

Disposable PostgreSQL tests passed for those cases, correct current-company return after a company change and invocation through an authenticated security-definer wrapper. On the actual development database, selected an existing user lacking Email.Read or Email.AIRead and invoked multideck_dexter_recent_email under SET LOCAL ROLE authenticated and that identity's transaction-local claims: denied with 42501. Selected another existing user with both email permissions but without the QA Gmail mailbox grant: recent results excluded that mailbox, and a read of the exact known Gmail thread was denied. Transactions rolled back and returned only pass/fail markers, not other users' email data. These are real-schema/database-role permission checks using simulated transaction-local claims, not a second user's browser login or HTTP/JWT authentication test. All 12 existing linked users were active; inactive-user behaviour was tested in the disposable database, not by disabling a real account.

Normal signed-in browser read after the context migration succeeded in conversation 72b8de70-b549-448e-b6ba-027e8b54c3f2: latest received email returned with provider, sender, UTC timestamp and source link. Focused console error check returned none. No client or Edge implementation changed in this slice; the migration and its PostgreSQL test are the relevant checks.


### Two prerequisites followed by one dependent approved action

Actual browser conversation 5aae64d7-3671-44cc-a674-24e8bdec2d93 requested company-code changes for Demo Organisation 051 and Demo Organisation 003, then a postcode change only after both succeeded. Dexter prepared two independent approval cards and one saved remaining step. First code approval 3676f0d9-df6b-4080-80d7-b9cc7265936a succeeded at version 19; the UI still showed Waiting for the approvals above and no Continue request. Second approval c3a8c712-2cfa-4bfd-913b-0364314363d1 succeeded at version 5.

Reload retained both Completed states and enabled Continue request. At 390×844, rendered document width/scrollWidth were 354/354 and the ready control remained available. Keyboard Continue submitted the concise saved-step request. Dexter prepared only postcode action 4f8f4ce3-1db8-42fa-941b-db1019a1716d using freshly read company version 20. Approved it through the phone-sized UI; persisted postcode became B4 6QA. No duplicate company-code approvals were prepared.

Reset viewport and restored both company codes and the postcode using the normal Companies > Setup forms. Verified final Demo Organisation 051 code CUS0005, postcode B4 6QE, version 23; Demo Organisation 003 code CUS0001, version 7. This browser pass completes the previously outstanding multiple-prerequisite and ready-state mobile checks. Cross-tab duplicate continuation proposals, matching-label continuation identity and retry-specific coverage remain separate concerns.


### Continuation identity when labels match

Changed the client continuation-state resolver to match the source message ID, including persisted server IDs, using the existing saved continuationMessageId metadata. Optimistic submissions and assistant placeholders carry the same identity, including failed-request retry input. A display label no longer identifies a new continuation. Older concise submissions without metadata use label fallback only if one earlier plan has that label and no saved response identifies another plan; ambiguous old history stays reviewable instead of silently discarding a step. Legacy full-request text remains supported.

Four state tests pass, including matching labels, optimistic source ID, saved assistant metadata after reload, ambiguous legacy labels, clarification messages, dependency outcomes and dismissal. Browser reload of completed three-step conversation 5aae64d7-3671-44cc-a674-24e8bdec2d93 retained all three Completed statuses and offered no duplicate Continue request. Focused console errors: none. This is a local client refinement; the existing server-owned continuation resolver and approval boundaries are unchanged. Two same-label plans were covered in state tests rather than an additional live mutation journey.


### Contact transfer evidence, review and complete browser lifecycle

Found an actual unsafe-to-approve proposal in conversation bd69af52-daed-49a3-9160-d75b7b44ecac: the customer read omitted the contact edit version, so the model proposed version 1 against actual version 3 and rendered raw identifiers. “Preserve her email … Prepare the change” also triggered an unrequested editable email composer. Denied that proposal; no transfer or email send occurred from it.

Development migration 20260910012420_dexter_contact_transfer_evidence adds nested contact record identity, employer, current version and role/job/department evidence to the existing authorised customer read. The review binds both accessible records and exact current version, rejects missing details and invalid dates, and shows contact/company names plus effective date. Contact transfers require explicit approval in Full mode too. Email intent now distinguishes preserving an address from writing a message. Twelve focused email-intent/review tests and Deno checking passed; agent-dexter deployed to development only.

Development migration 20260910011512_crm_legacy_contact_employment preserves the old employer for legacy contacts with no history. Unknown start dates remain null rather than invented; existing history is not duplicated. Disposable PostgreSQL coverage passed for legacy/history transfer, version conflict atomicity, inaccessible destination and identity reparenting. The contact UI labels unknown dates clearly and orders the current employer first.

Actual browser conversation 4c8cc1bf-b2d2-49c2-b5d8-542552abc291 produced a readable Move Maya Collins approval with Demo Organisation 050 → 051 and no email composer. Keyboard approval succeeded, preserving the original employer with unknown start and ending 9 September. A fresh read and separate approval restored Maya to Demo Organisation 050 effective 10 September. Both Completed states persisted on reload; current contact version is now 5, current email remains quotes@northstar-apparel.example.test, role/job/department remain unrecorded. Three honest employment-history entries retain the temporary QA move. Watch a1b6f5a6-0455-4a6a-a266-04dc9f827157 fired once for each move (two total) and was paused through the browser, confirmed in the database. Chrome contact detail displayed the restored employer, current email and unknown-start history correctly. Focused Dexter console errors: none. Non-empty role preservation is covered in the disposable database rather than this legacy contact.

This closes the previously outstanding employment-transfer browser journey. Local file-upload attachment testing and the previously listed transport/HTTP proof boundaries remain separate. No production deployment or email sending in this slice.

Final client build passed in 11.48s. Browser confirmed current employer first, then dated historical employment, then the unknown-start entry.


### Saved provider draft handoff and false Sent status

Follow-up browser inspection of daebd7bf-97b8-45c8-9b35-8ca366eb5263 found the completed provider composer was labelled Editable email draft despite locked fields and had no source link. It now says Saved email draft and links to the exact authorised Inbox thread using its confirmed mailbox/provider/thread identity. Provider drafts with no valid recipient disable sending and explain that recipients must be added in the email provider. Inline editing after provider creation remains unsupported; the saved composer is the reviewed snapshot, and provider edits remain subject to the existing exact-content send checks.

Correction to the earlier mobile-QA note: the saved provider draft DOES have recipient harry.phillips@jenkar.com, confirmed by the owned prepared-action result 4a11fe62-d570-438b-8c0d-641c2df52eab. The disabled input value was omitted from the browser text snapshot. The model’s original prose about missing recipients was not authoritative. This fixture therefore verifies the valid-recipient Send control, not the new no-recipient disabled branch.

Keyboard View in Inbox opened exact thread 49645e16-d1e7-48e4-ac73-8faf1ec3d75b in the Outlook mailbox and exposed a genuine false status: the unsent provider draft rendered Sent. The inbox backend now returns draft status with no sent/delivery/open/reply evidence when either the draft flag or draft state is present. The client preserves that status, shows Draft and explains that it has not been sent. Draft popovers omit irrelevant tracking history. Added a Draft example to the existing component gallery.

The real delivery projection regression test passed, including protection against stray timestamps on a draft and preservation of normal sent status. All 53 inbox contract tests passed; Deno checking passed. Deployed inbox-api to development only, then reloaded the actual Inbox thread: Draft replaced Sent, and the popover explicitly states unsent. Focused browser console errors: none. No email was sent, no provider draft was created or edited, and no production deployment occurred in this slice.

Final build passed in 10.62s. At the 390 × 844 viewport the saved-draft card retained its Inbox link and Send action with no horizontal overflow (354px content and scroll width). Viewport restored.


### Actual write steering, supersession and truthful explanation

First timing attempt in 150227d6-dc9b-4bca-a686-2d0be03573dc completed just before the correction was sent, making it a new conversational turn. Both QA051 and QA052 proposals remained reviewable. Denied both; no company write. This exposed an outstanding follow-up correction case, separate from active-run steering: matching older proposals should be explicitly replaced when requested.

For the actual mid-turn test, waited on the visible Update company approval then immediately submitted the correction while Update request was available. Conversation a9abd3b8-a4e4-411c-88d9-27da9e6df67d changed the proposed code QA061 → QA062. Server action 572348e1-e6a6-407b-b9da-3189d9242f4f became expired with dexter_request_revised, while e287defc-08ee-41ab-ab49-48fc0c89b44c remained separately prepared. UI showed Correction applied and Replaced by your correction, with only QA062 reviewable after reload. Declined QA062. Company code stayed CUS0005. The final prose nevertheless claimed the old approval could not be withdrawn.

Added application context to the steering message explaining the actual active-request supersession behaviour. This appends input; it does not change reasoning effort or rebuild the instruction prefix per request. It applies only to active-run steering, not ordinary follow-up messages. Approval presentation now suppresses Preparing approval once a terminal/superseded status exists. Sixteen selected active-run/session/supersession tests pass; Deno passes; client build passed in 10.80s. Deployed agent-dexter to development.

Post-fix live retest 2aec60e8-aa1d-40ef-8ba1-c93ae84c5e43 submitted QA071 → QA072 immediately after the first proposal appeared. Correction applied; old card showed Replaced by your correction, new card remained reviewable, and final text correctly said the old proposal was no longer usable and no change had been applied. Retained separate tables with two leads, two deals and two bookings. Declined the replacement, leaving the record unchanged. Ordinary follow-up correction supersession remains outstanding, as does local PDF upload.


### Corrections after a completed reply

Added list_pending_approvals and withdraw_pending_approval as bounded conversation-owned approval controls. A withdrawal requires an ID actually observed by this request; reads filter owner, company, conversation, pending status and expiry. The existing compare-and-set supersession helper binds the old client session and expires only that exact still-pending row, recording the security audit. Executing/completed records cannot be withdrawn, and no operational action is undone. Prompt guidance requires an operator request to cancel/replace, matching action/record/fields, preserving unrelated proposals and separately reviewing the replacement. These are proposal lifecycle controls, not new operational writes or recurring watches. Stream callbacks update the original card immediately; normal ledger hydration preserves the status after reload.

Browser conversation bc2c49c2-6dde-42ae-ac75-a49b17dfa829 first prepared independent code changes for Demo Organisation 051 (QA081) and Demo Organisation 003 (QA083). After the reply finished, requested QA082 instead of QA081 while preserving QA083. Old action 41355f21-031c-4499-80d1-699aa47b9c0d became expired/dexter_request_revised; unrelated a3d29fd5-389c-4bdf-b04f-01d2922d32cb remained prepared; replacement e2b69993-6322-4b18-8c3c-c919768c02f2 was separately prepared. During streaming the original card showed Replaced by your correction while QA083 stayed available. Reload preserved all states. Declined QA083 and QA082; company codes remain CUS0001 and CUS0005.

Focused ownership/race tests and the real-orchestrator harness pass. The broader Dexter regression run covered 140 tests with no skips: 137 passed initially and three stale writing-profile source assertions failed. Updated those assertions for the already-implemented bounded email intent, existing-provider-draft send route and current writing-profile controls, then all 12 tests in that affected file passed. The 61 selected agent/multi-action/withdrawal checks also pass after updating old lane/tool-catalog assertions to the current Astra rollout and approval tools. No production validation or code was weakened to pass. Deno check, client build (10.97s) and git diff --check passed. Agent deployed to development only.

The remaining mandatory journey is actual local PDF upload, extraction and a resulting reviewed action; current browser file-access configuration still prevents attaching the fixture.

### Chrome file access correction

Operator confirmed file URL access is enabled. Fresh chooser retries and a page refresh returned no selection error, yet no attachment appeared in Dexter. Do not attribute this to a disabled extension setting. Local PDF upload remains unverified pending a successful native selection; no PDF extraction request was submitted in this retry.

### Attachment UI correction and confirmed scanner blocker

The earlier attribution to browser automation/file access was incorrect. Once upload status was moved out of the hidden attachment palette into the visible composer, actual file selection and upload attempts were observed. The API sends problem details in `detail`, while the client previously read only `message`, masking the specific failure. The visible backend response is now: “Document scanning is temporarily unavailable. Try again later.” The DEV project's secret-name inventory contains neither DEXTER_MALWARE_SCAN_URL nor DEXTER_MALWARE_SCAN_TOKEN. Scanning was not bypassed.

Dexter now reuses TicketAttachmentList for local image and document previews, including TicketPdfPreview and ImageLightbox. Files appear immediately while uploading, failed files remain previewable, Retry retains the written request, and submission is disabled until failed files are removed or successfully uploaded. Upload fetches have a two-minute timeout. Gallery quick links include Dexter. The shared image tile remove hit area no longer overlaps the centre preview target.

Chrome localhost evidence: local PDF selected; visible scanning failure; PDF page rendered in the shared viewer; zoom 100% → 125%; keyboard Close returned to the composer. PNG selected and retained after scanning failure; keyboard and pointer open the shared image lightbox; Close works. Separate retry retained DOM composer text “Summarise the attached enquiry.” Mobile width 390 had scrollWidth 390; image preview opened there. Desktop viewport restored. No extraction/action request submitted: scanner configuration still prevents accepted uploads. Local preview is not proof of stored attachments or post-send/reload previews. This supersedes the earlier file-access blocker notes.

Attachment UI validation: final client TypeScript/Vite build passed (13.78 seconds); git diff --check passed. No production deployment.

### Saved-message attachment previews

Sent Dexter messages now render their uploaded files through the same ticket attachment list. The file-upload function has a read-only GET preview endpoint that rechecks active actor, AgentDexter.Manage permission, company, owner, clean scan, expiry and active stored-object state before issuing a five-minute private link. Responses are no-store. This is an additional presentation of existing authorised upload reads; Watching for you has no corresponding new mutation or event, and continues its existing deterministic rules unchanged.

Eight focused tests execute the actual preview helper: allowed owner, different user/company, pending scan, expiry, deleted upload/object and revoked permission. Deno checking and the client build pass. The endpoint was deployed to development only. Browser conversation f30d9eac-9ac5-4bb2-9854-29b3bd4f35b7 displays the existing file name, “This attachment is no longer available”, and Retry preview for its quarantined file. No quarantined file was signed or opened. Successful saved-message preview remains unverified until the scanner is connected and a clean upload exists. Current owned upload inventory contains only two quarantined entries.

### Completed direct PDF journey — supersedes scanner blocker

On 10 September the operator explicitly requested passing documents to the AI directly, without the mandatory external scanner. New uploads retain size/signature/type/archive checks and private ownership/permission/expiry boundaries; their status is `validated`, not a false malware `clean` verdict. Existing quarantined/rejected uploads remain unavailable. Migration `20260910084714_dexter_validated_document_inputs` and the updated upload/chat functions were applied/deployed to development project aqtwypsuijxlnvtxpuxe.

PDF/image inputs now go directly to the governed AI request. The Mistral conversion tool remains for other formats and explicit OCR; an initial Mistral attempt returned unreadable and is not claimed repaired by this change. The user's chosen direct-reading route was verified independently.

Conversation ebd9a35e-385b-4c0f-ac90-b7bfb6b953e0: actual local PDF upload succeeded; Dexter read Manchester → Amsterdam, air/DAP, three pallets, 250.0 kg, 2.50 m³, GBP 1,234.50 and 10 September 09:00 UTC next-action time. These matched the visually checked fixture. It distinguished absent shipment dates. A follow-up used the document's exact QA lead and proposed name, read the current record and presented an approval. Approval changed only the QA lead company name to Dexter QA document verification; database readback confirmed it. A separate reviewed/approved restoration returned the name to Development verification — not a sales enquiry; database readback confirmed restoration. Reopening the saved conversation in a new browser tab loaded the PDF from the authenticated preview endpoint, rendered Page 1 and zoomed to 125%; keyboard Close worked.

Fresh conversation 44b0ae28-8e02-4f84-b320-70dc0602d358 used only “Summarise this PDF, including cargo totals and any missing shipment dates.” A newly uploaded PDF was correctly summarised with filename/page attribution, the matching totals, and a clear distinction between next-action time and missing shipment dates. No debugging instructions or OCR override were needed.

Final focused checks: 63 action/document/security/preview contracts pass; Deno check passes; git diff --check passes. The preceding frontend preview build and keyboard/mobile checks remain applicable (no subsequent client changes in this slice). All required development journeys now have the specific evidence recorded in this audit. This is local/development verification, not a production tenant deployment or a guarantee about every conceivable request. No new scanner deployment or credentials are required.

### Default coworker approval flow — 10 September

Operator requested removal of Full access/Approve switching. The composer toggle is removed. Server access resolution always returns approve, legacy full grants cannot authorise execution, the legacy mode endpoint only revokes grants, and every action (including provider draft creation) requires explicit approval. Migration 20260910090558_dexter_always_confirm_changes extends the database approval guard to all actions and revokes existing active grants. Chat and Watching for you action proposals share the same approval boundary; deterministic reads/evaluation do not require tool-use permission.

Email tools for Gmail and Outlook are made available within existing operator/mailbox permissions without requiring provider tags. Instructions select tools from ordinary user requests and clarify only materially ambiguous details.

Browser conversation 2ff5b5ff-40a2-472e-8a02-448de9dc382d: “Write me an email to myself ... Also show two leads in a table” used no provider tag. Dexter selected the connected Outlook mailbox, showed an editable email with Create draft confirmation and a native two-lead table. No read permission question or access switch appeared. Prepared action bf3f5f19-5955-4cd6-994c-8f8049aa2ba3 remained prepared with ApprovedAt null; no provider draft or send was approved. An isolated rolled-back database attempt to mark it executing was denied by the exact mandatory approval guard.

Validation: client build 10.91 seconds; Deno check; 30 email/approval/multi-action tests and 16 security/default-approval tests pass; diff check passes. Backend function and migration deployed to development; no production frontend deployment claimed.
