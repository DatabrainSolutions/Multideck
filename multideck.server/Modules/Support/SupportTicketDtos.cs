namespace Multideck.Server.Modules.Support;

public sealed record CreateSupportTicketRequest(
    string IdempotencyKey,
    string Topic,
    string Priority,
    string Title,
    string Description,
    string? ApplicationUrl);

public sealed record SupportTicketDto(
    string TicketNumber,
    string Status,
    DateTimeOffset CreatedAt,
    string? StatusUrl);

public sealed record CreateSupportTicketResponse(
    SupportTicketDto Ticket,
    bool Duplicate);

internal sealed record DatabrainTicketRequest(
    string IdempotencyKey,
    string SourceApplication,
    string Title,
    string Description,
    DatabrainRequester Requester,
    string? ClientName,
    string CategorySlug,
    string Priority,
    IReadOnlyDictionary<string, string> Metadata);

internal sealed record DatabrainRequester(string Name, string Email);

internal sealed record DatabrainTicketResponse(DatabrainTicket? Ticket, bool Duplicate);

internal sealed record DatabrainTicket(
    string? TicketNumber,
    string? Status,
    DateTimeOffset CreatedAt,
    string? StatusUrl);

internal sealed record DatabrainTicketError(string? Error);
