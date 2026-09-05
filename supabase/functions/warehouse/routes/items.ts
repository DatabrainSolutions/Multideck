
// @ts-nocheck
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  bodyObject,
  bool,
  boundedPage,
  clean,
  companyFacilityIds,
  cors,
  id,
  many,
  numberOrNull,
  one,
  oneOrNull,
  requireCapability,
  requireCustomerScope,
  required,
  uuid,
} from "../shared/mod.ts";

function mapItem(row, orgNames, facilityNames, uoms = [], assignments = []) {
  return {
    id: row.WMSItem_ID,
    customerOrgId: row.WMSItem_CustomerOrgID,
    customerOrgName: orgNames.get(row.WMSItem_CustomerOrgID) ?? null,
    facilityId: row.WMSItem_DefaultFacilityID,
    facilityName: facilityNames.get(row.WMSItem_DefaultFacilityID) ?? null,
    facilities: assignments.filter((assignment)=>assignment.WMSItemFacility_ItemID === row.WMSItem_ID).map((assignment)=>({
      id: assignment.WMSItemFacility_FacilityID,
      code: assignment.facilityCode ?? "",
      name: assignment.facilityName ?? "",
      isDefault: assignment.WMSItemFacility_IsDefault,
      isActive: assignment.WMSItemFacility_IsActive
    })),
    sku: row.WMSItem_SKU,
    description: row.WMSItem_Description,
    commodityDescription: row.WMSItem_CommodityDescription,
    hsCode: row.WMSItem_HSCode,
    countryOfOriginCode: row.WMSItem_CountryOfOriginCode,
    baseUomCode: row.WMSItem_BaseUOMCode,
    quantityBasisCode: row.WMSItem_QuantityBasisCode ?? "count",
    quantityScale: row.WMSItem_QuantityScale ?? 0,
    minimumMovementQuantity: row.WMSItem_MinimumMovementQuantity ?? 1,
    allowsFractionalQuantity: row.WMSItem_AllowsFractionalQuantity ?? false,
    uoms: uoms.filter((uom)=>uom.WMSItemUOM_ItemID === row.WMSItem_ID).map((uom)=>({
        id: uom.WMSItemUOM_ID,
        code: uom.WMSItemUOM_UOMCode,
        quantityInBaseUom: uom.WMSItemUOM_QuantityInBaseUOM,
        grossWeightKg: uom.WMSItemUOM_GrossWeightKG,
        purchasing: uom.WMSItemUOM_IsPurchasingUOM,
        stocking: uom.WMSItemUOM_IsStockingUOM,
        selling: uom.WMSItemUOM_IsSellingUOM
      })),
    lengthM: row.WMSItem_LengthM,
    widthM: row.WMSItem_WidthM,
    heightM: row.WMSItem_HeightM,
    netWeightKg: row.WMSItem_NetWeightKG,
    grossWeightKg: row.WMSItem_GrossWeightKG,
    isDangerousGoods: row.WMSItem_IsDangerousGoods,
    isExciseGoods: row.WMSItem_IsExciseGoods,
    isHighValue: row.WMSItem_IsHighValue,
    isBondedEligible: row.WMSItem_IsBondedEligible,
    requiresLot: row.WMSItem_RequiresLot,
    requiresSerial: row.WMSItem_RequiresSerial,
    requiresExpiry: row.WMSItem_RequiresExpiry,
    temperatureMinC: row.WMSItem_TemperatureMinC,
    temperatureMaxC: row.WMSItem_TemperatureMaxC,
    isActive: row.WMSItem_IsActive,
    createdAt: row.WMSItem_CreatedAt,
    updatedAt: row.WMSItem_UpdatedAt
  };
}

async function loadExactItem(admin, actor, itemId) {
  requireCapability(actor, "warehouse_items:read");
  const facilityIds = await companyFacilityIds(admin, actor);
  if (!facilityIds.length) return null;

  const assignmentRows = await many(admin.from("WMS_ItemFacilityAssignments")
    .select("*")
    .eq("WMSItemFacility_ItemID", itemId)
    .in("WMSItemFacility_FacilityID", facilityIds)
    .eq("WMSItemFacility_IsActive", true));
  if (!assignmentRows.length) return null;

  let query = admin.from("WMS_Items")
    .select("*")
    .eq("WMSItem_ID", itemId)
    .eq("WMSItem_IsDeleted", false)
    .limit(1);
  if (!actor.companyId) query = query.in("WMSItem_CustomerOrgID", [...actor.organisationIds]);
  const item = await oneOrNull(query.maybeSingle());
  if (!item) return null;

  const [uoms, organisation, facilities] = await Promise.all([
    many(admin.from("WMS_ItemUOMs").select("*").eq("WMSItemUOM_ItemID", item.WMSItem_ID).order("WMSItemUOM_UOMCode")),
    oneOrNull(admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", item.WMSItem_CustomerOrgID).limit(1).maybeSingle()),
    many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", assignmentRows.map((row)=>row.WMSItemFacility_FacilityID))),
  ]);
  const facilityMap = new Map(facilities.map((row)=>[row.WMSFacility_ID,row]));
  const assignments = assignmentRows.map((row)=>({ ...row, facilityCode: facilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Code, facilityName: facilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Name }));
  return { item, uoms, organisation, facility: facilityMap.get(item.WMSItem_DefaultFacilityID) ?? null, assignments, facilityIds };
}

function mapExactItem(context) {
  return mapItem(
    context.item,
    new Map(context.organisation ? [[context.organisation.Org_id, context.organisation.Org_Name]] : []),
    new Map(context.facility ? [[context.facility.WMSFacility_ID, context.facility.WMSFacility_Name]] : []),
    context.uoms,
    context.assignments,
  );
}

async function enrichItemFacilities(admin, rows, allowedFacilityIds) {
  if (!rows.length) return rows;
  const assignments = await many(admin.from("WMS_ItemFacilityAssignments").select("*").in("WMSItemFacility_ItemID", rows.map((row)=>row.id)).in("WMSItemFacility_FacilityID", allowedFacilityIds).eq("WMSItemFacility_IsActive", true));
  const facilityIds = [...new Set(assignments.map((row)=>row.WMSItemFacility_FacilityID))];
  const facilities = facilityIds.length ? await many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", facilityIds)) : [];
  const facilityMap = new Map(facilities.map((row)=>[row.WMSFacility_ID,row]));
  return rows.map((row)=>({
    ...row,
    facilities: assignments.filter((assignment)=>assignment.WMSItemFacility_ItemID===row.id).map((assignment)=>({ id: assignment.WMSItemFacility_FacilityID, code: facilityMap.get(assignment.WMSItemFacility_FacilityID)?.WMSFacility_Code ?? "", name: facilityMap.get(assignment.WMSItemFacility_FacilityID)?.WMSFacility_Name ?? "", isDefault: assignment.WMSItemFacility_IsDefault, isActive: assignment.WMSItemFacility_IsActive }))
  }));
}
function itemPayload(input, actor, create) {
  const net = numberOrNull(input.netWeightKg), gross = numberOrNull(input.grossWeightKg), min = numberOrNull(input.temperatureMinC), max = numberOrNull(input.temperatureMaxC);
  const quantityBasis = clean(input.quantityBasisCode, 20)?.toLowerCase() ?? "count";
  const quantityScale = Number.isInteger(Number(input.quantityScale)) ? Number(input.quantityScale) : 3;
  const minimumMovement = numberOrNull(input.minimumMovementQuantity) ?? (quantityBasis === "count" ? 1 : 0.001);
  if (!new Set(["count", "weight", "volume"]).has(quantityBasis)) throw new HttpError(400, "Choose count, weight, or volume tracking.");
  if (quantityScale < 0 || quantityScale > 6 || minimumMovement <= 0) throw new HttpError(400, "Check the quantity precision and minimum movement quantity.");
  if (net !== null && gross !== null && gross < net) {
    throw new HttpError(400, "Gross weight cannot be less than net weight.");
  }
  if (min !== null && max !== null && max < min) {
    throw new HttpError(400, "Maximum temperature cannot be below the minimum temperature.");
  }
  return {
    WMSItem_SKU: required(input.sku, "Enter an SKU.", "sku", 120),
    WMSItem_Description: required(input.description, "Enter an item description.", "description", 240),
    WMSItem_CommodityDescription: clean(input.commodityDescription, 500),
    WMSItem_HSCode: clean(input.hsCode, 30),
    WMSItem_CountryOfOriginCode: clean(input.countryOfOriginCode, 2)?.toUpperCase() ?? null,
    WMSItem_BaseUOMCode: clean(input.baseUomCode, 20)?.toUpperCase() ?? "EA",
    WMSItem_QuantityBasisCode: quantityBasis,
    WMSItem_QuantityScale: quantityScale,
    WMSItem_MinimumMovementQuantity: minimumMovement,
    WMSItem_AllowsFractionalQuantity: quantityBasis === "count" ? bool(input.allowsFractionalQuantity) : true,
    WMSItem_LengthM: numberOrNull(input.lengthM),
    WMSItem_WidthM: numberOrNull(input.widthM),
    WMSItem_HeightM: numberOrNull(input.heightM),
    WMSItem_NetWeightKG: net,
    WMSItem_GrossWeightKG: gross,
    WMSItem_IsDangerousGoods: bool(input.isDangerousGoods),
    WMSItem_IsExciseGoods: bool(input.isExciseGoods),
    WMSItem_IsHighValue: bool(input.isHighValue),
    WMSItem_IsBondedEligible: bool(input.isBondedEligible),
    WMSItem_RequiresLot: bool(input.requiresLot),
    WMSItem_RequiresSerial: bool(input.requiresSerial),
    WMSItem_RequiresExpiry: bool(input.requiresExpiry),
    WMSItem_TemperatureMinC: min,
    WMSItem_TemperatureMaxC: max,
    WMSItem_ComplianceJSON: {},
    WMSItem_IsActive: create ? true : bool(input.isActive, true),
    WMSItem_UpdatedAt: new Date().toISOString(),
    ...create ? {
      WMSItem_CreatedBy: actor.userId
    } : {}
  };
}
export async function handleItems(request, path, url, admin, actor) {
  const boundedList = request.method === "GET" && path.length === 1 && url.searchParams.has("limit");
  if (boundedList) {
    requireCapability(actor, "warehouse_items:read");
    const facilityIds = await companyFacilityIds(admin, actor);
    const requestedFacility = clean(url.searchParams.get("facilityId"));
    if (requestedFacility && !facilityIds.includes(requestedFacility)) throw new HttpError(403, "Choose a facility available in your workspace.");
    const { limit, offset } = boundedPage(url);
    const { data, error } = await admin.rpc("warehouse_edge_items_page", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: actor.companyId ? null : [...actor.organisationIds],
      p_facility_id: requestedFacility,
      p_search: clean(url.searchParams.get("search"), 160),
      p_include_inactive: url.searchParams.get("includeInactive") === "true",
      p_sort: clean(url.searchParams.get("sort"), 40) ?? "sku",
      p_direction: url.searchParams.get("direction") === "desc" ? "desc" : "asc",
      p_limit: limit,
      p_offset: offset
    });
    if (!error) {
      const page = data ?? { rows: [], total: 0, limit, offset };
      return { ...page, rows: await enrichItemFacilities(admin, page.rows ?? [], facilityIds) };
    }
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse item paging is still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  if (request.method === "GET" && path.length === 1) {
    throw new HttpError(400, "Warehouse item lists require bounded paging.");
  }
  if (request.method === "GET" && path[1] === "reference" && path[2] === "customers") {
    requireCapability(actor, "warehouse_items:read");
    const { limit, offset } = boundedPage(url);
    if (!actor.companyId && actor.organisationIds.size === 0) return { rows: [], total: 0, limit, offset, hasMore: false };
    let query = admin.from("Org_Master")
      .select("Org_id,Org_Name", { count: "exact" });
    if (!actor.companyId) query = query.in("Org_id", [...actor.organisationIds]);
    const term = clean(url.searchParams.get("search"), 160);
    if (term) query = query.ilike("Org_Name", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error, count } = await query
      .order("Org_Name")
      .order("Org_id")
      .range(offset, offset + limit - 1);
    if (error) throw new HttpError(500, error.message);
    const total = count ?? 0;
    return {
      rows: (data ?? []).map((row)=>({ id: row.Org_id, name: row.Org_Name })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }
  if (request.method === "GET" && path[1] === "reference" && url.searchParams.get("scope") === "facilities") {
    requireCapability(actor, "warehouse_items:read");
    const facilityIds = await companyFacilityIds(admin, actor);
    const facilities = facilityIds.length ? await many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
      .in("WMSFacility_ID", facilityIds)
      .eq("WMSFacility_IsDeleted", false)
      .order("WMSFacility_Name")) : [];
    return {
      customers: [],
      customersDeferred: true,
      facilities: facilities.map((row)=>({
        id: row.WMSFacility_ID,
        code: row.WMSFacility_Code,
        name: row.WMSFacility_Name
      }))
    };
  }
  if (request.method === "GET" && path[1] === "detail") {
    requireCapability(actor, "warehouse_items:read");
    const sku = required(url.searchParams.get("sku"), "Choose an item SKU.", "sku", 120);
    const facilityIds = await companyFacilityIds(admin, actor);
    const { data: itemId, error: lookupError } = await admin.rpc("warehouse_edge_item_id_by_sku", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: actor.companyId ? null : [...actor.organisationIds],
      p_sku: sku
    });
    if (lookupError) {
      if (["42883", "PGRST202"].includes(lookupError.code ?? "")) throw new HttpError(503, "Warehouse item details are still being prepared. Try again shortly.");
      throw new HttpError(500, lookupError.message);
    }
    if (!itemId) throw new HttpError(404, "This SKU does not match any warehouse item.");

    let itemQuery = admin.from("WMS_Items")
      .select("*")
      .eq("WMSItem_ID", itemId)
      .eq("WMSItem_IsDeleted", false);
    if (!actor.companyId) itemQuery = itemQuery.in("WMSItem_CustomerOrgID", [...actor.organisationIds]);
    const item = await oneOrNull(itemQuery.maybeSingle());
    if (!item) throw new HttpError(404, "This SKU does not match any warehouse item.");

    const assignmentRows = await many(admin.from("WMS_ItemFacilityAssignments").select("*").eq("WMSItemFacility_ItemID", item.WMSItem_ID).in("WMSItemFacility_FacilityID", facilityIds).eq("WMSItemFacility_IsActive", true));
    if (!assignmentRows.length) throw new HttpError(404, "This SKU does not match any warehouse item.");
    const [uoms, organisation, facilities] = await Promise.all([
      many(admin.from("WMS_ItemUOMs").select("*").eq("WMSItemUOM_ItemID", item.WMSItem_ID).order("WMSItemUOM_UOMCode")),
      oneOrNull(admin.from("Org_Master").select("Org_id,Org_Name").eq("Org_id", item.WMSItem_CustomerOrgID).maybeSingle()),
      many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", assignmentRows.map((row)=>row.WMSItemFacility_FacilityID)))
    ]);
    const facilityMap = new Map(facilities.map((row)=>[row.WMSFacility_ID,row]));
    return mapItem(
      item,
      new Map(organisation ? [[organisation.Org_id, organisation.Org_Name]] : []),
      new Map(facilities.map((row)=>[row.WMSFacility_ID,row.WMSFacility_Name])),
      uoms,
      assignmentRows.map((row)=>({ ...row, facilityCode: facilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Code, facilityName: facilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Name }))
    );
  }
  if (request.method === "GET" && path[1] === "reference") {
    requireCapability(actor, "warehouse_items:read");
    const facilityIds = await companyFacilityIds(admin, actor);
    const facilities = facilityIds.length ? await many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
      .in("WMSFacility_ID", facilityIds)
      .eq("WMSFacility_IsDeleted", false)
      .order("WMSFacility_Name")) : [];
    return {
      customers: [],
      customersDeferred: true,
      facilities: facilities.map((row)=>({
          id: row.WMSFacility_ID,
          code: row.WMSFacility_Code,
          name: row.WMSFacility_Name
        }))
    };
  }
  if (request.method === "GET" && path[1] === "import" && path[2] === "template") {
    requireCapability(actor, "warehouse_items:read");
    const { default: ExcelJS } = await import("npm:exceljs@4.4.0");
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Items");
    sheet.addRow([
      "SKU",
      "Description",
      "Base UOM",
      "HS Code",
      "Country of origin",
      "Net weight KG",
      "Gross weight KG",
      "Requires lot",
      "Requires expiry"
    ]);
    sheet.addRow([
      "ITEM-001",
      "Example item",
      "EA",
      "",
      "GB",
      "",
      "",
      "No",
      "No"
    ]);
    sheet.getRow(1).font = {
      bold: true
    };
    const bytes = await book.xlsx.writeBuffer();
    return new Response(bytes, {
      headers: {
        ...cors(request),
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=multideck-items-template.xlsx"
      }
    });
  }
  if (request.method === "POST" && path[1] === "import") {
    return await importItems(request, admin, actor);
  }
  const itemId = path[1] ? uuid(path[1], "item") : null;
  const existing = itemId ? await loadExactItem(admin, actor, itemId) : null;
  if (request.method === "GET" && itemId) {
    if (!existing) {
      throw new HttpError(404, "This item does not exist in your workspace.");
    }
    return mapExactItem(existing);
  }
  if (request.method === "DELETE" && itemId) {
    if (!existing) {
      throw new HttpError(404, "This item does not exist in your workspace.");
    }
    requireCapability(actor, "warehouse_items:manage");
    await admin.from("WMS_Items").update({
      WMSItem_IsDeleted: true,
      WMSItem_IsActive: false,
      WMSItem_UpdatedAt: new Date().toISOString()
    }).eq("WMSItem_ID", itemId);
    return undefined;
  }
  if (request.method !== "POST" && request.method !== "PUT") {
    throw new HttpError(405, "Method not allowed.");
  }
  requireCapability(actor, "warehouse_items:manage");
  if (request.method === "PUT" && !existing) throw new HttpError(404, "This item does not exist in your workspace.");
  const input = bodyObject(await request.json());
  const facilityId = uuid(input.defaultFacilityId ?? input.facilityId, "facility");
  const requestedFacilityIds = Array.isArray(input.facilityIds) && input.facilityIds.length ? [...new Set(input.facilityIds.map((value)=>uuid(value,"facility")))] : [facilityId];
  if (!requestedFacilityIds.includes(facilityId)) throw new HttpError(400, "The default warehouse must be one of the selected warehouses.");
  const customerOrgId = request.method === "POST" ? uuid(input.customerOrgId, "customer") : existing?.item.WMSItem_CustomerOrgID;
  const facilityIds = existing?.facilityIds ?? await companyFacilityIds(admin, actor);
  const organisation = customerOrgId ? await oneOrNull(admin.from("Org_Master")
    .select("Org_id,Org_Name")
    .eq("Org_id", customerOrgId)
    .limit(1)
    .maybeSingle()) : null;
  const facility = facilityIds.includes(facilityId) && requestedFacilityIds.every((value)=>facilityIds.includes(value)) ? await oneOrNull(admin.from("WMS_Facilities")
    .select("WMSFacility_ID,WMSFacility_Name")
    .eq("WMSFacility_ID", facilityId)
    .eq("WMSFacility_IsDeleted", false)
    .limit(1)
    .maybeSingle()) : null;
  if (!customerOrgId || !organisation || !facility || (!actor.companyId && !actor.organisationIds.has(customerOrgId))) {
    throw new HttpError(400, "Choose a customer and facility available in your workspace.");
  }
  const activeRequestedFacilities = await many(admin.from("WMS_Facilities").select("WMSFacility_ID").in("WMSFacility_ID", requestedFacilityIds).eq("WMSFacility_IsActive", true).eq("WMSFacility_IsDeleted", false));
  if (activeRequestedFacilities.length !== requestedFacilityIds.length) throw new HttpError(400, "Choose only active warehouses available in your workspace.");
  if (existing) {
    const removedFacilityIds = existing.assignments.map((assignment)=>assignment.WMSItemFacility_FacilityID).filter((value)=>!requestedFacilityIds.includes(value));
    if (removedFacilityIds.length) {
      const [stock, openOrderLines] = await Promise.all([
        many(admin.from("WMS_InventoryBalances").select("WMSBalance_ID").eq("WMSBalance_ItemID", existing.item.WMSItem_ID).in("WMSBalance_FacilityID", removedFacilityIds).neq("WMSBalance_OnHandQuantity", 0).limit(1)),
        many(admin.from("WMS_OrderLines").select("WMSOrderLine_OrderID").eq("WMSOrderLine_ItemID", existing.item.WMSItem_ID).limit(200)),
      ]);
      const candidateOrderIds = openOrderLines.map((row)=>row.WMSOrderLine_OrderID);
      const openOrders = candidateOrderIds.length ? await many(admin.from("WMS_Orders").select("WMSOrder_ID").in("WMSOrder_ID", candidateOrderIds).in("WMSOrder_FacilityID", removedFacilityIds).not("WMSOrder_StatusCode", "in", "(complete,cancelled)").eq("WMSOrder_IsDeleted", false).limit(1)) : [];
      if (stock.length || openOrders.length) throw new HttpError(409, "A warehouse with stock or open orders cannot be removed from this item.");
    }
  }
  requireCustomerScope(actor, customerOrgId, facilityId);
  const payload = {
    ...itemPayload(input, actor, request.method === "POST"),
    WMSItem_CustomerOrgID: customerOrgId,
    WMSItem_DefaultFacilityID: facilityId
  };
  const preparedUoms = Array.isArray(input.uoms) ? input.uoms.filter((entry)=>clean(entry?.code,20)).map((entry)=>({
    WMSItemUOM_ID: id(),
    WMSItemUOM_UOMCode: clean(entry.code,20).toUpperCase(),
    WMSItemUOM_QuantityInBaseUOM: numberOrNull(entry.quantityInBaseUom) ?? 1,
    WMSItemUOM_GrossWeightKG: numberOrNull(entry.grossWeightKg),
    WMSItemUOM_IsPurchasingUOM: bool(entry.purchasing),
    WMSItemUOM_IsStockingUOM: bool(entry.stocking),
    WMSItemUOM_IsSellingUOM: bool(entry.selling)
  })) : null;
  if (preparedUoms?.some((entry)=>entry.WMSItemUOM_QuantityInBaseUOM<=0)) throw new HttpError(400,"Packaging conversions must be greater than zero.");
  const saved = request.method === "POST" ? await one(admin.from("WMS_Items").insert({
    WMSItem_ID: id(),
    ...payload
  }).select().single(), "Could not create the item.") : await one(admin.from("WMS_Items").update(payload).eq("WMSItem_ID", itemId).select().single(), "This item does not exist in your workspace.");
  const { error: assignmentError } = await admin.rpc("warehouse_edge_set_item_facilities", {
    p_item_id: saved.WMSItem_ID,
    p_default_facility_id: facilityId,
    p_facility_ids: requestedFacilityIds,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: [customerOrgId]
  });
  if (assignmentError) {
    const status = assignmentError.message.includes("WMS400:") ? 400 : assignmentError.message.includes("WMS403:") ? 403 : assignmentError.message.includes("WMS404:") ? 404 : assignmentError.message.includes("WMS409:") ? 409 : 500;
    throw new HttpError(status, assignmentError.message.replace(/^.*WMS(?:400|403|404|409|500):\s*/, ""));
  }
  if (preparedUoms) {
    await admin.from("WMS_ItemUOMs").delete().eq("WMSItemUOM_ItemID", saved.WMSItem_ID);
    const uoms = preparedUoms.map((entry)=>({ ...entry, WMSItemUOM_ItemID: saved.WMSItem_ID }));
    if (uoms.length) await one(admin.from("WMS_ItemUOMs").insert(uoms).select().limit(1).single(),"Could not save the item packaging units.");
  }
  const uoms = await many(admin.from("WMS_ItemUOMs").select("*").eq("WMSItemUOM_ItemID", saved.WMSItem_ID).order("WMSItemUOM_UOMCode"));
  const savedAssignments = await many(admin.from("WMS_ItemFacilityAssignments").select("*").eq("WMSItemFacility_ItemID", saved.WMSItem_ID).eq("WMSItemFacility_IsActive", true));
  const savedFacilities = await many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", savedAssignments.map((row)=>row.WMSItemFacility_FacilityID)));
  const savedFacilityMap = new Map(savedFacilities.map((row)=>[row.WMSFacility_ID,row]));
  return mapItem(
    saved,
    new Map([[organisation.Org_id, organisation.Org_Name]]),
    new Map([[facility.WMSFacility_ID, facility.WMSFacility_Name]]),
    uoms,
    savedAssignments.map((row)=>({ ...row, facilityCode: savedFacilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Code, facilityName: savedFacilityMap.get(row.WMSItemFacility_FacilityID)?.WMSFacility_Name })),
  );
}
async function importItems(request, admin, actor) {
  requireCapability(actor, "warehouse_items:manage");
  const form = await request.formData(), customerOrgId = uuid(form.get("customerOrgId"), "customer"), facilityId = uuid(form.get("facilityId"), "facility");
  requireCustomerScope(actor, customerOrgId, facilityId);
  const facilityIds = await companyFacilityIds(admin, actor);
  const [organisation, facility] = await Promise.all([
    oneOrNull(admin.from("Org_Master").select("Org_id").eq("Org_id", customerOrgId).limit(1).maybeSingle()),
    facilityIds.includes(facilityId) ? oneOrNull(admin.from("WMS_Facilities").select("WMSFacility_ID").eq("WMSFacility_ID", facilityId).eq("WMSFacility_IsDeleted", false).limit(1).maybeSingle()) : Promise.resolve(null),
  ]);
  if (!organisation || !facility || (!actor.companyId && !actor.organisationIds.has(customerOrgId))) {
    throw new HttpError(400, "Choose a customer and facility available in your workspace.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new HttpError(400, "Upload an Excel workbook no larger than 10 MB.");
  const { default: ExcelJS } = await import("npm:exceljs@4.4.0");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new HttpError(400, "The workbook does not contain an items sheet.");
  }
  const headers = new Map();
  sheet.getRow(1).eachCell((cell, column)=>headers.set(String(cell.value ?? "").trim(), column));
  const rows = [];
  sheet.eachRow((row, rowNumber)=>{
    if (rowNumber === 1) return;
    const record = {};
    for (const [header, column] of headers){
      record[header] = row.getCell(column).value;
    }
    if (Object.values(record).some((value)=>value !== null && String(value).trim())) rows.push(record);
  });
  if (rows.length > 2_000) throw new HttpError(400, "Import up to 2,000 item rows at a time.");
  const requestedSkus = [...new Set(rows.map((row)=>clean(row.SKU ?? row.sku, 120)?.toLowerCase()).filter(Boolean))];
  const { data: existingSkus, error: existingError } = await admin.rpc("warehouse_edge_existing_item_skus", {
    p_customer_org_id: customerOrgId,
    p_skus: requestedSkus,
  });
  if (existingError) {
    if (["42883", "PGRST202"].includes(existingError.code ?? "")) {
      throw new HttpError(503, "Warehouse item imports are still being prepared. Try again shortly.");
    }
    throw new HttpError(500, existingError.message);
  }
  const existing = new Set((existingSkus ?? []).map((sku)=>String(sku).toLowerCase())), results = [], inserts = [];
  rows.forEach((row, index)=>{
    const sku = clean(row.SKU ?? row.sku, 120), description = clean(row.Description ?? row.description, 240);
    if (!sku || !description) {
      results.push({
        row: index + 2,
        sku,
        success: false,
        error: !sku ? "SKU is required." : "Description is required."
      });
      return;
    }
    if (existing.has(sku.toLowerCase())) {
      results.push({
        row: index + 2,
        sku,
        success: false,
        error: `SKU '${sku}' already exists for this customer.`
      });
      return;
    }
    existing.add(sku.toLowerCase());
    inserts.push({
      WMSItem_ID: id(),
      WMSItem_CustomerOrgID: customerOrgId,
      WMSItem_DefaultFacilityID: facilityId,
      WMSItem_SKU: sku,
      WMSItem_Description: description,
      WMSItem_BaseUOMCode: clean(row["Base UOM"] ?? row.baseUomCode, 20)?.toUpperCase() ?? "EA",
      WMSItem_HSCode: clean(row["HS Code"] ?? row.hsCode, 30),
      WMSItem_CountryOfOriginCode: clean(row["Country of origin"] ?? row.countryOfOriginCode, 2)?.toUpperCase() ?? null,
      WMSItem_ComplianceJSON: {},
      WMSItem_IsActive: true,
      WMSItem_IsDeleted: false,
      WMSItem_CreatedBy: actor.userId
    });
    results.push({
      row: index + 2,
      sku,
      success: true,
      error: null
    });
  });
  if (inserts.length) {
    const { error } = await admin.from("WMS_Items").insert(inserts);
    if (error) throw new HttpError(500, error.message);
  }
  return {
    created: inserts.length,
    failed: results.length - inserts.length,
    results
  };
}
