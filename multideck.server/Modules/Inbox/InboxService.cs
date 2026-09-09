using System.Net;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox.OAuth;
using Multideck.Server.Modules.Inbox.Luna;
using Multideck.Server.Modules.Inbox.Providers;
using Multideck.Server.Modules.Inbox.Security;
using Multideck.Server.Modules.Inbox.Subscriptions;

namespace Multideck.Server.Modules.Inbox;

public sealed partial class InboxService(
    MultideckContext db,
    IInboxActorContext actorContext,
    IInboxAccessPolicy accessPolicy,
    IInboxThreadSummaryStore summaryStore,
    IEmailProviderCatalog providerCatalog,
    IInboxOAuthService oauthService,
    IInboxCredentialVault vault,
    IInboxProviderSubscriptionService subscriptions) : IInboxService
{
    public IReadOnlyList<InboxProviderAvailabilityDto> GetProviderAvailability() => providerCatalog.GetAvailability();

    public async Task<IReadOnlyList<InboxConnectionDto>> ListConnectionsAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var readableMailboxIds = await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken);
        var connections = await db.CommProviderConnections
            .Where(connection => !connection.CommConnIsDeleted && connection.CommConnUserId == actor.UserId)
            .AsNoTracking()
            .Include(connection => connection.CommMailboxes.Where(mailbox => !mailbox.CommMailboxIsDeleted && readableMailboxIds.Contains(mailbox.CommMailboxId)))
            .OrderBy(connection => connection.CommConnName)
            .ToListAsync(cancellationToken);
        var unreadCounts = await GetUnreadCountsAsync(actor.UserId, readableMailboxIds, cancellationToken);
        return connections.Select(connection => new InboxConnectionDto(
            connection.CommConnId,
            PublicProviderName(connection.CommConnProviderTypeCode),
            connection.CommConnName,
            connection.CommMailboxes.FirstOrDefault()?.CommMailboxAddress,
            ConnectionStatus(connection),
            connection.CommConnInboundEnabled,
            connection.CommConnOutboundEnabled,
            connection.CommConnLastSyncAt,
            connection.CommConnErrorMessage,
            connection.CommMailboxes.Select(mailbox => ToMailboxDto(mailbox, connection.CommConnProviderTypeCode, unreadCounts.GetValueOrDefault(mailbox.CommMailboxId))).ToList()))
            .ToList();
    }

    public async Task DisconnectAsync(ClaimsPrincipal principal, Guid connectionId, CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Connect", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var connection = await db.CommProviderConnections
            .Include(value => value.CommMailboxes)
            .SingleOrDefaultAsync(value =>
                value.CommConnId == connectionId &&
                value.CommConnUserId == actor.UserId &&
                !value.CommConnIsDeleted,
                cancellationToken)
            ?? throw InboxException.NotFound("This connected mailbox was not found.");

        var sharedMailboxIds = connection.CommMailboxes
            .Where(mailbox => mailbox.CommMailboxTypeCode != "personal" || mailbox.CommMailboxGroupId.HasValue)
            .Select(mailbox => mailbox.CommMailboxId)
            .ToList();
        if (sharedMailboxIds.Count > 0)
        {
            await accessPolicy.RequirePermissionAsync(principal, "Email.ManageShared", cancellationToken);
            var manageable = await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Manage, cancellationToken);
            if (sharedMailboxIds.Any(id => !manageable.Contains(id)))
            {
                throw InboxException.Forbidden("You cannot disconnect a provider while it contains a shared mailbox you do not manage.");
            }
        }

        await subscriptions.RevokeConnectionAsync(connection, cancellationToken);
        var now = DateTime.UtcNow;
        connection.CommConnStatusCode = "revoked";
        connection.CommConnInboundEnabled = false;
        connection.CommConnOutboundEnabled = false;
        connection.CommConnIsDeleted = true;
        connection.CommConnUpdatedAt = now;
        connection.CommConnUpdatedBy = actor.UserId;
        foreach (var mailbox in connection.CommMailboxes)
        {
            mailbox.CommMailboxInboundEnabled = false;
            mailbox.CommMailboxOutboundEnabled = false;
            mailbox.CommMailboxIsDeleted = true;
            mailbox.CommMailboxUpdatedAt = now;
            mailbox.CommMailboxUpdatedBy = actor.UserId;
        }

        await db.SaveChangesAsync(cancellationToken);
        await vault.DeleteAsync(connection.CommConnSecretRef, cancellationToken);
        connection.CommConnSecretRef = null;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<InboxMailboxDto>> ListMailboxesAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var readableMailboxIds = await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken);
        var mailboxes = await db.CommMailboxes.Where(mailbox => readableMailboxIds.Contains(mailbox.CommMailboxId))
            .AsNoTracking()
            .Include(mailbox => mailbox.CommMailboxConnection)
            .OrderByDescending(mailbox => mailbox.CommMailboxIsDefaultOutbound)
            .ThenBy(mailbox => mailbox.CommMailboxDisplayName)
            .ToListAsync(cancellationToken);
        var unreadCounts = await GetUnreadCountsAsync(actor.UserId, readableMailboxIds, cancellationToken);
        return mailboxes.Select(mailbox => ToMailboxDto(mailbox, mailbox.CommMailboxConnection?.CommConnProviderTypeCode, unreadCounts.GetValueOrDefault(mailbox.CommMailboxId))).ToList();
    }

    public async Task RequestSyncAsync(ClaimsPrincipal principal, Guid mailboxId, CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        await accessPolicy.RequireMailboxAsync(actor, mailboxId, InboxMailboxCapability.Read, cancellationToken);
        var mailbox = await db.CommMailboxes
            .Include(value => value.CommMailboxConnection)
            .SingleOrDefaultAsync(value =>
                value.CommMailboxId == mailboxId && !value.CommMailboxIsDeleted && value.CommMailboxInboundEnabled,
                cancellationToken)
            ?? throw InboxException.NotFound("This mailbox is unavailable.");
        var connection = mailbox.CommMailboxConnection;
        if (connection is null || connection.CommConnIsDeleted || connection.CommConnStatusCode != "active" || !connection.CommConnInboundEnabled)
        {
            throw InboxException.Conflict("Reconnect this mailbox before syncing it.");
        }
        connection.CommConnNextSyncAt = DateTime.UtcNow;
        connection.CommConnUpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<InboxMailboxDto> AddSharedMailboxAsync(
        ClaimsPrincipal principal,
        Guid connectionId,
        AddSharedMailboxRequest request,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.ManageShared", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var connection = await db.CommProviderConnections
            .SingleOrDefaultAsync(value =>
                value.CommConnId == connectionId &&
                value.CommConnUserId == actor.UserId &&
                value.CommConnStatusCode == "active" &&
                !value.CommConnIsDeleted,
                cancellationToken)
            ?? throw InboxException.NotFound("This connected mailbox was not found.");

        if (request.GroupId.HasValue)
        {
            var isMember = await db.CmpGroups.AnyAsync(group =>
                group.GroupId == request.GroupId.Value && group.Users.Any(user => user.UserId == actor.UserId && user.CompanyId == actor.CompanyId),
                cancellationToken);
            if (!isMember)
            {
                throw InboxException.Forbidden("You can only connect a mailbox to one of your groups.");
            }
        }

        var accessToken = await oauthService.GetAccessTokenAsync(connection, cancellationToken)
            ?? throw InboxException.Unavailable("Reconnect this provider before adding a shared mailbox.");
        var adapter = providerCatalog.GetByCode(connection.CommConnProviderTypeCode);
        var providerMailbox = await adapter.ValidateSharedMailboxAsync(accessToken, request.Address, cancellationToken);
        var normalized = EmailSafety.NormalizeEmail(providerMailbox.Address)
            ?? throw InboxException.BadRequest("Enter a valid shared mailbox address.");

        var existing = await db.CommMailboxes
            .Include(mailbox => mailbox.CommMailboxConnection)
            .SingleOrDefaultAsync(mailbox =>
                mailbox.CommMailboxConnectionId == connectionId &&
                mailbox.CommMailboxNormalizedAddress == normalized &&
                !mailbox.CommMailboxIsDeleted,
                cancellationToken);
        if (existing is not null)
        {
            await accessPolicy.RequireMailboxAsync(actor, existing.CommMailboxId, InboxMailboxCapability.Manage, cancellationToken);
            return ToMailboxDto(existing, connection.CommConnProviderTypeCode, 0);
        }

        var now = DateTime.UtcNow;
        var mailbox = new CommMailbox
        {
            CommMailboxId = Guid.NewGuid(),
            CommMailboxConnectionId = connection.CommConnId,
            CommMailboxTypeCode = "shared",
            CommMailboxChannelCode = "email",
            CommMailboxUserId = request.GroupId.HasValue ? null : actor.UserId,
            CommMailboxGroupId = request.GroupId,
            CommMailboxDisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? providerMailbox.DisplayName : request.DisplayName.Trim()[..Math.Min(request.DisplayName.Trim().Length, 180)],
            CommMailboxAddress = providerMailbox.Address,
            CommMailboxNormalizedAddress = normalized,
            CommMailboxProviderMailboxId = providerMailbox.ProviderMailboxId,
            CommMailboxIsDefaultOutbound = false,
            CommMailboxInboundEnabled = true,
            CommMailboxOutboundEnabled = true,
            CommMailboxDefaultSensitivityCode = "internal",
            CommMailboxSettingsJson = JsonSerializer.Serialize(new { connectedByUserId = actor.UserId }),
            CommMailboxCreatedAt = now,
            CommMailboxCreatedBy = actor.UserId,
            CommMailboxUpdatedAt = now,
            CommMailboxUpdatedBy = actor.UserId,
        };
        mailbox.CommMailboxConnection = connection;
        db.CommMailboxes.Add(mailbox);
        await db.SaveChangesAsync(cancellationToken);
        await accessPolicy.GrantManagerAsync(actor, mailbox.CommMailboxId, request.GroupId.HasValue ? "group" : "shared", cancellationToken);
        return ToMailboxDto(mailbox, connection.CommConnProviderTypeCode, 0);
    }

    public async Task<InboxThreadListResponse> ListThreadsAsync(
        ClaimsPrincipal principal,
        Guid? mailboxId,
        string? folder,
        string? queryText,
        string? cursor,
        int limit,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        limit = Math.Clamp(limit, 1, 100);
        var accessibleMailboxIdSet = await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken);
        var accessibleMailboxIds = accessibleMailboxIdSet.ToList();
        if (mailboxId.HasValue && !accessibleMailboxIdSet.Contains(mailboxId.Value))
        {
            throw InboxException.NotFound("This mailbox is unavailable or you do not have access to it.");
        }
        var normalizedFolder = string.IsNullOrWhiteSpace(folder) ? "inbox" : folder.Trim().ToLowerInvariant();
        var includeDrafts = normalizedFolder == "drafts";
        var query = db.CommThreads
            .AsNoTracking()
            .Where(thread => !thread.CommThreadIsDeleted && thread.CommMessages.Any(message =>
                !message.CommMessageIsDeleted &&
                message.CommMessageMailboxId.HasValue &&
                accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) &&
                (includeDrafts
                    ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId
                    : !message.CommMessageIsDraft)) &&
                !thread.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    !message.CommMessageIsDraft &&
                    (!message.CommMessageMailboxId.HasValue || !accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value))));

        if (mailboxId.HasValue)
        {
            query = query.Where(thread => thread.CommMessages.Any(message =>
                !message.CommMessageIsDeleted &&
                message.CommMessageMailboxId == mailboxId.Value &&
                (includeDrafts
                    ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId
                    : !message.CommMessageIsDraft)));
        }
        query = normalizedFolder switch
        {
            "inbox" => query.Where(thread => thread.CommMessages.Any(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && message.CommMessageIsInbound && !message.CommMessageIsDraft)),
            "sent" => query.Where(thread => thread.CommMessages.Any(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && !message.CommMessageIsInbound && message.CommMessageStatusCode == "sent")),
            "drafts" => query.Where(thread => thread.CommMessages.Any(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId)),
            "archive" => query.Where(thread => thread.CommReadStates.Any(state => state.CommReadUserId == actor.UserId && state.CommReadMessageId == null && state.CommReadIsArchived)),
            "all" => query,
            _ => throw InboxException.BadRequest("Choose inbox, sent, drafts, archive, or all."),
        };
        if (!string.IsNullOrWhiteSpace(queryText))
        {
            var term = queryText.Trim();
            query = query.Where(thread =>
                thread.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    message.CommMessageMailboxId.HasValue &&
                    accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) &&
                    (includeDrafts
                        ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId
                        : !message.CommMessageIsDraft) &&
                    ((message.CommMessageSubject != null && EF.Functions.ILike(message.CommMessageSubject, $"%{term}%")) ||
                    (message.CommMessageBodyPreview != null && EF.Functions.ILike(message.CommMessageBodyPreview, $"%{term}%")) ||
                    message.CommMessageRecipients.Any(recipient => EF.Functions.ILike(recipient.CommRecipientAddress, $"%{term}%")))));
        }
        if (normalizedFolder != "archive")
        {
            query = query.Where(thread => !thread.CommReadStates.Any(state =>
                state.CommReadUserId == actor.UserId &&
                state.CommReadMessageId == null &&
                state.CommReadIsArchived));
        }

        if (!string.IsNullOrWhiteSpace(cursor))
        {
            var parsedCursor = ParseCursor(cursor);
            var cursorId = parsedCursor.ThreadId.ToString();
            query = query.Where(thread =>
                (thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt) < parsedCursor.LastMessageAt ||
                ((thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt) == parsedCursor.LastMessageAt &&
                 string.Compare(thread.CommThreadId.ToString(), cursorId) < 0));
        }

        var threads = await query
            .OrderByDescending(thread => thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt)
            .ThenByDescending(thread => thread.CommThreadId)
            .Take(limit + 1)
            .Include(thread => thread.CommReadStates.Where(state => state.CommReadUserId == actor.UserId && state.CommReadMessageId == null))
            .Include(thread => thread.CommMessages.Where(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && (includeDrafts ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId : !message.CommMessageIsDraft)))
                .ThenInclude(message => message.CommMessageRecipients)
            .Include(thread => thread.CommMessages.Where(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && (includeDrafts ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId : !message.CommMessageIsDraft)))
                .ThenInclude(message => message.CommMessageAttachments)
            .Include(thread => thread.CommMessages.Where(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value) && (includeDrafts ? message.CommMessageIsDraft && message.CommMessageCreatedBy == actor.UserId : !message.CommMessageIsDraft)))
                .ThenInclude(message => message.CommMessageMailbox)
                    .ThenInclude(mailbox => mailbox!.CommMailboxConnection)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var hasMore = threads.Count > limit;
        var items = new List<InboxThreadListItemDto>();
        foreach (var thread in threads.Take(limit))
        {
            var summary = await summaryStore.GetAsync(thread.CommThreadId, thread.CommMessages.ToList(), cancellationToken);
            items.Add(ToThreadListItem(thread, actor.UserId, summary));
        }
        var nextCursor = hasMore && items.Count > 0 ? CreateCursor(items[^1].LastMessageAt, items[^1].Id) : null;
        return new InboxThreadListResponse(items, nextCursor, hasMore);
    }

    public async Task<InboxThreadDetailDto> GetThreadAsync(
        ClaimsPrincipal principal,
        Guid threadId,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var accessibleMailboxIds = (await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken)).ToList();
        var thread = await db.CommThreads
            .AsNoTracking()
            .Where(value =>
                value.CommThreadId == threadId &&
                !value.CommThreadIsDeleted &&
                value.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    !message.CommMessageIsDraft &&
                    message.CommMessageMailboxId.HasValue &&
                    accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)) &&
                !value.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    !message.CommMessageIsDraft &&
                    (!message.CommMessageMailboxId.HasValue || !accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value))))
            .Include(value => value.CommReadStates.Where(state => state.CommReadUserId == actor.UserId && state.CommReadMessageId == null))
            .Include(value => value.CommMessages.Where(message => !message.CommMessageIsDeleted && !message.CommMessageIsDraft && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)))
                .ThenInclude(message => message.CommMessageRecipients)
            .Include(value => value.CommMessages.Where(message => !message.CommMessageIsDeleted && !message.CommMessageIsDraft && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)))
                .ThenInclude(message => message.CommMessageAttachments)
            .AsSplitQuery()
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw InboxException.NotFound("This email thread was not found.");
        var mailboxId = thread.CommMessages.OrderByDescending(MessageOccurredAt).Select(message => message.CommMessageMailboxId).FirstOrDefault(value => value.HasValue)
            ?? throw InboxException.NotFound("This thread is not linked to an accessible mailbox.");
        var sendable = await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Send, cancellationToken);
        var summary = await summaryStore.GetAsync(thread.CommThreadId, thread.CommMessages.ToList(), cancellationToken);
        return ToThreadDetail(thread, actor.UserId, mailboxId, thread.CommThreadIsReadOnly || !sendable.Contains(mailboxId), summary);
    }

    public async Task<InboxThreadUserStateDto> UpdateThreadStateAsync(
        ClaimsPrincipal principal,
        Guid threadId,
        UpdateInboxThreadStateRequest request,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Read", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        await RequireAccessibleThreadAsync(actor, threadId, cancellationToken);
        var state = await db.CommReadStates.SingleOrDefaultAsync(value =>
            value.CommReadUserId == actor.UserId &&
            value.CommReadThreadId == threadId &&
            value.CommReadMessageId == null,
            cancellationToken);
        if (state is null)
        {
            state = new CommReadState
            {
                CommReadId = Guid.NewGuid(),
                CommReadUserId = actor.UserId,
                CommReadThreadId = threadId,
            };
            db.CommReadStates.Add(state);
        }

        var now = DateTime.UtcNow;
        if (request.IsRead.HasValue) state.CommReadReadAt = request.IsRead.Value ? now : null;
        if (request.IsStarred.HasValue) state.CommReadIsStarred = request.IsStarred.Value;
        if (request.IsArchived.HasValue) state.CommReadIsArchived = request.IsArchived.Value;
        state.CommReadUpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return ToUserState(state);
    }

    private async Task<InboxSendReceiptDto> ComposeAsync(
        ClaimsPrincipal principal,
        ComposeCommand request,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var mailbox = await RequireAccessibleOutboundMailboxAsync(actor, request.MailboxId, cancellationToken);
        var subject = ValidateSubject(request.Subject);
        var recipients = ValidateRecipients(request.To, request.Cc, request.Bcc);
        var thread = NewThread(actor, subject, DateTime.UtcNow);
        return await QueueMessageAsync(actor, mailbox, thread, null, "new", subject, request.BodyText, request.BodyHtml, recipients, idempotencyKey, false, cancellationToken);
    }

    private async Task<InboxSendReceiptDto> ReplyAsync(
        ClaimsPrincipal principal,
        Guid threadId,
        Guid sourceMessageId,
        Guid mailboxId,
        BodyCommand request,
        bool replyAll,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var thread = await RequireAccessibleThreadAsync(actor, threadId, cancellationToken);
        if (thread.CommThreadIsReadOnly) throw InboxException.Conflict("This thread is read-only.");
        var source = thread.CommMessages.SingleOrDefault(message =>
            message.CommMessageId == sourceMessageId &&
            !message.CommMessageIsDraft &&
            message.CommMessageProviderMessageId != null &&
            (message.CommMessageIsInbound || message.CommMessageStatusCode == "sent"))
            ?? throw InboxException.NotFound("The source email was not found in this thread.");
        var mailbox = await RequireAccessibleOutboundMailboxAsync(actor, mailboxId, cancellationToken);
        if (source.CommMessageMailboxId != mailbox.CommMailboxId)
        {
            throw InboxException.Conflict("Reply from the same connected mailbox that received this thread.");
        }
        var recipients = ApplyRecipientEdits(ReplyRecipients(source, mailbox, replyAll), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, true);
        if (recipients.To.Count + recipients.Cc.Count + recipients.Bcc.Count == 0)
        {
            throw InboxException.Conflict("No reply address is available for this message.");
        }
        var subject = ReplySubject(source.CommMessageSubject ?? thread.CommThreadSubject ?? string.Empty);
        return await QueueMessageAsync(actor, mailbox, thread, source, replyAll ? "reply_all" : "reply", subject, request.BodyText, null, recipients, idempotencyKey, false, cancellationToken);
    }

    private async Task<InboxSendReceiptDto> ForwardAsync(
        ClaimsPrincipal principal,
        Guid threadId,
        Guid sourceMessageId,
        Guid mailboxId,
        ForwardCommand request,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var sourceThread = await RequireAccessibleThreadAsync(actor, threadId, cancellationToken);
        var source = sourceThread.CommMessages.SingleOrDefault(message =>
            message.CommMessageId == sourceMessageId &&
            !message.CommMessageIsDraft &&
            message.CommMessageProviderMessageId != null &&
            (message.CommMessageIsInbound || message.CommMessageStatusCode == "sent"))
            ?? throw InboxException.NotFound("The source email was not found in this thread.");
        var mailbox = await RequireAccessibleOutboundMailboxAsync(actor, mailboxId, cancellationToken);
        var subject = ValidateSubject(string.IsNullOrWhiteSpace(request.Subject) ? ForwardSubject(source.CommMessageSubject ?? sourceThread.CommThreadSubject ?? string.Empty) : request.Subject);
        var recipients = ApplyRecipientEdits(new RecipientSet([], [], []), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, true);
        var thread = NewThread(actor, subject, DateTime.UtcNow);
        return await QueueMessageAsync(actor, mailbox, thread, source, "forward", subject, BuildForwardBody(request.BodyText, source), null, recipients, idempotencyKey, false, cancellationToken);
    }

    public async Task<InboxSendReceiptDto> SendAsync(
        ClaimsPrincipal principal,
        InboxDraftRequest request,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        var mode = NormalizeMode(request.Mode);
        InboxSendReceiptDto receipt;
        if (mode == "new")
        {
            receipt = await ComposeAsync(principal, new ComposeCommand(
                request.MailboxId,
                request.Subject ?? string.Empty,
                request.BodyText,
                null,
                request.AddedTo ?? [],
                request.AddedCc,
                request.AddedBcc), idempotencyKey, cancellationToken);
        }
        else
        {
            var actor = await actorContext.RequireAsync(principal, cancellationToken);
            var threadId = await ResolveSourceThreadIdAsync(actor, request.SourceMessageId, request.ThreadId, cancellationToken);
            var sourceMessageId = request.SourceMessageId!.Value;
            receipt = mode switch
            {
                "reply" => await ReplyAsync(principal, threadId, sourceMessageId, request.MailboxId, new BodyCommand(
                    request.BodyText, request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses), false, idempotencyKey, cancellationToken),
                "reply_all" => await ReplyAsync(principal, threadId, sourceMessageId, request.MailboxId, new BodyCommand(
                    request.BodyText, request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses), true, idempotencyKey, cancellationToken),
                "forward" => await ForwardAsync(principal, threadId, sourceMessageId, request.MailboxId, new ForwardCommand(
                    request.Subject, request.BodyText, request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses), idempotencyKey, cancellationToken),
                _ => throw InboxException.BadRequest("Choose new, reply, reply_all, or forward."),
            };
        }

        if (request.DraftId.HasValue)
        {
            var actor = await actorContext.RequireAsync(principal, cancellationToken);
            var draft = await db.CommMessages.SingleOrDefaultAsync(message =>
                message.CommMessageId == request.DraftId &&
                message.CommMessageCreatedBy == actor.UserId &&
                message.CommMessageIsDraft &&
                !message.CommMessageIsDeleted,
                cancellationToken);
            if (draft is not null)
            {
                draft.CommMessageIsDeleted = true;
                draft.CommMessageUpdatedAt = DateTime.UtcNow;
                draft.CommMessageUpdatedBy = actor.UserId;
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        return receipt;
    }

    public async Task<InboxDraftDto> CreateDraftAsync(
        ClaimsPrincipal principal,
        InboxDraftRequest request,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var mailbox = await RequireAccessibleOutboundMailboxAsync(actor, request.MailboxId, cancellationToken);
        var mode = NormalizeMode(request.Mode);
        CommMessage? source = null;
        CommThread thread;
        if (mode == "new" || mode == "forward")
        {
            if (mode == "forward") source = await RequireSourceMessageAsync(actor, request.SourceMessageId, request.ThreadId, cancellationToken);
            var subject = ValidateSubject(request.Subject ?? (source is null ? string.Empty : ForwardSubject(source.CommMessageSubject ?? string.Empty)));
            thread = NewThread(actor, subject, DateTime.UtcNow);
        }
        else
        {
            source = await RequireSourceMessageAsync(actor, request.SourceMessageId, request.ThreadId, cancellationToken);
            thread = source.CommMessageThread;
        }

        if (mode is "reply" or "reply_all" && source!.CommMessageMailboxId != mailbox.CommMailboxId)
        {
            throw InboxException.Conflict("Reply from the same connected mailbox that received this thread.");
        }

        var recipients = mode switch
        {
            "reply" => ApplyRecipientEdits(ReplyRecipients(source!, mailbox, false), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
            "reply_all" => ApplyRecipientEdits(ReplyRecipients(source!, mailbox, true), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
            _ => ApplyRecipientEdits(new RecipientSet([], [], []), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
        };
        var subjectValue = mode is "reply" or "reply_all"
            ? ReplySubject(source!.CommMessageSubject ?? thread.CommThreadSubject ?? string.Empty)
            : ValidateSubject(request.Subject ?? thread.CommThreadSubject);
        var now = DateTime.UtcNow;
        var draftBody = mode == "forward" ? BuildForwardBody(request.BodyText, source!) : request.BodyText;
        var message = new CommMessage
        {
            CommMessageId = Guid.NewGuid(),
            CommMessageThreadId = thread.CommThreadId,
            CommMessageReplyToMessageId = mode is "reply" or "reply_all" ? source?.CommMessageId : null,
            CommMessageParentMessageId = mode == "forward" ? source?.CommMessageId : null,
            CommMessageMailboxId = mailbox.CommMailboxId,
            CommMessageChannelCode = "email",
            CommMessageDirectionCode = "outbound",
            CommMessageStatusCode = "draft",
            CommMessageSourceTypeCode = "manual",
            CommMessageContentFormatCode = "plain_text",
            CommMessagePriorityCode = "normal",
            CommMessageSensitivityCode = mailbox.CommMailboxDefaultSensitivityCode,
            CommMessageSubject = subjectValue,
            CommMessageBodyPreview = CreatePreview(draftBody, null),
            CommMessageBodyText = draftBody,
            CommMessageBodyJson = JsonSerializer.Serialize(new { mode, sourceMessageId = source?.CommMessageId }),
            CommMessageHeaderJson = "{}",
            CommMessageMessageDate = now,
            CommMessageIsDraft = true,
            CommMessageIsTrainingAllowed = false,
            CommMessageCreatedAt = now,
            CommMessageCreatedBy = actor.UserId,
            CommMessageUpdatedAt = now,
            CommMessageUpdatedBy = actor.UserId,
        };
        AddMessageRecipient(message, "from", new InboxAddressRequest(mailbox.CommMailboxAddress, mailbox.CommMailboxDisplayName), now);
        foreach (var value in recipients.To) AddMessageRecipient(message, "to", value, now);
        foreach (var value in recipients.Cc) AddMessageRecipient(message, "cc", value, now);
        foreach (var value in recipients.Bcc) AddMessageRecipient(message, "bcc", value, now);
        var isNewThread = db.Entry(thread).State == EntityState.Detached;
        if (isNewThread) db.CommThreads.Add(thread);
        db.CommMessages.Add(message);
        await db.SaveChangesAsync(cancellationToken);
        return ToDraftDto(message, mode, source?.CommMessageId);
    }

    public async Task<InboxDraftDto> UpdateDraftAsync(
        ClaimsPrincipal principal,
        Guid draftId,
        InboxDraftRequest request,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        _ = await RequireAccessibleOutboundMailboxAsync(actor, request.MailboxId, cancellationToken);
        var draft = await db.CommMessages
            .Include(message => message.CommMessageRecipients)
            .SingleOrDefaultAsync(message =>
                message.CommMessageId == draftId &&
                message.CommMessageCreatedBy == actor.UserId &&
                message.CommMessageIsDraft &&
                !message.CommMessageIsDeleted,
                cancellationToken)
            ?? throw InboxException.NotFound("This draft was not found.");
        if (draft.CommMessageMailboxId != request.MailboxId) throw InboxException.Conflict("A saved draft cannot be moved to another mailbox.");
        var mode = NormalizeMode(request.Mode);
        var source = await TryReadSourceMessageAsync(actor, request.SourceMessageId, request.ThreadId, cancellationToken);
        var mailbox = await db.CommMailboxes.AsNoTracking().SingleAsync(value => value.CommMailboxId == request.MailboxId, cancellationToken);
        if (mode is "reply" or "reply_all" && source?.CommMessageMailboxId != mailbox.CommMailboxId)
        {
            throw InboxException.Conflict("Reply from the same connected mailbox that received this thread.");
        }
        var recipients = mode switch
        {
            "reply" when source is not null => ApplyRecipientEdits(ReplyRecipients(source, mailbox, false), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
            "reply_all" when source is not null => ApplyRecipientEdits(ReplyRecipients(source, mailbox, true), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
            _ => ApplyRecipientEdits(new RecipientSet([], [], []), request.AddedTo, request.AddedCc, request.AddedBcc, request.RemovedAddresses, false),
        };
        db.CommMessageRecipients.RemoveRange(draft.CommMessageRecipients);
        draft.CommMessageRecipients.Clear();
        var now = DateTime.UtcNow;
        AddMessageRecipient(draft, "from", new InboxAddressRequest(mailbox.CommMailboxAddress, mailbox.CommMailboxDisplayName), now);
        foreach (var value in recipients.To) AddMessageRecipient(draft, "to", value, now);
        foreach (var value in recipients.Cc) AddMessageRecipient(draft, "cc", value, now);
        foreach (var value in recipients.Bcc) AddMessageRecipient(draft, "bcc", value, now);
        draft.CommMessageSubject = ValidateSubject(request.Subject ?? draft.CommMessageSubject);
        draft.CommMessageBodyText = request.BodyText;
        draft.CommMessageBodyPreview = CreatePreview(request.BodyText, null);
        draft.CommMessageBodyJson = JsonSerializer.Serialize(new { mode, sourceMessageId = source?.CommMessageId });
        draft.CommMessageUpdatedAt = now;
        draft.CommMessageUpdatedBy = actor.UserId;
        await db.SaveChangesAsync(cancellationToken);
        return ToDraftDto(draft, mode, source?.CommMessageId);
    }

    public async Task DeleteDraftAsync(
        ClaimsPrincipal principal,
        Guid draftId,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Send", cancellationToken);
        var actor = await actorContext.RequireAsync(principal, cancellationToken);
        var draft = await db.CommMessages.SingleOrDefaultAsync(message =>
            message.CommMessageId == draftId &&
            message.CommMessageCreatedBy == actor.UserId &&
            message.CommMessageIsDraft &&
            !message.CommMessageIsDeleted,
            cancellationToken)
            ?? throw InboxException.NotFound("This draft was not found.");

        draft.CommMessageIsDeleted = true;
        draft.CommMessageUpdatedAt = DateTime.UtcNow;
        draft.CommMessageUpdatedBy = actor.UserId;
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<InboxSendReceiptDto> QueueMessageAsync(
        InboxActor actor,
        CommMailbox mailbox,
        CommThread thread,
        CommMessage? source,
        string command,
        string subject,
        string? bodyText,
        string? bodyHtml,
        RecipientSet recipients,
        string suppliedIdempotencyKey,
        bool includeOriginalAttachments,
        CancellationToken cancellationToken)
    {
        var idempotencyKey = CreateIdempotencyKey(actor.UserId, suppliedIdempotencyKey);
        if (await FindReceiptAsync(idempotencyKey, true, cancellationToken) is { } existing) return existing;
        ValidateBody(bodyText, bodyHtml);
        var now = DateTime.UtcNow;
        var safeHtml = string.IsNullOrWhiteSpace(bodyHtml) ? null : EmailSafety.SanitizeHtml(bodyHtml);
        var preview = CreatePreview(bodyText, safeHtml);
        var message = new CommMessage
        {
            CommMessageId = Guid.NewGuid(),
            CommMessageThreadId = thread.CommThreadId,
            CommMessageParentMessageId = command == "forward" ? source?.CommMessageId : null,
            CommMessageReplyToMessageId = command.StartsWith("reply", StringComparison.Ordinal) ? source?.CommMessageId : null,
            CommMessageMailboxId = mailbox.CommMailboxId,
            CommMessageChannelCode = "email",
            CommMessageDirectionCode = "outbound",
            CommMessageStatusCode = "queued",
            CommMessageSourceTypeCode = "manual",
            CommMessageContentFormatCode = safeHtml is null ? "plain_text" : "html",
            CommMessagePriorityCode = "normal",
            CommMessageSensitivityCode = mailbox.CommMailboxDefaultSensitivityCode,
            CommMessageProviderThreadId = command.StartsWith("reply", StringComparison.Ordinal) ? source?.CommMessageProviderThreadId : null,
            CommMessageProviderConversationId = command.StartsWith("reply", StringComparison.Ordinal) ? source?.CommMessageProviderConversationId : null,
            CommMessageIdempotencyKey = idempotencyKey,
            CommMessageSubject = subject,
            CommMessageBodyPreview = preview,
            CommMessageBodyText = string.IsNullOrWhiteSpace(bodyText) ? StripHtml(safeHtml) : bodyText.Trim(),
            CommMessageBodyHtml = safeHtml,
            CommMessageBodyJson = "{}",
            CommMessageHeaderJson = JsonSerializer.Serialize(new
            {
                command,
                sourceProviderMessageId = source?.CommMessageProviderMessageId,
                inReplyTo = source?.CommMessageInternetMessageId,
                references = ReadHeader(source?.CommMessageHeaderJson, "References"),
            }),
            CommMessageMessageDate = now,
            CommMessageHasAttachments = includeOriginalAttachments && source?.CommMessageAttachments.Count > 0,
            CommMessageIsInbound = false,
            CommMessageIsDraft = false,
            CommMessageIsTrainingAllowed = false,
            CommMessageCreatedAt = now,
            CommMessageCreatedBy = actor.UserId,
            CommMessageUpdatedAt = now,
            CommMessageUpdatedBy = actor.UserId,
        };

        AddMessageRecipient(message, "from", new InboxAddressRequest(mailbox.CommMailboxAddress, mailbox.CommMailboxDisplayName), now);
        foreach (var recipient in recipients.To) AddMessageRecipient(message, "to", recipient, now);
        foreach (var recipient in recipients.Cc) AddMessageRecipient(message, "cc", recipient, now);
        foreach (var recipient in recipients.Bcc) AddMessageRecipient(message, "bcc", recipient, now);

        if (includeOriginalAttachments && source is not null)
        {
            foreach (var attachment in source.CommMessageAttachments.Where(value => value.CommAttachmentIsScanned && value.CommAttachmentScanStatus == "clean"))
            {
                message.CommMessageAttachments.Add(new CommMessageAttachment
                {
                    CommAttachmentId = Guid.NewGuid(),
                    CommAttachmentMessageId = message.CommMessageId,
                    CommAttachmentJobDocumentId = attachment.CommAttachmentJobDocumentId,
                    CommAttachmentGeneratedDocumentId = attachment.CommAttachmentGeneratedDocumentId,
                    CommAttachmentFileName = EmailSafety.SafeFileName(attachment.CommAttachmentFileName),
                    CommAttachmentMimeType = attachment.CommAttachmentMimeType,
                    CommAttachmentFileSizeBytes = attachment.CommAttachmentFileSizeBytes,
                    CommAttachmentStorageBucket = attachment.CommAttachmentStorageBucket,
                    CommAttachmentStoragePath = attachment.CommAttachmentStoragePath,
                    CommAttachmentContentId = attachment.CommAttachmentContentId,
                    CommAttachmentDisposition = attachment.CommAttachmentDisposition,
                    CommAttachmentFileHashSha256 = attachment.CommAttachmentFileHashSha256,
                    CommAttachmentIsInline = attachment.CommAttachmentIsInline,
                    CommAttachmentIsScanned = attachment.CommAttachmentIsScanned,
                    CommAttachmentScanStatus = attachment.CommAttachmentScanStatus,
                    CommAttachmentMetadataJson = attachment.CommAttachmentMetadataJson,
                    CommAttachmentCreatedAt = now,
                    CommAttachmentCreatedBy = actor.UserId,
                });
            }
        }

        var send = new CommSendRequest
        {
            CommSendId = Guid.NewGuid(),
            CommSendMessageId = message.CommMessageId,
            CommSendThreadId = thread.CommThreadId,
            CommSendMailboxId = mailbox.CommMailboxId,
            CommSendChannelCode = "email",
            CommSendStatusCode = "queued",
            CommSendSourceTypeCode = "manual",
            CommSendPriorityCode = "normal",
            CommSendSensitivityCode = mailbox.CommMailboxDefaultSensitivityCode,
            CommSendRequestedBy = actor.UserId,
            CommSendScheduledAt = now,
            CommSendAttemptCount = 0,
            CommSendMaxAttempts = 3,
            CommSendSubject = subject,
            CommSendBodyText = message.CommMessageBodyText,
            CommSendBodyHtml = safeHtml,
            CommSendPayloadJson = JsonSerializer.Serialize(new { command, sourceMessageId = source?.CommMessageId }),
            CommSendCorrelationId = idempotencyKey,
            CommSendCreatedAt = now,
            CommSendUpdatedAt = now,
        };
        foreach (var recipient in recipients.To) AddSendRecipient(send, "to", recipient, now);
        foreach (var recipient in recipients.Cc) AddSendRecipient(send, "cc", recipient, now);
        foreach (var recipient in recipients.Bcc) AddSendRecipient(send, "bcc", recipient, now);

        var isNewThread = db.Entry(thread).State == EntityState.Detached;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            if (isNewThread) db.CommThreads.Add(thread);
            db.CommMessages.Add(message);
            db.CommSendRequests.Add(send);
            thread.CommThreadLastMessageAt = now;
            thread.CommThreadUpdatedAt = now;
            thread.CommThreadUpdatedBy = actor.UserId;
            await db.SaveChangesAsync(cancellationToken);
            thread.CommThreadLastMessageId = message.CommMessageId;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new InboxSendReceiptDto(send.CommSendId, thread.CommThreadId, message.CommMessageId, send.CommSendStatusCode, false);
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            if (await FindReceiptAsync(idempotencyKey, true, cancellationToken) is { } raced) return raced;
            throw;
        }
    }

    private async Task<CommMailbox> RequireAccessibleOutboundMailboxAsync(InboxActor actor, Guid mailboxId, CancellationToken cancellationToken)
    {
        await accessPolicy.RequireMailboxAsync(actor, mailboxId, InboxMailboxCapability.Send, cancellationToken);
        return await db.CommMailboxes
            .Include(mailbox => mailbox.CommMailboxConnection)
            .SingleOrDefaultAsync(mailbox =>
                mailbox.CommMailboxId == mailboxId &&
                mailbox.CommMailboxOutboundEnabled &&
                mailbox.CommMailboxConnection != null &&
                mailbox.CommMailboxConnection.CommConnOutboundEnabled &&
                mailbox.CommMailboxConnection.CommConnStatusCode == "active" &&
                !mailbox.CommMailboxConnection.CommConnIsDeleted,
                cancellationToken)
        ?? throw InboxException.NotFound("This outbound mailbox is unavailable or you do not have access to it.");
    }

    private async Task<CommThread> RequireAccessibleThreadAsync(InboxActor actor, Guid threadId, CancellationToken cancellationToken)
    {
        var accessibleMailboxIds = (await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken)).ToList();
        return await db.CommThreads
            .Include(thread => thread.CommMessages.Where(message => !message.CommMessageIsDeleted && !message.CommMessageIsDraft && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)))
                .ThenInclude(message => message.CommMessageRecipients)
            .Include(thread => thread.CommMessages.Where(message => !message.CommMessageIsDeleted && !message.CommMessageIsDraft && message.CommMessageMailboxId.HasValue && accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)))
                .ThenInclude(message => message.CommMessageAttachments)
            .SingleOrDefaultAsync(thread =>
                thread.CommThreadId == threadId &&
                !thread.CommThreadIsDeleted &&
                thread.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    !message.CommMessageIsDraft &&
                    message.CommMessageMailboxId.HasValue &&
                    accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value)) &&
                !thread.CommMessages.Any(message =>
                    !message.CommMessageIsDeleted &&
                    !message.CommMessageIsDraft &&
                    (!message.CommMessageMailboxId.HasValue || !accessibleMailboxIds.Contains(message.CommMessageMailboxId.Value))),
                cancellationToken)
            ?? throw InboxException.NotFound("This email thread was not found.");
    }

    private async Task<InboxSendReceiptDto?> FindReceiptAsync(string idempotencyKey, bool reused, CancellationToken cancellationToken)
    {
        var value = await db.CommMessages
            .AsNoTracking()
            .Where(message => message.CommMessageIdempotencyKey == idempotencyKey)
            .Select(message => new
            {
                message.CommMessageId,
                message.CommMessageThreadId,
                Send = message.CommSendRequests.OrderByDescending(send => send.CommSendCreatedAt).Select(send => new { send.CommSendId, send.CommSendStatusCode }).FirstOrDefault(),
            })
            .SingleOrDefaultAsync(cancellationToken);
        return value?.Send is null ? null : new InboxSendReceiptDto(value.Send.CommSendId, value.CommMessageThreadId, value.CommMessageId, value.Send.CommSendStatusCode, reused);
    }

    private string PublicProviderName(string? providerCode)
    {
        if (string.IsNullOrWhiteSpace(providerCode)) return "unknown";
        try { return providerCatalog.GetByCode(providerCode).PublicName; }
        catch (InboxException) { return providerCode; }
    }

    private InboxMailboxDto ToMailboxDto(CommMailbox mailbox, string? providerCode, int unreadCount) => new(
        mailbox.CommMailboxId,
        mailbox.CommMailboxConnectionId,
        PublicProviderName(providerCode),
        mailbox.CommMailboxGroupId.HasValue ? "group" : mailbox.CommMailboxTypeCode == "personal" ? "personal" : "shared",
        mailbox.CommMailboxDisplayName,
        mailbox.CommMailboxAddress,
        unreadCount,
        mailbox.CommMailboxIsDefaultOutbound,
        mailbox.CommMailboxInboundEnabled,
        mailbox.CommMailboxOutboundEnabled,
        mailbox.CommMailboxConnection is null ? "disconnected" : ConnectionStatus(mailbox.CommMailboxConnection),
        mailbox.CommMailboxLastSyncedAt,
        mailbox.CommMailboxConnection?.CommConnErrorMessage);

    private InboxThreadListItemDto ToThreadListItem(CommThread thread, Guid userId, InboxThreadSummaryDto summary)
    {
        var latest = thread.CommMessages.OrderByDescending(MessageOccurredAt).First();
        var state = thread.CommReadStates.SingleOrDefault(value => value.CommReadUserId == userId && value.CommReadMessageId == null);
        var mailbox = latest.CommMessageMailbox!;
        var participants = thread.CommMessages.SelectMany(message => message.CommMessageRecipients)
            .GroupBy(recipient => recipient.CommRecipientNormalizedAddress, StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .Select(group => new InboxAddressDto(group.Key, group.Select(value => value.CommRecipientDisplayNameSnapshot).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))))
            .ToList();
        var occurredAt = MessageOccurredAt(latest);
        var readAt = state?.CommReadReadAt;
        return new InboxThreadListItemDto(
            thread.CommThreadId,
            mailbox.CommMailboxId,
            PublicProviderName(mailbox.CommMailboxConnection?.CommConnProviderTypeCode),
            latest.CommMessageSubject ?? "(No subject)",
            latest.CommMessageBodyPreview ?? string.Empty,
            participants,
            occurredAt,
            thread.CommMessages.Count(message => message.CommMessageIsInbound && (!readAt.HasValue || MessageOccurredAt(message) > readAt.Value)),
            thread.CommMessages.Count,
            thread.CommMessages.Any(message => message.CommMessageHasAttachments),
            state?.CommReadIsStarred == true,
            state?.CommReadIsArchived == true,
            summary);
    }

    private static InboxThreadDetailDto ToThreadDetail(CommThread thread, Guid userId, Guid mailboxId, bool readOnly, InboxThreadSummaryDto summary)
    {
        var state = thread.CommReadStates.SingleOrDefault(value => value.CommReadUserId == userId && value.CommReadMessageId == null);
        var readAt = state?.CommReadReadAt;
        var messages = thread.CommMessages.OrderBy(MessageOccurredAt).Select(message => new InboxMessageDto(
            message.CommMessageId,
            message.CommMessageThreadId,
            message.CommMessageMailboxId,
            message.CommMessageDirectionCode,
            Addresses(message, "from"),
            Addresses(message, "to"),
            Addresses(message, "cc"),
            Addresses(message, "bcc"),
            message.CommMessageSubject ?? thread.CommThreadSubject ?? "(No subject)",
            message.CommMessageSentAt,
            message.CommMessageReceivedAt,
            message.CommMessageBodyText,
            string.IsNullOrWhiteSpace(message.CommMessageBodyHtml) ? null : EmailSafety.SanitizeHtml(message.CommMessageBodyHtml),
            message.CommMessageAttachments.Select(attachment => new InboxAttachmentDto(
                attachment.CommAttachmentId,
                EmailSafety.SafeFileName(attachment.CommAttachmentFileName),
                attachment.CommAttachmentMimeType,
                attachment.CommAttachmentFileSizeBytes,
                attachment.CommAttachmentIsInline,
                attachment.CommAttachmentIsScanned ? attachment.CommAttachmentScanStatus ?? "unknown" : "unknown")).ToList())).ToList();
        return new InboxThreadDetailDto(
            thread.CommThreadId,
            mailboxId,
            messages.LastOrDefault()?.Subject ?? "(No subject)",
            state?.CommReadIsStarred == true,
            state?.CommReadIsArchived == true,
            thread.CommMessages.Count(message => message.CommMessageIsInbound && (!readAt.HasValue || MessageOccurredAt(message) > readAt.Value)),
            readOnly,
            messages,
            summary);
    }

    private static IReadOnlyList<InboxAddressDto> Addresses(CommMessage message, string type) => message.CommMessageRecipients
        .Where(recipient => recipient.CommRecipientRecipientTypeCode.Equals(type, StringComparison.OrdinalIgnoreCase))
        .Select(recipient => new InboxAddressDto(recipient.CommRecipientAddress, recipient.CommRecipientDisplayNameSnapshot))
        .ToList();

    private static InboxThreadUserStateDto ToUserState(CommReadState state) => new(
        state.CommReadReadAt.HasValue,
        state.CommReadIsStarred,
        state.CommReadIsArchived);

    private static RecipientSet ReplyRecipients(CommMessage source, CommMailbox mailbox, bool replyAll)
    {
        var excluded = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { mailbox.CommMailboxNormalizedAddress };
        var replyTo = ParseAddressHeader(ReadHeader(source.CommMessageHeaderJson, "Reply-To"));
        var from = (replyTo.Count > 0
                ? replyTo
                : source.CommMessageRecipients.Where(value => value.CommRecipientRecipientTypeCode == "from").Select(ToRequest).ToList())
            .Where(value => !excluded.Contains(value.Address))
            .ToList();
        if (from.Count == 0 && !source.CommMessageIsInbound)
        {
            from = source.CommMessageRecipients.Where(value => value.CommRecipientRecipientTypeCode == "to").Select(ToRequest).Where(value => !excluded.Contains(value.Address)).ToList();
        }
        var to = Deduplicate(from);
        var cc = replyAll
            ? Deduplicate(source.CommMessageRecipients
                .Where(value => value.CommRecipientRecipientTypeCode is "to" or "cc")
                .Select(ToRequest)
                .Where(value => !excluded.Contains(value.Address) && !to.Any(target => target.Address.Equals(value.Address, StringComparison.OrdinalIgnoreCase))))
            : [];
        return new RecipientSet(to, cc, []);
    }

    private static RecipientSet ValidateRecipients(
        IReadOnlyList<InboxAddressRequest>? to,
        IReadOnlyList<InboxAddressRequest>? cc,
        IReadOnlyList<InboxAddressRequest>? bcc)
    {
        var result = new RecipientSet(Normalize(to), Normalize(cc), Normalize(bcc));
        if (result.To.Count + result.Cc.Count + result.Bcc.Count == 0) throw InboxException.BadRequest("Add at least one recipient.");
        if (result.To.Count + result.Cc.Count + result.Bcc.Count > 100) throw InboxException.BadRequest("A message can have no more than 100 recipients.");
        return result;

        static IReadOnlyList<InboxAddressRequest> Normalize(IReadOnlyList<InboxAddressRequest>? values)
        {
            var normalized = (values ?? []).Select(value =>
            {
                var address = EmailSafety.NormalizeEmail(value.Address)
                    ?? throw InboxException.BadRequest($"'{value.Address}' is not a valid email address.");
                var name = string.IsNullOrWhiteSpace(value.DisplayName) ? null : value.DisplayName.Trim();
                if (name?.Length > 240) name = name[..240];
                return new InboxAddressRequest(address, name);
            });
            return Deduplicate(normalized);
        }
    }

    private static RecipientSet ApplyRecipientEdits(
        RecipientSet resolved,
        IReadOnlyList<InboxAddressRequest>? addedTo,
        IReadOnlyList<InboxAddressRequest>? addedCc,
        IReadOnlyList<InboxAddressRequest>? addedBcc,
        IReadOnlyList<string>? removedAddresses,
        bool requireTo)
    {
        var removed = (removedAddresses ?? [])
            .Select(EmailSafety.NormalizeEmail)
            .Where(value => value is not null)
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var to = resolved.To.Where(value => !removed.Contains(value.Address)).Concat(NormalizeRecipientEdits(addedTo, removed));
        var cc = resolved.Cc.Where(value => !removed.Contains(value.Address)).Concat(NormalizeRecipientEdits(addedCc, removed));
        var bcc = resolved.Bcc.Where(value => !removed.Contains(value.Address)).Concat(NormalizeRecipientEdits(addedBcc, removed));
        var result = new RecipientSet(Deduplicate(to), Deduplicate(cc), Deduplicate(bcc));
        if (requireTo && result.To.Count + result.Cc.Count + result.Bcc.Count == 0) throw InboxException.BadRequest("Add at least one recipient.");
        if (result.To.Count + result.Cc.Count + result.Bcc.Count > 100) throw InboxException.BadRequest("A message can have no more than 100 recipients.");
        return result;
    }

    private static IEnumerable<InboxAddressRequest> NormalizeRecipientEdits(
        IReadOnlyList<InboxAddressRequest>? values,
        IReadOnlySet<string> removed)
    {
        foreach (var value in values ?? [])
        {
            var address = EmailSafety.NormalizeEmail(value.Address)
                ?? throw InboxException.BadRequest($"'{value.Address}' is not a valid email address.");
            if (removed.Contains(address)) continue;
            var displayName = string.IsNullOrWhiteSpace(value.DisplayName) ? null : value.DisplayName.Trim();
            if (displayName?.Length > 240) displayName = displayName[..240];
            yield return new InboxAddressRequest(address, displayName);
        }
    }

    private async Task<Guid> ResolveSourceThreadIdAsync(
        InboxActor actor,
        Guid? sourceMessageId,
        Guid? requestedThreadId,
        CancellationToken cancellationToken)
    {
        var source = await RequireSourceMessageAsync(actor, sourceMessageId, requestedThreadId, cancellationToken);
        return source.CommMessageThreadId;
    }

    private async Task<CommMessage> RequireSourceMessageAsync(
        InboxActor actor,
        Guid? sourceMessageId,
        Guid? requestedThreadId,
        CancellationToken cancellationToken) =>
        await TryReadSourceMessageAsync(actor, sourceMessageId, requestedThreadId, cancellationToken)
        ?? throw InboxException.NotFound("The source email was not found in an accessible mailbox.");

    private async Task<CommMessage?> TryReadSourceMessageAsync(
        InboxActor actor,
        Guid? sourceMessageId,
        Guid? requestedThreadId,
        CancellationToken cancellationToken)
    {
        if (!sourceMessageId.HasValue) return null;
        var mailboxIds = (await accessPolicy.GetMailboxIdsAsync(actor, InboxMailboxCapability.Read, cancellationToken)).ToList();
        return await db.CommMessages
            .Include(message => message.CommMessageRecipients)
            .Include(message => message.CommMessageAttachments)
            .Include(message => message.CommMessageThread)
            .SingleOrDefaultAsync(message =>
                message.CommMessageId == sourceMessageId.Value &&
                (!requestedThreadId.HasValue || message.CommMessageThreadId == requestedThreadId.Value) &&
                !message.CommMessageIsDeleted &&
                !message.CommMessageIsDraft &&
                message.CommMessageProviderMessageId != null &&
                (message.CommMessageIsInbound || message.CommMessageStatusCode == "sent") &&
                message.CommMessageMailboxId.HasValue &&
                mailboxIds.Contains(message.CommMessageMailboxId.Value),
                cancellationToken);
    }

    private static string NormalizeMode(string? mode) => mode?.Trim().ToLowerInvariant() switch
    {
        "new" => "new",
        "reply" => "reply",
        "reply_all" => "reply_all",
        "forward" => "forward",
        _ => throw InboxException.BadRequest("Choose new, reply, reply_all, or forward."),
    };

    private static InboxDraftDto ToDraftDto(CommMessage message, string mode, Guid? sourceMessageId) => new(
        message.CommMessageId,
        message.CommMessageThreadId,
        message.CommMessageMailboxId!.Value,
        mode,
        sourceMessageId,
        message.CommMessageSubject ?? string.Empty,
        message.CommMessageBodyText ?? string.Empty,
        message.CommMessageUpdatedAt);

    private async Task<Dictionary<Guid, int>> GetUnreadCountsAsync(
        Guid userId,
        IReadOnlySet<Guid> mailboxIds,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<Guid, int>();
        foreach (var mailboxId in mailboxIds)
        {
            result[mailboxId] = await db.CommThreads.CountAsync(thread =>
                !thread.CommThreadIsDeleted &&
                thread.CommMessages.Any(message => !message.CommMessageIsDeleted && message.CommMessageMailboxId == mailboxId && message.CommMessageIsInbound) &&
                !thread.CommReadStates.Any(state =>
                    state.CommReadUserId == userId &&
                    state.CommReadMessageId == null &&
                    state.CommReadReadAt.HasValue &&
                    state.CommReadReadAt >= (thread.CommThreadLastMessageAt ?? thread.CommThreadStartedAt)),
                cancellationToken);
        }
        return result;
    }

    private static string ConnectionStatus(CommProviderConnection connection)
    {
        var status = connection.CommConnStatusCode.Trim().ToLowerInvariant();
        if (status is "revoked" or "disabled" or "disconnected") return "disconnected";
        if (status is "syncing" or "pending" or "initial_sync") return "syncing";
        if (status.Contains("reauth", StringComparison.Ordinal) ||
            connection.CommConnErrorMessage?.Contains("token", StringComparison.OrdinalIgnoreCase) == true ||
            connection.CommConnErrorMessage?.Contains("auth", StringComparison.OrdinalIgnoreCase) == true) return "reauthorization_required";
        if (!string.IsNullOrWhiteSpace(connection.CommConnErrorMessage) || status is "error" or "failed") return "error";
        return status == "active" ? "connected" : "disconnected";
    }

    private static string CreateCursor(DateTime? lastMessageAt, Guid threadId)
    {
        var raw = $"{(lastMessageAt ?? DateTime.MinValue).ToUniversalTime().Ticks}:{threadId:N}";
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static ThreadCursor ParseCursor(string value)
    {
        try
        {
            var normalized = value.Replace('-', '+').Replace('_', '/');
            normalized += new string('=', (4 - normalized.Length % 4) % 4);
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(normalized)).Split(':', 2);
            if (parts.Length != 2 || !long.TryParse(parts[0], out var ticks) || !Guid.TryParseExact(parts[1], "N", out var threadId)) throw new FormatException();
            return new ThreadCursor(new DateTime(ticks, DateTimeKind.Utc), threadId);
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException)
        {
            throw InboxException.BadRequest("The inbox cursor is invalid or expired.");
        }
    }

    private static IReadOnlyList<InboxAddressRequest> Deduplicate(IEnumerable<InboxAddressRequest> values) => values
        .GroupBy(value => value.Address, StringComparer.OrdinalIgnoreCase)
        .Select(group => group.First())
        .ToList();

    private static InboxAddressRequest ToRequest(CommMessageRecipient recipient) => new(recipient.CommRecipientNormalizedAddress, recipient.CommRecipientDisplayNameSnapshot);

    private static IReadOnlyList<InboxAddressRequest> ParseAddressHeader(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];
        try
        {
            var addresses = new MailAddressCollection();
            addresses.Add(value);
            return Deduplicate(addresses.Cast<MailAddress>()
                .Select(address => new InboxAddressRequest(address.Address.ToLowerInvariant(), string.IsNullOrWhiteSpace(address.DisplayName) ? null : address.DisplayName)));
        }
        catch (FormatException) { return []; }
    }

    private static CommThread NewThread(InboxActor actor, string subject, DateTime now) => new()
    {
        CommThreadId = Guid.NewGuid(),
        CommThreadSubject = subject,
        CommThreadNormalizedSubject = NormalizeSubject(subject),
        CommThreadPrimaryChannelCode = "email",
        CommThreadStatusCode = "open",
        CommThreadPriorityCode = "normal",
        CommThreadSensitivityCode = "internal",
        CommThreadSourceTypeCode = "manual",
        CommThreadOwnerUserId = actor.UserId,
        CommThreadStartedAt = now,
        CommThreadMetadataJson = "{}",
        CommThreadCreatedAt = now,
        CommThreadCreatedBy = actor.UserId,
        CommThreadUpdatedAt = now,
        CommThreadUpdatedBy = actor.UserId,
    };

    private static void AddMessageRecipient(CommMessage message, string type, InboxAddressRequest address, DateTime now) => message.CommMessageRecipients.Add(new CommMessageRecipient
    {
        CommRecipientId = Guid.NewGuid(),
        CommRecipientMessageId = message.CommMessageId,
        CommRecipientRecipientTypeCode = type,
        CommRecipientChannelCode = "email",
        CommRecipientAddress = address.Address,
        CommRecipientNormalizedAddress = address.Address,
        CommRecipientDisplayNameSnapshot = address.DisplayName,
        CommRecipientIsExternal = true,
        CommRecipientCreatedAt = now,
    });

    private static void AddSendRecipient(CommSendRequest send, string type, InboxAddressRequest address, DateTime now) => send.CommSendRequestRecipients.Add(new CommSendRequestRecipient
    {
        CommSendRecipientId = Guid.NewGuid(),
        CommSendRecipientSendId = send.CommSendId,
        CommSendRecipientRecipientTypeCode = type,
        CommSendRecipientChannelCode = "email",
        CommSendRecipientAddress = address.Address,
        CommSendRecipientNormalizedAddress = address.Address,
        CommSendRecipientDisplayNameSnapshot = address.DisplayName,
        CommSendRecipientCreatedAt = now,
    });

    private static string CreateIdempotencyKey(Guid userId, string supplied)
    {
        var value = supplied?.Trim();
        if (string.IsNullOrWhiteSpace(value) || value.Length > 180) throw InboxException.BadRequest("Send an Idempotency-Key header between 1 and 180 characters.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
        return $"inbox:{userId:N}:{hash}";
    }

    private static string ValidateSubject(string? subject)
    {
        var value = subject?.Trim() ?? string.Empty;
        if (value.Length > 500) throw InboxException.BadRequest("Keep the subject to 500 characters or fewer.");
        return string.IsNullOrWhiteSpace(value) ? "(No subject)" : value;
    }

    private static void ValidateBody(string? text, string? html)
    {
        if (string.IsNullOrWhiteSpace(text) && string.IsNullOrWhiteSpace(html)) throw InboxException.BadRequest("Write a message before sending.");
        if ((text?.Length ?? 0) > 1_000_000 || (html?.Length ?? 0) > 2_000_000) throw InboxException.BadRequest("This email body is too large to send from Multideck.");
    }

    private static string CreatePreview(string? text, string? html)
    {
        var value = string.IsNullOrWhiteSpace(text) ? StripHtml(html) : text.Trim();
        value = WhitespaceRegex().Replace(value ?? string.Empty, " ");
        return value.Length <= 1000 ? value : value[..1000];
    }

    private static string StripHtml(string? html) => WebUtility.HtmlDecode(TagStripRegex().Replace(html ?? string.Empty, " "));
    private static string NormalizeSubject(string subject) => SubjectPrefixRegex().Replace(subject, string.Empty).Trim().ToLowerInvariant();
    private static string ReplySubject(string subject) => subject.StartsWith("re:", StringComparison.OrdinalIgnoreCase) ? subject : $"Re: {subject}";
    private static string ForwardSubject(string subject) => subject.StartsWith("fwd:", StringComparison.OrdinalIgnoreCase) ? subject : $"Fwd: {subject}";

    private static string BuildForwardBody(string? comment, CommMessage source)
    {
        var sender = Addresses(source, "from").FirstOrDefault();
        var to = string.Join(", ", Addresses(source, "to").Select(value => value.DisplayName is null ? value.Address : $"{value.DisplayName} <{value.Address}>"));
        var cc = string.Join(", ", Addresses(source, "cc").Select(value => value.DisplayName is null ? value.Address : $"{value.DisplayName} <{value.Address}>"));
        var original = !string.IsNullOrWhiteSpace(source.CommMessageBodyText)
            ? source.CommMessageBodyText
            : StripHtml(EmailSafety.SanitizeHtml(source.CommMessageBodyHtml));
        var builder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(comment)) builder.AppendLine(comment.Trim()).AppendLine();
        builder.AppendLine("---------- Forwarded message ----------");
        builder.Append("From: ").AppendLine(sender is null ? "Unknown sender" : sender.DisplayName is null ? sender.Address : $"{sender.DisplayName} <{sender.Address}>");
        builder.Append("Date: ").AppendLine(MessageOccurredAt(source).ToUniversalTime().ToString("u"));
        builder.Append("Subject: ").AppendLine(source.CommMessageSubject ?? "(No subject)");
        if (to.Length > 0) builder.Append("To: ").AppendLine(to);
        if (cc.Length > 0) builder.Append("Cc: ").AppendLine(cc);
        builder.AppendLine().Append(original);
        var value = builder.ToString();
        return value.Length <= 950_000 ? value : value[..950_000];
    }
    private static DateTime MessageOccurredAt(CommMessage message) => message.CommMessageMessageDate ?? message.CommMessageReceivedAt ?? message.CommMessageSentAt ?? message.CommMessageCreatedAt;

    private static string? ReadHeader(string? json, string name)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty(name, out var value) ? value.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    private sealed record RecipientSet(IReadOnlyList<InboxAddressRequest> To, IReadOnlyList<InboxAddressRequest> Cc, IReadOnlyList<InboxAddressRequest> Bcc);
    private sealed record ThreadCursor(DateTime LastMessageAt, Guid ThreadId);
    private sealed record ComposeCommand(Guid MailboxId, string Subject, string? BodyText, string? BodyHtml, IReadOnlyList<InboxAddressRequest> To, IReadOnlyList<InboxAddressRequest>? Cc, IReadOnlyList<InboxAddressRequest>? Bcc);
    private sealed record BodyCommand(string? BodyText, IReadOnlyList<InboxAddressRequest>? AddedTo, IReadOnlyList<InboxAddressRequest>? AddedCc, IReadOnlyList<InboxAddressRequest>? AddedBcc, IReadOnlyList<string>? RemovedAddresses);
    private sealed record ForwardCommand(string? Subject, string? BodyText, IReadOnlyList<InboxAddressRequest>? AddedTo, IReadOnlyList<InboxAddressRequest>? AddedCc, IReadOnlyList<InboxAddressRequest>? AddedBcc, IReadOnlyList<string>? RemovedAddresses);

    [GeneratedRegex(@"<[^>]+>", RegexOptions.CultureInvariant)]
    private static partial Regex TagStripRegex();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex WhitespaceRegex();

    [GeneratedRegex(@"^\s*((re|fw|fwd)\s*:\s*)+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SubjectPrefixRegex();
}
