using System.Security.Claims;

namespace Multideck.Server.Modules.Inbox;

public interface IInboxService
{
    IReadOnlyList<InboxProviderAvailabilityDto> GetProviderAvailability();
    Task<IReadOnlyList<InboxConnectionDto>> ListConnectionsAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
    Task DisconnectAsync(ClaimsPrincipal principal, Guid connectionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<InboxMailboxDto>> ListMailboxesAsync(ClaimsPrincipal principal, CancellationToken cancellationToken);
    Task RequestSyncAsync(ClaimsPrincipal principal, Guid mailboxId, CancellationToken cancellationToken);
    Task<InboxMailboxDto> AddSharedMailboxAsync(ClaimsPrincipal principal, Guid connectionId, AddSharedMailboxRequest request, CancellationToken cancellationToken);
    Task<InboxThreadListResponse> ListThreadsAsync(ClaimsPrincipal principal, Guid? mailboxId, string? folder, string? query, string? cursor, int limit, CancellationToken cancellationToken);
    Task<InboxThreadDetailDto> GetThreadAsync(ClaimsPrincipal principal, Guid threadId, CancellationToken cancellationToken);
    Task<InboxThreadUserStateDto> UpdateThreadStateAsync(ClaimsPrincipal principal, Guid threadId, UpdateInboxThreadStateRequest request, CancellationToken cancellationToken);
    Task<InboxDraftDto> CreateDraftAsync(ClaimsPrincipal principal, InboxDraftRequest request, CancellationToken cancellationToken);
    Task<InboxDraftDto> UpdateDraftAsync(ClaimsPrincipal principal, Guid draftId, InboxDraftRequest request, CancellationToken cancellationToken);
    Task DeleteDraftAsync(ClaimsPrincipal principal, Guid draftId, CancellationToken cancellationToken);
    Task<InboxSendReceiptDto> SendAsync(ClaimsPrincipal principal, InboxDraftRequest request, string idempotencyKey, CancellationToken cancellationToken);
}
