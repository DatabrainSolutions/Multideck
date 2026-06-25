using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Multideck.Server.Configuration;

namespace Multideck.Server.Modules.Users.Supabase;

public sealed class SupabaseAdminClient(IHttpClientFactory httpClientFactory) : ISupabaseAdminClient
{
    public async Task<SupabaseInviteResult> InviteUserAsync(
        CreateUserRequest request,
        string normalizedEmail,
        SupabaseAuthOptions supabaseAuth,
        CancellationToken cancellationToken)
    {
        var inviteUrl = $"{supabaseAuth.Url.TrimEnd('/')}/auth/v1/invite";
        if (!string.IsNullOrWhiteSpace(supabaseAuth.InviteRedirectUrl))
        {
            inviteUrl = $"{inviteUrl}?redirect_to={Uri.EscapeDataString(supabaseAuth.InviteRedirectUrl)}";
        }

        var fullName = string.Join(' ', new[] { request.FirstName, request.LastName }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        var body = new
        {
            email = normalizedEmail,
            data = new
            {
                first_name = NormalizeText(request.FirstName),
                last_name = NormalizeText(request.LastName),
                full_name = string.IsNullOrWhiteSpace(fullName) ? null : fullName,
                role_title = NormalizeText(request.RoleTitle),
            },
        };

        var httpClient = httpClientFactory.CreateClient();
        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, inviteUrl);
        httpRequest.Headers.Add("apikey", supabaseAuth.ServiceRoleKey);
        httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", supabaseAuth.ServiceRoleKey);
        httpRequest.Content = JsonContent.Create(body);

        using var response = await httpClient.SendAsync(httpRequest, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new SupabaseAdminException(ReadSupabaseError(responseBody), (int)response.StatusCode);
        }

        if (!TryReadSupabaseUser(responseBody, out var authUserId, out var invited))
        {
            throw new SupabaseAdminException("Supabase created a user, but the response did not include a readable user id.", StatusCodes.Status502BadGateway);
        }

        return new SupabaseInviteResult(authUserId, invited);
    }

    private static string? NormalizeText(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static bool TryReadSupabaseUser(string responseBody, out Guid authUserId, out bool invited)
    {
        authUserId = Guid.Empty;
        invited = true;

        using var document = JsonDocument.Parse(responseBody);
        var root = document.RootElement;

        if (TryReadSupabaseUserElement(root, out authUserId, out invited))
        {
            return true;
        }

        if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("user", out var userElement))
        {
            return TryReadSupabaseUserElement(userElement, out authUserId, out invited);
        }

        return false;
    }

    private static bool TryReadSupabaseUserElement(JsonElement element, out Guid authUserId, out bool invited)
    {
        authUserId = Guid.Empty;
        invited = true;

        if (element.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        if (!element.TryGetProperty("id", out var idElement) || idElement.ValueKind != JsonValueKind.String || !Guid.TryParse(idElement.GetString(), out authUserId))
        {
            return false;
        }

        invited = element.TryGetProperty("invited_at", out var invitedElement) && invitedElement.ValueKind != JsonValueKind.Null;
        return true;
    }

    private static string ReadSupabaseError(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return "Supabase did not return an error message.";
        }

        try
        {
            using var document = JsonDocument.Parse(responseBody);
            var root = document.RootElement;

            foreach (var propertyName in new[] { "msg", "message", "error_description", "error" })
            {
                if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String)
                {
                    var value = property.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        return value;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Fall back to the raw text below.
        }

        return responseBody;
    }
}
