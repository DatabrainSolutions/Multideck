// Isolated UI verification, explicitly not an authenticated tenant workflow.
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "../src/i18n/language-provider"
import { FinanceMigrationPanel } from "../src/pages/finance-migration-panel"

export function mountMigrationPreviewTest() {
  const host = document.createElement("div")
  host.id = "migration-preview-test"
  host.style.cssText = "position:fixed;inset:0;z-index:10000;overflow:auto;background:var(--md-bg);padding:24px;"
  document.body.append(host)
  const root = createRoot(host)
  root.render(<LanguageProvider><p className="mb-4 text-sm">Isolated component test. No tenant data is being imported.</p><FinanceMigrationPanel entityId="11111111-1111-4111-8111-111111111111" baseCurrency="GBP" chartDirty={false} /></LanguageProvider>)
  return () => { root.unmount(); host.remove() }
}

export function selectTrialBalanceFixture() {
  const input = document.querySelector<HTMLInputElement>('#migration-preview-test input[type="file"]')
  if (!input) throw new Error("Open the migration preview first.")
  const file = new File(["Code,Debit,Credit\n0010.00.00,100,0\n3000.00.00,0,100\n"], "browser-test-trial-balance.csv", { type: "text/csv" })
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files
  input.dispatchEvent(new Event("change", { bubbles: true }))
}
