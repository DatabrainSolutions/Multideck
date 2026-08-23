import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  discoverElevenLabsConversations,
  ElevenLabsReconciliationError,
  reconcileElevenLabsConversations,
} from "./elevenlabs_reconcile.ts";

const CONVERSATION_ID = "conv_7401k5m9x2p8ec3rqv6dtnhb0fzw";
const SECOND_CONVERSATION_ID = "conv_8401k5m9x2p8ec3rqv6dtnhb0abc";
const AGENT_ID = "agent_3701k3ttaq12ewp8b7qv5rfyszkz";

function conversation(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    agent_id: AGENT_ID,
    conversation_id: CONVERSATION_ID,
    status: "done",
    metadata: {
      start_time_unix_secs: 1_800_000_000,
      call_duration_secs: 18,
    },
    transcript: [
      {
        role: "agent",
        message: "Good morning, Jenkar.",
        time_in_call_secs: 0,
      },
      {
        role: "user",
        message: "Alex calling about a revised quote.",
        time_in_call_secs: 4,
      },
    ],
    conversation_initiation_client_data: {
      dynamic_variables: {
        sip_screening_id: "314c82f9-285b-43bd-b09e-4364e953872c",
      },
    },
    ...overrides,
  };
}

Deno.test("discovers only the configured agent across a frozen cursor window", async () => {
  const requests: URL[] = [];
  const result = await discoverElevenLabsConversations({
    apiKey: "test-api-key",
    agentId: AGENT_ID,
    windowStartUnixSeconds: 1_800_000_000,
    windowEndUnixSeconds: 1_800_000_120,
    fetcher: (input, init) => {
      const url = new URL(input);
      requests.push(url);
      assertEquals(
        new Headers(init?.headers).get("xi-api-key"),
        "test-api-key",
      );
      return Promise.resolve(Response.json(
        url.searchParams.get("cursor")
          ? {
            conversations: [{
              conversation_id: SECOND_CONVERSATION_ID,
              agent_id: AGENT_ID,
              status: "processing",
              start_time_unix_secs: 1_800_000_060,
            }],
            has_more: false,
            next_cursor: null,
          }
          : {
            conversations: [{
              conversation_id: CONVERSATION_ID,
              agent_id: AGENT_ID,
              status: "done",
              start_time_unix_secs: 1_800_000_010,
            }],
            has_more: true,
            next_cursor: "next-page",
          },
      ));
    },
  });
  assertEquals(requests.length, 2);
  assertEquals(requests[0].pathname, "/v1/convai/conversations");
  assertEquals(requests[0].searchParams.get("agent_id"), AGENT_ID);
  assertEquals(
    requests[0].searchParams.get("call_start_after_unix"),
    "1800000000",
  );
  assertEquals(
    requests[0].searchParams.get("call_start_before_unix"),
    "1800000120",
  );
  assertEquals(requests[0].searchParams.get("page_size"), "100");
  assertEquals(requests[1].searchParams.get("cursor"), "next-page");
  assertEquals(result.pagesRead, 2);
  assertEquals(
    result.conversations.map((item) => item.conversationId),
    [CONVERSATION_ID, SECOND_CONVERSATION_ID],
  );
});

Deno.test("fails closed when the agent-scoped list returns another agent", async () => {
  await assertRejects(
    () =>
      discoverElevenLabsConversations({
        apiKey: "key",
        agentId: AGENT_ID,
        windowStartUnixSeconds: 1_800_000_000,
        windowEndUnixSeconds: 1_800_000_120,
        fetcher: () =>
          Promise.resolve(Response.json({
            conversations: [{
              conversation_id: CONVERSATION_ID,
              agent_id: "agent_9901k3ttaq12ewp8b7qv5rfyszzz",
              status: "done",
            }],
            has_more: false,
          })),
      }),
    ElevenLabsReconciliationError,
    "cross-agent item",
  );
});

Deno.test("fails rather than skipping a discovery page beyond the bound", async () => {
  await assertRejects(
    () =>
      discoverElevenLabsConversations({
        apiKey: "key",
        agentId: AGENT_ID,
        windowStartUnixSeconds: 1_800_000_000,
        windowEndUnixSeconds: 1_800_000_120,
        maxPages: 1,
        fetcher: () =>
          Promise.resolve(Response.json({
            conversations: [],
            has_more: true,
            next_cursor: "unread-page",
          })),
      }),
    ElevenLabsReconciliationError,
    "page bound",
  );
});

Deno.test("reconciles a done conversation with a stable authenticated envelope", async () => {
  let requestUrl = "";
  let apiKey = "";
  const options = {
    apiKey: "test-api-key",
    conversationIds: [CONVERSATION_ID],
    fetcher: (input: string | URL, init?: RequestInit) => {
      requestUrl = String(input);
      apiKey = new Headers(init?.headers).get("xi-api-key") ?? "";
      return Promise.resolve(Response.json(conversation()));
    },
  };
  const first = await reconcileElevenLabsConversations(options);
  const second = await reconcileElevenLabsConversations(options);
  assertEquals(apiKey, "test-api-key");
  assertEquals(
    new URL(requestUrl).pathname,
    `/v1/convai/conversations/${CONVERSATION_ID}`,
  );
  assertEquals(new URL(requestUrl).searchParams.get("format"), "json");
  assertEquals(first.succeeded, 1);
  const result = first.results[0];
  assert(result.ok);
  assertEquals(result.conversationState, "done");
  assertEquals(result.transcriptState, "complete");
  assertEquals(result.transcriptTurns, 2);
  assertEquals(result.startedAt, "2027-01-15T08:00:00.000Z");
  assertEquals(result.endedAt, "2027-01-15T08:00:18.000Z");
  assertEquals(result.includesEmployeeTranscript, false);
  assertEquals(result.transferBoundaryAt, null);
  assert(result.ingestionEnvelope);
  assertEquals(
    result.ingestionEnvelope.event_type,
    "conversation_reconciliation",
  );
  assertEquals(result.ingestionEnvelope.verification, "elevenlabs_api_key");
  assertEquals(
    result.ingestionEnvelope.data.includes_employee_transcript,
    false,
  );
  const repeated = second.results[0];
  assert(repeated.ok);
  assertEquals(repeated.eventId, result.eventId);
});

Deno.test("keeps processing conversations out of the complete ingestion path", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        status: "processing",
        transcript: [{
          role: "user",
          message: "This transcript is not final yet.",
          time_in_call_secs: 2,
        }],
      }))),
  });
  const result = batch.results[0];
  assert(result.ok);
  assertEquals(result.conversationState, "processing");
  assertEquals(result.transcriptState, "processing");
  assertEquals(result.complete, false);
  assertEquals(result.ingestionEnvelope, null);
});

Deno.test("preserves readable turns from a failed conversation as partial", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        status: "failed",
        transcript: [{
          role: "agent",
          message: "A turn was captured before failure.",
          time_in_call_secs: 0,
        }],
      }))),
  });
  const result = batch.results[0];
  assert(result.ok);
  assertEquals(result.conversationState, "failed");
  assertEquals(result.transcriptState, "partial");
  assertEquals(result.transcriptTurns, 1);
  assertEquals(result.ingestionEnvelope, null);
});

Deno.test("models a provider-failed conversation with no readable turns as failed", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        status: "failed",
        transcript: [],
      }))),
  });
  const result = batch.results[0];
  assert(result.ok);
  assertEquals(result.conversationState, "failed");
  assertEquals(result.transcriptState, "failed");
  assertEquals(result.ingestionEnvelope, null);
});

Deno.test("bounds transcript turns and characters without claiming completeness", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    maxTranscriptTurns: 1,
    maxTranscriptCharacters: 1_000,
    maxTurnCharacters: 100,
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        transcript: [{
          role: "agent",
          message: "x".repeat(200),
        }, {
          role: "user",
          message: "second turn",
        }],
      }))),
  });
  const result = batch.results[0];
  assert(result.ok);
  assertEquals(result.transcriptState, "partial");
  assertEquals(result.transcriptTruncated, true);
  assertEquals(result.transcriptTurns, 1);
  assertEquals(result.transcriptCharacters, 100);
  assert(result.truncationReasons.includes("turn_character_limit"));
  assert(result.truncationReasons.includes("turn_limit"));
  assertEquals(result.ingestionEnvelope, null);
});

Deno.test("retries rate limits and succeeds without exposing the API key", async () => {
  let requests = 0;
  const delays: number[] = [];
  const batch = await reconcileElevenLabsConversations({
    apiKey: "secret-api-key",
    conversationIds: [CONVERSATION_ID],
    attempts: 2,
    sleep: (milliseconds) => {
      delays.push(milliseconds);
      return Promise.resolve();
    },
    fetcher: () => {
      requests += 1;
      return Promise.resolve(
        requests === 1
          ? new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "0" },
          })
          : Response.json(conversation()),
      );
    },
  });
  assertEquals(requests, 2);
  assertEquals(delays, [0]);
  assertEquals(batch.succeeded, 1);
  assertEquals(JSON.stringify(batch).includes("secret-api-key"), false);
});

Deno.test("de-duplicates requested IDs and isolates terminal provider errors", async () => {
  let requests = 0;
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [
      CONVERSATION_ID,
      SECOND_CONVERSATION_ID,
      CONVERSATION_ID,
    ],
    concurrency: 1,
    fetcher: (input) => {
      requests += 1;
      const requestedId = decodeURIComponent(
        new URL(input).pathname.split("/").at(-1) ?? "",
      );
      return Promise.resolve(
        requestedId === CONVERSATION_ID
          ? Response.json(conversation())
          : new Response("not found", { status: 404 }),
      );
    },
  });
  assertEquals(requests, 2);
  assertEquals(batch.requested, 3);
  assertEquals(batch.uniqueRequested, 2);
  assertEquals(batch.duplicateInputCount, 1);
  assertEquals(batch.succeeded, 1);
  assertEquals(batch.failed, 1);
  const failure = batch.results[1];
  assert(!failure.ok);
  assertEquals(failure.conversationId, SECOND_CONVERSATION_ID);
  assertEquals(failure.errorCode, "elevenlabs_http_404");
  assertEquals(failure.retryable, false);
});

Deno.test("rejects oversized responses before reading transcript data", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(
        new Response("{}", {
          headers: { "content-length": String(6 * 1024 * 1024) },
        }),
      ),
  });
  const failure = batch.results[0];
  assert(!failure.ok);
  assertEquals(failure.errorCode, "elevenlabs_response_too_large");
  assertEquals(failure.retryable, false);
});

Deno.test("stops streaming a response when the real body exceeds the byte bound", async () => {
  const oversized = JSON.stringify(conversation({
    analysis: { summary: "x".repeat(70 * 1024) },
  }));
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    maxResponseBytes: 64 * 1024,
    fetcher: () =>
      Promise.resolve(
        new Response(oversized, {
          // Exercise streamed counting rather than the Content-Length shortcut.
          headers: { "content-type": "application/json" },
        }),
      ),
  });
  const failure = batch.results[0];
  assert(!failure.ok);
  assertEquals(failure.errorCode, "elevenlabs_response_too_large");
});

Deno.test("rejects a mismatched provider conversation ID", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        conversation_id: SECOND_CONVERSATION_ID,
      }))),
  });
  const failure = batch.results[0];
  assert(!failure.ok);
  assertEquals(failure.errorCode, "elevenlabs_conversation_id_mismatch");
  assertEquals(failure.retryable, false);
});

Deno.test("rejects a full conversation returned from another agent", async () => {
  const batch = await reconcileElevenLabsConversations({
    apiKey: "key",
    expectedAgentId: AGENT_ID,
    conversationIds: [CONVERSATION_ID],
    fetcher: () =>
      Promise.resolve(Response.json(conversation({
        agent_id: "agent_9901k3ttaq12ewp8b7qv5rfyszzz",
      }))),
  });
  const failure = batch.results[0];
  assert(!failure.ok);
  assertEquals(failure.errorCode, "elevenlabs_conversation_agent_mismatch");
  assertEquals(failure.retryable, false);
});

Deno.test("rejects invalid IDs before any provider request", async () => {
  let requested = false;
  await assertRejects(
    () =>
      reconcileElevenLabsConversations({
        apiKey: "key",
        conversationIds: ["../../other-resource"],
        fetcher: () => {
          requested = true;
          return Promise.resolve(Response.json({}));
        },
      }),
    ElevenLabsReconciliationError,
    "conversation ID is invalid",
  );
  assertEquals(requested, false);
});
