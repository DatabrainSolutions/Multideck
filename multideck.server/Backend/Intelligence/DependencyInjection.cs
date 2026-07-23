using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Multideck.Intelligence.Agents;
using Multideck.Intelligence.Configuration;
using Multideck.Intelligence.Providers;

namespace Multideck.Intelligence;

public static class DependencyInjection
{
    public static IServiceCollection AddMultideckIntelligence(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services
            .AddOptions<IntelligenceOptions>()
            .Bind(configuration.GetSection(IntelligenceOptions.SectionName));

        return services.AddMultideckIntelligence(serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<IntelligenceOptions>>().Value;
            return OpenAICompatibleChatClientFactory.Create(options);
        });
    }

    public static IServiceCollection AddMultideckIntelligence(
        this IServiceCollection services,
        Func<IServiceProvider, IChatClient> chatClientFactory)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(chatClientFactory);

        services.AddSingleton(chatClientFactory);
        services.AddSingleton<IIntelligenceAgentFactory, IntelligenceAgentFactory>();

        return services;
    }
}
