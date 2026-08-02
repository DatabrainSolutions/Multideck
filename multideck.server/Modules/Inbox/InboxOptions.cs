namespace Multideck.Server.Modules.Inbox;

public sealed class InboxOptions
{
    public const string SectionName = "Inbox";

    public bool EnableWorkers { get; set; }
    public int SyncIntervalSeconds { get; set; } = 60;
    public int SendIntervalSeconds { get; set; } = 5;
    public int SubscriptionIntervalSeconds { get; set; } = 300;
    public int OAuthStatePurgeIntervalHours { get; set; } = 24;
    public int InitialSyncMessageLimit { get; set; } = 50;
    public long AttachmentMaxBytes { get; set; } = 25 * 1024 * 1024;
    public string SuccessRedirectPath { get; set; } = "/settings/connections?inbox=connected";
    public string FailureRedirectPath { get; set; } = "/settings/connections?inbox=failed";
    public InboxOAuthOptions OAuth { get; set; } = new();
    public GoogleInboxOptions Google { get; set; } = new();
    public MicrosoftInboxOptions Microsoft { get; set; } = new();
    public LunaInboxOptions Luna { get; set; } = new();
}

public sealed class GoogleInboxOptions
{
    public bool Enabled { get; set; }
    public string ProviderCode { get; set; } = "google_workspace";
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? CallbackUri { get; set; }
    public string? PubSubTopicName { get; set; }
    public string? PubSubSubscriptionName { get; set; }
    public int WatchRenewalHours { get; set; } = 24;
    public string AuthorizationEndpoint { get; set; } = "https://accounts.google.com/o/oauth2/v2/auth";
    public string TokenEndpoint { get; set; } = "https://oauth2.googleapis.com/token";
    public string[] Scopes { get; set; } =
    [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
    ];

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ClientSecret) &&
        Uri.TryCreate(CallbackUri, UriKind.Absolute, out var callback) &&
        callback.Scheme == Uri.UriSchemeHttps;

    public bool IsPushConfigured =>
        !string.IsNullOrWhiteSpace(PubSubTopicName) &&
        PubSubTopicName.StartsWith("projects/", StringComparison.Ordinal) &&
        PubSubTopicName.Contains("/topics/", StringComparison.Ordinal) &&
        !string.IsNullOrWhiteSpace(PubSubSubscriptionName) &&
        PubSubSubscriptionName.StartsWith("projects/", StringComparison.Ordinal) &&
        PubSubSubscriptionName.Contains("/subscriptions/", StringComparison.Ordinal);
}

public sealed class InboxOAuthOptions
{
    /// <summary>
    /// Canonical Supabase Edge Function start endpoint. It owns one-time state persistence, PKCE,
    /// callback validation, and token storage. The .NET API never maps a competing callback.
    /// </summary>
    public string? CanonicalStartEndpoint { get; set; }
    public string? ReturnOrigin { get; set; }
    public string ReturnPath { get; set; } = "/inbox";

    public bool IsConfigured =>
        Uri.TryCreate(CanonicalStartEndpoint, UriKind.Absolute, out var endpoint) &&
        endpoint.Scheme == Uri.UriSchemeHttps &&
        Uri.TryCreate(ReturnOrigin, UriKind.Absolute, out var origin) &&
        (origin.Scheme == Uri.UriSchemeHttps || IsLoopbackDevelopmentOrigin(origin)) &&
        origin.AbsolutePath == "/" &&
        string.IsNullOrEmpty(origin.Query) &&
        string.IsNullOrEmpty(origin.Fragment) &&
        ReturnPath.StartsWith('/') &&
        !ReturnPath.StartsWith("//", StringComparison.Ordinal);

    private static bool IsLoopbackDevelopmentOrigin(Uri origin) =>
        origin.Scheme == Uri.UriSchemeHttp && origin.IsLoopback;
}

public sealed class MicrosoftInboxOptions
{
    public bool Enabled { get; set; }
    public string ProviderCode { get; set; } = "microsoft_365";
    public string Tenant { get; set; } = "common";
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? CallbackUri { get; set; }
    public string? WebhookNotificationUrl { get; set; }
    public int SubscriptionLifetimeHours { get; set; } = 48;
    public int RenewBeforeHours { get; set; } = 12;
    public string[] Scopes { get; set; } =
    [
        "openid",
        "profile",
        "email",
        "offline_access",
        "User.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Mail.ReadWrite.Shared",
        "Mail.Send.Shared",
    ];

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ClientSecret) &&
        Uri.TryCreate(CallbackUri, UriKind.Absolute, out var callback) &&
        callback.Scheme == Uri.UriSchemeHttps;

    public bool IsPushConfigured =>
        Uri.TryCreate(WebhookNotificationUrl, UriKind.Absolute, out var webhook) &&
        webhook.Scheme == Uri.UriSchemeHttps &&
        webhook.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Any(value => string.Equals(value, "provider=outlook", StringComparison.Ordinal));
}

public sealed class LunaInboxOptions
{
    public string Model { get; set; } = "gpt-5.6-luna";
    public string Endpoint { get; set; } = "https://api.openai.com/v1/responses";
    public string? ApiKey { get; set; }
    public int MaxInputCharacters { get; set; } = 45_000;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(ApiKey) &&
        Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint) &&
        endpoint.Scheme == Uri.UriSchemeHttps;
}
