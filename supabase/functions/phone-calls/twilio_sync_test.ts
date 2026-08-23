import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  collectTwilioSyncDocuments,
  normalizeTwilioSyncDocument,
  parseTwilioSyncWebhook,
  TwilioSyncCollectorError,
  TwilioSyncWebhookError,
} from "./twilio_sync.ts";

const ACCOUNT_SID = `AC${"1".repeat(32)}`;
const SERVICE_SID = `IS${"2".repeat(32)}`;
const SCREENING_ID = "314c82f9-285b-43bd-b09e-4364e953872c";

function syncDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const dataOverrides = typeof overrides.data === "object" && overrides.data
    ? overrides.data as Record<string, unknown>
    : {};
  const documentOverrides = { ...overrides };
  delete documentOverrides.data;
  return {
    sid: `ET${"3".repeat(32)}`,
    unique_name: SCREENING_ID,
    revision: "revision-2",
    date_created: "2026-08-22T14:14:10.000Z",
    date_updated: "2026-08-22T14:14:36.800Z",
    date_expires: "2026-08-22T18:14:36.800Z",
    data: {
      id: SCREENING_ID,
      status: "caller_disconnected",
      outcome: "no_answer",
      conferenceName: `jenkar-screening-${SCREENING_ID}`,
      conferenceSid: `CF${"4".repeat(32)}`,
      callerCallSid: `CA${"5".repeat(32)}`,
      agentCallSid: `CA${"6".repeat(32)}`,
      staffCallSid: `CA${"7".repeat(32)}`,
      callerNumber: "+441423555010",
      extension: "610",
      screeningStartedAt: "2026-08-22T14:14:11.417Z",
      answeredAt: null,
      completedAt: "2026-08-22T14:14:36.731Z",
      createdAt: "2026-08-22T14:14:10.100Z",
      updatedAt: "2026-08-22T14:14:36.731Z",
      providerStatus: "completed",
      providerCode: "no-answer-timeout",
      ...dataOverrides,
    },
    ...documentOverrides,
  };
}

function syncWebhookForm(
  overrides: Record<string, string> = {},
): URLSearchParams {
  return new URLSearchParams({
    AccountSid: ACCOUNT_SID,
    ServiceSid: SERVICE_SID,
    EventType: "document_updated",
    DocumentSid: `ET${"3".repeat(32)}`,
    DocumentUniqueName: SCREENING_ID,
    DocumentRevision: "7",
    DocumentData: JSON.stringify(syncDocument().data),
    ...overrides,
  });
}

Deno.test("preserves only timestamps still attributable in a final Sync snapshot", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument());
  assert(snapshot);
  assertEquals(snapshot.screeningId, SCREENING_ID);
  assertEquals(snapshot.complete, false);
  assert(
    snapshot.missingFields.includes(
      "screening_completed_at_not_retained",
    ),
  );
  assertEquals(snapshot.checkpoint, {
    updatedAt: "2026-08-22T14:14:36.800Z",
    documentSid: `ET${"3".repeat(32)}`,
    revision: "revision-2",
  });
  assertEquals(snapshot.events.map((event) => event.participant_label), [
    "caller",
    "agent",
    "staff",
  ]);
  assertEquals(snapshot.events[0].from_number, "+441423555010");
  assertEquals(snapshot.events[0].outcome, undefined);
  assertEquals(snapshot.events[2].outcome, "no_answer");
  assertEquals(snapshot.events[2].call_status, "completed");
  assertEquals(snapshot.events[2].provider_code, "no-answer-timeout");
  assertEquals(snapshot.events[0].ended_at, "2026-08-22T14:14:36.731Z");
  assertEquals(snapshot.events[1].ended_at, "2026-08-22T14:14:36.731Z");
  assertEquals(snapshot.events[2].ended_at, undefined);
  assertEquals(
    snapshot.events[2].transcript_scope,
    "no_transcript_in_twilio_sync",
  );
  assertEquals(snapshot.events[2].includes_employee_transcript, false);
  assertEquals(
    snapshot.events[2].event_id,
    `twilio-sync:${SCREENING_ID}:ET${"3".repeat(32)}:revision-2:staff:CA${
      "7".repeat(32)
    }`,
  );
});

Deno.test("normalizes a Sync Service document webhook with stable document revision provenance", () => {
  const webhook = parseTwilioSyncWebhook(syncWebhookForm(), {
    expectedServiceSid: SERVICE_SID,
    expectedAccountSid: ACCOUNT_SID,
    receivedAt: "2026-08-22T14:14:37.000Z",
  });
  assertEquals(webhook.kind, "document");
  if (webhook.kind !== "document") return;
  const snapshot = normalizeTwilioSyncDocument(webhook.document);
  assert(snapshot);
  assertEquals(snapshot.source.sourceTransport, "sync_service_webhook");
  assertEquals(snapshot.source.webhookEventType, "document_updated");
  assertEquals(snapshot.source.receivedAt, "2026-08-22T14:14:37.000Z");
  assertEquals(snapshot.source.revision, "7");
  assertEquals(
    snapshot.events[0].source_timestamp_basis,
    "jenkar_sync_data_updated_at",
  );
  assertEquals(
    snapshot.events[0].event_id,
    `twilio-sync:${SCREENING_ID}:ET${"3".repeat(32)}:7:caller:CA${
      "5".repeat(32)
    }`,
  );
});

Deno.test("labels webhook receipt time as a fallback rather than provider time", () => {
  const data = syncDocument().data as Record<string, unknown>;
  delete data.updatedAt;
  delete data.createdAt;
  const webhook = parseTwilioSyncWebhook(
    syncWebhookForm({
      DocumentData: JSON.stringify(data),
    }),
    {
      expectedServiceSid: SERVICE_SID,
      receivedAt: "2026-08-22T14:14:37.000Z",
    },
  );
  assertEquals(webhook.kind, "document");
  if (webhook.kind !== "document") return;
  const snapshot = normalizeTwilioSyncDocument(webhook.document);
  assert(snapshot);
  assertEquals(snapshot.events[0].occurred_at, "2026-08-22T14:14:37.000Z");
  assertEquals(
    snapshot.events[0].source_timestamp_basis,
    "webhook_received_at",
  );
  assertEquals(
    snapshot.events[0].source_updated_at,
    "2026-08-22T14:14:37.000Z",
  );
});

Deno.test("ignores other authenticated Sync event types without parsing document data", () => {
  const webhook = parseTwilioSyncWebhook(
    syncWebhookForm({
      EventType: "document_removed",
      DocumentData: "",
    }),
    {
      expectedServiceSid: SERVICE_SID,
    },
  );
  assertEquals(webhook, {
    kind: "ignored",
    accountSid: ACCOUNT_SID,
    serviceSid: SERVICE_SID,
    eventType: "document_removed",
  });
});

Deno.test("rejects mismatched services and malformed or oversized webhook documents", () => {
  assertThrows(
    () =>
      parseTwilioSyncWebhook(syncWebhookForm(), {
        expectedServiceSid: `IS${"9".repeat(32)}`,
      }),
    TwilioSyncWebhookError,
    "does not match the configured service",
  );
  assertThrows(
    () =>
      parseTwilioSyncWebhook(syncWebhookForm({ DocumentRevision: "opaque" }), {
        expectedServiceSid: SERVICE_SID,
      }),
    TwilioSyncWebhookError,
    "must be an integer",
  );
  assertThrows(
    () =>
      parseTwilioSyncWebhook(
        syncWebhookForm({
          DocumentData: JSON.stringify(["not", "an", "object"]),
        }),
        {
          expectedServiceSid: SERVICE_SID,
        },
      ),
    TwilioSyncWebhookError,
    "must be a JSON object",
  );
  assertThrows(
    () =>
      parseTwilioSyncWebhook(
        syncWebhookForm({
          DocumentData: JSON.stringify({ value: "x".repeat(16 * 1024) }),
        }),
        {
          expectedServiceSid: SERVICE_SID,
        },
      ),
    TwilioSyncWebhookError,
    "exceeds 16 KiB",
  );
});

Deno.test("does not mistake transfer acceptance for the end of the caller call", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    date_updated: "2026-08-22T14:14:20.000Z",
    revision: "revision-accepted",
    data: {
      status: "accepted",
      outcome: "accepted",
      completedAt: "2026-08-22T14:14:19.900Z",
      providerStatus: "in-progress",
    },
  }));
  assert(snapshot);
  const caller = snapshot.events.find((event) =>
    event.participant_label === "caller"
  );
  const agent = snapshot.events.find((event) =>
    event.participant_label === "agent"
  );
  const staff = snapshot.events.find((event) =>
    event.participant_label === "staff"
  );
  assert(caller && agent && staff);
  assertEquals(caller.ended_at, undefined);
  assertEquals(agent.ended_at, "2026-08-22T14:14:19.900Z");
  assertEquals(staff.ended_at, undefined);
  assertEquals(staff.outcome, "accepted");
  assertEquals(
    staff.transfer_accepted_at,
    "2026-08-22T14:14:19.900Z",
  );
  assertEquals(
    staff.transcript_boundary_at,
    "2026-08-22T14:14:19.900Z",
  );
});

Deno.test("does not fabricate a lost acceptance boundary from the final caller timestamp", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    revision: "revision-final-accepted",
    data: {
      status: "caller_disconnected",
      outcome: "accepted",
      completedAt: "2026-08-22T14:20:00.000Z",
    },
  }));
  assert(snapshot);
  assertEquals(snapshot.transferAcceptedAt, "");
  assert(snapshot.missingFields.includes("transfer_accepted_at_not_retained"));
  const agent = snapshot.events.find((event) =>
    event.participant_label === "agent"
  );
  const staff = snapshot.events.find((event) =>
    event.participant_label === "staff"
  );
  assert(agent && staff);
  assertEquals(agent.ended_at, undefined);
  assertEquals(staff.ended_at, "2026-08-22T14:20:00.000Z");
  // `outcome` is retained explicit routing state. It can confirm that the
  // transfer happened, but the overwritten completedAt cannot supply its time.
  assertEquals(staff.outcome, "accepted");
  assertEquals(staff.transfer_accepted_at, undefined);
  assertEquals(staff.transcript_boundary_at, undefined);
  assertEquals(staff.transcript_boundary_source, undefined);
});

Deno.test("prefers immutable transfer and call completion timestamps in a final accepted snapshot", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    revision: "revision-final-accepted-retained",
    data: {
      status: "caller_disconnected",
      outcome: "accepted",
      transferAcceptedAt: "2026-08-22T14:14:19.900Z",
      callCompletedAt: "2026-08-22T14:20:00.000Z",
      completedAt: "2026-08-22T14:20:00.000Z",
      answeredAt: "2026-08-22T14:14:16.000Z",
    },
  }));
  assert(snapshot);
  assertEquals(snapshot.transferAcceptedAt, "2026-08-22T14:14:19.900Z");
  assertEquals(snapshot.callCompletedAt, "2026-08-22T14:20:00.000Z");
  assert(!snapshot.missingFields.includes("transfer_accepted_at_not_retained"));
  const caller = snapshot.events.find((event) =>
    event.participant_label === "caller"
  );
  const agent = snapshot.events.find((event) =>
    event.participant_label === "agent"
  );
  const staff = snapshot.events.find((event) =>
    event.participant_label === "staff"
  );
  assert(caller && agent && staff);
  assertEquals(caller.ended_at, "2026-08-22T14:20:00.000Z");
  assertEquals(agent.ended_at, "2026-08-22T14:14:19.900Z");
  assertEquals(staff.ended_at, "2026-08-22T14:20:00.000Z");
  assertEquals(staff.transfer_accepted_at, "2026-08-22T14:14:19.900Z");
  assertEquals(staff.transcript_boundary_at, "2026-08-22T14:14:19.900Z");
  assertEquals(
    staff.transcript_boundary_source,
    "jenkar_sync_data_transfer_accepted_at",
  );
});

Deno.test("prefers immutable screening and call completion timestamps in a final negative snapshot", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    revision: "revision-final-no-answer-retained",
    data: {
      status: "caller_disconnected",
      outcome: "no_answer",
      screeningCompletedAt: "2026-08-22T14:14:20.000Z",
      callCompletedAt: "2026-08-22T14:20:00.000Z",
      completedAt: "2026-08-22T14:20:00.000Z",
    },
  }));
  assert(snapshot);
  assertEquals(snapshot.screeningCompletedAt, "2026-08-22T14:14:20.000Z");
  assertEquals(snapshot.callCompletedAt, "2026-08-22T14:20:00.000Z");
  assert(
    !snapshot.missingFields.includes(
      "screening_completed_at_not_retained",
    ),
  );
  const caller = snapshot.events.find((event) =>
    event.participant_label === "caller"
  );
  const agent = snapshot.events.find((event) =>
    event.participant_label === "agent"
  );
  const staff = snapshot.events.find((event) =>
    event.participant_label === "staff"
  );
  assert(caller && agent && staff);
  assertEquals(caller.ended_at, "2026-08-22T14:20:00.000Z");
  assertEquals(agent.ended_at, "2026-08-22T14:20:00.000Z");
  assertEquals(staff.ended_at, "2026-08-22T14:14:20.000Z");
  assertEquals(
    staff.screening_completed_at,
    "2026-08-22T14:14:20.000Z",
  );
  assertEquals(staff.call_completed_at, "2026-08-22T14:20:00.000Z");
});

Deno.test("captures the staff boundary while a negative screening transition is current", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    revision: "revision-no-answer",
    data: {
      status: "no_answer",
      outcome: "no_answer",
      completedAt: "2026-08-22T14:14:20.000Z",
    },
  }));
  assert(snapshot);
  const caller = snapshot.events.find((event) =>
    event.participant_label === "caller"
  );
  const agent = snapshot.events.find((event) =>
    event.participant_label === "agent"
  );
  const staff = snapshot.events.find((event) =>
    event.participant_label === "staff"
  );
  assert(caller && agent && staff);
  assertEquals(caller.ended_at, undefined);
  assertEquals(agent.ended_at, undefined);
  assertEquals(staff.ended_at, "2026-08-22T14:14:20.000Z");
  assertEquals(
    staff.screening_completed_at,
    "2026-08-22T14:14:20.000Z",
  );
});

Deno.test("preserves an early session as partial without fabricating absent legs", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    revision: "revision-early",
    date_updated: "2026-08-22T14:14:10.200Z",
    data: {
      status: "connecting",
      outcome: null,
      conferenceName: null,
      conferenceSid: null,
      agentCallSid: null,
      staffCallSid: null,
      screeningStartedAt: null,
      extension: null,
      completedAt: null,
      providerStatus: null,
      providerCode: null,
    },
  }));
  assert(snapshot);
  assertEquals(snapshot.complete, false);
  assertEquals(snapshot.events.length, 1);
  assertEquals(snapshot.events[0].participant_label, "caller");
  assertEquals(snapshot.events[0].ended_at, undefined);
  assert(snapshot.missingFields.includes("conference_sid"));
  assert(!snapshot.missingFields.includes("agent_call_sid"));
  assert(!snapshot.missingFields.includes("staff_call_sid"));
});

Deno.test("ignores Sync Documents that are not Jenkar screening sessions", () => {
  assertEquals(
    normalizeTwilioSyncDocument(syncDocument({
      unique_name: "unrelated-document",
      data: { id: "not-a-screening-id", conferenceName: "other" },
    })),
    null,
  );
});

Deno.test("collector paginates, retries, de-duplicates, sorts and proposes a checkpoint", async () => {
  const older = syncDocument({
    sid: `ET${"8".repeat(32)}`,
    revision: "revision-1",
    date_updated: "2026-08-22T14:14:20.000Z",
  });
  const newer = syncDocument({
    sid: `ET${"9".repeat(32)}`,
    revision: "revision-3",
    date_updated: "2026-08-22T14:15:20.000Z",
  });
  let requests = 0;
  const delays: number[] = [];
  const collection = await collectTwilioSyncDocuments({
    accountSid: ACCOUNT_SID,
    authToken: "test-token-never-logged",
    serviceSid: SERVICE_SID,
    attempts: 2,
    sleep: (milliseconds) => {
      delays.push(milliseconds);
      return Promise.resolve();
    },
    fetcher: (input, init) => {
      requests += 1;
      assertEquals(init?.method, "GET");
      assert(
        String(new Headers(init?.headers).get("authorization")).startsWith(
          "Basic ",
        ),
      );
      const url = new URL(input);
      if (requests === 1) {
        return Promise.resolve(
          new Response("rate limited", {
            status: 429,
            headers: { "retry-after": "0" },
          }),
        );
      }
      if (!url.searchParams.has("PageToken")) {
        return Promise.resolve(Response.json({
          documents: [newer, newer],
          meta: {
            next_page_url:
              `https://sync.twilio.com/v1/Services/${SERVICE_SID}/Documents?PageToken=next`,
          },
        }));
      }
      return Promise.resolve(Response.json({
        documents: [older],
        meta: { next_page_url: null },
      }));
    },
  });

  assertEquals(requests, 3);
  assertEquals(delays, [0]);
  assertEquals(collection.pagesFetched, 2);
  assertEquals(collection.documentsSeen, 3);
  assertEquals(collection.duplicateDocuments, 1);
  assertEquals(collection.snapshots.map((snapshot) => snapshot.source.sid), [
    `ET${"8".repeat(32)}`,
    `ET${"9".repeat(32)}`,
  ]);
  assertEquals(collection.proposedCheckpoint, {
    updatedAt: "2026-08-22T14:15:20.000Z",
    documentSid: `ET${"9".repeat(32)}`,
    revision: "revision-3",
  });
});

Deno.test("collector filters records at or before the committed checkpoint", async () => {
  const document = syncDocument();
  const collection = await collectTwilioSyncDocuments({
    accountSid: ACCOUNT_SID,
    authToken: "token",
    serviceSid: SERVICE_SID,
    checkpoint: {
      updatedAt: "2026-08-22T14:14:36.800Z",
      documentSid: `ET${"3".repeat(32)}`,
      revision: "revision-2",
    },
    checkpointLookbackMs: 0,
    fetcher: () =>
      Promise.resolve(Response.json({
        documents: [document],
        meta: { next_page_url: null },
      })),
  });
  assertEquals(collection.snapshots, []);
  assertEquals(collection.proposedCheckpoint, {
    updatedAt: "2026-08-22T14:14:36.800Z",
    documentSid: `ET${"3".repeat(32)}`,
    revision: "revision-2",
  });
});

Deno.test("collector replays a bounded overlap to avoid same-timestamp cursor loss", async () => {
  const lowerSidRevision = syncDocument({
    sid: `ET${"1".repeat(32)}`,
    revision: "revision-new-in-same-second",
    date_updated: "2026-08-22T14:14:36.800Z",
  });
  const collection = await collectTwilioSyncDocuments({
    accountSid: ACCOUNT_SID,
    authToken: "token",
    serviceSid: SERVICE_SID,
    checkpoint: {
      updatedAt: "2026-08-22T14:14:36.800Z",
      documentSid: `ET${"9".repeat(32)}`,
      revision: "revision-previous",
    },
    fetcher: () =>
      Promise.resolve(Response.json({
        documents: [lowerSidRevision],
        meta: { next_page_url: null },
      })),
  });
  assertEquals(collection.snapshots.length, 1);
  assertEquals(collection.replayedSnapshots, 1);
  assertEquals(collection.proposedCheckpoint, {
    updatedAt: "2026-08-22T14:14:36.800Z",
    documentSid: `ET${"9".repeat(32)}`,
    revision: "revision-previous",
  });
});

Deno.test("collector refuses to advance past an ingestible snapshot without a provider update time", async () => {
  const collection = await collectTwilioSyncDocuments({
    accountSid: ACCOUNT_SID,
    authToken: "token",
    serviceSid: SERVICE_SID,
    checkpoint: {
      updatedAt: "2026-08-22T14:00:00.000Z",
      documentSid: `ET${"1".repeat(32)}`,
      revision: "revision-0",
    },
    fetcher: () =>
      Promise.resolve(Response.json({
        documents: [syncDocument({ date_updated: null })],
        meta: { next_page_url: null },
      })),
  });
  assertEquals(collection.snapshots.length, 1);
  assertEquals(collection.checkpointBlocked, true);
  assertEquals(collection.proposedCheckpoint, {
    updatedAt: "2026-08-22T14:00:00.000Z",
    documentSid: `ET${"1".repeat(32)}`,
    revision: "revision-0",
  });
});

Deno.test("collector refuses to checkpoint a snapshot without a stable provider revision", async () => {
  const collection = await collectTwilioSyncDocuments({
    accountSid: ACCOUNT_SID,
    authToken: "token",
    serviceSid: SERVICE_SID,
    fetcher: () =>
      Promise.resolve(Response.json({
        documents: [syncDocument({ revision: null })],
        meta: { next_page_url: null },
      })),
  });
  assertEquals(collection.snapshots.length, 1);
  assertEquals(collection.snapshots[0].checkpointEligible, false);
  assertEquals(collection.checkpointBlocked, true);
  assertEquals(collection.proposedCheckpoint, null);
});

Deno.test("normalizer rejects malformed provider SIDs without creating synthetic legs", () => {
  const snapshot = normalizeTwilioSyncDocument(syncDocument({
    data: {
      conferenceSid: "not-a-conference",
      callerCallSid: "not-a-call",
      agentCallSid: null,
      staffCallSid: `CA${"7".repeat(32)}`,
    },
  }));
  assert(snapshot);
  assert(snapshot.missingFields.includes("conference_sid_invalid"));
  assert(snapshot.missingFields.includes("caller_call_sid_invalid"));
  assertEquals(snapshot.events.map((event) => event.participant_label), [
    "staff",
  ]);
});

Deno.test("collector supports Twilio's recommended API-key authentication", async () => {
  let authorization = "";
  await collectTwilioSyncDocuments({
    apiKeySid: `SK${"a".repeat(32)}`,
    apiKeySecret: "api-key-secret",
    serviceSid: SERVICE_SID,
    fetcher: (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Promise.resolve(Response.json({
        documents: [],
        meta: { next_page_url: null },
      }));
    },
  });
  assertEquals(
    atob(authorization.replace(/^Basic /, "")),
    `SK${"a".repeat(32)}:api-key-secret`,
  );
});

Deno.test("collector fails closed on an unsafe provider pagination URL", async () => {
  await assertRejects(
    () =>
      collectTwilioSyncDocuments({
        accountSid: ACCOUNT_SID,
        authToken: "token",
        serviceSid: SERVICE_SID,
        fetcher: () =>
          Promise.resolve(Response.json({
            documents: [],
            meta: {
              next_page_url:
                "https://example.invalid/steal-provider-credentials",
            },
          })),
      }),
    TwilioSyncCollectorError,
    "unsafe pagination URL",
  );
});

Deno.test("collector fails closed instead of checkpointing beyond bounded pages", async () => {
  await assertRejects(
    () =>
      collectTwilioSyncDocuments({
        accountSid: ACCOUNT_SID,
        authToken: "token",
        serviceSid: SERVICE_SID,
        maxPages: 1,
        fetcher: () =>
          Promise.resolve(Response.json({
            documents: [syncDocument()],
            meta: {
              next_page_url:
                `https://sync.twilio.com/v1/Services/${SERVICE_SID}/Documents?PageToken=more`,
            },
          })),
      }),
    TwilioSyncCollectorError,
    "page bound",
  );
});

Deno.test("collector fails closed on malformed list responses", async () => {
  await assertRejects(
    () =>
      collectTwilioSyncDocuments({
        accountSid: ACCOUNT_SID,
        authToken: "token",
        serviceSid: SERVICE_SID,
        fetcher: () => Promise.resolve(Response.json({ documents: {} })),
      }),
    TwilioSyncCollectorError,
    "invalid list response",
  );
});

Deno.test("collector fails closed on repeated pagination URLs", async () => {
  const repeatedUrl =
    `https://sync.twilio.com/v1/Services/${SERVICE_SID}/Documents?PageToken=same`;
  await assertRejects(
    () =>
      collectTwilioSyncDocuments({
        accountSid: ACCOUNT_SID,
        authToken: "token",
        serviceSid: SERVICE_SID,
        fetcher: () =>
          Promise.resolve(Response.json({
            documents: [],
            meta: { next_page_url: repeatedUrl },
          })),
      }),
    TwilioSyncCollectorError,
    "repeated page URL",
  );
});

Deno.test("collector rejects conflicting bodies for one Document revision", async () => {
  await assertRejects(
    () =>
      collectTwilioSyncDocuments({
        accountSid: ACCOUNT_SID,
        authToken: "token",
        serviceSid: SERVICE_SID,
        fetcher: () =>
          Promise.resolve(Response.json({
            documents: [
              syncDocument(),
              syncDocument({
                data: { callerNumber: "+441423555099" },
              }),
            ],
            meta: { next_page_url: null },
          })),
      }),
    TwilioSyncCollectorError,
    "conflicting data",
  );
});
