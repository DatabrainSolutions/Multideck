using Microsoft.Extensions.AI;

namespace Multideck.Intelligence.Agents;

public sealed record IntelligenceAgentDefinition
{
    public required string Name { get; init; }

    public required string Instructions { get; init; }

    public string? Description { get; init; }

    public IReadOnlyList<AITool> Tools { get; init; } = [];
}
