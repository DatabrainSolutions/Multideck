# Jenkar phone calls: provider and operating contract

Status checkpoint (23 August 2026, 17:35 UTC): all fifteen Phone Calls
migrations, security hardening, Dexter capability and event-driven Watching for
you adapter are deployed to the shared Development Multideck project
`aqtwypsuijxlnvtxpuxe`. The platform readback at this checkpoint shows
`phone-calls` Edge Function v34 active with provider authentication owned by the
Function (`verify_jwt=false`) and source hash
`4178c7f8e0baf0792c15f56aa817fe8ee0eea0e87f0af3f1e44293e91a4d0ad9`.
The exact confirmed-Lead response contract and the opaque-3CX partial-state
correction are therefore deployed as well as source-tested. The
authenticated localhost UI reads the live service and currently receives three
deduplicated calls. Replayed, signature-verified ElevenLabs post-call events now
populate the captured caller names `Harry` and `Sam`; the remaining call has no
name in its provider payload and therefore correctly stays in the explicit
`Unknown caller` review state. Its live source panel shows ElevenLabs and Twilio as healthy from
their tenant-scoped provider cursors and 3CX as not connected rather than
inferring readiness from the empty call list. The ElevenLabs cursor has
completed an agent-scoped discovery page for the exact Jenkar receptionist and
safely found the available conversations. The visible tab refreshes every minute, shows
when it last updated and preserves the last successful live result if a
background refresh fails. No sample records are used in the live path.

At the user's explicit direction, the live Jenkar receptionist agent is linked
to this Development project while a dedicated Jenkar Multideck App project is
not available. Its published Main branch has the Multideck pre-call
personalization webhook enabled and an agent-scoped, HMAC-signed post-call
transcript webhook. A least-privilege ElevenLabs Conversations-read key is
stored server-side for reconciliation. This confirms the provider configuration
and authenticated empty-data path; it does **not** make the shared project a
production tenant boundary or prove a new outside-origin call, a complete
ElevenLabs-to-3CX transcript, or the employee/3CX portion of the journey.

The local client fails closed against the live service by default. Sample
phone-call data is available only when a developer explicitly starts Vite with
`VITE_PHONE_CALLS_PREVIEW=true`; a missing or failed Edge Function must
otherwise render the product error state.

## Caller experience

The ElevenLabs receptionist should keep intake conversational and brief. It
needs only:

1. The caller's name.
2. Their company, when it genuinely applies.
3. What the call is regarding.

The agent must reuse anything the caller has already said, ask only for missing
context, and avoid turning the call into a form. The personalization response
may also contain `reviewed_caller_name` and `reviewed_company_name` from a
previously human-reviewed call. Those details can support one natural
confirmation question, but must never be asserted as the current caller's
identity. A suitable instruction is:

> Greet the caller naturally. Learn their name, their company if it is relevant,
> and what the call is regarding. Reuse details they already gave you and never
> ask the same question twice. If reviewed identity details are supplied,
> confirm them once rather than assuming they are correct. Company is optional
> for personal or clearly non-company calls. Keep this brief, explain any
> recording or transcription in the approved Jenkar wording, then help or
> transfer the caller.

The live Main branch now publishes the stable post-call fields `caller_name`,
`company_name`, and `call_reason`. All three use transcript extraction; missing
or ambiguous values stay empty, and company may be blank when it does not apply.
The existing transfer tool contract remains unchanged as `screening_id`,
`requested_employee`, `caller_name`, and `reason`. Multideck treats all captured
identity as a candidate until a user reviews an uncertain match.

## Confirmed provider capabilities

### ElevenLabs

- A Twilio inbound-call personalization webhook can receive `caller_id`,
  `called_number`, `agent_id`, and `call_sid`; returned dynamic variables are
  persisted into the conversation. Multideck returns its own UUID and the Twilio
  CallSid here, which is the strongest correlation hand-off.
  [ElevenLabs: customise Twilio calls](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/customising-calls)
- The post-call webhook can include the conversation ID, transcript turns,
  analysis, initiation metadata, and time in call. It is signed with
  `ElevenLabs-Signature`; Multideck verifies the timestamped HMAC before storing
  the durable event.
  [ElevenLabs: post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks)
- A conversation can be `processing`, `done`, or `failed`. The UI therefore
  treats partial and pending transcripts as normal states.
  [ElevenLabs: get conversation](https://elevenlabs.io/docs/api-reference/conversations/get)
- On the SIP route, ElevenLabs maps the reserved `X-Call-ID` header to
  `system__call_sid`; a custom `X-Screening-ID` header can be exposed as
  `sip_screening_id`. Multideck accepts those names as well as the existing
  Twilio dynamic variable so correlation does not depend on an undocumented
  `sip_call_id` field.
  [ElevenLabs: SIP trunking](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking)
- ElevenLabs supports warm Twilio conference transfers, blind transfers, and SIP
  REFER transfer headers. This does not prove that Jenkar's 3CX deployment
  preserves or exposes those headers.
  [ElevenLabs: transfer to number](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/transfer-to-number)
- Retention is configurable; ElevenLabs documents a two-year default unless a
  different policy is set. Multideck uses its own explicit retention date and
  purge function rather than assuming provider retention matches Jenkar policy.
  [ElevenLabs: conversation retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention)
- Callers must be told they are interacting with AI. Recording/transcription
  wording also needs Jenkar's legal approval for each relevant jurisdiction.
  [ElevenLabs: disclosure requirement](https://elevenlabs.io/docs/eleven-agents/legal/disclosure-requirement)

### Twilio

- `CallSid` is a stable leg identifier. A generated leg may carry
  `ParentCallSid`; Multideck stores both and does not flatten them into one
  unproven ID.
  [Twilio: Call resource](https://www.twilio.com/docs/voice/api/call-resource)
- Twilio status callbacks can arrive more than once or out of order. Multideck's
  event ID includes CallSid, sequence number, and status, then applies an
  idempotent database constraint.
- Twilio `no-answer` is not the same as a confirmed decline. Multideck keeps
  `no_answer`, `busy`, and `declined` separate internally; the UI may group some
  into its missed-call decision view.
- Conference participant events can supply join/leave evidence when the transfer
  is implemented as a conference.
  [Twilio: Conference](https://www.twilio.com/docs/voice/twiml/conference)
- Recordings are separate resources and are not assumed to contain both the
  receptionist and employee leg until a live call proves the configured
  recording scope.
  [Twilio: Recording resource](https://www.twilio.com/docs/voice/api/recording)
- Webhook signatures are verified over the exact request URL and parameters.
  Reverse-proxy URL configuration must therefore match Twilio's public callback
  URL. [Twilio: webhook security](https://www.twilio.com/docs/usage/security)
- Sync Documents expose one JSON snapshot of at most 16 KiB, with a revision and
  `date_updated`, but no modification history. Multideck can poll those
  snapshots idempotently; it cannot recover an intermediate revision overwritten
  between polls. Complete transition capture still requires direct routing
  callbacks or an explicitly configured Sync webhook.
  [Twilio: Sync Document](https://www.twilio.com/docs/sync/api/document-resource)
- Live readback of Jenkar's Sync Service shows no webhook URL and
  `webhooks_from_rest_enabled=false`. The minute poller is authenticated and
  healthy, but the active conference function currently writes `completedAt`
  when a transfer is accepted and overwrites it when the caller later leaves.
  It preserves `outcome=accepted`, so the eventual snapshot can confirm the
  routing outcome, but it cannot prove the exact acceptance time or transcript
  splice boundary. Multideck keeps those timestamp fields missing instead of
  reusing the caller hang-up time.
  [Twilio: Sync webhooks](https://www.twilio.com/docs/sync/webhooks),
  [Twilio: Sync Service](https://www.twilio.com/docs/sync/api/service)

### 3CX

- 3CX can emit Call Detail Records by file or TCP. CDR fields can include call
  history IDs, start/answer/end times, route changes, transfers, final
  destination and call-chain evidence.
  [3CX: Call Data Records](https://www.3cx.com/docs/cdr-call-data-records/)
- In newer CDR output, `cdr_id` identifies a segment while `call_history_id`
  links a call chain; predecessor/successor and transfer/join/fork fields help
  reconstruct it. Multideck stores both without assuming one CDR equals one
  complete conversation.
  [3CX: CDR guide](https://www.3cx.com/docs/call-detail-record-guide/)
- The 3CX Call Control API is a live REST/WebSocket control API available only
  on supported V20 Enterprise systems with at least 8 simultaneous calls. It is
  not a transcript API.
  [3CX: Call Control API](https://www.3cx.com/docs/call-control-api/)
- 3CX AI transcription depends on AI Edition, recording, configured
  transcription and user access. It may be available in management/reporting
  rather than as a webhook payload.
  [3CX: AI transcription](https://www.3cx.com/docs/ai-transcription/)
- The live Jenkar V20 XAPI specification exposes a supported pull surface for
  call detail and transcript text. `ReportCallLogData/Pbx.GetCallLogData(...)`
  returns `CdrId`, `MainCallHistoryId`, `CallHistoryId`, `CallId`, `SegmentId`,
  `StartTime`, ringing/talking durations, answer/direction/status fields,
  source/destination fields, `SrcRecId`, `DstRecId`, `RecordingUrl`,
  `Transcription`, `Summary`, and `SentimentScore`. `Recordings` exposes `Id`,
  start/end and from/to fields, `IsTranscribed`, `Transcription`, `Summary`,
  `SentimentScore`, and `TranscriptionResult`. `CallHistoryView` exposes
  `SegmentId`, `SegmentStartTime`, `SegmentEndTime`, source/destination identity,
  participant and recording IDs, `CallAnswered`, and `CallTime`.
  [Installed Jenkar XAPI specification](https://jenkar.my3cx.co.uk/xapi/v1/swagger.yaml)
- `Transcription` is a nullable string in the installed API. The schema does
  not expose structured utterances, speaker labels, or word/utterance timing.
  `CallHistoryView` provides leg topology and segment boundaries, but those
  boundaries must not be assigned to portions of the opaque transcript without
  provider evidence. `GetCallLogData` also exposes no transcript-completion
  flag, while `Recordings.IsTranscribed` and `TranscriptionResult` live on a
  separate authenticated surface that the current collector does not fetch.
  Multideck therefore stores non-empty call-log transcription as readable
  **partial** evidence, not a complete employee transcript. 3CX documents stereo
  diarization and timings, so one existing recorded/transcribed call must be
  inspected to learn the actual returned string format and completion signal.
  [3CX: AI transcription](https://www.3cx.com/docs/ai-transcription/)

#### Live Jenkar 3CX audit — 23 August 2026

- Confirmed in the authenticated Jenkar admin: `jenkar.my3cx.co.uk` is hosted by
  3CX, on V20 Update 9 Build 995, AI Edition, 16 simultaneous calls, with Multi
  Company enabled and a licence expiry of 16 June 2027. This meets the
  documented 8SC AI threshold for XAPI and 16SC threshold for Data Connector; it
  does not by itself grant an API credential or transcript export.
- CDR is currently disabled. The configured log type is a disabled single file;
  no file/socket transport or field order is configured. Data Connector is also
  unconfigured (`Select Database: None`), so there is no live 3CX feed into
  Multideck.
- OpenAI transcription is configured globally with `GPT4o Transcribe`, analysis
  model `gpt-5.4` and English UK. The Jenkar department is set to
  `No Transcription`; the Databrain Solutions department is `Recordings only`. A
  phone transcript therefore exists only when the actual employee leg is
  recorded under the relevant user and route policy; that per-user recording
  state remains unverified.
- The Jenkar department contains a `multideck` service principal with System
  Owner role, but its one-time client secret is unavailable in this checkout or
  the selected Supabase. The authenticated Harry Phillips account is a System
  Administrator: its Integrations navigation omits API, and the installed API
  route redirects it to the 3CX error screen. A System Owner or partner session
  is therefore required to create the approved replacement read principal. The
  live 24-user roster contains no visible human System Owner account; Harry is
  the only user with an administrative role label and is explicitly System
  Administrator. The remaining authority must therefore come from the PBX
  owner/3CX partner rather than another ordinary Jenkar user.
  The live `$metadata` and Swagger documents are readable, while `Defs`,
  `Recordings`, and `CallHistoryView` return a Bearer challenge. This proves the
  installed pull surfaces exist, not that this principal is authorised.
- Official CDR has no transcript field and no transfer-accepted timestamp.
  `join` and transfer fields are topology evidence only. Multideck therefore
  keeps Twilio's immutable `transferAcceptedAt` as the acceptance source and
  accepts 3CX transcript segments only when a separate connector genuinely
  supplies them.
- Smallest approved next step: use a System Owner or partner session to create
  `multideck-call-read` in the Jenkar department with Supervisor role and XAPI
  only, leaving the existing System Owner principal untouched. Then make
  read-only token, `Defs`, and one-record `GetCallLogData` probes before storing
  its client ID, secret and a reviewed Jenkar-only filter server-side. Supervisor
  access to that report endpoint remains an inference until the live probe; a
  `403` must stop the connection rather than trigger silent role escalation.
  XAPI is preferred because the installed schema joins call detail with opaque
  transcript text. Standard CDR is metadata-only, while the official Data
  Connector guide does not promise transcript export.

## Ingestion and correlation

Every provider request is verified before processing, written to
`Comm_CallIngestionEvents`, and deduplicated by tenant, provider, and external
event ID. A retry with the same external event ID must retain the original
payload hash; conflicting content is rejected rather than silently acknowledged
as the earlier delivery. Processing is retryable without duplicating calls or
transcript segments.

The tenant-portable Twilio poller reads every bounded Sync API page, validates
provider-owned pagination URLs before forwarding credentials, retries
network/408/429/5xx responses, and normalises only documents with a valid Jenkar
screening UUID. A service-only cursor is keyed by company, provider and Sync
Service SID. One worker holds a bounded lease; the checkpoint advances only
after every emitted caller, receptionist and staff event has completed the
ordinary Jenkar ingestion path. Partial snapshots retain provenance and block
checkpoint advancement rather than fabricating missing legs.

The ElevenLabs recovery worker now uses the official list endpoint with the
exact live Jenkar agent ID, a frozen time window, five-minute overlap and cursor
pagination. It combines discovered IDs with provider legs already in `pending`,
`processing`, or `partial` state, retains delayed or retryable IDs in a bounded
checkpoint queue, then calls the official full-conversation endpoint. Each
result is persisted or safely queued before the provider cursor advances. It
never searches the whole ElevenLabs workspace or claims the full-conversation
API includes the 3CX/employee portion. Signed post-call webhooks remain the
primary source; agent-scoped discovery and reconciliation are the
missed-delivery and delayed-processing recovery path.

Correlation precedence is:

1. Multideck call UUID returned during ElevenLabs personalization.
2. ElevenLabs conversation ID, Twilio CallSid, or Twilio ParentCallSid.
3. Exact 3CX `call_history_id` or `cdr_id` already observed.
4. One and only one same-phone and employee-extension candidate within two
   minutes of the transfer. A phone-only or wider time-window match is never
   attached automatically.
5. Otherwise create a separate, review-state call. Never silently merge an
   ambiguous 3CX record.

Each provider leg retains its own stable IDs and evidence. Later partial
snapshots cannot erase stronger timestamps, transcript completion or recording
references already stored. Transcript segments retain their provider, source
leg, provider segment ID, sequence, absolute timestamp, offset, speaker and raw
event. The readable transcript sorts these segments chronologically and inserts
a transfer boundary only when a separately evidenced transfer timestamp exists.
A staff screening answer is not treated as transfer acceptance. If one provider
portion is missing or processing, the completed portion remains visible and
immutable.

Every privileged CRM-link write shares a database invariant: a call cannot hold
both a contact and a lead, a contact or lead derives its authoritative company
link, and mismatched or inaccessible company combinations are rejected. This
also covers a reviewed generated `link_lead` action rather than relying on the
UI to send a consistent combination.

## Metrics boundary

Provider-confirmed 3CX outcome and timing metrics derive from the actual
preferred 3CX provider leg fields, never from a call-level rollup merely because
a 3CX leg exists. Unknown 3CX outcomes stay outside the answered-rate
denominator. Transfer acceptance derives only from explicit Twilio screening
timestamps (`transferRequestedAt` and `transferAcceptedAt`) and is labelled
`Twilio confirmed`. Multideck-derived metrics include calculated answer and
handling time, authoritative linked To Do completion, identity coverage, reason
grouping and trends. The UI labels these evidence classes separately.
AI-assisted analysis runs only when an operator chooses a focused question; the
Overview hands the live date range to the real Dexter workspace in approval mode
and asks Dexter to cite the call records behind important claims. No LLM runs
while the Overview is idle.

3CX can distinguish outcomes such as no answer, busy, declined and voicemail
only when the installed version/export supplies those fields. Missing fields
remain `unknown`; they are not inferred from silence.

## Privacy and operations

- Raw provider events, provider legs, transcript segments, matching candidates
  and access events are service-role only. Browser access goes through the
  authenticated Edge Function and CRM permissions.
- `CRM.PhoneCalls.Read` controls access. `CRM.PhoneCalls.Review` controls
  matching, note edits and generated-action approval.
- Calls store AI-disclosure, recording-consent and transcription-consent as
  separate evidence-backed states, plus disclosure version/time, recording state
  and retention date. Missing evidence remains `unknown`; provider silence is
  never converted into consent. The retention purge removes transcript text,
  segments, AI summaries and recording pointers while preserving a minimal
  call/audit record.
- Suggested actions are inert until reviewed. Approving a task creates the real
  linked Multideck To Do item through the existing permission boundary; editing
  is allowed before approval. Dismissal is audited.
- Transcript and identity access is auditable. Export is intentionally not
  implemented in this slice.
- Event retries use the durable inbox.
  `POST /functions/v1/phone-calls/maintenance/retry` leases retryable verified
  3CX, Twilio and ElevenLabs deliveries, replays their stored bounded payload
  through the ordinary processor, backs off failures and dead-letters after the
  attempt limit. It never fabricates a provider signature. Unique provider IDs
  and provider-segment IDs prevent duplicates. Terminal signature failures are
  not processed.
- `POST /functions/v1/phone-calls/maintenance/retention` redacts expired
  provider/transcript/AI content and deletes recording objects before clearing
  their pointers. Failed Storage deletion remains `purge_pending` for a later
  authenticated worker retry.
- Every raw ingestion event receives the same validated tenant retention
  deadline at ingress, including an event that fails before it can be correlated
  to a call. Daily retention redacts orphan raw bodies and retry diagnostics
  while preserving the stable event ID and hash needed for duplicate prevention
  and audit.

Required tenant secrets/configuration:

- `PHONE_CALLS_COMPANY_ID`
- `PHONE_CALLS_RETENTION_DAYS` (required integer from 1 to 3650; ingestion fails
  closed if absent or invalid)
- `ELEVENLABS_PERSONALIZATION_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`
- `ELEVENLABS_API_KEY` with Conversations read access for reconciliation
- `ELEVENLABS_AGENT_ID` set to the exact published Jenkar receptionist agent
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SYNC_SERVICE_SID`
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET` (preferred for Sync polling),
  or `TWILIO_ACCOUNT_SID` with `TWILIO_AUTH_TOKEN`
- `PHONE_CALLS_WORKER_SECRET`

Current live configuration:

- All fifteen Phone Calls migrations, through
  `20260823144119_phone_call_confirmed_crm_links.sql` and
  `20260823144126_phone_call_3cx_xapi_schedule.sql` and
  `20260823160931_phone_call_confirmed_match_state_invariant.sql` and
  `20260823172644_phone_call_transcript_segment_upsert_index.sql`, plus
  `phone-calls` v34, are active. The transcript source-segment uniqueness index
  is now inferable by PostgREST's conflict target, so idempotent post-call
  transcript replay no longer fails with `42P10`. The database enforces one identity type per
  call, rejects canonical CRM links unless their match state and review method
  are explicitly confirmed, and rejects
  an organisation link that conflicts with, or is inaccessible through, the
  selected contact or lead. A reviewer may edit a lead-link suggestion only to
  another visible candidate; the selected lead is revalidated, applied through
  the same CRM boundary and audited with the original and reviewed IDs. Reusing
  a provider event ID with different content is rejected with `409` rather than
  being silently treated as the earlier delivery.
- `PHONE_CALLS_COMPANY_ID`, a rotated `PHONE_CALLS_WORKER_SECRET`, provisional
  `PHONE_CALLS_RETENTION_DAYS=90`, the ElevenLabs personalization, webhook,
  Conversations-read and exact-agent credentials, and the existing Jenkar
  screening Twilio API-key pair plus Sync Service SID are configured in the
  Development Supabase project only. Secret values are never exposed to the
  client.
- The published `Jenkar Shipping Receptionist` Main branch uses
  `https://aqtwypsuijxlnvtxpuxe.supabase.co/functions/v1/phone-calls/webhooks/elevenlabs/personalization`
  before calls and the corresponding `/webhooks/elevenlabs/post-call` endpoint
  for agent-scoped transcript delivery. Transcript delivery is enabled; audio,
  initiation-failure and OTLP delivery are disabled.
- The same live Main branch is at 100% traffic on version
  `agtvrsn_2901m0pwwp99ewgtxbj0b0567nz6`. Its caller-context instruction and the
  three post-call data fields were saved and read back from ElevenLabs. The
  first message, Harriot voice, phone binding, screening tool, transfer routing
  and webhooks were not changed. This is provider-configuration proof, not yet
  live-call behavioural proof.
- The agent-level post-call override is HMAC-signed and sends Transcript events
  to Multideck. The workspace post-call default still points to Zapier, but this
  agent override is the effective configuration for the published receptionist.
  Initiation fetch currently inherits the workspace-level Multideck default. The
  agent is Public with authentication disabled and no host allowlist; that
  web-access posture must be reviewed independently of its assigned SIP phone
  route.
- Live ElevenLabs privacy settings currently store call audio and retain
  conversations without an expiry. That does not match Multideck's provisional
  90-day retention. Multideck will purge its own copy on schedule, but Jenkar
  must approve the provider-side audio and retention change before it is altered
  because shortening retention can remove provider evidence.
- Durable event retry and Twilio Sync recovery run every minute, ElevenLabs
  reconciliation runs every two minutes, and retention runs daily at 02:17 UTC
  through Vault-backed, service-only jobs. The scheduled ElevenLabs, Twilio and
  retry workers are succeeding; three previously retryable, signature-verified
  ElevenLabs events were replayed without duplication and now resolve to
  complete ingestion events. An authenticated live retention run also returned `200`
  with zero expired calls, raw events or recordings, proving the maintenance
  route and Vault-backed authorization before its first daily schedule.
- The Twilio worker reads Sync Service `IS290372ddb1dc20e726e2dba58681819c` with
  the existing restricted `jenkar-screening` API key. A live provider read and
  the scheduled Edge Function run both succeeded. Screening Documents retain
  their current-state snapshot for four hours, while the worker polls every
  minute. The earlier `70004` applied only to creating an additional key; no
  orphan key was created.
- Multideck v34 exposes a signed, Service-scoped `/webhooks/twilio/sync`
  receiver for official `document_created` and `document_updated` events. It
  uses `DocumentSid` plus `DocumentRevision` as the stable delivery boundary,
  reuses ordinary durable ingestion and labels receipt-time fallbacks rather
  than presenting them as provider time. Unsigned requests fail closed with
  `401`, including while signing configuration is incomplete. The route code is
  deployed, but direct delivery is not operational: `TWILIO_AUTH_TOKEN` is not
  stored in this Supabase project, the Twilio Sync Service webhook is not yet
  pointed at it and `webhooks_from_rest_enabled` has not been enabled. The
  existing API-key-authenticated polling worker remains the live recovery and
  current-state path.

- Deployed and source-tested, but not live-3CX-authenticated: the server-side
  3CX XAPI recovery worker uses `POST /sync/3cx-xapi`. It obtains a
  client-credentials token from `/connect/token`, leases the tenant's `3cx`
  provider cursor, rereads a five-minute overlap, and commits the checkpoint
  only after every bounded call-log item has passed through the stable-`CdrId`
  ingestion path. The installed Swagger advertises `$top`/`$skip` plus an
  optional count, not `@odata.nextLink`; a same-origin next link is tolerated
  if a runtime returns one, but cross-origin pagination is rejected.
  `Transcription` stays one untimed, partial Handler source-boundary block
  because the installed call-log schema identifies neither utterance speakers
  nor a transcript-completion signal. That opaque block can inform the readable
  summary, but cannot create caller-request actions.
- The XAPI route also requires an explicit `THREE_CX_CALL_LOG_FILTERS_JSON`
  policy. The commonly used all-zero/empty-string filter form and `hidePcalls`
  meaning were not documented by the installed Swagger or verified with a live
  token, so Multideck does not silently choose them. Missing credentials or
  scope returns an honest `not_connected` response. The tenant cron marker
  `multideck_phone_calls_3cx_xapi_sync_enabled` remains absent/false until the
  principal and filter policy are approved.
- The live Twilio Function does not yet directly fan out every
  screening/conference transition to Multideck, and no 3CX CDR collector is
  running. Its accepted-transfer handler writes a mutable `completedAt` value
  that is later overwritten when the caller leaves; it does not preserve
  distinct immutable `transferAcceptedAt`, `screeningCompletedAt` and
  `callCompletedAt` timestamps. Until either the signed Sync webhook is enabled
  or the routing Function fans out immutable transitions, polling can recover
  the current and terminal state but cannot reconstruct an intermediate Document
  revision overwritten between polls.

### Tenant boundary

`eofqgeffjbbjgadkzkrk` (`Multideck-jenkar`) is the existing Multideck.Live
customer-portal backend. Its schema contains portal membership/customer-access
data, not Multideck App operational CRM tables, and it was not changed. The
provider connection to Development is an explicit temporary target override, not
approval of that project as Jenkar's production App tenant. A dedicated Jenkar
Multideck App project remains the required production boundary before production
rollout.

The push-style 3CX collector can call
`POST /functions/v1/phone-calls/sync/3cx` with
`x-multideck-worker-secret`. The credential-gated XAPI recovery collector uses
`POST /functions/v1/phone-calls/sync/3cx-xapi` with the same worker header and
requires `THREE_CX_BASE_URL`, `THREE_CX_CLIENT_ID`,
`THREE_CX_CLIENT_SECRET`, and the reviewed
`THREE_CX_CALL_LOG_FILTERS_JSON` scope. Neither path invents a webhook,
utterance speaker, per-turn timestamp, or transfer-accepted time that 3CX did
not provide.

The Twilio collector is invoked through
`POST /functions/v1/phone-calls/sync/twilio` with the same worker header. The
ElevenLabs recovery collector uses
`POST /functions/v1/phone-calls/sync/elevenlabs`; durable inbox retry uses
`POST /functions/v1/phone-calls/maintenance/retry`. Tenant-local scheduling is
Vault-backed, idempotent and gated independently for each provider so an
unavailable credential cannot create a failing poll loop. Polling is a
recovery/current-state path; direct signed delivery remains necessary when
complete transition capture is required.

## Live verification still required

Before enabling production reporting or recordings, verify:

- The existing 3CX `multideck` service principal's one-time secret and scopes,
  then read-only `Defs`, `GetCallLogData`, `Recordings`, and `CallHistoryView`
  access. Regenerating the secret needs separate authority because it can
  invalidate an existing consumer.
- The actual user/route recording policy for the screened employee leg and
  one existing transcript response. The installed API exposes opaque nullable
  transcript text but no structured speaker/timing fields; Jenkar department
  transcription is currently off and the relevant per-user recording and
  stereo settings remain unverified.
- The caller actually supplies the intended context naturally and the three
  published ElevenLabs fields arrive in the signed post-call payload.
- Twilio's child `ParentCallSid`, status sequence and conference callbacks for
  the actual transfer route.
- Whether the recording contains the intended legs and whether any SIP headers
  survive the 3CX hand-off.
- One real outside-origin call through receptionist, accepted employee transfer,
  both transcript portions, safe CRM review and approved To Do creation.
- Jenkar-approved AI, recording and transcription disclosures; retention
  duration; user roles; subject-access/export and deletion handling.
- Jenkar-approved ElevenLabs provider retention and call-audio policy, plus
  whether the agent's unauthenticated public web access should remain enabled or
  be restricted without affecting the SIP route.

Do not describe the complete provider-to-CRM journey as live-verified until a
new outside-origin call appears in Multideck without a manual replay. The signed
ElevenLabs webhook and automatic ElevenLabs/Twilio recovery workers are
configured, but one real call must still prove webhook ingestion, Sync
correlation, the readable transcript, transfer outcome and review workflow. A
successful schema migration or a zero-item 200 worker response is not that
proof.
