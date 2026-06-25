namespace Multideck.Server.Configuration;

public sealed record SupabaseAuthOptions(
    string Url,
    string JwtIssuer,
    string Audience,
    string JwtSecret,
    string ServiceRoleKey,
    string InviteRedirectUrl)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Url);
    public string Issuer => !string.IsNullOrWhiteSpace(JwtIssuer) ? JwtIssuer.TrimEnd('/') : $"{Url.TrimEnd('/')}/auth/v1";
    public bool UsesJwtSecret => !string.IsNullOrWhiteSpace(JwtSecret);
    public bool UsesRemoteSigningKeys => IsConfigured && !UsesJwtSecret;
    public bool HasServiceRoleKey => !string.IsNullOrWhiteSpace(ServiceRoleKey);
    public string ValidationMode => !IsConfigured ? "not-configured" : UsesJwtSecret ? "jwt-secret" : "jwks";

    public static SupabaseAuthOptions FromConfiguration(IConfiguration configuration)
    {
        var url = (configuration["Supabase:Url"] ?? string.Empty).Trim().TrimEnd('/');
        var jwtIssuer = (configuration["Supabase:JwtIssuer"] ?? string.Empty).Trim().TrimEnd('/');
        var audience = (configuration["Supabase:JwtAudience"] ?? "authenticated").Trim();
        var jwtSecret = (configuration["Supabase:JwtSecret"] ?? string.Empty).Trim();
        var serviceRoleKey = (configuration["Supabase:ServiceRoleKey"] ?? string.Empty).Trim();
        var inviteRedirectUrl = (configuration["Supabase:InviteRedirectUrl"] ?? string.Empty).Trim();

        return new SupabaseAuthOptions(url, jwtIssuer, audience, jwtSecret, serviceRoleKey, inviteRedirectUrl);
    }
}
