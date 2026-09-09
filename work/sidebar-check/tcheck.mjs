import { chromium } from "playwright"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, permissions: ["clipboard-read", "clipboard-write"] })
const page = await context.newPage()
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
const out = await page.evaluate(async () => {
  const field = [...document.querySelectorAll('[data-slot="copyable-field"]')]
    .find((f) => f.querySelector("button").getAttribute("aria-label") === "Copy Owner")
  const layer = field.querySelector('[data-copy-layer="original"]')
  const first = layer.querySelector("[data-slot-char]")
  const samples = []
  field.querySelector("button").click()
  const t0 = performance.now()
  await new Promise((r) => {
    const tick = () => {
      const s = getComputedStyle(first)
      samples.push({ t: Math.round(performance.now() - t0), translate: s.translate, opacity: Number(s.opacity).toFixed(2) })
      performance.now() - t0 < 300 ? requestAnimationFrame(tick) : r()
    }
    requestAnimationFrame(tick)
  })
  return samples
})
console.log(out.slice(0, 12).map((s) => `${String(s.t).padStart(4)}ms  translate=${String(s.translate).padStart(14)}  opacity=${s.opacity}`).join("\n"))
await browser.close()
