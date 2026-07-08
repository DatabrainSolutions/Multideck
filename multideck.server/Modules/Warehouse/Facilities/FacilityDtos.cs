namespace Multideck.Server.Modules.Warehouse.Facilities;

/// <summary>A warehouse facility location as returned to the client.</summary>
public sealed record FacilityDto(
    Guid Id,
    string Code,
    string Name,
    string TypeCode,
    string? TypeName,
    Guid? OfficeId,
    string? OfficeName,
    string? Unlocode,
    string? Address1,
    string? Address2,
    string? TownCity,
    string? CountyState,
    string? PostZipCode,
    string? CountryCode,
    string TimeZone,
    bool IsBonded,
    string DefaultCustomsStatusCode,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Reference data used to populate facility creation and editing forms.</summary>
public sealed record FacilityReferenceResponse(
    IReadOnlyList<FacilityTypeOption> Types,
    IReadOnlyList<CustomsStatusOption> CustomsStatuses,
    IReadOnlyList<FacilityOfficeOption> Offices);

public sealed record FacilityTypeOption(string Code, string Name, bool IsBondedCandidate);

public sealed record CustomsStatusOption(string Code, string Name, bool IsDutySuspended);

public sealed record FacilityOfficeOption(Guid Id, string Name, string? Address);

public sealed record CreateFacilityRequest(
    string Code,
    string Name,
    string TypeCode,
    Guid? OfficeId,
    string? Unlocode,
    string? Address1,
    string? Address2,
    string? TownCity,
    string? CountyState,
    string? PostZipCode,
    string? CountryCode,
    string? TimeZone,
    bool IsBonded,
    string? DefaultCustomsStatusCode);

public sealed record UpdateFacilityRequest(
    string Code,
    string Name,
    string TypeCode,
    Guid? OfficeId,
    string? Unlocode,
    string? Address1,
    string? Address2,
    string? TownCity,
    string? CountyState,
    string? PostZipCode,
    string? CountryCode,
    string? TimeZone,
    bool IsBonded,
    string? DefaultCustomsStatusCode,
    bool IsActive);
