using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Facilities;

public interface IFacilityService
{
    Task<IReadOnlyList<FacilityDto>> ListAsync(ClaimsPrincipal user, string? search, bool includeInactive, CancellationToken cancellationToken);
    Task<FacilityDto> GetAsync(ClaimsPrincipal user, Guid facilityId, CancellationToken cancellationToken);
    Task<FacilityDto> CreateAsync(ClaimsPrincipal user, CreateFacilityRequest request, CancellationToken cancellationToken);
    Task<FacilityDto> UpdateAsync(ClaimsPrincipal user, Guid facilityId, UpdateFacilityRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(ClaimsPrincipal user, Guid facilityId, CancellationToken cancellationToken);
    Task<FacilityReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
}
