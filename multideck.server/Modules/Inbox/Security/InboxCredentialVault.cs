using System.Data;
using System.Data.Common;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Server.Modules.Inbox.Providers;

namespace Multideck.Server.Modules.Inbox.Security;

public interface IInboxCredentialVault
{
    Task<string> StoreAsync(InboxProviderCredential credential, string name, CancellationToken cancellationToken);
    Task<InboxProviderCredential?> GetAsync(string? secretReference, CancellationToken cancellationToken);
    Task UpdateAsync(string secretReference, InboxProviderCredential credential, CancellationToken cancellationToken);
    Task DeleteAsync(string? secretReference, CancellationToken cancellationToken);
}

/// <summary>
/// Stores OAuth credentials in Supabase Vault. Comm_ProviderConnections retains only the opaque
/// vault UUID, never an access or refresh token. The tenant database must have the Supabase Vault
/// extension enabled and the API database role must be allowed to call its functions.
/// </summary>
public sealed class SupabaseVaultInboxCredentialVault(
    MultideckContext db,
    ILogger<SupabaseVaultInboxCredentialVault> logger) : IInboxCredentialVault
{
    private const string Prefix = "supabase-vault:";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<string> StoreAsync(InboxProviderCredential credential, string name, CancellationToken cancellationToken)
    {
        var value = JsonSerializer.Serialize(credential, JsonOptions);
        var id = await ExecuteScalarAsync<Guid>(
            "select vault.create_secret(@secret, @name, @description)",
            [
                ("secret", value),
                ("name", name),
                ("description", "Multideck Inbox OAuth credential"),
            ],
            cancellationToken);
        return Prefix + id.ToString("D");
    }

    public async Task<InboxProviderCredential?> GetAsync(string? secretReference, CancellationToken cancellationToken)
    {
        if (!TryParseReference(secretReference, out var id))
        {
            return null;
        }

        var value = await ExecuteScalarAsync<string?>(
            "select decrypted_secret from vault.decrypted_secrets where id = @id",
            [("id", id)],
            cancellationToken);
        return string.IsNullOrWhiteSpace(value)
            ? null
            : JsonSerializer.Deserialize<InboxProviderCredential>(value, JsonOptions);
    }

    public Task UpdateAsync(string secretReference, InboxProviderCredential credential, CancellationToken cancellationToken)
    {
        if (!TryParseReference(secretReference, out var id))
        {
            throw InboxException.Unavailable("The stored mailbox credential reference is invalid.");
        }

        return ExecuteNonQueryAsync(
            "select vault.update_secret(@id, @secret, null, null)",
            [("id", id), ("secret", JsonSerializer.Serialize(credential, JsonOptions))],
            cancellationToken);
    }

    public Task DeleteAsync(string? secretReference, CancellationToken cancellationToken)
    {
        if (!TryParseReference(secretReference, out var id))
        {
            return Task.CompletedTask;
        }

        return ExecuteNonQueryAsync(
            "delete from vault.secrets where id = @id",
            [("id", id)],
            cancellationToken);
    }

    private async Task<T?> ExecuteScalarAsync<T>(string sql, IReadOnlyList<(string Name, object Value)> parameters, CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere)
        {
            await connection.OpenAsync(cancellationToken);
        }

        try
        {
            await using var command = CreateCommand(connection, sql, parameters);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is null or DBNull)
            {
                return default;
            }
            return (T)result;
        }
        catch (DbException exception)
        {
            logger.LogError(exception, "The Supabase Vault operation for Inbox credentials failed");
            throw InboxException.Unavailable("The tenant credential vault is unavailable. Check the tenant Vault configuration and try again.");
        }
        finally
        {
            if (openedHere)
            {
                await connection.CloseAsync();
            }
        }
    }

    private async Task ExecuteNonQueryAsync(string sql, IReadOnlyList<(string Name, object Value)> parameters, CancellationToken cancellationToken)
    {
        _ = await ExecuteScalarAsync<object?>(sql, parameters, cancellationToken);
    }

    private static DbCommand CreateCommand(DbConnection connection, string sql, IReadOnlyList<(string Name, object Value)> parameters)
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

    private static bool TryParseReference(string? reference, out Guid id)
    {
        id = default;
        return !string.IsNullOrWhiteSpace(reference) &&
               reference.StartsWith(Prefix, StringComparison.Ordinal) &&
               Guid.TryParse(reference[Prefix.Length..], out id);
    }
}
