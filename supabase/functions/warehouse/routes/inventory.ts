// @ts-nocheck
import {
  HttpError,
  boundedPage,
  clean,
  companyFacilityIds,
  requireCapability,
} from "../shared/mod.ts";

export async function handleInventory(path, url, admin, actor) {
  requireCapability(actor, "warehouse_inventory:read");

  const facilityIds = await companyFacilityIds(admin, actor);
  const requestedFacility = clean(url.searchParams.get("facilityId"));
  const allowed = requestedFacility
    ? facilityIds.filter((value) => value === requestedFacility)
    : facilityIds;
  const mode = path[1] === "movements"
    ? "movements"
    : path[1] === "exceptions"
      ? "exceptions"
      : !path[1]
        ? "stock"
        : null;

  if (!mode) {
    throw new HttpError(404, "Warehouse inventory endpoint not found.");
  }
  if (!url.searchParams.has("limit")) {
    throw new HttpError(400, "Warehouse inventory lists require bounded paging.");
  }
  if (path[1] === "exceptions" && !actor.companyId) {
    throw new HttpError(403, "Warehouse exceptions are available only to the warehouse team.");
  }

  const { limit, offset } = boundedPage(url);
  if (!allowed.length) return { rows: [], total: 0, limit, offset, facets: [] };

  const { data, error } = await admin.rpc("warehouse_edge_inventory_page", {
    p_allowed_facility_ids: allowed,
    p_allowed_org_ids: actor.companyId ? null : Array.from(actor.organisationIds),
    p_mode: mode,
    p_item_id: clean(url.searchParams.get("itemId")),
    p_search: clean(url.searchParams.get("search"), 160),
    p_facet: clean(url.searchParams.get("facet"), 80),
    p_include_zero: url.searchParams.get("includeZero") === "true",
    p_open_only: url.searchParams.get("openOnly") !== "false",
    p_status_code: clean(url.searchParams.get("statusCode"), 60),
    p_sort: clean(url.searchParams.get("sort"), 60),
    p_direction: url.searchParams.get("direction") === "asc" ? "asc" : "desc",
    p_limit: limit,
    p_offset: offset,
  });

  if (!error) return data ?? { rows: [], total: 0, limit, offset, facets: [] };
  if (["42883", "PGRST202"].includes(error.code ?? "")) {
    throw new HttpError(503, "Warehouse inventory paging is still being prepared. Try again shortly.");
  }
  throw new HttpError(500, error.message);
}
