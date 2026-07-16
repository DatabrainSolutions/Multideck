using System.Security.Claims;

namespace Multideck.Server.Modules.AgentDexter;

public interface IAgentDexterService
{
    Task<IReadOnlyList<DexterConversationSummaryDto>> ListConversationsAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken);

    Task<DexterConversationDto> GetConversationAsync(
        ClaimsPrincipal principal,
        Guid conversationId,
        CancellationToken cancellationToken);

    Task<DexterConversationDto> SendMessageAsync(
        ClaimsPrincipal principal,
        SendDexterMessageRequest request,
        CancellationToken cancellationToken);
}
