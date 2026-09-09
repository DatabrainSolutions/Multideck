import { chromium } from "playwright"

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)

// How much permanently-promoted content is sitting on the page at rest?
const cost = await page.evaluate(() => {
  const chars = [...document.querySelectorAll("[data-slot-char]")]
  const promoted = chars.filter((c) => c.style.willChange && c.style.willChange !== "auto")
  return {
    totalCharacterSpans: chars.length,
    withWillChange: promoted.length,
    totalElements: document.querySelectorAll("*").length,
  }
})
console.log("STATIC COST:", cost)

// Which effect does each field resolve to?
const effects = await page.evaluate(() => {
  const counts = {}
  document.querySelectorAll('[data-slot="copy-feedback-transition"]').forEach((root) => {
    counts[root.dataset.effect] = (counts[root.dataset.effect] ?? 0) + 1
  })
  const wipes = [...document.querySelectorAll('[data-slot="copyable-field"]')]
    .filter((f) => f.querySelector('[data-slot="copy-feedback-transition"]').dataset.effect === "wipe")
    .map((f) => f.querySelector("button").getAttribute("aria-label")?.replace(/^Copy /, ""))
  return { counts, wipes }
})
console.log("EFFECTS:", JSON.stringify(effects, null, 2))

// Trace one short field character by character, looking for jumps between frames.
const trace = await page.evaluate(async () => {
  const field = [...document.querySelectorAll('[data-slot="copyable-field"]')]
    .find((f) => f.querySelector("button").getAttribute("aria-label") === "Copy Owner")
  const layer = field.querySelector('[data-copy-layer="original"]')
  const samples = []

  field.querySelector("button").click()
  const startedAt = performance.now()
  await new Promise((resolve) => {
    const tick = () => {
      const first = layer.querySelector("[data-slot-char]")
      const style = getComputedStyle(first)
      samples.push({
        t: Math.round(performance.now() - startedAt),
        opacity: Number(Number(style.opacity).toFixed(2)),
        transform: style.transform,
        filter: style.filter,
      })
      if (performance.now() - startedAt < 700) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  return samples
})

// Report the translate value per frame so a discontinuity is obvious.
const translated = trace.map((s) => {
  const match = /matrix\([^)]*,\s*([-\d.]+)\)/.exec(s.transform)
  return { t: s.t, y: match ? Number(match[1]).toFixed(1) : s.transform, opacity: s.opacity, filter: s.filter }
})
console.log("FIRST CHARACTER OVER TIME (t, translateY, opacity, filter):")
console.log(translated.slice(0, 26).map((s) => `${String(s.t).padStart(4)}ms  y=${String(s.y).padStart(7)}  o=${s.opacity}  ${s.filter}`).join("\n"))

await browser.close()
