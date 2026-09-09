import { chromium } from "playwright"

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(900)
await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })

// Sample how much of each layer is actually on screen through a full copy -> revert cycle.
// "Ink" is the summed opacity of the animated pieces, so 0 means the value vanished entirely.
async function trace(index) {
  return page.evaluate(async (i) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const field = document.querySelectorAll('[data-slot="copyable-field"]')[i]
    const root = field.querySelector('[data-slot="copy-feedback-transition"]')
    const original = root.querySelector('[data-copy-layer="original"]')
    const copied = root.querySelector('[data-copy-layer="copied"]')

    const inkOf = (layer) => {
      const pieces = layer.querySelectorAll(".inline-block .inline-block")
      if (!pieces.length) return Number(getComputedStyle(layer).opacity)
      let total = 0
      pieces.forEach((piece) => { total += Number(getComputedStyle(piece).opacity) })
      return total / pieces.length
    }

    const samples = []
    field.querySelector("button").click()
    const startedAt = performance.now()
    while (performance.now() - startedAt < 2600) {
      samples.push({
        t: Math.round(performance.now() - startedAt),
        original: Number(inkOf(original).toFixed(2)),
        copied: Number(inkOf(copied).toFixed(2)),
      })
      await wait(40)
    }

    const label = field.querySelector("button").getAttribute("aria-label")
    const blank = samples.filter((s) => s.original + s.copied < 0.15)
    return {
      label: label?.replace(/^Copy /, "").replace(/: Copied$/, ""),
      effect: root.dataset.effect,
      blankFrames: blank.length,
      longestBlankMs: blank.length ? (blank.at(-1).t - blank[0].t) : 0,
      peakCopied: Math.max(...samples.map((s) => s.copied)),
      endedOnOriginal: samples.at(-1).original > 0.9,
    }
  }, index)
}

const count = await page.locator('[data-slot="copyable-field"]').count()
const rows = []
for (let i = 0; i < count; i += 1) {
  rows.push(await trace(i))
  await page.waitForTimeout(200)
}

console.table(rows)
const bad = rows.filter((r) => r.blankFrames > 2 || r.peakCopied < 0.9 || !r.endedOnOriginal)
console.log("PROBLEM FIELDS:", bad.length ? JSON.stringify(bad, null, 2) : "none")

await browser.close()
