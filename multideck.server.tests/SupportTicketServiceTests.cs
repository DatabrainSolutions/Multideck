using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Multideck.Server.Modules.Support;
using Multideck.Server.Modules.Users;
using Xunit;

namespace Multideck.Server.Tests;

public sealed class SupportTicketServiceTests
{
    [Fact]
    public async Task MapsTheAuthenticatedRequesterAndKeepsTheSecretOutOfThePayload()
    {
        HttpRequestMessage? captured = null;
        var handler = new StubHandler(async request =>
        {
            captured = await CloneRequest(request);
            return Json(HttpStatusCode.Created, """
                {
                  "ticket": {
                    "ticketNumber": "TK-2048",
                    "status": "open",
                    "createdAt": "2026-07-30T10:00:00Z",
                    "statusUrl": "https://os.databrain.solutions/ticket-status/example"
                  },
                  "duplicate": false
                }
                """);
        });
        var service = CreateService(handler);

        var response = await service.CreateAsync(
            Request("support-form-stable-key"),
            Requester(),
            CancellationToken.None);

        Assert.Equal("TK-2048", response.Ticket.TicketNumber);
        Assert.False(response.Duplicate);
        Assert.NotNull(captured);
        Assert.Equal(
            "server-only-test-secret",
            captured.Headers.GetValues("X-Databrain-Webhook-Secret").Single());
        Assert.Null(captured.Headers.Authorization);
        Assert.False(captured.Headers.Contains("Cookie"));

        var payloadText = await captured.Content!.ReadAsStringAsync(CancellationToken.None);
        using var payload = JsonDocument.Parse(payloadText);
        Assert.Equal("support-form-stable-key", payload.RootElement.GetProperty("idempotencyKey").GetString());
        Assert.Equal("multideck", payload.RootElement.GetProperty("sourceApplication").GetString());
        Assert.Equal("Alex Operator", payload.RootElement.GetProperty("requester").GetProperty("name").GetString());
        Assert.Equal("alex@example.com", payload.RootElement.GetProperty("requester").GetProperty("email").GetString());
        Assert.Equal("Example Logistics", payload.RootElement.GetProperty("clientName").GetString());
        Assert.Equal("urgent", payload.RootElement.GetProperty("priority").GetString());
        Assert.Equal("general", payload.RootElement.GetProperty("categorySlug").GetString());
        Assert.DoesNotContain("server-only-test-secret", payloadText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReturnsTheOriginalTicketForADuplicateReplay()
    {
        var handler = new StubHandler(_ => Task.FromResult(Json(HttpStatusCode.OK, """
            {
              "ticket": {
                "ticketNumber": "TK-2048",
                "status": "open",
                "createdAt": "2026-07-30T10:00:00Z",
                "statusUrl": null
              },
              "duplicate": true
            }
            """)));
        var service = CreateService(handler);

        var response = await service.CreateAsync(
            Request("support-form-stable-key"),
            Requester(),
            CancellationToken.None);

        Assert.True(response.Duplicate);
        Assert.Equal("TK-2048", response.Ticket.TicketNumber);
    }

    [Fact]
    public async Task MapsChangedContentWithTheSameKeyToARecoverableConflict()
    {
        var handler = new StubHandler(_ => Task.FromResult(Json(
            HttpStatusCode.Conflict,
            """{"error":"idempotency_key_reused_with_different_payload"}""")));
        var service = CreateService(handler);

        var error = await Assert.ThrowsAsync<SupportTicketException>(() => service.CreateAsync(
            Request("support-form-stable-key"),
            Requester(),
            CancellationToken.None));

        Assert.Equal("idempotency_conflict", error.Code);
        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
    }

    [Fact]
    public async Task TimesOutWithoutInventingASuccess()
    {
        var handler = new StubHandler(async request =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, request.GetCancellationToken());
            throw new InvalidOperationException("The request should have been cancelled.");
        });
        var service = CreateService(handler, timeoutSeconds: 1);

        var error = await Assert.ThrowsAsync<SupportTicketException>(() => service.CreateAsync(
            Request("support-form-timeout-key"),
            Requester(),
            CancellationToken.None));

        Assert.Equal("support_service_timeout", error.Code);
        Assert.Equal(StatusCodes.Status504GatewayTimeout, error.StatusCode);
    }

    [Fact]
    public async Task RejectsAResponseWithoutAConfirmedTicketNumber()
    {
        var handler = new StubHandler(_ => Task.FromResult(Json(
            HttpStatusCode.Created,
            """{"ticket":{"status":"open","createdAt":"2026-07-30T10:00:00Z"},"duplicate":false}""")));
        var service = CreateService(handler);

        var error = await Assert.ThrowsAsync<SupportTicketException>(() => service.CreateAsync(
            Request("support-form-invalid-response"),
            Requester(),
            CancellationToken.None));

        Assert.Equal("support_service_invalid_response", error.Code);
        Assert.Equal(StatusCodes.Status502BadGateway, error.StatusCode);
    }

    private static SupportTicketService CreateService(HttpMessageHandler handler, int timeoutSeconds = 10)
    {
        var options = Options.Create(new SupportTicketOptions
        {
            Endpoint = "https://os.databrain.solutions/api/tickets",
            WebhookSecret = "server-only-test-secret",
            SourceApplication = "multideck",
            TimeoutSeconds = timeoutSeconds,
        });

        return new SupportTicketService(
            new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan },
            options,
            NullLogger<SupportTicketService>.Instance);
    }

    private static CreateSupportTicketRequest Request(string idempotencyKey) =>
        new(
            idempotencyKey,
            "Security concern",
            "Urgent",
            "Cannot complete the booking",
            "The Continue button stays disabled after adding cargo.",
            "https://app.example.com/bookings/123");

    private static TeamUserDto Requester() =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "Alex Operator",
            "Alex",
            "Operator",
            "alex@example.com",
            new TeamCompanyDto(Guid.NewGuid(), "Example Logistics"),
            [],
            [],
            "Active",
            null,
            null,
            null);

    private static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };

    private static async Task<HttpRequestMessage> CloneRequest(HttpRequestMessage request)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri);
        foreach (var header in request.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (request.Content is not null)
        {
            clone.Content = new StringContent(
                await request.Content.ReadAsStringAsync(),
                Encoding.UTF8,
                request.Content.Headers.ContentType?.MediaType ?? "application/json");
        }

        return clone;
    }

    private sealed class StubHandler(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            request.SetCancellationToken(cancellationToken);
            return send(request);
        }
    }
}

internal static class HttpRequestMessageCancellation
{
    private static readonly HttpRequestOptionsKey<CancellationToken> Key = new("test-cancellation-token");

    public static void SetCancellationToken(this HttpRequestMessage request, CancellationToken cancellationToken) =>
        request.Options.Set(Key, cancellationToken);

    public static CancellationToken GetCancellationToken(this HttpRequestMessage request) =>
        request.Options.TryGetValue(Key, out var cancellationToken)
            ? cancellationToken
            : CancellationToken.None;
}
