namespace Multideck.Server.Modules.Customers;

public sealed record CustomerDto(
    Guid Id,
    string Name,
    string Initials,
    string? Location,
    string Industry,
    int ContactCount,
    string Status,
    IReadOnlyList<string> Types);

public sealed record CreateCustomerRequest(
    string Name,
    Guid OrgTypeId,
    string? AddressLine1,
    string? TownCity,
    string? PostZipCode,
    string? CountryCode,
    string? ContactFirstName,
    string? ContactLastName,
    string? ContactEmail);

public sealed record CustomerReferenceResponse(IReadOnlyList<CustomerOrganisationTypeOption> OrganisationTypes);

public sealed record CustomerOrganisationTypeOption(Guid Id, string Name);

public sealed record CustomerDetailDto(
    Guid Id,
    string Name,
    string Initials,
    string? Location,
    string Industry,
    string Status,
    DateTime CustomerSince,
    string? Tier,
    string? Segment,
    string? PrimaryMode,
    string? PrimaryTradeLane,
    decimal? HealthScore,
    decimal? LifetimeValue,
    string? CurrencyCode,
    string? Summary,
    IReadOnlyList<CustomerContactDto> Contacts,
    IReadOnlyList<CustomerShipmentDto> ActiveShipments,
    IReadOnlyList<CustomerActivityDto> Activities);

public sealed record CustomerContactDto(Guid Id, string Name, string Initials, string? Email, string? Role, string? PreferredChannel, DateTime? LastContactAt);

public sealed record CustomerShipmentDto(Guid Id, string Reference, string Route, string? Mode, string? Status, DateTime? Eta, int OpenExceptionCount);

public sealed record CustomerActivityDto(Guid Id, string Subject, string? Summary, DateTime OccurredAt, string Type);
