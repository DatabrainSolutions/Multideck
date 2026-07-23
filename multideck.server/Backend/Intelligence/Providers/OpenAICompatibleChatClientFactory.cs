using Microsoft.Extensions.AI;
using Multideck.Intelligence.Configuration;
using OpenAI;
using System.ClientModel;

namespace Multideck.Intelligence.Providers;

internal static class OpenAICompatibleChatClientFactory
{
    public static IChatClient Create(IntelligenceOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            throw new InvalidOperationException(
                $"{IntelligenceOptions.SectionName}:ApiKey is not configured. " +
                "Set it with user secrets or the Intelligence__ApiKey environment variable.");
        }

        if (string.IsNullOrWhiteSpace(options.Model))
        {
            throw new InvalidOperationException($"{IntelligenceOptions.SectionName}:Model is not configured.");
        }

        if (!Uri.TryCreate(options.Endpoint, UriKind.Absolute, out var endpoint) ||
            (endpoint.Scheme != Uri.UriSchemeHttps && endpoint.Scheme != Uri.UriSchemeHttp))
        {
            throw new InvalidOperationException(
                $"{IntelligenceOptions.SectionName}:Endpoint must be an absolute HTTP or HTTPS URL.");
        }

        var client = new OpenAIClient(
            new ApiKeyCredential(options.ApiKey),
            new OpenAIClientOptions { Endpoint = endpoint });

        return client.GetChatClient(options.Model).AsIChatClient();
    }
}
