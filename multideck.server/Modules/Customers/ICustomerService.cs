using System.Security.Claims;

namespace Multideck.Server.Modules.Customers;

public interface ICustomerService
{
    Task<IReadOnlyList<CustomerDto>> ListAsync(ClaimsPrincipal user, string? search, CancellationToken cancellationToken);
    Task<CustomerDetailDto> GetAsync(ClaimsPrincipal user, Guid customerId, CancellationToken cancellationToken);
    Task<CustomerDto> CreateAsync(ClaimsPrincipal user, CreateCustomerRequest request, CancellationToken cancellationToken);
    Task<CustomerReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
}
