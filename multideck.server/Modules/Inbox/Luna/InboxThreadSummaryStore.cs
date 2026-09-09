using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Inbox.Luna;

public interface IInboxThreadSummaryStore
{
    Task<InboxThreadSummaryDto> GetAsync(Guid threadId, IReadOnlyList<CommMessage> messages, CancellationToken cancellationToken);
    Task<InboxThreadSummaryDto> SaveAsync(Guid threadId, Guid userId, string model, string summary, IReadOnlyList<string> keyPoints, IReadOnlyList<string> actions, IReadOnlyList<CommMessage> messages, CancellationToken cancellationToken);
}

public sealed class InboxThreadSummaryStore(MultideckContext db) : IInboxThreadSummaryStore
{
    public async Task<InboxThreadSummaryDto> GetAsync(
        Guid threadId,
        IReadOnlyList<CommMessage> messages,
        CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                select "CommThreadSummary_ModelCode", "CommThreadSummary_SummaryText",
                       "CommThreadSummary_StructuredJSON"::text, "CommThreadSummary_SourceFingerprint",
                       "CommThreadSummary_GeneratedAt"
                from public."Comm_ThreadSummaries"
                where "CommThreadSummary_ThreadID" = @thread_id
                  and "CommThreadSummary_SupersededAt" is null
                limit 1
                """;
            AddParameter(command, "thread_id", threadId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Empty();
            var model = reader.GetString(0);
            var text = reader.GetString(1);
            var structuredJson = reader.GetString(2);
            var storedFingerprint = reader.GetString(3);
            var updatedAt = reader.GetDateTime(4);
            var structured = ParseStructured(structuredJson);
            var currentFingerprint = Fingerprint(messages);
            var isCurrent = storedFingerprint == currentFingerprint;
            return new InboxThreadSummaryDto(
                isCurrent ? "ready" : "stale",
                isCurrent ? text : null,
                isCurrent ? structured.KeyPoints : [],
                isCurrent ? structured.SourceMessageIds : [],
                model,
                updatedAt,
                null);
        }
        catch (DbException)
        {
            // Expand-and-contract: before the summary migration is applied, the Inbox remains
            // usable and accurately reports no summary instead of reading the legacy free-text field.
            return Empty();
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }
    }

    public async Task<InboxThreadSummaryDto> SaveAsync(
        Guid threadId,
        Guid userId,
        string model,
        string summary,
        IReadOnlyList<string> keyPoints,
        IReadOnlyList<string> actions,
        IReadOnlyList<CommMessage> messages,
        CancellationToken cancellationToken)
    {
        var ordered = messages.OrderBy(MessageAt).ThenBy(message => message.CommMessageId).ToList();
        var sourceMessageIds = ordered.Select(message => message.CommMessageId).ToList();
        var sourceLastMessageId = ordered.LastOrDefault()?.CommMessageId;
        var fingerprint = Fingerprint(ordered);
        var structured = JsonSerializer.Serialize(new { keyPoints, actions, sourceMessageIds }, JsonOptions);
        var connection = db.Database.GetDbConnection();
        var openedHere = connection.State != ConnectionState.Open;
        if (openedHere) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "select public.comm_save_email_thread_summary(@thread_id, @model, @summary, cast(@structured as jsonb), @message_count, @last_message_id, @fingerprint, @user_id)";
            AddParameter(command, "thread_id", threadId);
            AddParameter(command, "model", model);
            AddParameter(command, "summary", summary);
            AddParameter(command, "structured", structured);
            AddParameter(command, "message_count", ordered.Count);
            AddParameter(command, "last_message_id", sourceLastMessageId.HasValue ? sourceLastMessageId.Value : DBNull.Value);
            AddParameter(command, "fingerprint", fingerprint);
            AddParameter(command, "user_id", userId);
            _ = await command.ExecuteScalarAsync(cancellationToken);
        }
        finally
        {
            if (openedHere) await connection.CloseAsync();
        }

        return new InboxThreadSummaryDto("ready", summary, keyPoints, sourceMessageIds, model, DateTime.UtcNow, null);
    }

    private static string Fingerprint(IReadOnlyList<CommMessage> messages)
    {
        var input = string.Join('\n', messages.OrderBy(MessageAt).ThenBy(message => message.CommMessageId).Select(message =>
            $"{message.CommMessageId:N}|{message.CommMessageContentHashSha256}|{message.CommMessageUpdatedAt.ToUniversalTime().Ticks}"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();
    }

    private static StructuredSummary ParseStructured(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<StructuredSummary>(json, JsonOptions) ?? new([], [], []);
        }
        catch (JsonException)
        {
            return new([], [], []);
        }
    }

    private static InboxThreadSummaryDto Empty() => new("none", null, [], [], null, null, null);
    private static DateTime MessageAt(CommMessage message) => message.CommMessageMessageDate ?? message.CommMessageCreatedAt;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { PropertyNameCaseInsensitive = true };

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private sealed record StructuredSummary(IReadOnlyList<string> KeyPoints, IReadOnlyList<string> Actions, IReadOnlyList<Guid> SourceMessageIds);
}
