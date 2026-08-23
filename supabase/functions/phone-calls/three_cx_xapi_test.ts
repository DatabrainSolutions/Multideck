import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { parse3cxTranscript } from "./core.ts";
import {
  collectThreeCxXapiRecords,
  normalizeThreeCxXapiRecord,
  parseThreeCxXapiFilters,
  ThreeCxXapiError,
} from "./three_cx_xapi.ts";

const FILTERS = {
  sourceType: 0,
  sourceFilter: "",
  destinationType: 0,
  destinationFilter: "",
  callsType: 0,
  callTimeFilterType: 0,
  callTimeFilterFrom: "0:00:0",
  callTimeFilterTo: "0:00:0",
  hidePcalls: true,
};

Deno.test("requires an explicit reviewed 3CX call-log scope", () => {
  assertEquals(parseThreeCxXapiFilters(null), null);
  assertEquals(
    parseThreeCxXapiFilters({ ...FILTERS, hidePcalls: "true" }),
    null,
  );
  assertEquals(parseThreeCxXapiFilters(FILTERS), FILTERS);
});

Deno.test("keeps installed XAPI transcription opaque and nullable", () => {
  const normalized = normalizeThreeCxXapiRecord({
    MainCallHistoryId: "main-1",
    CallHistoryId: "history-1",
    CdrId: "cdr-1",
    CallId: 41,
    SegmentId: 51,
    StartTime: "2026-08-23T12:34:56Z",
    SourceDn: "+447700900111",
    DestinationDn: "601",
    Answered: true,
    Direction: "Inbound",
    Status: "Answered",
    RecordingUrl: null,
    Summary: null,
    Transcription: "Alex requested a revised quote.",
  });
  assertEquals(normalized.cdr_id, "cdr-1");
  assertEquals(normalized.call_history_id, "history-1");
  assertEquals(normalized.main_call_history_id, "main-1");
  assertEquals(normalized.call_id, "41");
  assertEquals(normalized.segment_id, "51");
  assertEquals(normalized.source_number, "+447700900111");
  assertEquals(normalized.transcript_status, "partial");
  assertEquals(
    normalized.transcript_completion_evidence,
    "opaque_call_log_text_without_completion_signal",
  );
  assertEquals(normalized.transcript, [{
    id: "cdr-1:opaque-transcription",
    speaker: "Handler transcript",
    speaker_type: "employee",
    text: "Alex requested a revised quote.",
    speaker_provenance: "source_boundary_unknown_speakers",
  }]);
  assertEquals(normalized.transfer_accepted_at, undefined);
  const [segment] = parse3cxTranscript(
    normalized,
    "2026-08-23T12:34:56Z",
  );
  assertEquals(segment.speakerLabel, "Handler transcript");
  assertEquals(segment.speakerType, "employee");
  assertEquals(segment.state, "processing");
  assertEquals(segment.startedAt, null);
  assertEquals(segment.metadata.timingProvenance, "source_boundary_only");
  assertEquals(
    segment.metadata.speakerProvenance,
    "source_boundary_unknown_speakers",
  );
});

Deno.test("authenticates then collects bounded installed call-log pages", async () => {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const collection = await collectThreeCxXapiRecords({
    baseUrl: "https://jenkar.example.test",
    clientId: "service-principal",
    clientSecret: "secret-value",
    windowFrom: "2026-08-23T12:00:00Z",
    windowTo: "2026-08-23T12:05:00Z",
    filters: FILTERS,
    maxRecords: 3,
    fetcher: (input, init) => {
      const url = new URL(input);
      requests.push({ url, init });
      if (url.pathname === "/connect/token") {
        return Promise.resolve(Response.json({
          token_type: "Bearer",
          expires_in: 3600,
          access_token: "access-token",
          refresh_token: null,
        }));
      }
      const skip = Number(url.searchParams.get("$skip"));
      return Promise.resolve(Response.json({
        "@odata.count": 3,
        value: skip === 0
          ? [
            { CdrId: "cdr-1", SegmentId: 1 },
            { CdrId: "cdr-2", SegmentId: 2 },
            { CdrId: "cdr-3", SegmentId: 3 },
          ]
          : [],
      }, { headers: { "x-3cx-version": "20.0.9.995" } }));
    },
  });
  assertEquals(collection.records.length, 3);
  assertEquals(collection.pagesRead, 1);
  assertEquals(collection.providerVersion, "20.0.9.995");
  const tokenBody = requests[0].init?.body as URLSearchParams;
  assertEquals(tokenBody.get("grant_type"), "client_credentials");
  assertEquals(requests[1].url.searchParams.get("$count"), "true");
  assertEquals(requests[1].url.searchParams.get("$orderby"), "SegmentId asc");
  assert(requests[1].url.pathname.includes("hidePcalls=true"));
  assertEquals(
    new Headers(requests[1].init?.headers).get("authorization"),
    "Bearer access-token",
  );
});

Deno.test("rejects cross-origin XAPI pagination", async () => {
  await assertRejects(
    () =>
      collectThreeCxXapiRecords({
        baseUrl: "https://jenkar.example.test",
        clientId: "service-principal",
        clientSecret: "secret-value",
        windowFrom: "2026-08-23T12:00:00Z",
        windowTo: "2026-08-23T12:05:00Z",
        filters: FILTERS,
        fetcher: (input) => {
          const url = new URL(input);
          return Promise.resolve(
            url.pathname === "/connect/token"
              ? Response.json({ access_token: "access-token" })
              : Response.json({
                value: [{ CdrId: "cdr-1" }],
                "@odata.nextLink":
                  "https://attacker.example/xapi/v1/ReportCallLogData/Pbx.GetCallLogData()",
              }),
          );
        },
      }),
    ThreeCxXapiError,
    "unsafe pagination link",
  );
});
