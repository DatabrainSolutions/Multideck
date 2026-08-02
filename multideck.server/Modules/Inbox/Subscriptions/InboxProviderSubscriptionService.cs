using System.Data;
using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox.OAuth;

namespace Multideck.Server.Modules.Inbox.Subscriptions;

public interface IInboxProviderSubscriptionService
{
    Task MaintainAsync(CancellationToken cancellationToken);
    Task PurgeExpiredOAuthStatesAsync(CancellationToken cancellationToken);
    Task RevokeConnectionAsync(CommProviderConnection connection, CancellationToken cancellationToken);
}

/// <summary>
/// Maintains provider notification leases as an acceleration layer. Inbox polling remains the
/// correctness path, including for delegated Microsoft shared mailboxes where delegated change
/// notifications are not supported.
/// </summary>
public sealed class InboxProviderSubscriptionService(
    MultideckContext db,
    IInboxOAuthService oauth,
    HttpClient httpClient,
    IOptions<InboxOptions> options,
    ILogger<InboxProviderSubscriptionService> logger) : IInboxProviderSubscriptionService
{
    private const string GoogleProvider = "google_workspace";
    private const string MicrosoftProvider = "microsoft_365";
    private readonly InboxOptions _options = options.Value;

    public async Task MaintainAsync(CancellationToken cancellationToken)
    {
        if (!_options.EnableWorkers) return;

        await RevokeStaleLocalSubscriptionsAsync(cancellationToken);

        var connections = await db.CommProviderConnections
            .AsNoTracking()
            .Include(connection => connection.CommMailboxes.Where(mailbox =>
                !mailbox.CommMailboxIsDeleted &&
                mailbox.CommMailboxInboundEnabled &&
                mailbox.CommMailboxTypeCode == "personal" &&
                mailbox.CommMailboxGroupId == null))
            .Where(connection =>
                !connection.CommConnIsDeleted &&
                connection.CommConnStatusCode == "active" &&
                connection.CommConnInboundEnabled &&
                (connection.CommConnProviderTypeCode == GoogleProvider ||
                 connection.CommConnProviderTypeCode == MicrosoftProvider))
            .OrderBy(connection => connection.CommConnId)
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var connection in connections)
        {
            var mailbox = connection.CommMailboxes.OrderBy(value => value.CommMailboxId).FirstOrDefault();
            if (mailbox is null || !ProviderPushIsConfigured(connection.CommConnProviderTypeCode)) continue;

            var resource = ProviderResource(connection, mailbox);
            if (resource is null) continue;
            var existing = await ReadSubscriptionAsync(connection.CommConnId, resource, cancellationToken);
            var now = DateTimeOffset.UtcNow;
            if (existing is not null &&
                existing.StatusCode == "active" &&
                existing.ExpiresAt > now.AddMinutes(5) &&
                existing.NextRenewalAt is { } nextRenewal &&
                nextRenewal > now)
            {
                continue;
            }

            var claimed = await ClaimAsync(connection.CommConnId, mailbox.CommMailboxId, resource, existing, cancellationToken);
            if (claimed is null) continue;

            try
            {
                var accessToken = await oauth.GetAccessTokenAsync(connection, cancellationToken);
                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    throw InboxException.Unavailable("No usable provider credential is available for notification renewal.");
                }

                var result = connection.CommConnProviderTypeCode == GoogleProvider
                    ? await MaintainGoogleWatchAsync(accessToken, mailbox, cancellationToken)
                    : await MaintainMicrosoftSubscriptionAsync(accessToken, claimed, cancellationToken);
                await SaveSuccessAsync(claimed.Id, mailbox.CommMailboxId, result, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Inbox provider subscription maintenance failed for connection {ConnectionId}",
                    connection.CommConnId);
                await SaveFailureAsync(claimed.Id, SafeError(exception.Message), cancellationToken);
            }
        }
    }

    public async Task PurgeExpiredOAuthStatesAsync(CancellationToken cancellationToken)
    {
        var deleted = await ExecuteScalarAsync<long>(
            "select public.comm_purge_expired_email_oauth_states(make_interval(secs => @retention_seconds))",
            [("retention_seconds", 86_400)],
            cancellationToken);
        if (deleted > 0)
        {
            logger.LogInformation("Purged {StateCount} expired Inbox OAuth state records", deleted);
        }
    }

    public async Task RevokeConnectionAsync(
        CommProviderConnection connection,
        CancellationToken cancellationToken)
    {
        var subscriptions = await ReadConnectionSubscriptionsAsync(connection.CommConnId, cancellationToken);
        if (subscriptions.Count == 0) return;

        try
        {
            string? accessToken = null;
            try
            {
                accessToken = await oauth.GetAccessTokenAsync(connection, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogDebug(exception, "Provider-side notification cleanup was unavailable for connection {ConnectionId}", connection.CommConnId);
            }

            if (!string.IsNullOrWhiteSpace(accessToken))
            {
                if (connection.CommConnProviderTypeCode == GoogleProvider)
                {
                    try
                    {
                        await StopGoogleWatchAsync(accessToken, cancellationToken);
                    }
                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                    {
                        throw;
                    }
                    catch (Exception exception)
                    {
                        logger.LogWarning(exception, "Gmail watch cleanup failed for connection {ConnectionId}", connection.CommConnId);
                    }
                }
                else if (connection.CommConnProviderTypeCode == MicrosoftProvider)
                {
                    foreach (var subscription in subscriptions.Where(value => !string.IsNullOrWhiteSpace(value.ProviderSubscriptionId)))
                    {
                        try
                        {
                            await DeleteMicrosoftSubscriptionAsync(accessToken, subscription.ProviderSubscriptionId!, cancellationToken);
                        }
                        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                        {
                            throw;
                        }
                        catch (Exception exception)
                        {
                            logger.LogWarning(
                                exception,
                                "Outlook notification cleanup failed for connection {ConnectionId} subscription {SubscriptionRecordId}",
                                connection.CommConnId,
                                subscription.Id);
                        }
                    }
                }
            }
        }
        finally
        {
            var cleanupToken = cancellationToken.IsCancellationRequested ? CancellationToken.None : cancellationToken;
            foreach (var subscription in subscriptions)
            {
                try
                {
                    await DeleteSecretAsync(subscription.ClientStateSecretRef, cleanupToken);
                }
                catch (Exception exception)
                {
                    logger.LogWarning(
                        exception,
                        "Inbox client-state cleanup failed for subscription record {SubscriptionRecordId}",
                        subscription.Id);
                }
            }
            await MarkConnectionSubscriptionsRevokedAsync(connection.CommConnId, cleanupToken);
        }
    }

    private bool ProviderPushIsConfigured(string providerCode) => providerCode switch
    {
        GoogleProvider => _options.Google.Enabled && _options.Google.IsPushConfigured,
        MicrosoftProvider => _options.Microsoft.Enabled && _options.Microsoft.IsPushConfigured,
        _ => false,
    };

    private static string? ProviderResource(CommProviderConnection connection, CommMailbox mailbox)
    {
        if (connection.CommConnProviderTypeCode == GoogleProvider)
        {
            return mailbox.CommMailboxNormalizedAddress.Trim().ToLowerInvariant();
        }
        if (connection.CommConnProviderTypeCode != MicrosoftProvider ||
            string.IsNullOrWhiteSpace(connection.CommConnProviderAccountId))
        {
            return null;
        }
        return $"users/{Uri.EscapeDataString(connection.CommConnProviderAccountId)}/messages";
    }

    private async Task<SubscriptionLease> MaintainGoogleWatchAsync(
        string accessToken,
        CommMailbox mailbox,
        CancellationToken cancellationToken)
    {
        using var request = AuthorizedRequest(
            HttpMethod.Post,
            "https://gmail.googleapis.com/gmail/v1/users/me/watch",
            accessToken);
        request.Content = JsonContent(new
        {
            topicName = _options.Google.PubSubTopicName,
            labelIds = new[] { "INBOX" },
            labelFilterBehavior = "include",
        });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Gmail watch provisioning failed.", cancellationToken);
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var root = document.RootElement;
        var expirationText = root.TryGetProperty("expiration", out var expiration) ? expiration.GetString() : null;
        var historyId = root.TryGetProperty("historyId", out var history) ? history.GetString() : null;
        if (!long.TryParse(expirationText, out var milliseconds))
        {
            throw InboxException.Unavailable("Gmail returned an invalid watch expiry.");
        }
        var expiresAt = DateTimeOffset.FromUnixTimeMilliseconds(milliseconds);
        ValidateExpiry(expiresAt, TimeSpan.FromDays(14));
        var configuredRenewal = DateTimeOffset.UtcNow.AddHours(Math.Clamp(_options.Google.WatchRenewalHours, 1, 48));
        var nextRenewal = EarliestRenewal(configuredRenewal, expiresAt.AddHours(-6), expiresAt);
        return new SubscriptionLease(
            _options.Google.PubSubSubscriptionName,
            mailbox.CommMailboxNormalizedAddress.Trim().ToLowerInvariant(),
            "history_available",
            null,
            expiresAt,
            nextRenewal,
            historyId);
    }

    private async Task<SubscriptionLease> MaintainMicrosoftSubscriptionAsync(
        string accessToken,
        ProviderSubscriptionRecord current,
        CancellationToken cancellationToken)
    {
        var expiry = DateTimeOffset.UtcNow.AddHours(Math.Clamp(_options.Microsoft.SubscriptionLifetimeHours, 1, 72));
        GraphSubscription? remote = null;
        var storedClientState = await GetSecretAsync(current.ClientStateSecretRef, cancellationToken);
        if (!string.IsNullOrWhiteSpace(current.ProviderSubscriptionId) &&
            !string.IsNullOrWhiteSpace(storedClientState) &&
            current.ExpiresAt > DateTimeOffset.UtcNow)
        {
            remote = await RenewMicrosoftSubscriptionAsync(
                accessToken,
                current.ProviderSubscriptionId!,
                expiry,
                cancellationToken);
        }

        var clientStateSecretRef = current.ClientStateSecretRef;
        if (remote is null)
        {
            var previousSecretRef = clientStateSecretRef;
            if (!string.IsNullOrWhiteSpace(current.ProviderSubscriptionId))
            {
                try
                {
                    await DeleteMicrosoftSubscriptionAsync(accessToken, current.ProviderSubscriptionId, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception exception)
                {
                    logger.LogDebug(
                        exception,
                        "A stale Outlook provider subscription could not be removed before replacement for record {SubscriptionRecordId}",
                        current.Id);
                }
            }
            var clientState = CreateClientState();
            clientStateSecretRef = await StoreClientStateAsync(clientState, cancellationToken);
            try
            {
                remote = await CreateMicrosoftSubscriptionAsync(
                    accessToken,
                    current.ProviderResource,
                    clientState,
                    expiry,
                    cancellationToken);
            }
            catch
            {
                await DeleteSecretAsync(clientStateSecretRef, cancellationToken);
                throw;
            }
            if (!string.Equals(previousSecretRef, clientStateSecretRef, StringComparison.Ordinal))
            {
                await DeleteSecretAsync(previousSecretRef, cancellationToken);
            }
        }

        ValidateExpiry(remote.ExpiresAt, TimeSpan.FromDays(7));
        var renewBefore = TimeSpan.FromHours(Math.Clamp(_options.Microsoft.RenewBeforeHours, 1, 24));
        var nextRenewal = EarliestRenewal(remote.ExpiresAt - renewBefore, remote.ExpiresAt.AddHours(-1), remote.ExpiresAt);
        return new SubscriptionLease(
            remote.Id,
            current.ProviderResource,
            "created,updated,deleted",
            clientStateSecretRef,
            remote.ExpiresAt,
            nextRenewal,
            null);
    }

    private async Task<GraphSubscription?> RenewMicrosoftSubscriptionAsync(
        string accessToken,
        string subscriptionId,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        using var request = AuthorizedRequest(
            HttpMethod.Patch,
            $"https://graph.microsoft.com/v1.0/subscriptions/{Uri.EscapeDataString(subscriptionId)}",
            accessToken);
        request.Content = JsonContent(new { expirationDateTime = expiresAt.UtcDateTime.ToString("O") });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            _ = await response.Content.ReadAsStringAsync(cancellationToken);
            return null;
        }
        await EnsureSuccessAsync(response, "Outlook subscription renewal failed.", cancellationToken);
        return await ParseGraphSubscriptionAsync(response, cancellationToken);
    }

    private async Task<GraphSubscription> CreateMicrosoftSubscriptionAsync(
        string accessToken,
        string resource,
        string clientState,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        using var request = AuthorizedRequest(HttpMethod.Post, "https://graph.microsoft.com/v1.0/subscriptions", accessToken);
        request.Content = JsonContent(new
        {
            changeType = "created,updated,deleted",
            notificationUrl = _options.Microsoft.WebhookNotificationUrl,
            lifecycleNotificationUrl = _options.Microsoft.WebhookNotificationUrl,
            resource,
            expirationDateTime = expiresAt.UtcDateTime.ToString("O"),
            clientState,
            latestSupportedTlsVersion = "v1_2",
        });
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Outlook subscription provisioning failed.", cancellationToken);
        return await ParseGraphSubscriptionAsync(response, cancellationToken);
    }

    private static async Task<GraphSubscription> ParseGraphSubscriptionAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var root = document.RootElement;
        var id = root.TryGetProperty("id", out var idValue) ? idValue.GetString() : null;
        var expiryText = root.TryGetProperty("expirationDateTime", out var expiryValue) ? expiryValue.GetString() : null;
        if (string.IsNullOrWhiteSpace(id) || !DateTimeOffset.TryParse(expiryText, out var expiresAt))
        {
            throw InboxException.Unavailable("Outlook returned an invalid subscription lease.");
        }
        return new GraphSubscription(id, expiresAt);
    }

    private async Task StopGoogleWatchAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var request = AuthorizedRequest(
            HttpMethod.Post,
            "https://gmail.googleapis.com/gmail/v1/users/me/stop",
            accessToken);
        request.Content = new ByteArrayContent([]);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone) return;
        await EnsureSuccessAsync(response, "Gmail watch removal failed.", cancellationToken);
    }

    private async Task DeleteMicrosoftSubscriptionAsync(
        string accessToken,
        string subscriptionId,
        CancellationToken cancellationToken)
    {
        using var request = AuthorizedRequest(
            HttpMethod.Delete,
            $"https://graph.microsoft.com/v1.0/subscriptions/{Uri.EscapeDataString(subscriptionId)}",
            accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode || response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone) return;
        await EnsureSuccessAsync(response, "Outlook subscription removal failed.", cancellationToken);
    }

    private async Task<ProviderSubscriptionRecord?> ReadSubscriptionAsync(
        Guid connectionId,
        string resource,
        CancellationToken cancellationToken)
    {
        var values = await ReadSubscriptionsAsync(
            """
            select "CommProviderSubscription_ID",
                   "CommProviderSubscription_ConnectionID",
                   "CommProviderSubscription_MailboxID",
                   "CommProviderSubscription_ProviderSubscriptionID",
                   "CommProviderSubscription_ProviderResource",
                   "CommProviderSubscription_ClientStateSecretRef",
                   "CommProviderSubscription_StatusCode",
                   "CommProviderSubscription_ExpiresAt",
                   "CommProviderSubscription_NextRenewalAt",
                   "CommProviderSubscription_UpdatedAt"
            from public."Comm_ProviderSubscriptions"
            where "CommProviderSubscription_ConnectionID" = @connection_id
              and "CommProviderSubscription_ProviderResource" = @resource
            limit 1
            """,
            [("connection_id", connectionId), ("resource", resource)],
            cancellationToken);
        return values.FirstOrDefault();
    }

    private Task<IReadOnlyList<ProviderSubscriptionRecord>> ReadConnectionSubscriptionsAsync(
        Guid connectionId,
        CancellationToken cancellationToken) =>
        ReadSubscriptionsAsync(
            """
            select "CommProviderSubscription_ID",
                   "CommProviderSubscription_ConnectionID",
                   "CommProviderSubscription_MailboxID",
                   "CommProviderSubscription_ProviderSubscriptionID",
                   "CommProviderSubscription_ProviderResource",
                   "CommProviderSubscription_ClientStateSecretRef",
                   "CommProviderSubscription_StatusCode",
                   "CommProviderSubscription_ExpiresAt",
                   "CommProviderSubscription_NextRenewalAt",
                   "CommProviderSubscription_UpdatedAt"
            from public."Comm_ProviderSubscriptions"
            where "CommProviderSubscription_ConnectionID" = @connection_id
              and "CommProviderSubscription_StatusCode" <> 'revoked'
            """,
            [("connection_id", connectionId)],
            cancellationToken);

    private async Task<ProviderSubscriptionRecord?> ClaimAsync(
        Guid connectionId,
        Guid mailboxId,
        string resource,
        ProviderSubscriptionRecord? existing,
        CancellationToken cancellationToken)
    {
        var sql = existing is null
            ? """
              insert into public."Comm_ProviderSubscriptions" (
                "CommProviderSubscription_ConnectionID",
                "CommProviderSubscription_MailboxID",
                "CommProviderSubscription_ProviderResource",
                "CommProviderSubscription_StatusCode",
                "CommProviderSubscription_ExpiresAt",
                "CommProviderSubscription_NextRenewalAt"
              ) values (@connection_id, @mailbox_id, @resource, 'renewing', now() + interval '10 minutes', now())
              on conflict ("CommProviderSubscription_ConnectionID", "CommProviderSubscription_ProviderResource") do nothing
              returning "CommProviderSubscription_ID"
              """
            : """
              update public."Comm_ProviderSubscriptions"
              set "CommProviderSubscription_StatusCode" = 'renewing',
                  "CommProviderSubscription_MailboxID" = @mailbox_id,
                  "CommProviderSubscription_LastError" = null,
                  "CommProviderSubscription_UpdatedAt" = now()
              where "CommProviderSubscription_ID" = @subscription_id
                and (
                  "CommProviderSubscription_StatusCode" <> 'renewing'
                  or "CommProviderSubscription_UpdatedAt" < now() - interval '10 minutes'
                )
              returning "CommProviderSubscription_ID"
              """;
        var parameters = new List<(string Name, object Value)>
        {
            ("connection_id", connectionId),
            ("mailbox_id", mailboxId),
            ("resource", resource),
            ("subscription_id", existing?.Id ?? Guid.Empty),
        };
        var id = await ExecuteScalarAsync<Guid?>(sql, parameters, cancellationToken);
        if (!id.HasValue) return null;
        return existing is null
            ? new ProviderSubscriptionRecord(
                id.Value,
                connectionId,
                mailboxId,
                null,
                resource,
                null,
                "renewing",
                DateTimeOffset.UtcNow.AddMinutes(10),
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow)
            : existing with { StatusCode = "renewing", MailboxId = mailboxId, UpdatedAt = DateTimeOffset.UtcNow };
    }

    private Task SaveSuccessAsync(
        Guid id,
        Guid mailboxId,
        SubscriptionLease lease,
        CancellationToken cancellationToken) =>
        ExecuteNonQueryAsync(
            """
            update public."Comm_ProviderSubscriptions"
            set "CommProviderSubscription_MailboxID" = @mailbox_id,
                "CommProviderSubscription_ProviderSubscriptionID" = @provider_subscription_id,
                "CommProviderSubscription_ProviderResource" = @provider_resource,
                "CommProviderSubscription_ChangeTypes" = @change_types,
                "CommProviderSubscription_ClientStateSecretRef" = @client_state_secret_ref,
                "CommProviderSubscription_StatusCode" = 'active',
                "CommProviderSubscription_ExpiresAt" = @expires_at,
                "CommProviderSubscription_NextRenewalAt" = @next_renewal_at,
                "CommProviderSubscription_LastCursor" = coalesce(@last_cursor, "CommProviderSubscription_LastCursor"),
                "CommProviderSubscription_LastError" = null,
                "CommProviderSubscription_UpdatedAt" = now()
            where "CommProviderSubscription_ID" = @subscription_id
            """,
            [
                ("mailbox_id", mailboxId),
                ("provider_subscription_id", DbValue(lease.ProviderSubscriptionId)),
                ("provider_resource", lease.ProviderResource),
                ("change_types", DbValue(lease.ChangeTypes)),
                ("client_state_secret_ref", DbValue(lease.ClientStateSecretRef)),
                ("expires_at", lease.ExpiresAt),
                ("next_renewal_at", lease.NextRenewalAt),
                ("last_cursor", DbValue(lease.LastCursor)),
                ("subscription_id", id),
            ],
            cancellationToken);

    private Task SaveFailureAsync(Guid id, string error, CancellationToken cancellationToken) =>
        ExecuteNonQueryAsync(
            """
            update public."Comm_ProviderSubscriptions"
            set "CommProviderSubscription_StatusCode" = 'error',
                "CommProviderSubscription_NextRenewalAt" = null,
                "CommProviderSubscription_LastError" = @error,
                "CommProviderSubscription_UpdatedAt" = now()
            where "CommProviderSubscription_ID" = @subscription_id
            """,
            [("error", error), ("subscription_id", id)],
            cancellationToken);

    private async Task RevokeStaleLocalSubscriptionsAsync(CancellationToken cancellationToken)
    {
        var secretRefs = new List<string>();
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = CreateCommand(
                connection,
                """
                with stale as (
                  select subscription."CommProviderSubscription_ID" as id,
                         subscription."CommProviderSubscription_ClientStateSecretRef" as secret_ref
                  from public."Comm_ProviderSubscriptions" as subscription
                  join public."Comm_ProviderConnections" as connection
                    on connection."CommConn_ID" = subscription."CommProviderSubscription_ConnectionID"
                  left join public."Comm_Mailboxes" as mailbox
                    on mailbox."CommMailbox_ID" = subscription."CommProviderSubscription_MailboxID"
                  where subscription."CommProviderSubscription_StatusCode" <> 'revoked'
                    and (
                      connection."CommConn_IsDeleted"
                      or not connection."CommConn_InboundEnabled"
                      or connection."CommConn_StatusCode" <> 'active'
                      or mailbox."CommMailbox_ID" is null
                      or mailbox."CommMailbox_IsDeleted"
                      or not mailbox."CommMailbox_InboundEnabled"
                    )
                ), updated as (
                  update public."Comm_ProviderSubscriptions" as subscription
                  set "CommProviderSubscription_StatusCode" = 'revoked',
                      "CommProviderSubscription_NextRenewalAt" = null,
                      "CommProviderSubscription_ProviderSubscriptionID" = null,
                      "CommProviderSubscription_ClientStateSecretRef" = null,
                      "CommProviderSubscription_UpdatedAt" = now()
                  from stale
                  where subscription."CommProviderSubscription_ID" = stale.id
                  returning stale.secret_ref
                )
                select secret_ref from updated
                """,
                []);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (!reader.IsDBNull(0)) secretRefs.Add(reader.GetString(0));
            }
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
        foreach (var secretRef in secretRefs) await DeleteSecretAsync(secretRef, cancellationToken);
    }

    private Task MarkConnectionSubscriptionsRevokedAsync(Guid connectionId, CancellationToken cancellationToken) =>
        ExecuteNonQueryAsync(
            """
            update public."Comm_ProviderSubscriptions"
            set "CommProviderSubscription_StatusCode" = 'revoked',
                "CommProviderSubscription_NextRenewalAt" = null,
                "CommProviderSubscription_ProviderSubscriptionID" = null,
                "CommProviderSubscription_ClientStateSecretRef" = null,
                "CommProviderSubscription_UpdatedAt" = now()
            where "CommProviderSubscription_ConnectionID" = @connection_id
              and "CommProviderSubscription_StatusCode" <> 'revoked'
            """,
            [("connection_id", connectionId)],
            cancellationToken);

    private Task<string?> GetSecretAsync(string? secretRef, CancellationToken cancellationToken) =>
        string.IsNullOrWhiteSpace(secretRef)
            ? Task.FromResult<string?>(null)
            : ExecuteScalarAsync<string?>(
                "select public.comm_get_email_secret(@secret_ref)",
                [("secret_ref", secretRef)],
                cancellationToken);

    private Task<string> StoreClientStateAsync(string clientState, CancellationToken cancellationToken) =>
        ExecuteRequiredScalarAsync<string>(
            "select public.comm_put_email_secret(@secret, @name, @description)",
            [
                ("secret", clientState),
                ("name", $"email-graph-client-state:{Guid.NewGuid():N}"),
                ("description", "Microsoft Graph webhook client state for Multideck Inbox."),
            ],
            cancellationToken);

    private async Task DeleteSecretAsync(string? secretRef, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(secretRef)) return;
        _ = await ExecuteScalarAsync<bool?>(
            "select public.comm_delete_email_secret(@secret_ref)",
            [("secret_ref", secretRef)],
            cancellationToken);
    }

    private async Task<IReadOnlyList<ProviderSubscriptionRecord>> ReadSubscriptionsAsync(
        string sql,
        IReadOnlyList<(string Name, object Value)> parameters,
        CancellationToken cancellationToken)
    {
        var result = new List<ProviderSubscriptionRecord>();
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = CreateCommand(connection, sql, parameters);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                result.Add(new ProviderSubscriptionRecord(
                    reader.GetGuid(0),
                    reader.GetGuid(1),
                    reader.IsDBNull(2) ? null : reader.GetGuid(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.GetString(6),
                    AsUtcOffset(reader.GetDateTime(7)),
                    reader.IsDBNull(8) ? null : AsUtcOffset(reader.GetDateTime(8)),
                    AsUtcOffset(reader.GetDateTime(9))));
            }
            return result;
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private async Task<T?> ExecuteScalarAsync<T>(
        string sql,
        IReadOnlyList<(string Name, object Value)> parameters,
        CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = CreateCommand(connection, sql, parameters);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is null or DBNull ? default : (T)value;
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private async Task<T> ExecuteRequiredScalarAsync<T>(
        string sql,
        IReadOnlyList<(string Name, object Value)> parameters,
        CancellationToken cancellationToken) where T : class =>
        await ExecuteScalarAsync<T>(sql, parameters, cancellationToken)
        ?? throw InboxException.Unavailable("The tenant credential vault did not return a secret reference.");

    private async Task ExecuteNonQueryAsync(
        string sql,
        IReadOnlyList<(string Name, object Value)> parameters,
        CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = CreateCommand(connection, sql, parameters);
            _ = await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    private static DbCommand CreateCommand(
        DbConnection connection,
        string sql,
        IReadOnlyList<(string Name, object Value)> parameters)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.Value = value;
            command.Parameters.Add(parameter);
        }
        return command;
    }

    private static HttpRequestMessage AuthorizedRequest(HttpMethod method, string url, string accessToken)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private static StringContent JsonContent(object value) =>
        new(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json");

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        string publicMessage,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        _ = await response.Content.ReadAsStringAsync(cancellationToken);
        throw InboxException.Unavailable($"{publicMessage} Provider returned status {(int)response.StatusCode}.");
    }

    private static DateTimeOffset EarliestRenewal(
        DateTimeOffset preferred,
        DateTimeOffset latest,
        DateTimeOffset expiresAt)
    {
        var candidate = preferred < latest ? preferred : latest;
        var minimum = DateTimeOffset.UtcNow.AddMinutes(5);
        if (candidate < minimum) candidate = minimum;
        return candidate < expiresAt ? candidate : expiresAt.AddMinutes(-1);
    }

    private static void ValidateExpiry(DateTimeOffset expiresAt, TimeSpan maximum)
    {
        var now = DateTimeOffset.UtcNow;
        if (expiresAt <= now.AddMinutes(5) || expiresAt > now.Add(maximum))
        {
            throw InboxException.Unavailable("The provider returned an invalid notification lease expiry.");
        }
    }

    private static string CreateClientState()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static object DbValue(string? value) => value is null ? DBNull.Value : value;

    private static DateTimeOffset AsUtcOffset(DateTime value) =>
        new(value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc));

    private static string SafeError(string value)
    {
        var normalized = value.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return normalized.Length <= 500 ? normalized : normalized[..500];
    }

    private sealed record GraphSubscription(string Id, DateTimeOffset ExpiresAt);

    private sealed record SubscriptionLease(
        string? ProviderSubscriptionId,
        string ProviderResource,
        string? ChangeTypes,
        string? ClientStateSecretRef,
        DateTimeOffset ExpiresAt,
        DateTimeOffset NextRenewalAt,
        string? LastCursor);

    private sealed record ProviderSubscriptionRecord(
        Guid Id,
        Guid ConnectionId,
        Guid? MailboxId,
        string? ProviderSubscriptionId,
        string ProviderResource,
        string? ClientStateSecretRef,
        string StatusCode,
        DateTimeOffset ExpiresAt,
        DateTimeOffset? NextRenewalAt,
        DateTimeOffset UpdatedAt);
}
