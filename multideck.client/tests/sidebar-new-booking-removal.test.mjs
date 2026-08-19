import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("New booking remains a workflow route but is not a sidebar destination", async () => {
  const navigation = await readFile(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")

  assert.doesNotMatch(navigation, /label: "New booking"[^\n]+route: "\/bookings\/new"/)
  assert.match(app, /route === "\/bookings\/new"/)
})
