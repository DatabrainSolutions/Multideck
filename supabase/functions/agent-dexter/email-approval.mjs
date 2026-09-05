export function requiresExplicitActionApproval(actionCode, accessMode) {
  return accessMode === "approve" || [
    "send_email",
    "create_support_ticket",
    "create_purchase_order",
    "update_booking_cargo",
  ].includes(actionCode)
}
