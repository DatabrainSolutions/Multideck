using System.Net;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using Multideck.Persistence.Entities;
using Microsoft.Extensions.Options;

namespace Multideck.Server.Modules.Inbox.Providers;

public sealed class GmailEmailProviderClient(HttpClient httpClient, IOptions<InboxOptions> options) : IEmailProviderClient
{
    private readonly InboxOptions _options = options.Value;

    public string ProviderCode => _options.Google.ProviderCode;
    public string PublicName => "gmail";

    public async Task<IReadOnlyList<ProviderMailbox>> DiscoverMailboxesAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync("gmail/v1/users/me/profile", accessToken, cancellationToken);
        var email = document.RootElement.GetProperty("emailAddress").GetString()
            ?? throw InboxException.Unavailable("Google did not return a mailbox address.");
        return [new ProviderMailbox("me", email, email, "personal")];
    }

    public async Task<ProviderMailbox> ValidateSharedMailboxAsync(string accessToken, string address, CancellationToken cancellationToken)
    {
        var normalized = EmailSafety.NormalizeEmail(address)
            ?? throw InboxException.BadRequest("Enter a valid shared Gmail address.");
        using var document = await GetJsonAsync("gmail/v1/users/me/profile", accessToken, cancellationToken);
        var authenticatedAddress = EmailSafety.NormalizeEmail(document.RootElement.GetProperty("emailAddress").GetString());
        if (!string.Equals(normalized, authenticatedAddress, StringComparison.OrdinalIgnoreCase))
        {
            throw InboxException.BadRequest(
                "Gmail cannot connect a Google Group archive or another user's mailbox through ordinary OAuth. Messages delivered by a group remain available in the connected personal inbox, including Reply all.");
        }
        return new ProviderMailbox("me", authenticatedAddress!, authenticatedAddress!, "personal");
    }

    public async Task<ProviderSyncResult> SyncAsync(
        string accessToken,
        CommMailbox mailbox,
        int initialMessageLimit,
        CancellationToken cancellationToken)
    {
        var userId = string.IsNullOrWhiteSpace(mailbox.CommMailboxProviderMailboxId)
            ? "me"
            : mailbox.CommMailboxProviderMailboxId;
        var messageIds = new HashSet<string>(StringComparer.Ordinal);
        string? nextCursor;

        if (!string.IsNullOrWhiteSpace(mailbox.CommMailboxSyncCursor))
        {
            var cursor = ParseHistoryCursor(mailbox.CommMailboxSyncCursor);
            var historyAvailable = true;
            string? latestHistoryId = cursor.HistoryId;
            string? pageToken = cursor.PageToken;
            const int maxHistoryPagesPerRun = 20;
            for (var page = 0; page < maxHistoryPagesPerRun; page++)
            {
                var historyUri = $"gmail/v1/users/{Uri.EscapeDataString(userId)}/history?startHistoryId={Uri.EscapeDataString(cursor.HistoryId)}&historyTypes=messageAdded&maxResults=100";
                if (!string.IsNullOrWhiteSpace(pageToken)) historyUri += $"&pageToken={Uri.EscapeDataString(pageToken)}";
                using var history = await TryGetHistoryPageAsync(historyUri, accessToken, cancellationToken);
                if (history is null)
                {
                    historyAvailable = false;
                    break;
                }
                if (history.RootElement.TryGetProperty("history", out var entries))
                {
                    foreach (var entry in entries.EnumerateArray())
                    {
                        if (!entry.TryGetProperty("messagesAdded", out var additions)) continue;
                        foreach (var addition in additions.EnumerateArray())
                        {
                            if (addition.TryGetProperty("message", out var message) &&
                                message.TryGetProperty("id", out var id) &&
                                id.GetString() is { Length: > 0 } value)
                            {
                                messageIds.Add(value);
                            }
                        }
                    }
                }
                latestHistoryId = history.RootElement.TryGetProperty("historyId", out var historyId)
                    ? historyId.GetString() ?? latestHistoryId
                    : latestHistoryId;
                pageToken = history.RootElement.TryGetProperty("nextPageToken", out var nextPage) ? nextPage.GetString() : null;
                if (string.IsNullOrWhiteSpace(pageToken)) break;
            }

            if (!historyAvailable)
            {
                nextCursor = await GetCurrentHistoryIdAsync(userId, accessToken, cancellationToken);
                await AddInitialMessageIdsAsync(userId, accessToken, initialMessageLimit, messageIds, cancellationToken);
            }
            else
            {
                // A page token is persisted with the original history id when the defensive cap is
                // reached. The next worker run resumes instead of advancing and silently skipping.
                nextCursor = string.IsNullOrWhiteSpace(pageToken)
                    ? latestHistoryId
                    : SerializeHistoryCursor(cursor.HistoryId, pageToken);
            }
        }
        else
        {
            nextCursor = await GetCurrentHistoryIdAsync(userId, accessToken, cancellationToken);
            await AddInitialMessageIdsAsync(userId, accessToken, initialMessageLimit, messageIds, cancellationToken);
        }

        var providerMessages = new List<ProviderInboundMessage>(messageIds.Count);
        foreach (var id in messageIds)
        {
            using var message = await GetJsonAsync(
                $"gmail/v1/users/{Uri.EscapeDataString(userId)}/messages/{Uri.EscapeDataString(id)}?format=full",
                accessToken,
                cancellationToken);
            providerMessages.Add(ParseMessage(message.RootElement));
        }

        return new ProviderSyncResult(providerMessages, nextCursor ?? mailbox.CommMailboxSyncCursor);
    }

    private async Task AddInitialMessageIdsAsync(
        string userId,
        string accessToken,
        int initialMessageLimit,
        ISet<string> messageIds,
        CancellationToken cancellationToken)
    {
        var limit = Math.Clamp(initialMessageLimit, 1, 100);
        using var list = await GetJsonAsync(
            $"gmail/v1/users/{Uri.EscapeDataString(userId)}/messages?maxResults={limit}&includeSpamTrash=false",
            accessToken,
            cancellationToken);
        if (!list.RootElement.TryGetProperty("messages", out var messages)) return;
        foreach (var message in messages.EnumerateArray())
        {
            if (message.TryGetProperty("id", out var id) && id.GetString() is { Length: > 0 } value) messageIds.Add(value);
        }
    }

    private async Task<string?> GetCurrentHistoryIdAsync(string userId, string accessToken, CancellationToken cancellationToken)
    {
        using var profile = await GetJsonAsync($"gmail/v1/users/{Uri.EscapeDataString(userId)}/profile", accessToken, cancellationToken);
        return profile.RootElement.TryGetProperty("historyId", out var historyId) ? historyId.GetString() : null;
    }

    private async Task<JsonDocument?> TryGetHistoryPageAsync(string path, string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, path, accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            _ = await response.Content.ReadAsStringAsync(cancellationToken);
            return null;
        }
        await EnsureSuccessAsync(response, "Gmail could not load mailbox history.", cancellationToken);
        return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    }

    internal static GmailHistoryCursor ParseHistoryCursor(string value)
    {
        if (!value.TrimStart().StartsWith('{')) return new GmailHistoryCursor(value, null);
        try
        {
            return JsonSerializer.Deserialize<GmailHistoryCursor>(value, new JsonSerializerOptions(JsonSerializerDefaults.Web)) is { HistoryId.Length: > 0 } cursor
                ? cursor
                : new GmailHistoryCursor(value, null);
        }
        catch (JsonException) { return new GmailHistoryCursor(value, null); }
    }

    private static string SerializeHistoryCursor(string historyId, string pageToken) =>
        JsonSerializer.Serialize(new GmailHistoryCursor(historyId, pageToken), new JsonSerializerOptions(JsonSerializerDefaults.Web));

    internal sealed record GmailHistoryCursor(string HistoryId, string? PageToken);

    public async Task<ProviderSendResult> SendAsync(
        string accessToken,
        CommMailbox mailbox,
        ProviderOutgoingMessage message,
        CancellationToken cancellationToken)
    {
        var raw = BuildRfc822(mailbox.CommMailboxAddress, message);
        var body = JsonSerializer.Serialize(new
        {
            raw = Base64UrlEncode(Encoding.UTF8.GetBytes(raw)),
            threadId = message.ProviderThreadId,
        });
        var userId = string.IsNullOrWhiteSpace(mailbox.CommMailboxProviderMailboxId)
            ? "me"
            : mailbox.CommMailboxProviderMailboxId;
        using var request = CreateRequest(
            HttpMethod.Post,
            $"gmail/v1/users/{Uri.EscapeDataString(userId)}/messages/send",
            accessToken);
        request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Gmail could not send this message.", cancellationToken);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(cancellationToken));
        return new ProviderSendResult(
            document.RootElement.GetProperty("id").GetString()!,
            document.RootElement.TryGetProperty("threadId", out var threadId) ? threadId.GetString() : message.ProviderThreadId,
            null,
            DateTimeOffset.UtcNow);
    }

    public async Task<ProviderAttachmentContent> DownloadAttachmentAsync(
        string accessToken,
        CommMailbox mailbox,
        string providerMessageId,
        string providerAttachmentId,
        long maxBytes,
        CancellationToken cancellationToken)
    {
        var userId = string.IsNullOrWhiteSpace(mailbox.CommMailboxProviderMailboxId) ? "me" : mailbox.CommMailboxProviderMailboxId;
        using var document = await GetJsonAsync(
            $"gmail/v1/users/{Uri.EscapeDataString(userId)}/messages/{Uri.EscapeDataString(providerMessageId)}/attachments/{Uri.EscapeDataString(providerAttachmentId)}",
            accessToken,
            cancellationToken);
        var encoded = document.RootElement.TryGetProperty("data", out var data) ? data.GetString() : null;
        if (string.IsNullOrWhiteSpace(encoded)) throw InboxException.NotFound("The provider no longer has this attachment.");
        if (encoded.Length > ((maxBytes + 2) / 3) * 4 + 16) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
        byte[] content;
        try { content = Base64UrlDecode(encoded); }
        catch (FormatException) { throw InboxException.Unavailable("Gmail returned an invalid attachment payload."); }
        if (content.LongLength > maxBytes) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
        return new ProviderAttachmentContent(content, null);
    }

    private async Task<JsonDocument> GetJsonAsync(string path, string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, path, accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Gmail could not load this mailbox.", cancellationToken);
        return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    }

    private static HttpRequestMessage CreateRequest(HttpMethod method, string path, string accessToken)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return request;
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, string message, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;
        _ = await response.Content.ReadAsStringAsync(cancellationToken);
        throw InboxException.Unavailable($"{message} Provider returned status {(int)response.StatusCode}.");
    }

    private static ProviderInboundMessage ParseMessage(JsonElement root)
    {
        var payload = root.GetProperty("payload");
        var headers = ReadHeaders(payload);
        var bodies = ReadBodies(payload);
        var id = root.GetProperty("id").GetString()!;
        var threadId = root.GetProperty("threadId").GetString() ?? id;
        var labels = root.TryGetProperty("labelIds", out var labelIds)
            ? labelIds.EnumerateArray().Select(value => value.GetString()).Where(value => value is not null).ToHashSet(StringComparer.OrdinalIgnoreCase)
            : [];
        var occurredAt = root.TryGetProperty("internalDate", out var internalDate) && long.TryParse(internalDate.GetString(), out var milliseconds)
            ? DateTimeOffset.FromUnixTimeMilliseconds(milliseconds)
            : ParseDate(headers.GetValueOrDefault("Date"));

        return new ProviderInboundMessage(
            id,
            threadId,
            null,
            headers.GetValueOrDefault("Message-Id"),
            headers.GetValueOrDefault("Subject") ?? "(No subject)",
            root.TryGetProperty("snippet", out var snippet) ? snippet.GetString() ?? string.Empty : string.Empty,
            bodies.Text,
            bodies.Html,
            occurredAt,
            labels.Contains("DRAFT"),
            ParseAddresses(headers.GetValueOrDefault("From")),
            ParseAddresses(headers.GetValueOrDefault("To")),
            ParseAddresses(headers.GetValueOrDefault("Cc")),
            ParseAddresses(headers.GetValueOrDefault("Bcc")),
            bodies.Attachments,
            headers);
    }

    private static Dictionary<string, string> ReadHeaders(JsonElement payload)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!payload.TryGetProperty("headers", out var headers)) return result;
        foreach (var header in headers.EnumerateArray())
        {
            var name = header.GetProperty("name").GetString();
            var value = header.GetProperty("value").GetString();
            if (!string.IsNullOrWhiteSpace(name) && value is not null) result[name] = value;
        }
        return result;
    }

    private static (string? Text, string? Html, IReadOnlyList<ProviderAttachment> Attachments) ReadBodies(JsonElement payload)
    {
        string? text = null;
        string? html = null;
        var attachments = new List<ProviderAttachment>();

        void Visit(JsonElement part)
        {
            var mimeType = part.TryGetProperty("mimeType", out var mime) ? mime.GetString() : null;
            var fileName = part.TryGetProperty("filename", out var file) ? file.GetString() : null;
            var partHeaders = ReadHeaders(part);
            if (part.TryGetProperty("body", out var body))
            {
                if (body.TryGetProperty("data", out var data) && data.GetString() is { Length: > 0 } encoded)
                {
                    if (string.Equals(mimeType, "text/plain", StringComparison.OrdinalIgnoreCase))
                    {
                        text ??= Encoding.UTF8.GetString(Base64UrlDecode(encoded));
                    }
                    if (string.Equals(mimeType, "text/html", StringComparison.OrdinalIgnoreCase))
                    {
                        html ??= Encoding.UTF8.GetString(Base64UrlDecode(encoded));
                    }
                }
                if (body.TryGetProperty("attachmentId", out var attachmentId) && attachmentId.GetString() is { Length: > 0 } providerId)
                {
                    var contentId = partHeaders.GetValueOrDefault("Content-ID")?.Trim().Trim('<', '>');
                    var disposition = partHeaders.GetValueOrDefault("Content-Disposition");
                    attachments.Add(new ProviderAttachment(
                        providerId,
                        EmailSafety.SafeFileName(fileName),
                        mimeType,
                        body.TryGetProperty("size", out var size) ? size.GetInt64() : null,
                        !string.IsNullOrWhiteSpace(contentId) || disposition?.StartsWith("inline", StringComparison.OrdinalIgnoreCase) == true,
                        contentId));
                }
            }
            if (part.TryGetProperty("parts", out var parts))
            {
                foreach (var child in parts.EnumerateArray()) Visit(child);
            }
        }

        Visit(payload);
        return (text, html, attachments);
    }

    internal static IReadOnlyList<ProviderAddress> ParseAddresses(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return [];
        try
        {
            var collection = new MailAddressCollection();
            collection.Add(value);
            return collection.Cast<MailAddress>()
                .Select(address => new ProviderAddress(address.Address.ToLowerInvariant(), string.IsNullOrWhiteSpace(address.DisplayName) ? null : address.DisplayName))
                .ToList();
        }
        catch (FormatException)
        {
            return [];
        }
    }

    private static DateTimeOffset ParseDate(string? value) =>
        DateTimeOffset.TryParse(value, out var parsed) ? parsed : DateTimeOffset.UtcNow;

    private static string BuildRfc822(string from, ProviderOutgoingMessage message)
    {
        var builder = new StringBuilder();
        builder.Append("From: ").AppendLine(from);
        builder.Append("To: ").AppendLine(JoinAddresses(message.To));
        if (message.Cc.Count > 0) builder.Append("Cc: ").AppendLine(JoinAddresses(message.Cc));
        if (message.Bcc.Count > 0) builder.Append("Bcc: ").AppendLine(JoinAddresses(message.Bcc));
        builder.Append("Subject: ").AppendLine(message.Subject.Replace("\r", string.Empty, StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal));
        if (SafeHeaderValue(message.InReplyTo) is { Length: > 0 } inReplyTo) builder.Append("In-Reply-To: ").AppendLine(inReplyTo);
        if (SafeHeaderValue(message.References) is { Length: > 0 } references) builder.Append("References: ").AppendLine(references);
        builder.AppendLine("MIME-Version: 1.0");
        if (!string.IsNullOrWhiteSpace(message.BodyHtml))
        {
            builder.AppendLine("Content-Type: text/html; charset=utf-8");
            builder.AppendLine("Content-Transfer-Encoding: 8bit");
            builder.AppendLine();
            builder.Append(message.BodyHtml);
        }
        else
        {
            builder.AppendLine("Content-Type: text/plain; charset=utf-8");
            builder.AppendLine("Content-Transfer-Encoding: 8bit");
            builder.AppendLine();
            builder.Append(message.BodyText);
        }
        return builder.ToString();
    }

    private static string JoinAddresses(IEnumerable<ProviderAddress> addresses) => string.Join(", ", addresses.Select(address =>
    {
        var displayName = SafeHeaderValue(address.DisplayName);
        return string.IsNullOrWhiteSpace(displayName)
            ? address.Address
            : $"\"{displayName.Replace("\"", "'", StringComparison.Ordinal)}\" <{address.Address}>";
    }));

    private static string? SafeHeaderValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var safe = new string(value.Where(character => character is not '\r' and not '\n' && (!char.IsControl(character) || character == '\t')).ToArray()).Trim();
        return safe.Length <= 8_000 ? safe : safe[..8_000];
    }

    private static string Base64UrlEncode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized += new string('=', (4 - normalized.Length % 4) % 4);
        return Convert.FromBase64String(normalized);
    }

}
