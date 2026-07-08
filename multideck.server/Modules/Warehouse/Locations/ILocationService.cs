using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Locations;

public interface ILocationService
{
    Task<IReadOnlyList<LocationDto>> ListAsync(ClaimsPrincipal user, Guid facilityId, string? search, bool includeInactive, CancellationToken cancellationToken);
    Task<LocationDto> GetAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, CancellationToken cancellationToken);
    Task<LocationDto> CreateAsync(ClaimsPrincipal user, Guid facilityId, CreateLocationRequest request, CancellationToken cancellationToken);
    Task<LocationDto> UpdateAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, UpdateLocationRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(ClaimsPrincipal user, Guid facilityId, Guid locationId, CancellationToken cancellationToken);
    Task<LocationReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
}
