import { HttpError, companyFacilityIds, requireCapability } from "../shared/mod.ts";

const missingReadModel = (error) => ["42883", "PGRST202"].includes(error?.code ?? "");

export async function handleDashboard(admin, actor, pathSegment = null, url = null) {
  requireCapability(actor, "warehouse_orders:read");
  requireCapability(actor, "warehouse_inventory:read");

  if (pathSegment === "summary") {
    const { data, error } = await admin.rpc("warehouse_edge_dashboard_summary", {
      p_company_id: actor.companyId,
      p_allowed_organisation_ids: [...actor.organisationIds],
      p_allowed_facility_ids: [...actor.facilityIds]
    });
    if (!error) return data ?? { readyToReceive: 0, readyToDispatch: 0, stockHolds: 0 };
    if (!missingReadModel(error)) throw new HttpError(500, error.message);
    throw new HttpError(503, "Warehouse dashboard summary paging is still being prepared. Try again shortly.");
  }

  const mode = url?.searchParams.get("mode");
  if (mode === "overview" || mode === "calendar") {
    const facilityIds = await companyFacilityIds(admin, actor);
    const organisationIds = actor.companyId ? null : Array.from(actor.organisationIds);
    if (!facilityIds.length) {
      return {
        orders: [], movements: [], calendarTotal: 0, calendarLimit: mode === "calendar" ? 500 : 0,
        metrics: { readyToReceive: 0, readyToDispatch: 0, stockHolds: 0, pastDue: 0, bookedToday: 0, onHandSkus: 0, availableSkus: 0 }
      };
    }

    if (mode === "calendar") {
      const start = url?.searchParams.get("start") ?? "";
      const end = url?.searchParams.get("end") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        throw new HttpError(400, "Choose a valid calendar period.");
      }
      const durationDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
      if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 45) {
        throw new HttpError(400, "Warehouse calendar periods must cover between 1 and 45 days.");
      }
      const { data, error } = await admin.rpc("warehouse_edge_calendar_page", {
        p_allowed_facility_ids: facilityIds,
        p_allowed_org_ids: organisationIds,
        p_start_date: start,
        p_end_date: end,
        p_limit: 500,
        p_offset: 0
      });
      if (!error) {
        const page = data ?? { rows: [], total: 0, limit: 500, offset: 0 };
        return { orders: page.rows ?? [], metrics: {}, movements: [], calendarTotal: page.total ?? 0, calendarLimit: page.limit ?? 500 };
      }
      if (!missingReadModel(error)) throw new HttpError(500, error.message);
      throw new HttpError(503, "Warehouse calendar paging is still being prepared. Try again shortly.");
    } else {
      const [summary, orderPage, movementPage] = await Promise.all([
        admin.rpc("warehouse_edge_dashboard_summary", {
          p_company_id: actor.companyId,
          p_allowed_organisation_ids: [...actor.organisationIds],
          p_allowed_facility_ids: [...actor.facilityIds]
        }),
        admin.rpc("warehouse_edge_orders_page", {
          p_allowed_facility_ids: facilityIds,
          p_allowed_org_ids: organisationIds,
          p_facility_id: null,
          p_type_code: null,
          p_status: null,
          p_open_only: true,
          p_search: null,
          p_sort: "expected",
          p_direction: "asc",
          p_limit: 5,
          p_offset: 0
        }),
        admin.rpc("warehouse_edge_inventory_page", {
          p_allowed_facility_ids: facilityIds,
          p_allowed_org_ids: organisationIds,
          p_mode: "movements",
          p_item_id: null,
          p_search: null,
          p_facet: null,
          p_include_zero: false,
          p_open_only: true,
          p_status_code: null,
          p_sort: null,
          p_direction: "desc",
          p_limit: 50,
          p_offset: 0
        })
      ]);
      const firstRealError = [summary, orderPage, movementPage].find((result)=>result.error && !missingReadModel(result.error))?.error;
      if (firstRealError) throw new HttpError(500, firstRealError.message);
      if (![summary, orderPage, movementPage].some((result)=>missingReadModel(result.error))) {
        return {
          orders: orderPage.data?.rows ?? [],
          metrics: summary.data ?? {},
          movements: movementPage.data?.rows ?? []
        };
      }
      throw new HttpError(503, "Warehouse dashboard paging is still being prepared. Try again shortly.");
    }
  }
  throw new HttpError(400, "Choose a bounded warehouse dashboard mode.");
}
