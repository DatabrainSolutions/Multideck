using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Multideck.Persistence;
using Multideck.Server.Modules.Documents;
using Multideck.Server.Modules.Inbox.OAuth;
using Multideck.Server.Modules.Inbox.Providers;
using Multideck.Server.Modules.Inbox.Security;

namespace Multideck.Server.Modules.Inbox;

public sealed record InboxAttachmentDownload(byte[] Content, string FileName, string MimeType, bool IsScanned);

public interface IInboxAttachmentService
{
    Task<InboxAttachmentDownload> DownloadAsync(ClaimsPrincipal principal, Guid attachmentId, CancellationToken cancellationToken);
}

public sealed class InboxAttachmentService(
    MultideckContext db,
    IInboxActorContext actorContext,
    IInboxAccessPolicy accessPolicy,
    IEmailProviderCatalog providers,
    IInboxOAuthService oauth,
    IDocumentObjectService documentObjects,
    IOptions<InboxOptions> options) : IInboxAttachmentService
{
    private readonly InboxOptions _options = options.Value;

    public async Task<InboxAttachmentDownload> DownloadAsync(
        ClaimsPrincipal principal,
        Guid attachmentId,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var attachment = await db.CommMessageAttachments
            .AsNoTracking()
            .Include(value => value.CommAttachmentMessage)
                .ThenInclude(message => message.CommMessageMailbox)!
                    .ThenInclude(mailbox => mailbox!.CommMailboxConnection)
            .SingleOrDefaultAsync(value =>
                value.CommAttachmentId == attachmentId &&
                !value.CommAttachmentMessage.CommMessageIsDeleted,
                cancellationToken)
            ?? throw InboxException.NotFound("This attachment was not found.");

        var message = attachment.CommAttachmentMessage;
        var mailbox = message.CommMessageMailbox
            ?? throw InboxException.NotFound("This attachment is not linked to an available mailbox.");
        await accessPolicy.RequireMailboxAsync(actor, mailbox.CommMailboxId, InboxMailboxCapability.Read, cancellationToken);

        var scanStatus = attachment.CommAttachmentScanStatus?.Trim().ToLowerInvariant();
        if (scanStatus is "blocked" or "infected" or "quarantined" or "malicious")
        {
            throw InboxException.Forbidden("This attachment was blocked by the workspace security policy.");
        }

        var maxBytes = Math.Clamp(_options.AttachmentMaxBytes, 1024 * 1024, 100L * 1024 * 1024);
        if (attachment.CommAttachmentFileSizeBytes > maxBytes)
        {
            throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
        }

        byte[] content;
        string? providerMimeType = null;
        if (attachment.CommAttachmentIsScanned && scanStatus == "clean" &&
            !string.IsNullOrWhiteSpace(attachment.CommAttachmentStorageBucket) &&
            !string.IsNullOrWhiteSpace(attachment.CommAttachmentStoragePath))
        {
            var stored = await documentObjects.FindByAddressAsync(
                attachment.CommAttachmentStorageBucket,
                attachment.CommAttachmentStoragePath,
                cancellationToken)
                ?? throw InboxException.NotFound("The scanned attachment file is no longer available.");
            if (stored.FileSizeBytes > maxBytes) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
            content = await documentObjects.DownloadAsync(stored, cancellationToken);
        }
        else
        {
            var connection = mailbox.CommMailboxConnection;
            if (connection is null || connection.CommConnIsDeleted || connection.CommConnStatusCode != "active")
            {
                throw InboxException.Conflict("Reconnect this mailbox before downloading its attachment.");
            }
            if (string.IsNullOrWhiteSpace(message.CommMessageProviderMessageId))
            {
                throw InboxException.NotFound("The provider reference for this attachment is unavailable.");
            }
            var providerAttachmentId = ReadProviderAttachmentId(attachment.CommAttachmentMetadataJson)
                ?? throw InboxException.NotFound("The provider reference for this attachment is unavailable.");
            var accessToken = await oauth.GetAccessTokenAsync(connection, cancellationToken)
                ?? throw InboxException.Conflict("Reconnect this mailbox before downloading its attachment.");
            var result = await providers.GetByCode(connection.CommConnProviderTypeCode).DownloadAttachmentAsync(
                accessToken,
                mailbox,
                message.CommMessageProviderMessageId,
                providerAttachmentId,
                maxBytes,
                cancellationToken);
            content = result.Content;
            providerMimeType = result.MimeType;
        }

        if (content.LongLength > maxBytes) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
        return new InboxAttachmentDownload(
            content,
            EmailSafety.SafeFileName(attachment.CommAttachmentFileName),
            EmailSafety.SafeAttachmentMimeType(attachment.CommAttachmentMimeType ?? providerMimeType),
            attachment.CommAttachmentIsScanned && scanStatus == "clean");
    }

    private static string? ReadProviderAttachmentId(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty("providerAttachmentId", out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }
        catch (JsonException) { return null; }
    }

}
