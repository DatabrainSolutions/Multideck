import assert from "node:assert/strict"
import test from "node:test"
import {
  conversationBranchFor,
  type DexterBranchMessage,
} from "../src/lib/dexter-conversation-branches.ts"

type TestMessage = DexterBranchMessage & { content: string }

const message = (
  id: string,
  role: "user" | "assistant",
  content: string,
  options: Partial<TestMessage> = {},
): TestMessage => ({
  id,
  role,
  content,
  createdAt: `2026-07-31T00:00:${String(
    ["u1", "a1", "u2", "a2", "a1-v2", "u2-new", "a2-new", "a2-v2"].indexOf(id) + 1,
  ).padStart(2, "0")}Z`,
  ...options,
})

test("retrying the first prompt starts a fresh branch and preserves the original continuation", () => {
  const messages = [
    message("u1", "user", "First prompt"),
    message("a1", "assistant", "First answer", {
      responseToUserMessageId: "u1",
      responseVersion: 1,
    }),
    message("u2", "user", "Second prompt"),
    message("a2", "assistant", "Second answer", {
      responseToUserMessageId: "u2",
      responseVersion: 1,
    }),
    message("a1-v2", "assistant", "Retried first answer", {
      responseToUserMessageId: "u1",
      responseVersion: 2,
    }),
  ]

  assert.deepEqual(
    conversationBranchFor(messages, {}).map(({ id }) => id),
    ["u1", "a1-v2"],
  )
  assert.deepEqual(
    conversationBranchFor(messages, { u1: "a1" }).map(({ id }) => id),
    ["u1", "a1", "u2", "a2"],
  )
})

test("a continuation on the retried branch remains isolated from the original branch", () => {
  const messages = [
    message("u1", "user", "First prompt"),
    message("a1", "assistant", "First answer", {
      responseToUserMessageId: "u1",
      responseVersion: 1,
    }),
    message("u2", "user", "Original second prompt", { parentResponseMessageId: "a1" }),
    message("a2", "assistant", "Original second answer", {
      responseToUserMessageId: "u2",
      responseVersion: 1,
    }),
    message("a1-v2", "assistant", "Retried first answer", {
      responseToUserMessageId: "u1",
      responseVersion: 2,
    }),
    message("u2-new", "user", "New second prompt", { parentResponseMessageId: "a1-v2" }),
    message("a2-new", "assistant", "New second answer", {
      responseToUserMessageId: "u2-new",
      responseVersion: 1,
    }),
  ]

  assert.deepEqual(
    conversationBranchFor(messages, {}).map(({ id }) => id),
    ["u1", "a1-v2", "u2-new", "a2-new"],
  )
  assert.deepEqual(
    conversationBranchFor(messages, { u1: "a1" }).map(({ id }) => id),
    ["u1", "a1", "u2", "a2"],
  )
})

test("retrying the latest prompt keeps the earlier exchange at the top", () => {
  const messages = [
    message("u1", "user", "First prompt"),
    message("a1", "assistant", "First answer", {
      responseToUserMessageId: "u1",
      responseVersion: 1,
    }),
    message("u2", "user", "Second prompt", { parentResponseMessageId: "a1" }),
    message("a2", "assistant", "Second answer", {
      responseToUserMessageId: "u2",
      responseVersion: 1,
    }),
    message("a2-v2", "assistant", "Retried second answer", {
      responseToUserMessageId: "u2",
      responseVersion: 2,
    }),
  ]

  assert.deepEqual(
    conversationBranchFor(messages, {}).map(({ id }) => id),
    ["u1", "a1", "u2", "a2-v2"],
  )
  assert.deepEqual(
    conversationBranchFor(messages, { u2: "a2" }).map(({ id }) => id),
    ["u1", "a1", "u2", "a2"],
  )
})

test("a bounded history page renders when its first branch parent lives on an older page", () => {
  const pagedMessages = [
    message("u51", "user", "First prompt on this page", { parentResponseMessageId: "a50" }),
    message("a51", "assistant", "First answer on this page", {
      responseToUserMessageId: "u51",
      responseVersion: 1,
    }),
    message("u52", "user", "Next prompt", { parentResponseMessageId: "a51" }),
    message("a52", "assistant", "Next answer", {
      responseToUserMessageId: "u52",
      responseVersion: 1,
    }),
  ]

  assert.deepEqual(
    conversationBranchFor(pagedMessages, {}).map(({ id }) => id),
    ["u51", "a51", "u52", "a52"],
  )
})
