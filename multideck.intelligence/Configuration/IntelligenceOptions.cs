namespace Multideck.Intelligence.Configuration;

public sealed class IntelligenceOptions
{
    public const string SectionName = "Intelligence";

    public string Endpoint { get; set; } = string.Empty;

    public string Model { get; set; } = string.Empty;

    public string ApiKey { get; set; } = string.Empty;
}
