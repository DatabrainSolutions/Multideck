namespace Multideck.Server.Modules.Deals;

public sealed record DealOptionDto(string Code, string Name, string? Description);

public sealed record DealConversionOptionsDto(
    IReadOnlyList<DealOptionDto> OpportunityTypes);

public sealed record ConvertLeadToDealRequest(
    string Name,
    string OpportunityTypeCode,
    Guid? PrimaryContactId,
    DateOnly ExpectedCloseDate,
    decimal? ExpectedValueAmount,
    decimal? ExpectedMarginAmount,
    string? CurrencyCode,
    decimal ProbabilityPct,
    string? ModeCode,
    string? DirectionCode,
    string? OriginName,
    string? DestinationName,
    string? TradeLane,
    string? ServiceInterest,
    string CustomerNeed,
    string? ValueProposition,
    DateTime NextActionDueAt,
    string? ConversionNotes);

public sealed record MoveDealStageRequest(Guid PipelineId, Guid PipelineStageId);

public sealed record DealDto(
    Guid Id,
    Guid OrganisationId,
    string CompanyName,
    Guid SourceLeadId,
    string Name,
    Guid PipelineId,
    string PipelineName,
    Guid PipelineStageId,
    string PipelineStageName,
    string OpportunityTypeCode,
    string OpportunityTypeName,
    string StageCode,
    string StageName,
    string StatusCode,
    string StatusName,
    Guid? PrimaryContactId,
    string? PrimaryContactName,
    Guid? OwnerId,
    string? OwnerName,
    DateOnly? ExpectedCloseDate,
    decimal? ExpectedValueAmount,
    decimal? ExpectedMarginAmount,
    string? CurrencyCode,
    decimal? ProbabilityPct,
    string? ModeCode,
    string? DirectionCode,
    string? OriginName,
    string? DestinationName,
    string? TradeLane,
    string? ServiceInterest,
    string? CustomerNeed,
    string? ValueProposition,
    DateTime? NextActionDueAt,
    DateTime CreatedAt,
    bool WasAlreadyConverted = false);
