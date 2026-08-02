using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox;
using Multideck.Server.Modules.Inbox.Providers;
using Xunit;

namespace Multideck.Server.Tests.Modules.Inbox;

public sealed class EmailProviderClientTests
{
    [Fact]
    public async Task GmailSync_CapturesHistoryCursorBeforeListingInitialSnapshot()
    {
        var handler = new RecordingHandler(request => request.RequestUri!.AbsolutePath.EndsWith("/profile", StringComparison.Ordinal)
            ? Json(HttpStatusCode.OK, "{\"emailAddress\":\"operator@example.com\",\"historyId\":\"snapshot-start\"}")
            : Json(HttpStatusCode.OK, "{\"messages\":[]}"));
        var client = CreateGmail(handler);
        var mailbox = Mailbox("google_workspace", null);

        var result = await client.SyncAsync("token", mailbox, 50, CancellationToken.None);

        Assert.Equal("snapshot-start", result.NextCursor);
        Assert.EndsWith("/profile", handler.Captured[0].Uri.AbsolutePath, StringComparison.Ordinal);
        Assert.EndsWith("/messages", handler.Captured[1].Uri.AbsolutePath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GmailSync_RecoversFromExpiredHistoryCursorWithBoundedFullSync()
    {
        var handler = new RecordingHandler(request => request.RequestUri!.AbsolutePath.EndsWith("/history", StringComparison.Ordinal)
            ? Json(HttpStatusCode.NotFound, "{\"error\":{\"code\":404}}")
            : request.RequestUri.AbsolutePath.EndsWith("/messages", StringComparison.Ordinal)
                ? Json(HttpStatusCode.OK, "{\"messages\":[]}")
                : Json(HttpStatusCode.OK, "{\"emailAddress\":\"operator@example.com\",\"historyId\":\"new-history\"}"));
        var client = CreateGmail(handler);
        var mailbox = Mailbox("google_workspace", "old-history");

        var result = await client.SyncAsync("token", mailbox, 50, CancellationToken.None);

        Assert.Equal("new-history", result.NextCursor);
        Assert.Contains(handler.Requests, request => request.Contains("/history?", StringComparison.Ordinal));
        Assert.Contains(handler.Requests, request => request.Contains("/messages?", StringComparison.Ordinal));
    }

    [Fact]
    public async Task GmailSync_PersistsPageTokenAtCapAndResumesWithoutSkipping()
    {
        var historyRequests = 0;
        var handler = new RecordingHandler(request =>
        {
            if (!request.RequestUri!.AbsolutePath.EndsWith("/history", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, "{\"emailAddress\":\"operator@example.com\",\"historyId\":\"profile\"}");
            historyRequests++;
            return historyRequests <= 20
                ? Json(HttpStatusCode.OK, $"{{\"history\":[],\"historyId\":\"latest\",\"nextPageToken\":\"page-{historyRequests}\"}}")
                : Json(HttpStatusCode.OK, "{\"history\":[],\"historyId\":\"final\"}");
        });
        var client = CreateGmail(handler);
        var mailbox = Mailbox("google_workspace", "start");

        var capped = await client.SyncAsync("token", mailbox, 50, CancellationToken.None);
        Assert.NotNull(capped.NextCursor);
        Assert.Contains("page-20", capped.NextCursor, StringComparison.Ordinal);

        mailbox.CommMailboxSyncCursor = capped.NextCursor;
        var resumed = await client.SyncAsync("token", mailbox, 50, CancellationToken.None);

        Assert.Equal("final", resumed.NextCursor);
        Assert.Contains("pageToken=page-20", handler.Requests[20], StringComparison.Ordinal);
        Assert.Equal(21, historyRequests);
    }

    [Fact]
    public async Task GmailSend_StripsUntrustedHeaderLineBreaks()
    {
        var handler = new RecordingHandler(_ => Json(HttpStatusCode.OK, "{\"id\":\"sent-1\",\"threadId\":\"thread-1\"}"));
        var client = CreateGmail(handler);
        var outgoing = new ProviderOutgoingMessage(
            "reply",
            "source-1",
            "Re: Shipment",
            "Confirmed",
            null,
            [new ProviderAddress("to@example.com", "Alice\r\nBcc: attacker@example.com")],
            [],
            [],
            "thread-1",
            "<message@example.com>\r\nX-Injected: yes",
            "<message@example.com>\r\nBcc: attacker@example.com");

        _ = await client.SendAsync("token", Mailbox("google_workspace", null), outgoing, CancellationToken.None);

        using var payload = JsonDocument.Parse(handler.Captured[0].Body);
        var encoded = payload.RootElement.GetProperty("raw").GetString()!;
        var normalized = encoded.Replace('-', '+').Replace('_', '/');
        normalized += new string('=', (4 - normalized.Length % 4) % 4);
        var raw = Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
        Assert.DoesNotContain("\r\nBcc: attacker@example.com", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\nBcc: attacker@example.com", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\r\nX-Injected: yes", raw, StringComparison.Ordinal);
        Assert.DoesNotContain("\nX-Injected: yes", raw, StringComparison.Ordinal);
        Assert.Contains("to@example.com", raw, StringComparison.Ordinal);
    }

    [Fact]
    public async Task OutlookReplyAll_UsesProviderDraftThenPatchesExactRecipientsAndSends()
    {
        var handler = new RecordingHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/createReplyAll", StringComparison.Ordinal))
                return Json(HttpStatusCode.Created, "{\"id\":\"draft-123\"}");
            return new HttpResponseMessage(request.Method == HttpMethod.Post ? HttpStatusCode.Accepted : HttpStatusCode.OK);
        });
        var options = Options.Create(new InboxOptions());
        var client = new MicrosoftGraphEmailProviderClient(new HttpClient(handler) { BaseAddress = new Uri("https://graph.microsoft.com/") }, options);
        var mailbox = Mailbox("microsoft_365", null);
        var outgoing = new ProviderOutgoingMessage(
            "reply_all",
            "source-456",
            "Re: Shipment",
            "Confirmed",
            null,
            [new ProviderAddress("to@example.com", "To")],
            [new ProviderAddress("cc@example.com", null)],
            [new ProviderAddress("bcc@example.com", null)],
            "conversation",
            "<internet-id>",
            null);

        _ = await client.SendAsync("token", mailbox, outgoing, CancellationToken.None);

        Assert.Equal(HttpMethod.Post, handler.Captured[0].Method);
        Assert.EndsWith("/messages/source-456/createReplyAll", handler.Captured[0].Uri.AbsolutePath, StringComparison.Ordinal);
        Assert.Equal(HttpMethod.Patch, handler.Captured[1].Method);
        Assert.EndsWith("/messages/draft-123", handler.Captured[1].Uri.AbsolutePath, StringComparison.Ordinal);
        Assert.Contains("to@example.com", handler.Captured[1].Body, StringComparison.Ordinal);
        Assert.Contains("cc@example.com", handler.Captured[1].Body, StringComparison.Ordinal);
        Assert.Contains("bcc@example.com", handler.Captured[1].Body, StringComparison.Ordinal);
        Assert.DoesNotContain("In-Reply-To", handler.Captured[1].Body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpMethod.Post, handler.Captured[2].Method);
        Assert.EndsWith("/messages/draft-123/send", handler.Captured[2].Uri.AbsolutePath, StringComparison.Ordinal);
    }

    [Fact]
    public async Task OutlookSharedMailboxValidation_UsesDelegatedMailboxScopeWithoutDirectoryRead()
    {
        var handler = new RecordingHandler(_ => Json(HttpStatusCode.OK, "{\"id\":\"inbox\",\"displayName\":\"Inbox\"}"));
        var options = Options.Create(new InboxOptions());
        var client = new MicrosoftGraphEmailProviderClient(new HttpClient(handler) { BaseAddress = new Uri("https://graph.microsoft.com/") }, options);

        var mailbox = await client.ValidateSharedMailboxAsync("token", "shared@example.com", CancellationToken.None);

        Assert.Single(handler.Captured);
        Assert.Equal("shared@example.com", mailbox.ProviderMailboxId);
        Assert.Equal("shared@example.com", mailbox.Address);
        Assert.EndsWith("/users/shared%40example.com/mailFolders/inbox", handler.Captured[0].Uri.AbsolutePath, StringComparison.Ordinal);
        Assert.DoesNotContain("$select=id,displayName,mail,userPrincipalName", handler.Captured[0].Uri.Query, StringComparison.Ordinal);
    }

    private static GmailEmailProviderClient CreateGmail(HttpMessageHandler handler) => new(
        new HttpClient(handler) { BaseAddress = new Uri("https://www.googleapis.com/") },
        Options.Create(new InboxOptions()));

    private static CommMailbox Mailbox(string providerCode, string? cursor) => new()
    {
        CommMailboxId = Guid.NewGuid(),
        CommMailboxTypeCode = "personal",
        CommMailboxChannelCode = "email",
        CommMailboxDisplayName = "Operator",
        CommMailboxAddress = "operator@example.com",
        CommMailboxNormalizedAddress = "operator@example.com",
        CommMailboxProviderMailboxId = "me",
        CommMailboxDefaultSensitivityCode = "internal",
        CommMailboxSettingsJson = "{}",
        CommMailboxSyncCursor = cursor,
        CommMailboxConnection = new CommProviderConnection { CommConnProviderTypeCode = providerCode },
    };

    private static HttpResponseMessage Json(HttpStatusCode status, string body) => new(status)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
    };

    private sealed class RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> response) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];
        public List<CapturedRequest> Captured { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add(request.RequestUri!.AbsoluteUri);
            Captured.Add(new CapturedRequest(request.Method, request.RequestUri, body));
            return response(request);
        }
    }

    private sealed record CapturedRequest(HttpMethod Method, Uri Uri, string Body);
}
