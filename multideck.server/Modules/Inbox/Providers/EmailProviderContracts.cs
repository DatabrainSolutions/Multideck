using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Inbox.Providers;

public sealed record InboxProviderCredential(
    string AccessToken,
    string? RefreshToken,
    DateTimeOffset ExpiresAt,
    string? Scope,
    string TokenType = "Bearer");

public sealed record ProviderMailbox(
    string ProviderMailboxId,
    string Address,
    string DisplayName,
    string Kind = "personal");

public sealed record ProviderAddress(string Address, string? DisplayName = null);

public sealed record ProviderAttachment(
    string ProviderAttachmentId,
    string FileName,
    string? MimeType,
    long? SizeBytes,
    bool IsInline,
    string? ContentId = null);

public sealed record ProviderInboundMessage(
    string ProviderMessageId,
    string ProviderThreadId,
    string? ProviderConversationId,
    string? InternetMessageId,
    string Subject,
    string Preview,
    string? BodyText,
    string? BodyHtml,
    DateTimeOffset OccurredAt,
    bool IsDraft,
    IReadOnlyList<ProviderAddress> From,
    IReadOnlyList<ProviderAddress> To,
    IReadOnlyList<ProviderAddress> Cc,
    IReadOnlyList<ProviderAddress> Bcc,
    IReadOnlyList<ProviderAttachment> Attachments,
    IReadOnlyDictionary<string, string> Headers);

public sealed record ProviderSyncResult(IReadOnlyList<ProviderInboundMessage> Messages, string? NextCursor);

public sealed record ProviderOutgoingMessage(
    string Mode,
    string? SourceProviderMessageId,
    string Subject,
    string? BodyText,
    string? BodyHtml,
    IReadOnlyList<ProviderAddress> To,
    IReadOnlyList<ProviderAddress> Cc,
    IReadOnlyList<ProviderAddress> Bcc,
    string? ProviderThreadId,
    string? InReplyTo,
    string? References);

public sealed record ProviderSendResult(
    string ProviderMessageId,
    string? ProviderThreadId,
    string? ProviderConversationId,
    DateTimeOffset SentAt);

public sealed record ProviderAttachmentContent(byte[] Content, string? MimeType);

public interface IEmailProviderClient
{
    string ProviderCode { get; }
    string PublicName { get; }

    Task<IReadOnlyList<ProviderMailbox>> DiscoverMailboxesAsync(
        string accessToken,
        CancellationToken cancellationToken);

    Task<ProviderMailbox> ValidateSharedMailboxAsync(
        string accessToken,
        string address,
        CancellationToken cancellationToken);

    Task<ProviderSyncResult> SyncAsync(
        string accessToken,
        CommMailbox mailbox,
        int initialMessageLimit,
        CancellationToken cancellationToken);

    Task<ProviderSendResult> SendAsync(
        string accessToken,
        CommMailbox mailbox,
        ProviderOutgoingMessage message,
        CancellationToken cancellationToken);

    Task<ProviderAttachmentContent> DownloadAttachmentAsync(
        string accessToken,
        CommMailbox mailbox,
        string providerMessageId,
        string providerAttachmentId,
        long maxBytes,
        CancellationToken cancellationToken);
}

public interface IEmailProviderCatalog
{
    IEmailProviderClient GetByCode(string providerCode);
    IEmailProviderClient GetByPublicName(string publicName);
    IReadOnlyList<InboxProviderAvailabilityDto> GetAvailability();
}

public sealed class EmailProviderCatalog(
    IEnumerable<IEmailProviderClient> providers,
    Microsoft.Extensions.Options.IOptions<InboxOptions> options) : IEmailProviderCatalog
{
    private readonly IReadOnlyList<IEmailProviderClient> _providers = providers.ToList();
    private readonly InboxOptions _options = options.Value;

    public IEmailProviderClient GetByCode(string providerCode) => _providers.FirstOrDefault(provider =>
        string.Equals(provider.ProviderCode, providerCode, StringComparison.OrdinalIgnoreCase))
        ?? throw InboxException.BadRequest("This email provider is not supported.");

    public IEmailProviderClient GetByPublicName(string publicName)
    {
        var normalized = publicName.Trim().ToLowerInvariant() switch
        {
            "google" or "gmail" => "gmail",
            "microsoft" or "outlook" or "microsoft-365" => "outlook",
            _ => publicName.Trim().ToLowerInvariant(),
        };

        return _providers.FirstOrDefault(provider =>
            string.Equals(provider.PublicName, normalized, StringComparison.OrdinalIgnoreCase))
            ?? throw InboxException.BadRequest("Choose Gmail or Outlook.");
    }

    public IReadOnlyList<InboxProviderAvailabilityDto> GetAvailability() =>
    [
        new("gmail", _options.OAuth.IsConfigured && _options.Google.Enabled),
        new("outlook", _options.OAuth.IsConfigured && _options.Microsoft.Enabled),
    ];
}
