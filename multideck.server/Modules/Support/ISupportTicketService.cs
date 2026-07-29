using Multideck.Server.Modules.Users;

namespace Multideck.Server.Modules.Support;

public interface ISupportTicketService
{
    Task<CreateSupportTicketResponse> CreateAsync(
        CreateSupportTicketRequest request,
        TeamUserDto requester,
        CancellationToken cancellationToken);
}
