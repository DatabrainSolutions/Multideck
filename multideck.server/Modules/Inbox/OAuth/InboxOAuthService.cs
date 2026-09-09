using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Inbox.Providers;
using Multideck.Server.Modules.Inbox.Security;

namespace Multideck.Server.Modules.Inbox.OAuth;

public interface IInboxOAuthService
{
    Task<StartInboxOAuthResponse> StartAsync(ClaimsPrincipal principal, string provider, string authorizationHeader, CancellationToken cancellationToken);
    Task<string?> GetAccessTokenAsync(CommProviderConnection connection, CancellationToken cancellationToken);
}

/// <summary>
/// The .NET API intentionally does not implement an OAuth callback. The canonical Supabase Edge
/// flow owns persisted one-time state, PKCE, code exchange, and the initial Vault write. This
/// service proxies that start flow and refreshes an already-connected credential.
/// </summary>
public sealed class InboxOAuthService(
    IInboxActorContext actorContext,
    IInboxAccessPolicy accessPolicy,
    IEmailProviderCatalog providerCatalog,
    IInboxCredentialVault vault,
    HttpClient httpClient,
    IOptions<InboxOptions> options) : IInboxOAuthService
{
    private readonly InboxOptions _options = options.Value;

    public async Task<StartInboxOAuthResponse> StartAsync(
        ClaimsPrincipal principal,
        string provider,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await accessPolicy.RequirePermissionAsync(principal, "Email.Connect", cancellationToken);
        _ = await actorContext.RequireAsync(principal, cancellationToken);
        var adapter = providerCatalog.GetByPublicName(provider);
        var providerEnabled = adapter.PublicName switch
        {
            "gmail" => _options.Google.Enabled,
            "outlook" => _options.Microsoft.Enabled,
            _ => false,
        };
        if (!_options.OAuth.IsConfigured || !providerEnabled)
        {
            throw InboxException.Unavailable("Mailbox connection is not configured for this tenant yet.");
        }

        if (!AuthenticationHeaderValue.TryParse(authorizationHeader, out var bearer) ||
            !string.Equals(bearer.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(bearer.Parameter))
        {
            throw InboxException.Forbidden("Sign in again before connecting a mailbox.");
        }

        // Endpoint, return origin, and path are tenant configuration. Request Host and caller
        // payload never influence redirects. Edge owns one-time state, PKCE, and callback exchange.
        var payload = JsonSerializer.Serialize(new
        {
            action = "authorize",
            provider = adapter.PublicName,
            returnOrigin = _options.OAuth.ReturnOrigin,
            returnPath = _options.OAuth.ReturnPath,
        });
        using var request = new HttpRequestMessage(HttpMethod.Post, _options.OAuth.CanonicalStartEndpoint);
        request.Headers.Authorization = bearer;
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw InboxException.Unavailable($"Mailbox authorization could not start. The tenant connection service returned status {(int)response.StatusCode}.");
        }

        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = document.RootElement;
        var returnedProvider = root.TryGetProperty("provider", out var providerValue) ? providerValue.GetString() : null;
        var authorizationUrlValue = root.TryGetProperty("authorizationUrl", out var urlValue) ? urlValue.GetString() : null;
        var expiresAtValue = root.TryGetProperty("expiresAt", out var expiresValue) ? expiresValue.GetString() : null;
        if (!string.Equals(returnedProvider, adapter.PublicName, StringComparison.Ordinal) ||
            !TryValidateAuthorizationUrl(adapter.PublicName, authorizationUrlValue, out var authorizationUrl) ||
            !DateTimeOffset.TryParse(expiresAtValue, out var expiresAt) ||
            expiresAt <= DateTimeOffset.UtcNow)
        {
            throw InboxException.Unavailable("The tenant connection service returned an invalid authorization response.");
        }
        return new StartInboxOAuthResponse(authorizationUrl, adapter.PublicName, expiresAt);
    }

    public async Task<string?> GetAccessTokenAsync(CommProviderConnection connection, CancellationToken cancellationToken)
    {
        var credential = await vault.GetAsync(connection.CommConnSecretRef, cancellationToken);
        if (credential is null) return null;
        if (credential.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(2)) return credential.AccessToken;
        if (string.IsNullOrWhiteSpace(credential.RefreshToken)) return null;

        var adapter = providerCatalog.GetByCode(connection.CommConnProviderTypeCode);
        var refreshed = await RefreshCredentialAsync(adapter.PublicName, credential, cancellationToken);
        await vault.UpdateAsync(connection.CommConnSecretRef!, refreshed, cancellationToken);
        return refreshed.AccessToken;
    }

    private async Task<InboxProviderCredential> RefreshCredentialAsync(
        string provider,
        InboxProviderCredential current,
        CancellationToken cancellationToken)
    {
        var tokenRequest = provider switch
        {
            "gmail" when HasGoogleRefreshConfiguration() => new TokenRequest(
                _options.Google.TokenEndpoint,
                new Dictionary<string, string>
                {
                    ["client_id"] = _options.Google.ClientId!,
                    ["client_secret"] = _options.Google.ClientSecret!,
                    ["refresh_token"] = current.RefreshToken!,
                    ["grant_type"] = "refresh_token",
                }),
            "outlook" when HasMicrosoftRefreshConfiguration() => new TokenRequest(
                $"https://login.microsoftonline.com/{Uri.EscapeDataString(_options.Microsoft.Tenant)}/oauth2/v2.0/token",
                new Dictionary<string, string>
                {
                    ["client_id"] = _options.Microsoft.ClientId!,
                    ["client_secret"] = _options.Microsoft.ClientSecret!,
                    ["refresh_token"] = current.RefreshToken!,
                    ["grant_type"] = "refresh_token",
                    ["scope"] = string.Join(' ', _options.Microsoft.Scopes),
                }),
            _ => throw InboxException.Unavailable($"{provider} token refresh is not configured for this tenant."),
        };

        using var response = await httpClient.PostAsync(tokenRequest.Endpoint, new FormUrlEncodedContent(tokenRequest.Values), cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw InboxException.Unavailable($"The email provider rejected token refresh with status {(int)response.StatusCode}.");
        }

        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var root = document.RootElement;
        var accessToken = root.GetProperty("access_token").GetString()
            ?? throw InboxException.Unavailable("The email provider did not return a refreshed access token.");
        var refreshToken = root.TryGetProperty("refresh_token", out var refresh) ? refresh.GetString() : current.RefreshToken;
        var expiresIn = root.TryGetProperty("expires_in", out var expires) ? expires.GetInt32() : 3600;
        var scope = root.TryGetProperty("scope", out var returnedScope) ? returnedScope.GetString() : current.Scope;
        var tokenType = root.TryGetProperty("token_type", out var returnedTokenType) ? returnedTokenType.GetString() ?? current.TokenType : current.TokenType;
        return new InboxProviderCredential(accessToken, refreshToken, DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, expiresIn)), scope, tokenType);
    }

    private bool HasGoogleRefreshConfiguration() =>
        !string.IsNullOrWhiteSpace(_options.Google.ClientId) &&
        !string.IsNullOrWhiteSpace(_options.Google.ClientSecret);

    private bool HasMicrosoftRefreshConfiguration() =>
        !string.IsNullOrWhiteSpace(_options.Microsoft.ClientId) &&
        !string.IsNullOrWhiteSpace(_options.Microsoft.ClientSecret);

    private static bool TryValidateAuthorizationUrl(string provider, string? value, out Uri authorizationUrl)
    {
        authorizationUrl = null!;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var candidate) || candidate.Scheme != Uri.UriSchemeHttps) return false;
        var validHost = provider switch
        {
            "gmail" => candidate.Host.Equals("accounts.google.com", StringComparison.OrdinalIgnoreCase),
            "outlook" => candidate.Host.Equals("login.microsoftonline.com", StringComparison.OrdinalIgnoreCase),
            _ => false,
        };
        if (!validHost) return false;
        authorizationUrl = candidate;
        return true;
    }

    private sealed record TokenRequest(string Endpoint, IReadOnlyDictionary<string, string> Values);
}
