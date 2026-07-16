using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using Multideck.Server.Authorization;

namespace Multideck.Server.Modules.AgentDexter;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/agent-dexter")]
[Produces("application/json")]
public sealed class AgentDexterController(IAgentDexterService dexter) : ControllerBase
{
    [HttpGet("conversations")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<IReadOnlyList<DexterConversationSummaryDto>>> ListConversations(
        CancellationToken cancellationToken)
    {
        return Ok(await dexter.ListConversationsAsync(User, cancellationToken));
    }

    [HttpGet("conversations/{conversationId:guid}")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<DexterConversationDto>> GetConversation(
        Guid conversationId,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await dexter.GetConversationAsync(User, conversationId, cancellationToken));
        }
        catch (AgentDexterException exception)
        {
            return Problem(exception.Message, statusCode: exception.StatusCode, title: exception.Title);
        }
    }

    [HttpPost("messages")]
    [RequirePermission(AppPermissions.Warehouse.ReadValue)]
    public async Task<ActionResult<DexterConversationDto>> SendMessage(
        SendDexterMessageRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await dexter.SendMessageAsync(User, request, cancellationToken));
        }
        catch (AgentDexterException exception)
        {
            return Problem(exception.Message, statusCode: exception.StatusCode, title: exception.Title);
        }
    }
}
