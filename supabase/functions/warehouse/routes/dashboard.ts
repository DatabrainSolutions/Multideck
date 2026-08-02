import { HttpError, requireCapability } from "../shared/mod.ts";

export async function handleDashboard(admin, actor) {
  requireCapability(actor, "warehouse_orders:read");
  requireCapability(actor, "warehouse_inventory:read");

  const { data, error } = await admin.rpc("warehouse_edge_dashboard", {
    p_company_id: actor.companyId,
    p_allowed_organisation_ids: [...actor.organisationIds],
    p_allowed_facility_ids: [...actor.facilityIds],
    p_movement_take: 50
  });

  if (error) {
    throw new HttpError(500, error.message);
  }

  return data ?? {
    orders: [],
    metrics: { onHandSkus: 0, availableSkus: 0, heldBalances: 0 },
    movements: []
  };
}
