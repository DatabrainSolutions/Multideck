export function requiresExplicitActionApproval(actionCode, accessMode) {
  return actionCode === "send_email" || accessMode === "approve"
}
