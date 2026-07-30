import { chromium } from "playwright"

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })

// The control must not drift vertically while the value swaps to "Copied" and back.
const rows = await page.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const fields = [...document.querySelectorAll('[data-slot="copyable-field"]')]
  const results = []

  for (const field of fields) {
    const button = field.querySelector("button")
    const offsets = new Set([button.style.marginBlockStart])
    button.click()
    for (let tick = 0; tick < 55; tick += 1) {
      offsets.add(button.style.marginBlockStart)
      await wait(45)
    }
    results.push({
      label: button.getAttribute("aria-label")?.replace(/^Copy /, "").replace(/: Copied$/, ""),
      offsets: [...offsets],
      drifted: offsets.size > 1,
    })
    await wait(150)
  }
  return results
})

const drifted = rows.filter((r) => r.drifted)
console.log(`fields checked: ${rows.length}`)
console.log("CONTROL DRIFTED DURING COPY:", drifted.length ? JSON.stringify(drifted, null, 2) : "none")

await browser.close()
