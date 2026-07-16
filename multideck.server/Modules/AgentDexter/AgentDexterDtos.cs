namespace Multideck.Server.Modules.AgentDexter;

public sealed record DexterConversationSummaryDto(
    Guid Id,
    string Title,
    string Summary,
    DateTime UpdatedAt);

public sealed record DexterMessageDto(
    Guid Id,
    string Role,
    string Content,
    DateTime CreatedAt);

public sealed record DexterConversationDto(
    Guid Id,
    string Title,
    string Summary,
    DateTime UpdatedAt,
    IReadOnlyList<DexterMessageDto> Messages);

public sealed record DexterAttachmentRequest(
    string Id,
    string Type,
    string Title);

public sealed record SendDexterMessageRequest(
    Guid? ConversationId,
    string Message,
    string? Specialist,
    IReadOnlyList<DexterAttachmentRequest>? Attachments);
