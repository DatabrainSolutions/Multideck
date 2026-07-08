namespace Multideck.Server.Modules.Warehouse.Items;

/// <summary>A stored warehouse item (SKU) as returned to the client.</summary>
public sealed record ItemDto(
    Guid Id,
    Guid CustomerOrgId,
    string? CustomerOrgName,
    Guid? FacilityId,
    string? FacilityName,
    string Sku,
    string Description,
    string? CommodityDescription,
    string? HsCode,
    string? CountryOfOriginCode,
    string BaseUomCode,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? NetWeightKg,
    decimal? GrossWeightKg,
    bool IsDangerousGoods,
    bool IsExciseGoods,
    bool IsHighValue,
    bool IsBondedEligible,
    bool RequiresLot,
    bool RequiresSerial,
    bool RequiresExpiry,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Reference data used to populate item creation and editing forms.</summary>
public sealed record ItemReferenceResponse(
    IReadOnlyList<ItemCustomerOption> Customers,
    IReadOnlyList<ItemFacilityOption> Facilities);

public sealed record ItemCustomerOption(Guid Id, string Name);

public sealed record ItemFacilityOption(Guid Id, string Code, string Name);

public sealed record CreateItemRequest(
    Guid CustomerOrgId,
    Guid FacilityId,
    string Sku,
    string Description,
    string? CommodityDescription,
    string? HsCode,
    string? CountryOfOriginCode,
    string? BaseUomCode,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? NetWeightKg,
    decimal? GrossWeightKg,
    bool IsDangerousGoods,
    bool IsExciseGoods,
    bool IsHighValue,
    bool IsBondedEligible,
    bool RequiresLot,
    bool RequiresSerial,
    bool RequiresExpiry,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC) : IItemAttributes;

/// <summary>A single item row parsed from an uploaded import spreadsheet.</summary>
public sealed record ImportItemRow(
    string? Sku,
    string? Description,
    string? BaseUomCode,
    string? CommodityDescription,
    string? HsCode,
    string? CountryOfOriginCode,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? NetWeightKg,
    decimal? GrossWeightKg,
    bool IsDangerousGoods,
    bool IsExciseGoods,
    bool IsHighValue,
    bool IsBondedEligible,
    bool RequiresLot,
    bool RequiresSerial,
    bool RequiresExpiry,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    int SourceRow);

public sealed record ImportItemsResponse(
    int Created,
    int Failed,
    IReadOnlyList<ImportItemResult> Results);

public sealed record ImportItemResult(int Row, string? Sku, bool Success, string? Error);

public sealed record UpdateItemRequest(
    Guid FacilityId,
    string Sku,
    string Description,
    string? CommodityDescription,
    string? HsCode,
    string? CountryOfOriginCode,
    string? BaseUomCode,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? NetWeightKg,
    decimal? GrossWeightKg,
    bool IsDangerousGoods,
    bool IsExciseGoods,
    bool IsHighValue,
    bool IsBondedEligible,
    bool RequiresLot,
    bool RequiresSerial,
    bool RequiresExpiry,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    bool IsActive) : IItemAttributes;
