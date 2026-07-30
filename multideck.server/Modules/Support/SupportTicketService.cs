using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Multideck.Server.Modules.Users;

namespace Multideck.Server.Modules.Support;

public sealed class SupportTicketService(
    HttpClient httpClient,
    IOptions<SupportTicketOptions> options,
    ILogger<SupportTicketService> logger) : ISupportTicketService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Topics =
    [
        "Workflow question",
        "Booking sync issue",
        "Billing question",
        "Security concern",
        "Product feedback",
    ];

    private readonly SupportTicketOptions _options = options.Value;

    public async Task<CreateSupportTicketResponse> CreateAsync(
        CreateSupportTicketRequest request,
        TeamUserDto requester,
        CancellationToken cancellationToken)
    {
        if (!_options.IsConfigured)
        {
            throw new SupportTicketException(
                "support_service_unavailable",
                "Support ticketing is not configured. Try again later.",
                StatusCodes.Status503ServiceUnavailable);
        }

        var normalized = Normalize(request, requester);
        using var upstreamRequest = new HttpRequestMessage(HttpMethod.Post, _options.Endpoint)
        {
            Content = JsonContent.Create(normalized, options: JsonOptions),
        };
        upstreamRequest.Headers.TryAddWithoutValidation(
            "X-Databrain-Webhook-Secret",
            _options.WebhookSecret.Trim());

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));

        HttpResponseMessage upstreamResponse;
        try
        {
            upstreamResponse = await httpClient.SendAsync(
                upstreamRequest,
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SupportTicketException(
                "support_service_timeout",
                "Support took too long to respond. Your ticket details are still here; try again.",
                StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException)
        {
            throw new SupportTicketException(
                "support_service_unavailable",
                "Support is temporarily unavailable. Your ticket details are still here; try again.",
                StatusCodes.Status503ServiceUnavailable);
        }

        using (upstreamResponse)
        {
            if (!upstreamResponse.IsSuccessStatusCode)
            {
                await ThrowUpstreamError(upstreamResponse, cancellationToken);
            }

            DatabrainTicketResponse? response;
            try
            {
                response = await upstreamResponse.Content.ReadFromJsonAsync<DatabrainTicketResponse>(
                    JsonOptions,
                    cancellationToken);
            }
            catch (JsonException)
            {
                throw InvalidUpstreamResponse();
            }

            if (string.IsNullOrWhiteSpace(response?.Ticket?.TicketNumber))
            {
                throw InvalidUpstreamResponse();
            }

            return new CreateSupportTicketResponse(
                new SupportTicketDto(
                    response.Ticket.TicketNumber.Trim(),
                    string.IsNullOrWhiteSpace(response.Ticket.Status) ? "open" : response.Ticket.Status.Trim(),
                    response.Ticket.CreatedAt,
                    NormalizeStatusUrl(response.Ticket.StatusUrl)),
                response.Duplicate);
        }
    }

    private DatabrainTicketRequest Normalize(CreateSupportTicketRequest request, TeamUserDto requester)
    {
        var idempotencyKey = Clean(request.IdempotencyKey, 120);
        var topic = Clean(request.Topic, 80);
        var title = Clean(request.Title, 180);
        var description = Clean(request.Description, 20_000);
        var priority = Clean(request.Priority, 20).ToLowerInvariant() switch
        {
            "normal" or "medium" => "medium",
            "high" => "high",
            "urgent" => "urgent",
            _ => "",
        };

        if (idempotencyKey.Length < 8
            || idempotencyKey.Any(character =>
                !char.IsLetterOrDigit(character)
                && character is not '-' and not '_' and not ':' and not '.'))
        {
            throw Validation("Start a new ticket and try again.");
        }

        if (!Topics.Contains(topic))
        {
            throw Validation("Choose a valid support topic.");
        }

        if (title.Length < 3)
        {
            throw Validation("Add a short subject so support can route the request.");
        }

        if (description.Length < 20)
        {
            throw Validation("Add at least 20 characters explaining what happened and what you expected.");
        }

        if (string.IsNullOrWhiteSpace(priority))
        {
            throw Validation("Choose a valid ticket priority.");
        }

        if (string.IsNullOrWhiteSpace(requester.Email))
        {
            throw new SupportTicketException(
                "requester_email_missing",
                "Your signed-in account needs an email address before a ticket can be created.",
                StatusCodes.Status400BadRequest);
        }

        var metadata = new Dictionary<string, string>
        {
            ["topic"] = topic,
            ["requestedPriority"] = priority,
        };

        if (!string.IsNullOrWhiteSpace(request.ApplicationUrl))
        {
            if (!Uri.TryCreate(request.ApplicationUrl.Trim(), UriKind.Absolute, out var applicationUri)
                || applicationUri.Scheme is not ("https" or "http")
                || request.ApplicationUrl.Trim().Length > 2_000)
            {
                throw Validation("Refresh the page and try again.");
            }

            metadata["applicationUrl"] = applicationUri.ToString();
        }

        return new DatabrainTicketRequest(
            idempotencyKey,
            _options.SourceApplication.Trim(),
            title,
            description,
            new DatabrainRequester(
                string.IsNullOrWhiteSpace(requester.DisplayName) ? requester.Email : requester.DisplayName.Trim(),
                requester.Email.Trim().ToLowerInvariant()),
            requester.Company?.Name.Trim(),
            "general",
            priority,
            metadata);
    }

    private async Task ThrowUpstreamError(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        string? upstreamCode = null;
        try
        {
            var upstream = await response.Content.ReadFromJsonAsync<DatabrainTicketError>(
                JsonOptions,
                cancellationToken);
            upstreamCode = upstream?.Error;
        }
        catch (JsonException)
        {
            upstreamCode = "invalid_error_response";
        }

        logger.LogWarning(
            "Databrain support ticket request failed with status {StatusCode} and code {UpstreamCode}",
            (int)response.StatusCode,
            upstreamCode ?? "unknown");

        throw response.StatusCode switch
        {
            HttpStatusCode.BadRequest => new SupportTicketException(
                "validation_error",
                "Check the ticket details and try again.",
                StatusCodes.Status400BadRequest),
            HttpStatusCode.Unauthorized => new SupportTicketException(
                "support_service_unavailable",
                "Support is temporarily unavailable. Your ticket details are still here; try again.",
                StatusCodes.Status503ServiceUnavailable),
            HttpStatusCode.Conflict => new SupportTicketException(
                "idempotency_conflict",
                "This ticket changed after it first reached support. Start a new ticket to send the updated details.",
                StatusCodes.Status409Conflict),
            HttpStatusCode.RequestEntityTooLarge => new SupportTicketException(
                "ticket_too_large",
                "Shorten the ticket details and try again.",
                StatusCodes.Status413PayloadTooLarge),
            _ => new SupportTicketException(
                "support_service_unavailable",
                "Support is temporarily unavailable. Your ticket details are still here; try again.",
                StatusCodes.Status503ServiceUnavailable),
        };
    }

    private static string Clean(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";

        var cleaned = value.Trim().Replace("\0", "", StringComparison.Ordinal);
        return cleaned[..Math.Min(cleaned.Length, maxLength)];
    }

    private static string? NormalizeStatusUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var statusUri)
            || statusUri.Scheme != Uri.UriSchemeHttps)
        {
            return null;
        }

        return statusUri.ToString();
    }

    private static SupportTicketException Validation(string message) =>
        new("validation_error", message, StatusCodes.Status400BadRequest);

    private static SupportTicketException InvalidUpstreamResponse() =>
        new(
            "support_service_invalid_response",
            "Support did not confirm a ticket number. Your ticket details are still here; try again.",
            StatusCodes.Status502BadGateway);
}
