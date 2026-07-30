import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./copy-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 3,
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()

await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(900)
await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })

// The KPI strip holds the values narrower than the word "Copied".
const strip = page.locator("div.grid.grid-cols-2").first()

await strip.screenshot({ path: `${out}zoom-0-idle.png` })

await page.evaluate(() => {
  document.querySelectorAll('[data-slot="copyable-field"] button').forEach((button) => button.click())
})

for (const [index, delay] of [80, 90, 110, 160, 300].entries()) {
  await page.waitForTimeout(index === 0 ? delay : delay - [80, 90, 110, 160, 300][index - 1])
  await strip.screenshot({ path: `${out}zoom-1-t${delay}.png` })
}

await page.waitForTimeout(600)
await strip.screenshot({ path: `${out}zoom-2-settled.png` })
await page.waitForTimeout(1400)
await strip.screenshot({ path: `${out}zoom-3-reverting.png` })
await page.waitForTimeout(900)
await strip.screenshot({ path: `${out}zoom-4-rest.png` })

await browser.close()
