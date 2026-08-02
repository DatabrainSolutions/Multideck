using System.Data;
using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox.OAuth;
using Multideck.Server.Modules.Inbox.Providers;

namespace Multideck.Server.Modules.Inbox.Processing;

public interface IInboxSyncProcessor
{
    Task ProcessDueAsync(CancellationToken cancellationToken);
}

public sealed class InboxSyncProcessor(
    MultideckContext db,
    IEmailProviderCatalog providers,
    IInboxOAuthService oauth,
    IOptions<InboxOptions> options,
    ILogger<InboxSyncProcessor> logger) : IInboxSyncProcessor
{
    private readonly InboxOptions _options = options.Value;

    public async Task ProcessDueAsync(CancellationToken cancellationToken)
    {
        if (!_options.EnableWorkers) return;
        // Polling is always sufficient for correctness. Where provider subscriptions have been
        // provisioned, this bounded queue drain turns verified webhook events into an immediate
        // sync wake-up and prevents an ever-growing unacknowledged event table.
        var claimedEvents = await ClaimInboundEventsAsync(cancellationToken);
        var eventConnectionIds = claimedEvents
            .Where(value => value.ConnectionId.HasValue)
            .Select(value => value.ConnectionId!.Value)
            .ToHashSet();
        var now = DateTime.UtcNow;
        var connections = await db.CommProviderConnections
            .Include(connection => connection.CommMailboxes.Where(mailbox =>
                !mailbox.CommMailboxIsDeleted && mailbox.CommMailboxInboundEnabled))
            .Where(connection =>
                !connection.CommConnIsDeleted &&
                connection.CommConnStatusCode == "active" &&
                connection.CommConnInboundEnabled &&
                connection.CommMailboxes.Any(mailbox => !mailbox.CommMailboxIsDeleted && mailbox.CommMailboxInboundEnabled) &&
                (eventConnectionIds.Contains(connection.CommConnId) ||
                 !connection.CommConnNextSyncAt.HasValue || connection.CommConnNextSyncAt <= now))
            .OrderBy(connection => connection.CommConnNextSyncAt)
            .Take(10)
            .ToListAsync(cancellationToken);

        foreach (var connection in connections)
        {
            try
            {
                var accessToken = await oauth.GetAccessTokenAsync(connection, cancellationToken);
                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    logger.LogDebug("Inbox sync skipped connection {ConnectionId} because no usable credential is available", connection.CommConnId);
                    connection.CommConnErrorMessage = "Provider authorization is unavailable. Reconnect this mailbox.";
                    connection.CommConnNextSyncAt = DateTime.UtcNow.AddMinutes(15);
                    connection.CommConnUpdatedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(cancellationToken);
                    await CompleteEventsAsync(claimedEvents, connection.CommConnId, false, "No usable provider credential is available.", cancellationToken);
                    continue;
                }

                var provider = providers.GetByCode(connection.CommConnProviderTypeCode);
                foreach (var mailbox in connection.CommMailboxes)
                {
                    var sync = await provider.SyncAsync(
                        accessToken,
                        mailbox,
                        _options.InitialSyncMessageLimit,
                        cancellationToken);
                    await PersistAsync(mailbox, sync, cancellationToken);
                    mailbox.CommMailboxSyncCursor = sync.NextCursor;
                    mailbox.CommMailboxLastSyncedAt = DateTime.UtcNow;
                    mailbox.CommMailboxUpdatedAt = DateTime.UtcNow;
                }

                connection.CommConnLastSyncAt = DateTime.UtcNow;
                connection.CommConnNextSyncAt = DateTime.UtcNow.AddSeconds(Math.Clamp(_options.SyncIntervalSeconds, 15, 3600));
                connection.CommConnErrorMessage = null;
                connection.CommConnUpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
                await CompleteEventsAsync(claimedEvents, connection.CommConnId, true, null, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Inbox sync failed for connection {ConnectionId}", connection.CommConnId);
                connection.CommConnErrorMessage = SafeError(exception.Message);
                connection.CommConnNextSyncAt = DateTime.UtcNow.AddMinutes(5);
                connection.CommConnUpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
                await CompleteEventsAsync(claimedEvents, connection.CommConnId, false, exception.Message, cancellationToken);
            }
        }

        var processedConnections = connections.Select(value => value.CommConnId).ToHashSet();
        var validClaimedConnections = await db.CommProviderConnections
            .AsNoTracking()
            .Where(value => eventConnectionIds.Contains(value.CommConnId) && !value.CommConnIsDeleted && value.CommConnStatusCode == "active" && value.CommConnInboundEnabled)
            .Select(value => value.CommConnId)
            .ToHashSetAsync(cancellationToken);
        var invalidEvents = claimedEvents
            .Where(value => !value.ConnectionId.HasValue || !validClaimedConnections.Contains(value.ConnectionId.Value))
            .Select(value => value.Id)
            .ToList();
        await SetEventStateAsync(invalidEvents, "failed", "The provider connection is unavailable or disabled.", cancellationToken);
        var deferredEvents = claimedEvents
            .Where(value => value.ConnectionId.HasValue && validClaimedConnections.Contains(value.ConnectionId.Value) && !processedConnections.Contains(value.ConnectionId.Value))
            .Select(value => value.Id)
            .ToList();
        await RequeueEventsAsync(deferredEvents, cancellationToken);
    }

    private async Task<IReadOnlyList<ClaimedInboundEvent>> ClaimInboundEventsAsync(CancellationToken cancellationToken)
    {
        var result = new List<ClaimedInboundEvent>();
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                with candidates as (
                  select "CommInbound_ID"
                  from public."Comm_InboundEvents"
                  where "CommInbound_ChannelCode" = 'email'
                    and (
                      "CommInbound_ProcessingStatusCode" = 'new'
                      or (
                        "CommInbound_ProcessingStatusCode" = 'processing'
                        and "CommInbound_ProcessingStartedAt" < now() - interval '10 minutes'
                      )
                    )
                  order by "CommInbound_ReceivedAt", "CommInbound_ID"
                  for update skip locked
                  limit 100
                )
                update public."Comm_InboundEvents" as inbound
                set "CommInbound_ProcessingStatusCode" = 'processing',
                    "CommInbound_ProcessingStartedAt" = now(),
                    "CommInbound_ProcessedAt" = null,
                    "CommInbound_ErrorMessage" = null
                from candidates
                where inbound."CommInbound_ID" = candidates."CommInbound_ID"
                returning inbound."CommInbound_ID", inbound."CommInbound_ConnectionID", inbound."CommInbound_MailboxID"
                """;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                result.Add(new ClaimedInboundEvent(
                    reader.GetGuid(0),
                    reader.IsDBNull(1) ? null : reader.GetGuid(1),
                    reader.IsDBNull(2) ? null : reader.GetGuid(2)));
            }
            return result;
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private Task CompleteEventsAsync(
        IReadOnlyList<ClaimedInboundEvent> events,
        Guid connectionId,
        bool succeeded,
        string? error,
        CancellationToken cancellationToken) =>
        SetEventStateAsync(
            events.Where(value => value.ConnectionId == connectionId).Select(value => value.Id).ToList(),
            succeeded ? "processed" : "failed",
            succeeded ? null : error,
            cancellationToken);

    private async Task SetEventStateAsync(
        IReadOnlyCollection<Guid> eventIds,
        string status,
        string? error,
        CancellationToken cancellationToken)
    {
        if (eventIds.Count == 0) return;
        var safeError = error is null ? null : SafeError(error);
        var completedAt = DateTime.UtcNow;
        await db.CommInboundEvents
            .Where(value => eventIds.Contains(value.CommInboundId))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(value => value.CommInboundProcessingStatusCode, status)
                .SetProperty(value => value.CommInboundProcessedAt, completedAt)
                .SetProperty(value => value.CommInboundErrorMessage, safeError),
                cancellationToken);
    }

    private async Task RequeueEventsAsync(IReadOnlyCollection<Guid> eventIds, CancellationToken cancellationToken)
    {
        if (eventIds.Count == 0) return;
        await db.CommInboundEvents
            .Where(value => eventIds.Contains(value.CommInboundId))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(value => value.CommInboundProcessingStatusCode, "new")
                .SetProperty(value => value.CommInboundProcessingStartedAt, (DateTime?)null)
                .SetProperty(value => value.CommInboundProcessedAt, (DateTime?)null)
                .SetProperty(value => value.CommInboundErrorMessage, (string?)null),
                cancellationToken);
    }

    private async Task PersistAsync(CommMailbox mailbox, ProviderSyncResult sync, CancellationToken cancellationToken)
    {
        if (sync.Messages.Count == 0) return;
        var providerIds = sync.Messages.Select(message => message.ProviderMessageId).ToList();
        var knownIds = await db.CommMessages
            .Where(message =>
                message.CommMessageMailboxId == mailbox.CommMailboxId &&
                message.CommMessageProviderMessageId != null &&
                providerIds.Contains(message.CommMessageProviderMessageId))
            .Select(message => message.CommMessageProviderMessageId!)
            .ToHashSetAsync(cancellationToken);
        // Provider drafts are intentionally not imported as editable local drafts. Multideck
        // drafts have their own ownership and lifecycle; presenting a provider draft that we
        // cannot update or delete remotely would be misleading and could expose a shared user's
        // private work.
        var pending = sync.Messages
            .Where(message => !message.IsDraft && !knownIds.Contains(message.ProviderMessageId))
            .OrderBy(message => message.OccurredAt)
            .ToList();
        if (pending.Count == 0) return;

        var providerThreadIds = pending.Select(message => message.ProviderThreadId).Distinct().ToList();
        var existingThreads = await db.CommMessages
            .Where(message =>
                message.CommMessageMailboxId == mailbox.CommMailboxId &&
                message.CommMessageProviderThreadId != null &&
                providerThreadIds.Contains(message.CommMessageProviderThreadId))
            .Select(message => new { message.CommMessageProviderThreadId, message.CommMessageThread })
            .AsTracking()
            .ToListAsync(cancellationToken);
        var threads = existingThreads
            .GroupBy(value => value.CommMessageProviderThreadId!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First().CommMessageThread, StringComparer.Ordinal);
        var lastMessages = new Dictionary<CommThread, CommMessage>();

        foreach (var providerMessage in pending)
        {
            var safeSubject = Trim(providerMessage.Subject, 500) ?? "(No subject)";
            if (!threads.TryGetValue(providerMessage.ProviderThreadId, out var thread))
            {
                var now = providerMessage.OccurredAt.UtcDateTime;
                thread = new CommThread
                {
                    CommThreadId = Guid.NewGuid(),
                    CommThreadSubject = safeSubject,
                    CommThreadNormalizedSubject = NormalizeSubject(safeSubject),
                    CommThreadPrimaryChannelCode = "email",
                    CommThreadStatusCode = "open",
                    CommThreadPriorityCode = "normal",
                    CommThreadSensitivityCode = mailbox.CommMailboxDefaultSensitivityCode,
                    CommThreadSourceTypeCode = "provider",
                    CommThreadOwnerUserId = mailbox.CommMailboxUserId,
                    CommThreadStartedAt = now,
                    CommThreadLastMessageAt = now,
                    CommThreadMetadataJson = JsonSerializer.Serialize(new { providerThreadId = providerMessage.ProviderThreadId }),
                    CommThreadCreatedAt = DateTime.UtcNow,
                    CommThreadCreatedBy = mailbox.CommMailboxUserId,
                    CommThreadUpdatedAt = DateTime.UtcNow,
                    CommThreadUpdatedBy = mailbox.CommMailboxUserId,
                };
                db.CommThreads.Add(thread);
                threads[providerMessage.ProviderThreadId] = thread;
            }

            var senderIsMailbox = providerMessage.From.Any(address =>
                string.Equals(EmailSafety.NormalizeEmail(address.Address), mailbox.CommMailboxNormalizedAddress, StringComparison.OrdinalIgnoreCase));
            var safeHtml = string.IsNullOrWhiteSpace(providerMessage.BodyHtml) ? null : EmailSafety.SanitizeHtml(providerMessage.BodyHtml);
            var message = new CommMessage
            {
                CommMessageId = Guid.NewGuid(),
                CommMessageThreadId = thread.CommThreadId,
                CommMessageMailboxId = mailbox.CommMailboxId,
                CommMessageChannelCode = "email",
                CommMessageDirectionCode = senderIsMailbox ? "outbound" : "inbound",
                CommMessageStatusCode = providerMessage.IsDraft ? "draft" : senderIsMailbox ? "sent" : "received",
                CommMessageSourceTypeCode = "provider",
                CommMessageContentFormatCode = safeHtml is null ? "plain_text" : "html",
                CommMessagePriorityCode = "normal",
                CommMessageSensitivityCode = mailbox.CommMailboxDefaultSensitivityCode,
                CommMessageProviderMessageId = providerMessage.ProviderMessageId,
                CommMessageProviderThreadId = providerMessage.ProviderThreadId,
                CommMessageProviderConversationId = providerMessage.ProviderConversationId,
                CommMessageInternetMessageId = Trim(providerMessage.InternetMessageId, 500),
                CommMessageSubject = safeSubject,
                CommMessageBodyPreview = Trim(providerMessage.Preview, 1000),
                CommMessageBodyText = providerMessage.BodyText,
                CommMessageBodyHtml = safeHtml,
                CommMessageBodyJson = "{}",
                CommMessageHeaderJson = JsonSerializer.Serialize(providerMessage.Headers),
                CommMessageMessageDate = providerMessage.OccurredAt.UtcDateTime,
                CommMessageReceivedAt = senderIsMailbox ? null : providerMessage.OccurredAt.UtcDateTime,
                CommMessageSentAt = senderIsMailbox ? providerMessage.OccurredAt.UtcDateTime : null,
                CommMessageHasAttachments = providerMessage.Attachments.Count > 0,
                CommMessageIsInbound = !senderIsMailbox,
                CommMessageIsDraft = providerMessage.IsDraft,
                CommMessageIsTrainingAllowed = false,
                CommMessageCreatedAt = DateTime.UtcNow,
                CommMessageCreatedBy = mailbox.CommMailboxUserId,
                CommMessageUpdatedAt = DateTime.UtcNow,
                CommMessageUpdatedBy = mailbox.CommMailboxUserId,
            };
            AddRecipients(message, providerMessage.From, "from");
            AddRecipients(message, providerMessage.To, "to");
            AddRecipients(message, providerMessage.Cc, "cc");
            AddRecipients(message, providerMessage.Bcc, "bcc");
            foreach (var attachment in providerMessage.Attachments)
            {
                message.CommMessageAttachments.Add(new CommMessageAttachment
                {
                    CommAttachmentId = Guid.NewGuid(),
                    CommAttachmentMessageId = message.CommMessageId,
                    CommAttachmentFileName = EmailSafety.SafeFileName(attachment.FileName),
                    CommAttachmentMimeType = attachment.MimeType,
                    CommAttachmentFileSizeBytes = attachment.SizeBytes,
                    CommAttachmentContentId = Trim(attachment.ContentId, 240),
                    CommAttachmentDisposition = attachment.IsInline ? "inline" : "attachment",
                    CommAttachmentIsInline = attachment.IsInline,
                    CommAttachmentIsScanned = false,
                    CommAttachmentScanStatus = "unscanned",
                    CommAttachmentMetadataJson = JsonSerializer.Serialize(new { providerAttachmentId = attachment.ProviderAttachmentId }),
                    CommAttachmentCreatedAt = DateTime.UtcNow,
                    CommAttachmentCreatedBy = mailbox.CommMailboxUserId,
                });
            }
            db.CommMessages.Add(message);
            if (!thread.CommThreadLastMessageAt.HasValue || thread.CommThreadLastMessageAt <= providerMessage.OccurredAt.UtcDateTime)
            {
                thread.CommThreadSubject = safeSubject;
                thread.CommThreadLastMessageAt = providerMessage.OccurredAt.UtcDateTime;
                thread.CommThreadUpdatedAt = DateTime.UtcNow;
                lastMessages[thread] = message;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        foreach (var (thread, message) in lastMessages) thread.CommThreadLastMessageId = message.CommMessageId;
        await db.SaveChangesAsync(cancellationToken);
    }

    private static void AddRecipients(CommMessage message, IEnumerable<ProviderAddress> values, string type)
    {
        foreach (var value in values)
        {
            var normalized = EmailSafety.NormalizeEmail(value.Address);
            if (normalized is null) continue;
            message.CommMessageRecipients.Add(new CommMessageRecipient
            {
                CommRecipientId = Guid.NewGuid(),
                CommRecipientMessageId = message.CommMessageId,
                CommRecipientRecipientTypeCode = type,
                CommRecipientChannelCode = "email",
                CommRecipientAddress = value.Address,
                CommRecipientNormalizedAddress = normalized,
                CommRecipientDisplayNameSnapshot = Trim(value.DisplayName, 240),
                CommRecipientIsExternal = true,
                CommRecipientCreatedAt = DateTime.UtcNow,
            });
        }
    }

    private static string NormalizeSubject(string subject)
    {
        var result = subject.Trim();
        while (result.StartsWith("re:", StringComparison.OrdinalIgnoreCase) || result.StartsWith("fw:", StringComparison.OrdinalIgnoreCase) || result.StartsWith("fwd:", StringComparison.OrdinalIgnoreCase))
        {
            result = result[(result.IndexOf(':') + 1)..].TrimStart();
        }
        return result.ToLowerInvariant();
    }

    private static string? Trim(string? value, int max) => value?.Length > max ? value[..max] : value;
    private static string SafeError(string value) => value.Length <= 1000 ? value : value[..1000];
    private sealed record ClaimedInboundEvent(Guid Id, Guid? ConnectionId, Guid? MailboxId);
}
