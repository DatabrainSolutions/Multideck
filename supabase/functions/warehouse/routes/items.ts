
// @ts-nocheck
import ExcelJS from "npm:exceljs@4.4.0";
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  bodyObject,
  bool,
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
  requireInternal,
  required,
  uuid,
} from "../shared/mod.ts";

function mapItem(row, orgNames, facilityNames) {
  return {
    id: row.WMSItem_ID,
    customerOrgId: row.WMSItem_CustomerOrgID,
    customerOrgName: orgNames.get(row.WMSItem_CustomerOrgID) ?? null,
    facilityId: row.WMSItem_DefaultFacilityID,
    facilityName: facilityNames.get(row.WMSItem_DefaultFacilityID) ?? null,
    sku: row.WMSItem_SKU,
    description: row.WMSItem_Description,
    commodityDescription: row.WMSItem_CommodityDescription,
    hsCode: row.WMSItem_HSCode,
    countryOfOriginCode: row.WMSItem_CountryOfOriginCode,
    baseUomCode: row.WMSItem_BaseUOMCode,
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
async function itemContext(admin, actor) {
  requireCapability(actor, "warehouse_items:read");
  const facilityIds = await companyFacilityIds(admin, actor);
  const facilities = facilityIds.length ? await many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", facilityIds).eq("WMSFacility_IsDeleted", false)) : [];
  let orgs = await many(admin.from("Org_Master").select("Org_id,Org_Name"));
  if (!actor.companyId) {
    orgs = orgs.filter((row)=>actor.organisationIds.has(row.Org_id));
  }
  const orgIds = new Set(orgs.map((row)=>row.Org_id));
  const items = facilityIds.length ? await many(admin.from("WMS_Items").select("*").in("WMSItem_DefaultFacilityID", facilityIds).eq("WMSItem_IsDeleted", false)) : [];
  return {
    facilities,
    orgs,
    items: items.filter((row)=>orgIds.has(row.WMSItem_CustomerOrgID)),
    orgNames: new Map(orgs.map((row)=>[
        row.Org_id,
        row.Org_Name
      ])),
    facilityNames: new Map(facilities.map((row)=>[
        row.WMSFacility_ID,
        row.WMSFacility_Name
      ]))
  };
}
function itemPayload(input, actor, create) {
  const net = numberOrNull(input.netWeightKg), gross = numberOrNull(input.grossWeightKg), min = numberOrNull(input.temperatureMinC), max = numberOrNull(input.temperatureMaxC);
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
  const context = await itemContext(admin, actor);
  if (request.method === "GET" && path[1] === "reference") {
    return {
      customers: context.orgs.map((row)=>({
          id: row.Org_id,
          name: row.Org_Name
        })),
      facilities: context.facilities.map((row)=>({
          id: row.WMSFacility_ID,
          code: row.WMSFacility_Code,
          name: row.WMSFacility_Name
        }))
    };
  }
  if (request.method === "GET" && path[1] === "import" && path[2] === "template") {
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
  if (request.method === "GET" && path.length === 1) {
    const term = clean(url.searchParams.get("search"))?.toLowerCase(), facility = clean(url.searchParams.get("facilityId"));
    return context.items.filter((row)=>!facility || row.WMSItem_DefaultFacilityID === facility).filter((row)=>url.searchParams.get("includeInactive") === "true" || row.WMSItem_IsActive).filter((row)=>!term || [
        row.WMSItem_SKU,
        row.WMSItem_Description,
        row.WMSItem_CommodityDescription,
        row.WMSItem_HSCode,
        context.orgNames.get(row.WMSItem_CustomerOrgID),
        context.facilityNames.get(row.WMSItem_DefaultFacilityID)
      ].some((value)=>String(value ?? "").toLowerCase().includes(term))).sort((a, b)=>a.WMSItem_SKU.localeCompare(b.WMSItem_SKU)).map((row)=>mapItem(row, context.orgNames, context.facilityNames));
  }
  if (request.method === "POST" && path[1] === "import") {
    return await importItems(request, admin, actor, context);
  }
  const itemId = path[1] ? uuid(path[1], "item") : null;
  const existing = itemId ? context.items.find((row)=>row.WMSItem_ID === itemId) : null;
  if (request.method === "GET" && itemId) {
    if (!existing) {
      throw new HttpError(404, "This item does not exist in your workspace.");
    }
    return mapItem(existing, context.orgNames, context.facilityNames);
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
  const input = bodyObject(await request.json()), facilityId = uuid(input.facilityId, "facility"), customerOrgId = request.method === "POST" ? uuid(input.customerOrgId, "customer") : existing?.WMSItem_CustomerOrgID;
  if (!customerOrgId || !context.facilities.some((row)=>row.WMSFacility_ID === facilityId) || !context.orgs.some((row)=>row.Org_id === customerOrgId)) {
    throw new HttpError(400, "Choose a customer and facility available in your workspace.");
  }
  requireCustomerScope(actor, customerOrgId, facilityId);
  const payload = {
    ...itemPayload(input, actor, request.method === "POST"),
    WMSItem_CustomerOrgID: customerOrgId,
    WMSItem_DefaultFacilityID: facilityId
  };
  const saved = request.method === "POST" ? await one(admin.from("WMS_Items").insert({
    WMSItem_ID: id(),
    ...payload
  }).select().single(), "Could not create the item.") : await one(admin.from("WMS_Items").update(payload).eq("WMSItem_ID", itemId).select().single(), "This item does not exist in your workspace.");
  return mapItem(saved, context.orgNames, context.facilityNames);
}
async function importItems(request, admin, actor, context) {
  requireCapability(actor, "warehouse_items:manage");
  const form = await request.formData(), customerOrgId = uuid(form.get("customerOrgId"), "customer"), facilityId = uuid(form.get("facilityId"), "facility");
  requireCustomerScope(actor, customerOrgId, facilityId);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) throw new HttpError(400, "Upload an Excel workbook no larger than 10 MB.");
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
  const existing = new Set(context.items.filter((row)=>row.WMSItem_CustomerOrgID === customerOrgId).map((row)=>String(row.WMSItem_SKU).toLowerCase())), results = [], inserts = [];
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
