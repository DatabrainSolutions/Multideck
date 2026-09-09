import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./copy-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 3 })
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })

// Measure against the topmost rendered text rect rather than the block, which is what the
// earlier metric got wrong for values built from two stacked lines.
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="copyable-field"]')].map((field) => {
    const layer = field.querySelector('[data-copy-layer="original"]')
    const button = field.querySelector("button")
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
    let top = Infinity
    let bottom = -Infinity
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.height <= 0) continue
        if (rect.top < top) { top = rect.top; bottom = rect.bottom }
      }
      range.detach()
    }
    if (!Number.isFinite(top)) return null
    const box = button.getBoundingClientRect()
    return {
      label: button.getAttribute("aria-label")?.replace(/^Copy /, ""),
      offsetFromFirstLine: Math.round((box.top + box.height / 2) - (top + bottom) / 2),
    }
  }).filter(Boolean))

const misaligned = rows.filter((r) => Math.abs(r.offsetFromFirstLine) > 4)
console.log(`fields: ${rows.length}`)
console.log("OFF FIRST LINE BY MORE THAN 4px:", misaligned.length ? JSON.stringify(misaligned, null, 2) : "none")

for (const [name, selector] of [
  ["leadvalue", "Lead value"],
  ["activitynote", "Activity note"],
]) {
  const field = page.locator(`[data-slot="copyable-field"]:has(button[aria-label="Copy ${selector}"])`).first()
  await field.screenshot({ path: `${out}firstline-${name}.png` }).catch(() => {})
}

await browser.close()
