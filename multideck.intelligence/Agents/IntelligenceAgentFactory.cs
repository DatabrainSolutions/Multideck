using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;

namespace Multideck.Intelligence.Agents;

internal sealed class IntelligenceAgentFactory(
    IChatClient chatClient,
    IServiceProvider services) : IIntelligenceAgentFactory
{
    public AIAgent CreateAgent(IntelligenceAgentDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(definition);

        if (string.IsNullOrWhiteSpace(definition.Name))
        {
            throw new ArgumentException("An agent name is required.", nameof(definition));
        }

        if (string.IsNullOrWhiteSpace(definition.Instructions))
        {
            throw new ArgumentException("Agent instructions are required.", nameof(definition));
        }

        return new ChatClientAgent(
            chatClient,
            instructions: definition.Instructions,
            name: definition.Name,
            description: definition.Description,
            tools: [.. definition.Tools],
            loggerFactory: services.GetService(typeof(ILoggerFactory)) as ILoggerFactory,
            services: services);
    }
}
