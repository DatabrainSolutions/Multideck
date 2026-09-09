import { firstText, isObject, type Json, parseDate, text } from "./core.ts";

export type ThreeCxXapiFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ThreeCxXapiCollection = {
  records: Json[];
  pagesRead: number;
  windowFrom: string;
  windowTo: string;
  providerVersion: string | null;
};

export type ThreeCxXapiFilters = {
  sourceType: number;
  sourceFilter: string | null;
  destinationType: number;
  destinationFilter: string | null;
  callsType: number;
  callTimeFilterType: number;
  callTimeFilterFrom: string | null;
  callTimeFilterTo: string | null;
  hidePcalls: boolean;
};

export class ThreeCxXapiError extends Error {
  constructor(
    message: string,
    readonly code = "three_cx_xapi_failed",
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ThreeCxXapiError";
  }
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value!)));
}

export function normalizeThreeCxBaseUrl(value: unknown) {
  const candidate = text(value, 500);
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash
    ) return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    if (url.pathname && url.pathname !== "/") return "";
    return url.origin;
  } catch {
    return "";
  }
}

async function readBoundedJson(response: Response, maximumBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ThreeCxXapiError(
      "3CX XAPI returned a response above the configured size bound.",
      "three_cx_xapi_response_too_large",
      response.status,
    );
  }
  if (!response.body) {
    throw new ThreeCxXapiError(
      "3CX XAPI returned an empty response.",
      "three_cx_xapi_invalid_response",
      response.status,
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
        throw new ThreeCxXapiError(
          "3CX XAPI returned a response above the configured size bound.",
          "three_cx_xapi_response_too_large",
          response.status,
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
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isObject(parsed)) throw new Error("not an object");
    return parsed;
  } catch (error) {
    if (error instanceof ThreeCxXapiError) throw error;
    throw new ThreeCxXapiError(
      "3CX XAPI returned invalid JSON.",
      "three_cx_xapi_invalid_response",
      response.status,
    );
  }
}

function odataString(value: string | null) {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

export function parseThreeCxXapiFilters(value: unknown) {
  if (!isObject(value)) return null;
  const integer = (candidate: unknown) => {
    const number = Number(candidate);
    return Number.isSafeInteger(number) && number >= 0 && number <= 100
      ? number
      : null;
  };
  const nullableFilter = (candidate: unknown) => {
    if (candidate === null) return null;
    return typeof candidate === "string" && candidate.length <= 120
      ? candidate
      : undefined;
  };
  const sourceType = integer(value.sourceType);
  const destinationType = integer(value.destinationType);
  const callsType = integer(value.callsType);
  const callTimeFilterType = integer(value.callTimeFilterType);
  const sourceFilter = nullableFilter(value.sourceFilter);
  const destinationFilter = nullableFilter(value.destinationFilter);
  const callTimeFilterFrom = nullableFilter(value.callTimeFilterFrom);
  const callTimeFilterTo = nullableFilter(value.callTimeFilterTo);
  if (
    sourceType === null || destinationType === null || callsType === null ||
    callTimeFilterType === null || sourceFilter === undefined ||
    destinationFilter === undefined || callTimeFilterFrom === undefined ||
    callTimeFilterTo === undefined || typeof value.hidePcalls !== "boolean"
  ) return null;
  return {
    sourceType,
    sourceFilter,
    destinationType,
    destinationFilter,
    callsType,
    callTimeFilterType,
    callTimeFilterFrom,
    callTimeFilterTo,
    hidePcalls: value.hidePcalls,
  } satisfies ThreeCxXapiFilters;
}

function callLogUrl(
  baseUrl: string,
  from: string,
  to: string,
  filters: ThreeCxXapiFilters,
  pageSize: number,
  skip: number,
) {
  const args = [
    `periodFrom=${from}`,
    `periodTo=${to}`,
    `sourceType=${filters.sourceType}`,
    `sourceFilter=${odataString(filters.sourceFilter)}`,
    `destinationType=${filters.destinationType}`,
    `destinationFilter=${odataString(filters.destinationFilter)}`,
    `callsType=${filters.callsType}`,
    `callTimeFilterType=${filters.callTimeFilterType}`,
    `callTimeFilterFrom=${odataString(filters.callTimeFilterFrom)}`,
    `callTimeFilterTo=${odataString(filters.callTimeFilterTo)}`,
    `hidePcalls=${filters.hidePcalls}`,
  ].join(",");
  const url = new URL(
    `/xapi/v1/ReportCallLogData/Pbx.GetCallLogData(${args})`,
    baseUrl,
  );
  url.searchParams.set("$top", String(pageSize));
  url.searchParams.set("$skip", String(skip));
  url.searchParams.set("$count", "true");
  url.searchParams.set("$orderby", "SegmentId asc");
  return url;
}

function safeNextLink(value: unknown, baseUrl: string) {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate, baseUrl);
    if (
      url.origin !== baseUrl ||
      !url.pathname.startsWith(
        "/xapi/v1/ReportCallLogData/Pbx.GetCallLogData(",
      ) || url.username || url.password || url.hash
    ) {
      throw new Error("unsafe next link");
    }
    return url;
  } catch {
    throw new ThreeCxXapiError(
      "3CX XAPI returned an unsafe pagination link.",
      "three_cx_xapi_unsafe_next_link",
    );
  }
}

function firstValue(record: Json, names: string[]) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) {
      return record[name];
    }
  }
  return null;
}

function firstIdentifier(record: Json, names: string[], maximum = 300) {
  for (const name of names) {
    const value = record[name];
    const candidate = text(value, maximum);
    if (candidate) return candidate;
    if (
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ) {
      return String(value);
    }
  }
  return "";
}

/**
 * Adapts the installed V20 report shape to the provider-grounded normalizer.
 * A report-level transcription is opaque: it becomes one unknown-speaker turn
 * with no invented per-turn time. The original XAPI object remains raw evidence.
 */
export function normalizeThreeCxXapiRecord(record: Json): Json {
  const cdrId = firstText(record, ["CdrId", "CDRId", "cdrId"], 300);
  const transcription = firstText(record, [
    "Transcription",
    "transcription",
  ], 20_000);
  const normalized: Json = {
    ...record,
    cdr_id: cdrId,
    call_history_id: firstText(record, [
      "CallHistoryId",
      "CallHistoryID",
    ], 300),
    main_call_history_id: firstText(record, [
      "MainCallHistoryId",
      "MainCallHistoryID",
    ], 300),
    // The installed Jenkar schema exposes these as integers. Preserve their
    // provider values as strings for storage/correlation without inventing an
    // identifier when the field is absent or malformed.
    call_id: firstIdentifier(record, ["CallId", "CallID"], 300),
    segment_id: firstIdentifier(record, ["SegmentId", "SegmentID"], 300),
    direction: firstText(record, ["Direction", "CallDirection"], 40),
    source_number: firstValue(record, [
      "SourceDn",
      "SourceCallerId",
      "SrcNumber",
      "SourceNumber",
      "Src",
      "Source",
    ]),
    destination_number: firstValue(record, [
      "DestinationDn",
      "DestinationCallerId",
      "DstNumber",
      "DestinationNumber",
      "Dst",
      "Destination",
    ]),
    started_at: firstValue(record, [
      "SegmentStartTime",
      "StartTime",
      "CallStartTime",
      "StartedAt",
    ]),
    answered_at: firstValue(record, [
      "SegmentAnswerTime",
      "AnswerTime",
      "AnsweredAt",
    ]),
    ended_at: firstValue(record, [
      "SegmentEndTime",
      "EndTime",
      "CallEndTime",
      "EndedAt",
    ]),
    answered: firstValue(record, ["Answered", "IsAnswered"]),
    status: firstText(record, [
      "Status",
      "CallStatus",
      "ReasonTerminated",
    ], 160),
    provider_summary: firstText(record, ["Summary"], 4_000) || null,
    provider_sentiment_score: firstValue(record, ["SentimentScore"]),
    provider_recording_url: firstText(record, [
      "RecordingUrl",
      "RecordingURL",
      "RecordingLocation",
    ], 2_000) || null,
    xapi_source: "ReportCallLogData/Pbx.GetCallLogData",
  };
  if (transcription) {
    // GetCallLogData exposes only a nullable opaque string. Its schema has no
    // completion flag, and the Recordings completion fields are a separate
    // authenticated surface that this collector does not fetch. Readable text
    // is therefore useful partial evidence, never proof of a complete employee
    // transcript.
    normalized.transcript_status = "partial";
    normalized.transcript_completion_evidence =
      "opaque_call_log_text_without_completion_signal";
    normalized.transcript = [{
      id: `${cdrId || "3cx"}:opaque-transcription`,
      speaker: "Handler transcript",
      speaker_type: "employee",
      text: transcription,
      speaker_provenance: "source_boundary_unknown_speakers",
    }];
  }
  return normalized;
}

export async function collectThreeCxXapiRecords(options: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  windowFrom: string;
  windowTo: string;
  filters: ThreeCxXapiFilters;
  maxPages?: number;
  maxRecords?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  fetcher?: ThreeCxXapiFetch;
}): Promise<ThreeCxXapiCollection> {
  const baseUrl = normalizeThreeCxBaseUrl(options.baseUrl);
  const clientId = text(options.clientId, 300);
  const clientSecret = text(options.clientSecret, 1_000);
  const windowFrom = parseDate(options.windowFrom);
  const windowTo = parseDate(options.windowTo);
  const filters = parseThreeCxXapiFilters(options.filters);
  if (
    !baseUrl || !clientId || !clientSecret || !windowFrom || !windowTo ||
    !filters
  ) {
    throw new ThreeCxXapiError(
      "3CX XAPI connection or polling window is invalid.",
      "three_cx_xapi_invalid_configuration",
    );
  }
  if (Date.parse(windowFrom) >= Date.parse(windowTo)) {
    throw new ThreeCxXapiError(
      "3CX XAPI polling window is empty.",
      "three_cx_xapi_invalid_window",
    );
  }
  const maxPages = boundedInteger(options.maxPages, 3, 1, 5);
  const maxRecords = boundedInteger(options.maxRecords, 250, 1, 250);
  const pageSize = Math.min(100, maxRecords);
  const maximumBytes = boundedInteger(
    options.maxResponseBytes,
    2 * 1024 * 1024,
    64 * 1024,
    4 * 1024 * 1024,
  );
  const timeoutMs = boundedInteger(options.timeoutMs, 20_000, 1_000, 50_000);
  const fetcher = options.fetcher ?? fetch;
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const tokenResponse = await fetcher(`${baseUrl}/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!tokenResponse.ok) {
    throw new ThreeCxXapiError(
      "3CX XAPI authentication failed.",
      `three_cx_xapi_token_http_${tokenResponse.status}`,
      tokenResponse.status,
    );
  }
  const tokenJson = await readBoundedJson(tokenResponse, 64 * 1024);
  const accessToken = text(tokenJson.access_token, 8_000);
  if (!accessToken) {
    throw new ThreeCxXapiError(
      "3CX XAPI did not return an access token.",
      "three_cx_xapi_invalid_token_response",
    );
  }

  const records: Json[] = [];
  let pagesRead = 0;
  let skip = 0;
  let nextUrl: URL | null = callLogUrl(
    baseUrl,
    windowFrom,
    windowTo,
    filters,
    pageSize,
    skip,
  );
  let providerVersion: string | null = null;
  while (nextUrl) {
    if (pagesRead >= maxPages) {
      throw new ThreeCxXapiError(
        "3CX XAPI pagination exceeded the configured page bound.",
        "three_cx_xapi_page_bound",
      );
    }
    const response = await fetcher(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new ThreeCxXapiError(
        "3CX XAPI call-log collection failed.",
        `three_cx_xapi_http_${response.status}`,
        response.status,
      );
    }
    providerVersion = providerVersion ??
      (text(response.headers.get("x-3cx-version"), 80) || null);
    const page = await readBoundedJson(response, maximumBytes);
    if (
      !Array.isArray(page.value) || page.value.some((item) => !isObject(item))
    ) {
      throw new ThreeCxXapiError(
        "3CX XAPI returned an invalid call-log page.",
        "three_cx_xapi_invalid_page",
      );
    }
    pagesRead += 1;
    for (const item of page.value) {
      if (records.length >= maxRecords) {
        throw new ThreeCxXapiError(
          "3CX XAPI records exceeded the configured run bound.",
          "three_cx_xapi_record_bound",
        );
      }
      const normalized = normalizeThreeCxXapiRecord(item as Json);
      if (!text(normalized.cdr_id, 300)) {
        throw new ThreeCxXapiError(
          "3CX XAPI returned a call log without a stable CdrId.",
          "three_cx_xapi_missing_cdr_id",
        );
      }
      records.push(normalized);
    }
    const providerNext = safeNextLink(page["@odata.nextLink"], baseUrl);
    const providerCount = Number(page["@odata.count"]);
    const completeByCount = Number.isSafeInteger(providerCount) &&
      providerCount >= 0 && records.length >= providerCount;
    if (providerNext) {
      nextUrl = providerNext;
    } else if (!completeByCount && page.value.length === pageSize) {
      skip += pageSize;
      nextUrl = callLogUrl(
        baseUrl,
        windowFrom,
        windowTo,
        filters,
        pageSize,
        skip,
      );
    } else {
      nextUrl = null;
    }
  }
  return {
    records,
    pagesRead,
    windowFrom,
    windowTo,
    providerVersion,
  };
}
