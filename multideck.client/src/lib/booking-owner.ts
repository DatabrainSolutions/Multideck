import type { BookingWorkflowWorkspace } from "./booking-workflow-api"

/** A viewer is never evidence of ownership. Keep legacy saved names until migrated. */
export function bookingOwnerLabel(workspace: BookingWorkflowWorkspace): string {
  const legacy = workspace.booking.editableDetails?.ownerName
  return workspace.ownership?.owner || workspace.booking.operationsOwner
    || (typeof legacy === "string" ? legacy : "") || "Unassigned"
}
