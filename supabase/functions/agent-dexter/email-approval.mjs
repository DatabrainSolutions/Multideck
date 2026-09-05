export function requiresExplicitActionApproval(actionCode, accessMode) {
  return accessMode === "approve" || [
    "send_email",
    "create_support_ticket",
    "create_purchase_order",
    "update_booking_cargo",
    "update_booking_container",
    "update_booking_route",
  ].includes(actionCode)
}
