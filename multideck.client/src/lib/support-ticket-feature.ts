// Multideck App deployments are tenant-specific, so this build-time flag is
// the tenant UI rollout boundary. Development remains available for local QA;
// production builds fail closed until the tenant is explicitly enabled.
export function resolveSupportTicketFeatureEnabled(development: boolean, configuredValue: string | undefined) {
  return development || configuredValue === "true"
}

export const supportTicketFeatureEnabled = resolveSupportTicketFeatureEnabled(
  Boolean(import.meta.env?.DEV),
  import.meta.env?.VITE_MULTIDECK_SUPPORT_TICKETS_ENABLED,
)
