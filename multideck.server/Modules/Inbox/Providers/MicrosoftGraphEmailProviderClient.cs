using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Inbox.Providers;

public sealed class MicrosoftGraphEmailProviderClient(HttpClient httpClient, IOptions<InboxOptions> options) : IEmailProviderClient
{
    private readonly InboxOptions _options = options.Value;
    private const string MessageSelect = "id,conversationId,internetMessageId,subject,bodyPreview,body,receivedDateTime,sentDateTime,isDraft,hasAttachments,from,toRecipients,ccRecipients,bccRecipients,internetMessageHeaders";

    public string ProviderCode => _options.Microsoft.ProviderCode;
    public string PublicName => "outlook";

    public async Task<IReadOnlyList<ProviderMailbox>> DiscoverMailboxesAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync("v1.0/me?$select=id,displayName,mail,userPrincipalName", accessToken, cancellationToken);
        var root = document.RootElement;
        var address = GetString(root, "mail") ?? GetString(root, "userPrincipalName")
            ?? throw InboxException.Unavailable("Microsoft did not return a mailbox address.");
        return [new ProviderMailbox(GetString(root, "id") ?? address, address, GetString(root, "displayName") ?? address, "personal")];
    }

    public async Task<ProviderMailbox> ValidateSharedMailboxAsync(string accessToken, string address, CancellationToken cancellationToken)
    {
        var normalized = EmailSafety.NormalizeEmail(address)
            ?? throw InboxException.BadRequest("Enter a valid shared Outlook address.");
        // Mail.ReadWrite.Shared can validate delegated mailbox access directly. Avoid /users
        // directory reads here because those require broader directory scopes we do not request.
        using var _ = await GetJsonAsync(
            $"v1.0/users/{Uri.EscapeDataString(normalized)}/mailFolders/inbox?$select=id,displayName",
            accessToken,
            cancellationToken);
        return new ProviderMailbox(normalized, normalized, normalized, "shared");
    }

    public async Task<ProviderSyncResult> SyncAsync(
        string accessToken,
        CommMailbox mailbox,
        int initialMessageLimit,
        CancellationToken cancellationToken)
    {
        var owner = mailbox.CommMailboxTypeCode.Equals("shared", StringComparison.OrdinalIgnoreCase)
            ? $"users/{Uri.EscapeDataString(mailbox.CommMailboxAddress)}"
            : "me";
        var initial = $"v1.0/{owner}/mailFolders/inbox/messages/delta?$select={MessageSelect}&$top={Math.Clamp(initialMessageLimit, 1, 100)}";
        var path = ValidateDeltaLink(mailbox.CommMailboxSyncCursor) ?? initial;
        using var document = await GetJsonAsync(path, accessToken, cancellationToken);
        var messages = new List<ProviderInboundMessage>();
        if (document.RootElement.TryGetProperty("value", out var values))
        {
            foreach (var value in values.EnumerateArray().Where(value => !value.TryGetProperty("@removed", out _)))
            {
                var message = ParseMessage(value);
                if (value.TryGetProperty("hasAttachments", out var hasAttachments) && hasAttachments.GetBoolean())
                {
                    message = message with { Attachments = await ListAttachmentsAsync(owner, message.ProviderMessageId, accessToken, cancellationToken) };
                }
                messages.Add(message);
            }
        }
        var next = GetString(document.RootElement, "@odata.nextLink") ?? GetString(document.RootElement, "@odata.deltaLink");
        return new ProviderSyncResult(messages, next);
    }

    public async Task<ProviderSendResult> SendAsync(
        string accessToken,
        CommMailbox mailbox,
        ProviderOutgoingMessage message,
        CancellationToken cancellationToken)
    {
        var owner = mailbox.CommMailboxTypeCode.Equals("shared", StringComparison.OrdinalIgnoreCase)
            ? $"users/{Uri.EscapeDataString(mailbox.CommMailboxAddress)}"
            : "me";
        if (message.Mode is "reply" or "reply_all" or "forward")
        {
            return await SendResponseAsync(owner, accessToken, message, cancellationToken);
        }
        if (message.Mode != "new") throw InboxException.BadRequest("This Outlook send mode is not supported.");

        var payload = JsonSerializer.Serialize(new
        {
            message = new
            {
                subject = message.Subject,
                body = new
                {
                    contentType = string.IsNullOrWhiteSpace(message.BodyHtml) ? "Text" : "HTML",
                    content = string.IsNullOrWhiteSpace(message.BodyHtml) ? message.BodyText ?? string.Empty : message.BodyHtml,
                },
                toRecipients = ToGraphRecipients(message.To),
                ccRecipients = ToGraphRecipients(message.Cc),
                bccRecipients = ToGraphRecipients(message.Bcc),
            },
            saveToSentItems = true,
        });

        using var request = CreateRequest(HttpMethod.Post, $"v1.0/{owner}/sendMail", accessToken);
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Outlook could not send this message.", cancellationToken);

        // Graph sendMail returns 202 with no body. Correlation is finalized by the next delta sync.
        return new ProviderSendResult($"pending:{Guid.NewGuid():N}", message.ProviderThreadId, message.ProviderThreadId, DateTimeOffset.UtcNow);
    }

    private async Task<ProviderSendResult> SendResponseAsync(
        string owner,
        string accessToken,
        ProviderOutgoingMessage message,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(message.SourceProviderMessageId))
        {
            throw InboxException.Conflict("Outlook no longer has the source message needed for this response.");
        }
        var action = message.Mode switch
        {
            "reply" => "createReply",
            "reply_all" => "createReplyAll",
            "forward" => "createForward",
            _ => throw InboxException.BadRequest("This Outlook response mode is not supported."),
        };
        using var createRequest = CreateRequest(
            HttpMethod.Post,
            $"v1.0/{owner}/messages/{Uri.EscapeDataString(message.SourceProviderMessageId)}/{action}",
            accessToken);
        createRequest.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        using var createResponse = await httpClient.SendAsync(createRequest, cancellationToken);
        await EnsureSuccessAsync(createResponse, "Outlook could not create this response.", cancellationToken);
        using var draftDocument = await JsonDocument.ParseAsync(await createResponse.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var draftId = GetString(draftDocument.RootElement, "id")
            ?? throw InboxException.Unavailable("Outlook did not return the response draft.");

        var updatePayload = JsonSerializer.Serialize(new
        {
            subject = message.Subject,
            body = new
            {
                contentType = string.IsNullOrWhiteSpace(message.BodyHtml) ? "Text" : "HTML",
                content = string.IsNullOrWhiteSpace(message.BodyHtml) ? message.BodyText ?? string.Empty : message.BodyHtml,
            },
            toRecipients = ToGraphRecipients(message.To),
            ccRecipients = ToGraphRecipients(message.Cc),
            bccRecipients = ToGraphRecipients(message.Bcc),
        });
        using var updateRequest = CreateRequest(HttpMethod.Patch, $"v1.0/{owner}/messages/{Uri.EscapeDataString(draftId)}", accessToken);
        updateRequest.Content = new StringContent(updatePayload, Encoding.UTF8, "application/json");
        using var updateResponse = await httpClient.SendAsync(updateRequest, cancellationToken);
        await EnsureSuccessAsync(updateResponse, "Outlook could not prepare this response.", cancellationToken);

        using var sendRequest = CreateRequest(HttpMethod.Post, $"v1.0/{owner}/messages/{Uri.EscapeDataString(draftId)}/send", accessToken);
        sendRequest.Content = new ByteArrayContent([]);
        using var sendResponse = await httpClient.SendAsync(sendRequest, cancellationToken);
        await EnsureSuccessAsync(sendResponse, "Outlook could not send this response.", cancellationToken);
        return new ProviderSendResult($"pending:{Guid.NewGuid():N}", message.ProviderThreadId, message.ProviderThreadId, DateTimeOffset.UtcNow);
    }

    public async Task<ProviderAttachmentContent> DownloadAttachmentAsync(
        string accessToken,
        CommMailbox mailbox,
        string providerMessageId,
        string providerAttachmentId,
        long maxBytes,
        CancellationToken cancellationToken)
    {
        var owner = mailbox.CommMailboxTypeCode.Equals("shared", StringComparison.OrdinalIgnoreCase)
            ? $"users/{Uri.EscapeDataString(mailbox.CommMailboxAddress)}"
            : "me";
        using var request = CreateRequest(
            HttpMethod.Get,
            $"v1.0/{owner}/messages/{Uri.EscapeDataString(providerMessageId)}/attachments/{Uri.EscapeDataString(providerAttachmentId)}/$value",
            accessToken);
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        await EnsureSuccessAsync(response, "Outlook could not load this attachment.", cancellationToken);
        if (response.Content.Headers.ContentLength > maxBytes) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var output = new MemoryStream();
        var buffer = new byte[81_920];
        while (true)
        {
            var read = await input.ReadAsync(buffer, cancellationToken);
            if (read == 0) break;
            if (output.Length + read > maxBytes) throw InboxException.TooLarge("This attachment is too large to download through Multideck.");
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
        return new ProviderAttachmentContent(output.ToArray(), response.Content.Headers.ContentType?.MediaType);
    }

    private async Task<IReadOnlyList<ProviderAttachment>> ListAttachmentsAsync(
        string owner,
        string providerMessageId,
        string accessToken,
        CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync(
            $"v1.0/{owner}/messages/{Uri.EscapeDataString(providerMessageId)}/attachments?$select=id,name,contentType,size,isInline,contentId",
            accessToken,
            cancellationToken);
        if (!document.RootElement.TryGetProperty("value", out var values)) return [];
        return values.EnumerateArray()
            .Where(value => GetString(value, "id") is not null)
            .Select(value => new ProviderAttachment(
                GetString(value, "id")!,
                EmailSafety.SafeFileName(GetString(value, "name")),
                GetString(value, "contentType"),
                value.TryGetProperty("size", out var size) && size.TryGetInt64(out var bytes) ? bytes : null,
                value.TryGetProperty("isInline", out var inline) && inline.ValueKind == JsonValueKind.True,
                GetString(value, "contentId")))
            .ToList();
    }

    private async Task<JsonDocument> GetJsonAsync(string path, string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, path, accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, "Outlook could not load this mailbox.", cancellationToken);
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
        var body = root.TryGetProperty("body", out var bodyElement) ? bodyElement : default;
        var contentType = body.ValueKind == JsonValueKind.Object ? GetString(body, "contentType") : null;
        var content = body.ValueKind == JsonValueKind.Object ? GetString(body, "content") : null;
        var occurredAt = DateTimeOffset.TryParse(GetString(root, "receivedDateTime") ?? GetString(root, "sentDateTime"), out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow;
        var headers = root.TryGetProperty("internetMessageHeaders", out var headerArray)
            ? headerArray.EnumerateArray()
                .Where(header => GetString(header, "name") is not null)
                .GroupBy(header => GetString(header, "name")!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => GetString(group.Last(), "value") ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        return new ProviderInboundMessage(
            GetString(root, "id")!,
            GetString(root, "conversationId") ?? GetString(root, "id")!,
            GetString(root, "conversationId"),
            GetString(root, "internetMessageId"),
            GetString(root, "subject") ?? "(No subject)",
            GetString(root, "bodyPreview") ?? string.Empty,
            string.Equals(contentType, "text", StringComparison.OrdinalIgnoreCase) ? content : null,
            string.Equals(contentType, "html", StringComparison.OrdinalIgnoreCase) ? content : null,
            occurredAt,
            root.TryGetProperty("isDraft", out var isDraft) && isDraft.GetBoolean(),
            ParseGraphAddress(root, "from"),
            ParseGraphAddresses(root, "toRecipients"),
            ParseGraphAddresses(root, "ccRecipients"),
            ParseGraphAddresses(root, "bccRecipients"),
            [],
            headers);
    }

    private static IReadOnlyList<ProviderAddress> ParseGraphAddress(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Object) return [];
        return ParseEmailAddressObject(value) is { } address ? [address] : [];
    }

    private static IReadOnlyList<ProviderAddress> ParseGraphAddresses(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var values) || values.ValueKind != JsonValueKind.Array) return [];
        return values.EnumerateArray().Select(ParseEmailAddressObject).Where(value => value is not null).Cast<ProviderAddress>().ToList();
    }

    private static ProviderAddress? ParseEmailAddressObject(JsonElement value)
    {
        if (!value.TryGetProperty("emailAddress", out var email)) return null;
        var address = EmailSafety.NormalizeEmail(GetString(email, "address"));
        return address is null ? null : new ProviderAddress(address, GetString(email, "name"));
    }

    private static object[] ToGraphRecipients(IEnumerable<ProviderAddress> addresses) => addresses.Select(address => (object)new
    {
        emailAddress = new { address = address.Address, name = address.DisplayName },
    }).ToArray();

    private static string? GetString(JsonElement element, string propertyName) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static string? ValidateDeltaLink(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !uri.Host.Equals("graph.microsoft.com", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        return uri.AbsoluteUri;
    }
}
