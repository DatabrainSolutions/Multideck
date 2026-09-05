import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const shell = await readFile(
  new URL("../src/components/multideck/app-shell.tsx", import.meta.url),
  "utf8",
)
const notificationApi = await readFile(
  new URL("../src/lib/notification-api.ts", import.meta.url),
  "utf8",
)
const responseMigration = await readFile(
  new URL("../../supabase/migrations/20260903100000_customer_response_reason_audit.sql", import.meta.url),
  "utf8",
)

test("customer quote responses enter one global FIFO popup queue", () => {
  assert.match(shell, /function CustomerResponseNotificationQueue/u)
  assert.match(shell, /event: "INSERT"/u)
  assert.match(shell, /table: "Comm_Notifications"/u)
  assert.match(shell, /notification\.metadata\.event_type !== "quote_response"/u)
  assert.match(shell, /Date\.parse\(left\.createdAt\) - Date\.parse\(right\.createdAt\)/u)
  assert.match(shell, /const active = queue\[0\] \?\? null/u)
  assert.match(shell, /setQueue\(\(current\) => current\.slice\(1\)\)/u)
  assert.match(shell, /<CustomerResponseNotificationQueue currentUser=\{currentUser\} navigate=\{navigate\} route=\{route\} \/>/u)
})

test("the popup times out independently while the existing bell remains unchanged", () => {
  assert.match(shell, /window\.setTimeout\(advance, 5_500\)/u)
  assert.match(shell, /if \(!active \|\| waitingForRoute\) return/u)
  assert.doesNotMatch(shell, /markWorkspaceNotificationRead\(active\.id\)[\s\S]{0,160}window\.setTimeout\(advance, 5_500\)/u)
  assert.doesNotMatch(shell, /function NotificationBell/u)
})

test("dismiss and read mutations retry without blocking the next response", () => {
  assert.match(shell, /for \(const delay of \[0, 500, 1_500\]\)/u)
  assert.match(shell, /retryNotificationAction\(\(\) => dismissWorkspaceNotification\(active\.id\)\)/u)
  assert.match(shell, /retryNotificationAction\(\(\) => markWorkspaceNotificationRead\(active\.id\)\)/u)
  assert.match(notificationApi, /export async function dismissWorkspaceNotification/u)
  assert.match(notificationApi, /export async function markWorkspaceNotificationRead/u)
})

test("realtime reconnect and cleanup cannot recursively remove the same channel", () => {
  assert.match(shell, /const nextChannel = client/u)
  assert.match(shell, /if \(disposed \|\| channel !== nextChannel \|\| status === "SUBSCRIBED"\) return/u)
  assert.match(shell, /channel = null\s+if \(status !== "CLOSED"\) void client\.removeChannel\(nextChannel\)/u)
  assert.match(shell, /const activeChannel = channel\s+channel = null\s+if \(activeChannel\) void client\.removeChannel\(activeChannel\)/u)
  assert.doesNotMatch(shell, /if \(channel\) void client\.removeChannel\(channel\)/u)
})

test("opening a response waits for the quote route before advancing the queue", () => {
  assert.match(shell, /setWaitingForRoute\(actionUrl\)/u)
  assert.match(shell, /navigate\(actionUrl\)/u)
  assert.match(shell, /if \(!waitingForRoute \|\| route !== waitingForRoute\) return/u)
  assert.match(shell, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*window\.requestAnimationFrame\(advance\)/u)
})

test("customer-response records carry the quote action and decision metadata", () => {
  assert.match(responseMigration, /'event_type', 'quote_response'/u)
  assert.match(responseMigration, /'action_url', '\/quotes\/'/u)
  assert.match(responseMigration, /'decision', decision_value/u)
  assert.match(responseMigration, /'quote_response'/u)
})
