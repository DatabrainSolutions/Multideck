namespace Multideck.Server.Modules.Leads;

public sealed record LeadDto(
    Guid Id,
    string CompanyName,
    string Initials,
    string? PrimaryContactName,
    string? PrimaryContactEmail,
    string? CountryCode,
    string SourceCode,
    string SourceName,
    Guid? OwnerId,
    string? OwnerName,
    string? OwnerInitials,
    string StatusCode,
    string StatusName,
    bool IsOpen,
    bool IsConverted,
    bool IsDisqualified,
    string RatingCode,
    string RatingName,
    decimal? QualificationScore,
    int QualificationCriteriaMet,
    decimal? ConversionProbability,
    DateTime? LastActivityAt,
    string? LastActivitySubject,
    DateTime? NextFollowUpAt,
    DateTime CreatedAt,
    decimal? ValueAmount,
    string? ValueCurrencyCode,
    string? ValueContext,
    string? TradeLane,
    string? ServiceInterest,
    int OpenOpportunityCount);

public sealed record LeadCompanyDto(
    Guid? OrganisationId,
    string? Email,
    string? Website,
    string? Phone,
    string? Address);

public sealed record LeadContactDto(
    Guid Id,
    string? Name,
    string Initials,
    string? RoleCode,
    string? Email,
    string? Phone,
    bool IsPrimary,
    DateTime? LastContactAt);

public sealed record LeadActivityDto(
    Guid Id,
    string TypeCode,
    string Subject,
    string? Summary,
    DateTime ActivityAt);

public sealed record LeadDetailDto(
    LeadDto Lead,
    LeadCompanyDto Company,
    IReadOnlyList<LeadContactDto> Contacts,
    IReadOnlyList<LeadActivityDto> Activities);
