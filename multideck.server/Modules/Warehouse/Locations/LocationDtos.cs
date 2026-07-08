namespace Multideck.Server.Modules.Warehouse.Locations;

/// <summary>A storage location inside a facility as returned to the client.</summary>
public sealed record LocationDto(
    Guid Id,
    Guid FacilityId,
    string Code,
    string? Barcode,
    string TypeCode,
    string? TypeName,
    string StatusCode,
    string? StatusName,
    Guid? ZoneId,
    string? ZoneTypeCode,
    string? ZoneName,
    string? Aisle,
    string? Bay,
    string? Level,
    string? Position,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? MaxWeightKg,
    decimal? MaxVolumeCbm,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    bool AllowsMultiSku,
    bool AllowsBondedStock,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Reference data used to populate location creation and editing forms.</summary>
public sealed record LocationReferenceResponse(
    IReadOnlyList<LocationTypeOption> Types,
    IReadOnlyList<LocationStatusOption> Statuses,
    IReadOnlyList<ZoneTypeOption> Zones);

public sealed record LocationTypeOption(string Code, string Name, bool IsPickable);

public sealed record LocationStatusOption(string Code, string Name, bool IsUsable);

/// <summary>A zone the location can be assigned to, sourced from the zone type catalogue.</summary>
public sealed record ZoneTypeOption(string Code, string Name, bool AllowsStock);

public interface ILocationAttributes
{
    string? Barcode { get; }
    string? Aisle { get; }
    string? Bay { get; }
    string? Level { get; }
    string? Position { get; }
    decimal? LengthM { get; }
    decimal? WidthM { get; }
    decimal? HeightM { get; }
    decimal? MaxWeightKg { get; }
    decimal? MaxVolumeCbm { get; }
    decimal? TemperatureMinC { get; }
    decimal? TemperatureMaxC { get; }
}

public sealed record CreateLocationRequest(
    string Code,
    string TypeCode,
    string? StatusCode,
    string? ZoneTypeCode,
    string? Barcode,
    string? Aisle,
    string? Bay,
    string? Level,
    string? Position,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? MaxWeightKg,
    decimal? MaxVolumeCbm,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    bool AllowsMultiSku,
    bool AllowsBondedStock) : ILocationAttributes;

public sealed record UpdateLocationRequest(
    string Code,
    string TypeCode,
    string? StatusCode,
    string? ZoneTypeCode,
    string? Barcode,
    string? Aisle,
    string? Bay,
    string? Level,
    string? Position,
    decimal? LengthM,
    decimal? WidthM,
    decimal? HeightM,
    decimal? MaxWeightKg,
    decimal? MaxVolumeCbm,
    decimal? TemperatureMinC,
    decimal? TemperatureMaxC,
    bool AllowsMultiSku,
    bool AllowsBondedStock,
    bool IsActive) : ILocationAttributes;
