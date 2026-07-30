using System.Security.Claims;

namespace Multideck.Server.Modules.Deals;

public interface IDealService
{
    Task<IReadOnlyList<DealDto>> ListAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<DealConversionOptionsDto> GetConversionOptionsAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<DealDto> ConvertLeadAsync(ClaimsPrincipal user, Guid leadId, ConvertLeadToDealRequest request, CancellationToken cancellationToken);
    Task<DealDto> MoveStageAsync(ClaimsPrincipal user, Guid dealId, MoveDealStageRequest request, CancellationToken cancellationToken);
}
