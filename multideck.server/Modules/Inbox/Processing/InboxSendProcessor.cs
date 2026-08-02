using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox.OAuth;
using Multideck.Server.Modules.Inbox.Providers;

namespace Multideck.Server.Modules.Inbox.Processing;

public interface IInboxSendProcessor
{
    Task ProcessDueAsync(CancellationToken cancellationToken);
}

public sealed class InboxSendProcessor(
    MultideckContext db,
    IEmailProviderCatalog providers,
    IInboxOAuthService oauth,
    ILogger<InboxSendProcessor> logger) : IInboxSendProcessor
{
    public async Task ProcessDueAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        await using var claimTransaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var requestIds = await db.Database.SqlQuery<Guid>($"""
            with candidates as (
                select send."CommSend_ID"
                from public."Comm_SendRequests" send
                where send."CommSend_StatusCode" = 'queued'
                  and send."CommSend_AttemptCount" < send."CommSend_MaxAttempts"
                  and (send."CommSend_ScheduledAt" is null or send."CommSend_ScheduledAt" <= {now})
                  and (send."CommSend_NotBeforeAt" is null or send."CommSend_NotBeforeAt" <= {now})
                  and (send."CommSend_NextRetryAt" is null or send."CommSend_NextRetryAt" <= {now})
                order by send."CommSend_CreatedAt"
                for update skip locked
                limit 10
            )
            update public."Comm_SendRequests" send
            set "CommSend_StatusCode" = 'sending',
                "CommSend_AttemptCount" = send."CommSend_AttemptCount" + 1,
                "CommSend_NextRetryAt" = null,
                "CommSend_ErrorMessage" = null,
                "CommSend_UpdatedAt" = {now}
            from candidates
            where send."CommSend_ID" = candidates."CommSend_ID"
            returning send."CommSend_ID" as "Value"
            """).ToListAsync(cancellationToken);

        var requests = await db.CommSendRequests
            .Include(send => send.CommSendMailbox)!.ThenInclude(mailbox => mailbox!.CommMailboxConnection)
            .Include(send => send.CommSendMessage)
            .Include(send => send.CommSendRequestRecipients)
            .Where(send => requestIds.Contains(send.CommSendId) && send.CommSendStatusCode == "sending")
            .OrderBy(send => send.CommSendCreatedAt)
            .ToListAsync(cancellationToken);
        foreach (var request in requests.Where(request => request.CommSendMessage is not null))
        {
            request.CommSendMessage!.CommMessageStatusCode = "sending";
            request.CommSendMessage.CommMessageUpdatedAt = now;
        }
        await db.SaveChangesAsync(cancellationToken);
        await claimTransaction.CommitAsync(cancellationToken);

        foreach (var send in requests)
        {
            var mailbox = send.CommSendMailbox;
            var connection = mailbox?.CommMailboxConnection;
            if (mailbox is null || connection is null ||
                mailbox.CommMailboxIsDeleted || !mailbox.CommMailboxOutboundEnabled ||
                connection.CommConnIsDeleted || !connection.CommConnOutboundEnabled || connection.CommConnStatusCode != "active")
            {
                await FailAsync(send, "The connected outbound mailbox is unavailable.", false, cancellationToken);
                continue;
            }

            try
            {
                var accessToken = await oauth.GetAccessTokenAsync(connection, cancellationToken);
                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    connection.CommConnErrorMessage = "Provider authorization is unavailable. Reconnect this mailbox.";
                    connection.CommConnUpdatedAt = DateTime.UtcNow;
                    await FailAsync(send, "No usable provider credential is available.", true, cancellationToken);
                    continue;
                }

                var message = send.CommSendMessage ?? throw InboxException.Conflict("The queued email body is unavailable.");
                var provider = providers.GetByCode(connection.CommConnProviderTypeCode);
                var providerMessage = new ProviderOutgoingMessage(
                    ReadHeader(message.CommMessageHeaderJson, "command") ?? "new",
                    ReadHeader(message.CommMessageHeaderJson, "sourceProviderMessageId"),
                    send.CommSendSubject ?? message.CommMessageSubject ?? "(No subject)",
                    send.CommSendBodyText ?? message.CommMessageBodyText,
                    send.CommSendBodyHtml ?? message.CommMessageBodyHtml,
                    Addresses(send, "to"),
                    Addresses(send, "cc"),
                    Addresses(send, "bcc"),
                    message.CommMessageProviderThreadId,
                    ReadHeader(message.CommMessageHeaderJson, "inReplyTo"),
                    ReadHeader(message.CommMessageHeaderJson, "references"));

                ProviderSendResult result;
                try
                {
                    result = await provider.SendAsync(accessToken, mailbox, providerMessage, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    // The provider may have accepted the email before cancellation reached us.
                    // Keep the request in `sending` so another worker cannot duplicate it.
                    throw;
                }
                catch (Exception exception)
                {
                    logger.LogWarning(exception, "Inbox provider send has an uncertain outcome for request {SendId}", send.CommSendId);
                    await FailAsync(
                        send,
                        "The provider send result is uncertain. Check the provider Sent folder before sending again.",
                        false,
                        cancellationToken);
                    continue;
                }

                send.CommSendStatusCode = "sent";
                send.CommSendErrorMessage = null;
                send.CommSendNextRetryAt = null;
                send.CommSendUpdatedAt = DateTime.UtcNow;
                message.CommMessageStatusCode = "sent";
                message.CommMessageProviderMessageId = result.ProviderMessageId;
                message.CommMessageProviderThreadId = result.ProviderThreadId;
                message.CommMessageProviderConversationId = result.ProviderConversationId;
                message.CommMessageSentAt = result.SentAt.UtcDateTime;
                message.CommMessageUpdatedAt = DateTime.UtcNow;
                db.CommDeliveryEvents.Add(new CommDeliveryEvent
                {
                    CommDeliveryId = Guid.NewGuid(),
                    CommDeliveryMessageId = message.CommMessageId,
                    CommDeliverySendId = send.CommSendId,
                    CommDeliveryConnectionId = connection.CommConnId,
                    CommDeliveryEventTypeCode = "sent",
                    CommDeliveryStatusCode = "sent",
                    CommDeliveryProviderMessageId = result.ProviderMessageId,
                    CommDeliveryEventAt = result.SentAt.UtcDateTime,
                    CommDeliveryReceivedAt = DateTime.UtcNow,
                    CommDeliveryPayloadJson = "{}",
                });
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Inbox send preparation failed for request {SendId}", send.CommSendId);
                await FailAsync(send, exception.Message, true, cancellationToken);
            }
        }
    }

    private async Task FailAsync(CommSendRequest send, string message, bool retry, CancellationToken cancellationToken)
    {
        var exhausted = !retry || send.CommSendAttemptCount >= send.CommSendMaxAttempts;
        send.CommSendStatusCode = exhausted ? "failed" : "queued";
        send.CommSendErrorMessage = message.Length <= 1000 ? message : message[..1000];
        send.CommSendNextRetryAt = exhausted ? null : DateTime.UtcNow.AddMinutes(Math.Pow(2, Math.Max(0, send.CommSendAttemptCount)));
        send.CommSendUpdatedAt = DateTime.UtcNow;
        if (send.CommSendMessage is not null && exhausted)
        {
            send.CommSendMessage.CommMessageStatusCode = "failed";
            send.CommSendMessage.CommMessageUpdatedAt = DateTime.UtcNow;
        }
        else if (send.CommSendMessage is not null)
        {
            send.CommSendMessage.CommMessageStatusCode = "queued";
            send.CommSendMessage.CommMessageUpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private static IReadOnlyList<ProviderAddress> Addresses(CommSendRequest send, string type) => send.CommSendRequestRecipients
        .Where(recipient => recipient.CommSendRecipientRecipientTypeCode == type && !recipient.CommSendRecipientIsSuppressed)
        .Select(recipient => new ProviderAddress(recipient.CommSendRecipientAddress, recipient.CommSendRecipientDisplayNameSnapshot))
        .ToList();

    private static string? ReadHeader(string? json, string name)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        }
        catch (JsonException) { return null; }
    }
}
