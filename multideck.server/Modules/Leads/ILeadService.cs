using System.Security.Claims;

namespace Multideck.Server.Modules.Leads;

public interface ILeadService
{
    Task<IReadOnlyList<LeadDto>> ListAsync(ClaimsPrincipal user, string? search, CancellationToken cancellationToken);
    Task<LeadDetailDto> GetAsync(ClaimsPrincipal user, Guid leadId, CancellationToken cancellationToken);
}
