namespace Multideck.Server.Modules.Inbox;

public sealed record InboxConnectionDto(
    Guid Id,
    string Provider,
    string DisplayName,
    string? Address,
    string Status,
    bool InboundEnabled,
    bool OutboundEnabled,
    DateTime? LastSyncedAt,
    string? Error,
    IReadOnlyList<InboxMailboxDto> Mailboxes);

public sealed record InboxProviderAvailabilityDto(string Provider, bool Configured);

public sealed record InboxMailboxDto(
    Guid Id,
    Guid? ConnectionId,
    string Provider,
    string Kind,
    string DisplayName,
    string Address,
    int UnreadCount,
    bool IsDefault,
    bool InboundEnabled,
    bool OutboundEnabled,
    string Status,
    DateTime? LastSyncedAt,
    string? Error);

public sealed record InboxThreadListResponse(IReadOnlyList<InboxThreadListItemDto> Items, string? NextCursor, bool HasMore);

public sealed record InboxThreadListItemDto(
    Guid Id,
    Guid MailboxId,
    string Provider,
    string Subject,
    string Preview,
    IReadOnlyList<InboxAddressDto> Participants,
    DateTime? LastMessageAt,
    int UnreadCount,
    int MessageCount,
    bool HasAttachments,
    bool Starred,
    bool Archived,
    InboxThreadSummaryDto Summary);

public sealed record InboxThreadDetailDto(
    Guid Id,
    Guid MailboxId,
    string Subject,
    bool Starred,
    bool Archived,
    int UnreadCount,
    bool ReadOnly,
    IReadOnlyList<InboxMessageDto> Messages,
    InboxThreadSummaryDto Summary);

public sealed record InboxThreadUserStateDto(bool IsRead, bool Starred, bool Archived);

public sealed record InboxMessageDto(
    Guid Id,
    Guid ThreadId,
    Guid? MailboxId,
    string Direction,
    IReadOnlyList<InboxAddressDto> From,
    IReadOnlyList<InboxAddressDto> To,
    IReadOnlyList<InboxAddressDto> Cc,
    IReadOnlyList<InboxAddressDto> Bcc,
    string Subject,
    DateTime? SentAt,
    DateTime? ReceivedAt,
    string? BodyText,
    string? SanitizedHtml,
    IReadOnlyList<InboxAttachmentDto> Attachments);

public sealed record InboxAddressDto(string Address, string? DisplayName);

public sealed record InboxAttachmentDto(
    Guid Id,
    string FileName,
    string? MimeType,
    long? SizeBytes,
    bool IsInline,
    string ScanStatus);

public sealed record StartInboxOAuthResponse(Uri AuthorizationUrl, string Provider, DateTimeOffset ExpiresAt);
public sealed record AddSharedMailboxRequest(string Address, string? DisplayName, Guid? GroupId);

public sealed record InboxDraftRequest(
    Guid MailboxId,
    string Mode,
    Guid? SourceMessageId,
    Guid? ThreadId,
    Guid? DraftId,
    string? Subject,
    string BodyText,
    IReadOnlyList<InboxAddressRequest>? AddedTo,
    IReadOnlyList<InboxAddressRequest>? AddedCc,
    IReadOnlyList<InboxAddressRequest>? AddedBcc,
    IReadOnlyList<string>? RemovedAddresses);

public sealed record InboxDraftDto(
    Guid Id,
    Guid? ThreadId,
    Guid MailboxId,
    string Mode,
    Guid? SourceMessageId,
    string Subject,
    string BodyText,
    DateTime? UpdatedAt);
public sealed record InboxAddressRequest(string Address, string? DisplayName = null);

public sealed record InboxSendReceiptDto(Guid Id, Guid? ThreadId, Guid? MessageId, string Status, bool Reused);

public sealed record UpdateInboxThreadStateRequest(bool? IsRead, bool? IsStarred, bool? IsArchived);

public sealed record InboxThreadSummaryDto(
    string Status,
    string? Text,
    IReadOnlyList<string> KeyPoints,
    IReadOnlyList<Guid> SourceMessageIds,
    string? Model,
    DateTime? UpdatedAt,
    string? Error);
