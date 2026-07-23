# Multideck Intelligence

`multideck.intelligence` is Multideck's provider-neutral AI boundary. It uses
Microsoft Agent Framework for agents and `Microsoft.Extensions.AI.IChatClient`
for model access.

## DeepSeek configuration

The server is configured for DeepSeek's OpenAI-compatible API by default:

```json
{
  "Intelligence": {
    "Endpoint": "https://api.deepseek.com",
    "Model": "deepseek-v4-flash",
    "ApiKey": ""
  }
}
```

Keep the key outside source control:

```powershell
dotnet user-secrets set "Intelligence:ApiKey" "your-key" --project multideck.server
```

Alternatively, set the `Intelligence__ApiKey` environment variable. The server
can start without a key; a clear configuration error is raised only when an AI
client is first used.

## Create an agent

Inject `IIntelligenceAgentFactory` into an application service:

```csharp
var agent = agentFactory.CreateAgent(new IntelligenceAgentDefinition
{
    Name = "shipment-assistant",
    Description = "Helps operators understand a shipment.",
    Instructions = "Be concise, factual, and never invent shipment data."
});

var response = await agent.RunAsync("Summarise the shipment exceptions.");
```

Tools can be supplied through `IntelligenceAgentDefinition.Tools`. Agent
Framework sessions, streaming, structured output, middleware, memory, and
workflows remain available on the returned `AIAgent`.

## Change model provider

For another OpenAI-compatible service, only change `Endpoint`, `Model`, and
`ApiKey`.

For a provider with a native .NET `IChatClient` adapter, replace the default
registration at the application boundary:

```csharp
services.AddMultideckIntelligence(serviceProvider =>
{
    return CreateProviderSpecificChatClient(serviceProvider);
});
```

The rest of Multideck continues to depend on `IIntelligenceAgentFactory`,
`AIAgent`, or `IChatClient`, so product code does not change with the provider.

## Reference documentation

- [Microsoft Agent Framework: get started](https://learn.microsoft.com/en-us/agent-framework/get-started/)
- [Microsoft Agent Framework: providers](https://learn.microsoft.com/en-us/agent-framework/agents/providers/)
- [DeepSeek API: first API call](https://api-docs.deepseek.com/)
