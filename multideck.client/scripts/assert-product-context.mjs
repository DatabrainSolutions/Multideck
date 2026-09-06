import { productContextIssues } from "./product-context.mjs"

const issues = productContextIssues(process.env)
if (issues.length) {
  for (const message of issues) console.error(`Multideck App build blocked: ${message}`)
  if (process.env.VERCEL === "1") {
    console.error("Check this deployment's environment and exact Git branch scope in Vercel. Variables scoped to another Preview branch do not apply here.")
    console.error("Use the approved deployment environment, or ask the project owner to approve branch-specific configuration. Do not disable this guard, copy another tenant's credentials, or broaden shared settings to bypass it.")
  }
  process.exit(1)
}
