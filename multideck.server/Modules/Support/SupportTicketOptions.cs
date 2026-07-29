namespace Multideck.Server.Modules.Support;

public sealed class SupportTicketOptions
{
    public const string SectionName = "SupportTickets";
    public const string DefaultEndpoint = "https://os.databrain.solutions/api/tickets";

    public string Endpoint { get; set; } = DefaultEndpoint;
    public string WebhookSecret { get; set; } = "";
    public string SourceApplication { get; set; } = "multideck";
    public int TimeoutSeconds { get; set; } = 10;

    public bool IsConfigured =>
        Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint)
        && endpoint.Scheme == Uri.UriSchemeHttps
        && WebhookSecret.Trim().Length >= 16
        && SourceApplication.Trim().Length is >= 2 and <= 48
        && TimeoutSeconds is >= 1 and <= 30;
}
