using System.Data;
using System.Data.Common;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.Inbox.Security;

public enum InboxMailboxCapability
{
    Read,
    Send,
    Manage,
}

public interface IInboxAccessPolicy
{
    Task RequirePermissionAsync(ClaimsPrincipal principal, string permission, CancellationToken cancellationToken);
    Task<IReadOnlySet<Guid>> GetMailboxIdsAsync(InboxActor actor, InboxMailboxCapability capability, CancellationToken cancellationToken);
    Task RequireMailboxAsync(InboxActor actor, Guid mailboxId, InboxMailboxCapability capability, CancellationToken cancellationToken);
    Task GrantManagerAsync(InboxActor actor, Guid mailboxId, string scope, CancellationToken cancellationToken);
}

public sealed class InboxAccessPolicy(
    MultideckContext db,
    IUserPermissionService permissions,
    ILogger<InboxAccessPolicy> logger) : IInboxAccessPolicy
{
    public async Task RequirePermissionAsync(ClaimsPrincipal principal, string permission, CancellationToken cancellationToken)
    {
        if (!await permissions.HasPermissionAsync(principal, permission, cancellationToken))
        {
            throw InboxException.Forbidden("You do not have permission to perform this inbox action.");
        }
    }

    public async Task<IReadOnlySet<Guid>> GetMailboxIdsAsync(
        InboxActor actor,
        InboxMailboxCapability capability,
        CancellationToken cancellationToken)
    {
        var capabilityPredicate = capability switch
        {
            InboxMailboxCapability.Read => "a.\"CommMailboxAccess_CanRead\" = true",
            InboxMailboxCapability.Send => "a.\"CommMailboxAccess_CanSend\" = true and (a.\"CommMailboxAccess_ScopeCode\" = 'personal' or a.\"CommMailboxAccess_CanSendAs\" = true)",
            InboxMailboxCapability.Manage => "a.\"CommMailboxAccess_CanManage\" = true",
            _ => throw new ArgumentOutOfRangeException(nameof(capability)),
        };
        var sql = $$"""
            select a."CommMailboxAccess_MailboxID"
            from public."Comm_MailboxAccess" a
            join public."Comm_Mailboxes" m on m."CommMailbox_ID" = a."CommMailboxAccess_MailboxID"
            where a."CommMailboxAccess_UserID" = @user_id
              and a."CommMailboxAccess_RevokedAt" is null
              and (a."CommMailboxAccess_ExpiresAt" is null or a."CommMailboxAccess_ExpiresAt" > now())
              and m."CommMailbox_IsDeleted" = false
              and {{capabilityPredicate}}
            union
            select m."CommMailbox_ID"
            from public."Comm_Mailboxes" m
            join public."Comm_ProviderConnections" c on c."CommConn_ID" = m."CommMailbox_ConnectionID"
            where m."CommMailbox_UserID" = @user_id
              and c."CommConn_UserID" = @user_id
              and m."CommMailbox_TypeCode" = 'personal'
              and m."CommMailbox_IsDeleted" = false
              and c."CommConn_IsDeleted" = false
              and not exists (
                select 1 from public."Comm_MailboxAccess" existing
                where existing."CommMailboxAccess_MailboxID" = m."CommMailbox_ID"
                  and existing."CommMailboxAccess_UserID" = @user_id
              )
            """;

        try
        {
            return await QueryIdsAsync(sql, actor.UserId, cancellationToken);
        }
        catch (DbException exception)
        {
            // During expand-and-contract rollout, only direct personal ownership can fall back.
            // Shared/group access always fails closed until the ACL migration is available.
            logger.LogWarning(exception, "Inbox mailbox ACL query unavailable; using direct personal-owner fallback only");
            return await db.CommMailboxes
                .AsNoTracking()
                .Where(mailbox =>
                    !mailbox.CommMailboxIsDeleted &&
                    mailbox.CommMailboxTypeCode == "personal" &&
                    mailbox.CommMailboxUserId == actor.UserId &&
                    mailbox.CommMailboxConnection != null &&
                    !mailbox.CommMailboxConnection.CommConnIsDeleted &&
                    mailbox.CommMailboxConnection.CommConnUserId == actor.UserId)
                .Select(mailbox => mailbox.CommMailboxId)
                .ToHashSetAsync(cancellationToken);
        }
    }

    public async Task RequireMailboxAsync(
        InboxActor actor,
        Guid mailboxId,
        InboxMailboxCapability capability,
        CancellationToken cancellationToken)
    {
        var ids = await GetMailboxIdsAsync(actor, capability, cancellationToken);
        if (!ids.Contains(mailboxId))
        {
            throw InboxException.NotFound("This mailbox is unavailable or you do not have access to it.");
        }
    }

    public async Task GrantManagerAsync(InboxActor actor, Guid mailboxId, string scope, CancellationToken cancellationToken)
    {
        if (scope is not ("shared" or "group")) throw new ArgumentOutOfRangeException(nameof(scope));
        var sql = """
            insert into public."Comm_MailboxAccess" (
              "CommMailboxAccess_MailboxID", "CommMailboxAccess_UserID", "CommMailboxAccess_ScopeCode",
              "CommMailboxAccess_CanRead", "CommMailboxAccess_CanSend", "CommMailboxAccess_CanSendAs",
              "CommMailboxAccess_CanManage", "CommMailboxAccess_GrantedAt", "CommMailboxAccess_CreatedAt", "CommMailboxAccess_UpdatedAt"
            ) values (@mailbox_id, @user_id, @scope, true, true, true, true, now(), now(), now())
            on conflict ("CommMailboxAccess_MailboxID", "CommMailboxAccess_UserID")
              where "CommMailboxAccess_RevokedAt" is null
            do update set
              "CommMailboxAccess_ScopeCode" = excluded."CommMailboxAccess_ScopeCode",
              "CommMailboxAccess_CanRead" = true,
              "CommMailboxAccess_CanSend" = true,
              "CommMailboxAccess_CanSendAs" = true,
              "CommMailboxAccess_CanManage" = true,
              "CommMailboxAccess_ExpiresAt" = null,
              "CommMailboxAccess_UpdatedAt" = now()
            """;
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            AddParameter(command, "mailbox_id", mailboxId);
            AddParameter(command, "user_id", actor.UserId);
            AddParameter(command, "scope", scope);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private async Task<IReadOnlySet<Guid>> QueryIdsAsync(string sql, Guid userId, CancellationToken cancellationToken)
    {
        var result = new HashSet<Guid>();
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            AddParameter(command, "user_id", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) result.Add(reader.GetGuid(0));
            return result;
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
