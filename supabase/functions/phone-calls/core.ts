export type Json = Record<string, unknown>;

export const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

export class PhoneCallInputError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown, maximum = 300) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function firstText(value: Json, names: string[], maximum = 300) {
  for (const name of names) {
    const candidate = text(value[name], maximum);
    if (candidate) return candidate;
  }
  return "";
}

export function normalizeCapturedAnalysisValue(
  value: unknown,
  maximum = 4_000,
) {
  const candidate = text(value, maximum);
  return /^(?:null|none|n\/?a|not applicable|not provided|unknown)$/i.test(
      candidate,
    )
    ? ""
    : candidate;
}

export function normalizePhone(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return "";
  const international = raw.trim().startsWith("+") ||
    raw.trim().startsWith("00");
  const withoutOptionalTrunk = international ? raw.replace(/\(0\)/g, "") : raw;
  const digits = withoutOptionalTrunk.replace(/\D/g, "");
  if (!digits) return "";
  return raw.trim().startsWith("00")
    ? `+${digits.slice(2)}`
    : `${raw.trim().startsWith("+") ? "+" : ""}${digits}`;
}

export function normalizeJenkarScreeningOutcome(
  rawOutcome: string,
  legType: string,
) {
  const outcome = rawOutcome.trim().toLowerCase();
  const callOutcome = outcome === "accepted"
    ? "answered"
    : outcome === "no-answer"
    ? "no_answer"
    : outcome === "canceled"
    ? "cancelled"
    : [
        "answered",
        "missed",
        "no_answer",
        "busy",
        "declined",
        "voicemail",
        "failed",
        "cancelled",
      ].includes(outcome)
    ? outcome
    : "unknown";
  const transferStatus = outcome === "accepted"
    ? "accepted"
    : ["declined", "no_answer", "no-answer", "busy", "failed"].includes(
        outcome,
      )
    ? "declined"
    : legType === "employee"
    ? "requested"
    : "not_requested";
  return { callOutcome, transferStatus };
}

export function parseDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const result = new Date(millis);
    return Number.isNaN(result.getTime()) ? null : result.toISOString();
  }
  const candidate = text(value, 80);
  if (!candidate) return null;
  const result = new Date(candidate);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function datePartsInTimeZone(value: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === type)?.value ?? Number.NaN);
    const result = {
      year: part("year"),
      month: part("month"),
      day: part("day"),
      hour: part("hour"),
      minute: part("minute"),
      second: part("second"),
    };
    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

/** Converts a tenant-local calendar date into an exact UTC query boundary. */
export function localDateBoundary(
  value: unknown,
  timeZone: string,
  endOfDay = false,
) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return parseDate(value);
  const [year, month, day] = candidate.split("-").map(Number);
  const targetLocal = Date.UTC(year, month - 1, day + (endOfDay ? 1 : 0));
  let utc = targetLocal;
  // Time-zone offsets may change at DST boundaries. Re-evaluate the offset
  // against the adjusted instant until it settles rather than assuming a fixed
  // offset for the whole reporting period.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = datePartsInTimeZone(new Date(utc), timeZone);
    if (!parts) return null;
    const renderedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjusted = targetLocal - (renderedAsUtc - utc);
    if (adjusted === utc) break;
    utc = adjusted;
  }
  if (endOfDay) utc -= 1;
  return new Date(utc).toISOString();
}

export function dateKeyInTimeZone(value: unknown, timeZone: string) {
  const instant = parseDate(value);
  if (!instant) return "";
  const parts = datePartsInTimeZone(new Date(instant), timeZone);
  if (!parts) return "";
  const year = parts.year.toString().padStart(4, "0");
  const month = parts.month.toString().padStart(2, "0");
  const day = parts.day.toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function readBoundedBody(
  request: Request,
  maxBytes = MAX_WEBHOOK_BYTES,
) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PhoneCallInputError(413, "Webhook body is too large.");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PhoneCallInputError(413, "Webhook body is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string"
    ? encoder.encode(value)
    : Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hmac(
  algorithm: "SHA-256" | "SHA-1",
  secret: string,
  value: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

export async function verifyElevenLabsSignature(
  body: string,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const values = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(values.t);
  const signature = values.v0 ?? "";
  if (
    !Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 30 * 60 ||
    !signature || !secret
  ) return false;
  const expected = hex(await hmac("SHA-256", secret, `${timestamp}.${body}`));
  return constantTimeEqual(expected.toLowerCase(), signature.toLowerCase());
}

export async function verifyTwilioSignature(
  url: string,
  form: URLSearchParams,
  signature: string,
  secret: string,
) {
  if (!signature || !secret) return false;
  const pairs = [...new Set([...form.keys()])].sort().flatMap((key) =>
    form.getAll(key).sort().map((value) => `${key}${value}`)
  );
  const expected = base64(
    await hmac("SHA-1", secret, `${url}${pairs.join("")}`),
  );
  return constantTimeEqual(expected, signature);
}

export type UnifiedTranscriptSegment = {
  providerSegmentId: string;
  sourceSequence: number;
  speakerLabel: string;
  speakerType: "caller" | "receptionist" | "employee" | "external";
  startSeconds: number | null;
  endSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  text: string;
  state: "complete" | "processing" | "failed";
  metadata: Json;
};

export type TranscriptRollupStatus =
  | "complete"
  | "partial"
  | "pending"
  | "failed"
  | "unavailable";

export type CombinedTranscriptEvidenceSegment = {
  id: string;
  provider: "elevenlabs" | "3cx";
  globalSequence: number;
  speakerLabel: string;
  speakerType: "caller" | "receptionist" | "employee" | "external";
  startedAt: string | null;
  text: string;
  state: "complete" | "processing" | "failed";
};

export type CombinedTranscriptSuggestion = {
  sourceKey: string;
  title: string;
  reason: string;
  confidence: number;
  evidenceSegmentIds: string[];
  evidenceProviders: Array<"elevenlabs" | "3cx">;
};

function transcriptExcerpt(value: string, maximum = 180) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maximum) return compact;
  return `${compact.slice(0, maximum - 1).trimEnd()}…`;
}

function combinedTranscriptOrder(
  left: CombinedTranscriptEvidenceSegment,
  right: CombinedTranscriptEvidenceSegment,
) {
  const leftTime = left.startedAt ? Date.parse(left.startedAt) : Number.NaN;
  const rightTime = right.startedAt ? Date.parse(right.startedAt) : Number.NaN;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    const difference = leftTime - rightTime;
    if (difference) return difference;
  }
  // A provider that does not expose per-turn time stays within its explicit
  // source boundary. Global sequence is persisted from leg sort + source order.
  return left.globalSequence - right.globalSequence;
}

export function deriveCombinedTranscriptInsights(
  segments: CombinedTranscriptEvidenceSegment[],
  transcriptStatus: TranscriptRollupStatus,
  callerName = "",
) {
  const readable = segments.filter((segment) =>
    segment.state !== "failed" && Boolean(text(segment.text, 20_000))
  ).sort(combinedTranscriptOrder);
  const providers = [
    ...new Set(readable.map((segment) => segment.provider)),
  ] as Array<"elevenlabs" | "3cx">;
  if (!readable.length) {
    return {
      summary: null,
      suggestions: [] as CombinedTranscriptSuggestion[],
      providers,
      segmentCount: 0,
      transcriptStatus,
    };
  }

  const firstCaller = readable.find((segment) =>
    segment.speakerType === "caller"
  );
  const firstEmployee = readable.find((segment) =>
    segment.speakerType === "employee"
  );
  const lastCaller = [...readable].reverse().find((segment) =>
    segment.speakerType === "caller" && segment.id !== firstCaller?.id
  );
  const selected: CombinedTranscriptEvidenceSegment[] = [];
  for (const segment of [firstCaller, firstEmployee, lastCaller]) {
    if (segment && !selected.some((item) => item.id === segment.id)) {
      selected.push(segment);
    }
  }
  for (const segment of readable) {
    if (selected.length >= 3) break;
    if (!selected.some((item) => item.id === segment.id)) {
      selected.push(segment);
    }
  }
  const scopePrefix = transcriptStatus === "complete"
    ? ""
    : "Partial summary — ";
  const userFacingSpeaker = (segment: CombinedTranscriptEvidenceSegment) =>
    segment.speakerType === "receptionist"
      ? "Agent"
      : segment.speakerType === "employee"
      ? "Handler"
      : segment.speakerType === "caller"
      ? "Caller"
      : "Conversation";
  const summary = `${scopePrefix}${
    selected.map((segment) =>
      `${userFacingSpeaker(segment)}: ${transcriptExcerpt(segment.text)}`
    ).join(" ")
  }`;

  const actionEvidence = readable.filter((segment) =>
    segment.speakerType === "caller"
  );
  const suggestions: CombinedTranscriptSuggestion[] = [];
  const revisedQuote = actionEvidence.find((segment) =>
    /\b(?:revis(?:e|ed)|amend(?:ed)?|updat(?:e|ed))\b.{0,36}\bquote\b|\brevised quote\b/i
      .test(segment.text)
  );
  if (revisedQuote) {
    suggestions.push({
      sourceKey: "combined_transcript:revised_quote",
      title: `${
        callerName || "Caller"
      } asked for a revised quote — add this to the to-do list?`,
      reason:
        "The combined transcript contains an explicit request to revise a quote.",
      confidence: 0.86,
      evidenceSegmentIds: [revisedQuote.id],
      evidenceProviders: [revisedQuote.provider],
    });
  }
  const followUp = actionEvidence.find((segment) =>
    /\bcall (?:me|us|them) back\b|\breturn (?:my|the) call\b|\bfollow[ -]?up\b/i
      .test(segment.text)
  );
  if (followUp) {
    suggestions.push({
      sourceKey: "combined_transcript:follow_up",
      title: `Follow up with ${
        callerName || "the caller"
      } — add this to the to-do list?`,
      reason:
        "The combined transcript contains an explicit request for follow-up.",
      confidence: 0.84,
      evidenceSegmentIds: [followUp.id],
      evidenceProviders: [followUp.provider],
    });
  }
  return {
    summary: summary.slice(0, 4_000),
    suggestions,
    providers,
    segmentCount: readable.length,
    transcriptStatus,
  };
}

export function resolveTranscriptRollup(
  legs: Array<{ legType: string; transcriptStatus: string }>,
  segments: Array<{ provider: string; state: string }>,
): TranscriptRollupStatus {
  const expectedReceptionist = legs.some((leg) =>
    leg.legType === "receptionist"
  );
  const expectedEmployee = legs.some((leg) => leg.legType === "employee");
  const hasElevenLabs = segments.some((segment) =>
    segment.provider === "elevenlabs" && segment.state !== "failed"
  );
  const has3cx = segments.some((segment) =>
    segment.provider === "3cx" && segment.state !== "failed"
  );
  const hasReadableSegments = segments.some((segment) =>
    segment.state !== "failed"
  );

  if (hasReadableSegments) {
    const missingExpectedSource = (expectedReceptionist && !hasElevenLabs) ||
      (expectedEmployee && !has3cx);
    const hasProcessingSegment = segments.some((segment) =>
      segment.state === "processing"
    );
    return missingExpectedSource || hasProcessingSegment
      ? "partial"
      : "complete";
  }

  const statuses = legs.map((leg) => leg.transcriptStatus);
  if (statuses.some((status) => status === "partial")) return "partial";
  if (
    statuses.some((status) => status === "pending" || status === "processing")
  ) return "pending";
  if (statuses.some((status) => status === "failed")) return "failed";
  return "unavailable";
}

function absoluteTime(callStartedAt: string | null, seconds: number | null) {
  if (!callStartedAt || seconds === null) return null;
  const started = new Date(callStartedAt);
  if (Number.isNaN(started.getTime())) return null;
  return new Date(started.getTime() + Math.max(0, seconds) * 1000)
    .toISOString();
}

export function parseElevenLabsTranscript(
  payload: Json,
  callStartedAt: string | null,
): UnifiedTranscriptSegment[] {
  const data = isObject(payload.data) ? payload.data : payload;
  const transcript = Array.isArray(data.transcript) ? data.transcript : [];
  return transcript.flatMap((entry, index) => {
    if (!isObject(entry)) return [];
    const message = firstText(entry, ["message", "text"], 20_000);
    if (!message) return [];
    const role = firstText(entry, ["role", "speaker"], 40).toLowerCase();
    const secondsValue = entry.time_in_call_secs ?? entry.start_time ??
      entry.start_seconds;
    const startSeconds = Number.isFinite(Number(secondsValue))
      ? Number(secondsValue)
      : null;
    const duration = Number.isFinite(Number(entry.duration_secs))
      ? Number(entry.duration_secs)
      : null;
    const endSeconds = startSeconds !== null && duration !== null
      ? startSeconds + duration
      : null;
    const speakerType = role === "agent"
      ? "receptionist"
      : role === "user"
      ? "caller"
      : "external";
    return [{
      providerSegmentId: firstText(entry, ["id", "segment_id"], 240) ||
        `elevenlabs-${index}`,
      sourceSequence: index,
      speakerLabel: speakerType === "receptionist"
        ? "Jenkar receptionist"
        : speakerType === "caller"
        ? "Caller"
        : firstText(entry, ["speaker_name"], 120) || "Participant",
      speakerType,
      startSeconds,
      endSeconds,
      startedAt: absoluteTime(callStartedAt, startSeconds),
      endedAt: absoluteTime(callStartedAt, endSeconds),
      text: message,
      state: "complete" as const,
      metadata: { role, originalIndex: index },
    }];
  });
}

export function parse3cxTranscript(
  record: Json,
  callStartedAt: string | null,
): UnifiedTranscriptSegment[] {
  const transcript = Array.isArray(record.transcript)
    ? record.transcript
    : Array.isArray(record.segments)
    ? record.segments
    : [];
  return transcript.flatMap((entry, index) => {
    if (!isObject(entry)) return [];
    const message = firstText(entry, ["text", "message", "transcript"], 20_000);
    if (!message) return [];
    const speaker = firstText(
      entry,
      ["speaker", "speaker_name", "participant"],
      120,
    );
    const role = firstText(entry, ["speaker_type", "role"], 40).toLowerCase();
    const startSeconds =
      Number.isFinite(Number(entry.start_seconds ?? entry.start))
        ? Number(entry.start_seconds ?? entry.start)
        : null;
    const endSeconds = Number.isFinite(Number(entry.end_seconds ?? entry.end))
      ? Number(entry.end_seconds ?? entry.end)
      : null;
    const speakerType = role.includes("employee") || role.includes("agent")
      ? "employee"
      : role.includes("caller") || role.includes("customer")
      ? "caller"
      : "external";
    const transcriptState = normalize3cxTranscriptState(record, true);
    const explicitStartedAt = parseDate(entry.started_at);
    const explicitEndedAt = parseDate(entry.ended_at);
    const speakerProvenance = firstText(entry, ["speaker_provenance"], 120);
    const timingProvenance = explicitStartedAt
      ? "provider_absolute"
      : startSeconds !== null && callStartedAt
      ? "provider_relative_to_leg"
      : speakerProvenance === "source_boundary_unknown_speakers"
      ? "source_boundary_only"
      : "source_sequence_only";
    return [{
      providerSegmentId: firstText(entry, ["id", "segment_id"], 240) ||
        `3cx-${index}`,
      sourceSequence: index,
      speakerLabel: speaker ||
        (speakerType === "employee"
          ? "Jenkar team"
          : speakerType === "caller"
          ? "Caller"
          : "Participant"),
      speakerType,
      startSeconds,
      endSeconds,
      startedAt: explicitStartedAt ?? absoluteTime(callStartedAt, startSeconds),
      endedAt: explicitEndedAt ?? absoluteTime(callStartedAt, endSeconds),
      text: message,
      state: transcriptState === "complete"
        ? "complete" as const
        : transcriptState === "failed"
        ? "failed" as const
        : "processing" as const,
      metadata: {
        role,
        originalIndex: index,
        transcriptStatus: firstText(record, [
          "transcript_status",
          "transcription_status",
        ], 80) || null,
        timingProvenance,
        speakerProvenance: speakerProvenance || null,
      },
    }];
  });
}

export type Normalized3cxRecord = {
  cdrId: string;
  callHistoryId: string;
  parentCallId: string;
  direction: "inbound" | "outbound";
  fromNumber: string;
  toNumber: string;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  transferAcceptedAt: string | null;
  outcome:
    | "answered"
    | "missed"
    | "no_answer"
    | "busy"
    | "declined"
    | "voicemail"
    | "failed"
    | "cancelled"
    | "unknown";
  transferStatus:
    | "not_requested"
    | "requested"
    | "accepted"
    | "declined"
    | "failed"
    | "unknown";
  transcriptState:
    | "complete"
    | "partial"
    | "pending"
    | "failed"
    | "unavailable"
    | "unavailable_not_licensed";
  raw: Json;
};

function normalize3cxTranscriptState(
  record: Json,
  hasTranscript: boolean,
): Normalized3cxRecord["transcriptState"] {
  const transcriptValue = firstText(record, [
    "transcript_status",
    "transcription_status",
  ], 80).toLowerCase().replace(/[\s-]+/g, "_");

  // A readable partial/failed provider result is useful evidence, but it is not
  // proof that the provider finished transcription successfully.
  if (transcriptValue.includes("not_licensed")) {
    return hasTranscript ? "partial" : "unavailable_not_licensed";
  }
  if (transcriptValue.includes("partial")) return "partial";
  if (
    transcriptValue.includes("process") ||
    transcriptValue.includes("pending") ||
    transcriptValue.includes("in_progress")
  ) return hasTranscript ? "partial" : "pending";
  if (transcriptValue.includes("fail")) {
    return hasTranscript ? "partial" : "failed";
  }
  return hasTranscript ? "complete" : "unavailable";
}

export function normalize3cxRecord(record: Json): Normalized3cxRecord {
  const answeredAt = parseDate(
    record.cdr_answered_at ?? record.time_answered ?? record["time-answered"] ??
      record.answered_at ?? record.answer_time,
  );
  const status = [
    firstText(record, [
      "termination_reason",
      "reason_terminated",
      "reason-terminated",
      "status",
      "call_result",
      "outcome",
    ], 160),
    firstText(record, [
      "termination_reason_details",
      "reason_not_answered",
      "reason_changed",
    ], 240),
  ].filter(Boolean).join(" ").toLowerCase().replace(/[\s-]+/g, "_");
  const explicitlyAnswered = record.answered === true ||
    String(record.answered).toLowerCase() === "true";
  const outcome: Normalized3cxRecord["outcome"] = status.includes("voicemail")
    ? "voicemail"
    : status.includes("declin")
    ? "declined"
    : status.includes("busy")
    ? "busy"
    : status.includes("no_answer") || status.includes("unanswered")
    ? "no_answer"
    : status.includes("fail")
    ? "failed"
    : status.includes("cancel")
    ? "cancelled"
    : answeredAt || explicitlyAnswered
    ? "answered"
    : status.includes("miss")
    ? "missed"
    : "unknown";
  const explicitTransferStatus = firstText(record, [
    "transfer_status",
  ], 80).toLowerCase();
  const transferValue = firstText(record, [
    "creation_method",
    "creation_forward_reason",
    "action_type",
    "call_type",
  ], 80).toLowerCase();
  const transferAcceptedAt = parseDate(record.transfer_accepted_at);
  const transferStatus: Normalized3cxRecord["transferStatus"] =
    transferAcceptedAt || explicitTransferStatus.includes("accept")
      ? "accepted"
      : explicitTransferStatus.includes("declin")
      ? "declined"
      : explicitTransferStatus.includes("fail")
      ? "failed"
      : explicitTransferStatus.includes("request") ||
          transferValue.includes("transfer") || transferValue.includes("join")
      ? "requested"
      : "not_requested";
  const hasTranscript =
    (Array.isArray(record.transcript) && record.transcript.length > 0) ||
    (Array.isArray(record.segments) && record.segments.length > 0);
  const transcriptState = normalize3cxTranscriptState(record, hasTranscript);
  const directionValue = firstText(record, ["direction", "call_direction"], 40)
    .toLowerCase();
  const sourceIncoming = record.source_participant_is_incoming === true ||
    String(record.source_participant_is_incoming).toLowerCase() === "true";
  const destinationIncoming =
    record.destination_participant_is_incoming === true ||
    String(record.destination_participant_is_incoming).toLowerCase() ===
      "true";
  return {
    cdrId: firstText(record, [
      "cdr_id",
      "cdrId",
      "segment_id",
      "id",
      "call_id",
      "callid",
    ], 300),
    callHistoryId: firstText(record, [
      "call_history_id",
      "callHistoryId",
      "history_id",
      "historyid",
    ], 300),
    parentCallId: firstText(record, [
      "main_call_history_id",
      "base_cdr_id",
      "originating_cdr_id",
      "parent_call_id",
      "predecessor_id",
    ], 300),
    direction: directionValue.includes("out") ||
        (!sourceIncoming && destinationIncoming)
      ? "outbound"
      : "inbound",
    fromNumber: normalizePhone(
      record.source_participant_phone_number ??
        record.source_participant_trunk_did ?? record.source_dn_number ??
        record.source_number ?? record.from_number ?? record.from ??
        record.caller_number ?? record["from-no"],
    ),
    toNumber: normalizePhone(
      record.destination_participant_phone_number ??
        record.destination_participant_trunk_did ??
        record.destination_dn_number ?? record.destination_number ??
        record.to_number ?? record.to ?? record.did ?? record["to-no"],
    ),
    startedAt: parseDate(
      record.cdr_started_at ?? record.time_start ?? record.started_at ??
        record.start_time ?? record["time-start"],
    ),
    answeredAt,
    endedAt: parseDate(
      record.cdr_ended_at ?? record.time_end ?? record.ended_at ??
        record.end_time ?? record["time-end"],
    ),
    transferAcceptedAt,
    outcome,
    transferStatus,
    transcriptState,
    raw: record,
  };
}

export function candidateIsSafe(
  candidates: Array<{ callId: string; differenceSeconds: number }>,
  maximumDifferenceSeconds = 2 * 60,
) {
  const safe = candidates.filter((candidate) =>
    candidate.differenceSeconds <= maximumDifferenceSeconds
  ).sort((a, b) => a.differenceSeconds - b.differenceSeconds);
  if (safe.length !== 1) return null;
  return safe[0];
}
