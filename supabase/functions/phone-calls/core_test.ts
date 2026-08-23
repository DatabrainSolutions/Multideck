import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  candidateIsSafe,
  deriveCombinedTranscriptInsights,
  normalize3cxRecord,
  normalizeCapturedAnalysisValue,
  normalizeJenkarScreeningOutcome,
  normalizePhone,
  parse3cxTranscript,
  parseElevenLabsTranscript,
  readBoundedBody,
  resolveTranscriptRollup,
  verifyElevenLabsSignature,
} from "./core.ts";

Deno.test("keeps missing transcript-extraction placeholders out of CRM identity", () => {
  for (
    const placeholder of [
      null,
      "null",
      "None",
      "N/A",
      "not applicable",
      "not provided",
      "unknown",
    ]
  ) {
    assertEquals(normalizeCapturedAnalysisValue(placeholder), "");
  }
  assertEquals(
    normalizeCapturedAnalysisValue("  Acme Logistics  "),
    "Acme Logistics",
  );
});

Deno.test("enforces a route-specific request-body limit before parsing", async () => {
  await assertRejects(
    () =>
      readBoundedBody(
        new Request("https://example.test/webhook", {
          method: "POST",
          body: "12345",
        }),
        4,
      ),
    Error,
    "Webhook body is too large.",
  );
});

Deno.test("normalizes phone numbers without inventing a country", () => {
  assertEquals(normalizePhone("+44 (0) 20 7946 0018"), "+442079460018");
  assertEquals(normalizePhone("0044 20 7946 0018"), "+442079460018");
  assertEquals(normalizePhone(" 0207 946 0018 "), "02079460018");
});

Deno.test("keeps Jenkar transfer state separate from the CRM call outcome", () => {
  assertEquals(normalizeJenkarScreeningOutcome("accepted", "employee"), {
    callOutcome: "answered",
    transferStatus: "accepted",
  });
  assertEquals(normalizeJenkarScreeningOutcome("declined", "employee"), {
    callOutcome: "declined",
    transferStatus: "declined",
  });
  assertEquals(normalizeJenkarScreeningOutcome("no-answer", "employee"), {
    callOutcome: "no_answer",
    transferStatus: "declined",
  });
});

Deno.test("normalizes confirmed 3CX outcomes separately from transcript availability", () => {
  const normalized = normalize3cxRecord({
    cdr_id: "cdr-41",
    call_history_id: "history-8",
    direction: "Inbound",
    source_number: "+441234567890",
    destination_number: "101",
    time_start: "2026-08-22T08:00:00Z",
    time_end: "2026-08-22T08:00:21Z",
    reason_terminated: "Declined",
    transcript_status: "not_licensed",
  });
  assertEquals(normalized.outcome, "declined");
  assertEquals(normalized.transcriptState, "unavailable_not_licensed");
  assertEquals(normalized.callHistoryId, "history-8");
});

Deno.test("normalizes the official 3CX V20 CDR field names", () => {
  const normalized = normalize3cxRecord({
    cdr_id: "cdr-v20-41",
    call_history_id: "history-v20-8",
    main_call_history_id: "history-v20-main",
    creation_method: "transfer",
    source_participant_is_incoming: true,
    source_participant_phone_number: "+447700900111",
    destination_dn_number: "601",
    cdr_started_at: "2026-08-22T08:00:00Z",
    cdr_answered_at: "2026-08-22T08:00:05Z",
    cdr_ended_at: "2026-08-22T08:00:21Z",
    termination_reason: "Call completed",
  });
  assertEquals(normalized.cdrId, "cdr-v20-41");
  assertEquals(normalized.callHistoryId, "history-v20-8");
  assertEquals(normalized.parentCallId, "history-v20-main");
  assertEquals(normalized.direction, "inbound");
  assertEquals(normalized.fromNumber, "+447700900111");
  assertEquals(normalized.toNumber, "601");
  assertEquals(normalized.outcome, "answered");
  assertEquals(normalized.transferStatus, "requested");
  assertEquals(normalized.transferAcceptedAt, null);
});

Deno.test("normalizes the exact official legacy 3CX CDR field names", () => {
  const normalized = normalize3cxRecord({
    historyid: "legacy-history-8",
    callid: "legacy-call-41",
    "from-no": "+44 (0) 7700 900111",
    "to-no": "601",
    "time-start": "2026-08-22T08:00:00Z",
    "time-answered": "2026-08-22T08:00:05Z",
    "time-end": "2026-08-22T08:00:21Z",
    "reason-terminated": "TerminatedByDst",
  });
  assertEquals(normalized.cdrId, "legacy-call-41");
  assertEquals(normalized.callHistoryId, "legacy-history-8");
  assertEquals(normalized.fromNumber, "+447700900111");
  assertEquals(normalized.toNumber, "601");
  assertEquals(normalized.startedAt, "2026-08-22T08:00:00.000Z");
  assertEquals(normalized.answeredAt, "2026-08-22T08:00:05.000Z");
  assertEquals(normalized.endedAt, "2026-08-22T08:00:21.000Z");
  assertEquals(normalized.outcome, "answered");
  assertEquals(normalized.transferStatus, "not_requested");
  assertEquals(normalized.transferAcceptedAt, null);
});

Deno.test("keeps ambiguous legacy 3CX topology fields as raw evidence", () => {
  const record = {
    historyid: "legacy-history-unknown",
    callid: "legacy-call-unknown",
    "time-start": "2026-08-22T08:00:00Z",
    "time-end": "2026-08-22T08:00:21Z",
    "reason-terminated": "TerminatedBySrc",
    "reason-changed": "ReplacedDst",
    "final-number": "601",
    chain: "100;601",
  };
  const normalized = normalize3cxRecord(record);
  assertEquals(normalized.outcome, "unknown");
  assertEquals(normalized.transferStatus, "not_requested");
  assertEquals(normalized.transferAcceptedAt, null);
  assertEquals(normalized.raw, record);
});

Deno.test("does not claim a partial or failed 3CX transcript is complete", () => {
  for (const transcriptStatus of ["partial", "processing", "failed"]) {
    const record = {
      cdr_id: `cdr-${transcriptStatus}`,
      transcript_status: transcriptStatus,
      transcript: [{
        id: "turn-1",
        speaker: "Alex",
        text: "Please call me back.",
      }],
    };
    const normalized = normalize3cxRecord(record);
    const segments = parse3cxTranscript(record, "2026-08-22T08:00:00Z");

    assertEquals(normalized.transcriptState, "partial");
    assertEquals(segments[0].state, "processing");
    assertEquals(segments[0].metadata.transcriptStatus, transcriptStatus);
  }
});

Deno.test("keeps opaque 3CX transcript timing honest", () => {
  const [segment] = parse3cxTranscript({
    cdr_id: "cdr-opaque",
    transcript: [{
      id: "opaque-transcript",
      speaker: "Unknown speaker",
      speaker_type: "external",
      text: "I will send the updated quote tomorrow.",
    }],
  }, "2026-08-22T08:00:00Z");
  assertEquals(segment.startedAt, null);
  assertEquals(segment.startSeconds, null);
  assertEquals(segment.metadata.timingProvenance, "source_sequence_only");
});

Deno.test("uses only explicit 3CX transfer acceptance evidence", () => {
  const joined = normalize3cxRecord({
    cdr_id: "cdr-joined",
    action_type: "join",
    cdr_answered_at: "2026-08-22T08:00:05Z",
  });
  assertEquals(joined.transferStatus, "requested");
  assertEquals(joined.transferAcceptedAt, null);

  const acceptedWithoutBoundary = normalize3cxRecord({
    cdr_id: "cdr-accepted",
    transfer_status: "accepted",
    cdr_answered_at: "2026-08-22T08:00:05Z",
  });
  assertEquals(acceptedWithoutBoundary.transferStatus, "accepted");
  assertEquals(acceptedWithoutBoundary.transferAcceptedAt, null);

  const acceptedWithBoundary = normalize3cxRecord({
    cdr_id: "cdr-accepted-boundary",
    transfer_status: "accepted",
    transfer_accepted_at: "2026-08-22T08:00:11Z",
  });
  assertEquals(acceptedWithBoundary.transferStatus, "accepted");
  assertEquals(
    acceptedWithBoundary.transferAcceptedAt,
    "2026-08-22T08:00:11.000Z",
  );
});

Deno.test("maps ElevenLabs roles and preserves absolute chronology", () => {
  const segments = parseElevenLabsTranscript({
    data: {
      transcript: [
        {
          role: "agent",
          message: "Good morning, Jenkar.",
          time_in_call_secs: 2,
        },
        {
          role: "user",
          message: "Alex from Alpine about a revised quote.",
          time_in_call_secs: 6,
        },
      ],
    },
  }, "2026-08-22T08:00:00.000Z");
  assertEquals(segments.length, 2);
  assertEquals(segments[0].speakerType, "receptionist");
  assertEquals(segments[1].speakerType, "caller");
  assertEquals(segments[1].startedAt, "2026-08-22T08:00:06.000Z");
});

Deno.test("correlation only accepts one close candidate", () => {
  assertEquals(
    candidateIsSafe([{ callId: "a", differenceSeconds: 90 }])?.callId,
    "a",
  );
  assertEquals(
    candidateIsSafe([{ callId: "a", differenceSeconds: 90 }, {
      callId: "b",
      differenceSeconds: 110,
    }]),
    null,
  );
  assertEquals(
    candidateIsSafe([{ callId: "a", differenceSeconds: 700 }]),
    null,
  );
  assertEquals(
    candidateIsSafe([{ callId: "a", differenceSeconds: 180 }]),
    null,
  );
});

Deno.test("transcript roll-up stays partial until every expected provider portion arrives", () => {
  const legs = [
    { legType: "receptionist", transcriptStatus: "complete" },
    { legType: "employee", transcriptStatus: "pending" },
  ];
  assertEquals(
    resolveTranscriptRollup(legs, [{
      provider: "elevenlabs",
      state: "complete",
    }]),
    "partial",
  );
  assertEquals(
    resolveTranscriptRollup(legs, [{
      provider: "elevenlabs",
      state: "complete",
    }, {
      provider: "3cx",
      state: "complete",
    }]),
    "complete",
  );
});

Deno.test("transcript roll-up distinguishes pending, failed and unavailable", () => {
  assertEquals(
    resolveTranscriptRollup([
      { legType: "receptionist", transcriptStatus: "pending" },
    ], []),
    "pending",
  );
  assertEquals(
    resolveTranscriptRollup([
      { legType: "employee", transcriptStatus: "failed" },
    ], []),
    "failed",
  );
  assertEquals(
    resolveTranscriptRollup([
      { legType: "employee", transcriptStatus: "unavailable_not_licensed" },
    ], []),
    "unavailable",
  );
});

Deno.test("derives one honest summary from both chronological transcript portions", () => {
  const insights = deriveCombinedTranscriptInsights(
    [
      {
        id: "eleven-1",
        provider: "elevenlabs",
        globalSequence: 100_001,
        speakerLabel: "Caller",
        speakerType: "caller",
        startedAt: "2026-08-22T08:00:04Z",
        text: "I am Alex from Alpine and I need a revised quote.",
        state: "complete",
      },
      {
        id: "three-1",
        provider: "3cx",
        globalSequence: 300_001,
        speakerLabel: "Jenkar team",
        speakerType: "employee",
        startedAt: "2026-08-22T08:00:35Z",
        text: "I can revise that and send it this afternoon.",
        state: "complete",
      },
    ],
    "complete",
    "Alex",
  );

  assert(insights.summary?.includes("Alex from Alpine"));
  assert(insights.summary?.includes("send it this afternoon"));
  assert(insights.summary?.includes("Caller:"));
  assert(insights.summary?.includes("Handler:"));
  assertEquals(insights.providers, ["elevenlabs", "3cx"]);
  assertEquals(insights.suggestions.length, 1);
  assertEquals(
    insights.suggestions[0].sourceKey,
    "combined_transcript:revised_quote",
  );
  assertEquals(insights.suggestions[0].evidenceSegmentIds, ["eleven-1"]);
});

Deno.test("labels combined insights partial and excludes failed transcript evidence", () => {
  const insights = deriveCombinedTranscriptInsights(
    [
      {
        id: "eleven-readable",
        provider: "elevenlabs",
        globalSequence: 100_001,
        speakerLabel: "Caller",
        speakerType: "caller",
        startedAt: null,
        text: "Please call me back tomorrow.",
        state: "processing",
      },
      {
        id: "three-failed",
        provider: "3cx",
        globalSequence: 300_001,
        speakerLabel: "Jenkar team",
        speakerType: "employee",
        startedAt: null,
        text: "This failed fragment must not be summarised.",
        state: "failed",
      },
    ],
    "partial",
    "Alex",
  );

  assert(insights.summary?.startsWith("Partial summary —"));
  assertEquals(insights.summary?.includes("failed fragment"), false);
  assertEquals(insights.suggestions[0].evidenceProviders, ["elevenlabs"]);
});

Deno.test("opaque unknown-speaker transcript never becomes caller action evidence", () => {
  const insights = deriveCombinedTranscriptInsights([{
    id: "opaque-3cx",
    provider: "3cx",
    globalSequence: 300_001,
    speakerLabel: "Handler transcript",
    speakerType: "employee",
    startedAt: null,
    text:
      "The transcript says please call me back, but speaker identity is unknown.",
    state: "complete",
  }], "partial");
  assert(insights.summary?.includes("Handler:"));
  assertEquals(insights.suggestions, []);
});

Deno.test("validates ElevenLabs HMAC and rejects replayed timestamps", async () => {
  const body = '{"type":"post_call_transcription"}';
  const secret = "test-secret";
  const timestamp = 1_800_000_000;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  assert(
    await verifyElevenLabsSignature(
      body,
      `t=${timestamp},v0=${hex}`,
      secret,
      timestamp + 10,
    ),
  );
  assertEquals(
    await verifyElevenLabsSignature(
      body,
      `t=${timestamp},v0=${hex}`,
      secret,
      timestamp + 1900,
    ),
    false,
  );
});
