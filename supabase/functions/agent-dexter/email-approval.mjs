export function requiresExplicitActionApproval(actionCode, accessMode) {
  return accessMode === "approve" || [
    "send_email",
    "create_support_ticket",
    "create_purchase_order",
    "update_booking_cargo",
    "update_booking_container",
    "update_booking_route",
    "change_booking_route_mode",
    "update_booking_shipment_value",
    "update_quote_cargo",
  ].includes(actionCode)
}
