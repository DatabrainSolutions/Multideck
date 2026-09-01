export function requiresExplicitActionApproval(actionCode, accessMode) {
  return accessMode === "approve" || [
    "send_email",
    "create_support_ticket",
    "create_purchase_order",
  ].includes(actionCode)
}
