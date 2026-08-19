import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const workspace = await readFile(new URL("../src/lib/inbox-workspace.tsx", import.meta.url), "utf8")
const shell = await readFile(new URL("../src/components/multideck/app-shell.tsx", import.meta.url), "utf8")
const sidebar = await readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const page = await readFile(new URL("../src/pages/inbox-page.tsx", import.meta.url), "utf8")

test("Inbox account bootstrap is intent-driven and deduplicated", () => {
  assert.match(workspace, /active: boolean/)
  assert.match(workspace, /accountRequestRef = useRef<\{ scope: string; promise: Promise<Mailbox\[\] \| null> \} \| null>/)
  assert.match(workspace, /if \(pending\?\.scope === requestScope\) return pending\.promise/)
  assert.match(workspace, /const prepareAccounts = useCallback\(\(\) => loadAccounts\(false\)/)
  assert.match(workspace, /if \(!active \|\| !cacheScope\) return\s+void prepareAccounts\(\)/)
  assert.doesNotMatch(
    workspace.slice(workspace.indexOf("setConnections([])"), workspace.indexOf("function rememberDefaultProvider")),
    /refreshAccounts\(\)/,
  )
})

test("thread rows warm only for the active Inbox route", () => {
  assert.match(workspace, /if \(!active \|\| accountState !== "ready" \|\| !mailboxId\) return/)
  assert.match(shell, /InboxWorkspaceProvider cacheScope=\{currentUser\?\.id \?\? null\} active=\{isInboxRoute\}/)
  assert.match(sidebar, /void inboxWorkspace\?\.prepareAccounts\(\)[\s\S]{0,160}import\("@\/pages\/inbox-page"\)/)
  assert.match(page, /accountState === "idle" \|\| accountState === "loading"/)
})
