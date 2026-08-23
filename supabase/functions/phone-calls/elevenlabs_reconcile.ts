import { isObject, type Json, parseDate, text } from "./core.ts";

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,240}$/;
const AGENT_ID_PATTERN = /^agent_[A-Za-z0-9_-]{8,240}$/;

export type ElevenLabsConversationState =
  | "processing"
  | "done"
  | "failed"
  | "unknown";

export type ElevenLabsTranscriptState =
  | "processing"
  | "complete"
  | "partial"
  | "failed"
  | "pending";

export type ElevenLabsReconciliationEnvelope = Json & {
  event_id: string;
  event_type: "conversation_reconciliation";
  source_provider: "elevenlabs";
  source_conversation_id: string;
  verification: "elevenlabs_api_key";
  transcript_state: ElevenLabsTranscriptState;
  data: Json;
};

export type ElevenLabsReconciliationResult = {
  ok: true;
  conversationId: string;
  eventId: string;
  providerStatus: string;
  conversationState: ElevenLabsConversationState;
  transcriptState: ElevenLabsTranscriptState;
  complete: boolean;
  transcriptTurns: number;
  transcriptCharacters: number;
  transcriptTruncated: boolean;
  truncationReasons: string[];
  missingFields: string[];
  startedAt: string | null;
  endedAt: string | null;
  transcriptScope: "elevenlabs_conversation_only";
  includesEmployeeTranscript: false;
  transferBoundaryAt: null;
  transferBoundaryEvidence: "not_provided_by_conversation_api";
  detail: Json;
  ingestionEnvelope: ElevenLabsReconciliationEnvelope | null;
};

export type ElevenLabsReconciliationFailure = {
  ok: false;
  conversationId: string;
  errorCode: string;
  status: number | null;
  retryable: boolean;
  message: string;
};

export type ElevenLabsReconciliationBatch = {
  results: Array<
    ElevenLabsReconciliationResult | ElevenLabsReconciliationFailure
  >;
  requested: number;
  uniqueRequested: number;
  duplicateInputCount: number;
  succeeded: number;
  failed: number;
};

export type ElevenLabsFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ElevenLabsReconciliationOptions = {
  apiKey: string;
  conversationIds: string[];
  expectedAgentId?: string;
  attempts?: number;
  timeoutMs?: number;
  concurrency?: number;
  maxConversations?: number;
  maxResponseBytes?: number;
  maxTranscriptTurns?: number;
  maxTranscriptCharacters?: number;
  maxTurnCharacters?: number;
  baseUrl?: string;
  fetcher?: ElevenLabsFetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type ElevenLabsConversationDiscovery = {
  conversationId: string;
  agentId: string;
  providerStatus: string;
  startedAtUnixSeconds: number | null;
};

export type ElevenLabsDiscoveryBatch = {
  conversations: ElevenLabsConversationDiscovery[];
  pagesRead: number;
  duplicateCount: number;
  windowStartUnixSeconds: number;
  windowEndUnixSeconds: number;
};

export type ElevenLabsDiscoveryOptions = {
  apiKey: string;
  agentId: string;
  windowStartUnixSeconds: number;
  windowEndUnixSeconds: number;
  pageSize?: number;
  maxPages?: number;
  maxConversations?: number;
  attempts?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  baseUrl?: string;
  fetcher?: ElevenLabsFetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class ElevenLabsReconciliationError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number | null;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ElevenLabsReconciliationError";
    this.code = options.code ?? "elevenlabs_reconciliation_failed";
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

type NormalizationLimits = {
  maxTranscriptTurns: number;
  maxTranscriptCharacters: number;
  maxTurnCharacters: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value!)));
}

function safeConversationId(value: unknown): string {
  const candidate = text(value, 240);
  return CONVERSATION_ID_PATTERN.test(candidate) ? candidate : "";
}

export function isSafeElevenLabsConversationId(value: unknown): boolean {
  return Boolean(safeConversationId(value));
}

function safeAgentId(value: unknown): string {
  const candidate = text(value, 248);
  return AGENT_ID_PATTERN.test(candidate) ? candidate : "";
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

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function retryDelay(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after")?.trim() ?? "";
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
      return Math.min(30_000, Math.max(0, seconds * 1_000));
    }
    const date = Date.parse(header);
    if (Number.isFinite(date)) {
      return Math.min(30_000, Math.max(0, date - Date.now()));
    }
  }
  return Math.min(4_000, 300 * (2 ** attempt));
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number,
): Promise<Json> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs conversation response exceeded the configured size bound",
      { code: "elevenlabs_response_too_large" },
    );
  }
  if (!response.body) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs conversation response did not contain a body",
      { code: "elevenlabs_invalid_response", retryable: true },
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw new ElevenLabsReconciliationError(
          "ElevenLabs conversation response exceeded the configured size bound",
          { code: "elevenlabs_response_too_large" },
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs conversation response was not valid JSON",
      { code: "elevenlabs_invalid_json", retryable: true },
    );
  }
  if (!isObject(parsed)) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs conversation response was not a JSON object",
      { code: "elevenlabs_invalid_response", retryable: true },
    );
  }
  return parsed;
}

async function fetchConversation(
  conversationId: string,
  options: {
    apiKey: string;
    baseUrl: URL;
    attempts: number;
    timeoutMs: number;
    maxResponseBytes: number;
    fetcher: ElevenLabsFetch;
    sleep: (milliseconds: number) => Promise<void>;
  },
): Promise<Json> {
  const url = new URL(
    `/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    options.baseUrl,
  );
  url.searchParams.set("format", "json");
  let lastError: unknown = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response | null = null;
    try {
      response = await options.fetcher(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "xi-api-key": options.apiKey,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        return await readBoundedJson(response, options.maxResponseBytes);
      }
      const retryable = response.status === 408 || response.status === 429 ||
        response.status >= 500;
      lastError = new ElevenLabsReconciliationError(
        `ElevenLabs conversation request failed with HTTP ${response.status}`,
        {
          code: `elevenlabs_http_${response.status}`,
          status: response.status,
          retryable,
        },
      );
      if (!retryable || attempt + 1 >= options.attempts) throw lastError;
    } catch (error) {
      lastError = error;
      const explicitlyNonRetryable =
        error instanceof ElevenLabsReconciliationError && !error.retryable;
      if (explicitlyNonRetryable || attempt + 1 >= options.attempts) {
        if (error instanceof ElevenLabsReconciliationError) throw error;
        throw new ElevenLabsReconciliationError(
          "ElevenLabs conversation request failed before a response was received",
          { code: "elevenlabs_network_error", retryable: true },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
    await options.sleep(retryDelay(response, attempt));
  }
  throw lastError instanceof Error
    ? lastError
    : new ElevenLabsReconciliationError(
      "ElevenLabs conversation request failed",
    );
}

async function fetchConversationPage(
  cursor: string,
  options: {
    apiKey: string;
    agentId: string;
    windowStartUnixSeconds: number;
    windowEndUnixSeconds: number;
    pageSize: number;
    baseUrl: URL;
    attempts: number;
    timeoutMs: number;
    maxResponseBytes: number;
    fetcher: ElevenLabsFetch;
    sleep: (milliseconds: number) => Promise<void>;
  },
): Promise<Json> {
  const url = new URL("/v1/convai/conversations", options.baseUrl);
  url.searchParams.set("agent_id", options.agentId);
  url.searchParams.set(
    "call_start_after_unix",
    String(options.windowStartUnixSeconds),
  );
  url.searchParams.set(
    "call_start_before_unix",
    String(options.windowEndUnixSeconds),
  );
  url.searchParams.set("page_size", String(options.pageSize));
  if (cursor) url.searchParams.set("cursor", cursor);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response | null = null;
    try {
      response = await options.fetcher(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "xi-api-key": options.apiKey,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        return await readBoundedJson(response, options.maxResponseBytes);
      }
      const retryable = response.status === 408 || response.status === 429 ||
        response.status >= 500;
      lastError = new ElevenLabsReconciliationError(
        `ElevenLabs conversation list request failed with HTTP ${response.status}`,
        {
          code: `elevenlabs_list_http_${response.status}`,
          status: response.status,
          retryable,
        },
      );
      if (!retryable || attempt + 1 >= options.attempts) throw lastError;
    } catch (error) {
      lastError = error;
      const explicitlyNonRetryable =
        error instanceof ElevenLabsReconciliationError && !error.retryable;
      if (explicitlyNonRetryable || attempt + 1 >= options.attempts) {
        if (error instanceof ElevenLabsReconciliationError) throw error;
        throw new ElevenLabsReconciliationError(
          "ElevenLabs conversation list request failed before a response was received",
          { code: "elevenlabs_list_network_error", retryable: true },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
    await options.sleep(retryDelay(response, attempt));
  }
  throw lastError instanceof Error
    ? lastError
    : new ElevenLabsReconciliationError(
      "ElevenLabs conversation list request failed",
      { code: "elevenlabs_list_failed", retryable: true },
    );
}

/**
 * Discovers conversations for one explicitly configured agent within a frozen
 * time window. It follows the official cursor, fails closed on invalid or
 * excessive pages, and never enumerates the whole ElevenLabs workspace.
 */
export async function discoverElevenLabsConversations(
  options: ElevenLabsDiscoveryOptions,
): Promise<ElevenLabsDiscoveryBatch> {
  if (!options.apiKey) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs API key is required",
      { code: "elevenlabs_api_key_missing" },
    );
  }
  const agentId = safeAgentId(options.agentId);
  if (!agentId) {
    throw new ElevenLabsReconciliationError(
      "A valid ElevenLabs agent ID is required",
      { code: "elevenlabs_agent_id_invalid" },
    );
  }
  const windowStartUnixSeconds = Math.trunc(options.windowStartUnixSeconds);
  const windowEndUnixSeconds = Math.trunc(options.windowEndUnixSeconds);
  if (
    !Number.isSafeInteger(windowStartUnixSeconds) ||
    !Number.isSafeInteger(windowEndUnixSeconds) ||
    windowStartUnixSeconds < 0 ||
    windowEndUnixSeconds <= windowStartUnixSeconds
  ) {
    throw new ElevenLabsReconciliationError(
      "The ElevenLabs discovery window is invalid",
      { code: "elevenlabs_discovery_window_invalid" },
    );
  }

  const pageSize = boundedInteger(options.pageSize, 100, 1, 100);
  const maxPages = boundedInteger(options.maxPages, 3, 1, 10);
  const maxConversations = boundedInteger(
    options.maxConversations,
    100,
    1,
    500,
  );
  const attempts = boundedInteger(options.attempts, 3, 1, 5);
  const timeoutMs = boundedInteger(options.timeoutMs, 10_000, 250, 30_000);
  const maxResponseBytes = boundedInteger(
    options.maxResponseBytes,
    512 * 1024,
    64 * 1024,
    2 * 1024 * 1024,
  );
  const baseUrl = new URL(options.baseUrl ?? "https://api.elevenlabs.io");
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.origin !== "https://api.elevenlabs.io" ||
    baseUrl.username || baseUrl.password
  ) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs API base URL must use HTTPS",
      { code: "elevenlabs_base_url_invalid" },
    );
  }
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const conversations: ElevenLabsConversationDiscovery[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let cursor = "";

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await fetchConversationPage(cursor, {
      apiKey: options.apiKey,
      agentId,
      windowStartUnixSeconds,
      windowEndUnixSeconds,
      pageSize,
      baseUrl,
      attempts,
      timeoutMs,
      maxResponseBytes,
      fetcher,
      sleep,
    });
    if (!Array.isArray(page.conversations)) {
      throw new ElevenLabsReconciliationError(
        "ElevenLabs conversation list did not contain a conversations array",
        { code: "elevenlabs_list_invalid_response", retryable: true },
      );
    }
    for (const item of page.conversations) {
      if (!isObject(item)) {
        throw new ElevenLabsReconciliationError(
          "ElevenLabs conversation list contained an invalid item",
          { code: "elevenlabs_list_invalid_response", retryable: true },
        );
      }
      const conversationId = safeConversationId(item.conversation_id);
      const returnedAgentId = safeAgentId(item.agent_id);
      if (!conversationId || (returnedAgentId && returnedAgentId !== agentId)) {
        throw new ElevenLabsReconciliationError(
          "ElevenLabs conversation list returned an invalid or cross-agent item",
          { code: "elevenlabs_list_scope_mismatch" },
        );
      }
      if (seen.has(conversationId)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(conversationId);
      const startedAtValue = Number(item.start_time_unix_secs);
      conversations.push({
        conversationId,
        agentId: returnedAgentId || agentId,
        providerStatus: text(item.status, 40).toLowerCase(),
        startedAtUnixSeconds: Number.isFinite(startedAtValue)
          ? Math.trunc(startedAtValue)
          : null,
      });
      if (conversations.length > maxConversations) {
        throw new ElevenLabsReconciliationError(
          "ElevenLabs discovery exceeded the configured conversation bound",
          { code: "elevenlabs_discovery_bound", retryable: true },
        );
      }
    }

    const hasMore = page.has_more === true;
    if (!hasMore) {
      return {
        conversations,
        pagesRead: pageNumber,
        duplicateCount,
        windowStartUnixSeconds,
        windowEndUnixSeconds,
      };
    }
    const nextCursor = text(page.next_cursor, 1_000);
    if (!nextCursor || nextCursor === cursor) {
      throw new ElevenLabsReconciliationError(
        "ElevenLabs conversation list did not provide a usable next cursor",
        { code: "elevenlabs_list_cursor_invalid", retryable: true },
      );
    }
    if (pageNumber === maxPages) {
      throw new ElevenLabsReconciliationError(
        "ElevenLabs discovery exceeded the configured page bound",
        { code: "elevenlabs_discovery_page_bound", retryable: true },
      );
    }
    cursor = nextCursor;
  }

  throw new ElevenLabsReconciliationError(
    "ElevenLabs discovery did not reach a terminal page",
    { code: "elevenlabs_discovery_incomplete", retryable: true },
  );
}

function conversationState(value: unknown): ElevenLabsConversationState {
  const status = text(value, 40).toLowerCase();
  if (
    ["initiated", "in-progress", "in_progress", "processing"].includes(status)
  ) {
    return "processing";
  }
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  return "unknown";
}

function endingAt(startedAt: string | null, durationValue: unknown) {
  const duration = Number(durationValue);
  if (!startedAt || !Number.isFinite(duration) || duration < 0) return null;
  return new Date(new Date(startedAt).getTime() + duration * 1000)
    .toISOString();
}

async function normalizeConversation(
  requestedConversationId: string,
  detail: Json,
  limits: NormalizationLimits,
  expectedAgentId?: string,
): Promise<ElevenLabsReconciliationResult> {
  const responseConversationId = safeConversationId(detail.conversation_id);
  if (
    !responseConversationId ||
    responseConversationId !== requestedConversationId
  ) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs returned a different or invalid conversation ID",
      { code: "elevenlabs_conversation_id_mismatch" },
    );
  }
  if (
    expectedAgentId &&
    safeAgentId(detail.agent_id) !== expectedAgentId
  ) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs returned a conversation from a different agent",
      { code: "elevenlabs_conversation_agent_mismatch" },
    );
  }

  const rawTranscript = detail.transcript;
  const transcriptPresent = Array.isArray(rawTranscript);
  const sourceTurns = transcriptPresent ? rawTranscript : [];
  const transcript: Json[] = [];
  const truncationReasons = new Set<string>();
  let transcriptCharacters = 0;

  for (let index = 0; index < sourceTurns.length; index += 1) {
    if (transcript.length >= limits.maxTranscriptTurns) {
      truncationReasons.add("turn_limit");
      break;
    }
    const sourceTurn = sourceTurns[index];
    if (!isObject(sourceTurn)) {
      truncationReasons.add("invalid_turn");
      continue;
    }
    const turn: Json = { ...sourceTurn };
    const messageField = typeof sourceTurn.message === "string"
      ? "message"
      : typeof sourceTurn.text === "string"
      ? "text"
      : "";
    if (messageField) {
      const message = String(sourceTurn[messageField]);
      const remaining = Math.max(
        0,
        limits.maxTranscriptCharacters - transcriptCharacters,
      );
      const allowed = Math.min(limits.maxTurnCharacters, remaining);
      if (allowed === 0) {
        truncationReasons.add("character_limit");
        break;
      }
      const boundedMessage = message.slice(0, allowed);
      if (boundedMessage.length < message.length) {
        truncationReasons.add(
          allowed === limits.maxTurnCharacters
            ? "turn_character_limit"
            : "character_limit",
        );
      }
      turn[messageField] = boundedMessage;
      transcriptCharacters += boundedMessage.length;
    }
    transcript.push(turn);
  }
  if (sourceTurns.length > transcript.length && !truncationReasons.size) {
    truncationReasons.add("turn_limit");
  }

  const normalizedDetail: Json = { ...detail, transcript };
  const state = conversationState(detail.status);
  const truncated = truncationReasons.size > 0;
  const transcriptState: ElevenLabsTranscriptState = state === "done"
    ? transcriptPresent && !truncated ? "complete" : "partial"
    : state === "failed"
    ? transcript.length ? "partial" : "failed"
    : state === "processing"
    ? "processing"
    : transcript.length
    ? "partial"
    : "pending";
  const complete = state === "done" && transcriptState === "complete";
  const metadata = isObject(detail.metadata) ? detail.metadata : {};
  const startedAt = parseDate(metadata.start_time_unix_secs) ??
    parseDate(detail.start_time_unix_secs);
  const endedAt = endingAt(
    startedAt,
    metadata.call_duration_secs ?? detail.call_duration_secs,
  );
  const fingerprint = await sha256(canonicalJson(normalizedDetail));
  const eventId = `elevenlabs-reconcile:${requestedConversationId}:${
    fingerprint.slice(0, 24)
  }`;
  const missingFields: string[] = [];
  if (!text(detail.status, 40)) missingFields.push("status");
  if (!transcriptPresent) missingFields.push("transcript");
  if (!startedAt) missingFields.push("metadata.start_time_unix_secs");

  const ingestionEnvelope: ElevenLabsReconciliationEnvelope | null = complete
    ? {
      event_id: eventId,
      event_type: "conversation_reconciliation",
      source_provider: "elevenlabs",
      source_conversation_id: requestedConversationId,
      verification: "elevenlabs_api_key",
      transcript_state: transcriptState,
      data: {
        ...normalizedDetail,
        reconciliation_source: "get_conversation_api",
        transcript_scope: "elevenlabs_conversation_only",
        includes_employee_transcript: false,
      },
    }
    : null;

  return {
    ok: true,
    conversationId: requestedConversationId,
    eventId,
    providerStatus: text(detail.status, 40).toLowerCase(),
    conversationState: state,
    transcriptState,
    complete,
    transcriptTurns: transcript.length,
    transcriptCharacters,
    transcriptTruncated: truncated,
    truncationReasons: [...truncationReasons],
    missingFields,
    startedAt,
    endedAt,
    transcriptScope: "elevenlabs_conversation_only",
    includesEmployeeTranscript: false,
    transferBoundaryAt: null,
    transferBoundaryEvidence: "not_provided_by_conversation_api",
    detail: normalizedDetail,
    ingestionEnvelope,
  };
}

function failureResult(
  conversationId: string,
  error: unknown,
): ElevenLabsReconciliationFailure {
  if (error instanceof ElevenLabsReconciliationError) {
    return {
      ok: false,
      conversationId,
      errorCode: error.code,
      status: error.status,
      retryable: error.retryable,
      message: error.message,
    };
  }
  return {
    ok: false,
    conversationId,
    errorCode: "elevenlabs_reconciliation_failed",
    status: null,
    retryable: true,
    message: "ElevenLabs conversation reconciliation failed.",
  };
}

/**
 * Reconciles known ElevenLabs conversation IDs through the official full
 * conversation GET endpoint. This is a repair path for known CRM legs, not a
 * discovery crawler, and it never treats the response as an employee/3CX
 * transcript or a provider-supplied transfer boundary.
 */
export async function reconcileElevenLabsConversations(
  options: ElevenLabsReconciliationOptions,
): Promise<ElevenLabsReconciliationBatch> {
  if (!options.apiKey) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs API key is required",
      { code: "elevenlabs_api_key_missing" },
    );
  }
  if (!Array.isArray(options.conversationIds)) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs conversation IDs are required",
      { code: "elevenlabs_conversation_ids_missing" },
    );
  }
  const maxConversations = boundedInteger(
    options.maxConversations,
    50,
    1,
    100,
  );
  if (options.conversationIds.length > maxConversations) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs reconciliation exceeded the configured conversation bound",
      { code: "elevenlabs_conversation_bound" },
    );
  }
  const requested = options.conversationIds.map(safeConversationId);
  if (requested.some((conversationId) => !conversationId)) {
    throw new ElevenLabsReconciliationError(
      "An ElevenLabs conversation ID is invalid",
      { code: "elevenlabs_conversation_id_invalid" },
    );
  }
  const conversationIds = [...new Set(requested)];
  const expectedAgentId = options.expectedAgentId
    ? safeAgentId(options.expectedAgentId)
    : "";
  if (options.expectedAgentId && !expectedAgentId) {
    throw new ElevenLabsReconciliationError(
      "A valid expected ElevenLabs agent ID is required",
      { code: "elevenlabs_agent_id_invalid" },
    );
  }
  const attempts = boundedInteger(options.attempts, 3, 1, 5);
  const timeoutMs = boundedInteger(options.timeoutMs, 10_000, 250, 30_000);
  const concurrency = boundedInteger(options.concurrency, 4, 1, 10);
  const maxResponseBytes = boundedInteger(
    options.maxResponseBytes,
    2 * 1024 * 1024,
    64 * 1024,
    5 * 1024 * 1024,
  );
  const limits: NormalizationLimits = {
    maxTranscriptTurns: boundedInteger(
      options.maxTranscriptTurns,
      2_000,
      1,
      5_000,
    ),
    maxTranscriptCharacters: boundedInteger(
      options.maxTranscriptCharacters,
      500_000,
      1_000,
      1_000_000,
    ),
    maxTurnCharacters: boundedInteger(
      options.maxTurnCharacters,
      20_000,
      100,
      50_000,
    ),
  };
  const baseUrl = new URL(options.baseUrl ?? "https://api.elevenlabs.io");
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.origin !== "https://api.elevenlabs.io" ||
    baseUrl.username || baseUrl.password
  ) {
    throw new ElevenLabsReconciliationError(
      "ElevenLabs API base URL must use HTTPS",
      { code: "elevenlabs_base_url_invalid" },
    );
  }
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  const results: Array<
    ElevenLabsReconciliationResult | ElevenLabsReconciliationFailure
  > = new Array(conversationIds.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, conversationIds.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= conversationIds.length) return;
        const conversationId = conversationIds[index];
        try {
          const detail = await fetchConversation(conversationId, {
            apiKey: options.apiKey,
            baseUrl,
            attempts,
            timeoutMs,
            maxResponseBytes,
            fetcher,
            sleep,
          });
          results[index] = await normalizeConversation(
            conversationId,
            detail,
            limits,
            expectedAgentId || undefined,
          );
        } catch (error) {
          results[index] = failureResult(conversationId, error);
        }
      }
    },
  );
  await Promise.all(workers);

  const succeeded = results.filter((result) => result.ok).length;
  return {
    results,
    requested: requested.length,
    uniqueRequested: conversationIds.length,
    duplicateInputCount: requested.length - conversationIds.length,
    succeeded,
    failed: results.length - succeeded,
  };
}
