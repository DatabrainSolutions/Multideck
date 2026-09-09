# Provider transcript and transfer boundaries

This is the evidence contract for composing one readable Jenkar call timeline.
It separates fields a provider actually supplies from Multideck correlation and
derived boundaries.

## ElevenLabs receptionist portion

Confirmed provider surface:

- The signed `post_call_transcription` webhook contains full ElevenLabs
  conversation data after analysis, including `conversation_id`, `status`,
  `transcript`, `metadata`, and `analysis`.
- The authenticated full-conversation GET operation exposes the same core
  conversation fields for repair and backfill.
- Transcript turns include roles such as `agent` and `user`, plus
  `time_in_call_secs`. `metadata.start_time_unix_secs` can anchor those relative
  offsets to an absolute chronology when present.

Sources:
[Post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks),
[Get conversation details](https://elevenlabs.io/docs/api-reference/conversations/get/).

For the Jenkar SIP/conference design this proves the ElevenLabs receptionist
conversation only. It does not prove that ElevenLabs captured the employee/3CX
audio after its participant left or that it supplies the transfer acceptance
timestamp.

## Twilio/Jenkar screening state

Confirmed provider surface:

- Twilio Sync Documents expose current JSON state, `revision`, and created,
  updated, and expiry timestamps.
- Document modification history is not retained.
- Sync contains no phone-call transcript by itself.

Source:
[Twilio Sync Document resource](https://www.twilio.com/docs/sync/api/document-resource).

The Jenkar routing state adds custom fields including `screeningStartedAt`,
`answeredAt`, `completedAt`, `status`, and `outcome`. They are not native Twilio
CDR semantics. Multideck also accepts immutable custom
`screeningCompletedAt`, `transferAcceptedAt`, and `callCompletedAt` fields and
prefers them when present. The live routing function does not yet populate those
immutable fields. An intermediate snapshot whose current state is explicitly
`status=accepted` and `outcome=accepted` can attribute its legacy `completedAt`
to that accepted transition with derived provenance. That timestamp is never
carried forward or reconstructed after `caller_disconnected` overwrites it. The
live Sync Service currently has no webhook URL and REST-triggered webhooks are
disabled, so the minute poller is not guaranteed to observe the intermediate
accepted revision. A final snapshot may retain the explicit accepted outcome,
but its exact acceptance time and transcript boundary remain unavailable.

Sources:
[Twilio Sync webhooks](https://www.twilio.com/docs/sync/webhooks),
[Twilio Sync Service](https://www.twilio.com/docs/sync/api/service).

`answeredAt` proves the employee screening leg was answered. It is not, by
itself, proof that the employee accepted the customer transfer.

## 3CX employee portion

The live Jenkar V20 XAPI metadata and Swagger documents are publicly readable
and confirm three authenticated pull surfaces:

- `ReportCallLogData/Pbx.GetCallLogData(...)` supplies `CdrId`,
  `MainCallHistoryId`, `CallHistoryId`, `CallId`, `SegmentId`, `StartTime`,
  ringing/talking durations, answer/direction/status fields,
  source/destination fields, `SrcRecId`, `DstRecId`, `RecordingUrl`,
  `Transcription`, `Summary`, and `SentimentScore`.
- `Recordings` supplies `Id`, recording start/end and from/to fields,
  `IsTranscribed`, `Transcription`, `Summary`, `SentimentScore`, and
  `TranscriptionResult`.
- `CallHistoryView` supplies `SegmentId`, `SegmentStartTime`, `SegmentEndTime`,
  source/destination identity, participant and recording IDs, `CallAnswered`,
  and `CallTime`.

See the
[installed Jenkar XAPI specification](https://jenkar.my3cx.co.uk/xapi/v1/swagger.yaml)
and the
[3CX Configuration API guide](https://www.3cx.com/docs/configuration-rest-api/).
These data endpoints require a Bearer token. The existing `multideck` service
principal's one-time secret is not available in the checkout or selected
Supabase, so schema availability is confirmed but authenticated record access is
not.

`Transcription` is a nullable opaque string. The installed schema does not
define structured utterances, speaker labels, or word/utterance timing.
`CallHistoryView` provides call-leg topology and segment boundaries, but those
boundaries must not be attached to portions of the transcript without separate
provider evidence. `GetCallLogData` supplies no completion flag;
`Recordings.IsTranscribed` and `TranscriptionResult` are separate fields on a
surface the current collector does not fetch. Consequently, a non-empty opaque
call-log transcription is stored as readable partial evidence. Although 3CX
documents stereo diarization and timings, the actual returned format and a
completion signal must be verified from one existing recorded/transcribed call
before Multideck marks it complete or creates speaker-labelled turns.

XAPI polling is therefore the preferred source for combined call detail and
transcript text. Use `CdrId` as the stable provider record ID and retain
`MainCallHistoryId`, `CallHistoryId`, `CallId`, `SegmentId`, `SrcRecId`, and
`DstRecId` for correlation and provenance. Use bounded overlapping windows and
ordinary idempotent ingestion. Do not infer transfer acceptance from 3CX answer
or segment times; Twilio's immutable transfer-acceptance timestamp remains the
authoritative boundary.

The official 3CX CDR service can output call records by file or TCP and lets an
administrator select fields. Its documented fields include `historyid`,
`callid`, `duration`, `time-start`, `time-answered`, `time-end`,
`reason-terminated`, source/destination numbers, and names. 3CX states that
`historyid` and `callid` can be used to retrieve the records belonging to a
call. See
[3CX CDR documentation](https://www.3cx.com/docs/cdr-call-data-records/).

The legacy adapter recognises only the exact documented mappings that are
semantically safe: `callid` as the provider record ID, `historyid` as the call
history/correlation ID, `from-no` and `to-no` as the source and destination
numbers, `time-start`, `time-answered`, and `time-end` as provider timestamps,
and `reason-terminated` as termination evidence. Because the administrator can
select and reorder CDR output fields, a file/TCP connector must apply the exact
configured field order before sending a JSON record to Multideck; the receiver
does not guess a positional CSV schema.

Fields such as `reason-changed`, `final-number`, `final-dn`, and `chain` remain
available in raw provider evidence, but do not independently set direction,
transfer acceptance, or transcript boundaries. `time-answered` proves the record
was answered; it does not prove an attended transfer was accepted.

That CDR reference does not define transcript segments or claim that a standard
CDR contains transcription. The official Data Connector guide also does not
promise transcript export. Therefore:

- CDR timing/outcome fields may be marked provider-confirmed.
- `creation_method = transfer` supports a requested/transfer classification; it
  does not alone prove acceptance.
- Opaque `GetCallLogData.Transcription` text remains partial. Employee transcript
  state is complete only when the connector supplies a provider completion
  signal and the full expected text/segments, or an independently verified 3CX
  transcription surface does so.
- License, version, recording, transcription, retention, and API/export access
  remain deployment dependencies until verified on the actual Jenkar 3CX system.

## Chronological composition

Store every segment with provider, provider leg, provider segment ID, source
sequence, relative offset, absolute timestamp when available, and raw ingestion
event provenance. Present one conversation using this precedence:

1. Provider-supplied absolute segment timestamp.
2. Provider call start plus provider-supplied relative turn offset.
3. Separately evidenced transfer boundary for source transition placement.
4. Provider source sequence as a deterministic fallback within one source.

Never compare relative offsets from two different provider clocks without an
absolute anchor. When the employee portion has no absolute segment times, show
an explicit source boundary and preserve its internal order rather than weaving
it between ElevenLabs turns speculatively.

Recommended readable boundary label:

```text
Transfer accepted · conversation continued with Jenkar team
```

Only show that label when acceptance evidence exists. Otherwise use a neutral
partial-state boundary such as:

```text
Receptionist portion ended · employee transcript unavailable
```

## Duplicate and correction rules

- Correlate the call across providers with the Jenkar screening UUID first, then
  exact Twilio Call/Conference IDs, then 3CX history/call IDs and the narrow
  reviewed phone/extension/time fallback.
- De-duplicate provider delivery events by their stable external event ID.
- De-duplicate transcript turns by provider leg plus provider segment ID.
- Do not ingest `processing` ElevenLabs GET responses through a complete
  transcript path. Reconcile again until `done`, `failed`, or retention policy
  ends retries.
- Provider corrections that reuse a segment ID update the existing bounded turn
  because transcript upserts use `ignoreDuplicates: false`. The stable provider
  leg and segment ID remain the identity; a later correction does not create a
  duplicate turn.

## Current source limitations

- A Sync poll can recover current state but not overwritten revisions. The
  bounded replay overlap prevents timestamp-bucket cursor loss, not missing
  provider history.
- A final accepted Sync snapshot may no longer retain the acceptance timestamp
  until the live routing function writes `transferAcceptedAt` immutably or fans
  out the material transition directly.
- ElevenLabs reconciliation discovers conversations only for the exact
  configured agent in a bounded, overlapped time window and also repairs known
  pending IDs. Signed post-call delivery remains the primary path.
- Jenkar's installed XAPI transcript field is confirmed, but live transcript
  generation and response formatting are not. Jenkar department transcription
  is off, relevant per-user recording/Stereo Mode are unverified, and the
  existing service-principal secret is unavailable.
- The ingestion route consumes `transfer_accepted_at` explicitly and never uses
  employee screening answer time as acceptance.
