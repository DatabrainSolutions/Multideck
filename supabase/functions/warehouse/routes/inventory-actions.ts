// @ts-nocheck
import { bodyObject, companyFacilityIds, HttpError, requireInternalWarehouseWrite } from "../shared/mod.ts";

const actions = new Set([
  "create_hu",
  "move_balance",
  "move_hu",
  "consolidate",
  "change_status",
  "sample",
  "report_empty",
  "resolve_location_exception",
]);

export async function handleInventoryAction(request, path, admin, actor) {
  requireInternalWarehouseWrite(actor);
  if (request.method !== "POST" || path[1] !== "actions" || !actions.has(path[2])) {
    throw new HttpError(404, "Warehouse inventory action not found.");
  }
  const input = bodyObject(await request.json());
  const facilityIds = await companyFacilityIds(admin, actor);
  const facilityId = String(input.facilityId ?? "").trim();
  if (!facilityIds.includes(facilityId)) {
    throw new HttpError(403, "Choose a warehouse in your workspace.");
  }
  const { data, error } = await admin.rpc("warehouse_edge_inventory_mutation", {
    p_action: path[2],
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
  });
  if (error) {
    const match = error.message.match(/WMS(400|403|404|409|500):\s*(.*)$/s);
    throw new HttpError(match ? Number(match[1]) : 500, match?.[2] ?? "The inventory action could not be completed.");
  }
  return data;
}
