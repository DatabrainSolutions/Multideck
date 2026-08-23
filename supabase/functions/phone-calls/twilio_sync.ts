import {
  firstText,
  isObject,
  type Json,
  normalizePhone,
  parseDate,
  text,
} from "./core.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TWILIO_ACCOUNT_SID_PATTERN = /^AC[0-9a-f]{32}$/i;
const TWILIO_API_KEY_SID_PATTERN = /^SK[0-9a-f]{32}$/i;
const TWILIO_SYNC_SERVICE_SID_PATTERN = /^IS[0-9a-f]{32}$/i;
const TWILIO_DOCUMENT_SID_PATTERN = /^ET[0-9a-f]{32}$/i;
const TWILIO_CALL_SID_PATTERN = /^CA[0-9a-f]{32}$/i;
const TWILIO_CONFERENCE_SID_PATTERN = /^CF[0-9a-f]{32}$/i;
const TWILIO_SYNC_DOCUMENT_MAX_BYTES = 16 * 1024;
const TWILIO_SYNC_DOCUMENT_EVENTS = new Set([
  "document_created",
  "document_updated",
]);

export type TwilioSyncCheckpoint = {
  updatedAt: string;
  documentSid: string;
  revision: string;
};

export type TwilioSyncSourceDocument = {
  sid: string;
  uniqueName: string;
  revision: string;
  data: Json;
  dateCreated: string;
  dateUpdated: string;
  dateExpires: string;
  sourceTransport: "rest_snapshot" | "sync_service_webhook";
  webhookEventType: string;
  receivedAt: string;
};

export type TwilioSyncWebhookDocument = {
  kind: "document";
  accountSid: string;
  serviceSid: string;
  eventType: "document_created" | "document_updated";
  document: Json;
};

export type TwilioSyncWebhookIgnored = {
  kind: "ignored";
  accountSid: string;
  serviceSid: string;
  eventType: string;
};

export type TwilioSyncWebhookPayload =
  | TwilioSyncWebhookDocument
  | TwilioSyncWebhookIgnored;

export class TwilioSyncWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwilioSyncWebhookError";
  }
}

export type JenkarScreeningEnvelope = Json & {
  event_id: string;
  event_type: "session_snapshot";
  screening_id: string;
  occurred_at: string;
  participant_label: "caller" | "agent" | "staff";
  call_sid: string;
  direction: "inbound" | "outbound";
  source_document_sid: string;
  source_revision: string;
  source_updated_at: string;
};

export type NormalizedTwilioSyncSnapshot = {
  source: TwilioSyncSourceDocument;
  screeningId: string;
  checkpoint: TwilioSyncCheckpoint | null;
  checkpointEligible: boolean;
  status: string;
  outcome: string;
  conferenceSid: string;
  conferenceName: string;
  screeningStartedAt: string;
  staffAnsweredAt: string;
  screeningCompletedAt: string;
  transferAcceptedAt: string;
  callCompletedAt: string;
  terminalScreening: boolean;
  complete: boolean;
  missingFields: string[];
  events: JenkarScreeningEnvelope[];
};

export type TwilioSyncFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TwilioSyncCollectorOptions = {
  accountSid?: string;
  authToken?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  serviceSid: string;
  checkpoint?: TwilioSyncCheckpoint | null;
  pageSize?: number;
  maxPages?: number;
  maxDocuments?: number;
  checkpointLookbackMs?: number;
  attempts?: number;
  timeoutMs?: number;
  baseUrl?: string;
  fetcher?: TwilioSyncFetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type TwilioSyncCollection = {
  snapshots: NormalizedTwilioSyncSnapshot[];
  proposedCheckpoint: TwilioSyncCheckpoint | null;
  checkpointBlocked: boolean;
  pagesFetched: number;
  documentsSeen: number;
  ignoredDocuments: number;
  duplicateDocuments: number;
  replayedSnapshots: number;
};

export class TwilioSyncCollectorError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { status?: number | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "TwilioSyncCollectorError";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function safeDate(value: unknown): string {
  return parseDate(value) ?? "";
}

function pick(value: Json, ...names: string[]): string {
  return firstText(value, names);
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function stableEventPart(value: string): string {
  if (value.length <= 120) return value;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.slice(0, 88)}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function safeUuid(value: unknown): string {
  const candidate = text(value).trim();
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : "";
}

function safeTwilioSid(value: unknown, pattern: RegExp): string {
  const candidate = text(value).trim();
  return pattern.test(candidate) ? candidate : "";
}

/**
 * Converts one verified Twilio Sync Service webhook form into the same source
 * shape used by the REST collector. Signature verification deliberately stays
 * at the HTTP boundary because it needs the exact configured URL and every raw
 * form parameter.
 */
export function parseTwilioSyncWebhook(
  form: URLSearchParams,
  options: {
    expectedServiceSid: string;
    expectedAccountSid?: string;
    receivedAt?: string;
  },
): TwilioSyncWebhookPayload {
  if (!TWILIO_SYNC_SERVICE_SID_PATTERN.test(options.expectedServiceSid)) {
    throw new TwilioSyncWebhookError(
      "A valid configured Twilio Sync Service SID is required.",
    );
  }
  const accountSid = safeTwilioSid(
    form.get("AccountSid"),
    TWILIO_ACCOUNT_SID_PATTERN,
  );
  if (!accountSid) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook AccountSid is missing or invalid.",
    );
  }
  if (
    options.expectedAccountSid && accountSid !== options.expectedAccountSid
  ) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook AccountSid does not match the configured account.",
    );
  }
  const serviceSid = safeTwilioSid(
    form.get("ServiceSid"),
    TWILIO_SYNC_SERVICE_SID_PATTERN,
  );
  if (!serviceSid || serviceSid !== options.expectedServiceSid) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook ServiceSid does not match the configured service.",
    );
  }
  const eventType = text(form.get("EventType"), 80).toLowerCase();
  if (!TWILIO_SYNC_DOCUMENT_EVENTS.has(eventType)) {
    return { kind: "ignored", accountSid, serviceSid, eventType };
  }

  const documentSid = safeTwilioSid(
    form.get("DocumentSid"),
    TWILIO_DOCUMENT_SID_PATTERN,
  );
  if (!documentSid) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook DocumentSid is missing or invalid.",
    );
  }
  const revision = text(form.get("DocumentRevision"), 32);
  if (!/^\d+$/.test(revision)) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook DocumentRevision must be an integer.",
    );
  }
  const encodedData = form.get("DocumentData") ?? "";
  if (
    !encodedData ||
    new TextEncoder().encode(encodedData).byteLength >
      TWILIO_SYNC_DOCUMENT_MAX_BYTES
  ) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook DocumentData is missing or exceeds 16 KiB.",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(encodedData);
  } catch {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook DocumentData is not valid JSON.",
    );
  }
  if (!isObject(data)) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook DocumentData must be a JSON object.",
    );
  }
  const receivedAt = parseDate(options.receivedAt ?? new Date().toISOString());
  if (!receivedAt) {
    throw new TwilioSyncWebhookError(
      "Twilio Sync webhook receipt time is invalid.",
    );
  }

  return {
    kind: "document",
    accountSid,
    serviceSid,
    eventType: eventType as "document_created" | "document_updated",
    document: {
      sid: documentSid,
      unique_name: text(form.get("DocumentUniqueName"), 320),
      revision,
      data,
      source_transport: "sync_service_webhook",
      webhook_event_type: eventType,
      webhook_received_at: receivedAt,
    },
  };
}

function screeningIdFromConferenceName(value: unknown): string {
  const match = text(value).trim().match(
    /^jenkar-screening-([0-9a-f-]{36})$/i,
  );
  return safeUuid(match?.[1]);
}

function normalizeSessionValue(value: unknown): string {
  return text(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeScreeningOutcome(value: unknown): string {
  const outcome = normalizeSessionValue(value);
  if (outcome === "voicemail_completed") return "voicemail";
  if (outcome === "voicemail_failed") return "failed";
  return outcome;
}

function isTerminalScreening(value: string): boolean {
  return new Set([
    "accepted",
    "declined",
    "no_answer",
    "busy",
    "failed",
    "caller_disconnected",
    "voicemail",
    "voicemail_completed",
    "voicemail_failed",
  ]).has(value);
}

function latestDate(...values: unknown[]): string {
  return values
    .map(safeDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}

function latestSourceTimestamp(
  source: TwilioSyncSourceDocument,
  data: Json,
): { value: string; basis: string } {
  const candidates = [
    {
      value: safeDate(source.dateUpdated),
      basis: "twilio_sync_document_date_updated",
    },
    {
      value: safeDate(data.updatedAt),
      basis: "jenkar_sync_data_updated_at",
    },
    {
      value: safeDate(source.dateCreated),
      basis: "twilio_sync_document_date_created",
    },
    {
      value: safeDate(data.createdAt),
      basis: "jenkar_sync_data_created_at",
    },
  ].filter((candidate) => candidate.value).sort((left, right) =>
    left.value.localeCompare(right.value)
  );
  return candidates.at(-1) ??
    (source.receivedAt
      ? { value: source.receivedAt, basis: "webhook_received_at" }
      : { value: "", basis: "unavailable" });
}

function parseSourceDocument(raw: unknown): TwilioSyncSourceDocument | null {
  if (!isObject(raw)) return null;
  const sid = pick(raw, "sid", "document_sid", "documentSid");
  if (!TWILIO_DOCUMENT_SID_PATTERN.test(sid)) return null;

  return {
    sid,
    uniqueName: pick(raw, "unique_name", "uniqueName"),
    revision: pick(raw, "revision"),
    data: isObject(raw.data) ? raw.data : {},
    dateCreated: safeDate(pick(raw, "date_created", "dateCreated")),
    dateUpdated: safeDate(pick(raw, "date_updated", "dateUpdated")),
    dateExpires: safeDate(pick(raw, "date_expires", "dateExpires")),
    sourceTransport: pick(raw, "source_transport", "sourceTransport") ===
        "sync_service_webhook"
      ? "sync_service_webhook"
      : "rest_snapshot",
    webhookEventType: pick(raw, "webhook_event_type", "webhookEventType"),
    receivedAt: safeDate(
      pick(raw, "webhook_received_at", "webhookReceivedAt"),
    ),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareTwilioSyncCheckpoints(
  left: TwilioSyncCheckpoint,
  right: TwilioSyncCheckpoint,
): number {
  return compareText(left.updatedAt, right.updatedAt) ||
    compareText(left.documentSid, right.documentSid) ||
    compareText(left.revision, right.revision);
}

export function isTwilioSyncCheckpointAfter(
  candidate: TwilioSyncCheckpoint,
  checkpoint: TwilioSyncCheckpoint | null | undefined,
): boolean {
  return !checkpoint || compareTwilioSyncCheckpoints(candidate, checkpoint) > 0;
}

function put(target: Json, key: string, value: unknown): void {
  if (value !== "" && value !== null && value !== undefined) {
    target[key] = value;
  }
}

function endedAtForRole(
  role: "caller" | "agent" | "staff",
  status: string,
  outcome: string,
  timestamps: {
    completedAt: string;
    screeningCompletedAt: string;
    transferAcceptedAt: string;
    callCompletedAt: string;
  },
): string {
  if (status === "caller_disconnected") {
    if (role === "caller") return timestamps.callCompletedAt;
    if (role === "agent") {
      return outcome === "accepted"
        ? timestamps.transferAcceptedAt
        : timestamps.callCompletedAt;
    }
    return outcome === "accepted"
      ? timestamps.callCompletedAt
      : timestamps.screeningCompletedAt;
  }
  if (role === "caller") {
    return status === "voicemail_completed" || status === "voicemail_failed"
      ? timestamps.callCompletedAt || timestamps.completedAt
      : "";
  }
  if (role === "agent") {
    return outcome === "accepted" ? timestamps.transferAcceptedAt : "";
  }
  return new Set([
      "declined",
      "no_answer",
      "busy",
      "failed",
      "voicemail",
    ]).has(outcome)
    ? timestamps.screeningCompletedAt
    : "";
}

function staffCallStatus(data: Json, outcome: string): string {
  const providerStatus = normalizeSessionValue(data.providerStatus);
  if (providerStatus) return providerStatus.replaceAll("_", "-");
  if (outcome === "no_answer") return "no-answer";
  if (outcome === "busy" || outcome === "failed") return outcome;
  if (outcome === "accepted") return "in-progress";
  if (outcome === "declined") return "completed";
  return "";
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isObject(value)) {
    return `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Converts one current-state Twilio Sync Document into deterministic snapshots
 * accepted by `/phone-calls/webhooks/jenkar/screening`.
 *
 * Sync Documents are snapshots, not event history. We therefore preserve the
 * document SID, revision and update timestamp on every emitted event and never
 * manufacture a participant leg when its Call SID is absent.
 */
export function normalizeTwilioSyncDocument(
  raw: unknown,
): NormalizedTwilioSyncSnapshot | null {
  const source = parseSourceDocument(raw);
  if (!source) return null;
  const data = source.data;

  const conferenceName = pick(data, "conferenceName", "conference_name");
  const screeningId = firstNonEmpty(
    safeUuid(data.id),
    safeUuid(data.screeningId),
    safeUuid(source.uniqueName),
    screeningIdFromConferenceName(conferenceName),
  );
  // The Sync service may contain unrelated Documents. Ignore them rather than
  // treating arbitrary provider data as a Jenkar screening session.
  if (!screeningId) return null;

  const status = normalizeSessionValue(data.status);
  const outcome = normalizeScreeningOutcome(
    firstNonEmpty(data.outcome, status),
  );
  const rawConferenceSid = pick(data, "conferenceSid", "conference_sid");
  const conferenceSid = safeTwilioSid(
    rawConferenceSid,
    TWILIO_CONFERENCE_SID_PATTERN,
  );
  const revisionKey = firstNonEmpty(
    source.revision,
    source.dateUpdated && `updated-${source.dateUpdated}`,
    source.dateCreated && `created-${source.dateCreated}`,
    source.sid,
  );
  const eventRevisionKey = stableEventPart(`${source.sid}:${revisionKey}`);
  const sourceTimestamp = latestSourceTimestamp(source, data);
  const sourceUpdatedAt = sourceTimestamp.value;
  const checkpoint = source.dateUpdated
    ? {
      updatedAt: source.dateUpdated,
      documentSid: source.sid,
      revision: revisionKey,
    }
    : null;

  const rawCallerCallSid = pick(data, "callerCallSid", "caller_call_sid");
  const rawAgentCallSid = pick(data, "agentCallSid", "agent_call_sid");
  const rawStaffCallSid = pick(data, "staffCallSid", "staff_call_sid");
  const callerCallSid = safeTwilioSid(
    rawCallerCallSid,
    TWILIO_CALL_SID_PATTERN,
  );
  const agentCallSid = safeTwilioSid(rawAgentCallSid, TWILIO_CALL_SID_PATTERN);
  const staffCallSid = safeTwilioSid(rawStaffCallSid, TWILIO_CALL_SID_PATTERN);
  const screeningStartedAt = safeDate(
    pick(data, "screeningStartedAt", "screening_started_at"),
  );
  const answeredAt = safeDate(pick(data, "answeredAt", "answered_at"));
  const completedAt = safeDate(pick(data, "completedAt", "completed_at"));
  const retainedScreeningCompletedAt = safeDate(
    pick(data, "screeningCompletedAt", "screening_completed_at"),
  );
  const retainedTransferAcceptedAt = safeDate(
    pick(data, "transferAcceptedAt", "transfer_accepted_at"),
  );
  const retainedCallCompletedAt = safeDate(
    pick(data, "callCompletedAt", "call_completed_at"),
  );
  const screeningCompletedAt = retainedScreeningCompletedAt ||
    (status === "caller_disconnected" ? "" : completedAt);
  const transferAcceptedAt = retainedTransferAcceptedAt ||
    (status === "accepted" && outcome === "accepted" ? completedAt : "");
  const callCompletedAt = retainedCallCompletedAt ||
    (status === "caller_disconnected" ? completedAt : "");
  const createdAt = latestDate(data.createdAt, source.dateCreated);
  const extension = pick(data, "extension");
  const callerNumber = normalizePhone(
    pick(data, "callerNumber", "caller_number"),
  );

  const staffExpected = Boolean(
    screeningStartedAt || extension || rawStaffCallSid,
  );
  const agentExpected = Boolean(
    conferenceSid && status && status !== "connecting",
  );
  const missingFields: string[] = [];
  if (!source.revision) missingFields.push("revision");
  if (!source.dateUpdated) missingFields.push("date_updated");
  if (!status) missingFields.push("status");
  if (!createdAt) missingFields.push("created_at");
  if (!conferenceSid) {
    missingFields.push(
      rawConferenceSid ? "conference_sid_invalid" : "conference_sid",
    );
  }
  if (!conferenceName) missingFields.push("conference_name");
  if (!callerCallSid) {
    missingFields.push(
      rawCallerCallSid ? "caller_call_sid_invalid" : "caller_call_sid",
    );
  }
  if (agentExpected && !agentCallSid) {
    missingFields.push(
      rawAgentCallSid ? "agent_call_sid_invalid" : "agent_call_sid",
    );
  }
  if (staffExpected && !staffCallSid) {
    missingFields.push(
      rawStaffCallSid ? "staff_call_sid_invalid" : "staff_call_sid",
    );
  }
  if (staffExpected && !screeningStartedAt) {
    missingFields.push("screening_started_at");
  }
  if (["accepted", "declined"].includes(outcome) && !answeredAt) {
    missingFields.push("staff_answered_at");
  }
  if (outcome === "accepted" && !transferAcceptedAt) {
    missingFields.push("transfer_accepted_at_not_retained");
  }
  if (
    status === "caller_disconnected" && staffExpected &&
    !["accepted", "caller_disconnected"].includes(outcome) &&
    !screeningCompletedAt
  ) {
    missingFields.push("screening_completed_at_not_retained");
  }
  if (status === "caller_disconnected" && !callCompletedAt) {
    missingFields.push("call_completed_at_not_retained");
  }

  const roles: Array<{
    role: "caller" | "agent" | "staff";
    callSid: string;
    startedAt: string;
    answeredAt: string;
    direction: "inbound" | "outbound";
  }> = [
    {
      role: "caller",
      callSid: callerCallSid,
      startedAt: createdAt,
      answeredAt: "",
      direction: "inbound",
    },
    {
      role: "agent",
      callSid: agentCallSid,
      startedAt: createdAt,
      answeredAt: "",
      direction: "outbound",
    },
    {
      role: "staff",
      callSid: staffCallSid,
      startedAt: screeningStartedAt,
      answeredAt,
      direction: "outbound",
    },
  ];
  const outcomeRole = staffCallSid ? "staff" : "caller";
  const events = roles.flatMap((leg): JenkarScreeningEnvelope[] => {
    if (!leg.callSid) return [];
    const event: Json = {
      event_id:
        `twilio-sync:${screeningId}:${eventRevisionKey}:${leg.role}:${leg.callSid}`,
      event_type: "session_snapshot",
      screening_id: screeningId,
      occurred_at: sourceUpdatedAt || createdAt,
      participant_label: leg.role,
      call_sid: leg.callSid,
      direction: leg.direction,
      source_document_sid: source.sid,
      source_revision: revisionKey,
      source_updated_at: sourceUpdatedAt || createdAt,
      source_timestamp_basis: sourceTimestamp.basis,
      source_transport: source.sourceTransport,
      source_webhook_event_type: source.webhookEventType,
      source_received_at: source.receivedAt,
      source_kind: "twilio_sync_document",
      screening_status: status,
      screening_outcome: outcome,
      partial_fields: missingFields,
      transcript_scope: "no_transcript_in_twilio_sync",
      expected_pre_transfer_transcript_provider: "elevenlabs",
      includes_employee_transcript: false,
    };
    put(event, "conference_sid", conferenceSid);
    put(event, "conference_name", conferenceName);
    put(event, "sequence_number", source.revision);
    put(event, "started_at", leg.startedAt);
    put(event, "answered_at", leg.answeredAt);
    put(event, "extension", extension);
    if (leg.role === "caller") put(event, "from_number", callerNumber);
    if (leg.role === "staff") {
      const exactProviderStatus = pick(data, "providerStatus");
      put(event, "call_status", staffCallStatus(data, outcome));
      put(
        event,
        "call_status_source",
        exactProviderStatus
          ? "twilio_sync.data.providerStatus"
          : "derived_from_screening_outcome",
      );
      put(event, "provider_status", pick(data, "providerStatus"));
      put(event, "provider_code", pick(data, "providerCode"));
    }
    put(event, "transfer_requested_at", screeningStartedAt);
    put(event, "session_completed_at", completedAt);
    put(event, "screening_completed_at", screeningCompletedAt);
    put(event, "call_completed_at", callCompletedAt);
    if (transferAcceptedAt) {
      put(event, "transfer_accepted_at", transferAcceptedAt);
      put(event, "transcript_boundary_at", transferAcceptedAt);
      put(
        event,
        "transcript_boundary_source",
        retainedTransferAcceptedAt
          ? "jenkar_sync_data_transfer_accepted_at"
          : "jenkar_sync_accepted_outcome_completed_at",
      );
    }
    if (leg.role === outcomeRole) put(event, "outcome", outcome);
    put(
      event,
      "ended_at",
      endedAtForRole(leg.role, status, outcome, {
        completedAt,
        screeningCompletedAt,
        transferAcceptedAt,
        callCompletedAt,
      }),
    );
    return [event as JenkarScreeningEnvelope];
  });

  return {
    source,
    screeningId,
    checkpoint,
    checkpointEligible: Boolean(
      checkpoint && source.revision && events.length > 0,
    ),
    status,
    outcome,
    conferenceSid,
    conferenceName,
    screeningStartedAt,
    staffAnsweredAt: answeredAt,
    screeningCompletedAt,
    transferAcceptedAt,
    callCompletedAt,
    terminalScreening: isTerminalScreening(outcome),
    complete: missingFields.length === 0,
    missingFields,
    events,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value!)));
}

function resolveAuthentication(options: TwilioSyncCollectorOptions): {
  username: string;
  password: string;
} {
  if (options.apiKeySid || options.apiKeySecret) {
    if (
      !TWILIO_API_KEY_SID_PATTERN.test(options.apiKeySid ?? "") ||
      !options.apiKeySecret
    ) {
      throw new TwilioSyncCollectorError(
        "A valid Twilio API Key SID and secret are both required",
      );
    }
    return { username: options.apiKeySid!, password: options.apiKeySecret };
  }
  if (!TWILIO_ACCOUNT_SID_PATTERN.test(options.accountSid ?? "")) {
    throw new TwilioSyncCollectorError("Invalid Twilio Account SID");
  }
  if (!options.authToken) {
    throw new TwilioSyncCollectorError("Twilio Auth Token is required");
  }
  return { username: options.accountSid!, password: options.authToken };
}

function validateCollectorOptions(options: TwilioSyncCollectorOptions): void {
  if (!TWILIO_SYNC_SERVICE_SID_PATTERN.test(options.serviceSid)) {
    throw new TwilioSyncCollectorError("Invalid Twilio Sync Service SID");
  }
}

function validatePageUrl(
  value: string | URL,
  baseUrl: URL,
  serviceSid: string,
): URL {
  const pageUrl = new URL(value, baseUrl);
  const expectedPath = `/v1/Services/${serviceSid}/Documents`;
  if (
    pageUrl.origin !== baseUrl.origin ||
    pageUrl.username ||
    pageUrl.password ||
    pageUrl.pathname !== expectedPath
  ) {
    throw new TwilioSyncCollectorError(
      "Twilio Sync returned an unsafe pagination URL",
    );
  }
  pageUrl.hash = "";
  return pageUrl;
}

function retryDelay(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after")?.trim() ?? "";
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(5_000, Math.max(0, seconds * 1_000));
    }
    const date = Date.parse(header);
    if (Number.isFinite(date)) {
      return Math.min(5_000, Math.max(0, date - Date.now()));
    }
  }
  return Math.min(2_000, 250 * (2 ** attempt));
}

async function fetchPage(
  pageUrl: URL,
  options: {
    authUsername: string;
    authPassword: string;
    attempts: number;
    timeoutMs: number;
    fetcher: TwilioSyncFetch;
    sleep: (milliseconds: number) => Promise<void>;
  },
): Promise<Json> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response | null = null;
    try {
      response = await options.fetcher(pageUrl, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Basic ${
            btoa(`${options.authUsername}:${options.authPassword}`)
          }`,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const payload: unknown = await response.json();
        if (!isObject(payload)) {
          throw new TwilioSyncCollectorError(
            "Twilio Sync returned an invalid JSON response",
          );
        }
        return payload;
      }

      const retryable = response.status === 408 || response.status === 429 ||
        response.status >= 500;
      lastError = new TwilioSyncCollectorError(
        `Twilio Sync request failed with HTTP ${response.status}`,
        { status: response.status, retryable },
      );
      if (!retryable || attempt + 1 >= options.attempts) throw lastError;
    } catch (error) {
      lastError = error;
      const explicitlyNonRetryable =
        error instanceof TwilioSyncCollectorError &&
        !error.retryable;
      if (explicitlyNonRetryable || attempt + 1 >= options.attempts) {
        if (error instanceof TwilioSyncCollectorError) throw error;
        throw new TwilioSyncCollectorError(
          "Twilio Sync request failed before a response was received",
          { retryable: true },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
    await options.sleep(retryDelay(response, attempt));
  }
  throw lastError instanceof Error
    ? lastError
    : new TwilioSyncCollectorError("Twilio Sync request failed");
}

/**
 * Reads all currently visible Documents before applying the checkpoint because
 * Twilio's list endpoint does not expose an updated-since filter or guarantee a
 * useful ordering. Result bounds fail closed so an unseen page cannot be
 * skipped by advancing the checkpoint.
 */
export async function collectTwilioSyncDocuments(
  options: TwilioSyncCollectorOptions,
): Promise<TwilioSyncCollection> {
  validateCollectorOptions(options);
  const authentication = resolveAuthentication(options);
  const pageSize = boundedInteger(options.pageSize, 100, 1, 100);
  const maxPages = boundedInteger(options.maxPages, 20, 1, 100);
  const maxDocuments = boundedInteger(options.maxDocuments, 2_000, 1, 10_000);
  const checkpointLookbackMs = boundedInteger(
    options.checkpointLookbackMs,
    120_000,
    0,
    15 * 60_000,
  );
  const attempts = boundedInteger(options.attempts, 3, 1, 5);
  const timeoutMs = boundedInteger(options.timeoutMs, 8_000, 250, 30_000);
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const baseUrl = new URL(options.baseUrl ?? "https://sync.twilio.com");
  if (baseUrl.protocol !== "https:") {
    throw new TwilioSyncCollectorError("Twilio Sync base URL must use HTTPS");
  }
  const initialUrl = validatePageUrl(
    `/v1/Services/${options.serviceSid}/Documents?PageSize=${pageSize}`,
    baseUrl,
    options.serviceSid,
  );

  const rawDocuments: unknown[] = [];
  let pageUrl: URL | null = initialUrl;
  let pagesFetched = 0;
  const visitedPages = new Set<string>();
  while (pageUrl) {
    if (visitedPages.has(pageUrl.href)) {
      throw new TwilioSyncCollectorError(
        "Twilio Sync pagination returned a repeated page URL",
        { retryable: true },
      );
    }
    visitedPages.add(pageUrl.href);
    if (pagesFetched >= maxPages) {
      throw new TwilioSyncCollectorError(
        "Twilio Sync pagination exceeded the configured page bound",
      );
    }
    const payload = await fetchPage(pageUrl, {
      authUsername: authentication.username,
      authPassword: authentication.password,
      attempts,
      timeoutMs,
      fetcher,
      sleep,
    });
    pagesFetched += 1;
    if (!Array.isArray(payload.documents) || !isObject(payload.meta)) {
      throw new TwilioSyncCollectorError(
        "Twilio Sync returned an invalid list response",
        { retryable: true },
      );
    }
    const documents = payload.documents;
    rawDocuments.push(...documents);
    if (rawDocuments.length > maxDocuments) {
      throw new TwilioSyncCollectorError(
        "Twilio Sync results exceeded the configured document bound",
      );
    }
    const meta = payload.meta;
    const nextPage = pick(meta, "next_page_url", "nextPageUrl");
    pageUrl = nextPage
      ? validatePageUrl(nextPage, baseUrl, options.serviceSid)
      : null;
  }

  let ignoredDocuments = 0;
  let duplicateDocuments = 0;
  const byDocumentRevision = new Map<string, NormalizedTwilioSyncSnapshot>();
  for (const rawDocument of rawDocuments) {
    const snapshot = normalizeTwilioSyncDocument(rawDocument);
    if (!snapshot) {
      ignoredDocuments += 1;
      continue;
    }
    const duplicateKey = `${snapshot.source.sid}:${snapshot.source.revision}`;
    const duplicate = byDocumentRevision.get(duplicateKey);
    if (duplicate) {
      if (canonicalJson(duplicate.source) !== canonicalJson(snapshot.source)) {
        throw new TwilioSyncCollectorError(
          "Twilio Sync returned conflicting data for one Document revision",
          { retryable: true },
        );
      }
      duplicateDocuments += 1;
      continue;
    }
    byDocumentRevision.set(duplicateKey, snapshot);
  }

  const ordered = [...byDocumentRevision.values()].sort((left, right) => {
    if (left.checkpoint && right.checkpoint) {
      return compareTwilioSyncCheckpoints(left.checkpoint, right.checkpoint);
    }
    if (left.checkpoint) return 1;
    if (right.checkpoint) return -1;
    return compareText(left.source.sid, right.source.sid);
  });
  const checkpointTime = options.checkpoint
    ? Date.parse(options.checkpoint.updatedAt)
    : Number.NaN;
  const snapshots = ordered.filter((snapshot) => {
    if (!snapshot.checkpoint || !options.checkpoint) return true;
    if (isTwilioSyncCheckpointAfter(snapshot.checkpoint, options.checkpoint)) {
      return true;
    }
    const snapshotTime = Date.parse(snapshot.checkpoint.updatedAt);
    return checkpointLookbackMs > 0 && Number.isFinite(checkpointTime) &&
      Number.isFinite(snapshotTime) &&
      snapshotTime >= checkpointTime - checkpointLookbackMs;
  });
  const replayedSnapshots = options.checkpoint
    ? snapshots.filter((snapshot) =>
      snapshot.checkpoint &&
      !isTwilioSyncCheckpointAfter(snapshot.checkpoint, options.checkpoint)
    ).length
    : 0;
  const checkpointBlocked = snapshots.some((snapshot) =>
    !snapshot.checkpointEligible
  );
  const proposedCheckpoint = checkpointBlocked
    ? options.checkpoint ?? null
    : snapshots.reduce<TwilioSyncCheckpoint | null>(
      (current, snapshot) => {
        if (!snapshot.checkpoint) return current;
        return !current ||
            compareTwilioSyncCheckpoints(snapshot.checkpoint, current) > 0
          ? snapshot.checkpoint
          : current;
      },
      options.checkpoint ?? null,
    );

  return {
    snapshots,
    proposedCheckpoint,
    checkpointBlocked,
    pagesFetched,
    documentsSeen: rawDocuments.length,
    ignoredDocuments,
    duplicateDocuments,
    replayedSnapshots,
  };
}
