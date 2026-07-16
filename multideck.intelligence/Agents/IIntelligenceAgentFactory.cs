using Microsoft.Agents.AI;

namespace Multideck.Intelligence.Agents;

public interface IIntelligenceAgentFactory
{
    AIAgent CreateAgent(IntelligenceAgentDefinition definition);
}
