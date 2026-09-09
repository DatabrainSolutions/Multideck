import { assertEquals, assertThrows } from "jsr:@std/assert"
import { automaticReplyDto, automaticReplyInput } from "./runtime.ts"

const capability = {
  supported: true,
  canUpdate: true,
  requiresReconnect: false,
  reason: null,
}

Deno.test("Gmail vacation settings map to the shared automatic reply contract", () => {
  assertEquals(automaticReplyDto("gmail", {
    enableAutoReply: true,
    startTime: "1788238800000",
    endTime: "1788505200000",
    responseSubject: "Out of office",
    responseBodyPlainText: "I will reply when I return.",
    restrictToDomain: true,
  }, capability), {
    ...capability,
    provider: "gmail",
    status: "scheduled",
    startAt: "2026-09-01T05:00:00.000Z",
    endAt: "2026-09-04T07:00:00.000Z",
    subject: "Out of office",
    message: "I will reply when I return.",
    audience: "internal_only",
  })
})

Deno.test("Outlook automatic replies map to the shared automatic reply contract", () => {
  assertEquals(automaticReplyDto("outlook", {
    automaticRepliesSetting: {
      status: "alwaysEnabled",
      externalAudience: "all",
      externalReplyMessage: "<p>I am away.</p>",
      internalReplyMessage: "<p>I am away.</p>",
    },
  }, capability), {
    ...capability,
    provider: "outlook",
    status: "always_on",
    startAt: null,
    endAt: null,
    subject: "",
    message: "I am away.",
    audience: "everyone",
  })
})

Deno.test("automatic reply updates validate content and schedule boundaries", () => {
  assertThrows(
    () => automaticReplyInput({ status: "always_on", audience: "everyone", message: "" }),
    Error,
    "Write the automatic reply",
  )
  assertThrows(
    () => automaticReplyInput({
      status: "scheduled",
      audience: "everyone",
      message: "I am away.",
      startAt: "2099-01-02T12:00:00.000Z",
      endAt: "2099-01-01T12:00:00.000Z",
    }),
    Error,
    "Choose an end time after the start time",
  )

  assertEquals(automaticReplyInput({
    status: "scheduled",
    audience: "internal_only",
    subject: "Away",
    message: "I am away.",
    startAt: "2099-01-01T12:00:00.000Z",
    endAt: "2099-01-02T12:00:00.000Z",
  }), {
    status: "scheduled",
    audience: "internal_only",
    subject: "Away",
    message: "I am away.",
    startAt: "2099-01-01T12:00:00.000Z",
    endAt: "2099-01-02T12:00:00.000Z",
  })
})
